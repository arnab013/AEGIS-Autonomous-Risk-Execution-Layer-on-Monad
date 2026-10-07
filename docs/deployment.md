# Local runtime and public deployment

Aegis requires a Node API server as well as the frontend. A static-only deployment cannot read the market through the gateway, protect the Jev key, simulate proposals or persist the journal.

## Local startup

Use Node.js 22.14 or later. The server imports TypeScript modules using Node's strip-types support.

~~~powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
npm run dev
~~~

Reuse installed dependencies when they match package-lock.json. If installation is needed, run npm ci in that configured F: session. Never replace an existing environment file or install tools with unverified write paths.

Development starts the API on 127.0.0.1:3001 and Vite on port 3000. Vite proxies API requests. For the built application:

~~~powershell
npm test
npm run build
npm start
~~~

The build command compiles TypeScript and Vite. Start serves dist and the API together on 127.0.0.1:3000. npm run preview provides only the frontend, so it is not the full product runtime.

## Server configuration

| Setting | Behavior |
| --- | --- |
| AEGIS_NETWORK | mainnet by default; testnet selects chain 10143 |
| TYPESAFE_API_KEY | Server-only TypeSafe key |
| JEV_ENABLE_LIVE | false unless explicitly set to true after credit usage approval |
| PORT | Optional server port override |

The gateway currently pins jev-latest. Configuration changes require restart. No private key is required; the user's browser wallet reviews and submits a supported protective sale.

GET /api/status reports safe service status, chain and market. GET /api/market reads the current pinned-block Kuru snapshot. GET /api/portfolio reads a supplied wallet's MON/USDC. POST /api/prepare simulates a protective sale without signing. POST /api/jev invokes the approved paid service only when enabled. Journal APIs persist and export project-local evidence.

Mainnet reads have been verified. The official testnet market currently lacks usable bids in development observations; a failure is expected when current data is invalid. Runtime availability must be verified before any demo.

On 8 October, 128 tests, the TypeScript/Vite build and browser checks passed. Mainnet calldata simulation/gas estimation succeeded for a 200 MON sale from a funded public account, without signing. The optional Solidity guard was compiled and deployed only inside a local EVM test environment. The configured TypeSafe key was present while paid inference remained disabled. Clean tests require no API key or paid call.

## Public-host work still required

No public app has been deployed in this session. Prepare a concrete host configuration for review before publishing it.

1. Use a Node host that can run source modules, installed dependencies and dist, with a writable designated journal directory.
2. Configure a deliberate network bind and HTTPS reverse proxy. The current server binds loopback. Review its Origin comparison and allowlist for the intended HTTPS deployment; the local HTTP assumptions do not constitute public-host configuration.
3. Keep secrets in the server environment. Leave paid inference off unless access control and spending limits are configured for the intended judge access.
4. Add appropriate authentication/rate limits, request validation, logs and retention for a public audience. Local Origin checks and cooldown are not authentication or a complete quota.
5. Decide which wallet/evidence data may be retained. The journal is local and unanchored; disclose access and retention.
6. Verify the actual public market, inference provenance, proposal simulation, wallet/network changes, errors and receipt reconciliation before publishing the demo.
7. Publish complete licensed source with attribution, build-window history, AI-tool disclosure and reproducible setup. Record an actual-operation video of at most three minutes.

The current gateway is intended for a local single-user workflow. Do not describe it as a hardened multi-user trading service.

## Monad execution evidence

Aegis uses Kuru's existing market contracts. A competition demonstration must preserve the actual chain, market address and an approved transaction hash/receipt. Source code or a reachable app alone does not establish successful execution.

PolicyGuard is an optional custody path, not part of direct wallet sales, and has not been deployed to Monad. Deploying it is unnecessary for this narrow reviewed-wallet workflow; do not claim its enforcement in the live path.

A submitted transaction can remain pending, revert or confirm. Do not retry by submitting a duplicate merely because receipt polling timed out. Resolve the actual hash first. No wallet transaction has been signed or paid inference performed in this development session.

See [storage policy](local_storage_policy.md), [demo plan](demo_script.md) and [submission checklist](submission.md).
