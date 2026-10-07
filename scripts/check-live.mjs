import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('Outputs must stay off C:');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const { KuruClient, kuruMainnetConfig, kuruTestnetConfig } = await import('../src/execution/kuruClient.ts');
const config = process.env.AEGIS_NETWORK === 'testnet' ? kuruTestnetConfig : kuruMainnetConfig;
const client = new KuruClient(config);
const snapshot = await client.fetchSnapshot();
const report = { observedAt: new Date().toISOString(), network: config.chainId, market: config.marketAddress, block: snapshot.blockNumber, midPrice: snapshot.midPrice, bids: snapshot.bids.length, asks: snapshot.asks.length, latencyMs: snapshot.latencyMs, source: snapshot.source, signedTransactions: 0, paidInferenceCalls: 0 };
const accountIndex = process.argv.indexOf('--account');
if (accountIndex >= 0) {
  const account = process.argv[accountIndex + 1];
  const holdings = await client.getWalletBalances(account);
  report.holdings = holdings;
  const amountIndex = process.argv.indexOf('--amount');
  if (amountIndex >= 0) {
    const prepared = await client.prepareMarketSell(account, process.argv[amountIndex + 1], 50);
    report.readOnlyTradeSimulation = { amountMon: prepared.amountMon, estimatedOutUsdc: prepared.estimatedOutUsdc, minimumOutUsdc: prepared.minOutUsdc, referenceMidPrice: prepared.referenceMidPrice, gasEstimate: prepared.gasEstimate, simulation: prepared.simulation, accountIsOnlyUsedForEthCall: true };
  }
}
const output = resolve(root, '.local/artifacts'); mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'live-readiness.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
