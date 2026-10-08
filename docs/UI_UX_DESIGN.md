# Aegis design direction

Proposal review, 8 October 2026. This records the recommended scope; the full redesign has not been implemented.

The supplied Precision Intelligence brief fits Aegis. Its strongest idea is making a decision inspectable from observation through outcome. Keep the Aegis name and one focused workspace, then use the calmer surfaces, clearer typography and restrained accent colors from the proposal.

## The main experience

A visitor should understand three things quickly: what the market shows, what the assessment suggests, and what they would sign. Market reads and replay remain available before wallet connection.

Put the decision flow near the assessment: observation → assessment → policy checks → outcome. Every stage must belong to the same snapshot or proposal. Stage details show actual inputs, model source, applicable limits and the recorded result. A live protective sale is user initiated and can be prepared without Jev; do not imply that a separate assessment caused or authorized it.

Make prepared, awaiting wallet, submitted, pending, reverted and confirmed visibly distinct. Keep MON amount, minimum USDC output, network, contract and freshness beside the wallet action. Passing a local check does not mean a transaction has been submitted or confirmed.

## Layout and controls

Use a quiet header for market, network, Live/Replay, data freshness and wallet state. Give the market and assessment most of the desktop workspace. Put trade review within reach of the assessment. A narrow navigation rail is useful only if there are enough real destinations; the current MVP does not need seven pages.

Prioritize trade size, exposure cap and slippage. Reveal advanced limits progressively while retaining a visible mandate summary. Save/Cancel would require draft state and an honest persistence contract: policies currently apply in the browser and do not survive a reload.

On mobile, show current context, the assessment and relevant action early. Expand the order book, advanced policy controls and history on demand. The current rendered page passes overflow checks but makes users scroll through many controls and panels before reaching the live action.

Use one readable interface font and a complementary numeric face, tabular numbers, clearer section titles and visible keyboard focus. Reduce the repeated uppercase labels and tiny monospace metadata. Test evidence dialogs for Escape, focus return and keyboard containment; screenshots alone do not establish accessibility compliance.

## Evidence and unavailable states

Keep Live, synthetic Replay, heuristic assessments and unavailable inference unambiguous. Model probabilities describe a choice distribution, rather than the chance a trade will profit. Fallback should lead with “AI assessment unavailable” instead of presenting its default numbers as model confidence.

The live chart holds up to 60 prices observed during the session. It has no historical candles, indexed volume or historical timeframes. Improve its labels and inspection before adding a chart SDK or unsupported selectors.

Historical loss, complete external positions, resting orders and trade flow remain unavailable. Do not present their placeholder zeros as evidence of low risk. Live execution supports a protective MON sale; the replay short hedge is simulated.

## Delivery order

1. Add the decision flow and contextual evidence using existing state and events.
2. Improve the mandate hierarchy and exact transaction review.
3. Refine typography, surfaces, spacing, responsive layouts and keyboard interactions.
4. Add a signal ribbon only when it helps inspect real recorded events. Replay scrubbing needs consistent restoration of both engine state and paper fills before it can be exposed.

Keep the existing financial logic and verified adapters. Judge the redesign against a working demo: inspect the real Kuru market, prepare a protective sale, review its exact terms, then switch visibly to replay and inspect an oversized proposal blocked by policy.
