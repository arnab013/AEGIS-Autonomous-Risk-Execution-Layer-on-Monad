# Jev / TypeSafe AI Decision Layer Design

## Why Jev?
Most "AI trading bots" connect an unconstrained Large Language Model (e.g. GPT-4) to a chatbot interface and prompt it to "predict the price" or generate text trades. This approach fails in production finance:
1. **High Latency**: 2–5 second text streaming cannot keep pace with high-speed blockchains like Monad (~300ms block time).
2. **Hallucination Risk**: Unconstrained text generation cannot guarantee type safety or bound risk parameters.
3. **Flawed Arithmetic**: LLMs frequently make simple numerical calculation errors on financial calculations like volatility or leverage.

**Jev / TypeSafe AI** is fundamentally different:
- It is a **"System One" typed decision model**.
- It does not generate prose; it evaluates a structured state against **bounded, typed questions** and emits discrete probability distributions.
- Sub-second inference (~40–80ms) matches Monad's high-throughput architecture.

---

## Bounded Decision Schema

### Question A: Action
Which permitted action is most appropriate given the market and portfolio state?
- `increase_position`
- `reduce_position`
- `hold`
- `hedge`
- `cancel_orders`

### Question B: Market Regime
What structural regime does the current orderbook flow exhibit?
- `trending_up`
- `trending_down`
- `range_bound`
- `high_volatility`
- `liquidity_stress`
- `uncertain`

### Question C: Risk Level
What is the assessed risk level under current volatility and exposure?
- `very_low`
- `low`
- `moderate`
- `high`
- `critical`

### Questions D & E: Anomaly & Order Management
- `P(anomaly)`: Is order flow anomalous relative to baseline?
- `P(cancel_orders)`: Should resting maker orders be purged?

---

## Uncertainty & Information Entropy

A key requirement is: **NEVER blindly follow the top answer**.

Aegis calculates information-theoretic confidence metrics:
$$H_{\text{norm}} = -\frac{\sum_{i=1}^K p_i \log_2(p_i)}{\log_2(K)}$$
$$\text{Margin} = p_{(1)} - p_{(2)}$$

```typescript
const confidenceScore = (p1 * 0.4) + ((1 - H_norm) * 0.35) + (Margin * 0.25);
```

### Abstention Invariant:
If $H_{\text{norm}} > 0.85$, $\text{Margin} < 0.12$, or $p_1 < 0.35$:
- **The system abstains** from aggressive action.
- Defaults to a zero-risk `hold`.
- Displays the confidence deficit in the terminal UI.

---

## State Serialization & Caching
- **Compact Payload**: Caps decimals to 2-4 places, resulting in payload sizes under 250 tokens.
- **Deterministic Hashing**: Hashes normalized payload + question version (`st_xxxxxxxx`).
- **Cache Hit**: Instant replay/simulation evaluation with zero redundant API calls.
- **Fail-Safe Fallback**: If the network times out or the remote API is unreachable, the client safely emits `fallback` state that permits zero new risk and retains emergency de-risking capability.
