import React, { useEffect, useId, useRef, useState } from 'react';
import type { ChatMessage, PendingAgentIntent, PolicyEdits } from '../ai/types.ts';
import { actionLabel } from '../ui/evidence.ts';
import { ArrowUpRight, Clock, Cpu, ExternalLink, ShieldCheck } from './icons.tsx';
import { scoutProviders } from '../ui/scoutProviders.ts';

export interface AgentChatProps {
  messages: ChatMessage[];
  pending?: boolean;
  intent?: PendingAgentIntent | null;
  intentState?: Record<string, 'pending' | 'approved' | 'rejected'>;
  onSend: (message: string) => void;
  onApprove: (intent: PendingAgentIntent) => void;
  onReject: (intent: PendingAgentIntent) => void;
  busy?: boolean;
  disabled?: boolean;
  accessLabel?: string;
  onOpenAccess?: () => void;
  now?: number;
  error?: string | null;
}

const policyLabels: Record<keyof PolicyEdits, string> = {
  max_position_usd: 'Position cap · USD',
  max_order_size: 'Order size cap · USD',
  max_daily_loss: 'Daily loss cap · USD',
  max_leverage: 'Leverage cap',
  max_slippage_bps: 'Slippage cap · bps',
  min_liquidity_depth_usd: 'Minimum liquidity depth · USD',
  is_paused: 'Trading pause',
};

function displayPolicyValue(value: number | boolean | undefined): string {
  return value === undefined
    ? 'Unavailable'
    : typeof value === 'boolean'
      ? value
        ? 'Paused'
        : 'Running'
      : String(value);
}

function intentTitle(intent: PendingAgentIntent): string {
  if (intent.intent.kind === 'prepare_mon_reduction')
    return `Prepare a ${intent.intent.amountMon} MON sale`;
  if (intent.intent.kind === 'set_policy') return 'Review a session policy change';
  const replayLabels = {
    step: 'Step the replay',
    play: 'Play the replay',
    pause: 'Pause the replay',
    reset: 'Reset the replay',
  };
  return replayLabels[intent.intent.action];
}

function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function AgentChat({
  messages,
  pending = false,
  intent,
  intentState,
  onSend,
  onApprove,
  onReject,
  busy = false,
  disabled = false,
  accessLabel,
  onOpenAccess,
  now,
  error,
}: AgentChatProps) {
  const [draft, setDraft] = useState('');
  const [clock, setClock] = useState(Date.now());
  const inputId = useId();
  const conversationRef = useRef<HTMLDivElement>(null);
  const currentTime = now ?? clock;
  const state = intent ? (intentState?.[intent.id] ?? 'pending') : 'pending';
  const expired = Boolean(intent && currentTime >= intent.expiresAt);
  const waiting = pending || busy;

  useEffect(() => {
    if (!intent || state !== 'pending' || now !== undefined) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [intent, state, now]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages.length, pending, intent?.id]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || waiting || disabled) return;
    onSend(message);
    setDraft('');
  }

  const suggestions = [
    'What does the current market tell us?',
    'Explain my exposure and limits.',
    'What should I review before reducing MON?',
  ];

  return (
    <section className="agent-chat warm-card" aria-labelledby={inputId + '-title'}>
      <header className="agent-chat-header">
        <div>
          <span className="warm-eyebrow">
            <Cpu aria-hidden="true" /> Your context companion
          </span>
          <h2 id={inputId + '-title'}>Scout, in your corner.</h2>
        </div>
        <div className="agent-chat-access">
          <span className="warm-status warm-status-butter">Scout</span>
          {onOpenAccess && (
            <button className="warm-text-button" onClick={onOpenAccess}>
              {accessLabel ?? 'AI access'}
            </button>
          )}
        </div>
      </header>

      <div
        className="agent-chat-conversation"
        ref={conversationRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={pending}
      >
        {!messages.length && (
          <div className="agent-chat-welcome">
            <span className="warm-eyebrow">A question is a good place to start</span>
            <h3>
              See the context.
              <br />
              Consider the next step.
            </h3>
            <p>
              Ask about the market, your limits or a possible MON reduction. Recommendations stay
              separate from approval.
            </p>
            <div className="agent-chat-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  disabled={waiting || disabled}
                  onClick={() => {
                    if (!waiting && !disabled) onSend(suggestion);
                  }}
                >
                  {suggestion}
                  <ArrowUpRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <article
            className={'agent-message agent-message-' + message.role}
            key={message.id}
            aria-label={message.role === 'user' ? 'Your message' : 'Scout response'}
          >
            {message.role === 'assistant' && (
              <span className="agent-message-label">
                <Cpu aria-hidden="true" /> Scout
              </span>
            )}
            <p className="agent-message-text">{message.text}</p>
            {message.reply && (
              <div className="agent-message-context">
                {message.reply.jevDecision && (
                  <p className="agent-jev-finding">
                    <strong>
                      Jev finding: {actionLabel(message.reply.jevDecision.selected_action)}.
                    </strong>{' '}
                    {message.reply.recommendation.kind === 'prepare_mon_reduction' &&
                    message.reply.jevDecision.selected_action !== 'reduce_position'
                      ? 'Scout proposes a reduction that differs from Jev’s selected action.'
                      : message.reply.recommendation.kind === 'none' &&
                          message.reply.jevDecision.selected_action !== 'hold'
                        ? 'Scout recommends no application action; Jev selected a different action.'
                        : 'Scout’s explanation and application proposal are separate from Jev’s probabilities.'}
                  </p>
                )}
                {message.reply.rationale && (
                  <details>
                    <summary>Reasoning and limits</summary>
                    <p>{message.reply.rationale}</p>
                    {message.reply.limitations.length > 0 && (
                      <ul>
                        {message.reply.limitations.map((limitation, index) => (
                          <li key={index}>{limitation}</li>
                        ))}
                      </ul>
                    )}
                    {message.reply.jevUnavailableReason && (
                      <p className="agent-jev-unavailable">
                        Jev unavailable: {message.reply.jevUnavailableReason}
                      </p>
                    )}
                  </details>
                )}
                {message.reply.citations.length > 0 && (
                  <ul className="agent-citations" aria-label="Sources">
                    {message.reply.citations.map((citation) => {
                      const href = safeSourceUrl(citation.url);
                      return (
                        <li key={citation.id}>
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer">
                              {citation.source} · {citation.title} ·{' '}
                              {new Date(citation.publishedAt).toLocaleDateString()}
                              <ExternalLink aria-hidden="true" />
                            </a>
                          ) : (
                            <span>
                              {citation.source} · {citation.title}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="agent-message-provenance">
                  {scoutProviders[message.reply.provider].label} · {message.reply.model} · Context
                  observed {new Date(message.reply.observedAt).toLocaleTimeString()}
                </p>
              </div>
            )}
            {message.role === 'user' && (
              <time
                className="agent-message-time"
                dateTime={new Date(message.timestamp).toISOString()}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </time>
            )}
          </article>
        ))}
        {pending && (
          <div className="agent-chat-thinking" role="status">
            <Cpu aria-hidden="true" />
            <span>Reviewing the available context…</span>
          </div>
        )}
      </div>

      {intent && (
        <section
          className={'agent-intent' + (expired || state !== 'pending' ? ' is-settled' : '')}
          aria-labelledby={inputId + '-intent'}
        >
          <div className="agent-intent-heading">
            <ShieldCheck aria-hidden="true" />
            <span className="warm-card-kicker">
              {state === 'approved'
                ? 'Approved step'
                : state === 'rejected'
                  ? 'Dismissed suggestion'
                  : 'A suggestion for your review'}
            </span>
          </div>
          <h3 id={inputId + '-intent'}>{intentTitle(intent)}</h3>
          <p>{intent.rationale}</p>
          {intent.intent.kind === 'set_policy' && (
            <dl className="agent-policy-changes">
              {(
                Object.entries(intent.intent.changes) as Array<
                  [keyof PolicyEdits, number | boolean]
                >
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{policyLabels[key]}</dt>
                  <dd>
                    <span>{displayPolicyValue(intent.policyBefore?.[key])}</span>
                    <span aria-label="changes to"> → </span>
                    <strong>{displayPolicyValue(value)}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="agent-intent-note">
            {intent.intent.kind === 'prepare_mon_reduction'
              ? 'Approval prepares and simulates a quote. Signing happens separately in your wallet.'
              : intent.intent.kind === 'set_policy'
                ? 'Approval changes only the listed session limits and invalidates any prepared quote.'
                : 'Approval changes only the synthetic replay controls. No chain transaction is submitted.'}
          </p>
          {state === 'pending' ? (
            <>
              <div className="agent-intent-expiry" role="status">
                <Clock aria-hidden="true" />
                {expired
                  ? 'This suggestion expired. Ask for a fresh review.'
                  : `Review expires in ${Math.max(0, Math.ceil((intent.expiresAt - currentTime) / 1000))}s`}
              </div>
              <div className="warm-button-row">
                <button
                  className="warm-button warm-button-primary"
                  disabled={waiting || disabled || expired}
                  onClick={() => onApprove(intent)}
                >
                  {intent.intent.kind === 'prepare_mon_reduction'
                    ? 'Approve quote preparation'
                    : intent.intent.kind === 'set_policy'
                      ? 'Approve session change'
                      : 'Approve replay change'}
                </button>
                <button
                  className="warm-button warm-button-outline"
                  disabled={waiting}
                  onClick={() => onReject(intent)}
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : (
            <p className="agent-intent-settled" role="status">
              {state === 'approved'
                ? 'This step was approved. Follow its result in the workspace.'
                : 'This suggestion was dismissed.'}
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="agent-chat-error" role="alert">
          {error}
        </p>
      )}
      <form className="agent-chat-composer" onSubmit={send}>
        <label htmlFor={inputId}>Ask Aegis</label>
        <div className="agent-chat-input-row">
          <textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What would you like to understand?"
            rows={2}
            maxLength={4000}
            disabled={waiting || disabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            className="agent-send-button"
            disabled={waiting || disabled || !draft.trim()}
            aria-label="Send message"
          >
            <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
        <p>
          {disabled
            ? 'Choose AI access to start a conversation.'
            : 'Scout provides context, not authorization. Every action needs your review.'}
        </p>
      </form>
    </section>
  );
}
