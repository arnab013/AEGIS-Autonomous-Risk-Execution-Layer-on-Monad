// src/components/ExplainabilityModal.tsx - Structured Decision Evidence & Invariant Audit

import React from 'react';
import { X, Check, AlertTriangle, ShieldCheck } from './icons.tsx';
import { AuditEvent } from '../types/index.ts';

interface ExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditEvent: AuditEvent;
}

export const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({
  isOpen,
  onClose,
  auditEvent,
}) => {
  if (!isOpen || !auditEvent) return null;

  const factors = auditEvent.factors || {
    volatility_percentile: 0,
    sell_imbalance: 0,
    spot_exposure_utilization: 0,
    p_selected_action: 0,
    p_high_or_critical_risk: 0,
    policy_permitted: true,
    position_limit_satisfied: true,
  };
  const selected_action = auditEvent.selected_action || 'hold';
  const execution_allowed = auditEvent.execution_allowed ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#0e1118] border border-[#232938] rounded-lg max-w-lg w-full overflow-hidden shadow-2xl font-mono text-xs">
        {/* Modal Header */}
        <div className="terminal-header flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#7b3fe4]" />
            <span className="font-bold text-white uppercase tracking-wider">
              STRUCTURED DECISION EVIDENCE // {selected_action.replace('_', ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748b] hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="bg-[#141822] p-3 rounded border border-[#1e2433] space-y-2">
            <div className="text-[10px] text-[#64748b] uppercase">Deterministic Signals & Market Inputs</div>
            <div className="space-y-1.5 text-white">
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Volatility Percentile:</span>
                <span className="font-bold">{factors.volatility_percentile}th</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Sell-Side Orderbook Imbalance:</span>
                <span className="font-bold text-rose-400">{(factors.sell_imbalance * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Spot Exposure Utilization:</span>
                <span className="font-bold">{factors.spot_exposure_utilization}%</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141822] p-3 rounded border border-[#1e2433] space-y-2">
            <div className="text-[10px] text-[#64748b] uppercase">Jev Probabilistic Judgement</div>
            <div className="space-y-1.5 text-white">
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">P({selected_action}):</span>
                <span className="font-bold text-[#a77df8]">
                  {(factors.p_selected_action * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">P(High / Critical Risk):</span>
                <span className="font-bold text-amber-400">
                  {(factors.p_high_or_critical_risk * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Entropy Confidence Score:</span>
                <span className="font-bold text-emerald-400">
                  {(auditEvent.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#141822] p-3 rounded border border-[#1e2433] space-y-2">
            <div className="text-[10px] text-[#64748b] uppercase">Hard Deterministic Constraints</div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[#94a3b8]">User Policy Mandate Permitted:</span>
                <span className={factors.policy_permitted ? 'text-emerald-400 font-bold flex items-center gap-1' : 'text-rose-400 font-bold flex items-center gap-1'}>
                  {factors.policy_permitted ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {factors.policy_permitted ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#94a3b8]">Position Limit Invariant Satisfied:</span>
                <span className={factors.position_limit_satisfied ? 'text-emerald-400 font-bold flex items-center gap-1' : 'text-rose-400 font-bold flex items-center gap-1'}>
                  {factors.position_limit_satisfied ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {factors.position_limit_satisfied ? 'YES' : 'VIOLATED'}
                </span>
              </div>
            </div>
          </div>

          {/* Outcome Verdict */}
          <div className={`p-3 rounded border text-center ${
            execution_allowed
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}>
            <span className="font-bold block uppercase tracking-wider">
              {execution_allowed ? 'VERDICT: SAFE TO EXECUTE ON MONAD' : 'VERDICT: BLOCKED BY RISK GATE'}
            </span>
            <span className="text-[11px] text-[#cbd5e1] block mt-1">
              State Hash: <span className="text-white">{auditEvent.market_state_hash}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
