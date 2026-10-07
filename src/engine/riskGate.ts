// src/engine/riskGate.ts - Deterministic, non-negotiable Hard Risk Gate

import {
  TradingAction,
  UserPolicy,
  PositionState,
  MarketState,
  OrdersState,
  RiskCheckResult,
  HardCheckItem
} from '../types/index.ts';

export class HardRiskGate {
  private lastTradeTimestamp: number = 0;

  /**
   * Evaluates whether a proposed action passes all non-negotiable risk invariants.
   * If any check fails, returns allowed: false and explicit violation reasons.
   */
  public evaluateAction(
    proposedAction: TradingAction,
    policy: UserPolicy,
    position: PositionState,
    market: MarketState,
    orders: OrdersState,
    orderSizeUsd: number = 250 // Default standard clip size
  ): RiskCheckResult {
    const checks: Record<string, HardCheckItem> = {};
    const violations: string[] = [];

    // 1. Trading Pause / Emergency Switch
    const pauseCheckPassed = !policy.is_paused;
    checks['emergency_pause'] = {
      passed: pauseCheckPassed,
      message: pauseCheckPassed ? 'System active' : 'CRITICAL: Trading engine is paused by user/circuit-breaker'
    };
    if (!pauseCheckPassed && (proposedAction === 'increase_position' || proposedAction === 'hedge')) {
      violations.push('Trading is currently paused');
    }

    // 2. Policy Permitted Actions
    const actionPermitted = policy.permitted_actions.includes(proposedAction);
    checks['policy_permitted_action'] = {
      passed: actionPermitted,
      message: actionPermitted ? `Action ${proposedAction} is in user mandate` : `Action ${proposedAction} is NOT permitted by user policy`
    };
    if (!actionPermitted && proposedAction !== 'hold' && proposedAction !== 'cancel_orders') {
      violations.push(`Action ${proposedAction} disabled in user mandate`);
    }

    // 3. Max Position Limit
    const prospectiveExposure = position.spot_exposure_usd + (proposedAction === 'increase_position' ? orderSizeUsd : 0);
    const positionLimitPassed = prospectiveExposure <= policy.max_position_usd;
    checks['max_position_usd'] = {
      passed: positionLimitPassed,
      message: `Prospective exposure $${prospectiveExposure.toFixed(2)} vs Max $${policy.max_position_usd.toFixed(2)}`
    };
    if (proposedAction === 'increase_position' && !positionLimitPassed) {
      violations.push(`Prospective exposure ($${prospectiveExposure.toFixed(2)}) would breach max limit ($${policy.max_position_usd.toFixed(2)})`);
    }

    // 4. Max Leverage Limit
    const collateralEquity = Math.max(1, position.usdc_balance + position.unrealized_pnl);
    const prospectiveLeverage = prospectiveExposure / collateralEquity;
    const leverageLimitPassed = prospectiveLeverage <= policy.max_leverage;
    checks['max_leverage'] = {
      passed: leverageLimitPassed,
      message: `Prospective leverage ${prospectiveLeverage.toFixed(2)}x vs Max ${policy.max_leverage.toFixed(2)}x`
    };
    if (proposedAction === 'increase_position' && !leverageLimitPassed) {
      violations.push(`Leverage ${prospectiveLeverage.toFixed(2)}x would exceed max cap ${policy.max_leverage.toFixed(2)}x`);
    }

    // 5. Max Daily Loss / Drawdown Limit
    const totalLossToday = Math.min(0, position.realized_pnl_today + position.unrealized_pnl);
    const lossLimitPassed = Math.abs(totalLossToday) < policy.max_daily_loss;
    checks['max_daily_loss'] = {
      passed: lossLimitPassed,
      message: `Total daily loss $${Math.abs(totalLossToday).toFixed(2)} vs Max $${policy.max_daily_loss.toFixed(2)}`
    };
    if (!lossLimitPassed && proposedAction === 'increase_position') {
      violations.push(`Daily loss limit reached ($${Math.abs(totalLossToday).toFixed(2)} >= $${policy.max_daily_loss.toFixed(2)})`);
    }

    // 6. Max Order Size Limit
    const orderSizePassed = orderSizeUsd <= policy.max_order_size;
    checks['max_order_size'] = {
      passed: orderSizePassed,
      message: `Order size $${orderSizeUsd.toFixed(2)} vs Max $${policy.max_order_size.toFixed(2)}`
    };
    if (!orderSizePassed && (proposedAction === 'increase_position' || proposedAction === 'hedge')) {
      violations.push(`Order size $${orderSizeUsd.toFixed(2)} exceeds cap $${policy.max_order_size.toFixed(2)}`);
    }

    // 7. Orderbook Liquidity Depth Check
    const availableDepth = proposedAction === 'increase_position' ? market.ask_depth_25bps : market.bid_depth_25bps;
    const liquidityPassed = availableDepth >= policy.min_liquidity_depth_usd;
    checks['min_liquidity_depth'] = {
      passed: liquidityPassed,
      message: `Available depth $${availableDepth.toFixed(2)} vs Min required $${policy.min_liquidity_depth_usd.toFixed(2)}`
    };
    if (!liquidityPassed && (proposedAction === 'increase_position' || proposedAction === 'reduce_position')) {
      violations.push(`Insufficient orderbook depth ($${availableDepth.toFixed(2)} < $${policy.min_liquidity_depth_usd.toFixed(2)})`);
    }

    // 8. Open Order Count Cap
    const orderCountPassed = orders.open_orders.length <= policy.max_open_orders;
    checks['max_open_orders'] = {
      passed: orderCountPassed,
      message: `Open orders: ${orders.open_orders.length} vs Max: ${policy.max_open_orders}`
    };
    if (!orderCountPassed && proposedAction === 'increase_position') {
      violations.push(`Max open orders cap reached (${orders.open_orders.length}/${policy.max_open_orders})`);
    }

    // 9. Cooldown between new-risk actions
    const now = Date.now();
    const timeSinceLastTrade = (now - this.lastTradeTimestamp) / 1000;
    const cooldownPassed = this.lastTradeTimestamp === 0 || timeSinceLastTrade >= policy.cooldown_seconds;
    checks['trade_cooldown'] = {
      passed: cooldownPassed,
      message: cooldownPassed ? 'Cooldown satisfied' : `In cooldown: ${timeSinceLastTrade.toFixed(1)}s / ${policy.cooldown_seconds}s`
    };
    if (!cooldownPassed && (proposedAction === 'increase_position' || proposedAction === 'hedge')) {
      violations.push(`Action throttled by cooldown (${timeSinceLastTrade.toFixed(1)}s elapsed)`);
    }

    // Determine final outcome
    const allowed = violations.length === 0;
    let sanitized_action: TradingAction = proposedAction;

    if (!allowed) {
      // If proposed risk action was rejected, sanitize safely to HOLD or CANCEL_ORDERS
      if (orders.oldest_order_age > policy.stale_order_timeout_seconds) {
        sanitized_action = 'cancel_orders';
      } else {
        sanitized_action = 'hold';
      }
    }

    return {
      allowed,
      violations,
      checks,
      sanitized_action
    };
  }

  /**
   * Records execution of an approved action to reset cooldown timers.
   */
  public recordExecution(): void {
    this.lastTradeTimestamp = Date.now();
  }
}
