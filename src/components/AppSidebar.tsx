import React, { useState } from 'react';
import { Activity, Cpu, Layers, Play, Shield, ShieldCheck } from './icons.tsx';

interface AppSidebarProps {
  current: 'overview' | 'execution';
  onHome: () => void;
  onOverview: () => void;
  onExecution: () => void;
  onReplay: () => void;
  onOpenAiAccess: () => void;
}

export function AppSidebar({
  current,
  onHome,
  onOverview,
  onExecution,
  onReplay,
  onOpenAiAccess,
}: AppSidebarProps) {
  const [open, setOpen] = useState(false);
  const visit = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <aside
      className={'dashboard-sidebar' + (open ? ' is-open' : '')}
      aria-label="Workspace navigation"
    >
      <button className="warm-wordmark" onClick={() => visit(onHome)} aria-label="Aegis home">
        <Shield aria-hidden="true" />
        <span>Aegis</span>
      </button>
      <button
        className="sidebar-toggle"
        aria-expanded={open}
        aria-controls="workspace-navigation"
        onClick={() => setOpen(!open)}
      >
        Navigation <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div className="sidebar-body" id="workspace-navigation">
        <span className="dashboard-nav-label">Your workspace</span>
        <nav aria-label="Dashboard navigation">
          <button onClick={() => visit(onHome)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
            Home
          </button>
          <button
            className={current === 'overview' ? 'is-selected' : ''}
            aria-current={current === 'overview' ? 'page' : undefined}
            onClick={() => visit(onOverview)}
          >
            <Layers aria-hidden="true" /> Overview
          </button>
          <button
            className={current === 'execution' ? 'is-selected' : ''}
            aria-current={current === 'execution' ? 'page' : undefined}
            onClick={() => visit(onExecution)}
          >
            <Activity aria-hidden="true" /> Market & execution
          </button>
          <button onClick={() => visit(onReplay)}>
            <Play aria-hidden="true" /> Stress replay
          </button>
          <button onClick={() => visit(onOpenAiAccess)}>
            <Cpu aria-hidden="true" /> AI access
          </button>
        </nav>
        <div className="dashboard-sidebar-note">
          <ShieldCheck aria-hidden="true" />
          <strong>
            Your limits.
            <br />
            Your final say.
          </strong>
          <p>AI can suggest a next step. Only your wallet can approve a trade.</p>
        </div>
      </div>
    </aside>
  );
}
