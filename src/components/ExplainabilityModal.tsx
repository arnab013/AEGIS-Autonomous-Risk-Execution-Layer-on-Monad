import React, { useEffect, useId, useRef } from 'react';
import { ExternalLink, ShieldCheck, X } from './icons.tsx';
import {
  actionLabel,
  assessmentProvenance,
  explorerTxUrl,
  type EvidenceContext,
} from '../ui/evidence.ts';
import type { RiskCheckResult } from '../types/index.ts';
import { describePolicyCheck } from '../ui/policyChecks.ts';

interface ExplainabilityModalProps {
  context: EvidenceContext | null;
  onClose: () => void;
}

function PolicyChecks({ checks }: { checks: RiskCheckResult }) {
  return (
    <>
      <div className={'policy-verdict' + (checks.allowed ? '' : ' is-blocked')}>
        <strong>{checks.allowed ? 'Local policy checks passed' : 'Blocked by local policy'}</strong>
      </div>
      <ul className="policy-check-list">
        {Object.entries(checks.checks).map(([name, check]) => {
          const presentation = describePolicyCheck(name, check);
          return (
            <li className="policy-check-item" key={name}>
              <span
                className={
                  'check-status' +
                  (presentation.blocked
                    ? ' is-blocked'
                    : presentation.status === 'Not applicable'
                      ? ' is-neutral'
                      : '')
                }
              >
                {presentation.status}
              </span>
              <span>
                <strong>{name.replaceAll('_', ' ')}</strong>
                <span>{presentation.message}</span>
              </span>
            </li>
          );
        })}
        {!Object.keys(checks.checks).length && <li>Recorded policy checks are unavailable.</li>}
      </ul>
      {!!checks.violations.length && (
        <p className="evidence-warning">{checks.violations.join('; ')}</p>
      )}
    </>
  );
}

export const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({ context, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const open = context !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  useEffect(
    () => () => {
      dialogRef.current?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    },
    []
  );

  const assessment = context?.kind === 'assessment' ? context.snapshot : null;
  const manual = context?.kind === 'manual_trade' ? context : null;
  const provenance = assessment ? assessmentProvenance(assessment.decision) : null;
  const transactionUrl = manual?.transaction.hash
    ? explorerTxUrl(manual.transaction.hash, manual.proposal.chainId)
    : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="evidence-dialog"
      aria-labelledby={titleId}
      aria-describedby={titleId + '-description'}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, summary, [tabindex]'
          )
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (
          event.shiftKey &&
          (active === first || !focusable.includes(active as HTMLElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (active === last || !focusable.includes(active as HTMLElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {context && (
        <>
          <header className="evidence-header">
            <div>
              <span className="assessment-eyebrow">
                <ShieldCheck aria-hidden="true" /> Evidence
              </span>
              <h2 id={titleId}>
                {manual ? 'User requested MON reduction' : 'Assessment evidence'}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close evidence"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="evidence-body">
            <p id={titleId + '-description'} className="assessment-note">
              {manual
                ? 'This trade was initiated by you. Its proposal, policy checks and transaction record are independent of the AI assessment.'
                : 'The original observation and its result are retained together. Values below are from this assessment, before paper execution.'}
            </p>
            {assessment && (
              <>
                <section className="evidence-section">
                  <h3>Captured observation</h3>
                  <dl className="evidence-facts">
                    <div>
                      <dt>Mode</dt>
                      <dd>
                        {assessment.mode === 'replay' ? 'Heuristic replay' : 'Live observation'}
                      </dd>
                    </div>
                    <div>
                      <dt>Observed</dt>
                      <dd>{new Date(assessment.observedAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Evaluated</dt>
                      <dd>{new Date(assessment.evaluatedAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Pair</dt>
                      <dd>{assessment.input.market.pair}</dd>
                    </div>
                    <div>
                      <dt>Midpoint</dt>
                      <dd>{assessment.input.market.mid_price} USDC / MON</dd>
                    </div>
                    <div>
                      <dt>Spread</dt>
                      <dd>{assessment.input.market.spread_bps} bps</dd>
                    </div>
                    <div>
                      <dt>Bid depth within 25 bps</dt>
                      <dd>{assessment.input.market.bid_depth_25bps} USD</dd>
                    </div>
                    <div>
                      <dt>Ask depth within 25 bps</dt>
                      <dd>{assessment.input.market.ask_depth_25bps} USD</dd>
                    </div>
                    <div>
                      <dt>Spot exposure before execution</dt>
                      <dd>{assessment.input.position.spot_exposure_usd} USD</dd>
                    </div>
                    <div>
                      <dt>Perpetual exposure</dt>
                      <dd>
                        {assessment.mode === 'live'
                          ? 'Unavailable'
                          : assessment.input.position.perp_exposure_usd + ' USD'}
                      </dd>
                    </div>
                    <div>
                      <dt>Open orders</dt>
                      <dd>
                        {assessment.mode === 'live'
                          ? 'Unavailable'
                          : assessment.input.orders.open_orders_count}
                      </dd>
                    </div>
                    <div>
                      <dt>Daily realized PnL</dt>
                      <dd>
                        {assessment.mode === 'live'
                          ? 'Unavailable'
                          : assessment.input.position.realized_pnl_today + ' USD'}
                      </dd>
                    </div>
                  </dl>
                  {assessment.mode === 'live' && (
                    <p className="evidence-warning">
                      Live coverage includes the supplied wallet balances and order book. External
                      positions, orders, aggressive flow and historical loss are unavailable. Their
                      zero-valued payload fields are placeholders, not observed zeros.
                    </p>
                  )}
                </section>
                <section className="evidence-section">
                  <h3>
                    {provenance === 'fallback'
                      ? 'AI assessment unavailable'
                      : actionLabel(assessment.decision.selected_action)}
                  </h3>
                  <p>
                    {provenance === 'fallback'
                      ? assessment.decision.error ||
                        'No model result was available. The safe fallback holds.'
                      : provenance === 'heuristic'
                        ? 'Deterministic heuristic replay; no model inference.'
                        : 'Jev · ' + (assessment.decision.model ?? 'model name unavailable')}
                    {assessment.decision.source === 'cached' ? ' · cached result' : ''}
                  </p>
                  {provenance !== 'fallback' && (
                    <>
                      <h4>
                        {provenance === 'heuristic'
                          ? 'Heuristic action weights'
                          : 'Relative action probabilities'}
                      </h4>
                      <dl className="evidence-facts">
                        {Object.entries(assessment.decision.action_probabilities).map(
                          ([action, probability]) => (
                            <div key={action}>
                              <dt>
                                {actionLabel(action as typeof assessment.decision.selected_action)}
                              </dt>
                              <dd>{(probability * 100).toFixed(1)}%</dd>
                            </div>
                          )
                        )}
                      </dl>
                      <p className="assessment-note">
                        {provenance === 'heuristic'
                          ? 'These are illustrative replay weights.'
                          : 'Choice probabilities compare the available actions. They do not estimate profit or authorize execution.'}
                      </p>
                    </>
                  )}
                </section>
                <section className="evidence-section">
                  <h3>Policy checks</h3>
                  <PolicyChecks checks={assessment.riskCheck} />
                </section>
                <section className="evidence-section">
                  <h3>Recorded outcome</h3>
                  <p>{assessment.auditEvent.reason}</p>
                  <p>
                    {assessment.executionMode === 'observe'
                      ? 'Observation only. No transaction was submitted by this assessment.'
                      : assessment.paperExecution?.status === 'filled'
                        ? 'Paper fill. No wallet or chain transaction was used.'
                        : assessment.paperExecution?.status === 'cancelled'
                          ? 'Paper order cancellation. No chain transaction was used.'
                          : 'No paper trade was executed.'}
                  </p>
                  {assessment.paperExecution?.status === 'filled' && (
                    <dl className="evidence-facts">
                      <div>
                        <dt>Paper quantity</dt>
                        <dd>{assessment.paperExecution.filledSize} MON</dd>
                      </div>
                      <div>
                        <dt>Average paper fill price</dt>
                        <dd>{assessment.paperExecution.price} USDC / MON</dd>
                      </div>
                      <div>
                        <dt>Paper notional</dt>
                        <dd>{assessment.paperExecution.notionalUsd} USD</dd>
                      </div>
                    </dl>
                  )}
                  {assessment.paperExecution && (
                    <p className="assessment-note">{assessment.paperExecution.assumptions}</p>
                  )}
                </section>
                <details className="evidence-section">
                  <summary>Original input and state reference</summary>
                  <p className="evidence-hash">{assessment.auditEvent.market_state_hash}</p>
                  <pre>{JSON.stringify(assessment.input, null, 2)}</pre>
                </details>
              </>
            )}
            {manual && (
              <>
                <section className="evidence-section">
                  <h3>Simulated trade proposal</h3>
                  <dl className="evidence-facts">
                    <div>
                      <dt>Sell</dt>
                      <dd>{manual.proposal.amountMon} MON</dd>
                    </div>
                    <div>
                      <dt>Estimated output</dt>
                      <dd>{manual.proposal.estimatedOutUsdc} USDC</dd>
                    </div>
                    <div>
                      <dt>Minimum output</dt>
                      <dd>{manual.proposal.minOutUsdc} USDC</dd>
                    </div>
                    <div>
                      <dt>Slippage cap</dt>
                      <dd>{manual.proposal.slippageBps} bps</dd>
                    </div>
                    <div>
                      <dt>Network</dt>
                      <dd>
                        {manual.proposal.chainId === 143
                          ? 'Monad mainnet'
                          : manual.proposal.chainId === 10143
                            ? 'Monad testnet'
                            : 'Network ' + manual.proposal.chainId}
                      </dd>
                    </div>
                    <div>
                      <dt>Simulation block</dt>
                      <dd>{manual.proposal.snapshotBlockNumber}</dd>
                    </div>
                    <div>
                      <dt>Simulation</dt>
                      <dd>
                        {manual.proposal.simulation === 'passed'
                          ? 'Passed · eth_call'
                          : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Gas estimate</dt>
                      <dd>{manual.proposal.gasEstimate} gas units</dd>
                    </div>
                    <div>
                      <dt>Proposal expires</dt>
                      <dd>{new Date(manual.proposal.expiresAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Policy checked</dt>
                      <dd>{new Date(manual.checkedAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Wallet</dt>
                      <dd className="evidence-hash">{manual.proposal.account}</dd>
                    </div>
                    <div>
                      <dt>Kuru contract</dt>
                      <dd className="evidence-hash">{manual.proposal.marketAddress}</dd>
                    </div>
                  </dl>
                  <p className="assessment-note">
                    Simulation does not confirm a fill. Minimum output and fill-or-kill are enforced
                    on chain. Proposal expiry is an application check; reject a stale wallet prompt.
                  </p>
                </section>
                <section className="evidence-section">
                  <h3>Trade policy checks</h3>
                  <PolicyChecks checks={manual.checks} />
                </section>
                <section className="evidence-section">
                  <h3>Transaction record</h3>
                  <dl className="evidence-facts">
                    <div>
                      <dt>Status</dt>
                      <dd>{manual.transaction.status.replaceAll('_', ' ')}</dd>
                    </div>
                    <div>
                      <dt>Confirmed output</dt>
                      <dd>
                        {manual.transaction.status === 'confirmed' &&
                        manual.transaction.receivedUsdc
                          ? manual.transaction.receivedUsdc + ' USDC'
                          : 'No confirmed output recorded'}
                      </dd>
                    </div>
                  </dl>
                  {manual.transaction.detail && <p>{manual.transaction.detail}</p>}
                  {manual.transaction.hash ? (
                    transactionUrl ? (
                      <a
                        href={transactionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="evidence-hash"
                      >
                        {manual.transaction.hash} <ExternalLink aria-hidden="true" />
                      </a>
                    ) : (
                      <p className="evidence-hash">{manual.transaction.hash}</p>
                    )
                  ) : (
                    <p>No transaction submitted.</p>
                  )}
                </section>
                <details className="evidence-section">
                  <summary>Proposal reference and exact transaction</summary>
                  <p className="evidence-hash">{manual.proposal.id}</p>
                  <pre>{JSON.stringify(manual.proposal.transaction, null, 2)}</pre>
                </details>
              </>
            )}
          </div>
        </>
      )}
    </dialog>
  );
};
