// src/execution/monadClient.ts - Monad Testnet JSON-RPC Client (Chain ID 10143)

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

export class MonadClient {
  private rpcUrl: string;

  constructor(rpcUrl: string = 'https://testnet-rpc.monad.xyz') {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Dispatches a raw JSON-RPC call to Monad Testnet node.
   */
  private async rpcCall(method: string, params: any[] = []): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(data.error.message || `RPC error ${data.error.code}`);
      return data.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches latest block height on Monad Testnet and calculates live RPC round-trip latency.
   */
  public async getNetworkHealth(): Promise<{ blockNumber: bigint; latencyMs: number; status: 'healthy' | 'degraded' | 'down' }> {
    const start = performance.now();
    try {
      const hexBlock = await this.rpcCall('eth_blockNumber');
      const latencyMs = Math.round(performance.now() - start);
      const blockNumber = hexBlock ? BigInt(hexBlock) : 0n;
      return {
        blockNumber,
        latencyMs,
        status: latencyMs < 800 ? 'healthy' : 'degraded',
      };
    } catch {
      return {
        blockNumber: 0n,
        latencyMs: Math.round(performance.now() - start),
        status: 'down',
      };
    }
  }

  /**
   * Retrieves native MON balance of an address on Monad Testnet.
   */
  public async getBalance(address: Address): Promise<string> {
    try {
      const hexBal = await this.rpcCall('eth_getBalance', [address, 'latest']);
      if (!hexBal) return '0.00';
      const wei = BigInt(hexBal);
      const mon = Number(wei) / 1e18;
      return mon.toFixed(4);
    } catch {
      return '0.00';
    }
  }

  /**
   * Formats transaction hash into MonadVision explorer deep link.
   */
  public getTxExplorerUrl(txHash: Hash | string): string {
    return `https://testnet.monadvision.com/tx/${txHash}`;
  }
}
