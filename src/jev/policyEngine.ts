import type {
  MarketState,
  PositionState,
  OrdersState,
  UserPolicy,
  RiskMetrics,
  JevDecisionState,
  JevStatePayload,
  StructuredDecisionFactors,
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
    assessmentInput: JevStatePayload;
    payloadHash: string;
    factors: StructuredDecisionFactors;
    reason: string;
  }> {
    const payload = buildJevStatePayload(market, position, orders, risk, policy);
    const payloadHash = hashStatePayload(payload);
    const assessmentInput = structuredClone(payload);

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
    if (decision.origin === 'fallback' || decision.source === 'fallback') {
      reason = `Inference unavailable: ${decision.error ?? 'safe fallback'}. ${decision.selected_action === 'cancel_orders' ? 'Cancelling stale resting orders.' : 'Holding with no additional risk.'}`;
    } else if (decision.selected_action === 'cancel_orders' && decision.abstain_flag) {
      reason =
        'Directional inference is uncertain; independent order-risk evidence supports cancelling resting orders.';
    } else if (decision.abstain_flag) {
      reason = `Uncertainty gate: model confidence ${decision.model_confidence === undefined ? 'unavailable' : (decision.model_confidence * 100).toFixed(0) + '%'}, entropy ${decision.entropy.toFixed(2)}, margin ${decision.top_two_margin.toFixed(2)}. Holding with no additional risk.`;
    } else if (decision.selected_action === 'hold' && decision.p_anomaly >= 0.7) {
      reason = `Anomaly probability ${(decision.p_anomaly * 100).toFixed(0)}% blocks additional exposure despite the directional action distribution.`;
    } else if (decision.selected_action === 'hold' && pHighOrCritical >= 0.6) {
      reason = `Elevated risk probability ${(pHighOrCritical * 100).toFixed(0)}% blocks additional exposure; no confident permitted protective action is proposed.`;
    } else if (decision.selected_action === 'hedge') {
      reason = `Downside risk high (${(pHighOrCritical * 100).toFixed(0)}%) & spot exposure ${factors.spot_exposure_utilization}% utilized. Proposing a bounded protective short hedge.`;
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
      assessmentInput,
      payloadHash,
      factors,
      reason,
    };
  }
}
