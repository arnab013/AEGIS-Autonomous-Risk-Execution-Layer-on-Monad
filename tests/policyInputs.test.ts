import { describe, expect, it } from 'vitest';
import { validatePolicyInput } from '../src/ui/policyInputs.ts';
import type { PolicyInputKey } from '../src/ui/policyInputs.ts';

const mandateFields: PolicyInputKey[] = [
  'max_position_usd',
  'max_order_size',
  'max_daily_loss',
  'max_leverage',
  'max_slippage_bps',
  'min_liquidity_depth_usd',
];

describe('Mandate input validation uses the execution domains', () => {
  it.each(mandateFields)('permits zero for %s as a restrictive limit', (key) => {
    expect(validatePolicyInput(key, '0')).toBeNull();
  });

  it.each(['', ' ', 'NaN', 'Infinity', '-Infinity', 'not a number', '1e400'])(
    'rejects malformed or nonfinite input %j',
    (raw) => {
      expect(validatePolicyInput('max_position_usd', raw)).not.toBeNull();
      expect(validatePolicyInput('trade_size', raw)).not.toBeNull();
    }
  );

  it.each(mandateFields)('rejects negative %s', (key) => {
    expect(validatePolicyInput(key, '-1')).not.toBeNull();
  });

  it('permits finite decimal leverage and USD limits', () => {
    expect(validatePolicyInput('max_leverage', '0.25')).toBeNull();
    expect(validatePolicyInput('max_order_size', '10.50')).toBeNull();
    expect(validatePolicyInput('max_daily_loss', '1e3')).toBeNull();
  });

  it.each(['0', '-1'])('requires a positive trade size for %s', (raw) => {
    expect(validatePolicyInput('trade_size', raw)).not.toBeNull();
  });

  it('permits a positive finite trade size', () => {
    expect(validatePolicyInput('trade_size', '0.01')).toBeNull();
    expect(validatePolicyInput('trade_size', '250')).toBeNull();
  });

  it.each(['0', '500', '40'])('accepts the API slippage boundary %s', (raw) => {
    expect(validatePolicyInput('max_slippage_bps', raw)).toBeNull();
  });

  it.each(['501', '0.1', '10.5'])('rejects unsupported API slippage %s', (raw) => {
    expect(validatePolicyInput('max_slippage_bps', raw)).not.toBeNull();
  });
});
