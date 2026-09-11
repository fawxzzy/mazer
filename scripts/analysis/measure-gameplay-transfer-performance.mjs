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
 * real transfer cycle, all inside ONE in-page requestAnimationFrame loop
 * (no Playwright round-trip per frame, so the measurement doesn't perturb
 * itself).
 *
 * Confirmed real defect (ChatGPT-assisted review 5147427468, section 4):
 * an earlier version of this script bucketed every frame by only
 * playerTransferEnergyArmed (armed vs. idle), which folded the initial
 * (never-armed) arrival burst into the SAME "idle" bucket as genuinely
 * settled idle play, and folded outbound/stored/delivering into one flat
 * "active" bucket despite those phases doing visibly different work (a
 * ramping/closing conduit draw vs. a settled glow with no conduit at
 * all). This version instead buckets every real frame into one of five
 * workload categories that match what the renderer is actually doing
 * that frame: 'initial-arrival' (the spawn-burst presentation, no
 * transfer ever armed), 'extraction' (phase 'outbound' with the conduit
 * canvas actually visible), 'stored' (phase 'stored' -- covers both the
 * ordinary settled-shell hold and the maze rebuild that happens during
 * it), 'delivery' (phase 'delivering' with the conduit canvas actually
 * visible), and 'settled-idle' (no transfer armed, no initial-arrival
 * burst active, phase 'idle'/'complete' -- genuinely nothing this
 * feature owns is on screen). Each bucket is reported and asserted on
 * separately -- an idle- or initial-arrival-dominated average is never
 * presented as "extraction performance" or "delivery performance."
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

// Which of the five real workload buckets this exact frame belongs to --
// see this file's own module doc for why these five and not a flat
// armed/idle split. Injected into the page via addInitScript (see
// installGameplayTransferPerfClassifier below) so collectBucketedFrameIntervals's
// own in-page requestAnimationFrame loop can call it with zero
// Playwright round-trips per frame; this exact source is the single copy
// -- nothing here runs in Node.
const GAMEPLAY_TRANSFER_PERF_CLASSIFY_SOURCE = `(scene) => {
  let phase = 'idle';
  try {
    phase = scene.resolveLegacyPlayerTransferState(scene.time.now).phase;
  } catch (e) {
    phase = 'unknown';
  }
  let spawnBurstActive = false;
  try {
    spawnBurstActive = scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).active === true;
  } catch (e) {
    spawnBurstActive = false;
  }
  const conduitVisible = scene.gameplayTransferConduitCanvasImage?.visible === true;
  if (spawnBurstActive) return { bucket: 'initial-arrival', phase };
  if (phase === 'outbound' && conduitVisible) return { bucket: 'extraction', phase };
  if (phase === 'stored') return { bucket: 'stored', phase };
  if (phase === 'delivering' && conduitVisible) return { bucket: 'delivery', phase };
  if (phase === 'idle' || phase === 'complete') return { bucket: 'settled-idle', phase };
  return { bucket: 'other', phase };
}`;

// Must run before any collectBucketedFrameIntervals call on this page --
// called once per fresh context in runOneConfig, right after the page is
// created.
const installGameplayTransferPerfClassifier = (page) => page.addInitScript((source) => {
  // eslint-disable-next-line no-new-func
  window.__gameplayTransferPerfClassify = new Function(`return ${source}`)();
}, GAMEPLAY_TRANSFER_PERF_CLASSIFY_SOURCE);

// Real end-to-end frame timing across a real transfer cycle: samples the
// browser's OWN requestAnimationFrame callback deltas over real wall-clock
// time, bucketed per-frame into one of the five real workload categories
// above. The live render loop is never stopped -- these deltas are
// genuine full-frame intervals (scene update + draw + browser
// composite/paint), not a synthetic microbenchmark. Runs entirely in-page
// (no Playwright round-trip per frame) so it doesn't itself perturb the
// timing it's measuring.
const collectBucketedFrameIntervals = (page, durationMs) => page.evaluate((duration) => (
  new Promise((resolve) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const buckets = { 'initial-arrival': [], extraction: [], stored: [], delivery: [], 'settled-idle': [], other: [] };
    const phasesSeen = new Set();
    let last = null;
    const start = performance.now();
    const classify = window.__gameplayTransferPerfClassify;
    const tick = (t) => {
      const { bucket, phase } = classify(scene);
      phasesSeen.add(phase);
      if (last !== null) {
        buckets[bucket].push(t - last);
      }
      last = t;
      if (performance.now() - start < duration) {
        requestAnimationFrame(tick);
      } else {
        resolve({ buckets, phasesSeen: Array.from(phasesSeen) });
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

  await installGameplayTransferPerfClassifier(page);
  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
  await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

  await configureViewport(page, config);

  // Confirmed real defect (ChatGPT-assisted review 5147427468, section 4):
  // a blind 1500ms wait did not actually guarantee the initial arrival
  // burst had settled -- on a slow config that window could still be
  // 'initial-arrival' when the baseline sample started, and since the old
  // bucketing folded that into "idle" too, the baseline itself would be
  // silently corrupted. Poll for the real settled condition instead:
  // no transfer armed AND the initial-arrival burst itself inactive.
  let settledBeforeBaseline = false;
  for (let i = 0; i < 100 && !settledBeforeBaseline; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(100);
    // eslint-disable-next-line no-await-in-loop
    const state = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      return {
        armed: scene.playerTransferEnergyArmed === true,
        spawnBurstActive: scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).active === true
      };
    });
    settledBeforeBaseline = !state.armed && !state.spawnBurstActive;
  }

  // Baseline: settled-idle full-frame cost, no transfer or initial-arrival
  // effect active at all -- the same "delta the feature adds, not the
  // whole scene attributed to it" discipline measure-trail-performance.mjs's
  // own baseline uses. Only meaningful once settledBeforeBaseline is true;
  // recorded either way so a config that never settles is visible in the
  // report rather than silently producing a corrupted baseline.
  const baselineResult = await collectBucketedFrameIntervals(page, 2000);
  const baseline = summarizeDeltas(baselineResult.buckets['settled-idle']);

  // Real, deterministic long route to the real goal -- drives a genuine
  // extraction/outbound/stored/delivering/complete cycle through real
  // accepted movePlayPlayer commands, exactly like case 2 of the
  // permanent gameplay test and measure-trail-performance.mjs's own
  // walkDeterministicLongRoute.
  const solved = await solveMazeToPath(page);
  const path = solved?.found ? solved.path : null;
  const acceptedMoves = path && path.length > 1 ? await walkPathViaRealMoves(page, path) : 0;

  const backingResolution = await readBackingResolution(page);

  // Sample continuously (bucketed into the five real workload categories
  // above) across a window long enough to span the whole real cycle.
  // Started immediately after the goal-reaching move, so the
  // arm/outbound/stored/delivering window falls inside this sample.
  const bucketed = await collectBucketedFrameIntervals(page, SAMPLE_WINDOW_MS);

  await context.close();

  const byWorkload = Object.fromEntries(
    Object.entries(bucketed.buckets).map(([name, deltas]) => [name, summarizeDeltas(deltas)])
  );
  // Extraction and delivery are the two phases this feature's own
  // conduit-draw workload is actually exercised in (see the module doc);
  // the review's own "meaningful active-effect samples" requirement is
  // scoped to those two, not to 'stored' (a settled glow, no conduit
  // draw) or 'initial-arrival' (a different clock, already covered by
  // case 7/4c of the permanent test, not this performance script's
  // concern).
  const activeEffectSampleCount = (byWorkload.extraction?.sampleCount ?? 0) + (byWorkload.delivery?.sampleCount ?? 0);

  return {
    name: config.name,
    viewport: config.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: config.deviceScaleFactor ?? 1,
    backingResolution,
    acceptedMoves,
    solvedPathLength: path ? path.length - 1 : 0,
    settledBeforeBaseline,
    sampleWindowMs: SAMPLE_WINDOW_MS,
    phasesObservedDuringSample: bucketed.phasesSeen,
    baselineSettledIdle: baseline,
    byWorkload,
    activeEffectSampleAssertion: {
      expectation: `at least ${MIN_ACTIVE_SAMPLES_REQUIRED} real frame samples across the extraction + delivery buckets combined (the two phases that actually draw the conduit), not an idle- or initial-arrival-dominated average`,
      met: activeEffectSampleCount >= MIN_ACTIVE_SAMPLES_REQUIRED
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
      const fmt = (bucket) => {
        const s = result.byWorkload[bucket];
        if (!s) return `${bucket}: n=0`;
        return `${bucket}: n=${s.sampleCount} p50=${s.intervalMs.p50.toFixed(2)}ms p95=${s.intervalMs.p95.toFixed(2)}ms max=${s.intervalMs.max.toFixed(2)}ms over33.33ms=${s.framesOver33_33ms}`;
      };
      process.stderr.write(
        `${config.name}: ${result.acceptedMoves} accepted moves (solved path ${result.solvedPathLength} steps), `
        + `settledBeforeBaseline=${result.settledBeforeBaseline}\n`
        + `  settled-idle baseline: ${fmt('settled-idle')}\n`
        + `  initial-arrival:       ${fmt('initial-arrival')}\n`
        + `  extraction:            ${fmt('extraction')}\n`
        + `  stored:                ${fmt('stored')}\n`
        + `  delivery:              ${fmt('delivery')}\n`
        + `  activeEffectSampleAssertion=${result.activeEffectSampleAssertion.met ? 'OK' : 'FAILED'}\n`
      );
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  // Confirmed real defect (ChatGPT-assisted review 5147427468, section 4):
  // repoCommit previously named a stale prior commit because this script
  // was run before the round's own source changes were committed --
  // `dist/` was correctly rebuilt from the fixed working tree, but
  // `git rev-parse HEAD` still reported the old commit, so the report
  // silently claimed to measure a build it did not. repoDirty makes that
  // gap self-evident instead of silent: a dirty tree here means this
  // report's repoCommit is NOT a reliable description of what was
  // actually measured, and the report says so plainly rather than
  // requiring the reader to separately check `git status` themselves.
  const repoCommit = (() => {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
    } catch {
      return null;
    }
  })();
  const repoDirty = (() => {
    try {
      return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT }).toString().trim().length > 0;
    } catch {
      return null;
    }
  })();

  const report = {
    generatedAtIso: new Date().toISOString(),
    repoCommit,
    repoDirty,
    provenanceWarning: repoDirty === true
      ? 'repoDirty is true: the working tree had uncommitted changes when this report was generated, so repoCommit does not fully describe the measured build. Commit first, then re-run.'
      : null,
    measurementScope: 'Real end-to-end full-frame interval sampling (scene update + draw + browser composite/paint), bucketed into five real workload categories (initial-arrival, extraction, stored, delivery, settled-idle) -- see this file\'s own module doc for why not a flat armed/idle split. No isolated CPU/geometry-build-only microbenchmark is provided for this feature (unlike the trail\'s getTrailPerfDiagnostics) -- see this file\'s own module doc for why.',
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
  const anyActiveAssertionFailed = results.some((r) => !r.activeEffectSampleAssertion.met);
  process.exitCode = anyErrors || anyActiveAssertionFailed ? 1 : 0;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
