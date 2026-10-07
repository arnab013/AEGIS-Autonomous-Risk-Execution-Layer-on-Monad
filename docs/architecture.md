# Architecture

Aegis has two explicit modes. Replay uses synthetic market fixtures, deterministic heuristic probabilities and a paper ledger. Live reads a real Kuru market, evaluates evidence on request, and supports a protective native MON sale reviewed in the user's browser wallet. Live inference never automatically submits a transaction.

~~~mermaid
flowchart TD
  RPC[Monad RPC and Kuru contracts] --> Gateway[Local Node gateway]
  Gateway --> Live[Live market and wallet balances]
  Fixtures[Synthetic replay fixtures] --> Math[Market statistics and risk]
  Live --> Math
  Math --> State[Compact typed state]
  State --> Model[Server-only Jev request]
  Model --> Validate[Validate probabilities and uncertainty]
  Validate --> Gate[Deterministic policy gate]
  Gate --> Evidence[Decision evidence]
  Evidence --> Journal[Project-local hash-chain journal]
  Fixtures --> Paper[Paper ledger]
  Gate --> Paper
  User[User requests protective MON sale] --> Prepare[Policy check and exact simulation]
  Live --> Prepare
  Prepare --> Review[Wallet review]
  Review --> Chain[Actual submitted transaction]
  Chain --> Receipt[Receipt and USDC transfers]
  Receipt --> Live
~~~

## Market and portfolio state

The adapter verifies the chain and target bytecode, pins reads to one block, and checks the native MON/USDC market metadata. It decodes the packed orderbook and reconstructs Kuru AMM depth using the official SDK's integer arithmetic. A book must have positive, uncrossed bids and asks. Contract precision, minimum size and maximum size govern transaction encoding.

The terminal polls market data approximately every three seconds; the gateway caches a snapshot for one second. This is an interactive trading copilot, not a measured high-frequency trading system. Report RPC round trip and receipt observation separately from network finality.

The gateway defaults to mainnet, chain 143. The documented testnet market on chain 10143 lacked bids during development, so current invalid books fail rather than receiving substitute fixture data. Wallet reads retrieve native MON and USDC. Resting orders, historical realized loss, collateral and perpetual positions are not indexed. Live state prominently reports this incomplete coverage.

A verified mainnet sample on 8 October came from block 111450170, with 23 bid levels, 30 ask levels and mid price 0.025843 USDC/MON. The observed snapshot read took 715 ms. This is one measured application sample; current price, depth and latency vary.

## Decisions and deterministic checks

The client builds compact state; the server constructs fixed official Choice and Noul questions. API keys stay on the server. Paid inference is disabled unless explicitly enabled after credit usage is approved. A malformed or unavailable response produces a labeled safe fallback. Replay uses labeled heuristic output and makes no API call.

The engine snapshots state for evaluation and checks that it has not changed before accepting the result. The deterministic gate separately checks policy, available inventory or cash, pending orders supplied to it, liquidity, slippage, freshness and other limits. Model probabilities cannot loosen a limit. See [Jev design](jev_design.md) and [risk model](risk_model.md).

Replay fills walk the synthetic book and update cash, inventory, basis and PnL. Its indicative short hedge uses the spot reference price; it does not model a Perpl margin account, funding or liquidation.

## Reviewed execution

Only an explicit protective MON sale is implemented in the live wallet flow. Preparation reads fresh market parameters, checks size precision, simulates exact Kuru calldata and estimates gas. The minimum USDC output enforces both quote deterioration and total slippage from observed mid price. The reviewed proposal expires after 30 seconds.

Submission rechecks the account, chain, amount, proposal integrity, current market and simulation before requesting EIP-1193 wallet approval. A real hash is recorded as submitted. The receipt and matching transaction are checked before confirmation; token transfer logs measure delivered USDC. Reverted and pending/timeout outcomes remain distinct. Balances refresh from chain.

No real wallet transaction has been signed during development. This is implemented execution awaiting authorized end-to-end proof.

Read-only mainnet execution verification on 8 October succeeded from a funded public account: a 200 MON sale simulated approximately 5.156 USDC output, with a 5.132807 USDC minimum under a total 50 bps cap, and gas estimation returned 297,208. No signature or chain state change occurred. These are dated observations, not fixed prices, executable promises or proof that the complete wallet UI has traded.

## Journal and optional components

The gateway writes serialized JSONL records under the project F: directory. SHA-256 links each event to the previous record. On restart it verifies the active journal and rotation anchor; bounded records are exposed to the UI. Export writes to the same project artifact directory. The chain is local and unanchored: it detects inconsistent records relative to its retained anchor, but a writer controlling the journal and anchor can replace both.

Perpl, Envio indexing and MetaMask Agent Wallet are not integrated. PolicyGuard is an optional custody contract separate from direct wallet execution. It compiled with Solidity 0.8.30 and passed local EVM tests; it has not been deployed to Monad or audited. Application checks do not establish an audited onchain mandate.

## Runtime

Development uses Vite on port 3000 and Node on 3001 with API proxying. Build/start serves the compiled frontend and API together on loopback port 3000. A static-only Vite preview cannot provide the API. See [deployment](deployment.md) for public-host work still required.
