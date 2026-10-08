# Running and deploying Aegis

Aegis has two runtimes. Locally, Node handles market reads, the Jev key, simulations and a persistent journal. The hosted Cloudflare Worker handles free reads and simulations; its journal stays in the browser session.

## Local setup

Use Node.js 22.14 or later and run commands from the configured F: workspace:

```powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
npm run dev
```

Run npm ci first only when dependencies need installation. Preserve an existing .env. Development starts the API on 127.0.0.1:3001 and Vite on 3000, with API proxying.

For contract tools, the full tests and a built app:

```powershell
npm run setup:contracts
npm test
npm run build
npm start
```

The server loads TypeScript with Node's strip-types support. Start serves dist and the API on 127.0.0.1:3000. Vite preview serves the frontend alone.

## Configuration

| Variable         | Meaning                                      |
| ---------------- | -------------------------------------------- |
| AEGIS_NETWORK    | mainnet by default; testnet uses chain 10143 |
| TYPESAFE_API_KEY | Server-only TypeSafe key                     |
| JEV_ENABLE_LIVE  | true only after API-credit approval          |
| PORT             | Optional server port override                |

The model is fixed to jev-latest. Restart after configuration changes. Browser-wallet signing requires no private key in the app.

Status, market and portfolio reads are exposed through /api/status, /api/market and /api/portfolio. Browser chain queries use same-origin /api/rpc with a server-side read-only method allowlist. /api/prepare simulates a sale; /api/jev invokes paid inference when enabled. Journal endpoints save/export under .local/artifacts/audit. Signing stays in the browser wallet.

Mainnet reads and simulation have passed. The documented testnet market lacked bids during verification; check current liquidity before a demo. The [verification report](verification.md) has measurements, artifacts and test results. Clean tests require neither an API key nor paid inference.

## Cloudflare hosting

The [public app](https://aegis.himaloy2608.workers.dev) runs as `aegis` in the user's Cloudflare account. This keeps the existing `himaloy2608` account subdomain. The address is a workers.dev subdomain, rather than a purchased domain registration. No plan upgrade or paid storage service was created.

Run `npm run build:cloudflare` after sourcing setup_env.ps1. It typechecks the frontend and Worker, builds dist, then bundles the API and static files into `.local/artifacts/cloudflare/worker.mjs`. `wrangler.jsonc` records the Worker name and compatibility date. The module is uploaded through the managed Cloudflare connector; no Cloudflare credential is exported.

The build also prepares `.local/artifacts/cloudflare/legacy-worker.mjs` for `aegis-risk-terminal`. Deploy and verify `aegis` first. Only then update the previous Worker with this compatibility bundle. It redirects GET/HEAD page navigation with an explicit HTML Accept header to the new HTTPS address, preserving the path and query. API requests, static files and other methods keep using the previous origin. Prior hashed assets are retained in the ignored `legacy-assets.json` cache so already-open pages can still request them. Preserve that cache and the previous deployed module before a rebuild; an unverified new address must never receive the old address's traffic.

The 8 October rollout was verified with `node scripts/verify-rollout.mjs --legacy` after sourcing the project environment. Both origins passed actual read-only sale simulation; redirect paths, query strings and original hashed asset contents matched.

For rollback, restore the previous deployed Worker version on `aegis-risk-terminal`. Its version ID is preserved in the ignored `.local/artifacts/cloudflare/rollout-recovery.json`. Deploy that version at 100 percent through the managed connector and return public links to that address. The redirect is sent with `Cache-Control: no-store` so a browser does not retain it as a permanent routing decision. Recheck the app, status, market, simulation and an old hashed asset after either rollout or rollback.

The module uses only features available on the [Workers Free plan](https://developers.cloudflare.com/workers/platform/limits/). Because static files are embedded, each asset request also invokes the Worker and counts against the Free plan's 100,000 daily requests. The terminal polls every ten seconds on this host and pauses polling when its browser tab is hidden. The billing/subscription endpoint was not available through the connector, so an account billing-plan check is still needed before claiming the account itself has no paid subscription.

The Worker uses the same Kuru/Monad adapters as Node. It accepts only the approved read-only RPC methods; preparation uses eth_call and gas estimation. Signing stays in the wallet. Public market reads, balance reads, a real 200 MON sale simulation, desktop/mobile replay and wallet-change checks passed.

Paid inference is hard-disabled even if someone supplies an enable flag or key. The configured TypeSafe key remains in the ignored local .env. Adding public inference requires owner authentication and a persistent spending quota before enabling it. Origin checks alone are insufficient.

Hosted events stay in memory in the current browser session. Copy session JSON before reloading. The Worker does not store portfolios, mandates or journals; Node's hash-chain journal remains a local feature.

The selected source repository is [AEGIS-Autonomous-Risk-Execution-Layer-on-Monad](https://github.com/arnab013/AEGIS-Autonomous-Risk-Execution-Layer-on-Monad). Git origin points there. The GitHub connector returned 404, but existing noninteractive Git credentials provide access. The release branch is `codex/aegis-risk-control-mvp`; public repository visibility still needs confirmation for the competition.

Aegis uses existing Kuru contracts. Submission still needs a real approved transaction and matching receipt/output. PolicyGuard is separate and has only local EVM deployment; it is not required for the direct wallet workflow.

A pending receipt is not a failed transaction. Resolve the original hash before submitting a replacement. See the [demo script](demo_script.md), [submission checklist](submission.md) and [storage policy](local_storage_policy.md).
