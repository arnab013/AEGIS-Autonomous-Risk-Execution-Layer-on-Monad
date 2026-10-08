import React, { useState } from 'react';
import { Database, ExternalLink } from './icons.tsx';
import { actionLabel, explorerTxUrl } from '../ui/evidence.ts';
import type { AuditEvent } from '../types/index.ts';
import { describePolicyCheck } from '../ui/policyChecks.ts';

interface AuditTrailPanelProps {
  events: AuditEvent[];
  onExport?: () => void;
  exportLabel?: string;
}

type JournalFilter = 'all' | 'blocked' | 'trades';

function sourceLabel(event: AuditEvent): string {
  if (event.user_initiated || event.decision_source === 'user')
    return 'User requested MON reduction';
  if (event.decision_source === 'simulated') return 'Heuristic replay';
  if (event.decision_source === 'typesafe_jev') return 'Jev assessment';
  if (event.decision_source === 'fallback') return 'AI assessment unavailable';
  if (event.decision_source === 'cached') return 'Cached assessment · origin unavailable';
  return 'Assessment provenance unavailable';
}

function eventOutcome(event: AuditEvent): string {
  if (event.transaction_hash) {
    return event.transaction_status === 'confirmed'
      ? 'Confirmed on chain'
      : event.transaction_status === 'reverted'
        ? 'Reverted on chain'
        : 'Submitted · confirmation pending';
  }
  if (!event.execution_allowed) return 'Blocked by policy';
  if (event.user_initiated) {
    if (event.manual_trade?.lifecycle_status === 'stopped') return 'Stopped before submission';
    if (event.manual_trade?.lifecycle_status === 'awaiting_wallet')
      return 'Awaiting wallet approval';
    if (event.manual_trade?.lifecycle_status === 'prepared') return 'Simulation passed';
    return 'Trade review · no transaction recorded';
  }
  if (event.execution_mode === 'paper')
    return event.selected_action === 'hold' ? 'Paper hold' : 'Paper activity';
  return 'Observation only';
}

export const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({
  events,
  onExport,
  exportLabel = 'Save JSON to project',
}) => {
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const filtered = events.filter((event) => {
    if (filter === 'blocked') return !event.execution_allowed;
    if (filter === 'trades') {
      return (
        event.user_initiated ||
        !!event.transaction_hash ||
        (event.execution_mode === 'paper' &&
          event.execution_allowed &&
          event.selected_action !== 'hold')
      );
    }
    return true;
  });
  const visible = showAll ? filtered : filtered.slice(0, 20);

  return (
    <section className="journal-card terminal-card" aria-labelledby="journal-title">
      <header className="journal-header">
        <div>
          <span className="assessment-eyebrow">
            <Database aria-hidden="true" /> Session history
          </span>
          <h2 id="journal-title">Decision journal</h2>
          <p>
            {events.length} recorded {events.length === 1 ? 'event' : 'events'} · expand an entry to
            inspect its evidence.
          </p>
        </div>
        <div className="journal-tools">
          {onExport && (
            <button type="button" className="button-secondary" onClick={onExport}>
              {exportLabel}
            </button>
          )}
        </div>
      </header>
      <div className="journal-filters" role="group" aria-label="Journal filter">
        {(['all', 'blocked', 'trades'] as const).map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={filter === option}
            onClick={() => {
              setFilter(option);
              setShowAll(false);
            }}
          >
            {option === 'all' ? 'All events' : option === 'blocked' ? 'Blocked' : 'Trades'}
          </button>
        ))}
        <span>
          {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <div className="journal-list">
        {visible.map((event) => {
          const manual = event.user_initiated || event.decision_source === 'user';
          const hasModelValues =
            !manual &&
            (event.decision_source === 'typesafe_jev' || event.decision_source === 'simulated');
          const url = event.transaction_hash
            ? explorerTxUrl(event.transaction_hash, event.chain_id)
            : undefined;
          return (
            <details className="journal-event" key={event.id}>
              <summary className="journal-summary">
                <time dateTime={event.timestamp}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
                <span className="journal-action">
                  <strong>
                    {manual
                      ? 'User requested MON reduction'
                      : actionLabel(event.selected_action) || 'Action unavailable'}
                  </strong>
                  <span className="journal-source">
                    {manual ? 'Wallet review' : sourceLabel(event)}
                  </span>
                </span>
                <span
                  className={
                    'journal-status' +
                    (!event.execution_allowed || event.transaction_status === 'reverted'
                      ? ' is-blocked'
                      : '')
                  }
                >
                  {eventOutcome(event)}
                </span>
                <span className="journal-preview">{event.reason || 'Reason unavailable'}</span>
              </summary>
              <div className="journal-detail">
                <p>{event.reason || 'No reason was recorded.'}</p>
                <dl className="evidence-facts">
                  <div>
                    <dt>{manual ? 'Proposal reference' : 'Assessment state reference'}</dt>
                    <dd className="evidence-hash">{event.market_state_hash || 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Recorded</dt>
                    <dd>{new Date(event.timestamp).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Execution mode</dt>
                    <dd>{event.execution_mode ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Venue</dt>
                    <dd>{event.venue ?? 'Unavailable'}</dd>
                  </div>
                  {!manual && (
                    <div>
                      <dt>Provenance</dt>
                      <dd>{sourceLabel(event)}</dd>
                    </div>
                  )}
                  {hasModelValues && (
                    <div>
                      <dt>{event.decision_source === 'simulated' ? 'Replay policy' : 'Model'}</dt>
                      <dd>{event.jev_model ?? 'Unavailable'}</dd>
                    </div>
                  )}
                  {hasModelValues && event.confidence !== undefined && (
                    <div>
                      <dt>Application confidence score</dt>
                      <dd>{(event.confidence * 100).toFixed(1)}%</dd>
                    </div>
                  )}
                </dl>
                {manual && event.manual_trade && (
                  <section className="journal-trade-terms">
                    <h3>Recorded trade terms</h3>
                    <dl className="evidence-facts">
                      <div>
                        <dt>Sell exactly</dt>
                        <dd>{event.manual_trade.amount_mon} MON</dd>
                      </div>
                      <div>
                        <dt>Estimated output</dt>
                        <dd>{event.manual_trade.estimated_out_usdc} USDC</dd>
                      </div>
                      <div>
                        <dt>Minimum output</dt>
                        <dd>{event.manual_trade.min_out_usdc} USDC</dd>
                      </div>
                      <div>
                        <dt>Slippage cap</dt>
                        <dd>{event.manual_trade.slippage_bps} bps</dd>
                      </div>
                      <div>
                        <dt>Network</dt>
                        <dd>
                          {event.manual_trade.chain_id === 143
                            ? 'Monad mainnet'
                            : event.manual_trade.chain_id === 10143
                              ? 'Monad testnet'
                              : 'Network ' + event.manual_trade.chain_id}
                        </dd>
                      </div>
                      <div>
                        <dt>Kuru contract</dt>
                        <dd className="evidence-hash">{event.manual_trade.market_address}</dd>
                      </div>
                      <div>
                        <dt>Wallet</dt>
                        <dd className="evidence-hash">{event.manual_trade.account}</dd>
                      </div>
                      <div>
                        <dt>Simulation block</dt>
                        <dd>{event.manual_trade.snapshot_block_number}</dd>
                      </div>
                      <div>
                        <dt>Simulation</dt>
                        <dd>
                          {event.manual_trade.simulation === 'passed'
                            ? 'Passed · eth_call'
                            : 'Unavailable'}
                        </dd>
                      </div>
                      <div>
                        <dt>Gas estimate</dt>
                        <dd>{event.manual_trade.gas_estimate} gas units</dd>
                      </div>
                      <div>
                        <dt>Proposal expiry</dt>
                        <dd>{new Date(event.manual_trade.expires_at).toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Policy checked</dt>
                        <dd>{new Date(event.manual_trade.checked_at).toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Lifecycle status</dt>
                        <dd>{event.manual_trade.lifecycle_status.replaceAll('_', ' ')}</dd>
                      </div>
                      <div>
                        <dt>Confirmed output</dt>
                        <dd>
                          {event.manual_trade.lifecycle_status === 'confirmed' &&
                          event.manual_trade.received_usdc
                            ? event.manual_trade.received_usdc + ' USDC'
                            : 'No confirmed output recorded'}
                        </dd>
                      </div>
                    </dl>
                    {event.manual_trade.lifecycle_detail && (
                      <p>{event.manual_trade.lifecycle_detail}</p>
                    )}
                  </section>
                )}
                {manual && !event.manual_trade && (
                  <p className="assessment-note">
                    Exact trade terms were not stored in this older event.
                  </p>
                )}
                <h3>Recorded policy checks</h3>
                {!event.hard_check_details && (
                  <p className="assessment-note">
                    These entries retain the original check flags. Applicability and detailed
                    messages were not stored.
                  </p>
                )}
                <ul className="policy-check-list">
                  {event.hard_check_details
                    ? Object.entries(event.hard_check_details).map(([name, check]) => {
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
                      })
                    : Object.entries(event.hard_checks ?? {}).map(([name, passed]) => (
                        <li className="policy-check-item" key={name}>
                          <span className={'check-status' + (passed ? '' : ' is-neutral')}>
                            {passed ? 'Passed' : 'Not passed'}
                          </span>
                          <span>{name.replaceAll('_', ' ')}</span>
                        </li>
                      ))}
                  {!Object.keys(event.hard_check_details ?? event.hard_checks ?? {}).length && (
                    <li>Policy check evidence is unavailable.</li>
                  )}
                </ul>
                {hasModelValues && event.action_probabilities && (
                  <details className="journal-distributions">
                    <summary>
                      {event.decision_source === 'simulated'
                        ? 'Heuristic action weights'
                        : 'Relative action probabilities'}
                    </summary>
                    <dl className="evidence-facts">
                      {Object.entries(event.action_probabilities).map(([action, probability]) => (
                        <div key={action}>
                          <dt>{actionLabel(action as AuditEvent['selected_action'])}</dt>
                          <dd>{(probability * 100).toFixed(1)}%</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="assessment-note">
                      {event.decision_source === 'simulated'
                        ? 'Illustrative replay weights; no model inference.'
                        : 'Probabilities compare available choices. They do not estimate profit or authorize a trade.'}
                    </p>
                  </details>
                )}
                {event.transaction_hash ? (
                  url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="evidence-hash">
                      View recorded transaction <ExternalLink aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="evidence-hash">
                      Transaction reference: {event.transaction_hash}. Explorer unavailable for the
                      recorded network.
                    </p>
                  )
                ) : (
                  <p className="assessment-note">No chain transaction recorded.</p>
                )}
              </div>
            </details>
          );
        })}
        {!filtered.length && (
          <p className="journal-empty">
            No {filter === 'all' ? '' : filter + ' '}events recorded in this session.
          </p>
        )}
      </div>
      {!showAll && filtered.length > 20 && (
        <button
          type="button"
          className="button-secondary journal-show-more"
          onClick={() => setShowAll(true)}
        >
          Show all {filtered.length} events
        </button>
      )}
    </section>
  );
};
