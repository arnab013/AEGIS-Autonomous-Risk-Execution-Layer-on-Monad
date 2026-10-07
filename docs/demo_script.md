# Actual-operation demo script

The competition requires a public demo of at most three minutes showing actual operation and Monad interactions. The sequence below is a recording plan, not evidence that signing or paid inference has already occurred.

## Prepare

Run the app from F: with the storage environment. Check /api/status, configured chain, market address, current timestamps and exact market limits. Mainnet observation is the default. The documented testnet market lacked bids during development; use testnet execution only if a current valid executable market exists.

A real mainnet demonstration needs the user's approval for the specific transaction and gas. A live Jev call needs approval for API credits before JEV_ENABLE_LIVE is enabled. No such transaction or paid response has been performed in this session.

Choose an amount that fits current contract minimum/precision, available MON, order cap and liquidity/slippage limits. Keep MON for gas. Do not reuse a fixed USD price or invent liquidity. If a minimum-size order fails the user's mandate, preserve the failure and resolve it explicitly before recording.

## Three-minute sequence

| Time | Screen and action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Live market, chain and source; show actual block/time and two-sided depth | “Aegis reads this Kuru MON/USDC market on Monad.” |
| 0:20–0:40 | Connect wallet; show real balances and editable limits | “The user's mandate is checked in code. These balances come from chain; historical orders and losses are not yet indexed.” |
| 0:40–1:05 | Request one authorized Jev assessment; show model/source and actual probabilities | Explain the current output and uncertainty, using observed values rather than scripted probabilities. |
| 1:05–1:25 | Explicitly prepare a protective MON sale | Show exact amount, simulation, minimum USDC output, slippage, target and expiry. |
| 1:25–1:55 | User reviews and approves in wallet; show real hash, receipt and output | “Submitted” becomes “confirmed” only after matching chain evidence. Show refreshed balances and delivered USDC. |
| 1:55–2:25 | Switch to labeled replay scenario 5 and evaluate | “This synthetic bullish proposal breaches the position cap. The gate rejects it before any wallet request.” |
| 2:25–2:45 | Decision evidence and project-local journal | Explain probability source, state hash, failed/passed checks and local journal provenance. |
| 2:45–3:00 | Final scope | “This is one working, wallet-reviewed risk workflow. Complete historical indexing is required before unattended trading.” |

If a receipt takes longer, edit the wait transparently and keep the same transaction hash visible. Do not substitute a simulated hash, show a prepared proposal as execution, or convert pending into confirmed.

If paid inference remains disabled, show unavailable/fallback honestly. A replay heuristic cannot serve as evidence of a live Jev response. A complete submission still needs the intended real end-to-end evidence.

## Repeatable replay demonstrations

| Scenario | What it demonstrates |
| --- | --- |
| Steady range | Balanced synthetic evidence and holding behavior |
| Bullish expansion | A directional heuristic proposal, checked against current mandate |
| Liquidity shock | Thin-book/stale-order evidence and paper cancellation |
| Downside stress | Protective hedge proposal; default slippage may block it |
| Oversized proposal | Strong synthetic direction cannot override the position cap |

For scenario 4, step to the final stress tick with default 25 bps slippage to show rejection. If demonstrating a paper hedge, explicitly raise slippage to 50 bps and evaluate a $250 clip with all other limits satisfied. The result is a bounded paper hedge, not live Perpl execution or complete portfolio neutralization. Restore the mandate after the demonstration.

Reset replay before comparing outcomes. Limits carry into later scenarios and paper fills change the ledger; record the policy and state used for each comparison. Do not promise a fixed action on every tick.

## Failure evidence and recording

Show the actual reason when one-sided data, insufficient inventory, market minimums, slippage, expired proposals, changed wallet/network or unavailable inference blocks the flow. Pause should stop preparation/signing; stale data should stop execution. Keep the result visible and explain the limitation.

Save source evidence, screenshots and recordings only under the project F: directory. The audit Export control writes via the server to .local/artifacts/audit. Never include API keys, seed phrases or private keys. Before publication, add app, repository and video links to [submission](submission.md) and verify registered-project track/bounty rules.
