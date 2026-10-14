# AI access

Jev supplies structured Choice and Noul findings. Scout explains those findings alongside a captured market observation, wallet context, session limits and dated news. Scout's recommendation remains separate from Jev's relative choice probabilities.

Analysis begins with an explicit message or evaluation request. Market polling and replay ticks do not start paid inference. News comes from fixed CoinDesk and Decrypt feeds, cached for fifteen minutes, with publication dates and retrieval times. Missing evidence stays visible.

## Providers and keys

Jev and Scout independently offer project-funded trial, user-key or disabled access. Scout supports these fixed adapters and model identifiers in the current source:

| Provider | Model | API |
| --- | --- | --- |
| Mistral | `mistral-small-2603` | Chat Completions |
| OpenAI | `gpt-4.1-mini-2025-04-14` | Chat Completions |
| Anthropic | `claude-haiku-5-5` | Messages |
| Google | `gemini-3.8-flash` | GenerateContent |

Custom hosts, gateway credentials and arbitrary model names are unavailable. Anthropic keys must be scoped to one workspace. Provider/model provenance appears with each reply. See [verification](verification.md) for the distinction between tested adapters and successful live generation.

Choose a vendor before entering a user key. Changing vendors clears the key and check result. User keys remain in React memory, travel over HTTPS to the same-origin gateway and are sent only to the selected provider's fixed endpoint. They never enter prompts, URLs, journals, exports or persistent browser storage. Reloading, removal or a funding change clears them. Failed user keys never switch vendor or consume project funding.

**Check key** performs a read-only model lookup. It sends no prompt or conversation and does not generate a reply. Acceptance establishes metadata access, not available generation quota. Restricted-key lookup failures can be inconclusive. Checks have an IP cooldown and no automatic retry; raw provider error bodies are not exposed.

Project keys stay in server secrets. Sponsored visitor access requires a server-validated Turnstile challenge and a signed HttpOnly session cookie. Aegis never requests a wallet seed phrase or private key.

## Sponsored allowance

The hosted ledger enforces a lifetime US$10 application allowance, divided into US$2 for implementation verification and US$8 for public trials. A SQLite Durable Object atomically reserves a conservative maximum before each provider call, then settles verified usage. Unknown usage and uncertain timeouts retain reservations. This is application accounting, not a provider invoice.

Reservations use the bounded input/output context and provider-specific billing assumptions in the source. Google reserves for possible thinking output as well as the candidate response. A pricing guard stops sponsorship when its reviewed rate window expires. Model or price changes require reviewing these bounds before release.

A combined Jev/Scout analysis counts as one turn. Trial limits are five turns per visitor per UTC day, ten per IP, one concurrent request and a twenty-second cooldown. Provider calls have no automatic paid retry or provider fallback. Exhausted sponsorship leaves market reads, replay and user-key options available.

The ledger stores accounting, rate-limit state and consumed approval identifiers, without keys, conversations or portfolio evidence. Reuse its namespace and stable object name across deployments. Local Node development uses a persistent file-backed adapter under `.local/artifacts/ai`.

## Proposals and confirmation

Scout can propose a MON reduction, a supported session policy edit, an existing replay control, or no action. It cannot buy, hedge or place external orders. News and chat are untrusted evidence and cannot change permissions.

The server binds each approval to an immutable intent and arguments, wallet, chain, policy revision and five-minute expiry. Approval is single-use. Typing “yes” does not approve or sign. A policy confirmation applies only the displayed valid change and invalidates a prepared trade.

A sale confirmation checks fresh context and calls `/api/prepare`. Review shows exact MON, minimum USDC, network, contract, gas, simulation block and expiry. **Confirm in wallet** performs final checks and opens the user's wallet. A submitted hash remains recorded through receipt timeouts; only a matching successful receipt with verified output establishes a fill.

Agent-originated trade evidence retains its recommendation reference and omits AI probability fields. Captured Jev inputs and original holdings remain immutable and separate from later trade records.
