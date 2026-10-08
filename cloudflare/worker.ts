import { KuruClient, kuruMainnetConfig } from '../src/execution/kuruClient.ts';
import { MonadClient } from '../src/execution/monadClient.ts';

const readOnlyRpcMethods = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getCode',
  'eth_call',
  'eth_estimateGas',
  'eth_getBlockByNumber',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
]);
const maxBodyBytes = 64 * 1024;

type MarketClient = Pick<
  KuruClient,
  'fetchSnapshot' | 'getWalletBalances' | 'prepareMarketSell'
> & {
  monad: { request(method: string, params: unknown[]): Promise<unknown> };
};
type AssetBinding = { fetch(request: Request): Promise<Response> };

function json(status: number, value: unknown): Response {
  return new Response(
    JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item)),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) throw new TypeError('A JSON request body is required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new TypeError('Request exceeds 64 KB');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new TypeError('Request body must be valid JSON');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected a JSON object');
  return value as Record<string, unknown>;
}

function accountAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new TypeError('A valid EVM account address is required');
  return value;
}

export function createWorker(
  options: { marketClient?: MarketClient; fetchImpl?: typeof fetch } = {}
) {
  return {
    async fetch(request: Request, env: { ASSETS: AssetBinding }): Promise<Response> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD')
          return json(404, { error: 'Not found' });
        return env.ASSETS.fetch(request);
      }
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json(403, { error: 'Origin is not allowed' });

      try {
        if (request.method === 'GET' && url.pathname === '/api/status')
          return json(200, {
            inferenceEnabled: false,
            jevConfigured: false,
            inferenceAccess: 'owner',
            model: 'jev-latest',
            chainId: kuruMainnetConfig.chainId,
            marketAddress: kuruMainnetConfig.marketAddress,
            rpcUrl: kuruMainnetConfig.rpcUrl,
            execution: 'wallet_review',
            journal: 'browser_session',
          });

        // This public deployment has no persistent spending quota yet. Credentials cannot enable it.
        if (request.method === 'POST' && url.pathname === '/api/jev')
          return json(503, {
            error:
              'Paid Jev inference is disabled on this public deployment until owner access and a persistent spending limit are configured.',
          });
        if (url.pathname === '/api/audit' || url.pathname === '/api/audit/export')
          return json(501, {
            error:
              'Hosted audit events belong to this browser session. Use the application session export; no server journal is stored.',
            journal: 'browser_session',
          });

        const client =
          options.marketClient ??
          new KuruClient(
            kuruMainnetConfig,
            undefined,
            new MonadClient(
              kuruMainnetConfig,
              undefined,
              options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
            )
          );
        if (request.method === 'GET' && url.pathname === '/api/market')
          return json(200, await client.fetchSnapshot());
        if (request.method === 'GET' && url.pathname === '/api/portfolio')
          return json(
            200,
            await client.getWalletBalances(accountAddress(url.searchParams.get('account')))
          );
        if (request.method === 'POST' && url.pathname === '/api/prepare') {
          const input = object(await readJson(request));
          const account = accountAddress(input.account);
          if (
            typeof input.amountMon !== 'string' ||
            !/^\d{1,60}(?:\.\d{1,18})?$/.test(input.amountMon) ||
            !Number.isFinite(Number(input.amountMon)) ||
            Number(input.amountMon) <= 0 ||
            !Number.isInteger(input.slippageBps) ||
            Number(input.slippageBps) < 0 ||
            Number(input.slippageBps) > 500
          )
            throw new TypeError(
              'A positive decimal MON amount and integer slippage from 0 to 500 bps are required'
            );
          return json(
            200,
            await client.prepareMarketSell(account, input.amountMon, input.slippageBps as number)
          );
        }
        if (request.method === 'POST' && url.pathname === '/api/rpc') {
          const input = object(await readJson(request));
          if (
            input.jsonrpc !== '2.0' ||
            !(
              typeof input.id === 'string' ||
              (typeof input.id === 'number' && Number.isFinite(input.id))
            ) ||
            typeof input.method !== 'string' ||
            !readOnlyRpcMethods.has(input.method) ||
            !Array.isArray(input.params) ||
            input.params.length > 10
          )
            throw new TypeError('Expected a single read-only JSON-RPC request');
          const result = await client.monad.request(input.method, input.params);
          return json(200, { jsonrpc: '2.0', id: input.id, result });
        }
        return json(404, { error: 'Unknown API route' });
      } catch (error) {
        return json(error instanceof TypeError ? 422 : 502, {
          error: error instanceof Error ? error.message : 'Request failed',
        });
      }
    },
  };
}

export default createWorker();
