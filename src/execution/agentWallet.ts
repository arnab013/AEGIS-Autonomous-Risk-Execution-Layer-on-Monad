// Local mandate limiter. This does not create a MetaMask delegation or signing key.
import { assertAddress } from './monadClient.ts';
export interface SessionPermissions {
  userAddress: string;
  agentAddress: string;
  allowedVenues: string[];
  maxNotionalSpendUsd: number;
  maxSpendPerTxUsd: number;
  expiresAt: number;
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
const DAY_MS = 86400000;
const validAmount = (n: number) => Number.isFinite(n) && n >= 0;
export class AgentWalletManager {
  private session: SessionPermissions | null = null;
  private isRevoked = false;
  private dailySpentUsd = 0;
  private day = Math.floor(Date.now() / DAY_MS);
  private reservations = new Map<string, number>();
  constructor(initial?: Partial<SessionPermissions>) {
    if (initial) {
      if (!initial.userAddress || !initial.agentAddress)
        throw new Error('A local mandate requires explicit user and agent addresses');
      this.grantSession({
        userAddress: initial.userAddress,
        agentAddress: initial.agentAddress,
        allowedVenues: initial.allowedVenues ?? [],
        maxNotionalSpendUsd: initial.maxNotionalSpendUsd ?? 0,
        maxSpendPerTxUsd: initial.maxSpendPerTxUsd ?? 0,
        expiresAt: initial.expiresAt ?? Date.now(),
        dailyLimitUsd: initial.dailyLimitUsd ?? 0,
        cumulativeSpentUsd: initial.cumulativeSpentUsd ?? 0,
      });
    }
  }
  public grantSession(permissions: SessionPermissions): void {
    assertAddress(permissions.userAddress);
    assertAddress(permissions.agentAddress);
    for (const amount of [
      permissions.maxNotionalSpendUsd,
      permissions.maxSpendPerTxUsd,
      permissions.dailyLimitUsd,
      permissions.cumulativeSpentUsd,
    ])
      if (!validAmount(amount)) throw new Error('Mandate limits must be finite and non-negative');
    if (
      !Number.isFinite(permissions.expiresAt) ||
      permissions.maxSpendPerTxUsd > permissions.maxNotionalSpendUsd ||
      permissions.cumulativeSpentUsd > permissions.maxNotionalSpendUsd ||
      permissions.allowedVenues.some((v) => !v.trim())
    )
      throw new Error('Invalid local mandate');
    if (this.reservations.size)
      throw new Error('Resolve pending executions before replacing the mandate');
    this.session = { ...permissions, allowedVenues: [...permissions.allowedVenues] };
    this.isRevoked = false;
    this.day = Math.floor(Date.now() / DAY_MS);
    this.dailySpentUsd = permissions.cumulativeSpentUsd;
  }
  public revokeSession(): void {
    this.isRevoked = true;
  }
  private rollover(): void {
    const day = Math.floor(Date.now() / DAY_MS);
    if (day !== this.day) {
      this.dailySpentUsd = 0;
      this.day = day;
    }
  }
  private reserved(): number {
    return [...this.reservations.values()].reduce((a, b) => a + b, 0);
  }
  public getSession():
    | (SessionPermissions & {
        isRevoked: boolean;
        isValid: boolean;
        dailySpentUsd: number;
        reservedUsd: number;
        authorization: 'local_policy_only';
      })
    | null {
    if (!this.session) return null;
    this.rollover();
    return {
      ...this.session,
      allowedVenues: [...this.session.allowedVenues],
      isRevoked: this.isRevoked,
      isValid: !this.isRevoked && Date.now() < this.session.expiresAt,
      dailySpentUsd: this.dailySpentUsd,
      reservedUsd: this.reserved(),
      authorization: 'local_policy_only',
    };
  }
  public validateDelegatedTx(request: DelegatedTxRequest): SessionValidationResult {
    this.rollover();
    const remaining = this.session
      ? Math.max(
          0,
          this.session.maxNotionalSpendUsd - this.session.cumulativeSpentUsd - this.reserved()
        )
      : 0;
    const reject = (reason: string): SessionValidationResult => ({
      allowed: false,
      reason,
      remainingAllowanceUsd: remaining,
    });
    if (!this.session) return reject('No local trading mandate granted');
    if (this.isRevoked) return reject('Local trading mandate revoked');
    if (Date.now() >= this.session.expiresAt) return reject('Local trading mandate expired');
    if (!Number.isFinite(request.amountUsd) || request.amountUsd <= 0)
      return reject('Transaction amount must be finite and positive');
    if (!request.action.trim()) return reject('An explicit action is required');
    if (
      !this.session.allowedVenues.some((v) => v.toLowerCase() === request.targetVenue.toLowerCase())
    )
      return reject('Target venue is not in whitelisted local mandate');
    if (request.amountUsd > this.session.maxSpendPerTxUsd)
      return reject('Transaction exceeds per-transaction limit');
    if (request.amountUsd > remaining)
      return reject('Transaction would exceed total mandate limit including pending executions');
    if (this.dailySpentUsd + this.reserved() + request.amountUsd > this.session.dailyLimitUsd)
      return reject('Transaction would exceed daily limit including pending executions');
    return { allowed: true, remainingAllowanceUsd: remaining - request.amountUsd };
  }
  public reserveExecution(request: DelegatedTxRequest): string {
    const check = this.validateDelegatedTx(request);
    if (!check.allowed) throw new Error(check.reason);
    const id = crypto.randomUUID();
    this.reservations.set(id, request.amountUsd);
    return id;
  }
  public settleExecution(id: string, confirmed: boolean): void {
    const amount = this.reservations.get(id);
    if (amount === undefined) throw new Error('Unknown or already settled execution');
    this.reservations.delete(id);
    if (confirmed && this.session) {
      this.rollover();
      this.session.cumulativeSpentUsd += amount;
      this.dailySpentUsd += amount;
    }
  }
  public recordExecution(amountUsd: number): void {
    if (!this.session || this.isRevoked || Date.now() >= this.session.expiresAt)
      throw new Error('No active local mandate');
    this.rollover();
    if (
      !Number.isFinite(amountUsd) ||
      amountUsd <= 0 ||
      amountUsd > this.session.maxSpendPerTxUsd ||
      this.session.cumulativeSpentUsd + this.reserved() + amountUsd >
        this.session.maxNotionalSpendUsd ||
      this.dailySpentUsd + this.reserved() + amountUsd > this.session.dailyLimitUsd
    )
      throw new Error('Execution accounting would violate local mandate');
    this.session.cumulativeSpentUsd += amountUsd;
    this.dailySpentUsd += amountUsd;
  }
}
