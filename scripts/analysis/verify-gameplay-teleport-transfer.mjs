/**
 * Wave 4D-B: permanent real-browser verification for the gameplay Teleport
 * transfer presentation in the ONE procedural edge-diamond system
 * (src/render/edgeMarkers.ts + src/render/introTimeline.ts, driven by
 * src/scenes/MenuScene.ts). Drives the actual built game via Playwright --
 * no mock, no reimplementation of the scene's own logic.
 *
 * The retired art this script used to assert (a single held "primary" shell
 * diamond, the gameplay-transfer conduit canvas, the strip-beam image pool,
 * the title-orbit sigil images) no longer exists. The PRODUCT behaviour is
 * unchanged in intent and is verified here against what the scene really
 * draws now:
 *
 *   - ARRIVAL (Start, and the maze-to-maze arrival after a goal): ALL 8
 *     edge diamonds fire a beam INWARD to the spawn tile (every beam starts at
 *     its own diamond, all 8 are in flight together, they converge on the
 *     spawn tile, the diamond brightens while its beam fires) -- but ONLY AFTER
 *     the maze build is complete (the diamonds orbit, lit, during the build);
 *     the player appears at the beam landing and input unlocks there, 500 ms
 *     + the build length after the intro began;
 *   - DEPARTURE (goal reached -> deconstruct): the player fires a beam OUTWARD
 *     to ALL 8 diamonds, then the maze dissolves and the next maze arrives;
 *   - the transfer lifecycle still runs outbound -> stored -> delivering ->
 *     complete -> input unlocked again, via real accepted moves only;
 *   - reduced motion: no beams at all, nothing lights up, 250 ms unlock;
 *   - compact/touch layout: the same, with the diamonds inside a 390x844 viewport;
 *   - the ring of 8 diamonds is parked on its stations while any beam fires, circulates the
 *     perimeter during the build/deconstruct lap, and is exactly back on its stations at the end
 *     (static in reduced motion);
 *   - pause freezes the beams, the intro/outro clocks and the coupled maze
 *     lifecycle, and resume neither races ahead nor loses the intro time;
 *   - ordinary movement is LOCKED through every maze build (plus negative controls).
 *
 * How it observes the scene (all read-only, no scene change needed): it spies
 * on the real spawnLaserGraphics.lineBetween calls (the beam geometry the
 * player sees), on the real edgeMarkerGraphics draw calls (which diamonds are
 * lit and where), on playerSpawnBurstGraphics.lineBetween (the retired
 * per-sigil volley must stay silent), and reads the scene's own
 * edgeBeamFiringIds / resolveLegacyIntroState / resolveLegacyOutroState /
 * resolveLegacyPlayerTransferState. Beam geometry is cross-checked against the
 * scene's own firing set, never trusted alone.
 *
 * Determinism: localStorage is cleared once per session, the "Player Skill
 * Lv 01" diagnostics label is confirmed after Start, the RAF loop is stopped
 * and the scene is stepped on a manual 16 ms clock, and every wait is on scene
 * state (input unlocked / cycle complete), never a fixed frame count.
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

// introTimeline.ts nominal numbers, mirrored here as the ACCEPTANCE contract
// (the scene must meet these; they are deliberately not imported). The reveal
// length is a pure function of the tile count N:
//   buildMs(N) = clamp(N / 70 tiles/s, 2000, 3200); build 100 .. 100 + buildMs, then the beams (400 ms), unlock at 500 + buildMs
//   removeMs(N) = clamp(N / 70 tiles/s, 1800, 3000); the deconstruct is 400 + removeMs + 300
const introBuildMs = (tiles) => Math.max(2000, Math.min(3200, (tiles / 70) * 1000));
const INTRO_BUILD_START_MS = 100;
const INTRO_BEAM_FLIGHT_MS = 400;
// The build runs 100 ms .. 100 + buildMs; the beams fire from the build END and land 400 ms later, where input unlocks.
const introBuildEndMs = (tiles) => INTRO_BUILD_START_MS + introBuildMs(tiles);
const introLaserEndMs = (tiles) => introBuildEndMs(tiles) + INTRO_BEAM_FLIGHT_MS;
const introUnlockMs = (tiles) => introLaserEndMs(tiles);
const outroTotalMs = (tiles) => 400 + Math.max(1800, Math.min(3000, (tiles / 70) * 1000)) + 300;
const INTRO_REDUCED_UNLOCK_MS = 250;
const RING_FADE_MS = 150;
const FRAME_MS = 16;
const UNLOCK_TOLERANCE_MS = FRAME_MS * 2;
const OUTRO_LASER_END_MS = 400;
const ALL_STATION_IDS = [0, 1, 2, 3, 4, 5, 6, 7];
// A diamond counts as lit when its stroke alpha is above the idle breathing maximum (0.6).
const LIT_ALPHA_FLOOR = 0.62;
// The diamond ring ORBITS the viewport perimeter (resolveOrbitingEdgeStations) and never leaves the viewport at any phase.
// Vertices are compared without their half-pixel stroke, so a flush kite sits at 0.5 px; allow a hair of float slack only.
const ORBIT_CLIP_TOLERANCE_PX = 0.01;
// The ring is parked (exact rest layout) while beams fly and after the lap; it must visibly travel in between.
const RING_PARKED_TOLERANCE_PX = 0.5;
const RING_MIN_TRAVEL_PX = 20;

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * In-page harness, installed once per page. Everything it records comes from
 * the scene's REAL draw calls and state:
 *  - spawnLaserGraphics.lineBetween  -> the beam geometry (glow+core pairs, then poof sparkles)
 *  - edgeMarkerGraphics draw calls   -> which diamonds are lit, and where they are
 *  - playerSpawnBurstGraphics.lineBetween -> the retired per-sigil volley (must stay 0)
 * and exposes stepFrames / stepUntil on the shared manual 16 ms clock.
 */
const installHarness = (page) => page.evaluate(() => {
  const getScene = () => window.__MAZER_GAME__.scene.getScene('MenuScene');
  const initial = getScene();

  const laser = { lines: [] };
  const volley = { count: 0 };
  const edge = { frame: [], style: null, vertices: [] };
  const wrap = (graphics, names, handler) => {
    for (const name of names) {
      const original = graphics[name].bind(graphics);
      graphics[name] = (...args) => {
        handler(name, args);
        return original(...args);
      };
    }
  };
  wrap(initial.spawnLaserGraphics, ['clear', 'lineBetween'], (name, args) => {
    if (name === 'clear') { laser.lines = []; } else { laser.lines.push([args[0], args[1], args[2], args[3]]); }
  });
  wrap(initial.playerSpawnBurstGraphics, ['lineBetween'], () => { volley.count += 1; });
  wrap(initial.edgeMarkerGraphics, ['clear', 'lineStyle', 'beginPath', 'moveTo', 'lineTo', 'strokePath'], (name, args) => {
    if (name === 'clear') { edge.frame = []; }
    else if (name === 'lineStyle') { edge.style = { alpha: args[2] }; }
    else if (name === 'beginPath') { edge.vertices = []; }
    else if (name === 'moveTo' || name === 'lineTo') { edge.vertices.push({ x: args[0], y: args[1] }); }
    else if (name === 'strokePath') { edge.frame.push({ alpha: edge.style?.alpha ?? 0, vertices: edge.vertices.slice() }); }
  });

  const state = { clock: initial.time.now, sawDelivering: false };

  // Screen-space centre of a maze tile, computed with the scene's OWN render
  // frame and board offset (the same inputs drawDynamicBoard feeds the beams).
  const tileCenter = (scene, point) => {
    const offset = scene.resolveBoardOffset();
    const layout = scene.layout;
    const frame = scene.resolveLegacyMazeRenderFrame(layout.boardLeft + offset.x, layout.boardTop + offset.y, layout.boardWidth, layout.boardHeight);
    const container = scene.boardZoomContainer;
    return {
      x: container.x + ((frame.boardLeft + ((point.x + 0.5) * frame.tileSize)) * container.scaleX),
      y: container.y + ((frame.boardTop + ((point.y + 0.5) * frame.tileSize)) * container.scaleY),
      tile: frame.tileSize * container.scaleX
    };
  };

  const isUnlocked = (scene) => scene.mode === 'play' && scene.menuStaticDrawLifecyclePhase === 'settled' && !scene.isLegacyPlayLifecycleInputLocked();

  const sample = () => {
    const scene = getScene();
    const t = scene.time.now;
    const intro = scene.resolveLegacyIntroState(t);
    const outro = scene.resolveLegacyOutroState(t);
    const transfer = scene.resolveLegacyPlayerTransferState(t).phase;
    if (transfer === 'delivering') { state.sawDelivering = true; }
    const firing = Array.from(scene.edgeBeamFiringIds).sort((a, b) => a - b);
    const lines = laser.lines;
    const focus = tileCenter(scene, scene.player);
    const sparkleMids = firing.length === 0 && lines.length > 0
      ? lines.map((l) => ({ x: (l[0] + l[2]) / 2, y: (l[1] + l[3]) / 2 }))
      : [];
    return {
      t,
      mode: scene.mode,
      overlay: scene.overlay,
      drawPhase: scene.menuStaticDrawLifecyclePhase,
      locked: scene.isLegacyPlayLifecycleInputLocked(),
      introAge: scene.introStartedAtMs === null ? null : t - scene.introStartedAtMs,
      introActive: intro !== null,
      outroAge: outro !== null && scene.menuStaticDeconstructStartedAtMs !== null ? t - scene.menuStaticDeconstructStartedAtMs : null,
      laserProgress: intro !== null ? intro.laserProgress : (outro !== null ? outro.laserProgress : null),
      transfer,
      armed: scene.playerTransferEnergyArmed,
      firing,
      lineCount: lines.length,
      beamPairs: firing.length > 0 ? lines.filter((_, index) => index % 2 === 0) : [],
      sparkleMids,
      focus,
      stations: scene.resolveLegacyEdgeStations().map((s) => ({ id: s.id, x: s.x, y: s.y })),
      lit: edge.frame.map((marker, index) => (marker.alpha > 0.62 ? index : null)).filter((index) => index !== null),
      tiles: scene.menuStaticDrawTileOrder.length,
      // Tiles currently shown (null = no limit = the whole maze), and whether the player marker is revealed yet.
      tilesVisible: scene.menuStaticDrawTilesVisible === null ? scene.menuStaticDrawTileOrder.length : scene.menuStaticDrawTilesVisible,
      playerReveal: scene.resolveLegacyPlayerSpawnBurstState(t).markerRevealAlpha,
      markerCount: edge.frame.length,
      // Kite centroid (the ring orbits the perimeter, so it moves during the intro/outro lap and is exactly parked otherwise).
      ring: edge.frame.map((marker) => (marker.vertices.length === 0 ? null : { x: marker.vertices.reduce((s, v) => s + v.x, 0) / marker.vertices.length, y: marker.vertices.reduce((s, v) => s + v.y, 0) / marker.vertices.length })),
      markerBounds: (() => {
        const all = edge.frame.flatMap((marker) => marker.vertices);
        return all.length === 0 ? null : {
          minX: Math.min(...all.map((v) => v.x)),
          minY: Math.min(...all.map((v) => v.y)),
          maxX: Math.max(...all.map((v) => v.x)),
          maxY: Math.max(...all.map((v) => v.y))
        };
      })(),
      player: { x: scene.player.x, y: scene.player.y },
      start: { x: scene.maze.start.x, y: scene.maze.start.y }
    };
  };

  const conditions = {
    unlocked: (scene) => isUnlocked(scene),
    introAgeAtLeast: (scene, value) => scene.introStartedAtMs !== null && (scene.time.now - scene.introStartedAtMs) >= value,
    outroAgeAtLeast: (scene, value) => scene.menuStaticDrawLifecyclePhase === 'deconstructing' && scene.menuStaticDeconstructStartedAtMs !== null && (scene.time.now - scene.menuStaticDeconstructStartedAtMs) >= value,
    transferPhase: (scene, value) => scene.resolveLegacyPlayerTransferState(scene.time.now).phase === value,
    // 'complete' resets to 'idle' within the same update() it first appears
    // in, so completion is observed as: delivering seen, then idle + unlocked.
    cycleComplete: (scene) => state.sawDelivering && scene.resolveLegacyPlayerTransferState(scene.time.now).phase === 'idle' && isUnlocked(scene)
  };

  const step = () => {
    state.clock += 16;
    window.__MAZER_GAME__.loop.step(state.clock);
    return sample();
  };

  window.__mazerQa = {
    stepFrames: (count) => {
      const frames = [];
      for (let i = 0; i < count; i += 1) { frames.push(step()); }
      return frames;
    },
    stepUntil: (name, value, maxFrames) => {
      const frames = [];
      for (let i = 0; i < maxFrames; i += 1) {
        frames.push(step());
        if (conditions[name](getScene(), value)) { return { met: true, frames }; }
      }
      return { met: false, frames };
    },
    sampleNow: () => sample(),
    volleyCount: () => volley.count,
    resetVolley: () => { volley.count = 0; },
    resetCycleWatch: () => { state.sawDelivering = false; },
    stations: () => getScene().resolveLegacyEdgeStations().map((s) => ({ id: s.id, x: s.x, y: s.y })),
    viewport: () => ({ width: getScene().layout.width, height: getScene().layout.height })
  };
});

/** Opens a real game context/page, stops the RAF loop and installs the harness. */
const openGameContext = async (browser, baseUrl, contextOptions) => {
  const context = await browser.newContext(contextOptions);
  // Deterministic start: wipe persisted progression exactly once per session
  // (same pattern as scripts/visual/capture-maze-lifecycle.mjs).
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
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
  await page.evaluate(() => window.__MAZER_GAME__.loop.stop());
  await installHarness(page);

  const stepFrames = (count) => page.evaluate((n) => window.__mazerQa.stepFrames(n), count);
  const stepOnce = async () => { await stepFrames(1); };
  const stepN = async (n) => { await stepFrames(n); };
  const stepBatch = stepN;
  const stepUntil = (name, value, maxFrames) => page.evaluate(({ n, v, m }) => window.__mazerQa.stepUntil(n, v, m), { n: name, v: value, m: maxFrames });
  const sampleNow = () => page.evaluate(() => window.__mazerQa.sampleNow());
  const readVolley = () => page.evaluate(() => window.__mazerQa.volleyCount());

  return { context, page, pageErrors, stepOnce, stepN, stepBatch, stepFrames, stepUntil, sampleNow, readVolley };
};

/** Presses Start from a settled menu (a user cannot press it earlier) and returns the press instant. */
const pressStartFromMenu = async (h) => {
  await h.stepFrames(150);
  const started = await h.page.evaluate(() => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const result = window.__MAZER_QA__.startPlayMode();
    return { accepted: result?.accepted === true, pressedAtMs: scene.time.now };
  });
  return started;
};

const readSkillLabels = (page) => page.evaluate(() => (document.documentElement.getAttribute('data-mazer-visual-diagnostics') || '').match(/(Player|AI) Skill Lv \d+/g));

const nearPoint = (a, b, tolerance) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;

/**
 * Which station a beam line belongs to, by geometry alone.
 *   inward : the beam STARTS on a station (diamond -> spawn)
 *   outward: the beam starts at the focus and points at a station (player -> diamond)
 */
const beamStationId = (pair, stations, focus, direction) => {
  const from = { x: pair[0], y: pair[1] };
  if (direction === 'inward') {
    return stations.find((s) => nearPoint(s, from, 0.75))?.id ?? null;
  }
  if (!nearPoint(focus, from, Math.max(2, focus.tile * 0.75))) {
    return null;
  }
  const vx = pair[2] - pair[0];
  const vy = pair[3] - pair[1];
  const vLen = Math.hypot(vx, vy);
  if (vLen < 1e-6) {
    return null;
  }
  return stations.find((s) => {
    const wx = s.x - pair[0];
    const wy = s.y - pair[1];
    const wLen = Math.hypot(wx, wy);
    return wLen > 0 && Math.abs((vx * wy) - (vy * wx)) / (vLen * wLen) < 0.01 && ((vx * wx) + (vy * wy)) > 0 && vLen <= wLen + 0.75;
  })?.id ?? null;
};

/**
 * The ring lighting contract (live audit findings 4 and 6), checked on every frame:
 *  - arrival (inward): ALL 8 diamonds are lit from the start of the build (the ring orbits, lit) through
 *    the beam flight until the landing; after the intro is over none is lit.
 *  - departure (outward): a diamond is lit once the player's beam has REACHED it, and all stay lit
 *    until the lighting fades in the last RING_FADE_MS of the deconstruct.
 */
const analyzeLighting = (frames, direction) => {
  const firstFiring = new Map();
  let ok = true;
  const problems = [];
  let allLitFrames = 0;
  let litAfterEnd = 0;
  frames.forEach((frame, index) => {
    frame.firing.forEach((id) => { if (!firstFiring.has(id)) { firstFiring.set(id, index); } });
    if (direction === 'inward') {
      // Reordered intro: ALL 8 are lit through the whole build and the beam flight (first 2 frames = draw slack), not
      // only after their beam leaves.
      if (frame.introActive && frame.introAge !== null && frame.introAge >= 2 * FRAME_MS && frame.lit.length !== 8
        && frame.introAge < introLaserEndMs(frame.tiles)) {
        ok = false; problems.push({ index, lit: frame.lit, why: 'not all 8 lit during the build/arrival' });
      }
      if (firstFiring.size === 8 && frame.lit.length === 8) { allLitFrames += 1; }
    } else {
      for (const [id, start] of firstFiring) {
        const landed = !frame.firing.includes(id) && index > start;
        const fadeStart = frame.outroAge !== null && frame.tiles > 0 ? outroTotalMs(frame.tiles) - RING_FADE_MS : Number.POSITIVE_INFINITY;
        if (landed && frame.outroAge !== null && frame.outroAge < fadeStart - FRAME_MS && !frame.lit.includes(id)) { ok = false; problems.push({ index, id, why: 'unlit after its beam landed' }); }
        if (frame.firing.includes(id) && frame.lit.includes(id) && index - start < 2) { /* a beam that just left may already be rising; allowed */ }
      }
      if (firstFiring.size === 8 && frame.lit.length === 8) { allLitFrames += 1; }
    }
  });
  return { ok: ok && allLitFrames > 0, allLitFrames, litAfterEnd, problems: problems.slice(0, 3) };
};

/**
 * Analyses every frame in which the scene reported a beam in flight.
 * `direction`: 'inward' (diamonds -> spawn) or 'outward' (player -> diamonds).
 */
const analyzeBeams = (frames, _unusedMenuStations, direction) => {
  const beamFrames = frames.filter((f) => f.firing.length > 0);
  const sceneIds = new Set();
  const geometryIds = new Set();
  const lastTip = new Map();
  let geometryMatchesScene = true;
  let pairCountMatchesScene = true;
  let wrongDirectionPairs = 0;
  let maxConcurrent = 0;
  let firstAge = null;
  let lastAge = null;
  const opposite = direction === 'inward' ? 'outward' : 'inward';
  for (const frame of beamFrames) {
    frame.firing.forEach((id) => sceneIds.add(id));
    maxConcurrent = Math.max(maxConcurrent, frame.firing.length);
    const stations = frame.stations;
    const ids = frame.beamPairs.map((pair) => beamStationId(pair, stations, frame.focus, direction));
    if (frame.beamPairs.length !== frame.firing.length) { pairCountMatchesScene = false; }
    if (ids.some((id) => id === null) || !sameList(ids.slice().sort((a, b) => a - b), frame.firing)) { geometryMatchesScene = false; }
    ids.forEach((id) => { if (id !== null) { geometryIds.add(id); } });
    frame.beamPairs.forEach((pair, index) => {
      if (ids[index] !== null) { lastTip.set(ids[index], { tip: { x: pair[2], y: pair[3] }, focus: frame.focus, station: stations.find((s) => s.id === ids[index]) }); }
      if (beamStationId(pair, stations, frame.focus, opposite) !== null) { wrongDirectionPairs += 1; }
    });
    const age = direction === 'inward' ? frame.introAge : frame.outroAge;
    if (age !== null) {
      firstAge = firstAge === null ? age : Math.min(firstAge, age);
      lastAge = lastAge === null ? age : Math.max(lastAge, age);
    }
  }
  // Each beam must end near its far end: the spawn (inward) or its diamond (outward).
  let tipsReachFarEnd = lastTip.size === 8;
  for (const [id, entry] of lastTip) {
    const station = entry.station;
    const total = dist(station, entry.focus);
    const remaining = direction === 'inward' ? dist(entry.tip, entry.focus) : dist(entry.tip, station);
    if (!(total > 0 && remaining <= total * 0.1)) { tipsReachFarEnd = false; }
  }
  return {
    beamFrameCount: beamFrames.length,
    sceneIds: Array.from(sceneIds).sort((a, b) => a - b),
    geometryIds: Array.from(geometryIds).sort((a, b) => a - b),
    geometryMatchesScene,
    pairCountMatchesScene,
    wrongDirectionPairs,
    lighting: analyzeLighting(frames, direction),
    maxConcurrent,
    firstAge,
    lastAge,
    tipsReachFarEnd
  };
};

/** The poof where the inward beams converge must sit on the spawn tile. */
const poofConvergesOnSpawn = (frames) => {
  const poof = frames.filter((f) => f.firing.length === 0 && f.sparkleMids.length > 0 && f.introAge !== null);
  if (poof.length === 0) { return { found: false, ok: false }; }
  return {
    found: true,
    ok: poof.every((f) => {
      const cx = f.sparkleMids.reduce((sum, p) => sum + p.x, 0) / f.sparkleMids.length;
      const cy = f.sparkleMids.reduce((sum, p) => sum + p.y, 0) / f.sparkleMids.length;
      return Math.hypot(cx - f.focus.x, cy - f.focus.y) <= f.focus.tile * 0.6;
    })
  };
};

/** First settled+unlocked frame of an intro, with the age it unlocked at and whether the frame before it was still locked. */
const findUnlock = (frames) => {
  const index = frames.findIndex((f) => f.drawPhase === 'settled' && !f.locked && f.mode === 'play');
  if (index < 0) { return null; }
  return { age: frames[index].introAge, previousLocked: index === 0 ? true : frames[index - 1].locked, index };
};

const ringBase = (frames) => frames.find((f) => f.ring.length === 8 && f.ring.every(Boolean));

/** Max distance any diamond centroid in `frames` is from its centroid in `base` (the rest layout frame). */
const ringDriftFrom = (base, frames) => {
  if (!base) { return Number.POSITIVE_INFINITY; }
  let max = 0;
  for (const f of frames) {
    f.ring.forEach((point, index) => {
      if (point) { max = Math.max(max, Math.hypot(point.x - base.ring[index].x, point.y - base.ring[index].y)); }
    });
  }
  return max;
};

const markersInsideViewport = (frame, viewport) => (
  frame.markerCount === 8 && frame.markerBounds !== null
  && frame.markerBounds.minX >= -ORBIT_CLIP_TOLERANCE_PX && frame.markerBounds.minY >= -ORBIT_CLIP_TOLERANCE_PX
  && frame.markerBounds.maxX <= viewport.width + ORBIT_CLIP_TOLERANCE_PX && frame.markerBounds.maxY <= viewport.height + ORBIT_CLIP_TOLERANCE_PX
);

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

/**
 * The coupled Play-mode maze reveal/deconstruct lifecycle state -- what a
 * pause must hold still ALONGSIDE the transfer's own frozen clocks
 * (ChatGPT-assisted review 5173052153: the submitted pause recording
 * showed corridor tiles disappearing while the pause menu stayed open).
 * `revealedTileCount` is the actually-visible walkable-tile count, the
 * exact thing that visibly changed between the reviewer's two paused
 * frames.
 */
const readBoardProgress = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  let revealed = 0;
  for (let y = 0; y < scene.maze.height; y += 1) {
    for (let x = 0; x < scene.maze.width; x += 1) {
      if (scene.maze.grid[y][x] && scene.isLegacyMenuPointVisibleInStaticDraw({ x, y })) { revealed += 1; }
    }
  }
  return {
    drawPhase: scene.menuStaticDrawLifecyclePhase,
    rowsVisible: scene.menuStaticDrawRowsVisible,
    tilesVisible: scene.menuStaticDrawTilesVisible,
    revealedTileCount: revealed,
    mazeStartKey: `${scene.maze.start.x},${scene.maze.start.y}`,
    generationPending: scene.pendingGenerationRequest !== null,
    resetPending: scene.pendingResetRequest !== null
  };
});

const boardProgressFrozen = (a, b) => (
  a.drawPhase === b.drawPhase
  && a.rowsVisible === b.rowsVisible
  && a.tilesVisible === b.tilesVisible
  && a.revealedTileCount === b.revealedTileCount
  && a.mazeStartKey === b.mazeStartKey
  && a.generationPending === b.generationPending
  && a.resetPending === b.resetPending
);

/** Calls the REAL production wrap-aware solver via the QA surface and converts its path into real move_* commands. Returns null if no path was found or a step couldn't be converted. */
const solveMazeToMoveSequence = async (page) => {
  const result = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
  if (!result?.found || !Array.isArray(result.path) || result.path.length < 2) {
    return null;
  }
  return pathToMoveSequence(result.path);
};

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

const readStations = (page) => page.evaluate(() => ({ stations: window.__mazerQa.stations(), viewport: window.__mazerQa.viewport() }));

/** A real legal move from the player's current tile (a walkable neighbour), or null. */
const resolveLegalMove = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const p = scene.player;
  const grid = scene.maze.grid;
  const opts = [
    { m: 'move_up', x: p.x, y: p.y - 1 }, { m: 'move_down', x: p.x, y: p.y + 1 },
    { m: 'move_left', x: p.x - 1, y: p.y }, { m: 'move_right', x: p.x + 1, y: p.y }
  ];
  return opts.find((o) => grid[o.y]?.[o.x] === true)?.m ?? null;
});

/**
 * ARRIVAL assertions (Start, or the maze-to-maze arrival): ALL 8 diamonds
 * fire a beam inward to the spawn tile, then input unlocks ~1.2 s after the
 * intro began. `frames` are the recorded frames of ONE build.
 */
const assertArrival = (label, frames, stations, { reducedMotion = false, viewport = null } = {}) => {
  const buildFrames = frames.slice(Math.max(0, frames.findIndex((f) => f.introActive)));
  const unlock = findUnlock(buildFrames);
  if (reducedMotion) {
    check(`${label}: reduced motion draws NO beam at all (no laser, no poof) during the whole build`, buildFrames.every((f) => f.firing.length === 0 && f.lineCount === 0), JSON.stringify(buildFrames.filter((f) => f.lineCount > 0).slice(0, 2)));
    check(`${label}: reduced motion never lights a diamond (the ring is completely static)`, buildFrames.every((f) => f.lit.length === 0 && f.markerCount === 8), JSON.stringify(buildFrames.filter((f) => f.lit.length > 0).slice(0, 2)));
    check(
      `${label}: reduced-motion input unlocks at ~${INTRO_REDUCED_UNLOCK_MS} ms into the build, not before`,
      unlock !== null && unlock.previousLocked && unlock.age >= INTRO_REDUCED_UNLOCK_MS && unlock.age < INTRO_REDUCED_UNLOCK_MS + UNLOCK_TOLERANCE_MS,
      JSON.stringify(unlock)
    );
    return;
  }
  const a = analyzeBeams(buildFrames, stations, 'inward');
  check(`${label}: ALL 8 diamonds fire a beam (the scene's own firing set covers stations 0-7)`, sameList(a.sceneIds, ALL_STATION_IDS), JSON.stringify(a));
  check(
    `${label}: the drawn beam geometry agrees -- every beam STARTS on its own diamond (inward, diamond -> spawn), all 8 identified, count matches the scene's firing set every frame`,
    sameList(a.geometryIds, ALL_STATION_IDS) && a.geometryMatchesScene && a.pairCountMatchesScene,
    JSON.stringify(a)
  );
  check(`${label}: no arrival beam is drawn outward from the spawn (wrong-direction pairs = 0)`, a.wrongDirectionPairs === 0, `wrongDirectionPairs=${a.wrongDirectionPairs}`);
  check(`${label}: all 8 beams are in flight together at least once (not one at a time)`, a.maxConcurrent === 8, `maxConcurrent=${a.maxConcurrent}`);
  check(`${label}: every beam converges on the spawn tile (its last drawn tip is within 10% of the way to it)`, a.tipsReachFarEnd, JSON.stringify(a));
  check(`${label}: ALL 8 diamonds are lit through the whole build and the beam flight (not only once their beam leaves)`, a.lighting.ok, JSON.stringify(a.lighting));
  const buildTiles = buildFrames[0]?.tiles ?? 0;
  check(
    `${label}: the beams fire only AFTER the build completes and land 400 ms later (${introBuildEndMs(buildTiles)}-${introLaserEndMs(buildTiles)} ms, one frame of slack)`,
    a.firstAge !== null && a.firstAge >= introBuildEndMs(buildTiles) - FRAME_MS && a.lastAge <= introLaserEndMs(buildTiles) + FRAME_MS,
    `first=${a.firstAge} last=${a.lastAge}`
  );
  const firstBeamFrame = buildFrames.find((f) => f.firing.length > 0);
  check(`${label}: the maze is COMPLETE (every tile shown) the first frame a beam is in flight`, firstBeamFrame !== undefined && firstBeamFrame.tilesVisible === firstBeamFrame.tiles, JSON.stringify({ tilesVisible: firstBeamFrame?.tilesVisible, tiles: firstBeamFrame?.tiles }));
  const preBeam = buildFrames.filter((f) => f.introAge !== null && f.introAge < introBuildEndMs(buildTiles) - FRAME_MS);
  check(`${label}: no beam is drawn and the player is not revealed during the build (${preBeam.length} frames)`, preBeam.length > 20 && preBeam.every((f) => f.firing.length === 0 && f.lineCount === 0 && f.playerReveal === 0), JSON.stringify(preBeam.find((f) => f.firing.length > 0 || f.playerReveal !== 0)));
  const lastBeamFrame = [...buildFrames].reverse().find((f) => f.firing.length > 0);
  const lockedAtLanding = lastBeamFrame !== undefined && lastBeamFrame.locked === true;
  check(`${label}: input is still locked while the beams fly (it unlocks at the landing, after the player appears)`, lockedAtLanding, JSON.stringify({ locked: lastBeamFrame?.locked, age: lastBeamFrame?.introAge }));
  const poof = poofConvergesOnSpawn(buildFrames);
  check(`${label}: the landing poof sits on the spawn tile`, poof.found && poof.ok, JSON.stringify(poof));
  check(
    `${label}: input unlocks ~${Math.round(introUnlockMs(buildFrames[0]?.tiles ?? 0))} ms (500 + clamp(N/70 tiles/s, 2000, 3200)) after the intro began (and not before)`,
    unlock !== null && unlock.previousLocked && unlock.age >= introUnlockMs(buildFrames[0]?.tiles ?? 0) && unlock.age < introUnlockMs(buildFrames[0]?.tiles ?? 0) + UNLOCK_TOLERANCE_MS,
    JSON.stringify(unlock)
  );
  if (viewport !== null) {
    check(`${label}: all 8 diamonds stay inside the ${viewport.width}x${viewport.height} viewport (parked on the rest stations while the beams fire) while the beams fire`, buildFrames.filter((f) => f.firing.length > 0).every((f) => markersInsideViewport(f, viewport)), JSON.stringify(buildFrames.find((f) => f.firing.length > 0)?.markerBounds));
  }
};

/**
 * DEPARTURE + whole-cycle assertions for one goal-reset: the player fires a
 * beam outward to ALL 8 diamonds, the maze dissolves, the next maze arrives
 * with all 8 beams inward, and the transfer lifecycle completes.
 */
const assertGoalCycle = async (label, frames, h, { stations, viewport, reducedMotion = false }) => {
  const departure = frames.filter((f) => f.outroAge !== null);
  const outroIndex = frames.findIndex((f) => f.outroAge !== null);
  const buildIndex = frames.findIndex((f, index) => index > outroIndex && outroIndex >= 0 && f.introActive);
  const phases = frames.map((f) => f.transfer).filter((phase, index, all) => index === 0 || all[index - 1] !== phase);
  // Reduced motion has no outbound beam phase (it is skipped, not shortened).
  const wanted = reducedMotion ? ['stored', 'delivering', 'idle'] : ['outbound', 'stored', 'delivering', 'idle'];
  let cursor = 0;
  phases.forEach((phase) => { if (phase === wanted[cursor]) { cursor += 1; } });
  check(`${label}: the transfer lifecycle ran ${reducedMotion ? '' : 'outbound -> '}stored -> delivering -> complete (idle, input unlocked)`, cursor === wanted.length, JSON.stringify(phases));
  check(`${label}: a departure (deconstruct) phase was observed`, departure.length > 0, 'n/a');

  if (reducedMotion) {
    check(`${label}: reduced motion draws no beam through the whole goal-reset cycle`, frames.every((f) => f.firing.length === 0 && f.lineCount === 0), JSON.stringify(frames.filter((f) => f.lineCount > 0).slice(0, 2)));
    check(`${label}: reduced motion never lights a diamond through the whole cycle`, frames.every((f) => f.lit.length === 0), JSON.stringify(frames.filter((f) => f.lit.length > 0).slice(0, 2)));
  } else {
    const d = analyzeBeams(departure, stations, 'outward');
    check(`${label}: on goal-reset the player fires a beam to ALL 8 diamonds (the scene's own firing set covers stations 0-7)`, sameList(d.sceneIds, ALL_STATION_IDS), JSON.stringify(d));
    check(
      `${label}: the departure beam geometry agrees -- every beam STARTS at the player and points at its own diamond (outward), all 8 identified`,
      sameList(d.geometryIds, ALL_STATION_IDS) && d.geometryMatchesScene && d.pairCountMatchesScene,
      JSON.stringify(d)
    );
    check(`${label}: no departure beam is drawn inward from a diamond (wrong-direction pairs = 0)`, d.wrongDirectionPairs === 0, `wrongDirectionPairs=${d.wrongDirectionPairs}`);
    check(`${label}: all 8 departure beams are in flight together at least once`, d.maxConcurrent === 8, `maxConcurrent=${d.maxConcurrent}`);
    check(`${label}: every departure beam reaches its diamond (last drawn tip within 10% of it)`, d.tipsReachFarEnd, JSON.stringify(d));
    check(`${label}: each diamond lights as the player beam REACHES it and all 8 stay lit until the end fade`, d.lighting.ok, JSON.stringify(d.lighting));
    check(
      `${label}: the departure beams fire inside the deconstruct laser window (0-${OUTRO_LASER_END_MS} ms, one frame of slack)`,
      d.firstAge !== null && d.firstAge >= 0 && d.lastAge <= OUTRO_LASER_END_MS + FRAME_MS,
      `first=${d.firstAge} last=${d.lastAge}`
    );
    const arrivalFrames = outroIndex >= 0 && buildIndex >= 0 ? frames.slice(buildIndex) : [];
    assertArrival(`${label} (next-maze arrival)`, arrivalFrames, stations, { viewport });
  }

  const handoffMs = outroIndex >= 0 && buildIndex >= 0 ? frames[buildIndex].t - frames[outroIndex].t : null;
  check(
    `${label}: the deconstruct hands off to the next build within 400 + clamp(N/70 tiles/s, 1800, 3000) + 300 ms (+ frame slack)`,
    handoffMs !== null && handoffMs <= outroTotalMs(frames[outroIndex]?.tiles ?? 0) + (FRAME_MS * 3),
    `handoffMs=${handoffMs}`
  );
  const base = ringBase(frames);
  const drift = ringDriftFrom(base, frames);
  const parkedDrift = ringDriftFrom(base, frames.filter((f) => f.firing.length > 0));
  const finalDrift = ringDriftFrom(base, frames.slice(-1));
  if (reducedMotion) {
    check(`${label}: reduced motion keeps the ring of 8 diamonds static through the whole transfer (max drift <= ${RING_PARKED_TOLERANCE_PX} px)`, drift <= RING_PARKED_TOLERANCE_PX, `maxDrift=${drift}`);
  } else {
    check(`${label}: the ring of 8 diamonds circulates the perimeter during the build/deconstruct lap (max travel >= ${RING_MIN_TRAVEL_PX} px)`, drift >= RING_MIN_TRAVEL_PX, `maxDrift=${drift}`);
    check(`${label}: the ring is parked on its stations while any beam fires (drift <= ${RING_PARKED_TOLERANCE_PX} px)`, parkedDrift <= RING_PARKED_TOLERANCE_PX, `parkedDrift=${parkedDrift}`);
    check(`${label}: the ring is back exactly on its stations when the transfer completes (drift <= ${RING_PARKED_TOLERANCE_PX} px)`, finalDrift <= RING_PARKED_TOLERANCE_PX, `finalDrift=${finalDrift}`);
  }

  // The ring lighting fades over 150 ms and the goal pulse runs 250 ms after the reveal: let both finish.
  await h.stepN(40);
  const last = await h.sampleNow();
  check(
    `${label}: once the cycle completes (and the lighting has faded) no beam is in flight, no diamond is lit, and the player stands on the new maze's start`,
    last.firing.length === 0 && last.lineCount === 0 && last.lit.length === 0 && last.player.x === last.start.x && last.player.y === last.start.y,
    JSON.stringify({ firing: last.firing, lineCount: last.lineCount, lit: last.lit, player: last.player, start: last.start })
  );
  const legalMove = await resolveLegalMove(h.page);
  if (legalMove !== null) {
    const after = await moveUntilAccepted(h.page, h.stepOnce, legalMove, 200);
    check(`${label}: real input is genuinely unlocked again after completion (a real move is accepted)`, after?.accepted === true, JSON.stringify(after));
  }
  const volleyCalls = await h.readVolley();
  check(`${label}: the retired per-sigil volley (playerSpawnBurstGraphics) never drew a single beam`, volleyCalls === 0, `${volleyCalls} lineBetween call(s)`);
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
    // A full next-maze deconstruct/build cycle is a few simulated seconds;
    // every wait below is on scene STATE with this generous frame bound
    // (~48 s of simulated time), never a fixed frame count.
    const MAX_CYCLE_FRAMES = 3000;
    const MAX_BUILD_FRAMES = 600;

    // ================================================================
    // Case 1: Start (initial arrival), normal motion. No goal is ever
    // reached, so no transfer is armed: ALL 8 diamonds fire inward to the
    // spawn tile, input unlocks ~1.2 s after the intro began, and the
    // player stands on the maze start.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      const { stations, viewport } = await readStations(h.page);
      const started = await pressStartFromMenu(h);
      check('case 1: Start was accepted from the settled menu', started.accepted, JSON.stringify(started));
      const build = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 1: the first maze build finishes and unlocks input (state wait, not a fixed count)', build.met, `frames=${build.frames.length}`);
      const labels = await readSkillLabels(h.page);
      check('case 1: fresh progression -- diagnostics read "Player Skill Lv 01"', Array.isArray(labels) && labels.includes('Player Skill Lv 01'), JSON.stringify(labels));
      check('case 1: no real transfer was ever armed (this case never reaches a goal)', build.frames.every((f) => f.armed === false), 'n/a');
      assertArrival('case 1', build.frames, stations, { viewport });
      const unlock = findUnlock(build.frames.slice(Math.max(0, build.frames.findIndex((f) => f.introActive))));
      const unlockFrame = build.frames.find((f) => f.drawPhase === 'settled' && !f.locked);
      check(
        'case 1: from the Start press to unlocked input is 500 + clamp(N/70 tiles/s, 2000, 3200) ms of scene time (no hidden extra delay)',
        unlock !== null && unlockFrame !== undefined && (unlockFrame.t - started.pressedAtMs) >= introUnlockMs(build.frames[0]?.tiles ?? 0) && (unlockFrame.t - started.pressedAtMs) < introUnlockMs(build.frames[0]?.tiles ?? 0) + (UNLOCK_TOLERANCE_MS * 2),
        `sincePressMs=${unlockFrame ? unlockFrame.t - started.pressedAtMs : null}`
      );
      await h.stepN(40);
      const settled = await h.sampleNow();
      check(
        'case 1: after the arrival (and the 150 ms lighting fade) no beam is in flight, no diamond is lit, and the player stands on the maze start',
        settled.firing.length === 0 && settled.lineCount === 0 && settled.lit.length === 0 && settled.player.x === settled.start.x && settled.player.y === settled.start.y,
        JSON.stringify({ firing: settled.firing, lineCount: settled.lineCount, lit: settled.lit, player: settled.player, start: settled.start })
      );
      const legalMove = await resolveLegalMove(h.page);
      if (legalMove !== null) {
        const moved = await moveUntilAccepted(h.page, h.stepOnce, legalMove, 50);
        check('case 1: real input is genuinely unlocked once the arrival settles (a real move is accepted)', moved?.accepted === true, JSON.stringify(moved));
      }
      const volleyCalls = await h.readVolley();
      check('case 1: the retired per-sigil volley (playerSpawnBurstGraphics) never drew a single beam', volleyCalls === 0, `${volleyCalls} lineBetween call(s)`);
      check('case 1: no page errors', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 2: goal-reset on a controlled near-goal fixture (direct
    // scene.player/trail assignment adjacent to the goal for speed; the
    // goal-reaching STEP itself is always a real accepted movePlayPlayer).
    // The player fires to ALL 8 diamonds, then the next maze arrives with
    // all 8 inward beams, and the whole transfer lifecycle completes.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      const { stations, viewport } = await readStations(h.page);
      await pressStartFromMenu(h);
      const build = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 2: the first build unlocked input', build.met, 'n/a');
      const { setup, moveResult } = await setupControlledNearGoalMove(h.page, h.stepOnce);
      check('case 2: found a real walkable neighbour of the goal to set up from', setup !== null, 'n/a');
      check('case 2: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (setup !== null) {
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const armed = await h.sampleNow();
        check('case 2: reaching the goal armed a real transfer', armed.armed === true, JSON.stringify({ armed: armed.armed, transfer: armed.transfer }));
        const cycle = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 2: the transfer cycle reached completion (state wait)', cycle.met, `frames=${cycle.frames.length}`);
        await assertGoalCycle('case 2', cycle.frames, h, { stations, viewport });
      }
      check('case 2: no page errors across the whole sequence', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 3: a FULL solver-driven run -- real start, real wrap-aware
    // solved route, every step a real accepted movePlayPlayer command, no
    // direct player/goal assignment anywhere in this case.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      const { stations, viewport } = await readStations(h.page);
      await pressStartFromMenu(h);
      const build = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 3: the first build unlocked input', build.met, 'n/a');
      const moves = await solveMazeToMoveSequence(h.page);
      check('case 3: the real maze has a solvable route (production wrap-aware solver) from the real player position to the real goal', moves !== null && moves.length > 0, JSON.stringify({ routeLength: moves?.length ?? null }));
      if (moves !== null) {
        let acceptedCount = 0;
        for (const move of moves) {
          // eslint-disable-next-line no-await-in-loop
          const result = await moveUntilAccepted(h.page, h.stepOnce, move, 120);
          if (result?.accepted) { acceptedCount += 1; }
        }
        check('case 3: every real solved move was eventually accepted through the real command path', acceptedCount === moves.length, JSON.stringify({ accepted: acceptedCount, expected: moves.length }));
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const armed = await h.sampleNow();
        check('case 3: reaching the real goal via the real solved route armed a real transfer', armed.armed === true, JSON.stringify({ armed: armed.armed, transfer: armed.transfer }));
        const cycle = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 3: the solver-driven cycle reached completion', cycle.met, `frames=${cycle.frames.length}`);
        await assertGoalCycle('case 3', cycle.frames, h, { stations, viewport });
      }
      check('case 3: no page errors across the whole real solver-driven sequence', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 4: reduced motion -- real browser reduced-motion emulation (a
    // context flag, not a scene monkeypatch). No beams, nothing lights up,
    // 250 ms unlock, and the transfer cycle still completes.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
      const { stations, viewport } = await readStations(h.page);
      const reducedMotionActive = await h.page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      check('case 4: reduced motion is genuinely active for this real browser context', reducedMotionActive === true, String(reducedMotionActive));
      await pressStartFromMenu(h);
      const build = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 4: the first build unlocks input under reduced motion', build.met, 'n/a');
      assertArrival('case 4', build.frames, stations, { reducedMotion: true });
      const { setup, moveResult } = await setupControlledNearGoalMove(h.page, h.stepOnce);
      check('case 4: the real goal-reaching move was accepted under reduced motion', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (setup !== null) {
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const cycle = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 4: the reduced-motion cycle genuinely reaches completion', cycle.met, `frames=${cycle.frames.length}`);
        await assertGoalCycle('case 4', cycle.frames, h, { stations, viewport, reducedMotion: true });
      }
      check('case 4: no page errors under reduced motion', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 5: compact/touch-emulated layout -- a real narrow viewport with
    // a real touch-capable context. The same 8-in / 8-out beams, with every
    // diamond inside a 390x844 viewport.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const { stations, viewport } = await readStations(h.page);
      check('case 5: the compact viewport is genuinely 390x844 and all 8 stations sit inside it', viewport.width === 390 && viewport.height === 844 && stations.length === 8 && stations.every((s) => s.x >= 0 && s.y >= 0 && s.x <= viewport.width && s.y <= viewport.height), JSON.stringify({ viewport, stations }));
      await pressStartFromMenu(h);
      const build = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 5: the first build unlocks input on the compact/touch layout', build.met, 'n/a');
      assertArrival('case 5', build.frames, stations, { viewport });
      const { setup, moveResult } = await setupControlledNearGoalMove(h.page, h.stepOnce);
      check('case 5: the real goal-reaching move was accepted on the compact/touch layout', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (setup !== null) {
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const cycle = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 5: the transfer cycle reached completion on the compact/touch layout', cycle.met, `frames=${cycle.frames.length}`);
        await assertGoalCycle('case 5', cycle.frames, h, { stations, viewport });
      }
      check('case 5: no page errors on the compact/touch layout', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 6: pause during the DEPARTURE beams (goal-reset laser window).
    // Pause holds the beams, the outro clock and the coupled maze lifecycle
    // still; resume continues the same beams without racing ahead.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      const { stations } = await readStations(h.page);
      await pressStartFromMenu(h);
      await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      const { setup, moveResult } = await setupControlledNearGoalMove(h.page, h.stepOnce);
      check('case 6: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (setup !== null) {
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const pre = await h.stepUntil('outroAgeAtLeast', 200, 400);
        const before = pre.frames[pre.frames.length - 1];
        check('case 6: reached the departure laser window with beams in flight', pre.met && before.firing.length > 0 && before.laserProgress > 0 && before.laserProgress < 1, JSON.stringify(before));
        const boardBefore = await readBoardProgress(h.page);
        const pauseResult = await h.page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 6: the real openPauseOverlay QA command was accepted', pauseResult?.accepted === true, JSON.stringify(pauseResult));
        await h.stepOnce();
        const first = await h.sampleNow();
        await h.stepN(50);
        const during = await h.sampleNow();
        const boardDuring = await readBoardProgress(h.page);
        check('case 6: the pause overlay genuinely opened', during.overlay === 'pause', JSON.stringify({ overlay: during.overlay }));
        check(
          'case 6: the departure beams are held still while paused (outro clock and laser progress identical across 50 paused frames)',
          during.outroAge === first.outroAge && during.laserProgress === first.laserProgress && sameList(during.firing, first.firing),
          JSON.stringify({ first: { age: first.outroAge, p: first.laserProgress }, during: { age: during.outroAge, p: during.laserProgress } })
        );
        check('case 6: the transfer phase is held while paused', during.transfer === first.transfer, JSON.stringify({ first: first.transfer, during: during.transfer }));
        check(
          'case 6: the coupled maze lifecycle is frozen while paused (draw phase, row/tile counters, visible-tile count, pending generation/reset)',
          boardProgressFrozen(boardBefore, boardDuring),
          JSON.stringify({ boardBefore, boardDuring })
        );
        const resumeDispatch = await h.page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 6: the real RESUME_RUN bridge command was accepted', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));
        await h.stepOnce();
        const afterResume = await h.sampleNow();
        const progressDelta = afterResume.laserProgress - during.laserProgress;
        check('case 6: the pause overlay closed and the beams advance by about one frame on resume (no jump over the paused interval)', afterResume.overlay === 'none' && progressDelta >= 0 && progressDelta <= 0.2, JSON.stringify({ overlay: afterResume.overlay, progressDelta }));
        const post = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 6: the cycle completes after resume', post.met, `frames=${post.frames.length}`);
        const all = [...pre.frames, ...post.frames];
        const d = analyzeBeams(all.filter((f) => f.outroAge !== null), stations, 'outward');
        check('case 6: the pause lost no beam -- all 8 departure beams still fired across pre- and post-resume frames', sameList(d.sceneIds, ALL_STATION_IDS) && sameList(d.geometryIds, ALL_STATION_IDS), JSON.stringify(d));
        check('case 6: the remaining beams kept firing after resume (it continued, it did not restart or vanish)', post.frames.some((f) => f.outroAge !== null && f.firing.length > 0), 'n/a');
        const last = post.frames[post.frames.length - 1];
        check('case 6: the next maze arrived and input is unlocked', last.player.x === last.start.x && last.player.y === last.start.y && !last.locked, JSON.stringify({ player: last.player, start: last.start, locked: last.locked }));
      }
      check('case 6: no page errors across the pause/resume sequence', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 6b: pause during the STORED interval (the maze deconstruct /
    // rebuild window -- the exact scenario a reviewer's recording captured).
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await pressStartFromMenu(h);
      await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      const { setup, moveResult } = await setupControlledNearGoalMove(h.page, h.stepOnce);
      check('case 6b: the real goal-reaching move was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (setup !== null) {
        await h.page.evaluate(() => { window.__mazerQa.resetCycleWatch(); window.__mazerQa.resetVolley(); });
        const pre = await h.stepUntil('transferPhase', 'stored', 400);
        check('case 6b: the real cycle reaches the stored interval before pausing', pre.met, `frames=${pre.frames.length}`);
        const before = await h.sampleNow();
        const boardBefore = await readBoardProgress(h.page);
        const pauseResult = await h.page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
        check('case 6b: the real openPauseOverlay QA command was accepted (stored interval)', pauseResult?.accepted === true, JSON.stringify(pauseResult));
        await h.stepOnce();
        const first = await h.sampleNow();
        await h.stepN(80);
        const during = await h.sampleNow();
        const boardDuring = await readBoardProgress(h.page);
        check(
          'case 6b: the maze reveal/deconstruct lifecycle is frozen through the whole longer pause (no tiles disappear behind the pause menu)',
          boardProgressFrozen(boardBefore, boardDuring),
          JSON.stringify({ boardBefore, boardDuring })
        );
        check(
          'case 6b: the transfer phase and the outro/intro clocks are held through the longer pause',
          during.transfer === before.transfer && during.outroAge === first.outroAge && during.introAge === first.introAge,
          JSON.stringify({ before: before.transfer, during: during.transfer, firstOutro: first.outroAge, duringOutro: during.outroAge, firstIntro: first.introAge, duringIntro: during.introAge })
        );
        const resumeDispatch = await h.page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
        check('case 6b: the real RESUME_RUN bridge command was accepted (stored interval)', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));
        await h.stepOnce();
        const afterResume = await h.sampleNow();
        const boardAfter = await readBoardProgress(h.page);
        check(
          'case 6b: the deconstruct/rebuild does not race ahead on the first resumed frame (no completion or next-maze handoff jumped forward)',
          boardAfter.drawPhase === boardDuring.drawPhase
            && Math.abs(boardAfter.revealedTileCount - boardDuring.revealedTileCount) <= 6
            && boardAfter.mazeStartKey === boardDuring.mazeStartKey
            && boardAfter.generationPending === boardDuring.generationPending
            && afterResume.transfer === during.transfer,
          JSON.stringify({ boardDuring, boardAfter, duringTransfer: during.transfer, afterTransfer: afterResume.transfer })
        );
        const post = await h.stepUntil('cycleComplete', 0, MAX_CYCLE_FRAMES);
        check('case 6b: the cycle completes after resume', post.met, `frames=${post.frames.length}`);
      }
      check('case 6b: no page errors across the stored-interval pause/resume', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 6c: pause during the INITIAL ARRIVAL beams (no goal ever
    // reached). The intro clock freezes; after resume input still unlocks
    // ~1.2 s of INTRO time in -- the paused interval did not eat the intro.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      const { stations } = await readStations(h.page);
      const started = await pressStartFromMenu(h);
      const tilesAtStart = (await h.sampleNow()).tiles;
      const pre = await h.stepUntil('introAgeAtLeast', introBuildEndMs(tilesAtStart) + 150, 400);
      const before = pre.frames[pre.frames.length - 1];
      check('case 6c: reached the initial-arrival laser window with beams in flight', pre.met && before.firing.length > 0, JSON.stringify(before));
      const boardBefore = await readBoardProgress(h.page);
      const pauseResult = await h.page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      check('case 6c: the real openPauseOverlay QA command was accepted during initial arrival', pauseResult?.accepted === true, JSON.stringify(pauseResult));
      await h.stepOnce();
      const first = await h.sampleNow();
      await h.stepN(50);
      const during = await h.sampleNow();
      const boardDuring = await readBoardProgress(h.page);
      check('case 6c: the intro clock and laser progress are held identically while paused', during.introAge === first.introAge && during.laserProgress === first.laserProgress, JSON.stringify({ first: first.introAge, during: during.introAge }));
      check('case 6c: the first maze reveal is frozen while paused too (draw phase, row/tile counters, visible-tile count)', boardProgressFrozen(boardBefore, boardDuring), JSON.stringify({ boardBefore, boardDuring }));
      const resumeDispatch = await h.page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
      check('case 6c: the real RESUME_RUN bridge command was accepted during initial arrival', resumeDispatch?.ok === true, JSON.stringify(resumeDispatch));
      await h.stepOnce();
      const post = await h.stepUntil('unlocked', 0, MAX_BUILD_FRAMES);
      check('case 6c: the build unlocks input after resume', post.met, 'n/a');
      const unlock = findUnlock(post.frames);
      check(
        'case 6c: the pause did not consume the intro -- input still unlocks at the full intro time (500 + revealMs), well over that after the Start press',
        unlock !== null && unlock.age >= introUnlockMs(post.frames[0]?.tiles ?? 0) && unlock.age < introUnlockMs(post.frames[0]?.tiles ?? 0) + (UNLOCK_TOLERANCE_MS * 2)
          && (post.frames[unlock.index].t - started.pressedAtMs) >= introUnlockMs(post.frames[0]?.tiles ?? 0) + (50 * FRAME_MS),
        JSON.stringify({ unlock, sincePress: post.frames[unlock?.index ?? 0]?.t - started.pressedAtMs })
      );
      const a = analyzeBeams([...pre.frames, ...post.frames].filter((f) => f.introActive), stations, 'inward');
      check('case 6c: the pause lost no beam -- all 8 arrival beams still fired across pre- and post-resume frames', sameList(a.sceneIds, ALL_STATION_IDS) && sameList(a.geometryIds, ALL_STATION_IDS), JSON.stringify(a));
      check('case 6c: no page errors during the initial-arrival pause/resume', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 6d negative controls: with holdLegacyPlayMazeLifecycleDuringPause
    // patched to a no-op in its own isolated context, the maze lifecycle AND
    // the intro clock DO keep advancing while paused -- exactly the defect
    // cases 6/6b/6c catch. Proves those assertions depend on the fix, not on
    // the scene happening to be idle. The patch never leaves this context.
    // ================================================================
    {
      const h = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await h.page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.holdLegacyPlayMazeLifecycleDuringPause = () => {};
      });
      await pressStartFromMenu(h);
      const pre = await h.stepUntil('introAgeAtLeast', 250, 200);
      check('case 6d negative control: reached the initial-arrival laser window', pre.met, 'n/a');
      const boardBefore = await readBoardProgress(h.page);
      const introBefore = await h.sampleNow();
      await h.page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      await h.stepN(60);
      const introDuring = await h.sampleNow();
      const boardDuring = await readBoardProgress(h.page);
      check(
        'case 6d negative control: with the pause-hold disabled the intro clock KEEPS advancing while paused (the fix in case 6c is load-bearing)',
        introDuring.introAge > introBefore.introAge + 500,
        JSON.stringify({ before: introBefore.introAge, during: introDuring.introAge })
      );
      check(
        'case 6d negative control: with the pause-hold disabled the maze reveal genuinely KEEPS advancing while paused (the board-frozen assertions are load-bearing)',
        !boardProgressFrozen(boardBefore, boardDuring),
        JSON.stringify({ boardBefore, boardDuring })
      );
      check('case 6d negative control: no page errors', h.pageErrors.length === 0, JSON.stringify(h.pageErrors));
      await h.context.close();
    }

    // ================================================================
    // Case 9: ordinary player movement is genuinely LOCKED through the
    // entire visible maze build, on BOTH first entry AND the next-maze
    // transition after a goal. Owner-reported (2026-09-09): "the player
    // is moving before the maze creation animation is done".
    //
    // Strengthened per ChatGPT-assisted review 5173052153: the earlier
    // version always probed with 'move_up' (a wall-blocked rejection would
    // read the same as a lifecycle lock), ignored the rejection REASON,
    // and could pass without ever observing an incomplete reveal or the
    // build reaching ready. This version:
    //  - probes with a REAL legal move direction (a walkable neighbour of
    //    the player), so any rejection during the reveal can ONLY be
    //    'lifecycle-locked';
    //  - requires a genuine incomplete-reveal window to be observed;
    //  - requires every rejection in that window to be reason
    //    'lifecycle-locked' specifically;
    //  - tracks the DOMAIN player position, so arrival materialization
    //    (presentation) is distinguished from ordinary traversal (which
    //    moves scene.player);
    //  - requires the build to genuinely reach settled + input-unlocked
    //    within the bound;
    //  - proves a legal move is then accepted AND actually moves the
    //    player once ready;
    //  - asserts the accepted goal move before claiming the next-maze
    //    path was exercised;
    //  - includes a controlled negative control (the lock guard patched
    //    off in its own isolated context) proving the pass depends on the
    //    guard, not on a wall or an unobserved build.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      const resolveLegalMove = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const p = scene.player;
        const grid = scene.maze.grid;
        const opts = [
          { m: 'move_up', x: p.x, y: p.y - 1 }, { m: 'move_down', x: p.x, y: p.y + 1 },
          { m: 'move_left', x: p.x - 1, y: p.y }, { m: 'move_right', x: p.x + 1, y: p.y }
        ];
        const legal = opts.find((o) => grid[o.y]?.[o.x] === true);
        return legal ? legal.m : null;
      });

      const probeBuild = (legalMove) => page.evaluate((mv) => {
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
        const domainBefore = { x: scene.player.x, y: scene.player.y };
        const move = window.__MAZER_QA__.movePlayPlayer(mv);
        const domainAfter = { x: scene.player.x, y: scene.player.y };
        return {
          drawPhase: scene.menuStaticDrawLifecyclePhase,
          lifecycleLocked: scene.isLegacyPlayLifecycleInputLocked(),
          revealIncomplete: total > 0 && revealed < total,
          settledAndUnlocked: scene.menuStaticDrawLifecyclePhase === 'settled' && !scene.isLegacyPlayLifecycleInputLocked(),
          moveAccepted: move?.accepted === true,
          moveReason: move?.reason ?? null,
          domainMoved: domainBefore.x !== domainAfter.x || domainBefore.y !== domainAfter.y
        };
      }, legalMove);

      const runBuildPath = async (label) => {
        const legalMove = await resolveLegalMove();
        check(`case 9 (${label}): resolved a real legal move direction to probe with (rejections can only be lifecycle-locked, not a wall)`, legalMove !== null, 'n/a');
        if (legalMove === null) { return; }

        let incompleteRevealFrames = 0;
        let rejectedWhileIncomplete = 0;
        let nonLockRejectWhileIncomplete = 0;
        let acceptedWhileIncomplete = 0;
        let domainMovedWhileIncomplete = 0;
        let reachedReady = false;
        for (let i = 0; i < 800; i += 1) {
          await stepOnce();
          const p = await probeBuild(legalMove);
          if (p.revealIncomplete) {
            incompleteRevealFrames += 1;
            if (p.moveAccepted) { acceptedWhileIncomplete += 1; }
            if (p.domainMoved) { domainMovedWhileIncomplete += 1; }
            if (!p.moveAccepted) {
              rejectedWhileIncomplete += 1;
              if (p.moveReason !== 'lifecycle-locked') { nonLockRejectWhileIncomplete += 1; }
            }
          }
          if (p.settledAndUnlocked && i > 30) { reachedReady = true; break; }
        }

        check(`case 9 (${label}): a genuine incomplete-reveal window was observed (not skipped)`, incompleteRevealFrames >= 3, `${incompleteRevealFrames} frame(s)`);
        check(`case 9 (${label}): the build genuinely reached settled + input-unlocked within the bound (not a timeout)`, reachedReady, 'n/a');
        check(`case 9 (${label}): every legal-move rejection during the incomplete reveal was reason 'lifecycle-locked' (not 'blocked'/other)`, rejectedWhileIncomplete > 0 && nonLockRejectWhileIncomplete === 0, `rejected=${rejectedWhileIncomplete}, non-lifecycle-locked=${nonLockRejectWhileIncomplete}`);
        check(`case 9 (${label}): the legal move was never accepted while any maze tile was still unrevealed`, acceptedWhileIncomplete === 0, `${acceptedWhileIncomplete} accepted`);
        check(`case 9 (${label}): the DOMAIN player never traversed the maze while any tile was unrevealed (arrival materialization is not ordinary movement)`, domainMovedWhileIncomplete === 0, `${domainMovedWhileIncomplete} domain move(s)`);

        const readyMove = await resolveLegalMove();
        const after = await page.evaluate((mv) => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const before = { x: scene.player.x, y: scene.player.y };
          const r = window.__MAZER_QA__.movePlayPlayer(mv);
          const now = { x: scene.player.x, y: scene.player.y };
          return { accepted: r?.accepted === true, moved: before.x !== now.x || before.y !== now.y };
        }, readyMove);
        check(`case 9 (${label}): once the build is ready, a legal move is accepted AND actually moves the domain player`, after.accepted === true && after.moved === true, JSON.stringify(after));
      };

      await runBuildPath('first entry');

      const { setup, moveResult } = await setupControlledNearGoalMove(page, stepOnce);
      check('case 9: the real goal-reaching move that triggers the next-maze transition was accepted', moveResult?.accepted === true, JSON.stringify(moveResult));
      if (moveResult?.accepted === true) {
        await runBuildPath('next-maze transition');
      }
      check('case 9: no page errors across the build-lock checks', pageErrors.length === 0, JSON.stringify(pageErrors));
      await context.close();
    }

    // ================================================================
    // Case 9 negative control (ChatGPT-assisted review 5173052153): with
    // isLegacyPlayLifecycleInputLocked patched to always return false in
    // its OWN isolated context, a real legal move IS accepted (and moves
    // the domain player) while maze tiles are still unrevealed -- proving
    // case 9's pass depends on that guard, not on a wall rejection or an
    // unobserved build. The patch never leaves this context.
    // ================================================================
    {
      const { context, page, pageErrors, stepOnce } = await openGameContext(browser, resolvedBaseUrl, { viewport: { width: 1280, height: 720 } });
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.__realLifecycleLock = scene.isLegacyPlayLifecycleInputLocked.bind(scene);
        scene.isLegacyPlayLifecycleInputLocked = () => false;
      });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      let sawAcceptedOrMovedWhileIncomplete = false;
      let sawIncompleteReveal = false;
      for (let i = 0; i < 800; i += 1) {
        await stepOnce();
        const p = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const pl = scene.player;
          const grid = scene.maze.grid;
          const legal = [
            { m: 'move_up', x: pl.x, y: pl.y - 1 }, { m: 'move_down', x: pl.x, y: pl.y + 1 },
            { m: 'move_left', x: pl.x - 1, y: pl.y }, { m: 'move_right', x: pl.x + 1, y: pl.y }
          ].find((o) => grid[o.y]?.[o.x] === true);
          let total = 0;
          let revealed = 0;
          for (let y = 0; y < scene.maze.height; y += 1) {
            for (let x = 0; x < scene.maze.width; x += 1) {
              if (scene.maze.grid[y][x]) { total += 1; if (scene.isLegacyMenuPointVisibleInStaticDraw({ x, y })) { revealed += 1; } }
            }
          }
          const revealIncomplete = total > 0 && revealed < total;
          if (!legal) { return { revealIncomplete, accepted: false, moved: false, realLocked: scene.__realLifecycleLock() }; }
          const before = { x: pl.x, y: pl.y };
          const r = window.__MAZER_QA__.movePlayPlayer(legal.m);
          const now = { x: scene.player.x, y: scene.player.y };
          return { revealIncomplete, accepted: r?.accepted === true, moved: before.x !== now.x || before.y !== now.y, realLocked: scene.__realLifecycleLock() };
        });
        if (p.revealIncomplete) {
          sawIncompleteReveal = true;
          if (p.realLocked && (p.accepted || p.moved)) { sawAcceptedOrMovedWhileIncomplete = true; }
        }
        const done = await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return scene.menuStaticDrawLifecyclePhase === 'settled';
        });
        if (done && i > 30 && sawAcceptedOrMovedWhileIncomplete) { break; }
        if (done && i > 200) { break; }
      }
      check('case 9 negative control: a genuine incomplete-reveal window was observed', sawIncompleteReveal, 'n/a');
      check('case 9 negative control: with the lifecycle lock disabled, a real legal move IS accepted/moves the player while the reveal is incomplete (the guard is load-bearing)', sawAcceptedOrMovedWhileIncomplete, 'n/a');
      check('case 9 negative control: no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
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
