# ⚡ AEGIS // Autonomous Risk & Execution Layer on Monad

> **A Real-Time Probabilistic Policy & Deterministic Risk Engine for Autonomous Onchain Finance**

Built for the **Monad Metropolis Hackathon** (Track: *Onchain Finance & Trading*).

---

## What It Is
**Aegis** is an autonomous financial control layer that combines:
1. **Monad Execution**: High-throughput EVM L1 with ~300ms block finality.
2. **TypeSafe AI (Jev)**: "System One" fast typed decision model making bounded probabilistic inferences over market regimes, risk tiers, and strategy proposals.
3. **Deterministic Hard Risk Gate**: Non-negotiable code rules that even an AI hallucination cannot bypass.
4. **Kuru CLOB**: Onchain spot Central Limit Order Book for MON/USDC trading, depth analysis, and atomic batch order cancellations.
5. **Perpl Perpetuals**: Dynamic short delta hedging protecting spot MON exposure without panicking out of spot holdings.
6. **Envio HyperSync**: Microsecond onchain indexing providing a real-time, tamper-proof decision audit stream.
7. **PolicyGuard Contract**: Compact, auditable Solidity guardrail restricting automated transactions on Monad.

---

## Why These Technologies?

### Why Monad?
Traditional blockchains with 2–12 second block times force AI agents into lagging offchain matching or risky asynchronous delays. Monad's **~300ms block time**, **parallel execution**, and **MonadBFT pipelined consensus** allow an autonomous agent to react to sudden orderbook shifts, adjust hedges, or purge stale orders before adverse selection strikes.

### Why Jev (TypeSafe AI)?
Chatbots and generative LLMs are ill-suited for high-frequency financial execution—they suffer from high latency, prompt hallucinations, and unreliable arithmetic.
**Jev** is a bounded "System One" decision model that outputs discrete probability distributions over typed categories:
- **Action**: `[increase_position, reduce_position, hold, hedge, cancel_orders]`
- **Regime**: `[trending_up, trending_down, range_bound, high_volatility, liquidity_stress, uncertain]`
- **Risk**: `[very_low, low, moderate, high, critical]`
- **Shannon Entropy Filtering**: If entropy is high ($H > 0.85$) or confidence is low, Aegis **abstains** and defaults to safe `hold`.

### Why Kuru?
Kuru brings a fully onchain Central Limit Order Book to Monad. Aegis reads real-time bid/ask depth, calculates microsecond Order Book Imbalance (OBI), and executes limit orders with sub-second confirmation.

### Why Perpl?
Rather than simplistic "buy or sell" binary bots, institutional portfolios protect assets dynamically. When Jev detects downside volatility but the user's mandate requires maintaining spot MON exposure, Perpl opens a protective short perpetual hedge to neutralize net delta.

### Why Envio?
Decentralized autonomous agents require verifiable provenance. Envio **HyperSync** and **HyperRPC** index every decision state hash, Jev probability vector, risk gate check, and resulting Monad transaction hash into an auditable chronological stream.

---

## Safety Architecture: AI Proposes, Code Constrains

```
┌─────────────────┐       ┌────────────────────┐       ┌──────────────────┐
│  JEV POLICY     │       │   HARD RISK GATE   │       │  MONAD SETTLEMENT│
│  Probabilistic  ├──────►│   Deterministic    ├──────►│  Kuru & Perpl    │
│  Judgement      │       │   Safety Bounds    │       │  ~300ms Blocks   │
└─────────────────┘       └─────────┬──────────┘       └──────────────────┘
                                    │
                              [If Violated]
                                    ▼
                          ┌────────────────────┐
                          │  EXECUTION BLOCKED │
                          │  Zero Onchain Tx   │
                          │  Capital Protected │
                          └────────────────────┘
```

### The Non-Negotiable Risk Invariants:
1. **Emergency Pause Switch**: Instant circuit breaker (one-click in UI or auto-triggered).
2. **Max Exposure Limit**: Cap on total portfolio spot exposure ($2,000 default).
3. **Max Leverage Cap**: Strict leverage limit (2.0x default).
4. **Max Daily Loss / Drawdown**: Shuts down new risk if daily loss exceeds limit ($400 default).
5. **Liquidity Depth Check**: Requires minimum $1,500 depth within 25 bps to prevent slippage.
6. **Order Stale Timeout**: Resting orders older than 60s are swept via batch cancel.
7. **Trade Cooldown**: Enforces minimum interval between consecutive new-risk orders.

> **CRITICAL PROOF (Scenario 5)**: When Jev proposes an aggressive buy order that would push exposure from $1,950 to $2,200 (violating the $2,000 cap), the **Hard Risk Gate forcefully blocks execution**. Zero transactions are submitted to Monad, proving the safety layer is real.

---

## 5 Interactive Demo Scenarios

| Scenario | Market Conditions | Jev Intelligence | Risk Gate / Action Taken |
| :--- | :--- | :--- | :--- |
| **1. Steady Market** | Balanced book, 4 bps spread | Range-bound regime (74%), Low risk | **HOLD** — Zero unnecessary fees |
| **2. Bullish Momentum** | Heavy buy flow, +0.68 OBI | Trending Up (72%), Low risk | **INCREASE** — Kuru spot buy executed |
| **3. Volatility Shock** | Sell cascade, spread blows to 28 bps | High Volatility (82%), Cancel prob 88% | **CANCEL** — Atomic batch cancel of 3 stale Kuru orders |
| **4. Downside Turbulence** | Downside pressure, high spot exposure | High Risk (84%), Hedge prob 72% | **HEDGE** — Perpl short hedge opened, net delta neutralized |
| **5. Safety Invariant Test** | Bullish momentum, near exposure cap | Increase proposed (74%) | **BLOCKED** — Invariant violation caught, 0 tx submitted |

---

## Getting Started

### Prerequisites
- Node.js v20+ / v22+
- npm or pnpm

### Strict Filesystem Isolation (No C: Drive Writes)
If operating on Windows where C: drive storage is restricted, execute:
```powershell
. .\scripts\setup_env.ps1
```
All caches, temp files, and toolchains are redirected strictly to `F:\Projects\Monad Metropolis\.local\`.

### Installation
```bash
npm install
```

### Run Automated Test Suite
```bash
npm test
```
Runs 15 automated test cases verifying the Hard Risk Gate, Jev probability normalization, entropy calculations, and all 5 Replay Scenarios.

### Launch Trading Terminal UI
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the terminal.

---

## Project Structure
```
├── contracts/
│   └── PolicyGuard.sol        # Onchain risk & permission guard for Monad
├── src/
│   ├── components/            # Trading terminal UI components
│   │   ├── Header.tsx         # Monad telemetry & circuit breaker
│   │   ├── MarketPanel.tsx    # Kuru CLOB visualizer & depth ladder
│   │   ├── PortfolioPanel.tsx # Exposure, net delta & active orders
│   │   ├── JevPolicyPanel.tsx # Jev bounded probabilities & risk checks
│   │   ├── ExplainabilityModal.tsx # Structured factor evidence
│   │   ├── AuditTrailPanel.tsx # Envio HyperSync decision stream
│   │   └── ReplayControlBar.tsx # 5 demo scenarios controller
│   ├── engine/
│   │   ├── marketMath.ts      # Deterministic HF analytics (spread, OBI, vol)
│   │   ├── riskGate.ts        # Non-negotiable deterministic Hard Risk Gate
│   │   └── stateEngine.ts     # Two-speed execution orchestrator
│   ├── execution/
│   │   ├── monadClient.ts     # Viem client for Monad Testnet (Chain ID 10143)
│   │   ├── kuruClient.ts      # Kuru CLOB router & batch order cancellation
│   │   ├── perplClient.ts     # Perpl DEX dynamic short hedging client
│   │   └── envioIndexer.ts    # Envio HyperSync audit trail indexer
│   ├── jev/
│   │   ├── client.ts          # TypeSafe AI Jev decision client
│   │   ├── confidence.ts      # Shannon entropy & uncertainty metrics
│   │   ├── stateBuilder.ts    # Compact structured state builder
│   │   └── policyEngine.ts    # High-level probabilistic policy coordinator
│   ├── data/
│   │   └── scenarios.ts       # 5 deterministic market replay scenarios
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces & schemas
│   ├── App.tsx                # Terminal layout & reactive state
│   ├── index.css              # Dark-mode high-contrast trading styling
│   └── main.tsx               # Root entrypoint
├── tests/
│   ├── riskGate.test.ts       # Safety invariants unit tests
│   ├── jevClient.test.ts      # Probability & entropy unit tests
│   └── stateEngine.test.ts    # End-to-end replay scenario tests
├── docs/                      # Architectural & hackathon documentation
└── scripts/
    └── setup_env.ps1          # C-drive storage isolation guard
```

---

## Submission Checklist
- [x] Strict C: drive isolation verified and enforced
- [x] Deterministic market analytics engine implemented
- [x] Jev bounded probability models and entropy filtering implemented
- [x] Deterministic Hard Risk Gate enforcing 8 non-negotiable invariants
- [x] Scenario 5 verification: AI policy breach is forcefully BLOCKED
- [x] Monad Testnet RPC & viem client integrated (Chain ID 10143)
- [x] Kuru spot CLOB & atomic batch cancellation integrated
- [x] Perpl dynamic perpetual hedging integrated
- [x] Envio HyperSync audit trail indexing integrated
- [x] Onchain `PolicyGuard.sol` smart contract implemented
- [x] 5 complete deterministic replay scenarios with narration script
- [x] Polished dark financial trading terminal UI
- [x] Zero private keys or credentials committed to source control
