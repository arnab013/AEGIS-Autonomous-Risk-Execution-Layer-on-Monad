// src/components/Header.tsx - Financial Terminal Navigation & Circuit Breaker

import React from 'react';
import { Shield, Activity, AlertTriangle, Play, Pause, ExternalLink } from './icons.tsx';

interface HeaderProps {
  isPaused: boolean;
  onTogglePause: () => void;
  operationMode: 'replay' | 'live';
  onToggleMode: (mode: 'replay' | 'live') => void;
  rpcLatencyMs: number;
  blockNumber: string;
  walletAddress?: string | null;
  walletBalanceMon?: string | null;
  isConnectingWallet?: boolean;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isPaused,
  onTogglePause,
  operationMode,
  onToggleMode,
  rpcLatencyMs,
  blockNumber,
  walletAddress,
  walletBalanceMon,
  isConnectingWallet,
  onConnectWallet,
  onDisconnectWallet,
}) => {
  return (
    <header className="border-b border-[#1c212c] bg-[#0c0e14] px-4 py-2.5 flex items-center justify-between">
      {/* Brand & Track */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-[#7b3fe4] to-[#200052] flex items-center justify-center border border-[#9b62ff]/40 shadow-sm shadow-[#7b3fe4]/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white font-mono text-sm">AEGIS</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#7b3fe4]/20 text-[#a77df8] border border-[#7b3fe4]/30">
                Monad Onchain Finance
              </span>
            </div>
            <p className="text-[11px] text-[#64748b]">Autonomous Risk & Execution Layer</p>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-[#1c212c] mx-2 hidden sm:block" />

        {/* Network telemetry */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-[#94a3b8]">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Monad Testnet (10143)</span>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-[#64748b]" />
            <span>Block: #{blockNumber}</span>
          </div>
          <div className="text-[11px] text-[#64748b]">
            Latency: <span className="text-emerald-400">{rpcLatencyMs}ms</span> (~300ms block)
          </div>
        </div>
      </div>

      {/* Controls & Emergency Breaker */}
      <div className="flex items-center gap-3">
        {/* Mode Selector */}
        <div className="flex items-center bg-[#141822] rounded p-0.5 border border-[#1e2433] text-xs font-mono">
          <button
            onClick={() => onToggleMode('replay')}
            className={`px-2.5 py-1 rounded transition-colors ${
              operationMode === 'replay'
                ? 'bg-[#7b3fe4] text-white font-semibold shadow-xs'
                : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            Replay Mode
          </button>
          <button
            onClick={() => onToggleMode('live')}
            className={`px-2.5 py-1 rounded transition-colors ${
              operationMode === 'live'
                ? 'bg-[#7b3fe4] text-white font-semibold shadow-xs'
                : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            Monad Live
          </button>
        </div>

        {/* Web3 Wallet Connection on Monad */}
        {walletAddress ? (
          <div className="flex items-center gap-2 bg-[#141822] px-2.5 py-1 rounded border border-emerald-500/30 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[#e2e8f0]">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
            {walletBalanceMon && (
              <span className="text-emerald-400 font-semibold border-l border-[#1e2433] pl-2">
                {walletBalanceMon} MON
              </span>
            )}
            {onDisconnectWallet && (
              <button
                onClick={onDisconnectWallet}
                className="text-[#64748b] hover:text-rose-400 text-[10px] ml-1 uppercase"
                title="Disconnect Wallet"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={onConnectWallet}
            disabled={isConnectingWallet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold bg-[#7b3fe4]/20 hover:bg-[#7b3fe4]/30 text-[#a77df8] border border-[#7b3fe4]/40 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}</span>
          </button>
        )}

        {/* Circuit Breaker Emergency Pause */}
        <button
          onClick={onTogglePause}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all ${
            isPaused
              ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-900/30'
              : 'bg-[#181d28] text-amber-400 hover:bg-[#202738] border border-amber-500/30'
          }`}
        >
          {isPaused ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>CIRCUIT BREAKER: PAUSED</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>EMERGENCY PAUSE</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
