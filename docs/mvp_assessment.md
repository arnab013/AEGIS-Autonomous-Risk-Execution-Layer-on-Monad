# MVP assessment

Keep Aegis, but make its core promise narrow: **a MON/USDC trader can inspect real evidence, define limits, assess uncertainty, and review a bounded protective sale.** That is a coherent product workflow. A larger autonomous multi-venue terminal without real reconciliation would be harder to finish and harder for judges to trust.

The original idea supplied useful market/risk structure and a terminal. Simulated integration claims, fabricated execution and broad sponsor coverage weakened it. Reusing that foundation while replacing those claims with actual contract reads, exact preparation and receipt handling is a better use of the remaining build window.

## Primary user and job

The primary user holds MON and trades through Kuru. Their immediate job is to decide whether current evidence warrants changing exposure and whether the intended action meets their limits. The product should expose current source, uncertainty, checks and transaction terms at the point of action.

Jev adds a bounded assessment of conflicting observations; deterministic code owns arithmetic and constraints. A wallet-reviewed sale gives the result a real onchain consequence. Replay makes dangerous cases repeatable without pretending they are live market performance.

## Minimum coherent product

The implemented slice is:

- One pair on one configured Monad chain, with actual Kuru parameters, CLOB and AMM depth.
- Real MON/USDC wallet holdings and editable mandate limits.
- A server-only official Jev adapter, explicit credit opt-in, response validation and honest fallback.
- Independent risk checks and visible rejected proposals.
- A protective native MON sale with exact size/value, simulated output, slippage protection, expiry and wallet review.
- Actual receipt/transaction validation and USDC delivery reconciliation.
- Labeled heuristic replay with paper accounting and a local hash-chain evidence journal.

Mainnet reads and real native-MON sale simulation/gas estimation work in development observations; the official testnet market lacks bids. Verification includes 128 passing tests, a passing build and browser checks for replay, policy rejection, evidence, live reads, free inspection and mobile layout. The signing path is implemented but has not been signed in this session. The configured Jev key remains behind disabled paid inference, so an authorized official response is pending. Public code/app/demo evidence remains unfinished.

Live buys, resting-order cancellation, actual Perpl hedging, full historical-loss indexing and delegated autonomy are extensions. Existing abstractions or sponsor logos do not count as those integrations.

## Competitive strengths

The [official judging rules](https://hackathon.monad.xyz/api/v1/policies/current) weight completeness, technical excellence, Monad integration, track relevance and innovation equally. A complete narrow workflow can score across all five more credibly than a feature list.

The strongest demonstration connects three things: actual market/model evidence, one approved chain action, and a dangerous proposal blocked by deterministic policy. The most compelling product moment is the user seeing why an attractive proposal is denied, then reviewing exact executable terms for a permitted action.

Kuru's consumer trading opportunity is the nearest sponsor candidate. Qualification remains pending its authenticated criteria. Jev is required by the user's brief; inspected public rules do not establish a Jev competition mandate. A win cannot be promised.

## Weaknesses and priority

The most material gaps are successful live signing and paid inference evidence, incomplete portfolio history/orders, a testnet liquidity limitation, and public submission artifacts. Replay's short hedge omits real funding/margin; the journal is local, and the optional guard has only local EVM test deployment and no security audit. Public hosting needs access and spending controls beyond the local server.

Before expanding scope:

1. With the user's specific transaction/API authorization, demonstrate a current market-compatible protective sale and one official Jev response. Preserve the actual hash, receipt, output and model provenance.
2. Complete public licensed code, actual commit provenance, safe public runtime and a three-minute demo. Verify registered track/bounty criteria and eligibility.
3. Show Jev's decision value on labeled ambiguous states against a simple deterministic baseline.
4. Index authoritative balances, fills, historical loss and resting orders before considering unattended execution.

Do not spend the remaining deadline window chasing every optional sponsor integration. The product should finish one credible trading job first.
