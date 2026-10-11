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
const output = resolve(root, '.local/artifacts/motion-reference');
mkdirSync(output, { recursive: true });
const browser = await chromium.launchPersistentContext(
  resolve(root, '.local/playwright/motion-reference'),
  {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    viewport: { width: 1440, height: 900 },
    env: { ...process.env, TEMP: resolve(root, '.local/tmp'), TMP: resolve(root, '.local/tmp') },
  }
);
try {
  const page = await browser.newPage();
  await page.goto('https://getfrankli.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const sample = async () =>
    page.evaluate(() => ({
      scrollY,
      animations: document
        .getAnimations()
        .map((a) => ({
          name: a.animationName || a.constructor.name,
          target: a.effect?.target?.className,
          timing: a.effect?.getTiming(),
        }))
        .slice(0, 25),
      transforms: [...document.querySelectorAll('main *, section *, h1, h2, a, button')]
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          transform: getComputedStyle(el).transform,
          opacity: getComputedStyle(el).opacity,
          transition: getComputedStyle(el).transition,
        }))
        .filter(
          (x) => x.transform !== 'none' || x.opacity !== '1' || !x.transition.startsWith('all 0s')
        )
        .slice(0, 40),
    }));
  const opening = await sample();
  await page.screenshot({ path: resolve(output, 'opening.png') });
  await page.evaluate(() => scrollTo({ top: 1050, behavior: 'instant' }));
  await page.waitForTimeout(250);
  const entering = await sample();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(output, 'scrolled.png') });
  const settled = await sample();
  const report = { url: page.url(), opening, entering, settled };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
