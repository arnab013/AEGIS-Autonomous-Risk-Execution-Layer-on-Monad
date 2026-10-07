# Aegis

A probabilistic risk copilot for MON/USDC trading on Monad. Aegis combines real Kuru market data, editable trading limits, bounded Jev decisions, and a wallet-reviewed protective MON sale.

The product answers a practical question: **does the current evidence justify changing exposure, and does the proposed action satisfy my mandate?** The model proposes; deterministic code checks; the user controls signing.

## What works and what remains

| Capability | Current status |
| --- | --- |
| Kuru / Monad market reads | Real contract reads: pinned block, market parameters, packed CLOB and reconstructed AMM depth. Mainnet two-sided reads verified during development. |
| Live wallet balances | MON and USDC read from chain for a connected account. |
| Protective native MON sale | Real mainnet calldata simulation and gas estimation succeeded using a funded public account. Minimum output, wallet submission and receipt tracking implemented; no transaction has been signed in this session. |
| Jev | Official System One request/response integration through a server proxy. Paid inference disabled by default; live model proof pending authorization. |
| Replay | Five synthetic scenarios, deterministic heuristic probabilities and book-based paper fills. No fabricated transaction hashes. |
| Risk checks | Input validity, mandate, position, liquidity, slippage and other constraints; oversized proposals can be rejected before execution. |
| Audit | Project-local JSONL journal with a SHA-256 hash chain and visible decision evidence. It is not Envio indexing or an onchain attestation. |
| Perpl / MetaMask Agent Wallet | Not integrated. Live hedging and delegated autonomy unavailable. |
| PolicyGuard | Compiled and exercised in a local EVM; separate from the wallet path. No Monad deployment or security audit is claimed. |

Live operation observes mainnet by default. Switching to testnet uses the documented testnet market, which lacked bids during development and is rejected when it is not a valid two-sided market. Data availability changes: the runtime checks the current book rather than inventing liquidity.

## Run locally on Windows

Use **Node.js 22.14 or later**. TypeScript source is loaded by the server using Node's strip-types support.

All project writes must stay under `F:\Projects\Monad Metropolis`. In a PowerShell session:

```powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
npm ci
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
npm run dev
```

Existing dependencies can be reused; installation is unnecessary when `node_modules` matches the lockfile. Never overwrite an existing `.env`. Open [localhost:3000](http://localhost:3000). Development starts Vite on 3000 and the API on 3001.

```powershell
npm run setup:contracts
npm test
npm run build
npm start
```

Production startup serves the built app and API together on localhost:3000. `npm run preview` serves only the frontend and does not supply the API.

Development verification on 8 October: **128 tests passed**, TypeScript/Vite build passed, and browser checks covered replay, a blocked oversized proposal, decision evidence, live onchain reads, inspection without paid inference and mobile overflow. Contract tests used compiled Solidity 0.8.30 in a local EVM. These checks do not establish a signed mainnet trade or a live paid Jev response.

The storage script redirects command caches, temporary paths and user configuration into `.local`. Existing browser storage is outside this shell's control; do not download browsers or save project exports to C:. See [storage policy](docs/local_storage_policy.md).

## Configuration

`.env` is server-only and ignored by Git:

```dotenv
AEGIS_NETWORK=mainnet
TYPESAFE_API_KEY=
JEV_ENABLE_LIVE=false
```

Set `AEGIS_NETWORK=testnet` to target chain 10143 instead of mainnet 143. Restart the API after a configuration change. No private key or seed phrase is needed.

After approving TypeSafe API-credit usage, set `JEV_ENABLE_LIVE=true` and provide `TYPESAFE_API_KEY`. The browser sends state to `/api/jev`; the server pins `jev-latest` and owns the official questions and authorization header. Never use a `VITE_` prefix for secrets.

## Use the product

Start in **Replay Lab**. Choose a scenario and press **Step** or **Play**. Scenario 5 shows a bullish proposal blocked near the position cap. Scenario 4 demonstrates a hedge proposal blocked by the default slippage limit; changing the mandate can permit only a paper hedge. Model output in replay is explicitly heuristic.

In **Live**, inspect current Kuru data and wallet balances. With paid inference disabled, the decision source remains unavailable/fallback. A user can explicitly prepare a protective MON reduction; the UI checks policy and the server simulates the exact Kuru market call. The proposal shows amount, estimated/minimum USDC output, market address, slippage and expiry. Only **Confirm in wallet** requests a transaction.

Market minimum size and precision come from the contract. Mainnet's observed minimum was approximately 200 MON during development; the UI reports the current value. Choose a clip within your order cap, available inventory and liquidity limits, and retain MON for gas. Preparation may legitimately fail.

Historical PnL, resting Kuru orders and perpetual positions are not indexed in live mode. New-risk autonomous execution remains unavailable. A successful receipt is recorded separately from submission, and balances refresh from chain.

## Product and submission evidence

This retains the useful terminal and risk concept while replacing simulated integration claims with a narrow real execution path. Real read-only simulation is verified; the configured TypeSafe key remains behind disabled paid inference. Public GitHub publication, public deployment, an authorized Jev response, a real approved Kuru transaction and a public demo still need evidence.

The [official competition rules](https://hackathon.monad.xyz/api/v1/policies/current) require public GitHub source under an open-source license, build-window commit history, AI-tool disclosure, Monad integration and a demo of at most 3 minutes. Deadline: **14 October 2026, 05:59 CEST in Paris**. Full sponsor qualification remains pending authenticated platform review.

**Build provenance:** the pre-existing foundation supplied with this project included the React terminal, scenario fixtures, market/risk engine interfaces and placeholder integration clients. Current work adds real Kuru contract reads and reviewed execution, server-only Jev transport/validation, explicit paper accounting, stronger policy checks and honest provenance labels. The original foundation predates this development session; preserve and disclose its actual commit dates before submission.

**AI-tool disclosure:** OpenAI Codex assisted with research, implementation, tests and documentation. External React, Vite, TypeScript, viem, Vitest and supporting libraries retain their own licenses; see `package.json` and `package-lock.json`.

## Documentation

- [MVP assessment](docs/mvp_assessment.md): product choice, competitive strengths and remaining work.
- [Architecture](docs/architecture.md), [risk model](docs/risk_model.md), [Jev design](docs/jev_design.md).
- [Demo script](docs/demo_script.md), [deployment](docs/deployment.md), [requirements](docs/hackathon_requirements.md), [submission](docs/submission.md).
- [Local storage policy](docs/local_storage_policy.md), [verification report](docs/verification.md).

Aegis code is released under the [MIT license](LICENSE). There is no profitability claim, production security audit or verified autonomous-trading guarantee.
