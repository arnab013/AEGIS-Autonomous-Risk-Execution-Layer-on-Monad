import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('Browser artifacts must stay on F:.');
const release = 'https://aegis.himaloy2608.workers.dev';
const output = resolve(root, '.local/screenshots/trial-widget');
mkdirSync(output, { recursive: true });
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/himal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
).href);
const context = await chromium.launchPersistentContext(
  resolve(root, '.local/playwright/trial-widget-qa'),
  {
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-breakpad', '--disable-crash-reporter', '--no-first-run'],
    env: {
      ...process.env,
      TEMP: resolve(root, '.local/tmp'),
      TMP: resolve(root, '.local/tmp'),
      LOCALAPPDATA: resolve(root, '.local/home/AppData/Local'),
      APPDATA: resolve(root, '.local/home/AppData/Roaming'),
    },
  }
);
const report = {
  url: release + '/app',
  observedAt: new Date().toISOString(),
  scope: 'Loads the official Turnstile widget without clicking or solving it. All application writes and paid inference are blocked. This does not verify trial issuance or completed visitor verification.',
  blockedRequests: [],
  scriptResponses: [],
  pageErrors: [],
  challengeClicks: 0,
  inferenceCalls: 0,
  walletSigningAttempts: 0,
};

await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const appRead = url.origin === release && ['GET', 'HEAD'].includes(request.method());
  const challenge = url.origin === 'https://challenges.cloudflare.com';
  if (appRead || challenge) return route.continue();
  report.blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
  return route.abort('blockedbyclient');
});

let page;
try {
  page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'https://challenges.cloudflare.com' && url.pathname.endsWith('/api.js'))
      report.scriptResponses.push({ status: response.status(), path: url.pathname });
  });
  await page.goto(report.url, { waitUntil: 'networkidle' });
  await page.locator('.dashboard-sidebar').getByRole('button', { name: 'AI access', exact: true }).click();
  await page.getByRole('dialog', { name: 'AI, on your terms.', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(window.turnstile), undefined, { timeout: 20000 });
  report.scriptLoaded = await page.evaluate(() => Boolean(window.turnstile));
  await page.waitForTimeout(2500);
  report.challengeFrames = page.frames().filter((frame) => {
    try { return new URL(frame.url()).origin === 'https://challenges.cloudflare.com'; }
    catch { return false; }
  }).length;
  report.visibleStatus = await page.locator('.trial-access').innerText();
  await page.screenshot({ path: resolve(output, 'desktop-widget.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(1500);
  report.mobileChallengeWidgets = [];
  for (const frame of page.frames()) {
    try {
      if (new URL(frame.url()).origin !== 'https://challenges.cloudflare.com') continue;
      const bounds = await (await frame.frameElement()).boundingBox();
      if (bounds) report.mobileChallengeWidgets.push({ width: bounds.width, height: bounds.height });
    } catch {}
  }
  report.mobileLayout = await page.getByRole('dialog', { name: 'AI, on your terms.', exact: true }).evaluate((dialog) => ({
    clientWidth: dialog.clientWidth,
    scrollWidth: dialog.scrollWidth,
    horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
  }));
  await page.locator('.trial-access').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'mobile-widget-viewport.png'), fullPage: false });
  await page.screenshot({ path: resolve(output, 'mobile-widget.png'), fullPage: true });
  report.status = report.scriptLoaded && report.challengeFrames > 0
    ? report.mobileLayout.horizontalOverflow ? 'widget_loaded_with_mobile_overflow' : 'widget_loaded'
    : 'widget_not_rendered';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  if (page && !page.isClosed())
    await page.screenshot({ path: resolve(output, 'widget-failure.png'), fullPage: true });
} finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.status !== 'widget_loaded') process.exitCode = 1;
  await context.close();
}
