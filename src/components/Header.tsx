import React from 'react';
import { Shield, Pause, Play, Activity } from './icons.tsx';

interface HeaderProps {
  isPaused: boolean;
  onTogglePause: () => void;
  operationMode: 'replay' | 'live';
  onToggleMode: (mode: 'replay' | 'live') => void;
  rpcLatencyMs: number | null;
  chainId?: number;
  blockNumber: string;
  marketTimestamp?: number;
  now?: number;
  walletAddress?: string | null;
  walletBalanceMon?: string | null;
  isConnectingWallet?: boolean;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
}

export function Header({
  isPaused,
  onTogglePause,
  operationMode,
  onToggleMode,
  rpcLatencyMs,
  chainId,
  blockNumber,
  marketTimestamp,
  now = Date.now(),
  walletAddress,
  walletBalanceMon,
  isConnectingWallet,
  onConnectWallet,
  onDisconnectWallet,
}: HeaderProps) {
  const live = operationMode === 'live';
  const age = marketTimestamp ? Math.max(0, Math.floor((now - marketTimestamp) / 1000)) : null;
  const fresh = live && age !== null && age <= 15 && rpcLatencyMs !== null;
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">
          <Shield aria-hidden="true" />
        </span>
        <div>
          <strong>Aegis</strong>
          <span>Risk & execution control</span>
        </div>
      </div>
      <div className="connection-context" aria-label="Market connection">
        <span className={'connection-dot ' + (fresh ? 'is-fresh' : '')} aria-hidden="true" />
        <div>
          <strong>
            {live
              ? chainId
                ? 'Monad ' + (chainId === 143 ? 'Mainnet' : chainId === 10143 ? 'Testnet' : chainId)
                : 'Connecting to Monad'
              : 'Synthetic replay'}
          </strong>
          <span>
            {live
              ? age === null
                ? 'Waiting for market data'
                : (fresh ? 'Observed ' : 'Stale observation · ') + age + 's ago'
              : 'Paper activity · no chain execution'}
          </span>
        </div>
        {live && rpcLatencyMs !== null && (
          <span className="connection-latency">
            <Activity aria-hidden="true" />
            {rpcLatencyMs} ms · block {blockNumber}
          </span>
        )}
      </div>
      <div className="header-actions">
        <div className="mode-switch" role="group" aria-label="Workspace mode">
          <button aria-pressed={!live} onClick={() => onToggleMode('replay')}>
            Replay Mode
          </button>
          <button aria-pressed={live} onClick={() => onToggleMode('live')}>
            Live Market
          </button>
        </div>
        {walletAddress ? (
          <div className="wallet-control">
            <span title={walletAddress}>
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
            {walletBalanceMon && (
              <small title={walletBalanceMon + ' MON'}>
                {Number(walletBalanceMon).toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                MON
              </small>
            )}
            <button aria-label="Disconnect wallet" onClick={onDisconnectWallet}>
              Disconnect
            </button>
          </div>
        ) : (
          <button
            className="wallet-connect"
            disabled={isConnectingWallet}
            onClick={onConnectWallet}
          >
            {isConnectingWallet ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
        <button
          className={'pause-control ' + (isPaused ? 'is-paused' : '')}
          onClick={onTogglePause}
          aria-pressed={isPaused}
        >
          {isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {isPaused ? 'Resume trading' : 'Pause trading'}
        </button>
      </div>
    </header>
  );
}
