# Aegis System Architecture

## Overview
Aegis is an AI-native probabilistic policy and deterministic risk engine purpose-built for autonomous onchain finance on **Monad**.

It bridges high-throughput decentralized execution (**Monad**, **Kuru CLOB**, **Perpl Perpetuals**) with bounded "System One" probabilistic judgement (**TypeSafe AI / Jev**) and non-negotiable safety guardrails (**Deterministic Risk Engine** & **PolicyGuard Smart Contract**).

```
                      MONAD TESTNET (Chain ID: 10143)
                                    │
                                    │ (WebSocket / Polling ~300ms)
                                    ▼
             ┌──────────────────────────────────────────────┐
             │            LIVE ONCHAIN FEEDS                │
             │  - Kuru CLOB (Orderbook Depth, Spread, Flow) │
             │  - Perpl Perpetuals (Funding, Mark, Open Int)│
             │  - Envio HyperSync (Indexed Txs & Events)    │
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │             STATE ENGINE (FAST LOOP)         │
             │  Sub-second deterministic mathematics:       │
             │  - Spread (bps)      - Volatility (1m/5m)    │
             │  - Orderbook Imbalance - Liquidity Stress    │
             │  - Portfolio Exposure - Drawdown / PnL       │
             └──────────────────────┬───────────────────────┘
                                    │
             ┌──────────────────────┴───────────────────────┐
             │ Trigger: 1-3s interval OR volatility spike   │
             │ Compact State Serialization (< 250 tokens)   │
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │         JEV POLICY ENGINE (INTELLIGENCE)     │
             │  Bounded Typed Probabilistic Distributions:  │
             │  - Action: [increase, reduce, hold, hedge]   │
             │  - Regime: [trending, range, high_vol, ...]  │
             │  - Risk:   [very_low, low, mod, high, crit]  │
             │  - Anomaly: P(anomaly)                       │
             │  - Uncertainty & Shannon Entropy Filtering   │
             └──────────────────────┬───────────────────────┘
                                    │ Proposed Action + Probs
                                    ▼
             ┌──────────────────────────────────────────────┐
             │        HARD RISK GATE (DETERMINISTIC)        │
             │  Non-negotiable invariants (JEV CANNOT BYPASS)│
             │  1. Emergency Pause Switch                   │
             │  2. Max Net Exposure Cap ($2,000)            │
             │  3. Max Leverage Cap (2.0x)                  │
             │  4. Max Daily Loss Cap ($400)                │
             │  5. Order Size & Liquidity Depth Thresholds  │
             │  6. Order Stale Timeout & Cancel Sweep       │
             └──────────────────────┬───────────────────────┘
                                    │
                       ┌────────────┴────────────┐
             [PASSED]  │                         │ [BLOCKED]
                       ▼                         ▼
             ┌───────────────────┐     ┌───────────────────┐
             │ POLICYGUARD (EVM) │     │ ZERO TRANSACTION  │
             │ Onchain Guard     │     │ Capital Protected │
             └─────────┬─────────┘     │ Policy Violation  │
                       │               │ Logged to Audit   │
                       ▼               └───────────────────┘
             ┌───────────────────┐
             │ MONAD EXECUTION   │
             │ - Kuru Limit Buy  │
             │ - Perpl Short     │
             │ - Atomic Batch Del│
             └───────────────────┘
```

---

## Two-Speed Loop Architecture

### 1. Fast Loop (< 100ms)
- Runs deterministically on every market tick without blocking for AI.
- Ingests orderbook depth, updates rolling returns, computes drawdown and exposure.
- Enforces instant circuit-breaker conditions (e.g. manual emergency pause or liquidation risk).

### 2. Intelligence Loop (1–3s or Event-Triggered)
- Triggered by significant state changes: volatility jump, orderbook imbalance shift > 0.4, or execution fills.
- Compiles a minimal, high-salience JSON state representation.
- Queries TypeSafe AI Jev model for bounded categorical probabilities.
- Computes Shannon entropy $H = -\sum p_i \log_2 p_i$. If confidence is below threshold ($H > 0.85$ or margin $< 0.12$), the system abstains and defaults to safe `hold`.
- Filters the top action through the deterministic Hard Risk Gate.

---

## Smart Contract Guard (`PolicyGuard.sol`)
Located in `contracts/PolicyGuard.sol`.
- **Whitelisted Venues**: Restricts automated transactions strictly to Kuru Router and Perpl DEX.
- **Whitelisted Tokens**: Restricts trading strictly to MON and USDC.
- **Max Notional Cap**: Hard limits on single transactions ($500) and cumulative 24h rolling volume ($5,000).
- **Emergency Circuit Breaker**: Instant pause callable by user or automated agent on anomaly detection.
