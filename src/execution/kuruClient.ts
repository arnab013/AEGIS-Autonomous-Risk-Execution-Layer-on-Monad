import { decodeEventLog, decodeFunctionResult, encodeFunctionData, keccak256, parseAbi, parseUnits, toHex } from 'viem';
import type { Abi } from 'viem';
import type { OrderBookLevel } from '../types/index.ts';
import { assertAddress, formatAtomicUnits, MonadClient, monadMainnetConfig, monadTestnetConfig } from './monadClient.ts';
import type { MonadNetworkConfig, MonadReceipt, WalletTransaction } from './monadClient.ts';
// ABI and deployments verified against official Kuru SDK and docs; see contracts/README.md.
export const kuruOrderbookAbi = parseAbi([
    'function getMarketParams() view returns (uint32,uint96,address,uint256,address,uint256,uint32,uint96,uint96,uint256,uint256)',
    'function getL2Book() view returns (bytes)',
    'function getVaultParams() view returns (address,uint256,uint96,uint256,uint96,uint96,uint96,uint96)',
    'function placeAndExecuteMarketSell(uint96 size,uint256 minAmountOut,bool isMargin,bool isFillOrKill) payable returns (uint256)',
    'function addBuyOrder(uint32 price,uint96 size,bool postOnly)',
    'function addSellOrder(uint32 price,uint96 size,bool postOnly)',
    'function batchCancelOrders(uint40[] orderIds)',
]);
const tokenAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'event Transfer(address indexed from,address indexed to,uint256 value)']);
export interface KuruConfig extends MonadNetworkConfig {
    marketAddress: string;
    usdcAddress: string;
    marginAddress: string;
}
export const kuruTestnetConfig: KuruConfig = { ...monadTestnetConfig, marketAddress: '0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9', usdcAddress: '0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570', marginAddress: '0xd029C2D98ff85D8F64799017fE00a59B1159CE02' };
export const kuruMainnetConfig: KuruConfig = { ...monadMainnetConfig, marketAddress: '0x065C9d28E428A0db40191a54d33d5b7c71a9C394', usdcAddress: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', marginAddress: '0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5' };
export interface KuruMarketMetadata {
    pricePrecision: string;
    sizePrecision: string;
    baseAssetAddress: string;
    baseAssetDecimals: number;
    quoteAssetAddress: string;
    quoteAssetDecimals: number;
    tickSize: string;
    minSize: string;
    maxSize: string;
    takerFeeBps: string;
    makerFeeBps: string;
}
export interface KuruMarketData {
    pair: string;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    midPrice: number;
    timestamp: number;
    blockNumber: number;
    chainId: number;
    marketAddress: string;
    source: 'kuru_rpc';
    metadata: KuruMarketMetadata;
    latencyMs: number;
    depthIncludesAmm: boolean;
}
export interface KuruPreparedTrade {
    id: string;
    chainId: number;
    account: string;
    marketAddress: string;
    amountMon: string;
    amountWei: string;
    sizeUnits: string;
    estimatedOutUsdc: string;
    minOutUsdc: string;
    minOutUnits: string;
    slippageBps: number;
    referenceMidPrice: string;
    snapshotBlockNumber: number;
    snapshotTimestamp: number;
    createdAt: number;
    expiresAt: number;
    simulation: 'passed';
    gasEstimate: string;
    transaction: WalletTransaction;
}
export interface KuruOrderResult {
    success: boolean;
    orderId: string;
    txHash: string;
    gasUsed: string;
    executionLatencyMs: number;
}
const ZERO = '0x0000000000000000000000000000000000000000';
const pow10Decimals = (precision: bigint): number => { let n = precision; let decimals = 0; while (n > 1n && n % 10n === 0n) {
    n /= 10n;
    decimals++;
} if (n !== 1n)
    throw new Error('Unsupported Kuru precision'); return decimals; };
const roundedMulDiv = (value: bigint, multiplier: bigint, denominator: bigint) => (value * multiplier + denominator / 2n) / denominator;
export function decodePackedBook(data: string, metadata: KuruMarketMetadata): {
    blockNumber: number;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
} {
    if (!/^0x[0-9a-fA-F]+$/.test(data) || (data.length - 2) % 64 !== 0)
        throw new Error('Malformed packed Kuru orderbook');
    const words = [] as bigint[];
    for (let offset = 2; offset < data.length; offset += 64)
        words.push(BigInt(`0x${data.slice(offset, offset + 64)}`));
    let cursor = 1;
    let bidTerminated = false;
    const readSide = (isBid: boolean): OrderBookLevel[] => { const side: OrderBookLevel[] = []; while (cursor < words.length) {
        const price = words[cursor++];
        if (price === 0n) {
            if (isBid)
                bidTerminated = true;
            return side;
        }
        if (cursor >= words.length)
            throw new Error('Incomplete Kuru price/size pair');
        const size = words[cursor++];
        if (size > 0n)
            side.push({ price: Number(price) / Number(metadata.pricePrecision), size: Number(size) / Number(metadata.sizePrecision) });
        if (side.length > 10000)
            throw new Error('Kuru book exceeds supported size');
    } if (isBid)
        throw new Error('Missing Kuru bid separator'); return side; };
    const bids = readSide(true);
    if (!bidTerminated)
        throw new Error('Missing Kuru bid separator');
    const asks = readSide(false);
    if (cursor !== words.length)
        throw new Error('Trailing malformed Kuru orderbook data');
    return { blockNumber: Number(words[0]), bids, asks };
}
export function reconstructAmmDepth(vault: readonly unknown[], metadata: KuruMarketMetadata, levels = 300): {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
} {
    const [address, bid, partialBid, ask, partialAsk, bidSize, askSize, spread] = vault as readonly [
        string,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
    ];
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    if (address.toLowerCase() === ZERO || bidSize === 0n)
        return { bids, asks };
    if (partialBid > bidSize || partialAsk > askSize)
        throw new Error('Malformed Kuru AMM remaining sizes');
    const spreadConstant = spread / 10n;
    let bidPrice = bid, askPrice = ask, currentBidSize = bidSize, currentAskSize = askSize;
    for (let i = 0; i < levels; i++) {
        if (bidPrice > 0n) {
            const size = i === 0 ? bidSize - partialBid : currentBidSize;
            if (size > 0n)
                bids.push({ price: Number(formatAtomicUnits(bidPrice, 18)), size: Number(size) / Number(metadata.sizePrecision) });
            bidPrice = roundedMulDiv(bidPrice, 1000n, 1000n + spreadConstant);
            currentBidSize = roundedMulDiv(currentBidSize, 2000n + spreadConstant, 2000n);
        }
        if (askPrice > 0n && askPrice < (1n << 256n) - 1n) {
            const size = i === 0 ? askSize - partialAsk : currentAskSize;
            if (size > 0n)
                asks.push({ price: Number(formatAtomicUnits(askPrice, 18)), size: Number(size) / Number(metadata.sizePrecision) });
            askPrice = roundedMulDiv(askPrice, 1000n + spreadConstant, 1000n);
            currentAskSize = roundedMulDiv(currentAskSize, 2000n, 2000n + spreadConstant);
        }
    }
    return { bids, asks };
}
function combineLevels(a: OrderBookLevel[], b: OrderBookLevel[], isBuy: boolean): OrderBookLevel[] { const levels = new Map<number, number>(); for (const level of [...a, ...b]) {
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size) || level.price <= 0 || level.size <= 0)
        throw new Error('Invalid Kuru level');
    levels.set(level.price, (levels.get(level.price) ?? 0) + level.size);
} return [...levels.entries()].map(([price, size]) => ({ price, size })).sort((x, y) => isBuy ? y.price - x.price : x.price - y.price); }
export function preparedTradeId(trade: Omit<KuruPreparedTrade, 'id'>): string { return keccak256(toHex(JSON.stringify([trade.chainId, trade.account.toLowerCase(), trade.marketAddress.toLowerCase(), trade.amountMon, trade.amountWei, trade.sizeUnits, trade.estimatedOutUsdc, trade.minOutUsdc, trade.minOutUnits, trade.slippageBps, trade.referenceMidPrice, trade.snapshotBlockNumber, trade.snapshotTimestamp, trade.createdAt, trade.expiresAt, trade.simulation, trade.gasEstimate]))); }
export function minimumOutForTotalSlippage(amountWei: bigint, referenceMidPrice: string, slippageBps: number): bigint {
    const numerator = amountWei * parseUnits(referenceMidPrice, 18) * BigInt(10000 - slippageBps) * 1000000n;
    const denominator = 10n ** 36n * 10000n;
    return (numerator + denominator - 1n) / denominator;
}
export class KuruClient {
    public readonly config: KuruConfig;
    public readonly monad: MonadClient;
    constructor(config: KuruConfig | string = kuruTestnetConfig, marketAddress?: string, monad?: MonadClient) { this.config = typeof config === 'string' ? { ...kuruTestnetConfig, rpcUrl: config, marketAddress: marketAddress ?? kuruTestnetConfig.marketAddress } : { ...config }; assertAddress(this.config.marketAddress); assertAddress(this.config.usdcAddress); this.monad = monad ?? new MonadClient(this.config); }
    private async read(abi: Abi, address: string, functionName: string, args: readonly unknown[] = [], block = 'latest'): Promise<unknown> { assertAddress(address); const data = encodeFunctionData({ abi, functionName, args }); const result = await this.monad.request<`0x${string}`>('eth_call', [{ to: address, data }, block]); return decodeFunctionResult({ abi, functionName, data: result }); }
    public async fetchSnapshot(): Promise<KuruMarketData> {
        const start = performance.now();
        await this.monad.verifyNetwork();
        const block = await this.monad.request<string>('eth_blockNumber');
        const [code, rawParams, rawBook, rawVault, header] = await Promise.all([
            this.monad.request<string>('eth_getCode', [this.config.marketAddress, block]), this.read(kuruOrderbookAbi, this.config.marketAddress, 'getMarketParams', [], block), this.read(kuruOrderbookAbi, this.config.marketAddress, 'getL2Book', [], block), this.read(kuruOrderbookAbi, this.config.marketAddress, 'getVaultParams', [], block), this.monad.request<{
                timestamp: string;
                number: string;
            }>('eth_getBlockByNumber', [block, false]),
        ]);
        if (!code || code === '0x')
            throw new Error('Configured Kuru market has no deployed bytecode');
        const p = rawParams as readonly [
            number,
            bigint,
            string,
            bigint,
            string,
            bigint,
            number,
            bigint,
            bigint,
            bigint,
            bigint
        ];
        const metadata: KuruMarketMetadata = { pricePrecision: String(p[0]), sizePrecision: String(p[1]), baseAssetAddress: p[2], baseAssetDecimals: Number(p[3]), quoteAssetAddress: p[4], quoteAssetDecimals: Number(p[5]), tickSize: String(p[6]), minSize: String(p[7]), maxSize: String(p[8]), takerFeeBps: String(p[9]), makerFeeBps: String(p[10]) };
        if (metadata.baseAssetAddress.toLowerCase() !== ZERO || metadata.baseAssetDecimals !== 18 || metadata.quoteAssetAddress.toLowerCase() !== this.config.usdcAddress.toLowerCase() || metadata.quoteAssetDecimals !== 6)
            throw new Error('Configured market is not the verified native MON/USDC pair');
        pow10Decimals(BigInt(metadata.pricePrecision));
        pow10Decimals(BigInt(metadata.sizePrecision));
        const manual = decodePackedBook(String(rawBook), metadata);
        const amm = reconstructAmmDepth(rawVault as readonly unknown[], metadata);
        if (manual.blockNumber !== Number(BigInt(block)))
            throw new Error('Kuru snapshot block differs from pinned RPC block');
        const bids = combineLevels(manual.bids, amm.bids, true);
        const asks = combineLevels(manual.asks, amm.asks, false);
        if (!bids.length || !asks.length || bids[0].price >= asks[0].price)
            throw new Error('Kuru orderbook lacks a valid two-sided market');
        return { pair: 'MON/USDC', bids, asks, midPrice: (bids[0].price + asks[0].price) / 2, timestamp: Number(BigInt(header.timestamp)) * 1000, blockNumber: manual.blockNumber, chainId: this.config.chainId, marketAddress: this.config.marketAddress, source: 'kuru_rpc', metadata, latencyMs: Math.round(performance.now() - start), depthIncludesAmm: amm.bids.length > 0 || amm.asks.length > 0 };
    }
    public async getWalletBalances(account: string): Promise<{
        mon: string;
        usdc: string;
    }> { assertAddress(account); await this.monad.verifyNetwork(); const [native, usdc] = await Promise.all([this.monad.request<string>('eth_getBalance', [account, 'latest']), this.read(tokenAbi, this.config.usdcAddress, 'balanceOf', [account])]); return { mon: formatAtomicUnits(BigInt(native), 18), usdc: formatAtomicUnits(usdc as bigint, 6) }; }
    private sellData(sizeUnits: bigint, minOutUnits: bigint): `0x${string}` { return encodeFunctionData({ abi: kuruOrderbookAbi, functionName: 'placeAndExecuteMarketSell', args: [sizeUnits, minOutUnits, false, true] }); }
    public async prepareMarketSell(account: string, amountMon: string, slippageBps = 50): Promise<KuruPreparedTrade> {
        assertAddress(account);
        if (!/^\d+(?:\.\d+)?$/.test(amountMon))
            throw new Error('MON amount must be a positive decimal');
        if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500)
            throw new Error('Slippage must be an integer between 0 and 500 basis points');
        const snapshot = await this.fetchSnapshot();
        if (Date.now() - snapshot.timestamp > 30000)
            throw new Error('Kuru market snapshot is stale');
        const amountWei = parseUnits(amountMon, 18);
        const sizeUnits = parseUnits(amountMon, pow10Decimals(BigInt(snapshot.metadata.sizePrecision)));
        if (amountWei <= 0n || sizeUnits < BigInt(snapshot.metadata.minSize) || sizeUnits > BigInt(snapshot.metadata.maxSize))
            throw new Error(`Kuru size must be between ${formatAtomicUnits(BigInt(snapshot.metadata.minSize), pow10Decimals(BigInt(snapshot.metadata.sizePrecision)))} and ${formatAtomicUnits(BigInt(snapshot.metadata.maxSize), pow10Decimals(BigInt(snapshot.metadata.sizePrecision)))} MON`);
        if (amountWei * BigInt(snapshot.metadata.sizePrecision) !== sizeUnits * 10n ** 18n)
            throw new Error('Amount has more decimal places than Kuru size precision');
        const baseTransaction: WalletTransaction = { from: account, to: this.config.marketAddress, value: toHex(amountWei), data: this.sellData(sizeUnits, 0n), chainId: toHex(this.config.chainId) };
        const estimate = await this.monad.request<`0x${string}`>('eth_call', [baseTransaction, 'latest']);
        const out = decodeFunctionResult({ abi: kuruOrderbookAbi, functionName: 'placeAndExecuteMarketSell', data: estimate }) as bigint;
        const referenceMidPrice = snapshot.midPrice.toFixed(18);
        const quoteMinimum = out * BigInt(10000 - slippageBps) / 10000n;
        const totalSlippageMinimum = minimumOutForTotalSlippage(amountWei, referenceMidPrice, slippageBps);
        if (out < totalSlippageMinimum)
            throw new Error('Simulated market impact exceeds total slippage cap relative to the observed mid price');
        const minOutUnits = quoteMinimum > totalSlippageMinimum ? quoteMinimum : totalSlippageMinimum;
        if (out <= 0n || minOutUnits <= 0n)
            throw new Error('Kuru simulation returned no usable quote output');
        const transaction = { ...baseTransaction, data: this.sellData(sizeUnits, minOutUnits) };
        await this.monad.request('eth_call', [transaction, 'latest']);
        const gasEstimate = BigInt(await this.monad.request<string>('eth_estimateGas', [transaction]));
        transaction.gas = toHex(gasEstimate * 120n / 100n);
        const createdAt = Date.now();
        const result: KuruPreparedTrade = { id: '', chainId: this.config.chainId, account, marketAddress: this.config.marketAddress, amountMon: formatAtomicUnits(amountWei, 18), amountWei: amountWei.toString(), sizeUnits: sizeUnits.toString(), estimatedOutUsdc: formatAtomicUnits(out, 6), minOutUsdc: formatAtomicUnits(minOutUnits, 6), minOutUnits: minOutUnits.toString(), slippageBps, referenceMidPrice, snapshotBlockNumber: snapshot.blockNumber, snapshotTimestamp: snapshot.timestamp, createdAt, expiresAt: createdAt + 30000, simulation: 'passed', gasEstimate: gasEstimate.toString(), transaction };
        result.id = preparedTradeId(result);
        return result;
    }
    public async submitPreparedTrade(prepared: KuruPreparedTrade): Promise<string> {
        if (prepared.chainId !== this.config.chainId || prepared.marketAddress.toLowerCase() !== this.config.marketAddress.toLowerCase())
            throw new Error('Trade proposal targets another configured market or chain');
        if (!Number.isFinite(prepared.createdAt) || !Number.isFinite(prepared.expiresAt) || prepared.createdAt > Date.now() + 1000 || Date.now() >= prepared.expiresAt || prepared.expiresAt !== prepared.createdAt + 30000)
            throw new Error('Trade proposal expired; prepare it again');
        if (prepared.id !== preparedTradeId(prepared))
            throw new Error('Trade proposal changed; prepare it again');
        if (!Number.isInteger(prepared.slippageBps) || prepared.slippageBps < 0 || prepared.slippageBps > 500 || prepared.simulation !== 'passed' || prepared.amountMon !== formatAtomicUnits(BigInt(prepared.amountWei), 18) || prepared.minOutUsdc !== formatAtomicUnits(BigInt(prepared.minOutUnits), 6))
            throw new Error('Trade summary differs from exact transaction amounts');
        const quotedMinimum = parseUnits(prepared.estimatedOutUsdc, 6) * BigInt(10000 - prepared.slippageBps) / 10000n;
        const referenceMinimum = minimumOutForTotalSlippage(BigInt(prepared.amountWei), prepared.referenceMidPrice, prepared.slippageBps);
        if (BigInt(prepared.minOutUnits) !== (quotedMinimum > referenceMinimum ? quotedMinimum : referenceMinimum))
            throw new Error('Trade minimum violates the total price slippage cap');
        const expectedData = this.sellData(BigInt(prepared.sizeUnits), BigInt(prepared.minOutUnits));
        const tx = prepared.transaction;
        if (tx.from.toLowerCase() !== prepared.account.toLowerCase() || tx.to.toLowerCase() !== this.config.marketAddress.toLowerCase() || BigInt(tx.value) !== BigInt(prepared.amountWei) || tx.data.toLowerCase() !== expectedData.toLowerCase() || Number(BigInt(tx.chainId)) !== this.config.chainId)
            throw new Error('Trade calldata differs from reviewed proposal');
        await this.monad.verifyWallet(prepared.account);
        const snapshot = await this.fetchSnapshot();
        if (Date.now() - snapshot.timestamp > 30000)
            throw new Error('Market data is stale');
        if (BigInt(prepared.minOutUnits) < minimumOutForTotalSlippage(BigInt(prepared.amountWei), snapshot.midPrice.toFixed(18), prepared.slippageBps))
            throw new Error('Market moved beyond the reviewed total slippage cap; prepare again');
        if (BigInt(prepared.amountWei) * BigInt(snapshot.metadata.sizePrecision) !== BigInt(prepared.sizeUnits) * 10n ** 18n || BigInt(prepared.sizeUnits) < BigInt(snapshot.metadata.minSize) || BigInt(prepared.sizeUnits) > BigInt(snapshot.metadata.maxSize) || BigInt(prepared.minOutUnits) <= 0n)
            throw new Error('Trade amount violates market precision or limits');
        // Build only the reviewed fields. A received JSON object must not add unreviewed fees or nonce fields.
        const reviewedTransaction: WalletTransaction = {
            from: prepared.account, to: this.config.marketAddress,
            value: toHex(BigInt(prepared.amountWei)), data: expectedData,
            chainId: toHex(this.config.chainId),
        };
        await this.monad.request('eth_call', [reviewedTransaction, 'latest']);
        const gasEstimate = BigInt(await this.monad.request<string>('eth_estimateGas', [reviewedTransaction]));
        const safeTransaction = { ...reviewedTransaction, gas: toHex(gasEstimate * 120n / 100n) };
        return this.monad.submitTransaction(safeTransaction);
    }
    public async waitForTradeReceipt(prepared: KuruPreparedTrade, hash: string, options: {
        timeoutMs?: number;
        pollMs?: number;
        signal?: AbortSignal;
    } = {}): Promise<{
        receipt: MonadReceipt;
        receivedUsdc: string;
    }> {
        const receipt = await this.monad.waitForReceipt(hash, options);
        if (receipt.from.toLowerCase() !== prepared.account.toLowerCase() || receipt.to?.toLowerCase() !== this.config.marketAddress.toLowerCase())
            throw new Error('Observed receipt is not the reviewed Kuru trade');
        const tx = await this.monad.request<null | {
            from: string;
            to: string;
            input: string;
            value: string;
            chainId: string;
        }>('eth_getTransactionByHash', [hash]);
        if (!tx || tx.from.toLowerCase() !== prepared.account.toLowerCase() || tx.to?.toLowerCase() !== this.config.marketAddress.toLowerCase() || tx.input.toLowerCase() !== prepared.transaction.data.toLowerCase() || BigInt(tx.value) !== BigInt(prepared.amountWei) || Number(BigInt(tx.chainId)) !== prepared.chainId)
            throw new Error('Observed transaction differs from the reviewed Kuru trade');
        let received = 0n;
        if (receipt.status === 'confirmed')
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() !== this.config.usdcAddress.toLowerCase())
                    continue;
                try {
                    const transfer = decodeEventLog({ abi: tokenAbi, eventName: 'Transfer', data: log.data as `0x${string}`, topics: log.topics as [
                            `0x${string}`,
                            ...`0x${string}`[]
                        ] });
                    if (transfer.args.to.toLowerCase() === prepared.account.toLowerCase())
                        received += transfer.args.value;
                }
                catch { /* Ignore unrelated logs; only verified token Transfer events count. */ }
            }
        if (receipt.status === 'confirmed' && received < BigInt(prepared.minOutUnits))
            throw new Error('Receipt contains less verified USDC output than the reviewed minimum');
        return { receipt, receivedUsdc: formatAtomicUnits(received, 6) };
    }
    // Older synthetic APIs deliberately fail closed. Real limit orders require funded Kuru margin.
    public async placeLimitOrder(_side: 'buy' | 'sell', _price: number, _size: number): Promise<KuruOrderResult> { throw new Error('Limit-order submission requires a funded Kuru margin account; use the reviewed native MON sell path'); }
    public async cancelOrder(_orderId: string): Promise<KuruOrderResult> { throw new Error('Cancellation requires verified wallet-owned Kuru order IDs'); }
    public async batchCancelOrders(_orderIds: string[]): Promise<KuruOrderResult & {
        cancelledCount: number;
    }> { throw new Error('Cancellation requires verified wallet-owned Kuru order IDs'); }
}
