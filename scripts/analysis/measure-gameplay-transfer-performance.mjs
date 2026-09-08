/**
 * Wave 4D-B: real frame-time evidence for the single-primary gameplay
 * Teleport transfer (src/render/teleportTransferConduitCanvas.ts +
 * MenuScene's applyLegacyGameplayTransferPresentation), against an actual
 * built/served MenuScene -- not a synthetic benchmark. Mirrors
 * measure-trail-performance.mjs's own established technique exactly (real
 * requestAnimationFrame interval sampling, the live render loop NEVER
 * stopped, a real BFS-solved route driven through real accepted
 * movePlayPlayer commands): this script never calls game.loop.stop().
 *
 * Unlike the trail (which is continuously present once walked, so a flat
 * "withTrail" sampling window works), the transfer's own active window is
 * bounded (armed -> outbound -> stored -> delivering -> complete, then
 * idle again) -- so this script samples continuously through and past a
 * real transfer cycle and buckets every real frame delta by whether
 * playerTransferEnergyArmed was true at that instant, all inside ONE
 * in-page requestAnimationFrame loop (no Playwright round-trip per frame,
 * so the measurement doesn't perturb itself). The idle bucket and the
 * active bucket are reported and asserted on separately -- an
 * idle-dominated average is never presented as "transfer performance."
 *
 * This measures real END-TO-END full-frame cost (scene update + draw +
 * browser composite/paint), the same genuine signal
 * measure-trail-performance.mjs's own fullFrame measures. Unlike the
 * trail, the conduit has no existing isolated CPU/geometry-build-only
 * diagnostic hook analogous to getTrailPerfDiagnostics() -- adding one
 * would be new production instrumentation with no test-driven need behind
 * it, so this script does not add one; the module doc and the report
 * itself disclose that an isolated CPU-only breakdown (separate from
 * full-frame) is not provided here, only the genuine full-frame cost is.
 *
 * Usage: node scripts/analysis/measure-gameplay-transfer-performance.mjs
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

// Long enough to reliably span a full real transfer cycle (arm through
// complete) even on the slower compact/touch config -- the review's own
// demand ("collect enough completed cycles to include meaningful
// active-effect samples") requires this to not be a short guess.
const SAMPLE_WINDOW_MS = 20_000;
const MIN_ACTIVE_SAMPLES_REQUIRED = 15;

const percentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
};

const summarizeDeltas = (deltas) => {
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
    framesOver16_67ms: deltas.filter((d) => d > 16.67).length,
    framesOver33_33ms: deltas.filter((d) => d > 33.33).length
  };
};

// Real production wrap-aware solver (resolveLegacyPlayableShortestPath,
// the same one this scene's own AI/telemetry code already calls) via the
// QA surface -- not a locally-maintained BFS. Review 5146800659's own
// request. See verify-gameplay-teleport-transfer.mjs's own
// pathToMoveSequence for the wrap-direction sign-inference reasoning this
// mirrors exactly.
const solveMazeToPath = (page) => page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());

const directionForStep = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    if (dx === 1) return 'move_right';
    if (dx === -1) return 'move_left';
    if (dy === 1) return 'move_down';
    if (dy === -1) return 'move_up';
    return null;
  }
  // A wrapped step: the real direction is the OPPOSITE sign of whichever
  // axis actually wrapped (resolveWrappedGridPoint's own real behavior).
  if (Math.abs(dx) > 1) {
    return dx > 0 ? 'move_left' : 'move_right';
  }
  return dy > 0 ? 'move_up' : 'move_down';
};

const walkPathViaRealMoves = async (page, path) => {
  let accepted = 0;
  for (let i = 1; i < path.length; i += 1) {
    const move = directionForStep(path[i - 1], path[i]);
    if (!move) continue;
    let stepAccepted = false;
    for (let attempt = 0; attempt < 100 && !stepAccepted; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
      if (result?.accepted) {
        stepAccepted = true;
        accepted += 1;
      } else if (result?.reason !== 'lifecycle-locked') {
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

// Real end-to-end frame timing across a real transfer cycle: samples the
// browser's OWN requestAnimationFrame callback deltas over real wall-clock
// time, bucketed per-frame by whether a real transfer is armed at that
// instant. The live render loop is never stopped -- these deltas are
// genuine full-frame intervals (scene update + draw + browser
// composite/paint), not a synthetic microbenchmark. Runs entirely in-page
// (no Playwright round-trip per frame) so it doesn't itself perturb the
// timing it's measuring.
const collectBucketedFrameIntervals = (page, durationMs) => page.evaluate((duration) => (
  new Promise((resolve) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const activeDeltas = [];
    const idleDeltas = [];
    let phasesSeen = new Set();
    let last = null;
    const start = performance.now();
    const tick = (t) => {
      const armed = scene.playerTransferEnergyArmed === true;
      let phase = 'idle';
      try {
        phase = scene.resolveLegacyPlayerTransferState(scene.time.now).phase;
      } catch {
        phase = 'unknown';
      }
      phasesSeen.add(phase);
      if (last !== null) {
        const delta = t - last;
        (armed ? activeDeltas : idleDeltas).push(delta);
      }
      last = t;
      if (performance.now() - start < duration) {
        requestAnimationFrame(tick);
      } else {
        resolve({ activeDeltas, idleDeltas, phasesSeen: Array.from(phasesSeen) });
      }
    };
    requestAnimationFrame(tick);
  })
), durationMs);

const configureViewport = async (page, config) => {
  if (config.viewport) {
    await page.setViewportSize(config.viewport);
  }
};

const readBackingResolution = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const image = scene.gameplayTransferConduitCanvasImage;
  const texture = image?.texture;
  const source = texture?.source?.[0];
  return {
    devicePixelRatio: window.devicePixelRatio,
    canvasBackingWidth: source?.width ?? null,
    canvasBackingHeight: source?.height ?? null
  };
});

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
  await page.waitForTimeout(1500); // let the real initial maze reveal settle

  await configureViewport(page, config);

  // Baseline: idle full-frame cost, no transfer active at all -- the same
  // "delta the feature adds, not the whole scene attributed to it"
  // discipline measure-trail-performance.mjs's own baseline uses.
  const baselineResult = await collectBucketedFrameIntervals(page, 2000);
  const baseline = summarizeDeltas(baselineResult.idleDeltas);

  // Real, deterministic long route to the real goal -- drives a genuine
  // extraction/outbound/stored/delivering/complete cycle through real
  // accepted movePlayPlayer commands, exactly like case 2 of the
  // permanent gameplay test and measure-trail-performance.mjs's own
  // walkDeterministicLongRoute.
  const solved = await solveMazeToPath(page);
  const path = solved?.found ? solved.path : null;
  const acceptedMoves = path && path.length > 1 ? await walkPathViaRealMoves(page, path) : 0;

  const backingResolution = await readBackingResolution(page);

  // Sample continuously (bucketed by real armed state) across a window
  // long enough to span the whole real cycle. Started immediately after
  // the goal-reaching move, so the arm/outbound/stored/delivering window
  // falls inside this sample.
  const bucketed = await collectBucketedFrameIntervals(page, SAMPLE_WINDOW_MS);

  await context.close();

  const active = summarizeDeltas(bucketed.activeDeltas);
  const idle = summarizeDeltas(bucketed.idleDeltas);

  return {
    name: config.name,
    viewport: config.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: config.deviceScaleFactor ?? 1,
    backingResolution,
    acceptedMoves,
    solvedPathLength: path ? path.length - 1 : 0,
    sampleWindowMs: SAMPLE_WINDOW_MS,
    phasesObservedDuringSample: bucketed.phasesSeen,
    baselineIdle: baseline,
    duringCycle: { active, idle },
    activeSampleAssertion: {
      expectation: `at least ${MIN_ACTIVE_SAMPLES_REQUIRED} real frame samples with a transfer genuinely armed (not an idle-dominated average)`,
      met: (active?.sampleCount ?? 0) >= MIN_ACTIVE_SAMPLES_REQUIRED
    },
    consoleErrors
  };
};

const CONFIGS = [
  { name: 'desktop-normal', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'mobile-390x844-dpr3', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
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
        + `active samples=${result.duringCycle.active?.sampleCount ?? 0} `
        + `(p50=${result.duringCycle.active?.intervalMs.p50?.toFixed(2) ?? 'n/a'}ms `
        + `p95=${result.duringCycle.active?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms `
        + `max=${result.duringCycle.active?.intervalMs.max?.toFixed(2) ?? 'n/a'}ms `
        + `framesOver33.33ms=${result.duringCycle.active?.framesOver33_33ms ?? 'n/a'}), `
        + `idle baseline p95=${result.baselineIdle?.intervalMs.p95?.toFixed(2) ?? 'n/a'}ms, `
        + `activeSampleAssertion=${result.activeSampleAssertion.met ? 'OK' : 'FAILED'}\n`
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
    measurementScope: 'Real end-to-end full-frame interval sampling (scene update + draw + browser composite/paint), bucketed by whether a real gameplay transfer is armed. No isolated CPU/geometry-build-only microbenchmark is provided for this feature (unlike the trail\'s getTrailPerfDiagnostics) -- see this file\'s own module doc for why.',
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
  const anyActiveAssertionFailed = results.some((r) => !r.activeSampleAssertion.met);
  process.exitCode = anyErrors || anyActiveAssertionFailed ? 1 : 0;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
