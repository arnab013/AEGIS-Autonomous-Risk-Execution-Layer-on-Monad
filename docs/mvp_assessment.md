# MVP assessment

Keep Aegis and finish one trading workflow: read MON/USDC evidence, assess uncertainty, check the user's limits and review a protective sale. The supplied terminal and risk structure are useful foundations. Real reads, simulation and receipt handling address the largest gap in the original implementation.

The user is a MON holder trading through Kuru. They need to understand whether changing exposure is justified and what a permitted trade will execute. Jev provides an assessment of conflicting observations; code calculates risk and checks limits; the wallet gives final approval.

## Scope

The MVP includes Kuru parameters/orderbook/AMM depth, MON/USDC holdings, editable limits, a server-side Jev adapter, policy rejection, a simulated/reviewed native MON sale, receipt reconciliation and a local journal. Replay supplies repeatable stress cases with heuristic probabilities and paper accounting.

Reads, sale simulation, tests, build and browser checks have passed; see [verification](verification.md). A signed trade, live response through the new Jev gateway and public submission artifacts remain unfinished. The testnet market's missing bids make mainnet observation the current default.

Live buys, resting-order cancellation, Perpl hedging, historical-loss indexing and delegated signing are outside this version. The short replay hedge omits funding/margin; the journal is local; PolicyGuard has only local EVM deployment and no audit.

## Competitive case

The [judging rules](https://hackathon.monad.xyz/api/v1/policies/current) weight completeness, technical excellence, Monad integration, track relevance and innovation equally. A finished trading flow gives judges evidence for each.

The demo should connect current market/model evidence to one approved chain action, then show a tempting increase blocked by the position cap. That makes the value of policy visible.

Kuru's consumer-trading bounty is the closest candidate, subject to its authenticated criteria. Jev is required by the project brief; the public rules inspected do not make it a track requirement. Winning depends on execution and the other entries.

## Next work

1. Capture one approved sale and one response through the new Jev gateway, including receipt/output and model source.
2. Grant access and publish source with actual history, license and disclosures; record the three-minute demo. The Cloudflare app is live and verified.
3. Verify the registered track/bounty rules and eligibility.
4. Compare Jev with a simple deterministic baseline on labeled ambiguous states.
5. Index complete balances, fills, losses and orders before adding autonomy.

Finish these before pursuing more sponsor integrations.
