import React from 'react';
import { Wallet, Clock } from './icons.tsx';
import type { PositionState, OrdersState, UserPolicy, RiskMetrics } from '../types/index.ts';

interface PortfolioPanelProps {
  position: PositionState;
  orders: OrdersState;
  policy: UserPolicy;
  risk: RiskMetrics;
  live?: boolean;
  hasWallet?: boolean;
}

function LimitMeter({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  const visualRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : ratio === Infinity ? 1 : 0;
  return (
    <div className="limit-meter">
      <div className="limit-meter-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="limit-meter-track" aria-hidden="true">
        <span
          className={
            'limit-meter-fill' +
            (visualRatio > 0.85 ? ' is-blocked' : visualRatio > 0.65 ? ' is-warning' : '')
          }
          style={{ width: Math.min(100, visualRatio * 100) + '%' }}
        />
      </div>
    </div>
  );
}

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({
  position,
  orders,
  policy,
  risk,
  live = false,
  hasWallet = false,
}) => {
  const pnl = position.realized_pnl_today + position.unrealized_pnl;
  const disconnected = live && !hasWallet;

  return (
    <section className="portfolio-card terminal-card" aria-labelledby="portfolio-title">
      <header className="panel-heading">
        <div>
          <span className="assessment-eyebrow">
            <Wallet aria-hidden="true" /> {live ? 'Wallet readings' : 'Replay ledger'}
          </span>
          <h2 id="portfolio-title" className="panel-title">
            {live ? 'Wallet & risk' : 'Paper portfolio'}
          </h2>
        </div>
        <span className="panel-status">
          {live ? (hasWallet ? 'WALLET BALANCES' : 'WALLET DISCONNECTED') : 'PAPER PORTFOLIO'}
        </span>
      </header>
      <div className="portfolio-body">
        {disconnected ? (
          <div className="portfolio-empty">
            <h3>Connect a wallet to inspect balances</h3>
            <p>
              Wallet exposure and utilization are unavailable until MON and USDC balances are read.
            </p>
          </div>
        ) : (
          <>
            <dl className="portfolio-metrics portfolio-balances">
              <div>
                <dt>{live ? 'Wallet MON exposure' : 'Paper net delta'}</dt>
                <dd>{(live ? position.spot_exposure_usd : position.net_delta).toFixed(2)} USD</dd>
              </div>
              <div>
                <dt>MON balance</dt>
                <dd>
                  {position.spot_balance_mon.toLocaleString(undefined, {
                    maximumFractionDigits: 18,
                  })}{' '}
                  MON
                </dd>
              </div>
              <div>
                <dt>USDC balance</dt>
                <dd>
                  {position.usdc_balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                  USDC
                </dd>
              </div>
              {!live && (
                <div>
                  <dt>Paper short hedge</dt>
                  <dd>
                    {position.perp_short_size_mon.toLocaleString()} MON ·{' '}
                    {position.perp_exposure_usd.toFixed(2)} USD
                  </dd>
                </div>
              )}
            </dl>
            <div className="portfolio-limits">
              <LimitMeter
                label={live ? 'Wallet spot position limit' : 'Position limit'}
                value={
                  (risk.position_utilization * 100).toFixed(1) +
                  '% of ' +
                  policy.max_position_usd +
                  ' USD'
                }
                ratio={risk.position_utilization}
              />
              <LimitMeter
                label={live ? 'Wallet exposure / collateral' : 'Leverage limit'}
                value={
                  position.leverage.toFixed(2) + 'x of ' + policy.max_leverage.toFixed(1) + 'x'
                }
                ratio={position.leverage / policy.max_leverage}
              />
            </div>
          </>
        )}
        {live && (
          <p className="panel-subtitle">
            These readings cover this wallet's MON and USDC. External exposure and leveraged
            positions are not indexed.
          </p>
        )}
        <dl className="portfolio-metrics">
          <div>
            <dt>{live ? 'Historical PnL' : 'Paper PnL'}</dt>
            <dd className={!live ? (pnl >= 0 ? 'is-positive' : 'is-negative') : ''}>
              {live ? 'Unavailable' : (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + ' USD'}
            </dd>
          </div>
          <div>
            <dt>Daily loss utilization</dt>
            <dd>
              {live
                ? 'Unavailable · limit ' + policy.max_daily_loss + ' USD'
                : (risk.daily_loss_utilization * 100).toFixed(1) +
                  '% of ' +
                  policy.max_daily_loss +
                  ' USD'}
            </dd>
          </div>
          {live && (
            <div>
              <dt>Perpetual positions</dt>
              <dd>Unavailable · not indexed</dd>
            </div>
          )}
        </dl>
        <details className="portfolio-orders">
          <summary>
            {live
              ? 'Resting orders · unavailable'
              : 'Paper resting orders · ' + orders.open_orders.length}
          </summary>
          {live ? (
            <p>
              Resting orders are not indexed in this MVP. An empty local list does not show that no
              orders exist on chain.
            </p>
          ) : (
            <>
              <p className="panel-subtitle">
                Stale-order timeout: {policy.stale_order_timeout_seconds} seconds
              </p>
              {!orders.open_orders.length ? (
                <p>No paper resting orders.</p>
              ) : (
                <ul>
                  {orders.open_orders.map((order) => (
                    <li className="portfolio-order" key={order.id}>
                      <strong className={order.side === 'buy' ? 'is-positive' : 'is-negative'}>
                        {order.side === 'buy' ? 'Buy' : 'Sell'}
                      </strong>
                      <span>
                        {order.size} MON at {order.price.toFixed(4)} USDC
                      </span>
                      <span>
                        <Clock aria-hidden="true" /> {order.age_seconds} seconds old
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </details>
      </div>
    </section>
  );
};
