import React from 'react';
import { Layers } from './icons.tsx';
import type { MarketState } from '../types/index.ts';

interface MarketPanelProps {
  market: MarketState;
  live?: boolean;
  history?: { time: number; price: number }[];
}

export const MarketPanel: React.FC<MarketPanelProps> = ({
  market,
  live = false,
  history = [{ time: market.timestamp, price: market.mid_price }],
}) => {
  const prices = history.map((point) => point.price);
  const low = prices.length ? Math.min(...prices) : market.mid_price;
  const high = prices.length ? Math.max(...prices) : market.mid_price;
  const range = Math.max(high - low, market.mid_price * 0.0001);
  const line = prices
    .map(
      (price, index) =>
        12 +
        (index * 296) / Math.max(prices.length - 1, 1) +
        ',' +
        (84 - ((price - low) / range) * 64)
    )
    .join(' ');
  const isPositiveImbalance = market.orderbook_imbalance >= 0;
  const imbalancePct = Math.min(100, Math.abs(market.orderbook_imbalance) * 100);

  return (
    <section className="market-card terminal-card" aria-labelledby="market-title">
      <header className="panel-heading">
        <div>
          <span className="assessment-eyebrow">
            <Layers aria-hidden="true" /> Kuru · MON / USDC
          </span>
          <h2 id="market-title" className="panel-title">
            Market
          </h2>
        </div>
        <span className="panel-status">{live ? 'ONCHAIN SNAPSHOT' : 'REPLAY BOOK'}</span>
      </header>
      <div className="market-body">
        <div className="market-price">
          <span>Midpoint</span>
          <strong>{market.mid_price.toFixed(live ? 6 : 4)}</strong>
          <span>USDC / MON</span>
        </div>
        <dl className="market-metrics">
          <div>
            <dt>Spread</dt>
            <dd>{market.spread_bps.toFixed(2)} bps</dd>
          </div>
          <div>
            <dt>Book imbalance</dt>
            <dd>
              {imbalancePct.toFixed(1)}% {isPositiveImbalance ? 'toward bids' : 'toward asks'}
            </dd>
          </div>
          <div>
            <dt>Bid depth within 25 bps</dt>
            <dd>{market.bid_depth_25bps.toLocaleString()} USD</dd>
          </div>
          <div>
            <dt>Ask depth within 25 bps</dt>
            <dd>{market.ask_depth_25bps.toLocaleString()} USD</dd>
          </div>
        </dl>
        <figure className="market-chart">
          <figcaption>
            <span>{live ? 'Observed session midpoint' : 'Replay midpoint'}</span>
            <span>
              {history.length} {history.length === 1 ? 'sample' : 'samples'}
            </span>
          </figcaption>
          <svg
            viewBox="0 0 320 100"
            role="img"
            aria-label={live ? 'Observed session mid price history' : 'Replay mid price history'}
          >
            <path className="market-chart-grid" d="M12 25H308M12 55H308M12 85H308" fill="none" />
            <polyline className="market-chart-line" points={line} fill="none" />
            {prices.length === 1 && <circle className="market-chart-point" cx="12" cy="84" r="3" />}
          </svg>
          <div className="market-chart-range">
            <span>Low {low.toFixed(6)}</span>
            <span>High {high.toFixed(6)} USDC</span>
          </div>
          <p className="panel-subtitle">
            {live
              ? 'Samples collected while this session is open.'
              : 'Synthetic prices supplied by the selected replay scenario.'}
          </p>
        </figure>
        <details className="market-book">
          <summary>
            Inspect top of book · {market.bids.length} bids / {market.asks.length} asks
          </summary>
          <div className="market-book-columns" aria-label="Order book">
            <section>
              <h3 className="market-book-side">Asks</h3>
              <div className="market-book-row market-book-labels">
                <span>Price · USDC</span>
                <span>Size · MON</span>
              </div>
              {market.asks
                .slice(0, 3)
                .reverse()
                .map((ask, index) => (
                  <div className="market-book-row is-ask" key={'ask-' + index}>
                    <span>{ask.price.toFixed(live ? 6 : 4)}</span>
                    <span>{ask.size.toLocaleString()}</span>
                  </div>
                ))}
              {!market.asks.length && <p>No asks in this snapshot.</p>}
            </section>
            <section>
              <h3 className="market-book-side">Bids</h3>
              <div className="market-book-row market-book-labels">
                <span>Price · USDC</span>
                <span>Size · MON</span>
              </div>
              {market.bids.slice(0, 3).map((bid, index) => (
                <div className="market-book-row is-bid" key={'bid-' + index}>
                  <span>{bid.price.toFixed(live ? 6 : 4)}</span>
                  <span>{bid.size.toLocaleString()}</span>
                </div>
              ))}
              {!market.bids.length && <p>No bids in this snapshot.</p>}
            </section>
          </div>
        </details>
        <dl className="market-metrics">
          <div>
            <dt>{live ? 'Sampled volatility (1m)' : 'Replay volatility (1m)'}</dt>
            <dd>
              {live && history.length < 2
                ? 'Insufficient samples'
                : (market.volatility_1m * 100).toFixed(2) + '%'}
            </dd>
          </div>
          <div>
            <dt>{live ? 'Aggressive trade flow' : 'Simulated trade flow'}</dt>
            <dd>
              {live
                ? 'Unavailable · not indexed'
                : market.aggressive_buy_flow + ' buy / ' + market.aggressive_sell_flow + ' sell'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
};
