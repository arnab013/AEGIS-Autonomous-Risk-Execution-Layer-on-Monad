# Configuration and deployment

Aegis serves `/` (homepage), `/app` (Scout and overview), and `/app/workspace` (market and execution). Both runtimes share market, simulation and inference handlers. The Node runtime also supports a local persistent journal.

## Local development

Use Node.js 22.14+ and an existing checkout outside the Windows C: drive:

```powershell
. .\scripts\setup_env.ps1
npm ci
if (!(Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
npm run dev
```

Development runs Vite on `127.0.0.1:3000` and the API on `127.0.0.1:3001`. For a production process, run `npm run build`, then `npm start`. Vite preview serves only the frontend.

The example environment keeps AI disabled. Replay, market reads and wallet simulation do not need a provider key. The current helpers keep generated data under `.local/`; see [local storage](local_storage_policy.md).

## Server configuration

| Variable | Purpose |
| --- | --- |
| `AEGIS_NETWORK` | `mainnet` by default (chain 143); `testnet` selects chain 10143 |
| `AI_ENABLED` | Enables the shared AI gateway after its secrets and persistent ledger are configured |
| `TYPESAFE_API_KEY` | Project Jev credential |
| `MISTRAL_API_KEY` | Project Scout credential when Mistral is selected |
| `GEMINI_API_KEY` | Project Scout credential when Google is selected |
| `SCOUT_PROJECT_PROVIDER` | `mistral` or `google`; selects sponsored Scout, without automatic fallback |
| `AI_SESSION_SECRET` | Session/evidence signing secret, at least 32 characters |
| `AI_IMPLEMENTATION_TOKEN` | Private implementation-pool access |
| `TURNSTILE_SECRET_KEY` | Server-side visitor verification |
| `TURNSTILE_SITE_KEY` | Public widget identifier restricted to the deployed hostname |
| `AI_KEY_WRAP_PRIVATE_JWK` | Optional RSA-OAEP key for the wrapped credential setup path |
| `JEV_ENABLE_LIVE` | Legacy local adapter; leave false for the shared agent workflow |
| `PORT` | Optional Node server port |

Put local secrets in the ignored `.env`. Hosted secrets belong in Worker secret bindings. Never use a `VITE_` prefix for a credential. The app requires no wallet private key or seed phrase.

Provider/model choices are listed in [AI access](ai_access.md). User-key calls require the gateway but use the selected user's credential; they never fall back to project funding. An expired or failed visitor session must be verified again.

## Cloudflare

The public deployment is [aegis.himaloy2608.workers.dev](https://aegis.himaloy2608.workers.dev/). Build its module with:

```powershell
. .\scripts\setup_env.ps1
npm run build:cloudflare
```

The output is `.local/artifacts/cloudflare/worker.mjs`, containing the API and embedded frontend assets. `wrangler.jsonc` records the Worker name, runtime compatibility date and `AI_BUDGET` Durable Object binding. Upload the module through the Cloudflare Workers API or a configured deployment tool, preserving existing bindings and secrets.

`AI_BUDGET` uses `AiBudgetLedger` with SQLite storage and stable object name `aegis-ai-budget-v1`. Reuse the existing namespace on every release and rollback: replacing it starts a separate ledger and loses the deployment's lifetime spending enforcement. The initial migration tag is `ai-budget-v1`.

Keep the previous deployed version available for rollback. Check all three routes, current assets, read-only endpoints, news, anonymous AI rejection and sale simulation after rollout. Real inference and wallet signing are separate opt-in checks.

### Legacy address

The build also produces `legacy-worker.mjs` for the earlier `aegis-risk-terminal` address. Its HTML navigation GET/HEAD requests redirect to the current host while preserving paths and queries. API requests and static assets remain available for already-open pages.

The ignored `legacy-assets.json` build cache retains earlier hashed assets. Preserve it across release builds. Verify the new host before changing the compatibility Worker, and retain its previous version for rollback.

## API boundaries

- `/api/status`, `/api/market`, `/api/portfolio`: runtime and read-only market/wallet data.
- `/api/rpc`: fixed read-only RPC method allowlist; clients cannot select an upstream URL.
- `/api/prepare`: real calldata simulation and gas estimation, without submission.
- `/api/jev`, `/api/agent`: explicitly requested, budgeted inference.
- `/api/inference/session`, `/api/inference/status`: verified visitor access and availability.
- `/api/agent/key-check`: read-only lookup at the selected provider; no generation.
- `/api/agent/approve`: immutable, expiring, single-use action confirmation.
- `/api/news`: fixed allowlisted feeds with dated source links.

Wallet signing stays in the browser provider. Hosted conversations, policies and the journal remain session-only; persistent AI accounting stores neither conversations nor keys.
