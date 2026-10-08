import type { HardCheckItem } from '../types/index.ts';

const passedMessages: Record<string, string> = {
  sell_quantity: 'The sell quantity is valid or is not required for this proposal.',
  bounded_action: 'The proposed action is one of the supported actions.',
  valid_inputs: 'Risk inputs, policy limits and order size are finite and valid.',
  emergency_pause: 'Trading is active for this action.',
  policy_permitted_action: 'The proposed action is permitted by the mandate.',
  allowed_venue: 'The execution venue is allowed by the mandate.',
  allowed_assets: 'Both market assets are allowed by the mandate.',
  market_freshness: 'The order book is valid, uncrossed and within the freshness limit.',
  max_position_usd: 'Prospective exposure is within the position cap.',
  max_leverage: 'Prospective leverage is within the leverage cap.',
  max_daily_loss: 'Recorded daily loss is below the loss cap.',
  max_order_size: 'The proposed order amount is within the order cap.',
  cash_available: 'Unreserved USDC covers the proposed spot purchase.',
  inventory_available: 'Unreserved MON covers the proposed reduction.',
  hedge_reduces_delta: 'The hedge does not exceed the current positive net delta.',
  min_liquidity_depth: 'Order book depth meets the minimum required by the mandate.',
  max_slippage_bps: 'The book can fill the clip within the slippage cap.',
  max_open_orders: 'The open-order count is below the configured cap.',
  trade_cooldown: 'The configured trade cooldown has elapsed.',
  state_consistency: 'The observation and mandate remained unchanged during assessment.',
};

export function describePolicyCheck(
  name: string,
  check: HardCheckItem
): {
  status: 'Passed' | 'Blocked' | 'Not applicable';
  message: string;
  blocked: boolean;
} {
  if (check.applies === false)
    return {
      status: 'Not applicable',
      message: 'This requirement does not apply to the proposed action.',
      blocked: false,
    };
  if (!check.passed) return { status: 'Blocked', message: check.message, blocked: true };
  return {
    status: 'Passed',
    message: passedMessages[name] ?? 'This requirement is satisfied for the proposal.',
    blocked: false,
  };
}
