# Warm design QA

The warm homepage, Scout overview and market/execution workspace passed hosted browser checks again on **12 October 2026 CEST**. Navigation, responsive order, finite motion, reduced-motion behavior, four-provider AI settings and the final market-error colors have been verified.

## Design

The app uses ivory `#F6F3ED`, cream `#FFFEFA`, charcoal `#262522`, muted text `#6F6A61`, terracotta `#B44A34`, butter `#F2DFA5`, peach `#EFE0D4` and sage `#E1E6D9`. Terracotta carries primary actions; pale panels group evidence and context. Numerical terms use tabular figures and status remains explicit.

The homepage tells the product story and shows a real captured dashboard preview. The dashboard puts Scout's conversation beside Jev findings, market context and dated news. AI access lets users choose a supported Scout vendor; each reply shows its provider and model. The execution workspace exposes observations, assessment, policy checks, exact trade terms and outcomes.

Home and Dashboard remain visible in the homepage's top bar at every tested size. Both app pages share a left sidebar with Home, Overview and Market & execution, followed by replay and AI settings. The current page is marked. Narrow screens use a keyboard-accessible Navigation button that opens the vertical menu. Home, Dashboard and browser Back/Forward preserve conversation, wallet context and session policy.

[Frankli](https://getfrankli.com/) informed the staged entrances and interaction transitions. Content enters over 560 milliseconds with a short stagger; cards, buttons and arrows have restrained hover effects. New conversation content receives an entrance without restarting the page on each market refresh. Reduced motion disables these effects and smooth scrolling. Content remains available before an entrance runs.

## Recorded browser checks

The current hosted fixture report at `.local/screenshots/warm-report-887f.json`, observed at **22:03:56 UTC on 11 October / 00:03:56 CEST on 12 October**, passed all three pages on **https://aegis.himaloy2608.workers.dev/**. The checked deployment was **`887fd376-926f-48d8-af51-bf25a23f35fe`**, published on 10 October at 07:11:01 UTC. The report also verifies vendor selection, read-only key-check states and stale-check rejection. The preceding `.local/screenshots/warm-report-0588.json` is historical evidence. These sizes were checked:

| Width × height | Scope                                    |
| -------------- | ---------------------------------------- |
| 1920 × 1080    | Homepage, dashboard, execution workspace |
| 1440 × 900     | Homepage, dashboard, execution workspace |
| 1280 × 800     | Homepage, dashboard, execution workspace |
| 1024 × 768     | Homepage, dashboard, execution workspace |
| 768 × 1024     | Homepage, dashboard, execution workspace |
| 390 × 844      | Homepage, dashboard, execution workspace |
| 360 × 800      | Homepage, dashboard, execution workspace |

There was no horizontal page overflow. Checks covered Home/Dashboard visibility at every width, left-sidebar placement, keyboard entry and compact navigation, native dialog focus and Escape dismissal, independent provider funding, transient keys excluded from storage and cleared on funding/vendor changes, dedicated policy approval, evidence dialogs, exact trade terms, proposal invalidation, intent expiry and replay. Provider settings were checked at every viewport, including pending, accepted, rejected and rate-limited key-check states; an outdated result cannot attach to a newly selected vendor. All current pages and AI settings use the Scout name.

Entrance animations and component transitions were detected on each page. The reduced-motion run recorded zero long animations, zero long transitions, zero hidden content and no smooth scrolling. All 21 full-page captures were inspected for hierarchy, spacing, clipping and responsive order. Desktop and mobile viewport captures, chat approval cards and the mobile sale review were also inspected. Mobile chat precedes secondary context; mobile execution prioritizes the assessment, decision flow and relevant action before market detail.

Every API response in this browser run was intercepted. The screenshots contain labelled fixture market, news and model data. The wallet fixture can connect for interface checks and rejects signing. The run made zero paid inference calls, zero signing attempts and zero external requests, with no browser page errors. Real provider, feed, RPC and transaction results are recorded separately in [verification](verification.md).

Actual populated market screenshots were refreshed separately at **22:06:30 UTC on 11 October** with `scripts/capture-live-ui.mjs` under `.local/screenshots/live-warm`. The homepage's `/dashboard-preview.png` was subsequently refreshed at **22:32 UTC on 11 October / 00:32 CEST on 12 October** from the actual local production dashboard, with a successful real market read and the new Aegis emblem. Inference was disabled and browser writes were blocked; its report is `.local/screenshots/logo-preview/report.json`. These captures do not demonstrate an AI response or signed fill.

## Homepage card spacing

The three capability cards now have cream surfaces, rounded borders and consistent internal padding. Butter, sage and peach badges group their icons. Desktop keeps three equal-height columns with aligned copy; tablet uses horizontal stacked cards, and mobile places the icon above the text. The gap beneath the dashboard preview is smaller.

The production build passed focused layout checks before publishing. The actual hosted update, version **`e6f9d053-1a23-420f-ab5d-bab07f55547c`**, passed the same checks at **22:27:03 UTC on 11 October / 00:27:03 CEST on 12 October** across all seven listed sizes and a 900-pixel tablet width. Internal padding was at least 24 pixels; desktop gaps were 22 pixels, tablet gaps 18 and mobile gaps 16. No document or card overflow occurred. Desktop, tablet and mobile captures were visually inspected. The run blocked API and external requests and made zero AI calls or wallet actions, with no browser page errors. Reports and captures are under `.local/screenshots/homepage-cards` and `.local/screenshots/homepage-cards-live`.

## Aegis brand mark

The generated emblem now replaces the generic brand shield in the homepage header/footer and the overview/execution sidebars. The browser tab icon uses the same Vite-hashed PNG. Visible Aegis text and existing control names supply the accessible label; the adjacent image has an empty alternative to avoid repeating it. The 40-pixel image box reserves its space while loading.

Focused logo checks passed locally and on the actual hosted release **`a5bc843a-ade8-4fde-ba21-a0535ea8bb96`** at **22:35:13 UTC on 11 October / 00:35:13 CEST on 12 October**. All three routes were checked at the seven listed viewports, with loaded images, matching favicon URLs, keyboard focus, accessible names and no overflow. The served PNG matched the generated original byte for byte. Desktop and mobile header, sidebar and footer captures were visually inspected. API and external browser requests were blocked; no inference or wallet actions occurred. Reports and captures are under `.local/screenshots/logo-local` and `.local/screenshots/logo-live`.

## Live trial widget

A separate live probe at **22:04:54 UTC on 11 October / 00:04:54 CEST on 12 October** loaded the official Turnstile script and one challenge frame. At 360 pixels, the native compact iframe measured **150 × 140 pixels** and the dialog's client and scroll widths were both **322 pixels**. The widget and controls were visible without horizontal clipping. The component selects native compact sizing when its panel has less than 300 pixels; the normal size is used with sufficient space. These sizes follow [Cloudflare's widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).

The probe made zero challenge clicks, inference calls, signing attempts or application writes. It verifies loading and layout. The probe blocks secondary challenge requests and cannot establish completion. The preserved current report is `.local/screenshots/trial-widget/report-887f.json`; captures are in the same directory. `scripts/check-trial-widget.mjs` blocks application writes during this check. An earlier navigation timeout was followed by this successful load/layout probe.

On 12 October CEST, the user separately completed visitor verification and confirmed a Scout reply through the project-funded trial. They supplied the actual "Explain my exposure and limits" reply dated **00:06:13 CEST**, with Google model provenance, real Jev findings and explicit disconnected-wallet context. That public-trial success is user-supplied evidence, rather than a browser automation result. Token replay rejection is covered by mocked server tests; the widget probe does not verify it against Cloudflare.

## Final error-state check

A real market failure capture exposed muted text on a dark notice panel. The dashboard now shares the execution workspace's warm notice colors. The final hosted fixture check measured the rendered text contrast at **5.91:1**, above the normal-text threshold of 4.5:1, and captured the failure at desktop and mobile sizes. This color adjustment does not change market retry or trading behavior.
