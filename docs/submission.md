# Aegis submission draft

Working draft, 8 October 2026. Complete the missing execution and publication evidence before submitting.

| Field              | Value                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Name               | Aegis                                                                                                                            |
| One-liner          | A MON/USDC risk terminal that checks user limits before a wallet-reviewed trade                                                  |
| Track              | Onchain Finance & Trading                                                                                                        |
| Event              | [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis)                                                           |
| Deadline           | 14 October 2026, 03:59 UTC / 05:59 CEST in Paris; confirm in the registered project                                              |
| Public app         | [Cloudflare app](https://aegis-risk-terminal.himaloy2608.workers.dev)                                                            |
| Repository         | [Selected repository](https://github.com/arnab013/AEGIS-Autonomous-Risk-Execution-Layer-on-Monad); push pending connector access |
| Demo / pitch video | Pending                                                                                                                          |
| Judge access       | No login for public market, replay or sale simulation; hosted paid inference disabled                                            |

The [official Rules v3](https://hackathon.monad.xyz/api/v1/policies/current) require licensed public GitHub source, build-window history, attribution, AI-tool disclosure, Monad deployment evidence and a public demo of at most three minutes. Follow these rules despite the marketing FAQ's more permissive open-source wording. See [requirements](hackathon_requirements.md).

## Description

A trader can set limits yet still face mixed evidence about changing exposure. Aegis puts the assessment, policy result and executable trade terms together.

It reads Kuru's MON/USDC market on Monad, calculates statistics in code and asks Jev typed questions about action, regime and risk when inference is approved. Probabilities reveal uncertainty; an independent gate checks the user's limits. A permitted protective sale is simulated and prepared for wallet review. The execution record checks the actual transaction, USDC output and refreshed balances.

Replay makes policy failures repeatable with synthetic data and paper fills. Live buys, resting-order cancellation and Perpl hedging are not implemented. The signed sale and response through the new Jev gateway are still pending, so update this description with recorded proof before publishing.

## Evidence

| Component             | Current evidence                                                        | Still needed                                                          |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Policy/replay         | Tests/build/browser checks passed, including oversized-action rejection | Final recording of the blocked proposal                               |
| Monad/Kuru            | Real market/balance reads; sale simulation and gas estimation passed    | Signed transaction, matched receipt and delivered USDC                |
| Jev                   | Official adapter/parser tests; key configured, paid service disabled    | Approved response with model, timing, source and probabilities        |
| PolicyGuard           | Solidity 0.8.30 compilation and local EVM tests passed                  | Monad deployment and guarded call before claiming onchain enforcement |
| Perpl                 | Not integrated; replay hedge only                                       | Actual authenticated order and reconciliation                         |
| Envio                 | Local journal only                                                      | Indexer/query output used by the product                              |
| MetaMask Agent Wallet | Not integrated                                                          | Real plugin manifest/commands/host integration                        |

Detailed measurements and the baseline API-request caveat are in [verification](verification.md). Application controls are not an audited contract mandate.

## Demo and bounty

Follow the [demo script](demo_script.md): live source/balances and limits, approved Jev assessment, protective sale review/signing, matched receipt/output, then replay's rejected increase. Show source and uncertainty at the point of action. If only preparation succeeds, describe it as simulation rather than verified execution.

Kuru's consumer-trading bounty is the nearest candidate. Its full criteria require authenticated platform review. Perpl analytics needs actual Perpl data, Envio requires substantive indexing, and MetaMask requires the real Agent Wallet plugin. MON/USDC controls do not establish a new-market bounty.

## Before publishing

- [ ] Confirm registered-project rules, eligibility, track/bounty and deadline.
- [ ] Publish complete licensed source, attribution and actual build-window history.
- [ ] Preserve pre-existing-work and AI-tool disclosures; establish that the substantial majority of submitted work is new.
- [x] Deploy and verify the public app with paid inference hard-disabled and session-only journal storage.
- [ ] Sign one approved Kuru sale and save its matching receipt, output and balances.
- [ ] Capture an approved response through the new Jev gateway.
- [ ] Record blocked proposals, uncertainty, pause, stale data and failures.
- [x] Document F: setup/build/tests and verify them without paid API calls.
- [ ] Check every integration, latency, audit and performance claim against evidence.
- [ ] Record an actual-operation demo of at most three minutes.
- [ ] Add app/code/video/access links and complete sponsor questions.

## Pitch

Aegis helps MON/USDC traders make a decision they can inspect before signing. It reads Kuru on Monad, calculates risk in code and uses Jev to assess uncertain evidence. The user's limits can block a proposal regardless of its probability. A permitted protective sale shows exact terms for wallet review, and its receipt connects the decision to the chain result.

The planned demo shows one approved sale and one oversized proposal blocked before a wallet request. Add the recorded proof before submitting this pitch.
