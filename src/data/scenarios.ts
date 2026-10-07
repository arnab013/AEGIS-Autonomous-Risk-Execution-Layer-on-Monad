// src/data/scenarios.ts - Deterministic Market Replay Scenarios (Section 17)

import { ReplayScenario, PositionState, Order } from '../types/index.ts';

export const REPLAY_SCENARIOS: ReplayScenario[] = [
  // -------------------------------------------------------------
  // Scenario 1: Normal Balanced Market (System Holds)
  // -------------------------------------------------------------
  {
    id: 'scenario_1_normal',
    title: 'Scenario 1: Steady Range-Bound Market',
    narrative: 'Normal balanced order book on Kuru, minimal volatility, spread within 3 bps. Jev assigns high probability to range_bound regime and low risk. Agent holds.',
    target_behavior: 'System holds capital, incurs 0 unnecessary fees, risk utilization remains low.',
    initial_position: {
      spot_exposure_usd: 1200,
      perp_exposure_usd: 0,
      net_delta: 1200,
      leverage: 1.0,
      unrealized_pnl: 14.50,
      realized_pnl_today: 32.00,
      drawdown_today: 0.5,
      spot_balance_mon: 300,
      usdc_balance: 1500,
      perp_short_size_mon: 0
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.00,
        bids: [{ price: 3.999, size: 2500 }, { price: 3.995, size: 4000 }, { price: 3.990, size: 6000 }],
        asks: [{ price: 4.001, size: 2400 }, { price: 4.005, size: 3800 }, { price: 4.010, size: 6200 }],
        aggressive_buy_flow: 1200,
        aggressive_sell_flow: 1150,
        description: 'T=0s: Balanced order book, 5 bps spread, equal volume flows.'
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.002,
        bids: [{ price: 4.000, size: 2600 }, { price: 3.996, size: 4100 }, { price: 3.991, size: 5900 }],
        asks: [{ price: 4.003, size: 2500 }, { price: 4.007, size: 3900 }, { price: 4.012, size: 6000 }],
        aggressive_buy_flow: 1400,
        aggressive_sell_flow: 1300,
        description: 'T=1s: Minor uptick, bid/ask depth remains symmetric.'
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.001,
        bids: [{ price: 3.999, size: 2700 }, { price: 3.995, size: 4200 }, { price: 3.990, size: 6100 }],
        asks: [{ price: 4.002, size: 2600 }, { price: 4.006, size: 4000 }, { price: 4.011, size: 5800 }],
        aggressive_buy_flow: 900,
        aggressive_sell_flow: 950,
        description: 'T=2s: Price mean reverts to $4.001. Jev policy selects HOLD with 82% confidence.'
      }
    ]
  },

  // -------------------------------------------------------------
  // Scenario 2: Bullish Momentum (Safe Position Increase)
  // -------------------------------------------------------------
  {
    id: 'scenario_2_bullish',
    title: 'Scenario 2: Bullish Order Flow & Expansion',
    narrative: 'Heavy aggressive buy flow on Kuru, positive order book imbalance (+0.68), low volatility. Jev signals trending_up and recommends increase_position. Hard risk gate verifies limits and executes Kuru buy.',
    target_behavior: 'System safely increases exposure via Kuru spot limit buy order with fast sub-second confirmation on Monad.',
    initial_position: {
      spot_exposure_usd: 800,
      perp_exposure_usd: 0,
      net_delta: 800,
      leverage: 0.65,
      unrealized_pnl: 22.00,
      realized_pnl_today: 45.00,
      drawdown_today: 0.2,
      spot_balance_mon: 200,
      usdc_balance: 2000,
      perp_short_size_mon: 0
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.05,
        bids: [{ price: 4.048, size: 4500 }, { price: 4.045, size: 8000 }, { price: 4.040, size: 12000 }],
        asks: [{ price: 4.052, size: 1800 }, { price: 4.055, size: 2200 }, { price: 4.060, size: 3100 }],
        aggressive_buy_flow: 5800,
        aggressive_sell_flow: 850,
        description: 'T=0s: Substantial buy wall formed. Ask side thinning rapidly.'
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.08,
        bids: [{ price: 4.078, size: 6200 }, { price: 4.074, size: 9500 }, { price: 4.070, size: 14000 }],
        asks: [{ price: 4.082, size: 1200 }, { price: 4.086, size: 1800 }, { price: 4.090, size: 2500 }],
        aggressive_buy_flow: 8400,
        aggressive_sell_flow: 600,
        description: 'T=1s: MON price breaks out to $4.08. Imbalance +0.72. Jev P(increase_position) = 0.74.'
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.10,
        bids: [{ price: 4.098, size: 7500 }, { price: 4.095, size: 11000 }, { price: 4.090, size: 15000 }],
        asks: [{ price: 4.102, size: 1100 }, { price: 4.105, size: 1600 }, { price: 4.110, size: 2200 }],
        aggressive_buy_flow: 9200,
        aggressive_sell_flow: 750,
        description: 'T=2s: Hard risk gate passes all 8 checks. Kuru limit order placed and filled on Monad.'
      }
    ]
  },

  // -------------------------------------------------------------
  // Scenario 3: Volatility Spike & Stale Order Cancellation
  // -------------------------------------------------------------
  {
    id: 'scenario_3_volatility_cancel',
    title: 'Scenario 3: Volatility Shock & Orderbook Evacuation',
    narrative: 'Sudden sell-side dump, bid depth evaporates, volatility percentile jumps to 96th, and 3 open maker orders sit dangerously close to aggressive flow. Jev detects high_volatility / liquidity_stress, triggers cancel_orders.',
    target_behavior: 'Atomic batch cancellation of stale orders on Kuru within 150ms on Monad, preventing catastrophic adverse selection.',
    initial_position: {
      spot_exposure_usd: 1400,
      perp_exposure_usd: 0,
      net_delta: 1400,
      leverage: 1.15,
      unrealized_pnl: -18.00,
      realized_pnl_today: 10.00,
      drawdown_today: 1.8,
      spot_balance_mon: 350,
      usdc_balance: 1100,
      perp_short_size_mon: 0
    },
    initial_orders: [
      { id: 'kuru_001', side: 'buy', price: 3.98, size: 50, age_seconds: 145, distance_from_mid_bps: 12, venue: 'kuru', status: 'open' },
      { id: 'kuru_002', side: 'buy', price: 3.96, size: 80, age_seconds: 180, distance_from_mid_bps: 25, venue: 'kuru', status: 'open' },
      { id: 'kuru_003', side: 'sell', price: 4.05, size: 40, age_seconds: 210, distance_from_mid_bps: 45, venue: 'kuru', status: 'open' }
    ],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 3.99,
        bids: [{ price: 3.985, size: 1500 }, { price: 3.970, size: 2100 }, { price: 3.950, size: 3000 }],
        asks: [{ price: 3.995, size: 8500 }, { price: 4.010, size: 14000 }, { price: 4.030, size: 22000 }],
        aggressive_buy_flow: 400,
        aggressive_sell_flow: 12500,
        description: 'T=0s: Enormous sell volume sweeps bids. Spread widens from 4 bps to 28 bps.'
      },
      {
        timestamp_offset_ms: 1000,
        price: 3.92,
        bids: [{ price: 3.910, size: 900 }, { price: 3.890, size: 1500 }, { price: 3.850, size: 2200 }],
        asks: [{ price: 3.930, size: 11000 }, { price: 3.950, size: 18000 }, { price: 3.980, size: 28000 }],
        aggressive_buy_flow: 200,
        aggressive_sell_flow: 18400,
        description: 'T=1s: Heavy downside continuation. Volatility percentile hits 96th. Jev P(cancel_orders) = 0.88.'
      },
      {
        timestamp_offset_ms: 2000,
        price: 3.88,
        bids: [{ price: 3.870, size: 800 }, { price: 3.850, size: 1200 }, { price: 3.820, size: 1900 }],
        asks: [{ price: 3.890, size: 13000 }, { price: 3.910, size: 21000 }, { price: 3.940, size: 31000 }],
        aggressive_buy_flow: 150,
        aggressive_sell_flow: 21000,
        description: 'T=2s: Batch cancel transaction confirmed on Monad in 120ms. 3 stale orders revoked.'
      }
    ]
  },

  // -------------------------------------------------------------
  // Scenario 4: Downside Uncertainty & Perpl Delta Hedging
  // -------------------------------------------------------------
  {
    id: 'scenario_4_hedge',
    title: 'Scenario 4: Downside Turbulence & Perpl Dynamic Hedge',
    narrative: 'User holds $1,800 MON spot. Macro volatility spikes and downside risk mounts, but the user mandate specifies preserving spot MON and hedging instead of selling spot. Jev identifies P(hedge) = 0.72. Perpl opens short hedge.',
    target_behavior: 'Perpl short perpetual opened while keeping spot allocation intact. Portfolio net delta neutralized from +$1,800 to $0.',
    initial_position: {
      spot_exposure_usd: 1800,
      perp_exposure_usd: 0,
      net_delta: 1800,
      leverage: 1.45,
      unrealized_pnl: 110.00,
      realized_pnl_today: 25.00,
      drawdown_today: 1.2,
      spot_balance_mon: 450,
      usdc_balance: 1250,
      perp_short_size_mon: 0
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.00,
        bids: [{ price: 3.992, size: 3000 }, { price: 3.980, size: 4500 }, { price: 3.960, size: 6000 }],
        asks: [{ price: 4.008, size: 5500 }, { price: 4.020, size: 8500 }, { price: 4.050, size: 12000 }],
        aggressive_buy_flow: 1200,
        aggressive_sell_flow: 6500,
        description: 'T=0s: Spot exposure utilization at 90%. Sell pressure builds on Kuru.'
      },
      {
        timestamp_offset_ms: 1000,
        price: 3.96,
        bids: [{ price: 3.950, size: 2200 }, { price: 3.930, size: 3800 }, { price: 3.900, size: 5100 }],
        asks: [{ price: 3.970, size: 7800 }, { price: 3.990, size: 11500 }, { price: 4.020, size: 16000 }],
        aggressive_buy_flow: 800,
        aggressive_sell_flow: 11200,
        description: 'T=1s: Jev risk probability: High=68%, Critical=16%. Action probability P(hedge)=0.72.'
      },
      {
        timestamp_offset_ms: 2000,
        price: 3.93,
        bids: [{ price: 3.920, size: 1900 }, { price: 3.900, size: 3200 }, { price: 3.870, size: 4800 }],
        asks: [{ price: 3.940, size: 9200 }, { price: 3.960, size: 13500 }, { price: 3.990, size: 19000 }],
        aggressive_buy_flow: 600,
        aggressive_sell_flow: 14500,
        description: 'T=2s: Perpl short hedge of $1,000 executed. Net delta reduced from +$1,800 to +$800. Capital protected.'
      }
    ]
  },

  // -------------------------------------------------------------
  // Scenario 5: Policy Violation Prevention (Hard Risk Gate Blocks AI)
  // -------------------------------------------------------------
  {
    id: 'scenario_5_risk_gate_blocks',
    title: 'Scenario 5: Safety Invariant Test — Hard Risk Gate BLOCKS Jev',
    narrative: 'AI hallucination / runaway bullish signal: Jev attempts to increase position, but user policy has a hard $2,000 max exposure limit and current exposure is already $1,950. The Deterministic Risk Engine forcefully BLOCKS execution and logs violation.',
    target_behavior: 'NON-NEGOTIABLE SAFETY: Execution is rejected with 0 Monad transaction submitted. Audit trail records policy breach.',
    initial_position: {
      spot_exposure_usd: 1950,
      perp_exposure_usd: 0,
      net_delta: 1950,
      leverage: 1.85,
      unrealized_pnl: 55.00,
      realized_pnl_today: 40.00,
      drawdown_today: 0.8,
      spot_balance_mon: 487.5,
      usdc_balance: 1050,
      perp_short_size_mon: 0
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.00,
        bids: [{ price: 3.995, size: 5000 }, { price: 3.990, size: 8000 }, { price: 3.980, size: 11000 }],
        asks: [{ price: 4.005, size: 2000 }, { price: 4.010, size: 3500 }, { price: 4.020, size: 5000 }],
        aggressive_buy_flow: 4500,
        aggressive_sell_flow: 900,
        description: 'T=0s: Position at $1,950 (97.5% of $2,000 cap). High buying flow.'
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.04,
        bids: [{ price: 4.035, size: 6800 }, { price: 4.030, size: 9500 }, { price: 4.020, size: 13000 }],
        asks: [{ price: 4.045, size: 1400 }, { price: 4.050, size: 2800 }, { price: 4.060, size: 4200 }],
        aggressive_buy_flow: 7200,
        aggressive_sell_flow: 650,
        description: 'T=1s: Jev erroneously proposes increase_position (clip $250) based on momentum.'
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.07,
        bids: [{ price: 4.065, size: 7500 }, { price: 4.060, size: 10500 }, { price: 4.050, size: 14500 }],
        asks: [{ price: 4.075, size: 1200 }, { price: 4.080, size: 2200 }, { price: 4.090, size: 3800 }],
        aggressive_buy_flow: 8500,
        aggressive_sell_flow: 500,
        description: 'T=2s: Deterministic Risk Gate intercepts action: Prospective $2,200 > Cap $2,000. EXECUTION BLOCKED!'
      }
    ]
  }
];
