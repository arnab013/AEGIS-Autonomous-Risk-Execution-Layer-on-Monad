// src/components/MarketPanel.tsx - Live Orderbook & Market State Engine Display

import React, { useEffect, useState } from 'react';
import { Layers } from './icons.tsx';
import { MarketState } from '../types/index.ts';

interface MarketPanelProps {
  market: MarketState;
  live?: boolean;
}

export const MarketPanel: React.FC<MarketPanelProps> = ({ market, live = false }) => {
  const [history, setHistory] = useState<{ time: number; price: number }[]>([]);
  useEffect(() => {
    setHistory(previous => previous.some(point => point.time === market.timestamp) ? previous : [...previous, { time: market.timestamp, price: market.mid_price }].slice(-60));
  }, [market.timestamp, market.mid_price]);
  const prices = history.map(point => point.price);
  const low = Math.min(...prices), high = Math.max(...prices);
  const range = Math.max(high - low, market.mid_price * 0.0001);
  const line = prices.map((price, index) => `${12 + index * 296 / Math.max(prices.length - 1, 1)},${84 - (price - low) / range * 64}`).join(' ');
  const isPositiveImbalance = market.orderbook_imbalance >= 0;
  const imbalancePct = Math.min(100, Math.abs(market.orderbook_imbalance) * 100);

  return (
    <div className="terminal-card flex flex-col h-full overflow-hidden">
      <div className="terminal-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#7b3fe4]" />
          <span className="font-mono text-xs font-bold text-white tracking-wider">KURU ORDERBOOK // MON-USDC</span>
        </div>
        <span className="text-[11px] font-mono text-[#64748b]">{live ? 'ONCHAIN SNAPSHOT' : 'SYNTHETIC BOOK'}</span>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        <div className="price-chart"><div><span>{live ? 'Observed mid price' : 'Replay mid price'}</span><span>{history.length} samples</span></div><svg viewBox="0 0 320 100" role="img" aria-label="Mid price history"><path d="M12 25H308M12 55H308M12 85H308" stroke="#232938" strokeWidth="1" /><polyline points={line} fill="none" stroke="#a77df8" strokeWidth="2" />{prices.length === 1 && <circle cx="12" cy="84" r="3" fill="#a77df8" />}</svg><div><span>{low ? low.toFixed(6) : 'Waiting'}</span><span>{high ? high.toFixed(6) : 'Waiting'}</span></div></div>
        {/* Price & Spread Bar */}
        <div className="grid grid-cols-2 gap-2 bg-[#10131b] p-2.5 rounded border border-[#1a1f2c]">
          <div>
            <div className="text-[10px] uppercase font-mono text-[#64748b]">Mid Price</div>
            <div className="text-xl font-bold font-mono text-white flex items-baseline gap-1">
              ${market.mid_price.toFixed(live ? 6 : 4)}
              <span className="text-[11px] font-normal text-[#94a3b8]">USDC</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-mono text-[#64748b]">Spread (25 bps depth)</div>
            <div className="text-sm font-bold font-mono text-amber-400 mt-1">
              {market.spread_bps.toFixed(2)} bps
            </div>
          </div>
        </div>

        {/* Orderbook Imbalance Gauge */}
        <div className="bg-[#10131b] p-2.5 rounded border border-[#1a1f2c] space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[#64748b] text-[11px]">Orderbook Imbalance (OBI)</span>
            <span className={isPositiveImbalance ? 'text-emerald-400' : 'text-rose-400'}>
              {isPositiveImbalance ? `+${imbalancePct.toFixed(1)}% (Bids)` : `-${imbalancePct.toFixed(1)}% (Asks)`}
            </span>
          </div>
          <div className="w-full h-2 bg-[#1b212f] rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(5, (market.orderbook_imbalance + 1) * 50)}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${Math.max(5, 100 - (market.orderbook_imbalance + 1) * 50)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-[#475569]">
            <span>Bid Depth: ${market.bid_depth_25bps.toLocaleString()}</span>
            <span>Ask Depth: ${market.ask_depth_25bps.toLocaleString()}</span>
          </div>
        </div>

        {/* Depth Ladder Visualizer */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase font-mono text-[#64748b] px-1 flex justify-between">
            <span>Price (USDC)</span>
            <span>Size (MON)</span>
          </div>

          {/* Asks (Sell Orders) */}
          <div className="space-y-0.5">
            {market.asks.slice(0, 3).reverse().map((ask, idx) => (
              <div
                key={`ask-${idx}`}
                className="flex justify-between items-center px-2 py-1 text-xs font-mono rounded bg-rose-950/20 text-rose-400 relative overflow-hidden"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none"
                  style={{ width: `${Math.min(100, (ask.size / 6000) * 100)}%` }}
                />
                <span className="font-semibold relative z-10">{ask.price.toFixed(live ? 6 : 4)}</span>
                <span className="relative z-10 text-white/90">{ask.size.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Spread Divider */}
          <div className="py-1 text-center font-mono text-[10px] text-[#64748b] bg-[#121622] rounded border border-dashed border-[#1f2638]">
            SPREAD: {market.spread_bps.toFixed(2)} BPS
          </div>

          {/* Bids (Buy Orders) */}
          <div className="space-y-0.5">
            {market.bids.slice(0, 3).map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="flex justify-between items-center px-2 py-1 text-xs font-mono rounded bg-emerald-950/20 text-emerald-400 relative overflow-hidden"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none"
                  style={{ width: `${Math.min(100, (bid.size / 6000) * 100)}%` }}
                />
                <span className="font-semibold relative z-10">{bid.price.toFixed(live ? 6 : 4)}</span>
                <span className="relative z-10 text-white/90">{bid.size.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Volatility & Flow Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#10131b] p-2.5 rounded border border-[#1a1f2c]">
          <div>
            <span className="text-[10px] text-[#64748b] uppercase block">Volatility (1m)</span>
            <span className="font-bold text-white">{(market.volatility_1m * 100).toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748b] uppercase block">{live ? 'Trade flow not indexed' : 'Simulated Flow'}</span>
            <div className="flex gap-1 text-[11px]">
              <span className="text-emerald-400">+{market.aggressive_buy_flow}</span>
              <span className="text-[#64748b]">/</span>
              <span className="text-rose-400">-{market.aggressive_sell_flow}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
