import React from 'react';
import { Play, Pause, SkipForward, RotateCcw } from './icons.tsx';
import { REPLAY_SCENARIOS } from '../data/scenarios.ts';

interface ReplayControlBarProps {
  currentScenarioId: string;
  onSelectScenario: (id: string) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepTick: () => void;
  onResetScenario: () => void;
  currentTickIndex: number;
  totalTicks: number;
}

export function ReplayControlBar({
  currentScenarioId,
  onSelectScenario,
  isPlaying,
  onTogglePlay,
  onStepTick,
  onResetScenario,
  currentTickIndex,
  totalTicks,
}: ReplayControlBarProps) {
  const current =
    REPLAY_SCENARIOS.find((item) => item.id === currentScenarioId) ?? REPLAY_SCENARIOS[0];
  return (
    <section className="replay-controls terminal-card" aria-label="Replay controls">
      <div className="replay-toolbar">
        <label htmlFor="replay-scenario">
          Scenario
          <select
            id="replay-scenario"
            value={currentScenarioId}
            onChange={(event) => onSelectScenario(event.target.value)}
          >
            {REPLAY_SCENARIOS.map((scenario, index) => (
              <option value={scenario.id} key={scenario.id}>
                {index + 1}. {scenario.title.split(':')[1]?.trim() || scenario.title}
              </option>
            ))}
          </select>
        </label>
        <div className="replay-actions">
          <span className="replay-tick">
            Step {currentTickIndex + 1} / {totalTicks}
          </span>
          <button onClick={onTogglePlay}>
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={onStepTick}>
            <SkipForward aria-hidden="true" />
            Step
          </button>
          <button onClick={onResetScenario}>
            <RotateCcw aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
      <details className="replay-description">
        <summary>About this scenario</summary>
        <p>{current.narrative}</p>
      </details>
    </section>
  );
}
