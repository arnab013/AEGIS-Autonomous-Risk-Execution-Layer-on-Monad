import type {
  JevDecisionState,
  JevStatePayload,
  MarketState,
  OrdersState,
  PositionState,
  RiskMetrics,
  UserPolicy,
} from '../types/index.ts';

export type ScoutProvider = 'mistral' | 'openai' | 'anthropic' | 'google';
export type AiProvider = 'jev' | ScoutProvider;
export type AiFunding = 'sponsored' | 'byok' | 'disabled';
export type AiPool = 'implementation' | 'public';
export type EditablePolicyKey =
  | 'max_position_usd'
  | 'max_order_size'
  | 'max_daily_loss'
  | 'max_leverage'
  | 'max_slippage_bps'
  | 'min_liquidity_depth_usd'
  | 'is_paused';
export type PolicyEdits = Partial<Pick<UserPolicy, EditablePolicyKey>>;

export interface AiAccess {
  jevFunding: AiFunding;
  agentFunding: AiFunding;
  agentProvider: ScoutProvider;
  /** These fields belong in private session memory, never history or exports. */
  jevKey: string;
  agentKey: string;
  implementationToken?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  reply?: AgentReply;
}

export interface AgentSessionContext {
  mode: 'live' | 'replay';
  chainId: number;
  account?: string;
  policy: UserPolicy;
  policyRevision: number;
  clipUsd: number;
  scenarioId?: string;
}

export type AgentIntent =
  | { kind: 'none' }
  | { kind: 'prepare_mon_reduction'; amountMon: string }
  | { kind: 'set_policy'; changes: PolicyEdits }
  | { kind: 'replay_control'; action: 'step' | 'play' | 'pause' | 'reset' };

export interface PendingAgentIntent {
  id: string;
  intent: Exclude<AgentIntent, { kind: 'none' }>;
  token: string;
  contextHash: string;
  createdAt: number;
  expiresAt: number;
  rationale: string;
  policyBefore?: UserPolicy;
  policyAfter?: UserPolicy;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: 'CoinDesk' | 'Decrypt';
  publishedAt: number;
}

export interface NewsContext {
  fetchedAt: number;
  articles: NewsArticle[];
  unavailableSources: string[];
  unavailableDetails?: Record<string, string>;
}

export interface JevEvidence {
  input: JevStatePayload;
  response: unknown;
  receipt: string;
  observedAt: number;
  evaluatedAt: number;
  capture?: {
    context: AgentSessionContext;
    market: MarketState;
    position: PositionState;
    orders: OrdersState;
    risk: RiskMetrics;
    policy: UserPolicy;
    coverage: string[];
  };
}

export interface AgentRequest {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  context: AgentSessionContext;
  /** Replay is user-supplied paper state; live observations are captured by the server. */
  replayInput?: JevStatePayload;
  jevEvidence?: JevEvidence;
}

export interface AgentReply {
  id: string;
  message: string;
  provider: ScoutProvider;
  model: string;
  observedAt: number;
  contextHash: string;
  rationale: string;
  limitations: string[];
  citations: NewsArticle[];
  recommendation: AgentIntent;
  pendingIntent?: PendingAgentIntent;
  assessment?: JevEvidence;
  jevDecision?: JevDecisionState;
  jevUnavailableReason?: string;
}

export interface AgentApprovalRequest {
  token: string;
  context: AgentSessionContext;
}

export interface AgentApprovalResponse {
  approved: true;
  intentId: string;
  intent: Exclude<AgentIntent, { kind: 'none' }>;
  policyAfter?: UserPolicy;
  /** Approval can prepare a quote or apply a session edit; it never signs a transaction. */
  signingRequired: boolean;
}

export interface AiStatus {
  enabled: boolean;
  jevConfigured: boolean;
  agentConfigured: boolean;
  agentProvider: ScoutProvider;
  turnstileSiteKey?: string;
  sessionActive: boolean;
  pool: AiPool;
  model: string;
  jevModel: string;
  poolRemainingMicros?: number;
  totalRemainingMicros?: number;
  visitorTurnsRemaining?: number;
  ipTurnsRemaining?: number;
  busy?: boolean;
  retryAfterMs?: number;
}

export interface KeyCheckResult {
  provider: ScoutProvider;
  model: string;
  checkedAt: number;
  status: 'accepted' | 'rejected' | 'rate_limited' | 'unavailable' | 'model_unavailable';
  /** Model access checks do not establish inference quota or a successful response. */
  generationVerified: false;
  message: string;
  retryAfterMs?: number;
  code?: 'key_check_cooldown' | 'provider_rate_limited';
}
