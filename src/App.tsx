// src/App.tsx - Aegis Jev Trading Terminal Core Application

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { MarketPanel } from './components/MarketPanel.tsx';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { JevPolicyPanel } from './components/JevPolicyPanel.tsx';
import { ExplainabilityModal } from './components/ExplainabilityModal.tsx';
import { AuditTrailPanel } from './components/AuditTrailPanel.tsx';
import { ReplayControlBar } from './components/ReplayControlBar.tsx';
import { StateEngine, EngineCycleOutput } from './engine/stateEngine.ts';
import { REPLAY_SCENARIOS } from './data/scenarios.ts';
import { MonadClient } from './execution/monadClient.ts';
import { AuditEvent } from './types/index.ts';

export const App: React.FC = () => {
  const [currentScenarioId, setCurrentScenarioId] = useState<string>('scenario_1_normal');
  const [currentTickIndex, setCurrentTickIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExplainabilityOpen, setIsExplainabilityOpen] = useState<boolean>(false);
  const [operationMode, setOperationMode] = useState<'replay' | 'live'>('replay');
  const [blockNumber, setBlockNumber] = useState<string>('18492041');
  const [rpcLatencyMs, setRpcLatencyMs] = useState<number>(34);

  const scenario = REPLAY_SCENARIOS.find((s) => s.id === currentScenarioId) || REPLAY_SCENARIOS[0];
  const engineRef = useRef<StateEngine>(new StateEngine(scenario.initial_position));
  const monadClientRef = useRef<MonadClient>(new MonadClient());

  const [engineState, setEngineState] = useState<EngineCycleOutput | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Initialize or reset scenario
  const resetToScenario = (scId: string) => {
    const sc = REPLAY_SCENARIOS.find((s) => s.id === scId) || REPLAY_SCENARIOS[0];
    const newEngine = new StateEngine({ ...sc.initial_position });
    newEngine.orders.open_orders = [...sc.initial_orders];
    newEngine.orders.oldest_order_age = sc.initial_orders.length > 0 ? 150 : 0;
    engineRef.current = newEngine;
    setCurrentScenarioId(scId);
    setCurrentTickIndex(0);
    setIsPlaying(false);

    // Initial step with first tick
    const tick = sc.ticks[0];
    newEngine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    newEngine.step().then((res) => {
      setEngineState(res);
      setAuditEvents([res.auditEvent]);
    });
  };

  useEffect(() => {
    resetToScenario(currentScenarioId);
  }, [currentScenarioId]);

  // Advance single tick
  const advanceTick = async () => {
    const nextTickIndex = (currentTickIndex + 1) % scenario.ticks.length;
    setCurrentTickIndex(nextTickIndex);
    const tick = scenario.ticks[nextTickIndex];

    const engine = engineRef.current;
    engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    const cycle = await engine.step();

    setEngineState(cycle);
    setAuditEvents((prev) => [cycle.auditEvent, ...prev.slice(0, 49)]);
  };

  // Playback timer
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        advanceTick();
      }, 2200);
    }
    return () => clearInterval(timer);
  }, [isPlaying, currentTickIndex, scenario]);

  // Monad Network Health Telemetry
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const health = await monadClientRef.current.getNetworkHealth();
        if (health.blockNumber > 0n) {
          setBlockNumber(health.blockNumber.toString());
          setRpcLatencyMs(health.latencyMs);
        }
      } catch {
        // Fallback simulated block ticking
        setBlockNumber((prev) => (BigInt(prev) + 1n).toString());
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 4000);
    return () => clearInterval(interval);
  }, []);

  // Circuit Breaker Toggle
  const togglePause = () => {
    const engine = engineRef.current;
    engine.policy.is_paused = !engine.policy.is_paused;
    engine.step().then((res) => {
      setEngineState(res);
      setAuditEvents((prev) => [res.auditEvent, ...prev.slice(0, 49)]);
    });
  };

  if (!engineState) {
    return (
      <div className="min-h-screen bg-[#08090c] text-white flex items-center justify-center font-mono text-sm">
        Initializing Aegis Engine & Connecting to Monad...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090c] text-[#e2e8f0] flex flex-col font-sans">
      {/* Top Navbar */}
      <Header
        isPaused={engineRef.current.policy.is_paused}
        onTogglePause={togglePause}
        operationMode={operationMode}
        onToggleMode={setOperationMode}
        rpcLatencyMs={rpcLatencyMs}
        blockNumber={blockNumber}
      />

      <main className="p-3.5 space-y-3.5 flex-1 flex flex-col">
        {/* Replay Scenario Control Bar */}
        <ReplayControlBar
          currentScenarioId={currentScenarioId}
          onSelectScenario={(id) => setCurrentScenarioId(id)}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onStepTick={advanceTick}
          onResetScenario={() => resetToScenario(currentScenarioId)}
          currentTickIndex={currentTickIndex}
          totalTicks={scenario.ticks.length}
        />

        {/* 3-Column Core Trading Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 flex-1 min-h-[460px]">
          {/* Left: Market Analytics & Kuru Orderbook */}
          <MarketPanel market={engineState.market} />

          {/* Center: Position, Exposure & Active Orders */}
          <PortfolioPanel
            position={engineState.position}
            orders={engineState.orders}
            policy={engineRef.current.policy}
            risk={engineState.risk}
          />

          {/* Right: Jev Policy & Hard Risk Gate */}
          <JevPolicyPanel
            decision={engineState.jevDecision}
            riskCheck={engineState.riskCheck}
            lastTxHash={engineState.txHash}
            onOpenExplainability={() => setIsExplainabilityOpen(true)}
            auditEvent={engineState.auditEvent}
          />
        </div>

        {/* Bottom Panel: Envio HyperSync Audit Stream */}
        <AuditTrailPanel events={auditEvents} />
      </main>

      {/* Structured Explainability Modal */}
      <ExplainabilityModal
        isOpen={isExplainabilityOpen}
        onClose={() => setIsExplainabilityOpen(false)}
        auditEvent={engineState.auditEvent}
      />
    </div>
  );
};
