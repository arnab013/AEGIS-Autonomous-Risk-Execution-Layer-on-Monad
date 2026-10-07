# Verification and delivery status — 8 October 2026

## Product decision

Keep **Aegis**, narrowed to a trader's policy and risk terminal for MON/USDC. The useful product is permissioned control under uncertainty: bounded Jev assessments, independently calculated execution limits, and a wallet-reviewed Kuru reduction. A broad autonomous multi-venue bot would be less credible with the available integration evidence.

The application is working locally at `http://127.0.0.1:3000`. This is a functional MVP candidate, **not yet a complete eligible submission or a guarantee of winning**.

## What was delivered

- Editable exposure, leverage, daily-loss, order, liquidity and total-slippage limits.
- Five deterministic replay scenarios with explicit heuristic probabilities and paper accounting. Cash and inventory change only on simulated fills; no synthetic transaction hashes appear.
- Real Kuru contract-state ingestion, deployed-code and chain verification, orderbook/AMM decoding, market analytics and real wallet MON/USDC balance reads.
- A server-only TypeSafe System One adapter with fixed bounded questions, strict input and probability validation, measured latency, model provenance, confidence/entropy/margin checks, timeouts and safe fallback.
- Actual native-MON Kuru sell calldata, RPC simulation, gas estimation, exact transaction review, wallet account/chain checks and total-slippage enforcement.
- Receipt reconciliation against actual calldata, native amount and USDC Transfer logs. Submission alone never counts as a fill.
- A persistent local SHA-256 journal, integrity checks, rotation and export under the project directory. It is not an onchain attestation or an Envio integration.
- A constrained optional Solidity PolicyGuard, compiled and executed in local EVM tests. It enforces actual native-token budgets, a fixed Kuru sell entrypoint, output checks, pause, expiry and reentrancy protection.
- Reproducible dependency lockfiles, project-local toolchain installation, setup/deployment instructions, source-backed competition research, MIT license and demo/submission drafts.

## Evidence

| Check | Result | Scope |
| --- | --- | --- |
| Complete automated suite | **128 tests passed across seven files** | Includes 13 tests executing compiled Solidity bytecode; does not sign transactions or use paid inference |
| TypeScript and production Vite build | Passed | Application artifacts in `dist/` |
| Browser QA | Passed | Replay, oversized action blocked, decision evidence, real market view, free safety inspection, 390px layout, no page errors |
| Real Monad/Kuru read | Passed | Chain 143, market `0x065C9d28E428A0db40191a54d33d5b7c71a9C394`, block 111452047; 23 bid / 30 ask levels; mid 0.0257955 USDC; 759ms measured snapshot request in that sample |
| Real Kuru execution simulation | Passed | Read-only `eth_call` and gas estimate for 200 MON from an existing funded public address; approximately 5.156 USDC quoted, 5.132807 USDC minimum, 50bps total cap; no account access or signature |
| Strict live Jev response through the new gateway | Pending API-credit approval | Existing server key is configured; live inference is disabled |
| Signed Kuru transaction and reconciled receipt | Pending wallet action | Executable code exists; no new trade was signed in this session |
| PolicyGuard deployed on Monad | Pending wallet action | Compiled/local-EVM tested only |
| Storage isolation | Configured and checked | Project/temp/cache/profile/compiler/build/journal paths resolve under F:; this is not an OS-wide filesystem trace |

Evidence artifacts are generated under `.local/artifacts/`: `live-readiness.json`, `storage-audit.json`, `PolicyGuard.json`, and `ui/report.json` with desktop/mobile screenshots. They are ignored by Git. Re-run `npm run verify:live` and `npm run verify:storage` after sourcing `scripts/setup_env.ps1` to refresh measurements.

One inherited baseline test made an environment-triggered TypeSafe request before that behavior was removed. Subsequent tests use mocked HTTP responses. The new strict client/gateway is not claimed live-validated on the strength of that old test.

## Live, simulated and unavailable

**Live:** Monad mainnet and real Kuru market reads; optional connected-wallet MON/USDC reads; actual contract simulation and gas estimation. Wallet signing is user-operated and has not been exercised here.

**Simulated:** Replay markets, replay probabilities, replay spot/short fills and replay performance. Synthetic short hedges are not Perpl trades. Local EVM contract executions are not Monad deployments.

**Not integrated:** Perpl execution/authentication, Envio indexed decisions/fills, MetaMask Agent Wallet CLI plugin or delegated autonomous signing. Browser wallet support alone does not establish the MetaMask bounty. Unsupported execution methods fail explicitly.

The official testnet Kuru MON/USDC contract exists, but its book currently lacks executable bids. It is a supported configuration, not a demonstrated sale venue. Default live observation therefore uses mainnet; a signed transaction there spends real MON and gas.

## Safety and remaining weaknesses

Jev interprets ambiguous structured state and provides bounded distributions; it does not calculate balances or authorize arbitrary calldata. Code independently checks inputs, mandate, balances/reservations, prospective exposure, gross leverage, clip size, liquidity, slippage, stale data and cooldown. Uncertain/failed inference cannot add risk. Changes during inference invalidate a decision, and changes to wallet, mode or mandate invalidate reviewed proposals.

Monad supplies the real market state and execution environment. Snapshot latency is measured from RPC calls, not a claim about finality or achievable trading speed.

The direct wallet route does **not** use the optional undeployed guard. Its 30-second proposal expiry and pause checks are application preflight checks. Kuru enforces minimum output and fill-or-kill onchain, but its direct sell ABI has no deadline: a wallet prompt can remain open past the application's expiry. Reject a stale prompt. Deployed PolicyGuard expiry/budgets are a separate future path.

Live historical PnL/loss/drawdown, external positions, resting orders and aggressive trade flow are not indexed. These values are displayed as unavailable; unattended autonomous trading is disabled. A production agent would need that complete state and an enforced deployed mandate. The contract has behavioral tests, not an independent security audit. The loopback service needs authentication and secure secret handling before public exposure.

## Competition and bounty position

The strongest fit is **Onchain Finance & Trading**, positioned for traders rather than as generic infrastructure. Public Rules v3 require a public licensed GitHub project, build-window history/disclosures, deployed Monad evidence and an actual-operation video of no more than three minutes. Deadline: **14 October 2026 at 05:59 Paris time**. See [requirements](hackathon_requirements.md) and [official rules](https://hackathon.monad.xyz/api/v1/policies/current).

Kuru's consumer-trading bounty is a plausible target once the signed demo and authenticated detailed rubric are checked. Perpl, Envio and MetaMask bounty qualification is not claimed. No bounty award or eligibility is guaranteed.

## Highest-priority work before submission

1. Approve up to three TypeSafe evaluations to validate the strict server/client end to end; preserve real provider probabilities/model identity as evidence.
2. Connect a funded wallet, prepare a suitably small market-valid MON reduction, review the real amount/network/minimum output, and explicitly approve one transaction. Save its reconciled receipt and before/after balances.
3. Decide whether to deploy the tested optional guard and demonstrate a blocked onchain unauthorized/over-budget call. Do not describe client controls as deployed contract enforcement.
4. Publish the code/history/license, disclose pre-existing components and AI-assisted work, verify the signed-in bounty rubric, and record the honest under-three-minute demo.

The [MVP assessment](mvp_assessment.md), [demo script](demo_script.md), [deployment guide](deployment.md) and [submission draft](submission.md) provide the final product rationale, narration, limitations and evidence checklist.
