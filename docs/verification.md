# Testing and verification

Automated tests cover the risk gate, replay accounting, market decoding, trade preparation, transaction reconciliation, AI adapters, evidence capture, one-time approvals, key isolation, quotas and spending reservations. Provider responses are mocked; passing adapter tests alone does not prove live generation.

## Run the checks

Use Node.js 22.14+ and PowerShell:

```powershell
. .\scripts\setup_env.ps1
npm ci
npm run setup:contracts
npm test
npm run build:cloudflare
npm run verify:storage
```

Contract setup installs the project-local tools used by the PolicyGuard tests. The production build runs TypeScript and Vite, then bundles the Worker and static assets. These checks require no provider key and perform no wallet signing.

## Live verification scope

| Area | Verified scope |
| --- | --- |
| Monad and Kuru | Mainnet chain/code checks, decoded book and AMM depth, MON/USDC balance reads |
| Sale preparation | Exact calldata simulation and gas estimation for a market-valid MON sale; no signature |
| Jev | Real `jev-1.13.0` response with validated Choice/Noul fields and captured provenance |
| Scout | Real Google-backed reply using captured market/Jev context; a policy proposal, dedicated approval and stale/duplicate approval rejection |
| Public AI trial | Visitor verification and a successful Scout reply confirmed by the user |
| Provider adapters | Mocked request/response and failure tests for Google, Mistral, OpenAI and Anthropic |
| Signed execution | Implemented, but not yet validated with a signed sale and matching receipt/output |
| PolicyGuard | Compiled and tested in a local EVM; no Monad deployment or independent audit |

Mistral generation encountered HTTP 429. OpenAI and Anthropic generation have not been tested with real credentials. A read-only key check establishes model metadata access, not generation quota or a completed reply.

## Browser checks

`scripts/warm-ui-smoke.mjs` exercises navigation, shared session state, confirmation cards, policy invalidation, evidence dialogs, expiry and responsive ordering with fixtures. Fixture checks are distinct from live app operation. `scripts/capture-live-ui.mjs` captures actual market views. Both write their output under `.local/`.

`scripts/verify-rollout.mjs` checks hosted routes, assets, read-only endpoints, simulation and legacy compatibility. `scripts/verify-ai-release.mjs` performs real paid inference through the implementation session; run it only with explicit spending authorization. It never signs a transaction.

Live reads, simulation, submitted hashes and confirmed fills are separate results. A simulation does not establish a completed trade, and a receipt timeout does not establish failure. Preserve the original transaction hash while checking for its receipt.
