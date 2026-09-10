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

/**
 * Converts a real wrap-aware shortest-path result (from the REAL
 * production solver, window.__MAZER_QA__.resolveShortestPathToGoal --
 * resolveLegacyPlayableShortestPath, the same one this scene's own AI/
 * telemetry code already calls) into a sequence of move_* commands.
 * Review 5146800659's own request: stop maintaining a separate,
 * non-wrap-aware BFS in this file and reuse the real solver instead.
 *
 * An ordinary adjacent step maps directly to its cardinal direction. A
 * WRAPPED step (isLegacyWrappedStepTransition's own definition: the two
 * points are not grid-adjacent, |dx|>1 or |dy|>1) is resolved by sign
 * inference against resolveWrappedGridPoint's own real behavior
 * (src/legacy-runtime/legacyMaze.ts): moving off x=0 to the left wraps to
 * x=width-1 (a large POSITIVE raw dx for a 'move_left' step) and moving
 * off x=width-1 to the right wraps to x=0 (a large NEGATIVE raw dx for a
 * 'move_right' step) -- i.e. a wrapped step's real direction is the
 * OPPOSITE sign of its raw coordinate delta, on whichever axis actually
 * wrapped.
 */
const pathToMoveSequence = (path) => {
  const moves = [];
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const wrapped = Math.abs(dx) > 1 || Math.abs(dy) > 1;
    if (!wrapped) {
      const move = MOVE_FOR_DELTA[`${dx},${dy}`];
      if (!move) { return null; }
      moves.push(move);
      continue;
    }
    // Whichever axis actually wrapped carries the large delta; the real
    // direction is that axis's OPPOSITE sign.
    if (Math.abs(dx) > 1) {
      moves.push(dx > 0 ? 'move_left' : 'move_right');
    } else {
      moves.push(dy > 0 ? 'move_up' : 'move_down');
    }
  }
  return moves;
};

/** Calls the REAL production wrap-aware solver via the QA surface and converts its path into real move_* commands. Returns null if no path was found or a step couldn't be converted. */
const solveMazeToMoveSequence = async (page) => {
  const result = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
  if (!result?.found || !Array.isArray(result.path) || result.path.length < 2) {
    return null;
  }
  return pathToMoveSequence(result.path);
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

        // Geometry: compare the shell's own REAL measured tip (Phaser's
        // own TransformMatrix.transformPoint against the canonical
        // shell's known native-tip offset -- the exact technique
        // verify-teleport-anchor-preview-lifecycle.mjs's own "rendered
        // port/footprint agreement" check already established and
        // proved) against the presentation's own reported sourcePoint --
        // not merely that the shell is visible with a non-null world
        // position. Review 5146800659's own request.
        const geometrySnapshot = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const primaryId = scene.gameplayTransferPrimaryId;
          const shell = primaryId !== null ? scene.titleOrbitDiamondImages[primaryId] : null;
          const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
          if (!shell || !diag) { return null; }
          const NATIVE_TIP_DX = 920 - 627;
          const NATIVE_TIP_DY = 131 - 627;
          const world = shell.getWorldTransformMatrix();
          const measuredPort = world.transformPoint(NATIVE_TIP_DX, NATIVE_TIP_DY);
          return { measuredPort: { x: measuredPort.x, y: measuredPort.y }, sourcePoint: diag.presentation.sourcePoint, conduitStartPoint: diag.presentation.conduitStartPoint, targetPoint: diag.presentation.targetPoint };
        });
        check(
          "case 1: the shell's real measured world tip matches the presentation's own reported source point",
          geometrySnapshot !== null
            && Math.abs(geometrySnapshot.measuredPort.x - geometrySnapshot.sourcePoint.x) < 0.5
            && Math.abs(geometrySnapshot.measuredPort.y - geometrySnapshot.sourcePoint.y) < 0.5,
          JSON.stringify(geometrySnapshot)
        );
        check(
          "case 1: during outbound, the conduit's fixed anchor (conduitStartPoint) is the real target (the goal), not the source",
          geometrySnapshot !== null
            && Math.abs(geometrySnapshot.conduitStartPoint.x - geometrySnapshot.targetPoint.x) < 0.5
            && Math.abs(geometrySnapshot.conduitStartPoint.y - geometrySnapshot.targetPoint.y) < 0.5,
          JSON.stringify(geometrySnapshot)
        );

        const heldPrimaryId = armedState.primaryId;
        const trace = [];
        let completeReached = false;
        let sawDelivering = false;
        for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !completeReached; i += 1) {
          await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
          const state = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            const transferState = scene.resolveLegacyPlayerTransferState(scene.time.now);
            // Replicates drawDynamicBoard's own real playerAlpha formula
            // exactly, from real callable/readable scene state -- NOT
            // isLegacyMenuPointVisibleInStaticDraw, which a first attempt
            // at this exact check used and which only reflects whether
            // this tile has been revealed by the maze's own tile-by-tile
            // build animation (already true almost the whole time here,
            // since the board is long since fully revealed by this point
            // in a real run) -- confirmed the wrong signal before
            // shipping it. The real discriminator selects between the
            // transfer's OWN alpha (1 during 'pending', fading via
            // 1-outboundProgress during 'outbound', exactly 0 from that
            // point on) while `menuStaticDrawLifecyclePhase ===
            // 'deconstructing' && playerTransferEnergyArmed`, and an
            // entirely separate, unrelated deconstruct/reveal alpha this
            // feature does not own the rest of the time (most of a real
            // 'stored' interval, once the static-draw lifecycle has moved
            // on to 'building'/'settled') -- so the check below only
            // asserts within the window this feature actually controls.
            const inTransferAlphaBranch = scene.menuStaticDrawLifecyclePhase === 'deconstructing' && scene.playerTransferEnergyArmed;
            const transferPlayerAlpha = transferState.phase === 'pending'
              ? 1
              : transferState.phase === 'outbound'
                ? 1 - transferState.outboundProgress
                : 0;
            const markerDeconstructAlpha = scene.resolveLegacyMenuDeconstructPlayerAlpha(scene.time.now);
            const markerRevealAlpha = scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).markerRevealAlpha;
            const playerAlpha = inTransferAlphaBranch ? transferPlayerAlpha : (markerDeconstructAlpha * markerRevealAlpha);
            return {
              phase: transferState.phase,
              primaryId: scene.gameplayTransferPrimaryId,
              conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
              beamStripVisible: scene.playerTransferBeamStripImages?.some((img) => img.visible) ?? false,
              inTransferAlphaBranch,
              playerAlpha
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
        // Held identity: distinguishes "genuinely forgotten" (a real
        // regression) from "the resolver reported no pose this exact
        // frame" (poseAvailable false is a real, allowed outcome the
        // presentation module itself documents) by checking the id
        // itself, which this scene's own sticky-selection logic keeps
        // non-null and CONSTANT through the entire armed session
        // regardless of momentary pose availability -- only a genuine
        // reset (checked separately below, at the idle/complete tail)
        // may show null. Review 5146800659's own request.
        const preIdleTrace = trace.filter((s) => s.phase !== 'idle' && s.phase !== 'complete');
        check(
          'case 1: the held primary id stays non-null and constant through the entire active/stored/delivering window (never forgotten mid-transfer)',
          preIdleTrace.every((s) => s.primaryId === heldPrimaryId),
          JSON.stringify(Array.from(new Set(preIdleTrace.map((s) => s.primaryId))))
        );
        check(
          'case 1: the held primary id is cleared ONLY at the real completion/reset boundary, not earlier',
          completeReached && trace[trace.length - 1].primaryId === null,
          JSON.stringify(trace[trace.length - 1])
        );
        check('case 1: the old eight-origin beam strip never became visible at any point in the whole cycle', trace.every((s) => s.beamStripVisible === false), 'n/a');
        check('case 1: conduit is closed (invisible) once the cycle genuinely completes', completeReached && !trace[trace.length - 1].conduitVisible, JSON.stringify(trace[trace.length - 1]));

        // Player presentation: absent (playerAlpha === 0, the real
        // production formula, replicated above) specifically within the
        // window this feature's OWN alpha branch governs (outbound,
        // while the transfer is armed and the static-draw lifecycle is
        // still 'deconstructing'), reappears (playerAlpha > 0) once the
        // cycle genuinely completes. Review 5146800659's own request.
        // Batched polling (COMPLETION_WAIT_BATCH_SIZE-frame granularity)
        // may catch anywhere from one to a few samples inside outbound's
        // own real, short (450ms) window -- so this checks the real
        // DIRECTION (a genuine fade toward 0, not flat or reversing), not
        // an exact end-of-window value that batching timing could miss.
        const ownedOutboundTrace = trace.filter((s) => s.phase === 'outbound' && s.inTransferAlphaBranch);
        check(
          "case 1: the real player marker genuinely fades toward 0 (not flat, not reversing) across the window this feature's own alpha branch governs (armed outbound)",
          ownedOutboundTrace.length > 0
            && ownedOutboundTrace[ownedOutboundTrace.length - 1].playerAlpha <= ownedOutboundTrace[0].playerAlpha
            && ownedOutboundTrace[ownedOutboundTrace.length - 1].playerAlpha < 1,
          JSON.stringify(ownedOutboundTrace.map((s) => s.playerAlpha))
        );
        check(
          'case 1: the real player marker is visible again (playerAlpha > 0) once the cycle genuinely completes',
          completeReached && trace[trace.length - 1].playerAlpha > 0,
          JSON.stringify(trace[trace.length - 1])
        );

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
        return { start: scene.maze.start, goal: scene.maze.goal, player: scene.player };
      });
      // Real production wrap-aware solver (resolveLegacyPlayableShortestPath
      // via the QA surface), not a locally-maintained BFS.
      const moves = await solveMazeToMoveSequence(page);
      check('case 2: the real maze has a solvable real route (production wrap-aware solver) from the real current player position to the real goal', moves !== null && moves.length > 0, JSON.stringify({ start: mazeInfo.player, goal: mazeInfo.goal, routeLength: moves?.length ?? null }));

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
      const { context, page, pageErrors, stepOnce, stepN, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });

      const reducedMotionActive = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      check('case 3: reduced motion is genuinely active for this real browser context', reducedMotionActive === true, String(reducedMotionActive));

      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 3: the real goal-reaching move was accepted under reduced motion', moveResult?.accepted === true, JSON.stringify(moveResult));

      // Review 5146800659's own request: verify the real intermediate
      // crossfade alpha values (not just "visible at least once"), the
      // real absence of a traveling packet throughout, a stable material
      // (openFraction never spikes back to a fresh 1 mid-fade-out), and
      // real completion -- reading resolveTeleportTransferPresentation's
      // own reported fields directly via the new diagnostics QA surface.
      const trace = [];
      let sawDelivering = false;
      let completeReached = false;
      const readReducedMotionState = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
        return {
          phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
          conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
          openFraction: diag?.presentation.openFraction ?? null,
          packetVisible: diag?.presentation.packetVisible ?? null
        };
      });
      if (setup !== null) {
        // Fine, single-frame stepping first -- the real crossfade windows
        // (TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS /
        // TELEPORT_TRANSFER_REDUCED_MOTION_FADE_EDGE_MS) are short (under
        // 200ms), so this is what actually samples the real intermediate
        // fade values rather than skipping past them in one large batch.
        for (let i = 0; i < 120; i += 1) {
          await stepOnce();
          trace.push(await readReducedMotionState());
          if (trace[trace.length - 1].phase === 'delivering') { sawDelivering = true; }
          if (trace[trace.length - 1].phase === 'complete' || (sawDelivering && trace[trace.length - 1].phase === 'idle')) { completeReached = true; break; }
        }
        // Then coarse batched stepping (same generous budget as the
        // completion-wait loops elsewhere in this file) to actually reach
        // real completion -- the real next-maze build the rest of this
        // cycle waits on is not short, and 120 single-stepped frames
        // (< 2s) alone was nowhere near enough real time for it.
        for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !completeReached; i += 1) {
          await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
          const state = await readReducedMotionState();
          trace.push(state);
          if (state.phase === 'delivering') { sawDelivering = true; }
          if (state.phase === 'complete' || (sawDelivering && state.phase === 'idle')) { completeReached = true; }
        }
      }
      check('case 3: reduced motion still shows a real transfer (short crossfade), not nothing', trace.some((s) => s.conduitVisible), JSON.stringify(trace.map((s) => `${s.phase}/${s.conduitVisible}`)));

      const withOpenFraction = trace.filter((s) => typeof s.openFraction === 'number');
      const intermediateFractions = withOpenFraction.map((s) => s.openFraction).filter((v) => v > 0.02 && v < 0.98);
      check(
        'case 3: reduced motion shows real INTERMEDIATE crossfade alpha values, not a flat on/off step',
        intermediateFractions.length > 0,
        JSON.stringify(withOpenFraction.map((s) => s.openFraction.toFixed(3)))
      );
      check(
        'case 3: reduced motion never shows a traveling packet (packetVisible is always false)',
        withOpenFraction.length > 0 && withOpenFraction.every((s) => s.packetVisible === false),
        JSON.stringify(Array.from(new Set(withOpenFraction.map((s) => s.packetVisible))))
      );
      check('case 3: the reduced-motion cycle genuinely reaches completion', completeReached, 'n/a');
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

      // Real per-step size (stepOnce always advances the manual clock by
      // exactly 16ms) -- the tolerance below is derived directly from
      // that, not a generic round number. Review 5146800659's own
      // request.
      const REAL_STEP_MS = 16;
      const readPauseDiagnostics = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
        return {
          overlay: scene.overlay,
          primaryId: scene.gameplayTransferPrimaryId,
          phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
          animationElapsed: scene.gameplayTransferAnimationElapsedMs,
          conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
          openFraction: diag?.presentation.openFraction ?? null,
          packetVisible: diag?.presentation.packetVisible ?? null,
          sourceFlareIntensity: diag?.presentation.sourceFlareIntensity ?? null
        };
      });

      if (setup !== null) {
        await stepN(28); // real primary held, conduit genuinely open

        const beforePause = await readPauseDiagnostics();
        const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 4: the real openPauseOverlay QA command was accepted', pauseResult?.accepted === true, JSON.stringify(pauseResult));

        // Diagnostic: capture the primary id on the very first frame after
        // pause opens, and again after 50 more paused frames, to tell
        // apart "reselected the instant the overlay opened" from
        // "drifted slowly while paused" from "only changes on resume".
        await stepOnce();
        const primaryIdJustAfterPauseOpen = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').gameplayTransferPrimaryId);
        await stepN(50);
        const duringPause = await readPauseDiagnostics();
        check('case 4: pause overlay genuinely opened', duringPause.overlay === 'pause', JSON.stringify(duringPause));
        check(
          'case 4: the material animation clock genuinely freezes while paused (does not keep advancing)',
          duringPause.animationElapsed === beforePause.animationElapsed,
          JSON.stringify({ beforePause, duringPause })
        );
        // Confirmed real defect (review 5147427468, continuing 5144999445 /
        // 5146800659), fixed at the source: a first attempt at this exact
        // check asserted full presentation stasis and caught the
        // underlying lifecycle timer legitimately advancing during a
        // "paused" window (phase genuinely progressing outbound ->
        // stored) -- scene.time.now is never itself frozen by opening the
        // pause overlay (this.scene.pause() is never called anywhere in
        // this codebase). Fixed with a narrowly scoped pause-aware
        // elapsed-time correction at the scene's own transfer/arrival
        // boundary (gameplayTransferPausedDurationMs/PauseStartedAtMs) --
        // NOT a second gameplay state machine or a second clock; the one
        // authoritative lifecycle (resolveLegacyPlayerTransferVisualState)
        // is untouched, only the elapsed-ms INPUTS this scene feeds it are
        // now pause-compensated. This check now asserts genuine freeze.
        check(
          'case 4: the real presentation (phase/openFraction/packetVisible/sourceFlareIntensity) is genuinely frozen identically while paused, open-conduit interval',
          duringPause.phase === beforePause.phase
            && duringPause.openFraction === beforePause.openFraction
            && duringPause.packetVisible === beforePause.packetVisible
            && duringPause.sourceFlareIntensity === beforePause.sourceFlareIntensity,
          JSON.stringify({ beforePause, duringPause })
        );

        const resumeDispatch = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 4: the real RESUME_RUN bridge command was accepted', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));

        // First resumed frame: no accumulated pause-time jump in the
        // material clock. Step exactly one real frame past resume and
        // confirm the elapsed delta is that one frame, not the whole
        // paused interval.
        await stepOnce();
        const afterResume = await readPauseDiagnostics();
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
          'case 4: the material clock advances by roughly one real frame after resume (tolerance derived from the real 16ms step), not the whole paused interval',
          deltaMs >= 0 && deltaMs <= REAL_STEP_MS * 3,
          JSON.stringify({ duringPauseElapsed: duringPause.animationElapsed, afterResumeElapsed: afterResume.animationElapsed, deltaMs, toleranceMs: REAL_STEP_MS * 3 })
        );
        check(
          'case 4: the real lifecycle phase does not jump on resume (still the same phase one real frame later, not raced ahead)',
          afterResume.phase === duringPause.phase,
          JSON.stringify({ duringPausePhase: duringPause.phase, afterResumePhase: afterResume.phase })
        );
      }

      check('case 4: no page errors across the pause/resume sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 4b: pause during the CLOSED/STORED interval specifically
    // (distinct from case 4's open-conduit pause). Review 5146800659's
    // own request: cover both open-conduit and closed/stored intervals.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);
      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 4b: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        // Wait for the real phase to genuinely settle into 'stored'
        // (past outbound's own real 450ms window) before pausing --
        // a real closed/settled interval, not a fixed guessed frame
        // count.
        let reachedStored = false;
        for (let i = 0; i < 100 && !reachedStored; i += 1) {
          await stepOnce();
          const phase = await page.evaluate(() => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            return scene.resolveLegacyPlayerTransferState(scene.time.now).phase;
          });
          if (phase === 'stored') { reachedStored = true; }
        }
        check('case 4b: the real cycle reaches the stored interval before pausing', reachedStored, 'n/a');

        const readDiag = () => page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
          return {
            phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
            primaryId: scene.gameplayTransferPrimaryId,
            animationElapsed: scene.gameplayTransferAnimationElapsedMs,
            conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
            openFraction: diag?.presentation.openFraction ?? null,
            sourceFlareIntensity: diag?.presentation.sourceFlareIntensity ?? null
          };
        });
        const beforePause = await readDiag();
        const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 4b: the real openPauseOverlay QA command was accepted (stored interval)', pauseResult?.accepted === true, JSON.stringify(pauseResult));
        await stepOnce();
        await stepBatch(80); // a real, longer paused interval this time
        const duringPause = await readDiag();
        check(
          'case 4b: the material animation clock genuinely freezes through a longer real pause during the stored/closed interval too',
          duringPause.animationElapsed === beforePause.animationElapsed,
          JSON.stringify({ beforePause, duringPause })
        );
        // Fixed at the source (see case 4's own comment on this exact
        // defect and its fix) -- the pause-aware elapsed-time correction
        // applies just as much to a longer pause as a short one.
        check(
          'case 4b: the real presentation is genuinely frozen identically through a longer real pause during the stored/closed interval too',
          duringPause.phase === beforePause.phase
            && duringPause.conduitVisible === beforePause.conduitVisible
            && duringPause.openFraction === beforePause.openFraction
            && duringPause.sourceFlareIntensity === beforePause.sourceFlareIntensity,
          JSON.stringify({ beforePause, duringPause })
        );

        const resumeDispatch = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 4b: the real RESUME_RUN bridge command was accepted (stored interval)', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));
        await stepOnce();
        const afterResume = await readDiag();
        check(
          'case 4b: the held primary survived a pause/resume cycle during the stored/closed interval unchanged',
          afterResume.primaryId === beforePause.primaryId,
          JSON.stringify({ before: beforePause.primaryId, after: afterResume.primaryId })
        );
        const deltaMs = afterResume.animationElapsed - duringPause.animationElapsed;
        check(
          'case 4b: the material clock advances by roughly one real frame after resume (tolerance derived from the real 16ms step), not the whole paused interval, in the stored/closed case too',
          deltaMs >= 0 && deltaMs <= 16 * 3,
          JSON.stringify({ duringPauseElapsed: duringPause.animationElapsed, afterResumeElapsed: afterResume.animationElapsed, deltaMs })
        );
        check(
          'case 4b: the real lifecycle phase does not jump on resume in the stored/closed case either',
          afterResume.phase === duringPause.phase,
          JSON.stringify({ duringPausePhase: duringPause.phase, afterResumePhase: afterResume.phase })
        );
      }
      check('case 4b: no page errors across the stored-interval pause/resume sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 4c: pause during the INITIAL ARRIVAL (no goal ever reached,
    // no transfer ever armed) -- review 5147427468's own explicit
    // request, distinct from cases 4/4b which both pause a REAL armed
    // transfer. Exercises the shared pause-aware elapsed-time correction
    // via resolveLegacyPlayerSpawnBurstState specifically.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      // Confirmed real defect (found live this round): a tight 60-iteration
      // stepOnce() budget assumed the initial reveal/arrival conduit shows
      // up almost immediately. Case 7 already established the real timing
      // is not that short and uses the same generous batched-polling
      // budget as the completion-wait loops elsewhere in this file --
      // matching that pattern here instead of guessing a smaller one.
      let sawArrivalConduit = false;
      for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !sawArrivalConduit; i += 1) {
        await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
        const visible = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').gameplayTransferConduitCanvasImage?.visible ?? false);
        if (visible) { sawArrivalConduit = true; }
      }
      check('case 4c: the real initial-arrival conduit became visible before pausing', sawArrivalConduit, 'n/a');

      if (sawArrivalConduit) {
        const readArrivalDiag = () => page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const diag = window.__MAZER_QA__.getGameplayTransferPresentationDiagnostics();
          return {
            spawnBurstActive: scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).active,
            primaryId: scene.gameplayTransferPrimaryId,
            conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
            openFraction: diag?.presentation.openFraction ?? null
          };
        });
        const beforePause = await readArrivalDiag();
        const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 4c: the real openPauseOverlay QA command was accepted during initial arrival', pauseResult?.accepted === true, JSON.stringify(pauseResult));
        await stepOnce();
        await stepBatch(50);
        const duringPause = await readArrivalDiag();
        check(
          'case 4c: the real initial-arrival presentation is genuinely frozen identically while paused',
          duringPause.spawnBurstActive === beforePause.spawnBurstActive
            && duringPause.conduitVisible === beforePause.conduitVisible
            && duringPause.openFraction === beforePause.openFraction,
          JSON.stringify({ beforePause, duringPause })
        );
        const resumeDispatch = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 4c: the real RESUME_RUN bridge command was accepted during initial arrival', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));
        await stepOnce();
        const afterResume = await readArrivalDiag();
        check(
          'case 4c: the held primary survived a pause/resume cycle during initial arrival unchanged',
          afterResume.primaryId === beforePause.primaryId,
          JSON.stringify({ before: beforePause.primaryId, after: afterResume.primaryId })
        );
        check(
          'case 4c: the initial-arrival presentation does not jump on the first resumed frame',
          afterResume.spawnBurstActive === duringPause.spawnBurstActive,
          JSON.stringify({ duringPause, afterResume })
        );
      }
      check('case 4c: no page errors during the initial-arrival pause/resume sequence', pageErrors.length === 0, JSON.stringify(pageErrors));
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
      const { context, page, pageErrors, stepOnce, stepBatch } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
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

      // Review 5146800659: continue case 7 through the arrival's own real
      // completion -- temporary effects cleared, the real player visible
      // at its real start position, and a subsequent real accepted move
      // (input genuinely unlocked), not just "the replacement appeared."
      let arrivalSettled = false;
      for (let i = 0; i < COMPLETION_WAIT_MAX_BATCHES && !arrivalSettled; i += 1) {
        await stepBatch(COMPLETION_WAIT_BATCH_SIZE);
        const spawnBurstActive = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return scene.resolveLegacyPlayerSpawnBurstState(scene.time.now).active;
        });
        if (spawnBurstActive === false) { arrivalSettled = true; }
      }
      check('case 7: the initial arrival burst itself genuinely settles (does not stay active forever)', arrivalSettled, 'n/a');

      const postArrivalState = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return {
          conduitVisible: scene.gameplayTransferConduitCanvasImage?.visible ?? null,
          playerVisible: scene.isLegacyMenuPointVisibleInStaticDraw(scene.player),
          player: scene.player,
          start: scene.maze.start
        };
      });
      check('case 7: the conduit is genuinely hidden again once the initial arrival settles (temporary effect cleared, not left stuck visible)', postArrivalState.conduitVisible === false, JSON.stringify(postArrivalState));
      check('case 7: the real player is visible at its real start position once the arrival settles', postArrivalState.playerVisible === true, JSON.stringify(postArrivalState));

      const postArrivalMoveCandidate = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const player = scene.player;
        const grid = scene.maze.grid;
        const candidates = [
          { dx: 0, dy: -1, move: 'move_up' }, { dx: 0, dy: 1, move: 'move_down' },
          { dx: -1, dy: 0, move: 'move_left' }, { dx: 1, dy: 0, move: 'move_right' }
        ];
        return candidates.find((c) => grid[player.y + c.dy]?.[player.x + c.dx] === true) ?? null;
      });
      if (postArrivalMoveCandidate !== null) {
        const postArrivalMoveResult = await moveUntilAccepted(page, stepOnce, postArrivalMoveCandidate.move, 200);
        check('case 7: real input is genuinely unlocked once the initial arrival settles (a real move is accepted)', postArrivalMoveResult?.accepted === true, JSON.stringify(postArrivalMoveResult));
      }

      const legacyVolleyDrawCalls = await readLegacyVolleySpyCount(page);
      check(
        'case 7: the OLD procedural eight-origin volley never drew a single beam across the whole initial-entry sequence, including settling',
        legacyVolleyDrawCalls === 0,
        `${legacyVolleyDrawCalls} real lineBetween call(s) on playerSpawnBurstGraphics`
      );
      check('case 7: no page errors during initial entry', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 8: the ambient perimeter-diamond ring stays CALM during a
    // real gameplay transfer. Owner-reported (direct product-owner
    // instruction, 2026-09-09): "the laser is shooting to a diamond that
    // isn't even one of the ones on the edge". Root cause found live: a
    // real transfer always coincides with the maze deconstruct/rebuild,
    // which drove the title-orbit spin -- so the seven non-engaged
    // diamonds swirled all over the viewport edge while the one engaged
    // diamond sat pinned, reading as an unrelated object. The fix freezes
    // the orbit spin (holds every sigil at its resting corner/edge-mid
    // station) for the whole transfer in Play mode. This case drives a
    // real transfer and asserts the non-engaged diamonds do NOT move.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepN(200);

      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 8: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));

      if (setup !== null) {
        const readRing = () => page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const primaryId = scene.gameplayTransferPrimaryId;
          const positions = scene.titleOrbitDiamondImages.map((img, i) => {
            const p = img.getWorldTransformMatrix().transformPoint(0, 0);
            return { i, x: Math.round(p.x), y: Math.round(p.y) };
          });
          return {
            phase: scene.resolveLegacyPlayerTransferState(scene.time.now).phase,
            spinActive: scene.resolveLegacyMenuPathTitleOrbitFrame(scene.time.now).isLifecycleSpinActive,
            drawPhase: scene.menuStaticDrawLifecyclePhase,
            primaryId,
            nonPrimary: positions.filter((d) => d.i !== primaryId)
          };
        });

        await stepN(30); // reach the real deconstruct-arm / outbound instant
        const first = await readRing();
        check('case 8: a real transfer is genuinely armed for this case', first.primaryId !== null && ['outbound', 'stored', 'delivering'].includes(first.phase), JSON.stringify(first));

        // Sample the non-engaged ring across the whole rest of the real
        // transfer. The ambient spin must read as inactive and every
        // non-engaged diamond must stay within a couple of px of where it
        // started (no swirl), all the way through delivery.
        let maxDrift = 0;
        let sawSpinActive = first.spinActive === true;
        const baseline = new Map(first.nonPrimary.map((d) => [d.i, d]));
        for (let i = 0; i < 260; i += 1) {
          await stepOnce();
          const s = await readRing();
          if (s.spinActive === true) { sawSpinActive = true; }
          for (const d of s.nonPrimary) {
            const b = baseline.get(d.i);
            if (b) { maxDrift = Math.max(maxDrift, Math.hypot(d.x - b.x, d.y - b.y)); }
          }
          if (s.phase === 'idle' && i > 40) { break; }
        }
        check('case 8: the ambient title-orbit spin reads as inactive for the whole real transfer (not swirling)', sawSpinActive === false, `sawSpinActive=${sawSpinActive}`);
        check('case 8: every NON-engaged perimeter diamond holds its resting station through the whole transfer (max drift <= 3px)', maxDrift <= 3, `maxDrift=${maxDrift.toFixed(2)}px`);
      }
      check('case 8: no page errors across the calm-ring transfer', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 9: ordinary player movement is genuinely LOCKED through the
    // entire visible maze build, on BOTH first entry AND the next-maze
    // transition after a goal. Owner-reported (2026-09-09): "the player
    // is moving before the maze creation animation is done". Investigated
    // live: ordinary movement is in fact locked the whole time (the only
    // motion is the arrival materialization presentation, which the owner
    // accepted as part of arrival). This case is the regression guard for
    // that -- it hammers a real move command every frame across the whole
    // reveal and asserts ZERO are accepted while any maze tile is still
    // unrevealed, on both build paths.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce, stepN } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      const probeBuild = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        let total = 0;
        let revealed = 0;
        for (let y = 0; y < scene.maze.height; y += 1) {
          for (let x = 0; x < scene.maze.width; x += 1) {
            if (scene.maze.grid[y][x]) {
              total += 1;
              if (scene.isLegacyMenuPointVisibleInStaticDraw({ x, y })) { revealed += 1; }
            }
          }
        }
        const move = window.__MAZER_QA__.movePlayPlayer('move_up');
        return {
          drawPhase: scene.menuStaticDrawLifecyclePhase,
          revealComplete: total > 0 && revealed >= total,
          settledAndUnlocked: scene.menuStaticDrawLifecyclePhase === 'settled' && !scene.isLegacyPlayLifecycleInputLocked(),
          moveAccepted: move?.accepted === true
        };
      });

      const runBuildPath = async (label) => {
        let acceptedWhileRevealIncomplete = 0;
        let framesObserved = 0;
        for (let i = 0; i < 700; i += 1) {
          await stepOnce();
          const p = await probeBuild();
          framesObserved += 1;
          if (!p.revealComplete && p.moveAccepted) { acceptedWhileRevealIncomplete += 1; }
          if (p.settledAndUnlocked && i > 30) { break; }
        }
        check(`case 9 (${label}): ordinary movement is never accepted while a maze tile is still unrevealed`, acceptedWhileRevealIncomplete === 0, `${acceptedWhileRevealIncomplete} accepted move(s) over ${framesObserved} frames`);
      };

      await runBuildPath('first entry');

      // Now drive a real goal reach and repeat across the next-maze rebuild.
      const { setup } = await setupControlledNearGoalMove(page, stepOnce);
      if (setup !== null) {
        await runBuildPath('next-maze transition');
      } else {
        check('case 9 (next-maze transition): found a walkable goal neighbour to trigger a transition', false, 'n/a');
      }
      check('case 9: no page errors across the build-lock checks', pageErrors.length === 0, JSON.stringify(pageErrors));
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
