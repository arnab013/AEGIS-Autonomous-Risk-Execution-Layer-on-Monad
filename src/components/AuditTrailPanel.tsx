// src/components/AuditTrailPanel.tsx - Envio-Indexed Verifiable Onchain Audit Trail

import React from 'react';
import { Database, ExternalLink, ShieldCheck, ShieldX } from './icons.tsx';
import { AuditEvent } from '../types/index.ts';

interface AuditTrailPanelProps {
  events: AuditEvent[];
  onExport?: () => void;
}

export const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({ events, onExport }) => {
  return (
    <div className="terminal-card flex flex-col h-full overflow-hidden">
      <div className="terminal-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#7b3fe4]" />
          <span className="font-mono text-xs font-bold text-white tracking-wider">
            DECISION JOURNAL // POLICY & EXECUTION EVIDENCE
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#64748b]">
          {events.length} EVENTS {onExport && <button onClick={onExport}>Save JSON to project</button>}
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-56 p-1">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-[#1c212c] text-[10px] uppercase text-[#64748b] bg-[#12151c]">
              <th className="py-2 px-3">Timestamp</th>
              <th className="py-2 px-3">State Hash</th>
              <th className="py-2 px-3">Jev Decision</th>
              <th className="py-2 px-3">Risk Gate</th>
              <th className="py-2 px-3">Venue</th>
              <th className="py-2 px-3">Monad Tx</th>
              <th className="py-2 px-3">Reason / Violations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#171b26]">
            {events.slice(0, 8).map((evt) => (
              <tr key={evt.id} className="hover:bg-[#12151f] transition-colors">
                <td className="py-2 px-3 text-[#94a3b8] whitespace-nowrap">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </td>
                <td className="py-2 px-3 text-white font-semibold">
                  <span title={evt.market_state_hash}>{evt.market_state_hash.slice(0, 10)}…</span>
                </td>
                <td className="py-2 px-3">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#7b3fe4]/20 text-[#cbb2fe]">
                    {evt.selected_action} ({(evt.confidence * 100).toFixed(0)}%) · {evt.user_initiated ? 'user' : evt.decision_source || 'policy'}
                  </span>
                </td>
                <td className="py-2 px-3 whitespace-nowrap">
                  {evt.execution_allowed ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" /> PASSED
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1 font-semibold">
                      <ShieldX className="w-3.5 h-3.5" /> BLOCKED
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 uppercase text-[#94a3b8] font-semibold">
                  {evt.venue || 'NONE'} · {evt.execution_mode || 'observe'}
                </td>
                <td className="py-2 px-3 whitespace-nowrap">
                  {evt.transaction_hash ? (
                    <a
                      href={`https://${evt.chain_id === 143 ? '' : 'testnet.'}monadvision.com/tx/${evt.transaction_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#a77df8] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>{evt.transaction_hash.slice(0, 6)}...{evt.transaction_hash.slice(-4)} · {evt.transaction_status || 'submitted'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[#64748b]">N/A</span>
                  )}
                </td>
                <td className="py-2 px-3 text-[#94a3b8] max-w-xs truncate" title={evt.reason}>
                  {evt.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
