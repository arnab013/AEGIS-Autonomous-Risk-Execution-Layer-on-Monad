import React from 'react';
import { CheckCircle2, Cpu, HelpCircle, ShieldAlert } from './icons.tsx';
import { actionLabel, assessmentProvenance, type AssessmentSnapshot } from '../ui/evidence.ts';
import type { TradingAction } from '../types/index.ts';
import { describePolicyCheck } from '../ui/policyChecks.ts';

interface JevPolicyPanelProps {
  snapshot: AssessmentSnapshot;
  onOpenExplainability: () => void;
}

function Distribution({
  values,
  selected,
  actions = false,
}: {
  values: Record<string, number>;
  selected?: string;
  actions?: boolean;
}) {
  return (
    <ul className="probability-list">
      {Object.entries(values)
        .sort(([, a], [, b]) => b - a)
        .map(([label, probability]) => (
          <li className="probability-row" key={label}>
            <div className="probability-label">
              <span>
                {actions ? actionLabel(label as TradingAction) : label.replaceAll('_', ' ')}
              </span>
              <strong>{(probability * 100).toFixed(1)}%</strong>
            </div>
            <div className="probability-track" aria-hidden="true">
              <span
                className={'probability-fill' + (label === selected ? ' is-selected' : '')}
                style={{ width: probability * 100 + '%' }}
              />
            </div>
          </li>
        ))}
    </ul>
  );
}

export const JevPolicyPanel: React.FC<JevPolicyPanelProps> = ({
  snapshot,
  onOpenExplainability,
}) => {
  const { decision, riskCheck, auditEvent } = snapshot;
  const provenance = assessmentProvenance(decision);
  const fallback = provenance === 'fallback';
  const heuristic = provenance === 'heuristic';
  const failedChecks = Object.values(riskCheck.checks).filter(
    (check) => check.applies !== false && !check.passed
  ).length;

  return (
    <section className="assessment-card terminal-card" aria-labelledby="assessment-title">
      <header className="assessment-header">
        <div>
          <span className="assessment-eyebrow">
            <Cpu aria-hidden="true" /> Decision support
          </span>
          <h2 id="assessment-title">Assessment</h2>
        </div>
        <button type="button" className="button-secondary" onClick={onOpenExplainability}>
          <HelpCircle aria-hidden="true" /> Inspect evidence
        </button>
      </header>
      <div className="assessment-body">
        <div className="assessment-provenance">
          <span>
            {fallback
              ? 'Safe fallback'
              : heuristic
                ? 'Heuristic replay'
                : 'Jev · ' + (decision.model ?? 'model name unavailable')}
            {decision.source === 'cached' ? ' · cached result' : ''}
          </span>
          <time dateTime={new Date(snapshot.evaluatedAt).toISOString()}>
            {new Date(snapshot.evaluatedAt).toLocaleTimeString()}
          </time>
        </div>
        <div className={'assessment-headline' + (fallback ? ' is-unavailable' : '')}>
          <h3>{fallback ? 'AI assessment unavailable' : actionLabel(decision.selected_action)}</h3>
          <p className="assessment-note">
            {fallback
              ? decision.error ||
                'No model result is available for this observation. The safe fallback holds.'
              : heuristic
                ? 'This replay uses a deterministic heuristic policy. No model request was made.'
                : 'Jev assessed the captured observation. Wallet execution requires a separate trade review.'}
          </p>
          {!fallback && decision.abstain_flag && (
            <p className="assessment-note">
              The application abstained because the assessment did not meet its uncertainty
              threshold.
            </p>
          )}
        </div>
        {!fallback && (
          <div className="assessment-distributions">
            <h3>{heuristic ? 'Heuristic action weights' : 'Relative action probabilities'}</h3>
            <p className="assessment-note">
              {heuristic
                ? 'Illustrative weights from the replay policy.'
                : 'These values compare the available choices. They do not estimate profit or give permission to trade.'}
            </p>
            <Distribution
              values={decision.action_probabilities}
              selected={decision.selected_action}
              actions
            />
            <details className="assessment-metadata">
              <summary>
                {heuristic ? 'Replay risk and regime weights' : 'Risk, regime and uncertainty'}
              </summary>
              <div className="assessment-distribution-grid">
                <section>
                  <h4>Risk</h4>
                  <Distribution values={decision.risk_probabilities} />
                </section>
                <section>
                  <h4>Market regime</h4>
                  <Distribution values={decision.regime_probabilities} />
                </section>
              </div>
              <dl className="assessment-facts">
                <div>
                  <dt>Application confidence score</dt>
                  <dd>{(decision.confidence_score * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>Distribution entropy</dt>
                  <dd>{decision.entropy.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Top two choice margin</dt>
                  <dd>{(decision.top_two_margin * 100).toFixed(1)} percentage points</dd>
                </div>
                <div>
                  <dt>Measured response time</dt>
                  <dd>{decision.latency_ms} ms</dd>
                </div>
                {provenance === 'jev' && decision.model_confidence !== undefined && (
                  <div>
                    <dt>TypeSafe confidence</dt>
                    <dd>{(decision.model_confidence * 100).toFixed(1)}%</dd>
                  </div>
                )}
              </dl>
              <p className="assessment-note">
                Confidence describes the concentration of the distribution. Policy checks remain
                separate.
              </p>
            </details>
          </div>
        )}
        <div className={'policy-verdict' + (riskCheck.allowed ? '' : ' is-blocked')}>
          {riskCheck.allowed ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <ShieldAlert aria-hidden="true" />
          )}
          <div>
            <strong>
              {riskCheck.allowed ? 'Local policy checks passed' : 'Proposal blocked by policy'}
            </strong>
            <p>{auditEvent.reason}</p>
          </div>
        </div>
        <details className="assessment-metadata">
          <summary>
            All policy checks{failedChecks ? ' · ' + failedChecks + ' blocked' : ''}
          </summary>
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
        </details>
        <p className="assessment-note">
          {snapshot.executionMode === 'paper'
            ? 'Replay outcomes are paper activity. No chain transaction is submitted.'
            : 'Observation only. The protective sale below is initiated by you.'}
        </p>
      </div>
    </section>
  );
};
