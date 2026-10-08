# Jev design

Jev assesses a small set of actions from structured market and portfolio state. Code calculates the statistics and checks trading limits; the model cannot change those limits or sign a transaction.

The gateway follows [TypeSafe's System One API](https://docs.typesafe.ai/api): POST https://api.typesafe.ai/v1/systemone with Bearer authentication, state, model and typed questions. It uses jev-latest and fixed questions. The browser supplies neither the key nor an arbitrary upstream URL or prompt.

## State and questions

| Question      | Type   | Output                                                                                |
| ------------- | ------ | ------------------------------------------------------------------------------------- |
| action        | Choice | increase_position, reduce_position, hold, hedge, cancel_orders                        |
| regime        | Choice | trending_up, trending_down, range_bound, high_volatility, liquidity_stress, uncertain |
| risk          | Choice | very_low, low, moderate, high, critical                                               |
| anomaly       | Noul   | Probability that supplied market state is anomalous                                   |
| cancel_orders | Noul   | Probability that existing orders need cancellation                                    |

A recommendation can exceed the implemented execution options. Live currently supports a user-requested protective MON sale; live hedging and resting-order cancellation are unavailable.

State includes book statistics, observed returns, available portfolio fields, supplied orders, risk metrics and policy. Some values are rounded for transport. Deterministic checks use current raw state. A hash of canonical sorted JSON identifies the assessed payload.

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

Paid inference requires TYPESAFE_API_KEY and JEV_ENABLE_LIVE=true after credit approval. The server allows one in-flight call, applies a 1.5-second cooldown and times out after eight seconds. Public authentication and a complete spending quota remain deployment work.

The optional adapter cache is keyed by state hash, schema, mode and model, with a ten-second TTL and bounded entries. It preserves source labels; fallback is not cached as model output. The terminal disables live caching.

Replay uses labeled local heuristics without API calls. Live assessments are requested by the user. Disabled service, HTTP errors, timeout or invalid output produce fallback, normally hold; stale-order cancellation may apply in paper mode. A changed state invalidates an in-flight assessment.

The new gateway has not yet been validated through an approved paid response. The [verification report](verification.md) records an inherited baseline test's earlier API request separately. Capture model, source, timing, state hash and probabilities from the new path before submission, excluding secrets.

To establish Jev's value, compare decisions on labeled ambiguous scenarios with a simple deterministic baseline. Parser fixtures and uncertainty measures alone do not establish decision quality.
