# Aegis

Aegis is a MON/USDC trading terminal on Monad. It reads Kuru's market, checks the user's trading limits, and uses Jev to assess uncertain market conditions. Its live trading path prepares a protective MON sale for review in the user's wallet.

Open the [live app](https://aegis.himaloy2608.workers.dev). Market reads, wallet balances, sale simulation and replay work without a login. Paid Jev inference is disabled on this public deployment. The previous address remains compatible with already-open browser sessions and redirects page navigation to this shorter address.

## Current status

| Feature                      | Status                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kuru market and wallet reads | Verified on mainnet, including orderbook/AMM depth and MON/USDC balances                                                                                         |
| Protective MON sale          | Real calldata simulation and gas estimation passed; wallet submission and receipt reconciliation are implemented but have not been exercised with a signed trade |
| Jev                          | Official server-side adapter and validation implemented; key configured, paid inference disabled pending credit approval                                         |
| Replay                       | Five synthetic scenarios with heuristic probabilities and paper accounting                                                                                       |
| Policy checks                | Editable limits, liquidity/slippage checks, stale-data rejection and blocked proposals                                                                           |
| Journal                      | Persistent local SHA-256 chain; the hosted app keeps a browser-session journal with a copy/export control                                                        |
| Hosting                      | Cloudflare Worker at a free workers.dev subdomain; public browser and mainnet simulation checks passed                                                           |
| PolicyGuard                  | Compiled and tested in a local EVM; separate from direct wallet sales, with no Monad deployment or security audit                                                |

Perpl, Envio indexing and the MetaMask Agent Wallet plugin are not integrated. Live historical losses, resting orders and external positions are unavailable, so unattended trading is disabled.

The [verification report](docs/verification.md) records test, build, browser and RPC results. Signed execution, validation of the new Jev gateway against the paid service and the submission video are still outstanding. The selected GitHub repository is configured as origin. The redesign is developed on codex/aegis-risk-control-mvp; preserve the original history and build-window disclosures.

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
```

The key stays on the server; never prefix it with VITE\_. The gateway uses jev-latest. Enable JEV_ENABLE_LIVE only after approving API-credit usage, and restart the API after changing configuration. The wallet flow needs no private key or seed phrase.

`npm run setup:typesafe` reads F:\Projects\jev_key.txt into the ignored server .env. The official TypeSafe skill is vendored under skills/typesafe-ai with its license. This setup does not make an inference request. The public Worker deliberately rejects paid inference until owner authentication and a persistent spending limit are implemented.

Start in Replay Mode and use Step or Play. Scenario 5 shows an increase blocked near the position cap. Scenario 4 shows a hedge proposal rejected when the stressed book fails the slippage and depth limits.

Live mode defaults to mainnet. Inspect the market and connected-wallet holdings, then prepare a MON reduction. The proposal shows amount, expected/minimum USDC output, target, slippage and expiry. Confirm in wallet requests signing. Keep MON for gas and fit the contract's current minimum/precision as well as your limits. The observed mainnet minimum was about 200 MON; the app reads it from the contract.

AEGIS_NETWORK=testnet selects chain 10143 instead of 143. The documented testnet market lacked bids during development and fails the two-sided-book check when liquidity is unavailable.

## Competition and provenance

The [official rules](https://hackathon.monad.xyz/api/v1/policies/current) require public licensed GitHub source, build-window history, AI-tool disclosure, Monad deployment evidence and a demo of at most three minutes. The deadline is **14 October 2026, 05:59 CEST in Paris**. Detailed sponsor criteria still need review in the authenticated platform.

The supplied project already contained the React terminal, scenario fixtures, market/risk interfaces and placeholder integration clients. This work adds real Kuru reads and the reviewed sale path, server-side Jev transport/validation, paper accounting, stronger policy checks and source labels. Preserve the foundation's actual commit dates and identify it as pre-existing work in the submission.

OpenAI Codex assisted with research, implementation, tests and documentation. React, Vite, TypeScript, viem, Vitest and other dependencies retain their own licenses; see package.json and package-lock.json. Aegis uses the [MIT license](LICENSE). Trading performance and production security have not been established.

## Documentation

- [MVP assessment](docs/mvp_assessment.md) and [verification report](docs/verification.md)
- [Architecture](docs/architecture.md), [risk model](docs/risk_model.md) and [Jev design](docs/jev_design.md)
- [Deployment](docs/deployment.md) and [storage policy](docs/local_storage_policy.md)
- [Competition requirements](docs/hackathon_requirements.md), [demo script](docs/demo_script.md) and [submission draft](docs/submission.md)
