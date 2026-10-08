import { describe, expect, it, vi } from 'vitest';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { REPLAY_SCENARIOS } from '../src/data/scenarios.ts';
import { JevClient } from '../src/jev/client.ts';
import { JevPolicyEngine } from '../src/jev/policyEngine.ts';
import { hashStatePayload } from '../src/jev/stateBuilder.ts';
import type { AuditEvent, JevStatePayload, RiskCheckResult } from '../src/types/index.ts';
import type { KuruPreparedTrade } from '../src/execution/kuruClient.ts';
import {
  actionLabel,
  assessmentProvenance,
  createAssessmentSnapshot,
  explorerTxUrl,
  manualTradeAudit,
  tradeStateAfterError,
} from '../src/ui/evidence.ts';
import type { EvidenceContext, TradeLifecycle } from '../src/ui/evidence.ts';

const epoch = Date.parse('2026-10-08T00:00:00Z');
const hash = `0x${'a'.repeat(64)}`;

function bullishReplay() {
  const scenario = REPLAY_SCENARIOS[1];
  const client = new JevClient({ mode: 'simulated' });
  const engine = new StateEngine(
    scenario.initial_position,
    undefined,
    new JevPolicyEngine(client),
    { now: () => epoch + 2000 }
  );
  engine.orders.open_orders = structuredClone(scenario.initial_orders);
  for (const tick of scenario.ticks)
    engine.updateMarketState(
      tick.bids,
      tick.asks,
      tick.aggressive_buy_flow,
      tick.aggressive_sell_flow,
      epoch + tick.timestamp_offset_ms
    );
  return { engine, client };
}

function manualContext(
  status: TradeLifecycle['status'] = 'prepared'
): Extract<EvidenceContext, { kind: 'manual_trade' }> {
  const account = '0x000000000000000000000000000000000000dEaD';
  const marketAddress = '0x065C9d28E428A0db40191a54d33d5b7c71a9C394';
  const proposal: KuruPreparedTrade = {
    id: hash,
    chainId: 143,
    account,
    marketAddress,
    amountMon: '200',
    amountWei: '200000000000000000000',
    sizeUnits: '2000000000000',
    estimatedOutUsdc: '5',
    minOutUsdc: '4.98',
    minOutUnits: '4980000',
    slippageBps: 40,
    referenceMidPrice: '0.025',
    snapshotBlockNumber: 111000000,
    snapshotTimestamp: epoch,
    createdAt: epoch,
    expiresAt: epoch + 30000,
    simulation: 'passed',
    gasEstimate: '300000',
    transaction: {
      from: account,
      to: marketAddress,
      chainId: '0x8f',
      value: '0xad78ebc5ac6200000',
      data: '0x1234',
      gas: '0x57e40',
    },
  };
  const checks: RiskCheckResult = {
    allowed: true,
    violations: [],
    checks: {
      sell_quantity: { passed: true, message: 'Exact quantity fits inventory' },
      max_slippage_bps: { passed: true, message: 'Within the slippage cap' },
    },
    sanitized_action: 'reduce_position',
  };
  return {
    kind: 'manual_trade',
    proposal,
    checks,
    checkedAt: epoch + 1000,
    transaction: { status, proposal },
  };
}

describe('Assessment evidence belongs to its captured observation', () => {
  it('retains the exact pre-inference payload when a paper fill changes holdings', async () => {
    const { engine, client } = bullishReplay();
    let sentInput!: JevStatePayload;
    const evaluate = client.evaluate.bind(client);
    vi.spyOn(client, 'evaluate').mockImplementation(async (input) => {
      sentInput = structuredClone(input);
      return evaluate(input);
    });
    const exposureBefore = engine.position.spot_exposure_usd;
    const cycle = await engine.step(250);
    expect(cycle.paperExecution?.status).toBe('filled');
    expect(cycle.assessmentInput).toEqual(sentInput);
    expect(cycle.assessmentInput.position.spot_exposure_usd).toBe(Math.round(exposureBefore));
    expect(cycle.position.spot_exposure_usd).toBeGreaterThan(exposureBefore);
    expect(cycle.auditEvent.market_state_hash).toBe(hashStatePayload(cycle.assessmentInput));
    expect(cycle.observedAt).toBe(cycle.market.timestamp);
  });

  it('isolates every nested evidence field from later polling and result mutations', async () => {
    const { engine } = bullishReplay();
    const cycle = await engine.step(250);
    const snapshot = createAssessmentSnapshot(cycle, 'replay');
    const preserved = structuredClone(snapshot);
    const later = engine.market.timestamp + 1000;
    engine.updateMarketState(
      [{ price: 4.8, size: 2000 }],
      [{ price: 4.81, size: 2000 }],
      0,
      0,
      later
    );
    cycle.assessmentInput.market.mid_price = 99;
    cycle.assessmentInput.policy.allowed_actions.length = 0;
    cycle.jevDecision.action_probabilities.hold = 0;
    cycle.riskCheck.checks.valid_inputs.message = 'Changed';
    cycle.auditEvent.reason = 'Changed';
    cycle.auditEvent.factors!.sell_imbalance = 1;
    cycle.paperExecution!.filledSize = 999;
    expect(snapshot).toEqual(preserved);
    expect(snapshot.evaluatedAt).toBe(Date.parse(preserved.auditEvent.timestamp));
    expect(snapshot.id).toBe(preserved.auditEvent.id);
  });

  it('keeps cached fallback and replay assessments from appearing to be Jev', async () => {
    const { engine } = bullishReplay();
    const decision = (await engine.step()).jevDecision;
    expect(assessmentProvenance(decision)).toBe('heuristic');
    expect(assessmentProvenance({ ...decision, source: 'cached', origin: 'fallback' })).toBe(
      'fallback'
    );
    expect(assessmentProvenance({ ...decision, source: 'cached', origin: 'simulated' })).toBe(
      'heuristic'
    );
    expect(assessmentProvenance({ ...decision, source: 'cached', origin: 'typesafe_jev' })).toBe(
      'jev'
    );
    expect(assessmentProvenance({ ...decision, source: 'cached', origin: undefined })).toBe(
      'fallback'
    );
  });

  it('retains inapplicable check results without turning a safe hold into a blocked trade', async () => {
    const engine = new StateEngine(
      undefined,
      undefined,
      new JevPolicyEngine(new JevClient({ mode: 'disabled' })),
      { now: () => epoch }
    );
    engine.policy.max_position_usd = 0;
    engine.policy.max_daily_loss = 0;
    engine.policy.is_paused = true;
    const hold = await engine.step(250, { execute: false });
    expect(hold.riskCheck.allowed).toBe(true);
    expect(hold.riskCheck.violations).toEqual([]);
    expect(hold.riskCheck.checks.max_position_usd).toMatchObject({ passed: false, applies: false });
    expect(hold.riskCheck.checks.max_daily_loss).toMatchObject({ passed: false, applies: false });
    expect(hold.riskCheck.checks.emergency_pause).toMatchObject({ passed: false, applies: false });
    expect(hold.auditEvent.hard_checks.max_position_usd).toBe(false);
    expect(hold.auditEvent.hard_check_details?.max_position_usd).toMatchObject({
      passed: false,
      applies: false,
    });
    const checkMessage = hold.auditEvent.hard_check_details?.max_position_usd.message;
    hold.riskCheck.checks.max_position_usd.applies = true;
    hold.riskCheck.checks.max_position_usd.message = 'Changed after evaluation';
    expect(hold.auditEvent.hard_check_details?.max_position_usd).toMatchObject({
      passed: false,
      applies: false,
      message: checkMessage,
    });
    const increase = engine.riskGate.evaluateAction(
      'increase_position',
      engine.policy,
      engine.position,
      engine.market,
      engine.orders,
      250
    );
    expect(increase.allowed).toBe(false);
    expect(increase.checks.max_position_usd).toMatchObject({ passed: false, applies: true });
    expect(increase.violations).toContain(increase.checks.max_position_usd.message);
  });
});

describe('Manual trade evidence has no model assessment', () => {
  it('records only the reviewed proposal and its own policy checks', () => {
    const context = manualContext();
    context.checks.checks.sell_quantity.applies = true;
    const event = manualTradeAudit(context, 'manual-1');
    expect(event).toMatchObject({
      id: 'manual-1',
      selected_action: 'reduce_position',
      decision_source: 'user',
      user_initiated: true,
      market_state_hash: context.proposal.id,
      chain_id: 143,
      venue: 'kuru',
      hard_checks: { sell_quantity: true, max_slippage_bps: true },
    });
    for (const field of [
      'jev_model',
      'confidence',
      'action_probabilities',
      'risk_probabilities',
      'regime_probabilities',
      'factors',
    ])
      expect(event).not.toHaveProperty(field);
    expect(event.transaction_hash).toBeUndefined();
    expect(event.transaction_status).toBeUndefined();
    expect(event.reason).toContain('200 MON');
    expect(event.reason).toContain('4.98 USDC');
    expect(event.reason).toContain('no transaction submitted');
    context.checks.checks.sell_quantity.passed = false;
    context.checks.checks.sell_quantity.applies = false;
    context.checks.checks.sell_quantity.message = 'Changed after recording';
    expect(event.hard_checks.sell_quantity).toBe(true);
    expect(event.hard_check_details?.sell_quantity).toEqual({
      passed: true,
      applies: true,
      message: 'Exact quantity fits inventory',
    });
  });

  it('uses the manual gate result even when a trade is blocked', () => {
    const context = manualContext('stopped');
    context.checks.allowed = false;
    context.checks.violations = ['Insufficient MON inventory'];
    context.checks.checks.sell_quantity.passed = false;
    const event = manualTradeAudit(context, 'manual-blocked');
    expect(event.execution_allowed).toBe(false);
    expect(event.hard_checks.sell_quantity).toBe(false);
    expect(event.reason).toContain('Insufficient MON inventory');
  });

  it('records a submitted hash as pending confirmation and a receipt as confirmed', () => {
    const context = manualContext('pending');
    context.transaction.hash = hash;
    const submitted = manualTradeAudit(context, 'manual-submitted');
    expect(submitted.transaction_status).toBe('submitted');
    expect(submitted.reason).toContain('pending receipt');
    context.transaction.status = 'confirmed';
    context.transaction.receivedUsdc = '4.99';
    const confirmed = manualTradeAudit(context, 'manual-confirmed');
    expect(confirmed.transaction_status).toBe('confirmed');
    expect(confirmed.reason).toContain('received 4.99 USDC');
  });

  it('retains exact historical proposal terms independently of later trade review changes', () => {
    const context = manualContext('pending');
    context.proposal.amountMon = '200.000000000000000001';
    context.proposal.amountWei = '200000000000000000001';
    context.proposal.estimatedOutUsdc = '5.000001';
    context.proposal.minOutUsdc = '4.980001';
    context.proposal.minOutUnits = '4980001';
    context.transaction.hash = hash;
    context.transaction.detail = 'Receipt timeout';
    const event = manualTradeAudit(context, 'historical-manual', epoch + 60000);
    const saved = JSON.parse(JSON.stringify(event));
    expect(saved.manual_trade).toEqual({
      proposal_id: hash,
      account: context.proposal.account,
      chain_id: 143,
      market_address: context.proposal.marketAddress,
      amount_mon: '200.000000000000000001',
      amount_wei: '200000000000000000001',
      size_units: '2000000000000',
      estimated_out_usdc: '5.000001',
      min_out_usdc: '4.980001',
      min_out_units: '4980001',
      slippage_bps: 40,
      reference_mid_price: '0.025',
      snapshot_block_number: 111000000,
      snapshot_timestamp: epoch,
      created_at: epoch,
      expires_at: epoch + 30000,
      gas_estimate: '300000',
      simulation: 'passed',
      checked_at: epoch + 1000,
      lifecycle_status: 'pending',
      transaction_hash: hash,
      lifecycle_detail: 'Receipt timeout',
    });
    context.proposal.amountMon = '999';
    context.proposal.minOutUsdc = '0.01';
    context.proposal.snapshotBlockNumber++;
    context.transaction.status = 'confirmed';
    context.transaction.receivedUsdc = '4.99';
    expect(JSON.parse(JSON.stringify(event))).toEqual(saved);
    const confirmed = manualTradeAudit(context, 'later-receipt', epoch + 90000);
    expect(confirmed.manual_trade?.received_usdc).toBe('4.99');
    expect(confirmed.manual_trade?.lifecycle_status).toBe('confirmed');
    expect(confirmed.manual_trade?.checked_at).toBe(epoch + 1000);
  });

  it('records event time separately from the preserved policy-check time', () => {
    const context = manualContext();
    const now = vi.spyOn(Date, 'now').mockReturnValue(epoch + 90000);
    try {
      const event = manualTradeAudit(context, 'event-time');
      expect(event.timestamp).toBe(new Date(epoch + 90000).toISOString());
      expect(event.manual_trade?.checked_at).toBe(context.checkedAt);
      const deterministic = manualTradeAudit(context, 'provided-time', epoch + 50000);
      expect(deterministic.timestamp).toBe(new Date(epoch + 50000).toISOString());
      expect(deterministic.manual_trade?.checked_at).toBe(context.checkedAt);
    } finally {
      now.mockRestore();
    }
  });

  it('keeps assessment journal entries compatible without manual proposal metadata', async () => {
    const { engine } = bullishReplay();
    const legacyShape = (await engine.step()).auditEvent;
    expect(legacyShape).not.toHaveProperty('manual_trade');
    expect(JSON.parse(JSON.stringify(legacyShape))).toMatchObject({
      market_state_hash: legacyShape.market_state_hash,
      selected_action: legacyShape.selected_action,
      execution_mode: 'paper',
      action_probabilities: legacyShape.action_probabilities,
    });
    const withoutDetails: AuditEvent = { ...legacyShape };
    delete withoutDetails.hard_check_details;
    const legacyRecord: AuditEvent = JSON.parse(JSON.stringify(withoutDetails));
    expect(legacyRecord.hard_check_details).toBeUndefined();
    expect(legacyRecord.hard_checks).toEqual(legacyShape.hard_checks);
    expect(legacyRecord.selected_action).toBe(legacyShape.selected_action);
  });
});

describe('Errors cannot undo submission or invent a receipt', () => {
  it.each(['submitted', 'pending'] as const)(
    'retains a %s hash after a receipt timeout',
    (status) => {
      const state: TradeLifecycle = { status, hash, proposal: manualContext().proposal };
      const next = tradeStateAfterError(state, new Error('Receipt timeout'));
      expect(next).toMatchObject({ status: 'pending', hash, proposal: state.proposal });
      expect(next.detail).toContain('confirmation is unavailable');
      expect(next.detail).toContain('Receipt timeout');
    }
  );

  it('stops a wallet rejection before a hash exists without calling it reverted', () => {
    expect(tradeStateAfterError({ status: 'awaiting_wallet' }, new Error('User rejected'))).toEqual(
      { status: 'stopped', detail: 'User rejected' }
    );
  });

  it.each(['confirmed', 'reverted'] as const)(
    'preserves a known %s receipt when balance refresh fails',
    (status) => {
      const state: TradeLifecycle = { status, hash, detail: 'Receipt checked' };
      expect(tradeStateAfterError(state, new Error('Balance service unavailable'))).toEqual(state);
    }
  );
});

describe('Readable labels and transaction links', () => {
  it('links only validated transaction hashes on known Monad networks', () => {
    expect(explorerTxUrl(hash, 143)).toBe(`https://monadvision.com/tx/${hash}`);
    expect(explorerTxUrl(hash, 10143)).toBe(`https://testnet.monadvision.com/tx/${hash}`);
    expect(explorerTxUrl(hash, 1)).toBeUndefined();
    expect(explorerTxUrl(hash)).toBeUndefined();
    expect(explorerTxUrl('not-a-transaction', 143)).toBeUndefined();
  });

  it('uses understandable action names', () => {
    expect(actionLabel('reduce_position')).toBe('Reduce MON exposure');
    expect(actionLabel('cancel_orders')).toBe('Cancel resting orders');
  });
});
