# Aegis — submission draft and evidence checklist

**Working draft, 8 October 2026.** Replace every pending evidence item with a reproducible result before submission. Do not submit earlier claims of deployed contracts, live hedges, measured finality, security audits, or bounty qualification without proof.

## Project details

- **Name:** Aegis
- **One-liner:** A probabilistic risk copilot for wallet-reviewed MON/USDC trading on Monad.
- **Primary track:** Onchain Finance & Trading
- **Official event:** [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis)
- **Platform deadline:** 14 October 2026, 03:59 UTC / 05:59 CEST in Paris. Confirm the registered project's effective deadline.
- **Public app:** pending
- **Code repository:** pending
- **Demo video:** pending
- **Pitch video:** pending
- **Judge access instructions:** pending

Requirements and source links: [hackathon requirements](hackathon_requirements.md).

The [official Rules v3](https://hackathon.monad.xyz/api/v1/policies/current) require a public GitHub repository under an OSI-approved license, build-window commit history, attribution, disclosure of AI coding tools, a Monad mainnet/testnet deployment, and a public demo of at most 3 minutes. Follow these rules despite the marketing FAQ's more permissive open-source statement.

## Problem and product

A trader can define a position limit, but an automated strategy still needs to decide whether current evidence supports adding inventory, reducing exposure, waiting, or cancelling resting orders. Market information is incomplete and contradictory; confidence needs to influence behavior before a trade is requested.

Aegis puts that uncertainty beside executable policy. Deterministic code calculates market statistics and checks user constraints. The official Jev adapter evaluates compact market and portfolio state using typed Choice and Noul questions when paid inference is approved and enabled. Its probabilities inform a bounded proposal. The application blocks proposals that violate policy and can prepare a protective native MON sale for the user's wallet. Receipt/transaction checks, delivered USDC and refreshed balances complete the implemented execution record; actual signed execution and an official paid response remain pending proof.

The core MVP is one market and one honest transaction workflow. Replay provides reproducible stress scenarios; live trading uses real chain state and the user's actual wallet. A replay action never becomes a blockchain transaction merely because it appears in the activity feed.

## Why these components matter

**Monad:** Kuru's onchain market gives the product a real venue to read and execute against. Responsive reads, order operations, and receipt reconciliation demonstrate the value of fast settlement. Report measured application timing separately from network performance claims.

**Jev:** The model resolves bounded ambiguity rather than calculating arithmetic or inventing unrestricted trades. Action, regime, and risk probabilities expose disagreement. Official model confidence, application entropy, and probability margin are labeled separately. Invalid, unavailable, or uncertain inference cannot silently become a high-confidence live decision.

**Deterministic policy:** Exposure, loss, size, liquidity, pause, stale-data, and supported-action checks run independently of model recommendations. Wallet approval remains the authorization boundary for live execution. Application checks are not an audited smart-contract guarantee.

## Integration evidence

| Component | Submission-safe statement | Proof required |
| --- | --- | --- |
| Risk and replay engine | Local deterministic controls, heuristic replay and paper accounting; 128 tests/build passed and browser oversized-proposal rejection verified. | Preserve final verification output and recorded blocked proposal. |
| Monad | Mainnet chain and Kuru contract reads verified during development; no signed transaction yet. | Preserve current chain/read/bytecode evidence and an actual approved receipt. |
| Kuru | Real pinned-block market/AMM depth and wallet balances; native MON sale calldata simulation and gas estimation succeeded read-only from a funded public account. Wallet/receipt path implemented. | Actual signed transaction and verified output. Resting orders/history are not indexed. |
| TypeSafe Jev | Official adapter and parser tests pass; key configured but paid service disabled pending credit authorization. | Redacted official response with model, source, timing, probabilities. |
| Perpl | Hedging is an extension; replay hedges are simulated. | Documented authenticated live order and position reconciliation before claiming execution. |
| Envio | Local audit records are not Envio indexing. | Authenticated event queries/indexer output used in the main workflow. |
| MetaMask Agent Wallet | An extension connection or local session key is not an Agent Wallet plugin. | Real `mm` plugin manifest, commands, and host integration. |
| PolicyGuard | Solidity 0.8.30 compilation and 13 local EVM tests passed. Source is separate from the direct wallet flow; no Monad deployment/audit. | Deployment address/bytecode and actual guarded call before claiming onchain enforcement. |

Update rows only after verification. None of the optional integration rows currently establishes bounty qualification.

## Demo sequence to record

1. Select live mode and verify the configured Kuru MON/USDC market address and chain. Mainnet observation is the default; testnet execution needs current usable liquidity.
2. Connect the wallet; show balances, venue state, and hard policy settings.
3. Show the market source and freshness. Request a Jev decision only when API usage is authorized.
4. Show probabilities, source, model identity, uncertainty measures, and the policy result.
5. Prepare a protective native MON sale within current minimum size and policy limits. Simulate exact calldata, show wallet review, then have the user approve the specific transaction and gas.
6. Show the actual transaction hash, matching receipt/transaction, delivered USDC and refreshed balances. A submitted transaction is not a filled order.
7. Switch to explicitly labeled replay for a repeatable oversized proposal. Show the failed check and no wallet request.
8. Demonstrate pause and stale-data rejection; explain what is supported and what remains an extension.

If step 5 cannot be completed, report the app as having a prepared transaction path, not verified execution. A complete competition entry still needs an actual working end-to-end demonstration.

## Bounty positioning

Kuru's consumer trading opportunity is the nearest candidate for this MVP. Perpl analytics/risk is a plausible extension only when actual Perpl data powers the product. Envio requires substantive indexing. MetaMask's plugin opportunity requires the real Agent Wallet plugin architecture. New Kuru assets/markets is not established by a MON/USDC trading tool. Full sponsor criteria and track eligibility remain pending authenticated platform review. See the sourced matrix in [requirements](hackathon_requirements.md).

## Final checks before publishing

- [ ] Confirm registered-project rules, eligibility, selected primary track, and effective deadline.
- [ ] Publish complete source on GitHub under an OSI-approved license with attribution and build-window commit history.
- [ ] Identify pre-existing components and disclose AI coding-tool use in the README; verify that the substantial majority of submitted work is new.
- [ ] Deploy a public app with safe server configuration and no client-side secrets.
- [ ] Complete one actual wallet-approved Kuru action and preserve its receipt/venue evidence.
- [ ] Capture a real authorized Jev response; label fallback and replay correctly.
- [ ] Record blocked proposal, uncertainty, stale data, pause, and failure behavior.
- [x] Finish reproducible setup/build/test instructions under the F: storage policy; 128 tests and TypeScript/Vite build passed without paid API calls.
- [ ] Remove every unverified integration, audit, latency, and profitability claim.
- [ ] Record an actual-operation demo of at most 3 minutes showing Monad interactions.
- [ ] Add repository, app, demo, pitch, and access links; complete sponsor-specific questions.

## Pitch draft

Aegis helps a trader act under uncertainty without giving a model unrestricted control of the wallet. It reads a real Kuru market on Monad, calculates risk in code, and integrates Jev for bounded probabilities over permitted actions. The policy gate either blocks a proposal or prepares a protective MON sale the user can review. The execution record connects evidence, uncertainty, user limits and a verified chain result. The planned demonstration includes a real approved action and an oversized proposal stopped before a wallet request; record and link that proof before submitting this pitch.
