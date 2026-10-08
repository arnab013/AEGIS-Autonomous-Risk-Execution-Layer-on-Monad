# Risk model and limits

The policy gate checks a proposed action independently of model probabilities. In Live, the user still reviews and signs the transaction. Application checks cover the workflow in Aegis; they do not restrict every transaction the wallet can make.

## Calculations

Mid price is the mean of best bid and ask. Spread is (ask − bid) / mid × 10,000. Depth sums price × size within 25 bps of mid on the selected side. Imbalance is (bid depth − ask depth) / total depth.

Returns are logarithmic price changes. One- and five-minute volatility are sample standard deviations of observed returns, without annualization. Early observations may provide too little history.

The compatibility field volatility_percentile is min(100, round(volatility_1m / 0.035 × 100)). It is displayed as a stress index because there is no historical distribution supporting a percentile.

A book walk estimates filled size, average price and slippage for the proposed USD clip. Incomplete fills fail the slippage check. The snapshot cannot guarantee liquidity at execution time.

## Checks

| Check           | Behavior                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Inputs          | Known action, finite values and positive trade size                            |
| Mandate         | Permitted action, venue and pair assets                                        |
| Freshness       | Positive two-sided uncrossed book, at most 15 seconds old                      |
| Position        | Existing spot, supplied pending buys and new purchase fit the cap              |
| Leverage        | Gross exposure divided by conservative equity; positive unverified PnL ignored |
| Loss            | max(0, −(realized today + unrealized PnL)) below the loss cap for new risk     |
| Size            | USD clip fits the order cap                                                    |
| Cash/inventory  | Supplied pending buys/sells reserve balances                                   |
| Hedge           | Short does not exceed positive delta                                           |
| Liquidity       | Selected-side 25 bps depth meets the minimum                                   |
| Slippage        | Complete book walk and impact within the cap                                   |
| Orders/cooldown | Supplied open orders and last confirmed execution limit new risk               |

Defaults are $2,000 position, 2× leverage, $400 daily loss, $300 order size, 25 bps slippage, $1,500 depth, five open orders, a 60-second stale-order timeout and two-second cooldown. These are demo values, not calibrated trading recommendations. Six limits are editable in the UI.

Core pause stops new risk while allowing protective reductions/cancellations. The terminal also disables preparation/signing while paused. Pause cannot retract an already submitted transaction.

The engine checks for changes during inference. Cooldown starts after a paper fill or confirmed execution, not after a rejected proposal.

## Replay accounting

Purchases debit paper cash and add inventory/basis. Sales credit cash, remove inventory and recognize PnL against basis. Positions are marked at book mid; paper cancellation removes fixture orders.

The short hedge uses a spot reference and updates paper short size/delta. It omits actual Perpl collateral, funding, fees, liquidation, competing orders and latency. Paper records contain assumptions and no transaction hashes.

Scenario 4 rejects its hedge under the default slippage and depth limits. The stressed bids sit outside the measured 25 bps depth window, so raising the slippage cap alone does not make the action executable. Its paper hedge uses spot prices and cannot demonstrate a real neutral portfolio.

## Live sale and authority

The Kuru adapter checks chain, bytecode, pair metadata, precision, size bounds, exact calldata simulation and gas. The prepared native MON sale expires after 30 seconds. Minimum USDC output is the stricter of quote tolerance and total slippage from observed mid. Submission rechecks proposal integrity, account/chain, current market and simulation; confirmation checks transaction, receipt and USDC transfers.

Expiry and pause are application preflight checks. Kuru enforces minimum output and fill-or-kill but its direct sell call has no deadline. Reject a wallet prompt left open past expiry. Receipt timeout remains pending; investigate the original hash before resubmitting.

Historical losses, resting orders and perpetual positions are missing from live state. Unattended execution is disabled. Wallet MON includes gas inventory, so leave enough for fees.

Direct sales bypass PolicyGuard. That optional contract has native-unit budgets, pause and expiry, but no Monad deployment or independent audit. Its budgets are not USD loss/exposure limits; see [contract notes](../contracts/README.md).

Before autonomy, index balances, fills, losses and orders; coordinate pending reservations; restrict signing authority; and review custody/execution independently. The local journal also needs an external anchor if independent attestation is required.
