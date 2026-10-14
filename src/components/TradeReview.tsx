import React from 'react';
import type { KuruPreparedTrade } from '../execution/kuruClient.ts';
import type { TradeLifecycle } from '../ui/evidence.ts';
import { explorerTxUrl } from '../ui/evidence.ts';
import { ShieldCheck, ExternalLink } from './icons.tsx';

interface TradeReviewProps {
  transaction: TradeLifecycle;
  prepared: KuruPreparedTrade | null;
  now: number;
  chainId?: number;
  minimumMon: string | null;
  tradeSizeUsd: number;
  canPrepare: boolean;
  canSubmit: boolean;
  busy: boolean;
  preparing?: boolean;
  agentPending?: boolean;
  hasWallet: boolean;
  onPrepare: () => void;
  onSubmit: () => void;
  onInspect: () => void;
  onCheckConfirmation: () => void;
}

const statusLabels: Record<TradeLifecycle['status'], string> = {
  idle: 'Ready to review',
  prepared: 'Simulation passed',
  awaiting_wallet: 'Awaiting wallet approval',
  submitted: 'Submitted · awaiting receipt',
  pending: 'Submitted · confirmation unavailable',
  confirmed: 'Confirmed fill',
  reverted: 'Transaction reverted',
  stopped: 'Stopped before submission',
};

export function TradeReview({
  transaction,
  prepared,
  now,
  chainId,
  minimumMon,
  tradeSizeUsd,
  canPrepare,
  canSubmit,
  busy,
  preparing = false,
  agentPending = false,
  hasWallet,
  onPrepare,
  onSubmit,
  onInspect,
  onCheckConfirmation,
}: TradeReviewProps) {
  const proposal = transaction.proposal;
  const secondsLeft = prepared ? Math.max(0, Math.ceil((prepared.expiresAt - now) / 1000)) : 0;
  const expired = Boolean(prepared && now >= prepared.expiresAt);
  const txUrl = transaction.hash ? explorerTxUrl(transaction.hash, proposal?.chainId) : undefined;
  const unresolved = transaction.status === 'pending' || transaction.status === 'submitted';
  return (
    <section className="trade-card terminal-card" aria-labelledby="trade-title">
      <div className="panel-heading">
        <div className="panel-title">
          <ShieldCheck className="w-4 h-4" />
          <h2 id="trade-title">Protective MON sale</h2>
        </div>
        <span className="context-badge">User initiated</span>
      </div>
      <p className="trade-intro">
        Review a native MON → USDC sale on Kuru. This action is independent of the AI assessment.
      </p>
      <div className="trade-summary">
        <span>Trade size target</span>
        <strong>${tradeSizeUsd.toLocaleString()} USD</strong>
        <a href="#mandate">Edit size or limits</a>
      </div>
      {!proposal && (
        <p className="muted-note">
          {minimumMon ? 'Market minimum: ' + minimumMon + ' MON. ' : ''}
          {hasWallet
            ? 'Preparation simulates the exact sale before wallet approval.'
            : 'Connect a wallet to read its balances and prepare a sale.'}
        </p>
      )}
      {proposal && (
        <>
          <dl className="trade-terms">
            <div>
              <dt>Sell exactly</dt>
              <dd>
                {proposal.amountMon} <span>MON</span>
              </dd>
            </div>
            <div>
              <dt>Estimated output</dt>
              <dd>
                {proposal.estimatedOutUsdc} <span>USDC</span>
              </dd>
            </div>
            <div className="trade-minimum">
              <dt>Minimum output</dt>
              <dd>
                {proposal.minOutUsdc} <span>USDC</span>
              </dd>
            </div>
            <div>
              <dt>Slippage cap</dt>
              <dd>
                {proposal.slippageBps} <span>bps</span>
              </dd>
            </div>
          </dl>
          <div className="trade-freshness" role="status">
            {prepared
              ? expired
                ? 'Proposal expired. Prepare a fresh simulation.'
                : 'Proposal expires in ' + secondsLeft + 's'
              : 'Reviewed proposal retained for this transaction.'}
          </div>
          <details className="technical-details">
            <summary>Network and transaction details</summary>
            <dl className="evidence-facts">
              <div>
                <dt>Network</dt>
                <dd>
                  Monad{' '}
                  {proposal.chainId === 143
                    ? 'Mainnet'
                    : proposal.chainId === 10143
                      ? 'Testnet'
                      : proposal.chainId}{' '}
                  · {proposal.chainId}
                </dd>
              </div>
              <div>
                <dt>Simulation block</dt>
                <dd>{proposal.snapshotBlockNumber}</dd>
              </div>
              <div>
                <dt>Gas estimate</dt>
                <dd>{Number(proposal.gasEstimate).toLocaleString()} gas units</dd>
              </div>
              <div>
                <dt>Target contract</dt>
                <dd className="breakable-value">{proposal.marketAddress}</dd>
              </div>
              <div>
                <dt>Review expires</dt>
                <dd>{new Date(proposal.expiresAt).toLocaleTimeString()}</dd>
              </div>
            </dl>
          </details>
          <p className="trade-warning">
            Fill-or-kill and minimum output are enforced by Kuru. This transaction has no onchain
            deadline. Reject an already-open wallet prompt if it becomes stale.
          </p>
        </>
      )}
      <div className={'trade-status trade-status-' + transaction.status} role="status">
        <strong>{statusLabels[transaction.status]}</strong>
        {transaction.detail && <p>{transaction.detail}</p>}
        {transaction.receivedUsdc && transaction.status === 'confirmed' && (
          <p>Received {transaction.receivedUsdc} USDC.</p>
        )}
      </div>
      {transaction.hash && (
        <div className="transaction-reference">
          {txUrl ? (
            <a href={txUrl} target="_blank" rel="noreferrer">
              View submitted transaction <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <span>Transaction reference</span>
          )}
          <code>{transaction.hash}</code>
        </div>
      )}
      <div className="trade-actions">
        {prepared && !expired ? (
          <button className="primary-button" disabled={!canSubmit || busy} onClick={onSubmit}>
            Confirm in wallet
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={!canPrepare || busy || unresolved}
            onClick={onPrepare}
          >
            {preparing
              ? 'Preparing & simulating…'
              : agentPending
                ? 'Waiting for Scout…'
                : busy
                  ? 'Another review is in progress'
                  : 'Prepare & simulate'}
          </button>
        )}
        {proposal && <button onClick={onInspect}>Trade evidence</button>}
        {unresolved && (
          <button disabled={busy} onClick={onCheckConfirmation}>
            Check confirmation
          </button>
        )}
      </div>
      <p className="muted-note">
        {chainId ? 'Monad ' + chainId + ' · ' : ''}Preparation moves no funds. Signing requires your
        explicit wallet action.
      </p>
    </section>
  );
}
