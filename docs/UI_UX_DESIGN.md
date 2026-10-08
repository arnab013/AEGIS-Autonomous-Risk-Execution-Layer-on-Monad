# Aegis design direction

Implemented design, 8 October 2026. The workspace follows the supplied Precision Intelligence brief while keeping the MVP focused.

The main idea is making a decision inspectable from observation through outcome. Aegis keeps one workspace, dark blue-gray surfaces, readable system typography and a restrained mint accent. The existing React components and CSS supply the interface; no component library was added.

## The main experience

The decision flow is observation → assessment → policy checks → outcome. Its four keyboard-accessible stages expand to show captured inputs, assessment provenance, available checks and the actual result. An immutable snapshot retains the pre-execution payload and observation time while current market reads continue refreshing.

A live protective sale is labelled “User requested MON reduction”. It has its own proposal, checks and transaction record, independent of the assessment. Manual journal events retain exact proposal terms without AI statistics; older journal records remain readable.

Prepared, awaiting wallet, submitted, pending, reverted, confirmed and stopped states are distinct. Trade review retains exact MON amount, estimated and minimum USDC output, slippage, network, contract, simulation block, gas estimate and expiry. Expiry updates every second independently of market polling. A receipt timeout retains the submitted hash and allows a read-only confirmation retry before another sale can be prepared.

## Layout and controls

The header shows current context, actual network, Live/Replay, freshness and wallet state. On desktop, the decision flow spans the workspace above market and portfolio on the left, with assessment and trade review on the right. Mandate controls and the journal follow. Narrow layouts order assessment, decision flow and relevant action before market details.

Trade size, position cap and slippage remain visible. Other limits expand on demand. Valid edits apply immediately for the session; invalid values show field errors and block evaluation, preparation and signing. Every edit invalidates a prepared proposal. Policies reset on reload, as the interface states.

The order book, advanced controls and journal entries expand on demand. Exact trade terms wrap inside the viewport instead of truncating amounts. System fonts, tabular numbers, clear section titles and visible keyboard focus keep the interface readable without downloading fonts.

Evidence uses a labelled native dialog with Escape dismissal, explicit Tab/Shift+Tab containment, focus return and viewport scrolling. Browser verification supplements screenshots; it does not establish full accessibility compliance.

## Evidence and unavailable states

Live observations, synthetic replay, heuristic assessments and unavailable inference remain distinct. Provenance uses the original assessment origin when a result came from cache. Fallback shows “AI assessment unavailable” with its reason and no confidence or probability bars. Genuine model values are labelled relative choice probabilities; they do not predict profit or authorize a trade.

The live chart holds up to 60 prices observed during the session. It has no historical candles, indexed volume or historical timeframes. Historical loss, complete external positions, resting orders and trade flow remain unavailable. Their placeholder zeros are not evidence of low risk. Live execution supports a protective MON sale; the replay short hedge is simulated.

## Deferred scope

Extra routes, historical chart controls, replay scrubbing and the Signal Ribbon remain deferred. Each needs supporting product behavior beyond this redesign. Paid Jev inference stays disabled and wallet signing requires an explicit user action.

The [verification notes](UI_UX_TEST_RESULTS.md) separate actual market reads and simulation from intercepted browser fixtures. The [earlier audit](UI_UX_AUDIT.md) records the interface before these changes.
