import React from 'react';
import { Wallet, ShieldCheck, ArrowUpRight, ArrowDownRight, Clock } from './icons.tsx';
import { PositionState, OrdersState, UserPolicy, RiskMetrics } from '../types/index.ts';

interface PortfolioPanelProps {
  position: PositionState;
  orders: OrdersState;
  policy: UserPolicy;
  risk: RiskMetrics;
  live?: boolean;
  hasWallet?: boolean;
}

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({
  position,
  orders,
  policy,
  risk,
  live = false,
  hasWallet = false,
}) => {
  const isNetBullish = position.net_delta > 0;
  const isPnlPositive = position.realized_pnl_today + position.unrealized_pnl >= 0;

  return (
    <div className="terminal-card flex flex-col h-full overflow-hidden">
      <div className="terminal-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-xs font-bold text-white tracking-wider">
            PORTFOLIO & RISK ALLOCATION
          </span>
        </div>
        <span className="text-[11px] font-mono text-emerald-400">
          {live ? (hasWallet ? 'WALLET BALANCES' : 'WALLET DISCONNECTED') : 'PAPER PORTFOLIO'}
        </span>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        <div className="bg-[#10131b] p-3 rounded border border-[#1a1f2c] space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] uppercase font-mono text-[#64748b]">
              Net Portfolio Delta
            </span>
            <span
              className={`text-lg font-bold font-mono flex items-center gap-1 ${isNetBullish ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {isNetBullish ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              {live && !hasWallet ? '—' : `$${position.net_delta.toFixed(2)}`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1a1f2c] text-xs font-mono">
            <div>
              <span className="text-[10px] text-[#64748b] block">Spot Exposure (Kuru)</span>
              <span className="font-semibold text-white">
                {live && !hasWallet
                  ? 'Connect wallet'
                  : `$${position.spot_exposure_usd.toFixed(2)}`}
              </span>
              <span className="text-[10px] text-[#64748b] block">
                {live && !hasWallet
                  ? 'MON and USDC holdings'
                  : `(${position.spot_balance_mon.toFixed(1)} MON)`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#64748b] block">
                {live ? 'Perps not indexed' : 'Paper short hedge'}
              </span>
              <span
                className={`font-semibold ${position.perp_exposure_usd < 0 ? 'text-rose-400' : 'text-[#64748b]'}`}
              >
                {live ? '—' : `$${position.perp_exposure_usd.toFixed(2)}`}
              </span>
              <span className="text-[10px] text-[#64748b] block">
                {live ? 'Unavailable' : `(${position.perp_short_size_mon.toFixed(1)} Short)`}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-[#10131b] p-3 rounded border border-[#1a1f2c] space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-[#64748b] text-[11px]">Position Utilization</span>
            <span className="font-semibold text-white">
              {(risk.position_utilization * 100).toFixed(1)}% / Max ${policy.max_position_usd}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#1b212f] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                risk.position_utilization > 0.85
                  ? 'bg-rose-500'
                  : risk.position_utilization > 0.65
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, risk.position_utilization * 100)}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-xs font-mono pt-1">
            <span className="text-[#64748b] text-[11px]">Leverage Utilization</span>
            <span className="font-semibold text-white">
              {position.leverage.toFixed(2)}x / Max {policy.max_leverage.toFixed(1)}x
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#1b212f] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7b3fe4] rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (position.leverage / policy.max_leverage) * 100)}%`,
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 bg-[#10131b] p-2.5 rounded border border-[#1a1f2c] text-xs font-mono">
          <div>
            <span className="text-[10px] text-[#64748b] uppercase block">
              {live ? 'Historical PnL unavailable' : 'Paper PnL'}
            </span>
            <span
              className={`font-bold text-sm ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {live
                ? '—'
                : `${isPnlPositive ? '+' : ''}$${(position.realized_pnl_today + position.unrealized_pnl).toFixed(2)}`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#64748b] uppercase block">
              Daily Loss Utilization
            </span>
            <span className="font-semibold text-white">
              {live
                ? `Unknown / $${policy.max_daily_loss}`
                : `${(risk.daily_loss_utilization * 100).toFixed(1)}% / $${policy.max_daily_loss}`}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] uppercase font-mono text-[#64748b] px-1">
            <span>Active Kuru Orders ({orders.open_orders.length})</span>
            <span>Timeout: {policy.stale_order_timeout_seconds}s</span>
          </div>

          {orders.open_orders.length === 0 ? (
            <div className="p-3 text-center text-xs font-mono text-[#64748b] bg-[#10131b] rounded border border-dashed border-[#1a1f2c]">
              {live ? 'Resting orders are not indexed in this MVP' : 'No paper resting orders'}
            </div>
          ) : (
            <div className="space-y-1">
              {orders.open_orders.map((ord) => (
                <div
                  key={ord.id}
                  className="flex justify-between items-center px-2 py-1.5 bg-[#10131b] rounded border border-[#1a1f2c] text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                        ord.side === 'buy'
                          ? 'bg-emerald-950 text-emerald-400'
                          : 'bg-rose-950 text-rose-400'
                      }`}
                    >
                      {ord.side}
                    </span>
                    <span className="text-white">${ord.price.toFixed(4)}</span>
                    <span className="text-[#64748b]">({ord.size} MON)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-amber-400">
                    <Clock className="w-3 h-3" />
                    <span>{ord.age_seconds}s ago</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
