# Monad Metropolis Hackathon Submission Document

## Project Details
- **Project Name**: Aegis
- **Tagline**: An AI-native execution control & probabilistic risk layer for autonomous onchain finance on Monad.
- **Track**: Onchain Finance & Trading
- **Hackathon**: Monad Metropolis Hackathon (September 1 – October 13, 2026)
- **Official Track URL**: [https://hackathon.monad.xyz/tracks/onchain-finance](https://hackathon.monad.xyz/tracks/onchain-finance)

---

## Executive Summary
Autonomous onchain finance requires reasoning under market ambiguity without risking catastrophic capital loss. Aegis introduces a two-speed architecture:
1. **Sub-second Deterministic Engine** computing microsecond market analytics (spread, volatility, depth, imbalance, drawdown).
2. **TypeSafe Jev Intelligence Layer** producing bounded categorical probability distributions over permitted actions, market regimes, and risk tiers with Shannon entropy confidence filtering.
3. **Non-Negotiable Deterministic Hard Risk Gate** and `PolicyGuard.sol` smart contract guaranteeing that AI proposals can never exceed user constraints.
4. **Monad Settlement** delivering ~300ms transaction finality across Kuru CLOB and Perpl Perpetuals.

---

## Bounty & Sponsor Integration Mapping

| Sponsor / Protocol | Integration Role in Aegis | Verification Status |
| :--- | :--- | :--- |
| **Monad** | High-throughput L1 execution (Chain ID 10143), pipelined block processing, sub-second transaction settlement. | **Live / Tested** |
| **TypeSafe AI (Jev)** | Bounded System One probabilistic policy model returning discrete probability distributions over Action, Regime, and Risk with entropy metrics. | **Live / Tested** |
| **Kuru** | Onchain CLOB spot trading venue for MON/USDC, orderbook depth streaming, limit order placement, and atomic batch cancellation. | **Integrated** |
| **Perpl** | Onchain perpetuals DEX enabling dynamic short delta hedging of spot MON holdings during volatility shocks. | **Integrated** |
| **Envio** | HyperSync and HyperRPC low-latency indexing of agent decisions, risk checks, and verifiable execution receipts. | **Integrated** |
| **Smart Contract Guard** | `PolicyGuard.sol` deployed on Monad enforcing onchain venue, token, and notional spend caps. | **Audited / Tested** |

---

## Key Differentiators vs. Generic AI Bots
- **No Generative Text Gimmicks**: Uses typed, bounded probability vectors rather than unconstrained LLM text generation.
- **Shannon Entropy Filtering**: Quantifies uncertainty; if entropy is high or margin between top choices is low, Aegis automatically abstains.
- **Hard Risk Gate Invariant**: Scenario 5 demonstrates that if Jev hallucinates or proposes an action that breaches user limits, execution is forcefully **BLOCKED**.
- **Two-Speed Execution**: Fast loop (<100ms) handles orderbook calculations and emergency stops; Intelligence loop (1-3s) evaluates macro regime.
