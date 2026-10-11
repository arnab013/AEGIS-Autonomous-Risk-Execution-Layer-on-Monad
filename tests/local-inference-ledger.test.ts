import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { AiBudgetLedger } from '../cloudflare/ledger.ts';
import { createFileLedgerStorage, createLocalLedgerBinding } from '../server/inference-runtime.mjs';

const projectRoot = resolve(process.cwd());
const testRoot = join(projectRoot, '.local', 'local-inference-tests');
const now = 1_700_000_000_000;
let directory: string;

beforeEach(async () => {
  await mkdir(testRoot, { recursive: true });
  directory = await mkdtemp(join(testRoot, 'ledger-'));
});

afterEach(async () => {
  const target = resolve(directory);
  if (!target.startsWith(testRoot + sep)) throw new Error('Test cleanup escaped the project');
  await rm(target, { recursive: true, force: true });
});

const input = (index = 1) => ({
  requestId: `request-${index}`,
  turnId: `turn-${index}`,
  visitorId: `visitor-${index}`,
  ipHash: `ip-${index}`,
  pool: 'public' as const,
  provider: 'jev' as const,
  funding: 'sponsored' as const,
  maxCostMicros: 50_000,
  now,
});

describe('project-local persistent inference ledger', () => {
  it('keeps quota and money across new local runtime instances', async () => {
    const first = new AiBudgetLedger({
      storage: createFileLedgerStorage({ projectRoot, directory }),
    });
    await first.reserve(input());
    await first.settle({ reservationId: 'request-1', actualCostMicros: 1234, now });
    const restarted = new AiBudgetLedger({
      storage: createFileLedgerStorage({ projectRoot, directory }),
    });
    expect(await restarted.status({ visitorId: 'visitor-1', pool: 'public', now })).toMatchObject({
      poolChargedMicros: 1234,
      visitorTurnsRemaining: 4,
      busy: false,
    });
    expect(await restarted.reserve(input())).toMatchObject({
      allowed: false,
      reason: 'duplicate_request',
    });
  });

  it('serializes independent adapters against the same saved allowance', async () => {
    const ledgers = Array.from(
      { length: 8 },
      () =>
        new AiBudgetLedger({
          storage: createFileLedgerStorage({ projectRoot, directory }),
        })
    );
    const results = await Promise.all(
      ledgers.map((ledger, index) =>
        ledger.reserve({
          ...input(index),
          maxCostMicros: 3_000_000,
        })
      )
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    const status = await ledgers[0].status({ pool: 'public', now });
    expect(status.poolChargedMicros).toBe(6_000_000);
    expect(status.poolRemainingMicros).toBe(2_000_000);
  });

  it('rolls back all staged changes when a transaction fails', async () => {
    const storage = createFileLedgerStorage({ projectRoot, directory });
    await storage.put('existing', { amount: 123 });
    await expect(
      storage.transaction(async (transaction) => {
        await transaction.put('existing', { amount: 0 });
        await transaction.put('new', { amount: 999 });
        throw new Error('Interrupted transaction');
      })
    ).rejects.toThrow('Interrupted transaction');
    expect(await storage.get('existing')).toEqual({ amount: 123 });
    expect(await storage.get('new')).toBeUndefined();
    await storage.put('after-failure', true);
    expect(await storage.get('after-failure')).toBe(true);
  });

  it('fails closed when saved accounting is corrupted instead of starting a fresh budget', async () => {
    await writeFile(join(directory, 'ai-budget-ledger.json'), '{broken');
    const ledger = new AiBudgetLedger({
      storage: createFileLedgerStorage({ projectRoot, directory }),
    });
    await expect(ledger.reserve(input())).rejects.toThrow('cannot be read');
    expect(await readFile(join(directory, 'ai-budget-ledger.json'), 'utf8')).toBe('{broken');
  });

  it('provides the same internal Durable Object fetch contract as production', async () => {
    const binding = createLocalLedgerBinding({ projectRoot, directory });
    const stub = binding.get(binding.idFromName('aegis-ai-budget-v1'));
    const reserved = await stub.fetch(
      new Request('https://ledger/reserve', {
        method: 'POST',
        body: JSON.stringify(input()),
      })
    );
    expect(await reserved.json()).toMatchObject({ allowed: true, reservationId: 'request-1' });
    const status = await stub.fetch(
      new Request(`https://ledger/status?visitorId=visitor-1&pool=public&now=${now}`)
    );
    expect(await status.json()).toMatchObject({
      poolChargedMicros: 50_000,
      visitorTurnsRemaining: 4,
    });
    expect(() => binding.idFromName('untracked-budget')).toThrow('Unknown local AI budget');
  });

  it('allows only storage inside this project on F:', () => {
    expect(() =>
      createFileLedgerStorage({
        projectRoot: 'C:/Projects/aegis',
        directory: 'C:/Projects/aegis/.local',
      })
    ).toThrow();
    expect(() =>
      createFileLedgerStorage({ projectRoot, directory: resolve(projectRoot, '../outside') })
    ).toThrow();
    expect(() => createFileLedgerStorage({ projectRoot, directory: projectRoot })).toThrow();
  });
});
