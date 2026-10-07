// Perpl is an optional integration. No authenticated trade adapter is configured.
export interface PerplPosition {
    symbol: string;
    side: 'long' | 'short';
    sizeMon: number;
    entryPriceUsd: number;
    liquidationPriceUsd: number;
    marginUsd: number;
    unrealizedPnlUsd: number;
}
export interface PerplHedgeResult {
    success: boolean;
    positionId: string;
    txHash: string;
    hedgedAmountMon: number;
    hedgePriceUsd: number;
    notionalHedgedUsd: number;
    executionLatencyMs: number;
}
export class PerplClient {
    constructor(_rpcUrl?: string) { }
    public async openShortHedge(_notionalUsd: number, _currentMidPrice: number): Promise<PerplHedgeResult> { throw new Error('Live Perpl hedging is not integrated. Paper hedges are simulation only.'); }
    public async closeHedge(_positionId: string): Promise<{
        success: boolean;
        txHash: string;
        latencyMs: number;
    }> { throw new Error('Live Perpl hedging is not integrated. Paper hedges are simulation only.'); }
}
