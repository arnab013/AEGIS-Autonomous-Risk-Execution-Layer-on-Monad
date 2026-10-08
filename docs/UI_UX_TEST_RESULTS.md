# Aegis interface verification

Verified on 8 October 2026, locally and at [aegis.himaloy2608.workers.dev](https://aegis.himaloy2608.workers.dev). The redesigned app was deployed through the managed Cloudflare connector. The final hosted browser run passed.

The full suite passed **351 tests across 13 files**. Type checking and the production build passed; Vite processed 476 modules. The storage audit reported zero violations. Project artifacts, controlled caches, temporary files and the browser profile stayed under `F:\Projects\Monad Metropolis`. This describes the project's controlled writes, rather than every Windows or application-level write.

Both Replay and Live were captured at each size below, on localhost and the hosted app. All checks passed without page-level horizontal overflow. Prepared trade amounts also fit the 360-pixel viewport.

| Viewport    | Local Replay / Live | Hosted Replay / Live |
| ----------- | ------------------- | -------------------- |
| 1920 × 1080 | Passed              | Passed               |
| 1440 × 900  | Passed              | Passed               |
| 1280 × 800  | Passed              | Passed               |
| 1024 × 768  | Passed              | Passed               |
| 768 × 1024  | Passed              | Passed               |
| 390 × 844   | Passed              | Passed               |
| 360 × 800   | Passed              | Passed               |

Keyboard checks covered the four decision stages and both assessment and manual-trade evidence dialogs. An early Tab-containment check found a defect; it was fixed before the final runs. Escape dismissal, Tab/Shift+Tab containment and focus return then passed. Replay isolation, blocked proposals, journal filters, wallet-change invalidation and invalid raw policy inputs also passed. The final hosted report contains no page errors, console errors or unresolved checks.

Unit and server-rendered presentation tests cover captured pre-fill inputs, isolation from later market updates, cached fallback provenance, manual/AI evidence separation, exact historical proposal terms, applicable policy checks, invalid inputs, expiry, signing invalidation and receipt timeouts that retain the submitted hash. These tests use deterministic scenarios and intercepted provider responses; they do not validate paid model quality or establish a signed fill.

The browser runs used actual same-origin Kuru/Monad market and balance reads. A separate hosted API probe also prepared a **200 MON** mainnet sale: estimated output **4.888 USDC**, minimum output **4.868933 USDC**, gas estimate **297,139**, simulation block **111690705**. The real `eth_call` and gas estimation passed. A public account was used only as the simulation sender; no wallet signature was requested.

The browser's proposal tests were separate intercepted fixtures. Their market, portfolio, RPC and preparation responses were supplied by the test. They verified manual evidence, input-change invalidation, readable exact amounts and expiry while a market response was held. They did not perform a real simulation. The cancelled-evaluation fixture made zero model requests. None of these verification runs made paid inference calls or signed transactions.

Reports and representative captures are local artifacts:

The previous address was updated only after the new hostname passed verification. GET/HEAD HTML navigation redirects preserve the path and query, while old-host status, market, read-only RPC and preparation requests still work. The original JavaScript and CSS assets matched their saved SHA-256 hashes. The previous Worker version remains available for rollback.

- [Local browser report](../.local/screenshots/redesign/report.json) and [hosted browser report](../.local/screenshots/redesign-hosted/report.json)
- [Hosted replay desktop](../.local/screenshots/redesign-hosted/replay-1440x900-viewport.png) and [hosted live mobile](../.local/screenshots/redesign-hosted/live-390x844-viewport.png)
- [Blocked-action evidence](../.local/screenshots/redesign-hosted/blocked-evidence.png) and [intercepted mobile trade review](../.local/screenshots/redesign-hosted/intercepted-proposal-360x800.png)
- [Hosted read and simulation proof](../.local/artifacts/rollout-readiness.json)

These ignored files are available in the working checkout on F:, not in the public GitHub source or at the live site. The runs used Chromium through the installed Edge browser. They are focused interaction and layout checks, not a complete screen-reader, cross-browser or WCAG 2.2 AA audit. Paid Jev validation and signed Monad execution remain separate outstanding verification work.
