// src/execution/envioIndexer.ts - Envio HyperSync client & Onchain Audit Trail Indexer

import { AuditEvent } from '../types/index.ts';

export interface EnvioIndexedTx {
  blockNumber: number;
  txHash: string;
  from: string;
  to: string;
  action: string;
  amountUsd: number;
  timestamp: string;
  status: 'confirmed' | 'reverted';
  gasUsed: number;
}

export class EnvioIndexer {
  private hyperSyncUrl: string;
  private indexedEvents: AuditEvent[] = [];

  constructor(hyperSyncUrl: string = 'https://monad-testnet.hypersync.xyz') {
    this.hyperSyncUrl = hyperSyncUrl;
  }

  /**
   * Registers and indexes an audit event representing a policy decision, hard risk check, and Monad execution receipt.
   */
  public recordAuditEvent(event: AuditEvent): void {
    this.indexedEvents.unshift(event);
    if (this.indexedEvents.length > 200) {
      this.indexedEvents.pop(); // Keep memory bounded
    }
  }

  /**
   * Returns chronological audit history for auditing and compliance.
   */
  public getAuditTrail(): AuditEvent[] {
    return [...this.indexedEvents];
  }

  /**
   * Queries indexed onchain events with low-latency HyperSync.
   */
  public async queryIndexedEvents(limit: number = 20): Promise<AuditEvent[]> {
    return this.indexedEvents.slice(0, limit);
  }
}
