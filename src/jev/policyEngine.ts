// src/jev/policyEngine.ts - High-level Policy Decision Layer powered by TypeSafe Jev

import {
  MarketState,
  PositionState,
  OrdersState,
  UserPolicy,
  RiskMetrics,
  JevDecisionState,
  TradingAction,
  StructuredDecisionFactors,
  AuditEvent
} from '../types/index.ts';
import { JevClient } from './client.ts';
import { buildJevStatePayload, hashStatePayload } from './stateBuilder.ts';

export class JevPolicyEngine {
  private jevClient: JevClient;

  constructor(jevClient?: JevClient) {
    this.jevClient = jevClient || new JevClient();
  }

  /**
   * Executes the Intelligence Loop decision step.
   */
  public async evaluatePolicy(
    market: MarketState,
    position: PositionState,
    orders: OrdersState,
    risk: RiskMetrics,
    policy: UserPolicy
  ): Promise<{
    decision: JevDecisionState;
    payloadHash: string;
    factors: StructuredDecisionFactors;
    reason: string;
  }> {
    const payload = buildJevStatePayload(market, position, orders, risk, policy);
    const payloadHash = hashStatePayload(payload);

    const decision = await this.jevClient.evaluate(payload);

    const pHighOrCritical = decision.risk_probabilities.high + decision.risk_probabilities.critical;
    const pSelected = decision.action_probabilities[decision.selected_action];
    const isPolicyPermitted = policy.permitted_actions.includes(decision.selected_action);
    const positionLimitSatisfied = position.spot_exposure_usd <= policy.max_position_usd;

    const factors: StructuredDecisionFactors = {
      volatility_percentile: risk.volatility_percentile,
      sell_imbalance: Number(Math.max(0, -market.orderbook_imbalance).toFixed(2)),
      spot_exposure_utilization: Number((risk.position_utilization * 100).toFixed(1)),
      p_selected_action: pSelected,
      p_high_or_critical_risk: Number(pHighOrCritical.toFixed(2)),
      policy_permitted: isPolicyPermitted,
      position_limit_satisfied: positionLimitSatisfied,
    };

    let reason = '';
    if (decision.abstain_flag) {
      reason = `Jev confidence score (${(decision.confidence_score * 100).toFixed(0)}%) below threshold or entropy high (${decision.entropy.toFixed(2)}). Defaulting to HOLD.`;
    } else if (decision.selected_action === 'hedge') {
      reason = `Downside risk high (${(pHighOrCritical * 100).toFixed(0)}%) & spot exposure ${factors.spot_exposure_utilization}% utilized. Opening protective Perpl short hedge.`;
    } else if (decision.selected_action === 'cancel_orders') {
      reason = `Market instability / volatility spike detected. Stale orders (${orders.open_orders.length}) require cancellation to prevent toxic fills.`;
    } else if (decision.selected_action === 'increase_position') {
      reason = `Bullish regime (${(decision.regime_probabilities.trending_up * 100).toFixed(0)}%) & low risk (${(decision.risk_probabilities.low * 100).toFixed(0)}%). Increasing MON exposure within limits.`;
    } else if (decision.selected_action === 'reduce_position') {
      reason = `Risk elevated (${(pHighOrCritical * 100).toFixed(0)}%). Reducing net spot exposure to protect equity.`;
    } else {
      reason = `Balanced market state. Preserving existing allocation with zero additional transaction cost.`;
    }

    return {
      decision,
      payloadHash,
      factors,
      reason,
    };
  }
}
