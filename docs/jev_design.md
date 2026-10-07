# Jev design

Jev evaluates bounded uncertainty; deterministic code performs calculations and enforces the mandate. The model cannot submit arbitrary calldata, change user limits or sign a wallet transaction.

The integration follows [TypeSafe's official System One API](https://docs.typesafe.ai/api): POST https://api.typesafe.ai/v1/systemone with server-side Bearer authentication, typed questions, state and model. The gateway pins the model to jev-latest and builds its own questions. The browser cannot choose an upstream URL, authorization header or unrestricted prompt.

## Questions

| Question | Type | Bounded output |
| --- | --- | --- |
| action | Choice | increase_position, reduce_position, hold, hedge, cancel_orders |
| regime | Choice | trending_up, trending_down, range_bound, high_volatility, liquidity_stress, uncertain |
| risk | Choice | very_low, low, moderate, high, critical |
| anomaly | Noul | Probability of anomalous supplied market state |
| cancel_orders | Noul | Probability that existing resting orders need cancellation |

The action list describes a risk assessment. Live execution supports only an explicitly requested protective MON sale. A hedge or cancellation recommendation does not establish a working Perpl or resting-order execution integration.

Compact state includes book statistics, recent observed returns, wallet/portfolio fields available to the engine, supplied orders, risk metrics and the user policy. Selected fields are rounded for stable transport. Raw current state remains the source for deterministic checks. A canonical sorted JSON state hash binds evidence to the assessed payload.

Live history starts when the application observes the market. Trade-flow history, realized loss, resting orders and perpetual positions are not indexed. Current live flow fields are zero; this means unavailable flow evidence, not verified absence of trading. The historical field named volatility_percentile is a fixed scaled stress index, not a calibrated percentile.

## Response validation

The parser requires model identity, all expected typed answers, exactly the permitted option names, finite probabilities in [0, 1], and a distribution totaling one within 0.01 rounding tolerance. It checks that the chosen option matches a maximum probability and normalizes only accepted rounding noise. Missing fields are rejected rather than manufactured.

[TypeSafe Choice confidence](https://docs.typesafe.ai/confidence) uses:

~~~text
model confidence = (p_max - 1/n) / (1 - 1/n)
~~~

The model-reported confidence is kept separately from these Aegis statistics:

~~~text
normalized entropy H = -sum(p * log2(p)) / log2(n)
top-two margin = p_1 - p_2
Aegis composite = 0.40*p_1 + 0.35*(1-H) + 0.25*(p_1-p_2)
~~~

The parser validates reported confidence as a probability; it does not independently attest the upstream model or recompute its reported field. The composite is an application heuristic, not the official model confidence or a profitability probability.

The application abstains to hold when entropy exceeds 0.85, margin is below 0.12, maximum probability is below 0.35, or official action confidence is below 0.65. Anomaly probability at least 0.7, or combined high/critical risk at least 0.6, suppresses an increase. Existing-order cancellation probability at least 0.75 may select cancellation despite uncertain direction; live cancellation remains unavailable.

## Transport, provenance and failure

Paid calls require TYPESAFE_API_KEY and explicit JEV_ENABLE_LIVE=true after credit usage is approved. The gateway applies an eight-second upstream timeout, one in-flight call and a 1.5-second cooldown. It does not provide public authentication or a complete spending quota.

The adapter's optional cache uses state hash, schema version, mode and model, with a ten-second TTL and a bounded entry count. Cached records preserve their original source. The terminal disables live cache. Fallback results are not cached as model responses.

Replay invokes deterministic heuristics and labels them heuristic/simulated. Live inference is requested by the user, not continuously billed by market polling. A disabled service, HTTP error, timeout or invalid response produces an explicit fallback, ordinarily hold; stale-order cancellation is a safe paper behavior where applicable. It must not produce an additional-risk live trade. State changes during inference invalidate acceptance of the assessed state.

## Evidence still needed

No paid official response has been captured in this development session. Parser tests exercise response fixtures; they are not proof of a successful TypeSafe call. Before submission, preserve one authorized response with model, source, timing, state hash and probabilities, excluding the key.

The strongest demonstration shows contradictory evidence, explicit abstention and a deterministic blocked proposal. Compare decisions against a simple deterministic baseline on labeled scenarios before claiming that Jev improves decisions. Neither fixture behavior nor entropy establishes prediction accuracy or trading returns.
