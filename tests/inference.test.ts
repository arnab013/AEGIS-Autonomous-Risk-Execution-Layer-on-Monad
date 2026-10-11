import { describe, expect, it, vi } from 'vitest';
import {
  handleInference,
  MISTRAL_MODEL,
  JEV_MODEL,
  type InferenceEnv,
} from '../cloudflare/inference.ts';
import {
  AiBudgetLedger,
  type LedgerStorage,
  type LedgerTransaction,
} from '../cloudflare/ledger.ts';
import { buildJevStatePayload } from '../src/jev/stateBuilder.ts';
import { TYPESAFE_SYSTEM_ONE_URL } from '../src/jev/client.ts';
import type { AgentIntent, AgentSessionContext, NewsContext } from '../src/ai/types.ts';
import type { KuruMarketData } from '../src/execution/kuruClient.ts';
import { SCOUT_MODELS, scoutMaximumCost } from '../cloudflare/scout-providers.ts';

const origin = 'https://aegis.himaloy2608.workers.dev';
const account = '0x1111111111111111111111111111111111111111';
const at = Date.parse('2026-10-09T12:00:00Z');
const context = (): AgentSessionContext => ({
  mode: 'live',
  chainId: 143,
  account,
  policyRevision: 1,
  clipUsd: 100,
  policy: {
    max_position_usd: 1000,
    max_order_size: 100,
    max_daily_loss: 100,
    max_leverage: 1,
    max_slippage_bps: 50,
    max_open_orders: 10,
    stale_order_timeout_seconds: 60,
    min_liquidity_depth_usd: 0,
    cooldown_seconds: 10,
    allowed_assets: ['MON', 'USDC'],
    allowed_venues: ['kuru'],
    permitted_actions: ['hold', 'reduce_position'],
    is_paused: false,
  },
});

const market = (): KuruMarketData => ({
  pair: 'MON/USDC',
  midPrice: 2,
  bids: [{ price: 1.999, size: 1000 }],
  asks: [{ price: 2.001, size: 1000 }],
  timestamp: at,
  blockNumber: 100,
  chainId: 143,
  marketAddress: '0x2222222222222222222222222222222222222222',
  source: 'kuru_rpc',
  latencyMs: 10,
  depthIncludesAmm: false,
  metadata: {
    pricePrecision: '100000000',
    sizePrecision: '10000000000',
    baseAssetAddress: '0x0000000000000000000000000000000000000000',
    baseAssetDecimals: 18,
    quoteAssetAddress: '0x3333333333333333333333333333333333333333',
    quoteAssetDecimals: 6,
    tickSize: '100',
    minSize: '2000000000000',
    maxSize: '2000000000000000000',
    takerFeeBps: '0',
    makerFeeBps: '0',
  },
});

const jev = () => ({
  model: JEV_MODEL,
  usage: { input_tokens: 1000, output_tokens: 100 },
  answers: {
    action: {
      type: 'choice',
      choice: 'hold',
      confidence: 0.9,
      probabilities: {
        increase_position: 0.01,
        reduce_position: 0.06,
        hold: 0.9,
        hedge: 0.01,
        cancel_orders: 0.02,
      },
    },
    regime: {
      type: 'choice',
      choice: 'range_bound',
      confidence: 0.9,
      probabilities: {
        trending_up: 0.02,
        trending_down: 0.02,
        range_bound: 0.9,
        high_volatility: 0.02,
        liquidity_stress: 0.02,
        uncertain: 0.02,
      },
    },
    risk: {
      type: 'choice',
      choice: 'moderate',
      confidence: 0.9,
      probabilities: { very_low: 0.02, low: 0.02, moderate: 0.9, high: 0.04, critical: 0.02 },
    },
    anomaly: { type: 'noul', noul: 0.1 },
    cancel_orders: { type: 'noul', noul: 0.1 },
  },
});

const inputPayload = () =>
  buildJevStatePayload(
    {
      ...market(),
      mid_price: 2,
      spread_bps: 10,
      bid_depth_25bps: 1999,
      ask_depth_25bps: 2001,
    } as any,
    { spot_exposure_usd: 20, net_delta: 20 } as any,
    { open_orders: [], oldest_order_age: 0 } as any,
    { position_utilization: 0.02, volatility_percentile: 0 } as any,
    context().policy
  );

class MemoryStorage implements LedgerStorage {
  values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.values.set(key, structuredClone(value));
  }
  async transaction<T>(callback: (storage: LedgerTransaction) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function fixture() {
  let clock = at;
  let sequence = 0;
  let cookie = '';
  let recommendation: AgentIntent = { kind: 'prepare_mon_reduction', amountMon: '2' };
  let citationIds: string[] = [];
  let upstreamJev: unknown = jev();
  let jevStatus = 200;
  let agentStatus = 'stop';
  let agentResponse: Record<string, unknown> = {};
  let agentHttpStatus = 200;
  let agentHeaders: Record<string, string> = {};
  let agentError: Error | undefined;
  const budget = new AiBudgetLedger({ storage: new MemoryStorage() });
  const ledgerCalls: { path: string; body: any }[] = [];
  const ledgerFetch = vi.fn(async (request: Request) => {
    const copy = request.clone();
    ledgerCalls.push({
      path: new URL(copy.url).pathname,
      body: copy.method === 'POST' ? await copy.json() : undefined,
    });
    return budget.fetch(request);
  });
  const env: InferenceEnv = {
    AI_ENABLED: 'true',
    AI_SESSION_SECRET: 'test-session-signing-secret-32-characters-long',
    AI_IMPLEMENTATION_TOKEN: 'test-implementation-only',
    TYPESAFE_API_KEY: 'fake-jev-owner-key',
    MISTRAL_API_KEY: 'fake-mistral-owner-key',
    GEMINI_API_KEY: 'fake-google-owner-key',
    TURNSTILE_SECRET_KEY: 'fake-turnstile-secret',
    TURNSTILE_SITE_KEY: 'fake-turnstile-public-site',
    AI_BUDGET: { idFromName: (name) => name, get: () => ({ fetch: ledgerFetch }) },
  };
  const news: NewsContext = {
    fetchedAt: at,
    articles: [
      {
        id: 'CoinDesk:/news/example',
        title: 'A dated market headline',
        summary: 'A short source summary.',
        source: 'CoinDesk',
        url: 'https://www.coindesk.com/news/example',
        publishedAt: at - 60_000,
      },
    ],
    unavailableSources: [],
  };
  const provider = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    // Match Workers: error is not a supported redirect mode there.
    if (options?.redirect === 'error') throw new TypeError('Invalid redirect mode');
    if (String(url).includes('siteverify'))
      return Response.json({
        success: true,
        hostname: new URL(origin).hostname,
        action: 'aegis-trial',
      });
    if (String(url) === TYPESAFE_SYSTEM_ONE_URL)
      return Response.json(upstreamJev, { status: jevStatus });
    const model = String(url).includes('api.openai.com') ? SCOUT_MODELS.openai : MISTRAL_MODEL;
    if (
      agentError &&
      (String(url).endsWith('/chat/completions') ||
        String(url).endsWith('/messages') ||
        String(url).endsWith(':generateContent'))
    )
      throw agentError;
    const answer = JSON.stringify({
      message: 'Review a small MON reduction.',
      rationale: 'It lowers the wallet exposure while staying within the mandate.',
      limitations: [],
      citationIds,
      recommendation,
    });
    if (options?.method === 'GET' && String(url).includes('/models/')) {
      const selected = Object.entries(SCOUT_MODELS).find(([, value]) =>
        String(url).endsWith(value)
      )!;
      return Response.json(
        {
          id: selected[1],
          name: `models/${selected[1]}`,
          capabilities: { completion_chat: true },
          supportedGenerationMethods: ['generateContent'],
          ...agentResponse,
        },
        { status: agentHttpStatus, headers: agentHeaders }
      );
    }
    if (String(url).endsWith('/messages'))
      return Response.json(
        {
          model: SCOUT_MODELS.anthropic,
          stop_reason: agentStatus === 'stop' ? 'end_turn' : agentStatus,
          content: [{ type: 'text', text: answer }],
          usage: { input_tokens: 1000, output_tokens: 100 },
          ...agentResponse,
        },
        { status: agentHttpStatus, headers: agentHeaders }
      );
    if (String(url).endsWith(':generateContent'))
      return Response.json(
        {
          modelVersion: SCOUT_MODELS.google,
          candidates: [
            {
              finishReason: agentStatus === 'stop' ? 'STOP' : agentStatus,
              content: { parts: [{ text: answer }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 100,
            thoughtsTokenCount: 50,
            totalTokenCount: 1150,
          },
          ...agentResponse,
        },
        { status: agentHttpStatus, headers: agentHeaders }
      );
    if (String(url).endsWith('/chat/completions'))
      return Response.json(
        {
          model,
          choices: [
            {
              finish_reason: agentStatus,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  message: 'Review a small MON reduction.',
                  rationale: 'It lowers the wallet exposure while staying within the mandate.',
                  limitations: [],
                  citationIds,
                  recommendation,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
          ...agentResponse,
        },
        { status: agentHttpStatus, headers: agentHeaders }
      );
    throw new Error(`Unexpected test provider route ${String(url)}`);
  });
  const client = {
    fetchSnapshot: vi.fn(async () => market()),
    getWalletBalances: vi.fn(async () => ({ mon: '10', usdc: '40' })),
  };
  const dependencies = {
    marketClient: client,
    fetchImpl: provider as typeof fetch,
    now: () => clock,
    randomId: () => `test-id-${++sequence}`,
    news: { get: vi.fn(async () => news) },
  };
  const send = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await handleInference(
      new Request(origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.1',
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      dependencies
    );
    if (response?.headers.has('Set-Cookie'))
      cookie = response.headers.get('Set-Cookie')!.split(';')[0];
    return response!;
  };
  const start = () => send('/api/inference/session', { turnstileToken: 'fake-single-use-token' });
  const chat = (overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    send(
      '/api/agent',
      {
        message: 'Should I lower my MON exposure?',
        history: [],
        context: context(),
        ...overrides,
      },
      headers
    );
  return {
    env,
    send,
    start,
    chat,
    provider,
    client,
    ledgerCalls,
    news,
    setIntent: (intent: AgentIntent) => {
      recommendation = intent;
    },
    setCitations: (ids: string[]) => {
      citationIds = ids;
    },
    setJev: (value: unknown, status = 200) => {
      upstreamJev = value;
      jevStatus = status;
    },
    setScoutStatus: (status: string) => {
      agentStatus = status;
    },
    setScoutError: (error: Error) => {
      agentError = error;
    },
    setScoutResponse: (
      value: Record<string, unknown>,
      status = 200,
      headers: Record<string, string> = {}
    ) => {
      agentResponse = value;
      agentHttpStatus = status;
      agentHeaders = headers;
    },
    advance: (ms = 20_001) => {
      clock += ms;
    },
  };
}

describe('Hosted inference and explicit recommendation approval', () => {
  it('does not follow provider redirects with credentials in a key check or generation request', async () => {
    const app = fixture();
    app.setScoutResponse({}, 307, { Location: 'https://attacker.example/steal' });
    const checked = await app.send(
      '/api/agent/key-check',
      {},
      { 'X-Aegis-Agent-Funding': 'byok', 'X-Aegis-Agent-Key': 'private-user-key' }
    );
    expect(checked.status).toBe(502);
    expect(await checked.json()).toMatchObject({
      status: 'unavailable',
      generationVerified: false,
    });
    await app.start();
    const response = await app.chat({}, { 'X-Aegis-Jev-Funding': 'disabled' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Scout is unavailable (HTTP 307)' });
    expect(app.provider.mock.calls.some(([url]) => String(url).includes('attacker.example'))).toBe(
      false
    );
    expect(
      app.provider.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))
    ).toHaveLength(1);
  });

  it.each(['mistral', 'openai', 'anthropic', 'google'] as const)(
    'routes %s BYOK only to its fixed provider and preserves signed approval checks',
    async (provider) => {
      const app = fixture();
      await app.start();
      app.setIntent({ kind: 'set_policy', changes: { max_order_size: 25 } });
      const response = await app.chat(
        {},
        {
          'X-Aegis-Agent-Funding': 'byok',
          'X-Aegis-Agent-Provider': provider,
          'X-Aegis-Agent-Key': 'private-user-key',
          'X-Aegis-Jev-Funding': 'disabled',
        }
      );
      expect(response.status).toBe(200);
      const reply = await response.json();
      expect(reply.provider).toBe(provider);
      expect(reply.model).toBe(SCOUT_MODELS[provider]);
      expect(reply.pendingIntent.policyAfter.max_order_size).toBe(25);
      expect(JSON.stringify(reply)).not.toContain('private-user-key');
      const calls = app.provider.mock.calls.filter(([url]) => !String(url).includes('siteverify'));
      expect(calls).toHaveLength(1);
      const headers = new Headers(calls[0][1]?.headers);
      expect(
        headers.get(
          provider === 'google'
            ? 'x-goog-api-key'
            : provider === 'anthropic'
              ? 'x-api-key'
              : 'Authorization'
        )
      ).toBe(
        provider === 'google' || provider === 'anthropic'
          ? 'private-user-key'
          : 'Bearer private-user-key'
      );
      expect(calls[0][1]?.redirect).toBe('manual');
      expect(calls[0][1]?.body).not.toContain('private-user-key');
      const reserves = app.ledgerCalls.filter((call) => call.path === '/reserve');
      expect(reserves).toHaveLength(1);
      expect(reserves[0].body).toMatchObject({ provider, funding: 'byok', maxCostMicros: 0 });
      expect(
        (
          await app.send('/api/agent/approve', {
            token: reply.pendingIntent.token,
            context: { ...context(), policyRevision: 2 },
          })
        ).status
      ).toBe(409);
      expect(
        (
          await app.send('/api/agent/approve', {
            token: reply.pendingIntent.token,
            context: context(),
          })
        ).status
      ).toBe(200);
      expect(
        (
          await app.send('/api/agent/approve', {
            token: reply.pendingIntent.token,
            context: context(),
          })
        ).status
      ).toBe(409);
    }
  );

  it('keeps sponsored routing under owner configuration and settles Google thinking usage', async () => {
    const app = fixture();
    app.env.SCOUT_PROJECT_PROVIDER = 'google';
    await app.start();
    const response = await app.chat({}, { 'X-Aegis-Agent-Provider': 'openai' });
    expect(response.status).toBe(200);
    expect((await response.json()).provider).toBe('google');
    const reserve = app.ledgerCalls.filter((call) => call.path === '/reserve').at(-1)!;
    expect(reserve.body).toMatchObject({
      provider: 'google',
      funding: 'sponsored',
      maxCostMicros: 259584,
    });
    const settlement = app.ledgerCalls.filter((call) => call.path === '/settle').at(-1)!;
    expect(settlement.body).toMatchObject({ actualCostMicros: 1313, uncertain: false });
    const status = await (await app.send('/api/inference/status')).json();
    expect(status).toMatchObject({
      agentProvider: 'google',
      model: SCOUT_MODELS.google,
      poolChargedMicros: 42 + 1313,
    });
    const call = app.provider.mock.calls.find(([url]) => String(url).endsWith(':generateContent'))!;
    expect(new Headers(call[1]?.headers).get('x-goog-api-key')).toBe(app.env.GEMINI_API_KEY);
    expect(String(call[0])).not.toContain(app.env.GEMINI_API_KEY!);
    const body = JSON.parse(String(call[1]?.body));
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
    });
    expect(body.tools).toBeUndefined();
  });

  it('settles verified Google thoughts above the requested output within its full reserved ceiling', async () => {
    const app = fixture();
    app.env.SCOUT_PROJECT_PROVIDER = 'google';
    app.setScoutResponse({
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        thoughtsTokenCount: 3500,
        totalTokenCount: 5000,
      },
    });
    await app.start();
    expect((await app.chat()).status).toBe(200);
    expect(app.ledgerCalls.filter((call) => call.path === '/settle').at(-1)?.body).toMatchObject({
      actualCostMicros: 15750,
      uncertain: false,
    });
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(
      42 + 15750
    );
  });

  it('retains the full Google reservation on missing usage and on a timeout without paid retry', async () => {
    const app = fixture();
    app.env.SCOUT_PROJECT_PROVIDER = 'google';
    app.setScoutResponse({ usageMetadata: {} });
    await app.start();
    expect((await app.chat()).status).toBe(200);
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(
      42 + scoutMaximumCost('google')
    );
    app.advance();
    app.setScoutError(new DOMException('private-key-error', 'TimeoutError'));
    expect((await app.chat()).status).toBe(504);
    expect(
      app.provider.mock.calls.filter(([url]) => String(url).endsWith(':generateContent'))
    ).toHaveLength(2);
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(
      84 + 2 * scoutMaximumCost('google')
    );
  });

  it('rejects unknown BYOK vendors before chain reads, Jev calls or reservations', async () => {
    const app = fixture();
    await app.start();
    const response = await app.chat(
      {},
      {
        'X-Aegis-Agent-Funding': 'byok',
        'X-Aegis-Agent-Provider': 'https://attacker.example',
        'X-Aegis-Agent-Key': 'private-user-key',
      }
    );
    expect(response.status).toBe(422);
    expect(app.client.fetchSnapshot).not.toHaveBeenCalled();
    expect(app.ledgerCalls.some((call) => call.path === '/reserve')).toBe(false);
  });

  it.each(['mistral', 'openai', 'anthropic', 'google'] as const)(
    'checks %s model access without a trial, paid generation or secret disclosure',
    async (provider) => {
      const app = fixture();
      const response = await app.send(
        '/api/agent/key-check',
        {},
        {
          'X-Aegis-Agent-Funding': 'byok',
          'X-Aegis-Agent-Provider': provider,
          'X-Aegis-Agent-Key': 'private-user-key',
        }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        provider,
        model: SCOUT_MODELS[provider],
        status: 'accepted',
        generationVerified: false,
      });
      expect(app.provider).toHaveBeenCalledTimes(1);
      expect(app.provider.mock.calls[0][1]?.method).toBe('GET');
      expect(app.provider.mock.calls[0][1]?.redirect).toBe('manual');
      expect(app.provider.mock.calls[0][1]?.body).toBeUndefined();
      expect(app.ledgerCalls.map((call) => call.path)).toEqual(['/key-check']);
      expect(JSON.stringify(app.ledgerCalls)).not.toContain('private-user-key');
      expect(app.client.fetchSnapshot).not.toHaveBeenCalled();
    }
  );

  it.each([
    [401, 'rejected'],
    [403, 'model_unavailable'],
    [404, 'model_unavailable'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ] as const)(
    'sanitizes a readonly HTTP %s key check without claiming generation works',
    async (status, expected) => {
      const app = fixture();
      app.setScoutResponse({ error: { message: 'private-user-key' } }, status);
      const response = await app.send(
        '/api/agent/key-check',
        {},
        { 'X-Aegis-Agent-Funding': 'byok', 'X-Aegis-Agent-Key': 'private-user-key' }
      );
      const body = await response.json();
      expect(body).toMatchObject({ status: expected, generationVerified: false });
      expect(JSON.stringify(body)).not.toContain('private-user-key');
      expect(app.provider).toHaveBeenCalledTimes(1);
    }
  );

  it('enforces origin, readonly body, own-key funding and persistent key-check cooldown before upstream access', async () => {
    const app = fixture();
    const headers = { 'X-Aegis-Agent-Funding': 'byok', 'X-Aegis-Agent-Key': 'private-user-key' };
    expect(
      (
        await app.send(
          '/api/agent/key-check',
          {},
          { ...headers, Origin: 'https://attacker.example' }
        )
      ).status
    ).toBe(403);
    expect(
      (await app.send('/api/agent/key-check', { url: 'https://attacker.example' }, headers)).status
    ).toBe(422);
    expect(
      (await app.send('/api/agent/key-check', {}, { 'X-Aegis-Agent-Funding': 'sponsored' })).status
    ).toBe(422);
    expect(app.provider).not.toHaveBeenCalled();
    expect((await app.send('/api/agent/key-check', {}, headers)).status).toBe(200);
    const again = await app.send('/api/agent/key-check', {}, headers);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: 'key_check_cooldown' });
    expect(app.provider).toHaveBeenCalledTimes(1);
  });

  it('requires verified access and does not call either paid provider before it', async () => {
    const app = fixture();
    expect((await app.chat()).status).toBe(401);
    expect(app.provider).not.toHaveBeenCalled();
    const session = await app.start();
    expect(session.status).toBe(200);
    expect(session.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
  });

  it('rejects a forged Turnstile result and cross-origin session issuance', async () => {
    const app = fixture();
    app.provider.mockImplementationOnce(async () =>
      Response.json({ success: true, hostname: 'wrong.example', action: 'aegis-trial' })
    );
    expect((await app.start()).status).toBe(403);
    expect(
      (
        await app.send(
          '/api/inference/session',
          { turnstileToken: 'fake' },
          { Origin: 'https://other.example' }
        )
      ).status
    ).toBe(403);
  });

  it('returns genuine raw Jev response unchanged, with a signed provenance receipt', async () => {
    const app = fixture();
    await app.start();
    const response = await app.send('/api/jev', {
      state: inputPayload(),
      model: 'client-model-must-be-ignored',
      questions: {},
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(jev());
    expect(response.headers.get('X-Aegis-Jev-Receipt')).toMatch(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);
    const call = app.provider.mock.calls.find(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)!;
    expect(JSON.parse(String(call[1]?.body)).model).toBe(JEV_MODEL);
    expect(Object.keys(JSON.parse(String(call[1]?.body)).questions)).toEqual([
      'action',
      'regime',
      'risk',
      'anomaly',
      'cancel_orders',
    ]);
  });

  it('counts a Jev plus Scout pipeline as one turn and bounds Scout generation', async () => {
    const app = fixture();
    await app.start();
    const response = await app.chat();
    expect(response.status).toBe(200);
    const reply = await response.json();
    expect(reply.pendingIntent.intent).toEqual({ kind: 'prepare_mon_reduction', amountMon: '2' });
    expect(reply.assessment.capture.position.spot_balance_mon).toBe(10);
    expect(reply.assessment.capture.position.usdc_balance).toBe(40);
    expect(reply.assessment.capture.market.bids).toEqual(market().bids);
    expect(reply.assessment.capture.context.account).toBe(account);
    expect(app.client.fetchSnapshot).toHaveBeenCalledTimes(1);
    const reserves = app.ledgerCalls.filter((call) => call.path === '/reserve');
    expect(reserves).toHaveLength(2);
    expect(reserves[0].body.turnId).toBe(reserves[1].body.turnId);
    const settlements = app.ledgerCalls.filter((call) => call.path === '/settle');
    expect(settlements.map((call) => call.body.turnComplete)).toEqual([false, true]);
    const status = await (await app.send('/api/inference/status')).json();
    expect(status.visitorTurnsRemaining).toBe(4);
    expect(status.ipTurnsRemaining).toBe(9);
    expect(status.poolChargedMicros).toBe(42 + 210);
    const call = app.provider.mock.calls.find(([url]) =>
      String(url).endsWith('/chat/completions')
    )!;
    const request = JSON.parse(String(call[1]?.body));
    expect(request.model).toBe(MISTRAL_MODEL);
    expect(request).toMatchObject({
      max_tokens: 2048,
      n: 1,
      stream: false,
      reasoning_effort: 'none',
      service_tier: 'standard_only',
      tool_choice: 'none',
    });
    expect(request.response_format.json_schema.schema.required).toContain('recommendation');
    expect(request.tools).toBeUndefined();
    expect(JSON.stringify(reply)).not.toContain(app.env.TYPESAFE_API_KEY);
    expect(JSON.stringify(reply)).not.toContain(app.env.MISTRAL_API_KEY);
  });

  it('requires separate single-use approval and rejects a changed wallet, chain, mode or policy', async () => {
    const app = fixture();
    await app.start();
    const reply = await (await app.chat()).json();
    for (const patch of [
      { policyRevision: 2 },
      { account: '0x4444444444444444444444444444444444444444' },
      { chainId: 10143 },
      { mode: 'replay' },
    ]) {
      expect(
        (
          await app.send('/api/agent/approve', {
            token: reply.pendingIntent.token,
            context: { ...context(), ...patch },
          })
        ).status
      ).toBe(409);
    }
    const approved = await app.send('/api/agent/approve', {
      token: reply.pendingIntent.token,
      context: context(),
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).signingRequired).toBe(true);
    expect(
      (
        await app.send('/api/agent/approve', {
          token: reply.pendingIntent.token,
          context: context(),
        })
      ).status
    ).toBe(409);
    expect(app.client.fetchSnapshot).toHaveBeenCalledTimes(3);
  });

  it('rejects an expired or tampered intent without consuming an unrelated approval', async () => {
    const app = fixture();
    await app.start();
    const reply = await (await app.chat()).json();
    const token = reply.pendingIntent.token;
    expect(
      (
        await app.send('/api/agent/approve', {
          token: `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`,
          context: context(),
        })
      ).status
    ).toBe(422);
    app.advance(300_001);
    expect((await app.send('/api/agent/approve', { token, context: context() })).status).toBe(409);
  });

  it('shows session-policy before and after and applies only the signed validated edit', async () => {
    const app = fixture();
    app.setIntent({ kind: 'set_policy', changes: { max_order_size: 25, is_paused: true } });
    await app.start();
    const reply = await (await app.chat()).json();
    expect(reply.pendingIntent.policyBefore.max_order_size).toBe(100);
    expect(reply.pendingIntent.policyAfter.max_order_size).toBe(25);
    expect(reply.pendingIntent.policyAfter.is_paused).toBe(true);
    const approved = await (
      await app.send('/api/agent/approve', { token: reply.pendingIntent.token, context: context() })
    ).json();
    expect(approved.signingRequired).toBe(false);
    expect(approved.policyAfter.max_order_size).toBe(25);
  });

  it('uses BYOK per provider without charging or falling back to owner keys', async () => {
    const app = fixture();
    await app.start();
    const response = await app.chat(
      {},
      {
        'X-Aegis-Jev-Funding': 'byok',
        'X-Aegis-Jev-Key': 'fake-user-jev',
        'X-Aegis-Agent-Funding': 'byok',
        'X-Aegis-Agent-Key': 'fake-user-mistral',
      }
    );
    expect(response.status).toBe(200);
    const requests = app.ledgerCalls.filter((call) => call.path === '/reserve');
    expect(
      requests.every((call) => call.body.maxCostMicros === 0 && call.body.funding === 'byok')
    ).toBe(true);
    const jevCall = app.provider.mock.calls.find(
      ([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL
    )!;
    expect(new Headers(jevCall[1]?.headers).get('Authorization')).toBe('Bearer fake-user-jev');
    const agentCall = app.provider.mock.calls.find(([url]) =>
      String(url).endsWith('/chat/completions')
    )!;
    expect(new Headers(agentCall[1]?.headers).get('Authorization')).toBe(
      'Bearer fake-user-mistral'
    );
    expect(JSON.stringify(await response.json())).not.toContain('fake-user');
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(0);
  });

  it('keeps independently disabled providers off and supplies no fake Jev statistics', async () => {
    const app = fixture();
    await app.start();
    const replyResponse = await app.chat({}, { 'X-Aegis-Jev-Funding': 'disabled' });
    expect(replyResponse.status).toBe(200);
    const reply = await replyResponse.json();
    expect(reply.assessment).toBeUndefined();
    expect(reply.jevDecision).toBeUndefined();
    expect(reply.jevUnavailableReason).toContain('disabled');
    expect(app.provider.mock.calls.some(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)).toBe(
      false
    );
    app.advance();
    const before = app.provider.mock.calls.length;
    expect((await app.chat({}, { 'X-Aegis-Agent-Funding': 'disabled' })).status).toBe(503);
    expect(app.provider.mock.calls).toHaveLength(before);
  });

  it('reuses only signed, unchanged assessment capture belonging to the current context', async () => {
    const app = fixture();
    await app.start();
    const first = await (await app.chat()).json();
    app.advance();
    const second = await (await app.chat({ jevEvidence: first.assessment })).json();
    expect(second.assessment.capture).toEqual(first.assessment.capture);
    expect(
      app.provider.mock.calls.filter(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)
    ).toHaveLength(1);
    const forged = structuredClone(first.assessment);
    forged.capture.position.spot_balance_mon = 100000;
    app.advance();
    const third = await (await app.chat({ jevEvidence: forged })).json();
    expect(third.assessment.capture.position.spot_balance_mon).toBe(10);
    expect(
      app.provider.mock.calls.filter(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)
    ).toHaveLength(2);
  });

  it('rejects cached capture after a wallet change instead of relabeling old holdings', async () => {
    const app = fixture();
    await app.start();
    const first = await (await app.chat()).json();
    app.advance();
    const nextAccount = '0x4444444444444444444444444444444444444444';
    const second = await (
      await app.chat({
        jevEvidence: first.assessment,
        context: { ...context(), account: nextAccount },
      })
    ).json();
    expect(second.assessment.capture.context.account).toBe(nextAccount);
    expect(
      app.provider.mock.calls.filter(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)
    ).toHaveLength(2);
  });

  it('does not use a hosted key when a selected BYOK key is missing', async () => {
    const app = fixture();
    await app.start();
    const reply = await (await app.chat({}, { 'X-Aegis-Jev-Funding': 'byok' })).json();
    expect(reply.jevUnavailableReason).toContain('Add your Jev key');
    expect(app.provider.mock.calls.some(([url]) => String(url) === TYPESAFE_SYSTEM_ONE_URL)).toBe(
      false
    );
    app.advance();
    const before = app.provider.mock.calls.length;
    expect((await app.chat({}, { 'X-Aegis-Agent-Funding': 'byok' })).status).toBe(503);
    expect(app.provider.mock.calls).toHaveLength(before);
  });

  it('never reuses a previous provider BYOK key with Mistral', async () => {
    const app = fixture();
    await app.start();
    const response = await app.chat(
      {},
      { 'X-Aegis-Gemini-Funding': 'byok', 'X-Aegis-Gemini-Key': 'private-old-key' }
    );
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain('private-old-key');
    expect(
      app.provider.mock.calls.some(
        ([url]) =>
          String(url) === TYPESAFE_SYSTEM_ONE_URL || String(url).endsWith('/chat/completions')
      )
    ).toBe(false);
  });

  it('keeps old sponsored sessions compatible and reports the actual current provider', async () => {
    const app = fixture();
    await app.start();
    const response = await app.chat({}, { 'X-Aegis-Gemini-Funding': 'sponsored' });
    expect(response.status).toBe(200);
    expect((await response.json()).provider).toBe('mistral');
    const status = await (await app.send('/api/inference/status')).json();
    expect(status.agentProvider).toBe('mistral');
    expect(status.agentConfigured).toBe(true);
    expect(status.model).toBe('mistral-small-2603');
  });

  it('retains uncertain Jev cost and accurately labels its failure while Scout can explain', async () => {
    const app = fixture();
    app.setJev({ error: 'private provider detail must not escape' }, 503);
    await app.start();
    const response = await app.chat();
    expect(response.status).toBe(200);
    const reply = await response.json();
    expect(reply.jevUnavailableReason).toBe('Jev is unavailable (HTTP 503)');
    expect(JSON.stringify(reply)).not.toContain('private provider detail');
    expect(reply.jevDecision).toBeUndefined();
    const first = app.ledgerCalls.filter((call) => call.path === '/settle')[0];
    expect(first.body.uncertain).toBe(true);
    expect(
      (await (await app.send('/api/inference/status')).json()).poolChargedMicros
    ).toBeGreaterThan(210);
  });

  it('does not accept malformed Jev output as genuine probabilities', async () => {
    const app = fixture();
    app.setJev({ model: JEV_MODEL, answers: {}, usage: { input_tokens: 1 } });
    await app.start();
    const reply = await (await app.chat()).json();
    expect(reply.jevDecision).toBeUndefined();
    expect(reply.assessment).toBeUndefined();
    expect(reply.jevUnavailableReason).toContain('unavailable');
  });

  it('closes the pipeline turn when the conservative context bound is exceeded after Jev', async () => {
    const app = fixture();
    await app.start();
    expect((await app.chat({ message: '界'.repeat(2800) })).status).toBe(422);
    const status = await (await app.send('/api/inference/status')).json();
    expect(status.busy).toBe(false);
    expect(
      app.ledgerCalls.filter((call) => call.path === '/settle').at(-1)?.body.turnComplete
    ).toBe(true);
    app.advance();
    expect((await app.chat()).status).toBe(200);
  });

  it('does not issue an actionable intent for incomplete Scout output, over-cap sales or fabricated citations', async () => {
    const app = fixture();
    await app.start();
    app.setScoutStatus('length');
    expect((await app.chat()).status).toBe(502);
    app.advance();
    app.setScoutStatus('stop');
    app.setIntent({ kind: 'prepare_mon_reduction', amountMon: '1000' });
    const reply = await (await app.chat()).json();
    expect(reply.recommendation).toEqual({ kind: 'none' });
    expect(reply.pendingIntent).toBeUndefined();
    app.advance();
    app.setIntent({ kind: 'none' });
    app.setCitations(['invented-news']);
    expect((await app.chat()).status).toBe(502);
  });

  it('retains the conservative reservation and never retries a failed Scout request', async () => {
    const app = fixture();
    await app.start();
    app.setScoutResponse({ error: { message: 'private upstream detail' } }, 503);
    const response = await app.chat();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Scout is unavailable (HTTP 503)' });
    expect(
      app.provider.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))
    ).toHaveLength(1);
    const status = await (await app.send('/api/inference/status')).json();
    expect(status.poolChargedMicros).toBe(42 + 2458);
    expect(status.busy).toBe(false);
  });

  it.each([
    ['60', 60],
    [new Date(at + 45_000).toUTCString(), 45],
  ])(
    'explains the provider limit and forwards a safe retry duration from %s',
    async (header, seconds) => {
      const app = fixture();
      await app.start();
      app.setScoutResponse({ error: { message: 'private upstream detail' } }, 429, {
        'Retry-After': String(header),
        'X-Private-Provider-Detail': 'private header',
      });
      const response = await app.chat();
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe(String(seconds));
      expect(response.headers.has('X-Private-Provider-Detail')).toBe(false);
      expect(await response.json()).toEqual({
        error: `Scout's provider rate or usage limit was reached. No action was prepared. Wait at least ${seconds} seconds before requesting again.`,
        retryAfterMs: Number(seconds) * 1000,
        code: 'provider_rate_limited',
      });
      expect(
        app.provider.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))
      ).toHaveLength(1);
      const status = await (await app.send('/api/inference/status')).json();
      expect(status.poolChargedMicros).toBe(42 + 2458);
      expect(status.busy).toBe(false);
    }
  );

  it.each([
    undefined,
    '-10',
    '0',
    '1.5',
    '999999',
    'private upstream detail',
    new Date(at - 1000).toUTCString(),
    new Date(at + 86_401_000).toUTCString(),
    'Thu, 09 Oct 2026 12:01:00 GMT',
  ])('omits missing, malformed or unreasonable provider retry hints: %s', async (header) => {
    const app = fixture();
    await app.start();
    app.setScoutResponse(
      { error: { message: 'private upstream detail' } },
      429,
      header === undefined ? {} : { 'Retry-After': header }
    );
    const response = await app.chat();
    expect(response.status).toBe(429);
    expect(response.headers.has('Retry-After')).toBe(false);
    expect(await response.json()).toEqual({
      error: "Scout's provider rate or usage limit was reached. No action was prepared.",
      code: 'provider_rate_limited',
    });
    expect(
      app.provider.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))
    ).toHaveLength(1);
  });

  it('identifies a provider timeout without leaking its error detail or retrying', async () => {
    const app = fixture();
    await app.start();
    app.setScoutError(new DOMException('private provider detail', 'TimeoutError'));
    const response = await app.chat();
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'Scout timed out. No action was prepared.' });
    expect(
      app.provider.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'))
    ).toHaveLength(1);
    const status = await (await app.send('/api/inference/status')).json();
    expect(status.poolChargedMicros).toBe(42 + 2458);
    expect(status.busy).toBe(false);
  });

  it('fails closed on a different model identity and retains cost when usage is inconsistent', async () => {
    const app = fixture();
    await app.start();
    app.setScoutResponse({
      model: 'unexpected-model',
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1200 },
    });
    const response = await app.chat();
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('unexpected model');
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(
      42 + 2458
    );
  });

  it('retains maximum cost when the provider omits completion usage', async () => {
    const app = fixture();
    await app.start();
    app.setScoutResponse({
      usage: { prompt_tokens: 1000, total_tokens: 1100 },
    });
    expect((await app.chat()).status).toBe(200);
    expect((await (await app.send('/api/inference/status')).json()).poolChargedMicros).toBe(
      42 + 2458
    );
  });

  it('returns only dated allowlisted supplied news citations', async () => {
    const app = fixture();
    app.setCitations([app.news.articles[0].id]);
    await app.start();
    const reply = await (await app.chat()).json();
    expect(reply.citations).toEqual(app.news.articles);
    const request = JSON.parse(
      String(
        app.provider.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'))![1]?.body
      )
    );
    expect(JSON.parse(request.messages[1].content).tools.news.articles[0].publishedAt).toBe(
      at - 60_000
    );
    expect(request.tools).toBeUndefined();
  });

  it('rejects invalid policy drafts and unsupported networks before paid calls', async () => {
    const app = fixture();
    await app.start();
    expect(
      (
        await app.chat({
          context: { ...context(), policy: { ...context().policy, max_order_size: -1 } },
        })
      ).status
    ).toBe(422);
    expect((await app.chat({ context: { ...context(), chainId: 10143 } })).status).toBe(409);
    expect(
      app.provider.mock.calls.filter(
        ([url]) =>
          String(url) === TYPESAFE_SYSTEM_ONE_URL || String(url).endsWith('/chat/completions')
      )
    ).toHaveLength(0);
  });

  it('routes only actual replay controls in paper mode without live balance reads', async () => {
    const app = fixture();
    app.setIntent({ kind: 'replay_control', action: 'step' });
    await app.start();
    const reply = await (
      await app.chat({
        context: { ...context(), mode: 'replay', scenarioId: 'liquidity-shock' },
        replayInput: inputPayload(),
      })
    ).json();
    expect(reply.pendingIntent.intent).toEqual({ kind: 'replay_control', action: 'step' });
    expect(app.client.fetchSnapshot).not.toHaveBeenCalled();
    expect(app.client.getWalletBalances).not.toHaveBeenCalled();
  });
});
