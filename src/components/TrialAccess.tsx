import React, { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let scriptReady: Promise<void> | undefined;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReady)
    scriptReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptReady = undefined;
        reject(new Error('Visitor verification could not load.'));
      };
      document.head.appendChild(script);
    });
  return scriptReady;
}

export function TrialAccess({
  siteKey,
  active,
  onVerified,
}: {
  siteKey?: string;
  active: boolean;
  onVerified(token: string): Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onVerified);
  callback.current = onVerified;
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (active || !siteKey) return;
    let cancelled = false,
      widget: string | undefined,
      size: 'normal' | 'compact' | undefined;
    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      const width = container.current.clientWidth;
      if (!width) return;
      // The normal widget needs 300px; use its native compact layout in a narrower panel.
      const nextSize = width < 300 ? 'compact' : 'normal';
      if (widget && size === nextSize) return;
      if (widget) window.turnstile.remove(widget);
      size = nextSize;
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action: 'aegis-trial',
        theme: 'light',
        size,
        callback: (token: string) => {
          setMessage('Checking visitor access…');
          void callback
            .current(token)
            .then(() => setMessage('Trial access is ready.'))
            .catch((error: Error) => {
              setMessage(error.message);
              if (widget) window.turnstile?.reset(widget);
            });
        },
        'error-callback': () => setMessage('Visitor verification failed. Please try again.'),
        'expired-callback': () => setMessage('Verification expired. Please verify again.'),
      });
    };
    const resize = new ResizeObserver(render);
    void loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        resize.observe(container.current);
        render();
      })
      .catch((error: Error) => setMessage(error.message));
    return () => {
      cancelled = true;
      resize.disconnect();
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, active]);
  return (
    <section className="trial-access" aria-label="Trial verification">
      <strong>{active ? 'Visitor access ready' : 'Verify visitor access'}</strong>
      <p>
        {active
          ? 'Five analysis or chat turns per visitor daily, subject to the shared trial allowance.'
          : siteKey
            ? 'Complete this check to start the project-funded trial.'
            : 'Public trial verification is unavailable. Your own keys and replay remain available.'}
      </p>
      {!active && <div ref={container} />}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
