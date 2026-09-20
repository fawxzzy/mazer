/**
 * Wave 4E World Identity: retained real-browser evidence for the level-
 * number reveal fix and the Account/Home icon-ring consistency candidate
 * (PR #358), a real-UI-command transition clip, and a dedicated menu-demo
 * trail-order clip. Committed (not a scratch script) per review
 * 5206770593's own request that the underlying pixels/traces be retained
 * for independent review, and corrected per review 5210728300's two real
 * findings against the first committed version:
 *
 *  (1) The icon-comparison and transition sections closed Options by
 *      directly assigning `scene.overlay = 'none'` -- a lifecycle-field
 *      poke, not the real exit path, and exactly the kind of shortcut that
 *      could hide the transition-cleanup behavior this investigation is
 *      about. Fixed: both now close Options the same way a real Back tap
 *      does, via `window.__MAZER_QA__.dispatchUiCommand({type:
 *      'CLOSE_MODAL'})` (routes through the real UI command bridge,
 *      confirmed against `resolveLegacyOverlayBackAction` --
 *      `overlay: 'options'` always resolves to `close-overlay`, i.e. the
 *      exact same path a real Back-button click reaches via
 *      `handleBackAction`). Direct field assignment is now confined to
 *      exactly the one place it was always legitimate: the explicitly-
 *      labelled multi-digit fixture, which exists specifically because no
 *      fresh account can reach a two-digit level through real play.
 *
 *  (2) `waitForCondition` returned `false` on timeout instead of failing,
 *      several callers never checked that return value, and rejected
 *      movement commands were logged without stopping the run -- so a
 *      capture that silently never observed what it claims to demonstrate
 *      could still exit 0 with a normal-looking manifest. Fixed:
 *      `waitForCondition` now throws (with a live scene-state snapshot in
 *      the message) instead of returning a value at all, and every
 *      required observation (game readiness, all three level-number
 *      reveal stages including the added real next-maze transition, a
 *      valid solver route, every individual accepted move, at least one
 *      accepted turn where a clip claims to show one, the expected
 *      mode/overlay after every UI transition, and the multi-digit
 *      fixture's own final state) is asserted explicitly via `assertThat`,
 *      which throws immediately rather than recording a soft failure.
 *      A missing observation now means a nonzero exit and no manifest,
 *      not a "successful" package with the wrong content -- verified via
 *      a real negative control before this fix was committed: temporarily
 *      forcing the CLOSE_MODAL assertion to require the impossible
 *      (`result.ok === false`) made the script exit 1 with a clear
 *      diagnostic; reverting restored a clean pass.
 *
 * Two further corrections from the same review: the transition section
 * captures exactly ONE real cycle -- it is retained AS one real, honestly-
 * labelled sample, not presented as equivalent to the separate three-
 * cycle scratch investigation that originally produced the "not
 * reproduced" finding (that investigation was never committed, by design
 * -- this file is what replaces narrating it). And the level-number
 * section now covers two genuinely different paths: a fresh Play entry,
 * and a real next-maze transition reached by actually finishing the maze
 * through the real solver -- these are not the same case and are labelled
 * separately in diagnostics.json.
 *
 * On timing precision: each diagnostics sample paired with a screenshot
 * is read via its own `page.evaluate()` call immediately before or after
 * the `page.screenshot()` call, both within the same async step -- this
 * is close but not a guaranteed zero-skew, same-render-frame pairing (a
 * real RAF tick can land between the two round trips). Reported honestly
 * as "captured immediately adjacent", not as a stricter synchronization
 * than Playwright actually provides here.
 *
 * Same "one real clock, no game.loop.step()" convention as
 * capture-gameplay-transfer-evidence.mjs and the same real-solver
 * (window.__MAZER_QA__.resolveShortestPathToGoal()) movement-driving
 * technique -- see that file's own header for the full rationale.
 *
 * Usage: node scripts/analysis/capture-world-identity-ui-evidence.mjs [--out-dir=<dir>] [--no-preview] [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

const resolveGitHead = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return null;
  }
};

const isDirtyWorktree = () => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT }).toString().trim().length > 0;
  } catch {
    return null;
  }
};

// Same wrap-aware sign inference as capture-gameplay-transfer-evidence.mjs's
// own directionForStep -- mirrored exactly, not reinvented.
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

const snapshotSceneState = async (page) => page.evaluate(() => {
  const g = window.__MAZER_GAME__;
  const s = g && g.scene.getScene('MenuScene');
  if (!s) return { hasGame: !!g, hasScene: false };
  return {
    mode: s.mode,
    overlay: s.overlay,
    phase: s.menuStaticDrawLifecyclePhase,
    hasQa: !!window.__MAZER_QA__
  };
}).catch((error) => ({ evalError: String(error) }));

// Fails closed: throws with a live scene-state snapshot instead of
// returning false for a caller to (possibly) ignore. This is the fix for
// review 5210728300's second finding -- a required observation that never
// happens must stop the run, not fall through to a "successful" package.
const waitForCondition = async (page, fn, description, timeoutMs = 20000, pollMs = 100) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await page.evaluate(fn)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(pollMs);
  }
  const snapshot = await snapshotSceneState(page);
  throw new Error(`Required observation timed out after ${timeoutMs}ms: ${description}. Last observed state: ${JSON.stringify(snapshot)}`);
};

const assertThat = (condition, message, extra) => {
  if (!condition) {
    throw new Error(`Required observation failed: ${message}${extra !== undefined ? ` -- observed: ${JSON.stringify(extra)}` : ''}`);
  }
};

// The real exit path a Back tap uses (handleBackAction -> closeOverlay for
// any overlay other than 'none'/'confirm-progression-reset' -- confirmed
// against resolveLegacyOverlayBackAction directly), routed through the
// real UI command bridge rather than a synthesized pointer click, and
// asserted to actually land on the expected surface rather than assumed.
const closeModalViaRealCommand = async (page) => {
  const result = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'CLOSE_MODAL' }));
  assertThat(result?.ok === true, 'CLOSE_MODAL command did not report ok', result);
  await waitForCondition(
    page,
    () => window.__MAZER_GAME__.scene.getScene('MenuScene').overlay === 'none',
    'overlay returned to none after the real CLOSE_MODAL command'
  );
};

const waitForMenuSettled = (page, timeoutMs) => waitForCondition(
  page,
  () => {
    const g = window.__MAZER_GAME__;
    const s = g && g.scene.getScene('MenuScene');
    return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
  },
  'menu settled (overlay none, draw phase settled)',
  timeoutMs
);

const waitForPlaySettled = (page, timeoutMs = 25000) => waitForCondition(
  page,
  () => {
    const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
    return s.menuStaticDrawLifecyclePhase === 'settled' && s.isLegacyPlayLifecycleInputLocked() === false;
  },
  'play settled and input unlocked',
  timeoutMs
);

const readLevelAnnouncerState = (page) => page.evaluate(() => {
  const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const visual = s.resolveLegacyLevelAnnouncerVisualState(s.time.now);
  return {
    t: Math.round(s.time.now),
    phase: s.menuStaticDrawLifecyclePhase,
    alpha: Number(visual.alpha.toFixed(3)),
    revealProgress: Number(visual.revealProgress.toFixed(3)),
    numberVisible: s.levelAnnouncerNumberGraphics.visible,
    level: s.progressionState.tracks[s.resolveActiveLegacyProgressionTrackId()].level,
    player: s.player ? { x: s.player.x, y: s.player.y } : null,
    goal: s.maze ? { x: s.maze.goal.x, y: s.maze.goal.y } : null
  };
});

const readIconState = (page) => page.evaluate(() => {
  const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const iconState = (img) => (img ? { visible: img.visible, x: Math.round(img.x), y: Math.round(img.y), alpha: Number(img.alpha.toFixed(2)) } : null);
  return {
    mode: s.mode,
    overlay: s.overlay,
    headerSettingsIcon: iconState(s.headerSettingsIconImage),
    touchSettingsCogIcon: iconState(s.touchSettingsCogIconImage),
    headerLeaderboardIcon: iconState(s.headerLeaderboardIconImage),
    uiButtonCount: (s.uiButtons || []).length,
    uiButtonTexts: (s.uiButtons || []).map((b) => b.semanticAction || b.text)
  };
});

// Drives a real accepted route to completion via the real solver, asserting
// every step is accepted (never logging-and-continuing past a rejection)
// and that at least one accepted turn happens when the caller expects one.
// Returns the accepted-move diagnostics log for the manifest.
const driveRealRoute = async (page, { maxSteps = Infinity, requireTurn = false } = {}) => {
  const route = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
  assertThat(route?.found === true, 'resolveShortestPathToGoal did not find a route', route);
  assertThat(Array.isArray(route.path) && route.path.length > 1, 'solver route has no usable steps', route);

  const log = [];
  let lastDir = null;
  let turnAccepted = false;
  const stepCount = Math.min(route.path.length - 1, maxSteps);
  for (let i = 1; i <= stepCount; i += 1) {
    const dir = directionForStep(route.path[i - 1], route.path[i]);
    if (!dir) continue;
    // eslint-disable-next-line no-await-in-loop
    const result = await page.evaluate((d) => window.__MAZER_QA__.movePlayPlayer(d), dir);
    const isTurn = lastDir !== null && lastDir !== dir;
    assertThat(result.accepted === true, `movePlayPlayer('${dir}') was rejected`, result);
    if (isTurn) turnAccepted = true;
    lastDir = dir;
    log.push({ dir, isTurn, accepted: result.accepted, player: result.player });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(120);
  }
  if (requireTurn) {
    assertThat(turnAccepted === true, 'no accepted turn occurred in a clip that claims to demonstrate one', log);
  }
  return { route, log, turnAccepted, reachedGoal: stepCount === route.path.length - 1 };
};

const sha256OfFile = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outDir = typeof args['out-dir'] === 'string' ? args['out-dir'] : path.resolve(REPO_ROOT, 'tmp', 'world-identity-ui-evidence');
  // Fresh output directory every run -- a manifest must describe exactly
  // this run's own payloads, never a mix that includes a previous run's
  // leftover files (review 5210728300's own instruction).
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  const diagnostics = {
    levelNumberFreshEntry: [],
    levelNumberNextMaze: [],
    levelNumberMultidigit: null,
    transition: [],
    menuDemoTrail: []
  };

  try {
    // ============================================================
    // 1. Level number: fresh Play entry, then a real next-maze transition
    //    reached by actually finishing the maze -- two genuinely different
    //    paths, not the same case captured twice.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForMenuSettled(page, 20000);
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      const captureLevelNumberSequence = async (label, deadlineMs) => {
        let capturedMidBuild = false;
        let capturedFullReveal = false;
        let capturedCleared = false;
        const deadline = Date.now() + deadlineMs;
        while (Date.now() < deadline && !(capturedMidBuild && capturedFullReveal && capturedCleared)) {
          // eslint-disable-next-line no-await-in-loop
          const state = await readLevelAnnouncerState(page);
          if (!capturedMidBuild && state.revealProgress > 0.15 && state.revealProgress < 0.85) {
            // eslint-disable-next-line no-await-in-loop
            await page.screenshot({ path: path.join(outDir, `mazer-world-identity-level-number-${label}-mid-build.png`) });
            capturedMidBuild = true;
            diagnostics[`levelNumber${label === 'fresh-entry' ? 'FreshEntry' : 'NextMaze'}`].push({ ...state, capturedAs: 'mid-build' });
          } else if (!capturedFullReveal && capturedMidBuild && state.revealProgress >= 1 && state.alpha > 0.9) {
            // eslint-disable-next-line no-await-in-loop
            await page.screenshot({ path: path.join(outDir, `mazer-world-identity-level-number-${label}-full-reveal-hold.png`) });
            capturedFullReveal = true;
            diagnostics[`levelNumber${label === 'fresh-entry' ? 'FreshEntry' : 'NextMaze'}`].push({ ...state, capturedAs: 'full-reveal-hold' });
          } else if (!capturedCleared && capturedFullReveal && state.numberVisible === false) {
            // eslint-disable-next-line no-await-in-loop
            await page.screenshot({ path: path.join(outDir, `mazer-world-identity-level-number-${label}-cleared.png`) });
            capturedCleared = true;
            diagnostics[`levelNumber${label === 'fresh-entry' ? 'FreshEntry' : 'NextMaze'}`].push({ ...state, capturedAs: 'cleared' });
          }
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(60);
        }
        assertThat(capturedMidBuild, `${label}: mid-build reveal stage was never observed`);
        assertThat(capturedFullReveal, `${label}: full-reveal-hold stage was never observed`);
        assertThat(capturedCleared, `${label}: cleared stage was never observed`);
      };

      await captureLevelNumberSequence('fresh-entry', 8000);

      // Real next-maze transition: actually finish the current maze through
      // the real solver/accepted moves, then observe the level announcer's
      // own reveal sequence fire again for the maze that follows -- this is
      // NOT the same observation as the fresh-entry case above.
      const { reachedGoal } = await driveRealRoute(page, {});
      assertThat(reachedGoal === true, 'did not reach the real goal while driving the next-maze transition');
      await captureLevelNumberSequence('next-maze', 10000);

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-level-number-sequence.webm'));
        unlinkSync(videoPath);
      }
    }

    // ============================================================
    // 2. Level number: multi-digit DIRECT FIXTURE (not organic play).
    //    Direct field assignment is confined to exactly this section --
    //    the one place it is legitimate, since no fresh account reaches a
    //    two-digit level through real play. Re-asserted on every real
    //    tick for a real window (NOT a frozen loop -- an earlier attempt
    //    that called game.loop.sleep() after a single forced draw
    //    intermittently lost the override to a real frame that ran before
    //    the screenshot; Phaser's renderer only paints Graphics draw calls
    //    during its own real render pass, so freezing the loop right after
    //    issuing them just as often froze on the frame *before* they were
    //    painted). Pinning the same state every ~16ms for 400ms lets the
    //    real, still-running loop actually render it while guaranteeing
    //    the state is still correct whenever the screenshot lands.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForMenuSettled(page, 20000);
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const trackId = scene.resolveActiveLegacyProgressionTrackId();
        window.__worldIdentityFixtureInterval = setInterval(() => {
          const now = scene.time.now;
          scene.progressionState.tracks[trackId].level = 42;
          scene.menuStaticDrawLifecyclePhase = 'building';
          scene.menuStaticBuildPhaseStartedAtMs = now - 1500;
          scene.levelAnnouncerBuildFadeOutArmed = false;
        }, 16);
      });
      await page.waitForTimeout(400);
      const state = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const trackId = scene.resolveActiveLegacyProgressionTrackId();
        const visual = scene.resolveLegacyLevelAnnouncerVisualState(scene.time.now);
        return {
          alpha: Number(visual.alpha.toFixed(3)),
          revealProgress: Number(visual.revealProgress.toFixed(3)),
          visible: scene.levelAnnouncerNumberGraphics.visible,
          level: scene.progressionState.tracks[trackId].level,
          isDirectFixture: true,
          fixtureTechnique: 'repeated-repin-on-real-tick, not a frozen loop'
        };
      });
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-level-number-multidigit-FIXTURE.png') });
      await page.evaluate(() => clearInterval(window.__worldIdentityFixtureInterval));
      assertThat(state.level === 42, 'multi-digit fixture did not hold level=42', state);
      assertThat(state.revealProgress === 1, 'multi-digit fixture did not reach full reveal', state);
      // The held-plateau alpha is a continuous ambient breathing pulse
      // (applyLegacyLevelAnnouncerPulse), not a fixed value -- it legitimately
      // oscillates as low as LEGACY_LEVEL_ANNOUNCER_PULSE_MIN_ALPHA (0.78) in
      // the real source. A first version of this assertion used > 0.9, which
      // the negative-control run below caught failing on a real (not
      // sabotaged) sample at alpha=0.828 -- a genuine flaky-threshold bug in
      // this script, found by the same negative-control process meant to
      // catch a deliberately-broken assertion. 0.75 sits safely below the
      // real floor with margin, not tuned to whatever a single run produced.
      assertThat(state.alpha >= 0.75, 'multi-digit fixture alpha fell outside the real pulse range (should stay >= ~0.78)', state);
      assertThat(state.visible === true, 'multi-digit fixture glyph graphics were not visible', state);
      diagnostics.levelNumberMultidigit = state;
      await context.close();
    }

    // ============================================================
    // 3. Icon comparison, native size, three surfaces. Options closes via
    //    the real CLOSE_MODAL command, not a direct overlay assignment.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForMenuSettled(page, 20000);
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-menu.png') });

      const openResult = await page.evaluate(() => window.__MAZER_QA__.openOptionsOverlay());
      assertThat(openResult?.overlay === 'options' || openResult?.accepted !== false, 'openOptionsOverlay did not report success', openResult);
      await waitForCondition(page, () => window.__MAZER_GAME__.scene.getScene('MenuScene').overlay === 'options', 'overlay reached options');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-options.png') });

      await closeModalViaRealCommand(page);

      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await waitForPlaySettled(page);
      const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      assertThat(pauseResult?.overlay === 'pause' || pauseResult?.accepted !== false, 'openPauseOverlay did not report success', pauseResult);
      await waitForCondition(page, () => window.__MAZER_GAME__.scene.getScene('MenuScene').overlay === 'pause', 'overlay reached pause');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-pause.png') });
      await context.close();
    }

    // ============================================================
    // 4. ONE real-UI-command transition cycle, one continuous recording,
    //    including a real accepted turn inside the recording. Retained as
    //    one honestly-labelled real sample -- not presented as the three-
    //    cycle scratch investigation that originally produced the "not
    //    reproduced" finding for the transient reports (that investigation
    //    was never committed; this file is what replaces narrating it).
    //    Options closes via the real CLOSE_MODAL command throughout.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForMenuSettled(page, 20000);
      diagnostics.transition.push({ label: 'menu', ...(await readIconState(page)) });

      const openResult = await page.evaluate(() => window.__MAZER_QA__.openOptionsOverlay());
      assertThat(openResult?.overlay === 'options' || openResult?.accepted !== false, 'openOptionsOverlay did not report success', openResult);
      await waitForCondition(page, () => window.__MAZER_GAME__.scene.getScene('MenuScene').overlay === 'options', 'overlay reached options');
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'options-open', ...(await readIconState(page)) });

      await closeModalViaRealCommand(page);
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'options-closed-via-real-close-modal', ...(await readIconState(page)) });

      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await waitForPlaySettled(page);
      diagnostics.transition.push({ label: 'play-settled', ...(await readIconState(page)) });

      const { log: moveLog, turnAccepted } = await driveRealRoute(page, { maxSteps: 9, requireTurn: true });
      for (const move of moveLog) {
        diagnostics.transition.push({ label: `move-${move.dir}`, isTurn: move.isTurn, accepted: move.accepted, ...(await readIconState(page)) });
      }
      assertThat(turnAccepted === true, 'transition clip did not include an accepted turn');

      const pauseResult = await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      assertThat(pauseResult?.overlay === 'pause' || pauseResult?.accepted !== false, 'openPauseOverlay did not report success', pauseResult);
      await waitForCondition(page, () => window.__MAZER_GAME__.scene.getScene('MenuScene').overlay === 'pause', 'overlay reached pause');
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'pause-open', ...(await readIconState(page)) });

      const homeResult = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RETURN_HOME' }));
      assertThat(homeResult?.ok === true, 'RETURN_HOME command did not report ok', homeResult);
      await waitForCondition(
        page,
        () => {
          const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return s.mode === 'menu' && s.overlay === 'none';
        },
        'mode/overlay reached menu/none after RETURN_HOME'
      );
      await page.waitForTimeout(1000);
      diagnostics.transition.push({ label: 'home-settled', ...(await readIconState(page)) });

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-transition.webm'));
        unlinkSync(videoPath);
      }
    }

    // ============================================================
    // 5. Menu-demo ambient trail, separately from Active Play -- the
    //    menu's own per-tile trail overlay (drawLegacyPlayerTrailTileOverlay)
    //    is a genuinely different code path from Active Play's continuous
    //    Navigation-Core canvas trail (drawLegacyContinuousPlayTrail); a
    //    trail-order finding in one surface says nothing about the other.
    //    This is real autonomous demo-AI movement -- no QA move calls.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForMenuSettled(page, 20000);
      const deadline = Date.now() + 6000;
      let sawMovement = false;
      let previousLogical = null;
      while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        const s = await page.evaluate(() => {
          const sc = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const rendered = sc.resolveLegacyRenderedPlayerPoint(sc.time.now);
          return {
            logical: sc.player ? { x: sc.player.x, y: sc.player.y } : null,
            rendered: rendered ? { x: Number(rendered.x.toFixed(2)), y: Number(rendered.y.toFixed(2)) } : null,
            trailLen: Array.isArray(sc.trail) ? sc.trail.length : null
          };
        });
        if (previousLogical && s.logical && (s.logical.x !== previousLogical.x || s.logical.y !== previousLogical.y)) {
          sawMovement = true;
        }
        previousLogical = s.logical;
        diagnostics.menuDemoTrail.push({ t: Date.now(), ...s });
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(150);
      }
      assertThat(sawMovement === true, 'menu demo AI never moved during the capture window');
      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-menu-demo-trail.webm'));
        unlinkSync(videoPath);
      }
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  writeFileSync(path.join(outDir, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));

  const files = readdirSync(outDir).filter((name) => statSync(path.join(outDir, name)).isFile());
  const manifest = {
    capturedAtIso: new Date().toISOString(),
    gitHead: resolveGitHead(),
    gitDirty: isDirtyWorktree(),
    baseUrl: resolvedBaseUrl,
    allRequiredObservationsAsserted: true,
    files: Object.fromEntries(files.sort().map((name) => [name, { sha256: sha256OfFile(path.join(outDir, name)), bytes: statSync(path.join(outDir, name)).size }]))
  };
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  process.stderr.write(`Evidence written to ${outDir}\n`);
  process.stderr.write(`${JSON.stringify({ manifest }, null, 2)}\n`);
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
