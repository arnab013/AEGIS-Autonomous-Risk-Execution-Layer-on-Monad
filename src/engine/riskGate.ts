import type {
  TradingAction,
  UserPolicy,
  PositionState,
  MarketState,
  OrdersState,
  RiskCheckResult,
  HardCheckItem,
} from '../types/index.ts';
import { quoteMarketFill, quoteBaseSellFill } from './marketMath.ts';

/** Code owns authorization. Model scores can never relax any of these checks. */
export class HardRiskGate {
  private lastTradeTimestamp: number | undefined;
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  public evaluateAction(
    proposedAction: TradingAction,
    policy: UserPolicy,
    position: PositionState,
    market: MarketState,
    orders: OrdersState,
    orderSizeUsd = 250,
    sellSizeMon?: number
  ): RiskCheckResult {
    const checks: Record<string, HardCheckItem> = {};
    const violations: string[] = [];
    const trades = ['increase_position', 'reduce_position', 'hedge'].includes(proposedAction);
    const newRisk = proposedAction === 'increase_position' || proposedAction === 'hedge';
    const check = (key: string, passed: boolean, message: string, applies = true) => {
      checks[key] = { passed, message, applies };
      if (applies && !passed) violations.push(message);
    };
    const positive = (v: number) => Number.isFinite(v) && v > 0;
    const nonnegative = (v: number) => Number.isFinite(v) && v >= 0;
    const quantityProvided = sellSizeMon !== undefined;
    const quantityNotional = typeof sellSizeMon === 'number' ? sellSizeMon * market.mid_price : NaN;
    const quantityTolerance =
      Number.EPSILON * 16 * Math.max(Math.abs(quantityNotional), Math.abs(orderSizeUsd));
    const validSellQuantity =
      !quantityProvided ||
      (proposedAction === 'reduce_position' &&
        positive(sellSizeMon!) &&
        positive(quantityNotional) &&
        positive(orderSizeUsd) &&
        Math.abs(quantityNotional - orderSizeUsd) <= quantityTolerance);
    check(
      'sell_quantity',
      validSellQuantity,
      'Exact sell quantity is only valid for reductions and must match the USD amount at mid price'
    );
    check(
      'bounded_action',
      ['increase_position', 'reduce_position', 'hold', 'hedge', 'cancel_orders'].includes(
        proposedAction
      ),
      'Unknown trading action is not authorized'
    );
    const validPolicy =
      [
        policy.max_position_usd,
        policy.max_leverage,
        policy.max_daily_loss,
        policy.max_order_size,
      ].every(nonnegative) &&
      [
        policy.max_slippage_bps,
        policy.max_open_orders,
        policy.stale_order_timeout_seconds,
        policy.min_liquidity_depth_usd,
        policy.cooldown_seconds,
      ].every(nonnegative) &&
      Number.isInteger(policy.max_open_orders) &&
      Array.isArray(policy.allowed_assets) &&
      Array.isArray(policy.allowed_venues) &&
      Array.isArray(policy.permitted_actions);
    const validPosition =
      [
        position.spot_exposure_usd,
        position.spot_balance_mon,
        position.usdc_balance,
        position.perp_short_size_mon,
      ].every(nonnegative) &&
      [
        position.perp_exposure_usd,
        position.net_delta,
        position.unrealized_pnl,
        position.realized_pnl_today,
      ].every(Number.isFinite);
    const validOrders = orders.open_orders.every(
      (order) => positive(order.price) && positive(order.size) && nonnegative(order.age_seconds)
    );
    check(
      'valid_inputs',
      validPolicy && validPosition && validOrders && (!trades || positive(orderSizeUsd)),
      'Risk inputs, policy limits and order size must be finite and valid',
      trades
    );
    check(
      'emergency_pause',
      !policy.is_paused,
      policy.is_paused ? 'Trading is currently paused' : 'System active',
      newRisk
    );
    const permitted =
      Array.isArray(policy.permitted_actions) && policy.permitted_actions.includes(proposedAction);
    check(
      'policy_permitted_action',
      permitted,
      permitted
        ? `Action ${proposedAction} is in user mandate`
        : `Action ${proposedAction} disabled in user mandate`,
      trades
    );
    const venue = proposedAction === 'hedge' ? 'perpl' : 'kuru';
    check(
      'allowed_venue',
      policy.allowed_venues?.includes(venue),
      `Venue ${venue} must be allowed by user policy`,
      trades
    );
    const assets = market.pair.split('/');
    check(
      'allowed_assets',
      assets.length === 2 && assets.every((asset) => policy.allowed_assets?.includes(asset)),
      `Assets ${market.pair} must be allowed by user policy`,
      trades
    );
    const now = this.now();
    const fresh =
      Number.isFinite(market.timestamp) &&
      now - market.timestamp <= 15_000 &&
      market.timestamp <= now + 1000;
    const validBook =
      market.bids.length > 0 &&
      market.asks.length > 0 &&
      market.bids.every((level) => positive(level.price) && positive(level.size)) &&
      market.asks.every((level) => positive(level.price) && positive(level.size)) &&
      Math.max(...market.bids.map((level) => level.price)) <=
        Math.min(...market.asks.map((level) => level.price));
    check(
      'market_freshness',
      fresh && validBook && positive(market.mid_price) && nonnegative(market.spread_bps),
      'Market book must be valid, uncrossed and no older than 15 seconds',
      trades
    );
    const open = orders.open_orders.filter((order) => order.status === 'open');
    const pendingBuys = open
      .filter((order) => order.side === 'buy')
      .reduce((sum, order) => sum + Math.max(order.price, market.mid_price) * order.size, 0);
    const prospectiveSpot =
      position.spot_exposure_usd +
      pendingBuys +
      (proposedAction === 'increase_position' ? orderSizeUsd : 0);
    check(
      'max_position_usd',
      prospectiveSpot <= policy.max_position_usd,
      `Prospective exposure ($${prospectiveSpot.toFixed(2)}) would breach max limit ($${policy.max_position_usd.toFixed(2)})`,
      proposedAction === 'increase_position'
    );
    // Discard positive unverified PnL; negative PnL conservatively reduces collateral.
    const equity =
      position.usdc_balance + position.spot_exposure_usd + Math.min(0, position.unrealized_pnl);
    const grossExposure =
      prospectiveSpot +
      Math.abs(position.perp_exposure_usd) +
      (proposedAction === 'hedge' ? orderSizeUsd : 0);
    const leverage = equity > 0 ? grossExposure / equity : Infinity;
    check(
      'max_leverage',
      leverage <= policy.max_leverage,
      `Leverage ${leverage.toFixed(2)}x would exceed max cap ${policy.max_leverage.toFixed(2)}x`,
      newRisk
    );
    const loss = Math.max(0, -(position.realized_pnl_today + position.unrealized_pnl));
    check(
      'max_daily_loss',
      loss < policy.max_daily_loss,
      `Daily loss limit reached ($${loss.toFixed(2)} >= $${policy.max_daily_loss.toFixed(2)})`,
      newRisk
    );
    check(
      'max_order_size',
      positive(orderSizeUsd) && orderSizeUsd <= policy.max_order_size,
      `Order size $${orderSizeUsd.toFixed(2)} exceeds cap $${policy.max_order_size.toFixed(2)}`,
      trades
    );
    check(
      'cash_available',
      position.usdc_balance >= orderSizeUsd + pendingBuys,
      'Insufficient unreserved USDC for proposed spot purchase',
      proposedAction === 'increase_position'
    );
    const pendingSells = open
      .filter((order) => order.side === 'sell')
      .reduce((sum, order) => sum + order.size, 0);
    const fixedQuantity = proposedAction === 'reduce_position' && quantityProvided;
    const fill = fixedQuantity
      ? quoteBaseSellFill(market.bids, validSellQuantity ? sellSizeMon! : NaN, market.mid_price)
      : quoteMarketFill(
          proposedAction === 'increase_position' ? market.asks : market.bids,
          orderSizeUsd,
          market.mid_price,
          proposedAction === 'increase_position' ? 'buy' : 'sell'
        );
    const requestedInventory = fixedQuantity ? sellSizeMon! : fill.size;
    check(
      'inventory_available',
      position.spot_balance_mon - pendingSells >= requestedInventory &&
        position.spot_exposure_usd >= orderSizeUsd,
      'Insufficient unreserved MON for proposed reduction',
      proposedAction === 'reduce_position'
    );
    check(
      'hedge_reduces_delta',
      position.net_delta > 0 && fill.size * market.mid_price <= position.net_delta,
      'Protective hedge cannot exceed current positive net delta',
      proposedAction === 'hedge'
    );
    const depth =
      proposedAction === 'increase_position' ? market.ask_depth_25bps : market.bid_depth_25bps;
    check(
      'min_liquidity_depth',
      Number.isFinite(depth) && depth >= policy.min_liquidity_depth_usd,
      `Insufficient orderbook depth ($${depth.toFixed(2)} < $${policy.min_liquidity_depth_usd.toFixed(2)})`,
      trades
    );
    check(
      'max_slippage_bps',
      fill.complete && fill.slippageBps <= policy.max_slippage_bps,
      `Executable book impact ${fill.slippageBps.toFixed(2)} bps exceeds cap ${policy.max_slippage_bps} bps or cannot fill clip`,
      trades
    );
    check(
      'max_open_orders',
      open.length < policy.max_open_orders,
      `Max open orders cap reached (${open.length}/${policy.max_open_orders})`,
      newRisk
    );
    const elapsed =
      this.lastTradeTimestamp === undefined ? Infinity : (now - this.lastTradeTimestamp) / 1000;
    check(
      'trade_cooldown',
      elapsed >= policy.cooldown_seconds,
      `Action throttled by cooldown (${elapsed.toFixed(1)}s elapsed)`,
      newRisk
    );
    const allowed = violations.length === 0;
    return {
      allowed,
      violations,
      checks,
      sanitized_action: allowed
        ? proposedAction
        : open.length > 0 && orders.oldest_order_age > policy.stale_order_timeout_seconds
          ? 'cancel_orders'
          : 'hold',
    };
  }

  /** Call only after an actual confirmed paper fill or a confirmed execution. */
  public recordExecution(): void {
    this.lastTradeTimestamp = this.now();
  }
}
