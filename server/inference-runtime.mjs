import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AiBudgetLedger } from '../cloudflare/ledger.ts';
import {
  handleInference,
  inferenceEnabled,
  JEV_MODEL,
  projectScoutProvider,
} from '../cloudflare/inference.ts';
import { SCOUT_MODELS } from '../cloudflare/scout-providers.ts';

function localPath(projectRoot, directory) {
  const root = resolve(projectRoot);
  const target = resolve(directory);
  if (!/^f:[\\/]/i.test(root) || !target.startsWith(root + sep))
    throw new Error('Local AI storage must stay inside the project on F:');
  return target;
}

async function acquireLock(path) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid }));
        await handle.close();
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(path).catch(() => undefined);
        throw error;
      }
      return async () => {
        await unlink(path);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // A process crash must not reset the budget. Only remove its abandoned lock.
      try {
        const owner = JSON.parse(await readFile(path, 'utf8'));
        if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
          } catch (ownerError) {
            if (ownerError.code === 'ESRCH') await unlink(path).catch(() => undefined);
          }
        }
      } catch {
        /* Another process may still be writing the lock. */
      }
      await new Promise((done) => setTimeout(done, 25));
    }
  }
  throw new Error('Local AI budget ledger is busy');
}

export function createFileLedgerStorage({ projectRoot, directory }) {
  const target = localPath(projectRoot, directory);
  const ledgerPath = resolve(target, 'ai-budget-ledger.json');
  const lockPath = resolve(target, 'ai-budget-ledger.lock');
  const transact = async (callback) => {
    await mkdir(target, { recursive: true });
    const release = await acquireLock(lockPath);
    let temporaryPath;
    try {
      let stored = { version: 1, records: {} };
      try {
        stored = JSON.parse(await readFile(ledgerPath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error('Local AI budget ledger cannot be read');
      }
      if (
        stored.version !== 1 ||
        !stored.records ||
        typeof stored.records !== 'object' ||
        Array.isArray(stored.records)
      )
        throw new Error('Local AI budget ledger is invalid');
      const records = new Map(Object.entries(stored.records));
      let changed = false;
      const result = await callback({
        get: async (key) => structuredClone(records.get(key)),
        put: async (key, value) => {
          records.set(key, structuredClone(value));
          changed = true;
        },
      });
      if (changed) {
        temporaryPath = resolve(target, `ai-budget-${randomUUID()}.tmp`);
        const handle = await open(temporaryPath, 'wx');
        try {
          await handle.writeFile(
            JSON.stringify({ version: 1, records: Object.fromEntries(records) })
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporaryPath, ledgerPath);
        temporaryPath = undefined;
      }
      return result;
    } finally {
      if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
      await release();
    }
  };
  return {
    transaction: transact,
    get: (key) => transact((storage) => storage.get(key)),
    put: (key, value) => transact((storage) => storage.put(key, value)),
  };
}

export function createLocalLedgerBinding({ projectRoot, directory }) {
  const storage = createFileLedgerStorage({ projectRoot, directory });
  const ledger = new AiBudgetLedger({ storage });
  return {
    idFromName: (name) => {
      if (name !== 'aegis-ai-budget-v1') throw new TypeError('Unknown local AI budget');
      return name;
    },
    get: (id) => {
      if (id !== 'aegis-ai-budget-v1') throw new TypeError('Unknown local AI budget');
      return { fetch: (request) => ledger.fetch(request) };
    },
  };
}

export function createLocalInferenceRuntime({
  projectRoot,
  environment = process.env,
  marketClient,
  fetchImpl = fetch,
  clock = Date.now,
  news,
  storageDirectory = resolve(projectRoot, '.local/artifacts/ai'),
}) {
  const names = [
    'AI_ENABLED',
    'AI_SESSION_SECRET',
    'AI_IMPLEMENTATION_TOKEN',
    'TYPESAFE_API_KEY',
    'MISTRAL_API_KEY',
    'GEMINI_API_KEY',
    'SCOUT_PROJECT_PROVIDER',
    'TURNSTILE_SECRET_KEY',
    'TURNSTILE_SITE_KEY',
  ];
  const environmentCopy = Object.fromEntries(
    names
      .filter((name) => typeof environment[name] === 'string')
      .map((name) => [name, environment[name]])
  );
  const env = {
    ...environmentCopy,
    AI_BUDGET: createLocalLedgerBinding({ projectRoot, directory: storageDirectory }),
  };
  return {
    requestedEnabled: env.AI_ENABLED === 'true',
    enabled: () => inferenceEnabled(env, clock()),
    describe: () => ({
      inferenceEnabled: inferenceEnabled(env, clock()),
      jevConfigured: Boolean(env.TYPESAFE_API_KEY),
      agentConfigured: Boolean(
        projectScoutProvider(env) === 'google' ? env.GEMINI_API_KEY : env.MISTRAL_API_KEY
      ),
      agentProvider: projectScoutProvider(env),
      model: JEV_MODEL,
      agentModel: SCOUT_MODELS[projectScoutProvider(env)],
      inferenceAccess: 'capped_trial_or_user_key',
    }),
    handle: (request) =>
      handleInference(request, env, {
        marketClient,
        fetchImpl,
        now: clock,
        ...(news ? { news } : {}),
      }),
  };
}
