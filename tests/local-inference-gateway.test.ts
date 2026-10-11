import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Server } from 'node:http';
import { createGateway } from '../server/gateway.mjs';
import { createLocalInferenceRuntime } from '../server/inference-runtime.mjs';
import { buildJevRequest, parseJevResponse } from '../src/jev/client.ts';
import { buildJevStatePayload } from '../src/jev/stateBuilder.ts';

const projectRoot = resolve(process.cwd());
const testRoot = join(projectRoot, '.local', 'local-inference-tests');
const servers: Server[] = [];
const projectJevKey = 'private-project-jev-key';
const projectMistralKey = 'private-project-mistral-key';
const ownerToken = 'private-implementation-token';
let directory: string;
let now: number;
let upstream: ReturnType<typeof vi.fn>;

function state() {
  return buildJevStatePayload(
    { pair: 'MON/USDC', mid_price: 4, spread_bps: 5 } as any,
    { spot_exposure_usd: 1000, net_delta: 1000 } as any,
    { open_orders: [] } as any,
    {} as any,
    {
      max_position_usd: 2000,
      max_leverage: 2,
      max_daily_loss: 400,
      permitted_actions: ['hold'],
    } as any
  );
}

function vendor() {
  return {
    model: 'jev-1.13.0',
    answers: {
      action: {
        type: 'choice',
        choice: 'hold',
        confidence: 0.9,
        probabilities: {
          hold: 1,
          increase_position: 0,
          reduce_position: 0,
          hedge: 0,
          cancel_orders: 0,
        },
      },
      regime: {
        type: 'choice',
        choice: 'range_bound',
        confidence: 0.9,
        probabilities: {
          trending_up: 0,
          trending_down: 0,
          range_bound: 1,
          high_volatility: 0,
          liquidity_stress: 0,
          uncertain: 0,
        },
      },
      risk: {
        type: 'choice',
        choice: 'low',
        confidence: 0.9,
        probabilities: { very_low: 0, low: 1, moderate: 0, high: 0, critical: 0 },
      },
      anomaly: { type: 'noul', noul: 0 },
      cancel_orders: { type: 'noul', noul: 0 },
    },
    usage: { input_tokens: 100, output_tokens: 100 },
  };
}

async function start(options: { runtime?: boolean; enabled?: boolean; secret?: string } = {}) {
  const marketClient = {
    monad: { request: vi.fn(async () => '0x8f') },
    fetchSnapshot: vi.fn(async () => ({ pair: 'MON/USDC', timestamp: now, blockNumber: 100 })),
    getWalletBalances: vi.fn(async () => ({ mon: '1', usdc: '0' })),
    prepareMarketSell: vi.fn(async () => {
      throw new Error('No signing in this test');
    }),
  };
  const aiRuntime =
    options.runtime === false
      ? undefined
      : createLocalInferenceRuntime({
          projectRoot,
          storageDirectory: join(directory, 'ai'),
          environment: {
            AI_ENABLED: options.enabled === false ? 'false' : 'true',
            AI_SESSION_SECRET: options.secret ?? 'local-inference-test-session-secret-long-enough',
            AI_IMPLEMENTATION_TOKEN: ownerToken,
            TYPESAFE_API_KEY: projectJevKey,
            MISTRAL_API_KEY: projectMistralKey,
            TURNSTILE_SECRET_KEY: 'private-test-turnstile-secret',
            TURNSTILE_SITE_KEY: 'public-test-site-key',
          },
          marketClient,
          fetchImpl: upstream,
          clock: () => now,
          news: { get: async () => ({ fetchedAt: now, articles: [], unavailableSources: [] }) },
        });
  const server = createGateway({
    config: {
      apiKey: projectJevKey,
      inferenceEnabled: true,
      aiEnabled: true,
      model: 'jev-latest',
      chainId: 143,
      marketAddress: '0x' + '1'.repeat(40),
      journalDirectory: join(directory, 'audit'),
      allowedOrigins: ['http://127.0.0.1:3000'],
    },
    marketClient,
    aiRuntime,
    buildRequest: buildJevRequest,
    validateResponse: parseJevResponse,
    fetchImpl: upstream,
    clock: () => now,
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No gateway address');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  const request = async (
    path: string,
    value?: unknown,
    extraHeaders: Record<string, string> = {}
  ) => {
    const response = await fetch(base + path, {
      method: value === undefined ? 'GET' : 'POST',
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const access = () => request('/api/inference/session', { implementationToken: ownerToken });
  return { request, access, base };
}

beforeEach(async () => {
  await mkdir(testRoot, { recursive: true });
  directory = await mkdtemp(join(testRoot, 'gateway-'));
  now = 1_700_000_000_000;
  upstream = vi.fn(async (url: string) => {
    if (String(url).includes('/turnstile/'))
      return new Response(
        JSON.stringify({
          success: true,
          hostname: '127.0.0.1',
          action: 'aegis-trial',
        })
      );
    return new Response(JSON.stringify(vendor()));
  });
});

it('routes readonly key checks through the local gateway and persists cooldown without inference or credential storage', async () => {
  const app = await start();
  upstream.mockImplementationOnce(async () => Response.json({ id: 'gpt-4.1-mini-2025-04-14' }));
  const headers = {
    'X-Aegis-Agent-Funding': 'byok',
    'X-Aegis-Agent-Provider': 'openai',
    'X-Aegis-Agent-Key': 'private-user-openai-key',
  };
  const checked = await app.request('/api/agent/key-check', {}, headers);
  expect(checked.status).toBe(200);
  expect(checked.body).toMatchObject({
    status: 'accepted',
    generationVerified: false,
    provider: 'openai',
  });
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(upstream.mock.calls[0][1]?.method).toBe('GET');
  expect((await app.request('/api/agent/key-check', {}, headers)).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
  const saved = await readFile(join(directory, 'ai', 'ai-budget-ledger.json'), 'utf8');
  expect(saved).not.toContain('private-user-openai-key');
  expect(saved).not.toContain('reservation:');
});

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((done) => {
      server.close(done);
      server.closeAllConnections();
    });
  const target = resolve(directory);
  if (!target.startsWith(testRoot + sep)) throw new Error('Test cleanup escaped the project');
  await rm(target, { recursive: true, force: true });
});

describe('local gateway budgeted inference', () => {
  it('routes old /api/jev through session and budget checks even when legacy inference is enabled', async () => {
    const gateway = await start();
    expect((await gateway.request('/api/jev', { state: state() })).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    await gateway.access();
    const response = await gateway.request('/api/jev', { state: state() });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Aegis-Jev-Receipt')).toBeTruthy();
    const status = await gateway.request('/api/inference/status');
    expect(status.body).toMatchObject({ pool: 'implementation', poolRemainingMicros: 1_999_995 });
    expect(upstream).toHaveBeenCalledExactlyOnceWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.any(Object)
    );
  });

  it.each([{ runtime: false }, { secret: 'short' }, { enabled: false }])(
    'fails closed without a ready budget runtime: %j',
    async (options) => {
      const gateway = await start(options);
      expect((await gateway.request('/api/jev', { state: state() })).status).toBe(503);
      expect(upstream).not.toHaveBeenCalled();
      expect((await gateway.request('/api/status')).body.inferenceEnabled).toBe(false);
    }
  );

  it('maps the HttpOnly trial cookie for loopback development and retains session across Vite requests', async () => {
    const gateway = await start();
    const access = await gateway.request(
      '/api/inference/session',
      { implementationToken: ownerToken },
      {
        Origin: 'http://127.0.0.1:3000',
      }
    );
    const cookie = access.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^aegis-ai-local=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('; Secure');
    expect(
      (
        await gateway.request(
          '/api/jev',
          { state: state() },
          {
            Origin: 'http://127.0.0.1:3000',
          }
        )
      ).status
    ).toBe(200);
  });

  it('checks public Turnstile access and blocks the sixth sponsored turn', async () => {
    const gateway = await start();
    expect(
      (await gateway.request('/api/inference/session', { turnstileToken: 'test-challenge' })).status
    ).toBe(200);
    for (let index = 0; index < 5; index += 1) {
      expect((await gateway.request('/api/jev', { state: state() })).status).toBe(200);
      now += 20_000;
    }
    expect((await gateway.request('/api/jev', { state: state() })).status).toBe(429);
    expect(upstream.mock.calls.filter(([url]) => String(url).includes('typesafe.ai'))).toHaveLength(
      5
    );
    const status = (await gateway.request('/api/inference/status')).body;
    expect(status).toMatchObject({
      pool: 'public',
      visitorTurnsRemaining: 0,
      poolRemainingMicros: 7_999_975,
    });
  });

  it('uses a user key without silently falling back to a project key or charging project money', async () => {
    const gateway = await start();
    await gateway.access();
    const userKey = 'private-user-jev-key';
    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid key' }), { status: 401 })
    );
    const response = await gateway.request(
      '/api/jev',
      { state: state() },
      {
        'X-Aegis-Jev-Funding': 'byok',
        'X-Aegis-Jev-Key': userKey,
      }
    );
    expect(response.status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${userKey}`);
    const status = await gateway.request('/api/inference/status');
    expect(status.body.poolRemainingMicros).toBe(2_000_000);
    const saved = await readFile(join(directory, 'ai', 'ai-budget-ledger.json'), 'utf8');
    for (const secret of [userKey, projectJevKey, projectMistralKey, ownerToken]) {
      expect(saved).not.toContain(secret);
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(JSON.stringify(status.body)).not.toContain(secret);
    }
  });

  it('rejects unknown browser origins and excessive request bodies before provider calls', async () => {
    const gateway = await start();
    await gateway.access();
    expect(
      (
        await gateway.request(
          '/api/jev',
          { state: state() },
          { Origin: 'https://untrusted.example' }
        )
      ).status
    ).toBe(403);
    expect((await gateway.request('/api/jev', { padding: 'x'.repeat(65_537) })).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('exposes configured capabilities without exporting secrets and preserves agent journal references', async () => {
    const gateway = await start();
    const status = (await gateway.request('/api/status')).body;
    expect(status).toMatchObject({
      inferenceEnabled: true,
      jevConfigured: true,
      agentConfigured: true,
      inferenceAccess: 'capped_trial_or_user_key',
    });
    expect(JSON.stringify(status)).not.toContain(projectJevKey);
    const event = {
      id: 'agent-sale',
      timestamp: '2026-10-09T00:00:00.000Z',
      market_state_hash: 'st_test',
      execution_allowed: false,
      execution_mode: 'manual_trade',
      recommendation_reference: 'intent-123',
    };
    expect((await gateway.request('/api/audit', event)).body.event.recommendation_reference).toBe(
      'intent-123'
    );
    expect(
      (
        await gateway.request('/api/audit', {
          ...event,
          id: 'bad-ref',
          recommendation_reference: { key: 'private-key' },
        })
      ).status
    ).toBe(422);
  });
});
