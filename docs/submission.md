# Aegis submission draft

Working draft, 12 October 2026. The hosted app, automated checks and real Google-backed Scout workflow have passed. Public source access and the public demo still need final evidence.

| Field              | Value                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | Aegis                                                                                                                                                                   |
| One-liner          | A MON/USDC risk copilot combining inspectable AI findings and user limits before a wallet-reviewed trade                                                                |
| Track              | Onchain Finance & Trading                                                                                                                                               |
| Event              | [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis)                                                                                                  |
| Deadline           | 14 October 2026, 03:59 UTC / 05:59 CEST in Paris; confirm in the registered project                                                                                     |
| Public app         | [Cloudflare app](https://aegis.himaloy2608.workers.dev)                                                                                                                 |
| Repository         | [Selected repository](https://github.com/arnab013/AEGIS-Autonomous-Risk-Execution-Layer-on-Monad); release branch: codex/aegis-risk-control-mvp                         |
| Demo / pitch video | Pending                                                                                                                                                                 |
| Judge access       | Public market, replay and sale simulation need no login. AI uses a Turnstile-validated trial, user key or disabled mode; public funding has a persistent US$8 allowance |

The [official Rules v3](https://hackathon.monad.xyz/api/v1/policies/current), re-read on 12 October, require licensed public GitHub source, build-window history, attribution, AI-tool disclosure, Monad deployment evidence and a public demo of at most three minutes. The deadline remains 13 October at 23:59 ET, equivalent to **14 October at 05:59 CEST in Paris**. Follow these rules despite the marketing FAQ's more permissive open-source wording. See [requirements](hackathon_requirements.md).

The rules accept contract addresses or transaction hashes as Monad evidence. A signed sale is part of Aegis's planned execution validation; it is required before describing a confirmed fill. A demo that stops at preparation must call the result a simulation and disclose that signing remains unverified.

## Description

A trader can set limits yet still face mixed evidence about changing exposure. Aegis puts the assessment, policy result and executable trade terms together.

It reads Kuru's MON/USDC market on Monad, calculates statistics in code and asks Jev typed questions about action, regime and risk. Scout, Aegis's assistant, combines these findings with captured market, wallet, policy and dated news context. Users can select a supported AI vendor with their own key; provider provenance remains visible. Relative choice probabilities remain distinct from the chat recommendation. Code validates each supported proposal; the user confirms a policy edit or sale preparation separately. A permitted sale is simulated and prepared for explicit wallet signing. The execution record checks the actual transaction, USDC output and refreshed balances.

Replay makes policy failures repeatable with synthetic data and paper fills. Live buys, resting-order cancellation and Perpl hedging are not implemented. Real Jev and Google-backed Scout responses passed, including a slippage-policy proposal from 25 to 10 bps, explicit confirmation and rejection of stale or repeated approval. Mistral generation returned HTTP 429; OpenAI and Anthropic generation remain unverified because keys were unavailable. No sale has been signed. Preserve those limits in the submission.

## Evidence

| Component             | Current evidence                                                                                   | Still needed                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Policy/replay         | Tests/build/browser checks passed, including oversized-action rejection                            | Final recording of the blocked proposal                                 |
| Monad/Kuru            | Real market/balance reads; sale simulation and gas estimation passed                               | Signed transaction, matched receipt and delivered USDC                  |
| Jev                   | Real HTTP 200 with model, input, probabilities and signed provenance; parser and uncertainty tests | Demonstrate relevant wallet context and evidence in the final recording |
| Scout                 | Real Google-backed reply with captured Jev evidence; policy approval 200, stale/duplicate approval 409; public trial reply confirmed by the user, 12 October CEST | Final recording |
| PolicyGuard           | Solidity 0.8.30 compilation and local EVM tests passed                                             | Monad deployment and guarded call before claiming onchain enforcement   |
| Perpl                 | Not integrated; replay hedge only                                                                  | Actual authenticated order and reconciliation                           |
| Envio                 | Local journal only                                                                                 | Indexer/query output used by the product                                |
| MetaMask Agent Wallet | Not integrated                                                                                     | Real plugin manifest/commands/host integration                          |

Detailed measurements and the baseline API-request caveat are in [verification](verification.md). Application controls are not an audited contract mandate.

## Demo and bounty

Follow the [demo script](demo_script.md): live source/balances and limits, approved Jev assessment, protective sale review/signing, matched receipt/output, then replay's rejected increase. Show source and uncertainty at the point of action. If only preparation succeeds, describe it as simulation rather than verified execution.

Kuru's consumer-trading bounty is the nearest candidate. Its full criteria require authenticated platform review. Perpl analytics needs actual Perpl data, Envio requires substantive indexing, and MetaMask requires the real Agent Wallet plugin. MON/USDC controls do not establish a new-market bounty.

## Before publishing

- [ ] Confirm registered-project rules, eligibility, track/bounty and deadline.
- [ ] Publish complete licensed source, attribution and actual build-window history.
- [ ] Preserve pre-existing-work and AI-tool disclosures; establish that the substantial majority of submitted work is new.
- [x] Deploy the public warm app with server secrets, durable spending controls and session-only conversations, policies and journal.
- [x] Verify final hosted routes, asset hashes, dated news, chain reads, simulation and legacy compatibility; repeated on 12 October CEST.
- [x] Verify real Jev and Google-backed Scout responses and policy confirmation on 12 October CEST.
- [x] Complete a real visitor Turnstile check and verify public trial access: user-reported successful Scout reply on 12 October CEST.
- [ ] Sign one approved Kuru sale and save its matching receipt, output and balances.
- [x] Capture an approved response through the new Jev gateway.
- [x] Verify Scout's real response from the selected provider and a supported confirmation.
- [ ] Record blocked proposals, uncertainty, pause, stale data and failures.
- [x] Document F: setup/build/tests and verify them without paid API calls.
- [ ] Check every integration, latency, audit and performance claim against evidence.
- [ ] Record an actual-operation demo of at most three minutes.
- [ ] Add app/code/video/access links and complete sponsor questions.

## Pitch

Aegis helps MON/USDC traders make a decision they can inspect before signing. It reads Kuru on Monad, calculates risk in code and uses Jev to assess uncertain evidence. The user's limits can block a proposal regardless of its probability. A permitted protective sale shows exact terms for wallet review, and its receipt connects the decision to the chain result.

The planned demo shows one approved sale and one oversized proposal blocked before a wallet request. Add the recorded proof before submitting this pitch.
