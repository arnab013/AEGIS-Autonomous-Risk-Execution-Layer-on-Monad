// tests/policyGuard.test.ts - Automated Unit Tests for PolicyGuard Smart Contract Invariants

import { describe, it, expect, beforeEach } from 'vitest';

export class PolicyGuardSimulator {
  public owner: string;
  public authorizedAgent: string;
  public isPaused: boolean = false;
  public maxTxNotionalUsd: number;
  public maxDailyNotionalUsd: number;
  public currentDayNotionalSpent: number = 0;
  public allowedVenues: Set<string> = new Set();
  public allowedTokens: Set<string> = new Set();
  public executionNonce: number = 0;

  constructor(owner: string, agent: string, maxTx: number, maxDaily: number) {
    this.owner = owner;
    this.authorizedAgent = agent;
    this.maxTxNotionalUsd = maxTx;
    this.maxDailyNotionalUsd = maxDaily;
  }

  public executeConstrainedAction(
    caller: string,
    venue: string,
    token: string,
    notionalUsd: number
  ): { success: boolean; error?: string; nonce?: number } {
    if (this.isPaused) return { success: false, error: 'PolicyGuard: trading execution is paused' };
    if (caller !== this.authorizedAgent && caller !== this.owner) {
      return { success: false, error: 'PolicyGuard: caller not authorized agent' };
    }
    if (!this.allowedVenues.has(venue)) {
      return { success: false, error: 'PolicyGuard: venue not approved in user policy' };
    }
    if (!this.allowedTokens.has(token)) {
      return { success: false, error: 'PolicyGuard: token not approved in user policy' };
    }
    if (notionalUsd > this.maxTxNotionalUsd) {
      return { success: false, error: 'PolicyGuard: transaction exceeds maxTxNotional limit' };
    }
    if (this.currentDayNotionalSpent + notionalUsd > this.maxDailyNotionalUsd) {
      return { success: false, error: 'PolicyGuard: daily cumulative notional cap exceeded' };
    }

    this.currentDayNotionalSpent += notionalUsd;
    this.executionNonce++;
    return { success: true, nonce: this.executionNonce };
  }

  public emergencyPause(caller: string): boolean {
    if (caller !== this.owner && caller !== this.authorizedAgent) return false;
    this.isPaused = true;
    return true;
  }

  public unpause(caller: string): boolean {
    if (caller !== this.owner) return false;
    this.isPaused = false;
    return true;
  }
}

describe('PolicyGuard Onchain Smart Contract Suite', () => {
  const OWNER = '0x1111111111111111111111111111111111111111';
  const AGENT = '0x2222222222222222222222222222222222222222';
  const ATTACKER = '0x9999999999999999999999999999999999999999';
  const KURU_ROUTER = '0x4444444444444444444444444444444444444444';
  const UNAPPROVED_DEX = '0x6666666666666666666666666666666666666666';
  const MON = '0x0000000000000000000000000000000000000000';

  let guard: PolicyGuardSimulator;

  beforeEach(() => {
    guard = new PolicyGuardSimulator(OWNER, AGENT, 500, 5000);
    guard.allowedVenues.add(KURU_ROUTER);
    guard.allowedTokens.add(MON);
  });

  it('permits authorized agent to execute within notional limits', () => {
    const res = guard.executeConstrainedAction(AGENT, KURU_ROUTER, MON, 250);
    expect(res.success).toBe(true);
    expect(res.nonce).toBe(1);
    expect(guard.currentDayNotionalSpent).toBe(250);
  });

  it('BLOCKS unauthorized attacker address', () => {
    const res = guard.executeConstrainedAction(ATTACKER, KURU_ROUTER, MON, 250);
    expect(res.success).toBe(false);
    expect(res.error).toContain('caller not authorized agent');
  });

  it('BLOCKS unapproved external venue contract', () => {
    const res = guard.executeConstrainedAction(AGENT, UNAPPROVED_DEX, MON, 250);
    expect(res.success).toBe(false);
    expect(res.error).toContain('venue not approved');
  });

  it('BLOCKS single order exceeding maxTxNotional limit', () => {
    const res = guard.executeConstrainedAction(AGENT, KURU_ROUTER, MON, 600); // 600 > 500
    expect(res.success).toBe(false);
    expect(res.error).toContain('exceeds maxTxNotional limit');
  });

  it('BLOCKS transactions exceeding cumulative daily notional cap', () => {
    guard.currentDayNotionalSpent = 4800;
    const res = guard.executeConstrainedAction(AGENT, KURU_ROUTER, MON, 300); // 4800 + 300 = 5100 > 5000
    expect(res.success).toBe(false);
    expect(res.error).toContain('daily cumulative notional cap exceeded');
  });

  it('emergency circuit breaker stops all execution', () => {
    expect(guard.emergencyPause(AGENT)).toBe(true);
    expect(guard.isPaused).toBe(true);

    const res = guard.executeConstrainedAction(AGENT, KURU_ROUTER, MON, 100);
    expect(res.success).toBe(false);
    expect(res.error).toContain('trading execution is paused');

    // Only owner can unpause
    expect(guard.unpause(ATTACKER)).toBe(false);
    expect(guard.unpause(OWNER)).toBe(true);
    expect(guard.isPaused).toBe(false);
  });
});
