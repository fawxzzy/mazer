/**
 * Wave 4D-A: real frame-time evidence for Navigation Core v1's continuous
 * play trail (src/render/navigationCoreTrail.ts + MenuScene's
 * drawLegacyContinuousPlayTrail), against an actual built/served MenuScene
 * -- not a synthetic benchmark. Per the review correction that flagged "a
 * few dozen points" as an unmeasured performance claim, this drives the
 * real running game via the documented QA surface
 * (window.__MAZER_QA__.getTrailPerfDiagnostics(), requires
 * ?runtimeDiagnostics=1), walks a real long route, and records real
 * geometry-build/draw/total frame times across the required matrix:
 * desktop normal scale, a real 390x844 DPR3 mobile/touch viewport, Trail
 * Fade on/off, and Trail Shine on/off. (Tile size itself is always a
 * continuously computed float derived from the current viewport and maze
 * dimensions -- see resolveLegacyMazeRenderFrame -- so "compact" and
 * "fractional" tile sizes are simply whatever the smaller/odd-dimension
 * viewports below actually produce; the real measured tileSize is
 * recorded per config rather than assumed.)
 *
 * Usage: node scripts/analysis/measure-trail-performance.mjs
 * (builds and launches its own preview server unless --no-preview is
 * passed with an existing server already up on --base-url).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const DIRECTIONS = ['move_up', 'move_down', 'move_left', 'move_right'];
const LONG_ROUTE_TARGET_ACCEPTED_MOVES = 120;
const SAMPLE_FRAME_COUNT = 90;
const SAMPLE_FRAME_INTERVAL_MS = 16;

const shuffled = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

const percentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
};

// A pure-random direction each step frequently doubles back on itself --
// and the rendered trail is resolveLegacyPlayPerfectPathTrail (the
// shortest route through VISITED tiles), which deliberately collapses
// exactly that kind of backtracking (see navigationCoreTrail.ts's own
// header comment). A random walk therefore often ends up with a genuinely
// SHORT rendered trail even after many accepted moves. To actually stress
// a long visible route, keep moving in the current preferred direction
// (net progress) and only reshuffle to a new direction when the current
// one is blocked -- much closer to how a real long corridor traversal
// looks, and confirmed against this exact seed to produce a real
// 100+ px trail rather than a ~1px one.
const walkLongRoute = async (page, targetAcceptedMoves) => {
  let accepted = 0;
  let attempts = 0;
  const maxAttempts = targetAcceptedMoves * 30;
  let preferredOrder = shuffled(DIRECTIONS);
  while (accepted < targetAcceptedMoves && attempts < maxAttempts) {
    attempts += 1;
    let moved = false;
    for (const move of preferredOrder) {
      // eslint-disable-next-line no-await-in-loop
      const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
      if (result?.accepted) {
        accepted += 1;
        moved = true;
        // Keep trying the SAME direction first next time (net progress);
        // only when it fails do we fall through to the rest of this
        // shuffled order, which itself gets reshuffled below.
        preferredOrder = [move, ...preferredOrder.filter((d) => d !== move)];
        break;
      }
    }
    if (!moved) {
      // Every direction in the current order failed (a dead end/corner) --
      // reshuffle so the next attempt tries a fresh combination rather than
      // repeating the same failing order forever.
      preferredOrder = shuffled(DIRECTIONS);
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(20);
  }
  return accepted;
};

const collectFrameSamples = async (page, frameCount, intervalMs) => {
  const samples = [];
  for (let i = 0; i < frameCount; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(intervalMs);
    // eslint-disable-next-line no-await-in-loop
    const diag = await page.evaluate(() => window.__MAZER_QA__.getTrailPerfDiagnostics());
    if (diag) {
      samples.push(diag);
    }
  }
  return samples;
};

const summarizeSamples = (samples) => {
  if (samples.length === 0) {
    return null;
  }
  const totalMsSorted = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const buildMsSorted = samples.map((s) => s.geometryBuildMs).sort((a, b) => a - b);
  const drawMsSorted = samples.map((s) => s.drawMs).sort((a, b) => a - b);
  const last = samples[samples.length - 1];
  return {
    sampleCount: samples.length,
    tileSize: last.tileSize,
    vertexCountBeforeResample: last.vertexCountBeforeResample,
    vertexCountAfterResample: last.vertexCountAfterResample,
    strokeSegmentCount: last.strokeSegmentCount,
    totalLengthPx: last.totalLengthPx,
    shineEnabled: last.shineEnabled,
    trailFadeEnabled: last.trailFadeEnabled,
    geometryBuildMs: {
      p50: percentile(buildMsSorted, 0.5),
      p95: percentile(buildMsSorted, 0.95),
      max: buildMsSorted[buildMsSorted.length - 1]
    },
    drawMs: {
      p50: percentile(drawMsSorted, 0.5),
      p95: percentile(drawMsSorted, 0.95),
      max: drawMsSorted[drawMsSorted.length - 1]
    },
    totalMs: {
      p50: percentile(totalMsSorted, 0.5),
      p95: percentile(totalMsSorted, 0.95),
      max: totalMsSorted[totalMsSorted.length - 1]
    },
    // A dropped/stalled frame is judged against a 60fps budget (16.67ms) --
    // this is the trail's OWN draw-call cost, not full-frame paint time, so
    // "visible dropped frames" here really means "this alone would blow the
    // frame budget," a conservative/pessimistic signal.
    framesOverBudget: samples.filter((s) => s.totalMs > 16.67).length
  };
};

const configureViewportAndSettings = async (page, config) => {
  if (config.viewport) {
    await page.setViewportSize(config.viewport);
  }
  if (config.toggleTrailFade !== undefined || config.toggleTrailShine !== undefined) {
    await page.evaluate(({ toggleTrailFade, toggleTrailShine }) => {
      const scene = window.__MAZER_GAME__?.scene?.getScene('MenuScene');
      if (!scene) return;
      if (toggleTrailFade !== undefined) scene.settings.toggleTrailFade = toggleTrailFade;
      if (toggleTrailShine !== undefined) scene.settings.toggleTrailPulse = toggleTrailShine;
    }, { toggleTrailFade: config.toggleTrailFade, toggleTrailShine: config.toggleTrailShine });
  }
};

const runOneConfig = async (browser, baseUrl, config) => {
  const context = await browser.newContext({
    viewport: config.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: config.deviceScaleFactor ?? 1,
    isMobile: config.isMobile ?? false,
    hasTouch: config.hasTouch ?? false
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
  await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
  await page.waitForTimeout(500);

  await configureViewportAndSettings(page, config);

  const acceptedMoves = await walkLongRoute(page, LONG_ROUTE_TARGET_ACCEPTED_MOVES);
  const samples = await collectFrameSamples(page, SAMPLE_FRAME_COUNT, SAMPLE_FRAME_INTERVAL_MS);

  await context.close();

  return {
    name: config.name,
    acceptedMoves,
    summary: summarizeSamples(samples),
    consoleErrors
  };
};

const CONFIGS = [
  { name: 'desktop-normal', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'mobile-390x844-dpr3', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'compact-viewport-small-tiles', viewport: { width: 480, height: 360 }, deviceScaleFactor: 1 },
  { name: 'fractional-viewport-odd-dims', viewport: { width: 977, height: 653 }, deviceScaleFactor: 1 },
  { name: 'trail-fade-off', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, toggleTrailFade: false, toggleTrailShine: true },
  { name: 'trail-fade-on', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, toggleTrailFade: true, toggleTrailShine: true },
  { name: 'trail-shine-off', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, toggleTrailFade: true, toggleTrailShine: false },
  { name: 'trail-shine-on', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, toggleTrailFade: true, toggleTrailShine: true }
];

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outputPath = typeof args.out === 'string' ? args.out : null;

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const config of CONFIGS) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runOneConfig(browser, resolvedBaseUrl, config);
      results.push(result);
      process.stderr.write(`${config.name}: ${result.acceptedMoves} accepted moves, ${result.summary?.sampleCount ?? 0} samples\n`);
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const report = {
    generatedAtIso: new Date().toISOString(),
    repoCommit: (() => {
      try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
      } catch {
        return null;
      }
    })(),
    configs: results
  };

  const json = JSON.stringify(report, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json);
    process.stderr.write(`Wrote ${outputPath}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }

  const anyErrors = results.some((r) => r.consoleErrors.length > 0);
  const anyMissingSummary = results.some((r) => r.summary === null);
  process.exitCode = anyErrors || anyMissingSummary ? 1 : 0;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
