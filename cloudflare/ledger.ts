export type AiBudgetPool = 'implementation' | 'public';
// Older reservations keep their original provider across upgrades and rollbacks.
export type AiProvider = 'jev' | 'gemini' | 'mistral' | 'google' | 'openai' | 'anthropic';
export type AiFunding = 'sponsored' | 'byok';

export const AI_BUDGET_LIMITS = {
  totalMicros: 10_000_000,
  implementationMicros: 2_000_000,
  publicMicros: 8_000_000,
  visitorTurnsPerDay: 5,
  ipTurnsPerDay: 10,
  cooldownMs: 20_000,
  turnLifetimeMs: 180_000,
} as const;

export interface LedgerTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface LedgerStorage extends LedgerTransaction {
  transaction<T>(callback: (transaction: LedgerTransaction) => Promise<T>): Promise<T>;
}

export interface LedgerContext {
  storage: LedgerStorage;
}

export interface ReserveRequest {
  requestId: string;
  turnId?: string;
  visitorId: string;
  ipHash: string;
  pool: AiBudgetPool;
  provider: AiProvider;
  funding: AiFunding;
  maxCostMicros: number;
  now: number;
}

export interface SettleRequest {
  reservationId: string;
  actualCostMicros?: number;
  uncertain?: boolean;
  turnComplete?: boolean;
  now: number;
}

export interface ApproveRequest {
  intentId: string;
  visitorId: string;
  expiresAt: number;
  now: number;
}

export interface LedgerDecision {
  allowed: boolean;
  reservationId?: string;
  reason?: string;
  retryAfterMs?: number;
}

interface BudgetTotals {
  implementation: number;
  public: number;
}

interface VisitorState {
  activeTurnId: string;
  activeUntil: number;
  lastStartedAt: number;
}

interface TurnRecord {
  id: string;
  visitorId: string;
  ipHash: string;
  pool: AiBudgetPool;
  createdAt: number;
  expiresAt: number;
  completed: boolean;
  quotaCounted: boolean;
  pending: number;
  providers: Partial<Record<AiProvider, string>>;
}

interface ReservationRecord {
  id: string;
  turnId: string;
  visitorId: string;
  provider: AiProvider;
  pool: AiBudgetPool;
  funding: AiFunding;
  maxCostMicros: number;
  chargedMicros: number;
  createdAt: number;
  settledAt?: number;
  uncertain?: boolean;
}

const identifierPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const dayMs = 86_400_000;
const totalsKey = 'budget:v1';
const emptyTotals = (): BudgetTotals => ({ implementation: 0, public: 0 });
const reservationKey = (id: string) => `reservation:${id}`;
const visitorKey = (id: string) => `visitor:${id}`;
const turnKey = (visitorId: string, id: string) => `turn:${visitorId}:${id}`;
const dayKey = (now: number) => Math.floor(now / dayMs);
const visitorQuotaKey = (id: string, now: number) => `quota:visitor:${dayKey(now)}:${id}`;
const ipQuotaKey = (id: string, now: number) => `quota:ip:${dayKey(now)}:${id}`;
const poolLimit = (pool: AiBudgetPool) =>
  pool === 'implementation' ? AI_BUDGET_LIMITS.implementationMicros : AI_BUDGET_LIMITS.publicMicros;

function identifier(value: unknown): value is string {
  return typeof value === 'string' && identifierPattern.test(value);
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: unknown): value is number {
  return integer(value) && value <= 8_640_000_000_000_000;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validReserve(value: unknown): value is ReserveRequest {
  return (
    object(value) &&
    identifier(value.requestId) &&
    (value.turnId === undefined || identifier(value.turnId)) &&
    identifier(value.visitorId) &&
    identifier(value.ipHash) &&
    (value.pool === 'implementation' || value.pool === 'public') &&
    ['jev', 'gemini', 'mistral', 'google', 'openai', 'anthropic'].includes(
      String(value.provider)
    ) &&
    (value.funding === 'sponsored' || value.funding === 'byok') &&
    (!(value.provider === 'openai' || value.provider === 'anthropic') ||
      value.funding === 'byok') &&
    integer(value.maxCostMicros) &&
    (value.funding === 'byok' || value.maxCostMicros > 0) &&
    value.maxCostMicros <= AI_BUDGET_LIMITS.totalMicros &&
    timestamp(value.now)
  );
}

function validSettle(value: unknown): value is SettleRequest {
  return (
    object(value) &&
    identifier(value.reservationId) &&
    (value.actualCostMicros === undefined || integer(value.actualCostMicros)) &&
    (value.uncertain === undefined || typeof value.uncertain === 'boolean') &&
    (value.turnComplete === undefined || typeof value.turnComplete === 'boolean') &&
    timestamp(value.now)
  );
}

function validApproval(value: unknown): value is ApproveRequest {
  return (
    object(value) &&
    identifier(value.intentId) &&
    identifier(value.visitorId) &&
    timestamp(value.expiresAt) &&
    timestamp(value.now)
  );
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Missing request body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error('Ledger request exceeds 4 KB');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

// One object coordinates the single approved allowance. Configure this class with
// new_sqlite_classes; its KV records are persisted in the object's SQLite store.
export class AiBudgetLedger {
  private readonly storage: LedgerStorage;

  constructor(context: LedgerContext, _env?: unknown) {
    this.storage = context.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/status') {
      const visitorId = url.searchParams.get('visitorId') ?? undefined;
      const ipHash = url.searchParams.get('ipHash') ?? undefined;
      const pool = url.searchParams.get('pool') ?? 'public';
      const now = Number(url.searchParams.get('now') ?? Date.now());
      if (
        (visitorId !== undefined && !identifier(visitorId)) ||
        (ipHash !== undefined && !identifier(ipHash)) ||
        (pool !== 'public' && pool !== 'implementation') ||
        !timestamp(now)
      )
        return json({ error: 'Invalid ledger status request' }, 422);
      return json(await this.status({ visitorId, ipHash, pool, now }));
    }
    if (!['/reserve', '/settle', '/approve', '/key-check'].includes(url.pathname))
      return json({ error: 'Unknown ledger endpoint' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: unknown;
    try {
      body = await readBody(request);
    } catch {
      return json({ error: 'Invalid ledger request body' }, 422);
    }
    if (url.pathname === '/key-check') {
      if (!object(body) || !identifier(body.ipHash) || !timestamp(body.now))
        return json({ error: 'Invalid key check' }, 422);
      return json(await this.keyCheck({ ipHash: body.ipHash, now: body.now }));
    }
    if (url.pathname === '/reserve')
      return validReserve(body)
        ? json(await this.reserve(body))
        : json({ error: 'Invalid reservation' }, 422);
    if (url.pathname === '/settle')
      return validSettle(body)
        ? json(await this.settle(body))
        : json({ error: 'Invalid settlement' }, 422);
    return validApproval(body)
      ? json(await this.approve(body))
      : json({ error: 'Invalid approval' }, 422);
  }

  async reserve(input: ReserveRequest): Promise<LedgerDecision> {
    if (!validReserve(input)) return { allowed: false, reason: 'invalid_reservation' };
    return this.storage.transaction(async (storage) => {
      if (await storage.get(reservationKey(input.requestId)))
        return { allowed: false, reason: 'duplicate_request' };

      const id = input.turnId ?? input.requestId;
      let turn = await storage.get<TurnRecord>(turnKey(input.visitorId, id));
      const visitor = await storage.get<VisitorState>(visitorKey(input.visitorId));
      if (visitor && visitor.activeUntil > input.now && visitor.activeTurnId !== id)
        return {
          allowed: false,
          reason: 'visitor_busy',
          retryAfterMs: visitor.activeUntil - input.now,
        };
      if (turn) {
        if (turn.completed || turn.expiresAt <= input.now)
          return { allowed: false, reason: 'turn_closed' };
        if (turn.pool !== input.pool || turn.ipHash !== input.ipHash)
          return { allowed: false, reason: 'turn_context_changed' };
        if (turn.providers[input.provider])
          return { allowed: false, reason: 'provider_already_reserved' };
      } else {
        if (visitor && visitor.lastStartedAt + AI_BUDGET_LIMITS.cooldownMs > input.now)
          return {
            allowed: false,
            reason: 'cooldown',
            retryAfterMs: visitor.lastStartedAt + AI_BUDGET_LIMITS.cooldownMs - input.now,
          };
        turn = {
          id,
          visitorId: input.visitorId,
          ipHash: input.ipHash,
          pool: input.pool,
          createdAt: input.now,
          expiresAt: input.now + AI_BUDGET_LIMITS.turnLifetimeMs,
          completed: false,
          quotaCounted: false,
          pending: 0,
          providers: {},
        };
      }

      const totals = (await storage.get<BudgetTotals>(totalsKey)) ?? emptyTotals();
      const chargedMicros = input.funding === 'sponsored' ? input.maxCostMicros : 0;
      if (
        chargedMicros > 0 &&
        (totals[input.pool] + chargedMicros > poolLimit(input.pool) ||
          totals.public + totals.implementation + chargedMicros > AI_BUDGET_LIMITS.totalMicros)
      )
        return { allowed: false, reason: 'budget_exhausted' };

      if (input.pool === 'public' && input.funding === 'sponsored' && !turn.quotaCounted) {
        const visitorCount =
          (await storage.get<number>(visitorQuotaKey(input.visitorId, input.now))) ?? 0;
        const ipCount = (await storage.get<number>(ipQuotaKey(input.ipHash, input.now))) ?? 0;
        const retryAfterMs = (dayKey(input.now) + 1) * dayMs - input.now;
        if (visitorCount >= AI_BUDGET_LIMITS.visitorTurnsPerDay)
          return { allowed: false, reason: 'visitor_daily_limit', retryAfterMs };
        if (ipCount >= AI_BUDGET_LIMITS.ipTurnsPerDay)
          return { allowed: false, reason: 'ip_daily_limit', retryAfterMs };
        await storage.put(visitorQuotaKey(input.visitorId, input.now), visitorCount + 1);
        await storage.put(ipQuotaKey(input.ipHash, input.now), ipCount + 1);
        turn.quotaCounted = true;
      }

      const reservation: ReservationRecord = {
        id: input.requestId,
        turnId: id,
        visitorId: input.visitorId,
        provider: input.provider,
        pool: input.pool,
        funding: input.funding,
        maxCostMicros: chargedMicros,
        chargedMicros,
        createdAt: input.now,
      };
      totals[input.pool] += chargedMicros;
      turn.providers[input.provider] = reservation.id;
      turn.pending += 1;
      await storage.put(totalsKey, totals);
      await storage.put(turnKey(input.visitorId, id), turn);
      await storage.put(visitorKey(input.visitorId), {
        activeTurnId: id,
        activeUntil: turn.expiresAt,
        lastStartedAt: turn.createdAt,
      } satisfies VisitorState);
      await storage.put(reservationKey(reservation.id), reservation);
      return { allowed: true, reservationId: reservation.id };
    });
  }

  async keyCheck(input: { ipHash: string; now: number }): Promise<LedgerDecision> {
    if (!identifier(input.ipHash) || !timestamp(input.now))
      return { allowed: false, reason: 'invalid_key_check' };
    return this.storage.transaction(async (storage) => {
      const key = `key-check:${input.ipHash}`;
      const previous = await storage.get<{ startedAt: number; lastAt: number; count: number }>(key);
      if (previous && previous.lastAt + 3000 > input.now)
        return {
          allowed: false,
          reason: 'cooldown',
          retryAfterMs: previous.lastAt + 3000 - input.now,
        };
      const current =
        previous && previous.startedAt + 60_000 > input.now
          ? previous
          : { startedAt: input.now, lastAt: input.now, count: 0 };
      if (current.count >= 5)
        return {
          allowed: false,
          reason: 'key_check_limit',
          retryAfterMs: current.startedAt + 60_000 - input.now,
        };
      current.lastAt = input.now;
      current.count += 1;
      await storage.put(key, current);
      return { allowed: true };
    });
  }

  async settle(input: SettleRequest) {
    if (!validSettle(input)) return { settled: false, reason: 'invalid_settlement' };
    return this.storage.transaction(async (storage) => {
      const reservation = await storage.get<ReservationRecord>(reservationKey(input.reservationId));
      if (!reservation) return { settled: false, reason: 'unknown_reservation' };
      const alreadySettled = reservation.settledAt !== undefined;

      // A missing usage record is not proof of a free call, including an upstream timeout.
      if (!alreadySettled) {
        const uncertain = input.uncertain === true || input.actualCostMicros === undefined;
        const actual =
          reservation.funding === 'byok'
            ? 0
            : uncertain
              ? reservation.maxCostMicros
              : input.actualCostMicros!;
        const totals = (await storage.get<BudgetTotals>(totalsKey)) ?? emptyTotals();
        totals[reservation.pool] += actual - reservation.chargedMicros;
        reservation.chargedMicros = actual;
        reservation.settledAt = input.now;
        reservation.uncertain = uncertain;
        await storage.put(totalsKey, totals);
        await storage.put(reservationKey(reservation.id), reservation);
      }

      const key = turnKey(reservation.visitorId, reservation.turnId);
      const turn = await storage.get<TurnRecord>(key);
      if (turn) {
        if (!alreadySettled) turn.pending = Math.max(0, turn.pending - 1);
        turn.completed ||= input.turnComplete !== false;
        await storage.put(key, turn);
        const visitor = await storage.get<VisitorState>(visitorKey(reservation.visitorId));
        if (turn.completed && turn.pending === 0 && visitor?.activeTurnId === turn.id) {
          visitor.activeUntil = 0;
          await storage.put(visitorKey(reservation.visitorId), visitor);
        }
      }
      return {
        settled: true,
        alreadySettled,
        chargedMicros: reservation.chargedMicros,
        uncertain: reservation.uncertain,
      };
    });
  }

  async status(input: { visitorId?: string; ipHash?: string; pool: AiBudgetPool; now: number }) {
    return this.storage.transaction(async (storage) => {
      const totals = (await storage.get<BudgetTotals>(totalsKey)) ?? emptyTotals();
      const visitor = input.visitorId
        ? await storage.get<VisitorState>(visitorKey(input.visitorId))
        : undefined;
      const visitorCount = input.visitorId
        ? ((await storage.get<number>(visitorQuotaKey(input.visitorId, input.now))) ?? 0)
        : 0;
      const ipCount = input.ipHash
        ? ((await storage.get<number>(ipQuotaKey(input.ipHash, input.now))) ?? 0)
        : 0;
      const poolRemainingMicros = Math.max(0, poolLimit(input.pool) - totals[input.pool]);
      const totalRemainingMicros = Math.max(
        0,
        AI_BUDGET_LIMITS.totalMicros - totals.public - totals.implementation
      );
      const visitorTurnsRemaining = Math.max(0, AI_BUDGET_LIMITS.visitorTurnsPerDay - visitorCount);
      const ipTurnsRemaining = Math.max(0, AI_BUDGET_LIMITS.ipTurnsPerDay - ipCount);
      const busy = !!visitor && visitor.activeUntil > input.now;
      const retryAfterMs = visitor
        ? Math.max(
            0,
            (busy ? visitor.activeUntil : visitor.lastStartedAt + AI_BUDGET_LIMITS.cooldownMs) -
              input.now
          )
        : 0;
      return {
        available:
          poolRemainingMicros > 0 &&
          totalRemainingMicros > 0 &&
          !busy &&
          retryAfterMs === 0 &&
          (input.pool !== 'public' || (visitorTurnsRemaining > 0 && ipTurnsRemaining > 0)),
        pool: input.pool,
        poolLimitMicros: poolLimit(input.pool),
        poolChargedMicros: totals[input.pool],
        poolRemainingMicros,
        totalLimitMicros: AI_BUDGET_LIMITS.totalMicros,
        totalChargedMicros: totals.public + totals.implementation,
        totalRemainingMicros,
        visitorTurnsRemaining,
        ipTurnsRemaining,
        busy,
        retryAfterMs,
        resetsAt: (dayKey(input.now) + 1) * dayMs,
      };
    });
  }

  async approve(input: ApproveRequest): Promise<LedgerDecision> {
    if (!validApproval(input)) return { allowed: false, reason: 'invalid_approval' };
    if (input.expiresAt <= input.now) return { allowed: false, reason: 'intent_expired' };
    if (input.expiresAt > input.now + 300_000)
      return { allowed: false, reason: 'invalid_intent_expiry' };
    return this.storage.transaction(async (storage) => {
      const key = `approval:${input.intentId}`;
      if (await storage.get(key)) return { allowed: false, reason: 'intent_already_consumed' };
      await storage.put(key, {
        visitorId: input.visitorId,
        expiresAt: input.expiresAt,
        consumedAt: input.now,
      });
      return { allowed: true };
    });
  }
}
