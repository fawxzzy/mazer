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

const SAMPLE_FRAME_COUNT = 90;
const SAMPLE_FRAME_INTERVAL_MS = 16;
const FULL_FRAME_SAMPLE_DURATION_MS = 800;
// The rendered trail is resolveLegacyPlayPerfectPathTrail's shortest path
// through VISITED tiles, not raw accepted-move count -- a review correctly
// found that a preferred-direction random walk could still net-collapse to
// a near-zero rendered path (observed: 120 accepted moves producing as
// little as ~0.5px / 1 stroke segment on some viewports) if the walker
// happened to loop back near its own start through a real maze's corridors.
// "120 accepted moves" is not itself evidence of a long-route workload; the
// walk below is replaced with a deterministic BFS solve straight to the
// maze's own goal (an actual long, real route by construction, driven via
// the same real movePlayPlayer calls), and the resulting rendered length is
// asserted afterward rather than assumed.
const MIN_REQUIRED_STROKE_SEGMENTS = 20;

const percentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
};

const readMazeSnapshot = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  return { grid: scene.maze.grid, start: scene.maze.start, goal: scene.maze.goal, player: scene.player };
});

// Plain 4-directional BFS, computed in Node from the real maze grid the
// browser reports -- deterministic (no randomness at all) and, for any real
// generated maze, a genuinely long route from wherever the player currently
// stands to the maze's own goal.
const computeBfsPath = (grid, from, to) => {
  const key = (p) => `${p.x},${p.y}`;
  const queue = [from];
  const previous = new Map([[key(from), null]]);
  const deltas = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === to.x && current.y === to.y) break;
    for (const [dx, dy] of deltas) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (grid[next.y]?.[next.x] !== true) continue;
      const nextKey = key(next);
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      queue.push(next);
    }
  }
  if (!previous.has(key(to))) {
    return null;
  }
  const path = [];
  let cursor = to;
  while (cursor) {
    path.push(cursor);
    cursor = previous.get(key(cursor)) ?? null;
  }
  path.reverse();
  return path;
};

const directionForStep = (dx, dy) => {
  if (dx === 1) return 'move_right';
  if (dx === -1) return 'move_left';
  if (dy === 1) return 'move_down';
  if (dy === -1) return 'move_up';
  return null;
};

// Drives the exact solved path via real, individual movePlayPlayer calls --
// the same authoritative movement-commit boundary real input uses, not a
// direct scene.player/scene.trail assignment. Real gameplay start locks
// input (movePlayPlayer reports reason:'lifecycle-locked') until the real
// maze's own build/reveal animation settles, which for an actual generated
// maze can take longer than a fixed short wait -- retries each step (rather
// than firing once and moving on regardless) until it's actually accepted
// or a generous timeout elapses, so the walk doesn't silently no-op through
// its own startup window.
const walkPathViaRealMoves = async (page, path) => {
  let accepted = 0;
  for (let i = 1; i < path.length; i += 1) {
    const move = directionForStep(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (!move) continue;
    let stepAccepted = false;
    for (let attempt = 0; attempt < 100 && !stepAccepted; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
      if (result?.accepted) {
        stepAccepted = true;
        accepted += 1;
      } else if (result?.reason !== 'lifecycle-locked') {
        // A real, non-startup rejection (e.g. genuinely blocked) -- retrying
        // won't help; move on rather than spinning.
        break;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(50);
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(5);
  }
  return accepted;
};

// Solves and walks a real, deterministic, long route (current player ->
// maze goal); if the maze's own generation already placed the player at
// the goal (degenerate, shouldn't happen for a real generated maze), falls
// back to walking start -> goal instead so there's always a real workload.
const walkDeterministicLongRoute = async (page) => {
  const snapshot = await readMazeSnapshot(page);
  let path = computeBfsPath(snapshot.grid, snapshot.player, snapshot.goal);
  if (!path || path.length < 2) {
    path = computeBfsPath(snapshot.grid, snapshot.start, snapshot.goal);
  }
  if (!path || path.length < 2) {
    return { acceptedMoves: 0, solvedPathLength: 0 };
  }
  const acceptedMoves = await walkPathViaRealMoves(page, path);
  return { acceptedMoves, solvedPathLength: path.length - 1 };
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

  // Deterministic (a real BFS solve, not a seeded-but-still-fragile random
  // walk) and, for any real generated maze, a genuinely long route --
  // driven via real movePlayPlayer calls the same way for every config, so
  // each config's own toggle (viewport, Trail Fade, Trail Shine) is
  // isolated as the only variable.
  const { acceptedMoves, solvedPathLength } = await walkDeterministicLongRoute(page);
  const samples = await collectFrameSamples(page, SAMPLE_FRAME_COUNT, SAMPLE_FRAME_INTERVAL_MS);
  const withTrailFullFrameDeltas = await collectFullFrameIntervals(page, FULL_FRAME_SAMPLE_DURATION_MS);

  await context.close();

  const fullFrameBaseline = summarizeFullFrameIntervals(baselineFullFrameDeltas);
  const fullFrameWithTrail = summarizeFullFrameIntervals(withTrailFullFrameDeltas);
  const trailCpuCost = summarizeTrailCpuCost(samples);

  // Assert the workload actually exercised what this config claims to
  // measure, instead of reporting whatever rendered length happened to
  // result. Trail Fade ON structurally bounds the retained/rendered path
  // to its truncation window (TRAIL_FADE_TAIL, 16 points) regardless of how
  // long the walk was, so its bar is "the window is actually full," not an
  // absolute segment count; Trail Fade OFF retains full history, so a real
  // long-route workload is expected and asserted directly.
  const workload = config.toggleTrailFade
    ? {
      expectation: `Trail Fade ON: at least 16 accepted moves (fills the retained-tail window) and a non-trivial rendered path`,
      met: acceptedMoves >= 16 && (trailCpuCost?.strokeSegmentCount ?? 0) >= 3
    }
    : {
      expectation: `Trail Fade OFF: at least ${MIN_REQUIRED_STROKE_SEGMENTS} rendered stroke segments (a real long-route stress case, not a short net-displacement path)`,
      met: (trailCpuCost?.strokeSegmentCount ?? 0) >= MIN_REQUIRED_STROKE_SEGMENTS
    };

  return {
    name: config.name,
    acceptedMoves,
    solvedPathLength,
    workload,
    trailCpuCost,
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
        `${config.name}: ${result.acceptedMoves} accepted moves (solved path ${result.solvedPathLength} steps), `
        + `${result.trailCpuCost?.strokeSegmentCount ?? 0} rendered segments (${result.trailCpuCost?.totalLengthPx?.toFixed(1) ?? '?'}px), `
        + `workload ${result.workload.met ? 'OK' : 'FAILED'}, `
        + `fullFrame p95 baseline=${result.fullFrame.baseline?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms `
        + `withTrail=${result.fullFrame.withTrail?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms `
        + `delta=${result.fullFrame.p95DeltaMs?.toFixed(2) ?? 'n/a'}ms\n`
      );
      if (!result.workload.met) {
        process.stderr.write(`  WORKLOAD ASSERTION FAILED: ${result.workload.expectation}\n`);
      }
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
  const anyWorkloadNotMet = results.some((r) => !r.workload.met);
  process.exitCode = anyErrors || anyMissingSummary || anyWorkloadNotMet ? 1 : 0;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
