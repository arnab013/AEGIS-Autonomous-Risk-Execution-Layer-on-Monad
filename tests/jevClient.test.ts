// tests/jevClient.test.ts - Automated Unit Tests for Jev Client & Confidence Quantifier

import { describe, it, expect } from 'vitest';
import { JevClient } from '../src/jev/client.ts';
import { calculateConfidence } from '../src/jev/confidence.ts';
import { buildJevStatePayload, hashStatePayload } from '../src/jev/stateBuilder.ts';
import { MarketState, PositionState, OrdersState, UserPolicy, RiskMetrics } from '../src/types/index.ts';

describe('Jev Client & Confidence Suite', () => {
  it('calculates Shannon entropy and confidence metrics correctly', () => {
    // Highly confident distribution: 85% hedge, others tiny
    const highConfProbs = {
      increase_position: 0.02,
      reduce_position: 0.08,
      hold: 0.03,
      hedge: 0.85,
      cancel_orders: 0.02,
    };

    const metricsHigh = calculateConfidence(highConfProbs);
    expect(metricsHigh.max_probability).toBe(0.85);
    expect(metricsHigh.top_two_margin).toBeGreaterThan(0.7);
    expect(metricsHigh.entropy).toBeLessThan(0.5);
    expect(metricsHigh.confidence_score).toBeGreaterThan(0.7);
    expect(metricsHigh.should_abstain).toBe(false);

    // Highly uncertain / uniform distribution: all ~20%
    const uncertainProbs = {
      increase_position: 0.20,
      reduce_position: 0.20,
      hold: 0.20,
      hedge: 0.20,
      cancel_orders: 0.20,
    };

    const metricsUncertain = calculateConfidence(uncertainProbs);
    expect(metricsUncertain.entropy).toBeGreaterThan(0.95);
    expect(metricsUncertain.top_two_margin).toBeLessThan(0.05);
    expect(metricsUncertain.should_abstain).toBe(true);
  });

  it('guarantees normalized probability vectors sum strictly to 1.0', async () => {
    const client = new JevClient();

    const mockMarket: MarketState = {
      pair: 'MON/USDC',
      mid_price: 4.0,
      spread_bps: 4.5,
      return_10s: 0.001,
      return_1m: 0.003,
      volatility_1m: 0.015,
      volatility_5m: 0.02,
      bid_depth_25bps: 18000,
      ask_depth_25bps: 17000,
      orderbook_imbalance: 0.1,
      aggressive_buy_flow: 1500,
      aggressive_sell_flow: 1200,
      timestamp: Date.now(),
      bids: [],
      asks: [],
    };

    const mockPosition: PositionState = {
      spot_exposure_usd: 1000,
      perp_exposure_usd: 0,
      net_delta: 1000,
      leverage: 0.8,
      unrealized_pnl: 10,
      realized_pnl_today: 15,
      drawdown_today: 0.3,
      spot_balance_mon: 250,
      usdc_balance: 1500,
      perp_short_size_mon: 0,
    };

    const mockOrders: OrdersState = {
      open_orders: [],
      oldest_order_age: 0,
      distance_from_mid: 0,
      filled_recently: 0,
    };

    const mockRisk: RiskMetrics = {
      position_utilization: 0.5,
      leverage_utilization: 0.4,
      daily_loss_utilization: 0.1,
      volatility_percentile: 45,
      liquidity_stress_score: 25,
    };

    const mockPolicy: UserPolicy = {
      max_position_usd: 2000,
      max_leverage: 2.0,
      max_daily_loss: 400,
      max_order_size: 300,
      max_slippage_bps: 25,
      max_open_orders: 5,
      stale_order_timeout_seconds: 60,
      min_liquidity_depth_usd: 1500,
      cooldown_seconds: 2,
      allowed_assets: ['MON'],
      allowed_venues: ['kuru'],
      permitted_actions: ['hold', 'increase_position'],
      is_paused: false,
    };

    const payload = buildJevStatePayload(mockMarket, mockPosition, mockOrders, mockRisk, mockPolicy);
    const decision = await client.evaluate(payload);

    const sumAction = Object.values(decision.action_probabilities).reduce((a, b) => a + b, 0);
    const sumRegime = Object.values(decision.regime_probabilities).reduce((a, b) => a + b, 0);
    const sumRisk = Object.values(decision.risk_probabilities).reduce((a, b) => a + b, 0);

    expect(Number(sumAction.toFixed(2))).toBe(1.0);
    expect(Number(sumRegime.toFixed(2))).toBe(1.0);
    expect(Number(sumRisk.toFixed(2))).toBe(1.0);
  });

  it('engages safe fallback when API is down, defaulting to zero additional risk', () => {
    const client = new JevClient();
    const payload = buildJevStatePayload(
      {} as any,
      { spot_exposure_usd: 1000 } as any,
      { open_orders: [], oldest_order_age: 10 } as any,
      {} as any,
      {} as any
    );

    const fallback = client.generateFallbackState(payload, 50);
    expect(fallback.source).toBe('fallback');
    expect(fallback.selected_action).toBe('hold');
    expect(fallback.action_probabilities.increase_position).toBe(0.0);
    expect(fallback.abstain_flag).toBe(true);
  });

  it('uses cached responses for identical state hashes without re-evaluating', async () => {
    const client = new JevClient({ enableCache: true, mode: 'simulated' });
    const payload = buildJevStatePayload(
      { pair: 'MON/USDC', mid_price: 4.0, spread_bps: 3.5, return_10s: 0, return_1m: 0, volatility_1m: 0.01, volatility_5m: 0.01, bid_depth_25bps: 10000, ask_depth_25bps: 10000, orderbook_imbalance: 0, aggressive_buy_flow: 0, aggressive_sell_flow: 0 } as any,
      { spot_exposure_usd: 500, perp_exposure_usd: 0, net_delta: 500, leverage: 0.5, unrealized_pnl: 0, realized_pnl_today: 0, drawdown_today: 0 } as any,
      { open_orders: [], oldest_order_age: 0, distance_from_mid: 0, filled_recently: 0 } as any,
      { position_utilization: 0.25, leverage_utilization: 0.25, daily_loss_utilization: 0, volatility_percentile: 20, liquidity_stress_score: 10 } as any,
      { max_position_usd: 2000, max_leverage: 2.0, max_daily_loss: 400, permitted_actions: ['hold'] } as any
    );

    const first = await client.evaluate(payload);
    const second = await client.evaluate(payload);

    expect(second.source).toBe('cached');
    expect(second.selected_action).toBe(first.selected_action);
  });

  it('queries live TypeSafe AI System One endpoint when configured in live mode', async () => {
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) return;

    const client = new JevClient({ apiKey: key, mode: 'live', enableCache: false });
    const payload = buildJevStatePayload(
      { pair: 'MON/USDC', mid_price: 4.0, spread_bps: 4.5, return_10s: 0, return_1m: 0.001, volatility_1m: 0.012, volatility_5m: 0.018, bid_depth_25bps: 18000, ask_depth_25bps: 17500, orderbook_imbalance: 0.02, aggressive_buy_flow: 500, aggressive_sell_flow: 400 } as any,
      { spot_exposure_usd: 1000, perp_exposure_usd: 0, net_delta: 1000, leverage: 0.8, unrealized_pnl: 10, realized_pnl_today: 15, drawdown_today: 0.2 } as any,
      { open_orders: [], oldest_order_age: 0, distance_from_mid: 0, filled_recently: 0 } as any,
      { position_utilization: 0.5, leverage_utilization: 0.4, daily_loss_utilization: 0.05, volatility_percentile: 25, liquidity_stress_score: 15 } as any,
      { max_position_usd: 2000, max_leverage: 2.0, max_daily_loss: 400, permitted_actions: ['hold', 'increase_position'] } as any
    );

    const decision = await client.evaluate(payload);
    expect(decision.source).toBe('typesafe_jev');
    expect(decision.action_probabilities).toBeDefined();
    expect(decision.regime_probabilities).toBeDefined();
    expect(decision.risk_probabilities).toBeDefined();
    expect(decision.selected_action).toBeDefined();
  });
});
