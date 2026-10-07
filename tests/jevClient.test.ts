import { describe, it, expect, vi } from 'vitest';
import { JevClient, buildJevRequest, parseJevResponse, TYPESAFE_SYSTEM_ONE_URL } from '../src/jev/client.ts';
import { calculateConfidence } from '../src/jev/confidence.ts';
import { buildJevStatePayload, hashStatePayload } from '../src/jev/stateBuilder.ts';
import type { JevStatePayload } from '../src/types/index.ts';

const payload = (): JevStatePayload => buildJevStatePayload(
  { pair: 'MON/USDC', mid_price: 4, spread_bps: 5, bid_depth_25bps: 10000, ask_depth_25bps: 10000 } as any,
  { spot_exposure_usd: 1000, net_delta: 1000 } as any,
  { open_orders: [], oldest_order_age: 0 } as any,
  { position_utilization: 0.5, volatility_percentile: 20 } as any,
  { max_position_usd: 2000, max_leverage: 2, max_daily_loss: 400, permitted_actions: ['hold', 'increase_position'] } as any
);

const remoteResponse = () => ({
  model: 'jev-1.13.0',
  answers: {
    action: { type: 'choice', choice: 'increase_position', confidence: 0.9, probabilities: { increase_position: 0.9, reduce_position: 0.02, hold: 0.06, hedge: 0.01, cancel_orders: 0.01 } },
    regime: { type: 'choice', choice: 'trending_up', confidence: 0.9, probabilities: { trending_up: 0.9, trending_down: 0.02, range_bound: 0.02, high_volatility: 0.02, liquidity_stress: 0.02, uncertain: 0.02 } },
    risk: { type: 'choice', choice: 'low', confidence: 0.8, probabilities: { very_low: 0.1, low: 0.8, moderate: 0.08, high: 0.01, critical: 0.01 } },
    anomaly: { type: 'noul', noul: 0.05 }, cancel_orders: { type: 'noul', noul: 0.05 }
  },
  usage: { input_tokens: 600, output_tokens: 100 }
});

const fetchResponse = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));

describe('Jev HTTP contract, provenance and fail-safe behavior', () => {
  it('sends structured state and five typed questions to the documented endpoint', async () => {
    const input = payload();
    const fetcher = vi.fn(() => fetchResponse(remoteResponse()));
    const decision = await new JevClient({ apiKey: 'test-key', mode: 'live', fetcher: fetcher as typeof fetch }).evaluate(input);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TYPESAFE_SYSTEM_ONE_URL);
    expect(JSON.parse(request.body as string)).toEqual(buildJevRequest(input));
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(decision.source).toBe('typesafe_jev');
    expect(decision.origin).toBe('typesafe_jev');
    expect(decision.model).toBe('jev-1.13.0');
    expect(decision.model_confidence).toBe(0.9);
    expect(decision.selected_action).toBe('increase_position');
  });

  it('uses same-origin gateway without exposing an API key in browser requests', async () => {
    const fetcher = vi.fn(() => fetchResponse(remoteResponse()));
    await new JevClient({ mode: 'live', proxyUrl: '/api/jev', apiKey: 'must-not-leak', fetcher: fetcher as typeof fetch }).evaluate(payload());
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/jev');
    expect((request.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('missing credentials means fallback, never a silent heuristic', async () => {
    const fetcher = vi.fn();
    const decision = await new JevClient({ mode: 'live', apiKey: '', fetcher: fetcher as typeof fetch }).evaluate(payload());
    expect(decision.source).toBe('fallback');
    expect(decision.origin).toBe('fallback');
    expect(decision.error).toContain('not configured');
    expect(decision.selected_action).toBe('hold');
    expect(decision.action_probabilities.increase_position).toBe(0);
    expect(decision.action_probabilities.hedge).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('explicit disabled mode never fetches or claims missing credentials', async () => {
    const fetcher = vi.fn();
    const decision = await new JevClient({ mode: 'disabled', proxyUrl: '/api/jev', apiKey: 'configured-key', fetcher: fetcher as typeof fetch }).evaluate(payload());
    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.source).toBe('fallback');
    expect(decision.selected_action).toBe('hold');
    expect(decision.error).toBe('Live inference was not requested; use Evaluate with Jev to run the model.');
    expect(decision.action_probabilities.increase_position).toBe(0);
    expect(decision.action_probabilities.hedge).toBe(0);
  });

  it.each(['missing', 'negative', 'nan', 'infinite', 'incomplete', 'wrong-total', 'wrong-choice', 'noul-out-of-range'])('rejects malformed %s API answers instead of fabricating probabilities', async (issue) => {
    const data = remoteResponse();
    if (issue === 'missing') delete (data as any).answers;
    if (issue === 'negative') data.answers.action.probabilities.hold = -1;
    if (issue === 'nan') data.answers.action.probabilities.hold = NaN;
    if (issue === 'infinite') data.answers.action.probabilities.hold = Infinity;
    if (issue === 'incomplete') delete (data.answers.action.probabilities as any).hedge;
    if (issue === 'wrong-total') data.answers.action.probabilities.hold = 0.6;
    if (issue === 'wrong-choice') data.answers.action.choice = 'hold';
    if (issue === 'noul-out-of-range') data.answers.anomaly.noul = 2;
    const decision = await new JevClient({ apiKey: 'test-key', mode: 'live', fetcher: (() => fetchResponse(data)) as typeof fetch }).evaluate(payload());
    expect(decision.source).toBe('fallback');
    expect(decision.error).toBeTruthy();
    expect(decision.selected_action).toBe('hold');
  });

  it('preserves exact zeros in valid remote probability vectors', () => {
    const data = remoteResponse();
    data.answers.action.probabilities = { increase_position: 1, reduce_position: 0, hold: 0, hedge: 0, cancel_orders: 0 };
    const decision = parseJevResponse(data, payload());
    expect(decision.action_probabilities.hedge).toBe(0);
    expect(decision.action_probabilities.increase_position).toBe(1);
  });

  it('uses provider confidence as well as entropy and margin for abstention', () => {
    const data = remoteResponse();
    data.answers.action.confidence = 0.2;
    const decision = parseJevResponse(data, payload());
    expect(decision.selected_action).toBe('hold');
    expect(decision.abstain_flag).toBe(true);
  });

  it('independent anomaly evidence blocks exposure increase', () => {
    const data = remoteResponse();
    data.answers.anomaly.noul = 0.95;
    expect(parseJevResponse(data, payload()).selected_action).toBe('hold');
  });

  it('high order-cancellation probability is acted on even with uncertain direction', () => {
    const input = payload();
    input.orders.open_orders_count = 2;
    const data = remoteResponse();
    data.answers.action.confidence = 0.1;
    data.answers.cancel_orders.noul = 0.95;
    expect(parseJevResponse(data, input).selected_action).toBe('cancel_orders');
  });

  it('does not cache network failure and can recover on the next call', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementationOnce(() => fetchResponse(remoteResponse()));
    const client = new JevClient({ apiKey: 'test-key', mode: 'live', fetcher });
    expect((await client.evaluate(payload())).source).toBe('fallback');
    expect((await client.evaluate(payload())).source).toBe('typesafe_jev');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cache hits retain original model provenance and are immune to caller mutation', async () => {
    const fetcher = vi.fn(() => fetchResponse(remoteResponse()));
    const client = new JevClient({ apiKey: 'test-key', mode: 'live', fetcher: fetcher as typeof fetch });
    const first = await client.evaluate(payload());
    first.action_probabilities.increase_position = 0;
    const cached = await client.evaluate(payload());
    expect(cached.source).toBe('cached');
    expect(cached.origin).toBe('typesafe_jev');
    expect(cached.model).toBe('jev-1.13.0');
    expect(cached.action_probabilities.increase_position).toBe(0.9);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('expired decisions are reevaluated', async () => {
    const fetcher = vi.fn(() => fetchResponse(remoteResponse()));
    const client = new JevClient({ apiKey: 'test-key', mode: 'live', cacheTtlMs: 0, fetcher: fetcher as typeof fetch });
    await client.evaluate(payload());
    await client.evaluate(payload());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('timeouts fail closed with no new risk', async () => {
    const fetcher = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('Inference timed out')));
    }));
    const decision = await new JevClient({ apiKey: 'test-key', mode: 'live', timeoutMs: 5, fetcher: fetcher as typeof fetch }).evaluate(payload());
    expect(decision.source).toBe('fallback');
    expect(decision.error).toContain('timed out');
  });

  it('offline heuristics are explicit and measured without invented network latency', async () => {
    const decision = await new JevClient({ mode: 'simulated' }).evaluate(payload());
    expect(decision.source).toBe('simulated');
    expect(decision.origin).toBe('simulated');
    expect(decision.model).toBe('deterministic-heuristic-v2');
    for (const distribution of [decision.action_probabilities, decision.risk_probabilities, decision.regime_probabilities]) {
      expect(Object.values(distribution).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });
});

describe('Confidence and audit hashing', () => {
  it('uniform or invalid probabilities abstain', () => {
    expect(calculateConfidence({ a: 0.2, b: 0.2, c: 0.2, d: 0.2, e: 0.2 }).should_abstain).toBe(true);
    expect(calculateConfidence({ a: NaN, b: 1 }).should_abstain).toBe(true);
    expect(calculateConfidence({ a: Infinity }).should_abstain).toBe(true);
    expect(calculateConfidence({ a: -1, b: 2 }).should_abstain).toBe(true);
    expect(calculateConfidence({ a: 0.9, b: 0.1 }).should_abstain).toBe(false);
  });

  it('state hashes are canonical, policy-sensitive and full collision-resistant digests', () => {
    const input = payload();
    const reordered = Object.fromEntries(Object.entries(input).reverse()) as JevStatePayload;
    expect(hashStatePayload(input)).toMatch(/^st_[a-f0-9]{64}$/);
    expect(hashStatePayload(input)).toBe(hashStatePayload(reordered));
    reordered.policy = { ...reordered.policy, max_position_usd: 1000 };
    expect(hashStatePayload(input)).not.toBe(hashStatePayload(reordered));
  });
});
