// tests/stateEngine.test.ts - Replay Scenarios & Two-Speed State Engine Verification

import { describe, it, expect } from 'vitest';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { REPLAY_SCENARIOS } from '../src/data/scenarios.ts';

describe('StateEngine & 5 Deterministic Replay Scenarios Suite', () => {
  it('Scenario 1: Steady Range-Bound Market -> System Holds', async () => {
    const sc = REPLAY_SCENARIOS[0];
    const engine = new StateEngine(sc.initial_position);

    for (const tick of sc.ticks) {
      engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    }

    const cycle = await engine.step();
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('hold');
    expect(cycle.auditEvent.execution_allowed).toBe(true);
  });

  it('Scenario 2: Bullish Momentum -> Safely Increases MON Exposure on Kuru', async () => {
    const sc = REPLAY_SCENARIOS[1];
    const engine = new StateEngine(sc.initial_position);

    for (const tick of sc.ticks) {
      engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    }

    const initialExposure = engine.position.spot_exposure_usd;
    const cycle = await engine.step(250);

    expect(cycle.jevDecision.selected_action).toBe('increase_position');
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('increase_position');
    expect(cycle.txHash).toBeDefined();
    expect(cycle.txHash?.startsWith('0x')).toBe(true);
    expect(engine.position.spot_exposure_usd).toBeGreaterThan(initialExposure);
  });

  it('Scenario 3: Volatility Shock -> Cancels Stale Maker Orders on Kuru', async () => {
    const sc = REPLAY_SCENARIOS[2];
    const engine = new StateEngine(sc.initial_position);
    engine.orders.open_orders = [...sc.initial_orders];
    engine.orders.oldest_order_age = 210;

    for (const tick of sc.ticks) {
      engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    }

    const cycle = await engine.step();
    expect(cycle.jevDecision.selected_action).toBe('cancel_orders');
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('cancel_orders');
    expect(engine.orders.open_orders.length).toBe(0);
    expect(cycle.txHash).toBeDefined();
  });

  it('Scenario 4: Downside Turbulence -> Executes Protective Perpl Hedge', async () => {
    const sc = REPLAY_SCENARIOS[3];
    const engine = new StateEngine(sc.initial_position);

    for (const tick of sc.ticks) {
      engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    }

    const cycle = await engine.step();
    expect(cycle.jevDecision.selected_action).toBe('hedge');
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('hedge');
    expect(engine.position.perp_exposure_usd).toBe(-1000);
    expect(engine.position.net_delta).toBe(engine.position.spot_exposure_usd - 1000);
    expect(cycle.auditEvent.venue).toBe('perpl');
  });

  it('CRITICAL PROOF (Scenario 5): Hard Risk Gate forcefully BLOCKS Jev when max_position_usd violated', async () => {
    const sc = REPLAY_SCENARIOS[4];
    // Position already at $1,950 with a $2,000 policy limit
    const engine = new StateEngine(sc.initial_position);

    for (const tick of sc.ticks) {
      engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow);
    }

    // Force prospective clip of $250 which would total $2,200 > $2,000 cap
    const cycle = await engine.step(250);

    // Jev wants to increase position based on momentum
    expect(cycle.jevDecision.selected_action).toBe('increase_position');

    // BUT THE DETERMINISTIC RISK ENGINE SAYS NO:
    expect(cycle.riskCheck.allowed).toBe(false);
    expect(cycle.riskCheck.violations.length).toBeGreaterThan(0);
    expect(cycle.riskCheck.violations.some((v) => v.includes('breach max limit'))).toBe(true);
    expect(cycle.executedAction).toBe('hold');
    expect(cycle.txHash).toBeUndefined(); // Zero transaction submitted to Monad!
    expect(cycle.auditEvent.execution_allowed).toBe(false);
    expect(cycle.auditEvent.reason).toContain('BLOCKED BY RISK GATE');
  });
});
