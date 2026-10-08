# Verification — 8 October 2026

Aegis is [live on Cloudflare](https://aegis.himaloy2608.workers.dev) and runs locally at http://127.0.0.1:3000. The implemented MVP reads Kuru, checks trading limits and prepares a protective MON sale for wallet review. A server-side Jev adapter is configured locally; paid inference is disabled. Signed execution and the submission video remain unfinished.

## Results

| Check                         | Result and scope                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automated suite               | **351 tests passed across 13 files**, including 13 compiled-Solidity local EVM tests, 58 hosted API tests and 24 embedded-asset tests; no signing or paid inference                                                                                          |
| TypeScript/Vite build         | Passed; artifacts in dist                                                                                                                                                                                                                                    |
| Browser checks                | Passed locally and on the public host: replay, oversized-action rejection, evidence, live market, free inspection, wallet connection/change, cancelled-evaluation isolation, all seven requested viewport sizes, dialog focus containment and no page errors |
| Hosted Monad/Kuru read        | Chain 143, market 0x065C9d28E428A0db40191a54d33d5b7c71a9C394, block 111690703; 20 bid/37 ask levels, mid 0.0244815 USDC/MON, 175 ms snapshot read                                                                                                            |
| Hosted sale simulation        | Read-only eth_call/gas estimate for 200 MON from a funded public address; 4.888 USDC quoted, 4.868933 minimum, 50 bps total cap, gas estimate 297139; no account access/signature                                                                            |
| New Jev gateway live response | Pending credit approval; key configured, inference disabled                                                                                                                                                                                                  |
| Signed sale and receipt       | Pending wallet action                                                                                                                                                                                                                                        |
| PolicyGuard on Monad          | Not deployed; compiled/local-EVM tested only                                                                                                                                                                                                                 |
| Storage                       | Configured paths checked under F:; not an OS-wide filesystem trace                                                                                                                                                                                           |

Prices, depth and latency are dated samples. RPC latency does not measure finality or achievable trading speed.

The shorter-host rollout passed asset SHA-256 checks, GET/HEAD navigation redirects with preserved paths and queries, and old-host status, market, RPC and simulation checks. The original hashed assets remain available. [Redesign verification](UI_UX_TEST_RESULTS.md) records keyboard behavior, responsive captures and the scope of intercepted fixtures.

Artifacts under .local/artifacts include live-readiness.json, hosted-readiness.json, storage-audit.json, rollout-readiness.json, PolicyGuard.json and the earlier ui/report.json plus ui-hosted/report.json. Current redesign captures and reports are under .local/screenshots/redesign and redesign-hosted. They are ignored by Git. After sourcing scripts/setup_env.ps1, use npm run verify:live and npm run verify:storage to refresh local checks. For browser checks against the public app, set AEGIS_QA_URL to its URL before running scripts/ui-smoke.mjs.

An inherited baseline test made an environment-triggered TypeSafe request before that behavior was removed. Subsequent tests mock HTTP responses. That old request does not validate the new strict client/gateway.

## Implemented behavior

Replay has five synthetic scenarios, heuristic probabilities and a paper ledger. Real Kuru reads verify chain/code, decode orderbook/AMM state and retrieve wallet MON/USDC. The Jev adapter validates state/answers, checks uncertainty, handles timeouts and labels fallback.

The sale path encodes exact native MON calldata, simulates it, estimates gas and checks account/chain and total slippage. Browser reads use the same-origin read-only RPC gateway; signing stays in the wallet. Receipt handling matches calldata/value and USDC transfers before recording a fill. No trade has been signed here.

The persistent SHA-256 journal checks integrity, rotates and exports on F:. It is not Envio indexing or an onchain attestation. Optional PolicyGuard enforces native-unit budgets, a fixed sale call, output checks, pause, expiry and reentrancy protection in local EVM tests. It has no independent audit.

Dependencies/tool setup, MIT license, competition research, demo plan and submission checklist are documented. OpenAI Codex and pre-existing components are disclosed in the README.

## Limits

Live historical loss/PnL/drawdown, external positions, resting orders and aggressive flow are unavailable. Unattended trading is disabled. Replay short fills are not Perpl trades. Perpl authentication/execution, Envio indexing and the MetaMask Agent Wallet plugin are not integrated; unsupported execution methods fail.

The documented testnet market exists but lacked executable bids. Mainnet observation is the default; signing there spends real MON and gas.

Direct sales bypass PolicyGuard. Proposal expiry and pause are application preflight checks. Kuru enforces minimum output and fill-or-kill but has no direct-sale deadline; reject a wallet prompt left open after expiry.

The hosted Worker has no secrets or paid inference path. It keeps the journal in the browser session and uses only Free-plan-compatible features. No plan upgrade was made; account billing details could not be read through the connector. Public paid inference still needs owner authentication and persistent spending controls. The loopback Node service is intended for one local user.

## Submission work

The strongest track fit is Onchain Finance & Trading. [Rules v3](https://hackathon.monad.xyz/api/v1/policies/current) require public licensed GitHub source, build-window history/disclosures, Monad deployment evidence and an actual-operation demo of at most three minutes. Deadline: **14 October 2026, 05:59 CEST in Paris**.

Next: approve up to three TypeSafe evaluations, review/sign one market-valid sale, preserve its output/receipt, confirm public repository visibility and publish the demo. The app is already public. Deploying the optional guard is a separate decision if contract enforcement is to be demonstrated.

Kuru's consumer-trading bounty is a candidate after the signed demo and authenticated rubric are checked. Other sponsor qualification has not been established. See [requirements](hackathon_requirements.md), [MVP assessment](mvp_assessment.md), [demo script](demo_script.md), [deployment](deployment.md) and [submission](submission.md).
