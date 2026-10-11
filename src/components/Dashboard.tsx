import React from 'react';
import { AppSidebar } from './AppSidebar.tsx';
import type { AuditEvent, MarketState, PositionState, UserPolicy } from '../types/index.ts';
import {
  actionLabel,
  assessmentProvenance,
  type AssessmentSnapshot,
  type TradeLifecycle,
} from '../ui/evidence.ts';
import { ArrowUpRight, Clock, ShieldCheck, Wallet } from './icons.tsx';

export interface DashboardProps {
  mode: 'live' | 'replay';
  market?: MarketState;
  position?: PositionState;
  walletAddress?: string | null;
  chainId?: number;
  now?: number;
  assessment?: AssessmentSnapshot | null;
  policy: UserPolicy;
  trade?: TradeLifecycle;
  events: AuditEvent[];
  chat: React.ReactNode;
  sideContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  onOpenWorkspace: () => void;
  onReplay: () => void;
  onHome: () => void;
  onOpenAiAccess: () => void;
  onInspectAssessment?: () => void;
}

function amount(value: number | undefined, digits = 2): string {
  return value !== undefined && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
    : 'Unavailable';
}

export function Dashboard({
  mode,
  market,
  position,
  walletAddress,
  chainId,
  now = Date.now(),
  assessment,
  policy,
  trade,
  events,
  chat,
  sideContent,
  headerActions,
  onOpenWorkspace,
  onReplay,
  onHome,
  onOpenAiAccess,
  onInspectAssessment,
}: DashboardProps) {
  const live = mode === 'live';
  const hasPosition = !live || Boolean(walletAddress);
  const age = market ? Math.max(0, Math.floor((now - market.timestamp) / 1000)) : null;
  const provenance = assessment ? assessmentProvenance(assessment.decision) : null;
  const checks = assessment
    ? Object.values(assessment.riskCheck.checks).filter((check) => check.applies !== false)
    : [];
  const failed = checks.filter((check) => !check.passed).length;
  const recentEvents = events.slice(0, 3);
  const submitted = trade?.status === 'submitted' || trade?.status === 'pending';

  return (
    <div className="warm-dashboard">
      <a className="warm-skip-link" href="#dashboard-main">
        Skip to workspace
      </a>
      <AppSidebar
        current="overview"
        onHome={onHome}
        onOverview={() => {}}
        onExecution={onOpenWorkspace}
        onReplay={onReplay}
        onOpenAiAccess={onOpenAiAccess}
      />

      <main className="dashboard-main" id="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <span className="warm-eyebrow">Aegis / Overview</span>
            <h1>
              A little clarity.
              <br />
              <span>For your next move.</span>
            </h1>
          </div>
          <div className="dashboard-topbar-actions">{headerActions}</div>
        </header>

        <div className="dashboard-context" role="status">
          <span className={'warm-status ' + (live ? 'warm-status-sage' : 'warm-status-butter')}>
            {live ? 'Live market' : 'Synthetic replay'}
          </span>
          <span>
            {live
              ? `Kuru · Monad ${chainId === 143 ? 'Mainnet' : chainId === 10143 ? 'Testnet' : (chainId ?? 'connecting')}`
              : 'Heuristic assessment · paper execution'}
          </span>
          <span className="dashboard-context-time">
            <Clock aria-hidden="true" />
            {age === null
              ? 'Waiting for market data'
              : live
                ? `${age > 15 ? 'Stale observation · ' : 'Observed '}${age}s ago`
                : 'No chain execution'}
          </span>
        </div>

        <section className="dashboard-metrics" aria-label="Current market and wallet readings">
          <article className="dashboard-metric metric-peach">
            <span>MON / USDC midpoint</span>
            <strong>
              {amount(market?.mid_price, 6)}
              {market && <small> USDC</small>}
            </strong>
            <p>{live ? 'Current Kuru observation' : 'Synthetic replay price'}</p>
          </article>
          <article className="dashboard-metric">
            <span>Bid depth · within 25 bps</span>
            <strong>
              {market ? '$' : ''}
              {amount(market?.bid_depth_25bps, 0)}
            </strong>
            <p>Spread {amount(market?.spread_bps)} bps</p>
          </article>
          <article className="dashboard-metric metric-sage">
            <span>{live ? 'Wallet MON exposure' : 'Paper MON exposure'}</span>
            <strong>
              {hasPosition && position
                ? '$' + amount(position.spot_exposure_usd)
                : 'Connect wallet'}
            </strong>
            <p>Position limit ${amount(policy.max_position_usd, 0)}</p>
          </article>
          <article className="dashboard-metric">
            <span>Session records</span>
            <strong>
              {events.length}
              <small> recorded</small>
            </strong>
            <p>
              {live
                ? 'This session’s evidence and trade records'
                : 'Synthetic assessments and paper outcomes'}
            </p>
          </article>
        </section>

        <div className="dashboard-work-grid">
          <div className="dashboard-chat-slot">{chat}</div>
          <aside className="dashboard-evidence-stack" aria-label="Decision evidence and context">
            <section className="warm-card dashboard-assessment">
              <header>
                <span className="warm-eyebrow">
                  <ShieldCheck aria-hidden="true" /> Decision evidence
                </span>
                <span className="warm-status warm-status-sage">
                  {provenance === 'jev'
                    ? 'Jev'
                    : provenance === 'heuristic'
                      ? 'Heuristic'
                      : 'Unavailable'}
                </span>
              </header>
              <h2>
                {!assessment
                  ? 'Start with an observation.'
                  : provenance === 'fallback'
                    ? 'AI assessment unavailable'
                    : actionLabel(assessment.decision.selected_action)}
              </h2>
              <p>
                {!assessment
                  ? 'Inspect the market or request an assessment to capture the evidence behind a decision.'
                  : provenance === 'fallback'
                    ? (assessment.decision.error ??
                      'A safe fallback holds while no model assessment is available.')
                    : provenance === 'heuristic'
                      ? 'This replay uses a deterministic heuristic. No model request was made.'
                      : 'Jev assessed one captured observation. The policy result remains independent.'}
              </p>
              {assessment && (
                <div className="dashboard-assessment-result">
                  <strong>
                    {assessment.riskCheck.allowed
                      ? 'Applicable policy checks passed'
                      : `${failed} applicable ${failed === 1 ? 'check blocked' : 'checks blocked'}`}
                  </strong>
                  <span>
                    Observed {new Date(assessment.observedAt).toLocaleTimeString()}
                    {assessment.decision.source === 'cached' ? ' · cached assessment' : ''}
                  </span>
                </div>
              )}
              {onInspectAssessment && assessment && (
                <button className="warm-text-button" onClick={onInspectAssessment}>
                  Inspect captured evidence <ArrowUpRight aria-hidden="true" />
                </button>
              )}
              <button className="warm-text-button" onClick={onOpenWorkspace}>
                Open market & execution <ArrowUpRight aria-hidden="true" />
              </button>
            </section>
            {submitted && (
              <section className="warm-card dashboard-pending" role="status">
                <Clock aria-hidden="true" />
                <h2>Confirmation still pending.</h2>
                <p>
                  Your transaction was submitted. Check its receipt before preparing another sale.
                </p>
                <button className="warm-text-button" onClick={onOpenWorkspace}>
                  Check transaction <ArrowUpRight aria-hidden="true" />
                </button>
              </section>
            )}
            {sideContent}
          </aside>
        </div>

        <section className="dashboard-bottom-grid" aria-label="Wallet and session activity">
          <article className="warm-card dashboard-wallet">
            <header>
              <span className="warm-eyebrow">
                <Wallet aria-hidden="true" />
                {live ? 'Wallet context' : 'Paper ledger'}
              </span>
              <span className="warm-status">
                {live ? (walletAddress ? 'Connected' : 'Disconnected') : 'Replay'}
              </span>
            </header>
            <h2>{live ? 'Your holdings, in view.' : 'A practice ledger.'}</h2>
            <dl>
              <div>
                <dt>MON</dt>
                <dd>{hasPosition ? amount(position?.spot_balance_mon, 6) : 'Unavailable'}</dd>
              </div>
              <div>
                <dt>USDC</dt>
                <dd>{hasPosition ? amount(position?.usdc_balance, 6) : 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Slippage cap</dt>
                <dd>{policy.max_slippage_bps} bps</dd>
              </div>
            </dl>
            <p>
              {live
                ? 'This wallet’s MON and USDC only. External positions and historical profit or loss are not indexed.'
                : 'Synthetic balances and fills. No funds move on chain.'}
            </p>
          </article>
          <article className="warm-card dashboard-activity">
            <header>
              <span className="warm-eyebrow">
                <Clock aria-hidden="true" /> Session journal
              </span>
              <span className="warm-status">Session only</span>
            </header>
            <h2>A trace of your decisions.</h2>
            {recentEvents.length ? (
              <ol>
                {recentEvents.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>
                        {event.user_initiated
                          ? 'User requested MON reduction'
                          : actionLabel(event.selected_action)}
                      </strong>
                      <p>{event.reason}</p>
                    </div>
                    <time dateTime={event.timestamp}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dashboard-empty-copy">
                Assessments, policy checks and reviewed trades will appear here as you use the
                workspace.
              </p>
            )}
            <button className="warm-text-button" onClick={onOpenWorkspace}>
              Open complete session journal <ArrowUpRight aria-hidden="true" />
            </button>
          </article>
        </section>
        <footer className="dashboard-footer">
          <span>AI proposes. Policy constrains. You control execution.</span>
          <span>
            {live
              ? 'Real reads · reviewed wallet execution'
              : 'Synthetic replay · no chain transactions'}
          </span>
        </footer>
      </main>
    </div>
  );
}
