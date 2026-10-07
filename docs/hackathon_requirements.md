# Monad Metropolis Hackathon — Requirements & Ecosystem Research

## Hackathon Overview
- **Event**: Monad Metropolis Hackathon (Global Online)
- **Track**: Onchain Finance & Trading
- **Submission Deadline**: October 14, 2026 at 03:59 UTC
- **Official Track Link**: [https://hackathon.monad.xyz/tracks/onchain-finance](https://hackathon.monad.xyz/tracks/onchain-finance)

---

## Ecosystem Integrations & Specifications

### 1. Monad Network (Core Settlement Layer)
- **Network Name**: Monad Testnet
- **Chain ID**: `10143` (`0x279f`)
- **Native Currency**: `MON` (18 decimals)
- **Public RPC**: `https://testnet-rpc.monad.xyz` / `https://rpc-testnet.monadinfra.com`
- **Block Time**: ~300ms – 400ms (~10,000 TPS, pipelined consensus + parallel EVM)
- **Explorers**:
  - MonadVision: [https://testnet.monadvision.com](https://testnet.monadvision.com)
  - Monadscan: [https://testnet.monadscan.com](https://testnet.monadscan.com)
- **Role in Project**: Fast transaction execution, sub-second order placement, instant onchain risk settlement.

### 2. Jev / TypeSafe AI (Probabilistic Intelligence Layer)
- **Core Technology**: "System One" decision model by TypeSafe AI.
- **Differentiator**: Specialized for bounded, typed probabilistic categorizations rather than unconstrained text generation.
- **Decision Vectors**:
  - Action Probability: `[increase_position, reduce_position, hold, hedge, cancel_orders]`
  - Market Regime Probability: `[trending_up, trending_down, range_bound, high_volatility, liquidity_stress, uncertain]`
  - Risk Level Probability: `[very_low, low, moderate, high, critical]`
  - Anomaly Indicator: `P(anomaly)`
  - Order Stale/Cancel Indicator: `P(cancel_orders)`
- **Role in Project**: Evaluates ambiguous market states, computes uncertainty metrics (entropy, margin), and guides high-level policy without performing deterministic arithmetic.

### 3. Kuru (Onchain Central Limit Order Book)
- **Technology**: Fully onchain CLOB on Monad with sub-second matching.
- **Contracts / SDK**: Kuru Router, OrderBook, MarginAccount (`@kuru-labs/kuru-sdk` / REST & WebSocket streams).
- **Core Market**: MON/USDC.
- **Role in Project**: Primary spot execution venue for maker/taker limit orders, orderbook depth monitoring, and bid-ask spread analysis.

### 4. Perpl (Onchain Perpetuals DEX)
- **Technology**: CLOB-based perpetual futures on Monad.
- **Role in Project**: Dynamic delta hedging. When spot exposure is high and Jev identifies downside risk/volatility spike without full spot capitulation, Perpl executes an automated short hedge.

### 5. Envio (HyperSync & HyperIndex)
- **Endpoints**:
  - HyperSync: `https://monad-testnet.hypersync.xyz`
  - HyperRPC: `https://monad-testnet.rpc.hypersync.xyz`
- **Role in Project**: High-speed indexing of execution receipts, fills, agent policy logs, and verifiable onchain audit trails.

### 6. MetaMask Agent Wallet (Feasibility Assessment)
- **Assessment**: Feasible as a delegated session signer / permissioned agent wallet key with scoped allowances. Implemented via session-scoped execution guard.

---

## Submission Criteria & Strategy
- **Core Value Proposition**: An AI-native execution control and probabilistic risk layer for autonomous onchain finance.
- **Separation of Concerns**:
  - Deterministic Math & Hard Risk: Local TypeScript engine (spread, volatility, exposure, drawdown, hard bounds).
  - Ambiguity & Regime Judgement: Jev bounded probabilities.
  - Non-negotiable Capital Protection: Hardcoded risk gates + Smart Contract Policy Guard.
  - High-Speed Settlement: Monad parallel execution.
