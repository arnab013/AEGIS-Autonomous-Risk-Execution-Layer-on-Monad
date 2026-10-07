// src/components/JevPolicyPanel.tsx - Jev Probabilistic Decision & Hard Risk Gate Control Panel

import React from 'react';
import { Cpu, ShieldAlert, CheckCircle2, XCircle, ExternalLink, HelpCircle, AlertOctagon } from './icons.tsx';
import { JevDecisionState, RiskCheckResult, AuditEvent, TradingAction } from '../types/index.ts';

interface JevPolicyPanelProps {
  decision: JevDecisionState;
  riskCheck: RiskCheckResult;
  lastTxHash?: string;
  onOpenExplainability: () => void;
  auditEvent: AuditEvent;
}

export const JevPolicyPanel: React.FC<JevPolicyPanelProps> = ({
  decision,
  riskCheck,
  lastTxHash,
  onOpenExplainability,
  auditEvent,
}) => {
  const isExecutionBlocked = !riskCheck.allowed;

  const actionLabels: Record<TradingAction, string> = {
    hedge: 'Hedge (Perpl Short)',
    reduce_position: 'Reduce Position',
    hold: 'Hold / Maintain',
    increase_position: 'Increase Position',
    cancel_orders: 'Cancel Stale Orders',
  };

  return (
    <div className="terminal-card flex flex-col h-full overflow-hidden">
      <div className="terminal-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#a77df8]" />
          <span className="font-mono text-xs font-bold text-white tracking-wider">JEV POLICY ENGINE // BOUNDED PROBABILITIES</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[11px] px-2 py-0.5 rounded bg-[#7b3fe4]/20 text-[#cbb2fe] border border-[#7b3fe4]/30">
            CONFIDENCE: {(decision.confidence_score * 100).toFixed(0)}%
          </span>
          <button
            onClick={onOpenExplainability}
            className="text-[11px] text-[#94a3b8] hover:text-white flex items-center gap-1 transition-colors"
            title="Inspect Structured Decision Evidence"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Why?</span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        {/* Action Probabilities Distribution */}
        <div className="bg-[#10131b] p-3 rounded border border-[#1a1f2c] space-y-2">
          <div className="flex justify-between items-center text-[10px] uppercase font-mono text-[#64748b]">
            <span>Action Probability Vector</span>
            <span className="text-[#a77df8]">Top: {decision.selected_action}</span>
          </div>

          <div className="space-y-1.5">
            {(Object.entries(decision.action_probabilities) as [TradingAction, number][])
              .sort(([, a], [, b]) => b - a)
              .map(([action, prob]) => {
                const pct = Math.round(prob * 100);
                const isTop = action === decision.selected_action;
                return (
                  <div key={action} className="space-y-0.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className={isTop ? 'font-bold text-white' : 'text-[#94a3b8]'}>
                        {actionLabels[action]}
                      </span>
                      <span className={isTop ? 'font-bold text-[#a77df8]' : 'text-[#64748b]'}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#171b26] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isTop ? 'bg-gradient-to-r from-[#7b3fe4] to-[#a77df8]' : 'bg-[#2a3347]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Risk Level & Market Regime Two-Column */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {/* Risk Level Distribution */}
          <div className="bg-[#10131b] p-2.5 rounded border border-[#1a1f2c] space-y-1.5">
            <div className="text-[10px] uppercase text-[#64748b]">Risk Distribution</div>
            {Object.entries(decision.risk_probabilities).map(([riskLevel, prob]) => {
              const pct = Math.round(prob * 100);
              const isHighOrCrit = riskLevel === 'high' || riskLevel === 'critical';
              return (
                <div key={riskLevel} className="flex justify-between text-[11px]">
                  <span className={isHighOrCrit && pct > 40 ? 'text-rose-400 font-semibold uppercase' : 'text-[#94a3b8] capitalize'}>
                    {riskLevel}
                  </span>
                  <span className={isHighOrCrit && pct > 40 ? 'text-rose-400 font-bold' : 'text-[#64748b]'}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Market Regime Distribution */}
          <div className="bg-[#10131b] p-2.5 rounded border border-[#1a1f2c] space-y-1.5">
            <div className="text-[10px] uppercase text-[#64748b]">Market Regime</div>
            {Object.entries(decision.regime_probabilities).map(([regime, prob]) => {
              const pct = Math.round(prob * 100);
              const isLead = pct > 40;
              return (
                <div key={regime} className="flex justify-between text-[11px]">
                  <span className={isLead ? 'text-amber-400 font-semibold' : 'text-[#94a3b8]'}>
                    {regime.replace('_', ' ')}
                  </span>
                  <span className={isLead ? 'text-amber-400 font-bold' : 'text-[#64748b]'}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hard Risk Gate Execution Result Banner */}
        <div className={`p-3 rounded border text-xs font-mono space-y-2 ${
          isExecutionBlocked
            ? 'bg-rose-950/30 border-rose-600/50 text-rose-200'
            : 'bg-emerald-950/20 border-emerald-600/40 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            {isExecutionBlocked ? (
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="font-bold tracking-wide">
              {isExecutionBlocked ? 'HARD RISK GATE: EXECUTION BLOCKED' : 'POLICY VERIFIED: EXECUTION PERMITTED'}
            </span>
          </div>

          <div className="text-[11px] leading-relaxed text-[#cbd5e1]">
            {auditEvent.reason}
          </div>

          {/* Monad Transaction Link or Zero-Tx Proof */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
            <span>Monad Settlement:</span>
            {lastTxHash ? (
              <a
                href={`https://testnet.monadvision.com/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#a77df8] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>{lastTxHash.slice(0, 8)}...{lastTxHash.slice(-6)}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-[#94a3b8]">0 TX SUBMITTED (Capital Protected)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
