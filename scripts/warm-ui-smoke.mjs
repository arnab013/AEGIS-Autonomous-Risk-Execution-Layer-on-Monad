import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('QA artifacts must stay on F:.');
const baseUrl = process.env.AEGIS_QA_URL || 'http://127.0.0.1:3000/';
const origin = new URL(baseUrl).origin;
const local = ['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname);
if (!local && origin !== 'https://aegis.himaloy2608.workers.dev')
  throw new Error('Warm UI smoke checks run only against localhost or the Aegis release.');
const output = resolve(root, '.local/screenshots');
mkdirSync(output, { recursive: true });
const playwrightEntry =
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/himal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const context = await chromium.launchPersistentContext(
  resolve(root, '.local/playwright/warm-qa-profile'),
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
const marketAddress = '0x065C9d28E428A0db40191a54d33d5b7c71a9C394';
const errors = [],
  consoleErrors = [],
  expectedConsoleErrors = [],
  externalRequests = [],
  captures = [],
  issues = [];
const calls = {};
let activePage,
  latestIntent,
  marketFailure = false,
  preparationCount = 0,
  agentCount = 0,
  keyCheckOutcome = 'accepted',
  keyCheckDelay = 0,
  keyCheckCode,
  keyCheckFailure = false;
const report = {
  url: baseUrl,
  observedAt: new Date().toISOString(),
  checks: {},
  scope:
    'All API responses in this run are intercepted UI fixtures. This does not verify real inference, news feeds, RPC reads, chain simulation or execution.',
};

context.on('page', (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (
      (marketFailure && /server responded with a status of 503/.test(text)) ||
      (keyCheckFailure && /server responded with a status of (401|404|429|502)/.test(text))
    )
      expectedConsoleErrors.push(text);
    else consoleErrors.push(text);
  });
});
await context.addInitScript((address) => {
  const listeners = {};
  window.qaWalletSignAttempts = 0;
  window.ethereum = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (/sendTransaction|sign/i.test(method)) window.qaWalletSignAttempts++;
      throw new Error('QA wallet cannot sign.');
    },
    on: (event, callback) => {
      listeners[event] = callback;
    },
    removeListener: (event) => {
      delete listeners[event];
    },
  };
  window.qaWalletEvent = (event) => listeners[event]?.();
}, account);

// Every API call is handled here. Nothing in this run reaches a provider or an RPC.
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) {
    externalRequests.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  }
  if (!url.pathname.startsWith('/api/')) return route.continue();
  calls[url.pathname] = (calls[url.pathname] ?? 0) + 1;
  const json = (value, status = 200) => route.fulfill({ status, json: value });
  const time = Date.now();
  if (url.pathname === '/api/status')
    return json({
      chainId: 143,
      network: 'mainnet',
      inferenceEnabled: false,
      inferenceAccess: 'owner',
      model: 'jev-latest',
      journal: 'browser_session',
    });
  if (url.pathname === '/api/inference/status')
    return json({
      enabled: true,
      jevConfigured: true,
      agentConfigured: true,
      agentProvider: 'google',
      sessionActive: true,
      pool: 'public',
      model: 'google-model-fixture',
      jevModel: 'qa-jev-fixture',
      poolRemainingMicros: 2000000,
      totalRemainingMicros: 2000000,
      visitorTurnsRemaining: 5,
      ipTurnsRemaining: 10,
    });
  if (url.pathname === '/api/inference/session') return json({ active: true });
  if (url.pathname === '/api/agent/key-check') {
    const headers = request.headers();
    assert.equal(headers['x-aegis-agent-funding'], 'byok');
    assert.ok(
      ['mistral', 'openai', 'anthropic', 'google'].includes(headers['x-aegis-agent-provider'])
    );
    assert.equal(
      headers['x-aegis-jev-key'],
      undefined,
      'Key check forwarded an unrelated Jev key.'
    );
    assert.equal(request.postData(), '{}', 'Key check included conversation or generation inputs.');
    const outcome = keyCheckOutcome;
    if (keyCheckDelay) await new Promise((done) => setTimeout(done, keyCheckDelay));
    return json(
      {
        provider: headers['x-aegis-agent-provider'],
        model: 'provider-model-fixture',
        checkedAt: time,
        status: outcome,
        generationVerified: false,
        message: 'Read-only QA fixture. Generation quota has not been checked.',
        ...(keyCheckCode ? { code: keyCheckCode } : {}),
      },
      { accepted: 200, rejected: 401, rate_limited: 429, unavailable: 502, model_unavailable: 404 }[
        outcome
      ]
    );
  }
  if (url.pathname === '/api/news')
    return json({
      fetchedAt: time,
      articles: [
        {
          id: 'qa-news',
          title: 'QA fixture · Market context with a dated source',
          summary: 'An intercepted article for UI verification.',
          url: 'https://www.coindesk.com/',
          source: 'CoinDesk',
          publishedAt: time - 3600000,
        },
      ],
      unavailableSources: ['Decrypt'],
    });
  if (url.pathname === '/api/market' && marketFailure)
    return json({ error: 'QA fixture market unavailable.' }, 503);
  if (url.pathname === '/api/market')
    return json({
      pair: 'MON/USDC',
      bids: [{ price: 0.139958, size: 10000000 }],
      asks: [{ price: 0.140042, size: 10000000 }],
      midPrice: 0.14,
      timestamp: time,
      blockNumber: 55500000,
      chainId: 143,
      marketAddress,
      source: 'kuru_rpc',
      latencyMs: 42,
      depthIncludesAmm: true,
      metadata: {
        pricePrecision: '1000000',
        sizePrecision: '10000000000',
        baseAssetAddress: '0x0000000000000000000000000000000000000000',
        baseAssetDecimals: 18,
        quoteAssetAddress: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
        quoteAssetDecimals: 6,
        tickSize: '1',
        minSize: '2000000000000',
        maxSize: '1000000000000000000',
        takerFeeBps: '0',
        makerFeeBps: '0',
      },
    });
  if (url.pathname === '/api/portfolio') return json({ mon: '10000', usdc: '1000' });
  if (url.pathname === '/api/rpc') {
    const input = request.postDataJSON();
    return json({
      jsonrpc: '2.0',
      id: input.id,
      result: input.method === 'eth_chainId' ? '0x8f' : '0x21e19e0c9bab2400000',
    });
  }
  if (url.pathname === '/api/jev')
    return json({ error: 'No paid inference is permitted in UI QA.' }, 503);
  if (url.pathname === '/api/audit') return json({ ok: true });
  if (url.pathname === '/api/audit/export')
    return json({ savedPath: 'QA fixture export; no file written by the API.' });
  if (url.pathname === '/api/agent') {
    agentCount++;
    const input = request.postDataJSON();
    const before = input.context.policy;
    const after = { ...before, max_slippage_bps: 50 };
    const expired = input.message.includes('expired');
    latestIntent = {
      id: 'qa-intent-' + agentCount,
      intent: { kind: 'set_policy', changes: { max_slippage_bps: 50 } },
      token: 'qa-intercepted-token-' + agentCount,
      contextHash: 'qa-captured-context',
      createdAt: time,
      expiresAt: time + (expired ? -1000 : 60000),
      rationale: 'QA fixture: review a precise session slippage edit before applying it.',
      policyBefore: before,
      policyAfter: after,
    };
    return json({
      id: 'qa-reply-' + agentCount,
      message:
        'This is an intercepted QA response. Your current policy is preserved until you approve the exact change below.',
      provider: 'mistral',
      model: 'mistral-small-2603',
      observedAt: time,
      contextHash: 'qa-captured-context',
      rationale:
        'This fixture verifies context, consent and navigation. It is not an AI recommendation.',
      limitations: ['No model was called.', 'No wallet transaction was signed.'],
      citations: [],
      recommendation: latestIntent.intent,
      pendingIntent: latestIntent,
      jevUnavailableReason: 'Jev inference is intercepted and disabled during UI QA.',
    });
  }
  if (url.pathname === '/api/agent/approve') {
    const input = request.postDataJSON();
    assert.equal(input.token, latestIntent.token, 'Approval used a different fixture token.');
    return json({
      approved: true,
      intentId: latestIntent.id,
      intent: latestIntent.intent,
      policyAfter: latestIntent.policyAfter,
      signingRequired: false,
    });
  }
  if (url.pathname === '/api/prepare') {
    preparationCount++;
    const input = request.postDataJSON();
    const amountWei = parseUnits(input.amountMon, 18),
      sizeUnits = parseUnits(input.amountMon, 10);
    const estimatedOutUsdc = (Number(input.amountMon) * 0.14).toFixed(6);
    const minOutUsdc = (Number(estimatedOutUsdc) * (1 - input.slippageBps / 10000)).toFixed(6);
    const minOutUnits = parseUnits(minOutUsdc, 6);
    return json({
      id: 'qa-warm-proposal-' + preparationCount,
      chainId: 143,
      account,
      marketAddress,
      amountMon: input.amountMon,
      amountWei: amountWei.toString(),
      sizeUnits: sizeUnits.toString(),
      estimatedOutUsdc,
      minOutUsdc,
      minOutUnits: minOutUnits.toString(),
      slippageBps: input.slippageBps,
      referenceMidPrice: '0.140000000000000000',
      snapshotBlockNumber: 55500000,
      snapshotTimestamp: time,
      createdAt: time,
      expiresAt: time + 30000,
      simulation: 'passed',
      gasEstimate: '297113',
      transaction: {
        from: account,
        to: marketAddress,
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
    });
  }
  return json({ error: `Unexpected API path in UI QA: ${url.pathname}` }, 501);
});

async function check(name, action) {
  try {
    await action();
    report.checks[name] = 'passed';
  } catch (error) {
    report.checks[name] = 'failed';
    issues.push({ check: name, error: error.message });
    console.log(`QA issue: ${name}: ${error.message}`);
  }
}

async function keyboardDialog(page, trigger, name, closeName) {
  await trigger.click();
  const dialog = page.getByRole('dialog', { name, exact: true });
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole('button', { name: closeName, exact: true })
      .evaluate((button) => button === document.activeElement),
    true,
    'Initial dialog focus was not on close.'
  );
  for (const key of ['Tab', 'Shift+Tab'])
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(key);
      assert.equal(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        true,
        `Focus escaped the ${name} dialog.`
      );
    }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    await trigger.evaluate((button) => button === document.activeElement),
    true,
    'Dialog did not return focus.'
  );
}

function navigationItem(container, name) {
  return container
    .getByRole('button', { name, exact: true })
    .or(container.getByRole('link', { name, exact: true }));
}

function workspaceNavigation(page) {
  return page.locator('.dashboard-sidebar');
}

async function captureSettledAppearance(page) {
  // Full-page captures should show the content after its entrance, including sections below the fold.
  await page.evaluate(async () => {
    for (const section of document.querySelectorAll('main > section, main section[data-motion]')) {
      section.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(850);
}

async function checkMotion(page, surface) {
  const motion = await page.evaluate(() => {
    const seconds = (value) => value.split(',').map((part) => parseFloat(part) || 0);
    const elements = [...document.querySelectorAll('main, main *, header, aside')];
    return {
      animatedElements: elements.filter((element) => {
        const style = getComputedStyle(element);
        return (
          style.animationName !== 'none' &&
          seconds(style.animationDuration).some((value) => value > 0.01)
        );
      }).length,
      transitions: elements.filter((element) => {
        const style = getComputedStyle(element);
        return seconds(style.transitionDuration).some((value) => value > 0.01);
      }).length,
    };
  });
  assert.ok(motion.animatedElements > 0, 'The page has no visible entrance animation.');
  assert.ok(motion.transitions > 0, 'The page has no component interaction transitions.');
  report.motion ??= {};
  report.motion[surface] = motion;
}

async function checkAgentBrand(page) {
  const visibleText = await page.locator('body').innerText();
  assert.equal(
    /\bGemini\b/i.test(visibleText),
    false,
    'The page still uses the old provider name.'
  );
}

async function checkMarketErrorContrast() {
  const page = await context.newPage();
  marketFailure = true;
  try {
    await page.goto(origin + '/app', { waitUntil: 'networkidle' });
    const notice = page.locator('.dashboard-evidence-stack .notice');
    await page.getByText('QA fixture market unavailable.', { exact: false }).waitFor();
    const colors = await notice.evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
    const luminance = (color) => {
      const channels = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map((value) => Number(value) / 255);
      const linear = channels.map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      );
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const values = [luminance(colors.foreground), luminance(colors.background)].sort(
      (a, b) => a - b
    );
    const contrast = (values[1] + 0.05) / (values[0] + 0.05);
    assert.ok(contrast >= 4.5, `Market error text contrast is ${contrast.toFixed(2)}:1.`);
    report.marketErrorContrast = { ...colors, ratio: Number(contrast.toFixed(2)) };
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await notice.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      await page.screenshot({
        path: resolve(output, `warm-market-error-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
  } finally {
    marketFailure = false;
    await page.close();
  }
}

async function checkReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Less guesswork. More control.', exact: true }).waitFor();
  const motion = await page.evaluate(() => {
    const seconds = (value) => value.split(',').map((part) => parseFloat(part) || 0);
    const elements = [...document.querySelectorAll('body *')];
    return {
      preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
      longAnimations: elements.filter((element) => {
        const style = getComputedStyle(element);
        return (
          style.animationName !== 'none' &&
          seconds(style.animationDuration).some((value) => value > 0.01)
        );
      }).length,
      longTransitions: elements.filter((element) =>
        seconds(getComputedStyle(element).transitionDuration).some((value) => value > 0.01)
      ).length,
      invisibleContent: [
        ...document.querySelectorAll('main h1, main h2, main h3, main p, main button'),
      ].filter((element) => {
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none')
            return true;
        }
        return false;
      }).length,
      smoothScrolling: getComputedStyle(document.documentElement).scrollBehavior === 'smooth',
    };
  });
  assert.equal(motion.preference, true);
  assert.equal(
    motion.longAnimations,
    0,
    'Reduced motion leaves decorative or entrance animation running.'
  );
  assert.equal(motion.longTransitions, 0, 'Reduced motion leaves interaction transitions running.');
  assert.equal(
    motion.invisibleContent,
    0,
    'Reduced motion leaves page content waiting for an animation.'
  );
  assert.equal(motion.smoothScrolling, false, 'Reduced motion retains smooth scrolling.');
  report.reducedMotion = motion;
  await page.screenshot({
    path: resolve(output, 'warm-home-reduced-motion-1440x900.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function capture(page, surface) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await captureSettledAppearance(page);
    const layout = await page.evaluate(() => {
      const top = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect().top + window.scrollY;
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        chat: top('.agent-chat'),
        evidence: top('.dashboard-evidence-stack'),
        assessment: top('.assessment-card'),
        flow: top('.decision-flow'),
        trade: top('.trade-card'),
        market: top('.market-card'),
        mandate: top('#mandate'),
      };
    });
    assert.equal(
      layout.overflow,
      false,
      `${surface} has horizontal overflow at ${viewport.width}px.`
    );
    if (surface === 'home') {
      const mainNavigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      for (const name of ['Home', 'Dashboard'])
        assert.equal(
          await navigationItem(mainNavigation, name).isVisible(),
          true,
          `Homepage ${name} navigation is hidden at ${viewport.width}px.`
        );
    }
    if (viewport.width <= 390 && surface === 'dashboard')
      assert.ok(layout.chat < layout.evidence, 'Mobile chat should precede secondary context.');
    if (viewport.width <= 390 && surface === 'workspace') {
      assert.ok(
        layout.assessment < layout.flow,
        'Mobile assessment should precede its decision flow.'
      );
      assert.ok(
        layout.flow < layout.trade,
        'Mobile decision flow should precede manual sale review.'
      );
      assert.ok(layout.trade < layout.market, 'Mobile sale review should precede market detail.');
    }
    if (surface !== 'home' && viewport.width >= 1024) {
      const navigation = await workspaceNavigation(page).boundingBox();
      const main = await page.locator('main').boundingBox();
      assert.ok(navigation && main, 'Workspace sidebar or main content is missing.');
      assert.ok(
        navigation.x + navigation.width <= main.x + 2,
        `${surface} navigation is not positioned left of the workspace at ${viewport.width}px.`
      );
    }
    const file = `warm-${surface}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: resolve(output, file), fullPage: true });
    if (viewport.width === 1440 || viewport.width === 390)
      await page.screenshot({
        path: resolve(output, `warm-${surface}-${viewport.width}x${viewport.height}-viewport.png`),
        fullPage: false,
      });
    captures.push({ surface, ...viewport, file, ...layout });
  }
}

try {
  const page = await context.newPage();
  activePage = page;
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Less guesswork. More control.', exact: true }).waitFor();
  await check('homepageEntranceAndInteractionMotion', () => checkMotion(page, 'home'));
  await check('homepageScoutBrand', () => checkAgentBrand(page));
  await capture(page, 'home');
  await page.setViewportSize({ width: 1440, height: 900 });
  await check('reducedMotionKeepsAllContentVisible', () => checkReducedMotion(page));
  const landingNavigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  assert.equal(await navigationItem(landingNavigation, 'Home').count(), 1);
  const dashboardEntry = navigationItem(landingNavigation, 'Dashboard');
  await dashboardEntry.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(origin + '/app');
  await page.locator('.dashboard-metric').first().getByText('0.14', { exact: false }).waitFor();
  report.checks.homepageNavigation = 'passed';
  await page.getByRole('heading', { name: 'Scout, in your corner.', exact: true }).waitFor();
  await check('dashboardEntranceAndInteractionMotion', () => checkMotion(page, 'dashboard'));
  await check('dashboardScoutBrand', () => checkAgentBrand(page));
  const sidebar = workspaceNavigation(page);
  for (const name of ['Home', 'Overview', 'Market & execution'])
    assert.equal(
      await navigationItem(sidebar, name).count(),
      1,
      `Missing sidebar navigation: ${name}.`
    );
  assert.equal(
    await navigationItem(sidebar, 'Overview').getAttribute('aria-current'),
    'page',
    'The sidebar does not identify the current page.'
  );
  report.checks.leftWorkspaceNavigation = 'passed';
  await capture(page, 'dashboard');
  await check('compactNavigationKeyboard', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const compactToggle = workspaceNavigation(page).getByRole('button', {
      name: 'Navigation',
      exact: true,
    });
    assert.equal(await compactToggle.isVisible(), true, 'Mobile navigation toggle is missing.');
    await compactToggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await compactToggle.getAttribute('aria-expanded'), 'true');
    for (const name of ['Home', 'Overview', 'Market & execution'])
      assert.equal(await navigationItem(workspaceNavigation(page), name).isVisible(), true);
    await navigationItem(workspaceNavigation(page), 'Home').focus();
    assert.equal(
      await navigationItem(workspaceNavigation(page), 'Home').evaluate(
        (element) => element === document.activeElement
      ),
      true,
      'The compact navigation cannot be reached with the keyboard.'
    );
    await compactToggle.click();
    assert.equal(await compactToggle.getAttribute('aria-expanded'), 'false');
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await check('aiAccessKeyboard', () =>
    keyboardDialog(
      page,
      navigationItem(workspaceNavigation(page), 'AI access'),
      'AI, on your terms.',
      'Close AI access'
    )
  );
  await navigationItem(workspaceNavigation(page), 'AI access').click();
  const access = page.getByRole('dialog', { name: 'AI, on your terms.', exact: true });
  await access
    .getByRole('group', { name: 'Scout access', exact: true })
    .getByLabel('Use my API key', { exact: false })
    .check();
  await access.getByLabel('Mistral API key', { exact: true }).fill('QA-placeholder-not-an-api-key');
  const keyChecksBefore = calls['/api/agent/key-check'] ?? 0;
  assert.equal(keyChecksBefore, 0, 'The app checked a key before an explicit button action.');
  assert.equal(
    await access.getByText('The project trial uses Google', { exact: false }).count(),
    1,
    'The project trial provider label does not follow server status.'
  );
  await check('scoutVendorSelectionSevenViewports', async () => {
    const keyLabels = {
      mistral: 'Mistral API key',
      openai: 'OpenAI API key',
      anthropic: 'Anthropic API key',
      google: 'Google AI Studio API key',
    };
    await access.getByRole('combobox', { name: 'Scout provider', exact: true }).selectOption('openai');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const [provider, label] of Object.entries(keyLabels)) {
        await access.getByRole('combobox', { name: 'Scout provider', exact: true }).selectOption(provider);
        const key = access.getByLabel(label, { exact: true });
        assert.equal(await key.inputValue(), '', 'Changing vendor did not clear the previous key.');
        assert.equal(await key.getAttribute('type'), 'password');
        await key.fill('QA-placeholder-not-an-api-key');
        assert.equal(
          await access.getByRole('button', { name: 'Check key', exact: true }).isEnabled(),
          true
        );
      }
      assert.equal(
        await access.evaluate((element) => element.scrollWidth > element.clientWidth),
        false
      );
      await access.getByRole('combobox', { name: 'Scout provider', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await access.evaluate((element) => element.contains(document.activeElement)),
        true
      );
      await access.getByRole('button', { name: 'Use these settings', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await access
          .getByRole('button', { name: 'Close AI access', exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
        'The provider dialog did not contain forward keyboard focus.'
      );
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await access
          .getByRole('button', { name: 'Use these settings', exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
        'The provider dialog did not contain reverse keyboard focus.'
      );
      await access.getByRole('combobox', { name: 'Scout provider', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(output, `warm-scout-provider-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
    assert.equal(
      calls['/api/agent/key-check'] ?? 0,
      keyChecksBefore,
      'Vendor selection performed an automatic key check.'
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await access.getByRole('combobox', { name: 'Scout provider', exact: true }).selectOption('mistral');
    await access
      .getByLabel('Mistral API key', { exact: true })
      .fill('QA-placeholder-not-an-api-key');
  });
  await check('readonlyKeyCheckOutcomes', async () => {
    keyCheckFailure = true;
    for (const outcome of [
      'accepted',
      'rejected',
      'rate_limited',
      'unavailable',
      'model_unavailable',
    ]) {
      keyCheckOutcome = outcome;
      keyCheckCode = outcome === 'rate_limited' ? 'provider_rate_limited' : undefined;
      keyCheckDelay = 300;
      await access.getByRole('button', { name: 'Check key', exact: true }).click();
      await access.getByRole('button', { name: 'Checking key…', exact: true }).waitFor();
      await access.locator(`[data-check-status="${outcome}"]`).waitFor();
      if (outcome === 'accepted')
        assert.equal(
          await access
            .getByText('Key accepted · response generation unverified', { exact: true })
            .isVisible(),
          true
        );
      await access
        .getByLabel('Mistral API key', { exact: true })
        .fill('QA-placeholder-not-an-api-key-' + outcome);
      assert.equal(
        await access.locator('[data-check-status]').count(),
        0,
        'Editing the key retained an old access result.'
      );
    }
    keyCheckOutcome = 'rate_limited';
    keyCheckCode = 'key_check_cooldown';
    await access.getByRole('button', { name: 'Check key', exact: true }).click();
    await access.getByText('Wait before checking another key', { exact: true }).waitFor();
    await access.getByRole('button', { name: 'Remove key', exact: true }).click();
    assert.equal(await access.getByLabel('Mistral API key', { exact: true }).inputValue(), '');
    assert.equal(await access.locator('[data-check-status]').count(), 0);
    assert.equal(
      await access.getByRole('button', { name: 'Check key', exact: true }).isDisabled(),
      true
    );
    await access
      .getByLabel('Mistral API key', { exact: true })
      .fill('QA-placeholder-not-an-api-key');
    keyCheckOutcome = 'accepted';
    keyCheckCode = undefined;
    keyCheckDelay = 0;
    keyCheckFailure = false;
  });
  await check('staleKeyCheckCannotAttachToAnotherVendor', async () => {
    keyCheckDelay = 1200;
    await access.getByRole('button', { name: 'Check key', exact: true }).click();
    await access.getByRole('button', { name: 'Checking key…', exact: true }).waitFor();
    await access.getByRole('combobox', { name: 'Scout provider', exact: true }).selectOption('openai');
    assert.equal(await access.getByLabel('OpenAI API key', { exact: true }).inputValue(), '');
    await page.waitForTimeout(1300);
    assert.equal(
      await access.locator('[data-check-status]').count(),
      0,
      'An old vendor check was shown for the new key.'
    );
    keyCheckDelay = 0;
    await access.getByRole('combobox', { name: 'Scout provider', exact: true }).selectOption('mistral');
    await access
      .getByLabel('Mistral API key', { exact: true })
      .fill('QA-placeholder-not-an-api-key');
  });
  await check('aiAccessScoutBrand', () => checkAgentBrand(page));
  await access
    .getByRole('group', { name: 'Jev access', exact: true })
    .getByLabel('Keep this off', { exact: false })
    .check();
  assert.equal(
    await access
      .getByRole('group', { name: 'Scout access', exact: true })
      .getByLabel('Use my API key', { exact: false })
      .isChecked(),
    true
  );
  await check('transientKeyExcludedFromBrowserStorage', async () => {
    const persisted = await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
        value.includes('QA-placeholder-not-an-api-key')
      )
    );
    assert.equal(persisted, false);
  });
  await access
    .getByRole('group', { name: 'Scout access', exact: true })
    .getByLabel('Sponsored trial', { exact: false })
    .check();
  await access
    .getByRole('group', { name: 'Scout access', exact: true })
    .getByLabel('Use my API key', { exact: false })
    .check();
  assert.equal(
    await access.getByLabel('Mistral API key', { exact: true }).inputValue(),
    '',
    'Changing funding did not clear the transient API key.'
  );
  await access
    .getByRole('group', { name: 'Scout access', exact: true })
    .getByLabel('Sponsored trial', { exact: false })
    .check();
  report.checks.providerKeyClearsWithFundingChange = 'passed';
  await access
    .getByRole('group', { name: 'Jev access', exact: true })
    .getByLabel('Sponsored trial', { exact: false })
    .check();
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(
    await access.evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
    'Access dialog overflows on mobile.'
  );
  await page.screenshot({ path: resolve(output, 'warm-ai-access-360x800.png'), fullPage: true });
  await access.getByRole('button', { name: 'Use these settings', exact: true }).click();
  await access.waitFor({ state: 'hidden' });
  report.checks.independentProviderFunding = 'passed';
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.locator('.dashboard-wallet').getByText('10,000', { exact: true }).waitFor();
  await page.getByLabel('Ask Aegis', { exact: true }).fill('Review my slippage policy.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'Approve session change', exact: true }).waitFor();
  await page.locator('.agent-policy-changes').getByText('50', { exact: true }).waitFor();
  assert.equal(calls['/api/agent/approve'] ?? 0, 0, 'Chat automatically approved an intent.');
  await page.screenshot({ path: resolve(output, 'warm-chat-intent-1440x900.png'), fullPage: true });
  await page.getByRole('button', { name: 'Approve session change', exact: true }).click();
  await page
    .getByText('This step was approved. Follow its result in the workspace.', { exact: true })
    .waitFor();
  await navigationItem(workspaceNavigation(page), 'Market & execution').click();
  await page.waitForURL(origin + '/app/workspace');
  await page.getByText('ONCHAIN SNAPSHOT', { exact: true }).waitFor();
  await check('workspaceEntranceAndInteractionMotion', () => checkMotion(page, 'workspace'));
  await check('workspaceScoutBrand', () => checkAgentBrand(page));
  assert.equal(
    await page.locator('#policy-max_slippage_bps').inputValue(),
    '50',
    'Approved session edit did not reach the detail workspace.'
  );
  await capture(page, 'workspace');
  await page.setViewportSize({ width: 1440, height: 900 });
  report.checks.chatConsentAndSharedSessionPolicy = 'passed';

  await check('evidenceKeyboard', () =>
    keyboardDialog(
      page,
      page
        .locator('.assessment-card')
        .getByRole('button', { name: 'Inspect evidence', exact: true }),
      'Assessment evidence',
      'Close evidence'
    )
  );
  await page.locator('#policy-trade_size').fill('50');
  await page.getByRole('button', { name: 'Prepare & simulate', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(
    await page.locator('.trade-terms').evaluate((terms) =>
      [...terms.querySelectorAll('dd')].every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })
    ),
    true,
    'Exact sale terms overflow on mobile.'
  );
  await page.screenshot({
    path: resolve(output, 'warm-reviewed-sale-360x800.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await check('manualEvidenceKeyboard', () =>
    keyboardDialog(
      page,
      page.getByRole('button', { name: 'Trade evidence', exact: true }),
      'User requested MON reduction',
      'Close evidence'
    )
  );
  await page.locator('#policy-trade_size').fill('');
  assert.equal(
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).count(),
    0
  );
  assert.equal(
    await page.getByRole('button', { name: 'Prepare & simulate', exact: true }).isDisabled(),
    true
  );
  await page.locator('#policy-trade_size').fill('50');
  report.checks.reviewedTradeTermsAndInvalidation = 'passed';

  await navigationItem(workspaceNavigation(page), 'Overview').click();
  await page.waitForURL(origin + '/app');
  await page.getByText('This is an intercepted QA response.', { exact: false }).waitFor();
  assert.equal(
    await page.locator('.dashboard-wallet').getByText('10,000', { exact: true }).count(),
    1,
    'Wallet state did not persist across app routes.'
  );
  await page.getByLabel('Ask Aegis', { exact: true }).fill('Return an expired suggestion for QA.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page
    .getByText('This suggestion expired. Ask for a fresh review.', { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Approve session change', exact: true }).isDisabled(),
    true
  );
  report.checks.expiredIntentCannotApprove = 'passed';

  await navigationItem(workspaceNavigation(page), 'Home').click();
  await page.waitForURL(origin + '/');
  await navigationItem(
    page.getByRole('navigation', { name: 'Main navigation', exact: true }),
    'Dashboard'
  ).click();
  await page.waitForURL(origin + '/app');
  await page.getByText('This is an intercepted QA response.', { exact: false }).first().waitFor();
  assert.equal(
    await page.locator('.dashboard-wallet').getByText('10,000', { exact: true }).count(),
    1,
    'Home/Dashboard navigation lost the connected wallet.'
  );
  await page.goBack();
  await page.waitForURL(origin + '/');
  await page.goForward();
  await page.waitForURL(origin + '/app');
  await page
    .getByText('This suggestion expired. Ask for a fresh review.', { exact: true })
    .waitFor();
  report.checks.homeDashboardHistoryKeepsConversation = 'passed';

  await navigationItem(workspaceNavigation(page), 'Stress replay').click();
  await page.waitForURL(origin + '/app/workspace');
  await page
    .locator('.assessment-provenance')
    .getByText('Heuristic replay', { exact: true })
    .waitFor();
  assert.equal(
    await page.locator('.connection-context').getByText('Monad Mainnet', { exact: true }).count(),
    0,
    'Replay implies a live network connection.'
  );
  await page.locator('#replay-scenario').selectOption({ label: '5. Oversized Proposal Blocked' });
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await page.locator('.assessment-card .policy-verdict.is-blocked').waitFor();
  report.checks.replayAndBlockedPolicy = 'passed';
  await navigationItem(workspaceNavigation(page), 'Home').click();
  await page.waitForURL(origin + '/');
  await page.goBack();
  await page.waitForURL(origin + '/app/workspace');
  await page.getByRole('heading', { name: 'See the safeguards work.', exact: true }).waitFor();
  report.checks.historyNavigationKeepsSession = 'passed';
  await check('marketFailureNoticeContrast', () => checkMarketErrorContrast());

  report.captures = captures;
  report.interceptedApiRequests = calls;
  report.noPaidCalls = true;
  report.walletSigningAttempts = await page.evaluate(() => window.qaWalletSignAttempts);
  report.externalRequestsBlocked = externalRequests;
  report.pageErrors = errors;
  report.consoleErrors = consoleErrors;
  report.expectedConsoleErrors = expectedConsoleErrors;
  report.issues = issues;
  assert.equal(report.walletSigningAttempts, 0, 'QA attempted wallet signing.');
  assert.equal(externalRequests.length, 0, 'The UI attempted an unexpected external request.');
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
  assert.equal(
    consoleErrors.length,
    0,
    `Unexpected browser console errors: ${consoleErrors.join('; ')}`
  );
  assert.equal(issues.length, 0, 'Unresolved checks: ' + JSON.stringify(issues));
  writeFileSync(
    resolve(output, 'warm-report.json'),
    JSON.stringify({ status: 'passed', ...report }, null, 2)
  );
  console.log(
    'Warm UI QA passed: all three pages at seven viewports, left navigation, entrance/interaction motion, reduced motion, shared session history, chat approval/expiry, provider controls, native dialog keyboard and exact sale review. All API calls were intercepted; no paid calls or signing.'
  );
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: resolve(output, 'warm-failure.png'), fullPage: true });
  writeFileSync(
    resolve(output, 'warm-report.json'),
    JSON.stringify(
      {
        status: 'failed',
        ...report,
        captures,
        interceptedApiRequests: calls,
        pageErrors: errors,
        consoleErrors,
        expectedConsoleErrors,
        externalRequests,
        error: error.message,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ error: error.message, captures: captures.length, pageErrors: errors })
  );
  throw error;
} finally {
  await context.close();
}
