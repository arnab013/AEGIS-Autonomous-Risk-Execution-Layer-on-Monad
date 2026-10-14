import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JevPolicyPanel } from '../src/components/JevPolicyPanel.tsx';
import { DecisionFlow } from '../src/components/DecisionFlow.tsx';
import { ExplainabilityModal } from '../src/components/ExplainabilityModal.tsx';
import { TradeReview } from '../src/components/TradeReview.tsx';
import { PortfolioPanel } from '../src/components/PortfolioPanel.tsx';
import { Dashboard } from '../src/components/Dashboard.tsx';
import { liveReadsAllowed, walletBalancesReady } from '../src/ui/sessionActivity.ts';
import { Header } from '../src/components/Header.tsx';
import { AuditTrailPanel } from '../src/components/AuditTrailPanel.tsx';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { JevClient } from '../src/jev/client.ts';
import { JevPolicyEngine } from '../src/jev/policyEngine.ts';
import { REPLAY_SCENARIOS } from '../src/data/scenarios.ts';
import type { KuruPreparedTrade } from '../src/execution/kuruClient.ts';
import {
  createAssessmentSnapshot,
  manualTradeAudit,
  tradeStateAfterError,
  type EvidenceContext,
  type TradeLifecycle,
} from '../src/ui/evidence.ts';

const epoch = Date.parse('2026-10-08T00:00:00Z');
const hash = `0x${'a'.repeat(64)}`;
const noop = () => {};

function text(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function buttons(markup: string) {
  return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    label: text(match[2]),
    disabled: /\bdisabled(?:=|\s|$)/.test(match[1]),
  }));
}

function providerFixture() {
  return {
    model: 'jev-presentation-fixture',
    answers: {
      action: {
        type: 'choice',
        choice: 'reduce_position',
        confidence: 0.9,
        probabilities: {
          increase_position: 0.01,
          reduce_position: 0.9,
          hold: 0.07,
          hedge: 0.01,
          cancel_orders: 0.01,
        },
      },
      regime: {
        type: 'choice',
        choice: 'range_bound',
        confidence: 0.9,
        probabilities: {
          trending_up: 0.02,
          trending_down: 0.02,
          range_bound: 0.9,
          high_volatility: 0.02,
          liquidity_stress: 0.02,
          uncertain: 0.02,
        },
      },
      risk: {
        type: 'choice',
        choice: 'moderate',
        confidence: 0.9,
        probabilities: { very_low: 0.01, low: 0.03, moderate: 0.9, high: 0.05, critical: 0.01 },
      },
      anomaly: { type: 'noul', noul: 0.05 },
      cancel_orders: { type: 'noul', noul: 0.05 },
    },
    usage: { input_tokens: 600, output_tokens: 100 },
  };
}

async function assessment(source: 'fallback' | 'heuristic' | 'jev') {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(providerFixture())));
  const client =
    source === 'jev'
      ? new JevClient({ mode: 'live', apiKey: 'test-only-key', fetcher })
      : new JevClient({ mode: source === 'fallback' ? 'disabled' : 'simulated' });
  const scenario = REPLAY_SCENARIOS[0];
  const engine = new StateEngine(
    scenario.initial_position,
    undefined,
    new JevPolicyEngine(client),
    { now: () => epoch }
  );
  const tick = scenario.ticks[0];
  engine.updateMarketState(
    tick.bids,
    tick.asks,
    tick.aggressive_buy_flow,
    tick.aggressive_sell_flow,
    epoch
  );
  const cycle = await engine.step(250, { execute: source === 'heuristic' });
  if (source === 'jev') expect(fetcher).toHaveBeenCalledOnce();
  else expect(fetcher).not.toHaveBeenCalled();
  return createAssessmentSnapshot(cycle, source === 'heuristic' ? 'replay' : 'live');
}

function proposal(chainId = 143): KuruPreparedTrade {
  const account = '0x000000000000000000000000000000000000dEaD';
  const marketAddress = '0x065C9d28E428A0db40191a54d33d5b7c71a9C394';
  return {
    id: `0x${'b'.repeat(64)}`,
    chainId,
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
      chainId: `0x${chainId.toString(16)}`,
      value: `0x${BigInt('200000000000000000000').toString(16)}`,
      data: '0x1234',
      gas: '0x57e40',
    },
  };
}

function manualEvidence(trade = proposal()): Extract<EvidenceContext, { kind: 'manual_trade' }> {
  return {
    kind: 'manual_trade',
    proposal: trade,
    checkedAt: epoch + 1000,
    checks: {
      allowed: true,
      violations: [],
      sanitized_action: 'reduce_position',
      checks: {
        sell_quantity: { passed: true, message: 'Exact quantity fits wallet inventory' },
        max_slippage_bps: { passed: true, message: 'Trade is within the 40 bps limit' },
      },
    },
    transaction: { status: 'prepared', proposal: trade },
  };
}

function review(
  transaction: TradeLifecycle,
  prepared: KuruPreparedTrade | null,
  now: number,
  activity: { busy?: boolean; agentPending?: boolean; preparing?: boolean } = {}
) {
  return renderToStaticMarkup(
    <TradeReview
      transaction={transaction}
      prepared={prepared}
      now={now}
      chainId={transaction.proposal?.chainId}
      minimumMon="200"
      tradeSizeUsd={5}
      canPrepare={true}
      canSubmit={true}
      busy={activity.busy ?? false}
      agentPending={activity.agentPending}
      preparing={activity.preparing}
      hasWallet={true}
      onPrepare={noop}
      onSubmit={noop}
      onInspect={noop}
      onCheckConfirmation={noop}
    />
  );
}

describe('Financial provenance survives presentation', () => {
  it('does not present cached fallback defaults as model probabilities or confidence', async () => {
    const snapshot = await assessment('fallback');
    snapshot.decision.source = 'cached';
    expect(snapshot.decision.confidence_score).toBeGreaterThan(0);
    expect(snapshot.decision.action_probabilities.hold).toBeGreaterThan(0);
    const card = text(
      renderToStaticMarkup(<JevPolicyPanel snapshot={snapshot} onOpenExplainability={noop} />)
    );
    const flow = text(renderToStaticMarkup(<DecisionFlow snapshot={snapshot} />));
    expect(card).toContain('AI assessment unavailable');
    expect(card).toContain('Safe fallback');
    expect(card).toContain('cached result');
    expect(flow).toContain('AI unavailable');
    for (const output of [card, flow]) {
      expect(output).not.toMatch(
        /confidence|probability vector|relative action probabilities|heuristic action weights/i
      );
      expect(output).not.toMatch(/\d+(?:\.\d+)?\s*%/);
    }
  });

  it('identifies replay weights and never calls them a paid model assessment', async () => {
    const snapshot = await assessment('heuristic');
    const output = text(
      renderToStaticMarkup(<JevPolicyPanel snapshot={snapshot} onOpenExplainability={noop} />)
    );
    expect(output).toContain('Heuristic replay');
    expect(output).toContain('No model request was made');
    expect(output).toContain('Heuristic action weights');
    expect(output).not.toContain('TypeSafe confidence');
    expect(output).not.toContain('Jev assessed the captured observation');
  });

  it('labels a typed provider response as relative choices while keeping live execution separate', async () => {
    const snapshot = await assessment('jev');
    const card = text(
      renderToStaticMarkup(<JevPolicyPanel snapshot={snapshot} onOpenExplainability={noop} />)
    );
    const flow = text(renderToStaticMarkup(<DecisionFlow snapshot={snapshot} />));
    expect(card).toContain('Jev · jev-presentation-fixture');
    expect(card).toContain('Relative action probabilities');
    expect(card).toContain('They do not estimate profit or give permission to trade');
    expect(card).toContain('Wallet execution requires a separate trade review');
    expect(flow).toContain('Observation only');
    expect(flow).not.toMatch(/confirmed|submitted|paper fill/i);
  });

  it("keeps manual evidence free of an independent assessment's model and probabilities", async () => {
    const snapshot = await assessment('jev');
    const context = manualEvidence();
    const markup = renderToStaticMarkup(
      <>
        <JevPolicyPanel snapshot={snapshot} onOpenExplainability={noop} />
        <ExplainabilityModal context={context} onClose={noop} />
      </>
    );
    expect(text(markup)).toContain('jev-presentation-fixture');
    expect(text(markup)).toContain('90.0%');
    const dialog = text(markup.match(/<dialog\b[\s\S]*?<\/dialog>/)![0]);
    expect(dialog).toContain('User requested MON reduction');
    expect(dialog).toContain('independent of the AI assessment');
    expect(dialog).toContain('200 MON');
    expect(dialog).toContain('4.98 USDC');
    expect(dialog).toContain('Simulation does not confirm a fill');
    expect(dialog).toContain('No transaction submitted');
    expect(dialog).not.toMatch(
      /jev-presentation-fixture|confidence|probabilit(?:y|ies)|heuristic action weights/i
    );
    expect(dialog).not.toMatch(/\d+(?:\.\d+)?\s*%/);
  });

  it('shows an unknown-network hash without directing users to a different chain explorer', () => {
    const context = manualEvidence(proposal(1));
    context.transaction = { status: 'pending', hash, proposal: context.proposal };
    const event = manualTradeAudit(context, 'unknown-network');
    const outputs = [
      renderToStaticMarkup(<ExplainabilityModal context={context} onClose={noop} />),
      review(context.transaction, null, epoch + 50000),
      renderToStaticMarkup(<AuditTrailPanel events={[event]} />),
    ];
    for (const output of outputs) {
      expect(text(output)).toContain(hash);
      expect(output).not.toMatch(/href="https?:\/\/(?:testnet\.)?monadvision\.com\/tx/);
    }
  });
});

describe('Trade review cannot imply authorization or a receipt', () => {
  it('allows read-only Scout context refresh while preparation and signing stay disabled', () => {
    const activity = { busy: true, agentPending: true };
    expect(liveReadsAllowed(activity.busy, activity.agentPending)).toBe(true);
    const idle = review({ status: 'idle' }, null, epoch, activity);
    expect(buttons(idle)).toContainEqual({ label: 'Waiting for Scout…', disabled: true });
    expect(text(idle)).not.toContain('Preparing & simulating');
    const trade = proposal();
    const prepared = review({ status: 'prepared', proposal: trade }, trade, epoch, activity);
    expect(buttons(prepared)).toContainEqual({ label: 'Confirm in wallet', disabled: true });
    expect(liveReadsAllowed(true, false)).toBe(false);
    expect(liveReadsAllowed(false, false)).toBe(true);
    const preparing = review({ status: 'idle' }, null, epoch, {
      busy: true,
      preparing: true,
    });
    expect(buttons(preparing)).toContainEqual({
      label: 'Preparing & simulating…',
      disabled: true,
    });
  });

  it('offers no enabled wallet confirmation once the proposal expires', () => {
    const trade = proposal();
    const transaction: TradeLifecycle = { status: 'prepared', proposal: trade };
    const fresh = review(transaction, trade, trade.expiresAt - 1);
    expect(buttons(fresh)).toContainEqual({ label: 'Confirm in wallet', disabled: false });
    for (const now of [trade.expiresAt, trade.expiresAt + 1000]) {
      const expired = review(transaction, trade, now);
      expect(text(expired)).toContain('Proposal expired');
      expect(
        buttons(expired).some((button) => button.label === 'Confirm in wallet' && !button.disabled)
      ).toBe(false);
      expect(text(expired)).toContain('4.98 USDC');
      expect(text(expired)).toContain('no onchain deadline');
    }
  });

  it('retains submitted terms and hash after timeout without presenting failure or a confirmed fill', () => {
    const trade = proposal();
    const transaction = tradeStateAfterError(
      { status: 'submitted', hash, proposal: trade },
      new Error('Receipt timeout')
    );
    const markup = review(transaction, null, trade.expiresAt + 60000);
    const output = text(markup);
    expect(output).toContain('Submitted · confirmation unavailable');
    expect(output).toContain(hash);
    expect(output).toContain('200 MON');
    expect(output).toContain('4.98 USDC');
    expect(output).not.toMatch(
      /stopped before submission|transaction reverted|confirmed fill|execution failed/i
    );
    expect(buttons(markup)).toContainEqual({ label: 'Check confirmation', disabled: false });
    expect(
      buttons(markup).some((button) => button.label === 'Confirm in wallet' && !button.disabled)
    ).toBe(false);
    expect(buttons(markup)).toContainEqual({ label: 'Prepare & simulate', disabled: true });
  });

  it('does not display the retained mainnet context as a connection during replay', () => {
    const markup = renderToStaticMarkup(
      <Header
        isPaused={false}
        onTogglePause={noop}
        operationMode="replay"
        onToggleMode={noop}
        rpcLatencyMs={12}
        chainId={143}
        blockNumber="111000000"
        marketTimestamp={epoch}
        now={epoch + 1000}
      />
    );
    const output = text(markup);
    expect(output).toContain('Synthetic replay');
    expect(output).toContain('Paper activity · no chain execution');
    expect(output).not.toMatch(/Mainnet|block 111000000|Observed 1s ago/);
    expect(markup).not.toMatch(/connection-dot[^"\n]*is-fresh/);
  });
});

describe('Connected wallet reads distinguish unavailable values from verified zero', () => {
  const account = '0x000000000000000000000000000000000000dEaD';
  const otherAccount = '0x000000000000000000000000000000000000bEEF';

  function portfolio(observedAccount: string | null) {
    const engine = new StateEngine();
    engine.position.spot_balance_mon = 0;
    engine.position.usdc_balance = 0;
    engine.position.spot_exposure_usd = 0;
    return renderToStaticMarkup(
      <PortfolioPanel
        position={engine.position}
        orders={engine.orders}
        policy={engine.policy}
        risk={engine.computeRiskMetrics()}
        live
        hasWallet
        balancesReady={walletBalancesReady(account, observedAccount)}
      />
    );
  }

  it.each([null, otherAccount])(
    'hides zero placeholders without a read for this account',
    (read) => {
      const output = text(portfolio(read));
      expect(output).toContain('Reading connected wallet balances');
      expect(output).not.toContain('MON balance 0 MON');
      expect(output).not.toContain('USDC balance 0 USDC');
    }
  );

  it('shows actual zero after a successful read for the same account, regardless of casing', () => {
    const output = text(portfolio(account.toLowerCase()));
    expect(output).toContain('MON balance 0 MON');
    expect(output).toContain('USDC balance 0 USDC');
    expect(output).not.toContain('Reading connected wallet balances');
    expect(walletBalancesReady(null, account)).toBe(false);
  });

  it('does not ask an already connected dashboard wallet to connect again while reading', () => {
    const engine = new StateEngine();
    const output = text(
      renderToStaticMarkup(
        <Dashboard
          mode="live"
          walletAddress={account}
          policy={engine.policy}
          events={[]}
          chat={null}
          onOpenWorkspace={noop}
          onReplay={noop}
          onHome={noop}
          onOpenAiAccess={noop}
        />
      )
    );
    expect(output).toContain('Reading wallet balances…');
    expect(output).not.toContain('Connect wallet');
  });
});
