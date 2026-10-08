// EIP-1193 submission and independently observed RPC receipts. No private keys.
export type Address = `0x${string}` | string;
export type Hash = `0x${string}` | string;
export interface MonadNetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
}
export const monadTestnetConfig: MonadNetworkConfig = {
  chainId: 10143,
  name: 'Monad Testnet',
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorerUrl: 'https://testnet.monadvision.com',
};
export const monadMainnetConfig: MonadNetworkConfig = {
  chainId: 143,
  name: 'Monad Mainnet',
  rpcUrl: 'https://rpc.monad.xyz',
  explorerUrl: 'https://monadvision.com',
};
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: 'accountsChanged' | 'chainChanged', listener: () => void): void;
  removeListener?(event: 'accountsChanged' | 'chainChanged', listener: () => void): void;
}
export interface WalletTransaction {
  from: string;
  to: string;
  value: string;
  data: string;
  chainId: string;
  gas?: string;
}
export interface MonadReceipt {
  transactionHash: string;
  status: 'confirmed' | 'reverted';
  blockNumber: number;
  gasUsed: string;
  from: string;
  to: string | null;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
  observedAt: number;
}
export function assertAddress(value: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Invalid EVM address');
}
export function assertHash(value: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid transaction hash');
}
export function formatAtomicUnits(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const fractional = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${value / scale}${fractional ? `.${fractional}` : ''}`;
}
export class MonadClient {
  public readonly config: MonadNetworkConfig;
  private provider?: Eip1193Provider;
  private fetcher: typeof fetch;
  private requestId = 0;
  constructor(
    config: MonadNetworkConfig | string = monadTestnetConfig,
    provider?: Eip1193Provider,
    fetcher: typeof fetch = fetch
  ) {
    this.config =
      typeof config === 'string' ? { ...monadTestnetConfig, rpcUrl: config } : { ...config };
    this.provider = provider;
    this.fetcher = fetcher;
  }
  public getWalletProvider(): Eip1193Provider {
    const injected =
      typeof window !== 'undefined'
        ? (
            window as Window & {
              ethereum?: Eip1193Provider;
            }
          ).ethereum
        : undefined;
    const provider = this.provider ?? injected;
    if (!provider) throw new Error('Install or unlock an EIP-1193 wallet to sign this transaction');
    return provider;
  }
  public async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetcher(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.requestId, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Monad RPC HTTP ${response.status}`);
      const envelope = await response.json();
      if (envelope?.error)
        throw new Error(`Monad RPC: ${envelope.error.message ?? envelope.error.code}`);
      if (!Object.prototype.hasOwnProperty.call(envelope, 'result'))
        throw new Error('Malformed Monad RPC response');
      return envelope.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }
  public async verifyNetwork(): Promise<number> {
    const chainId = Number(BigInt(await this.request<string>('eth_chainId')));
    if (chainId !== this.config.chainId)
      throw new Error(`RPC chain ${chainId} differs from configured chain ${this.config.chainId}`);
    return chainId;
  }
  public async getNetworkHealth(): Promise<{
    blockNumber: bigint;
    latencyMs: number;
    status: 'healthy' | 'degraded' | 'down';
    chainId: number;
    error?: string;
  }> {
    const start = performance.now();
    try {
      await this.verifyNetwork();
      const blockNumber = BigInt(await this.request<string>('eth_blockNumber'));
      const latencyMs = Math.round(performance.now() - start);
      return {
        blockNumber,
        latencyMs,
        status: latencyMs < 800 ? 'healthy' : 'degraded',
        chainId: this.config.chainId,
      };
    } catch (error) {
      return {
        blockNumber: 0n,
        latencyMs: Math.round(performance.now() - start),
        status: 'down',
        chainId: this.config.chainId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  public async getBalance(address: Address): Promise<string> {
    assertAddress(address);
    await this.verifyNetwork();
    return formatAtomicUnits(
      BigInt(await this.request<string>('eth_getBalance', [address, 'latest'])),
      18
    );
  }
  public getTxExplorerUrl(hash: Hash): string {
    assertHash(hash);
    return `${this.config.explorerUrl}/tx/${hash}`;
  }
  public async connectBrowserWallet(): Promise<{
    address: string;
    chainId: number;
  }> {
    const provider = this.getWalletProvider();
    const chainHex = `0x${this.config.chainId.toString(16)}`;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string')
      throw new Error('No wallet account authorized');
    assertAddress(accounts[0]);
    if (
      Number(BigInt(String(await provider.request({ method: 'eth_chainId' })))) !==
      this.config.chainId
    ) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainHex }],
        });
      } catch (error) {
        if (
          (
            error as {
              code?: number;
            }
          ).code !== 4902
        )
          throw error;
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainHex,
              chainName: this.config.name,
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              rpcUrls: [this.config.rpcUrl],
              blockExplorerUrls: [this.config.explorerUrl],
            },
          ],
        });
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainHex }],
        });
      }
    }
    const address = await this.verifyWallet(accounts[0]);
    await this.verifyNetwork();
    return { address, chainId: this.config.chainId };
  }
  public async verifyWallet(expectedAddress?: string): Promise<string> {
    const provider = this.getWalletProvider();
    const [chain, accounts] = await Promise.all([
      provider.request({ method: 'eth_chainId' }),
      provider.request({ method: 'eth_accounts' }),
    ]);
    if (Number(BigInt(String(chain))) !== this.config.chainId)
      throw new Error(
        `Switch wallet to ${this.config.name} (${this.config.chainId}) before signing`
      );
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string')
      throw new Error('Wallet is disconnected');
    assertAddress(accounts[0]);
    if (expectedAddress && accounts[0].toLowerCase() !== expectedAddress.toLowerCase())
      throw new Error('Wallet account changed; prepare a new trade');
    return accounts[0];
  }
  public async submitTransaction(
    transaction: WalletTransaction,
    beforeSign?: () => void
  ): Promise<string> {
    assertAddress(transaction.to);
    assertAddress(transaction.from);
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.data))
      throw new Error('Invalid transaction calldata');
    if (BigInt(transaction.value) < 0n) throw new Error('Invalid native amount');
    if (Number(BigInt(transaction.chainId)) !== this.config.chainId)
      throw new Error('Transaction chain differs from configured network');
    await this.verifyNetwork();
    await this.verifyWallet(transaction.from);
    // Preflight awaits may outlast a pause or account change in the application.
    beforeSign?.();
    const hash = await this.getWalletProvider().request({
      method: 'eth_sendTransaction',
      params: [transaction],
    });
    if (typeof hash !== 'string') throw new Error('Wallet returned no transaction hash');
    assertHash(hash);
    return hash;
  }
  public async sendTransaction(
    to: Address,
    valueWei: bigint = 0n,
    data: string = '0x'
  ): Promise<Hash> {
    const from = await this.verifyWallet();
    return this.submitTransaction({
      from,
      to,
      value: `0x${valueWei.toString(16)}`,
      data,
      chainId: `0x${this.config.chainId.toString(16)}`,
    });
  }
  public async getReceipt(hash: string): Promise<MonadReceipt | null> {
    assertHash(hash);
    await this.verifyNetwork();
    const raw = await this.request<null | {
      transactionHash: string;
      status: string;
      blockNumber: string;
      gasUsed: string;
      from: string;
      to: string | null;
      logs: MonadReceipt['logs'];
    }>('eth_getTransactionReceipt', [hash]);
    if (!raw) return null;
    if (
      raw.transactionHash.toLowerCase() !== hash.toLowerCase() ||
      !['0x0', '0x1'].includes(raw.status)
    )
      throw new Error('Malformed transaction receipt');
    return {
      transactionHash: raw.transactionHash,
      status: raw.status === '0x1' ? 'confirmed' : 'reverted',
      blockNumber: Number(BigInt(raw.blockNumber)),
      gasUsed: BigInt(raw.gasUsed).toString(),
      from: raw.from,
      to: raw.to,
      logs: raw.logs ?? [],
      observedAt: Date.now(),
    };
  }
  public async waitForReceipt(
    hash: string,
    options: {
      timeoutMs?: number;
      pollMs?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<MonadReceipt> {
    const expiresAt = Date.now() + (options.timeoutMs ?? 120000);
    while (Date.now() < expiresAt) {
      if (options.signal?.aborted)
        throw new Error('Receipt tracking cancelled; transaction may still be pending');
      const receipt = await this.getReceipt(hash);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 1500));
    }
    throw new Error('Receipt not observed before timeout; transaction remains pending or unknown');
  }
}
