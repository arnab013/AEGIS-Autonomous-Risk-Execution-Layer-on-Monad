// src/execution/agentWallet.ts - MetaMask Agent Wallet Scoped Delegation & Session Key Manager

export interface SessionPermissions {
  userAddress: string;
  agentAddress: string;
  allowedVenues: string[]; // e.g. Kuru Router, Perpl DEX, PolicyGuard
  maxNotionalSpendUsd: number;
  maxSpendPerTxUsd: number;
  expiresAt: number; // Unix timestamp ms
  dailyLimitUsd: number;
  cumulativeSpentUsd: number;
}

export interface DelegatedTxRequest {
  targetVenue: string;
  amountUsd: number;
  action: string;
  data?: string;
}

export interface SessionValidationResult {
  allowed: boolean;
  reason?: string;
  remainingAllowanceUsd: number;
}

export class AgentWalletManager {
  private session: SessionPermissions | null = null;
  private isRevoked: boolean = false;

  constructor(defaultSession?: Partial<SessionPermissions>) {
    this.grantSession({
      userAddress: defaultSession?.userAddress || '0x71C...user',
      agentAddress: defaultSession?.agentAddress || '0xAe9...agent',
      allowedVenues: defaultSession?.allowedVenues || ['kuru_router', 'perpl_perp', 'policy_guard'],
      maxNotionalSpendUsd: defaultSession?.maxNotionalSpendUsd ?? 25000,
      maxSpendPerTxUsd: defaultSession?.maxSpendPerTxUsd ?? 5000,
      expiresAt: defaultSession?.expiresAt ?? Date.now() + 24 * 3600 * 1000,
      dailyLimitUsd: defaultSession?.dailyLimitUsd ?? 25000,
      cumulativeSpentUsd: defaultSession?.cumulativeSpentUsd ?? 0,
    });
  }

  /**
   * Grants or refreshes an ERC-7715 / MetaMask Agent Wallet delegated session.
   */
  public grantSession(permissions: SessionPermissions): void {
    this.session = { ...permissions };
    this.isRevoked = false;
  }

  /**
   * Immediately revokes the agent's delegation key.
   */
  public revokeSession(): void {
    this.isRevoked = true;
  }

  /**
   * Returns current active session permissions and status.
   */
  public getSession(): (SessionPermissions & { isRevoked: boolean; isValid: boolean }) | null {
    if (!this.session) return null;
    const isValid = !this.isRevoked && Date.now() < this.session.expiresAt;
    return {
      ...this.session,
      isRevoked: this.isRevoked,
      isValid,
    };
  }

  /**
   * Verifies if an autonomous transaction proposal is permitted by the delegated session.
   */
  public validateDelegatedTx(request: DelegatedTxRequest): SessionValidationResult {
    if (!this.session) {
      return { allowed: false, reason: 'No active MetaMask Agent Wallet session granted', remainingAllowanceUsd: 0 };
    }

    if (this.isRevoked) {
      return { allowed: false, reason: 'MetaMask Agent Wallet session has been revoked by user', remainingAllowanceUsd: 0 };
    }

    if (Date.now() > this.session.expiresAt) {
      return { allowed: false, reason: 'MetaMask Agent Wallet session expired', remainingAllowanceUsd: 0 };
    }

    const venueAllowed = this.session.allowedVenues.some(
      (v) => v.toLowerCase() === request.targetVenue.toLowerCase()
    );
    if (!venueAllowed) {
      return {
        allowed: false,
        reason: `Target venue '${request.targetVenue}' is not in whitelisted session permissions`,
        remainingAllowanceUsd: this.session.maxNotionalSpendUsd - this.session.cumulativeSpentUsd,
      };
    }

    if (request.amountUsd > this.session.maxSpendPerTxUsd) {
      return {
        allowed: false,
        reason: `Tx amount $${request.amountUsd} exceeds per-transaction limit $${this.session.maxSpendPerTxUsd}`,
        remainingAllowanceUsd: this.session.maxNotionalSpendUsd - this.session.cumulativeSpentUsd,
      };
    }

    const projectedSpend = this.session.cumulativeSpentUsd + request.amountUsd;
    if (projectedSpend > this.session.maxNotionalSpendUsd) {
      return {
        allowed: false,
        reason: `Cumulative spend would exceed total session notional limit $${this.session.maxNotionalSpendUsd}`,
        remainingAllowanceUsd: Math.max(0, this.session.maxNotionalSpendUsd - this.session.cumulativeSpentUsd),
      };
    }

    if (this.session.dailyLimitUsd > 0 && projectedSpend > this.session.dailyLimitUsd) {
      return {
        allowed: false,
        reason: `Cumulative spend would exceed daily limit $${this.session.dailyLimitUsd}`,
        remainingAllowanceUsd: Math.max(0, this.session.dailyLimitUsd - this.session.cumulativeSpentUsd),
      };
    }

    return {
      allowed: true,
      remainingAllowanceUsd: this.session.maxNotionalSpendUsd - projectedSpend,
    };
  }

  /**
   * Records execution of a validated delegated transaction.
   */
  public recordExecution(amountUsd: number): void {
    if (this.session && !this.isRevoked) {
      this.session.cumulativeSpentUsd += amountUsd;
    }
  }
}
