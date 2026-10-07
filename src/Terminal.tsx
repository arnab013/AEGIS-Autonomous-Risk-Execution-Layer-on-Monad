import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MarketPanel } from './components/MarketPanel.tsx';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { JevPolicyPanel } from './components/JevPolicyPanel.tsx';
import { ExplainabilityModal } from './components/ExplainabilityModal.tsx';
import { AuditTrailPanel } from './components/AuditTrailPanel.tsx';
import { ReplayControlBar } from './components/ReplayControlBar.tsx';
import { StateEngine } from './engine/stateEngine.ts';
import { HardRiskGate } from './engine/riskGate.ts';
import type { EngineCycleOutput } from './engine/stateEngine.ts';
import { JevPolicyEngine } from './jev/policyEngine.ts';
import { JevClient } from './jev/client.ts';
import { buildJevStatePayload, hashStatePayload } from './jev/stateBuilder.ts';
import { REPLAY_SCENARIOS } from './data/scenarios.ts';
import { MonadClient, monadTestnetConfig, monadMainnetConfig } from './execution/monadClient.ts';
import { KuruClient, kuruTestnetConfig, kuruMainnetConfig } from './execution/kuruClient.ts';
import type { KuruPreparedTrade } from './execution/kuruClient.ts';
import type { AuditEvent, PositionState, UserPolicy } from './types/index.ts';

interface ServiceStatus { inferenceEnabled: boolean; jevConfigured: boolean; chainId: number; marketAddress: string; rpcUrl: string; model: string }
const emptyPosition = (): PositionState => ({ spot_exposure_usd: 0, perp_exposure_usd: 0, net_delta: 0, leverage: 0, unrealized_pnl: 0, realized_pnl_today: 0, drawdown_today: 0, spot_balance_mon: 0, usdc_balance: 0, perp_short_size_mon: 0 });
const replayEpoch = Date.UTC(2026, 9, 1);
async function api<T>(route: string, value?: unknown): Promise<T> {
  const response = await fetch(route, value === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export const Terminal: React.FC = () => {
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const modeRef = useRef(mode); modeRef.current = mode;
  const [scenarioId, setScenarioId] = useState(REPLAY_SCENARIOS[0].id);
  const [tickIndex, setTickIndex] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState(false);
  const [state, setState] = useState<EngineCycleOutput | null>(null);
  const stateRef = useRef<EngineCycleOutput | null>(null);
  stateRef.current = state;
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [block, setBlock] = useState('Unavailable');
  const [latency, setLatency] = useState<number | null>(null);
  const [clip, setClip] = useState(250);
  const [prepared, setPrepared] = useState<KuruPreparedTrade | null>(null);
  const [txState, setTxState] = useState('');
  const [minimumMon, setMinimumMon] = useState<string | null>(null);
  const sizeDecimals = useRef(10);
  const [policy, setPolicy] = useState<UserPolicy>(() => new StateEngine().policy);
  const policyRef = useRef(policy); policyRef.current = policy;
  const walletRef = useRef(wallet); walletRef.current = wallet;
  const authorizationVersion = useRef(0);
  const engine = useRef(new StateEngine());
  const liveGate = useRef(new HardRiskGate());
  const generation = useRef(0);
  const pending = useRef(false);
  const replayClock = useRef(replayEpoch);
  const scenario = REPLAY_SCENARIOS.find(item => item.id === scenarioId)!;
  const networkConfig = status?.chainId === 143 ? monadMainnetConfig : monadTestnetConfig;
  const kuruConfig = status?.chainId === 143 ? kuruMainnetConfig : kuruTestnetConfig;

  const record = useCallback((event: AuditEvent) => {
    setEvents(previous => [event, ...previous].slice(0, 200));
    void api('/api/audit', event).catch(() => setNotice('Audit journal is unavailable; events remain visible in this session.'));
  }, []);

  useEffect(() => {
    void api<ServiceStatus>('/api/status').then(setStatus).catch(() => setNotice('API service unavailable. Start the app with npm run dev to use live data and save the audit journal.'));
  }, []);

  useEffect(() => {
    const token = ++generation.current;
    setPlaying(false); setTickIndex(0); setPrepared(null); setState(null); stateRef.current = null; setNotice('');
    replayClock.current = replayEpoch;
    const next = mode === 'replay'
      ? new StateEngine(structuredClone(scenario.initial_position), { ...policy }, new JevPolicyEngine(new JevClient({ mode: 'simulated' })), { now: () => replayClock.current })
      : new StateEngine(emptyPosition(), { ...policy }, new JevPolicyEngine(new JevClient({ mode: 'disabled', enableCache: false })));
    engine.current = next;
    if (mode === 'replay') {
      next.orders.open_orders = structuredClone(scenario.initial_orders);
      const tick = scenario.ticks[0];
      next.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow, replayClock.current);
      void next.step(clip).then(result => { if (generation.current === token) { setState(result); record(result.auditEvent); } }).catch(error => setNotice(error.message));
    }
  }, [mode, scenarioId, resetVersion]);

  const refreshMarket = useCallback(async () => {
    if (mode !== 'live') return;
    const token = generation.current;
    const snapshot = await api<any>('/api/market');
    if (generation.current !== token) return;
    const current = engine.current;
    current.market.pair = snapshot.pair;
    current.updateMarketState(snapshot.bids, snapshot.asks, 0, 0, snapshot.timestamp);
    current.market.pair = snapshot.pair;
    setBlock(String(snapshot.blockNumber)); setLatency(snapshot.latencyMs);
    if (snapshot.metadata) { setMinimumMon(String(Number(snapshot.metadata.minSize) / Number(snapshot.metadata.sizePrecision))); sizeDecimals.current = Math.round(Math.log10(Number(snapshot.metadata.sizePrecision))); }
    if (wallet) {
      const holdings = await api<{ mon: string; usdc: string }>(`/api/portfolio?account=${encodeURIComponent(wallet)}`);
      if (generation.current !== token || walletRef.current !== wallet) return;
      setBalance(holdings.mon);
      const mon = Number(holdings.mon), usdc = Number(holdings.usdc);
      const exposure = mon * current.market.mid_price;
      current.position = { ...emptyPosition(), spot_balance_mon: mon, usdc_balance: usdc, spot_exposure_usd: exposure, net_delta: exposure, leverage: exposure / Math.max(exposure + usdc, 0.00001) };
    } else current.position = emptyPosition();
    const first = stateRef.current ? null : await current.step(clip, { execute: false });
    if (generation.current !== token) return;
    setState(previous => previous ? { ...previous, market: structuredClone(current.market), position: { ...current.position }, risk: current.computeRiskMetrics(), orders: structuredClone(current.orders) } : first);
    setNotice('');
  }, [mode, wallet]);

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false, running = false;
    const poll = async () => {
      if (running || cancelled || pending.current) return;
      running = true;
      try { await refreshMarket(); } catch (error) { if (!cancelled) setNotice(`Live market unavailable: ${(error as Error).message}`); } finally { running = false; }
    };
    void poll(); const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [refreshMarket]);

  const evaluate = useCallback(async (advance = false, useJev = true) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setPrepared(null);
    const token = generation.current;
    try {
      if (mode === 'live') await refreshMarket();
      else if (advance) {
        const index = Math.min(tickIndex + 1, scenario.ticks.length - 1);
        const tick = scenario.ticks[index]; replayClock.current = replayEpoch + tick.timestamp_offset_ms;
        engine.current.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow, replayClock.current);
        setTickIndex(index); if (index === scenario.ticks.length - 1) setPlaying(false);
      }
      engine.current.policy = { ...policyRef.current };
      const previousPolicyEngine = engine.current.jevPolicy;
      if (mode === 'live' && useJev) engine.current.jevPolicy = new JevPolicyEngine(new JevClient({ mode: 'live', proxyUrl: '/api/jev', enableCache: false, timeoutMs: 9000 }));
      let result: EngineCycleOutput;
      try { result = await engine.current.step(clip, { execute: mode === 'replay' }); }
      finally { engine.current.jevPolicy = previousPolicyEngine; }
      if (generation.current === token) { setState(result); record(result.auditEvent); }
    } catch (error) { setNotice((error as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }, [mode, tickIndex, scenario, policy, clip, refreshMarket, record]);

  useEffect(() => { if (!playing || mode !== 'replay') return; const timer = setTimeout(() => void evaluate(true), 2200); return () => clearTimeout(timer); }, [playing, evaluate, mode]);
  useEffect(() => { engine.current.policy = { ...policy }; authorizationVersion.current++; setPrepared(null); }, [policy, clip]);

  function disconnect() {
    generation.current++; authorizationVersion.current++; walletRef.current = null;
    setWallet(null); setBalance(null); setPrepared(null);
    if (mode === 'live') { engine.current.position = emptyPosition(); stateRef.current = null; setState(null); }
  }

  async function connect() {
    setConnecting(true);
    try {
      const client = new MonadClient(networkConfig);
      const result = await client.connectBrowserWallet(); setWallet(result.address); walletRef.current = result.address; setBalance(await client.getBalance(result.address)); setNotice('');
    } catch (error) { setNotice((error as Error).message); } finally { setConnecting(false); }
  }
  useEffect(() => {
    const provider = (window as any).ethereum;
    const invalidate = () => {
      authorizationVersion.current++; walletRef.current = null; setWallet(null); setBalance(null); setPrepared(null);
      if (modeRef.current === 'live') { generation.current++; engine.current.position = emptyPosition(); setState(null); stateRef.current = null; }
      setNotice('Wallet account or network changed. Reconnect to review a fresh proposal.');
    };
    provider?.on?.('accountsChanged', invalidate); provider?.on?.('chainChanged', invalidate);
    return () => { provider?.removeListener?.('accountsChanged', invalidate); provider?.removeListener?.('chainChanged', invalidate); };
  }, []);
  function reductionGate(amountUsd: number) {
    const current = engine.current;
    current.policy = { ...policyRef.current };
    const result = liveGate.current.evaluateAction('reduce_position', current.policy, current.position, current.market, current.orders, amountUsd);
    if (!result.allowed) throw new Error(result.violations.join('; '));
    return result;
  }
  async function prepareReduction() {
    if (!wallet || mode !== 'live' || pending.current) return;
    pending.current = true;
    const token = generation.current, policyVersion = authorizationVersion.current;
    setBusy(true); setPrepared(null); setTxState('');
    try {
      await refreshMarket(); reductionGate(clip);
      if (token !== generation.current || policyVersion !== authorizationVersion.current || walletRef.current !== wallet) throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      const scale = 10 ** sizeDecimals.current;
      const amountMon = (Math.floor(clip / engine.current.market.mid_price * scale) / scale).toFixed(sizeDecimals.current);
      const proposal = await api<KuruPreparedTrade>('/api/prepare', { account: wallet, amountMon, slippageBps: policy.max_slippage_bps });
      if (Number(proposal.minOutUsdc) / Number(proposal.amountMon) < engine.current.market.mid_price * (1 - policyRef.current.max_slippage_bps / 10000)) throw new Error('Trade minimum output would exceed the total slippage cap. Prepare a smaller clip.');
      if (token !== generation.current || policyVersion !== authorizationVersion.current || walletRef.current !== wallet) throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      setPrepared(proposal); setTxState('Simulation passed. Review the exact trade before opening your wallet. The direct Kuru transaction enforces minimum output, but has no onchain deadline; reject a wallet prompt if it becomes stale.');
    } catch (error) { setNotice((error as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  async function submitReduction() {
    if (!prepared || !wallet || pending.current) return;
    pending.current = true;
    const token = generation.current, policyVersion = authorizationVersion.current;
    const proposal = prepared;
    setBusy(true);
    try {
      await refreshMarket();
      const checks = reductionGate(Number(proposal.amountMon) * engine.current.market.mid_price);
      if (Number(proposal.minOutUsdc) / Number(proposal.amountMon) < engine.current.market.mid_price * (1 - policyRef.current.max_slippage_bps / 10000)) throw new Error('Market price changed beyond the reviewed total slippage cap. Prepare again.');
      if (token !== generation.current || policyVersion !== authorizationVersion.current || walletRef.current !== wallet) throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      const client = new KuruClient(kuruConfig);
      const current = engine.current;
      const liveHash = hashStatePayload(buildJevStatePayload(current.market, current.position, current.orders, current.computeRiskMetrics(), current.policy));
      const base = state?.auditEvent ? { ...state.auditEvent, market_state_hash: liveHash, jev_model: 'not_used_for_user_action', decision_source: 'user', selected_action: 'reduce_position' as const, confidence: 1, action_probabilities: { increase_position: 0, reduce_position: 1, hold: 0, hedge: 0, cancel_orders: 0 }, hard_checks: Object.fromEntries(Object.entries(checks.checks).map(([key, value]) => [key, value.passed])) } : undefined;
      setTxState('Awaiting wallet confirmation…');
      const hash = await client.submitPreparedTrade(proposal);
      setPrepared(null); setTxState(`Submitted ${hash}. Waiting for Monad receipt…`);
      if (base) record({ ...base, id: crypto.randomUUID(), timestamp: new Date().toISOString(), selected_action: 'reduce_position', hard_checks: Object.fromEntries(Object.entries(checks.checks).map(([key, value]) => [key, value.passed])), execution_allowed: true, transaction_hash: hash, chain_id: proposal.chainId, venue: 'kuru', user_initiated: true, execution_mode: 'wallet', transaction_status: 'submitted', reason: 'User requested a protective MON reduction. Hard risk checks and Kuru simulation passed; fill is pending receipt.' });
      const { receipt, receivedUsdc } = await client.waitForTradeReceipt(proposal, hash);
      if (receipt.status === 'confirmed') liveGate.current.recordExecution();
      setTxState(receipt.status === 'confirmed' ? `Confirmed on Monad: received ${receivedUsdc} USDC · ${hash}` : `Transaction reverted: ${hash}`);
      if (base) record({ ...base, id: crypto.randomUUID(), timestamp: new Date().toISOString(), selected_action: 'reduce_position', execution_allowed: true, transaction_hash: hash, chain_id: proposal.chainId, venue: 'kuru', user_initiated: true, execution_mode: 'wallet', transaction_status: receipt.status, reason: `Wallet-reviewed Kuru reduction: ${receipt.status}. Balances refreshed from chain.` });
      await refreshMarket();
    } catch (error) { setTxState(`Execution stopped: ${(error as Error).message}`); } finally { pending.current = false; setBusy(false); }
  }
  const source = state?.jevDecision.origin || state?.jevDecision.source;
  return <div className="aegis-app">
    <Header isPaused={policy.is_paused} onTogglePause={() => { setPolicy(previous => ({ ...previous, is_paused: !previous.is_paused })); setPlaying(false); }} operationMode={mode} onToggleMode={nextMode => { authorizationVersion.current++; setMode(nextMode); }} rpcLatencyMs={latency} blockNumber={block} chainId={status?.chainId || 10143} walletAddress={wallet} walletBalanceMon={balance} isConnectingWallet={connecting} onConnectWallet={connect} onDisconnectWallet={disconnect} />
    <main className="app-main">
      <div className="context-strip"><strong>{mode === 'replay' ? 'REPLAY LAB' : `LIVE · MONAD ${status?.chainId === 143 ? 'MAINNET' : 'TESTNET'}`}</strong><span>{mode === 'replay' ? 'Synthetic scenarios · heuristic probabilities · paper fills' : 'Kuru contract data · wallet balances · reviewed execution'}</span><span className="source-pill">{source === 'typesafe_jev' ? `Jev · ${state?.jevDecision.model}` : source === 'simulated' ? 'Heuristic model' : 'Jev: waiting / fallback'}</span></div>
      {notice && <div className="notice" role="status">{notice}</div>}
      <section className="mandate terminal-card">
        <div className="mandate-heading"><div><strong>YOUR MANDATE</strong><p>Bounded MON exposure. Every action must pass these limits.</p></div><span>{policy.is_paused ? 'PAUSED' : 'POLICY ACTIVE'}</span></div>
        <div className="policy-fields">{([
          ['max_position_usd', 'Position cap · USD'], ['max_order_size', 'Order cap · USD'], ['max_daily_loss', 'Daily loss cap · USD'], ['max_leverage', 'Leverage cap · ×'], ['max_slippage_bps', 'Slippage cap · bps'], ['min_liquidity_depth_usd', 'Min. depth · USD'],
        ] as [keyof UserPolicy, string][]).map(([key, label]) => <label key={key}>{label}<input disabled={busy} type="number" min="0.01" step={key === 'max_leverage' ? '0.1' : '1'} value={Number(policy[key])} onChange={event => setPolicy(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}<label>Trade size · USD<input disabled={busy} type="number" min="0.01" value={clip} onChange={event => setClip(Number(event.target.value))} /></label></div>
        <p className="muted-note">{mode === 'live' ? 'Live portfolio covers wallet MON and USDC. Perp exposure, resting orders, historical daily loss and drawdown are not indexed; unattended trading is unavailable.' : 'These limits also constrain replay fills. Simulation performance is not a forecast of live returns.'}</p>
      </section>
      {mode === 'replay' ? <ReplayControlBar currentScenarioId={scenarioId} onSelectScenario={setScenarioId} isPlaying={playing} onTogglePlay={() => setPlaying(previous => !previous)} onStepTick={() => void evaluate(true)} onResetScenario={() => setResetVersion(previous => previous + 1)} currentTickIndex={tickIndex} totalTicks={scenario.ticks.length} /> : <section className="live-controls terminal-card"><div><strong>Live policy review</strong><p>{status?.inferenceEnabled ? 'Evaluate the current snapshot with Jev. Each click uses API credits.' : 'Live Jev is disabled until API credit usage is approved and JEV_ENABLE_LIVE=true is set.'}</p></div><button disabled={busy || !status?.inferenceEnabled} onClick={() => void evaluate()}>Evaluate with Jev</button><button disabled={busy} onClick={() => void evaluate(false, false)}>Inspect safety state</button></section>}
      {state ? <div className="terminal-grid"><MarketPanel key={`${mode}-${scenarioId}-${resetVersion}`} market={state.market} live={mode === 'live'} /><PortfolioPanel hasWallet={Boolean(wallet)} position={state.position} orders={state.orders} policy={policy} risk={state.risk} live={mode === 'live'} /><JevPolicyPanel decision={state.jevDecision} riskCheck={state.riskCheck} lastTxHash={state.txHash} onOpenExplainability={() => setExplain(true)} auditEvent={state.auditEvent} /></div> : <div className="empty-state terminal-card">{mode === 'live' ? 'Reading the Kuru market. Inspect safety state or evaluate with Jev to open the terminal.' : 'Preparing deterministic replay…'}</div>}
      {mode === 'live' && <section className="execution-card terminal-card"><div className="mandate-heading"><div><strong>KURU · PROTECTIVE MON REDUCTION</strong><p>User initiated · fill-or-kill · native MON → USDC · Monad {status?.chainId || 10143}</p></div><button disabled={!wallet || busy || policy.is_paused || !status} onClick={() => void prepareReduction()}>Prepare & simulate</button></div><p className="muted-note">{minimumMon ? `Market minimum: ${minimumMon} MON. ` : ''}A proposal does not move funds. The wallet must approve the exact transaction.</p>{prepared && <div className="proposal"><div><span>Sell</span><strong>{prepared.amountMon} MON</strong></div><div><span>Estimated output</span><strong>{prepared.estimatedOutUsdc} USDC</strong></div><div><span>Minimum output</span><strong>{prepared.minOutUsdc} USDC</strong></div><div><span>Maximum slippage</span><strong>{prepared.slippageBps} bps</strong></div><p>Contract: {prepared.marketAddress} · Expires: {new Date(prepared.expiresAt).toLocaleTimeString()}</p><button disabled={busy || policy.is_paused || Date.now() > prepared.expiresAt} onClick={() => void submitReduction()}>Confirm in wallet</button></div>}{txState && <p className="tx-state" role="status">{txState}</p>}</section>}
      <AuditTrailPanel events={events} onExport={() => void api<{ savedPath: string }>("/api/audit/export", events).then(result => setNotice(`Audit saved to ${result.savedPath}`)).catch(error => setNotice(error.message))} />
      <footer>AI proposes. Policy constrains. You control execution. <span>{busy ? 'PROCESSING' : 'READY'} · {events.filter(event => !event.execution_allowed).length} blocked decisions</span></footer>
    </main>
    {state && <ExplainabilityModal isOpen={explain} onClose={() => setExplain(false)} auditEvent={state.auditEvent} />}
  </div>;
};
