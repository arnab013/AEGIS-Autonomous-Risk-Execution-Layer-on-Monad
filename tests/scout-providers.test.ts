import { describe, expect, it } from 'vitest';
import {
  SCOUT_MODELS,
  SCOUT_MAX_OUTPUT_TOKENS,
  scoutGenerationRequest,
  scoutModelCheckRequest,
  scoutModelCheckAccepted,
  scoutRecommendation,
  scoutResponse,
  scoutUsageCost,
  scoutMaximumCost,
} from '../cloudflare/scout-providers.ts';

const schema = {
  type: 'object',
  properties: {
    recommendation: {
      anyOf: [
        {
          type: 'object',
          properties: { kind: { type: 'string', enum: ['none'] } },
          required: ['kind'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['set_policy'] },
            changes: {
              type: 'object',
              properties: { max_order_size: { type: 'number' }, is_paused: { type: 'boolean' } },
              additionalProperties: false,
            },
          },
          required: ['kind', 'changes'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['recommendation'],
  additionalProperties: false,
};

describe('fixed Scout provider adapters', () => {
  it('makes OpenAI optional policy fields nullable without changing unchanged policy fields', () => {
    const request = scoutGenerationRequest('openai', 'private-key', 'system', 'prompt', schema);
    const body = JSON.parse(String(request.init.body));
    const changes =
      body.response_format.json_schema.schema.properties.recommendation.anyOf[1].properties.changes;
    expect(changes.required).toEqual(['max_order_size', 'is_paused']);
    expect(changes.additionalProperties).toBe(false);
    expect(changes.properties.is_paused.anyOf).toEqual([{ type: 'boolean' }, { type: 'null' }]);
    expect(
      scoutRecommendation('openai', {
        kind: 'set_policy',
        changes: { max_order_size: 25, is_paused: null },
      })
    ).toEqual({ kind: 'set_policy', changes: { max_order_size: 25 } });
    expect(
      scoutRecommendation('openai', { kind: 'set_policy', changes: { unknown: null } })
    ).toEqual({ kind: 'set_policy', changes: { unknown: null } });
    expect(schema.properties.recommendation.anyOf[1].properties.changes.required).toBeUndefined();
  });

  it('uses Claude structured output without sampling parameters or a signing tool', () => {
    const body = JSON.parse(
      String(
        scoutGenerationRequest('anthropic', 'private-key', 'system', 'prompt', schema).init.body
      )
    );
    expect(body).toMatchObject({
      model: SCOUT_MODELS.anthropic,
      max_tokens: 2048,
      thinking: { type: 'disabled' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    });
    expect(body.temperature).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it.each(['mistral', 'openai', 'anthropic', 'google'] as const)(
    'keeps %s credentials in headers and prevents redirected credential forwarding',
    (provider) => {
      for (const request of [
        scoutGenerationRequest(provider, 'private-key', 'system', 'prompt', schema),
        scoutModelCheckRequest(provider, 'private-key'),
      ]) {
        expect(request.url).not.toContain('private-key');
        expect(String(request.init.body ?? '')).not.toContain('private-key');
        expect(request.init.redirect).toBe('manual');
      }
    }
  );

  it('does not mistake malformed Google metadata or another model for usable generation access', () => {
    expect(
      scoutModelCheckAccepted('google', {
        name: `models/${SCOUT_MODELS.google}`,
        supportedGenerationMethods: 'generateContent',
      })
    ).toBe(false);
    expect(
      scoutModelCheckAccepted('google', {
        name: `models/${SCOUT_MODELS.google}`,
        supportedGenerationMethods: ['countTokens'],
      })
    ).toBe(false);
    expect(scoutModelCheckAccepted('openai', { id: 'other' })).toBe(false);
    expect(
      scoutModelCheckAccepted('mistral', {
        id: SCOUT_MODELS.mistral,
        capabilities: { completion_chat: true },
        archived: true,
      })
    ).toBe(false);
  });

  it.each([
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: '{}', refusal: 'no' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: '{}', tool_calls: [{}] } }] },
  ])(
    'rejects incomplete or refused OpenAI output before an approval can be issued: %j',
    (value) => {
      expect(() => scoutResponse('openai', { model: SCOUT_MODELS.openai, ...value })).toThrow(
        'No action was prepared'
      );
    }
  );

  it.each([
    { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{}' }] },
    { stop_reason: 'refusal', content: [{ type: 'text', text: '{}' }] },
    { stop_reason: 'end_turn', content: [{ type: 'tool_use', name: 'sign' }] },
  ])('rejects incomplete or tool-bearing Claude output: %j', (value) => {
    expect(() => scoutResponse('anthropic', { model: SCOUT_MODELS.anthropic, ...value })).toThrow(
      'No action was prepared'
    );
  });

  it('excludes Google thoughts from the visible response and rejects a tool result or blocked output', () => {
    const response = {
      modelVersion: SCOUT_MODELS.google,
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ thought: true, text: 'private reasoning' }, { text: '{}' }] },
        },
      ],
    };
    expect(scoutResponse('google', response)).toEqual({ model: SCOUT_MODELS.google, output: '{}' });
    expect(() =>
      scoutResponse('google', { ...response, promptFeedback: { blockReason: 'SAFETY' } })
    ).toThrow('No action was prepared');
    response.candidates[0].content.parts = [{ functionCall: { name: 'sign' } }] as any;
    expect(() => scoutResponse('google', response)).toThrow('No action was prepared');
  });

  it('settles combined Google candidates and thoughts within the conservatively reserved output ceiling', () => {
    expect(scoutMaximumCost('google')).toBe(259584);
    expect(
      scoutUsageCost('google', {
        usageMetadata: {
          promptTokenCount: 8192,
          candidatesTokenCount: SCOUT_MAX_OUTPUT_TOKENS,
          thoughtsTokenCount: 65536,
          totalTokenCount: 8192 + 2048 + 65536,
        },
      })
    ).toBe(259584);
    expect(
      scoutUsageCost('google', {
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 300,
          thoughtsTokenCount: 3000,
          totalTokenCount: 4300,
        },
      })
    ).toBe(13125);
  });

  it.each([
    {
      promptTokenCount: 1000,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 50,
      totalTokenCount: 1200,
    },
    {
      promptTokenCount: 1000,
      candidatesTokenCount: 2049,
      thoughtsTokenCount: 0,
      totalTokenCount: 3049,
    },
    {
      promptTokenCount: 1000,
      candidatesTokenCount: 1,
      thoughtsTokenCount: 65537,
      totalTokenCount: 66538,
    },
    { promptTokenCount: 8193, candidatesTokenCount: 1, totalTokenCount: 8194 },
    { promptTokenCount: 1000, thoughtsTokenCount: 10, totalTokenCount: 1010 },
  ])('retains conservative Google costs for unverified or excessive usage: %j', (usageMetadata) => {
    expect(scoutUsageCost('google', { usageMetadata })).toBeUndefined();
  });
});
