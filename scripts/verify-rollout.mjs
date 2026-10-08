import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('Verification artifacts must stay on F:');
const current = 'https://aegis.himaloy2608.workers.dev';
const previous = 'https://aegis-risk-terminal.himaloy2608.workers.dev';
const includeLegacy = process.argv.includes('--legacy');
const publicAccount = '0x9e825e29e765051fd5789321d4e835a92e76c51c';
const report = {
  observedAt: new Date().toISOString(),
  url: current,
  checks: {},
  signedTransactions: 0,
  paidInferenceCalls: 0,
};

async function request(origin, path, options = {}) {
  return fetch(origin + path, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
}
async function json(origin, path, value, expectedStatus = 200) {
  const response = await request(
    origin,
    path,
    value === undefined
      ? {}
      : {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }
  );
  const result = await response.json();
  assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(result)}`);
  return result;
}

const page = await request(current, '/', { headers: { Accept: 'text/html' } });
assert.equal(page.status, 200);
assert.match(await page.text(), /https:\/\/aegis\.himaloy2608\.workers\.dev/);
report.checks.newPage = 'passed';
const manifest = JSON.parse(
  readFileSync(resolve(root, '.local/artifacts/cloudflare/manifest.json'), 'utf8')
).manifest;
for (const [path, expected] of Object.entries(manifest)) {
  const response = await request(current, path);
  assert.equal(response.status, 200, path);
  const content = Buffer.from(await response.arrayBuffer());
  assert.equal(content.length, expected.size, path);
  assert.equal(
    createHash('sha256').update(content).digest('hex').slice(0, 32),
    expected.hash,
    path
  );
}
report.checks.newAssetIntegrity = 'passed';
const status = await json(current, '/api/status');
assert.equal(status.inferenceEnabled, false);
assert.equal(status.chainId, 143);
report.checks.inferenceDisabled = 'passed';
const market = await json(current, '/api/market');
assert.equal(market.source, 'kuru_rpc');
assert.ok(market.bids.length && market.asks.length);
report.market = {
  chainId: status.chainId,
  block: market.blockNumber,
  midPrice: market.midPrice,
  bids: market.bids.length,
  asks: market.asks.length,
  latencyMs: market.latencyMs,
};
await json(current, `/api/portfolio?account=${publicAccount}`);
const rpc = await json(current, '/api/rpc', {
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_chainId',
  params: [],
});
assert.equal(rpc.result, '0x8f');
await json(current, '/api/jev', {}, 503);
report.checks.newApi = 'passed';
const proposal = await json(current, '/api/prepare', {
  account: publicAccount,
  amountMon: '200',
  slippageBps: 50,
});
assert.equal(proposal.simulation, 'passed');
assert.equal(proposal.chainId, 143);
assert.equal(proposal.amountMon, '200');
assert.ok(Number(proposal.minOutUsdc) > 0);
report.simulation = {
  publicAccount,
  amountMon: proposal.amountMon,
  estimatedOutUsdc: proposal.estimatedOutUsdc,
  minimumOutUsdc: proposal.minOutUsdc,
  gasEstimate: proposal.gasEstimate,
  block: proposal.snapshotBlockNumber,
  simulation: proposal.simulation,
  accountUsedOnlyForEthCall: true,
};

if (includeLegacy) {
  for (const method of ['GET', 'HEAD']) {
    const response = await request(previous, '/review?mode=replay&step=2', {
      method,
      headers: { Accept: 'text/html' },
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), current + '/review?mode=replay&step=2');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
  const oldStatus = await json(previous, '/api/status');
  assert.equal(oldStatus.chainId, 143);
  const oldMarket = await json(previous, '/api/market');
  assert.equal(oldMarket.source, 'kuru_rpc');
  const oldProposal = await json(previous, '/api/prepare', {
    account: publicAccount,
    amountMon: '200',
    slippageBps: 50,
  });
  assert.equal(oldProposal.simulation, 'passed');
  const oldRpc = await json(previous, '/api/rpc', {
    jsonrpc: '2.0',
    id: 2,
    method: 'eth_chainId',
    params: [],
  });
  assert.equal(oldRpc.result, '0x8f');
  await json(previous, '/api/jev', {}, 503);
  const { assets } = JSON.parse(
    readFileSync(resolve(root, '.local/artifacts/cloudflare/legacy-assets.json'), 'utf8')
  );
  const oldRoutes = Object.keys(assets).filter(
    (path) => path.startsWith('/assets/') && !manifest[path]
  );
  assert.ok(oldRoutes.length, 'The previous page assets must be retained');
  for (const path of oldRoutes) {
    const response = await request(previous, path);
    assert.equal(response.status, 200, path);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = assets[path].text
      ? Buffer.from(assets[path].text)
      : Buffer.from(assets[path].base64, 'base64');
    assert.equal(
      createHash('sha256').update(actual).digest('hex'),
      createHash('sha256').update(expected).digest('hex'),
      path
    );
  }
  report.checks.legacyNavigation = 'passed';
  report.checks.legacyApi = 'passed';
  report.retainedAssets = oldRoutes;
}

const output = resolve(root, '.local/artifacts');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'rollout-readiness.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
