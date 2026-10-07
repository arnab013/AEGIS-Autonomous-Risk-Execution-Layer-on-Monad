# Aegis Hackathon Demo Walkthrough Script

## 3-Minute Live Hackathon Pitch & Narration

### Part 1: Problem & Positioning (0:00 – 0:40)
> "Welcome judges. The biggest problem with autonomous AI trading agents onchain today is trust. You either get a slow, hallucinating LLM connected to a hot wallet, or rigid bot scripts that can't interpret regime changes.
>
> On Monad, blocks finalize in 300 milliseconds. An autonomous agent needs sub-second probabilistic intelligence—without ever compromising capital safety.
>
> That is Aegis: a real-time probabilistic policy and hard risk engine powered by Monad, TypeSafe AI's Jev model, Kuru CLOB, Perpl Perpetuals, and Envio HyperSync."

---

### Part 2: Steady State & Live Telemetry (0:40 – 1:15)
> "In the terminal, you can see live Monad Testnet telemetry at Chain ID 10143 with sub-50ms RPC latency.
>
> On the left, we stream the Kuru MON/USDC Central Limit Order Book with microsecond spread and orderbook imbalance tracking.
>
> In the center, we have our live portfolio exposure: $1,200 of spot MON on Kuru.
>
> On the right is the Jev Policy Engine. Notice Jev is not generating chat text. It produces discrete probability vectors over bounded actions, market regimes, and risk tiers. In this normal market, Jev assigns 74% to range-bound regime, so the system holds capital and incurs zero unnecessary fees."

---

### Part 3: Volatility Shock & Protective Actions (1:15 – 2:00)
> "Now let's switch to Scenario 3: Volatility Shock.
>
> Watch what happens when a sudden sell-side cascade hits the Kuru orderbook. Spread blows out to 28 bps and volatility jumps to the 96th percentile.
>
> Notice the Intelligence Loop: Jev immediately detects a regime shift to high_volatility with 88% probability for cancel_orders. The deterministic engine verifies the mandate and executes an atomic batch cancellation on Monad in 120ms, pulling 3 maker orders off Kuru before they can be adversely filled."

---

### Part 4: Dynamic Hedging on Perpl (2:00 – 2:30)
> "Now in Scenario 4: Downside Turbulence with high spot exposure.
>
> The user mandate specifies: 'Preserve spot MON exposure; do not sell spot into a panic; prefer hedging.'
>
> Jev evaluates the state and assigns 72% probability to `hedge`. The deterministic risk gate confirms limits, and Perpl opens a $1,000 short perpetual hedge.
>
> In one block on Monad, our net delta drops from +$1,800 to +$800. Spot capital is preserved, downside is covered, and every decision is indexed in real-time by Envio HyperSync."

---

### Part 5: The Climax — Hard Risk Gate BLOCKS AI (2:30 – 3:00)
> "Now for the most important demonstration of all: Scenario 5.
>
> What happens if an AI model hallucinates or recommends an unsafe trade?
>
> Here, momentum is strong, and Jev recommends an aggressive position increase. But the user policy has a hard $2,000 maximum exposure limit, and our position is already at $1,950. A $250 clip would push exposure to $2,200.
>
> Look at the terminal: The Hard Risk Gate forcefully BLOCKS the trade! Zero transactions are sent to Monad. The audit log records the exact policy violation.
>
> Even a completely wrong AI decision cannot breach the user's hard invariants.
>
> Jev provides the judgement.
> Deterministic code provides safety.
> Monad provides the speed."
