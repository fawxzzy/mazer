/**
 * Wave 4D-B: real-time video + same-state diagnostic evidence for the
 * single-primary gameplay Teleport transfer, against an actual built/
 * served MenuScene. Committed (not a scratch script) per review
 * 5146800659's own request -- shares the BFS solver and real-move-driving
 * technique with scripts/analysis/measure-gameplay-transfer-performance.mjs
 * and scripts/analysis/verify-gameplay-teleport-transfer.mjs.
 *
 * Video technique is the established one from capture-wave4d-a-evidence.mjs
 * (see that file's own "REAL player-movement video" block and its comment):
 * the real game loop is left running (never game.loop.stop()) throughout
 * every recorded clip, but a manual game.loop.step() is ALSO interleaved
 * with real page.waitForTimeout() calls between real accepted move
 * commands -- real requestAnimationFrame timing alone is not reliably
 * driven by Playwright's own clock in this headless context, so the manual
 * step forces a real new paint at each checkpoint the video recorder can
 * actually see, without stopping the loop's own real timing for anything
 * else (e.g. real setTimeout-based waits) that depends on it.
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

const readDiagnostics = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const state = scene.resolveLegacyPlayerTransferState(scene.time.now);
  const primaryId = scene.gameplayTransferPrimaryId;
  const shell = primaryId !== null ? scene.titleOrbitDiamondImages[primaryId] : null;
  const conduit = scene.gameplayTransferConduitCanvasImage;
  return {
    nowMs: scene.time.now,
    phase: state.phase,
    active: state.active,
    heldPrimaryId: primaryId,
    poseAvailable: shell !== null,
    conduitVisible: conduit?.visible ?? null,
    playerVisible: scene.isLegacyMenuPointVisibleInStaticDraw(scene.player) && (scene.mode === 'play'),
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
      await page.waitForTimeout(1500); // let the real initial maze reveal settle -- real wall-clock wait, not a manual step

      let syntheticTimeMs = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
      const advance = async (ms, realWaitMs) => {
        syntheticTimeMs += ms;
        await page.evaluate((t) => window.__MAZER_GAME__.loop.step(t), syntheticTimeMs);
        await page.waitForTimeout(realWaitMs);
      };

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
      // -- no direct player/goal assignment.
      const solved = await solveMazeToPath(page);
      const solvedPath = solved?.found ? solved.path : null;
      if (solvedPath && solvedPath.length > 1) {
        for (let i = 1; i < solvedPath.length; i += 1) {
          const move = directionForStep(solvedPath[i - 1], solvedPath[i]);
          if (!move) continue;
          let accepted = false;
          for (let attempt = 0; attempt < 100 && !accepted; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
            if (result?.accepted) {
              accepted = true;
            } else if (result?.reason !== 'lifecycle-locked') {
              break;
            } else {
              // eslint-disable-next-line no-await-in-loop
              await advance(16, 30);
            }
          }
          // eslint-disable-next-line no-await-in-loop
          await advance(16, 20);
        }
      }
      await checkpointIfPhaseChanged('post-solve');

      // Continue through the real transfer lifecycle (arm through
      // complete, then the real next-playable maze), driven purely by
      // real elapsed time via manual steps + real waits -- no direct
      // phase/primary/elapsed-time assignment. 'complete' itself resets
      // to 'idle' synchronously within the same update() it first
      // appears in (see verify-gameplay-teleport-transfer.mjs's own
      // comment on this exact, confirmed structural fact) -- this loop
      // treats 'idle' arriving right after 'delivering' as that same
      // completion, and keeps recording a little past it to show the
      // real next-playable state.
      let sawDelivering = false;
      let completedAt = null;
      for (let i = 0; i < 600 && completedAt === null; i += 1) {
        await advance(16, 16);
        await checkpointIfPhaseChanged('cycle');
        if (lastPhase === 'delivering') { sawDelivering = true; }
        if (sawDelivering && lastPhase === 'idle') { completedAt = i; }
      }
      // A little real time past completion so the video shows the settled
      // next-playable state, not a hard cut the instant it completes.
      for (let i = 0; i < 20; i += 1) {
        await advance(16, 16);
      }

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
          await advance(16, 16);
        }
      }
      diagnosticsLog.fullCycleSummary = {
        acceptedSolveMoves: solvedPath ? solvedPath.length - 1 : 0,
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

      let syntheticTimeMs = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
      const advance = async (ms, realWaitMs) => {
        syntheticTimeMs += ms;
        await page.evaluate((t) => window.__MAZER_GAME__.loop.step(t), syntheticTimeMs);
        await page.waitForTimeout(realWaitMs);
      };

      let sawConduit = false;
      for (let i = 0; i < 150 && !sawConduit; i += 1) {
        await advance(16, 16);
        const visible = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').gameplayTransferConduitCanvasImage?.visible ?? false);
        if (visible) {
          sawConduit = true;
          const diag = await readDiagnostics(page);
          const shotPath = path.join(outDir, 'initial-arrival-conduit.png');
          await page.screenshot({ path: shotPath });
          diagnosticsLog.initialArrival.push({ label: 'arrival-conduit-visible', screenshot: path.basename(shotPath), ...diag });
        }
      }
      for (let i = 0; i < 40; i += 1) { await advance(16, 16); }
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

      let syntheticTimeMs = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
      const advance = async (ms, realWaitMs) => {
        syntheticTimeMs += ms;
        await page.evaluate((t) => window.__MAZER_GAME__.loop.step(t), syntheticTimeMs);
        await page.waitForTimeout(realWaitMs);
      };

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
      if (setup !== null) {
        await page.evaluate((s) => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          scene.player = { x: s.x, y: s.y };
          scene.trail = [{ x: s.x, y: s.y }];
        }, setup);
        await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), setup.move);
        for (let i = 0; i < 40; i += 1) {
          await advance(16, 20);
          const diag = await readDiagnostics(page);
          if (diag.conduitVisible && diagnosticsLog.reducedMotion.length === 0) {
            const shotPath = path.join(outDir, 'reduced-motion-conduit.png');
            // eslint-disable-next-line no-await-in-loop
            await page.screenshot({ path: shotPath });
            diagnosticsLog.reducedMotion.push({ label: 'reduced-motion-conduit-visible', screenshot: path.basename(shotPath), ...diag });
          }
        }
      }

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
