import { describe, it, expect, vi } from 'vitest';
import { snapshotFromAgent } from '../src/ui/agentEvidence.ts';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { JevClient } from '../src/jev/client.ts';
import { JevPolicyEngine } from '../src/jev/policyEngine.ts';
import { REPLAY_SCENARIOS } from '../src/data/scenarios.ts';
import { createAssessmentSnapshot, manualTradeAudit } from '../src/ui/evidence.ts';
import type { AgentReply } from '../src/ai/types.ts';
import { readRoute } from '../src/ui/routes.ts';

async function captured() {
  const time = Date.parse('2026-10-09T00:00:00Z');
  const scenario = REPLAY_SCENARIOS[1];
  const engine = new StateEngine(
    structuredClone(scenario.initial_position),
    undefined,
    new JevPolicyEngine(new JevClient({ mode: 'simulated' })),
    { now: () => time }
  );
  const tick = scenario.ticks[0];
  engine.updateMarketState(
    tick.bids,
    tick.asks,
    tick.aggressive_buy_flow,
    tick.aggressive_sell_flow,
    time
  );
  const result = await engine.step(10, { execute: false });
  const reply: AgentReply = {
    id: 'reply',
    message: 'Observation only',
    provider: 'gemini',
    model: 'fixture',
    observedAt: time,
    contextHash: 'ctx',
    rationale: 'Read evidence',
    limitations: [],
    citations: [],
    recommendation: { kind: 'none' },
    jevDecision: result.jevDecision,
    assessment: {
      input: result.assessmentInput,
      response: {},
      receipt: 'fixture',
      observedAt: time,
      evaluatedAt: time,
      capture: {
        market: result.market,
        position: result.position,
        orders: result.orders,
        risk: result.risk,
        policy: engine.policy,
        coverage: [],
      },
    },
  };
  return { reply, result, engine };
}

describe('chat evidence snapshots', () => {
  it('retains captured balances and inputs while live state continues to change', async () => {
    const { reply } = await captured();
    const snapshot = snapshotFromAgent(reply, 10)!;
    const balance = snapshot.holdings!.spot_balance_mon;
    reply.assessment!.capture!.position.spot_balance_mon = 0;
    reply.assessment!.input.market.mid_price = 999;
    expect(snapshot.holdings!.spot_balance_mon).toBe(balance);
    expect(snapshot.input.market.mid_price).not.toBe(999);
  });
  it('checks captured evidence at its recorded evaluation time, independent of UI arrival', async () => {
    const { reply } = await captured();
    const first = snapshotFromAgent(reply, 10);
    vi.spyOn(Date, 'now').mockReturnValue(reply.observedAt + 600_000);
    try {
      expect(snapshotFromAgent(reply, 10)?.riskCheck).toEqual(first?.riskCheck);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('does not invent a full snapshot for incomplete evidence', async () => {
    const { reply } = await captured();
    delete reply.assessment!.capture;
    expect(snapshotFromAgent(reply, 10)).toBeNull();
  });
  it('keeps pre-fill holdings in the paper snapshot', async () => {
    const { engine } = await captured();
    const before = structuredClone(engine.position);
    const result = await engine.step(10);
    const snapshot = createAssessmentSnapshot(result, 'replay');
    expect(snapshot.holdings).toEqual(before);
    engine.position.spot_balance_mon = 999;
    expect(snapshot.holdings!.spot_balance_mon).toBe(before.spot_balance_mon);
  });
});

describe('page locations', () => {
  it.each([
    ['/', '/'],
    ['/app', '/app'],
    ['/app/', '/app'],
    ['/app/workspace', '/app/workspace'],
    ['/app/workspace/', '/app/workspace'],
    ['/api/foo', '/'],
  ])('resolves %s', (path, expected) => {
    expect(readRoute(path)).toBe(expected);
  });
});
