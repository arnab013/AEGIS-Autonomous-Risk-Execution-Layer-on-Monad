import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiAccess, KeyCheckResult, ScoutProvider } from '../src/ai/types.ts';
import { AiAccessDialog } from '../src/components/AiAccessDialog.tsx';
import { aiHeaders, checkScoutKey } from '../src/ui/aiAccess.ts';
import { scoutProviders } from '../src/ui/scoutProviders.ts';

const access: AiAccess = {
  agentFunding: 'byok',
  agentProvider: 'openai',
  agentKey: 'test-only-scout-key',
  jevFunding: 'byok',
  jevKey: 'test-only-jev-key',
};
const noop = () => {};

afterEach(() => vi.unstubAllGlobals());

function settings(provider: ScoutProvider, result?: KeyCheckResult) {
  return renderToStaticMarkup(
    <AiAccessDialog
      open
      agentFunding="byok"
      agentProvider={provider}
      jevFunding="disabled"
      agentKey=""
      jevKey=""
      onAgentFundingChange={noop}
      onAgentProviderChange={noop}
      onJevFundingChange={noop}
      onAgentKeyChange={noop}
      onJevKeyChange={noop}
      onCheckAgentKey={noop}
      onApply={noop}
      onClose={noop}
      agentKeyCheck={result}
      trialProvider="google"
      trialModel="trial-model-fixture"
    />
  );
}

describe('Scout provider access', () => {
  it('sends a chosen vendor only for BYOK and keeps sponsored funding independent', () => {
    const own = aiHeaders(access);
    expect(own.get('X-Aegis-Agent-Provider')).toBe('openai');
    expect(own.get('X-Aegis-Agent-Key')).toBe(access.agentKey);
    for (const agentFunding of ['sponsored', 'disabled'] as const) {
      const headers = aiHeaders({ ...access, agentFunding });
      expect(headers.has('X-Aegis-Agent-Provider')).toBe(false);
      expect(headers.has('X-Aegis-Agent-Key')).toBe(false);
      expect(headers.get('X-Aegis-Jev-Key')).toBe(access.jevKey);
    }
  });

  it.each(Object.keys(scoutProviders) as ScoutProvider[])(
    'uses a labelled password field and all four options for %s',
    (provider) => {
      const markup = settings(provider);
      expect(markup).toContain(scoutProviders[provider].keyLabel);
      expect(markup).toContain('type="password"');
      expect(markup).toContain('autoComplete="off"');
      expect(markup).toContain('Scout provider');
      for (const details of Object.values(scoutProviders)) expect(markup).toContain(details.label);
      expect(markup).toContain('project trial uses Google');
      expect(markup).toContain('trial-model-fixture');
      expect(markup).toContain('An accepted key does not prove generation quota.');
    }
  );

  it.each([
    ['accepted', 200],
    ['rejected', 401],
    ['rate_limited', 429],
    ['unavailable', 502],
    ['model_unavailable', 404],
  ] as const)(
    'preserves the named %s result without generation or Jev credentials',
    async (status, code) => {
      const result: KeyCheckResult = {
        provider: 'openai',
        model: 'model-fixture',
        checkedAt: 1,
        status,
        generationVerified: false,
        message: 'Provider check fixture.',
      };
      const fetcher = vi.fn(async () => new Response(JSON.stringify(result), { status: code }));
      vi.stubGlobal('fetch', fetcher);
      expect(await checkScoutKey('openai', '  test-only-scout-key  ')).toEqual(result);
      expect(fetcher).toHaveBeenCalledOnce();
      const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/agent/key-check');
      expect(options.body).toBe('{}');
      expect(options.credentials).toBe('same-origin');
      const headers = new Headers(options.headers);
      expect(headers.get('X-Aegis-Agent-Key')).toBe(access.agentKey);
      expect(headers.get('X-Aegis-Agent-Provider')).toBe('openai');
      expect(headers.get('X-Aegis-Agent-Funding')).toBe('byok');
      expect(headers.has('X-Aegis-Jev-Key')).toBe(false);
      expect(settings('openai', result)).not.toContain('Scout verified');
      if (status === 'accepted')
        expect(settings('openai', result)).toContain('response generation unverified');
    }
  );

  it('rejects a mismatched provider response and never promotes an invented generation pass', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              provider: 'anthropic',
              status: 'accepted',
              generationVerified: true,
              message: 'Unexpected response',
            })
          )
      )
    );
    await expect(checkScoutKey('openai', 'test-only-key')).rejects.toThrow(
      'could not be completed'
    );
  });

  it('distinguishes application key-check cooldown from provider limits', () => {
    const result: KeyCheckResult = {
      provider: 'openai',
      model: 'model-fixture',
      checkedAt: 1,
      status: 'rate_limited',
      generationVerified: false,
      message: 'Wait for the application key-check cooldown.',
      code: 'key_check_cooldown',
    };
    expect(settings('openai', result)).toContain('Wait before checking another key');
    expect(settings('openai', result)).not.toContain('Provider rate or usage limit reached');
    expect(settings('openai', { ...result, code: 'provider_rate_limited' })).toContain(
      'Provider rate or usage limit reached'
    );
  });

  it.each([
    null,
    {
      provider: 'openai',
      status: 'accepted',
      generationVerified: false,
      message: 'bad status',
      model: 'fixture',
      checkedAt: 1,
    },
  ])('does not accept an invalid gateway response as key access', async (result) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(result), { status: 502 }))
    );
    await expect(checkScoutKey('openai', 'test-only-key')).rejects.toThrow(
      'could not be completed'
    );
  });
});
