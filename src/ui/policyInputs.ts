export type PolicyInputKey =
  | 'max_position_usd'
  | 'max_order_size'
  | 'max_daily_loss'
  | 'max_leverage'
  | 'max_slippage_bps'
  | 'min_liquidity_depth_usd'
  | 'trade_size';

export function validatePolicyInput(key: PolicyInputKey, raw: string): string | null {
  if (!raw.trim()) return 'Enter a number.';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Enter a finite number.';
  if (key === 'max_slippage_bps')
    return Number.isInteger(value) && value >= 0 && value <= 500
      ? null
      : 'Use a whole number from 0 to 500 bps.';
  if (key === 'trade_size') return value > 0 ? null : 'Trade size must be greater than zero.';
  return value >= 0 ? null : 'Use zero or a positive number.';
}
