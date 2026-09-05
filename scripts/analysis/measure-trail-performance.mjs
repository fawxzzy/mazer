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
 * Two genuinely separate measurements, not one presented as the other:
 *  - trailCpuCost: geometry-build + Graphics-command-construction time for
 *    JUST the trail draw call (getTrailPerfDiagnostics' own instrumentation).
 *    A useful CPU microbenchmark, but NOT proof of full-frame smoothness --
 *    it doesn't include the rest of the scene's draw calls, the browser's
 *    own composite/paint, or anything upstream of this one call.
 *  - fullFrame: real requestAnimationFrame interval sampling (this script
 *    deliberately never calls game.loop.stop() -- the real live loop keeps
 *    running the whole time), captured once with an empty trail (baseline)
 *    and once with the long walked route visible, so the report can show
 *    the actual delta the trail adds to real frame time instead of
 *    attributing all of it to Navigation Core.
 *
 * "Zero dropped frames" is only ever claimed from fullFrame, never from
 * trailCpuCost.
 *
 * The route walk itself is deterministic (a seeded PRNG, not Math.random())
 * so repeated runs are directly comparable -- same route, same trail
 * length, same measured cost every time.
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
const FULL_FRAME_SAMPLE_DURATION_MS = 800;

// A deterministic PRNG (mulberry32), not Math.random() -- so the walked
// route, its resulting trail length, and every measurement below are the
// same on every run, making reruns directly comparable rather than
// measuring a different route each time.
const createDeterministicRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const ROUTE_RANDOM_SEED = 0xc0ffee;
const shuffled = (arr, random) => arr.map((v) => [random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

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
const walkLongRoute = async (page, targetAcceptedMoves, random) => {
  let accepted = 0;
  let attempts = 0;
  const maxAttempts = targetAcceptedMoves * 30;
  let preferredOrder = shuffled(DIRECTIONS, random);
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
      preferredOrder = shuffled(DIRECTIONS, random);
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

// Real end-to-end frame timing: samples the browser's OWN
// requestAnimationFrame callback deltas over real wall-clock time. This
// script never calls game.loop.stop() -- the real live render loop keeps
// running throughout, so these deltas are genuine full-frame intervals
// (scene update + draw + browser composite/paint), not just the trail's
// own draw-call cost. Runs entirely in-page (no Playwright round-trip per
// frame) so it doesn't itself perturb the timing it's measuring.
const collectFullFrameIntervals = (page, durationMs) => page.evaluate((duration) => (
  new Promise((resolve) => {
    const deltas = [];
    let last = null;
    const start = performance.now();
    const tick = (t) => {
      if (last !== null) {
        deltas.push(t - last);
      }
      last = t;
      if (performance.now() - start < duration) {
        requestAnimationFrame(tick);
      } else {
        resolve(deltas);
      }
    };
    requestAnimationFrame(tick);
  })
), durationMs);

const summarizeFullFrameIntervals = (deltas) => {
  if (deltas.length === 0) {
    return null;
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    sampleCount: deltas.length,
    intervalMs: {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1]
    },
    // Genuine full-frame budget misses -- scene update, draw, AND browser
    // composite/paint all included, unlike trailCpuCost's framesOverBudget.
    framesOver16_67ms: deltas.filter((d) => d > 16.67).length,
    framesOver33_33ms: deltas.filter((d) => d > 33.33).length
  };
};

// This is a CPU/command-construction microbenchmark for the trail's OWN
// draw call ONLY (geometry build + resampling + Graphics command
// construction, from getTrailPerfDiagnostics) -- it does not include the
// rest of the scene's draw calls or the browser's own composite/paint, so
// it is NOT complete frame-render time and must never be read as proof of
// full-frame smoothness or "zero dropped frames" on its own. See
// collectFullFrameIntervals/summarizeFullFrameIntervals below for the
// genuine end-to-end measurement that claim actually requires.
const summarizeTrailCpuCost = (samples) => {
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
    // frame budget," a conservative/pessimistic signal -- NOT proof of an
    // actual dropped frame. See fullFrame in the report for that.
    trailCostFramesOverBudget: samples.filter((s) => s.totalMs > 16.67).length
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

  // Baseline full-frame cost with an empty trail, BEFORE walking -- so the
  // report can show the actual delta the trail adds, rather than
  // attributing all full-frame cost to Navigation Core. The live render
  // loop is never stopped for either measurement.
  const baselineFullFrameDeltas = await collectFullFrameIntervals(page, FULL_FRAME_SAMPLE_DURATION_MS);

  // Fresh, seeded per config -- every config walks the exact same
  // deterministic route (same seed), isolating each config's own toggle
  // (viewport, Trail Fade, Trail Shine) as the only variable.
  const routeRandom = createDeterministicRandom(ROUTE_RANDOM_SEED);
  const acceptedMoves = await walkLongRoute(page, LONG_ROUTE_TARGET_ACCEPTED_MOVES, routeRandom);
  const samples = await collectFrameSamples(page, SAMPLE_FRAME_COUNT, SAMPLE_FRAME_INTERVAL_MS);
  const withTrailFullFrameDeltas = await collectFullFrameIntervals(page, FULL_FRAME_SAMPLE_DURATION_MS);

  await context.close();

  const fullFrameBaseline = summarizeFullFrameIntervals(baselineFullFrameDeltas);
  const fullFrameWithTrail = summarizeFullFrameIntervals(withTrailFullFrameDeltas);

  return {
    name: config.name,
    acceptedMoves,
    trailCpuCost: summarizeTrailCpuCost(samples),
    fullFrame: {
      baseline: fullFrameBaseline,
      withTrail: fullFrameWithTrail,
      // The trail's actual contribution to real frame time, isolated from
      // the rest of the scene's own baseline cost -- this, not
      // trailCpuCost, is what "zero dropped frames" must be judged against.
      p95DeltaMs: fullFrameBaseline && fullFrameWithTrail
        ? fullFrameWithTrail.intervalMs.p95 - fullFrameBaseline.intervalMs.p95
        : null
    },
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
      process.stderr.write(
        `${config.name}: ${result.acceptedMoves} accepted moves, `
        + `${result.trailCpuCost?.sampleCount ?? 0} trail-CPU samples, `
        + `fullFrame p95 baseline=${result.fullFrame.baseline?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms `
        + `withTrail=${result.fullFrame.withTrail?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms `
        + `delta=${result.fullFrame.p95DeltaMs?.toFixed(2) ?? 'n/a'}ms\n`
      );
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
  const anyMissingSummary = results.some((r) => r.trailCpuCost === null || r.fullFrame.baseline === null || r.fullFrame.withTrail === null);
  process.exitCode = anyErrors || anyMissingSummary ? 1 : 0;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
