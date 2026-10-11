# Aegis

Aegis brings market evidence, Jev assessments and Scout, its assistant, into one MON/USDC workspace on Monad. The app can explain an observation, propose a session policy edit or prepare a MON reduction. Application code checks the proposal; the user confirms the change and signs any transaction separately in their wallet.

Open the [live app](https://aegis.himaloy2608.workers.dev). The homepage has Home and Dashboard links. Inside the app, Home, Overview and Market & execution live in the left navigation, with a collapsible menu on mobile. `/app` contains chat and evidence; `/app/workspace` contains detailed market, policies and trade review. Navigation keeps one session. Reloading clears conversations, policies, user keys and the hosted journal. The previous address preserves API and asset compatibility for already-open sessions.

AI access has independent settings for Jev and Scout: a project-funded trial, your own API key, or disabled. Scout accepts Mistral, OpenAI, Anthropic and Google AI keys. Choose the vendor before entering its key. Check key makes a read-only model request; it does not generate a reply or establish available generation quota. The sponsored trial uses the configured project provider, requires a Turnstile check and has a persistent US$10 application allowance: US$2 for implementation verification and US$8 for public review. See [AI access](docs/ai_access.md) for supported models, limits and key handling. Market reads and built-in replay do not require inference.

## Current status

| Feature                      | Status                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kuru market and wallet reads | Verified on mainnet, including orderbook/AMM depth and MON/USDC balances                                                                                                                                               |
| Protective MON sale          | Real calldata simulation and gas estimation passed; wallet submission and receipt reconciliation are implemented but have not been exercised with a signed trade                                                       |
| Jev and Scout                | Real Jev and Google-backed Scout responses passed, with captured inputs, explicit policy approval and stale/duplicate approval rejection. Mistral returned HTTP 429; OpenAI/Anthropic generation remain unverified |
| Replay                       | Five synthetic scenarios with heuristic probabilities and paper accounting                                                                                                                                             |
| Policy checks                | Editable limits, liquidity/slippage checks, stale-data rejection and blocked proposals                                                                                                                                 |
| Journal                      | Persistent local SHA-256 chain; the hosted app keeps a browser-session journal with a copy/export control                                                                                                              |
| Hosting                      | Cloudflare Worker at a free workers.dev subdomain; public browser and mainnet simulation checks passed                                                                                                                 |
| PolicyGuard                  | Compiled and tested in a local EVM; separate from direct wallet sales, with no Monad deployment or security audit                                                                                                      |

Perpl, Envio indexing and the MetaMask Agent Wallet plugin are not integrated. Live historical losses, resting orders and external positions are unavailable, so unattended trading is disabled.

The [verification report](docs/verification.md) records 524 tests, hosted browser checks and real API results. The user has also confirmed a Scout reply through the public trial after visitor verification. Public source visibility, the submission video and signed-sale validation remain outstanding. The redesign uses the existing codex/aegis-risk-control-mvp branch; preserve the original history and build-window disclosures.

## Run locally

Use Node.js 22.14 or later. All project writes must stay under F:\Projects\Monad Metropolis.

```powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
npm ci
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
npm run dev
```

Skip npm ci if node_modules already matches the lockfile. Preserve an existing .env. Open [localhost:3000](http://localhost:3000); development runs Vite on port 3000 and the API on 3001.

For contract tools, tests and a production build:

```powershell
npm run setup:contracts
npm test
npm run build
npm start
```

Start serves the built app and API together on localhost:3000. Vite preview serves only the frontend. The environment script keeps caches and temporary files under .local; see the [storage policy](docs/local_storage_policy.md) before using other tools.

## Configuration and use

```dotenv
AEGIS_NETWORK=mainnet
TYPESAFE_API_KEY=
JEV_ENABLE_LIVE=false
AI_ENABLED=false
MISTRAL_API_KEY=
GEMINI_API_KEY=
SCOUT_PROJECT_PROVIDER=mistral
AI_SESSION_SECRET=
AI_IMPLEMENTATION_TOKEN=
TURNSTILE_SECRET_KEY=
TURNSTILE_SITE_KEY=
```

Project keys stay on the server; never prefix them with VITE\_. Jev pins `jev-1.13.0`; Scout uses one allowed model per vendor, listed in [AI access](docs/ai_access.md). Set AI_ENABLED only with server secrets and the persistent ledger configured. Hosted project keys are configured as Cloudflare secrets; local AI remains disabled. The older JEV_ENABLE_LIVE flag is a legacy local adapter; keep it false for the shared agent workflow. The wallet flow needs no private key or seed phrase.

`npm run setup:typesafe` reads F:\Projects\jev_key.txt into the ignored server .env. For optional local Scout access, `node scripts/setup-ai.mjs --mistral` accepts a key through hidden input or standard input and configures the ignored server environment. These commands make no inference request. The official TypeSafe skill is vendored under skills/typesafe-ai with its license.

Choose Explore a replay, then use Step or Play. Scenario 5 shows an increase blocked near the position cap. Scenario 4 shows a hedge proposal rejected when the stressed book fails slippage and depth limits. Replay probabilities are heuristic and fills are paper records.

Live mode defaults to mainnet. Inspect the market and connected-wallet holdings, then prepare a MON reduction. The proposal shows amount, expected/minimum USDC output, target, slippage and expiry. Confirm in wallet requests signing. Keep MON for gas and fit the contract's current minimum/precision as well as your limits. The observed mainnet minimum was about 200 MON; the app reads it from the contract.

AEGIS_NETWORK=testnet selects chain 10143 instead of 143. The documented testnet market lacked bids during development and fails the two-sided-book check when liquidity is unavailable.

## Competition and provenance

The [official rules](https://hackathon.monad.xyz/api/v1/policies/current), checked again on 12 October, require public licensed GitHub source, build-window history, AI-tool disclosure, Monad deployment evidence and a demo of at most three minutes. The deadline is **14 October 2026, 05:59 CEST in Paris**. Detailed sponsor criteria still need review in the authenticated platform.

The supplied project already contained the React terminal, scenario fixtures, market/risk interfaces and placeholder integration clients. This work adds real Kuru reads and the reviewed sale path, server-side Jev transport/validation, paper accounting, stronger policy checks and source labels. Preserve the foundation's actual commit dates and identify it as pre-existing work in the submission.

OpenAI Codex assisted with research, implementation, tests and documentation. React, Vite, TypeScript, viem, Vitest and other dependencies retain their own licenses; see package.json and package-lock.json. Aegis uses the [MIT license](LICENSE). Trading performance and production security have not been established.

## Documentation

- [MVP assessment](docs/mvp_assessment.md) and [verification report](docs/verification.md)
- [Architecture](docs/architecture.md), [risk model](docs/risk_model.md) and [Jev design](docs/jev_design.md)
- [Deployment](docs/deployment.md) and [storage policy](docs/local_storage_policy.md)
- [AI access](docs/ai_access.md) and [warm design QA](docs/design-qa.md)
- [Competition requirements](docs/hackathon_requirements.md), [demo script](docs/demo_script.md) and [submission draft](docs/submission.md)
