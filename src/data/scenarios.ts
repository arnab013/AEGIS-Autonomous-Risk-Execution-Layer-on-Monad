import { ReplayScenario, PositionState, Order } from '../types/index.ts';

export const REPLAY_SCENARIOS: ReplayScenario[] = [
  // -------------------------------------------------------------
  // Scenario 1: Normal Balanced Market (System Holds)
  // -------------------------------------------------------------
  {
    id: 'scenario_1_normal',
    title: 'Scenario 1: Steady Range-Bound Market',
    narrative:
      'Synthetic balanced order book with small price changes. A local heuristic produces illustrative probabilities; the policy engine evaluates whether to hold.',
    target_behavior:
      'Evaluate a calm market without changing paper inventory when the selected action is hold. No API call or chain transaction occurs.',
    initial_position: {
      spot_exposure_usd: 1200,
      perp_exposure_usd: 0,
      net_delta: 1200,
      leverage: 1.0,
      unrealized_pnl: 14.5,
      realized_pnl_today: 32.0,
      drawdown_today: 0.5,
      spot_balance_mon: 300,
      usdc_balance: 1500,
      perp_short_size_mon: 0,
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.0,
        bids: [
          { price: 3.999, size: 2500 },
          { price: 3.995, size: 4000 },
          { price: 3.99, size: 6000 },
        ],
        asks: [
          { price: 4.001, size: 2400 },
          { price: 4.005, size: 3800 },
          { price: 4.01, size: 6200 },
        ],
        aggressive_buy_flow: 1200,
        aggressive_sell_flow: 1150,
        description: 'Replay T=0s: Balanced synthetic book and similar buy/sell flow.',
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.002,
        bids: [
          { price: 4.0, size: 2600 },
          { price: 3.996, size: 4100 },
          { price: 3.991, size: 5900 },
        ],
        asks: [
          { price: 4.003, size: 2500 },
          { price: 4.007, size: 3900 },
          { price: 4.012, size: 6000 },
        ],
        aggressive_buy_flow: 1400,
        aggressive_sell_flow: 1300,
        description: 'Replay T=1s: Small synthetic uptick with balanced depth.',
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.001,
        bids: [
          { price: 3.999, size: 2700 },
          { price: 3.995, size: 4200 },
          { price: 3.99, size: 6100 },
        ],
        asks: [
          { price: 4.002, size: 2600 },
          { price: 4.006, size: 4000 },
          { price: 4.011, size: 5800 },
        ],
        aggressive_buy_flow: 900,
        aggressive_sell_flow: 950,
        description:
          'Replay T=2s: Synthetic price settles near its starting level. Inspect the computed probabilities and selected action.',
      },
    ],
  },

  // -------------------------------------------------------------
  // Scenario 2: Bullish Momentum (Safe Position Increase)
  // -------------------------------------------------------------
  {
    id: 'scenario_2_bullish',
    title: 'Scenario 2: Bullish Order Flow & Expansion',
    narrative:
      'Synthetic buying pressure and stronger bid depth support an increase proposal from the local heuristic. Any paper purchase must pass the current user limits.',
    target_behavior:
      'A permitted paper taker purchase walks the supplied synthetic asks and updates paper cash/inventory. No live Kuru order is placed.',
    initial_position: {
      spot_exposure_usd: 800,
      perp_exposure_usd: 0,
      net_delta: 800,
      leverage: 0.65,
      unrealized_pnl: 22.0,
      realized_pnl_today: 45.0,
      drawdown_today: 0.2,
      spot_balance_mon: 200,
      usdc_balance: 2000,
      perp_short_size_mon: 0,
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.05,
        bids: [
          { price: 4.048, size: 4500 },
          { price: 4.045, size: 8000 },
          { price: 4.04, size: 12000 },
        ],
        asks: [
          { price: 4.052, size: 1800 },
          { price: 4.055, size: 2200 },
          { price: 4.06, size: 3100 },
        ],
        aggressive_buy_flow: 5800,
        aggressive_sell_flow: 850,
        description: 'Replay T=0s: Synthetic bid depth exceeds ask depth.',
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.08,
        bids: [
          { price: 4.078, size: 6200 },
          { price: 4.074, size: 9500 },
          { price: 4.07, size: 14000 },
        ],
        asks: [
          { price: 4.082, size: 1200 },
          { price: 4.086, size: 1800 },
          { price: 4.09, size: 2500 },
        ],
        aggressive_buy_flow: 8400,
        aggressive_sell_flow: 600,
        description:
          'Replay T=1s: Synthetic price rises with buying flow. Probabilities are calculated by the heuristic at runtime.',
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.1,
        bids: [
          { price: 4.098, size: 7500 },
          { price: 4.095, size: 11000 },
          { price: 4.09, size: 15000 },
        ],
        asks: [
          { price: 4.102, size: 1100 },
          { price: 4.105, size: 1600 },
          { price: 4.11, size: 2200 },
        ],
        aggressive_buy_flow: 9200,
        aggressive_sell_flow: 750,
        description:
          'Replay T=2s: Inspect policy checks and any paper fill. A failed check blocks the proposal.',
      },
    ],
  },

  // -------------------------------------------------------------
  // Scenario 3: Volatility Spike & Stale Order Cancellation
  // -------------------------------------------------------------
  {
    id: 'scenario_3_volatility_cancel',
    title: 'Scenario 3: Liquidity Shock & Paper Cancellation',
    narrative:
      'Synthetic sell pressure, wider spreads and weaker bids stress three existing paper orders. The heuristic and deterministic controls evaluate cancellation.',
    target_behavior:
      'Remove stale orders from the local paper ledger. This does not send a Kuru cancellation transaction or prove prevented losses.',
    initial_position: {
      spot_exposure_usd: 1400,
      perp_exposure_usd: 0,
      net_delta: 1400,
      leverage: 1.15,
      unrealized_pnl: -18.0,
      realized_pnl_today: 10.0,
      drawdown_today: 1.8,
      spot_balance_mon: 350,
      usdc_balance: 1100,
      perp_short_size_mon: 0,
    },
    initial_orders: [
      {
        id: 'kuru_001',
        side: 'buy',
        price: 3.98,
        size: 50,
        age_seconds: 145,
        distance_from_mid_bps: 12,
        venue: 'kuru',
        status: 'open',
      },
      {
        id: 'kuru_002',
        side: 'buy',
        price: 3.96,
        size: 80,
        age_seconds: 180,
        distance_from_mid_bps: 25,
        venue: 'kuru',
        status: 'open',
      },
      {
        id: 'kuru_003',
        side: 'sell',
        price: 4.05,
        size: 40,
        age_seconds: 210,
        distance_from_mid_bps: 45,
        venue: 'kuru',
        status: 'open',
      },
    ],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 3.99,
        bids: [
          { price: 3.985, size: 1500 },
          { price: 3.97, size: 2100 },
          { price: 3.95, size: 3000 },
        ],
        asks: [
          { price: 3.995, size: 8500 },
          { price: 4.01, size: 14000 },
          { price: 4.03, size: 22000 },
        ],
        aggressive_buy_flow: 400,
        aggressive_sell_flow: 12500,
        description: 'Replay T=0s: Synthetic selling pressure and a wide bid/ask spread.',
      },
      {
        timestamp_offset_ms: 1000,
        price: 3.92,
        bids: [
          { price: 3.91, size: 900 },
          { price: 3.89, size: 1500 },
          { price: 3.85, size: 2200 },
        ],
        asks: [
          { price: 3.93, size: 11000 },
          { price: 3.95, size: 18000 },
          { price: 3.98, size: 28000 },
        ],
        aggressive_buy_flow: 200,
        aggressive_sell_flow: 18400,
        description:
          'Replay T=1s: Synthetic downside continuation increases the computed volatility stress index.',
      },
      {
        timestamp_offset_ms: 2000,
        price: 3.88,
        bids: [
          { price: 3.87, size: 800 },
          { price: 3.85, size: 1200 },
          { price: 3.82, size: 1900 },
        ],
        asks: [
          { price: 3.89, size: 13000 },
          { price: 3.91, size: 21000 },
          { price: 3.94, size: 31000 },
        ],
        aggressive_buy_flow: 150,
        aggressive_sell_flow: 21000,
        description:
          'Replay T=2s: Inspect the local order ledger and paper cancellation record; no chain receipt exists.',
      },
    ],
  },

  // -------------------------------------------------------------
  // Scenario 4: Downside Uncertainty & Paper Hedge Proposal
  // -------------------------------------------------------------
  {
    id: 'scenario_4_hedge',
    title: 'Scenario 4: Downside Stress & Paper Hedge',
    narrative:
      'Synthetic downside stress prompts a protective hedge, but the stressed book fails the default slippage and depth checks. Replay hedge prices come from the spot book; Perpl is not integrated.',
    target_behavior:
      'Show the proposal and the failed policy checks. Increasing the slippage cap alone does not restore depth inside the 25 bps window. Any replay hedge updates only the paper portfolio.',
    initial_position: {
      spot_exposure_usd: 1800,
      perp_exposure_usd: 0,
      net_delta: 1800,
      leverage: 1.45,
      unrealized_pnl: 110.0,
      realized_pnl_today: 25.0,
      drawdown_today: 1.2,
      spot_balance_mon: 450,
      usdc_balance: 1250,
      perp_short_size_mon: 0,
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.0,
        bids: [
          { price: 3.992, size: 3000 },
          { price: 3.98, size: 4500 },
          { price: 3.96, size: 6000 },
        ],
        asks: [
          { price: 4.008, size: 5500 },
          { price: 4.02, size: 8500 },
          { price: 4.05, size: 12000 },
        ],
        aggressive_buy_flow: 1200,
        aggressive_sell_flow: 6500,
        description:
          'Replay T=0s: Synthetic selling pressure affects an existing paper MON position.',
      },
      {
        timestamp_offset_ms: 1000,
        price: 3.96,
        bids: [
          { price: 3.95, size: 2200 },
          { price: 3.93, size: 3800 },
          { price: 3.9, size: 5100 },
        ],
        asks: [
          { price: 3.97, size: 7800 },
          { price: 3.99, size: 11500 },
          { price: 4.02, size: 16000 },
        ],
        aggressive_buy_flow: 800,
        aggressive_sell_flow: 11200,
        description:
          'Replay T=1s: Inspect heuristic risk/action probabilities and the slippage rejection under the current mandate.',
      },
      {
        timestamp_offset_ms: 2000,
        price: 3.93,
        bids: [
          { price: 3.92, size: 1900 },
          { price: 3.9, size: 3200 },
          { price: 3.87, size: 4800 },
        ],
        asks: [
          { price: 3.94, size: 9200 },
          { price: 3.96, size: 13500 },
          { price: 3.99, size: 19000 },
        ],
        aggressive_buy_flow: 600,
        aggressive_sell_flow: 14500,
        description:
          'Replay T=2s: Compare the default cap with an explicitly chosen higher cap. Any permitted hedge changes only the paper ledger.',
      },
    ],
  },

  // -------------------------------------------------------------
  // Scenario 5: Policy Violation Prevention (Hard Risk Gate Blocks AI)
  // -------------------------------------------------------------
  {
    id: 'scenario_5_risk_gate_blocks',
    title: 'Scenario 5: Oversized Proposal Blocked',
    narrative:
      'A synthetic bullish signal proposes adding inventory near the position cap. The local heuristic can favor an increase, while deterministic policy rejects a proposal that exceeds the user limit.',
    target_behavior:
      'Show the failed prospective-exposure check and unchanged paper inventory. The journal records the rejection; replay never requests a wallet transaction.',
    initial_position: {
      spot_exposure_usd: 1950,
      perp_exposure_usd: 0,
      net_delta: 1950,
      leverage: 1.85,
      unrealized_pnl: 55.0,
      realized_pnl_today: 40.0,
      drawdown_today: 0.8,
      spot_balance_mon: 487.5,
      usdc_balance: 1050,
      perp_short_size_mon: 0,
    },
    initial_orders: [],
    ticks: [
      {
        timestamp_offset_ms: 0,
        price: 4.0,
        bids: [
          { price: 3.995, size: 5000 },
          { price: 3.99, size: 8000 },
          { price: 3.98, size: 11000 },
        ],
        asks: [
          { price: 4.005, size: 2000 },
          { price: 4.01, size: 3500 },
          { price: 4.02, size: 5000 },
        ],
        aggressive_buy_flow: 4500,
        aggressive_sell_flow: 900,
        description:
          'Replay T=0s: Paper exposure starts close to the default position cap, with synthetic buying flow.',
      },
      {
        timestamp_offset_ms: 1000,
        price: 4.04,
        bids: [
          { price: 4.035, size: 6800 },
          { price: 4.03, size: 9500 },
          { price: 4.02, size: 13000 },
        ],
        asks: [
          { price: 4.045, size: 1400 },
          { price: 4.05, size: 2800 },
          { price: 4.06, size: 4200 },
        ],
        aggressive_buy_flow: 7200,
        aggressive_sell_flow: 650,
        description:
          'Replay T=1s: The local heuristic can propose an increase. Current limits decide whether the selected trade size is permitted.',
      },
      {
        timestamp_offset_ms: 2000,
        price: 4.07,
        bids: [
          { price: 4.065, size: 7500 },
          { price: 4.06, size: 10500 },
          { price: 4.05, size: 14500 },
        ],
        asks: [
          { price: 4.075, size: 1200 },
          { price: 4.08, size: 2200 },
          { price: 4.09, size: 3800 },
        ],
        aggressive_buy_flow: 8500,
        aggressive_sell_flow: 500,
        description:
          'Replay T=2s: Inspect the computed prospective exposure, position cap and blocked proposal in the audit trail.',
      },
    ],
  },
];
