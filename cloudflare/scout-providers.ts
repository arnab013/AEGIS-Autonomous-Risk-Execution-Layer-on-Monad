import type { ScoutProvider } from '../src/ai/types.ts';
import { editablePolicyKeys } from '../src/ai/validation.ts';

export const SCOUT_MODELS: Record<ScoutProvider, string> = {
  mistral: 'mistral-small-2603',
  openai: 'gpt-4.1-mini-2025-04-14',
  anthropic: 'claude-haiku-5-5',
  google: 'gemini-3.8-flash',
};

export const SCOUT_PROVIDERS = Object.keys(SCOUT_MODELS) as ScoutProvider[];
export const SCOUT_MAX_INPUT_TOKENS = 8192;
export const SCOUT_MAX_OUTPUT_TOKENS = 2048;
// Reserve Google's full advertised output ceiling; settlement includes any hidden thinking output.
export const GOOGLE_RESERVED_THOUGHT_TOKENS = 65_536;
export const GOOGLE_RESERVED_OUTPUT_TOKENS =
  GOOGLE_RESERVED_THOUGHT_TOKENS + SCOUT_MAX_OUTPUT_TOKENS;
export const SCOUT_TIMEOUT_MS = 60_000;

// Standard text rates, including Google's thinking output, checked on 10 October 2026.
// Stop sponsored requests before the documented Google price change on 1 January.
export const SCOUT_PRICING_EXPIRES_AT = Date.parse('2027-01-01T00:00:00Z');
const sponsoredRates = {
  mistral: { input: 0.15, output: 0.6 },
  google: { input: 0.75, output: 3.75 },
} as const;

export function scoutMaximumCost(provider: ScoutProvider): number {
  if (!(provider in sponsoredRates)) throw new TypeError('This provider requires your own key');
  const rate = sponsoredRates[provider as keyof typeof sponsoredRates];
  const outputBound =
    provider === 'google' ? GOOGLE_RESERVED_OUTPUT_TOKENS : SCOUT_MAX_OUTPUT_TOKENS;
  return Math.ceil(SCOUT_MAX_INPUT_TOKENS * rate.input + outputBound * rate.output);
}

export function parseScoutProvider(value: string | null): ScoutProvider {
  if (value === null) return 'mistral';
  if (!SCOUT_PROVIDERS.includes(value as ScoutProvider))
    throw new TypeError('Choose a supported Scout provider');
  return value as ScoutProvider;
}

function authentication(provider: ScoutProvider, key: string): Record<string, string> {
  if (provider === 'google') return { 'x-goog-api-key': key };
  if (provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  return { Authorization: `Bearer ${key}` };
}

export function scoutModelCheckRequest(provider: ScoutProvider, key: string) {
  const host = {
    mistral: 'https://api.mistral.ai/v1/models/',
    openai: 'https://api.openai.com/v1/models/',
    anthropic: 'https://api.anthropic.com/v1/models/',
    google: 'https://generativelanguage.googleapis.com/v1beta/models/',
  }[provider];
  return {
    url: host + SCOUT_MODELS[provider],
    init: {
      method: 'GET',
      headers: authentication(provider, key),
      // Workers supports manual/follow; keep credentials on the fixed provider host.
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    } satisfies RequestInit,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function scoutModelCheckAccepted(provider: ScoutProvider, data: unknown): boolean {
  const body = record(data);
  const model = SCOUT_MODELS[provider];
  if (provider === 'google')
    return (
      body?.name === `models/${model}` &&
      Array.isArray(body?.supportedGenerationMethods) &&
      body.supportedGenerationMethods.includes('generateContent')
    );
  if (body?.id !== model) return false;
  if (provider === 'mistral')
    return record(body?.capabilities)?.completion_chat === true && body?.archived !== true;
  return true;
}

// OpenAI requires all object properties. Null means an optional policy field stays unchanged.
function openAiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openAiSchema);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, openAiSchema(child)])
  );
  const properties = record(result.properties);
  if (result.type === 'object' && properties) {
    const required = new Set(Array.isArray(result.required) ? result.required : []);
    for (const [name, property] of Object.entries(properties)) {
      if (!required.has(name)) properties[name] = { anyOf: [property, { type: 'null' }] };
    }
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }
  return result;
}

export function scoutGenerationRequest(
  provider: ScoutProvider,
  key: string,
  system: string,
  prompt: string,
  schema: Record<string, unknown>
) {
  const model = SCOUT_MODELS[provider];
  const headers = { 'Content-Type': 'application/json', ...authentication(provider, key) };
  let url: string;
  let body: Record<string, unknown>;
  if (provider === 'google') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: SCOUT_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
      },
    };
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    body = {
      model,
      system,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: SCOUT_MAX_OUTPUT_TOKENS,
      stream: false,
      thinking: { type: 'disabled' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    };
  } else {
    url =
      provider === 'mistral'
        ? 'https://api.mistral.ai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: SCOUT_MAX_OUTPUT_TOKENS,
      n: 1,
      stream: false,
      temperature: 0.2,
      tool_choice: 'none',
      ...(provider === 'mistral'
        ? { reasoning_effort: 'none', service_tier: 'standard_only' }
        : { store: false }),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'aegis_recommendation',
          schema: provider === 'openai' ? openAiSchema(schema) : schema,
          strict: true,
        },
      },
    };
  }
  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(SCOUT_TIMEOUT_MS),
    } satisfies RequestInit,
  };
}

export function scoutInputBound(
  provider: ScoutProvider,
  system: string,
  prompt: string,
  schema: Record<string, unknown>
): number {
  const request = scoutGenerationRequest(provider, '', system, prompt, schema);
  // UTF-8 bytes bound text tokens conservatively; include the exact schema and provider envelope.
  return new TextEncoder().encode(String(request.init.body)).byteLength + 512;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

export function scoutUsageCost(provider: ScoutProvider, data: unknown): number | undefined {
  const body = record(data);
  if (provider === 'google') {
    const usage = record(body?.usageMetadata);
    const input = integer(usage?.promptTokenCount);
    const candidates = integer(usage?.candidatesTokenCount);
    const thoughts =
      usage?.thoughtsTokenCount === undefined ? 0 : integer(usage.thoughtsTokenCount);
    const total = integer(usage?.totalTokenCount);
    if (
      input === undefined ||
      candidates === undefined ||
      thoughts === undefined ||
      total === undefined
    )
      return undefined;
    const output = candidates + thoughts;
    if (
      total !== input + output ||
      input > SCOUT_MAX_INPUT_TOKENS ||
      candidates > SCOUT_MAX_OUTPUT_TOKENS ||
      thoughts > GOOGLE_RESERVED_THOUGHT_TOKENS ||
      output > GOOGLE_RESERVED_OUTPUT_TOKENS
    )
      return undefined;
    return Math.ceil(input * sponsoredRates.google.input + output * sponsoredRates.google.output);
  }
  if (provider !== 'mistral') return undefined;
  const usage = record(body?.usage);
  const input = integer(usage?.prompt_tokens);
  const output = integer(usage?.completion_tokens);
  const total = integer(usage?.total_tokens);
  if (
    input === undefined ||
    output === undefined ||
    total === undefined ||
    total !== input + output ||
    input > SCOUT_MAX_INPUT_TOKENS ||
    output > SCOUT_MAX_OUTPUT_TOKENS
  )
    return undefined;
  return Math.ceil(input * sponsoredRates.mistral.input + output * sponsoredRates.mistral.output);
}

export class ScoutResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function scoutResponse(
  provider: ScoutProvider,
  data: unknown
): { output: string; model: string } {
  const body = record(data);
  const model = SCOUT_MODELS[provider];
  let actual: unknown;
  let output: unknown;
  let complete = false;
  if (provider === 'google') {
    actual = body?.modelVersion;
    const candidates = body?.candidates;
    const candidate = Array.isArray(candidates) ? record(candidates[0]) : undefined;
    const parts = record(candidate?.content)?.parts;
    complete =
      Array.isArray(candidates) &&
      candidates.length === 1 &&
      candidate?.finishReason === 'STOP' &&
      !record(body?.promptFeedback)?.blockReason &&
      Array.isArray(parts) &&
      parts.every((part: unknown) => typeof record(part)?.text === 'string');
    output = Array.isArray(parts)
      ? parts
          .filter((part: unknown) => record(part)?.thought !== true)
          .map((part: unknown) => record(part)?.text)
          .join('')
      : '';
    if (
      typeof actual !== 'string' ||
      (actual !== model && !new RegExp(`^${model}-\\d{3}$`).test(actual))
    )
      throw new ScoutResponseError('Scout returned an unexpected model version');
  } else if (provider === 'anthropic') {
    actual = body?.model;
    const content = body?.content;
    complete =
      body?.stop_reason === 'end_turn' &&
      Array.isArray(content) &&
      content.every(
        (part: unknown) => record(part)?.type === 'text' && typeof record(part)?.text === 'string'
      );
    output = Array.isArray(content)
      ? content.map((part: unknown) => record(part)?.text).join('')
      : '';
  } else {
    actual = body?.model;
    const choices = body?.choices;
    const choice = Array.isArray(choices) ? record(choices[0]) : undefined;
    const message = record(choice?.message);
    complete =
      Array.isArray(choices) &&
      choices.length === 1 &&
      choice?.finish_reason === 'stop' &&
      (message?.tool_calls === undefined ||
        (Array.isArray(message.tool_calls) && !message.tool_calls.length)) &&
      !message?.refusal;
    output = message?.content;
    if (Array.isArray(output)) {
      complete &&= output.every(
        (part: unknown) => record(part)?.type === 'text' && typeof record(part)?.text === 'string'
      );
      output = output.map((part: unknown) => record(part)?.text).join('');
    }
  }
  if (provider !== 'google' && actual !== model)
    throw new ScoutResponseError('Scout returned an unexpected model version');
  if (!complete || typeof output !== 'string' || !output.trim() || output.length > 16_384)
    throw new ScoutResponseError(
      'Scout did not complete a recommendation. No action was prepared.'
    );
  return { output, model: actual as string };
}

export function scoutRecommendation(provider: ScoutProvider, recommendation: unknown): unknown {
  const input = record(recommendation);
  const changes = record(input?.changes);
  if (provider !== 'openai' || input?.kind !== 'set_policy' || !changes) return recommendation;
  return {
    ...input,
    changes: Object.fromEntries(
      Object.entries(changes).filter(
        ([name, value]) => value !== null || !editablePolicyKeys.some((key) => key === name)
      )
    ),
  };
}
