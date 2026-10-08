import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('QA outputs must stay off C:');
const baseUrl = process.env.AEGIS_QA_URL || 'http://127.0.0.1:3000/';
const output = resolve(
  root,
  `.local/artifacts/${new URL(baseUrl).hostname === '127.0.0.1' ? 'ui' : 'ui-hosted'}`
);
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
    viewport: { width: 1440, height: 1120 },
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
const page = await context.newPage();
await page.addInitScript(() => {
  const callbacks = {};
  window.ethereum = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_requestAccounts' || method === 'eth_accounts')
        return ['0x000000000000000000000000000000000000dEaD'];
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
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const failedRequests = [];
page.on('requestfailed', (request) =>
  failedRequests.push({ url: request.url(), error: request.failure()?.errorText })
);
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Heuristic replay policy', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'replay-desktop.png'), fullPage: true });
  // A wallet event must not erase or mutate the independent replay portfolio.
  await page.evaluate(() => window.qaWalletEvent('chainChanged'));
  await page.getByText('Heuristic replay policy', { exact: true }).waitFor();
  await page.getByRole('button', { name: /5\./ }).click();
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await page.getByText('HARD RISK GATE: EXECUTION BLOCKED', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Why?', exact: true }).click();
  await page.getByText('VERDICT: BLOCKED BY RISK GATE', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'blocked-evidence.png'), fullPage: true });
  await page.keyboard.press('Escape');
  // Close evidence through its header button; modal buttons have SVG icons.
  await page.locator('.fixed.inset-0 .terminal-header button').click();
  await page.getByRole('button', { name: 'Live Market', exact: true }).click();
  await page.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Inspect safety state', exact: true }).click();
  await page.getByText('WALLET DISCONNECTED', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  await page.getByText('WALLET BALANCES', { exact: true }).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.qaWalletEvent('accountsChanged'));
  await page.getByText('WALLET DISCONNECTED', { exact: true }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: resolve(output, 'live-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'live-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  if (overflow) throw new Error('Mobile viewport has horizontal overflow');
  // Advertise inference only in this test page; intercept any model request before it reaches the API.
  const racePage = await context.newPage();
  racePage.on('pageerror', (error) => errors.push(error.message));
  let inferenceRequests = 0;
  await racePage.route('**/api/status', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), inferenceEnabled: true } });
  });
  await racePage.route('**/api/jev', async (route) => {
    inferenceRequests++;
    await route.fulfill({ status: 503, json: { error: 'Test intercepted inference' } });
  });
  await racePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await racePage.getByRole('button', { name: 'Live Market', exact: true }).click();
  await racePage.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor({ timeout: 30000 });
  const ownerInput = racePage.getByLabel('Owner access');
  if (await ownerInput.count()) await ownerInput.fill('intercepted-qa-access');
  let releaseMarket, markStarted;
  const marketHeld = new Promise((resolve) => {
    markStarted = resolve;
  });
  const marketReleased = new Promise((resolve) => {
    releaseMarket = resolve;
  });
  await racePage.route('**/api/market', async (route) => {
    const response = await route.fetch();
    markStarted();
    await marketReleased;
    await route.fulfill({ response });
  });
  await racePage.getByRole('button', { name: 'Evaluate with Jev', exact: true }).click();
  await marketHeld;
  await racePage.getByRole('button', { name: 'Replay Mode', exact: true }).click();
  releaseMarket();
  await racePage.waitForLoadState('networkidle');
  await racePage.getByText('Heuristic replay policy', { exact: true }).waitFor();
  if (inferenceRequests !== 0)
    throw new Error('A cancelled live evaluation requested inference on replay state');
  await racePage.close();
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify(
      {
        url: baseUrl,
        replay: 'passed',
        oversizedActionBlocked: 'passed',
        evidence: 'passed',
        liveOnchainSnapshot: 'passed',
        safetyInspection: 'passed',
        walletConnection: 'passed',
        walletChangeInvalidation: 'passed',
        replayIsolation: 'passed',
        cancelledEvaluationInferenceRequests: inferenceRequests,
        mobileOverflow: false,
        pageErrors: errors,
        noWalletSigning: true,
        noPaidInference: true,
      },
      null,
      2
    )
  );
  console.log(
    'UI smoke passed: replay, blocked action, evidence, real market, wallet connection and account changes, free safety inspection and mobile layout.'
  );
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  console.log(
    JSON.stringify({
      notices: await page.locator('.notice').allTextContents(),
      pageErrors: errors,
      failedRequests,
    })
  );
  throw error;
} finally {
  await context.close();
}
