// tests/riskGate.test.ts - Automated Unit Tests for Hard Risk Gate & Invariant Protection

import { describe, it, expect, beforeEach } from 'vitest';
import { HardRiskGate } from '../src/engine/riskGate.ts';
import { UserPolicy, PositionState, MarketState, OrdersState } from '../src/types/index.ts';

describe('HardRiskGate Safety Invariant Suite', () => {
  let riskGate: HardRiskGate;
  let defaultPolicy: UserPolicy;
  let basePosition: PositionState;
  let baseMarket: MarketState;
  let baseOrders: OrdersState;

  beforeEach(() => {
    riskGate = new HardRiskGate();

    defaultPolicy = {
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
      is_paused: false,
    };

    basePosition = {
      spot_exposure_usd: 1200,
      perp_exposure_usd: 0,
      net_delta: 1200,
      leverage: 0.8,
      unrealized_pnl: 10,
      realized_pnl_today: 20,
      drawdown_today: 0.5,
      spot_balance_mon: 300,
      usdc_balance: 1500,
      perp_short_size_mon: 0,
    };

    baseMarket = {
      pair: 'MON/USDC',
      mid_price: 4.0,
      spread_bps: 4.0,
      return_10s: 0.001,
      return_1m: 0.002,
      volatility_1m: 0.015,
      volatility_5m: 0.02,
      bid_depth_25bps: 20000,
      ask_depth_25bps: 18000,
      orderbook_imbalance: 0.05,
      aggressive_buy_flow: 1000,
      aggressive_sell_flow: 900,
      timestamp: Date.now(),
      bids: [{ price: 3.999, size: 2000 }],
      asks: [{ price: 4.001, size: 2000 }],
    };

    baseOrders = {
      open_orders: [],
      oldest_order_age: 0,
      distance_from_mid: 0,
      filled_recently: 0,
    };
  });

  it('CRITICAL TEST: BLOCKS transaction when prospective position exceeds max_position_usd', () => {
    // Current position $1,850. Max cap $2,000. Proposed clip $250 -> Prospective $2,100
    basePosition.spot_exposure_usd = 1850;

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('breach max limit'))).toBe(true);
    expect(result.sanitized_action).toBe('hold');
  });

  it('BLOCKS transaction when leverage exceeds max_leverage', () => {
    // Total equity $1,750, prospective exposure $1,500 exceeds a 0.8x cap.
    basePosition.spot_exposure_usd = 1250;
    basePosition.usdc_balance = 500;
    basePosition.unrealized_pnl = 0;
    defaultPolicy.max_leverage = 0.8;

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('exceed max cap'))).toBe(true);
  });

  it('BLOCKS transaction when daily loss limit is reached', () => {
    // Realized loss -$420 > max daily loss $400
    basePosition.realized_pnl_today = -420;

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('Daily loss limit reached'))).toBe(true);
  });

  it('BLOCKS transaction when system is paused (emergency circuit breaker)', () => {
    defaultPolicy.is_paused = true;

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('Trading is currently paused');
  });

  it('BLOCKS order size exceeding max_order_size cap', () => {
    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      500
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('exceeds cap'))).toBe(true);
  });

  it('BLOCKS order when orderbook liquidity depth is insufficient', () => {
    baseMarket.ask_depth_25bps = 500; // Below 1500 limit

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('Insufficient orderbook depth'))).toBe(true);
  });

  it('ENFORCES cooldown between consecutive new-risk orders', () => {
    riskGate.recordExecution(); // Just executed a trade

    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('throttled by cooldown'))).toBe(true);
  });

  it('PASSES when all deterministic safety invariants are satisfied', () => {
    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );

    expect(result.allowed).toBe(true);
    expect(result.violations.length).toBe(0);
    expect(result.sanitized_action).toBe('increase_position');
  });

  it.each([NaN, Infinity, -1, 0])('fails closed on invalid order amount %s', (amount) => {
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        amount
      ).allowed
    ).toBe(false);
  });

  it('reserves pending buy exposure so concurrent orders cannot evade the position cap', () => {
    baseOrders.open_orders = [
      {
        id: 'pending',
        side: 'buy',
        price: 4,
        size: 150,
        venue: 'kuru',
        status: 'open',
        age_seconds: 0,
        distance_from_mid_bps: 0,
      },
    ];
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        250
      ).checks.max_position_usd.passed
    ).toBe(false);
  });

  it('rejects new orders when open-order count already equals the cap', () => {
    defaultPolicy.max_open_orders = 0;
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        250
      ).checks.max_open_orders.passed
    ).toBe(false);
  });

  it('checks gross leverage for hedges, even though a short reduces net delta', () => {
    defaultPolicy.max_leverage = 0.5;
    const result = riskGate.evaluateAction(
      'hedge',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      250
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.max_leverage.passed).toBe(false);
  });

  it('prevents over-hedging into a net short', () => {
    basePosition.net_delta = 100;
    expect(
      riskGate.evaluateAction('hedge', defaultPolicy, basePosition, baseMarket, baseOrders, 250)
        .checks.hedge_reduces_delta.passed
    ).toBe(false);
  });

  it('enforces allowed assets and venues', () => {
    defaultPolicy.allowed_assets = ['MON'];
    defaultPolicy.allowed_venues = ['perpl'];
    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.allowed_assets.passed).toBe(false);
    expect(result.checks.allowed_venue.passed).toBe(false);
  });

  it('checks actual multi-level book impact instead of ignoring max_slippage_bps', () => {
    baseMarket.asks = [
      { price: 4.001, size: 1 },
      { price: 4.2, size: 1000 },
    ];
    const result = riskGate.evaluateAction(
      'increase_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders
    );
    expect(result.checks.max_slippage_bps.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  it('blocks stale or crossed market data', () => {
    baseMarket.timestamp = Date.now() - 20_000;
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).checks.market_freshness.passed
    ).toBe(false);
    baseMarket.timestamp = Date.now();
    baseMarket.bids = [{ price: 5, size: 1000 }];
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).checks.market_freshness.passed
    ).toBe(false);
  });

  it('rejects purchases with insufficient unreserved cash', () => {
    basePosition.usdc_balance = 200;
    expect(
      riskGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).checks.cash_available.passed
    ).toBe(false);
  });

  it('permits emergency risk reduction and cancellation during pause', () => {
    defaultPolicy.is_paused = true;
    expect(
      riskGate.evaluateAction(
        'reduce_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).allowed
    ).toBe(true);
    expect(
      riskGate.evaluateAction('cancel_orders', defaultPolicy, basePosition, baseMarket, baseOrders)
        .allowed
    ).toBe(true);
    expect(
      riskGate.evaluateAction('hedge', defaultPolicy, basePosition, baseMarket, baseOrders).allowed
    ).toBe(false);
  });

  it('can use an injected deterministic clock including epoch zero for cooldown', () => {
    let now = 0;
    const deterministicGate = new HardRiskGate(() => now);
    baseMarket.timestamp = 0;
    deterministicGate.recordExecution();
    expect(
      deterministicGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).allowed
    ).toBe(false);
    now = 2000;
    baseMarket.timestamp = now;
    expect(
      deterministicGate.evaluateAction(
        'increase_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders
      ).allowed
    ).toBe(true);
  });

  it('permits selling the full available base balance without demanding extra MON to cover the spread', () => {
    basePosition.spot_balance_mon = 100;
    basePosition.spot_exposure_usd = 400;
    defaultPolicy.max_order_size = 400;
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      400,
      100
    );
    expect(result.allowed).toBe(true);
    expect(result.checks.inventory_available.passed).toBe(true);
    expect(result.checks.sell_quantity.passed).toBe(true);
    // The original quote-notional paper interface still demands $400 proceeds.
    expect(
      riskGate.evaluateAction(
        'reduce_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        400
      ).checks.inventory_available.passed
    ).toBe(false);
  });

  it.each([NaN, Infinity, -1, 0, null, '50'])(
    'rejects malformed exact sale quantity %s',
    (quantity) => {
      const result = riskGate.evaluateAction(
        'reduce_position',
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        200,
        quantity as any
      );
      expect(result.allowed).toBe(false);
      expect(result.checks.sell_quantity.passed).toBe(false);
    }
  );

  it('rejects a quantity whose mid value differs from the declared USD clip', () => {
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      60
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.sell_quantity.passed).toBe(false);
  });

  it('rejects overflow of the quantity valuation', () => {
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      Number.MAX_VALUE
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.sell_quantity.passed).toBe(false);
  });

  it('does not treat a mismatched dust amount as floating point rounding', () => {
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      4e-15,
      5e-16
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.sell_quantity.passed).toBe(false);
  });

  it('requires complete bid depth even for a tiny base quantity', () => {
    baseMarket.bids = [{ price: 3.999, size: 1e-16 }];
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      4e-15,
      1e-15
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.sell_quantity.passed).toBe(true);
    expect(result.checks.max_slippage_bps.passed).toBe(false);
  });

  it('permits ordinary decimal rounding between a quantity and its mid value', () => {
    baseMarket.mid_price = 3;
    baseMarket.bids = [{ price: 2.999, size: 100 }];
    baseMarket.asks = [{ price: 3.001, size: 100 }];
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      0.3,
      0.1
    );
    expect(result.allowed).toBe(true);
    expect(result.checks.sell_quantity.passed).toBe(true);
  });

  it.each(['increase_position', 'hedge', 'hold', 'cancel_orders'] as const)(
    'rejects quantity supplied to %s rather than silently ignoring it',
    (action) => {
      const result = riskGate.evaluateAction(
        action,
        defaultPolicy,
        basePosition,
        baseMarket,
        baseOrders,
        200,
        50
      );
      expect(result.allowed).toBe(false);
      expect(result.checks.sell_quantity.passed).toBe(false);
    }
  );

  it('checks the USD cap using mid value, even when bid proceeds are below that cap', () => {
    defaultPolicy.max_order_size = 199.96;
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      50
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.sell_quantity.passed).toBe(true);
    expect(result.checks.max_order_size.passed).toBe(false);
  });

  it('reserves existing sell quantities before authorizing an exact base reduction', () => {
    baseOrders.open_orders = [
      {
        id: 'reserved',
        side: 'sell',
        price: 4,
        size: 260,
        venue: 'kuru',
        status: 'open',
        age_seconds: 0,
        distance_from_mid_bps: 0,
      },
    ];
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      50
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.inventory_available.passed).toBe(false);
  });

  it('requires enough bid quantity to fill the complete exact base sale', () => {
    baseMarket.bids = [{ price: 3.999, size: 10 }];
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      50
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.max_slippage_bps.passed).toBe(false);
  });

  it('walks multiple bids and rejects total price impact above the slippage cap', () => {
    baseMarket.bids = [
      { price: 3.999, size: 5 },
      { price: 3.8, size: 100 },
    ];
    const result = riskGate.evaluateAction(
      'reduce_position',
      defaultPolicy,
      basePosition,
      baseMarket,
      baseOrders,
      200,
      50
    );
    expect(result.allowed).toBe(false);
    expect(result.checks.inventory_available.passed).toBe(true);
    expect(result.checks.max_slippage_bps.passed).toBe(false);
  });
});
