import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MarketPanel } from './components/MarketPanel.tsx';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { JevPolicyPanel } from './components/JevPolicyPanel.tsx';
import { ExplainabilityModal } from './components/ExplainabilityModal.tsx';
import { AuditTrailPanel } from './components/AuditTrailPanel.tsx';
import { ReplayControlBar } from './components/ReplayControlBar.tsx';
import { DecisionFlow } from './components/DecisionFlow.tsx';
import { TradeReview } from './components/TradeReview.tsx';
import { createAssessmentSnapshot, manualTradeAudit, tradeStateAfterError } from './ui/evidence.ts';
import type { AssessmentSnapshot, EvidenceContext, TradeLifecycle } from './ui/evidence.ts';
import { validatePolicyInput } from './ui/policyInputs.ts';
import type { PolicyInputKey } from './ui/policyInputs.ts';
import { StateEngine } from './engine/stateEngine.ts';
import { HardRiskGate } from './engine/riskGate.ts';
import type { EngineCycleOutput } from './engine/stateEngine.ts';
import { JevPolicyEngine } from './jev/policyEngine.ts';
import { JevClient } from './jev/client.ts';
import { REPLAY_SCENARIOS } from './data/scenarios.ts';
import { MonadClient, monadTestnetConfig, monadMainnetConfig } from './execution/monadClient.ts';
import type { Eip1193Provider } from './execution/monadClient.ts';
import { KuruClient, kuruTestnetConfig, kuruMainnetConfig } from './execution/kuruClient.ts';
import type { KuruPreparedTrade, KuruMarketData } from './execution/kuruClient.ts';
import type { AuditEvent, PositionState, RiskCheckResult, UserPolicy } from './types/index.ts';
import { LandingPage } from './components/LandingPage.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AgentChat } from './components/AgentChat.tsx';
import { AiAccessDialog } from './components/AiAccessDialog.tsx';
import { TrialAccess } from './components/TrialAccess.tsx';
import { useAppRoute } from './ui/routes.ts';
import { aiHeaders, checkScoutKey, inferenceApi } from './ui/aiAccess.ts';
import { scoutProviders } from './ui/scoutProviders.ts';
import type {
  AiAccess,
  AiStatus,
  KeyCheckResult,
  AgentReply,
  AgentApprovalResponse,
  AgentSessionContext,
  ChatMessage,
  PendingAgentIntent,
  NewsContext,
} from './ai/types.ts';
import { buildJevStatePayload } from './jev/stateBuilder.ts';
import { snapshotFromAgent } from './ui/agentEvidence.ts';
import { AppSidebar } from './components/AppSidebar.tsx';
import { usePageMotion } from './ui/motion.ts';

interface ServiceStatus {
  inferenceEnabled: boolean;
  jevConfigured: boolean;
  chainId: number;
  marketAddress: string;
  rpcUrl: string;
  model: string;
  journal?: 'project' | 'browser_session';
  inferenceAccess?: 'owner' | 'visitor_trial';
}
const emptyPosition = (): PositionState => ({
  spot_exposure_usd: 0,
  perp_exposure_usd: 0,
  net_delta: 0,
  leverage: 0,
  unrealized_pnl: 0,
  realized_pnl_today: 0,
  drawdown_today: 0,
  spot_balance_mon: 0,
  usdc_balance: 0,
  perp_short_size_mon: 0,
});
const replayEpoch = Date.UTC(2026, 9, 1);
const browserRpcFetch: typeof fetch = (_url, options) => fetch('/api/rpc', options);
async function api<T>(route: string, value?: unknown): Promise<T> {
  const response = await fetch(
    route,
    value === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export const Terminal: React.FC = () => {
  const { route, navigate } = useAppRoute();
  usePageMotion(route);
  const [mode, setMode] = useState<'replay' | 'live'>('live');
  const [chartHistory, setChartHistory] = useState<{ time: number; price: number }[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentPending, setAgentPending] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentIntent, setAgentIntent] = useState<PendingAgentIntent | null>(null);
  const [intentStates, setIntentStates] = useState<
    Record<string, 'pending' | 'approved' | 'rejected'>
  >({});
  const consumedIntents = useRef(new Set<string>());
  const [aiAccess, setAiAccess] = useState<AiAccess>({
    jevFunding: 'sponsored',
    agentFunding: 'sponsored',
    agentProvider: 'mistral',
    jevKey: '',
    agentKey: '',
  });
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [agentKeyCheck, setAgentKeyCheck] = useState<KeyCheckResult | null>(null);
  const [agentKeyChecking, setAgentKeyChecking] = useState(false);
  const agentKeyCheckVersion = useRef(0);
  const agentKeyCheckRequest = useRef<AbortController | null>(null);
  useEffect(() => () => agentKeyCheckRequest.current?.abort(), []);
  const [news, setNews] = useState<NewsContext | null>(null);
  const [newsError, setNewsError] = useState('');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [scenarioId, setScenarioId] = useState(REPLAY_SCENARIOS[0].id);
  const [tickIndex, setTickIndex] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceContext | null>(null);
  const [assessment, setAssessment] = useState<AssessmentSnapshot | null>(null);
  const [state, setState] = useState<EngineCycleOutput | null>(null);
  const stateRef = useRef<EngineCycleOutput | null>(null);
  stateRef.current = state;
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const statusPromise = useRef<Promise<ServiceStatus> | null>(null);
  const [notice, setNotice] = useState('');
  const [marketError, setMarketError] = useState('');
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [block, setBlock] = useState('Unavailable');
  const [latency, setLatency] = useState<number | null>(null);
  const [clip, setClip] = useState(250);
  const [prepared, setPrepared] = useState<KuruPreparedTrade | null>(null);
  const [tradeState, setTradeState] = useState<TradeLifecycle>({ status: 'idle' });
  const tradeStateRef = useRef(tradeState);
  tradeStateRef.current = tradeState;
  const [tradeChecks, setTradeChecks] = useState<RiskCheckResult | null>(null);
  const tradeChecksRef = useRef<RiskCheckResult | null>(null);
  const [tradeCheckedAt, setTradeCheckedAt] = useState(0);
  const tradeCheckedAtRef = useRef(0);
  const [now, setNow] = useState(Date.now);
  const [minimumMon, setMinimumMon] = useState<string | null>(null);
  const sizeDecimals = useRef(10);
  const [policy, setPolicy] = useState<UserPolicy>(() => new StateEngine().policy);
  const [policyInputs, setPolicyInputs] = useState<Record<PolicyInputKey, string>>(() => ({
    max_position_usd: String(policy.max_position_usd),
    max_order_size: String(policy.max_order_size),
    max_daily_loss: String(policy.max_daily_loss),
    max_leverage: String(policy.max_leverage),
    max_slippage_bps: String(policy.max_slippage_bps),
    min_liquidity_depth_usd: String(policy.min_liquidity_depth_usd),
    trade_size: String(clip),
  }));
  const [inputErrors, setInputErrors] = useState<Partial<Record<PolicyInputKey, string>>>({});
  const validInputs = useRef(true);
  const policyRef = useRef(policy);
  policyRef.current = policy;
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const authorizationVersion = useRef(0);
  const engine = useRef(new StateEngine());
  const liveGate = useRef(new HardRiskGate());
  const generation = useRef(0);
  const marketRequest = useRef(0);
  const pending = useRef(false);
  const replayClock = useRef(replayEpoch);
  const scenario = REPLAY_SCENARIOS.find((item) => item.id === scenarioId)!;
  const networkConfig = status?.chainId === 143 ? monadMainnetConfig : monadTestnetConfig;
  const kuruConfig = status?.chainId === 143 ? kuruMainnetConfig : kuruTestnetConfig;

  function updateTrade(next: TradeLifecycle) {
    tradeStateRef.current = next;
    setTradeState(next);
  }
  function invalidateProposal(reason: string) {
    setPrepared(null);
    const current = tradeStateRef.current;
    if (current.status === 'prepared' || current.status === 'awaiting_wallet')
      updateTrade({ ...current, status: 'stopped', detail: reason });
  }
  function go(next: '/' | '/app' | '/app/workspace') {
    setPlaying(false);
    setEvidence(null);
    navigate(next);
  }
  function openReplay() {
    if (modeRef.current !== 'replay') {
      authorizationVersion.current++;
      modeRef.current = 'replay';
      setMode('replay');
      setScenarioId('scenario_5_risk_gate_blocks');
      invalidateProposal('Replay mode selected. No wallet trade can run in replay.');
    }
    go('/app/workspace');
  }
  function sessionContext(): AgentSessionContext {
    return {
      mode: modeRef.current,
      ...(walletRef.current ? { account: walletRef.current } : {}),
      chainId: status?.chainId ?? 143,
      policy: structuredClone(policyRef.current),
      policyRevision: authorizationVersion.current,
      clipUsd: clip,
      ...(modeRef.current === 'replay' ? { scenarioId } : {}),
    };
  }
  async function refreshAiStatus() {
    const next = await inferenceApi<AiStatus>('/api/inference/status');
    setAiStatus(next);
    return next;
  }
  function openAccess() {
    setAccessError('');
    setAccessOpen(true);
    void refreshAiStatus().catch((error: Error) => setAccessError(error.message));
  }
  function editPolicyInput(key: PolicyInputKey, raw: string) {
    const nextInputs = { ...policyInputs, [key]: raw };
    const errors: Partial<Record<PolicyInputKey, string>> = {};
    for (const [field, value] of Object.entries(nextInputs)) {
      const error = validatePolicyInput(field as PolicyInputKey, value);
      if (error) errors[field as PolicyInputKey] = error;
    }
    validInputs.current = Object.keys(errors).length === 0;
    authorizationVersion.current++;
    invalidateProposal('A trade size or policy field changed. Prepare a fresh proposal.');
    setPlaying(false);
    setPolicyInputs(nextInputs);
    setInputErrors(errors);
    if (!validatePolicyInput(key, raw)) {
      if (key === 'trade_size') setClip(Number(raw));
      else {
        const nextPolicy = { ...policyRef.current, [key]: Number(raw) };
        policyRef.current = nextPolicy;
        setPolicy(nextPolicy);
      }
    }
  }
  function requireValidInputs() {
    if (!validInputs.current) throw new Error('Correct the highlighted mandate fields first.');
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setPlaying(false);
    setEvidence(null);
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
  }, [route]);
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('h1');
    if (heading) heading.tabIndex = -1;
    void refreshAiStatus().catch(() => {});
    void inferenceApi<NewsContext>('/api/news')
      .then(setNews)
      .catch((error: Error) => setNewsError(error.message));
  }, []);
  useEffect(() => {
    if (!state) return;
    setChartHistory((previous) => {
      const point = { time: state.market.timestamp, price: state.market.mid_price };
      return previous.at(-1)?.time === point.time ? previous : [...previous, point].slice(-60);
    });
  }, [state?.market.timestamp]);

  const record = useCallback((event: AuditEvent) => {
    setEvents((previous) => [event, ...previous].slice(0, 200));
    void statusPromise.current
      ?.then((service) =>
        service.journal === 'browser_session' ? undefined : api('/api/audit', event)
      )
      .catch(() =>
        setNotice('Audit journal is unavailable; events remain visible in this session.')
      );
  }, []);

  useEffect(() => {
    statusPromise.current = api<ServiceStatus>('/api/status');
    void statusPromise.current
      .then(setStatus)
      .catch(() =>
        setNotice(
          'API service unavailable. Start the app with npm run dev to use live data and save the audit journal.'
        )
      );
  }, []);

  useEffect(() => {
    const token = ++generation.current;
    setPlaying(false);
    setTickIndex(0);
    setPrepared(null);
    invalidateProposal('The workspace changed. Prepare a fresh proposal.');
    setAssessment(null);
    setEvidence(null);
    setState(null);
    setChartHistory([]);
    stateRef.current = null;
    setNotice('');
    setMarketError('');
    replayClock.current = replayEpoch;
    const next =
      mode === 'replay'
        ? new StateEngine(
            structuredClone(scenario.initial_position),
            { ...policy },
            new JevPolicyEngine(new JevClient({ mode: 'simulated' })),
            { now: () => replayClock.current }
          )
        : new StateEngine(
            emptyPosition(),
            { ...policy },
            new JevPolicyEngine(new JevClient({ mode: 'disabled', enableCache: false }))
          );
    engine.current = next;
    if (mode === 'replay') {
      next.orders.open_orders = structuredClone(scenario.initial_orders);
      const tick = scenario.ticks[0];
      next.updateMarketState(
        tick.bids,
        tick.asks,
        tick.aggressive_buy_flow,
        tick.aggressive_sell_flow,
        replayClock.current
      );
      if (!validInputs.current) {
        setNotice('Correct the highlighted mandate fields, then step the replay.');
        return;
      }
      const policyVersion = authorizationVersion.current;
      void next
        .step(clip)
        .then((result) => {
          if (
            generation.current === token &&
            authorizationVersion.current === policyVersion &&
            validInputs.current
          ) {
            setState(result);
            setAssessment(createAssessmentSnapshot(result, 'replay'));
            record(result.auditEvent);
          }
        })
        .catch((error) => setNotice(error.message));
    }
  }, [mode, scenarioId, resetVersion]);

  const refreshMarket = useCallback(async () => {
    if (mode !== 'live' || modeRef.current !== 'live') return;
    const token = generation.current;
    const request = ++marketRequest.current;
    const snapshot = await api<KuruMarketData>('/api/market');
    if (
      generation.current !== token ||
      request !== marketRequest.current ||
      walletRef.current !== wallet
    )
      return;
    const current = engine.current;
    current.market.pair = snapshot.pair;
    current.updateMarketState(snapshot.bids, snapshot.asks, 0, 0, snapshot.timestamp);
    current.market.pair = snapshot.pair;
    setBlock(String(snapshot.blockNumber));
    setLatency(snapshot.latencyMs);
    if (snapshot.metadata) {
      setMinimumMon(
        String(Number(snapshot.metadata.minSize) / Number(snapshot.metadata.sizePrecision))
      );
      sizeDecimals.current = Math.round(Math.log10(Number(snapshot.metadata.sizePrecision)));
    }
    if (wallet) {
      const holdings = await api<{ mon: string; usdc: string }>(
        `/api/portfolio?account=${encodeURIComponent(wallet)}`
      );
      if (
        generation.current !== token ||
        request !== marketRequest.current ||
        walletRef.current !== wallet
      )
        return;
      setBalance(holdings.mon);
      const mon = Number(holdings.mon),
        usdc = Number(holdings.usdc);
      const exposure = mon * current.market.mid_price;
      current.position = {
        ...emptyPosition(),
        spot_balance_mon: mon,
        usdc_balance: usdc,
        spot_exposure_usd: exposure,
        net_delta: exposure,
        leverage: exposure / Math.max(exposure + usdc, 0.00001),
      };
    } else current.position = emptyPosition();
    const first =
      stateRef.current || !validInputs.current
        ? null
        : await current.step(clip, { execute: false });
    if (
      generation.current !== token ||
      request !== marketRequest.current ||
      walletRef.current !== wallet
    )
      return;
    setState((previous) =>
      previous
        ? {
            ...previous,
            market: structuredClone(current.market),
            position: { ...current.position },
            risk: current.computeRiskMetrics(),
            orders: structuredClone(current.orders),
          }
        : first
    );
    if (first) setAssessment(createAssessmentSnapshot(first, 'live'));
    setMarketError('');
  }, [mode, wallet]);

  useEffect(() => {
    if (mode !== 'live' || route === '/') return;
    let cancelled = false,
      running = false;
    const poll = async () => {
      if (running || cancelled || pending.current || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await refreshMarket();
      } catch (error) {
        if (!cancelled) setMarketError(`Live market unavailable: ${(error as Error).message}`);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, status?.journal === 'browser_session' ? 10000 : 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshMarket, status?.journal, route]);

  const evaluate = useCallback(
    async (advance = false, useJev = true) => {
      if (pending.current || !validInputs.current) return;
      pending.current = true;
      setBusy(true);
      invalidateProposal('A new assessment was requested. Prepare a fresh proposal.');
      const token = generation.current;
      const current = engine.current;
      const policyVersion = authorizationVersion.current;
      try {
        requireValidInputs();
        if (mode === 'live') await refreshMarket();
        else if (advance) {
          const index = Math.min(tickIndex + 1, scenario.ticks.length - 1);
          const tick = scenario.ticks[index];
          replayClock.current = replayEpoch + tick.timestamp_offset_ms;
          current.updateMarketState(
            tick.bids,
            tick.asks,
            tick.aggressive_buy_flow,
            tick.aggressive_sell_flow,
            replayClock.current
          );
          setTickIndex(index);
          if (index === scenario.ticks.length - 1) setPlaying(false);
        }
        if (
          generation.current !== token ||
          engine.current !== current ||
          modeRef.current !== mode ||
          policyVersion !== authorizationVersion.current
        )
          return;
        current.policy = { ...policyRef.current };
        const previousPolicyEngine = current.jevPolicy;
        if (mode === 'live' && useJev)
          current.jevPolicy = new JevPolicyEngine(
            new JevClient({
              mode: 'live',
              proxyUrl: '/api/jev',
              enableCache: false,
              timeoutMs: 30000,
              fetcher: (url, options) => {
                const headers = new Headers(options?.headers);
                aiHeaders(aiAccess).forEach((value, key) => headers.set(key, value));
                return fetch(url, { ...options, headers });
              },
            })
          );
        let result: EngineCycleOutput;
        try {
          result = await current.step(clip, { execute: mode === 'replay' });
        } finally {
          current.jevPolicy = previousPolicyEngine;
        }
        if (generation.current === token && policyVersion === authorizationVersion.current) {
          setState(result);
          setAssessment(createAssessmentSnapshot(result, mode));
          record(result.auditEvent);
        }
      } catch (error) {
        if (generation.current === token) setNotice((error as Error).message);
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [mode, tickIndex, scenario, policy, clip, refreshMarket, record, aiAccess]
  );

  useEffect(() => {
    if (!playing || mode !== 'replay') return;
    const timer = setTimeout(() => void evaluate(true), 2200);
    return () => clearTimeout(timer);
  }, [playing, evaluate, mode]);
  useEffect(() => {
    engine.current.policy = { ...policy };
    setPrepared(null);
    invalidateProposal('The mandate changed. Prepare a fresh proposal.');
  }, [policy, clip]);

  function disconnect() {
    generation.current++;
    authorizationVersion.current++;
    walletRef.current = null;
    setWallet(null);
    setBalance(null);
    setPrepared(null);
    invalidateProposal('Wallet disconnected. Reconnect and prepare a fresh proposal.');
    if (mode === 'live') {
      engine.current.position = emptyPosition();
      stateRef.current = null;
      setState(null);
      setAssessment(null);
    }
  }

  async function connect() {
    if (!status) {
      setNotice('Wait for the API service before connecting a wallet.');
      return;
    }
    setConnecting(true);
    setNotice('');
    try {
      const client = new MonadClient(networkConfig, undefined, browserRpcFetch);
      const result = await client.connectBrowserWallet();
      const version = authorizationVersion.current;
      const walletBalance = await client.getBalance(result.address);
      await client.verifyWallet(result.address);
      if (version !== authorizationVersion.current)
        throw new Error(
          'Wallet or mandate changed while connecting. Reconnect to use the current account.'
        );
      authorizationVersion.current++;
      setPrepared(null);
      invalidateProposal('Wallet connected. Prepare a fresh proposal for this account.');
      setWallet(result.address);
      walletRef.current = result.address;
      setBalance(walletBalance);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setConnecting(false);
    }
  }
  useEffect(() => {
    const provider = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
    const invalidate = () => {
      authorizationVersion.current++;
      walletRef.current = null;
      setWallet(null);
      setBalance(null);
      setPrepared(null);
      const trade = tradeStateRef.current;
      if (trade.status === 'prepared' || trade.status === 'awaiting_wallet')
        updateTrade({ ...trade, status: 'stopped', detail: 'Wallet account or network changed.' });
      if (modeRef.current === 'live') {
        generation.current++;
        engine.current.position = emptyPosition();
        setState(null);
        stateRef.current = null;
        setAssessment(null);
      }
      setNotice('Wallet account or network changed. Reconnect to review a fresh proposal.');
    };
    provider?.on?.('accountsChanged', invalidate);
    provider?.on?.('chainChanged', invalidate);
    return () => {
      provider?.removeListener?.('accountsChanged', invalidate);
      provider?.removeListener?.('chainChanged', invalidate);
    };
  }, []);
  function reductionGate(current: StateEngine, amountMon: number) {
    requireValidInputs();
    current.policy = { ...policyRef.current };
    if (current.policy.is_paused)
      throw new Error('Trading is paused. Resume before reviewing a new transaction.');
    const result = liveGate.current.evaluateAction(
      'reduce_position',
      current.policy,
      current.position,
      current.market,
      current.orders,
      amountMon * current.market.mid_price,
      amountMon
    );
    if (!result.allowed) throw new Error(result.violations.join('; '));
    return result;
  }
  async function prepareReduction(requestedAmount?: string, recommendationId?: string) {
    if (!wallet || mode !== 'live' || pending.current || !validInputs.current) return;
    if (
      tradeStateRef.current.hash &&
      ['submitted', 'pending'].includes(tradeStateRef.current.status)
    ) {
      setNotice('Resolve the submitted transaction before preparing another sale.');
      return;
    }
    pending.current = true;
    const token = generation.current,
      policyVersion = authorizationVersion.current;
    const current = engine.current;
    setBusy(true);
    setPrepared(null);
    updateTrade({ status: 'idle' });
    setTradeChecks(null);
    tradeChecksRef.current = null;
    try {
      requireValidInputs();
      await refreshMarket();
      if (
        token !== generation.current ||
        policyVersion !== authorizationVersion.current ||
        walletRef.current !== wallet
      )
        throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      const scale = 10 ** sizeDecimals.current;
      const amountMon =
        requestedAmount ??
        (Math.floor((clip / current.market.mid_price) * scale) / scale).toFixed(
          sizeDecimals.current
        );
      if (
        !/^\d+(?:\.\d+)?$/.test(amountMon) ||
        Number(amountMon) <= 0 ||
        (amountMon.split('.')[1]?.length ?? 0) > sizeDecimals.current
      )
        throw new Error(
          'The requested MON amount does not match the market size precision. Request a fresh recommendation.'
        );
      reductionGate(current, Number(amountMon));
      const proposal = await api<KuruPreparedTrade>('/api/prepare', {
        account: wallet,
        amountMon,
        slippageBps: policy.max_slippage_bps,
      });
      if (
        Number(proposal.minOutUsdc) / Number(proposal.amountMon) <
        engine.current.market.mid_price * (1 - policyRef.current.max_slippage_bps / 10000)
      )
        throw new Error(
          'Trade minimum output would exceed the total slippage cap. Prepare a smaller clip.'
        );
      if (
        token !== generation.current ||
        policyVersion !== authorizationVersion.current ||
        walletRef.current !== wallet
      )
        throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      setPrepared(proposal);
      const checks = reductionGate(current, Number(proposal.amountMon));
      const checkedAt = Date.now();
      const transaction: TradeLifecycle = {
        status: 'prepared',
        proposal,
        detail: 'Simulation passed. Review the exact terms before opening your wallet.',
        recommendationId,
      };
      tradeChecksRef.current = checks;
      tradeCheckedAtRef.current = checkedAt;
      setTradeChecks(checks);
      setTradeCheckedAt(checkedAt);
      updateTrade(transaction);
      record(manualTradeAudit({ kind: 'manual_trade', proposal, checks, checkedAt, transaction }));
    } catch (error) {
      setNotice((error as Error).message);
      updateTrade(tradeStateAfterError(tradeStateRef.current, error));
      setPrepared(null);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function submitReduction() {
    if (
      !prepared ||
      !wallet ||
      modeRef.current !== 'live' ||
      pending.current ||
      !validInputs.current
    )
      return;
    pending.current = true;
    const token = generation.current,
      policyVersion = authorizationVersion.current;
    const proposal = prepared;
    const current = engine.current;
    let submittedState: TradeLifecycle = {
      status: 'awaiting_wallet',
      proposal,
      recommendationId: tradeStateRef.current.recommendationId,
    };
    let latestChecks = tradeChecksRef.current;
    setBusy(true);
    try {
      requireValidInputs();
      await refreshMarket();
      if (
        token !== generation.current ||
        policyVersion !== authorizationVersion.current ||
        walletRef.current !== wallet
      )
        throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      const checks = reductionGate(current, Number(proposal.amountMon));
      latestChecks = checks;
      tradeChecksRef.current = checks;
      setTradeChecks(checks);
      tradeCheckedAtRef.current = Date.now();
      setTradeCheckedAt(tradeCheckedAtRef.current);
      if (
        Number(proposal.minOutUsdc) / Number(proposal.amountMon) <
        engine.current.market.mid_price * (1 - policyRef.current.max_slippage_bps / 10000)
      )
        throw new Error(
          'Market price changed beyond the reviewed total slippage cap. Prepare again.'
        );
      if (
        token !== generation.current ||
        policyVersion !== authorizationVersion.current ||
        walletRef.current !== wallet
      )
        throw new Error('Wallet, market mode or mandate changed. Prepare again.');
      const client = new KuruClient(
        kuruConfig,
        undefined,
        new MonadClient(kuruConfig, undefined, browserRpcFetch)
      );
      updateTrade({ ...submittedState, detail: 'Opening your wallet for explicit approval.' });
      const hash = await client.submitPreparedTrade(proposal, () => {
        if (
          token !== generation.current ||
          engine.current !== current ||
          modeRef.current !== 'live' ||
          policyVersion !== authorizationVersion.current ||
          walletRef.current !== wallet
        )
          throw new Error('Wallet, market mode or mandate changed. Prepare again.');
        if (Date.now() >= proposal.expiresAt)
          throw new Error('Trade proposal expired. Prepare it again.');
        latestChecks = reductionGate(current, Number(proposal.amountMon));
        tradeChecksRef.current = latestChecks;
        setTradeChecks(latestChecks);
        tradeCheckedAtRef.current = Date.now();
        setTradeCheckedAt(tradeCheckedAtRef.current);
      });
      setPrepared(null);
      submittedState = {
        status: 'submitted',
        proposal,
        hash,
        recommendationId: submittedState.recommendationId,
        detail: 'Submitted to Monad. Waiting for the matching receipt.',
      };
      updateTrade(submittedState);
      record(
        manualTradeAudit({
          kind: 'manual_trade',
          proposal,
          checks: latestChecks!,
          checkedAt: tradeCheckedAtRef.current,
          transaction: submittedState,
        })
      );
      const { receipt, receivedUsdc } = await client.waitForTradeReceipt(proposal, hash);
      if (receipt.status === 'confirmed') liveGate.current.recordExecution();
      submittedState = {
        ...submittedState,
        status: receipt.status,
        receivedUsdc,
        detail:
          receipt.status === 'confirmed'
            ? 'Confirmed receipt and USDC output verified.'
            : 'The Monad receipt reports a reverted transaction.',
      };
      updateTrade(submittedState);
      record(
        manualTradeAudit({
          kind: 'manual_trade',
          proposal,
          checks: latestChecks!,
          checkedAt: tradeCheckedAtRef.current,
          transaction: submittedState,
        })
      );
      await refreshMarket();
    } catch (error) {
      const next = tradeStateAfterError(submittedState, error);
      updateTrade(next);
      setPrepared(null);
      if (next.hash && latestChecks)
        record(
          manualTradeAudit({
            kind: 'manual_trade',
            proposal,
            checks: latestChecks,
            checkedAt: tradeCheckedAtRef.current,
            transaction: next,
          })
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function checkConfirmation() {
    const transaction = tradeStateRef.current;
    const proposal = transaction.proposal;
    const checks = tradeChecksRef.current;
    if (!transaction.hash || !proposal || !checks || pending.current) return;
    pending.current = true;
    setBusy(true);
    let resolvedTransaction = transaction;
    try {
      const config = proposal.chainId === 143 ? kuruMainnetConfig : kuruTestnetConfig;
      const client = new KuruClient(
        config,
        undefined,
        new MonadClient(config, undefined, browserRpcFetch)
      );
      const { receipt, receivedUsdc } = await client.waitForTradeReceipt(
        proposal,
        transaction.hash
      );
      const next: TradeLifecycle = {
        ...transaction,
        status: receipt.status,
        receivedUsdc,
        detail:
          receipt.status === 'confirmed'
            ? 'Confirmed receipt and USDC output verified.'
            : 'The receipt reports a reverted transaction.',
      };
      resolvedTransaction = next;
      updateTrade(next);
      if (receipt.status === 'confirmed') liveGate.current.recordExecution();
      record(
        manualTradeAudit({
          kind: 'manual_trade',
          proposal,
          checks,
          checkedAt: tradeCheckedAtRef.current,
          transaction: next,
        })
      );
      if (modeRef.current === 'live') await refreshMarket();
    } catch (error) {
      updateTrade(tradeStateAfterError(resolvedTransaction, error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const source = assessment?.decision.origin ?? assessment?.decision.source;
  const fields: Record<PolicyInputKey, string> = {
    trade_size: 'Trade size · USD',
    max_position_usd: 'Position cap · USD',
    max_order_size: 'Order cap · USD',
    max_daily_loss: 'Daily loss cap · USD',
    max_leverage: 'Leverage cap · ×',
    max_slippage_bps: 'Slippage cap · bps',
    min_liquidity_depth_usd: 'Min. depth · USD',
  };
  const inputsAreValid = Object.keys(inputErrors).length === 0;
  function policyField(key: PolicyInputKey) {
    return (
      <label className="policy-input" key={key} htmlFor={'policy-' + key}>
        <span>{fields[key]}</span>
        <input
          id={'policy-' + key}
          type="text"
          inputMode="decimal"
          disabled={busy}
          value={policyInputs[key]}
          onChange={(event) => editPolicyInput(key, event.target.value)}
          aria-invalid={Boolean(inputErrors[key])}
          aria-describedby={inputErrors[key] ? 'error-' + key : undefined}
        />
        {inputErrors[key] && (
          <span className="field-error" id={'error-' + key}>
            {inputErrors[key]}
          </span>
        )}
      </label>
    );
  }
  function openAssessmentEvidence() {
    if (assessment) setEvidence({ kind: 'assessment', snapshot: structuredClone(assessment) });
  }
  function openTradeEvidence() {
    const proposal = tradeState.proposal;
    if (proposal && tradeChecks)
      setEvidence({
        kind: 'manual_trade',
        proposal: structuredClone(proposal),
        checks: structuredClone(tradeChecks),
        checkedAt: tradeCheckedAt,
        transaction: structuredClone(tradeState),
      });
  }
  function clearAgentKeyCheck() {
    agentKeyCheckVersion.current++;
    agentKeyCheckRequest.current?.abort();
    agentKeyCheckRequest.current = null;
    setAgentKeyCheck(null);
    setAgentKeyChecking(false);
    setAccessError('');
    setAgentError('');
  }
  async function verifyAgentKey() {
    if (aiAccess.agentFunding !== 'byok' || !aiAccess.agentKey.trim() || agentKeyChecking) return;
    const version = ++agentKeyCheckVersion.current;
    const controller = new AbortController();
    agentKeyCheckRequest.current = controller;
    setAgentKeyCheck(null);
    setAgentKeyChecking(true);
    setAccessError('');
    try {
      const checked = await checkScoutKey(
        aiAccess.agentProvider,
        aiAccess.agentKey,
        controller.signal
      );
      if (version === agentKeyCheckVersion.current) setAgentKeyCheck(checked);
    } catch (error) {
      if (version === agentKeyCheckVersion.current && !controller.signal.aborted)
        setAccessError((error as Error).message);
    } finally {
      if (version === agentKeyCheckVersion.current) {
        agentKeyCheckRequest.current = null;
        setAgentKeyChecking(false);
      }
    }
  }
  async function requestAgent(message: string) {
    if (pending.current || agentPending) return;
    if (!validInputs.current) {
      setAgentError('Correct the highlighted policy fields before requesting an analysis.');
      return;
    }
    if (aiAccess.agentFunding === 'disabled') {
      setAgentError('Scout is disabled. Choose access to use chat.');
      openAccess();
      return;
    }
    if (!aiStatus?.sessionActive) {
      setAccessError('Verify visitor access before starting the trial.');
      setAccessOpen(true);
      return;
    }
    if (
      (aiAccess.agentFunding === 'byok' && !aiAccess.agentKey.trim()) ||
      (aiAccess.jevFunding === 'byok' && !aiAccess.jevKey.trim())
    ) {
      setAccessError('Add the key for each provider set to use your API key.');
      setAccessOpen(true);
      return;
    }
    const context = sessionContext();
    const token = generation.current;
    const version = authorizationVersion.current;
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', text: message, timestamp: Date.now() },
    ]);
    setAgentIntent(null);
    setAgentError('');
    setAgentPending(true);
    setBusy(true);
    pending.current = true;
    setPlaying(false);
    try {
      const reply = await inferenceApi<AgentReply>(
        '/api/agent',
        {
          message,
          history: messages.slice(-10).map(({ role, text }) => ({ role, text })),
          context,
          ...(mode === 'replay' && state
            ? {
                replayInput: buildJevStatePayload(
                  state.market,
                  state.position,
                  state.orders,
                  state.risk,
                  policyRef.current
                ),
              }
            : {}),
        },
        aiAccess
      );
      setMessages((previous) => [
        ...previous,
        { id: reply.id, role: 'assistant', text: reply.message, timestamp: Date.now(), reply },
      ]);
      if (token !== generation.current || version !== authorizationVersion.current) {
        setAgentError(
          'The wallet or policy changed during analysis. Its recommendation cannot be approved; request a fresh analysis.'
        );
        return;
      }
      setAgentIntent(reply.pendingIntent ?? null);
      const captured = snapshotFromAgent(reply, context.clipUsd);
      if (captured && context.mode === 'live') {
        setAssessment(captured);
        record(captured.auditEvent);
      }
      if (reply.pendingIntent)
        setIntentStates((previous) => ({ ...previous, [reply.pendingIntent!.id]: 'pending' }));
    } catch (error) {
      setAgentError((error as Error).message);
    } finally {
      pending.current = false;
      setAgentPending(false);
      setBusy(false);
      void refreshAiStatus().catch(() => {});
      void inferenceApi<NewsContext>('/api/news')
        .then(setNews)
        .catch(() => {});
    }
  }
  async function approveIntent(intent: PendingAgentIntent) {
    if (pending.current || consumedIntents.current.has(intent.id)) return;
    if (!validInputs.current) {
      setAgentError('Correct the highlighted policy fields before confirming.');
      return;
    }
    if (Date.now() >= intent.expiresAt) {
      setAgentError('This recommendation expired. Request a fresh analysis.');
      return;
    }
    consumedIntents.current.add(intent.id);
    pending.current = true;
    setBusy(true);
    setAgentError('');
    const version = authorizationVersion.current;
    try {
      const approval = await inferenceApi<AgentApprovalResponse>(
        '/api/agent/approve',
        { token: intent.token, context: sessionContext() },
        aiAccess
      );
      if (version !== authorizationVersion.current || !validInputs.current)
        throw new Error(
          'The policy or wallet changed while confirming. Request a fresh recommendation.'
        );
      setIntentStates((previous) => ({ ...previous, [intent.id]: 'approved' }));
      if (approval.intent.kind === 'set_policy') {
        if (!approval.policyAfter)
          throw new Error('The server did not return the validated policy.');
        authorizationVersion.current++;
        policyRef.current = approval.policyAfter;
        setPolicy(approval.policyAfter);
        setPolicyInputs(
          (previous) =>
            Object.fromEntries(
              Object.entries(previous).map(([key, value]) => [
                key,
                key === 'trade_size'
                  ? value
                  : String(approval.policyAfter![key as keyof UserPolicy]),
              ])
            ) as Record<PolicyInputKey, string>
        );
        invalidateProposal(
          'A confirmed agent policy change was applied. Prepare a fresh proposal.'
        );
        setNotice('Confirmed policy edit applied to this session.');
      } else if (approval.intent.kind === 'prepare_mon_reduction') {
        pending.current = false;
        await prepareReduction(approval.intent.amountMon, approval.intentId);
        go('/app/workspace');
      } else if (approval.intent.kind === 'replay_control') {
        pending.current = false;
        if (approval.intent.action === 'step') await evaluate(true, false);
        else if (approval.intent.action === 'play') setPlaying(true);
        else if (approval.intent.action === 'pause') setPlaying(false);
        else {
          authorizationVersion.current++;
          setResetVersion((previous) => previous + 1);
        }
      }
    } catch (error) {
      setIntentStates((previous) => ({ ...previous, [intent.id]: 'rejected' }));
      setAgentError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const accessDialog = (
    <AiAccessDialog
      open={accessOpen}
      jevFunding={aiAccess.jevFunding}
      agentFunding={aiAccess.agentFunding}
      agentProvider={aiAccess.agentProvider}
      onJevFundingChange={(jevFunding) =>
        setAiAccess((previous) => ({
          ...previous,
          jevFunding,
          jevKey: jevFunding === 'byok' ? previous.jevKey : '',
        }))
      }
      onAgentFundingChange={(agentFunding) => {
        clearAgentKeyCheck();
        setAiAccess((previous) => ({
          ...previous,
          agentFunding,
          agentKey: agentFunding === 'byok' ? previous.agentKey : '',
        }));
      }}
      onAgentProviderChange={(agentProvider) => {
        clearAgentKeyCheck();
        setAiAccess((previous) => ({ ...previous, agentProvider, agentKey: '' }));
      }}
      jevKey={aiAccess.jevKey}
      agentKey={aiAccess.agentKey}
      onJevKeyChange={(jevKey) => setAiAccess((previous) => ({ ...previous, jevKey }))}
      onAgentKeyChange={(agentKey) => {
        clearAgentKeyCheck();
        setAiAccess((previous) => ({ ...previous, agentKey }));
      }}
      onCheckAgentKey={() => void verifyAgentKey()}
      agentKeyCheck={agentKeyCheck}
      agentKeyChecking={agentKeyChecking}
      onApply={() => {
        setAccessOpen(false);
        setAccessError('');
      }}
      onClose={() => setAccessOpen(false)}
      jevSponsoredAvailable={Boolean(aiStatus?.enabled && aiStatus.jevConfigured)}
      agentSponsoredAvailable={Boolean(aiStatus?.enabled && aiStatus.agentConfigured)}
      trialProvider={aiStatus?.agentProvider}
      trialModel={aiStatus?.model}
      busy={busy}
      error={accessError}
    >
      <TrialAccess
        siteKey={aiStatus?.turnstileSiteKey}
        active={Boolean(aiStatus?.sessionActive)}
        onVerified={async (turnstileToken) => {
          await inferenceApi('/api/inference/session', { turnstileToken });
          await refreshAiStatus();
          setAccessError('');
        }}
      />
      {aiStatus?.poolRemainingMicros !== undefined && (
        <p>
          Shared review allowance remaining: $
          {(aiStatus.poolRemainingMicros / 1_000_000).toFixed(2)}.{' '}
          {aiStatus.visitorTurnsRemaining ?? 5} visitor turns remain today.
        </p>
      )}
    </AiAccessDialog>
  );
  if (route === '/')
    return (
      <>
        <LandingPage
          onOpenDashboard={() => go('/app')}
          onReplay={openReplay}
          previewSrc="/dashboard-preview.png"
          previewAlt="Actual Aegis dashboard with a Kuru market observation; wallet disconnected and no AI request or trade made."
        />
        {accessDialog}
      </>
    );
  if (route === '/app')
    return (
      <>
        <Dashboard
          mode={mode}
          market={state?.market}
          position={state?.position}
          walletAddress={wallet}
          chainId={status?.chainId}
          now={now}
          assessment={assessment}
          policy={policy}
          trade={tradeState}
          events={events}
          onHome={() => go('/')}
          onOpenWorkspace={() => go('/app/workspace')}
          onReplay={openReplay}
          onOpenAiAccess={openAccess}
          onInspectAssessment={openAssessmentEvidence}
          headerActions={
            <button
              className="warm-button warm-button-outline"
              disabled={busy || connecting}
              onClick={() => (wallet ? disconnect() : void connect())}
            >
              {wallet
                ? wallet.slice(0, 6) + '…' + wallet.slice(-4) + ' · Disconnect'
                : connecting
                  ? 'Connecting…'
                  : 'Connect wallet'}
            </button>
          }
          chat={
            <AgentChat
              messages={messages}
              pending={agentPending}
              intent={agentIntent}
              intentState={intentStates}
              now={now}
              busy={busy}
              error={agentError}
              onSend={(message) => void requestAgent(message)}
              onApprove={(intent) => void approveIntent(intent)}
              onReject={(intent) => {
                consumedIntents.current.add(intent.id);
                setIntentStates((previous) => ({ ...previous, [intent.id]: 'rejected' }));
              }}
              accessLabel={
                aiAccess.agentFunding === 'byok'
                  ? 'Your ' + scoutProviders[aiAccess.agentProvider].label + ' key'
                  : aiAccess.agentFunding === 'disabled'
                    ? 'Scout disabled'
                    : 'Project-funded trial'
              }
              onOpenAccess={openAccess}
            />
          }
          sideContent={
            <>
              {(notice || marketError) && (
                <p className="notice" role="status">
                  {notice || marketError}
                </p>
              )}
              <section className="warm-card dashboard-news">
                <span className="warm-eyebrow">Dated context</span>
                <h2>News in view.</h2>
                {news ? (
                  <>
                    <p>
                      Retrieved {new Date(news.fetchedAt).toLocaleString()}. Coverage from the
                      preceding 72 hours.
                    </p>
                    {news.articles.slice(0, 4).map((article) => (
                      <article key={article.id}>
                        <a href={article.url} target="_blank" rel="noreferrer">
                          {article.title}
                        </a>
                        <p>
                          {article.source} ·{' '}
                          <time dateTime={new Date(article.publishedAt).toISOString()}>
                            {new Date(article.publishedAt).toLocaleString()}
                          </time>
                        </p>
                      </article>
                    ))}
                    {!news.articles.length && <p>No relevant recent coverage was found.</p>}
                    {news.unavailableSources.length > 0 && (
                      <p>
                        Unavailable:{' '}
                        {news.unavailableSources
                          .map((name) =>
                            news.unavailableDetails?.[name]
                              ? `${name} (${news.unavailableDetails[name]})`
                              : name
                          )
                          .join('; ')}
                        .
                      </p>
                    )}
                  </>
                ) : (
                  <p>{newsError || 'Fetching source feeds…'}</p>
                )}
              </section>
            </>
          }
        />
        <ExplainabilityModal context={evidence} onClose={() => setEvidence(null)} />
        {accessDialog}
      </>
    );
  return (
    <div className="aegis-app workspace-shell">
      <AppSidebar
        current="execution"
        onHome={() => go('/')}
        onOverview={() => go('/app')}
        onExecution={() => {}}
        onReplay={openReplay}
        onOpenAiAccess={openAccess}
      />
      <div className="workspace-page-content">
        <Header
          showBrand={false}
          isPaused={policy.is_paused}
          onTogglePause={() => {
            const next = { ...policyRef.current, is_paused: !policyRef.current.is_paused };
            authorizationVersion.current++;
            policyRef.current = next;
            setPolicy(next);
            invalidateProposal('Trading pause changed. Prepare a fresh proposal.');
            setPlaying(false);
          }}
          operationMode={mode}
          onToggleMode={(nextMode) => {
            if (nextMode === modeRef.current) return;
            authorizationVersion.current++;
            modeRef.current = nextMode;
            invalidateProposal('The workspace changed. Prepare a fresh proposal.');
            setMode(nextMode);
          }}
          rpcLatencyMs={latency}
          blockNumber={block}
          chainId={status?.chainId}
          marketTimestamp={state?.market.timestamp}
          now={now}
          walletAddress={wallet}
          walletBalanceMon={balance}
          isConnectingWallet={connecting}
          onConnectWallet={() => void connect()}
          onDisconnectWallet={disconnect}
        />
        <main className="app-main">
          <section className="workspace-intro" aria-labelledby="workspace-title">
            <div>
              <span
                className={'context-badge ' + (mode === 'replay' ? 'is-simulation' : 'is-live')}
              >
                {mode === 'replay' ? 'Synthetic replay' : 'Live market'}
              </span>
              <h1 id="workspace-title">
                {mode === 'replay' ? 'See the safeguards work.' : 'Your risk. Your rules.'}
              </h1>
              <p>
                {mode === 'replay'
                  ? 'Explore a recommendation, inspect its constraints, and follow the paper outcome.'
                  : 'Inspect real market data and review an exact MON sale before you sign.'}
              </p>
            </div>
            <div className="workspace-context">
              <strong>MON / USDC</strong>
              <span>
                {mode === 'replay'
                  ? 'Heuristic assessment · paper execution'
                  : 'Kuru · Monad ' + (status?.chainId ?? 'loading')}
              </span>
              <span className="source-pill">
                {source === 'typesafe_jev'
                  ? 'Jev assessment'
                  : source === 'simulated'
                    ? 'Heuristic replay assessment'
                    : 'AI assessment unavailable'}
              </span>
            </div>
          </section>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {marketError && (
            <div className="notice" role="status">
              {marketError}
            </div>
          )}
          {mode === 'replay' && (
            <ReplayControlBar
              currentScenarioId={scenarioId}
              onSelectScenario={(id) => {
                authorizationVersion.current++;
                invalidateProposal('The replay scenario changed. Prepare a fresh proposal.');
                setScenarioId(id);
              }}
              isPlaying={playing}
              onTogglePlay={() => inputsAreValid && setPlaying((previous) => !previous)}
              onStepTick={() => void evaluate(true)}
              onResetScenario={() => {
                authorizationVersion.current++;
                invalidateProposal('Replay reset. Prepare a fresh proposal.');
                setResetVersion((previous) => previous + 1);
              }}
              currentTickIndex={tickIndex}
              totalTicks={scenario.ticks.length}
            />
          )}
          <div className={'workspace-grid ' + mode}>
            <div className="assessment-slot">
              {assessment ? (
                <JevPolicyPanel
                  snapshot={assessment}
                  onOpenExplainability={openAssessmentEvidence}
                />
              ) : (
                <section className="terminal-card empty-state">
                  <h2>Assessment</h2>
                  <p>{mode === 'live' ? 'Reading the Kuru market…' : 'Preparing replay…'}</p>
                </section>
              )}
              {mode === 'live' && (
                <section className="live-controls terminal-card" aria-label="Assessment controls">
                  <p>
                    Jev evaluates one captured observation. Each request uses the selected provider
                    access.
                  </p>
                  <div className="control-actions">
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        !inputsAreValid ||
                        aiAccess.jevFunding === 'disabled' ||
                        (aiAccess.jevFunding === 'sponsored' && !aiStatus?.sessionActive)
                      }
                      onClick={() => void evaluate()}
                    >
                      Evaluate with Jev
                    </button>
                    <button onClick={openAccess}>AI access</button>
                    <button
                      disabled={busy || !inputsAreValid}
                      onClick={() => void evaluate(false, false)}
                    >
                      Inspect safety state
                    </button>
                  </div>
                </section>
              )}
            </div>
            {assessment && (
              <div className="decision-slot">
                <DecisionFlow snapshot={assessment} onOpenEvidence={openAssessmentEvidence} />
              </div>
            )}
            {mode === 'live' && (
              <div className="trade-slot">
                <TradeReview
                  transaction={tradeState}
                  prepared={prepared}
                  now={now}
                  chainId={status?.chainId}
                  minimumMon={minimumMon}
                  tradeSizeUsd={clip}
                  busy={busy}
                  hasWallet={Boolean(wallet)}
                  canPrepare={Boolean(wallet && status && !policy.is_paused && inputsAreValid)}
                  canSubmit={Boolean(
                    wallet &&
                      status &&
                      !policy.is_paused &&
                      inputsAreValid &&
                      prepared &&
                      prepared.id === tradeState.proposal?.id
                  )}
                  onPrepare={() => void prepareReduction()}
                  onSubmit={() => void submitReduction()}
                  onInspect={openTradeEvidence}
                  onCheckConfirmation={() => void checkConfirmation()}
                />
              </div>
            )}
            {state && (
              <div className="market-slot">
                <MarketPanel
                  key={mode + '-' + scenarioId + '-' + resetVersion}
                  market={state.market}
                  live={mode === 'live'}
                  history={chartHistory}
                />
              </div>
            )}
            {state && (
              <div className="portfolio-slot">
                <PortfolioPanel
                  hasWallet={Boolean(wallet)}
                  position={state.position}
                  orders={state.orders}
                  policy={policy}
                  risk={state.risk}
                  live={mode === 'live'}
                />
              </div>
            )}
          </div>
          <section className="mandate terminal-card" id="mandate" aria-labelledby="mandate-title">
            <div className="panel-heading">
              <div>
                <h2 id="mandate-title">Your mandate</h2>
                <p>Hard limits apply independently of the assessment.</p>
              </div>
              <span className={'context-badge ' + (policy.is_paused ? 'is-blocked' : '')}>
                {policy.is_paused ? 'Paused' : 'Session policy'}
              </span>
            </div>
            <div className="policy-primary">
              {(['trade_size', 'max_position_usd', 'max_slippage_bps'] as PolicyInputKey[]).map(
                policyField
              )}
            </div>
            <details className="advanced-policy">
              <summary>Advanced limits</summary>
              <div className="policy-fields">
                {(
                  [
                    'max_order_size',
                    'max_daily_loss',
                    'max_leverage',
                    'min_liquidity_depth_usd',
                  ] as PolicyInputKey[]
                ).map(policyField)}
              </div>
            </details>
            <p className="muted-note">
              Valid edits apply immediately in this session and invalidate any prepared proposal.
              Limits reset when you reload.
            </p>
            {mode === 'live' && (
              <p className="coverage-note">
                Wallet MON and USDC are available after connection. External positions, resting
                orders, historical loss, drawdown and trade flow are not indexed. Unattended trading
                is unavailable.
              </p>
            )}
          </section>
          <AuditTrailPanel
            events={events}
            exportLabel={
              status?.journal === 'browser_session' ? 'Copy session JSON' : 'Save JSON to project'
            }
            onExport={() =>
              status?.journal === 'browser_session'
                ? void navigator.clipboard
                    .writeText(JSON.stringify(events, null, 2))
                    .then(() =>
                      setNotice(
                        'Session journal copied. Copy it before reloading; hosted history is session only.'
                      )
                    )
                    .catch(() =>
                      setNotice(
                        'Clipboard access was blocked. Keep this session open to review its journal.'
                      )
                    )
                : void api<{ savedPath: string }>('/api/audit/export', events)
                    .then((result) => setNotice('Audit saved to ' + result.savedPath))
                    .catch((error) => setNotice(error.message))
            }
          />
          {status?.journal === 'browser_session' && (
            <p className="muted-note">
              Hosted history stays in this browser session. Copy the journal before reloading.
            </p>
          )}
          <footer className="app-footer">
            <span>AI proposes. Policy constrains. You control execution.</span>
            <span>
              {mode === 'replay'
                ? 'Synthetic replay · no chain transactions'
                : 'Chain reads and reviewed wallet execution'}
            </span>
          </footer>
        </main>
      </div>
      <ExplainabilityModal context={evidence} onClose={() => setEvidence(null)} />
      {accessDialog}
    </div>
  );
};
