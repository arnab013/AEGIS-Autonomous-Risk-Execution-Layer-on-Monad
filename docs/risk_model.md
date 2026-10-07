# Risk model and limits

Aegis calculates market and portfolio statistics in code, uses probabilities for a bounded proposal, and independently checks whether the proposal satisfies the user's mandate. Wallet approval is the live signing boundary. These checks are application controls, not an audited global wallet restriction.

## Market calculations

Mid price is the mean of best bid and ask. Spread is (ask - bid) / mid × 10,000. Depth sums price × size on the selected side within 25 basis points of mid. Book imbalance is (bid depth - ask depth) / (bid depth + ask depth).

Returns are logarithmic observed price changes. One- and five-minute volatility are sample standard deviations of observed log returns in those windows, without annualization. At startup, history can be too short to support a meaningful volatility assessment.

The compatibility field volatility_percentile is scaled as min(100, round(volatility_1m / 0.035 × 100)). The interface labels it a stress index. No historical reference distribution exists; it is not an empirical percentile.

A proposed clip walks executable levels, calculating filled size, average price and slippage from mid. An incomplete fill fails the slippage check. Snapshot liquidity is evidence at observation time, not a guarantee of future availability.

## Deterministic gate

| Check | Relevant behavior |
| --- | --- |
| Valid inputs | Known action; finite policy, positions, orders and positive trade size |
| Mandate | Permitted action, allowed venue and pair assets |
| Fresh market | Positive two-sided uncrossed book, no more than 15 seconds old |
| Position | Existing spot plus supplied pending buys and new clip must fit cap for purchases |
| Leverage | Gross exposure against conservative equity; positive unverified PnL ignored |
| Loss | max(0, -(realized today + unrealized PnL)) below loss cap for new risk |
| Size | Proposed USD clip at or below order cap |
| Cash / inventory | Supplied pending purchases/sales reserve available balances |
| Hedge | Proposed short cannot exceed current positive delta |
| Liquidity | Selected-side 25 bps depth at or above minimum |
| Slippage | Complete book walk and impact at or below cap |
| Orders / cooldown | Supplied open orders and last confirmed execution limit new risk |

Defaults are $2,000 position, 2× leverage, $400 daily loss, $300 order cap, 25 bps slippage, $1,500 minimum depth, five open orders, 60-second stale-order timeout and two-second cooldown. These are demo defaults, not calibrated advice. Six limits are editable in the terminal; other policy fields remain available to the engine.

The core pause check stops new risk while allowing protective reductions and cancellations. The terminal's pause also disables transaction preparation/signing. Pause cannot retract a transaction already submitted or cancel a pending transaction by itself.

The engine rechecks state consistency after asynchronous inference. It records a cooldown only after an actual paper fill or confirmed execution. A rejected proposal does not consume imaginary trading capacity.

## Paper accounting

Replay uses a separate ledger with synthetic observations. A spot purchase debits cash and adds inventory and cost basis; a sale credits cash, removes inventory and recognizes basis-based PnL. Marking reflects changing book mid price. Paper cancellation removes supplied resting orders.

A paper hedge is an indicative protective short using the spot book reference and bounded clip. It updates short size and delta. It is not a Perpl fill and omits actual collateral, funding, fees, liquidations, competing orders and market latency. Paper records have explicit assumptions and never fake transaction hashes.

Replay scenario 4 initially blocks its hedge under the default slippage cap. Raising the cap is an explicit user mandate change; it may permit a bounded paper hedge when every other check passes. It does not establish a fully neutralized real portfolio.

## Live protective sale

The live path supports native MON sold for USDC through the configured Kuru market. The UI checks the current reduction clip. The adapter checks chain, bytecode, native/quote metadata, exact precision, market minimum/maximum size, simulation and gas before preparing a 30-second proposal.

Minimum output is the stricter of a quoted-output tolerance and total slippage from the observed midpoint. Submission checks proposal integrity, exact calldata and value, account/chain consistency, current price, market limits and a fresh simulation. Confirmation verifies the transaction and receipt; USDC transfer logs measure output. A timeout stays pending rather than becoming an invented failure or fill.

Historical loss, resting orders and perpetual balances are not authoritative in live state. The application therefore does not offer unattended new-risk execution or promise that its live dashboard covers the entire wallet mandate. Wallet holdings also include gas inventory; sufficient MON for fees must remain.

## Authority and remaining work

Direct wallet execution does not route through PolicyGuard. The optional contract restricts one native-MON sell path with native-unit spend budgets, pause and expiry. It compiled and passed local EVM tests but has no Monad deployment or security audit. Those budgets are not USD loss or portfolio limits. See [contract notes](../contracts/README.md).

A browser owner can modify application code or transact elsewhere. The local journal has no independent onchain anchor. Before autonomy, index authoritative balances, fills, losses and resting orders; coordinate pending reservations; validate a narrowly scoped signer; and independently review custody and execution controls.
