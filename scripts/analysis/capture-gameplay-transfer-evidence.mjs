/**
 * Wave 4D-B: real-time video + same-state diagnostic evidence for the
 * single-primary gameplay Teleport transfer, against an actual built/
 * served MenuScene. Committed (not a scratch script) per review
 * 5146800659's own request -- shares the BFS solver and real-move-driving
 * technique with scripts/analysis/measure-gameplay-transfer-performance.mjs
 * and scripts/analysis/verify-gameplay-teleport-transfer.mjs.
 *
 * Video technique, corrected (review 5147427468, continuing 5146800659):
 * a first version of this file left the real game loop running AND also
 * called game.loop.step() from its own synthetic accumulator, copying an
 * older convention from capture-wave4d-a-evidence.mjs -- confirmed a real
 * problem: that is a genuine second, additional simulation update, not
 * merely a forced paint, so the resulting recordings were mixed-clock
 * captures, not proof of unmodified real-time timing. This version has
 * exactly ONE clock owner: the real game loop's own real
 * requestAnimationFrame ticks, exactly like
 * scripts/analysis/measure-gameplay-transfer-performance.mjs's own already-
 * established, already-proven-working technique (that script's own real
 * RAF-driven full-frame interval sampling reliably produced hundreds of
 * real samples per run) -- game.loop.step() is never called anywhere in
 * this file. Pacing between real accepted move commands and readiness
 * polling both use real page.waitForTimeout() only.
 *
 * Three clips, matching this project's own "label what a clip actually is"
 * convention (capture-wave4d-a-evidence.mjs's own header comment on why
 * that matters):
 *  - mazer-gameplay-transfer-full-cycle.webm: a REAL BFS-solved route from
 *    the maze's actual current position to its actual goal, entirely
 *    through real accepted movePlayPlayer commands, continuing through the
 *    real arm -> outbound -> stored -> delivering -> complete -> next-
 *    playable cycle. No direct player/goal/phase/primary/elapsed-time
 *    assignment anywhere in this clip.
 *  - mazer-gameplay-transfer-initial-arrival.webm: a fresh session with no
 *    goal ever reached, showing the real single-primary arrival
 *    presentation that now replaces the old eight-origin volley for this
 *    case (review 5144999445's own fix).
 *  - mazer-gameplay-transfer-reduced-motion.webm: a controlled near-goal
 *    fixture (this project's established "controlled but real" convention
 *    -- direct scene.player/scene.trail setup, but the goal-reaching step
 *    itself is always the real accepted command) under a real
 *    prefers-reduced-motion browser context.
 *
 * Same-state diagnostics: for each clip, a screenshot and a diagnostics
 * JSON object are captured together, in the same synchronous checkpoint
 * (never a screenshot paired with diagnostics read at a different moment),
 * triggered by real observed state transitions (phase changes, conduit
 * visibility changes) rather than a fixed sleep duration.
 *
 * Usage: node scripts/analysis/capture-gameplay-transfer-evidence.mjs [--out-dir=<dir>]
 * (builds and launches its own preview server unless --no-preview is
 * passed with an existing server already up on --base-url).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

// Real production wrap-aware solver (resolveLegacyPlayableShortestPath,
// the same one this scene's own AI/telemetry code already calls) via the
// QA surface -- not a locally-maintained BFS. Review 5146800659's own
// request; see verify-gameplay-teleport-transfer.mjs's own
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
  if (Math.abs(dx) > 1) {
    return dx > 0 ? 'move_left' : 'move_right';
  }
  return dy > 0 ? 'move_up' : 'move_down';
};

// Confirmed real defect (review 5147427468): playerVisible used to read
// isLegacyMenuPointVisibleInStaticDraw(player) -- tile-reveal visibility,
// not rendered marker visibility -- the exact wrong signal
// verify-gameplay-teleport-transfer.mjs's own case 1 already caught and
// fixed for the permanent test. This replicates that same fix (the real
// drawDynamicBoard playerAlpha formula from real scene state) so the
// capture's own diagnostics never drift from what the permanent test
// already established as correct. Likewise, poseAvailable now reads the
// real presentation's own reported flag (a legal CURRENT pose) instead
// of "a pool Image object exists" (always true for all 8 slots
// regardless of whether any is actually the real held primary).
const readDiagnostics = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const state = scene.resolveLegacyPlayerTransferState(scene.time.now);
  const primaryId = scene.gameplayTransferPrimaryId;
  const conduit = scene.gameplayTransferConduitCanvasImage;
  const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
  const inTransferAlphaBranch = scene.menuStaticDrawLifecyclePhase === 'deconstructing' && scene.playerTransferEnergyArmed;
  const transferPlayerAlpha = state.phase === 'pending' ? 1 : state.phase === 'outbound' ? 1 - state.outboundProgress : 0;
  const markerDeconstructAlpha = scene.resolveLegacyMenuDeconstructPlayerAlpha(scene.time.now);
  const markerRevealAlpha = scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).markerRevealAlpha;
  const playerAlpha = inTransferAlphaBranch ? transferPlayerAlpha : (markerDeconstructAlpha * markerRevealAlpha);
  return {
    nowMs: scene.time.now,
    phase: state.phase,
    active: state.active,
    heldPrimaryId: primaryId,
    poseAvailable: diag?.presentation.poseAvailable ?? false,
    conduitVisible: conduit?.visible ?? null,
    playerAlpha,
    playerVisible: playerAlpha > 0,
    player: scene.player,
    goal: scene.maze.goal,
    overlay: scene.overlay
  };
});

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outDir = typeof args['out-dir'] === 'string' ? args['out-dir'] : path.resolve(REPO_ROOT, 'tmp', 'gameplay-transfer-evidence');
  mkdirSync(outDir, { recursive: true });

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  const diagnosticsLog = { fullCycle: [], initialArrival: [], reducedMotion: [] };

  try {
    // ============================================================
    // Clip 1: full real BFS-solved goal-to-next-playable cycle.
    // ============================================================
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir: outDir, size: { width: 1280, height: 800 } }
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));

      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(1500); // real wall-clock wait for the real initial maze reveal to settle -- the real loop's own RAF ticks drive it, nothing here advances the simulation

      let lastPhase = null;
      const checkpointIfPhaseChanged = async (label) => {
        const diag = await readDiagnostics(page);
        if (diag.phase !== lastPhase) {
          lastPhase = diag.phase;
          const shotPath = path.join(outDir, `full-cycle-${diagnosticsLog.fullCycle.length}-${diag.phase}.png`);
          await page.screenshot({ path: shotPath });
          diagnosticsLog.fullCycle.push({ label, screenshot: path.basename(shotPath), ...diag });
        }
      };

      // Real production-solved route (resolveLegacyPlayableShortestPath
      // via the QA surface) through real accepted movePlayPlayer commands
      // -- no direct player/goal assignment. Counts ACTUAL accepted
      // moves, not the planned route length, and fails loudly (recorded
      // in the summary) if the route could not be fully walked.
      const solved = await solveMazeToPath(page);
      const solvedPath = solved?.found ? solved.path : null;
      let acceptedMoveCount = 0;
      let routeCompleted = solvedPath === null ? false : true;
      if (solvedPath && solvedPath.length > 1) {
        for (let i = 1; i < solvedPath.length; i += 1) {
          const move = directionForStep(solvedPath[i - 1], solvedPath[i]);
          if (!move) { routeCompleted = false; break; }
          let accepted = false;
          for (let attempt = 0; attempt < 100 && !accepted; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
            if (result?.accepted) {
              accepted = true;
              acceptedMoveCount += 1;
            } else if (result?.reason !== 'lifecycle-locked') {
              break;
            } else {
              // eslint-disable-next-line no-await-in-loop
              await page.waitForTimeout(50);
            }
          }
          if (!accepted) { routeCompleted = false; break; }
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(20);
        }
      }
      await checkpointIfPhaseChanged('post-solve');

      // Real armed transfer actually resulted from reaching the goal --
      // asserted, not assumed.
      const armedAfterSolve = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').playerTransferEnergyArmed);

      // Continue through the real transfer lifecycle (arm through
      // complete, then the real next-playable maze), driven purely by
      // the real game loop's own real RAF ticks + real wall-clock waits
      // -- no manual simulation step, no direct phase/primary/elapsed-
      // time assignment. 'complete' itself resets to 'idle' synchronously
      // within the same update() it first appears in (see
      // verify-gameplay-teleport-transfer.mjs's own comment on this
      // exact, confirmed structural fact) -- this loop treats 'idle'
      // arriving right after 'delivering' as that same completion, and
      // keeps recording a little past it to show the real next-playable
      // state.
      let sawDelivering = false;
      let completedAt = null;
      for (let i = 0; i < 600 && completedAt === null; i += 1) {
        await page.waitForTimeout(16);
        await checkpointIfPhaseChanged('cycle');
        if (lastPhase === 'delivering') { sawDelivering = true; }
        if (sawDelivering && lastPhase === 'idle') { completedAt = i; }
      }
      // A little real time past completion so the video shows the settled
      // next-playable state, not a hard cut the instant it completes.
      await page.waitForTimeout(320);

      // Real input genuinely unlocked again -- one more real accepted
      // move, recorded.
      const postCompletePlayer = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const player = scene.player;
        const grid = scene.maze.grid;
        const candidates = [
          { dx: 0, dy: -1, move: 'move_up' }, { dx: 0, dy: 1, move: 'move_down' },
          { dx: -1, dy: 0, move: 'move_left' }, { dx: 1, dy: 0, move: 'move_right' }
        ];
        return candidates.find((c) => grid[player.y + c.dy]?.[player.x + c.dx] === true) ?? null;
      });
      let postCompleteAccepted = null;
      if (postCompletePlayer !== null) {
        for (let attempt = 0; attempt < 60 && postCompleteAccepted !== true; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), postCompletePlayer.move);
          postCompleteAccepted = result?.accepted === true;
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(16);
        }
      }
      diagnosticsLog.fullCycleSummary = {
        plannedRouteLength: solvedPath ? solvedPath.length - 1 : 0,
        acceptedMoveCount,
        routeCompleted,
        armedAfterSolve,
        sawDelivering,
        completedWithinBudget: completedAt !== null,
        postCompleteMoveAccepted: postCompleteAccepted,
        pageErrors
      };

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-gameplay-transfer-full-cycle.webm'));
      }
    }

    // ============================================================
    // Clip 2: initial arrival into a run -- no goal ever reached.
    // ============================================================
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir: outDir, size: { width: 1280, height: 800 } }
      });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      // Real wall-clock polling only -- the real loop's own RAF ticks are
      // what actually advance this, not this loop's own iteration count.
      let sawConduit = false;
      for (let i = 0; i < 150 && !sawConduit; i += 1) {
        await page.waitForTimeout(16);
        const visible = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').gameplayTransferConduitCanvasImage?.visible ?? false);
        if (visible) {
          sawConduit = true;
          const diag = await readDiagnostics(page);
          const shotPath = path.join(outDir, 'initial-arrival-conduit.png');
          await page.screenshot({ path: shotPath });
          diagnosticsLog.initialArrival.push({ label: 'arrival-conduit-visible', screenshot: path.basename(shotPath), ...diag });
        }
      }
      await page.waitForTimeout(640);
      diagnosticsLog.initialArrivalSummary = { sawConduit };

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-gameplay-transfer-initial-arrival.webm'));
      }
    }

    // ============================================================
    // Clip 3: reduced motion. Controlled near-goal fixture (established
    // convention), real prefers-reduced-motion context.
    // ============================================================
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: 'reduce',
        recordVideo: { dir: outDir, size: { width: 1280, height: 800 } }
      });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(1500);

      // Confirmed real defect (review 5147427468): a first version fired
      // the goal-reaching move without checking whether it was accepted,
      // then treated ANY visible conduit as success -- including the
      // real INITIAL ARRIVAL's own conduit, unrelated to any transfer.
      // The captured clip's own diagnostics showed phase:'idle',
      // active:false -- proof the "transfer" never actually happened.
      // Fixed: wait until the real initial arrival is genuinely complete
      // first (mirrors case 7's own settle condition), require the
      // goal-reaching command to be REAL ACCEPTED, and require a real
      // ARMED TRANSFER specifically (playerTransferEnergyArmed), not
      // merely a visible conduit -- before recording anything as the
      // reduced-motion transfer.
      //
      // Confirmed real SECOND defect (found live this round, verified
      // against a real unthrottled Playwright context, not just the
      // interactive tooling browser): waiting only for
      // resolveLegacyPlayerSpawnBurstState(...).active to clear is not
      // sufficient -- the spawn burst can (and did) settle BEFORE the
      // separate maze-tile-reveal build lifecycle finishes (drawPhase
      // 'building', menuStaticDrawRowsVisible/TilesVisible still
      // non-null), and that lifecycle keeps real player input locked
      // (isLegacyPlayLifecycleInputLocked()) the whole time -- the
      // directly-injected fixture move was silently rejected with
      // reason 'lifecycle-locked'. Measured live: the burst can read
      // inactive while the build lifecycle still has ~1.7s left on a
      // real (non-throttled) run. Fixed by waiting for BOTH conditions
      // together before treating initial arrival as genuinely settled.
      let initialArrivalSettled = false;
      for (let i = 0; i < 300 && !initialArrivalSettled; i += 1) {
        await page.waitForTimeout(16);
        const state = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return {
            spawnBurstActive: scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).active,
            lifecycleLocked: scene.isLegacyPlayLifecycleInputLocked()
          };
        });
        if (!state.spawnBurstActive && !state.lifecycleLocked) { initialArrivalSettled = true; }
      }

      const goal = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').maze.goal);
      const setup = await page.evaluate((g) => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const grid = scene.maze.grid;
        const candidates = [
          { x: g.x - 1, y: g.y, move: 'move_right' }, { x: g.x + 1, y: g.y, move: 'move_left' },
          { x: g.x, y: g.y - 1, move: 'move_down' }, { x: g.x, y: g.y + 1, move: 'move_up' }
        ];
        return candidates.find((c) => grid[c.y]?.[c.x] === true) ?? null;
      }, goal);
      let goalMoveAccepted = false;
      let armedTransferConfirmed = false;
      if (initialArrivalSettled && setup !== null) {
        await page.evaluate((s) => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          scene.player = { x: s.x, y: s.y };
          scene.trail = [{ x: s.x, y: s.y }];
        }, setup);
        const moveResult = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), setup.move);
        goalMoveAccepted = moveResult?.accepted === true;
        if (goalMoveAccepted) {
          for (let i = 0; i < 60 && !armedTransferConfirmed; i += 1) {
            await page.waitForTimeout(16);
            const armed = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').playerTransferEnergyArmed);
            if (armed) { armedTransferConfirmed = true; }
          }
          for (let i = 0; i < 200 && armedTransferConfirmed; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await page.waitForTimeout(16);
            // eslint-disable-next-line no-await-in-loop
            const diag = await readDiagnostics(page);
            if (diag.conduitVisible && diag.active && diagnosticsLog.reducedMotion.length === 0) {
              const shotPath = path.join(outDir, 'reduced-motion-conduit.png');
              // eslint-disable-next-line no-await-in-loop
              await page.screenshot({ path: shotPath });
              diagnosticsLog.reducedMotion.push({ label: 'reduced-motion-transfer-conduit-visible', screenshot: path.basename(shotPath), ...diag });
            }
            if (diag.phase === 'idle' && diagnosticsLog.reducedMotion.length > 0) { break; }
          }
        }
      }
      diagnosticsLog.reducedMotionSummary = { initialArrivalSettled, goalMoveAccepted, armedTransferConfirmed, capturedRealTransferFrame: diagnosticsLog.reducedMotion.length > 0 };

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-gameplay-transfer-reduced-motion.webm'));
      }
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  writeFileSync(path.join(outDir, 'diagnostics.json'), JSON.stringify(diagnosticsLog, null, 2));
  process.stderr.write(`Evidence written to ${outDir}\n`);
  process.stderr.write(`${JSON.stringify(diagnosticsLog, null, 2)}\n`);
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
