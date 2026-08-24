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
  writeJson
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const PROGRESSION_STORAGE_KEY = 'mazer.progression.v1:user:runtime-diagnostics-auth-fixture';
const DEFAULT_OUTPUT_DIR = resolve(
  STACK_ROOT,
  'tmp',
  'captures',
  'mazer-play-object-retirement-20260824'
);

const CASES = Object.freeze([
  { id: 'phone-l1-d8-s1', level: '1', targetComplexity: 8, requestedSeed: 1, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { id: 'desktop-l28-d12-s28', level: '28', targetComplexity: 12, requestedSeed: 28, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'phone-l59-d80-s3749', level: '59', targetComplexity: 80, requestedSeed: 3749, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { id: 'desktop-l60-d84-s1', level: '60', targetComplexity: 84, requestedSeed: 1, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'phone-l99-d144-s28', level: '99', targetComplexity: 144, requestedSeed: 28, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { id: 'desktop-l100-d148-s3749', level: '100', targetComplexity: 148, requestedSeed: 3749, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'phone-l1000-d236-s1', level: '1000', targetComplexity: 236, requestedSeed: 1, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { id: 'desktop-l1000-d240-s28', level: '1000', targetComplexity: 240, requestedSeed: 28, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'phone-l1000-d332-s3749', level: '1000', targetComplexity: 332, requestedSeed: 3749, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { id: 'desktop-l1000-d336-s1', level: '1000', targetComplexity: 336, requestedSeed: 1, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'desktop-l9007199254740993-d400-s3749', level: '9007199254740993', targetComplexity: 400, requestedSeed: 3749, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
]);

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

const createTrack = ({ level, targetComplexity, player }) => ({
  bestCompletionTimeMs: null,
  cleanCycles: 0,
  colorTier: 0,
  completedCycles: (BigInt(level) - 1n).toString(),
  lastCompletedAt: null,
  lastCompletionTimeMs: null,
  lastMazeSeed: null,
  lastReceiptId: null,
  lastSignal: 'hold',
  level,
  paceScore: 0,
  peakComplexity: targetComplexity,
  rank: 'E',
  recentSignals: [],
  struggleCycles: player ? Number.MAX_SAFE_INTEGER : 0,
  targetComplexity
});

const createProgressionState = ({ level, targetComplexity }) => ({
  aiRunnerBaselineVersion: 3,
  playerProgressionBaselineVersion: 5,
  tracks: {
    player: createTrack({ level, targetComplexity, player: true }),
    'ai-runner': createTrack({ level: '1', targetComplexity: 8, player: false })
  },
  updatedAt: null,
  version: 1
});

const readDiagnostics = (page) => page.evaluate((key) => {
  const value = window[key];
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}, RUNTIME_DIAGNOSTICS_KEY);

const assertCase = (testCase, diagnostics) => {
  const issues = [];
  const play = diagnostics?.play;
  const worldSemantic = diagnostics?.diagnosticsEnvelope?.schemas?.worldSemantic?.payload;
  const playerTrack = diagnostics?.progression?.tracks?.player;

  if (diagnostics?.surface?.mode !== 'play') issues.push('surface-not-play');
  if (diagnostics?.surface?.overlay !== 'none') issues.push('overlay-not-none');
  if (play?.lifecycle?.phase !== 'ready' && play?.lifecycle?.phase !== 'playing') issues.push('play-not-ready');
  if (play?.lifecycle?.inputLocked === true) issues.push('input-locked');
  if (play?.lifecycle?.playerVisible !== true) issues.push('player-not-visible');
  if (!play || Object.prototype.hasOwnProperty.call(play, 'patrol')) issues.push('raw-patrol-present');
  if (!play || Object.prototype.hasOwnProperty.call(play, 'pressure')) issues.push('raw-pressure-present');
  if (worldSemantic?.patrol !== null) issues.push('world-semantic-patrol-not-null');
  if (worldSemantic?.pressure !== null) issues.push('world-semantic-pressure-not-null');
  if (JSON.stringify(play?.worldTurn?.registeredPhases) !== JSON.stringify(['player-movement'])) {
    issues.push('world-turn-phase-drift');
  }
  if (play?.worldTurn?.timedModeEnabled !== false) issues.push('timed-mode-enabled');
  if (playerTrack?.level !== testCase.level) issues.push(`level=${playerTrack?.level ?? 'missing'}`);
  if (playerTrack?.targetComplexity !== testCase.targetComplexity) {
    issues.push(`targetComplexity=${playerTrack?.targetComplexity ?? 'missing'}`);
  }

  return issues;
};

const captureCase = async ({ browser, baseUrl, outputDir, testCase }) => {
  const context = await browser.newContext({
    deviceScaleFactor: testCase.deviceScaleFactor,
    hasTouch: testCase.viewport.width <= 430,
    isMobile: testCase.viewport.width <= 430,
    viewport: testCase.viewport
  });
  const progressionState = createProgressionState(testCase);
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: PROGRESSION_STORAGE_KEY, value: progressionState });
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

  const route = `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=${testCase.requestedSeed}`;
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((key) => {
    const diagnostics = window[key];
    const phase = diagnostics?.play?.lifecycle?.phase;
    return diagnostics?.surface?.mode === 'play'
      && diagnostics?.surface?.overlay === 'none'
      && (phase === 'ready' || phase === 'playing')
      && diagnostics?.play?.lifecycle?.playerVisible === true
      && diagnostics?.generation?.drawStage?.complete === true;
  }, RUNTIME_DIAGNOSTICS_KEY, { timeout: 90_000 });

  const diagnostics = await readDiagnostics(page);
  const issues = assertCase(testCase, diagnostics);
  const screenshotPath = resolve(outputDir, `${testCase.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await context.close();

  return {
    ...testCase,
    actualSeed: diagnostics?.generation?.maze?.seed ?? null,
    browserErrors: { console: consoleErrors, page: pageErrors },
    checks: {
      noGameplayObjects: issues.length === 0,
      issues
    },
    progression: {
      level: diagnostics?.progression?.tracks?.player?.level ?? null,
      targetComplexity: diagnostics?.progression?.tracks?.player?.targetComplexity ?? null
    },
    screenshotPath,
    worldTurn: diagnostics?.play?.worldTurn ?? null
  };
};

const main = async () => {
  const args = parseCliArgs();
  const outputDir = resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
  const requestedBaseUrl = normalizeBaseUrl(args.baseUrl ?? DEFAULT_BASE_URL);
  await ensureDir(outputDir);

  if (args.skipBuild !== true) runNpmCommand(['run', 'build']);

  const preview = await launchPreviewServer({
    requestedBaseUrl,
    previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS
  });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const testCase of CASES) {
      results.push(await captureCase({
        browser,
        baseUrl: preview.baseUrl,
        outputDir,
        testCase
      }));
    }
  } finally {
    await browser.close();
    await stopPreviewServer(preview.child);
  }

  const failures = results.filter((entry) => (
    entry.checks.noGameplayObjects !== true
    || entry.browserErrors.console.length > 0
    || entry.browserErrors.page.length > 0
  ));
  const summary = {
    contract: 'mazer-play-object-retirement-v1',
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    caseCount: results.length,
    requestedOrdinals: [...new Set(CASES.map((entry) => entry.level))],
    requestedDifficulties: [...new Set(CASES.map((entry) => entry.targetComplexity))],
    requestedSeeds: [...new Set(CASES.map((entry) => entry.requestedSeed))],
    results
  };
  await writeJson(resolve(outputDir, 'summary.json'), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!summary.pass) process.exitCode = 1;
};

await main();
