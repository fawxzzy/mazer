import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  writeJson
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const PROGRESSION_STORAGE_KEY = 'mazer.progression.v1:user:runtime-diagnostics-auth-fixture';
// Single stable, non-timestamped location on C:\ATLAS -- this script clears
// and re-fills it in place on every run rather than appending a new dated
// directory, so re-running it after further Mazer changes never leaves a
// duplicate/stale gallery lying around next to the current one.
const OUTPUT_DIR = 'C:\\ATLAS\\tmp\\captures\\mazer-level-progression-gallery';
const DEFAULT_MIN_LEVEL = 1;
const DEFAULT_MAX_LEVEL = 110;
const FIXED_SEED = 1;
const VIEWPORT = Object.freeze({ width: 405, height: 958 });
const DEVICE_SCALE_FACTOR = 2;

// Mirrors legacyProgression.ts's own LEGACY_PROGRESSION_MIN_COMPLEXITY (8)
// and the level<->targetComplexity relationship in
// resolveLegacyProgressionLevel / resolveLegacyProgressionLevelBaseTargetComplexity
// exactly -- level is clamped to [1, 99] before this multiplies out, so
// requesting a level above 99 legitimately reuses level 99's own value
// (400, LEGACY_PROGRESSION_MAX_COMPLEXITY) rather than climbing further.
// This is not a shortcut in this script: it's what the shipped client
// actually does today. legacyEndlessProgression.ts already defines a
// distinct recipe for level >= LEGACY_ENDLESS_LEVEL_BOUNDARY (100), but as
// of this capture it is only consumed by legacyRemoteProgression.ts (the
// Supabase sync layer) -- MenuScene's own maze-generation path never reads
// it, so nothing the player's own screen renders differs yet between level
// 99 and level 110. This gallery captures that honestly, including the
// visible repetition, instead of hand-simulating the not-yet-wired recipe.
const LEGACY_PROGRESSION_MIN_COMPLEXITY = 8;
const LEGACY_PROGRESSION_MAX_COMPLEXITY = 400;
const resolveTargetComplexityForLevel = (level) => {
  const clampedLevel = Math.min(Math.max(level, 1), 99);
  return LEGACY_PROGRESSION_MIN_COMPLEXITY + ((clampedLevel - 1) * 4);
};

const buildCases = (minLevel, maxLevel) => Array.from({ length: maxLevel - minLevel + 1 }, (_, index) => {
  const level = minLevel + index;
  return {
    id: `level-${String(level).padStart(3, '0')}`,
    level: String(level),
    targetComplexity: resolveTargetComplexityForLevel(level),
    pastLegacyBoundary: level > 99,
    requestedSeed: FIXED_SEED
  };
});

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

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
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

const captureCase = async ({ browser, baseUrl, outputDir, testCase }) => {
  const context = await browser.newContext({
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    hasTouch: VIEWPORT.width <= 430,
    isMobile: VIEWPORT.width <= 430,
    viewport: VIEWPORT
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
  const playerTrack = diagnostics?.progression?.tracks?.player;
  const issues = [];
  if (playerTrack?.level !== testCase.level) issues.push(`level=${playerTrack?.level ?? 'missing'}`);
  if (playerTrack?.targetComplexity !== testCase.targetComplexity) {
    issues.push(`targetComplexity=${playerTrack?.targetComplexity ?? 'missing'}`);
  }

  const screenshotPath = resolve(outputDir, `${testCase.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await context.close();

  return {
    ...testCase,
    actualSeed: diagnostics?.generation?.maze?.seed ?? null,
    browserErrors: { console: consoleErrors, page: pageErrors },
    issues,
    mazeSize: diagnostics?.generation?.maze?.width ?? null,
    progression: {
      level: playerTrack?.level ?? null,
      targetComplexity: playerTrack?.targetComplexity ?? null
    },
    screenshotPath
  };
};

const main = async () => {
  const args = parseCliArgs();
  const outputDir = resolve(args.outputDir ?? OUTPUT_DIR);
  const requestedBaseUrl = normalizeBaseUrl(args.baseUrl ?? DEFAULT_BASE_URL);
  const minLevel = args.minLevel !== undefined ? Number.parseInt(args.minLevel, 10) : DEFAULT_MIN_LEVEL;
  const maxLevel = args.maxLevel !== undefined ? Number.parseInt(args.maxLevel, 10) : DEFAULT_MAX_LEVEL;
  const cases = buildCases(minLevel, maxLevel);

  // Clear the canonical directory first -- one stable gallery, never a
  // second dated copy sitting next to it.
  await rm(outputDir, { force: true, recursive: true });
  await ensureDir(outputDir);

  if (args.skipBuild !== true) runNpmCommand(['run', 'build']);

  const preview = await launchPreviewServer({
    requestedBaseUrl,
    previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS
  });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const testCase of cases) {
      results.push(await captureCase({
        browser,
        baseUrl: preview.baseUrl,
        outputDir,
        testCase
      }));
      process.stdout.write(`captured ${testCase.id} (targetComplexity=${testCase.targetComplexity})\n`);
    }
  } finally {
    await browser.close();
    await stopPreviewServer(preview.child);
  }

  const failures = results.filter((entry) => (
    entry.issues.length > 0
    || entry.browserErrors.console.length > 0
    || entry.browserErrors.page.length > 0
  ));
  const summary = {
    commitSha: getCommitSha(),
    contract: 'mazer-level-progression-gallery-v1',
    endlessProgressionNote: 'legacyEndlessProgression.ts defines a distinct recipe for level >= 100 '
      + '(LEGACY_ENDLESS_LEVEL_BOUNDARY) but is only consumed by legacyRemoteProgression.ts as of this '
      + 'capture -- the client maze-generation path (legacyProgression.ts / MenuScene) is not wired to it '
      + 'yet, so levels 100-110 render identically to level 99 (targetComplexity clamped to 400). This is '
      + 'the real, currently-shipped behavior, captured as-is.',
    fixedSeed: FIXED_SEED,
    generatedAt: new Date().toISOString(),
    levelRange: [minLevel, maxLevel],
    pass: failures.length === 0,
    caseCount: results.length,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    results
  };
  await writeJson(resolve(outputDir, 'summary.json'), summary);
  process.stdout.write(`${JSON.stringify({ ...summary, results: `[${results.length} entries, see summary.json]` }, null, 2)}\n`);

  if (!summary.pass) process.exitCode = 1;
};

await main();
