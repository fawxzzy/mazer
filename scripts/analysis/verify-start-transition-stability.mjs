import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  writeJson
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__';
const OUTPUT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-start-transition-stability');
const VIEWPORT = Object.freeze({ width: 405, height: 958 });

const runNpmCommand = (args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    return;
  }
  execFileSync('npm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
};

const readDiagnostics = (page) => page.evaluate((key) => {
  const value = window[key];
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}, RUNTIME_DIAGNOSTICS_KEY);

const readVisualDiagnostics = (page) => page.evaluate((key) => {
  const value = window[key];
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}, VISUAL_DIAGNOSTICS_KEY);

const runCase = async ({ baseUrl, browser, index, targetQueuedMenuRequest }) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: VIEWPORT
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const route = `/?content=core-only&theme=aurora&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=${index + 1}`;
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ runtimeKey, visualKey }) => {
    const runtime = window[runtimeKey];
    const visual = window[visualKey];
    return runtime?.surface?.mode === 'menu'
      && runtime?.surface?.overlay === 'none'
      && runtime?.generation?.drawStage?.complete === true
      && visual?.buttons?.some((button) => button.semanticAction === 'Start');
  }, { runtimeKey: RUNTIME_DIAGNOSTICS_KEY, visualKey: VISUAL_DIAGNOSTICS_KEY }, { timeout: 90_000 });

  let queuedMenuRequestObserved = false;
  if (targetQueuedMenuRequest) {
    try {
      await page.waitForFunction((key) => {
        const diagnostics = window[key];
        return diagnostics?.surface?.mode === 'menu'
          && (
            diagnostics?.generation?.pendingRequest?.mode === 'menu'
            || diagnostics?.generation?.drawStage?.lifecyclePhase === 'deconstructing'
          );
      }, RUNTIME_DIAGNOSTICS_KEY, { timeout: 45_000, polling: 25 });
      queuedMenuRequestObserved = true;
    } catch {
      // The direct-start cases still exercise the transition. A targeted case
      // that never reaches the queue is reported separately and cannot count
      // as proof of the historical stale-request race.
    }
  }

  const before = await readVisualDiagnostics(page);
  const startButton = before?.buttons?.find((button) => button.semanticAction === 'Start');
  if (!startButton?.bounds) {
    throw new Error('START_BUTTON_DIAGNOSTICS_MISSING');
  }
  await page.mouse.click(startButton.bounds.centerX, startButton.bounds.centerY);

  await page.waitForFunction((key) => window[key]?.surface?.mode === 'play', RUNTIME_DIAGNOSTICS_KEY, {
    timeout: 10_000,
    polling: 20
  });

  const samples = [];
  const sampleStartedAt = Date.now();
  while (Date.now() - sampleStartedAt < 4_000) {
    const diagnostics = await readDiagnostics(page);
    samples.push({
      atMs: Date.now() - sampleStartedAt,
      drawComplete: diagnostics?.generation?.drawStage?.complete ?? null,
      lifecycle: diagnostics?.play?.lifecycle?.phase ?? null,
      mode: diagnostics?.surface?.mode ?? null,
      pendingMode: diagnostics?.generation?.pendingRequest?.mode ?? null
    });
    await page.waitForTimeout(40);
  }

  const finalDiagnostics = await readDiagnostics(page);
  const menuRegressionSamples = samples.filter((sample) => sample.mode !== 'play');
  const staleMenuPendingSamples = samples.filter((sample) => sample.pendingMode === 'menu');
  const finalReady = finalDiagnostics?.surface?.mode === 'play'
    && finalDiagnostics?.generation?.drawStage?.complete === true
    && ['ready', 'playing'].includes(finalDiagnostics?.play?.lifecycle?.phase);
  const issues = [];
  if (targetQueuedMenuRequest && !queuedMenuRequestObserved) issues.push('queued-menu-request-not-observed');
  if (menuRegressionSamples.length > 0) issues.push('returned-to-menu-after-start');
  if (staleMenuPendingSamples.length > 0) issues.push('stale-menu-request-survived-start');
  if (!finalReady) issues.push('play-did-not-settle-ready');
  if (consoleErrors.length > 0) issues.push('console-errors');
  if (pageErrors.length > 0) issues.push('page-errors');

  await context.close();
  return {
    id: `start-${String(index + 1).padStart(2, '0')}`,
    pass: issues.length === 0,
    targetQueuedMenuRequest,
    queuedMenuRequestObserved,
    samples: samples.length,
    menuRegressionSamples: menuRegressionSamples.length,
    staleMenuPendingSamples: staleMenuPendingSamples.length,
    final: {
      drawComplete: finalDiagnostics?.generation?.drawStage?.complete ?? null,
      lifecycle: finalDiagnostics?.play?.lifecycle?.phase ?? null,
      mode: finalDiagnostics?.surface?.mode ?? null
    },
    consoleErrors,
    pageErrors,
    issues
  };
};

const args = parseCliArgs();
const cases = parseIntegerArg(args.cases, 8);
const targetedCases = Math.min(parseIntegerArg(args.targeted, 3), cases);
const requestedBaseUrl = normalizeBaseUrl(args['base-url'] ?? DEFAULT_BASE_URL);
const useExistingServer = args['no-preview'] === true || args['no-preview'] === 'true';
let previewChild = null;
let browser = null;

try {
  if (!(args['skip-build'] === true || args['skip-build'] === 'true')) {
    runNpmCommand(['run', 'build']);
  }
  let baseUrl = requestedBaseUrl;
  if (!useExistingServer) {
    const preview = await launchPreviewServer({
      requestedBaseUrl,
      previewTimeoutMs: parseIntegerArg(args['timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS)
    });
    previewChild = preview.child;
    baseUrl = preview.baseUrl;
  }

  browser = await chromium.launch({ headless: args.headless !== 'false' });
  const results = [];
  for (let index = 0; index < cases; index += 1) {
    results.push(await runCase({
      baseUrl,
      browser,
      index,
      targetQueuedMenuRequest: index < targetedCases
    }));
  }

  await ensureDir(OUTPUT_ROOT);
  const summary = {
    schema: 'mazer.start-transition-stability.v1',
    recordedAt: new Date().toISOString(),
    pass: results.every((result) => result.pass),
    cases,
    targetedCases,
    queuedMenuRequestCases: results.filter((result) => result.queuedMenuRequestObserved).length,
    returnedToMenuCases: results.filter((result) => result.menuRegressionSamples > 0).length,
    staleMenuPendingCases: results.filter((result) => result.staleMenuPendingSamples > 0).length,
    browserErrorCases: results.filter((result) => result.consoleErrors.length > 0 || result.pageErrors.length > 0).length,
    results
  };
  const summaryPath = resolve(OUTPUT_ROOT, 'summary.json');
  await writeJson(summaryPath, summary);
  process.stdout.write(`${JSON.stringify({ ...summary, results: undefined, summaryPath }, null, 2)}\n`);
  if (!summary.pass) process.exitCode = 1;
} finally {
  await browser?.close();
  await stopPreviewServer(previewChild);
}
