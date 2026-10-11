# Verification

Aegis is [live on Cloudflare](https://aegis.himaloy2608.workers.dev) with the warm homepage, chat dashboard and market/execution workspace. The app reads Kuru, checks limits and prepares a MON sale for explicit wallet review. **Real Jev and Google-backed Scout responses passed**, including a supported policy confirmation and rejection of stale and duplicate approvals. The user also reported a successful Scout reply through the public trial after completing visitor verification. Signed execution, public repository access and the submission video remain unfinished. Updated 12 October 2026; dates below are UTC unless another timezone is stated.

## Results

| Check                        | Result and scope                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated suite              | **524 tests across 22 files passed** on 10 October at 07:05:48 UTC, including four-provider adapters, approval, key isolation, budget, evidence and provider-limit handling. Provider responses are mocked; no signing or paid inference |
| TypeScript/Vite/Worker build | Passed on 10 October with the four-provider release. Artifacts in `dist` and `.local/artifacts/cloudflare` |
| Warm browser checks          | All three pages passed at seven viewports with fixtures. Keyboard dialogs, independent funding, transient keys, dedicated approval, shared policy/session state, exact terms, invalidation, expiry and replay were checked                     |
| Navigation and motion        | Home/Dashboard links, left navigation, mobile menu and seven-viewports passed with fixtures. Reduced-motion checks found no long animations/transitions or hidden content. Final actual desktop/mobile captures also passed and were inspected |
| Hosted Monad/Kuru read       | Passed on 11 October at 22:04:47 UTC: chain 143, market `0x065C9d28E428A0db40191a54d33d5b7c71a9C394`, block 112583185; 22 bid/30 ask levels, mid 0.0271855 USDC/MON, 204 ms snapshot read |
| Hosted sale simulation       | Read-only `eth_call`/gas estimate passed for 200 MON from a funded public address; 5.4328 USDC quoted, 5.409915 minimum, gas estimate 297261 at block 112583187; no account access or signature |
| Standalone real Jev          | **Passed** at 18:30:13 UTC: HTTP 200, model `jev-1.13.0`, Choice/Noul response, exact input/probabilities and signed receipt recorded; real Kuru book at block 111968111                                                                       |
| Real Scout pipeline          | **Passed** on 11 October at 22:04:02 UTC: Google `gemini-3.8-flash` with Jev `jev-1.13.0`, captured real market inputs and a slippage-policy proposal from 25 to 10 bps; stale approval 409, dedicated approval 200, duplicate 409. No signing |
| Sponsored allowance          | After that check: US$0.347733 charged/reserved in implementation and US$0.032869 in public, US$0.380602 total. Remaining: US$1.652267 implementation and US$7.967131 public |
| Public Turnstile session     | **User-reported passed on 12 October CEST**: the user completed visitor verification and confirmed Scout replied through the project-funded trial. Automated widget checks separately verify loading/layout only |
| Signed sale and receipt      | Pending explicit user wallet action                                                                                                                                                                                                            |
| PolicyGuard on Monad         | Not deployed; compiled/local-EVM tested only                                                                                                                                                                                                   |
| TypeScript and storage       | Passed on 10 October at 07:05:48 UTC; zero configured-path violations under F:. The storage audit is not an OS-wide filesystem trace |
| Credential exclusion         | Rechecked on 11 October at 22:05:37 UTC: 137 source files and the deployed bundle passed with no credential leak paths |

Prices, depth and latency are dated samples. RPC latency does not measure finality or achievable trading speed. Browser fixtures made no paid inference, signing or external requests, and do not verify providers, news, RPC or simulation.

The current four-provider Worker release was deployed on **10 October at 07:11:01 UTC** as version **`887fd376-926f-48d8-af51-bf25a23f35fe`**, deployment `7af870e7-3aa1-4cac-845b-1214d380f7b0`, at 100 percent. Its hosted rollout passed on 10 October at 07:11:21 UTC and again on 11 October at 22:04:47 UTC: all three routes, current asset hashes, anonymous AI status/rejection, market/portfolio/RPC APIs, real sale simulation, and legacy GET/HEAD redirects, APIs and original hashed assets. Paths and queries remain preserved. No signing or paid inference ran in those rollout checks. The preceding `0588b5f0-be0b-437f-851d-02955068c16d` release remains historical rollback evidence.

News also passed: the hosted endpoint returned twelve dated articles with no unavailable sources, and both fixed feeds returned HTTP 200. Publication dates, source links and retrieval times were validated. The allowlist and bounded manual redirect handling remain in the server; clients cannot choose feed URLs.

[Earlier redesign verification](UI_UX_TEST_RESULTS.md) remains a historical report. [Warm design QA](design-qa.md) records current navigation, visual and reduced-motion checks.

Artifacts under `.local/artifacts` include `live-readiness.json`, `hosted-readiness.json`, `storage-audit.json`, `rollout-readiness.json`, `PolicyGuard.json`, `jev-release-verification.json` and `ai-release-verification.json`. The current hosted fixture report is `.local/screenshots/warm-report-887f.json`; `.local/screenshots/warm-report-0588.json` preserves the preceding release. Actual populated market captures were refreshed at 22:06:30 UTC on 11 October under `.local/screenshots/live-warm`. All are ignored by Git and stay on F:.

After sourcing `scripts/setup_env.ps1`, run `npm test`, `npm run build` and `npm run verify:storage`. Use `scripts/warm-ui-smoke.mjs` for the three-page fixture flow and `scripts/capture-live-ui.mjs` for actual market screenshots. Set `AEGIS_QA_URL` to the public hostname for hosted captures. `scripts/verify-ai-release.mjs` makes a real provider check through the private implementation session, consumes the approved implementation allowance and makes no wallet request.

An inherited baseline test made an environment-triggered TypeSafe request before that behavior was removed. Subsequent tests mock HTTP responses. That old request does not validate the new strict client/gateway.

## Real AI verification

The existing Google project credential first returned HTTP 200 from the read-only model endpoint for `models/gemini-3.8-flash` on 9 October at 23:46:03 UTC. The hosted `/api/agent/key-check` then returned HTTP 200 and `accepted` on 10 October at 07:12:15 UTC. The sanitized artifacts are `.local/artifacts/google-model-key-check.json` and `.local/artifacts/hosted-google-key-check.json`; both record zero paid inference calls and `generationVerified: false`. Those checks established credential acceptance and model metadata access only.

On **12 October at 00:04:02 CEST in Paris** (**11 October at 22:04:02 UTC**), the hosted Jev-plus-Scout pipeline returned HTTP 200 using Google `gemini-3.8-flash` and Jev `jev-1.13.0`. It captured a real Kuru book and the original assessment payload. Scout proposed lowering session slippage from 25 to 10 bps, without applying it. A stale context was rejected with HTTP 409, dedicated approval returned HTTP 200 with the exact changed policy, and a repeated approval was rejected with HTTP 409. The check made no wallet request. Its disconnected portfolio was explicitly labelled unavailable; it does not validate wallet-specific decision quality or sale execution. The sanitized artifact is `.local/artifacts/ai-release-verification.json`.

Scout's new user-key options are Mistral, OpenAI, Anthropic and Google AI. Each has a fixed official endpoint and allowed model. Read-only key checks, adapter fixtures and successful generation are separate forms of evidence; a passing fixture or accepted key must never be reported as a verified AI reply. Changing vendors clears the old key and check result. The application never retries paid inference automatically or routes a failed key to another vendor.

| Scout vendor | Adapter fixtures | Real credential/model check | Complete real Scout reply |
| ------------ | ---------------- | --------------------------- | ------------------------- |
| Mistral | Passed | Existing project request reached the provider and returned HTTP 429 | Pending |
| OpenAI | Passed | No credential available | Pending |
| Anthropic | Passed | No credential available | Pending |
| Google AI | Passed | Direct and hosted read-only model checks returned HTTP 200 | **Passed: real Jev-plus-Scout reply and policy confirmation** |

The standalone Jev check at 18:30:13 UTC returned HTTP 200 with model `jev-1.13.0`, validated Choice/Noul answers and a signed receipt. The artifact preserves its exact input, response and probabilities. It used an actual Kuru book and disconnected zero-equity portfolio context, including the engine's leverage sentinel. This verifies transport, parsing and provenance without demonstrating wallet-specific decision quality. Its settled cost was US$0.000067. No action was signed.

Earlier implementation attempts used Gemini before the user's switch to Scout. Two recommendation requests returned HTTP 503; a later request exceeded the then twenty-second timeout. Their uncertain reservations remain in the same ledger. Including standalone Jev verification, implementation usage/reservations were US$0.083264 before the Scout check. These earlier failures are historical evidence and do not test the current Mistral adapter.

The Mistral adapter pins Small 4 (`mistral-small-2603`) with bounded context/output and a sixty-second timeout. Its first real implementation request on 9 October at 18:48:01 UTC received Mistral HTTP 429. The gateway returned a sanitized error without an action. This request settled US$0.000084 for Jev and retained US$0.002458 for uncertain Mistral usage; no approval or signing ran. The four-provider release maps provider HTTP 429 to an explicit rate/usage-limit message with a bounded Retry-After value when available. Sponsored Scout is now configured for Google. This server setting does not provide automatic fallback for a failed user key. Mistral generation remains unverified; OpenAI and Anthropic credentials were unavailable. Provider calls have no automatic paid retry.

The successful Google pipeline settled **US$0.002259** in the implementation pool. The ledger then reported **US$0.347733 implementation** and **US$0.380602 global** usage/reservations. The **US$0.032869** difference belongs to the public pool; this verification script used only the implementation session. Historical failed and interrupted calls, including an interrupted Google check on 10 October, retain uncertain reservations in the same ledger. The public allowance is not untouched. These are conservative application accounting values, not a provider invoice.

Adapter tests cover key isolation, invalid/stale context, consumed confirmations, provider failures, prompt injection, quota concurrency and evidence capture with mocked responses. Real Google-backed Scout output and policy confirmation have now passed. On 12 October CEST, the user separately confirmed "Yes, Scout replied" after using the project-funded trial and completing visitor verification. They then supplied the actual reply to "Explain my exposure and limits", dated 00:06:13 CEST: Google-backed Scout used real Jev findings, explicitly identified the disconnected wallet and proposed no action. This is user-supplied public access evidence, distinct from the automated private implementation check and widget-loading probe. Signed-sale reconciliation remains pending.

## Implemented behavior

Replay has five synthetic scenarios, heuristic probabilities and paper accounting. Real Kuru reads verify chain/code, decode orderbook/AMM state and retrieve wallet MON/USDC. Jev validates state/answers, checks uncertainty, handles timeouts and labels unavailable or heuristic evidence. Scout proposals require dedicated confirmation and immutable, expiring, single-use server authorization; typing yes does not approve or sign.

The sale path encodes exact native MON calldata, simulates it, estimates gas and checks account/chain and total slippage. Browser reads use the same-origin read-only RPC gateway; signing stays in the wallet. Receipt handling matches calldata/value and USDC transfers before recording a fill. Timeouts retain the submitted hash. No trade has been signed here.

The persistent SHA-256 journal checks integrity, rotates and exports on F:. It is not Envio indexing or an onchain attestation. Optional PolicyGuard enforces native-unit budgets, a fixed sale call, output checks, pause, expiry and reentrancy protection in local EVM tests. It has no independent audit. Dependencies, MIT license, competition research and demo/submission plans are documented. OpenAI Codex and pre-existing components are disclosed in the README.

## Limits

Live historical loss/PnL/drawdown, external positions, resting orders and aggressive flow are unavailable. Unattended trading is disabled. Replay short fills are not Perpl trades. Perpl authentication/execution, Envio indexing and the MetaMask Agent Wallet plugin are not integrated; unsupported execution methods fail.

The documented testnet market exists but lacked executable bids. Mainnet observation is the default; signing there spends real MON and gas. Direct sales bypass PolicyGuard. Proposal expiry and pause are application preflight checks. Kuru enforces minimum output and fill-or-kill but has no direct-sale deadline; reject a wallet prompt left open after expiry.

Cloudflare has server secret bindings and a budgeted inference path. Public access requires a server-validated Turnstile session, with persistent quotas and spending enforcement in a SQLite Durable Object. User-key access does not consume project funding or silently switch funding on failure. Conversations, policies and the hosted journal remain session-only. No plan upgrade was made; account billing details could not be read through the connector. The loopback Node service is intended for one local user.

## Submission work

The strongest track fit is Onchain Finance & Trading. [Rules v3](https://hackathon.monad.xyz/api/v1/policies/current) require public licensed GitHub source, build-window history/disclosures, Monad deployment evidence and an actual-operation demo of at most three minutes. Deadline: **14 October 2026, 05:59 CEST in Paris**.

Next: confirm public repository visibility and publish the actual-operation demo. The planned execution validation also needs one market-valid sale through an explicit user wallet action and its matched receipt/output before a confirmed fill can be claimed. The rules accept contract addresses or transaction hashes as Monad evidence; a simulation-only demo must disclose that execution has not been verified. The app and real Google-backed Scout workflow are already public, and public trial access has passed by user report. Deploying the optional guard is a separate decision if contract enforcement is to be demonstrated.

Kuru's consumer-trading bounty is a candidate after the signed demo and authenticated rubric are checked. Other sponsor qualification has not been established. See [requirements](hackathon_requirements.md), [MVP assessment](mvp_assessment.md), [demo script](demo_script.md), [deployment](deployment.md) and [submission](submission.md).
