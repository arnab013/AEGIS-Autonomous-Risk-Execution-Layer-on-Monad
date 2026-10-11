import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (!/^f:[\\/]/i.test(root)) throw new Error('Browser artifacts must stay on F:.');
const { chromium } = await import(
  pathToFileURL(
    'C:/Users/himal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  ).href
);
const output = resolve(root, '.local/screenshots/live-warm');
mkdirSync(output, { recursive: true });
const base = process.env.AEGIS_QA_URL || 'http://127.0.0.1:3000';
const report = {
  url: base,
  observedAt: new Date().toISOString(),
  scope: 'Actual hosted UI and market reads. No inference, wallet connection, or signing.',
  captures: [],
  marketReads: [],
};
const browser = await chromium.launchPersistentContext(
  resolve(root, '.local/playwright/live-warm-profile'),
  {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    viewport: { width: 1440, height: 900 },
    env: { ...process.env, TEMP: resolve(root, '.local/tmp'), TMP: resolve(root, '.local/tmp') },
  }
);
try {
  const page = await browser.newPage();
  async function visit(path, surface) {
    const marketResponse = surface === 'home' ? null : page.waitForResponse(
      (response) => response.url().endsWith('/api/market') && response.status() === 200,
      { timeout: 30000 }
    );
    await page.goto(base + path);
    if (marketResponse) {
      const response = await marketResponse;
      report.marketReads.push({ path, status: response.status(), observedAt: new Date().toISOString() });
      if (surface === 'workspace') await page.locator('.market-card').waitFor({ state: 'visible' });
      else await page.getByText('Current Kuru observation', { exact: true }).waitFor();
    }
    // A received response can precede React's committed market view and its entrance transition.
    await page.waitForTimeout(900);
  }
  async function capture(file, fullPage = false) {
    await page.screenshot({ path: resolve(output, file), fullPage });
    report.captures.push({ file, viewport: page.viewportSize(), fullPage });
  }
  await visit('/app', 'dashboard');
  await capture('dashboard.png');
  await capture('dashboard-full.png', true);
  await visit('/', 'home');
  await capture('home.png');
  await visit('/app/workspace', 'workspace');
  await capture('workspace.png', true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [surface, path] of [['home', '/'], ['dashboard', '/app'], ['workspace', '/app/workspace']]) {
    await visit(path, surface);
    await capture(surface + '-mobile.png');
    await capture(surface + '-mobile-full.png', true);
  }
  report.status = 'passed';
  console.log('Captured actual market UI without inference or wallet actions.');
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  throw error;
} finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
