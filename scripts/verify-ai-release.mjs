import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { StateEngine } from '../src/engine/stateEngine.ts';
import { buildJevStatePayload } from '../src/jev/stateBuilder.ts';
import { parseJevResponse } from '../src/jev/client.ts';

if (!/^f:[\\/]/i.test(process.cwd())) throw new Error('Verification artifacts must stay on F:.');
process.loadEnvFile('.env');
const privateKey = await webcrypto.subtle.importKey(
  'jwk',
  JSON.parse(Buffer.from(process.env.AI_VERIFICATION_PRIVATE_JWK_B64, 'base64').toString('utf8')),
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false,
  ['decrypt']
);
const ciphertext = Buffer.from(
  readFileSync('.local/artifacts/cloudflare/implementation-envelope.txt', 'utf8').trim(),
  'base64'
);
const implementationToken = new TextDecoder().decode(
  await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ciphertext)
);
const origin = 'https://aegis.himaloy2608.workers.dev';
const jevOnly = process.argv.includes('--jev-only');
const statusOnly = process.argv.includes('--status-only');
const expectedProvider =
  process.argv.find((argument) => argument.startsWith('--provider='))?.slice(11) ?? 'mistral';
const expectedModel =
  process.argv.find((argument) => argument.startsWith('--model='))?.slice(8) ??
  'mistral-small-2603';
if (!['mistral', 'openai', 'anthropic', 'google'].includes(expectedProvider))
  throw new Error('Choose a supported Scout provider for verification.');
let cookie;
async function api(path, body) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Aegis-Jev-Funding': 'sponsored',
      'X-Aegis-Agent-Funding': 'sponsored',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(110_000),
  });
  if (path.endsWith('/session') && response.ok)
    cookie = response.headers.get('set-cookie')?.split(';')[0];
  return {
    status: response.status,
    value: await response.json(),
    receiptReceived: response.headers.has('X-Aegis-Jev-Receipt'),
  };
}
const context = {
  mode: 'live',
  chainId: 143,
  policy: new StateEngine().policy,
  policyRevision: 0,
  clipUsd: 250,
};
const report = {
  observedAt: new Date().toISOString(),
  signedTransactions: 0,
  publicAllowanceUsed: false,
  verification: statusOnly ? 'budget_status_only' : jevOnly ? 'standalone_jev' : 'jev_scout_pipeline',
  ...(jevOnly ? {} : { expectedProvider, expectedModel }),
};
async function verifyJev() {
  const market = (await api('/api/market')).value;
  assert.equal(market.source, 'kuru_rpc');
  assert.equal(market.chainId, 143);
  const engine = new StateEngine({
    spot_exposure_usd: 0,
    perp_exposure_usd: 0,
    net_delta: 0,
    leverage: 0,
    unrealized_pnl: 0,
    realized_pnl_today: 0,
    drawdown_today: 0,
    spot_balance_mon: 0,
    usdc_balance: 0,
    perp_short_size_mon: 0,
  });
  engine.updateMarketState(market.bids, market.asks, 0, 0, market.timestamp);
  const input = buildJevStatePayload(
    engine.market,
    engine.position,
    engine.orders,
    engine.computeRiskMetrics(),
    engine.policy
  );
  const response = await api('/api/jev', { state: input });
  report.responseStatus = response.status;
  report.market = {
    observedAt: market.timestamp,
    blockNumber: market.blockNumber,
    chainId: market.chainId,
    source: market.source,
    marketAddress: market.marketAddress,
    bids: market.bids,
    asks: market.asks,
  };
  report.input = input;
  report.coverage = [
    'Current Kuru book is observed. Wallet is disconnected; portfolio input is a zero-equity verification fixture, not measured holdings.',
    'The engine represents zero-equity leverage with a 999 sentinel; this is not a measured wallet leverage.',
    'Flow, historical returns/volatility, external orders/perps and wallet PnL are unavailable zero placeholders.',
  ];
  report.response = response.value;
  report.receiptReceived = response.receiptReceived;
  report.after = (await api('/api/inference/status')).value;
  report.implementationCostMicros =
    report.after.poolChargedMicros - report.before.poolChargedMicros;
  assert.equal(response.status, 200, 'Genuine Jev call failed');
  assert.equal(response.value.model, 'jev-1.13.0');
  assert.ok(response.receiptReceived, 'Jev provenance receipt missing');
  report.decision = parseJevResponse(response.value, input);
}
try {
  const session = await api('/api/inference/session', { implementationToken });
  assert.equal(session.status, 200, 'Implementation session failed');
  report.before = (await api('/api/inference/status')).value;
  assert.equal(report.before.pool, 'implementation');
  if (statusOnly) report.after = report.before;
  else if (jevOnly) await verifyJev();
  else {
    assert.equal(
      report.before.agentProvider,
      expectedProvider,
      'The active agent provider has not been deployed'
    );
    assert.equal(report.before.model, expectedModel);
    const response = await api('/api/agent', {
      message:
        'Propose lowering my session slippage cap from 25 to 10 bps. Explain before and after. Do not apply it or prepare a sale.',
      history: [],
      context,
    });
    const reply = response.value;
    report.responseStatus = response.status;
    report.response = {
      message: reply.message,
      error: reply.error,
      model: reply.model,
      provider: reply.provider,
      jevModel: reply.jevDecision?.model,
      jevSource: reply.jevDecision?.source,
      jevUnavailableReason: reply.jevUnavailableReason,
      recommendation: reply.recommendation,
      observedAt: reply.observedAt,
      jevInput: reply.assessment?.input,
      jevCapture: reply.assessment?.capture,
      jevObservedAt: reply.assessment?.observedAt,
      jevEvaluatedAt: reply.assessment?.evaluatedAt,
      jevDecision: reply.jevDecision,
    };
    report.after = (await api('/api/inference/status')).value;
    report.implementationCostMicros =
      report.after.poolChargedMicros - report.before.poolChargedMicros;
    assert.equal(response.status, 200, reply.error || 'Agent call failed');
    assert.equal(reply.provider, expectedProvider);
    assert.equal(reply.model, expectedModel);
    assert.equal(reply.jevDecision?.model, 'jev-1.13.0');
    assert.equal(reply.jevDecision?.source, 'typesafe_jev', 'Genuine Jev response missing');
    assert.ok(reply.assessment?.capture, 'Immutable captured Jev evidence missing');
    assert.equal(reply.assessment.capture.context.policy.max_slippage_bps, 25);
    assert.ok(reply.pendingIntent, 'Expected policy confirmation card');
    const stale = await api('/api/agent/approve', {
      token: reply.pendingIntent.token,
      context: { ...context, policyRevision: 1 },
    });
    report.staleApprovalStatus = stale.status;
    assert.equal(stale.status, 409);
    const approval = await api('/api/agent/approve', { token: reply.pendingIntent.token, context });
    report.approval = approval;
    assert.equal(approval.status, 200);
    assert.equal(approval.value.policyAfter.max_slippage_bps, 10);
    const duplicate = await api('/api/agent/approve', {
      token: reply.pendingIntent.token,
      context,
    });
    report.duplicateApprovalStatus = duplicate.status;
    assert.equal(duplicate.status, 409);
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
}
const reportName = statusOnly ? 'ai-budget-status' : jevOnly ? 'jev-release-verification' : 'ai-release-verification';
writeFileSync(`.local/artifacts/${reportName}.json`, JSON.stringify(report, null, 2));
writeFileSync(
  `.local/artifacts/${reportName}-${report.observedAt.replace(/[:.]/g, '-')}.json`,
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
