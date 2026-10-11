# Jev design

Jev assesses a small set of actions from structured market and portfolio state. Code calculates the statistics and checks trading limits; the model cannot change those limits or sign a transaction.

The gateway follows [TypeSafe's System One API](https://docs.typesafe.ai/api): POST https://api.typesafe.ai/v1/systemone with Bearer authentication, state, model and typed questions. The shared agent workflow pins `jev-1.13.0` and fixed questions. Project credentials stay on the server. An optional user key travels only in a same-origin HTTPS header and stays in browser memory. The browser cannot select an arbitrary upstream URL or replace the fixed questions.

## State and questions

| Question      | Type   | Output                                                                                |
| ------------- | ------ | ------------------------------------------------------------------------------------- |
| action        | Choice | increase_position, reduce_position, hold, hedge, cancel_orders                        |
| regime        | Choice | trending_up, trending_down, range_bound, high_volatility, liquidity_stress, uncertain |
| risk          | Choice | very_low, low, moderate, high, critical                                               |
| anomaly       | Noul   | Probability that supplied market state is anomalous                                   |
| cancel_orders | Noul   | Probability that existing orders need cancellation                                    |

A Jev finding can exceed the implemented execution options. Live supports a reviewed MON sale; live hedging and resting-order cancellation are unavailable. Scout combines Jev findings with the captured market, wallet, mandate and dated news to propose a supported action. Its vendor can be selected for user-key access; this does not replace Jev's typed findings. Scout's recommendation remains separate from Jev probabilities and requires a dedicated confirmation. No model can sign a transaction.

State includes book statistics, observed returns, available portfolio fields, supplied orders, risk metrics and policy. Some values are rounded for transport. Deterministic checks use current raw state. A hash of canonical sorted JSON identifies the exact assessed payload. Captured observations, original holdings and evaluation timestamps stay immutable as the visible market refreshes or a later paper fill changes balances.

Live history begins when observation starts. Flow, realized losses, resting orders and perpetual positions are not indexed. Zero live flow fields indicate missing evidence, not verified inactivity. The field volatility_percentile is a scaled stress index, not an empirical percentile.

## Validation and uncertainty

State is validated before a paid request. Responses must contain model identity, expected answer types/options, finite probabilities in [0, 1], distributions summing to one within 0.01, and a selected option matching a maximum. Accepted rounding noise is normalized; missing fields fail validation.

[TypeSafe Choice confidence](https://docs.typesafe.ai/confidence) is:

```text
model confidence = (p_max - 1/n) / (1 - 1/n)
```

Aegis also calculates:

```text
normalized entropy H = -sum(p * log2(p)) / log2(n)
top-two margin = p_1 - p_2
composite score = 0.40*p_1 + 0.35*(1-H) + 0.25*(p_1-p_2)
```

Reported model confidence is validated as a probability but not independently attested or recomputed. The composite is an application heuristic; none of these measures predicts profit.

The application selects hold if entropy exceeds 0.85, margin is below 0.12, maximum probability is below 0.35, or model action confidence is below 0.65. Anomaly at least 0.7 or combined high/critical risk at least 0.6 suppresses an increase. If orders exist, cancellation probability at least 0.75 can select cancellation despite uncertain direction.

## Requests and failure handling

The shared gateway requires `AI_ENABLED`, a validated inference session and the persistent budget ledger. Project-funded calls use the server TypeSafe secret; user-key calls use the supplied key without switching to sponsorship on failure. The approved US$10 allowance reserves US$2 for implementation and US$8 for public review. The SQLite ledger reserves costs before a request, settles verified usage and retains uncertain reservations. Visitor/IP limits, one concurrent turn and a twenty-second cooldown are enforced. Jev requests time out after eight seconds and have no automatic paid retry. See [AI access](ai_access.md).

`JEV_ENABLE_LIVE` belongs to the legacy local adapter and stays false for this shared workflow. The hosted Worker no longer hard-disables inference; server secrets, validated sessions and persistent spending enforcement control access.

The optional adapter cache is keyed by state hash, schema, mode and model, with a ten-second TTL and bounded entries. It preserves source labels; fallback is not cached as model output. The terminal disables live caching.

The agent pipeline can reuse a server-signed Jev receipt only after checking visitor identity, context, payload/response/capture hashes and its sixty-second validity. An arbitrary client-supplied assessment cannot become model evidence. An unavailable assessment remains visibly unavailable without model probability bars.

Replay's built-in evaluations use labelled local heuristics without API calls. Explicit chat analysis can send labelled replay context to the enabled providers, but cannot turn a paper result into a chain observation. Live assessments are requested by the user. Disabled service, HTTP errors, timeout or invalid output produce labelled unavailable/fallback evidence, normally hold; stale-order cancellation may apply in paper mode. A changed state invalidates an in-flight assessment.

A standalone real request passed on 9 October at 18:30:13 UTC with model `jev-1.13.0`, validated Choice/Noul answers and a signed receipt. Its exact input and probabilities are saved in `.local/artifacts/jev-release-verification.json`. The context used a real market observation with a disconnected zero-equity portfolio, so it verifies the API path and provenance without establishing wallet-specific judgment quality.

The real Jev-plus-Scout pipeline then passed on **12 October at 00:04:02 CEST in Paris** (11 October at 22:04:02 UTC), using Jev `jev-1.13.0` and Google-backed Scout. Its immutable capture preserves the real Kuru book, original input, findings and provenance; the disconnected wallet is explicitly unavailable. Scout proposed lowering session slippage from 25 to 10 bps. Dedicated approval succeeded, while stale and duplicate approval returned HTTP 409. No wallet signing occurred. This verifies the evidence and policy-confirmation workflow, rather than wallet-specific judgment or a confirmed sale. The sanitized artifact is `.local/artifacts/ai-release-verification.json`. The [verification report](verification.md) separates these results from older provider attempts and an inherited baseline test's request. Exclude secrets from evidence and recordings.

To establish Jev's value, compare decisions on labeled ambiguous scenarios with a simple deterministic baseline. Parser fixtures and uncertainty measures alone do not establish decision quality.
