// src/engine/stateEngine.ts - High-Performance Two-Speed Trading & Risk Engine

import {
  MarketState,
  PositionState,
  OrdersState,
  UserPolicy,
  RiskMetrics,
  AuditEvent,
  TradingAction,
  JevDecisionState,
  RiskCheckResult,
  Order
} from '../types/index.ts';
import {
  calculateMidPrice,
  calculateSpreadBps,
  calculateDepthWithinBps,
  calculateOrderBookImbalance,
  calculateVolatility,
  calculateDrawdown,
  calculateLeverage,
  calculateLiquidityStressScore
} from './marketMath.ts';
import { HardRiskGate } from './riskGate.ts';
import { JevPolicyEngine } from '../jev/policyEngine.ts';
import { KuruClient } from '../execution/kuruClient.ts';
import { PerplClient } from '../execution/perplClient.ts';
import { EnvioIndexer } from '../execution/envioIndexer.ts';

export interface EngineCycleOutput {
  market: MarketState;
  position: PositionState;
  orders: OrdersState;
  risk: RiskMetrics;
  jevDecision: JevDecisionState;
  riskCheck: RiskCheckResult;
  executedAction: TradingAction;
  txHash?: string;
  auditEvent: AuditEvent;
  cycleLatencyMs: number;
}

export class StateEngine {
  public market: MarketState;
  public position: PositionState;
  public orders: OrdersState;
  public policy: UserPolicy;
  public riskGate: HardRiskGate;
  public jevPolicy: JevPolicyEngine;
  public kuruClient: KuruClient;
  public perplClient: PerplClient;
  public envioIndexer: EnvioIndexer;

  private priceHistory: number[] = [];
  private returnsHistory: number[] = [];
  private peakEquity: number = 2500;

  constructor(
    initialPosition?: PositionState,
    initialPolicy?: UserPolicy,
    jevPolicyEngine?: JevPolicyEngine
  ) {
    this.market = {
      pair: 'MON/USDC',
      mid_price: 4.00,
      spread_bps: 4.5,
      return_10s: 0.0005,
      return_1m: 0.0012,
      volatility_1m: 0.012,
      volatility_5m: 0.018,
      bid_depth_25bps: 18500,
      ask_depth_25bps: 17800,
      orderbook_imbalance: 0.02,
      aggressive_buy_flow: 1200,
      aggressive_sell_flow: 1100,
      timestamp: Date.now(),
      bids: [{ price: 3.999, size: 2000 }, { price: 3.995, size: 3500 }],
      asks: [{ price: 4.001, size: 2100 }, { price: 4.005, size: 3600 }]
    };

    this.position = initialPosition || {
      spot_exposure_usd: 1000,
      perp_exposure_usd: 0,
      net_delta: 1000,
      leverage: 0.8,
      unrealized_pnl: 15.00,
      realized_pnl_today: 25.00,
      drawdown_today: 0.5,
      spot_balance_mon: 250,
      usdc_balance: 1500,
      perp_short_size_mon: 0
    };

    this.orders = {
      open_orders: [],
      oldest_order_age: 0,
      distance_from_mid: 0,
      filled_recently: 0
    };

    this.policy = initialPolicy || {
      max_position_usd: 2000,
      max_leverage: 2.0,
      max_daily_loss: 400,
      max_order_size: 300,
      max_slippage_bps: 25,
      max_open_orders: 5,
      stale_order_timeout_seconds: 60,
      min_liquidity_depth_usd: 1500,
      cooldown_seconds: 2,
      allowed_assets: ['MON', 'USDC'],
      allowed_venues: ['kuru', 'perpl'],
      permitted_actions: ['increase_position', 'reduce_position', 'hold', 'hedge', 'cancel_orders'],
      is_paused: false
    };

    this.riskGate = new HardRiskGate();
    this.jevPolicy = jevPolicyEngine || new JevPolicyEngine();
    this.kuruClient = new KuruClient();
    this.perplClient = new PerplClient();
    this.envioIndexer = new EnvioIndexer();
  }

  /**
   * Fast deterministic math updates run on every orderbook tick.
   */
  public updateMarketState(
    bids: { price: number; size: number }[],
    asks: { price: number; size: number }[],
    aggressiveBuyFlow: number = 0,
    aggressiveSellFlow: number = 0
  ): MarketState {
    const midPrice = calculateMidPrice(bids, asks);
    const spreadBps = calculateSpreadBps(bids, asks);
    const bidDepth = calculateDepthWithinBps(bids, midPrice, 25, 'bid');
    const askDepth = calculateDepthWithinBps(asks, midPrice, 25, 'ask');
    const imbalance = calculateOrderBookImbalance(bidDepth, askDepth);

    if (this.priceHistory.length > 0 && midPrice > 0) {
      const prevPrice = this.priceHistory[this.priceHistory.length - 1];
      const ret = Math.log(midPrice / prevPrice);
      this.returnsHistory.push(ret);
      if (this.returnsHistory.length > 60) this.returnsHistory.shift();
    }
    this.priceHistory.push(midPrice);
    if (this.priceHistory.length > 60) this.priceHistory.shift();

    const vol1m = calculateVolatility(this.returnsHistory.slice(-20));
    const vol5m = calculateVolatility(this.returnsHistory);

    this.market = {
      pair: 'MON/USDC',
      mid_price: midPrice,
      spread_bps: spreadBps,
      return_10s: this.returnsHistory.length > 3 ? this.returnsHistory[this.returnsHistory.length - 1] : 0,
      return_1m: this.returnsHistory.reduce((a, b) => a + b, 0),
      volatility_1m: vol1m,
      volatility_5m: vol5m,
      bid_depth_25bps: bidDepth,
      ask_depth_25bps: askDepth,
      orderbook_imbalance: imbalance,
      aggressive_buy_flow: aggressiveBuyFlow,
      aggressive_sell_flow: aggressiveSellFlow,
      timestamp: Date.now(),
      bids,
      asks
    };

    return this.market;
  }

  /**
   * Calculates deterministic risk metrics.
   */
  public computeRiskMetrics(): RiskMetrics {
    const equity = this.position.usdc_balance + this.position.spot_exposure_usd + this.position.unrealized_pnl;
    if (equity > this.peakEquity) this.peakEquity = equity;

    const drawdown = calculateDrawdown(this.peakEquity, equity);
    const leverage = calculateLeverage(this.position.spot_exposure_usd + Math.abs(this.position.perp_exposure_usd), equity);

    const positionUtilization = this.policy.max_position_usd > 0
      ? (this.position.spot_exposure_usd / this.policy.max_position_usd)
      : 0;

    const leverageUtilization = this.policy.max_leverage > 0
      ? (leverage / this.policy.max_leverage)
      : 0;

    const dailyLossUtilization = this.policy.max_daily_loss > 0
      ? (Math.max(0, -this.position.realized_pnl_today) / this.policy.max_daily_loss)
      : 0;

    // Approximate percentile based on standard market volatility
    const volatilityPercentile = Math.min(100, Math.round((this.market.volatility_1m / 0.035) * 100));
    const liquidityStress = calculateLiquidityStressScore(
      this.market.spread_bps,
      Math.abs(this.market.orderbook_imbalance),
      this.market.bid_depth_25bps,
      this.market.ask_depth_25bps
    );

    return {
      position_utilization: positionUtilization,
      leverage_utilization: leverageUtilization,
      daily_loss_utilization: dailyLossUtilization,
      volatility_percentile: volatilityPercentile,
      liquidity_stress_score: liquidityStress
    };
  }

  /**
   * Two-Speed Engine Execution Step:
   * Coordinates Market Analytics -> Jev Intelligence -> Hard Risk Gate -> Monad / Kuru / Perpl Execution.
   */
  public async step(orderSizeUsd: number = 250): Promise<EngineCycleOutput> {
    const cycleStart = performance.now();
    const riskMetrics = this.computeRiskMetrics();

    // Intelligence Loop: Query Jev
    const { decision, payloadHash, factors, reason } = await this.jevPolicy.evaluatePolicy(
      this.market,
      this.position,
      this.orders,
      riskMetrics,
      this.policy
    );

    // Hard Risk Gate: Non-negotiable safety filter
    const riskCheck = this.riskGate.evaluateAction(
      decision.selected_action,
      this.policy,
      this.position,
      this.market,
      this.orders,
      orderSizeUsd
    );

    let executedAction: TradingAction = riskCheck.sanitized_action;
    let txHash: string | undefined;
    let venue: 'kuru' | 'perpl' | 'policy_guard' | undefined;

    // Execution Layer on Monad
    if (riskCheck.allowed && !this.policy.is_paused) {
      this.riskGate.recordExecution();

      if (executedAction === 'increase_position') {
        venue = 'kuru';
        const res = await this.kuruClient.placeLimitOrder('buy', this.market.mid_price, orderSizeUsd / this.market.mid_price);
        txHash = res.txHash;
        // Update local state
        const addedMon = orderSizeUsd / this.market.mid_price;
        this.position.spot_balance_mon += addedMon;
        this.position.spot_exposure_usd += orderSizeUsd;
        this.position.net_delta += orderSizeUsd;
      } else if (executedAction === 'hedge') {
        venue = 'perpl';
        const res = await this.perplClient.openShortHedge(1000, this.market.mid_price);
        txHash = res.txHash;
        this.position.perp_exposure_usd = -1000;
        this.position.net_delta = this.position.spot_exposure_usd - 1000;
        this.position.perp_short_size_mon = 1000 / this.market.mid_price;
      } else if (executedAction === 'cancel_orders') {
        venue = 'kuru';
        const orderIds = this.orders.open_orders.map(o => o.id);
        if (orderIds.length > 0) {
          const res = await this.kuruClient.batchCancelOrders(orderIds);
          txHash = res.txHash;
          this.orders.open_orders = [];
          this.orders.oldest_order_age = 0;
        }
      } else if (executedAction === 'reduce_position') {
        venue = 'kuru';
        const reduceUsd = Math.min(orderSizeUsd, this.position.spot_exposure_usd);
        const res = await this.kuruClient.placeLimitOrder('sell', this.market.mid_price, reduceUsd / this.market.mid_price);
        txHash = res.txHash;
        this.position.spot_exposure_usd -= reduceUsd;
        this.position.net_delta -= reduceUsd;
        this.position.spot_balance_mon -= reduceUsd / this.market.mid_price;
      }
    } else {
      // Risk Check Failed: Forcefully blocked!
      factors.policy_permitted = riskCheck.checks['policy_permitted_action']?.passed ?? false;
      factors.position_limit_satisfied = riskCheck.checks['max_position_usd']?.passed ?? false;
    }

    const cycleLatencyMs = Math.round(performance.now() - cycleStart);

    // Audit Event generation
    const auditEvent: AuditEvent = {
      id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      market_state_hash: payloadHash,
      jev_model: 'jev-v1.2-decision',
      action_probabilities: decision.action_probabilities,
      risk_probabilities: decision.risk_probabilities,
      regime_probabilities: decision.regime_probabilities,
      selected_action: decision.selected_action,
      confidence: decision.confidence_score,
      hard_checks: {
        pause_check: riskCheck.checks['emergency_pause']?.passed ?? true,
        policy_permitted: riskCheck.checks['policy_permitted_action']?.passed ?? true,
        max_position: riskCheck.checks['max_position_usd']?.passed ?? true,
        max_leverage: riskCheck.checks['max_leverage']?.passed ?? true,
        max_daily_loss: riskCheck.checks['max_daily_loss']?.passed ?? true,
        max_order_size: riskCheck.checks['max_order_size']?.passed ?? true,
        liquidity_depth: riskCheck.checks['min_liquidity_depth']?.passed ?? true,
        cooldown: riskCheck.checks['trade_cooldown']?.passed ?? true,
      },
      execution_allowed: riskCheck.allowed,
      transaction_hash: txHash,
      venue,
      reason: riskCheck.allowed ? reason : `BLOCKED BY RISK GATE: ${riskCheck.violations.join('; ')}`,
      factors
    };

    this.envioIndexer.recordAuditEvent(auditEvent);

    return {
      market: this.market,
      position: this.position,
      orders: this.orders,
      risk: riskMetrics,
      jevDecision: decision,
      riskCheck,
      executedAction,
      txHash,
      auditEvent,
      cycleLatencyMs
    };
  }
}
