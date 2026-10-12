# Running and deploying Aegis

Aegis serves the homepage at `/`, the overview and chat at `/app`, and market/execution at `/app/workspace`. Navigation keeps one session. Reloading clears hosted conversations, policies, user keys and journal entries.

Node and Cloudflare use the same market, simulation and budgeted AI handlers. Node also has a persistent local journal. Cloudflare stores AI accounting and consumed approval identifiers in a SQLite Durable Object; trading context and conversations stay in the browser session.

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

| Variable                  | Meaning                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `AEGIS_NETWORK`           | `mainnet` by default; testnet uses chain 10143                                      |
| `AI_ENABLED`              | Enables the shared AI gateway when its secrets and persistent ledger are configured |
| `TYPESAFE_API_KEY`        | Server-only project TypeSafe credential                                             |
| `MISTRAL_API_KEY`         | Server-only project Scout credential                                                |
| `GEMINI_API_KEY`          | Server-only Google credential when Google funds the Scout trial                     |
| `SCOUT_PROJECT_PROVIDER`  | `mistral` by default, or `google`; selects the sponsored Scout provider               |
| `AI_SESSION_SECRET`       | Signs visitor sessions and captured evidence; at least 32 characters                |
| `AI_IMPLEMENTATION_TOKEN` | Private access to the US$2 implementation pool                                      |
| `TURNSTILE_SECRET_KEY`    | Server credential for visitor challenge validation                                  |
| `TURNSTILE_SITE_KEY`      | Public widget identifier, restricted to the deployed hostname                       |
| `AI_KEY_WRAP_PRIVATE_JWK` | Optional server secret for decrypting an RSA-OAEP wrapped provider credential       |
| `JEV_ENABLE_LIVE`         | Legacy local adapter flag; leave false for the shared agent workflow                |
| `PORT`                    | Optional local server port override                                                 |

The shared gateway pins `jev-1.13.0`. Scout has one allowed model per supported vendor; see [AI access](ai_access.md). `SCOUT_PROJECT_PROVIDER` selects Mistral or Google for sponsored calls; OpenAI and Anthropic require user keys. It is server configuration, not an automatic fallback. `npm run setup:typesafe` reads `F:\Projects\jev_key.txt` into the ignored server `.env`. Optional local Scout setup uses `node scripts/setup-ai.mjs --mistral` with hidden input or standard input. Neither setup command makes an inference request. Hosted project keys are Cloudflare secrets; local AI remains disabled. Restart Node after configuration changes. Never put credentials in a `VITE_` variable, source file or public bundle. Browser-wallet signing requires no private key in the app.

Status, market and portfolio reads use `/api/status`, `/api/market` and `/api/portfolio`. Browser chain queries use same-origin `/api/rpc` with a server-side read-only method allowlist. `/api/prepare` simulates a sale; `/api/jev` invokes the budgeted Jev handler. The AI workflow adds `/api/inference/session`, `/api/inference/status`, `/api/news`, `/api/agent`, `/api/agent/key-check` and `/api/agent/approve`. The key-check endpoint is a read-only provider model lookup with an IP cooldown; it performs no generation. Local journal endpoints save/export under `.local/artifacts/audit`. Signing stays in the browser wallet.

Mainnet reads and simulation have passed. The documented testnet market lacked bids during verification; check current liquidity before a demo. The [verification report](verification.md) has measurements, artifacts and test results. Clean tests require neither an API key nor paid inference.

## Cloudflare hosting

The [public app](https://aegis.himaloy2608.workers.dev) runs as `aegis` in the user's Cloudflare account. This keeps the existing `himaloy2608` account subdomain. The address is a workers.dev subdomain, rather than a purchased domain registration. No plan upgrade or paid storage service was created.

Run `npm run build:cloudflare` after sourcing setup_env.ps1. It typechecks the frontend and Worker, builds dist, then bundles the API and static files into `.local/artifacts/cloudflare/worker.mjs`. `wrangler.jsonc` records the Worker name and compatibility date. The module is uploaded through the managed Cloudflare connector; no Cloudflare credential is exported.

The `AI_BUDGET` binding uses class `AiBudgetLedger`. Keep its existing namespace and stable object name `aegis-ai-budget-v1` across deployments and rollbacks. A new object or namespace would start a different ledger and lose the enforced application allowance. The first SQLite migration is `ai-budget-v1`; later uploads retain the existing binding and secret bindings.

The build also prepares `.local/artifacts/cloudflare/legacy-worker.mjs` for `aegis-risk-terminal`. Deploy and verify `aegis` first. Only then update the previous Worker with this compatibility bundle. It redirects GET/HEAD page navigation with an explicit HTML Accept header to the new HTTPS address, preserving the path and query. API requests, static files and other methods keep using the previous origin. Prior hashed assets are retained on both Workers through the ignored `legacy-assets.json` cache, so already-open pages can still request them. Preserve that cache and the previous deployed module before a rebuild; an unverified new address must never receive the old address's traffic.

The four-provider release was deployed on **10 October at 07:11:01 UTC** as version **`887fd376-926f-48d8-af51-bf25a23f35fe`**, deployment `7af870e7-3aa1-4cac-845b-1214d380f7b0`, at 100 percent. Hosted rollout checks passed at 07:11:21 UTC and again on **11 October at 22:04:47 UTC**. All three routes, current asset hashes, anonymous AI rejection, news, market/RPC/portfolio reads and a real read-only sale simulation passed. The old host's redirects, APIs and original assets also passed. The sanitized report is `.local/artifacts/rollout-readiness.json`. A hosted Google key check returned HTTP 200 at 07:12:15 UTC without generation or signing. Preserve the ignored recovery artifacts for rollback.

The homepage card update was deployed on **11 October at 22:25:36 UTC / 12 October at 00:25:36 CEST** as version **`e6f9d053-1a23-420f-ab5d-bab07f55547c`**, deployment `0a99f7b6-e741-421e-bdd1-66b496d3603a`, at 100 percent. The existing secrets, budget namespace and previous version were preserved. Rollout checks passed at 22:25:54 UTC, including the three routes, asset integrity, read-only endpoints and legacy compatibility. This layout update made zero paid inference calls or signing attempts. Its release record is `.local/artifacts/cloudflare/cards-release.json`.

The logo update was deployed on **11 October at 22:34:13 UTC / 12 October at 00:34:13 CEST** as version **`a5bc843a-ade8-4fde-ba21-a0535ea8bb96`**, deployment `12270a48-7e2a-4ead-b377-8bbfdd0037d1`, at 100 percent. The generated emblem now appears in the homepage and workspace branding and the browser tab icon. The homepage dashboard preview was refreshed from the actual local production app with a real market read. Rollout checks passed at 22:34:29 UTC. Existing secrets, the budget namespace, previous versions and legacy compatibility were preserved; no paid inference or signing was performed. The release record is `.local/artifacts/cloudflare/logo-release.json`.

The copyright/About update was deployed on **12 October at 03:52:14 UTC / 05:52:14 CEST** as version **`13a541fd-d085-4f5f-ae16-d5ce010320d2`**, deployment `a9c878f0-38be-40c9-bd57-c5131c9f097f`, at 100 percent. The footer credits Arnab Saha; its expandable About section preserves prototype status, AI assistance and source attribution. Rollout checks passed at 03:52:38 UTC, including current assets, live reads, sale simulation and legacy compatibility. Secrets, the persistent ledger and rollback versions were preserved. No inference or wallet signing was performed. The release record is `.local/artifacts/cloudflare/footer-release.json`.

For rollback, restore the previous deployed Worker version on `aegis-risk-terminal`. Its version ID is preserved in the ignored `.local/artifacts/cloudflare/rollout-recovery.json`. Deploy that version at 100 percent through the managed connector and return public links to that address. The redirect is sent with `Cache-Control: no-store` so a browser does not retain it as a permanent routing decision. Recheck the app, status, market, simulation and an old hashed asset after either rollout or rollback.

For the new Worker after its Durable Object migration, the build prepares `.local/artifacts/cloudflare/rollback-worker.mjs` from the preserved previous UI module while retaining the `AiBudgetLedger` export and disabling AI. Use it with the existing `AI_BUDGET` binding. A version from before that migration may lack the required class. Retain ledger accounting through rollback.

Static files are embedded, so each asset request invokes the Worker. The hosted workspace polls market reads every ten seconds and pauses when the tab is hidden or the homepage is visible. The release uses free-compatible Workers and SQLite Durable Object features; see [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/). No plan upgrade or domain purchase was made. The billing/subscription endpoint was unavailable through the connector, so this does not establish the account's subscription status.

The Worker uses the same Kuru/Monad adapters as Node. It accepts only the approved read-only RPC methods; preparation uses eth_call and gas estimation. Signing stays in the wallet. Public market reads, balance reads, a real 200 MON sale simulation, desktop/mobile replay and wallet-change checks passed.

Project provider keys, session signing secret, implementation token and Turnstile secret are Worker secret bindings. The optional wrapped-key path transfers only RSA-OAEP ciphertext and keeps its private key in a separate server secret. Public AI sessions require server-validated Turnstile checks, including hostname and action checks. Never log request keys, cookies or tokens.

The approved application allowance is US$10: US$2 for implementation verification and US$8 for public review. The persistent ledger reserves conservative costs before each provider call, settles verified usage and retains reservations when usage is uncertain. It also enforces visitor/IP quotas, one concurrent request, cooldown and one-time approvals. Market polling never invokes paid AI; there are no automatic paid retries.

Users choose sponsored access, their own key or disabled independently for Jev and Scout. Scout user-key access selects Mistral, OpenAI, Anthropic or Google AI. User keys stay in browser memory and travel in HTTPS headers to the same-origin gateway. The gateway uses fixed official endpoints and rejects provider redirects. Invalid user credentials do not switch provider or project funding. See [AI access](ai_access.md).

Sponsored Scout is configured for Google. The real Jev-plus-Scout pipeline passed on **11 October at 22:04:02 UTC**, including a supported policy proposal, explicit approval and stale/duplicate approval rejection. Its implementation cost settled at US$0.002259. Mistral generation remains limited by provider HTTP 429; OpenAI and Anthropic lack real credential/generation proof. See the [verification report](verification.md). After deployment, check all three pages, current asset hashes, status, market, anonymous AI rejection, dated news and sale simulation. Recheck legacy behavior when changing the old Worker.

Hosted conversations, mandates and events stay in memory in the current browser session. Copy session JSON before reloading. The durable ledger stores accounting, rate-limit state and consumed approval identifiers, without portfolios, conversations, keys or journals. Node's hash-chain journal remains a local feature.

The selected source repository is [AEGIS-Autonomous-Risk-Execution-Layer-on-Monad](https://github.com/arnab013/AEGIS-Autonomous-Risk-Execution-Layer-on-Monad). Git origin points there. Existing noninteractive credentials can read the release branch, `codex/aegis-risk-control-mvp`. Anonymous Git access failed and the GitHub connector returned 404; this does not establish public visibility. The competition requires public source access, so verify the repository while signed out before submission.

Aegis uses existing Kuru contracts. Submission still needs a real approved transaction and matching receipt/output. PolicyGuard is separate and has only local EVM deployment; it is not required for the direct wallet workflow.

A pending receipt is not a failed transaction. Resolve the original hash before submitting a replacement. See the [demo script](demo_script.md), [submission checklist](submission.md) and [storage policy](local_storage_policy.md).
