# AI access in Aegis

Jev supplies structured Choice and Noul findings. Scout is Aegis's assistant. It explains those findings together with a captured market observation, wallet balances, the current session mandate and dated news. Scout's recommendation is separate from Jev's relative choice probabilities. Missing evidence remains visible.

Scout uses stateless requests with bounded context and output. It has no transaction tool or automatic provider fallback. Every provider's response passes the same application validation, policy checks and confirmation flow.

An analysis starts only when the user sends a message or asks for an evaluation. Market polling never starts paid inference. News comes from the fixed CoinDesk and Decrypt RSS feeds, cached for fifteen minutes. Articles retain source links, publication dates and retrieval times; coverage is limited to the preceding 72 hours.

## Access and keys

The AI access dialog lets Jev and Scout independently use the project-funded trial, the user's own key, or remain disabled. For Scout user-key access, select Mistral, OpenAI, Anthropic or Google AI before entering that vendor's credential. Changing the vendor clears the previous key and check result. A failed key does not switch to another vendor or project funding.

| Scout vendor | Allowed model | API used |
| --- | --- | --- |
| Mistral | `mistral-small-2603` | Chat Completions with a JSON schema |
| OpenAI | `gpt-4.1-mini-2025-04-14` | Chat Completions with a strict JSON schema |
| Anthropic | `claude-haiku-5-5` | Messages with a JSON schema |
| Google AI | `gemini-3.8-flash` | GenerateContent with a JSON schema |

These choices follow the official [Mistral model](https://docs.mistral.ai/models/mistral-small-4-0-26-03), [OpenAI model](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Claude model](https://platform.claude.com/docs/en/models/haiku-5-5/overview) and [Google model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) documentation. Custom hosts and arbitrary model names are unavailable. Provider/model provenance stays visible in each Scout reply.

Use a standard credential for the selected direct API. For Anthropic, use a key scoped to one Claude workspace: a multi-workspace key needs an additional workspace identifier that this prototype does not accept. AWS Bedrock, Azure, Vertex AI and third-party gateway credentials use different authentication and are unsupported here. See [Claude authentication](https://platform.claude.com/docs/en/api/overview).

**Check key** calls `/api/agent/key-check`, which makes one read-only request for the selected model at that provider's fixed official API. It sends no conversation, wallet evidence or generation prompt. Success means the credential was accepted for model metadata; it does not prove available credit, generation quota or a completed Scout reply. A restricted key may allow generation while denying model lookup, so permission or missing-model results remain inconclusive. Checks have an IP cooldown and make no automatic retry. Raw provider error bodies are never shown.

User keys exist only in React session memory and HTTPS request headers to the same-origin gateway. They are excluded from prompts, conversations, journals, exports, storage and logs, and clear on reload, removal or a funding change. The gateway sends a key only to its selected vendor, rejects redirects and never puts it in a URL. Provider credentials are different from wallet private keys: the app never asks for a recovery phrase.

The hosted project keys are Cloudflare Worker secret bindings. Local project keys belong in the ignored server `.env`. No provider key belongs in a Vite variable, public asset or Git commit. The project provider is selected by server configuration; the dialog shows that provider and model. Public visitor access uses a server-validated Turnstile check, then a signed HttpOnly cookie. Implementation access uses a separate server secret and the implementation allowance.

## Spending

A SQLite-backed Durable Object named `AiBudgetLedger` enforces a lifetime US$10 application allowance. US$2 is reserved for implementation verification and US$8 for public review. It atomically reserves a conservative maximum before each paid provider request and settles verified usage afterward. Unknown usage and uncertain timeouts retain the reservation. Provider calls have no automatic paid retry.

Sponsored Scout access supports the configured Mistral or Google project credential. Requests have an 8,192-token input bound and ask for at most 2,048 output tokens. Mistral's maximum reservation uses those bounds. Google's reservation conservatively covers **67,584 billed output tokens**: a 65,536-token thinking allowance plus 2,048 candidate tokens. It reserves **US$0.259584** including input, then settles verified usage. This avoids relying on the small requested cap while reported GenerateContent behavior remains inconsistent. Standard Mistral rates are US$0.15 per million input tokens and US$0.60 per million output tokens. Google rates are US$0.75 and US$3.75, including thinking output, through 31 December 2026. The pricing guard stops sponsored requests on 1 January 2027 until rates are reviewed. See [Mistral pricing](https://docs.mistral.ai/inference/pricing), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) and the dated [Google output-limit report](https://discuss.ai.google.dev/t/gemini-3-8-flash-high-does-maxoutputtokens-include-thinking-tokens/181077/4). Accounting is conservative application enforcement, not a provider invoice.

A Jev-plus-Scout pipeline counts as one turn. Public sponsored access starts with five turns per visitor per UTC day, ten per IP, one concurrent turn and a twenty-second cooldown. User-key requests reserve no project money and retain abuse protections. Exhausting the sponsored allowance leaves market reads, replay and user-key access available.

The ledger stores accounting and one-time approval identifiers, not conversations, portfolios, policies or keys. Its stable namespace and object name preserve accounting across releases. Local development uses a file-backed transaction adapter under `.local/artifacts/ai`; live verification uses the hosted implementation pool so deployment accounting remains the source of truth.

## Proposals and approval

An agent response can propose a MON reduction, an allowed session policy edit, an existing replay control, or no action. It cannot buy, hedge or place external orders. News and chat text cannot change application permissions.

The server binds a confirmation token to the immutable intent, arguments, wallet, network, policy revision and five-minute expiry. Tokens are consumed once. Typing yes does not approve or sign anything. A policy confirmation applies only the displayed validated change and invalidates a prepared trade.

A sale confirmation checks fresh context and runs real `/api/prepare` simulation. The review shows exact MON, minimum USDC, network, contract, gas, simulation block and a one-second expiry clock. Confirm in wallet performs the final checks and requests explicit signing. Only a matching successful receipt with verified USDC output is a confirmed fill. Receipt timeouts retain the submitted hash.

Agent-originated sale records retain the recommendation reference and omit AI probability fields. Their transaction evidence remains independent of the captured Jev assessment.
