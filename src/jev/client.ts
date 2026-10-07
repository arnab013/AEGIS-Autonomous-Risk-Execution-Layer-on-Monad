// src/jev/client.ts - TypeSafe AI / Jev Client with Bounded Schemas, Caching, and Resilient Fallback

import type {
  JevStatePayload,
  JevDecisionState,
  TradingAction,
  MarketRegime,
  RiskLevel
} from '../types/index.ts';
import { hashStatePayload } from './stateBuilder.ts';
import { calculateConfidence } from './confidence.ts';

export const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_SCHEMA_VERSION = 'aegis-policy-v2';
const ACTIONS: TradingAction[] = ['increase_position', 'reduce_position', 'hold', 'hedge', 'cancel_orders'];
const REGIMES: MarketRegime[] = ['trending_up', 'trending_down', 'range_bound', 'high_volatility', 'liquidity_stress', 'uncertain'];
const RISKS: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'critical'];

/** Bound all externally supplied state before spending an inference request. */
export function assertJevPayload(payload: JevStatePayload): void {
  const fail = (field: string): never => { throw new TypeError(`Invalid Jev state: ${field}`); };
  const number = (value: unknown, field: string, minimum = -1e12, maximum = 1e12) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(field);
  };
  if (!payload || typeof payload !== 'object') fail('payload');
  const numeric: Record<string, string[]> = {
    market: ['mid_price', 'spread_bps', 'return_10s', 'return_1m', 'volatility_1m', 'volatility_5m', 'bid_depth_25bps', 'ask_depth_25bps', 'orderbook_imbalance', 'aggressive_buy_flow', 'aggressive_sell_flow'],
    position: ['spot_exposure_usd', 'perp_exposure_usd', 'net_delta', 'leverage', 'unrealized_pnl', 'realized_pnl_today', 'drawdown_today'],
    orders: ['open_orders_count', 'oldest_order_age', 'distance_from_mid', 'filled_recently'],
    risk: ['position_utilization', 'leverage_utilization', 'daily_loss_utilization', 'volatility_percentile', 'liquidity_stress_score'],
    policy: ['max_position_usd', 'max_leverage', 'max_daily_loss']
  };
  if (Object.keys(payload).some(section => !(section in numeric))) fail('unknown section');
  const optional: Record<string, string[]> = {
    market: ['pair'], position: [], orders: [], risk: [],
    policy: ['allowed_actions', 'max_order_size', 'max_slippage_bps', 'allowed_assets', 'allowed_venues', 'is_paused', 'stale_order_timeout_seconds']
  };
  for (const [section, fields] of Object.entries(numeric)) {
    const values = (payload as any)[section];
    if (!values || typeof values !== 'object' || Array.isArray(values)) fail(section);
    if (Object.keys(values).some(field => !fields.includes(field) && !optional[section].includes(field))) fail(`${section}: unknown field`);
    for (const field of fields) number(values[field], `${section}.${field}`);
  }
  if (typeof payload.market.pair !== 'string' || !/^[A-Z0-9]{1,10}\/[A-Z0-9]{1,10}$/.test(payload.market.pair)) fail('market.pair');
  if (payload.market.mid_price <= 0) fail('market.mid_price');
  for (const field of ['spread_bps', 'volatility_1m', 'volatility_5m', 'bid_depth_25bps', 'ask_depth_25bps', 'aggressive_buy_flow', 'aggressive_sell_flow']) number((payload.market as any)[field], `market.${field}`, 0);
  number(payload.market.orderbook_imbalance, 'market.orderbook_imbalance', -1, 1);
  for (const field of ['spot_exposure_usd', 'leverage', 'drawdown_today']) number((payload.position as any)[field], `position.${field}`, 0);
  for (const [field, value] of Object.entries(payload.orders)) number(value, `orders.${field}`, 0);
  if (!Number.isInteger(payload.orders.open_orders_count) || !Number.isInteger(payload.orders.filled_recently)) fail('orders count');
  for (const [field, value] of Object.entries(payload.risk)) number(value, `risk.${field}`, 0);
  number(payload.risk.volatility_percentile, 'risk.volatility_percentile', 0, 100);
  number(payload.risk.liquidity_stress_score, 'risk.liquidity_stress_score', 0, 100);
  for (const field of ['max_position_usd', 'max_leverage', 'max_daily_loss', 'max_order_size', 'max_slippage_bps', 'stale_order_timeout_seconds']) {
    const value = (payload.policy as any)[field];
    if (value !== undefined) number(value, `policy.${field}`, 0);
  }
  const actions = payload.policy.allowed_actions;
  if (!Array.isArray(actions) || actions.length > ACTIONS.length || actions.some(action => !ACTIONS.includes(action)) || new Set(actions).size !== actions.length) fail('policy.allowed_actions');
  if (payload.policy.is_paused !== undefined && typeof payload.policy.is_paused !== 'boolean') fail('policy.is_paused');
  for (const field of ['allowed_assets', 'allowed_venues'] as const) {
    const values = payload.policy[field];
    if (values !== undefined && (!Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9_]{1,15}$/.test(value)))) fail(`policy.${field}`);
  }
}

/** Official System One HTTP shape. Shared by the browser proxy and server. */
export function buildJevRequest(payload: JevStatePayload, model = 'jev-latest') {
  assertJevPayload(payload);
  return {
    model,
    state: payload,
    questions: {
      action: {
        type: 'choice',
        instructions: 'Which bounded portfolio action is supported by the current market evidence? This is a risk assessment, not a price prediction. Use hold for mixed evidence. Code separately enforces all user limits.',
        criteria: {
          increase_position: 'Clear positive short-term flow and trend, liquid book, low risk; add spot inventory.',
          reduce_position: 'Downside evidence or elevated risk warrants reducing existing spot inventory.',
          hold: 'Balanced or conflicting signals, weak evidence, or no reason to change inventory.',
          hedge: 'Downside risk with positive unhedged spot exposure warrants a limited protective short.',
          cancel_orders: 'Existing resting orders face stale prices, adverse flow or deteriorating liquidity.'
        }
      },
      regime: {
        type: 'choice', instructions: 'Which regime best describes the observed price changes, book depth and flow?',
        criteria: {
          trending_up: 'Positive drift with supporting bid imbalance and buying flow.',
          trending_down: 'Negative drift with supporting ask imbalance and selling flow.',
          range_bound: 'Small price changes, tight spread and balanced depth.',
          high_volatility: 'Large variable returns and rapidly widening spread.',
          liquidity_stress: 'Thin depth, wide spread and strongly one-sided flow.',
          uncertain: 'Too little history or contradictory evidence.'
        }
      },
      risk: {
        type: 'choice', instructions: 'What is the current portfolio risk severity given exposure, losses and market liquidity?',
        criteria: {
          very_low: 'Minimal exposure and losses in a calm liquid market.', low: 'Comfortable limits and ordinary market variance.',
          moderate: 'Noticeable inventory, loss or liquidity stress.', high: 'Near policy limits or significant downside stress.',
          critical: 'Loss limit breached or severe liquidity and volatility shock.'
        }
      },
      anomaly: { type: 'noul', instructions: 'Is the supplied market state anomalous, with extreme flow imbalance, volatility or sudden liquidity loss?' },
      cancel_orders: { type: 'noul', instructions: 'Do any existing resting orders warrant immediate cancellation due to age, adverse flow or liquidity stress? Return no when no orders exist.' }
    }
  };
}

function probability(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid TypeSafe probability: ${name}`);
  }
  return value;
}

function choiceAnswer<T extends string>(value: any, keys: T[], name: string): { probabilities: Record<T, number>; confidence: number } {
  if (!value || value.type !== 'choice' || !keys.includes(value.choice) || !value.probabilities) {
    throw new Error(`Invalid TypeSafe choice answer: ${name}`);
  }
  const raw = value.probabilities;
  if (Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key as T))) {
    throw new Error(`Unexpected TypeSafe options: ${name}`);
  }
  const probabilities = Object.fromEntries(keys.map(key => [key, probability(raw[key], `${name}.${key}`)])) as Record<T, number>;
  const total = Object.values<number>(probabilities).reduce((sum, p) => sum + p, 0);
  if (Math.abs(total - 1) > 0.01) throw new Error(`TypeSafe distribution does not sum to one: ${name}`);
  if (probabilities[value.choice as T] + 0.001 < Math.max(...Object.values<number>(probabilities))) {
    throw new Error(`TypeSafe choice does not match distribution: ${name}`);
  }
  // Permit rounding noise only, preserving exact zero probabilities.
  for (const key of keys) probabilities[key] /= total;
  return { probabilities, confidence: probability(value.confidence, `${name}.confidence`) };
}

/** Reject malformed responses; never manufacture model probabilities from missing fields. */
export function parseJevResponse(data: any, payload: JevStatePayload): Omit<JevDecisionState, 'latency_ms' | 'source'> {
  if (typeof data?.model !== 'string' || !data.model) throw new Error('Missing TypeSafe model identity');
  const action = choiceAnswer(data.answers?.action, ACTIONS, 'action');
  const regime = choiceAnswer(data.answers?.regime, REGIMES, 'regime');
  const risk = choiceAnswer(data.answers?.risk, RISKS, 'risk');
  if (data.answers?.anomaly?.type !== 'noul' || data.answers?.cancel_orders?.type !== 'noul') throw new Error('Missing TypeSafe Noul answers');
  const p_anomaly = probability(data.answers.anomaly.noul, 'anomaly');
  const p_cancel_orders = probability(data.answers.cancel_orders.noul, 'cancel_orders');
  const conf = calculateConfidence(action.probabilities);
  const abstain = conf.should_abstain || action.confidence < 0.65;
  const top = ACTIONS.reduce((best, key) => action.probabilities[key] > action.probabilities[best] ? key : best, 'hold');
  let selected_action: TradingAction = abstain ? 'hold' : top;
  if (selected_action === 'increase_position' && (p_anomaly >= 0.7 || risk.probabilities.high + risk.probabilities.critical >= 0.6)) selected_action = 'hold';
  // Order cancellation is safe even when directional inference is uncertain.
  if (payload.orders.open_orders_count > 0 && p_cancel_orders >= 0.75) selected_action = 'cancel_orders';
  return {
    action_probabilities: action.probabilities, regime_probabilities: regime.probabilities, risk_probabilities: risk.probabilities,
    p_anomaly, p_cancel_orders, selected_action,
    max_probability: conf.max_probability, entropy: conf.entropy, top_two_margin: conf.top_two_margin,
    confidence_score: conf.confidence_score, abstain_flag: abstain,
    model: data.model, model_confidence: action.confidence, origin: 'typesafe_jev', schema_version: JEV_SCHEMA_VERSION
  };
}

export interface JevClientConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  timeoutMs?: number;
  enableCache?: boolean;
  mode?: 'live' | 'simulated' | 'auto' | 'disabled';
  proxyUrl?: string;
  fetcher?: typeof fetch;
  cacheTtlMs?: number;
}

export class JevClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private timeoutMs: number;
  private enableCache: boolean;
  private mode: 'live' | 'simulated' | 'auto' | 'disabled';
  private proxyUrl?: string;
  private fetcher: typeof fetch;
  private cacheTtlMs: number;
  private cache: Map<string, { decision: JevDecisionState; expires: number }> = new Map();

  constructor(config: JevClientConfig = {}) {
    this.apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env?.TYPESAFE_API_KEY : '') ?? '';
    this.apiUrl = config.apiUrl || TYPESAFE_SYSTEM_ONE_URL;
    this.model = config.model || 'jev-latest';
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.enableCache = config.enableCache ?? true;
    this.mode = config.mode || 'auto';
    this.proxyUrl = config.proxyUrl ?? (typeof window !== 'undefined' ? '/api/jev' : undefined);
    this.fetcher = config.fetcher ?? fetch;
    this.cacheTtlMs = config.cacheTtlMs ?? 10_000;
  }

  /**
   * Evaluates bounded questions across Action, Market Regime, Risk, Anomaly, and Order Management.
   */
  public async evaluate(payload: JevStatePayload): Promise<JevDecisionState> {
    if (this.mode === 'disabled') {
      return { ...this.generateFallbackState(payload, 0), error: 'Live inference was not requested; use Evaluate with Jev to run the model.' };
    }
    const stateHash = hashStatePayload(payload);
    const cacheKey = `${JEV_SCHEMA_VERSION}_${this.mode}_${this.model}_${stateHash}`;

    if (this.enableCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (cached.expires > Date.now()) return { ...structuredClone(cached.decision), latency_ms: 0, source: 'cached' };
      this.cache.delete(cacheKey);
    }

    const startTime = performance.now();

    // If configured for live or auto mode with an active API key, query the live TypeSafe AI model
    if (this.mode !== 'simulated') {
      if (!this.proxyUrl && (!this.apiKey || this.apiKey === 'your_typesafe_api_key_here')) {
        return { ...this.generateFallbackState(payload, 0), error: 'TypeSafe API key is not configured; live inference is unavailable.' };
      }
      try {
        const response = await this.queryRemoteJev(payload);
        const latency = Math.round(performance.now() - startTime);
        const decisionState: JevDecisionState = {
          ...response,
          latency_ms: latency,
          source: 'typesafe_jev'
        };
        if (this.enableCache) {
          this.saveCache(cacheKey, decisionState);
        }
        return decisionState;
      } catch (err) {
        const fallback = this.generateFallbackState(payload, Math.round(performance.now() - startTime));
        return { ...fallback, error: err instanceof Error ? err.message : 'TypeSafe inference unavailable' };
      }
    }

    // High-fidelity probabilistic decision engine grounded on market physics
    const simulatedDecision = this.synthesizeProbabilities(payload);
    const latency = Math.round(performance.now() - startTime);

    const decisionState: JevDecisionState = {
      ...simulatedDecision,
      latency_ms: latency,
      source: 'simulated', origin: 'simulated', model: 'deterministic-heuristic-v2', schema_version: JEV_SCHEMA_VERSION
    };

    if (this.enableCache) {
      this.saveCache(cacheKey, decisionState);
    }

    return decisionState;
  }

  private saveCache(key: string, decision: JevDecisionState): void {
    if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { decision: structuredClone(decision), expires: Date.now() + this.cacheTtlMs });
  }

  /**
   * Queries the TypeSafe AI / Jev REST endpoint (POST /v1/systemone).
   */
  private async queryRemoteJev(payload: JevStatePayload): Promise<Omit<JevDecisionState, 'latency_ms' | 'source'>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetcher(this.proxyUrl || this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.proxyUrl ? {} : { Authorization: `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify(buildJevRequest(payload, this.model)),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`TypeSafe inference HTTP ${res.status}`);
      const data = await res.json();
      return parseJevResponse(data, payload);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Explicit offline heuristic for deterministic paper experiments; not model inference. */
  public synthesizeProbabilities(payload: JevStatePayload): Omit<JevDecisionState, 'latency_ms' | 'source'> {
    const { market, position, risk, orders } = payload;

    // 1. Regime distribution calculation
    let r_trending_up = 0.05;
    let r_trending_down = 0.05;
    let r_range_bound = 0.10;
    let r_high_volatility = 0.05;
    let r_liquidity_stress = 0.05;
    let r_uncertain = 0.10;

    if (risk.volatility_percentile > 80 || (market.spread_bps > 30 && market.orderbook_imbalance < -0.3)) {
      r_high_volatility += 0.65;
      r_liquidity_stress += 0.20;
    } else if (market.return_1m > 0.005 && market.orderbook_imbalance > 0.25) {
      r_trending_up += 0.70;
      r_range_bound += 0.10;
    } else if (market.return_1m < -0.008 && market.orderbook_imbalance < -0.3) {
      r_trending_down += 0.65;
      r_high_volatility += 0.15;
    } else if (Math.abs(market.return_1m) < 0.003 && market.spread_bps < 8) {
      r_range_bound += 0.70;
    } else {
      r_uncertain += 0.50;
      r_range_bound += 0.20;
    }

    const regimeProbs = this.normalizeDistribution<MarketRegime>({
      trending_up: r_trending_up,
      trending_down: r_trending_down,
      range_bound: r_range_bound,
      high_volatility: r_high_volatility,
      liquidity_stress: r_liquidity_stress,
      uncertain: r_uncertain
    }, ['trending_up', 'trending_down', 'range_bound', 'high_volatility', 'liquidity_stress', 'uncertain']);

    // 2. Risk distribution calculation
    let rk_very_low = 0.05;
    let rk_low = 0.10;
    let rk_moderate = 0.15;
    let rk_high = 0.05;
    let rk_critical = 0.02;

    if (risk.volatility_percentile > 90 || risk.daily_loss_utilization > 0.85 || risk.liquidity_stress_score > 75) {
      rk_critical += 0.45;
      rk_high += 0.45;
    } else if (risk.volatility_percentile > 70 || market.orderbook_imbalance < -0.5 || risk.position_utilization > 0.75) {
      rk_high += 0.60;
      rk_moderate += 0.25;
    } else if (risk.volatility_percentile < 35 && market.spread_bps < 7 && risk.position_utilization < 0.5) {
      rk_very_low += 0.45;
      rk_low += 0.40;
    } else {
      rk_moderate += 0.60;
      rk_low += 0.20;
    }

    const riskProbs = this.normalizeDistribution<RiskLevel>({
      very_low: rk_very_low,
      low: rk_low,
      moderate: rk_moderate,
      high: rk_high,
      critical: rk_critical
    }, ['very_low', 'low', 'moderate', 'high', 'critical']);

    // 3. Action distribution calculation
    let a_increase = 0.05;
    let a_reduce = 0.05;
    let a_hold = 0.10;
    let a_hedge = 0.05;
    let a_cancel = 0.05;

    const pHighOrCritical = riskProbs.high + riskProbs.critical;

    if (orders.oldest_order_age > 120 || (pHighOrCritical > 0.7 && orders.open_orders_count > 0)) {
      // Urgent order cleanup
      a_cancel += 0.70;
      a_hold += 0.15;
    } else if (regimeProbs.trending_up > 0.50) {
      // Bullish momentum: Jev proposes increasing exposure (which the Hard Risk Gate must validate)
      a_increase += 0.74;
      a_hold += 0.18;
      a_reduce += 0.04;
    } else if (pHighOrCritical > 0.65 && position.spot_exposure_usd > 500 && position.net_delta > 300) {
      // Significant downside risk with spot exposure -> dynamic perp hedge
      a_hedge += 0.72;
      a_reduce += 0.16;
      a_hold += 0.08;
      a_increase += 0.04;
    } else if (pHighOrCritical > 0.75) {
      // Immediate de-risking
      a_reduce += 0.65;
      a_hedge += 0.20;
      a_hold += 0.10;
    } else {
      // Default balanced stance
      a_hold += 0.75;
      a_increase += 0.10;
      a_reduce += 0.10;
    }

    const actionProbs = this.normalizeDistribution<TradingAction>({
      increase_position: a_increase,
      reduce_position: a_reduce,
      hold: a_hold,
      hedge: a_hedge,
      cancel_orders: a_cancel
    }, ['increase_position', 'reduce_position', 'hold', 'hedge', 'cancel_orders']);

    const conf = calculateConfidence(actionProbs);
    const selected_action = this.selectTopAction(actionProbs, riskProbs, conf.should_abstain);

    const p_anomaly = Number((risk.volatility_percentile > 85 || Math.abs(market.orderbook_imbalance) > 0.85 ? 0.78 : 0.08).toFixed(3));
    const p_cancel_orders = Number((orders.oldest_order_age > 60 || pHighOrCritical > 0.6 ? 0.85 : 0.05).toFixed(3));

    return {
      action_probabilities: actionProbs,
      regime_probabilities: regimeProbs,
      risk_probabilities: riskProbs,
      p_anomaly,
      p_cancel_orders,
      selected_action,
      max_probability: conf.max_probability,
      entropy: conf.entropy,
      top_two_margin: conf.top_two_margin,
      confidence_score: conf.confidence_score,
      abstain_flag: conf.should_abstain
    };
  }

  /**
   * Deterministic action selection rule based on probabilistic thresholds (Section 9).
   */
  private selectTopAction(
    actionProbs: Record<TradingAction, number>,
    riskProbs: Record<RiskLevel, number>,
    shouldAbstain: boolean
  ): TradingAction {
    if (shouldAbstain) {
      return 'hold';
    }

    // Critical risk threshold: safety first
    if ((riskProbs.critical + riskProbs.high) > 0.85) {
      if (actionProbs.cancel_orders > 0.35) return 'cancel_orders';
      if (actionProbs.hedge > 0.35) return 'hedge';
      if (actionProbs.reduce_position > 0.35) return 'reduce_position';
    }

    if (actionProbs.increase_position > 0.50) return 'increase_position';
    if (actionProbs.hedge > 0.50) return 'hedge';
    if (actionProbs.cancel_orders > 0.50) return 'cancel_orders';
    if (actionProbs.reduce_position > 0.50) return 'reduce_position';

    return 'hold';
  }

  /**
   * Safe fallback state when Jev is unavailable (Section 24).
   * Enforces zero new risk, defaults to HOLD or CANCEL_ORDERS.
   */
  public generateFallbackState(payload: JevStatePayload, latencyMs: number): JevDecisionState {
    const cancelStale = payload.orders.open_orders_count > 0 && payload.orders.oldest_order_age > (payload.policy.stale_order_timeout_seconds ?? 60);
    const actionProbs: Record<TradingAction, number> = {
      increase_position: 0.00,
      reduce_position: 0.15,
      hold: 0.75,
      hedge: 0.00,
      cancel_orders: 0.10
    };

    const regimeProbs: Record<MarketRegime, number> = {
      trending_up: 0.05,
      trending_down: 0.05,
      range_bound: 0.20,
      high_volatility: 0.10,
      liquidity_stress: 0.10,
      uncertain: 0.50
    };

    const riskProbs: Record<RiskLevel, number> = {
      very_low: 0.05,
      low: 0.15,
      moderate: 0.50,
      high: 0.25,
      critical: 0.05
    };

    return {
      action_probabilities: actionProbs,
      regime_probabilities: regimeProbs,
      risk_probabilities: riskProbs,
      p_anomaly: 0.15,
      p_cancel_orders: cancelStale ? 0.85 : 0.15,
      selected_action: cancelStale ? 'cancel_orders' : 'hold',
      ...calculateConfidence(actionProbs),
      abstain_flag: true,
      latency_ms: latencyMs,
      source: 'fallback', origin: 'fallback', model: 'safe-fallback', schema_version: JEV_SCHEMA_VERSION
    };
  }

  /**
   * Normalizes an arbitrary dictionary into a valid probability distribution that strictly sums to 1.0.
   */
  private normalizeDistribution<T extends string>(
    raw: Record<string, number>,
    keys: T[]
  ): Record<T, number> {
    const result = {} as Record<T, number>;
    let sum = 0;

    for (const key of keys) {
      const val = Math.max(0, Number(raw[key] ?? 0));
      if (!Number.isFinite(val)) throw new Error('Invalid heuristic probability');
      result[key] = val;
      sum += val;
    }

    if (sum <= 0) throw new Error('Empty probability distribution');
    let finalSum = 0;
    for (const key of keys) {
      const normalized = Number((result[key] / sum).toFixed(3));
      result[key] = normalized;
      finalSum += normalized;
    }

    // Correct small floating precision delta onto the largest key
    const diff = Number((1.0 - finalSum).toFixed(3));
    if (diff !== 0) {
      let maxKey = keys[0];
      for (const key of keys) {
        if (result[key] > result[maxKey]) maxKey = key;
      }
      result[maxKey] = Number((result[maxKey] + diff).toFixed(3));
    }

    return result;
  }
}
