// Local decision audit store. Optional HyperSync height probe is not a transaction indexer.
import type { AuditEvent } from '../types/index.ts';
export class EnvioIndexer {
  private hyperSyncUrl: string;
  private indexedEvents: AuditEvent[] = [];
  constructor(hyperSyncUrl = 'https://monad-testnet.hypersync.xyz') {
    this.hyperSyncUrl = hyperSyncUrl;
  }
  public recordAuditEvent(event: AuditEvent): void {
    this.indexedEvents.unshift(structuredClone(event));
    if (this.indexedEvents.length > 200) this.indexedEvents.pop();
  }
  public getAuditTrail(): AuditEvent[] {
    return structuredClone(this.indexedEvents);
  }
  public async queryIndexedEvents(limit = 20): Promise<AuditEvent[]> {
    return structuredClone(this.indexedEvents.slice(0, Math.max(0, Math.min(200, limit))));
  }
  public async getHyperSyncHeight(): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.hyperSyncUrl}/height`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HyperSync HTTP ${response.status}`);
      const data = await response.json();
      if (!Number.isInteger(data.height) || data.height < 0)
        throw new Error('Invalid HyperSync height');
      return data.height;
    } finally {
      clearTimeout(timeout);
    }
  }
  public async isLiveConnected(): Promise<boolean> {
    try {
      return (await this.getHyperSyncHeight()) > 0;
    } catch {
      return false;
    }
  }
}
