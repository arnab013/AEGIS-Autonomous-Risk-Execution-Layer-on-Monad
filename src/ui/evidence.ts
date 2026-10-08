import type { EngineCycleOutput, PaperExecution } from '../engine/stateEngine.ts';
import type { KuruPreparedTrade } from '../execution/kuruClient.ts';
import type {
  AuditEvent,
  JevDecisionState,
  JevStatePayload,
  ManualTradeStatus,
  RiskCheckResult,
  TradingAction,
} from '../types/index.ts';

export interface AssessmentSnapshot {
  id: string;
  mode: 'live' | 'replay';
  observedAt: number;
  evaluatedAt: number;
  input: JevStatePayload;
  decision: JevDecisionState;
  riskCheck: RiskCheckResult;
  auditEvent: AuditEvent;
  executionMode: 'paper' | 'observe';
  paperExecution?: PaperExecution;
}

export function createAssessmentSnapshot(
  result: EngineCycleOutput,
  mode: 'live' | 'replay'
): AssessmentSnapshot {
  return structuredClone({
    id: result.auditEvent.id,
    mode,
    observedAt: result.observedAt,
    evaluatedAt: Date.parse(result.auditEvent.timestamp),
    input: result.assessmentInput,
    decision: result.jevDecision,
    riskCheck: result.riskCheck,
    auditEvent: result.auditEvent,
    executionMode: result.executionMode,
    paperExecution: result.paperExecution,
  });
}

export interface TradeLifecycle {
  status: ManualTradeStatus;
  proposal?: KuruPreparedTrade;
  hash?: string;
  detail?: string;
  receivedUsdc?: string;
}

export type EvidenceContext =
  | { kind: 'assessment'; snapshot: AssessmentSnapshot }
  | {
      kind: 'manual_trade';
      proposal: KuruPreparedTrade;
      checks: RiskCheckResult;
      checkedAt: number;
      transaction: TradeLifecycle;
    };

export function assessmentProvenance(decision: JevDecisionState): 'jev' | 'heuristic' | 'fallback' {
  const source = decision.origin ?? decision.source;
  if (source === 'typesafe_jev') return 'jev';
  if (source === 'simulated') return 'heuristic';
  return 'fallback';
}

const actionLabels: Record<TradingAction, string> = {
  increase_position: 'Increase MON exposure',
  reduce_position: 'Reduce MON exposure',
  hold: 'Hold',
  hedge: 'Hedge exposure',
  cancel_orders: 'Cancel resting orders',
};

export function actionLabel(action: TradingAction): string {
  return actionLabels[action];
}

export function explorerTxUrl(hash: string, chainId?: number): string | undefined {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined;
  if (chainId === 143) return `https://monadvision.com/tx/${hash}`;
  if (chainId === 10143) return `https://testnet.monadvision.com/tx/${hash}`;
  return undefined;
}

export function tradeStateAfterError(state: TradeLifecycle, error: unknown): TradeLifecycle {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Request failed';
  if (state.status === 'confirmed' || state.status === 'reverted') return { ...state };
  if (state.hash)
    return {
      ...state,
      status: 'pending',
      detail: `Transaction submitted; confirmation is unavailable. ${message}`,
    };
  return { ...state, status: 'stopped', detail: message };
}

export function manualTradeAudit(
  context: Extract<EvidenceContext, { kind: 'manual_trade' }>,
  id: string = crypto.randomUUID(),
  eventAt: number = Date.now()
): AuditEvent {
  const { proposal, checks, checkedAt, transaction } = context;
  const status = transaction.status;
  const transactionStatus =
    status === 'confirmed' || status === 'reverted'
      ? status
      : transaction.hash
        ? 'submitted'
        : undefined;
  const outcome =
    status === 'confirmed'
      ? `Confirmed receipt${transaction.receivedUsdc ? `; received ${transaction.receivedUsdc} USDC` : ''}.`
      : status === 'reverted'
        ? 'Receipt reports that the transaction reverted.'
        : transaction.hash
          ? 'Submitted; fill is pending receipt confirmation.'
          : status === 'awaiting_wallet'
            ? 'Awaiting wallet approval; no transaction submitted.'
            : status === 'stopped'
              ? 'Stopped before submission.'
              : 'Simulation passed; no transaction submitted.';
  return {
    id,
    timestamp: new Date(eventAt).toISOString(),
    // Manual actions have a proposal identity, not a Jev assessment-state hash.
    market_state_hash: proposal.id,
    selected_action: 'reduce_position',
    hard_checks: Object.fromEntries(
      Object.entries(checks.checks).map(([key, check]) => [key, check.passed])
    ),
    hard_check_details: structuredClone(checks.checks),
    execution_allowed: checks.allowed,
    transaction_hash: transaction.hash,
    transaction_status: transactionStatus,
    chain_id: proposal.chainId,
    venue: 'kuru',
    execution_mode: 'wallet',
    decision_source: 'user',
    user_initiated: true,
    manual_trade: {
      proposal_id: proposal.id,
      account: proposal.account,
      chain_id: proposal.chainId,
      market_address: proposal.marketAddress,
      amount_mon: proposal.amountMon,
      amount_wei: proposal.amountWei,
      size_units: proposal.sizeUnits,
      estimated_out_usdc: proposal.estimatedOutUsdc,
      min_out_usdc: proposal.minOutUsdc,
      min_out_units: proposal.minOutUnits,
      slippage_bps: proposal.slippageBps,
      reference_mid_price: proposal.referenceMidPrice,
      snapshot_block_number: proposal.snapshotBlockNumber,
      snapshot_timestamp: proposal.snapshotTimestamp,
      created_at: proposal.createdAt,
      expires_at: proposal.expiresAt,
      gas_estimate: proposal.gasEstimate,
      simulation: proposal.simulation,
      checked_at: checkedAt,
      lifecycle_status: transaction.status,
      transaction_hash: transaction.hash,
      received_usdc: transaction.receivedUsdc,
      lifecycle_detail: transaction.detail,
    },
    reason: `User requested ${proposal.amountMon} MON → USDC with minimum output ${proposal.minOutUsdc} USDC. ${outcome}${checks.allowed ? '' : ` Policy blocked: ${checks.violations.join('; ')}`}`,
  };
}
