import type {
  MarketState,
  PositionState,
  OrdersState,
  UserPolicy,
  RiskMetrics,
  AuditEvent,
  TradingAction,
  JevDecisionState,
  RiskCheckResult,
} from '../types/index.ts';
import {
  calculateMidPrice,
  calculateSpreadBps,
  calculateDepthWithinBps,
  calculateOrderBookImbalance,
  calculateVolatility,
  calculateDrawdown,
  calculateLeverage,
  calculateLiquidityStressScore,
  quoteMarketFill,
} from './marketMath.ts';
import { HardRiskGate } from './riskGate.ts';
import { JevPolicyEngine } from '../jev/policyEngine.ts';
import { JevClient } from '../jev/client.ts';
import { KuruClient } from '../execution/kuruClient.ts';
import { PerplClient } from '../execution/perplClient.ts';
import { EnvioIndexer } from '../execution/envioIndexer.ts';

export interface PaperExecution {
  id: string;
  action: TradingAction;
  price: number;
  notionalUsd: number;
  filledSize: number;
  slippageBps: number;
  status: 'filled' | 'cancelled';
  assumptions: string;
}

export interface EngineCycleOutput {
  market: MarketState;
  position: PositionState;
  orders: OrdersState;
  risk: RiskMetrics;
  jevDecision: JevDecisionState;
  riskCheck: RiskCheckResult;
  executedAction: TradingAction;
  executionMode: 'paper' | 'observe';
  paperExecution?: PaperExecution;
  txHash?: string;
  auditEvent: AuditEvent;
  cycleLatencyMs: number;
}

export interface StateEngineConfig {
  now?: () => number;
}

/** Deterministic policy evaluation and an explicit paper ledger. Wallet execution is separate. */
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

  private history: { timestamp: number; price: number }[] = [];
  private peakEquity: number;
  private spotCostBasisUsd: number;
  private hedgeEntryNotionalUsd: number;
  private sequence = 0;
  private busy = false;
  private gateTimestamp: number;
  private observationMode = false;
  private now: () => number;

  constructor(
    initialPosition?: PositionState,
    initialPolicy?: UserPolicy,
    jevPolicyEngine?: JevPolicyEngine,
    config: StateEngineConfig = {}
  ) {
    this.now = config.now ?? Date.now;
    this.gateTimestamp = this.now();
    this.market = {
      pair: 'MON/USDC',
      mid_price: 4,
      spread_bps: 5,
      return_10s: 0,
      return_1m: 0,
      volatility_1m: 0,
      volatility_5m: 0,
      bid_depth_25bps: 8000,
      ask_depth_25bps: 8400,
      orderbook_imbalance: 0,
      aggressive_buy_flow: 0,
      aggressive_sell_flow: 0,
      timestamp: this.gateTimestamp,
      bids: [{ price: 3.999, size: 2000 }],
      asks: [{ price: 4.001, size: 2100 }],
    };
    this.position = structuredClone(
      initialPosition ?? {
        spot_exposure_usd: 1000,
        perp_exposure_usd: 0,
        net_delta: 1000,
        leverage: 0.4,
        unrealized_pnl: 0,
        realized_pnl_today: 0,
        drawdown_today: 0,
        spot_balance_mon: 250,
        usdc_balance: 1500,
        perp_short_size_mon: 0,
      }
    );
    this.orders = {
      open_orders: [],
      oldest_order_age: 0,
      distance_from_mid: 0,
      filled_recently: 0,
    };
    this.policy = structuredClone(
      initialPolicy ?? {
        max_position_usd: 2000,
        max_leverage: 2,
        max_daily_loss: 400,
        max_order_size: 300,
        max_slippage_bps: 25,
        max_open_orders: 5,
        stale_order_timeout_seconds: 60,
        min_liquidity_depth_usd: 1500,
        cooldown_seconds: 2,
        allowed_assets: ['MON', 'USDC'],
        allowed_venues: ['kuru', 'perpl'],
        permitted_actions: [
          'increase_position',
          'reduce_position',
          'hold',
          'hedge',
          'cancel_orders',
        ],
        is_paused: false,
      }
    );
    this.spotCostBasisUsd = this.position.spot_exposure_usd - this.position.unrealized_pnl;
    this.hedgeEntryNotionalUsd = Math.abs(this.position.perp_exposure_usd);
    this.peakEquity = this.position.usdc_balance + this.position.spot_exposure_usd;
    this.riskGate = new HardRiskGate(() =>
      this.observationMode ? this.now() : this.gateTimestamp
    );
    this.jevPolicy = jevPolicyEngine ?? new JevPolicyEngine(new JevClient({ mode: 'simulated' }));
    this.kuruClient = new KuruClient();
    this.perplClient = new PerplClient();
    this.envioIndexer = new EnvioIndexer();
  }

  public updateMarketState(
    bids: { price: number; size: number }[],
    asks: { price: number; size: number }[],
    aggressiveBuyFlow = 0,
    aggressiveSellFlow = 0,
    timestampMs = this.now()
  ): MarketState {
    if (
      !Number.isFinite(timestampMs) ||
      [aggressiveBuyFlow, aggressiveSellFlow].some((v) => !Number.isFinite(v) || v < 0) ||
      !bids.length ||
      !asks.length ||
      [...bids, ...asks].some(
        (level) =>
          !Number.isFinite(level.price) ||
          !Number.isFinite(level.size) ||
          level.price <= 0 ||
          level.size <= 0
      )
    ) {
      throw new Error(
        'Market update requires a valid timestamp, flow and two-sided positive order book'
      );
    }
    if (this.history.length && timestampMs < this.history[this.history.length - 1].timestamp)
      throw new Error('Out-of-order market timestamp');
    const sortedBids = bids.map((level) => ({ ...level })).sort((a, b) => b.price - a.price);
    const sortedAsks = asks.map((level) => ({ ...level })).sort((a, b) => a.price - b.price);
    if (sortedBids[0].price > sortedAsks[0].price) throw new Error('Crossed order book');
    const mid = calculateMidPrice(sortedBids, sortedAsks);
    const spread = calculateSpreadBps(sortedBids, sortedAsks);
    const bidDepth = calculateDepthWithinBps(sortedBids, mid, 25, 'bid');
    const askDepth = calculateDepthWithinBps(sortedAsks, mid, 25, 'ask');
    const previousTimestamp = this.history.at(-1)?.timestamp;
    this.history.push({ timestamp: timestampMs, price: mid });
    while (this.history.length > 2 && this.history[1].timestamp < timestampMs - 300_000)
      this.history.shift();
    if (this.history.length > 10_000) this.history.shift();
    const returns = (windowMs: number) => {
      const result: number[] = [];
      for (let i = 1; i < this.history.length; i++) {
        if (this.history[i].timestamp >= timestampMs - windowMs)
          result.push(Math.log(this.history[i].price / this.history[i - 1].price));
      }
      return result;
    };
    const windowReturn = (windowMs: number) => {
      let reference = this.history[0].price;
      for (const sample of this.history) {
        if (sample.timestamp > timestampMs - windowMs) break;
        reference = sample.price;
      }
      return Math.log(mid / reference);
    };
    this.market = {
      pair: this.market.pair,
      mid_price: mid,
      spread_bps: spread,
      return_10s: windowReturn(10_000),
      return_1m: windowReturn(60_000),
      volatility_1m: calculateVolatility(returns(60_000)),
      volatility_5m: calculateVolatility(returns(300_000)),
      bid_depth_25bps: bidDepth,
      ask_depth_25bps: askDepth,
      orderbook_imbalance: calculateOrderBookImbalance(bidDepth, askDepth),
      aggressive_buy_flow: aggressiveBuyFlow,
      aggressive_sell_flow: aggressiveSellFlow,
      timestamp: timestampMs,
      bids: sortedBids,
      asks: sortedAsks,
    };
    const elapsedSeconds =
      previousTimestamp === undefined ? 0 : (timestampMs - previousTimestamp) / 1000;
    this.orders.open_orders = this.orders.open_orders.map((order) => ({
      ...order,
      age_seconds: order.age_seconds + elapsedSeconds,
      distance_from_mid_bps: (Math.abs(order.price - mid) / mid) * 10_000,
    }));
    this.orders.oldest_order_age = Math.max(
      0,
      ...this.orders.open_orders.map((order) => order.age_seconds)
    );
    this.markPortfolio();
    return structuredClone(this.market);
  }

  private markPortfolio(): void {
    this.position.spot_exposure_usd = this.position.spot_balance_mon * this.market.mid_price;
    this.position.perp_exposure_usd = -this.position.perp_short_size_mon * this.market.mid_price;
    this.position.net_delta = this.position.spot_exposure_usd + this.position.perp_exposure_usd;
    const perpPnl = this.hedgeEntryNotionalUsd - Math.abs(this.position.perp_exposure_usd);
    this.position.unrealized_pnl =
      this.position.spot_exposure_usd - this.spotCostBasisUsd + perpPnl;
    const equity = this.position.usdc_balance + this.position.spot_exposure_usd + perpPnl;
    this.peakEquity = Math.max(this.peakEquity, equity);
    this.position.drawdown_today = calculateDrawdown(this.peakEquity, equity);
    this.position.leverage = calculateLeverage(
      this.position.spot_exposure_usd + Math.abs(this.position.perp_exposure_usd),
      equity
    );
  }

  public computeRiskMetrics(): RiskMetrics {
    const equity = this.position.usdc_balance + this.position.spot_exposure_usd;
    const leverage = calculateLeverage(
      this.position.spot_exposure_usd + Math.abs(this.position.perp_exposure_usd),
      equity
    );
    return {
      position_utilization:
        this.policy.max_position_usd > 0
          ? this.position.spot_exposure_usd / this.policy.max_position_usd
          : 1,
      leverage_utilization: this.policy.max_leverage > 0 ? leverage / this.policy.max_leverage : 1,
      daily_loss_utilization:
        this.policy.max_daily_loss > 0
          ? Math.max(0, -(this.position.realized_pnl_today + this.position.unrealized_pnl)) /
            this.policy.max_daily_loss
          : 1,
      // A normalized stress index, not an empirical historical percentile.
      volatility_percentile: Math.min(100, Math.round((this.market.volatility_1m / 0.035) * 100)),
      liquidity_stress_score: calculateLiquidityStressScore(
        this.market.spread_bps,
        Math.abs(this.market.orderbook_imbalance),
        this.market.bid_depth_25bps,
        this.market.ask_depth_25bps
      ),
    };
  }

  /** execute:false evaluates a live observation without changing the paper ledger. */
  public async step(
    orderSizeUsd = 250,
    options: { execute?: boolean } = {}
  ): Promise<EngineCycleOutput> {
    if (this.busy) throw new Error('An engine evaluation is already in flight');
    this.busy = true;
    try {
      const start = performance.now();
      const observe = options.execute === false;
      this.observationMode = observe;
      const market = structuredClone(this.market);
      const position = structuredClone(this.position);
      const orders = structuredClone(this.orders);
      const policy = structuredClone(this.policy);
      const risk = this.computeRiskMetrics();
      const { decision, payloadHash, factors, reason } = await this.jevPolicy.evaluatePolicy(
        market,
        position,
        orders,
        risk,
        policy
      );
      this.gateTimestamp = observe ? this.now() : market.timestamp;
      // A pause or policy/market update while inference was pending invalidates execution.
      const stateUnchanged =
        JSON.stringify({ market, position, orders, policy }) ===
        JSON.stringify({
          market: this.market,
          position: this.position,
          orders: this.orders,
          policy: this.policy,
        });
      const riskCheck = this.riskGate.evaluateAction(
        decision.selected_action,
        this.policy,
        this.position,
        this.market,
        this.orders,
        orderSizeUsd
      );
      factors.policy_permitted = riskCheck.checks.policy_permitted_action.passed;
      factors.position_limit_satisfied = riskCheck.checks.max_position_usd.passed;
      if (!stateUnchanged) {
        riskCheck.allowed = false;
        riskCheck.violations.push(
          'State or policy changed during inference; reevaluate before execution'
        );
        riskCheck.checks.state_consistency = {
          passed: false,
          message: 'Snapshot changed during inference',
        };
        riskCheck.sanitized_action = 'hold';
      }
      let executedAction: TradingAction = 'hold';
      let paperExecution: PaperExecution | undefined;
      const action = riskCheck.sanitized_action;
      // Rejected risk can still safely cancel stale orders in the paper ledger.
      if (!observe && (riskCheck.allowed || action === 'cancel_orders')) {
        if (action === 'cancel_orders' && this.orders.open_orders.length) {
          this.orders = {
            ...this.orders,
            open_orders: [],
            oldest_order_age: 0,
            distance_from_mid: 0,
          };
          executedAction = action;
          paperExecution = {
            id: `paper_${payloadHash}_${++this.sequence}`,
            action,
            price: 0,
            notionalUsd: 0,
            filledSize: 0,
            slippageBps: 0,
            status: 'cancelled',
            assumptions: 'Local paper order cancellation; no chain transaction.',
          };
        } else if (
          action === 'increase_position' ||
          action === 'reduce_position' ||
          action === 'hedge'
        ) {
          const buy = action === 'increase_position';
          const fill = quoteMarketFill(
            buy ? market.asks : market.bids,
            orderSizeUsd,
            market.mid_price,
            buy ? 'buy' : 'sell'
          );
          if (action === 'increase_position') {
            this.position.usdc_balance -= fill.notionalUsd;
            this.position.spot_balance_mon += fill.size;
            this.spotCostBasisUsd += fill.notionalUsd;
          } else if (action === 'reduce_position') {
            const releasedCost =
              this.spotCostBasisUsd * (fill.size / this.position.spot_balance_mon);
            this.spotCostBasisUsd -= releasedCost;
            this.position.spot_balance_mon -= fill.size;
            this.position.usdc_balance += fill.notionalUsd;
            this.position.realized_pnl_today += fill.notionalUsd - releasedCost;
          } else {
            this.position.perp_short_size_mon += fill.size;
            this.hedgeEntryNotionalUsd += fill.notionalUsd;
          }
          this.markPortfolio();
          this.riskGate.recordExecution();
          executedAction = action;
          paperExecution = {
            id: `paper_${payloadHash}_${++this.sequence}`,
            action,
            price: fill.price,
            notionalUsd: fill.notionalUsd,
            filledSize: fill.size,
            slippageBps: fill.slippageBps,
            status: 'filled',
            assumptions:
              action === 'hedge'
                ? 'Paper hedge uses spot book as an indicative price; no Perpl fill, margin, fees or funding simulated.'
                : 'Paper taker fill walks the supplied book; no fees, latency, future liquidity or chain transaction simulated.',
          };
        }
      }
      const auditEvent: AuditEvent = {
        id: `audit_${payloadHash}_${++this.sequence}`,
        timestamp: new Date(this.gateTimestamp).toISOString(),
        market_state_hash: payloadHash,
        jev_model: decision.model ?? 'unknown',
        action_probabilities: structuredClone(decision.action_probabilities),
        risk_probabilities: structuredClone(decision.risk_probabilities),
        regime_probabilities: structuredClone(decision.regime_probabilities),
        selected_action: decision.selected_action,
        confidence: decision.confidence_score,
        hard_checks: Object.fromEntries(
          Object.entries(riskCheck.checks).map(([key, value]) => [key, value.passed])
        ),
        execution_allowed: riskCheck.allowed,
        execution_mode: observe ? 'observe' : 'paper',
        decision_source: decision.origin ?? decision.source,
        reason: !riskCheck.allowed
          ? `BLOCKED BY RISK GATE: ${riskCheck.violations.join('; ')}`
          : `${observe ? 'OBSERVE ONLY: ' : 'PAPER: '}${reason}`,
        factors,
      };
      this.envioIndexer.recordAuditEvent(auditEvent);
      return {
        market,
        position: structuredClone(this.position),
        orders: structuredClone(this.orders),
        risk: this.computeRiskMetrics(),
        jevDecision: decision,
        riskCheck,
        executedAction,
        executionMode: observe ? 'observe' : 'paper',
        paperExecution,
        auditEvent,
        cycleLatencyMs: Math.round(performance.now() - start),
      };
    } finally {
      this.busy = false;
    }
  }
}
