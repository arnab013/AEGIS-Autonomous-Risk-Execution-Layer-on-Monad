import { describe, expect, it, vi } from 'vitest';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  parseAbiParameters,
  parseUnits,
} from 'viem';
import { MonadClient, monadTestnetConfig } from '../src/execution/monadClient.ts';
import type { Eip1193Provider } from '../src/execution/monadClient.ts';
import {
  decodePackedBook,
  KuruClient,
  kuruOrderbookAbi,
  kuruTestnetConfig,
  preparedTradeId,
  reconstructAmmDepth,
} from '../src/execution/kuruClient.ts';
import type { KuruMarketMetadata } from '../src/execution/kuruClient.ts';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'ab'.repeat(32)}`;
const metadata: KuruMarketMetadata = {
  pricePrecision: '100000000',
  sizePrecision: '10000000000',
  baseAssetAddress: '0x0000000000000000000000000000000000000000',
  baseAssetDecimals: 18,
  quoteAssetAddress: kuruTestnetConfig.usdcAddress,
  quoteAssetDecimals: 6,
  tickSize: '100',
  minSize: '2000000000000',
  maxSize: '2000000000000000000',
  takerFeeBps: '0',
  makerFeeBps: '0',
};
const packed = (words: bigint[]) =>
  `0x${words.map((w) => w.toString(16).padStart(64, '0')).join('')}`;
function rpcFetcher(results: Record<string, unknown>) {
  return vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: body.id, result: results[body.method] }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }) as unknown as typeof fetch;
}
describe('Monad wallet and receipt behavior', () => {
  it('checks application authorization after asynchronous wallet verification and before requesting a signature', async () => {
    const provider: Eip1193Provider = { request: vi.fn(async () => HASH) };
    const client = new MonadClient(monadTestnetConfig, provider);
    let authorized = true;
    vi.spyOn(client, 'verifyNetwork').mockResolvedValue(10143);
    vi.spyOn(client, 'verifyWallet').mockImplementation(async () => {
      authorized = false;
      return ACCOUNT;
    });
    const beforeSign = vi.fn(() => {
      if (!authorized) throw new Error('User changed the wallet or mandate');
    });
    await expect(
      client.submitTransaction(
        {
          from: ACCOUNT,
          to: kuruTestnetConfig.marketAddress,
          value: '0x0',
          data: '0x',
          chainId: '0x279f',
        },
        beforeSign
      )
    ).rejects.toThrow('changed the wallet or mandate');
    expect(beforeSign).toHaveBeenCalledOnce();
    expect(provider.request).not.toHaveBeenCalled();
  });

  it('runs the application guard immediately before the approved wallet request', async () => {
    const calls: string[] = [];
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        calls.push(method);
        return HASH;
      }),
    };
    const client = new MonadClient(monadTestnetConfig, provider);
    vi.spyOn(client, 'verifyNetwork').mockImplementation(async () => {
      calls.push('verifyNetwork');
      return 10143;
    });
    vi.spyOn(client, 'verifyWallet').mockImplementation(async () => {
      calls.push('verifyWallet');
      return ACCOUNT;
    });
    const beforeSign = vi.fn(() => {
      calls.push('applicationGuard');
    });
    await expect(
      client.submitTransaction(
        {
          from: ACCOUNT,
          to: kuruTestnetConfig.marketAddress,
          value: '0x0',
          data: '0x',
          chainId: '0x279f',
        },
        beforeSign
      )
    ).resolves.toBe(HASH);
    expect(calls).toEqual([
      'verifyNetwork',
      'verifyWallet',
      'applicationGuard',
      'eth_sendTransaction',
    ]);
  });
  it('propagates rejected network switches and never claims a connection', async () => {
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_requestAccounts') return [ACCOUNT];
        if (method === 'eth_chainId') return '0x1';
        throw Object.assign(new Error('User rejected switch'), { code: 4001 });
      }),
    };
    const client = new MonadClient(monadTestnetConfig, provider);
    await expect(client.connectBrowserWallet()).rejects.toThrow('rejected');
  });
  it('rechecks chain after an apparently successful wallet switch', async () => {
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCOUNT];
        if (method === 'eth_chainId') return '0x1';
        return null;
      }),
    };
    const client = new MonadClient(monadTestnetConfig, provider);
    await expect(client.connectBrowserWallet()).rejects.toThrow('Switch wallet');
  });
  it('blocks signing on an unexpected wallet chain', async () => {
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => (method === 'eth_chainId' ? '0x1' : [ACCOUNT])),
    };
    const client = new MonadClient(
      monadTestnetConfig,
      provider,
      rpcFetcher({ eth_chainId: '0x279f' })
    );
    await expect(client.sendTransaction(kuruTestnetConfig.marketAddress, 0n, '0x')).rejects.toThrow(
      'Switch wallet'
    );
    expect(provider.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' })
    );
  });
  it('distinguishes RPC failure from an actual zero balance', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: 'unavailable' } }))
    ) as unknown as typeof fetch;
    const client = new MonadClient(monadTestnetConfig, undefined, fetcher);
    await expect(client.getBalance(ACCOUNT)).rejects.toThrow('unavailable');
  });
  it('returns null for pending and explicit reverted status from actual RPC envelope', async () => {
    const pending = new MonadClient(
      monadTestnetConfig,
      undefined,
      rpcFetcher({ eth_chainId: '0x279f', eth_getTransactionReceipt: null })
    );
    expect(await pending.getReceipt(HASH)).toBeNull();
    const reverted = new MonadClient(
      monadTestnetConfig,
      undefined,
      rpcFetcher({
        eth_chainId: '0x279f',
        eth_getTransactionReceipt: {
          transactionHash: HASH,
          status: '0x0',
          blockNumber: '0x10',
          gasUsed: '0x5208',
          from: ACCOUNT,
          to: kuruTestnetConfig.marketAddress,
          logs: [],
        },
      })
    );
    expect(await reverted.getReceipt(HASH)).toMatchObject({
      status: 'reverted',
      blockNumber: 16,
      gasUsed: '21000',
    });
  });
});
describe('Kuru packed L2 and AMM decoding', () => {
  it('decodes deployed framing with a bid separator and unterminated final ask pairs', () => {
    const book = decodePackedBook(
      packed([100n, 2000000n, 4000000000000n, 0n, 2100000n, 3000000000000n]),
      metadata
    );
    expect(book).toEqual({
      blockNumber: 100,
      bids: [{ price: 0.02, size: 400 }],
      asks: [{ price: 0.021, size: 300 }],
    });
  });
  it('rejects truncation and missing bid separator', () => {
    expect(() => decodePackedBook(packed([1n, 2000000n]), metadata)).toThrow('Incomplete');
    expect(() => decodePackedBook(packed([1n, 2000000n, 100n]), metadata)).toThrow('separator');
  });
  it('computes AMM remaining size and official rounded price progression', () => {
    const vault = [
      ACCOUNT,
      20000000000000000n,
      1000000000000n,
      21000000000000000n,
      0n,
      4000000000000n,
      4000000000000n,
      100n,
    ] as const;
    const book = reconstructAmmDepth(vault, metadata, 2);
    expect(book.bids[0]).toEqual({ price: 0.02, size: 300 });
    expect(book.asks[0]).toEqual({ price: 0.021, size: 400 });
    expect(book.bids[1].price).toBeLessThan(book.bids[0].price);
    expect(book.asks[1].price).toBeGreaterThan(book.asks[0].price);
  });
});
function mockKuru(simulatedOut = 4000000n) {
  const monad = new MonadClient(kuruTestnetConfig);
  vi.spyOn(monad, 'verifyNetwork').mockResolvedValue(10143);
  vi.spyOn(monad, 'verifyWallet').mockResolvedValue(ACCOUNT);
  const request = vi.spyOn(monad, 'request').mockImplementation(async (method, params = []) => {
    if (method === 'eth_blockNumber') return '0x64';
    if (method === 'eth_getCode') return '0x1234';
    if (method === 'eth_getBlockByNumber')
      return { number: '0x64', timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` };
    if (method === 'eth_estimateGas') return '0x186a0';
    if (method === 'eth_sendTransaction') return HASH;
    if (method === 'eth_call') {
      const tx = params[0] as {
        data: `0x${string}`;
      };
      const decoded = decodeFunctionData({ abi: kuruOrderbookAbi, data: tx.data });
      if (decoded.functionName === 'getMarketParams')
        return encodeFunctionResult({
          abi: kuruOrderbookAbi,
          functionName: 'getMarketParams',
          result: [
            100000000,
            10000000000n,
            metadata.baseAssetAddress as `0x${string}`,
            18n,
            kuruTestnetConfig.usdcAddress as `0x${string}`,
            6n,
            100,
            2000000000000n,
            2000000000000000000n,
            0n,
            0n,
          ],
        });
      if (decoded.functionName === 'getL2Book')
        return encodeFunctionResult({
          abi: kuruOrderbookAbi,
          functionName: 'getL2Book',
          result: packed([
            100n,
            1999000n,
            10000000000000n,
            0n,
            2001000n,
            10000000000000n,
          ]) as `0x${string}`,
        });
      if (decoded.functionName === 'getVaultParams')
        return encodeFunctionResult({
          abi: kuruOrderbookAbi,
          functionName: 'getVaultParams',
          result: [metadata.baseAssetAddress as `0x${string}`, 0n, 0n, 0n, 0n, 0n, 0n, 100n],
        });
      if (decoded.functionName === 'placeAndExecuteMarketSell')
        return encodeFunctionResult({
          abi: kuruOrderbookAbi,
          functionName: 'placeAndExecuteMarketSell',
          result: simulatedOut,
        });
    }
    throw new Error(`Unexpected RPC ${method}`);
  });
  return { client: new KuruClient(kuruTestnetConfig, undefined, monad), monad, request };
}
describe('Kuru snapshot block availability', () => {
  const missingBlock =
    'Monad RPC: Block requested not found. Request might be querying historical state that is not available.';

  it('discards the failed batch and recaptures every market read at one new block', async () => {
    const { client, request } = mockKuru();
    const original = request.getMockImplementation()!;
    const secondTimestamp = Math.floor(Date.now() / 1000);
    let heads = 0;
    request.mockImplementation(async (method, params = []) => {
      if (method === 'eth_blockNumber') return ++heads === 1 ? '0x64' : '0x65';
      if (method === 'eth_getBlockByNumber')
        return {
          number: params[0],
          timestamp: `0x${(secondTimestamp - (params[0] === '0x64' ? 10 : 0)).toString(16)}`,
        };
      if (method === 'eth_call') {
        const { functionName } = decodeFunctionData({
          abi: kuruOrderbookAbi,
          data: (params[0] as { data: `0x${string}` }).data,
        });
        if (params[1] === '0x64' && functionName === 'getVaultParams')
          throw new Error(missingBlock);
        if (params[1] === '0x65' && functionName === 'getL2Book')
          return encodeFunctionResult({
            abi: kuruOrderbookAbi,
            functionName: 'getL2Book',
            result: packed([
              101n,
              2999000n,
              20000000000000n,
              0n,
              3001000n,
              20000000000000n,
            ]) as `0x${string}`,
          });
      }
      return original(method, params);
    });

    const snapshot = await client.fetchSnapshot();
    expect(snapshot).toMatchObject({
      blockNumber: 101,
      timestamp: secondTimestamp * 1000,
      midPrice: 0.03,
      bids: [{ price: 0.02999, size: 2000 }],
      asks: [{ price: 0.03001, size: 2000 }],
    });
    const batches = request.mock.calls
      .filter(([method]) => ['eth_getCode', 'eth_call', 'eth_getBlockByNumber'].includes(method))
      .map(([method, params = []]) => (method === 'eth_getBlockByNumber' ? params[0] : params[1]));
    expect(batches).toEqual([...Array(5).fill('0x64'), ...Array(5).fill('0x65')]);
    expect(heads).toBe(2);
  });

  it('stops after one recovery if the selected block remains unavailable', async () => {
    const { client, request } = mockKuru();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params = []) => {
      if (method === 'eth_getCode') throw new Error(missingBlock);
      return original(method, params);
    });
    await expect(client.fetchSnapshot()).rejects.toThrow(missingBlock);
    expect(request.mock.calls.filter(([method]) => method === 'eth_blockNumber')).toHaveLength(2);
    expect(request.mock.calls.filter(([method]) => method === 'eth_getCode')).toHaveLength(2);
  });

  it('does not retry an unrelated provider failure, even alongside a missing-block response', async () => {
    const { client, request } = mockKuru();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params = []) => {
      if (method === 'eth_getCode') throw new Error(missingBlock);
      if (method === 'eth_getBlockByNumber') throw new Error('Monad RPC HTTP 429');
      return original(method, params);
    });
    await expect(client.fetchSnapshot()).rejects.toThrow('Monad RPC HTTP 429');
    expect(request.mock.calls.filter(([method]) => method === 'eth_blockNumber')).toHaveLength(1);
  });

  it.each([
    [null, 'Malformed Kuru snapshot block header'],
    [{ number: '0x65', timestamp: '0x1' }, 'header differs from pinned RPC block'],
    [{ number: '0x64', timestamp: 'invalid' }, 'Malformed Kuru snapshot block header'],
  ])(
    'rejects an unavailable or inconsistent header without recapturing: %s',
    async (header, message) => {
      const { client, request } = mockKuru();
      const original = request.getMockImplementation()!;
      request.mockImplementation(async (method, params = []) =>
        method === 'eth_getBlockByNumber' ? header : original(method, params)
      );
      await expect(client.fetchSnapshot()).rejects.toThrow(String(message));
      expect(request.mock.calls.filter(([method]) => method === 'eth_blockNumber')).toHaveLength(1);
    }
  );

  it.each([
    [packed([101n, 1999000n, 10000000000000n, 0n, 2001000n, 10000000000000n]), 'block differs'],
    ['0x01', 'Malformed packed Kuru orderbook'],
  ])('does not recover invalid or mismatched market evidence', async (book, message) => {
    const { client, request } = mockKuru();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params = []) => {
      if (
        method === 'eth_call' &&
        decodeFunctionData({
          abi: kuruOrderbookAbi,
          data: (params[0] as { data: `0x${string}` }).data,
        }).functionName === 'getL2Book'
      )
        return encodeFunctionResult({
          abi: kuruOrderbookAbi,
          functionName: 'getL2Book',
          result: book as `0x${string}`,
        });
      return original(method, params);
    });
    await expect(client.fetchSnapshot()).rejects.toThrow(message);
    expect(request.mock.calls.filter(([method]) => method === 'eth_blockNumber')).toHaveLength(1);
  });

  it('still blocks preparation when the recovered block timestamp is stale', async () => {
    const { client, request } = mockKuru();
    const original = request.getMockImplementation()!;
    let codeReads = 0;
    request.mockImplementation(async (method, params = []) => {
      if (method === 'eth_getCode' && ++codeReads === 1) throw new Error(missingBlock);
      if (method === 'eth_getBlockByNumber')
        return {
          number: '0x64',
          timestamp: `0x${(Math.floor(Date.now() / 1000) - 31).toString(16)}`,
        };
      return original(method, params);
    });
    await expect(client.prepareMarketSell(ACCOUNT, '200')).rejects.toThrow('snapshot is stale');
    expect(request.mock.calls.filter(([method]) => method === 'eth_blockNumber')).toHaveLength(2);
    expect(request.mock.calls.some(([method]) => method === 'eth_estimateGas')).toBe(false);
    expect(request.mock.calls.some(([method]) => method === 'eth_sendTransaction')).toBe(false);
  });
});
describe('Real Kuru proposal behavior with deterministic RPC fixtures', () => {
  it('cancels signing when application authorization changes during Kuru preflight', async () => {
    const { client, monad, request } = mockKuru();
    const provider: Eip1193Provider = { request: vi.fn(async () => HASH) };
    vi.spyOn(monad, 'getWalletProvider').mockReturnValue(provider);
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    let authorized = true;
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params = []) => {
      const result = await original(method, params);
      if (method === 'eth_estimateGas') authorized = false;
      return result;
    });
    const beforeSign = vi.fn(() => {
      if (!authorized) throw new Error('Application authorization changed');
    });
    await expect(client.submitPreparedTrade(proposal, beforeSign)).rejects.toThrow(
      'authorization changed'
    );
    expect(beforeSign).toHaveBeenCalledOnce();
    expect(provider.request).not.toHaveBeenCalled();
  });

  it('rechecks proposal expiry after Kuru preflight and before opening the wallet', async () => {
    let clock = Date.now();
    const date = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const { client, monad, request } = mockKuru();
      const provider: Eip1193Provider = { request: vi.fn(async () => HASH) };
      vi.spyOn(monad, 'getWalletProvider').mockReturnValue(provider);
      const proposal = await client.prepareMarketSell(ACCOUNT, '200');
      const original = request.getMockImplementation()!;
      request.mockImplementation(async (method, params = []) => {
        const result = await original(method, params);
        if (method === 'eth_estimateGas') clock = proposal.expiresAt;
        return result;
      });
      const beforeSign = vi.fn();
      await expect(client.submitPreparedTrade(proposal, beforeSign)).rejects.toThrow('expired');
      expect(beforeSign).not.toHaveBeenCalled();
      expect(provider.request).not.toHaveBeenCalled();
    } finally {
      date.mockRestore();
    }
  });
  it('prepares exact native MON calldata and minimum token output without signing', async () => {
    const { client, request } = mockKuru();
    const proposal = await client.prepareMarketSell(ACCOUNT, '200', 50);
    expect(proposal).toMatchObject({
      amountWei: parseUnits('200', 18).toString(),
      sizeUnits: '2000000000000',
      estimatedOutUsdc: '4',
      minOutUsdc: '3.98',
      simulation: 'passed',
    });
    const decoded = decodeFunctionData({
      abi: kuruOrderbookAbi,
      data: proposal.transaction.data as `0x${string}`,
    });
    expect(decoded.args).toEqual([2000000000000n, 3980000n, false, true]);
    expect(request).not.toHaveBeenCalledWith('eth_sendTransaction', expect.anything());
  });
  it('blocks sizes below actual market minimum before any signing', async () => {
    const { client } = mockKuru();
    await expect(client.prepareMarketSell(ACCOUNT, '0.01')).rejects.toThrow('between 200');
  });
  it('prevents combining price impact and quote haircut into twice the policy slippage', async () => {
    const { client } = mockKuru(3990000n);
    const proposal = await client.prepareMarketSell(ACCOUNT, '200', 50);
    expect(proposal.minOutUsdc).toBe('3.98');
    expect(proposal.minOutUnits).toBe('3980000');
  });
  it('blocks a quote whose impact already exceeds total mid-price slippage cap', async () => {
    const { client } = mockKuru(3970000n);
    await expect(client.prepareMarketSell(ACCOUNT, '200', 50)).rejects.toThrow(
      'total slippage cap'
    );
  });
  it('rejects mutated calldata even if the summary hash still matches', async () => {
    const { client, monad } = mockKuru();
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    proposal.transaction.data = '0x';
    const signing = vi.spyOn(monad, 'submitTransaction');
    await expect(client.submitPreparedTrade(proposal)).rejects.toThrow('calldata');
    expect(signing).not.toHaveBeenCalled();
  });
  it('rejects expired proposals and does not ask a wallet to sign', async () => {
    const { client, monad } = mockKuru();
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    proposal.expiresAt = Date.now() - 1;
    proposal.id = preparedTradeId(proposal);
    const signing = vi.spyOn(monad, 'submitTransaction');
    await expect(client.submitPreparedTrade(proposal)).rejects.toThrow('expired');
    expect(signing).not.toHaveBeenCalled();
  });
  it('resimulates the reviewed transaction before user-confirmed submission', async () => {
    const { client, monad, request } = mockKuru();
    const signing = vi.spyOn(monad, 'submitTransaction').mockResolvedValue(HASH);
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    request.mockClear();
    expect(await client.submitPreparedTrade(proposal)).toBe(HASH);
    expect(request).toHaveBeenCalledWith('eth_call', [
      expect.objectContaining({
        from: proposal.account,
        to: proposal.marketAddress,
        data: proposal.transaction.data,
        value: proposal.transaction.value,
      }),
      'latest',
    ]);
    expect(signing).toHaveBeenCalledOnce();
  });
  it('does not forward unreviewed transaction fee fields received in JSON', async () => {
    const { client, monad } = mockKuru();
    const signing = vi.spyOn(monad, 'submitTransaction').mockResolvedValue(HASH);
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    Object.assign(proposal.transaction, { maxFeePerGas: '0xffffffffffffffff', nonce: '0xffff' });
    await client.submitPreparedTrade(proposal);
    expect(signing.mock.calls[0][0]).not.toHaveProperty('maxFeePerGas');
    expect(signing.mock.calls[0][0]).not.toHaveProperty('nonce');
  });
  it('verifies actual USDC transfers and exact observed transaction before recording a fill', async () => {
    const { client, monad } = mockKuru();
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    const paddedAddress = (address: string) =>
      `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
    vi.spyOn(monad, 'waitForReceipt').mockResolvedValue({
      transactionHash: HASH,
      status: 'confirmed',
      blockNumber: 100,
      gasUsed: '100000',
      from: ACCOUNT,
      to: client.config.marketAddress,
      observedAt: Date.now(),
      logs: [
        {
          address: client.config.usdcAddress,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            paddedAddress(client.config.marketAddress),
            paddedAddress(ACCOUNT),
          ],
          data: encodeAbiParameters(parseAbiParameters('uint256'), [4000000n]),
        },
      ],
    });
    vi.spyOn(monad, 'request').mockResolvedValue({
      from: ACCOUNT,
      to: client.config.marketAddress,
      input: proposal.transaction.data,
      value: proposal.transaction.value,
      chainId: '0x279f',
    });
    expect(await client.waitForTradeReceipt(proposal, HASH)).toMatchObject({
      receivedUsdc: '4',
      receipt: { status: 'confirmed' },
    });
  });
  it('rejects unrelated transaction hashes as trading confirmation', async () => {
    const { client, monad } = mockKuru();
    const proposal = await client.prepareMarketSell(ACCOUNT, '200');
    vi.spyOn(monad, 'waitForReceipt').mockResolvedValue({
      transactionHash: HASH,
      status: 'confirmed',
      blockNumber: 100,
      gasUsed: '100000',
      from: ACCOUNT,
      to: client.config.marketAddress,
      observedAt: Date.now(),
      logs: [],
    });
    vi.spyOn(monad, 'request').mockResolvedValue({
      from: ACCOUNT,
      to: client.config.marketAddress,
      input: '0x',
      value: '0x0',
      chainId: '0x279f',
    });
    await expect(client.waitForTradeReceipt(proposal, HASH)).rejects.toThrow('differs from');
  });
});
