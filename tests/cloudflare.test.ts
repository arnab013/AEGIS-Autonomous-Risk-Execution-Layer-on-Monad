import { describe, expect, it, vi } from 'vitest';
import { createWorker } from '../cloudflare/worker.ts';
import { kuruMainnetConfig } from '../src/execution/kuruClient.ts';
import type { KuruMarketData, KuruPreparedTrade } from '../src/execution/kuruClient.ts';

const account = '0x1111111111111111111111111111111111111111';
const origin = 'https://aegis.example.workers.dev';
const snapshot: KuruMarketData = {
  pair: 'MON/USDC',
  bids: [{ price: 0.01999, size: 1000 }],
  asks: [{ price: 0.02001, size: 1000 }],
  midPrice: 0.02,
  timestamp: 1_700_000_000_000,
  blockNumber: 100,
  chainId: 143,
  marketAddress: kuruMainnetConfig.marketAddress,
  source: 'kuru_rpc',
  latencyMs: 10,
  depthIncludesAmm: false,
  metadata: {
    pricePrecision: '100000000',
    sizePrecision: '10000000000',
    baseAssetAddress: '0x0000000000000000000000000000000000000000',
    baseAssetDecimals: 18,
    quoteAssetAddress: kuruMainnetConfig.usdcAddress,
    quoteAssetDecimals: 6,
    tickSize: '100',
    minSize: '2000000000000',
    maxSize: '2000000000000000000',
    takerFeeBps: '0',
    makerFeeBps: '0',
  },
};
const proposal: KuruPreparedTrade = {
  id: 'fixture',
  chainId: 143,
  account,
  marketAddress: kuruMainnetConfig.marketAddress,
  amountMon: '200',
  amountWei: '200000000000000000000',
  sizeUnits: '2000000000000',
  estimatedOutUsdc: '4',
  minOutUsdc: '3.98',
  minOutUnits: '3980000',
  slippageBps: 50,
  referenceMidPrice: '0.02',
  snapshotBlockNumber: 100,
  snapshotTimestamp: snapshot.timestamp,
  createdAt: snapshot.timestamp,
  expiresAt: snapshot.timestamp + 30_000,
  simulation: 'passed',
  gasEstimate: '100000',
  transaction: {
    from: account,
    to: kuruMainnetConfig.marketAddress,
    value: '0xad78ebc5ac6200000',
    data: '0x1234',
    chainId: '0x8f',
  },
};

function fixture() {
  const rpc = vi.fn(async (_method: string, _params: unknown[]): Promise<unknown> => '0x8f');
  const client = {
    fetchSnapshot: vi.fn(async () => snapshot),
    getWalletBalances: vi.fn(async (_account: string) => ({ mon: '1000', usdc: '20' })),
    prepareMarketSell: vi.fn(
      async (_account: string, _amount: string, _slippage?: number) => proposal
    ),
    monad: { request: rpc },
  };
  const assets = vi.fn(async (_request: Request) => new Response('<html>Application</html>'));
  const env = { ASSETS: { fetch: assets } };
  const worker = createWorker({ marketClient: client });
  const send = (path: string, body?: unknown, requestOrigin?: string) =>
    worker.fetch(
      new Request(origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(requestOrigin ? { Origin: requestOrigin } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env
    );
  return { client, rpc, assets, env, worker, send };
}

describe('Cloudflare free application adapter', () => {
  it('reports fixed mainnet, owner access and browser session journal without credentials', async () => {
    const { worker, env, client } = fixture();
    const credentials = {
      ...env,
      TYPESAFE_API_KEY: 'test-secret-that-must-stay-private',
      JEV_ACCESS_TOKEN: 'test-owner-secret',
      JEV_ENABLE_LIVE: 'true',
    };
    const response = await worker.fetch(new Request(origin + '/api/status'), credentials);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      inferenceEnabled: false,
      jevConfigured: false,
      inferenceAccess: 'owner',
      journal: 'browser_session',
      execution: 'wallet_review',
      chainId: 143,
      marketAddress: kuruMainnetConfig.marketAddress,
    });
    expect(text).not.toContain('test-secret');
    expect(text).not.toContain('test-owner');
    expect(client.fetchSnapshot).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses paid inference even when an owner token and enable flag are supplied', async () => {
    const upstream = vi.fn(async () => {
      throw new Error('No external call is allowed');
    });
    const worker = createWorker({ fetchImpl: upstream });
    const response = await worker.fetch(
      new Request(origin + '/api/jev', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-owner-secret' },
        body: JSON.stringify({ state: {} }),
      }),
      {
        ASSETS: { fetch: vi.fn(async () => new Response()) },
        ...{
          TYPESAFE_API_KEY: 'test-key',
          JEV_ACCESS_TOKEN: 'test-owner-secret',
          JEV_ENABLE_LIVE: 'true',
        },
      }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty(
      'error',
      expect.stringContaining('persistent spending limit')
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it('serves static application requests through the assets binding', async () => {
    const { send, assets } = fixture();
    const response = await send('/replay/session');
    expect(await response.text()).toContain('Application');
    expect(assets).toHaveBeenCalledWith(expect.any(Request));
  });

  it('does not fall back to the SPA for unknown APIs or signing routes', async () => {
    const { send, assets, rpc } = fixture();
    for (const path of ['/api/missing', '/api/submit', '/api/sign', '/api/send'])
      expect((await send(path, {})).status).toBe(404);
    expect(assets).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the actual adapter snapshot without fabricating a successful read', async () => {
    const { send, client } = fixture();
    expect(await (await send('/api/market')).json()).toEqual(snapshot);
    client.fetchSnapshot.mockRejectedValueOnce(new Error('RPC unavailable'));
    const response = await send('/api/market');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'RPC unavailable' });
  });

  it('forwards the requested valid wallet account for real balance reads', async () => {
    const { send, client } = fixture();
    const response = await send(`/api/portfolio?account=${account}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mon: '1000', usdc: '20' });
    expect(client.getWalletBalances).toHaveBeenCalledWith(account);
  });

  it.each(['', 'bad', '0x1234'])(
    'rejects invalid portfolio account %s before RPC',
    async (address) => {
      const { send, client } = fixture();
      expect((await send(`/api/portfolio?account=${address}`)).status).toBe(422);
      expect(client.getWalletBalances).not.toHaveBeenCalled();
    }
  );

  it('prepares a quote and calldata without submitting a transaction', async () => {
    const { send, client, rpc } = fixture();
    const response = await send('/api/prepare', { account, amountMon: '200', slippageBps: 50 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(proposal);
    expect(client.prepareMarketSell).toHaveBeenCalledWith(account, '200', 50);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0, -1, '0', '-1', '1e3', '1.1234567890123456789', null])(
    'rejects malformed or imprecise MON amount %s before simulation',
    async (amountMon) => {
      const { send, client } = fixture();
      expect((await send('/api/prepare', { account, amountMon, slippageBps: 50 })).status).toBe(
        422
      );
      expect(client.prepareMarketSell).not.toHaveBeenCalled();
    }
  );

  it.each([-1, 501, 1.5, '50', null])(
    'rejects invalid slippage %s before simulation',
    async (slippageBps) => {
      const { send, client } = fixture();
      expect((await send('/api/prepare', { account, amountMon: '200', slippageBps })).status).toBe(
        422
      );
      expect(client.prepareMarketSell).not.toHaveBeenCalled();
    }
  );

  it.each(['/api/audit', '/api/audit/export'])(
    'honestly refuses server journal route %s',
    async (path) => {
      const { send } = fixture();
      const response = await send(path, []);
      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ journal: 'browser_session' });
    }
  );

  it.each(['https://other.example', 'null'])(
    'rejects cross-origin API requests from %s',
    async (requestOrigin) => {
      const { send, client, rpc } = fixture();
      expect((await send('/api/market', undefined, requestOrigin)).status).toBe(403);
      expect(
        (
          await send(
            '/api/rpc',
            { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
            requestOrigin
          )
        ).status
      ).toBe(403);
      expect(client.fetchSnapshot).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('accepts requests from the deployment origin', async () => {
    const { send } = fixture();
    expect((await send('/api/market', undefined, origin)).status).toBe(200);
  });

  it('limits streamed JSON bodies before any upstream request', async () => {
    const { worker, env, rpc } = fixture();
    const response = await worker.fetch(
      new Request(origin + '/api/rpc', {
        method: 'POST',
        body: JSON.stringify({ padding: 'x'.repeat(65_536) }),
      }),
      env
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toHaveProperty('error', 'Request exceeds 64 KB');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the real mainnet client for native and USDC balances', async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(kuruMainnetConfig.rpcUrl);
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const result =
        body.method === 'eth_chainId'
          ? '0x8f'
          : body.method === 'eth_getBalance'
            ? '0xde0b6b3a7640000'
            : `0x${1_000_000n.toString(16).padStart(64, '0')}`;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
    const worker = createWorker({ fetchImpl: upstream });
    const response = await worker.fetch(new Request(origin + `/api/portfolio?account=${account}`), {
      ASSETS: { fetch: vi.fn(async () => new Response()) },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mon: '1', usdc: '1' });
    expect(calls.map((call) => call.method)).toEqual(['eth_chainId', 'eth_getBalance', 'eth_call']);
    expect(calls[2].params[0]).toMatchObject({ to: kuruMainnetConfig.usdcAddress });
  });

  it('retains the global receiver when invoking the Workers native fetch', async () => {
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async function (
      this: unknown,
      _input,
      init
    ) {
      if (this !== globalThis)
        throw new TypeError('Illegal invocation: function called with incorrect this reference');
      const body = JSON.parse(String(init?.body));
      const result =
        body.method === 'eth_chainId'
          ? '0x8f'
          : body.method === 'eth_getBalance'
            ? '0xde0b6b3a7640000'
            : `0x${1_000_000n.toString(16).padStart(64, '0')}`;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
    try {
      const response = await createWorker().fetch(
        new Request(origin + `/api/portfolio?account=${account}`),
        { ASSETS: { fetch: vi.fn(async () => new Response()) } }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ mon: '1', usdc: '1' });
      expect(nativeFetch).toHaveBeenCalledTimes(3);
    } finally {
      nativeFetch.mockRestore();
    }
  });

  it('fails the real adapter if upstream chain is testnet instead of the fixed mainnet', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ result: '0x279f' })));
    const worker = createWorker({ fetchImpl: upstream });
    const response = await worker.fetch(new Request(origin + '/api/market'), {
      ASSETS: { fetch: vi.fn(async () => new Response()) },
    });
    expect(response.status).toBe(502);
    expect(upstream).toHaveBeenCalledOnce();
  });
});

describe('Cloudflare read-only RPC proxy', () => {
  it.each([
    'eth_chainId',
    'eth_blockNumber',
    'eth_getBalance',
    'eth_getCode',
    'eth_call',
    'eth_estimateGas',
    'eth_getBlockByNumber',
    'eth_getTransactionReceipt',
    'eth_getTransactionByHash',
  ])('forwards only method and params for %s while retaining request id', async (method) => {
    const { send, rpc } = fixture();
    rpc.mockResolvedValueOnce(null);
    const response = await send('/api/rpc', {
      jsonrpc: '2.0',
      id: 'browser-1',
      method,
      params: [account],
      rpcUrl: 'https://untrusted.example',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 'browser-1', result: null });
    expect(rpc).toHaveBeenCalledWith(method, [account]);
  });

  it.each([
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'eth_sign',
    'personal_sign',
    'wallet_switchEthereumChain',
    'admin_nodeInfo',
  ])('blocks %s', async (method) => {
    const { send, rpc } = fixture();
    expect((await send('/api/rpc', { jsonrpc: '2.0', id: 1, method, params: [] })).status).toBe(
      422
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    [{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }],
    { jsonrpc: '1.0', id: 1, method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', id: null, method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', id: {}, method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: {} },
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: Array(11).fill(null) },
    { jsonrpc: '2.0', id: 1, method: ['eth_chainId'], params: [] },
  ])('rejects malformed or batch JSON-RPC request %# before RPC', async (input) => {
    const { send, rpc } = fixture();
    expect((await send('/api/rpc', input)).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON without falling through to static assets', async () => {
    const { worker, env, rpc, assets } = fixture();
    const response = await worker.fetch(
      new Request(origin + '/api/rpc', { method: 'POST', body: '{broken' }),
      env
    );
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
  });

  it('returns an upstream read failure without inventing a successful JSON-RPC result', async () => {
    const { send, rpc } = fixture();
    rpc.mockRejectedValueOnce(new Error('RPC temporarily unavailable'));
    const response = await send('/api/rpc', {
      jsonrpc: '2.0',
      id: 5,
      method: 'eth_chainId',
      params: [],
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'RPC temporarily unavailable' });
  });
});
