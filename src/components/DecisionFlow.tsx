import React, { useId, useState } from 'react';
import { actionLabel, assessmentProvenance, type AssessmentSnapshot } from '../ui/evidence.ts';
import { describePolicyCheck } from '../ui/policyChecks.ts';

interface DecisionFlowProps {
  snapshot: AssessmentSnapshot;
  onOpenEvidence?: () => void;
}

const labels = ['Observation', 'Assessment', 'Policy checks', 'Outcome'] as const;

export const DecisionFlow: React.FC<DecisionFlowProps> = ({ snapshot, onOpenEvidence }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const regionId = useId();
  const { input, decision, riskCheck, paperExecution } = snapshot;
  const provenance = assessmentProvenance(decision);
  const failed = Object.values(riskCheck.checks).filter(
    (check) => check.applies !== false && !check.passed
  ).length;
  const outcome = !riskCheck.allowed
    ? 'Proposal blocked'
    : snapshot.executionMode === 'observe'
      ? 'Observation only'
      : paperExecution?.status === 'filled'
        ? 'Paper fill'
        : paperExecution?.status === 'cancelled'
          ? 'Paper cancellation'
          : 'No paper trade';
  const summaries = [
    input.market.pair + ' · $' + input.market.mid_price.toFixed(6),
    provenance === 'fallback' ? 'AI unavailable' : actionLabel(decision.selected_action),
    riskCheck.allowed ? 'Passed' : failed + ' blocked',
    outcome,
  ];

  return (
    <section className="decision-flow terminal-card" aria-labelledby={regionId + '-title'}>
      <header className="decision-header">
        <div>
          <h2 id={regionId + '-title'}>Decision flow</h2>
          <p>One captured observation, from input to outcome.</p>
        </div>
        <span className="decision-timestamp">
          Observed{' '}
          <time dateTime={new Date(snapshot.observedAt).toISOString()}>
            {new Date(snapshot.observedAt).toLocaleTimeString()}
          </time>
        </span>
      </header>
      <ol className="decision-stages">
        {labels.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              id={regionId + '-stage-' + index}
              className={'decision-stage' + (selected === index ? ' is-active' : '')}
              aria-expanded={selected === index}
              aria-controls={regionId}
              onClick={() => setSelected(selected === index ? null : index)}
            >
              <span className="decision-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong className="decision-stage-label">{label}</strong>
                <span className="decision-stage-detail">{summaries[index]}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {selected !== null && (
        <div
          className="decision-detail"
          id={regionId}
          role="region"
          aria-labelledby={regionId + '-stage-' + selected}
        >
          {selected === 0 && (
            <>
              <dl className="decision-facts">
                <div>
                  <dt>Captured midpoint</dt>
                  <dd>{input.market.mid_price} USDC / MON</dd>
                </div>
                <div>
                  <dt>Spread</dt>
                  <dd>{input.market.spread_bps} bps</dd>
                </div>
                <div>
                  <dt>Bid depth within 25 bps</dt>
                  <dd>{input.market.bid_depth_25bps} USD</dd>
                </div>
                <div>
                  <dt>Captured spot exposure</dt>
                  <dd>{input.position.spot_exposure_usd} USD</dd>
                </div>
              </dl>
              <p>
                The displayed inputs are retained from this assessment. Market updates do not
                replace them.
              </p>
              {snapshot.mode === 'live' && (
                <p>
                  External positions, orders, flow and historical loss are unavailable in live mode.
                  Their zero-valued payload fields are placeholders.
                </p>
              )}
            </>
          )}
          {selected === 1 && (
            <>
              <h3>
                {provenance === 'fallback'
                  ? 'AI assessment unavailable'
                  : actionLabel(decision.selected_action)}
              </h3>
              <p>
                {provenance === 'fallback'
                  ? decision.error ||
                    'The safe fallback holds because no model assessment is available.'
                  : provenance === 'heuristic'
                    ? 'A deterministic heuristic assessed the replay observation. No model request was made.'
                    : 'Jev assessed the captured input and selected this action from the available choices.'}
                {decision.source === 'cached' ? ' This result was served from the cache.' : ''}
              </p>
              <p>{snapshot.auditEvent.reason}</p>
            </>
          )}
          {selected === 2 && (
            <ul className="policy-check-list">
              {Object.entries(riskCheck.checks).map(([name, check]) => {
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
              {!Object.keys(riskCheck.checks).length && (
                <li>Recorded policy checks are unavailable.</li>
              )}
            </ul>
          )}
          {selected === 3 && (
            <>
              <h3>{outcome}</h3>
              <p>
                {!riskCheck.allowed
                  ? 'The proposal did not pass the local policy checks. No trade was executed.'
                  : snapshot.executionMode === 'observe'
                    ? 'This assessment did not submit a transaction. A user requested MON reduction has its own trade review and evidence.'
                    : paperExecution?.status === 'filled'
                      ? 'The replay ledger filled the action against the supplied book. No wallet or chain transaction was used.'
                      : paperExecution?.status === 'cancelled'
                        ? 'The replay ledger cancelled its simulated open orders.'
                        : 'The replay policy left the paper ledger unchanged.'}
              </p>
              {paperExecution && (
                <>
                  <dl className="decision-facts">
                    <div>
                      <dt>Paper action</dt>
                      <dd>{actionLabel(paperExecution.action)}</dd>
                    </div>
                    {paperExecution.status === 'filled' && (
                      <>
                        <div>
                          <dt>Filled quantity</dt>
                          <dd>{paperExecution.filledSize} MON</dd>
                        </div>
                        <div>
                          <dt>Average paper fill price</dt>
                          <dd>{paperExecution.price} USDC / MON</dd>
                        </div>
                        <div>
                          <dt>Paper notional</dt>
                          <dd>{paperExecution.notionalUsd} USD</dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <p>{paperExecution.assumptions}</p>
                </>
              )}
            </>
          )}
          {onOpenEvidence && (
            <button type="button" className="button-secondary" onClick={onOpenEvidence}>
              Inspect complete evidence
            </button>
          )}
        </div>
      )}
    </section>
  );
};
