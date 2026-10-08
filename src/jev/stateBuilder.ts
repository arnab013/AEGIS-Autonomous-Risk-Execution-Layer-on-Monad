import type {
  MarketState,
  PositionState,
  OrdersState,
  UserPolicy,
  RiskMetrics,
  JevStatePayload,
} from '../types/index.ts';
import { keccak256, stringToHex } from 'viem';

/**
 * Builds the compact structured state sent to Jev.
 * Caps decimal precision to prevent excessive token consumption and focus on salient signals.
 */
export function buildJevStatePayload(
  market: MarketState,
  position: PositionState,
  orders: OrdersState,
  risk: RiskMetrics,
  policy: UserPolicy
): JevStatePayload {
  const m = market || ({} as MarketState);
  const p = position || ({} as PositionState);
  const o = orders || ({} as OrdersState);
  const r = risk || ({} as RiskMetrics);
  const pol = policy || ({} as UserPolicy);

  return {
    market: {
      pair: m.pair || 'MON/USDC',
      mid_price: Number((m.mid_price ?? 0).toFixed(4)),
      spread_bps: Number((m.spread_bps ?? 0).toFixed(2)),
      return_10s: Number((m.return_10s ?? 0).toFixed(4)),
      return_1m: Number((m.return_1m ?? 0).toFixed(4)),
      volatility_1m: Number((m.volatility_1m ?? 0).toFixed(4)),
      volatility_5m: Number((m.volatility_5m ?? 0).toFixed(4)),
      bid_depth_25bps: Math.round(m.bid_depth_25bps ?? 0),
      ask_depth_25bps: Math.round(m.ask_depth_25bps ?? 0),
      orderbook_imbalance: Number((m.orderbook_imbalance ?? 0).toFixed(3)),
      aggressive_buy_flow: Math.round(m.aggressive_buy_flow ?? 0),
      aggressive_sell_flow: Math.round(m.aggressive_sell_flow ?? 0),
    },
    position: {
      spot_exposure_usd: Math.round(p.spot_exposure_usd ?? 0),
      perp_exposure_usd: Math.round(p.perp_exposure_usd ?? 0),
      net_delta: Math.round(p.net_delta ?? 0),
      leverage: Number((p.leverage ?? 1).toFixed(2)),
      unrealized_pnl: Number((p.unrealized_pnl ?? 0).toFixed(2)),
      realized_pnl_today: Number((p.realized_pnl_today ?? 0).toFixed(2)),
      drawdown_today: Number((p.drawdown_today ?? 0).toFixed(2)),
    },
    orders: {
      open_orders_count: (o.open_orders || []).length,
      oldest_order_age: Math.round(o.oldest_order_age ?? 0),
      distance_from_mid: Number((o.distance_from_mid ?? 0).toFixed(2)),
      filled_recently: o.filled_recently ?? 0,
    },
    risk: {
      position_utilization: Number((r.position_utilization ?? 0).toFixed(3)),
      leverage_utilization: Number((r.leverage_utilization ?? 0).toFixed(3)),
      daily_loss_utilization: Number((r.daily_loss_utilization ?? 0).toFixed(3)),
      volatility_percentile: Math.round(r.volatility_percentile ?? 0),
      liquidity_stress_score: Math.round(r.liquidity_stress_score ?? 0),
    },
    policy: {
      max_position_usd: pol.max_position_usd ?? 2000,
      max_leverage: pol.max_leverage ?? 2.0,
      max_daily_loss: pol.max_daily_loss ?? 400,
      allowed_actions: pol.permitted_actions || ['hold'],
      max_order_size: pol.max_order_size,
      max_slippage_bps: pol.max_slippage_bps,
      allowed_assets: pol.allowed_assets,
      allowed_venues: pol.allowed_venues,
      is_paused: pol.is_paused,
      stale_order_timeout_seconds: pol.stale_order_timeout_seconds,
    },
  };
}

/**
 * Computes a deterministic hash of the state for caching and audit trail.
 */
export function hashStatePayload(payload: JevStatePayload): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, val]) => [key, canonicalize(val)])
      );
    return value;
  };
  return 'st_' + keccak256(stringToHex(JSON.stringify(canonicalize(payload)))).slice(2);
}
