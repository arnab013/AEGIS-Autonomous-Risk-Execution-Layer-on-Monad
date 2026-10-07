import { createServer } from 'node:http';
import { readFile, writeFile, appendFile, mkdir, stat, rename } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body, (_, value) => typeof value === 'bigint' ? value.toString() : value));
};
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 65536) throw new Error('Request exceeds 64 KB');
  }
  return JSON.parse(text);
}

export function createGateway({ config, marketClient, buildRequest, validateResponse, fetchImpl = fetch, clock = Date.now }) {
  let lastInference = 0;
  let busy = false;
  let snapshotCache;
  let previousAuditHash = '0'.repeat(64);
  const records = [];
  const counters = { inferenceRequests: 0, marketReads: 0 };
  let startupError;
  const ready = (async () => {
    try {
      try {
        const anchor = JSON.parse(await readFile(resolve(config.journalDirectory, 'chain-anchor.json'), 'utf8'));
        if (!/^[a-f0-9]{64}$/.test(anchor.previousHash)) throw new Error('Invalid audit chain anchor');
        previousAuditHash = anchor.previousHash;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const lines = (await readFile(resolve(config.journalDirectory, 'decisions.jsonl'), 'utf8')).trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const record = JSON.parse(line);
        const expected = createHash('sha256').update(record.previousHash + JSON.stringify(record.event)).digest('hex');
        if (record.hash !== expected || record.previousHash !== previousAuditHash) throw new Error('Audit journal integrity check failed');
        previousAuditHash = record.hash; records.unshift(record);
        if (records.length > 500) records.pop();
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  })().catch(error => { startupError = error; });
  let journalQueue = Promise.resolve();
  const server = createServer(async (req, res) => {
    try {
      await ready;
      if (startupError) throw startupError;
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}` && !config.allowedOrigins?.includes(origin)) return json(res, 403, { error: 'Origin is not allowed' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, {
        inferenceEnabled: config.inferenceEnabled === true,
        jevConfigured: Boolean(config.apiKey && !config.apiKey.startsWith('your_')),
        model: config.model, chainId: config.chainId, marketAddress: config.marketAddress,
        rpcUrl: config.publicRpcUrl, counters, execution: 'wallet_review',
      });
      if (req.method === 'GET' && url.pathname === '/api/market') {
        if (!snapshotCache || clock() - snapshotCache.timestamp > 1000) { snapshotCache = await marketClient.fetchSnapshot(); counters.marketReads++; }
        return json(res, 200, snapshotCache);
      }
      if (req.method === 'GET' && url.pathname === '/api/portfolio') return json(res, 200, await marketClient.getWalletBalances(url.searchParams.get('account') || ''));
      if (req.method === 'POST' && url.pathname === '/api/prepare') {
        const input = await body(req);
        return json(res, 200, await marketClient.prepareMarketSell(input.account, input.amountMon, input.slippageBps));
      }
      if (req.method === 'POST' && url.pathname === '/api/jev') {
        if (!config.inferenceEnabled) return json(res, 503, { error: 'Paid Jev inference is disabled. Enable JEV_ENABLE_LIVE after approving API credit usage.' });
        if (!config.apiKey || config.apiKey.startsWith('your_')) return json(res, 503, { error: 'Set TYPESAFE_API_KEY in the server environment' });
        if (busy || clock() - lastInference < 1500) return json(res, 429, { error: 'Inference cooldown; retry after 2 seconds' });
        const input = await body(req);
        const state = input.state ?? input;
        if (!state.market || !state.position || !state.policy || !state.orders || !state.risk) return json(res, 422, { error: 'A complete market, position, orders, risk and policy state is required' });
        const request = buildRequest(state, config.model);
        busy = true; lastInference = clock();
        try {
          const upstream = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify(request), signal: AbortSignal.timeout(8000),
          });
          counters.inferenceRequests++;
          if (!upstream.ok) return json(res, upstream.status, { error: `TypeSafe returned HTTP ${upstream.status}` });
          const result = await upstream.json(); validateResponse(result, state);
          return json(res, 200, result);
        } finally { busy = false; }
      }
      if (req.method === 'GET' && url.pathname === '/api/audit') return json(res, 200, { records, hashChain: 'sha256', provenance: 'local journal; not an onchain attestation' });
      if (req.method === 'POST' && url.pathname === '/api/audit/export') {
        const events = await body(req);
        if (!Array.isArray(events) || events.length > 500) return json(res, 422, { error: 'Export requires at most 500 events' });
        await mkdir(config.journalDirectory, { recursive: true });
        const savedPath = resolve(config.journalDirectory, `export-${clock()}.json`);
        await writeFile(savedPath, JSON.stringify(events, null, 2));
        return json(res, 201, { savedPath });
      }
      if (req.method === 'POST' && url.pathname === '/api/audit') {
        const event = await body(req);
        if (!event.id || !event.timestamp || !event.market_state_hash || typeof event.execution_allowed !== 'boolean') return json(res, 422, { error: 'Invalid audit event' });
        const previousWrite = journalQueue;
        let release;
        journalQueue = new Promise(resolveQueue => { release = resolveQueue; });
        await previousWrite;
        try {
        const existing = records.find(record => record.event.id === event.id);
        if (existing) return json(res, 200, existing);
        const canonical = JSON.stringify(event);
        const hash = createHash('sha256').update(previousAuditHash + canonical).digest('hex');
        const record = { journalId: randomUUID(), previousHash: previousAuditHash, hash, event };
        await mkdir(config.journalDirectory, { recursive: true });
        const journal = resolve(config.journalDirectory, 'decisions.jsonl');
        try {
          if ((await stat(journal)).size > 5 * 1024 * 1024) {
            await rename(journal, resolve(config.journalDirectory, `decisions-${clock()}.jsonl`));
            await writeFile(resolve(config.journalDirectory, 'chain-anchor.json'), JSON.stringify({ previousHash: previousAuditHash }));
          }
        } catch (err) { if (err.code !== 'ENOENT') throw err; }
        await appendFile(journal, JSON.stringify(record) + '\n');
        previousAuditHash = hash; records.unshift(record);
        if (records.length > 500) records.pop();
        return json(res, 201, record);
        } finally { release(); }
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API route' });
      if (!config.staticDirectory || req.method !== 'GET') return json(res, 404, { error: 'Not found' });
      const base = resolve(config.staticDirectory);
      let file = resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + sep) && file !== base) return json(res, 403, { error: 'Invalid path' });
      if (!extname(file)) file = resolve(base, 'index.html');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    } catch (error) {
      json(res, error.code === 'ENOENT' ? 404 : error instanceof TypeError ? 422 : 502, { error: error.name === 'TimeoutError' ? 'Upstream request timed out' : (error.message || 'Request failed') });
    }
  });
  return server;
}
