/**
 * Wave 4D-B: real-browser integration check for the Teleport anchor-pose
 * QA preview (window.__MAZER_QA__.previewTeleportPrimaryAnchor /
 * endTeleportPrimaryAnchorPreview, wired in src/scenes/MenuScene.ts).
 * Drives the actual built game (not a mock).
 *
 * The preview is presented by the ONE procedural edge-marker system
 * (src/render/edgeMarkers.ts): the selector's held anchor id energizes THAT
 * station's diamond. The retired 1254 px shell-image pool, its world-matrix
 * port/footprint geometry and the scale-compensation negative control no
 * longer exist, so this script verifies the same product behaviour against
 * the markers' real draw calls instead. It spies on the scene's own
 * edgeMarkerGraphics (clear / lineStyle / beginPath / moveTo / lineTo /
 * strokePath) and rebuilds, for every drawn frame, which of the 8 diamonds
 * are lit (mint, energized alpha) and where their vertices are, so it can
 * never pass by trusting the preview bookkeeping alone.
 *
 * This version asserts:
 *   - all 8 station ids exist and 8 diamonds are drawn, fully inside the
 *     viewport (menu and play);
 *   - previewing lights EXACTLY the selected identity's diamond and no other,
 *     and that diamond sits at the resolver's anchor (same edge/corner);
 *   - a real device-independent HUD control's own live bounds (this scene's
 *     actual uiButtons) genuinely excludes an anchor whose footprint overlaps it;
 *   - the preview session retains its held anchor across a target change (the
 *     real selector's own retention rule), and newSession:true starts fresh,
 *     moving the lit diamond to the new identity;
 *   - ending the preview clears every lit diamond back to the pre-preview
 *     baseline, synchronously;
 *   - under reduced motion begin/update/end redraw synchronously (no frame
 *     step) and the markers stay completely static (nothing lights up);
 *   - real play-control clearance (pause button, active floating stick) and
 *     Navigation Core's own canvases stay unaffected.
 *
 * Usage: node scripts/analysis/verify-teleport-anchor-preview-lifecycle.mjs
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

const checks = [];
const check = (label, passed, detail) => {
  checks.push({ label, passed, detail });
  process.stderr.write(`${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -- ${detail}` : ''}\n`);
};

const STATION_IDS = [0, 1, 2, 3, 4, 5, 6, 7];
const ENERGIZED_ALPHA_FLOOR = 0.9;
const IDLE_ALPHA_CEILING = 0.7;
// Station centres sit at the edge-marker inset (12 px) while the teleport
// anchor resolver uses its own slightly larger preview inset: the two agree
// on which edge/corner, within this distance.
const ANCHOR_STATION_TOLERANCE_PX = 24;

// Advances the scene's own manual clock -- the normal per-frame draw only
// runs from within the real render loop. The clock lives in the page so
// every helper shares it.
const stepFrames = (page, count = 1) => page.evaluate((n) => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  let t = window.__mazerTeleportQaClockMs ?? scene.time.now;
  for (let i = 0; i < n; i += 1) {
    t += 16;
    window.__MAZER_GAME__.loop.step(t);
  }
  window.__mazerTeleportQaClockMs = t;
}, count);
const stepOnce = (page) => stepFrames(page, 1);

/**
 * Steps (one real 16 ms frame at a time) until the scene is in a quiet,
 * settled state: draw lifecycle settled, no transfer armed, no beam in
 * flight and -- in the self-playing menu -- inside the calm window between
 * the intro (reveal, ring lighting, goal pulse) finishing and the demo's next goal-reset deconstruct (which
 * fires beams from the player to all 8 diamonds and lights every marker).
 * Waits on state, not on a fixed frame count.
 */
const stepToQuietSettled = (page, maxSteps = 4000) => page.evaluate((limit) => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  let t = window.__mazerTeleportQaClockMs ?? scene.time.now;
  for (let i = 0; i < limit; i += 1) {
    const age = scene.introStartedAtMs === null ? null : scene.time.now - scene.introStartedAtMs;
    // The intro length is a pure function of the tile count (introTimeline.ts):
    // done = 500 + clamp(N / 70 tiles/s, 2000, 3200) + 250 ms. The calm window is the
    // 1400 ms after the ring lighting / goal pulse have finished (the diamonds idle again).
    const tiles = scene.menuStaticDrawTileOrder.length;
    const doneMs = 500 + Math.max(2000, Math.min(3200, (tiles / 70) * 1000)) + 250;
    const calm = scene.menuStaticDrawLifecyclePhase === 'settled'
      && !scene.isLegacyPlayLifecycleInputLocked()
      && !scene.playerTransferEnergyArmed
      && scene.edgeBeamFiringIds.size === 0
      && !scene.edgeRingActive
      && (scene.mode !== 'menu' || (age !== null && age >= doneMs + 64 && age <= doneMs + 1464));
    if (calm) {
      window.__mazerTeleportQaClockMs = t;
      return { settled: true, steps: i, mode: scene.mode };
    }
    t += 16;
    window.__MAZER_GAME__.loop.step(t);
  }
  window.__mazerTeleportQaClockMs = t;
  return { settled: false, steps: limit, mode: scene.mode };
}, maxSteps);

// Spies on the scene's REAL edge-marker Graphics. Each clear() starts a new
// frame; each strokePath() closes one diamond (drawEdgeMarker strokes the
// outline last, after the optional mint core), so frame[i] is station i.
const installMarkerRecorder = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const graphics = scene.edgeMarkerGraphics;
  const rec = { clears: 0, frame: [], lineStyle: null, vertices: [] };
  window.__mazerEdgeRec = rec;
  for (const name of ['clear', 'lineStyle', 'beginPath', 'moveTo', 'lineTo', 'strokePath']) {
    const original = graphics[name].bind(graphics);
    graphics[name] = (...args) => {
      if (name === 'clear') {
        rec.clears += 1;
        rec.frame = [];
      } else if (name === 'lineStyle') {
        rec.lineStyle = { color: args[1], alpha: args[2] };
      } else if (name === 'beginPath') {
        rec.vertices = [];
      } else if (name === 'moveTo' || name === 'lineTo') {
        rec.vertices.push({ x: args[0], y: args[1] });
      } else if (name === 'strokePath') {
        rec.frame.push({ color: rec.lineStyle?.color, alpha: rec.lineStyle?.alpha, vertices: rec.vertices.slice() });
      }
      return original(...args);
    };
  }
});

// The last drawn marker frame, plus the scene's own station list and
// viewport, read synchronously (no frame step in between).
const readMarkerFrame = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const rec = window.__mazerEdgeRec;
  const graphics = scene.edgeMarkerGraphics;
  const world = graphics.getWorldTransformMatrix();
  return {
    clears: rec.clears,
    markers: rec.frame.map((marker) => ({ color: marker.color, alpha: marker.alpha, vertices: marker.vertices })),
    stations: scene.resolveLegacyEdgeStations().map((s) => ({ id: s.id, x: s.x, y: s.y })),
    viewport: { width: scene.layout.width, height: scene.layout.height },
    visible: graphics.visible,
    worldIsIdentity: world.tx === 0 && world.ty === 0 && world.scaleX === 1 && world.scaleY === 1
  };
});

// Which diamonds are lit in a frame: the stroke colour differs from the idle
// colour (taken from a quiet baseline frame) AND the alpha is the energized one.
const litIds = (frame, idleColor) => frame.markers
  .map((marker, index) => (marker.color !== idleColor && marker.alpha >= ENERGIZED_ALPHA_FLOOR ? index : null))
  .filter((index) => index !== null);

const idleColorOf = (frame) => {
  const counts = new Map();
  frame.markers.forEach((marker) => counts.set(marker.color, (counts.get(marker.color) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const sameIds = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);

const markersInsideViewport = (frame) => frame.markers.length === 8 && frame.markers.every((marker) => (
  marker.vertices.length > 0 && marker.vertices.every((v) => v.x >= 0 && v.y >= 0 && v.x <= frame.viewport.width && v.y <= frame.viewport.height)
));

const previewAt = (page, x, y, newSession) => page.evaluate(
  ({ tx, ty, fresh }) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(tx, ty, fresh),
  { tx: x, ty: y, fresh: newSession === true }
);
const endPreview = (page) => page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());

const anchorMatchesStation = (frame, result) => {
  const station = frame.stations.find((s) => s.id === result.selectedId);
  return station !== undefined && result.pose !== null
    && Math.hypot(station.x - result.pose.anchorX, station.y - result.pose.anchorY) <= ANCHOR_STATION_TOLERANCE_PX;
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
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Deterministic start: wipe any persisted progression exactly once per
    // session (same pattern as scripts/visual/capture-maze-lifecycle.mjs).
    await context.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('__lifecycleInit')) {
          sessionStorage.setItem('__lifecycleInit', '1');
          localStorage.clear();
        }
      } catch {
        // storage unavailable
      }
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.previewTeleportPrimaryAnchor), { timeout: 15000 });
    await page.evaluate(() => window.__MAZER_GAME__.loop.stop());
    await installMarkerRecorder(page);

    const quiet = await stepToQuietSettled(page);
    check('the menu reaches a quiet settled state (build finished, no beam in flight, no transfer armed)', quiet.settled && quiet.mode === 'menu', JSON.stringify(quiet));

    // Fresh-progression gate (localStorage was cleared above): the self-playing
    // menu reads "AI Skill Lv 01"; the Player label is confirmed after Start.
    const readSkillLabels = () => page.evaluate(() => (document.documentElement.getAttribute('data-mazer-visual-diagnostics') || '').match(/(Player|AI) Skill Lv \d+/g));
    const menuLabels = await readSkillLabels();
    check('fresh progression: menu diagnostics read "AI Skill Lv 01"', Array.isArray(menuLabels) && menuLabels.includes('AI Skill Lv 01'), JSON.stringify(menuLabels));

    // Baseline frame: end-preview redraws the markers synchronously.
    await endPreview(page);
    const baseline = await readMarkerFrame(page);
    const idleColor = idleColorOf(baseline);
    check('all 8 station ids exist, in order', baseline.stations.length === 8 && baseline.stations.every((s, i) => s.id === STATION_IDS[i]), JSON.stringify(baseline.stations.map((s) => s.id)));
    check('exactly 8 diamonds are drawn, every vertex inside the viewport', baseline.visible && markersInsideViewport(baseline), JSON.stringify(baseline.markers.map((m) => m.vertices)));
    check('the markers are drawn in screen space (their Graphics world transform is identity)', baseline.worldIsIdentity, 'n/a');
    check(
      'the quiet baseline lights no diamond (all 8 share the idle colour at idle alpha)',
      litIds(baseline, idleColor).length === 0 && baseline.markers.every((m) => m.alpha < IDLE_ALPHA_CEILING),
      JSON.stringify(baseline.markers.map((m) => ({ color: m.color, alpha: m.alpha })))
    );

    // === Previewing lights exactly the selected identity's diamond ===
    const target = { x: 1260, y: 20 }; // near the top-right corner
    const result = await previewAt(page, target.x, target.y, true);
    const during = await readMarkerFrame(page);
    check('the selector actually chose an anchor for this target', result.selectedId !== null, JSON.stringify(result));
    check(
      "previewing lights EXACTLY the selected identity's own diamond and no other (synchronously, no frame step)",
      result.selectedId !== null && sameIds(litIds(during, idleColor), [result.selectedId]),
      `selectedId=${result.selectedId} lit=${JSON.stringify(litIds(during, idleColor))}`
    );
    check(
      "the lit diamond sits at the resolver's anchor for that identity (same edge/corner)",
      anchorMatchesStation(during, result),
      `station=${JSON.stringify(during.stations[result.selectedId])} pose=${JSON.stringify(result.pose)}`
    );
    check('all 8 diamonds are still drawn, inside the viewport, while one is lit', markersInsideViewport(during), 'n/a');
    await stepOnce(page);
    const afterFrame = await readMarkerFrame(page);
    check(
      'the preview survives a normal frame step (still exactly that one diamond)',
      result.selectedId !== null && sameIds(litIds(afterFrame, idleColor), [result.selectedId]),
      JSON.stringify(litIds(afterFrame, idleColor))
    );

    // === Ending the preview clears every lit diamond ===
    await endPreview(page);
    const cleared = await readMarkerFrame(page);
    check('ending the preview clears the lit diamond back to the idle baseline, synchronously', litIds(cleared, idleColor).length === 0, JSON.stringify(litIds(cleared, idleColor)));
    await stepOnce(page);
    const clearedAfterFrame = await readMarkerFrame(page);
    check('and it stays cleared across the next frame (ambient resumes)', litIds(clearedAfterFrame, idleColor).length === 0, JSON.stringify(litIds(clearedAfterFrame, idleColor)));

    // === Every identity the selector can choose lights its own diamond, one at a time ===
    const targets = [[20, 790], [640, 790], [1260, 790], [1270, 400], [10, 400], [640, 10], [20, 20], [1260, 20]];
    const seen = new Map();
    for (const [x, y] of targets) {
      // eslint-disable-next-line no-await-in-loop
      const r = await previewAt(page, x, y, true);
      // eslint-disable-next-line no-await-in-loop
      const frame = await readMarkerFrame(page);
      if (r.selectedId !== null) {
        seen.set(r.selectedId, sameIds(litIds(frame, idleColor), [r.selectedId]));
      }
    }
    await endPreview(page);
    check(
      'every identity the selector can choose lights exactly its own diamond (never a neighbour, never two)',
      seen.size >= 4 && [...seen.values()].every(Boolean),
      JSON.stringify([...seen.entries()])
    );
    check('the sweep leaves the diamonds idle once the preview ends', litIds(await readMarkerFrame(page), idleColor).length === 0, 'n/a');

    // === Real HUD-control exclusion (this scene's own live uiButtons, not a synthetic rect) ===
    const hudProbe = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const buttons = scene.uiButtons
        .map((b) => ({ x: b.bounds.left, y: b.bounds.top, width: b.bounds.width, height: b.bounds.height, semanticAction: b.semanticAction }))
        .filter((b) => b.width > 0 && b.height > 0);
      if (buttons.length === 0) {
        return { buttons, result: null };
      }
      const button = buttons[0];
      const targetX = button.x + (button.width / 2);
      const targetY = button.y + (button.height / 2);
      const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(targetX, targetY, true);
      return { buttons, button, result };
    });
    check('this scene has at least one real, currently-active HUD control (uiButtons) to test exclusion against', hudProbe.buttons.length > 0, `buttons=${JSON.stringify(hudProbe.buttons)}`);
    if (hudProbe.buttons.length > 0) {
      const rejectedNearButton = hudProbe.result.rejected.some((r) => r.reason.includes('excluded region'));
      check(
        `a target placed on a real HUD control (${hudProbe.button.semanticAction ?? 'unnamed'}) causes at least one anchor to be excluded by a real (non-safe-area) rectangle`,
        rejectedNearButton,
        JSON.stringify(hudProbe.result.rejected)
      );
    }
    await endPreview(page);

    // === Session retention: held anchor survives a target change; newSession starts fresh ===
    const sessionStart = await previewAt(page, 20, 700, true);
    const startFrame = await readMarkerFrame(page);
    check('session start selects a real anchor', sessionStart.selectedId !== null, JSON.stringify(sessionStart));

    // A target now much closer to a different anchor -- the real selector's
    // own retention rule must keep the held anchor anyway.
    const sessionContinued = await previewAt(page, 1260, 20, false);
    const continuedFrame = await readMarkerFrame(page);
    check(
      'continuing the same session (no newSession flag) retains the held anchor even though a different one is now much closer',
      sessionContinued.outcome === 'retained' && sessionContinued.selectedId === sessionStart.selectedId,
      `start=${sessionStart.selectedId} continued=${JSON.stringify(sessionContinued)}`
    );
    check(
      'the retained session keeps the SAME diamond lit (and only it)',
      sameIds(litIds(startFrame, idleColor), [sessionStart.selectedId]) && sameIds(litIds(continuedFrame, idleColor), [sessionStart.selectedId]),
      `start=${JSON.stringify(litIds(startFrame, idleColor))} continued=${JSON.stringify(litIds(continuedFrame, idleColor))}`
    );

    const sessionReset = await previewAt(page, 1260, 20, true);
    const resetFrame = await readMarkerFrame(page);
    check(
      "newSession: true starts a genuinely fresh selection instead of retaining the prior session's held anchor",
      sessionReset.outcome === 'new' && sessionReset.selectedId !== sessionStart.selectedId,
      `start=${sessionStart.selectedId} reset=${JSON.stringify(sessionReset)}`
    );
    check(
      'the lit diamond MOVES to the new identity (the old one goes dark: one representative per identity, no orphan)',
      sameIds(litIds(resetFrame, idleColor), [sessionReset.selectedId]) && sessionReset.selectedId !== sessionStart.selectedId,
      `reset=${sessionReset.selectedId} lit=${JSON.stringify(litIds(resetFrame, idleColor))}`
    );
    await endPreview(page);
    check('ending that session clears it too', litIds(await readMarkerFrame(page), idleColor).length === 0, 'n/a');

    // === Reduced-motion, settled-scene preview updates ===
    // NO frame step between any of these calls and reading their effect: this
    // scene's reduced-motion path has no guaranteed next frame, so begin /
    // update / end must each redraw the markers synchronously. Markers are
    // completely static under reduced motion (edgeMarkers.ts: nothing
    // animates, so nothing lights up either).
    const reducedMotionProbe = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const rec = window.__mazerEdgeRec;
      const original = scene.prefersLegacyReducedMotion;
      scene.prefersLegacyReducedMotion = () => true;
      const read = () => ({ clears: rec.clears, alphas: rec.frame.map((m) => m.alpha), colors: rec.frame.map((m) => m.color) });
      const c0 = rec.clears;
      const begin = window.__MAZER_QA__.previewTeleportPrimaryAnchor(20, 20, true);
      const afterBegin = read();
      const update = window.__MAZER_QA__.previewTeleportPrimaryAnchor(1260, 20);
      const afterUpdate = read();
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      const afterEnd = read();
      scene.prefersLegacyReducedMotion = original;
      return { c0, begin: { selectedId: begin.selectedId }, update: { selectedId: update.selectedId }, afterBegin, afterUpdate, afterEnd };
    });
    check(
      'reduced motion, settled scene, NO frame step: begin / update / end each redraw the markers immediately',
      reducedMotionProbe.begin.selectedId !== null
        && reducedMotionProbe.afterBegin.clears === reducedMotionProbe.c0 + 1
        && reducedMotionProbe.afterUpdate.clears === reducedMotionProbe.c0 + 2
        && reducedMotionProbe.afterEnd.clears === reducedMotionProbe.c0 + 3,
      JSON.stringify(reducedMotionProbe)
    );
    const rmStatic = [reducedMotionProbe.afterBegin, reducedMotionProbe.afterUpdate, reducedMotionProbe.afterEnd].every((frame) => (
      frame.colors.length === 8
      && frame.colors.every((color) => color === frame.colors[0])
      && frame.alphas.every((alpha) => alpha === frame.alphas[0])
    ));
    check('reduced motion: the markers stay completely static (all 8 identical, nothing lit) through begin / update / end', rmStatic, JSON.stringify(reducedMotionProbe));
    await stepOnce(page);

    // === Real play-control clearance ===
    // Distinguishes the fixed pause-button hit region (always real when
    // touch controls should render) from an ACTIVE floating stick's own
    // transient footprint (real only while a drag is genuinely in
    // progress) -- and confirms the much larger whole-canvas gesture
    // surface is NOT itself an exclusion (selection must still succeed).
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    const playQuiet = await stepToQuietSettled(page);
    check('play mode reaches a quiet settled state once the real intro unlocks input', playQuiet.settled && playQuiet.mode === 'play', JSON.stringify(playQuiet));
    const playLabels = await readSkillLabels();
    check('fresh progression: play diagnostics read "Player Skill Lv 01"', Array.isArray(playLabels) && playLabels.includes('Player Skill Lv 01'), JSON.stringify(playLabels));
    const touchControlProbe = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const touchControlLayout = scene.resolveLegacyPlayTouchControlLayout();
      const pause = touchControlLayout.controls.pause;
      // A target placed exactly on the real, fixed pause-button bounds.
      const pauseResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(
        pause.left + (pause.width / 2),
        pause.top + (pause.height / 2),
        true
      );
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      // An active floating stick mounted right where anchor 1 (top-mid)
      // sits, so its real footprint genuinely overlaps that anchor.
      scene.playFloatingStickOrigin = { x: 640, y: 16 };
      const stickResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(640, 16, true);
      const stickRejectedAnchor1 = stickResult.rejected.some((r) => r.reason.includes('excluded region'));
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      scene.playFloatingStickOrigin = null;

      // The same target with NO active stick -- anchor 1 must be selectable
      // once the transient footprint is gone.
      const noStickResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(640, 16, true);
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      // The gesture-capture surface itself (the whole canvas, no active
      // stick) must NOT make every anchor ineligible -- an ordinary
      // in-canvas target still resolves normally.
      const ordinaryResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(scene.layout.width / 2, scene.layout.height / 2, true);
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      return { pause, pauseResult, stickRejectedAnchor1, noStickResult, ordinaryResult };
    });
    check(
      'a target on the real, fixed pause-button bounds is genuinely excluded',
      touchControlProbe.pauseResult.rejected.some((r) => r.reason.includes('excluded region')),
      JSON.stringify(touchControlProbe.pauseResult)
    );
    check(
      "an active floating stick's real footprint genuinely excludes the anchor it overlaps",
      touchControlProbe.stickRejectedAnchor1,
      JSON.stringify(touchControlProbe)
    );
    check(
      'once the stick is no longer active, the same anchor becomes selectable again -- a transient control, not a permanent exclusion',
      touchControlProbe.noStickResult.selectedId === 1,
      JSON.stringify(touchControlProbe.noStickResult)
    );
    check(
      'the whole-canvas gesture-capture surface is NOT itself an exclusion -- an ordinary target still resolves to a real anchor',
      touchControlProbe.ordinaryResult.selectedId !== null,
      JSON.stringify(touchControlProbe.ordinaryResult)
    );

    // === Settled Active Play: same lit-diamond behaviour; Navigation Core unaffected ===
    await endPreview(page);
    const playBaseline = await readMarkerFrame(page);
    const playIdle = idleColorOf(playBaseline);
    check(
      'play mode: 8 diamonds drawn inside the viewport, none lit before the preview',
      playBaseline.visible && markersInsideViewport(playBaseline) && litIds(playBaseline, playIdle).length === 0,
      JSON.stringify(playBaseline.markers.map((m) => ({ c: m.color, a: m.alpha })))
    );
    const playPreview = await previewAt(page, 20, 20, true);
    const playFrame = await readMarkerFrame(page);
    check(
      'the preview also lights exactly the selected diamond while in settled Active Play, not only Main Menu',
      playPreview.selectedId !== null && sameIds(litIds(playFrame, playIdle), [playPreview.selectedId]),
      `selectedId=${playPreview.selectedId} lit=${JSON.stringify(litIds(playFrame, playIdle))}`
    );
    await stepOnce(page);
    await endPreview(page);
    check('ending the preview in play clears the lit diamond', litIds(await readMarkerFrame(page), playIdle).length === 0, 'n/a');
    await stepOnce(page);
    const navCoreState = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      return {
        mode: scene.mode,
        trailCanvasExists: Boolean(scene.trailCanvasImage),
        playerGlowExists: Boolean(scene.playerGlowCanvasImage),
        boardTileLayerExists: Boolean(scene.boardTileLayer && scene.boardTileLayer.image)
      };
    });
    check(
      "Navigation Core's trail/player-glow canvas layers and the baked board tile layer are unaffected",
      navCoreState.mode === 'play' && navCoreState.trailCanvasExists && navCoreState.playerGlowExists && navCoreState.boardTileLayerExists,
      JSON.stringify(navCoreState)
    );

    check('no page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | '));

    await context.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const failed = checks.filter((c) => !c.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
