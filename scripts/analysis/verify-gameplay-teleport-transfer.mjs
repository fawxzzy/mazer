/**
 * Wave 4D-B: permanent real-browser verification for the single-primary
 * gameplay Teleport transfer (teleportTransferPresentation.ts,
 * teleportTransferConduitCanvas.ts, and their scene integration in
 * MenuScene.ts). Drives the actual built game via Playwright -- no mock,
 * no reimplementation of the scene's own logic.
 *
 * Two complementary cases, per this project's own established convention
 * (see e.g. capture-wave4d-a-evidence.mjs): a controlled near-goal
 * fixture for fast, precise boundary checks (direct scene.player/
 * scene.trail assignment to set up a position adjacent to the goal, but
 * the goal-reaching STEP itself is always a real accepted
 * window.__MAZER_QA__.movePlayPlayer command -- never a direct phase/
 * primary/elapsed-time assignment), and one FULL solver-driven run from
 * the maze's real start to its real goal, entirely through real accepted
 * moves with no direct player/goal assignment anywhere in that case --
 * proving the whole pipeline (goal detection -> arm -> deconstruct-arm
 * primary selection -> outbound -> stored -> delivery -> complete ->
 * input unlocked again) end to end from an ordinary gameplay sequence,
 * not a shortcut into the middle of it.
 *
 * Every case also spies on the real scene.playerSpawnBurstGraphics
 * instance's own lineBetween method and asserts zero real calls during
 * Play mode. This is not redundant with the playerTransferBeamStripImages
 * checks elsewhere in this file: drawLegacyPlayerSpawnBurst is a
 * completely separate old rendering path (one procedural beam per orbit
 * sigil, drawn straight into playerSpawnBurstGraphics) that a review
 * confirmed had no mode branch and was rendering in Play mode too --
 * exactly the kind of regression an Image-pool-visibility check alone
 * cannot see (review 5144999445; verified independently before fixing).
 * Case 7 covers the specific scenario that check would have missed
 * outright: the very first maze of a run, where no transfer is ever
 * armed at all, so the old volley was the ONLY arrival visual firing.
 *
 * Usage: node scripts/analysis/verify-gameplay-teleport-transfer.mjs
 */
import { execFileSync } from 'node:child_process';
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

let passCount = 0;
let failCount = 0;
const failures = [];

const check = (label, condition, detail) => {
  if (condition) {
    passCount += 1;
    process.stderr.write(`PASS: ${label}\n`);
  } else {
    failCount += 1;
    failures.push(label);
    process.stderr.write(`FAIL: ${label} -- ${detail}\n`);
  }
};

const MOVE_FOR_DELTA = {
  '0,-1': 'move_up',
  '0,1': 'move_down',
  '-1,0': 'move_left',
  '1,0': 'move_right'
};

/** Real 4-directional BFS over the maze's own grid -- the shortest real path from start to goal, as a sequence of move_* commands. Pure Node-side computation on the maze data already fetched from the real running game; the MOVES it produces are then driven through the real movePlayPlayer command, never used to directly assign player position. */
const solveMazeToMoveSequence = (grid, start, goal) => {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const visited = grid.map((row) => row.map(() => false));
  const cameFrom = new Map();
  const key = (p) => `${p.x},${p.y}`;
  const queue = [start];
  visited[start.y][start.x] = true;
  let found = false;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === goal.x && current.y === goal.y) {
      found = true;
      break;
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) { continue; }
      if (!grid[ny][nx] || visited[ny][nx]) { continue; }
      visited[ny][nx] = true;
      cameFrom.set(key({ x: nx, y: ny }), current);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!found) {
    return null;
  }
  const path = [];
  let node = goal;
  while (!(node.x === start.x && node.y === start.y)) {
    const prev = cameFrom.get(key(node));
    path.unshift({ dx: node.x - prev.x, dy: node.y - prev.y });
    node = prev;
  }
  return path.map(({ dx, dy }) => MOVE_FOR_DELTA[`${dx},${dy}`]);
};

/** Opens a real game context/page, stops the RAF loop, and installs a manual clock-step pair (stepOnce/stepN) driving window.__MAZER_GAME__.loop.step directly -- the established workaround for the Browser pane's real RAF loop not ticking reliably under this automation. */
const openGameContext = async (browser, baseUrl, contextOptions) => {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
  await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

  // Confirmed real defect (review 5144999445): drawLegacyPlayerSpawnBurst
  // -- a SEPARATE old effect from playerTransferBeamStripImages, drawing
  // one procedural beam per orbit sigil directly into
  // playerSpawnBurstGraphics -- had no mode branch and rendered in Play
  // mode too. Checking playerTransferBeamStripImages visibility (the
  // check every earlier round of this suite used) could never have
  // caught it -- that Image pool is a different rendering path this one
  // never touches. This spy wraps the real playerSpawnBurstGraphics
  // instance's own lineBetween method (the primitive every one of that
  // volley's beams is drawn with) and counts real invocations, so a
  // regression can assert on the actual old rendering path executing,
  // not merely on the unrelated Image pool staying hidden.
  await page.evaluate(() => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const graphics = scene.playerSpawnBurstGraphics;
    window.__mazerLegacyVolleySpyCount = 0;
    const originalLineBetween = graphics.lineBetween.bind(graphics);
    graphics.lineBetween = (...args) => {
      window.__mazerLegacyVolleySpyCount += 1;
      return originalLineBetween(...args);
    };
  });

  let clockMs = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
  const stepOnce = async () => { clockMs += 16; await page.evaluate((t) => window.__MAZER_GAME__.loop.step(t), clockMs); };
  // Runs n real frame-steps inside a SINGLE page.evaluate round trip
  // (still one loop.step(t) call per real 16ms frame -- this only cuts
  // the Node<->browser round-trip count, not the number of real frames
  // simulated). Used by the completion-wait polling loops below, which
  // would otherwise pay one full round trip per single 16ms frame across
  // up to thousands of frames covering a real maze deconstruct/build/
  // reveal cycle.
  const stepBatch = async (n) => {
    const nextClockMs = await page.evaluate(({ startMs, count }) => {
      let t = startMs;
      for (let i = 0; i < count; i += 1) {
        t += 16;
        window.__MAZER_GAME__.loop.step(t);
      }
      return t;
    }, { startMs: clockMs, count: n });
    clockMs = nextClockMs;
  };
  const stepN = async (n) => { await stepBatch(n); };

  return { context, page, pageErrors, stepOnce, stepN, stepBatch };
};

/** Reads the real count of playerSpawnBurstGraphics.lineBetween calls since the spy was installed (or since the last reset) -- the forbidden old volley's own real draw primitive. */
const readLegacyVolleySpyCount = (page) => page.evaluate(() => window.__mazerLegacyVolleySpyCount ?? 0);

/** Zeroes the spy count so a case can assert on only the draw calls that happened during its own window, not everything since page load. */
const resetLegacyVolleySpyCount = (page) => page.evaluate(() => { window.__mazerLegacyVolleySpyCount = 0; });

/** Finds a real walkable neighbor of the real current goal, sets scene.player/scene.trail to it (a controlled but real fixture on GAMEPLAY POSITION -- explicitly allowed by this project's own established convention for fast boundary tests), then reaches the goal itself only via a real accepted movePlayPlayer command. Never assigns phase/primary/elapsed-time directly. */
const setupControlledNearGoalMove = async (page, stepOnce) => {
  const goal = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').maze.goal);
  const setup = await page.evaluate((g) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const grid = scene.maze.grid;
    const candidates = [
      { x: g.x - 1, y: g.y, move: 'move_right' },
      { x: g.x + 1, y: g.y, move: 'move_left' },
      { x: g.x, y: g.y - 1, move: 'move_down' },
      { x: g.x, y: g.y + 1, move: 'move_up' }
    ];
    return candidates.find((c) => grid[c.y]?.[c.x] === true) ?? null;
  }, goal);
  if (setup === null) {
    return { setup: null, moveResult: null };
  }
  await page.evaluate((s) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    scene.player = { x: s.x, y: s.y };
    scene.trail = [{ x: s.x, y: s.y }];
  }, setup);
  const moveResult = await moveUntilAccepted(page, stepOnce, setup.move);
  return { setup, moveResult };
};

/** Retries a real movePlayPlayer command until accepted or a genuine (non-lifecycle-locked) rejection -- the established readiness-signal pattern from capture-wave4d-a-evidence.mjs, used here instead of a fixed wait so setup is robust to the real maze-reveal/deconstruct/build lifecycle taking a variable amount of real time across viewports and machines. Advances the SAME manual clock as the caller's own stepOnce (passed in) so the two never drift apart. */
const moveUntilAccepted = async (page, stepOnce, move, maxAttempts = 400) => {
  let lastResult = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    lastResult = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
    if (lastResult?.accepted) {
      return lastResult;
    }
    if (lastResult?.reason !== 'lifecycle-locked') {
      return lastResult;
    }
    // eslint-disable-next-line no-await-in-loop
    await stepOnce();
  }
  return lastResult;
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS, skipBuild });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  try {
    // Real completion of one full outbound->stored->delivering->complete
    // cycle spans the WHOLE next-maze deconstruct/build/reveal animation
    // (armLegacyPlayerArrivalForFinalBuildStep only starts the delivery
    // clock on that build's final step), not a short fixed window -- so
    // the completion-wait loops below poll generously rather than assume
    // a small fixed frame count.
    // Polls state once per batch of real frames rather than once per real
    // frame -- cuts Node<->browser round trips without skipping any real
    // frame's own loop.step(t) call. 10 frames/batch * 400 batches = 4000
    // real 16ms frames (~64s of simulated time), generous headroom over
    // the real next-maze deconstruct/build/reveal cycle this waits on.
    const COMPLETION_WAIT_BATCH_SIZE = 10;
    const COMPLETION_WAIT_MAX_BATCHES = 400;

    // ================================================================
    // Case 1: controlled near-goal fixture, normal motion -- fast
    // boundary check of the real full lifecycle (armed -> outbound ->
    // stored -> delivering -> complete -> input unlocked), with the
    // real single held primary and the real single conduit, no legacy
    // eight-origin volley.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);

      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 1: found a real walkable neighbor of the goal to set up from', setup !== null, 'n/a');
      check('case 1: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        await resetLegacyVolleySpyCount(page);
        await stepN(30); // reach the real deconstruct-arm instant
        const armedState = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return {
            phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
            primaryId: scene.gameplayTransferPrimaryId,
            conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
            beamStripVisible: scene.playerTransferBeamStripImages?.some((img) => img.visible) ?? false,
            shellInContainer: scene.gameplayTransferConduitCanvasImage?.parentContainer === scene.boardZoomContainer
          };
        });
        check('case 1: a real primary was selected and held at the deconstruct-arm instant', armedState.primaryId !== null, JSON.stringify(armedState));
        check('case 1: phase reached outbound', armedState.phase === 'outbound', JSON.stringify(armedState));
        check('case 1: the real single conduit is visible', armedState.conduitVisible === true, JSON.stringify(armedState));
        check('case 1: the conduit is a real boardZoomContainer child (source masking fix)', armedState.shellInContainer === true, JSON.stringify(armedState));
        check('case 1: the OLD eight-origin beam-strip images are NOT used for a real gameplay transfer', armedState.beamStripVisible === false, JSON.stringify(armedState));

        const heldPrimaryId = armedState.primaryId;
        const trace = [];
        let completeReached = false;
        let sawDelivering = false;
        for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !completeReached; i += 1) {
          await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
          const state = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            return {
              phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
              primaryId: scene.gameplayTransferPrimaryId,
              conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
              beamStripVisible: scene.playerTransferBeamStripImages?.some((img) => img.visible) ?? false
            };
          });
          trace.push(state);
          if (state.phase === 'delivering') { sawDelivering = true; }
          // settleLegacyPlayerTransferEnergy runs earlier in the same
          // update() than the draw call this state is read from, and
          // resets armed=false the INSTANT it observes phase 'complete'
          // -- so a phase of 'complete' is never actually externally
          // observable (this is real, confirmed by reading the two call
          // sites' order in MenuScene.ts, not a polling-granularity
          // artifact). 'idle' arriving right after a real 'delivering'
          // observation IS that same completion, one tick later.
          if (state.phase === 'complete' || (sawDelivering && state.phase === 'idle')) { completeReached = true; }
        }
        check('case 1: phase progressed through stored and delivering', trace.some((s) => s.phase === 'stored') && trace.some((s) => s.phase === 'delivering'), JSON.stringify(trace.map((s) => s.phase).filter((p, i, arr) => i === 0 || arr[i - 1] !== p)));
        check('case 1: the SAME primary id was retained through the entire cycle (never a different one)', trace.every((s) => s.primaryId === null || s.primaryId === heldPrimaryId), JSON.stringify(Array.from(new Set(trace.map((s) => s.primaryId)))));
        check('case 1: the old eight-origin beam strip never became visible at any point in the whole cycle', trace.every((s) => s.beamStripVisible === false), 'n/a');
        check('case 1: conduit is closed (invisible) once the cycle genuinely completes', completeReached && !trace[trace.length - 1].conduitVisible, JSON.stringify(trace[trace.length - 1]));

        // Confirmed real defect (review 5144999445): playerTransferBeamStripImages
        // staying hidden (checked above) does NOT prove the OLD eight-origin
        // volley never rendered -- drawLegacyPlayerSpawnBurst draws a
        // completely separate set of beams directly into
        // playerSpawnBurstGraphics with no mode branch of its own. This
        // checks the real draw-call count on that graphics object's own
        // lineBetween method across the ENTIRE outbound->stored->delivering->
        // complete window, not just the moment it happens to be visible.
        const legacyVolleyDrawCalls = await readLegacyVolleySpyCount(page);
        check(
          'case 1: the OLD procedural eight-origin volley (playerSpawnBurstGraphics) never drew a single beam across the whole cycle',
          legacyVolleyDrawCalls === 0,
          `${legacyVolleyDrawCalls} real lineBetween call(s) on playerSpawnBurstGraphics`
        );

        // After completion, real input must be genuinely unlocked again --
        // prove it with one more REAL accepted move, not a state check
        // alone. Direction just needs to be legal from the real current
        // player position in the real new maze.
        const postCompletePlayer = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const player = scene.player;
          const grid = scene.maze.grid;
          const candidates = [
            { dx: 0, dy: -1, move: 'move_up' }, { dx: 0, dy: 1, move: 'move_down' },
            { dx: -1, dy: 0, move: 'move_left' }, { dx: 1, dy: 0, move: 'move_right' }
          ];
          const legal = candidates.find((c) => grid[player.y + c.dy]?.[player.x + c.dx] === true);
          return legal ?? null;
        });
        if (postCompletePlayer !== null) {
          const postCompleteResult = await moveUntilAccepted(page, stepOnce, postCompletePlayer.move, 200);
          check(
            'case 1: real input is genuinely unlocked again after completion (a real move is accepted)',
            postCompleteResult?.accepted === true,
            JSON.stringify(postCompleteResult)
          );
        }
      }

      check('case 1: no page errors across the whole sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 2: a FULL solver-driven run -- real start, real BFS-solved
    // route, every step a real accepted movePlayPlayer command, no
    // direct player/goal/phase/primary/elapsed-time assignment anywhere
    // in this case. Proves the entire pipeline from an ordinary
    // gameplay sequence, not a shortcut into the middle of it.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);

      const mazeInfo = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return { grid: scene.maze.grid, start: scene.maze.start, goal: scene.maze.goal, player: scene.player };
      });
      const moves = solveMazeToMoveSequence(mazeInfo.grid, mazeInfo.player, mazeInfo.goal);
      check('case 2: the real maze has a solvable real BFS route from the real current player position to the real goal', moves !== null && moves.length > 0, JSON.stringify({ start: mazeInfo.player, goal: mazeInfo.goal, routeLength: moves?.length ?? null }));

      if (moves !== null) {
        await resetLegacyVolleySpyCount(page);
        let acceptedCount = 0;
        for (const move of moves) {
          // eslint-disable-next-line no-await-in-loop
          const result = await moveUntilAccepted(page, stepOnce, move, 120);
          if (result?.accepted) { acceptedCount += 1; }
        }
        check('case 2: every real BFS-solved move was eventually accepted through the real command path', acceptedCount === moves.length, JSON.stringify({ accepted: acceptedCount, expected: moves.length }));

        const armedAfterSolve = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return { armed: scene.playerTransferEnergyArmed, phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase };
        });
        check('case 2: reaching the real goal via the real solved route actually armed a real transfer', armedAfterSolve.armed === true, JSON.stringify(armedAfterSolve));

        let completeReached = false;
        let sawPrimary = false;
        let sawDelivering = false;
        for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !completeReached; i += 1) {
          await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
          const state = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            return { phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase, primaryId: scene.gameplayTransferPrimaryId };
          });
          if (state.primaryId !== null) { sawPrimary = true; }
          if (state.phase === 'delivering') { sawDelivering = true; }
          // See case 1's own comment on this exact condition: 'complete'
          // resets to 'idle' synchronously within the same update() it
          // first appears in, so it is never externally observable on
          // its own -- 'idle' right after a real 'delivering' sighting
          // is that same completion.
          if (state.phase === 'complete' || (sawDelivering && state.phase === 'idle')) { completeReached = true; }
        }
        check('case 2: a real primary was selected somewhere in the real solver-driven cycle', sawPrimary, 'n/a');
        check('case 2: the real solver-driven cycle reached completion', completeReached, 'n/a');

        const legacyVolleyDrawCalls = await readLegacyVolleySpyCount(page);
        check(
          'case 2: the OLD procedural eight-origin volley never drew a single beam across the whole solver-driven cycle',
          legacyVolleyDrawCalls === 0,
          `${legacyVolleyDrawCalls} real lineBetween call(s) on playerSpawnBurstGraphics`
        );
      }

      check('case 2: no page errors across the whole real solver-driven sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 3: reduced motion -- controlled fixture (for speed), real
    // reduced-motion emulation via a real browser context flag, not a
    // scene-level monkeypatch.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });

      const reducedMotionActive = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      check('case 3: reduced motion is genuinely active for this real browser context', reducedMotionActive === true, String(reducedMotionActive));

      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 3: the real goal-reaching move was accepted under reduced motion', moveResult?.accepted === true, JSON.stringify(moveResult));

      const trace = [];
      if (setup !== null) {
        for (let i = 0; i < 60; i += 1) {
          await stepOnce();
          const state = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            return {
              phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
              conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null
            };
          });
          trace.push(state);
        }
      }
      check('case 3: reduced motion still shows a real transfer (short crossfade), not nothing', trace.some((s) => s.conduitVisible), JSON.stringify(trace.map((s) => `${s.phase}/${s.conduitVisible}`)));
      check('case 3: no page errors under reduced motion', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 4: pause mid-transfer -- controlled fixture, real
    // openPauseOverlay/RESUME_RUN QA/bridge commands.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 4: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        await stepN(28); // real primary held, conduit genuinely open

        const beforePause = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return {
            primaryId: scene.gameplayTransferPrimaryId,
            phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
            animationElapsed: scene.gameplayTransferAnimationElapsedMs
          };
        });
        const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 4: the real openPauseOverlay QA command was accepted', pauseResult?.accepted === true, JSON.stringify(pauseResult));

        // Diagnostic: capture the primary id on the very first frame after
        // pause opens, and again after 50 more paused frames, to tell
        // apart "reselected the instant the overlay opened" from
        // "drifted slowly while paused" from "only changes on resume".
        await stepOnce();
        const primaryIdJustAfterPauseOpen = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').gameplayTransferPrimaryId);
        await stepN(50);
        const duringPause = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return { overlay: scene.overlay, animationElapsed: scene.gameplayTransferAnimationElapsedMs, primaryId: scene.gameplayTransferPrimaryId };
        });
        check('case 4: pause overlay genuinely opened', duringPause.overlay === 'pause', JSON.stringify(duringPause));
        check(
          'case 4: the material animation clock genuinely freezes while paused (does not keep advancing)',
          duringPause.animationElapsed === beforePause.animationElapsed,
          JSON.stringify({ beforePause, duringPause })
        );

        const resumeDispatch = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 4: the real RESUME_RUN bridge command was accepted', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));

        // First resumed frame: no accumulated pause-time jump in the
        // material clock. Step exactly one real frame past resume and
        // confirm the elapsed delta is that one frame, not the whole
        // paused interval.
        await stepOnce();
        const afterResume = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return { overlay: scene.overlay, primaryId: scene.gameplayTransferPrimaryId, animationElapsed: scene.gameplayTransferAnimationElapsedMs };
        });
        check('case 4: pause overlay genuinely closed again after RESUME_RUN', afterResume.overlay === 'none', JSON.stringify(afterResume));
        check(
          'case 4: the held primary survived the pause/resume cycle unchanged',
          afterResume.primaryId === beforePause.primaryId,
          JSON.stringify({
            beforePause: beforePause.primaryId,
            justAfterPauseOpen: primaryIdJustAfterPauseOpen,
            duringPause: duringPause.primaryId,
            afterResume: afterResume.primaryId
          })
        );
        const deltaMs = afterResume.animationElapsed - duringPause.animationElapsed;
        check(
          'case 4: the material clock advances by roughly one real frame after resume, not the whole paused interval',
          deltaMs >= 0 && deltaMs < 200,
          JSON.stringify({ duringPauseElapsed: duringPause.animationElapsed, afterResumeElapsed: afterResume.animationElapsed, deltaMs })
        );
      }

      check('case 4: no page errors across the pause/resume sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 5: compact/touch-emulated layout -- a real narrow viewport
    // with a real touch-capable context, controlled fixture for speed.
    // Proves the transfer cycle still completes and the conduit/shell
    // stay geometrically aligned at a real different mazeTileSize.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 5: the real goal-reaching move was accepted on the compact/touch layout', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        let completeReached = false;
        let sawAlignedConduit = false;
        let sawDelivering = false;
        for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !completeReached; i += 1) {
          await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
          const state = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            const image = scene.gameplayTransferConduitCanvasImage;
            return {
              phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
              conduitVisible: image?.visible ?? null,
              conduitInContainer: image?.parentContainer === scene.boardZoomContainer,
              conduitWidth: image?.displayWidth ?? 0,
              conduitHeight: image?.displayHeight ?? 0
            };
          });
          if (state.conduitVisible && state.conduitInContainer && state.conduitWidth > 0 && state.conduitHeight > 0) {
            sawAlignedConduit = true;
          }
          if (state.phase === 'delivering') { sawDelivering = true; }
          // See case 1's own comment: 'complete' is never externally
          // observable on its own (settleLegacyPlayerTransferEnergy
          // resets it to 'idle' synchronously within the same frame it
          // first appears in).
          if (state.phase === 'complete' || (sawDelivering && state.phase === 'idle')) { completeReached = true; }
        }
        check('case 5: the conduit rendered with real positive size while open on the compact layout', sawAlignedConduit, 'n/a');
        check('case 5: the transfer cycle reached completion on the compact/touch layout', completeReached, 'n/a');
      }
      check('case 5: no page errors on the compact/touch layout', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 6: a real non-identity boardZoomContainer transform.
    // boardZoomContainer is, as of this writing, always identity-scale
    // through every real UI path in this codebase (no board-zoom
    // command exists in uiCommands.ts) -- so this case forces a
    // non-identity transform directly on the container, a controlled
    // but real fixture on a RENDERING-config field, not gameplay
    // state, mirroring the convention already established for this
    // exact container in the shell-positioning work this transfer
    // system reuses. It proves conduit/shell world-space alignment
    // survives a real non-identity parent transform, not just the
    // identity case every other scenario in this file happens to run
    // under.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.boardZoomContainer.setScale(1.6);
        scene.boardZoomContainer.setPosition(37, -19);
      });
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 6: the real goal-reaching move was accepted under a non-identity container transform', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        await stepN(28);
        const worldCheck = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const primaryId = scene.gameplayTransferPrimaryId;
          const shell = primaryId !== null ? scene.titleOrbitDiamondImages[primaryId] : null;
          const conduit = scene.gameplayTransferConduitCanvasImage;
          return {
            containerScaleX: scene.boardZoomContainer.scaleX,
            conduitVisible: conduit?.visible ?? null,
            conduitWorld: conduit ? (() => { const m = conduit.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; })() : null,
            shellVisible: shell?.visible ?? null,
            shellWorld: shell ? (() => { const m = shell.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; })() : null
          };
        });
        check('case 6: the container transform is genuinely non-identity for this check', Math.abs(worldCheck.containerScaleX - 1.6) < 0.001, JSON.stringify(worldCheck));
        check('case 6: the conduit is visible and has a real world position under the non-identity transform', worldCheck.conduitVisible === true && worldCheck.conduitWorld !== null, JSON.stringify(worldCheck));
        check('case 6: the real held shell slot is visible with a real world position under the non-identity transform', worldCheck.shellVisible === true && worldCheck.shellWorld !== null, JSON.stringify(worldCheck));
      }
      check('case 6: no page errors under the non-identity container transform', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 7: initial entry into a run -- the very first maze reveal,
    // with NO goal ever reached and so no teleport transfer ever armed.
    // Confirmed real defect (review 5144999445): the old eight-origin
    // volley (drawLegacyPlayerSpawnBurst) had no mode branch and fired
    // for this exact case too, since armLegacyPlayerArrivalForFinalBuildStep
    // arms playerSpawnBurstStartedAtMs on every settled maze build, not
    // only when a transfer was armed. Proves BOTH halves of the fix: the
    // old volley never draws here either, AND a real single-primary
    // arrival presentation genuinely renders something (not silence --
    // hiding the old burst without a real replacement was explicitly
    // flagged as its own possible regression).
    // ================================================================
    {
      const { context, page, pageErrors, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await resetLegacyVolleySpyCount(page);
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      // Same generous batched-polling budget as the completion-wait
      // loops elsewhere in this file -- the initial reveal's own real
      // deconstruct/build/reveal timing is not assumed to be short.
      let sawRealArrivalConduit = false;
      let sawRealArrivalPrimary = false;
      let sawArmedTransfer = false;
      for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !(sawRealArrivalConduit && sawRealArrivalPrimary); i += 1) {
        await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
        const state = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return {
            transferActive: scene.playerTransferEnergyArmed,
            primaryId: scene.gameplayTransferPrimaryId,
            conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null
          };
        });
        if (state.transferActive === true) { sawArmedTransfer = true; }
        if (state.conduitVisible === true) { sawRealArrivalConduit = true; }
        if (state.primaryId !== null) { sawRealArrivalPrimary = true; }
      }

      check('case 7: no real transfer was ever armed (this case never reaches a goal)', sawArmedTransfer === false, 'n/a');
      check('case 7: a real single-primary arrival conduit rendered during the very first maze reveal, with no transfer ever armed', sawRealArrivalConduit, 'n/a');
      check('case 7: a real primary was actually selected for the initial arrival (not a fabricated/absent presentation)', sawRealArrivalPrimary, 'n/a');

      const legacyVolleyDrawCalls = await readLegacyVolleySpyCount(page);
      check(
        'case 7: the OLD procedural eight-origin volley never drew a single beam during initial entry into a run',
        legacyVolleyDrawCalls === 0,
        `${legacyVolleyDrawCalls} real lineBetween call(s) on playerSpawnBurstGraphics`
      );
      check('case 7: no page errors during initial entry', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  process.stderr.write(`\n${passCount}/${passCount + failCount} checks passed.\n`);
  if (failCount > 0) {
    process.stderr.write(`FAILED: ${failures.join('; ')}\n`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
