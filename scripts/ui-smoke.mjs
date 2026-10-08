import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('QA outputs must stay off C:');
const baseUrl = process.env.AEGIS_QA_URL || 'http://127.0.0.1:3000/';
const localHost = ['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname);
const output = resolve(root, `.local/screenshots/${localHost ? 'redesign' : 'redesign-hosted'}`);
mkdirSync(output, { recursive: true });
const playwrightEntry =
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/himal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const context = await chromium.launchPersistentContext(
  resolve(root, '.local/playwright/qa-profile'),
  {
    executablePath:
      process.env.BROWSER_EXECUTABLE ||
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--no-first-run',
      '--disable-application-cache',
      '--disable-gpu-shader-disk-cache',
    ],
    env: {
      ...process.env,
      TEMP: resolve(root, '.local/tmp'),
      TMP: resolve(root, '.local/tmp'),
      LOCALAPPDATA: resolve(root, '.local/home/AppData/Local'),
      APPDATA: resolve(root, '.local/home/AppData/Roaming'),
    },
  }
);

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const account = '0x000000000000000000000000000000000000dEaD';
const errors = [];
const failedRequests = [];
const consoleErrors = [];
const issues = [];
const walletChecks = [];
const captures = [];
let interceptedInferenceRequests = 0;
let actualMarketSnapshot = null;
let activePage;
const releaseCallbacks = [];
context.on('page', (target) => {
  target.on('pageerror', (error) => errors.push(error.message));
  target.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  target.on('requestfailed', (request) =>
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText })
  );
});
// Every page gets a read-only wallet double; a signing attempt fails and is counted.
await context.addInitScript((address) => {
  const callbacks = {};
  window.qaWalletSignAttempts = 0;
  window.ethereum = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (/sendTransaction|sign/i.test(method)) window.qaWalletSignAttempts++;
      throw new Error('QA wallet never signs transactions');
    },
    on: (name, callback) => {
      callbacks[name] = callback;
    },
    removeListener: (name) => {
      delete callbacks[name];
    },
  };
  window.qaWalletEvent = (name) => callbacks[name]?.();
}, account);
// No test page can forward an inference request to the paid service.
await context.route('**/api/jev', async (route) => {
  interceptedInferenceRequests++;
  await route.fulfill({ status: 503, json: { error: 'QA intercepted inference; no paid call' } });
});

async function assertWalletDidNotSign(target, label) {
  const attempts = await target.evaluate(() => window.qaWalletSignAttempts);
  walletChecks.push({ page: label, signingAttempts: attempts });
  assert.equal(attempts, 0, `${label} attempted wallet signing`);
}

async function assertEvidenceKeyboard(target, trigger, title) {
  await trigger.click();
  const dialog = target.getByRole('dialog', { name: title, exact: true });
  await dialog.waitFor();
  let focusError;
  try {
    assert.equal(
      await dialog
        .getByRole('button', { name: 'Close evidence' })
        .evaluate((element) => element === document.activeElement),
      true
    );
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let index = 0; index < 8; index++) {
        await target.keyboard.press(key);
        const focus = await dialog.evaluate((element) => ({
          contained: element.contains(document.activeElement),
          activeTag: document.activeElement?.tagName,
          activeName: document.activeElement?.getAttribute('aria-label'),
        }));
        assert.equal(
          focus.contained,
          true,
          `Evidence focus escaped with ${key}: ${focus.activeTag} ${focus.activeName ?? ''}`
        );
      }
    }
  } catch (error) {
    focusError = error;
  }
  await target.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
    'Evidence did not return focus to its trigger'
  );
  if (focusError) throw focusError;
}

async function independentCheck(name, action) {
  try {
    await action();
    report.checks[name] = 'passed';
  } catch (error) {
    issues.push({ check: name, error: error.message });
    report.checks[name] = 'failed';
    console.log(`QA issue: ${name}: ${error.message}`);
  }
}

async function assertDecisionStages(target) {
  const flow = target.locator('.decision-flow');
  for (const stage of ['Observation', 'Assessment', 'Policy checks', 'Outcome']) {
    const button = flow.getByRole('button', { name: new RegExp('^' + stage) });
    await button.focus();
    await target.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    await flow.locator('.decision-detail').waitFor();
    assert.equal(await flow.locator('button[aria-expanded="true"]').count(), 1);
    if (stage === 'Observation')
      await flow.getByText('Captured midpoint', { exact: true }).waitFor();
    if (stage === 'Policy checks')
      assert.ok((await flow.locator('.policy-check-item').count()) > 0, 'Policy checks missing');
    await target.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await flow.locator('.decision-detail').count(), 0);
  }
}

async function captureViewports(target, mode) {
  for (const viewport of viewports) {
    await target.setViewportSize(viewport);
    await target.evaluate(() => window.scrollTo(0, 0));
    await target.evaluate(() => new Promise(requestAnimationFrame));
    const layout = await target.evaluate(() => {
      const position = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.getBoundingClientRect().top + window.scrollY : null;
      };
      const marketHeading = Array.from(document.querySelectorAll('h2')).find(
        (heading) => heading.textContent === 'Market'
      );
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        context: position('.workspace-intro'),
        assessment: position('.assessment-card'),
        flow: position('.decision-flow'),
        trade: position('.trade-card'),
        market: marketHeading ? marketHeading.getBoundingClientRect().top + window.scrollY : null,
        mandate: position('#mandate'),
      };
    });
    assert.equal(layout.overflow, false, `${mode} overflows at ${viewport.width}px`);
    if (viewport.width <= 390) {
      assert.ok(layout.context < layout.assessment, 'Context must precede mobile assessment');
      assert.ok(layout.assessment < layout.flow, 'Mobile assessment must precede decision flow');
      assert.ok(layout.flow < layout.market, 'Decision flow must precede mobile market details');
      assert.ok(layout.market < layout.mandate, 'Mobile mandate must follow market details');
      if (mode === 'live') {
        assert.ok(layout.flow < layout.trade, 'Mobile trade review must follow decision flow');
        assert.ok(layout.trade < layout.market, 'Mobile trade review must precede market details');
      }
    }
    const name = `${mode}-${viewport.width}x${viewport.height}.png`;
    await target.screenshot({ path: resolve(output, name), fullPage: true });
    if (viewport.width === 1440 || viewport.width === 390)
      await target.screenshot({
        path: resolve(output, `${mode}-${viewport.width}x${viewport.height}-viewport.png`),
        fullPage: false,
      });
    captures.push({ mode, ...viewport, file: name, ...layout });
  }
}

const report = { url: baseUrl, observedAt: new Date().toISOString(), checks: {} };
try {
  const page = await context.newPage();
  activePage = page;
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname === '/api/market' && response.ok()) {
      try {
        actualMarketSnapshot = await response.json();
      } catch {
        // A browser may cancel its outstanding read while switching workspaces.
      }
    }
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page
    .locator('.assessment-provenance')
    .getByText('Heuristic replay', { exact: true })
    .waitFor();
  const paperPortfolio = page.getByRole('heading', { name: 'Paper portfolio', exact: true });
  const portfolioBefore = await paperPortfolio.evaluate(
    (heading) => heading.closest('.terminal-card').textContent
  );
  await page.evaluate(() => window.qaWalletEvent('chainChanged'));
  assert.equal(
    await paperPortfolio.evaluate((heading) => heading.closest('.terminal-card').textContent),
    portfolioBefore,
    'A wallet event altered the independent replay portfolio'
  );
  report.checks.replayWalletIsolation = 'passed';
  await assertDecisionStages(page);
  report.checks.keyboardDecisionStages = 'passed';
  await independentCheck('evidenceEscapeFocusReturnAndContainment', () =>
    assertEvidenceKeyboard(
      page,
      page
        .locator('.assessment-card')
        .getByRole('button', { name: 'Inspect evidence', exact: true }),
      'Assessment evidence'
    )
  );
  await captureViewports(page, 'replay');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#replay-scenario').selectOption({ label: '5. Oversized Proposal Blocked' });
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await page.locator('.assessment-card .policy-verdict.is-blocked').waitFor();
  await page.locator('.assessment-card').getByRole('button', { name: 'Inspect evidence' }).click();
  const blockedDialog = page.getByRole('dialog', { name: 'Assessment evidence', exact: true });
  await blockedDialog.getByText('Blocked by local policy', { exact: true }).waitFor();
  assert.ok((await blockedDialog.locator('.policy-check-item').count()) > 0);
  await page.screenshot({ path: resolve(output, 'blocked-evidence.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await blockedDialog.waitFor({ state: 'hidden' });
  report.checks.oversizedActionBlocked = 'passed';
  const filters = page.getByRole('group', { name: 'Journal filter' });
  await filters.getByRole('button', { name: 'Blocked', exact: true }).click();
  assert.equal(
    await filters.getByRole('button', { name: 'Blocked' }).getAttribute('aria-pressed'),
    'true'
  );
  await filters.getByRole('button', { name: 'All events', exact: true }).click();
  report.checks.journalFilters = 'passed';

  await page.getByRole('button', { name: 'Live Market', exact: true }).click();
  await page.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(actualMarketSnapshot?.source, 'kuru_rpc');
  assert.equal(actualMarketSnapshot?.chainId, 143);
  report.actualReads = {
    source: actualMarketSnapshot.source,
    chainId: actualMarketSnapshot.chainId,
    blockNumber: actualMarketSnapshot.blockNumber,
    midPrice: actualMarketSnapshot.midPrice,
    observationTimestamp: actualMarketSnapshot.timestamp,
    note: 'Actual same-origin read-only Kuru/Monad responses; no chain submission.',
  };
  await page.getByRole('button', { name: 'Inspect safety state', exact: true }).click();
  await page.getByRole('heading', { name: 'AI assessment unavailable', exact: true }).waitFor();
  assert.equal(await page.locator('.assessment-card .probability-list').count(), 0);
  await page.getByText('WALLET DISCONNECTED', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await page.getByText('WALLET BALANCES', { exact: true }).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.qaWalletEvent('accountsChanged'));
  await page.getByText('WALLET DISCONNECTED', { exact: true }).waitFor({ timeout: 15000 });
  report.checks.actualMarketAndBalanceReads = 'passed';
  report.checks.walletChangeInvalidation = 'passed';
  report.checks.fallbackOmitsProbabilities = 'passed';
  await captureViewports(page, 'live');
  await assertWalletDidNotSign(page, 'actual-read page');

  // Enable inference only in a browser fixture, with /api/jev intercepted above.
  const racePage = await context.newPage();
  activePage = racePage;
  await racePage.route('**/api/status', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), inferenceEnabled: true } });
  });
  await racePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await racePage.getByRole('button', { name: 'Live Market', exact: true }).click();
  await racePage.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor({ timeout: 30000 });
  const ownerInput = racePage.getByLabel('Owner access', { exact: true });
  if (await ownerInput.count()) await ownerInput.fill('intercepted-qa-access');
  const evaluateButton = racePage.getByRole('button', { name: 'Evaluate with Jev', exact: true });
  assert.equal(await evaluateButton.isEnabled(), true);
  for (const [field, value] of [
    ['trade_size', ''],
    ['max_position_usd', '-1'],
    ['max_slippage_bps', '501'],
  ]) {
    const input = racePage.locator('#policy-' + field);
    const previous = await input.inputValue();
    await input.fill(value);
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await evaluateButton.isDisabled(), true, `Invalid ${field} allowed evaluation`);
    assert.equal(
      await racePage.getByRole('button', { name: 'Prepare & simulate' }).isDisabled(),
      true
    );
    await input.fill(previous);
    assert.notEqual(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await evaluateButton.isEnabled(), true);
  }
  report.checks.invalidRawPolicyBlocksEvaluation = 'passed';
  let releaseMarket, markStarted;
  const marketHeld = new Promise((resolve) => {
    markStarted = resolve;
  });
  const marketReleased = new Promise((resolve) => {
    releaseMarket = resolve;
  });
  releaseCallbacks.push(releaseMarket);
  await racePage.route('**/api/market', async (route) => {
    const response = await route.fetch();
    markStarted();
    await marketReleased;
    await route.fulfill({ response });
  });
  const inferenceBeforeRace = interceptedInferenceRequests;
  await evaluateButton.click();
  let marketStartTimeout;
  try {
    await Promise.race([
      marketHeld,
      new Promise((_, reject) => {
        marketStartTimeout = setTimeout(
          () => reject(new Error('Live evaluation did not request its captured market read')),
          15000
        );
      }),
    ]);
  } finally {
    clearTimeout(marketStartTimeout);
  }
  await racePage.getByRole('button', { name: 'Replay Mode', exact: true }).click();
  releaseMarket();
  await racePage.waitForLoadState('networkidle');
  await racePage
    .locator('.assessment-provenance')
    .getByText('Heuristic replay', { exact: true })
    .waitFor();
  const cancelledEvaluationInferenceRequests = interceptedInferenceRequests - inferenceBeforeRace;
  assert.equal(
    cancelledEvaluationInferenceRequests,
    0,
    'Cancelled live evaluation requested inference'
  );
  await assertWalletDidNotSign(racePage, 'cancelled-evaluation fixture');
  await racePage.close();
  report.checks.cancelledEvaluationInferenceRequests = cancelledEvaluationInferenceRequests;

  // Separate intercepted data exercises lifecycle UI; it is not evidence of a chain simulation.
  const fixturePage = await context.newPage();
  activePage = fixturePage;
  let preparations = 0,
    marketResponses = 0,
    holdMarket = false,
    releaseFixtureMarket;
  const heldFixtureMarket = new Promise((resolve) => {
    releaseFixtureMarket = resolve;
  });
  releaseCallbacks.push(releaseFixtureMarket);
  const fixturePrice = actualMarketSnapshot.midPrice;
  await fixturePage.route('**/api/market', async (route) => {
    if (holdMarket) await heldFixtureMarket;
    await route.fulfill({
      json: {
        ...actualMarketSnapshot,
        timestamp: Date.now(),
        midPrice: fixturePrice,
        bids: [{ price: fixturePrice * 0.9997, size: 10000000 }],
        asks: [{ price: fixturePrice * 1.0003, size: 10000000 }],
      },
    });
    marketResponses++;
  });
  await fixturePage.route('**/api/portfolio?*', (route) =>
    route.fulfill({ json: { mon: '10000', usdc: '1000' } })
  );
  await fixturePage.route('**/api/rpc', (route) => {
    const input = route.request().postDataJSON();
    const result = input.method === 'eth_chainId' ? '0x8f' : '0x21e19e0c9bab2400000';
    return route.fulfill({ json: { jsonrpc: '2.0', id: input.id, result } });
  });
  await fixturePage.route('**/api/prepare', async (route) => {
    preparations++;
    const input = route.request().postDataJSON();
    const amountWei = parseUnits(input.amountMon, 18);
    const sizeUnits = parseUnits(input.amountMon, 10);
    const estimatedOutUsdc = (Number(input.amountMon) * fixturePrice).toFixed(6);
    const minOutUsdc = (Number(estimatedOutUsdc) * (1 - input.slippageBps / 10000)).toFixed(6);
    const minOutUnits = parseUnits(minOutUsdc, 6);
    const createdAt = Date.now();
    await route.fulfill({
      json: {
        id: 'qa-intercepted-ui-proposal-' + preparations,
        chainId: 143,
        account,
        marketAddress: actualMarketSnapshot.marketAddress,
        amountMon: input.amountMon,
        amountWei: amountWei.toString(),
        sizeUnits: sizeUnits.toString(),
        estimatedOutUsdc,
        minOutUsdc,
        minOutUnits: minOutUnits.toString(),
        slippageBps: input.slippageBps,
        referenceMidPrice: fixturePrice.toFixed(18),
        snapshotBlockNumber: actualMarketSnapshot.blockNumber,
        snapshotTimestamp: createdAt,
        createdAt,
        expiresAt: createdAt + (preparations === 1 ? 30000 : 3000),
        simulation: 'passed',
        gasEstimate: '297113',
        transaction: {
          from: account,
          to: actualMarketSnapshot.marketAddress,
          value: '0x' + amountWei.toString(16),
          data: encodeFunctionData({
            abi: parseAbi([
              'function placeAndExecuteMarketSell(uint96 size,uint256 minAmountOut,bool isMargin,bool isFillOrKill) payable returns (uint256)',
            ]),
            functionName: 'placeAndExecuteMarketSell',
            args: [sizeUnits, minOutUnits, false, true],
          }),
          gas: '0x570c3',
        },
      },
    });
  });
  await fixturePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await fixturePage.getByRole('button', { name: 'Live Market', exact: true }).click();
  await fixturePage.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor();
  await fixturePage.locator('#policy-trade_size').fill('10');
  await fixturePage.locator('#policy-max_slippage_bps').fill('50');
  await fixturePage.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await fixturePage.getByText('WALLET BALANCES', { exact: true }).waitFor();
  const prepareButton = fixturePage.getByRole('button', {
    name: 'Prepare & simulate',
    exact: true,
  });
  await prepareButton.click();
  await fixturePage.getByRole('button', { name: 'Confirm in wallet', exact: true }).waitFor();
  await fixturePage.locator('.trade-card').getByText('Sell exactly', { exact: true }).waitFor();
  await fixturePage.locator('.trade-card').getByText('Minimum output', { exact: true }).waitFor();
  await fixturePage.setViewportSize({ width: 360, height: 800 });
  const mobileTerms = await fixturePage.locator('.trade-terms').evaluate((terms) => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    amountsFit: Array.from(terms.querySelectorAll('dd')).every((amount) => {
      const bounds = amount.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
  }));
  assert.equal(mobileTerms.overflow, false, 'Prepared trade overflows the mobile viewport');
  assert.equal(mobileTerms.amountsFit, true, 'An exact trade amount extends beyond the viewport');
  await fixturePage.screenshot({
    path: resolve(output, 'intercepted-proposal-360x800.png'),
    fullPage: true,
  });
  await fixturePage.setViewportSize({ width: 1440, height: 900 });
  const manualTrigger = fixturePage.getByRole('button', { name: 'Trade evidence', exact: true });
  await independentCheck('manualEvidenceKeyboard', () =>
    assertEvidenceKeyboard(fixturePage, manualTrigger, 'User requested MON reduction')
  );
  await manualTrigger.click();
  const manualDialog = fixturePage.getByRole('dialog', { name: 'User requested MON reduction' });
  assert.equal(await manualDialog.locator('.probability-list').count(), 0);
  assert.equal(
    await manualDialog.getByText('Relative action probabilities', { exact: true }).count(),
    0
  );
  await fixturePage.keyboard.press('Escape');
  await manualDialog.waitFor({ state: 'hidden' });
  await fixturePage.locator('#policy-trade_size').fill('');
  assert.equal(await prepareButton.isDisabled(), true);
  assert.equal(await fixturePage.getByRole('button', { name: 'Confirm in wallet' }).count(), 0);
  await fixturePage.getByText('Stopped before submission', { exact: true }).waitFor();
  await fixturePage.locator('#policy-trade_size').fill('10');
  await prepareButton.click();
  await fixturePage.getByRole('button', { name: 'Confirm in wallet', exact: true }).waitFor();
  holdMarket = true;
  const marketResponsesAtPreparation = marketResponses;
  await fixturePage
    .getByText('Proposal expired. Prepare a fresh simulation.', { exact: true })
    .waitFor({ timeout: 10000 });
  assert.equal(await fixturePage.getByRole('button', { name: 'Confirm in wallet' }).count(), 0);
  assert.equal(
    marketResponses,
    marketResponsesAtPreparation,
    'Expiry depended on a new market response'
  );
  await fixturePage.screenshot({
    path: resolve(output, 'intercepted-proposal-expired.png'),
    fullPage: true,
  });
  await assertWalletDidNotSign(fixturePage, 'intercepted-proposal fixture');
  releaseFixtureMarket();
  await fixturePage.close();
  report.interceptedFixtures = {
    preparations,
    proposalInvalidatedByRawEdit: 'passed',
    proposalExpiryWithoutMarketResponse: 'passed',
    manualEvidenceOmitsAiStatistics: 'passed',
    mobileTradeTermsFit: 'passed',
    note: 'Market, portfolio, RPC and prepare responses intercepted. These checks establish UI behavior only; no actual simulation or signing occurred in this fixture.',
  };
  report.captures = captures;
  report.walletChecks = walletChecks;
  report.interceptedInferenceRequests = interceptedInferenceRequests;
  report.noPaidInference = true;
  report.noWalletSigning = true;
  report.pageErrors = errors;
  report.consoleErrors = consoleErrors;
  report.issues = issues;
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
  assert.equal(interceptedInferenceRequests, 0, 'An unexpected model request was intercepted');
  assert.equal(issues.length, 0, 'Unresolved independent checks: ' + JSON.stringify(issues));
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify({ status: 'passed', ...report }, null, 2)
  );
  console.log(
    'Redesign QA passed: seven viewports in each mode, decision stages, evidence keyboard, real reads, policy errors, proposal invalidation and expiry, and cancelled evaluation.'
  );
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify(
      {
        status: 'failed',
        ...report,
        captures,
        pageErrors: errors,
        consoleErrors,
        failedRequests,
        error: error.message,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      output,
      error: error.message,
      pageErrors: errors,
      consoleErrors,
      failedRequests,
    })
  );
  throw error;
} finally {
  for (const release of releaseCallbacks) release();
  await context.close();
}
