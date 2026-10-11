import type { AgentReply } from '../ai/types.ts';
import { HardRiskGate } from '../engine/riskGate.ts';
import { hashStatePayload } from '../jev/stateBuilder.ts';
import type { AssessmentSnapshot } from './evidence.ts';

export function snapshotFromAgent(reply: AgentReply, clipUsd: number): AssessmentSnapshot | null {
  const evidence = reply.assessment;
  const capture = evidence?.capture;
  const decision = reply.jevDecision;
  if (!evidence || !capture || !decision) return null;
  const checks = new HardRiskGate(() => evidence.evaluatedAt).evaluateAction(
    decision.selected_action,
    capture.policy,
    capture.position,
    capture.market,
    capture.orders,
    clipUsd
  );
  const auditEvent = {
    id: `assessment_${reply.id}`,
    timestamp: new Date(evidence.evaluatedAt).toISOString(),
    market_state_hash: hashStatePayload(evidence.input),
    jev_model: decision.model,
    action_probabilities: structuredClone(decision.action_probabilities),
    risk_probabilities: structuredClone(decision.risk_probabilities),
    regime_probabilities: structuredClone(decision.regime_probabilities),
    confidence: decision.confidence_score,
    selected_action: decision.selected_action,
    hard_checks: Object.fromEntries(
      Object.entries(checks.checks).map(([key, check]) => [key, check.passed])
    ),
    hard_check_details: structuredClone(checks.checks),
    execution_allowed: checks.allowed,
    execution_mode: 'observe' as const,
    decision_source: decision.origin ?? decision.source,
    recommendation_reference: reply.id,
    reason: checks.allowed
      ? 'Observed Jev assessment. No transaction submitted.'
      : `Policy blocked: ${checks.violations.join('; ')}`,
  };
  return structuredClone({
    id: auditEvent.id,
    mode: 'live',
    observedAt: evidence.observedAt,
    evaluatedAt: evidence.evaluatedAt,
    input: evidence.input,
    decision,
    holdings: capture.position,
    riskCheck: checks,
    auditEvent,
    executionMode: 'observe',
  });
}
