import { describe, it, expect } from 'vitest';
import { AgentWalletManager } from '../src/execution/agentWallet.ts';

describe('MetaMask Agent Wallet Scoped Delegation', () => {
  it('initializes with default session permissions', () => {
    const manager = new AgentWalletManager({
      userAddress: '0x1234567890abcdef1234567890abcdef12345678',
      agentAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      maxNotionalSpendUsd: 10000,
      maxSpendPerTxUsd: 2000,
    });

    const session = manager.getSession();
    expect(session).not.toBeNull();
    expect(session?.isValid).toBe(true);
    expect(session?.maxNotionalSpendUsd).toBe(10000);
    expect(session?.maxSpendPerTxUsd).toBe(2000);
  });

  it('validates allowed transaction within limits', () => {
    const manager = new AgentWalletManager({
      allowedVenues: ['kuru_router', 'perpl_perp'],
      maxNotionalSpendUsd: 10000,
      maxSpendPerTxUsd: 2000,
    });

    const result = manager.validateDelegatedTx({
      targetVenue: 'kuru_router',
      amountUsd: 1500,
      action: 'place_order',
    });

    expect(result.allowed).toBe(true);
    expect(result.remainingAllowanceUsd).toBe(8500);
  });

  it('blocks transaction exceeding per-transaction cap', () => {
    const manager = new AgentWalletManager({
      allowedVenues: ['kuru_router'],
      maxNotionalSpendUsd: 10000,
      maxSpendPerTxUsd: 2000,
    });

    const result = manager.validateDelegatedTx({
      targetVenue: 'kuru_router',
      amountUsd: 2500,
      action: 'place_order',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds per-transaction limit');
  });

  it('blocks transaction targeting non-whitelisted venue', () => {
    const manager = new AgentWalletManager({
      allowedVenues: ['kuru_router'],
      maxNotionalSpendUsd: 10000,
      maxSpendPerTxUsd: 2000,
    });

    const result = manager.validateDelegatedTx({
      targetVenue: 'unauthorized_dex',
      amountUsd: 500,
      action: 'swap',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in whitelisted session permissions');
  });

  it('blocks transaction when user revokes session', () => {
    const manager = new AgentWalletManager();
    manager.revokeSession();

    const result = manager.validateDelegatedTx({
      targetVenue: 'kuru_router',
      amountUsd: 100,
      action: 'place_order',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('revoked');
  });
});
