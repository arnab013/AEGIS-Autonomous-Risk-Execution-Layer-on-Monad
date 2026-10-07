import { describe, it, expect, vi } from 'vitest';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { JevClient } from '../src/jev/client.ts';
import { JevPolicyEngine } from '../src/jev/policyEngine.ts';
import { REPLAY_SCENARIOS } from '../src/data/scenarios.ts';

const epoch = Date.parse('2026-10-08T00:00:00Z');
function replay(index: number) {
  const scenario = REPLAY_SCENARIOS[index];
  const engine = new StateEngine(scenario.initial_position, undefined, undefined, { now: () => epoch + 2000 });
  engine.orders.open_orders = structuredClone(scenario.initial_orders);
  for (const tick of scenario.ticks) engine.updateMarketState(tick.bids, tick.asks, tick.aggressive_buy_flow, tick.aggressive_sell_flow, epoch + tick.timestamp_offset_ms);
  return engine;
}

function forcedPolicy(action: 'increase_position' | 'reduce_position' | 'hedge' | 'hold') {
  const client = new JevClient({ mode: 'simulated' });
  const original = client.evaluate.bind(client);
  vi.spyOn(client, 'evaluate').mockImplementation(async payload => ({ ...(await original(payload)), selected_action: action, abstain_flag: false }));
  return new JevPolicyEngine(client);
}

describe('Deterministic replay and an honest paper ledger', () => {
  it('balanced replay holds without transaction, fee or paper fill', async () => {
    const engine = replay(0);
    const position = structuredClone(engine.position);
    const cycle = await engine.step();
    expect(cycle.executedAction).toBe('hold');
    expect(cycle.executionMode).toBe('paper');
    expect(cycle.paperExecution).toBeUndefined();
    expect(cycle.txHash).toBeUndefined();
    expect(engine.position).toEqual(position);
    expect(cycle.auditEvent.jev_model).toBe('deterministic-heuristic-v2');
  });

  it('bullish paper fills use the ask book and debit exactly the quoted cash', async () => {
    const engine = replay(1);
    const cash = engine.position.usdc_balance;
    const tokens = engine.position.spot_balance_mon;
    const cycle = await engine.step(250);
    expect(cycle.jevDecision.selected_action).toBe('increase_position');
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('increase_position');
    expect(cycle.paperExecution?.notionalUsd).toBeCloseTo(250);
    expect(cycle.paperExecution?.price).toBe(engine.market.asks[0].price);
    expect(engine.position.usdc_balance).toBeCloseTo(cash - 250);
    expect(engine.position.spot_balance_mon).toBeCloseTo(tokens + 250 / engine.market.asks[0].price);
    expect(cycle.txHash).toBeUndefined();
    expect(cycle.auditEvent.transaction_hash).toBeUndefined();
    expect(cycle.auditEvent.execution_mode).toBe('paper');
  });

  it('volatile replay cancels local stale orders without inventing a Monad receipt', async () => {
    const engine = replay(2);
    const cycle = await engine.step();
    expect(cycle.jevDecision.selected_action).toBe('cancel_orders');
    expect(cycle.executedAction).toBe('cancel_orders');
    expect(engine.orders.open_orders).toEqual([]);
    expect(cycle.paperExecution?.status).toBe('cancelled');
    expect(cycle.txHash).toBeUndefined();
  });

  it('the original downside fixture breaches the actual slippage policy and is blocked', async () => {
    const engine = replay(3);
    const before = structuredClone(engine.position);
    const cycle = await engine.step(250);
    expect(cycle.jevDecision.selected_action).toBe('hedge');
    expect(cycle.riskCheck.allowed).toBe(false);
    expect(cycle.riskCheck.checks.max_slippage_bps.passed).toBe(false);
    expect(cycle.executedAction).toBe('hold');
    expect(engine.position).toEqual(before);
  });

  it('a permitted paper hedge uses the approved clip, cannot overwrite previous hedges and creates no receipt', async () => {
    const engine = replay(3);
    engine.updateMarketState([{ price: 3.928, size: 1900 }], [{ price: 3.932, size: 9200 }], 600, 14500, epoch + 3000);
    engine.jevPolicy = forcedPolicy('hedge');
    const before = engine.position.net_delta;
    const cycle = await engine.step(250);
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('hedge');
    expect(cycle.paperExecution?.notionalUsd).toBeCloseTo(250);
    expect(Math.abs(engine.position.perp_exposure_usd)).toBeCloseTo(250 / 3.928 * 3.93);
    expect(engine.position.net_delta).toBeLessThan(before);
    expect(cycle.paperExecution?.assumptions).toContain('no Perpl fill');
    expect(cycle.txHash).toBeUndefined();
    engine.updateMarketState(engine.market.bids, engine.market.asks, 600, 14500, epoch + 6000);
    const second = await engine.step(250);
    expect(second.executedAction).toBe('hedge');
    expect(Math.abs(engine.position.perp_exposure_usd)).toBeCloseTo(500 / 3.928 * 3.93);
  });

  it('the position cap overrides a confident bullish model proposal', async () => {
    const engine = replay(4);
    const before = structuredClone(engine.position);
    const cycle = await engine.step(250);
    expect(cycle.jevDecision.selected_action).toBe('increase_position');
    expect(cycle.riskCheck.allowed).toBe(false);
    expect(cycle.riskCheck.violations.some(v => v.includes('breach max limit'))).toBe(true);
    expect(cycle.executedAction).toBe('hold');
    expect(cycle.txHash).toBeUndefined();
    expect(engine.position).toEqual(before);
  });

  it('identical replay runs yield identical decisions, ledger results, hashes and audit identifiers', async () => {
    const a = await replay(1).step();
    const b = await replay(1).step();
    expect(a.auditEvent).toEqual(b.auditEvent);
    expect(a.paperExecution).toEqual(b.paperExecution);
    expect(a.position).toEqual(b.position);
    expect(a.riskCheck).toEqual(b.riskCheck);
  });

  it('constructor and output snapshots cannot mutate shared scenario fixtures or past results', async () => {
    const fixture = structuredClone(REPLAY_SCENARIOS[1]);
    const engine = replay(1);
    const cycle = await engine.step();
    const recorded = structuredClone(cycle.position);
    engine.position.usdc_balance = 0;
    expect(cycle.position).toEqual(recorded);
    expect(REPLAY_SCENARIOS[1]).toEqual(fixture);
  });

  it('observe mode produces a model proposal and safety verdict without moving holdings', async () => {
    const engine = replay(1);
    const before = structuredClone(engine.position);
    const cycle = await engine.step(250, { execute: false });
    expect(cycle.executionMode).toBe('observe');
    expect(cycle.jevDecision.selected_action).toBe('increase_position');
    expect(cycle.executedAction).toBe('hold');
    expect(cycle.paperExecution).toBeUndefined();
    expect(engine.position).toEqual(before);
    expect(cycle.auditEvent.execution_mode).toBe('observe');
  });

  it('hold does not reset the cooldown and prevent the next valid trade', async () => {
    const engine = replay(0);
    await engine.step();
    engine.jevPolicy = forcedPolicy('increase_position');
    const cycle = await engine.step();
    expect(cycle.riskCheck.checks.trade_cooldown.passed).toBe(true);
    expect(cycle.executedAction).toBe('increase_position');
  });

  it('reduce fills credit cash, release cost basis and remain available during an emergency pause', async () => {
    const engine = replay(0);
    engine.policy.is_paused = true;
    engine.jevPolicy = forcedPolicy('reduce_position');
    const cash = engine.position.usdc_balance;
    const spot = engine.position.spot_balance_mon;
    const cycle = await engine.step(250);
    expect(cycle.riskCheck.allowed).toBe(true);
    expect(cycle.executedAction).toBe('reduce_position');
    expect(engine.position.usdc_balance).toBeCloseTo(cash + 250);
    expect(engine.position.spot_balance_mon).toBeLessThan(spot);
  });

  it('concurrent inference is rejected and a policy change invalidates the in-flight proposal', async () => {
    const engine = replay(1);
    const realEvaluate = engine.jevPolicy.evaluatePolicy.bind(engine.jevPolicy);
    let resume!: () => void;
    const pending = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(engine.jevPolicy, 'evaluatePolicy').mockImplementation(async (...args) => { await pending; return realEvaluate(...args); });
    const first = engine.step();
    await expect(engine.step()).rejects.toThrow('already in flight');
    engine.policy.is_paused = true;
    resume();
    const cycle = await first;
    expect(cycle.riskCheck.allowed).toBe(false);
    expect(cycle.riskCheck.checks.state_consistency.passed).toBe(false);
    expect(cycle.paperExecution).toBeUndefined();
  });

  it('time windows use timestamps and discard drift that falls outside the named window', () => {
    const engine = new StateEngine();
    const book = (price: number) => [[{ price: price - 0.001, size: 1000 }], [{ price: price + 0.001, size: 1000 }]] as const;
    const a = book(4);
    engine.updateMarketState([...a[0]], [...a[1]], 0, 0, epoch);
    const b = book(4.1);
    engine.updateMarketState([...b[0]], [...b[1]], 0, 0, epoch + 20_000);
    expect(engine.market.return_10s).toBeCloseTo(Math.log(4.1 / 4));
    const c = book(4.1);
    engine.updateMarketState([...c[0]], [...c[1]], 0, 0, epoch + 80_000);
    expect(engine.market.return_1m).toBeCloseTo(0);
  });

  it('invalid, crossed and out-of-order books are rejected without corrupting state', () => {
    const engine = replay(0);
    const before = structuredClone(engine.market);
    expect(() => engine.updateMarketState([{ price: 0, size: 1000 }], [{ price: 4, size: 1000 }])).toThrow('positive order book');
    expect(() => engine.updateMarketState([{ price: 5, size: 1000 }], [{ price: 4, size: 1000 }])).toThrow('Crossed');
    expect(() => engine.updateMarketState(before.bids, before.asks, 0, 0, epoch - 1000)).toThrow('Out-of-order');
    expect(engine.market).toEqual(before);
  });
});
