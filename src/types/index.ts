// src/types/index.ts - Core types for Aegis Jev Probabilistic Risk & Policy Engine

export type TradingAction =
  | 'increase_position'
  | 'reduce_position'
  | 'hold'
  | 'hedge'
  | 'cancel_orders';

export type MarketRegime =
  | 'trending_up'
  | 'trending_down'
  | 'range_bound'
  | 'high_volatility'
  | 'liquidity_stress'
  | 'uncertain';

export type RiskLevel =
  | 'very_low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface MarketState {
  pair: string;
  mid_price: number;
  spread_bps: number;
  return_10s: number;
  return_1m: number;
  volatility_1m: number;
  volatility_5m: number;
  bid_depth_25bps: number;
  ask_depth_25bps: number;
  orderbook_imbalance: number; // -1.0 (all ask) to +1.0 (all bid)
  aggressive_buy_flow: number;
  aggressive_sell_flow: number;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface PositionState {
  spot_exposure_usd: number;
  perp_exposure_usd: number;
  net_delta: number;
  leverage: number;
  unrealized_pnl: number;
  realized_pnl_today: number;
  drawdown_today: number;
  spot_balance_mon: number;
  usdc_balance: number;
  perp_short_size_mon: number;
}

export interface Order {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  age_seconds: number;
  distance_from_mid_bps: number;
  venue: 'kuru' | 'perpl';
  status: 'open' | 'filled' | 'cancelled';
}

export interface OrdersState {
  open_orders: Order[];
  oldest_order_age: number;
  distance_from_mid: number;
  filled_recently: number;
}

export interface RiskMetrics {
  position_utilization: number;
  leverage_utilization: number;
  daily_loss_utilization: number;
  volatility_percentile: number;
  liquidity_stress_score: number;
}

export interface UserPolicy {
  max_position_usd: number;
  max_leverage: number;
  max_daily_loss: number;
  max_order_size: number;
  max_slippage_bps: number;
  max_open_orders: number;
  stale_order_timeout_seconds: number;
  min_liquidity_depth_usd: number;
  cooldown_seconds: number;
  allowed_assets: string[];
  allowed_venues: string[];
  permitted_actions: TradingAction[];
  is_paused: boolean;
}

/**
 * Compact Structured Schema sent to Jev (Section 7)
 */
export interface JevStatePayload {
  market: {
    pair: string;
    mid_price: number;
    spread_bps: number;
    return_10s: number;
    return_1m: number;
    volatility_1m: number;
    volatility_5m: number;
    bid_depth_25bps: number;
    ask_depth_25bps: number;
    orderbook_imbalance: number;
    aggressive_buy_flow: number;
    aggressive_sell_flow: number;
  };
  position: {
    spot_exposure_usd: number;
    perp_exposure_usd: number;
    net_delta: number;
    leverage: number;
    unrealized_pnl: number;
    realized_pnl_today: number;
    drawdown_today: number;
  };
  orders: {
    open_orders_count: number;
    oldest_order_age: number;
    distance_from_mid: number;
    filled_recently: number;
  };
  risk: {
    position_utilization: number;
    leverage_utilization: number;
    daily_loss_utilization: number;
    volatility_percentile: number;
    liquidity_stress_score: number;
  };
  policy: {
    max_position_usd: number;
    max_leverage: number;
    max_daily_loss: number;
    allowed_actions: TradingAction[];
    max_order_size?: number;
    max_slippage_bps?: number;
    allowed_assets?: string[];
    allowed_venues?: string[];
    is_paused?: boolean;
    stale_order_timeout_seconds?: number;
  };
}

export interface JevDecisionState {
  action_probabilities: Record<TradingAction, number>;
  regime_probabilities: Record<MarketRegime, number>;
  risk_probabilities: Record<RiskLevel, number>;
  p_anomaly: number;
  p_cancel_orders: number;
  selected_action: TradingAction;
  max_probability: number;
  entropy: number;
  top_two_margin: number;
  confidence_score: number;
  abstain_flag: boolean;
  latency_ms: number;
  source: 'typesafe_jev' | 'cached' | 'fallback' | 'simulated';
  /** Origin survives a cache hit, so a heuristic never looks like a live model. */
  origin?: 'typesafe_jev' | 'fallback' | 'simulated';
  model?: string;
  model_confidence?: number;
  error?: string;
  schema_version?: string;
}

export interface HardCheckItem {
  passed: boolean;
  message: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  violations: string[];
  checks: Record<string, HardCheckItem>;
  sanitized_action: TradingAction;
}

export interface StructuredDecisionFactors {
  volatility_percentile: number;
  sell_imbalance: number;
  spot_exposure_utilization: number;
  p_selected_action: number;
  p_high_or_critical_risk: number;
  policy_permitted: boolean;
  position_limit_satisfied: boolean;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  market_state_hash: string;
  jev_model: string;
  action_probabilities: Record<TradingAction, number>;
  risk_probabilities: Record<RiskLevel, number>;
  regime_probabilities: Record<MarketRegime, number>;
  selected_action: TradingAction;
  confidence: number;
  hard_checks: Record<string, boolean>;
  execution_allowed: boolean;
  transaction_hash?: string;
  venue?: 'kuru' | 'perpl' | 'policy_guard';
  execution_mode?: 'paper' | 'observe' | 'wallet';
  decision_source?: string;
  transaction_status?: 'submitted' | 'confirmed' | 'reverted';
  chain_id?: number;
  user_initiated?: boolean;
  reason: string;
  factors: StructuredDecisionFactors;
}

export interface ScenarioTick {
  timestamp_offset_ms: number;
  price: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  aggressive_buy_flow: number;
  aggressive_sell_flow: number;
  description: string;
}

export interface ReplayScenario {
  id: string;
  title: string;
  narrative: string;
  target_behavior: string;
  initial_position: PositionState;
  initial_orders: Order[];
  ticks: ScenarioTick[];
}
