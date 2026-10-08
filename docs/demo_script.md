# Demo script

Record at most three minutes of actual operation, as required by the [competition rules](https://hackathon.monad.xyz/api/v1/policies/current). This is a recording plan: the signed sale and new gateway's live Jev response are still pending.

## Before recording

Start from the configured F: workspace. Check /api/status, chain, market, freshness and current size limits. Mainnet is the default; the documented testnet market lacked executable bids.

Approve the specific trade/gas and API credits before enabling them. Choose an amount that fits contract precision/minimum, wallet inventory and user limits, leaving MON for gas. If the minimum order fails the mandate, resolve that mismatch before recording.

## Three minutes

| Time      | Action                                                 | Point to explain                                                                 |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 0:00–0:20 | Show the live Kuru market, chain, block/time and depth | The source is the onchain MON/USDC market.                                       |
| 0:20–0:40 | Connect wallet and show balances/limits                | Code checks the mandate; historical orders/losses remain unavailable.            |
| 0:40–1:05 | Request an approved Jev assessment                     | Explain the actual probabilities and uncertainty.                                |
| 1:05–1:25 | Prepare a protective MON sale                          | Review amount, simulation, minimum USDC output, slippage, target and expiry.     |
| 1:25–1:55 | Approve in wallet and show the result                  | Connect the hash to receipt, delivered USDC and refreshed balances.              |
| 1:55–2:25 | Run replay scenario 5                                  | Directional confidence cannot override the position cap.                         |
| 2:25–2:45 | Open decision evidence and journal                     | Show state hash, probability source and checks; the journal is local.            |
| 2:45–3:00 | Explain scope                                          | One reviewed trading workflow works; complete history is needed before autonomy. |

Describe observed output rather than scripting a probability or action. If editing a receipt wait, show the same hash before/after. Submitted, pending, reverted and confirmed must remain distinct.

If the Jev service is disabled, show fallback; heuristic replay does not prove live inference. If no sale is signed, describe the result as preparation/simulation and finish the real execution evidence before submission. Reject a wallet prompt that remains open after the proposal expires.

## Replay examples

| Scenario           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| Steady range       | Balanced evidence and holding                             |
| Bullish expansion  | Directional proposal checked against limits               |
| Liquidity shock    | Thin book, stale orders and paper cancellation            |
| Downside stress    | Hedge proposal blocked by slippage and insufficient depth |
| Oversized proposal | Increase blocked by position cap                          |

For scenario 4, step to the last stress tick with the default limits. Show the failed slippage and depth checks in the evidence panel. The bids lie outside the 25 bps depth window; increasing the slippage cap alone still leaves the liquidity check unsatisfied.

Reset before comparing runs: policy changes carry across scenarios, and fills alter paper balances. Record the state and mandate used.

Show the reason when stale/one-sided data, size limits, inventory, slippage, expiry, wallet changes or unavailable inference blocks action. Save recordings and screenshots on F:. Export writes to .local/artifacts/audit. Keep secrets out of recordings and add final links to the [submission draft](submission.md).
