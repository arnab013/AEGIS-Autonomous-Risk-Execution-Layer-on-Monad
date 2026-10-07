// src/engine/marketMath.ts - Pure deterministic analytics for high-frequency market data

import { OrderBookLevel } from '../types/index.ts';

/**
 * Computes the mid price from top of book (best bid, best ask).
 */
export function calculateMidPrice(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (!bids.length || !asks.length) return 0;
  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  return (bestBid + bestAsk) / 2;
}

/**
 * Computes the bid-ask spread in basis points (1 bps = 0.01% = 0.0001).
 */
export function calculateSpreadBps(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (!bids.length || !asks.length) return 0;
  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const mid = (bestBid + bestAsk) / 2;
  if (mid <= 0) return 0;
  const spread = bestAsk - bestBid;
  return (spread / mid) * 10_000;
}

/**
 * Computes the orderbook depth (total size in USD) within a specified distance in basis points from mid price.
 */
export function calculateDepthWithinBps(
  levels: OrderBookLevel[],
  midPrice: number,
  distanceBps: number,
  side: 'bid' | 'ask'
): number {
  if (!levels.length || midPrice <= 0) return 0;
  const thresholdFactor = distanceBps / 10_000;
  const boundaryPrice = side === 'bid'
    ? midPrice * (1 - thresholdFactor)
    : midPrice * (1 + thresholdFactor);

  let cumulativeDepthUsd = 0;
  for (const level of levels) {
    if (side === 'bid' && level.price >= boundaryPrice) {
      cumulativeDepthUsd += level.price * level.size;
    } else if (side === 'ask' && level.price <= boundaryPrice) {
      cumulativeDepthUsd += level.price * level.size;
    }
  }
  return cumulativeDepthUsd;
}

/**
 * Computes Order Book Imbalance (OBI) in range [-1.0, +1.0].
 * +1.0 = purely buy/bid depth
 * -1.0 = purely sell/ask depth
 * 0.0 = perfectly balanced
 */
export function calculateOrderBookImbalance(bidDepthUsd: number, askDepthUsd: number): number {
  const total = bidDepthUsd + askDepthUsd;
  if (total <= 0) return 0;
  return (bidDepthUsd - askDepthUsd) / total;
}

/**
 * Computes logarithmic return between two prices.
 */
export function calculateLogReturn(p0: number, p1: number): number {
  if (p0 <= 0 || p1 <= 0) return 0;
  return Math.log(p1 / p0);
}

/**
 * Computes annualised / scaled volatility from a series of price returns.
 */
export function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const n = returns.length;
  const mean = returns.reduce((acc, r) => acc + r, 0) / n;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Computes current drawdown as a percentage of the high-water mark equity.
 */
export function calculateDrawdown(peakEquity: number, currentEquity: number): number {
  if (peakEquity <= 0) return 0;
  if (currentEquity >= peakEquity) return 0;
  return ((peakEquity - currentEquity) / peakEquity) * 100;
}

/**
 * Computes current portfolio leverage.
 */
export function calculateLeverage(totalExposureUsd: number, equityUsd: number): number {
  if (equityUsd <= 0) return 999; // Insufficient collateral
  return Math.abs(totalExposureUsd) / equityUsd;
}

/**
 * Computes a composite liquidity stress score from 0 to 100.
 * Factors: wide spread, heavy imbalance, low top-of-book depth.
 */
export function calculateLiquidityStressScore(
  spreadBps: number,
  absImbalance: number,
  bidDepthUsd: number,
  askDepthUsd: number
): number {
  // Typical healthy spread on Monad Kuru: < 10 bps
  const spreadStress = Math.min(100, (spreadBps / 25) * 50);
  const imbalanceStress = absImbalance * 30; // up to 30 points
  const minDepth = Math.min(bidDepthUsd, askDepthUsd);
  const depthStress = minDepth < 5_000 ? 20 : (minDepth < 20_000 ? 10 : 0);

  return Math.min(100, Math.round(spreadStress + imbalanceStress + depthStress));
}
