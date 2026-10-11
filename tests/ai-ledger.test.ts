import { describe, expect, it } from 'vitest';
import {
  AI_BUDGET_LIMITS,
  AiBudgetLedger,
  type LedgerStorage,
  type LedgerTransaction,
  type ReserveRequest,
} from '../cloudflare/ledger.ts';

class MemoryStorage implements LedgerStorage {
  readonly records = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  transaction<T>(callback: (transaction: LedgerTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const staged = structuredClone(this.records);
      const result = await callback({
        get: async <V>(key: string) => structuredClone(staged.get(key)) as V | undefined,
        put: async <V>(key: string, value: V) => {
          staged.set(key, structuredClone(value));
        },
      });
      this.records.clear();
      for (const [key, value] of staged) this.records.set(key, value);
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

const now = 1_700_000_000_000;
const reserveInput = (overrides: Partial<ReserveRequest> = {}): ReserveRequest => ({
  requestId: 'request-1',
  turnId: 'turn-1',
  visitorId: 'visitor-1',
  ipHash: 'ip-hash-1',
  pool: 'public',
  provider: 'jev',
  funding: 'sponsored',
  maxCostMicros: 50_000,
  now,
  ...overrides,
});

function fixture() {
  const storage = new MemoryStorage();
  const ledger = new AiBudgetLedger({ storage });
  const send = (path: string, body?: unknown, method?: string) =>
    ledger.fetch(
      new Request(`https://ledger${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      })
    );
  const status = (at = now) =>
    ledger.status({
      visitorId: 'visitor-1',
      ipHash: 'ip-hash-1',
      pool: 'public',
      now: at,
    });
  return { storage, ledger, send, status };
}

describe('persistent AI budget ledger', () => {
  it('retains earlier provider reservations when Mistral uses the same persistent allowance', async () => {
    const { storage, ledger } = fixture();
    const previous = await ledger.reserve(
      reserveInput({ provider: 'gemini', pool: 'implementation' })
    );
    await ledger.settle({
      reservationId: previous.reservationId!,
      uncertain: true,
      turnComplete: true,
      now: now + 1,
    });
    const restarted = new AiBudgetLedger({ storage });
    const current = await restarted.reserve(
      reserveInput({
        requestId: 'mistral-request',
        turnId: 'mistral-turn',
        provider: 'mistral',
        pool: 'implementation',
        maxCostMicros: 2458,
        now: now + 20_001,
      })
    );
    expect(current.allowed).toBe(true);
    await restarted.settle({
      reservationId: current.reservationId!,
      actualCostMicros: 210,
      turnComplete: true,
      now: now + 20_002,
    });
    const status = await restarted.status({
      visitorId: 'visitor-1',
      ipHash: 'ip-hash-1',
      pool: 'implementation',
      now: now + 20_002,
    });
    expect(status.poolChargedMicros).toBe(50_000 + 210);
    expect(status.totalChargedMicros).toBe(50_000 + 210);
  });

  it('keeps both allowance pools separate within the total approved budget', async () => {
    const { ledger, status } = fixture();
    expect(
      await ledger.reserve(
        reserveInput({
          pool: 'implementation',
          maxCostMicros: 2_000_000,
        })
      )
    ).toMatchObject({ allowed: true });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'implementation-2',
          visitorId: 'visitor-2',
          pool: 'implementation',
        })
      )
    ).toEqual({ allowed: false, reason: 'budget_exhausted' });
    expect(await status()).toMatchObject({
      poolRemainingMicros: 8_000_000,
      totalRemainingMicros: 8_000_000,
    });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'public-2',
          visitorId: 'visitor-3',
          maxCostMicros: 8_000_000,
        })
      )
    ).toMatchObject({ allowed: true });
    expect(await status()).toMatchObject({
      poolRemainingMicros: 0,
      totalRemainingMicros: 0,
      available: false,
    });
  });

  it('atomically reserves money when independent visitors contend for the final allowance', async () => {
    const { ledger, status } = fixture();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        ledger.reserve(
          reserveInput({
            requestId: `request-${index}`,
            visitorId: `visitor-${index}`,
            ipHash: `ip-${index}`,
            maxCostMicros: 3_000_000,
          })
        )
      )
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(results.filter((result) => result.reason === 'budget_exhausted')).toHaveLength(6);
    expect(await status()).toMatchObject({ poolChargedMicros: 6_000_000 });
  });

  it('retains budget and active reservations after object eviction or a new deployment', async () => {
    const { storage, ledger } = fixture();
    await ledger.reserve(reserveInput({ maxCostMicros: 1_000_000 }));
    const restarted = new AiBudgetLedger({ storage });
    expect(await restarted.status({ visitorId: 'visitor-1', pool: 'public', now })).toMatchObject({
      poolRemainingMicros: 7_000_000,
      visitorTurnsRemaining: 4,
      busy: true,
    });
    expect(await restarted.reserve(reserveInput())).toEqual({
      allowed: false,
      reason: 'duplicate_request',
    });
  });

  it('settles verified usage once without refunding or duplicating a repeated settlement', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput({ maxCostMicros: 100_000 }));
    expect(
      await ledger.settle({ reservationId: 'request-1', actualCostMicros: 12_345, now })
    ).toMatchObject({
      settled: true,
      alreadySettled: false,
      chargedMicros: 12_345,
    });
    expect(
      await ledger.settle({ reservationId: 'request-1', actualCostMicros: 0, now })
    ).toMatchObject({
      settled: true,
      alreadySettled: true,
      chargedMicros: 12_345,
    });
    expect(await status()).toMatchObject({ poolRemainingMicros: 7_987_655, busy: false });
  });

  it.each([{ uncertain: true, actualCostMicros: 0 }, {}])(
    'retains the full reservation when provider usage is uncertain: %j',
    async (settlement) => {
      const { ledger, status } = fixture();
      await ledger.reserve(reserveInput({ maxCostMicros: 100_000 }));
      await ledger.settle({ reservationId: 'request-1', now, ...settlement });
      await ledger.settle({ reservationId: 'request-1', actualCostMicros: 0, now });
      expect(await status()).toMatchObject({ poolChargedMicros: 100_000, busy: false });
    }
  );

  it('counts Jev and Gemini together as one public turn and keeps the pipeline busy', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput());
    await ledger.settle({
      reservationId: 'request-1',
      actualCostMicros: 5000,
      turnComplete: false,
      now,
    });
    expect(await status(now + 30_000)).toMatchObject({ busy: true, visitorTurnsRemaining: 4 });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'new-turn',
          turnId: 'new-turn',
          now: now + 30_000,
        })
      )
    ).toMatchObject({ allowed: false, reason: 'visitor_busy' });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'gemini-request',
          provider: 'gemini',
          now: now + 30_000,
        })
      )
    ).toMatchObject({ allowed: true });
    await ledger.settle({
      reservationId: 'gemini-request',
      actualCostMicros: 2000,
      turnComplete: true,
      now: now + 40_000,
    });
    expect(await status(now + 40_000)).toMatchObject({
      busy: false,
      visitorTurnsRemaining: 4,
      ipTurnsRemaining: 9,
      poolChargedMicros: 7000,
    });
  });

  it('lets pipeline cleanup finish an already settled Jev reservation without changing its bill', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput());
    await ledger.settle({
      reservationId: 'request-1',
      actualCostMicros: 5000,
      turnComplete: false,
      now,
    });
    expect(await status()).toHaveProperty('busy', true);
    await ledger.settle({
      reservationId: 'request-1',
      actualCostMicros: 0,
      turnComplete: true,
      now,
    });
    expect(await status()).toMatchObject({ busy: false, poolChargedMicros: 5000 });
  });

  it('does not release concurrent provider reservations until both have settled', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput());
    await ledger.reserve(reserveInput({ requestId: 'gemini-request', provider: 'gemini' }));
    await ledger.settle({
      reservationId: 'request-1',
      actualCostMicros: 0,
      turnComplete: true,
      now,
    });
    expect(await status()).toHaveProperty('busy', true);
    await ledger.settle({
      reservationId: 'gemini-request',
      actualCostMicros: 0,
      turnComplete: true,
      now,
    });
    expect(await status()).toHaveProperty('busy', false);
  });

  it('denies duplicate provider calls and closed turn reuse without charging again', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput());
    expect(await ledger.reserve(reserveInput({ requestId: 'same-provider' }))).toEqual({
      allowed: false,
      reason: 'provider_already_reserved',
    });
    await ledger.settle({ reservationId: 'request-1', actualCostMicros: 1000, now });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'late-gemini',
          provider: 'gemini',
          now: now + 40_000,
        })
      )
    ).toEqual({ allowed: false, reason: 'turn_closed' });
    expect(await status()).toMatchObject({ visitorTurnsRemaining: 4, poolChargedMicros: 1000 });
  });

  it('releases an abandoned concurrency lease without refunding its unknown provider cost', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput({ maxCostMicros: 100_000 }));
    const later = now + AI_BUDGET_LIMITS.turnLifetimeMs;
    expect(await status(later)).toMatchObject({ busy: false, poolChargedMicros: 100_000 });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'later-request',
          turnId: 'later-turn',
          now: later,
        })
      )
    ).toMatchObject({ allowed: true });
    await ledger.settle({ reservationId: 'request-1', uncertain: true, now: later });
    expect(await status(later)).toHaveProperty('busy', true);
  });

  it('enforces visitor daily quota, resets at UTC midnight and applies the cooldown', async () => {
    const { ledger, status } = fixture();
    for (let index = 0; index < 5; index += 1) {
      const requestId = `daily-${index}`;
      const at = now + index * AI_BUDGET_LIMITS.cooldownMs;
      expect(
        await ledger.reserve(reserveInput({ requestId, turnId: requestId, now: at }))
      ).toMatchObject({ allowed: true });
      await ledger.settle({ reservationId: requestId, actualCostMicros: 0, now: at });
      if (index === 0)
        expect(
          await ledger.reserve(
            reserveInput({ requestId: 'too-soon', turnId: 'too-soon', now: at + 1 })
          )
        ).toMatchObject({
          allowed: false,
          reason: 'cooldown',
          retryAfterMs: AI_BUDGET_LIMITS.cooldownMs - 1,
        });
    }
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'daily-six',
          turnId: 'daily-six',
          now: now + 100_000,
        })
      )
    ).toMatchObject({ allowed: false, reason: 'visitor_daily_limit' });
    expect(await status(now + 100_000)).toHaveProperty('visitorTurnsRemaining', 0);
    const midnight = (Math.floor(now / 86_400_000) + 1) * 86_400_000;
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'next-day',
          turnId: 'next-day',
          now: midnight,
        })
      )
    ).toMatchObject({ allowed: true });
  });

  it('enforces an IP allowance shared across visitor sessions', async () => {
    const { ledger } = fixture();
    for (let index = 0; index < 10; index += 1) {
      const requestId = `ip-${index}`;
      expect(
        await ledger.reserve(
          reserveInput({
            requestId,
            turnId: requestId,
            visitorId: `ip-visitor-${index}`,
          })
        )
      ).toMatchObject({ allowed: true });
      await ledger.settle({ reservationId: requestId, actualCostMicros: 0, now });
    }
    expect(
      await ledger.reserve(reserveInput({ requestId: 'eleventh', visitorId: 'new-visitor' }))
    ).toMatchObject({
      allowed: false,
      reason: 'ip_daily_limit',
    });
  });

  it('permits user-funded calls when sponsorship is exhausted without charging the project', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(
      reserveInput({
        requestId: 'funded-request',
        visitorId: 'funded-visitor',
        maxCostMicros: 8_000_000,
      })
    );
    expect(await ledger.reserve(reserveInput({ funding: 'byok' }))).toMatchObject({
      allowed: true,
    });
    await ledger.settle({ reservationId: 'request-1', actualCostMicros: 100_000, now });
    expect(await status()).toMatchObject({
      poolChargedMicros: 8_000_000,
      visitorTurnsRemaining: 5,
    });
  });

  it('counts a mixed user-funded and sponsored turn only when project funding is used', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput({ funding: 'byok' }));
    await ledger.settle({ reservationId: 'request-1', turnComplete: false, now });
    expect(await status()).toHaveProperty('visitorTurnsRemaining', 5);
    await ledger.reserve(reserveInput({ requestId: 'funded-gemini', provider: 'gemini' }));
    expect(await status()).toHaveProperty('visitorTurnsRemaining', 4);
  });

  it('records an unexpectedly higher verified bill and fails closed for future calls', async () => {
    const { ledger, status } = fixture();
    await ledger.reserve(reserveInput());
    await ledger.settle({ reservationId: 'request-1', actualCostMicros: 8_000_001, now });
    expect(await status()).toMatchObject({ poolChargedMicros: 8_000_001, poolRemainingMicros: 0 });
    expect(
      await ledger.reserve(
        reserveInput({
          requestId: 'after-overrun',
          visitorId: 'visitor-2',
        })
      )
    ).toMatchObject({ allowed: false, reason: 'budget_exhausted' });
  });

  it('never persists extra keys, prompts, news or wallet context from an internal payload', async () => {
    const { send, storage } = fixture();
    const response = await send('/reserve', {
      ...reserveInput(),
      apiKey: 'private-provider-key',
      prompt: 'private-conversation',
      wallet: 'private-wallet',
      news: 'untrusted-news',
    });
    expect(response.status).toBe(200);
    const stored = JSON.stringify([...storage.records]);
    for (const secret of [
      'private-provider-key',
      'private-conversation',
      'private-wallet',
      'untrusted-news',
    ])
      expect(stored).not.toContain(secret);
  });
});

describe('single-use agent approval ledger', () => {
  it('atomically consumes an intent once across simultaneous confirmations and restarts', async () => {
    const { ledger, storage } = fixture();
    const input = { intentId: 'intent-1', visitorId: 'visitor-1', expiresAt: now + 60_000, now };
    const decisions = await Promise.all(Array.from({ length: 10 }, () => ledger.approve(input)));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(1);
    expect(await new AiBudgetLedger({ storage }).approve(input)).toEqual({
      allowed: false,
      reason: 'intent_already_consumed',
    });
    expect(await ledger.approve({ ...input, visitorId: 'visitor-2' })).toMatchObject({
      allowed: false,
    });
  });

  it('rejects expired intents and excessively distant expiry without consuming them', async () => {
    const { ledger, storage } = fixture();
    expect(
      await ledger.approve({ intentId: 'expired', visitorId: 'visitor-1', expiresAt: now, now })
    ).toEqual({
      allowed: false,
      reason: 'intent_expired',
    });
    expect(
      await ledger.approve({
        intentId: 'long-lived',
        visitorId: 'visitor-1',
        expiresAt: now + 300_001,
        now,
      })
    ).toEqual({
      allowed: false,
      reason: 'invalid_intent_expiry',
    });
    expect(storage.records.size).toBe(0);
  });
});

describe('multi-vendor key checks and funding', () => {
  it.each(['openai', 'anthropic', 'google'] as const)(
    'records %s BYOK without owner spend or a daily sponsored turn',
    async (provider) => {
      const { ledger, status, storage } = fixture();
      const decision = await ledger.reserve(
        reserveInput({ provider, funding: 'byok', maxCostMicros: 0 })
      );
      expect(decision.allowed).toBe(true);
      await ledger.settle({ reservationId: decision.reservationId!, actualCostMicros: 0, now });
      expect(await status()).toMatchObject({ poolChargedMicros: 0, visitorTurnsRemaining: 5 });
      expect(storage.records.get('reservation:request-1')).toMatchObject({
        provider,
        funding: 'byok',
      });
    }
  );

  it.each(['openai', 'anthropic'] as const)(
    'rejects %s project funding at the ledger boundary',
    async (provider) => {
      const { ledger, status } = fixture();
      expect(await ledger.reserve(reserveInput({ provider }))).toMatchObject({
        allowed: false,
        reason: 'invalid_reservation',
      });
      expect(await status()).toHaveProperty('poolChargedMicros', 0);
    }
  );

  it('persists an atomic readonly-check cooldown across simultaneous requests and object restart without AI spending', async () => {
    const { ledger, storage, status } = fixture();
    const checks = await Promise.all(
      Array.from({ length: 8 }, () => ledger.keyCheck({ ipHash: 'ip-1', now }))
    );
    expect(checks.filter((check) => check.allowed)).toHaveLength(1);
    expect(checks.filter((check) => !check.allowed)).toHaveLength(7);
    expect(
      await new AiBudgetLedger({ storage }).keyCheck({ ipHash: 'ip-1', now: now + 2999 })
    ).toMatchObject({ allowed: false, reason: 'cooldown' });
    expect(await status()).toMatchObject({
      poolChargedMicros: 0,
      visitorTurnsRemaining: 5,
      busy: false,
    });
  });

  it('allows five checks per IP per minute and keeps independent IPs separate', async () => {
    const { ledger } = fixture();
    for (let index = 0; index < 5; index += 1)
      expect(await ledger.keyCheck({ ipHash: 'ip-1', now: now + index * 3000 })).toMatchObject({
        allowed: true,
      });
    expect(await ledger.keyCheck({ ipHash: 'ip-1', now: now + 15000 })).toMatchObject({
      allowed: false,
      reason: 'key_check_limit',
      retryAfterMs: 45000,
    });
    expect(await ledger.keyCheck({ ipHash: 'ip-2', now: now + 15000 })).toMatchObject({
      allowed: true,
    });
    expect(await ledger.keyCheck({ ipHash: 'ip-1', now: now + 60000 })).toMatchObject({
      allowed: true,
    });
  });

  it('rejects malformed readonly check requests before allocating counters', async () => {
    const { send, storage } = fixture();
    expect((await send('/key-check', { ipHash: 'bad:path', now })).status).toBe(422);
    expect((await send('/key-check', { ipHash: 'ip-1', now: -1 })).status).toBe(422);
    expect(storage.records.size).toBe(0);
  });
});

describe('internal ledger request validation', () => {
  it.each([
    { maxCostMicros: -1 },
    { maxCostMicros: 0 },
    { maxCostMicros: 0.5 },
    { maxCostMicros: 10_000_001 },
    { funding: 'disabled' },
    { provider: 'other' },
    { pool: 'other' },
    { visitorId: '' },
    { requestId: 'unsafe:path' },
    { now: -1 },
  ])('rejects malformed reservation %j before allocating money', async (change) => {
    const { send, status } = fixture();
    expect((await send('/reserve', { ...reserveInput(), ...change })).status).toBe(422);
    expect(await status()).toHaveProperty('poolChargedMicros', 0);
  });

  it('rejects oversized bodies, wrong methods and unknown paths', async () => {
    const { send } = fixture();
    expect((await send('/reserve', { padding: 'x'.repeat(5000) })).status).toBe(422);
    expect((await send('/reserve')).status).toBe(405);
    expect((await send('/missing', {})).status).toBe(404);
    expect((await send('/status?pool=other')).status).toBe(422);
    const status = await send(`/status?visitorId=visitor-1&pool=public&now=${now}`);
    expect(status.status).toBe(200);
    expect(status.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects negative cost settlement and reports missing reservation IDs', async () => {
    const { send, ledger } = fixture();
    expect(
      (await send('/settle', { reservationId: 'request-1', actualCostMicros: -1, now })).status
    ).toBe(422);
    expect(await ledger.settle({ reservationId: 'missing', actualCostMicros: 0, now })).toEqual({
      settled: false,
      reason: 'unknown_reservation',
    });
  });
});
