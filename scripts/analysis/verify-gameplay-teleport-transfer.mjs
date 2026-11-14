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
 *     its own diamond's INNERMOST point (its inner tip), all 8 are in flight together, they converge on the
 *     spawn tile, each full diamond drains from the instant its beam leaves it and its beam stays attached
 *     to the tip until the drain is over) -- but ONLY AFTER
 *     the maze build is complete (the diamonds orbit, full size, during the build); each empty diamond then shrinks
 *     back to 50% of its size, anchored on its OUTER tip (MAZER-VIS-043: the outer tip stays on the screen edge at every
 *     size, so the inner tip, where the beams attach, moves; the beam endpoint follows it every frame);
 *     the player appears at the beam landing and input unlocks there, 500 ms
 *     + the build length after the intro began;
 *   - DEPARTURE (goal reached -> deconstruct): the player fires a beam OUTWARD
 *     to ALL 8 diamonds (each diamond grows from 50% to 100% by the instant its beam touches its inner tip and the
 *     beam stays attached until the fill is complete), then the maze dissolves and the next maze arrives;
 *   - while the maze runs every diamond is 50% of its full size (a fixed size in reduced motion, no size animation);
 *   - EVERY diamond's PAINTED outer tip touches the visible screen edge (within 0.5 device px, never past it) at every size, and
 *     the four corner diamonds clear a 56 css px rounded display corner (MAZER-VIS-043); the real canvas pixels agree (the diamond
 *     layer's own pixel footprint, read back with the layer hidden and shown on the same frame, reaches the last device row/column);
 *   - the transfer lifecycle still runs outbound -> stored -> delivering ->
 *     complete -> input unlocked again, via real accepted moves only;
 *   - reduced motion: no beams at all, the diamonds only crossfade full/empty (no sweep, no brightening), 200 ms unlock;
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
const INTRO_REDUCED_UNLOCK_MS = 200; // MOTION_REDUCED_MS.crossfade (MAZER-MOTION-005)
const FRAME_MS = 16;
const UNLOCK_TOLERANCE_MS = FRAME_MS * 2;
const OUTRO_LASER_END_MS = 400;
// A departure beam stays attached for one base step after its head lands (the fill, edgeBeamTimeline.ts EDGE_BEAM_PULSE_MS =
// MOTION_DURATION_MS.base = 200) and then retracts over one fast step (EDGE_BEAM_RETRACT_MS = 120). An arrival beam is gone by head landing + 20 ms.
const PULSE_TAIL_MS = 200;
const RETRACT_MS = 120;
const DEPARTURE_BEAM_END_MS = OUTRO_LASER_END_MS + PULSE_TAIL_MS + RETRACT_MS;
// Diamond size: half size while the maze runs, full size from the departure grow to the end of the build, back to half after the drain.
const KITE_FULL_LENGTH_PX = 20;
const KITE_REST_LENGTH_PX = 10;
const KITE_LENGTH_TOLERANCE_PX = 0.05;
const INNER_TIP_REACH_PX = 10;
// A 1 px stroke joins with a miter: the outer tip paints 0.5 / sin(atan(7 / 12)) px beyond its vertex along the kite axis (45 degree corner kites:
// that times cos 45 toward the top / bottom edge). Mirrors edgeMarkers.ts EDGE_MARKER_TIP_PAINT_PX (an acceptance number, not imported).
const TIP_PAINT_PX = 0.5 / Math.sin(Math.atan2(7, 12));
const CORNER_CLEARANCE_PX = 56;
const STATION_SIDE = ['top', 'top', 'top', 'right', 'bottom', 'bottom', 'bottom', 'left'];
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
// A beam is 2 x 3 bloom lines + 5 body lines + up to 8 stream dashes (edgeBeamArt.ts); its FIRST line is the outer bloom (9 css px wide,
// tail -> head), so a pulse starts at the first line drawn under a bloom-outer-width style. The landing poof is 12 sparkle lines.
const BLOOM_OUTER_MIN_WIDTH_PX = 8;
const POOF_LINES = 12;
const installHarness = (page) => page.evaluate(({ BLOOM_OUTER_MIN_WIDTH_PX, POOF_LINES }) => {
  const getScene = () => window.__MAZER_GAME__.scene.getScene('MenuScene');
  const initial = getScene();

  const laser = { lines: [], width: 0 };
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
  wrap(initial.spawnLaserGraphics, ['clear', 'lineStyle', 'lineBetween'], (name, args) => {
    if (name === 'clear') { laser.lines = []; laser.width = 0; }
    else if (name === 'lineStyle') { laser.width = args[0]; }
    else { laser.lines.push({ line: [args[0], args[1], args[2], args[3]], width: laser.width }); }
  });
  wrap(initial.playerSpawnBurstGraphics, ['lineBetween'], () => { volley.count += 1; });
  wrap(initial.edgeMarkerGraphics, ['clear', 'lineStyle', 'beginPath', 'moveTo', 'lineTo', 'strokePath'], (name, args) => {
    if (name === 'clear') { edge.frame = []; }
    else if (name === 'lineStyle') { edge.style = { alpha: args[2] }; }
    else if (name === 'beginPath') { edge.vertices = []; }
    else if (name === 'moveTo' || name === 'lineTo') { edge.vertices.push({ x: args[0], y: args[1] }); }
    else if (name === 'strokePath') {
      // Phaser's lineBetween is beginPath+moveTo+lineTo+strokePath: the 2-vertex strokes are the diamond fill's front line, not a kite outline.
      if (edge.vertices.length >= 3) { edge.frame.push({ alpha: edge.style?.alpha ?? 0, vertices: edge.vertices.slice() }); }
    }
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
    const focus = tileCenter(scene, scene.player);
    // The landing poof (12 sparkle lines) is drawn after the beams while the spawn burst is in its flash; take it off the end.
    const burst = scene.resolveLegacyPlayerSpawnBurstState(t);
    const poof = burst.active && burst.travelProgress >= 1 && burst.flashProgress > 0 && burst.flashProgress < 1;
    const allLines = laser.lines;
    const lines = poof ? allLines.slice(0, Math.max(0, allLines.length - POOF_LINES)) : allLines;
    const sparkleMids = poof
      ? allLines.slice(Math.max(0, allLines.length - POOF_LINES)).map((l) => ({ x: (l.line[0] + l.line[2]) / 2, y: (l.line[1] + l.line[3]) / 2 }))
      : [];
    // A pulse starts at the first line drawn under the outer-bloom width; its first line runs tail -> head, in station order.
    const pulses = [];
    lines.forEach((entry, index) => {
      const bloom = entry.width >= BLOOM_OUTER_MIN_WIDTH_PX;
      if (bloom && (index === 0 || lines[index - 1].width < BLOOM_OUTER_MIN_WIDTH_PX)) { pulses.push({ first: entry.line, lines: 0 }); }
      if (pulses.length > 0) { pulses[pulses.length - 1].lines += 1; }
    });
    const stationsNow = scene.resolveLegacyEdgeStations();
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
      lineCount: allLines.length,
      dpr: scene.resolveBoardTileBackingScale(),
      pulseCount: pulses.length,
      pulseLineCounts: pulses.map((pulse) => pulse.lines),
      beamPairs: pulses.map((pulse) => pulse.first),
      // The line set of every pulse, for the endpoint checks: [x1, y1, x2, y2] of the longest line (the body/bloom span, tail -> head).
      sparkleMids,
      focus,
      stations: stationsNow.map((s) => ({ id: s.id, x: s.x, y: s.y, a: s.inwardAngle })),
      lit: edge.frame.map((marker, index) => (marker.alpha > 0.62 ? index : null)).filter((index) => index !== null),
      tiles: scene.menuStaticDrawTileOrder.length,
      // Tiles currently shown (null = no limit = the whole maze), and whether the player marker is revealed yet.
      tilesVisible: scene.menuStaticDrawTilesVisible === null ? scene.menuStaticDrawTileOrder.length : scene.menuStaticDrawTilesVisible,
      playerReveal: scene.resolveLegacyPlayerSpawnBurstState(t).markerRevealAlpha,
      markerCount: edge.frame.length,
      // Kite OUTER TIP (vertex 2: the ring orbits the perimeter, so it moves during the intro/outro lap and is exactly parked
      // otherwise; the diamond scales about it, so unlike the inner tip or the centroid it does not move when the size changes).
      ring: edge.frame.map((marker) => (marker.vertices.length === 0 ? null : { x: marker.vertices[2].x, y: marker.vertices[2].y })),
      // The visible extent of the canvas in world px: the backing store is round(css * resolution) and the context is scaled by the resolution
      // (the DPR rounded to hundredths, capped at 3), so the painted world ends at canvas.width / resolution.
      visible: (() => {
        const canvas = document.querySelector('canvas');
        const res = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio * 100) / 100));
        return canvas ? { w: canvas.width / res, h: canvas.height / res, res } : null;
      })(),
      // Kite length tip -> outer tip, per marker: 20 css px at full size, 10 at the 50% rest size.
      outerTips: edge.frame.map((marker) => (marker.vertices.length < 3 ? null : { x: marker.vertices[2].x, y: marker.vertices[2].y })),
      kiteLengths: edge.frame.map((marker) => (marker.vertices.length < 3 ? null : Math.hypot(marker.vertices[0].x - marker.vertices[2].x, marker.vertices[0].y - marker.vertices[2].y))),
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
    // The diamond layer's own pixel footprint on the real canvas: read the canvas with the edge-marker layer shown and with it hidden (alpha 0) on
    // the SAME frame time (the loop steps with a zero delta, so nothing else changes) and return the bounding box of the pixels that differ,
    // per diamond, in device px.
    edgePixelProbe: () => {
      const scene = getScene();
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const w = canvas.width; const h = canvas.height;
      const res = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio * 100) / 100));
      window.__MAZER_GAME__.loop.step(state.clock);
      const shown = ctx.getImageData(0, 0, w, h).data;
      const previousAlpha = scene.edgeMarkerGraphics.alpha;
      scene.edgeMarkerGraphics.setAlpha(0);
      window.__MAZER_GAME__.loop.step(state.clock);
      const hidden = ctx.getImageData(0, 0, w, h).data;
      scene.edgeMarkerGraphics.setAlpha(previousAlpha);
      window.__MAZER_GAME__.loop.step(state.clock);
      const boxes = scene.resolveLegacyEdgeStations().map((station) => {
        const half = Math.ceil(30 * res);
        const cx = Math.round(station.x * res); const cy = Math.round(station.y * res);
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let count = 0;
        for (let y = Math.max(0, cy - half); y < Math.min(h, cy + half); y += 1) {
          for (let x = Math.max(0, cx - half); x < Math.min(w, cx + half); x += 1) {
            const i = ((y * w) + x) * 4;
            if (Math.abs(shown[i] - hidden[i]) > 6 || Math.abs(shown[i + 1] - hidden[i + 1]) > 6 || Math.abs(shown[i + 2] - hidden[i + 2]) > 6) {
              count += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
          }
        }
        return { id: station.id, count, box: count === 0 ? null : { minX, minY, maxX, maxY } };
      });
      return { w, h, res, boxes };
    },
    volleyCount: () => volley.count,
    resetVolley: () => { volley.count = 0; },
    resetCycleWatch: () => { state.sawDelivering = false; },
    stations: () => getScene().resolveLegacyEdgeStations().map((s) => ({ id: s.id, x: s.x, y: s.y, a: s.inwardAngle })),
    viewport: () => ({ width: getScene().layout.width, height: getScene().layout.height })
  };
}, { BLOOM_OUTER_MIN_WIDTH_PX, POOF_LINES });

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
const beamStationId = (pair, stations, focus, direction, id) => {
  // The pulses are drawn in station order, so pulse i belongs to the i-th firing id (`id`). It is CONSISTENT with that station when
  // its tail -> head line lies along station -> focus (a pulse shorter than 8 px has no direction to test), points toward the focus
  // (inward) or away from it (outward), and both ends sit within the kite's reach of that line.
  const station = stations.find((s) => s.id === id);
  if (!station) { return null; }
  const vx = pair[2] - pair[0];
  const vy = pair[3] - pair[1];
  const vLen = Math.hypot(vx, vy);
  if (vLen < 8) { return id; }
  const fx = focus.x - station.x;
  const fy = focus.y - station.y;
  const fLen = Math.hypot(fx, fy);
  if (fLen < 1e-6) { return null; }
  const cos = ((vx * fx) + (vy * fy)) / (vLen * fLen);
  const heading = direction === 'inward' ? cos : -cos;
  const offLine = (p) => Math.abs(((p.x - station.x) * fy) - ((p.y - station.y) * fx)) / fLen;
  // The beam now joins the focus to the diamond's INNER TIP (not its centre), so it can differ from station -> focus by up to
  // asin(10 / distance): 20 degrees still tells the eight stations (45 degrees apart) from one another.
  return heading > Math.cos((20 * Math.PI) / 180) && offLine({ x: pair[0], y: pair[1] }) <= KITE_REACH_PX && offLine({ x: pair[2], y: pair[3] }) <= KITE_REACH_PX ? id : null;
};
// Half extent of a kite plus a stroke (EDGE_MARKER_MAX_EXTENT_PX is 10.5).
const KITE_REACH_PX = 11;

/** The diamond's INNERMOST point (the tip facing the board) for a harness station: centre + 10 px along its inward axis. */
const innerTipOf = (station, kiteLength = KITE_FULL_LENGTH_PX) => ({
  // The diamond scales about its OUTER tip (kite length 20 at full size, 10 at rest): the inner tip is the outer tip + the current kite length along the axis.
  x: station.x + (Math.cos(station.a) * (kiteLength - INNER_TIP_REACH_PX)),
  y: station.y + (Math.sin(station.a) * (kiteLength - INNER_TIP_REACH_PX))
});

/** Longest run of consecutive frames for which `predicate(frame)` holds. */
const longestRun = (frames, predicate) => {
  let best = 0;
  let current = 0;
  for (const frame of frames) {
    current = predicate(frame) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
};

/**
 * MAZER-VIS-038 beam attachment, from the drawn geometry. Both directions end on the diamond's INNER TIP (pixel snapped, so within
 * one device pixel) and the beam stays attached there for the WHOLE fill (departure: head on the tip AND tail on the player) /
 * the WHOLE drain (arrival: tail on the tip) before it lets go. Returns, per station, the longest attached run in frames.
 */
const analyzeAttachment = (frames, direction) => {
  const runs = [];
  const maxErrors = [];
  for (const id of ALL_STATION_IDS) {
    const attached = (frame) => {
      const order = frame.firing.indexOf(id);
      const pair = order >= 0 ? frame.beamPairs[order] : undefined;
      const station = frame.stations.find((s) => s.id === id);
      if (!pair || !station) { return false; }
      const tolerance = 1.01 / frame.dpr;
      const tip = innerTipOf(station, frame.kiteLengths[id] ?? KITE_FULL_LENGTH_PX);
      if (direction === 'outward') {
        return dist({ x: pair[2], y: pair[3] }, tip) <= tolerance && dist({ x: pair[0], y: pair[1] }, frame.focus) <= Math.max(tolerance, 1.5);
      }
      return dist({ x: pair[0], y: pair[1] }, tip) <= tolerance;
    };
    runs.push(longestRun(frames, attached));
    // Smallest distance between the beam's diamond end and the inner tip over the whole beam life (0 = snapped onto it).
    let best = Number.POSITIVE_INFINITY;
    frames.forEach((frame) => {
      const order = frame.firing.indexOf(id);
      const pair = order >= 0 ? frame.beamPairs[order] : undefined;
      const station = frame.stations.find((s) => s.id === id);
      if (pair && station) {
        const end = direction === 'outward' ? { x: pair[2], y: pair[3] } : { x: pair[0], y: pair[1] };
        best = Math.min(best, dist(end, innerTipOf(station, frame.kiteLengths[id] ?? KITE_FULL_LENGTH_PX)));
      }
    });
    maxErrors.push(best);
  }
  return { minAttachedFrames: Math.min(...runs), runs, worstTipError: Math.max(...maxErrors), maxErrors };
};

/**
 * MAZER-VIS-043: the PAINTED outer tip of every diamond touches the visible screen edge it sits on, at every size and every frame in `frames`
 * (never past it, never more than half a device pixel short of it). The outer tip is vertex 2 of the drawn kite; the miter join paints
 * TIP_PAINT_PX beyond it along the axis (corner kites: toward the top / bottom edge by that times cos 45).
 */
const analyzeEdgeContact = (frames) => {
  let worstShort = 0;
  let worstPast = 0;
  let checked = 0;
  let worst = null;
  for (const frame of frames) {
    if (frame.visible === null || frame.outerTips === undefined) { continue; }
    const half = 0.5 / frame.visible.res;
    frame.outerTips.forEach((tip, id) => {
      if (tip === null) { return; }
      const side = STATION_SIDE[id];
      const paint = id % 2 === 0 ? TIP_PAINT_PX * Math.SQRT1_2 : TIP_PAINT_PX;
      const gap = side === 'top' ? tip.y - paint
        : side === 'bottom' ? frame.visible.h - (tip.y + paint)
          : side === 'left' ? tip.x - paint
            : frame.visible.w - (tip.x + paint);
      checked += 1;
      if (gap < worstPast) { worstPast = gap; worst = { id, gap, age: frame.introAge ?? frame.outroAge }; }
      if (gap > worstShort) { worstShort = gap; worst = { id, gap, age: frame.introAge ?? frame.outroAge }; }
    });
  }
  return { ok: checked > 0 && worstPast >= -0.001 && worstShort <= (0.5 / (frames.find((f) => f.visible)?.visible.res ?? 1)) + 0.001, checked, worstShort, worstPast, worst };
};

/**
 * MAZER-VIS-038 size cycle, checked on the drawn kites (tip -> outer tip length: 20 css px at full size, 10 at 50%).
 * DEPARTURE frames (`kind` 'departure'): every kite starts at ~50%, only ever grows, is full size on every frame its own beam head
 * sits on its tip, and is full size from the last contact to the end of the deconstruct.
 * ARRIVAL frames (`kind` 'arrival', `buildEndAge` = the age the beams leave): full size through the build (after the cold-start charge),
 * only ever shrinks from the moment its own beam has left and drained, never shrinks while its beam is draining it, and is back
 * at 50% by the end.
 */
const lengthOf = (frame, id) => frame.kiteLengths[id];
const approx = (value, target) => value !== null && value !== undefined && Math.abs(value - target) <= KITE_LENGTH_TOLERANCE_PX;
const analyzeKiteSize = (frames, kind, { buildEndAge = null, chargedAge = 0 } = {}) => {
  const problems = [];
  const note = (why, detail) => { if (problems.length < 4) { problems.push({ why, detail }); } };
  const withKites = frames.filter((f) => f.kiteLengths.length === 8 && f.kiteLengths.every((v) => v !== null));
  if (withKites.length === 0) { return { ok: false, problems: [{ why: 'no frame with 8 kites' }] }; }
  if (kind === 'departure') {
    const first = withKites[0];
    // The first deconstruct frame is at most a frame into the grow (c = 16 ms of a >= 302 ms smoothstep): below 11 px.
    if (!first.kiteLengths.every((v) => v >= KITE_REST_LENGTH_PX - KITE_LENGTH_TOLERANCE_PX && v <= 11)) { note('does not start at 50%', first.kiteLengths); }
    ALL_STATION_IDS.forEach((id) => {
      let previous = 0;
      withKites.forEach((frame) => {
        const length = lengthOf(frame, id);
        if (length < previous - 0.01) { note('shrank during the departure', { id, previous, length }); }
        previous = length;
        const order = frame.firing.indexOf(id);
        const pair = order >= 0 ? frame.beamPairs[order] : undefined;
        const station = frame.stations.find((s) => s.id === id);
        const headOnTip = pair && station && dist({ x: pair[2], y: pair[3] }, innerTipOf(station, lengthOf(frame, id))) <= 1.01 / frame.dpr;
        if (headOnTip && !approx(length, KITE_FULL_LENGTH_PX)) { note('beam attached to a diamond that is not full size', { id, length, age: frame.outroAge }); }
        if (frame.outroAge !== null && frame.outroAge >= OUTRO_LASER_END_MS + FRAME_MS && !approx(length, KITE_FULL_LENGTH_PX)) { note('not full size after the last contact', { id, length, age: frame.outroAge }); }
      });
    });
    return { ok: problems.length === 0, problems };
  }
  // arrival
  withKites.forEach((frame) => {
    const age = frame.introAge;
    if (age === null) { return; }
    if (age >= chargedAge && buildEndAge !== null && age <= buildEndAge) {
      frame.kiteLengths.forEach((length, id) => { if (!approx(length, KITE_FULL_LENGTH_PX)) { note('not full size during the build', { id, length, age }); } });
    }
  });
  const firstFiringAge = new Map();
  withKites.forEach((frame) => frame.firing.forEach((id) => { if (!firstFiringAge.has(id) && frame.introAge !== null) { firstFiringAge.set(id, frame.introAge); } }));
  ALL_STATION_IDS.forEach((id) => {
    let previous = KITE_FULL_LENGTH_PX + 1;
    withKites.forEach((frame) => {
      const age = frame.introAge;
      if (age === null || buildEndAge === null || age < buildEndAge - FRAME_MS) { return; }
      const length = lengthOf(frame, id);
      if (length > previous + 0.01) { note('grew during the arrival', { id, previous, length }); }
      previous = length;
      const launch = firstFiringAge.get(id);
      // The diamond must not shrink while its own beam is still draining it (drain = 200 ms from its launch).
      if (launch !== undefined && age < launch + PULSE_TAIL_MS - (2 * FRAME_MS) && !approx(length, KITE_FULL_LENGTH_PX)) { note('shrank before it was drained', { id, length, age, launch }); }
    });
  });
  const last = withKites[withKites.length - 1];
  // Only when the recorded frames run to the end of the intro (the beams leave, land, and the 350 ms pop is over: 750 ms after they leave);
  // some captures stop at the input unlock, which is before the last diamond has finished shrinking.
  const coversEnd = buildEndAge !== null && last.introAge !== null && last.introAge >= buildEndAge + 750 - FRAME_MS;
  if (coversEnd && !last.kiteLengths.every((length) => approx(length, KITE_REST_LENGTH_PX))) { note('not back at 50% at the end', last.kiteLengths); }
  return { ok: problems.length === 0, problems };
};

/**
 * The ring FILL contract (MAZER-VIS-030, supersedes live audit findings 4 and 6), checked on every frame. A diamond
 * counts as "lit" while it holds some fill (its stroke alpha rises with the fill):
 *  - arrival (inward): ALL 8 diamonds are full from the end of the first build ms (a cold start charges the ring over
 *    INTRO_RING_CHARGE_MS) until THEIR OWN beam leaves; each then drains and is dark once its beam has fully left (the
 *    beam is "in flight" until its tail has landed, a pulse after the diamond emptied); after the intro none is lit.
 *  - departure (outward): a diamond is empty until the player's beam reaches it, fills as the beam is absorbed
 *    (still "in flight" until the tail has landed), and is lit once its beam has landed, held to the end of the
 *    deconstruct (no end fade: the ring stays full into the next build).
 */
const INTRO_RING_CHARGE_MS = 400;
const analyzeLighting = (frames, direction) => {
  const firstFiring = new Map();
  let ok = true;
  const problems = [];
  let allLitFrames = 0;
  let litAfterEnd = 0;
  frames.forEach((frame, index) => {
    frame.firing.forEach((id) => { if (!firstFiring.has(id)) { firstFiring.set(id, index); } });
    if (direction === 'inward') {
      const chargedMs = INTRO_BUILD_START_MS + INTRO_RING_CHARGE_MS + (2 * FRAME_MS);
      for (const id of ALL_STATION_IDS) {
        const fired = firstFiring.has(id);
        const landed = fired && !frame.firing.includes(id) && index > firstFiring.get(id);
        if (!fired && frame.introActive && frame.introAge !== null && frame.introAge >= chargedMs && !frame.lit.includes(id)) {
          ok = false; problems.push({ index, id, why: 'not full before its own beam left' });
        }
        if (landed && frame.lit.includes(id)) { ok = false; problems.push({ index, id, why: 'still lit after its beam fully left' }); }
      }
      if (firstFiring.size === 0 && frame.lit.length === 8) { allLitFrames += 1; }
    } else {
      for (const [id, start] of firstFiring) {
        const landed = !frame.firing.includes(id) && index > start;
        if (landed && frame.outroAge !== null && !frame.lit.includes(id)) { ok = false; problems.push({ index, id, why: 'unlit after its beam landed' }); }
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
  const seenStart = new Set();
  let firstMismatch = null;
  for (const frame of beamFrames) {
    frame.firing.forEach((id) => sceneIds.add(id));
    maxConcurrent = Math.max(maxConcurrent, frame.firing.length);
    const stations = frame.stations;
    // The pulses are drawn in station order, so pulse i belongs to the i-th firing id; beamStationId checks the drawn geometry is
    // consistent with that station and direction.
    const ids = frame.beamPairs.map((pair, order) => beamStationId(pair, stations, frame.focus, direction, frame.firing[order]));
    if (frame.beamPairs.length !== frame.firing.length) { pairCountMatchesScene = false; }
    if (ids.some((id) => id === null) || !sameList(ids.slice().sort((a, b) => a - b), frame.firing)) {
      geometryMatchesScene = false;
      firstMismatch ??= { age: direction === 'inward' ? frame.introAge : frame.outroAge, ids, firing: frame.firing, pairs: frame.beamPairs.map((p) => p.map((v) => Math.round(v))), focus: frame.focus };
    }
    ids.forEach((id) => { if (id !== null) { geometryIds.add(id); } });
    frame.beamPairs.forEach((pair, index) => {
      if (ids[index] !== null) { lastTip.set(ids[index], { tip: { x: pair[2], y: pair[3] }, focus: frame.focus, station: stations.find((s) => s.id === ids[index]) }); }
      // A new pulse must be first seen at its source: the diamond outline (inward) or the player (outward). The tail may leave the
      // source later (one pulse after the head), so only the first frame of each beam is a start check.
      if (ids[index] !== null && !seenStart.has(ids[index])) {
        seenStart.add(ids[index]);
        const station = stations.find((s) => s.id === ids[index]);
        const startsAtSource = direction === 'inward'
          ? dist(station, { x: pair[0], y: pair[1] }) <= KITE_REACH_PX
          : dist(frame.focus, { x: pair[0], y: pair[1] }) <= Math.max(2, frame.focus.tile * 0.75);
        if (!startsAtSource) { wrongDirectionPairs += 1; }
      }
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
    // The diamond end is the kite's INNER TIP (10 px from its centre toward the board).
    if (!(total > 0 && remaining <= Math.max(total * 0.1, KITE_REACH_PX))) { tipsReachFarEnd = false; }
  }
  return {
    beamFrameCount: beamFrames.length,
    sceneIds: Array.from(sceneIds).sort((a, b) => a - b),
    geometryIds: Array.from(geometryIds).sort((a, b) => a - b),
    geometryMatchesScene,
    firstMismatch,
    pairCountMatchesScene,
    wrongDirectionPairs,
    lighting: analyzeLighting(frames, direction),
    attachment: analyzeAttachment(frames, direction),
    maxConcurrent,
    firstAge,
    lastAge,
    tipsReachFarEnd
  };
};

/** The poof where the inward beams converge must sit on the spawn tile. */
const poofConvergesOnSpawn = (frames) => {
  const poof = frames.filter((f) => f.sparkleMids.length > 0 && f.introAge !== null);
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
    const reducedBuildEdge = analyzeEdgeContact(buildFrames.filter((f) => f.markerCount === 8));
    check(`${label}: reduced motion keeps every diamond's painted outer tip on the screen edge (fixed 50% size; ${reducedBuildEdge.checked} samples)`, reducedBuildEdge.ok, JSON.stringify(reducedBuildEdge));
    check(`${label}: reduced motion keeps every diamond at a FIXED 50% size through the build (no size animation)`, buildFrames.filter((f) => f.markerCount === 8).every((f) => f.kiteLengths.every((length) => approx(length, KITE_REST_LENGTH_PX))), JSON.stringify(buildFrames.find((f) => f.markerCount === 8 && f.kiteLengths.some((length) => !approx(length, KITE_REST_LENGTH_PX)))?.kiteLengths));
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
  check(`${label}: ALL 8 diamonds are full through the whole build and drain only as THEIR beam leaves`, a.lighting.ok, JSON.stringify(a.lighting));
  const buildTiles = buildFrames[0]?.tiles ?? 0;
  check(`${label}: every arrival beam starts exactly on its diamond's INNER TIP (pixel snapped, within 1 device pixel) and stays attached there for the whole drain (>= ${Math.floor(PULSE_TAIL_MS / FRAME_MS) - 2} frames)`, a.attachment.worstTipError <= 1.01 / (buildFrames.find((f) => f.firing.length > 0)?.dpr ?? 1) && a.attachment.minAttachedFrames >= Math.floor(PULSE_TAIL_MS / FRAME_MS) - 2, JSON.stringify(a.attachment));
  const kitesArrival = analyzeKiteSize(buildFrames, 'arrival', { buildEndAge: introBuildEndMs(buildTiles), chargedAge: INTRO_BUILD_START_MS + INTRO_RING_CHARGE_MS + (3 * FRAME_MS) });
  check(`${label}: the diamonds are 100% size through the build, hold it while their beam drains them, then each shrinks back to 50% (anchored on its OUTER tip) and rests at 50%`, kitesArrival.ok, JSON.stringify(kitesArrival.problems));
  const arrivalEdge = analyzeEdgeContact(buildFrames.filter((f) => f.markerCount === 8 && f.introAge !== null && f.introAge >= introBuildEndMs(buildTiles)));
  check(`${label}: through the beam launch, the drain and the shrink every diamond's PAINTED outer tip stays on the screen edge (never past it, within half a device pixel; ${arrivalEdge.checked} samples)`, arrivalEdge.ok, JSON.stringify(arrivalEdge));
  check(
    `${label}: the beams fire only AFTER the build completes, the heads land 400 ms later and every beam is gone within ${PULSE_TAIL_MS} ms more (${introBuildEndMs(buildTiles)}-${introLaserEndMs(buildTiles)}+${PULSE_TAIL_MS} ms, one frame of slack)`,
    a.firstAge !== null && a.firstAge >= introBuildEndMs(buildTiles) - FRAME_MS && a.lastAge <= introLaserEndMs(buildTiles) + PULSE_TAIL_MS + FRAME_MS,
    `first=${a.firstAge} last=${a.lastAge}`
  );
  const firstBeamFrame = buildFrames.find((f) => f.firing.length > 0);
  check(`${label}: the maze is COMPLETE (every tile shown) the first frame a beam is in flight`, firstBeamFrame !== undefined && firstBeamFrame.tilesVisible === firstBeamFrame.tiles, JSON.stringify({ tilesVisible: firstBeamFrame?.tilesVisible, tiles: firstBeamFrame?.tiles }));
  const preBeam = buildFrames.filter((f) => f.introAge !== null && f.introAge < introBuildEndMs(buildTiles) - FRAME_MS);
  check(`${label}: no beam is drawn and the player is not revealed during the build (${preBeam.length} frames)`, preBeam.length > 20 && preBeam.every((f) => f.firing.length === 0 && f.lineCount === 0 && f.playerReveal === 0), JSON.stringify(preBeam.find((f) => f.firing.length > 0 || f.playerReveal !== 0)));
  // The input unlock is the head landing, exactly as before; the pulse tails keep draining into the spawn tile for one more pulse.
  const headsInFlight = buildFrames.filter((f) => f.firing.length > 0 && f.introAge !== null && f.introAge < introLaserEndMs(buildTiles) - FRAME_MS);
  check(`${label}: input is still locked while the beam heads fly (it unlocks at the landing, after the player appears)`, headsInFlight.length > 5 && headsInFlight.every((f) => f.locked === true), JSON.stringify({ frames: headsInFlight.length, unlockedAt: headsInFlight.find((f) => f.locked !== true)?.introAge }));
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
    const reducedCycleEdge = analyzeEdgeContact(frames.filter((f) => f.markerCount === 8 && f.drawPhase !== undefined && f.ring.every(Boolean)));
    check(`${label}: reduced motion keeps every diamond's painted outer tip on the screen edge through the whole cycle (${reducedCycleEdge.checked} samples)`, reducedCycleEdge.ok, JSON.stringify(reducedCycleEdge));
    check(`${label}: reduced motion keeps every diamond at a FIXED 50% size through the whole cycle (no size animation, ${frames.length} frames)`, frames.filter((f) => f.markerCount === 8).every((f) => f.kiteLengths.every((length) => approx(length, KITE_REST_LENGTH_PX))), JSON.stringify(frames.find((f) => f.markerCount === 8 && f.kiteLengths.some((length) => !approx(length, KITE_REST_LENGTH_PX)))?.kiteLengths));
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
    check(`${label}: each diamond fills as the player beam REACHES it and all 8 stay full to the end of the deconstruct`, d.lighting.ok, JSON.stringify(d.lighting));
    check(
      `${label}: every departure beam ends exactly on its diamond's INNER TIP (pixel snapped) and stays attached there, tail on the player, for the whole fill (>= ${Math.floor(PULSE_TAIL_MS / FRAME_MS) - 2} frames)`,
      d.attachment.worstTipError <= 1.01 / (departure.find((f) => f.firing.length > 0)?.dpr ?? 1) && d.attachment.minAttachedFrames >= Math.floor(PULSE_TAIL_MS / FRAME_MS) - 2,
      JSON.stringify(d.attachment)
    );
    const departureEdge = analyzeEdgeContact(departure.filter((f) => f.markerCount === 8 && f.outroAge <= DEPARTURE_BEAM_END_MS));
    check(`${label}: while the diamonds grow 50% to 100% and hold, every diamond's PAINTED outer tip stays on the screen edge (never past it, within half a device pixel; ${departureEdge.checked} samples)`, departureEdge.ok, JSON.stringify(departureEdge));
    const kitesDeparture = analyzeKiteSize(departure, 'departure');
    check(`${label}: on goal the diamonds grow from 50% to 100%, are full size whenever their beam is attached, and stay full to the end of the deconstruct`, kitesDeparture.ok, JSON.stringify(kitesDeparture.problems));
    check(
      `${label}: the departure beams fire inside the deconstruct laser window (heads 0-${OUTRO_LASER_END_MS} ms, attached for the ${PULSE_TAIL_MS} ms fill, retracted within ${RETRACT_MS} ms more: <= ${DEPARTURE_BEAM_END_MS} ms, one frame of slack)`,
      d.firstAge !== null && d.firstAge >= 0 && d.lastAge <= DEPARTURE_BEAM_END_MS + FRAME_MS,
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
  check(`${label}: with the maze running every diamond rests at 50% size (${KITE_REST_LENGTH_PX} px tip to outer tip)`, last.markerCount === 8 && last.kiteLengths.every((length) => approx(length, KITE_REST_LENGTH_PX)), JSON.stringify(last.kiteLengths));
  const settledEdge = analyzeEdgeContact([last]);
  check(`${label}: at rest (the maze running, 50% size) every diamond's painted outer tip is on the screen edge`, settledEdge.ok, JSON.stringify(settledEdge));
  const probe = await h.page.evaluate(() => window.__mazerQa.edgePixelProbe());
  const footprint = (id) => probe.boxes.find((b) => b.id === id);
  const touches = (id) => {
    const box = footprint(id)?.box;
    if (!box) { return false; }
    const side = STATION_SIDE[id];
    return side === 'top' ? box.minY <= 1 : side === 'bottom' ? box.maxY >= probe.h - 2 : side === 'left' ? box.minX <= 1 : box.maxX >= probe.w - 2;
  };
  check(`${label}: real canvas pixels (layer shown vs hidden on the same frame): each diamond's footprint reaches the last two device rows/columns of its edge (${probe.w}x${probe.h} px)`, ALL_STATION_IDS.every(touches), JSON.stringify(probe.boxes));
  const clearance = Math.floor(CORNER_CLEARANCE_PX * probe.res) - 1;
  check(
    `${label}: real canvas pixels: the four corner diamonds clear a ${CORNER_CLEARANCE_PX} css px rounded display corner (footprint at least ${clearance} device px from the corner along the edge)`,
    [0, 6].every((id) => (footprint(id)?.box?.minX ?? -1) >= clearance) && [2, 4].every((id) => (footprint(id)?.box?.maxX ?? Infinity) <= probe.w - clearance),
    JSON.stringify(probe.boxes.filter((b) => b.id % 2 === 0))
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
    // 200 ms unlock, and the transfer cycle still completes.
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
