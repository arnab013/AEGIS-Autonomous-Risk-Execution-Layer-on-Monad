import type { TradingAction, UserPolicy } from '../types/index.ts';
import { validatePolicyInput } from '../ui/policyInputs.ts';
import type { AgentIntent, AgentSessionContext, EditablePolicyKey, PolicyEdits } from './types.ts';

const actions: TradingAction[] = [
  'increase_position',
  'reduce_position',
  'hold',
  'hedge',
  'cancel_orders',
];
export const editablePolicyKeys: EditablePolicyKey[] = [
  'max_position_usd',
  'max_order_size',
  'max_daily_loss',
  'max_leverage',
  'max_slippage_bps',
  'min_liquidity_depth_usd',
  'is_paused',
];

export function object(value: unknown, label = 'Input'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function validatePolicy(value: unknown): UserPolicy {
  const input = object(value, 'Policy');
  const numeric = [
    'max_position_usd',
    'max_order_size',
    'max_daily_loss',
    'max_leverage',
    'max_slippage_bps',
    'min_liquidity_depth_usd',
    'max_open_orders',
    'stale_order_timeout_seconds',
    'cooldown_seconds',
  ] as const;
  const keys = new Set<string>([
    ...numeric,
    'allowed_assets',
    'allowed_venues',
    'permitted_actions',
    'is_paused',
  ]);
  if (Object.keys(input).some((key) => !keys.has(key)))
    throw new TypeError('Policy contains an unknown field');
  for (const key of numeric) {
    const number = input[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1e12)
      throw new TypeError(`Invalid policy value: ${key}`);
    if (key === 'max_slippage_bps' && validatePolicyInput(key, String(number)))
      throw new TypeError('Slippage must be a whole number from 0 to 500 bps');
    if (key === 'max_open_orders' && !Number.isInteger(number))
      throw new TypeError('Open order cap must be a whole number');
  }
  for (const key of ['allowed_assets', 'allowed_venues'] as const) {
    if (
      !Array.isArray(input[key]) ||
      input[key].length > 20 ||
      input[key].some((item) => typeof item !== 'string' || !/^[a-zA-Z0-9/_-]{1,32}$/.test(item))
    )
      throw new TypeError(`Invalid policy list: ${key}`);
  }
  if (
    !Array.isArray(input.permitted_actions) ||
    !input.permitted_actions.length ||
    input.permitted_actions.length > actions.length ||
    input.permitted_actions.some((action) => !actions.includes(action as TradingAction)) ||
    new Set(input.permitted_actions).size !== input.permitted_actions.length
  )
    throw new TypeError('Invalid permitted actions');
  if (typeof input.is_paused !== 'boolean')
    throw new TypeError('Policy pause must be true or false');
  return structuredClone(input) as unknown as UserPolicy;
}

export function validateSessionContext(value: unknown): AgentSessionContext {
  const input = object(value, 'Session context');
  const keys = ['mode', 'chainId', 'account', 'policy', 'policyRevision', 'clipUsd', 'scenarioId'];
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new TypeError('Unknown session context field');
  if (input.mode !== 'live' && input.mode !== 'replay')
    throw new TypeError('Select live or replay mode');
  if (!Number.isSafeInteger(input.chainId) || Number(input.chainId) <= 0)
    throw new TypeError('Invalid chain ID');
  if (
    input.account !== undefined &&
    (typeof input.account !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(input.account))
  )
    throw new TypeError('Invalid wallet account');
  if (!Number.isSafeInteger(input.policyRevision) || Number(input.policyRevision) < 0)
    throw new TypeError('Invalid policy revision');
  if (
    typeof input.clipUsd !== 'number' ||
    !Number.isFinite(input.clipUsd) ||
    input.clipUsd <= 0 ||
    input.clipUsd > 1e12
  )
    throw new TypeError('Trade size must be a positive finite number');
  if (
    input.scenarioId !== undefined &&
    (typeof input.scenarioId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.scenarioId))
  )
    throw new TypeError('Invalid replay scenario');
  return {
    mode: input.mode,
    chainId: Number(input.chainId),
    ...(input.account ? { account: String(input.account).toLowerCase() } : {}),
    policy: validatePolicy(input.policy),
    policyRevision: Number(input.policyRevision),
    clipUsd: input.clipUsd,
    ...(input.scenarioId ? { scenarioId: String(input.scenarioId) } : {}),
  };
}

export function applyPolicyEdits(
  policy: UserPolicy,
  value: unknown
): { changes: PolicyEdits; after: UserPolicy } {
  const edits = object(value, 'Policy changes');
  const names = Object.keys(edits);
  if (!names.length || names.some((key) => !editablePolicyKeys.includes(key as EditablePolicyKey)))
    throw new TypeError('Only the displayed session policy fields can be changed');
  const after = validatePolicy({ ...policy, ...edits });
  return { changes: structuredClone(edits) as PolicyEdits, after };
}

export function validateIntent(value: unknown, context: AgentSessionContext): AgentIntent {
  const input = object(value, 'Recommendation');
  const exactKeys = (keys: string[]) => {
    if (Object.keys(input).some((key) => !keys.includes(key)))
      throw new TypeError('Recommendation contains an unknown field');
  };
  if (input.kind === 'none') {
    exactKeys(['kind']);
    return { kind: 'none' };
  }
  if (input.kind === 'set_policy') {
    exactKeys(['kind', 'changes']);
    return { kind: 'set_policy', changes: applyPolicyEdits(context.policy, input.changes).changes };
  }
  if (input.kind === 'prepare_mon_reduction') {
    exactKeys(['kind', 'amountMon']);
    if (context.mode !== 'live' || !context.account)
      throw new TypeError('A MON sale needs a connected wallet in live mode');
    if (
      typeof input.amountMon !== 'string' ||
      !/^\d{1,30}(?:\.\d{1,18})?$/.test(input.amountMon) ||
      !Number.isFinite(Number(input.amountMon)) ||
      Number(input.amountMon) <= 0
    )
      throw new TypeError('MON sale amount must be a positive decimal string');
    return { kind: 'prepare_mon_reduction', amountMon: input.amountMon };
  }
  if (input.kind === 'replay_control') {
    exactKeys(['kind', 'action']);
    if (
      context.mode !== 'replay' ||
      !['step', 'play', 'pause', 'reset'].includes(String(input.action))
    )
      throw new TypeError('Replay controls belong to paper mode');
    return { kind: 'replay_control', action: input.action as 'step' | 'play' | 'pause' | 'reset' };
  }
  throw new TypeError('Unsupported recommendation');
}
