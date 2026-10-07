# Aegis Risk Model & Safety Invariants

## Core Philosophy
In decentralized finance, **safety cannot depend on probabilistic AI**. 

Even if an AI model exhibits 99% accuracy, an unhandled hallucination or unexpected regime shift could exhaust user collateral in seconds. Therefore, Aegis enforces a strict, hierarchical separation of concerns:

1. **Deterministic Code Computes**: Price, spread, orderbook depth, OBI, rolling volatility, drawdown, and leverage.
2. **Jev Interprets Ambiguity**: Market regime, anomaly likelihood, risk level, and bounded strategy proposals.
3. **Deterministic Hard Risk Gate Restricts**: Every proposed trade is passed through non-negotiable hardcoded constraints before execution.
4. **Smart Contract Enforces Onchain**: `PolicyGuard.sol` guarantees no unauthorized venue, token, or excess notional can ever touch the blockchain.

---

## The 8 Non-Negotiable Invariants

| Invariant | Trigger Condition | Enforcement Action |
| :--- | :--- | :--- |
| **Emergency Pause** | User or automated circuit breaker toggled | Immediately blocks all new risk; only permit order cancellations |
| **Max Position Cap** | Prospective exposure > `max_position_usd` ($2,000) | **REJECTS** proposed trade; defaults to `hold` |
| **Max Leverage Cap** | Prospective leverage > `max_leverage` (2.0x) | **REJECTS** trade; alerts user in terminal |
| **Max Daily Loss** | Cumulative daily loss $\ge$ `max_daily_loss` ($400) | **LOCKS OUT** new risk; permits only de-risking |
| **Max Order Size** | Proposed clip > `max_order_size` ($300) | **REJECTS** or clamps order size |
| **Minimum Depth** | Available depth within 25 bps < `min_liquidity_depth` ($1,500) | **REJECTS** market orders to prevent toxic slippage |
| **Order Stale Timeout** | Resting order age > `stale_order_timeout` (60s) | Forces atomic batch cancellation on Kuru |
| **Trade Cooldown** | Time since last trade < `cooldown_seconds` (2s) | Throttles high-frequency churn |

---

## Proof of Safety (Scenario 5)
In Hackathon Replay Scenario 5:
- Portfolio spot exposure is $1,950 against a $2,000 policy cap.
- Fast momentum signals trigger a strong bullish sentiment in Jev ($P(\text{increase}) = 0.74$).
- Jev attempts to place a $250 spot buy clip.
- **Outcome**: The Deterministic Hard Risk Gate detects prospective exposure would reach $2,200 ($> \$2,000$).
- **Result**: The transaction is forcefully **BLOCKED**. Zero transactions are submitted to Monad, and a verifiable policy violation is logged to the Envio audit trail.
