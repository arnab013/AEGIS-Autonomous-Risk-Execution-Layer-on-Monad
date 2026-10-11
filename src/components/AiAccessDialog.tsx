import React, { useEffect, useId, useRef } from 'react';
import type { AiFunding, KeyCheckResult, ScoutProvider } from '../ai/types.ts';
import { Cpu, ShieldCheck, X } from './icons.tsx';
import { scoutProviders } from '../ui/scoutProviders.ts';

export type AiFundingChoice = AiFunding;

export interface AiAccessDialogProps {
  open: boolean;
  jevFunding: AiFundingChoice;
  agentFunding: AiFundingChoice;
  agentProvider: ScoutProvider;
  onJevFundingChange: (funding: AiFundingChoice) => void;
  onAgentFundingChange: (funding: AiFundingChoice) => void;
  onAgentProviderChange: (provider: ScoutProvider) => void;
  jevKey: string;
  agentKey: string;
  onJevKeyChange: (key: string) => void;
  onAgentKeyChange: (key: string) => void;
  onCheckAgentKey: () => void;
  agentKeyCheck?: KeyCheckResult | null;
  agentKeyChecking?: boolean;
  onApply: () => void;
  onClose: () => void;
  jevSponsoredAvailable?: boolean;
  agentSponsoredAvailable?: boolean;
  trialProvider?: ScoutProvider;
  trialModel?: string;
  sponsoredAvailable?: boolean;
  busy?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}

function FundingOptions({
  label,
  value,
  onChange,
  sponsoredAvailable,
  disabled,
  id,
}: {
  label: string;
  value: AiFundingChoice;
  onChange: (value: AiFundingChoice) => void;
  sponsoredAvailable: boolean;
  disabled: boolean;
  id: string;
}) {
  return (
    <fieldset className="ai-funding-options" disabled={disabled}>
      <legend>{label} access</legend>
      {(
        [
          [
            'sponsored',
            'Sponsored trial',
            sponsoredAvailable
              ? 'Uses the available shared trial allowance.'
              : 'Trial verification or allowance is not available yet.',
          ],
          ['byok', 'Use my API key', 'Uses your own provider account and credits.'],
          ['disabled', 'Keep this off', 'No requests to this provider.'],
        ] as const
      ).map(([funding, title, description]) => (
        <label key={funding} className={value === funding ? 'is-selected' : ''}>
          <input
            type="radio"
            name={id}
            value={funding}
            checked={value === funding}
            onChange={() => onChange(funding)}
          />
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function AiAccessDialog({
  open,
  jevFunding,
  agentFunding,
  agentProvider,
  onJevFundingChange,
  onAgentFundingChange,
  onAgentProviderChange,
  jevKey,
  agentKey,
  onJevKeyChange,
  onAgentKeyChange,
  onCheckAgentKey,
  agentKeyCheck,
  agentKeyChecking = false,
  onApply,
  onClose,
  jevSponsoredAvailable,
  agentSponsoredAvailable,
  trialProvider = 'mistral',
  trialModel,
  sponsoredAvailable = false,
  busy = false,
  error,
  children,
}: AiAccessDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  useEffect(
    () => () => {
      dialogRef.current?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    },
    []
  );

  return (
    <dialog
      ref={dialogRef}
      className="ai-access-dialog"
      aria-labelledby={id + '-title'}
      aria-describedby={id + '-description'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          )
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="ai-access-header">
        <div>
          <span className="warm-eyebrow">
            <Cpu aria-hidden="true" /> AI access
          </span>
          <h2 id={id + '-title'}>AI, on your terms.</h2>
        </div>
        <button className="warm-icon-button" onClick={onClose} aria-label="Close AI access">
          <X aria-hidden="true" />
        </button>
      </header>
      <p id={id + '-description'} className="ai-access-intro">
        Choose access for each provider. Scout explains the context; Jev assesses structured
        uncertainty. Your policy and wallet approval remain independent.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onApply();
        }}
      >
        <div className="ai-access-provider-grid">
          <section>
            <h3>Scout</h3>
            <p>
              Your conversation and market explanation. The project trial uses{' '}
              {scoutProviders[trialProvider].label}
              {trialModel ? ' · ' + trialModel : ''}; your own key can use another provider.
            </p>
            <FundingOptions
              label="Scout"
              value={agentFunding}
              onChange={onAgentFundingChange}
              sponsoredAvailable={agentSponsoredAvailable ?? sponsoredAvailable}
              disabled={busy}
              id={id + '-agent-funding'}
            />
            {agentFunding === 'byok' && (
              <div className="ai-scout-key-settings">
                <label className="ai-key-field" htmlFor={id + '-agent-provider'}>
                  Scout provider
                  <select
                    id={id + '-agent-provider'}
                    value={agentProvider}
                    onChange={(event) => onAgentProviderChange(event.target.value as ScoutProvider)}
                    disabled={busy}
                    aria-describedby={id + '-agent-provider-note'}
                  >
                    {Object.entries(scoutProviders).map(([provider, details]) => (
                      <option key={provider} value={provider}>
                        {details.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p id={id + '-agent-provider-note'} className="ai-provider-note">
                  Changing provider removes the previous key. Each provider needs its own account
                  and available API credits. {scoutProviders[agentProvider].note}
                </p>
                <label className="ai-key-field" htmlFor={id + '-agent-key'}>
                  {scoutProviders[agentProvider].keyLabel}
                  <input
                    id={id + '-agent-key'}
                    type="password"
                    value={agentKey}
                    onChange={(event) => onAgentKeyChange(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    placeholder={'Enter your ' + scoutProviders[agentProvider].label + ' key'}
                    aria-describedby={id + '-agent-key-note'}
                  />
                </label>
                <div className="ai-key-check-row">
                  <button
                    type="button"
                    className="warm-button warm-button-outline"
                    disabled={busy || agentKeyChecking || !agentKey.trim()}
                    onClick={onCheckAgentKey}
                  >
                    {agentKeyChecking ? 'Checking key…' : 'Check key'}
                  </button>
                  <button
                    type="button"
                    className="warm-text-button"
                    disabled={busy || !agentKey.trim()}
                    onClick={() => onAgentKeyChange('')}
                  >
                    Remove key
                  </button>
                  <p id={id + '-agent-key-note'}>
                    This checks access without generating a response. Sending a chat may use your
                    provider credits.
                  </p>
                </div>
                <div className="ai-key-check-status" role="status" aria-live="polite">
                  {agentKeyChecking ? (
                    <p>Checking {scoutProviders[agentProvider].label} access…</p>
                  ) : agentKeyCheck ? (
                    <div data-check-status={agentKeyCheck.status}>
                      <strong>
                        {agentKeyCheck.status === 'accepted'
                          ? 'Key accepted · response generation unverified'
                          : agentKeyCheck.status === 'rejected'
                            ? 'Key rejected'
                            : agentKeyCheck.status === 'rate_limited'
                              ? agentKeyCheck.code === 'key_check_cooldown'
                                ? 'Wait before checking another key'
                                : 'Provider rate or usage limit reached'
                              : agentKeyCheck.status === 'model_unavailable'
                                ? 'Scout model unavailable for this key'
                                : 'Key check unavailable'}
                      </strong>
                      <p>{agentKeyCheck.message}</p>
                      <p className="ai-key-check-provenance">
                        {scoutProviders[agentKeyCheck.provider].label} · {agentKeyCheck.model} ·{' '}
                        Checked {new Date(agentKeyCheck.checkedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ) : (
                    <p>Key not checked. An accepted key does not prove generation quota.</p>
                  )}
                </div>
              </div>
            )}
          </section>
          <section>
            <h3>Jev</h3>
            <p>A separate assessment of captured evidence.</p>
            <FundingOptions
              label="Jev"
              value={jevFunding}
              onChange={onJevFundingChange}
              sponsoredAvailable={jevSponsoredAvailable ?? sponsoredAvailable}
              disabled={busy}
              id={id + '-jev-funding'}
            />
            {jevFunding === 'byok' && (
              <label className="ai-key-field" htmlFor={id + '-jev-key'}>
                TypeSafe API key
                <input
                  id={id + '-jev-key'}
                  type="password"
                  value={jevKey}
                  onChange={(event) => onJevKeyChange(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  placeholder="Enter your TypeSafe key"
                />
              </label>
            )}
          </section>
        </div>
        {children && <div className="ai-access-verification">{children}</div>}
        <div className="ai-access-privacy">
          <ShieldCheck aria-hidden="true" />
          <p>
            Keys are kept in private memory for this page session, outside chat history and exports.
            Provider requests go through the Aegis server. Your own keys use your own credits.
          </p>
        </div>
        {error && (
          <p className="ai-access-error" role="alert">
            {error}
          </p>
        )}
        <div className="ai-access-actions">
          <button type="button" className="warm-button warm-button-outline" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="warm-button warm-button-primary" disabled={busy}>
            {busy ? 'Updating access…' : 'Use these settings'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
