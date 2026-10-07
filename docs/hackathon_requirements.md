# Monad Metropolis: verified requirements and MVP scope

Research checked on **8 October 2026**. Competition facts, implementation evidence, and recommendations are separate below. An available API or SDK is not evidence that this project integrates it.

## Competition facts

Monad's [official event page](https://monad.xyz/developers/hackathons/metropolis) describes an online global build window of 1 September to 13 October. Its [APAC organizer event](https://luma.com/metropolis-hangzhou-sep-2026) confirms 2026. The competition is still open on the research date.

The [official submission platform](https://hackathon.monad.xyz/tracks/onchain-finance) displays **14 October, 03:59 UTC**. Its published application configuration sets `submissionDeadline` to `2026-10-14T03:59:00Z`: **14 October 2026, 05:59 CEST in Paris**. The marketing date is 13 October; submit earlier. Confirm the registered project's effective deadline in the platform before submission. Public configuration also sets judging end to 27 October 23:59 UTC and winners announcement to 3 November 17:00 UTC.

| Requirement | Verified rule |
| --- | --- |
| Product | Working product deployed to Monad mainnet or testnet; provide contract addresses or transaction hashes. |
| Source | Public GitHub repository, complete code, OSI-approved license, setup README, attribution, and build-window commit history. |
| Existing code | Identify pre-existing components; substantial majority of submitted work must be new, with substantial new functionality. |
| AI tools | Allowed; disclose AI coding-tool use in the README. |
| Demo | Public video, at most 3 minutes, showing actual operation and Monad interactions. |
| Documentation | Description, architecture, stack, and setup/deployment instructions. |
| Team | 1–5 registered members; one designated contact. |
| Entry | One project per participant; one primary track. |
| Eligibility | 18+ as of 1 September, or verified guardian consent; sanctions/legal restrictions and organizer/sponsor/judge employment exclusions apply. |

Source: [official Rules & Guidelines v3](https://hackathon.monad.xyz/api/v1/policies/current), updated 3 September 2026, §§2–4, 7 and 9. These binding rules require open source; the marketing FAQ says it is merely encouraged. Follow the stricter published rules. The rules also confirm 13 October 2026, 23:59 ET, equivalent to the platform's UTC deadline above.

Judging uses five equally weighted dimensions: product quality/completeness, technical excellence, Monad integration, track fit/problem relevance, and innovation/impact (20% each). Sponsor scoring is requirement adherence 40%, technical implementation 30%, Monad integration 20%, and innovation 10%. [Rules §5](https://hackathon.monad.xyz/api/v1/policies/current).

## Track fit and research limits

Rules §3.3 define Track 01 around financial instruments, markets, and asset primitives whose primary user is a trader, protocol, or financial-product builder. The [official overview](https://monad.xyz/developers/hackathons/metropolis) emphasizes fast settlement and examples including onchain orderbooks and frequently updated perpetuals funding. Aegis should identify its primary user as a MON/USDC trader and demonstrate the whole trading workflow.

**Product judgment:** Aegis fits when it demonstrates a complete trading control workflow: real Kuru state, deterministic checks, bounded Jev decisions, a wallet-reviewed transaction, and receipt reconciliation. Probability charts and replay alone do not satisfy the working-product requirement. The strongest narrow MVP is a MON/USDC spot risk copilot, with a verifiable blocked oversized order and a real user-approved order path. Perpl hedging and autonomous delegated execution are extensions unless completed and verified in time.

Detailed track and sponsor questions load from the platform catalog. Unauthenticated `/api/v1/catalog` returned `AUTHENTICATION_REQUIRED`; no authenticated session was used. Bounty-specific criteria and any additional track/API restrictions remain **unverified**. The publicly readable Rules v3 confirm the general judging, deployment and eligibility requirements above. Read the registered project's selected track/bounty rules before claiming qualification; do not infer sponsor qualification from general rules.

**Jev is required by the user's brief.** Inspected public competition sources do not establish that it is a track requirement or named bounty.

## Bounties: confirmed titles, pending qualification

The [official sponsor list](https://monad.xyz/developers/hackathons/metropolis) confirms these listings. Amounts are prizes, not guaranteed awards or established eligibility.

| Sponsor | Public opportunity | Evidence needed before applying |
| --- | --- | --- |
| Kuru | $5,000 consumer trading app | Real Kuru execution in the main user flow. Full criteria pending. |
| Kuru | $5,000 new assets and markets | A new asset/market use case. MON/USDC controls alone do not establish fit. |
| Perpl | $5,000 API use | Documented Perpl API used in a successful product workflow. Full criteria pending. |
| Perpl | $3,000 analytics / risk tool | Useful Perpl-backed analytics. A simulated hedge is insufficient. |
| Envio | $1,000 use of Envio | Actual event querying/indexing used by the product. A height probe is insufficient. |
| MetaMask | $2,500 Agent Wallet plugin | A real Agent Wallet plugin and demonstrated host integration. Wallet connection is insufficient. |

Envio [confirms its bounty](https://docs.envio.dev/blog/developer-update-september-2026) and offers help indexing supplied contract addresses. Its $5,000 Cloud hosting listing is a winner perk, separate from the bounty.

## Verified integration reference

### Monad

| Network | Chain ID | Token | Public RPC |
| --- | --- | --- | --- |
| Mainnet | `143` | MON | `https://rpc.monad.xyz` |
| Testnet | `10143` | MON | `https://testnet-rpc.monad.xyz` |

[Current Monad facts](https://docs.monad.xyz/ai/current-facts) distinguish 300 ms mainnet blocks, 300 ms speculative finality, and 600 ms full finality. These are network figures, not Aegis measurements. Never call a block time, RPC round trip, or receipt observation application finality. The competition permits mainnet or testnet. Aegis defaults to mainnet observation because the documented testnet market lacked bids during development. A real mainnet transaction requires the user's specific trade/gas approval; testnet execution requires a currently valid market rather than substituted data.

### Jev / TypeSafe

The [official API](https://docs.typesafe.ai/api) is `POST https://api.typesafe.ai/v1/systemone`, with Bearer authentication and `state`, `model`, and typed `questions`. `jev-latest` is documented. Choice questions define options in a `criteria` map; responses contain `choice`, `probabilities`, and `confidence`. Score and Noul are also available. Validate responses and keep the key on the server.

[TypeSafe Choice confidence](https://docs.typesafe.ai/confidence) is `(p_max - 1/n) / (1 - 1/n)` for `n` options. Shannon entropy and the top-two probability margin are additional Aegis statistics, not TypeSafe's confidence formula. None proves profitability. Test action thresholds on labeled scenarios and retain deterministic checks.

### Kuru

Kuru provides a [fully onchain orderbook and aggregator](https://docs.kuru.io/), SDK, and contracts. The [official address reference](https://docs.kuru.io/contracts/Contract-addresses) lists:

| Item | Testnet | Mainnet |
| --- | --- | --- |
| MON/USDC market | `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9` | `0x065C9d28E428A0db40191a54d33d5b7c71a9C394` |
| USDC | `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| MarginAccount | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` | `0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5` |

Use addresses only on their matching chain. Read parameters and decimals from contracts. Native MON value and ERC-20 approval paths differ. Check target bytecode and simulate exact calldata before wallet approval. [OrderBook SDK](https://docs.kuru.io/sdk/orderbook-sdk), [integration guide](https://docs.kuru.io/contracts/Integration).

### Perpl

[Official Perpl API documentation](https://github.com/PerplFoundation/api-docs) lists mainnet `https://app.perpl.xyz/api` and testnet `https://testnet.perpl.xyz/api`. Public context and market data are readable without trading authorization. Trading requires an enrolled Ed25519 key, signed requests, and an onchain account; generic Bearer authentication is incorrect. Programmatic enrollment needs wallet signatures and a Perpl-whitelisted Origin. Market IDs and collateral differ per network. [Enrollment reference](https://github.com/PerplFoundation/api-docs/blob/main/integrations.md).

### Envio

[Supported networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks) include both Monad chains. Testnet endpoints are `https://monad-testnet.hypersync.xyz` and `https://monad-testnet.rpc.hypersync.xyz`; mainnet uses the `monad` hostname. [HyperSync and HyperRPC require an API token](https://docs.envio.dev/docs/HyperSync/api-tokens). Cloud indexers have their own access. A local JSON audit does not become onchain or tamper-proof because an endpoint is reachable.

### MetaMask

The [Agent Wallet plugin API](https://docs.metamask.io/agent-wallet/reference/plugins/) requires an `mm` manifest, compiled commands, and `PluginCommand` integration. The host gates `wallet-read`/`wallet-submit` capabilities and signing. This differs from extension connection or an application-local session key. [Monad mainnet and testnet are supported](https://docs.metamask.io/agent-wallet/reference/supported-chains/). Install only after proving that CLI config, plugins, caches, and state stay inside this F: project under the user's storage rule.

## Submission evidence gates

1. Save registered-project track/bounty requirements and effective deadline.
2. Record real market contract, chain, timestamps, parameters, balances, and orders.
3. Capture an official Jev response, model, timing, and probabilities with secrets removed.
4. Demonstrate a risk-approved wallet transaction, real hash/receipt, and resulting venue state.
5. Demonstrate a blocked proposal with its policy violation and no requested transaction.
6. Provide reproducible checks, public app/code links, demo/pitch videos, and access instructions.

Use explicit labels: **replay**, **live read**, **prepared transaction**, **submitted**, **confirmed**, and **not integrated**. Never fabricate transactions, audits, latencies, users, PnL, or integrations.
