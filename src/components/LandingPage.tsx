import React from 'react';
import { ArrowUpRight, Check, Layers, Shield, ShieldCheck, Wallet } from './icons.tsx';

export interface LandingPageProps {
  onOpenDashboard: () => void;
  onReplay: () => void;
  previewSrc?: string;
  previewAlt?: string;
}

const steps = [
  [
    'Observe',
    'Read the market, not the mood.',
    'Current Kuru prices, liquidity and your wallet balances give every decision a starting point.',
  ],
  [
    'Understand',
    'Make uncertainty visible.',
    'Scout helps explain the context. Jev assesses structured evidence, with its source and limits in view.',
  ],
  [
    'Check',
    'Keep your limits in charge.',
    'Position, trade size, slippage and liquidity checks remain separate from any AI recommendation.',
  ],
  [
    'Review',
    'Know what you are signing.',
    'Simulate the exact MON sale, inspect its minimum USDC output, then choose whether to approve it in your wallet.',
  ],
] as const;

export function LandingPage({
  onOpenDashboard,
  onReplay,
  previewSrc,
  previewAlt,
}: LandingPageProps) {
  return (
    <div className="warm-site">
      <a className="warm-skip-link" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-header">
        <a className="warm-wordmark" href="#landing-main" aria-label="Aegis home">
          <Shield aria-hidden="true" /> <span>Aegis</span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="/"
            aria-current="page"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              });
            }}
          >
            Home
          </a>
          <a
            href="/app"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onOpenDashboard();
            }}
          >
            Dashboard <ArrowUpRight aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="warm-eyebrow">A clearer way to trade on Monad</span>
            <h1 id="landing-title">
              Less guesswork.
              <br />
              <span>More control.</span>
            </h1>
            <p className="landing-lead">
              Bring market context, AI insight and your own limits together. Review an exact MON
              sale before you make your next move.
            </p>
            <div className="warm-button-row">
              <button className="warm-button warm-button-primary" onClick={onOpenDashboard}>
                Find your clarity <ArrowUpRight aria-hidden="true" />
              </button>
              <button className="warm-button warm-button-outline" onClick={onReplay}>
                Explore a replay
              </button>
            </div>
            <p className="landing-small-print">
              Start with market reads. Connect a wallet when you are ready.
            </p>
          </div>
          <aside className="landing-principle" aria-label="The Aegis approach">
            <svg className="principle-orbit" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <circle cx="50" cy="50" r="43" stroke="currentColor" strokeWidth="1" />
              <circle
                cx="50"
                cy="50"
                r="32"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 6"
              />
              <g className="principle-orbit-dot">
                <circle cx="50" cy="7" r="4" fill="currentColor" />
              </g>
              <path
                d="m50 29 17 6v14c0 13-17 23-17 23S33 62 33 49V35Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="m42 48 6 6 12-13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="landing-principle-heading">
              <ShieldCheck aria-hidden="true" />
              <span>Your trade. Your terms.</span>
            </div>
            <h2>
              A second look.
              <br />
              Before the next move.
            </h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Real market context</strong>
                  <p>Kuru · MON / USDC · Monad</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Independent policy checks</strong>
                  <p>Your limits stay in charge.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Exact terms, then approval</strong>
                  <p>Simulation first. Your wallet signs.</p>
                </div>
              </li>
            </ol>
            <p className="landing-principle-note">
              AI informs the decision. You control execution.
            </p>
          </aside>
        </section>

        <section className="landing-proof" aria-label="Product foundations">
          <span>
            <Layers aria-hidden="true" /> Real Kuru market reads
          </span>
          <span>
            <ShieldCheck aria-hidden="true" /> Exact sale simulation
          </span>
          <span>
            <Wallet aria-hidden="true" /> Explicit wallet approval
          </span>
        </section>

        <section
          className="landing-section landing-problem"
          id="product"
          aria-labelledby="problem-title"
        >
          <div className="landing-section-heading">
            <span className="warm-eyebrow">A little perspective goes a long way</span>
            <h2 id="problem-title">
              A price is only
              <br />
              part of the picture.
            </h2>
            <p>
              Liquidity changes. Signals disagree. A trade that looks attractive can still fall
              outside your limits. Aegis puts the relevant evidence in one place.
            </p>
          </div>
          <div className="landing-problem-grid">
            <article>
              <span className="warm-card-kicker">Market context</span>
              <h3>Can this market support the move?</h3>
              <p>
                Inspect spread, depth and observation freshness before relying on a quoted price.
              </p>
            </article>
            <article>
              <span className="warm-card-kicker">Personal limits</span>
              <h3>Does it fit the way you trade?</h3>
              <p>
                Check the proposed size against your exposure, slippage and liquidity constraints.
              </p>
            </article>
            <article>
              <span className="warm-card-kicker">Clear execution</span>
              <h3>What will your wallet approve?</h3>
              <p>
                See the exact MON amount, minimum USDC output and current simulation before signing.
              </p>
            </article>
          </div>
        </section>

        <section
          className="landing-section landing-process"
          id="how-it-works"
          aria-labelledby="process-title"
        >
          <div className="landing-section-heading">
            <span className="warm-eyebrow">From context to a considered action</span>
            <h2 id="process-title">
              One clear path.
              <br />
              Every step inspectable.
            </h2>
          </div>
          <div className="landing-steps">
            {steps.map(([label, title, description], index) => (
              <article key={label}>
                <span className="landing-step-number">0{index + 1}</span>
                <span className="warm-card-kicker">{label}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-section landing-product"
          id="evidence"
          aria-labelledby="evidence-title"
        >
          <div className="landing-section-heading">
            <span className="warm-eyebrow">Inside Aegis</span>
            <h2 id="evidence-title">
              Clarity you can
              <br />
              look into.
            </h2>
            <p>
              A conversation for context. Captured evidence for decisions. An exact review for
              execution.
            </p>
          </div>
          {previewSrc && (
            <figure className="landing-product-preview">
              <img
                src={previewSrc}
                alt={
                  previewAlt ??
                  'The Aegis dashboard showing market context, conversation and assessment evidence.'
                }
                loading="lazy"
              />
              <figcaption>
                The actual Aegis workspace. Live readings and synthetic replay are labelled
                separately.
              </figcaption>
            </figure>
          )}
          <div className="landing-capabilities">
            <article>
              <span className="landing-capability-icon" aria-hidden="true">
                <Layers />
              </span>
              <h3>Context, with its source.</h3>
              <p>
                Current market observations and sourced news help you ask better questions. Missing
                data stays visible.
              </p>
            </article>
            <article>
              <span className="landing-capability-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <h3>Checks, independent of AI.</h3>
              <p>
                A recommendation cannot waive your mandate. Review the applicable checks and the
                input they used.
              </p>
            </article>
            <article>
              <span className="landing-capability-icon" aria-hidden="true">
                <Wallet />
              </span>
              <h3>A review you can act on.</h3>
              <p>
                Prepare a MON → USDC sale, inspect exact terms and follow submitted transactions
                through receipt confirmation.
              </p>
            </article>
          </div>
          <div className="landing-scope">
            <Check aria-hidden="true" />
            <p>
              Live market reads and sale simulation have been verified. Wallet execution requires
              your approval; signed execution is still being validated. Replay is synthetic paper
              activity. AI usage depends on your access settings and available budget.
            </p>
          </div>
        </section>

        <section className="landing-final-cta" aria-labelledby="final-cta-title">
          <span className="warm-eyebrow">Your next move starts with understanding</span>
          <h2 id="final-cta-title">
            Take a breath.
            <br />
            Take a closer look.
          </h2>
          <p>Explore the market, ask a question and see what your limits allow.</p>
          <div className="warm-button-row">
            <button className="warm-button warm-button-primary" onClick={onOpenDashboard}>
              Open your workspace <ArrowUpRight aria-hidden="true" />
            </button>
            <button className="warm-button warm-button-outline" onClick={onReplay}>
              Try a stress replay
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div>
          <a className="warm-wordmark" href="#landing-main">
            <Shield aria-hidden="true" />
            <span>Aegis</span>
          </a>
          <p>AI proposes. Policy constrains. You control execution.</p>
        </div>
        <div>
          <span>Built for Monad · Kuru MON / USDC</span>
          <p>
            An experimental MVP. Trading performance has not been established. Developed with OpenAI
            Codex; pre-existing work and dependencies retain their attribution.
          </p>
        </div>
      </footer>
    </div>
  );
}
