// src/components/ReplayControlBar.tsx - Replay & Scenario Controller for Hackathon Demo

import React from 'react';
import { Play, Pause, SkipForward, RotateCcw, Info } from './icons.tsx';
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

export const ReplayControlBar: React.FC<ReplayControlBarProps> = ({
  currentScenarioId,
  onSelectScenario,
  isPlaying,
  onTogglePlay,
  onStepTick,
  onResetScenario,
  currentTickIndex,
  totalTicks,
}) => {
  const currentScenario = REPLAY_SCENARIOS.find((s) => s.id === currentScenarioId) || REPLAY_SCENARIOS[0];

  return (
    <div className="terminal-card p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Scenario Selectors */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase font-mono text-[#64748b] mr-1">Demo Scenarios:</span>
          {REPLAY_SCENARIOS.map((sc, index) => {
            const isSelected = sc.id === currentScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc.id)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  isSelected
                    ? 'bg-[#7b3fe4] text-white font-bold shadow-xs'
                    : 'bg-[#141822] text-[#94a3b8] hover:text-white hover:bg-[#1c2230] border border-[#1e2433]'
                }`}
              >
                {index + 1}. {sc.title.split(':')[1]?.trim() || sc.title}
              </button>
            );
          })}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-[#64748b] text-[11px]">
            Tick: <span className="text-white font-bold">{currentTickIndex + 1}</span> / {totalTicks}
          </span>

          <button
            onClick={onTogglePlay}
            className="flex items-center gap-1 px-3 py-1 bg-[#1a202c] hover:bg-[#252d3d] text-white rounded border border-[#2d3748] transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={onStepTick}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#1a202c] hover:bg-[#252d3d] text-white rounded border border-[#2d3748] transition-colors"
            title="Advance 1 Tick"
          >
            <SkipForward className="w-3.5 h-3.5 text-[#a77df8]" />
            <span>Step</span>
          </button>

          <button
            onClick={onResetScenario}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#1a202c] hover:bg-[#252d3d] text-[#94a3b8] hover:text-white rounded border border-[#2d3748] transition-colors"
            title="Reset Scenario"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Scenario Narrative Banner */}
      <div className="bg-[#12151f] p-2.5 rounded border border-[#1a1f2c] flex items-start gap-2 text-xs font-mono">
        <Info className="w-4 h-4 text-[#a77df8] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="text-white font-semibold">
            {currentScenario.title}
          </div>
          <div className="text-[#94a3b8] text-[11px] leading-relaxed">
            {currentScenario.narrative}
          </div>
        </div>
      </div>
    </div>
  );
};
