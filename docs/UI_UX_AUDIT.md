# Aegis interface review

Reviewed on 8 October 2026 against the supplied Precision Intelligence proposal. This is a review of the current interface and a recommendation for the redesign. The application source was not changed.

The direction fits Aegis. Its strongest contribution is a clear, inspectable path from observation to assessment, policy checks and outcome. Keep the Aegis name and concentrate the MVP around that path and exact trade review.

## Current experience

Fresh captures used the existing production build at localhost, with inference disabled. No wallet was connected and no transaction was signed. Screenshots and the capture report are under `.local/screenshots/design-review/` on F:.

| Step | Screen                        | Assessment                                                                                                                                                                                                                  |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Replay workspace              | Working scenario controls and explicit synthetic-data labels. Seven mandate inputs and dense metadata compete with the assessment. The header's green mainnet indicator is confusing while the active view is replay.       |
| 2    | Oversized action and evidence | The proposal is blocked and names the breached position limit. This is a strong demonstration of Aegis. The evidence overlay is visually busy, has no dialog role, and did not dismiss with Escape.                         |
| 3    | Live market workspace         | A real Kuru book loads without a wallet. The fallback panel displays “Confidence: 64%” and probability bars despite stating that no model inference occurred. The protective sale sits below three equally weighted panels. |
| 4    | Live mobile workspace         | No page-level horizontal overflow at 390 × 844. The full page is 3,315 pixels tall, and the assessment and protective sale appear late. The design needs a different mobile content order.                                  |

### 1. Replay workspace

![Current replay workspace](../.local/screenshots/design-review/01-replay-desktop.png)

### 2. Blocked action evidence

![Current blocked-action evidence](../.local/screenshots/design-review/02-blocked-evidence.png)

### 3. Live market workspace

![Current live market workspace](../.local/screenshots/design-review/03-live-desktop.png)

### 4. Live mobile workspace

![Current live mobile workspace](../.local/screenshots/design-review/04-live-mobile.png)

## Recommended changes

Start with the decision flow, readable typography, quieter surfaces and progressive disclosure. Put the current assessment, applicable policy result and relevant action before advanced controls. Use dark blue-gray surfaces and a restrained mint accent; retain Aegis branding.

Each decision flow must refer to one captured observation. Current market polling updates the market while retaining the previous assessment. A connected flow must preserve the original input snapshot and timestamp rather than imply that an older assessment used the latest price.

Make the protective sale's user-initiated origin explicit. Its preparation and simulation currently work independently of Jev. Show exact MON input, minimum USDC output, proposal freshness and signing requirement together. Keep proposed, submitted, pending, reverted and confirmed outcomes distinct.

Show “AI assessment unavailable” without model confidence or probability bars when inference did not run. For genuine Jev results, explain that the numbers describe a choice distribution rather than a probability of profit. Keep heuristic replay probabilities visibly separate.

Use one workspace for now. Additional routes, historical chart timeframes and replay scrubbing need real supporting functionality. Add the Signal Ribbon only when inspecting recorded events helps the user. Policies currently apply immediately in the browser; Save/Cancel would require draft state and a clear persistence contract.

Fix dialog semantics, accessible control names, Escape dismissal, focus containment and focus return. Increase supporting-text readability and touch-target sizes, then check the redesigned flow with keyboard and mobile interactions.

## Verification limits

The capture covered desktop at 1440 × 900 and mobile at 390 × 844. Replay selection, a policy-blocked step, evidence opening and live-market switching worked. No page errors were observed. Escape dismissal failed, and no dialog role was found. This was a focused review, not a full accessibility or browser-compatibility audit. The remaining viewport sizes in the proposal were not checked in this run.

This review records the interface before the redesign. The later implementation is described in [design notes](UI_UX_DESIGN.md) and [redesign verification](UI_UX_TEST_RESULTS.md). A complete competition demonstration still needs a validated real Jev assessment and appropriate real transaction evidence; visual polish cannot supply either.
