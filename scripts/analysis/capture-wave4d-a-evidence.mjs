/**
 * Wave 4D-A: real visual evidence exports for the Navigation Core v1
 * continuous-trail review (PR #345 correction pass). Drives the actual
 * built game via Playwright, using direct-but-real scene-state assignment
 * (this.maze/this.player/this.trail are plain fields the real renderer
 * already reads every frame -- not a mock) to deterministically construct
 * every required scenario (each corner orientation, exact shine
 * positions, pause/resume, reduced motion, start's three states, goal at
 * several scales) rather than hoping a single random maze/seed happens to
 * contain all of them. Shine/color positions are computed from the real
 * production diagnostics the browser itself reports (window.__MAZER_QA__
 * .getTrailPerfDiagnostics(), the same instrumentation
 * drawLegacyContinuousPlayTrail populates every draw), so "put the shine
 * exactly at the corner" is real production math, not a guess -- and not a
 * reimplementation of it in Node (which can't import a .ts module anyway).
 *
 * Usage: node scripts/analysis/capture-wave4d-a-evidence.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';
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

// -- Small synthetic mazes, one per scenario, built from a boolean grid string
// where '#' is floor and '.' is wall/void. Keeps every scenario tiny,
// controlled, and easy to eyeball-verify against its own ASCII art. --
const gridFromAscii = (rows) => rows.map((row) => row.split('').map((c) => c === '#'));

// Pads every synthetic maze with a 1-cell wall border on all sides
// (shifting start/goal by +1,+1 to match), otherwise the BFS shortest-path
// renderer (resolveLegacyPlayPerfectPathTrail, which runs the real,
// production 'playable-wrap-aware' graph policy) treats a tiny maze's
// literal opposite edges as wrap-adjacent floor and takes a 1-step "wrap
// shortcut" straight across the whole board instead of the intended
// corridor -- confirmed directly (a bare, unpadded 1x5 straight maze
// collapsed resolveLegacyPlayPerfectPathTrail's own return value from the
// intended 5-point path down to a 2-point [start, goal] wrap-jump, which
// then produced a zero-length trail with nothing rendered at all). A real
// wall border makes every wrap-target cell non-floor, closing that
// shortcut, exactly the way a real generated maze's own outer boundary
// already does at production scale.
const padWithWallBorder = (rows) => {
  const width = rows[0].length;
  const wallRow = '.'.repeat(width + 2);
  const padded = [wallRow, ...rows.map((row) => `.${row}.`), wallRow];
  return padded;
};

const RAW_MAZES = {
  straight: { rows: ['#####'], start: { x: 0, y: 0 }, goal: { x: 4, y: 0 } },
  cornerNE: { rows: ['..#', '..#', '###'], start: { x: 0, y: 2 }, goal: { x: 2, y: 0 } }, // right then up
  cornerNW: { rows: ['#..', '#..', '###'], start: { x: 2, y: 2 }, goal: { x: 0, y: 0 } }, // left then up
  cornerSE: { rows: ['###', '..#', '..#'], start: { x: 0, y: 0 }, goal: { x: 2, y: 2 } }, // right then down
  cornerSW: { rows: ['###', '#..', '#..'], start: { x: 2, y: 0 }, goal: { x: 0, y: 2 } } // left then down
};

const MAZES = Object.fromEntries(
  Object.entries(RAW_MAZES).map(([key, spec]) => [
    key,
    {
      rows: padWithWallBorder(spec.rows),
      start: { x: spec.start.x + 1, y: spec.start.y + 1 },
      goal: { x: spec.goal.x + 1, y: spec.goal.y + 1 }
    }
  ])
);

const buildMazeSnapshot = (spec) => {
  const grid = gridFromAscii(spec.rows);
  return {
    source: 'play-generated',
    width: grid[0].length,
    height: grid.length,
    grid,
    start: spec.start,
    goal: spec.goal,
    solutionPath: [],
    seed: 1
  };
};

const setSceneState = async (page, { maze, player, trail, hasPlayerEverLeftStart, reducedMotion, toggleTrailFade, toggleTrailShine }) => {
  await page.evaluate((cfg) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    if (cfg.maze) scene.maze = cfg.maze;
    if (cfg.player) {
      scene.player = cfg.player;
      scene.syncLegacyPlayerVisualMotionTo(cfg.player);
    }
    if (cfg.trail) scene.trail = cfg.trail;
    if (cfg.hasPlayerEverLeftStart !== undefined) scene.hasPlayerEverLeftStart = cfg.hasPlayerEverLeftStart;
    if (cfg.toggleTrailFade !== undefined) scene.settings.toggleTrailFade = cfg.toggleTrailFade;
    if (cfg.toggleTrailShine !== undefined) scene.settings.toggleTrailPulse = cfg.toggleTrailShine;
    if (cfg.reducedMotion !== undefined) scene.applyLegacyReducedMotionPreference(cfg.reducedMotion);
    // Force the maze's own tile-by-tile "reveal" animation to fully
    // settled -- without this, a synthetic maze swapped in mid-script
    // inherits whatever partial reveal-progress counters were left over
    // from the real maze's own build animation, and reads as invisible
    // (blank corridor/start/goal/trail) until that leftover state happens
    // to catch up. resolveLegacyMenuDeconstructTrailAlpha/PlayerAlpha both
    // return full alpha whenever the phase isn't 'deconstructing', and
    // resolveLegacyMenuStaticDrawTileLimit/RowLimit both return null (no
    // limit, everything visible) whenever their counters are null.
    scene.menuStaticDrawLifecyclePhase = 'settled';
    scene.menuStaticDrawRowsVisible = null;
    scene.menuStaticDrawTilesVisible = null;
    scene.menuStaticDeconstructStartedAtMs = null;
    scene.boardStaticDirty = true;
    scene.boardPathDirty = true;
    scene.boardDynamicDirty = true;
  }, { maze, player, trail, hasPlayerEverLeftStart, reducedMotion, toggleTrailFade, toggleTrailShine });
};

const setTrailClock = async (page, { elapsedMs, lapStartedAtMs }) => {
  await page.evaluate((cfg) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    scene.trailAnimationElapsedMs = cfg.elapsedMs;
    scene.trailShineLapStartedAtMs = cfg.lapStartedAtMs;
  }, { elapsedMs, lapStartedAtMs });
};

const stepFrames = async (page, n = 3) => {
  await page.evaluate((count) => {
    const game = window.__MAZER_GAME__;
    let t = performance.now();
    for (let i = 0; i < count; i += 1) {
      t += 16.6667;
      game.loop.step(t);
    }
  }, n);
};

const captureCanvasRegionPng = async (page, region, scale = 6) => {
  const dataUrl = await page.evaluate(({ x, y, w, h, scale: s }) => {
    const canvas = document.querySelector('canvas');
    const off = document.createElement('canvas');
    off.width = w * s;
    off.height = h * s;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, x, y, w, h, 0, 0, w * s, h * s);
    return off.toDataURL('image/png');
  }, { ...region, scale });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

// window.__MAZER_VISUAL_DIAGNOSTICS__ is throttled (publishVisualDiagnostics
// only recomputes every legacyTuning.menu.runtime.diagnosticsPublishIntervalMs
// = 1500ms of scene time, unless a play-lifecycle signature change forces it)
// -- reassigning scene.maze directly doesn't touch that signature, so reading
// the diagnostics object here can return a STALE board frame left over from
// whatever maze last triggered a publish. Calling the scene's own
// resolveLegacyMazeRenderFrame directly is what the real per-frame draw path
// uses (unthrottled), so it always matches what's actually on screen.
const getBoardFrame = async (page) => (
  page.evaluate(() => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const boardOffset = scene.resolveBoardOffset();
    const frame = scene.resolveLegacyMazeRenderFrame(
      scene.layout.boardLeft + boardOffset.x,
      scene.layout.boardTop + boardOffset.y,
      scene.layout.boardWidth,
      scene.layout.boardHeight
    );
    return { left: frame.boardLeft, top: frame.boardTop, tileSize: frame.tileSize };
  })
);

const labelPng = async (buffer, label, width) => {
  const svg = Buffer.from(
    `<svg width="${width}" height="28"><rect width="100%" height="100%" fill="#0b0f14"/><text x="6" y="19" font-family="monospace" font-size="14" fill="#e6fff5">${label}</text></svg>`
  );
  const base = await sharp(buffer).resize({ width, fit: 'inside' }).toBuffer();
  const baseMeta = await sharp(base).metadata();
  const canvas = sharp({
    create: { width: baseMeta.width, height: baseMeta.height + 28, channels: 4, background: '#0b0f14' }
  });
  return canvas.composite([{ input: svg, top: 0, left: 0 }, { input: base, top: 28, left: 0 }]).png().toBuffer();
};

const compositeGrid = async (labeledBuffers, columns, tileWidth) => {
  const rows = Math.ceil(labeledBuffers.length / columns);
  const metas = await Promise.all(labeledBuffers.map((b) => sharp(b).metadata()));
  const tileHeight = Math.max(...metas.map((m) => m.height));
  const canvas = sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 4,
      background: '#05070a'
    }
  });
  const composites = labeledBuffers.map((buf, i) => ({
    input: buf,
    left: (i % columns) * tileWidth,
    top: Math.floor(i / columns) * tileHeight
  }));
  return canvas.composite(composites).png().toBuffer();
};

const CORNER_SCENARIOS = [
  ['cornerNE', 'Corner: right -> up'],
  ['cornerNW', 'Corner: left -> up'],
  ['cornerSE', 'Corner: right -> down'],
  ['cornerSW', 'Corner: left -> down']
];

// Builds the trail in real CONNECTED, start-to-goal order for a maze that's
// a simple L-shape (horizontal leg along start.y, then vertical leg along
// goal.x) -- every one of the four corner scenarios above. A prior version
// built "trail" by scanning every floor cell row-major instead of following
// the actual route; since resolveLegacyPlayPerfectPathTrail (the real
// production method) treats trail[0] as the route's origin, a row-major
// scan's first cell often wasn't the start at all (for some orientations it
// was the goal, or otherwise disconnected from a sensible walk order),
// which silently produced a missing or one-legged trail for 3 of the 4
// corners. This constructs the path the player actually would have walked.
const orderedCornerPath = (spec) => {
  const path = [];
  const stepX = Math.sign(spec.goal.x - spec.start.x);
  for (let x = spec.start.x; x !== spec.goal.x; x += stepX) {
    path.push({ x, y: spec.start.y });
  }
  const stepY = Math.sign(spec.goal.y - spec.start.y);
  for (let y = spec.start.y; y !== spec.goal.y; y += stepY) {
    path.push({ x: spec.goal.x, y });
  }
  path.push({ x: spec.goal.x, y: spec.goal.y });
  return path;
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outDir = typeof args['out-dir'] === 'string' ? args['out-dir'] : process.cwd();

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });

  try {
    // ============================================================
    // Contact sheet #1: review sheet (normal/compact corridor, straight
    // trail, 4 corners, player connection, start x3, goal x3, fade x2,
    // shine x2, reduced motion)
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(300);
      // Stop Phaser's own live requestAnimationFrame loop so the ONLY
      // clock advancing scene state is our manual game.loop.step() calls
      // below -- otherwise the real rAF loop keeps ticking in true wall-
      // clock time in parallel with our synthetic steps, racing our
      // pause/resume and shine-position math against real elapsed time.
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      const panels = [];
      const straightSpec = MAZES.straight;
      const straightMazeWidth = straightSpec.goal.x - straightSpec.start.x + 1 + 2; // +2 for the wall border
      const straightPath = (fromX = straightSpec.start.x, toX = straightSpec.goal.x) => {
        const points = [];
        for (let x = fromX; x <= toX; x += 1) points.push({ x, y: straightSpec.start.y });
        return points;
      };
      // The floor row sits at renderBounds.top + (start.y * tileSize), not
      // at renderBounds.top directly -- the wall-padding row above it (see
      // padWithWallBorder) occupies row 0. Confirmed empirically by pixel-
      // scanning the real rendered canvas, not assumed.
      const straightRegion = (frame) => ({
        x: frame.left - 4,
        y: frame.top + (straightSpec.start.y * frame.tileSize) - 4,
        w: (straightMazeWidth * frame.tileSize) + 8,
        h: frame.tileSize + 8
      });

      // Straight trail, normal scale
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, {
          maze,
          player: straightSpec.goal,
          trail: straightPath(),
          hasPlayerEverLeftStart: true,
          toggleTrailFade: true,
          toggleTrailShine: true,
          reducedMotion: false
        });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, straightRegion(frame));
        panels.push(await labelPng(buf, 'Straight trail (normal scale)', 640));
      }

      // Compact scale (small viewport -> small tileSize), same straight maze
      {
        await page.setViewportSize({ width: 480, height: 360 });
        // Phaser's Scale Manager debounces its resize handling with a real
        // setTimeout, which a manual game.loop.step() tick does not advance --
        // wait in real wall-clock time so renderBounds/tileSize settle to the
        // new viewport before we read them, or the capture region is computed
        // from stale (previous-viewport) bounds and lands on blank canvas.
        await page.waitForTimeout(150);
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, straightRegion(frame), 10);
        panels.push(await labelPng(buf, 'Straight trail (compact scale)', 640));
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(150);
      }

      // Four corner orientations
      for (const [key, label] of CORNER_SCENARIOS) {
        const spec = MAZES[key];
        const maze = buildMazeSnapshot(spec);
        const trailPoints = orderedCornerPath(spec);
        // Assert both legs are actually present -- a real turn, not a
        // straight line or a degenerate single point -- before capturing,
        // rather than silently composing a sheet that can't prove the turn.
        const hasHorizontalLeg = trailPoints.some((p) => p.x !== spec.goal.x);
        const hasVerticalLeg = trailPoints.some((p) => p.y !== spec.start.y);
        if (trailPoints[0].x !== spec.start.x || trailPoints[0].y !== spec.start.y) {
          throw new Error(`Corner fixture '${key}': trail must originate at start, got ${JSON.stringify(trailPoints[0])}`);
        }
        if (!hasHorizontalLeg || !hasVerticalLeg) {
          throw new Error(`Corner fixture '${key}': missing a leg -- horizontal=${hasHorizontalLeg} vertical=${hasVerticalLeg}`);
        }
        await setSceneState(page, {
          maze,
          player: spec.goal,
          trail: trailPoints,
          hasPlayerEverLeftStart: true
        });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(
          page,
          { x: frame.left - 4, y: frame.top - 4, w: (maze.width * frame.tileSize) + 8, h: (maze.height * frame.tileSize) + 8 },
          8
        );
        panels.push(await labelPng(buf, label, 480));
      }

      // Player connection (exact tile*0.3 trim -- zoom tight on the player)
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, { maze, player: straightSpec.goal, trail: straightPath() });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(
          page,
          { x: frame.left + ((straightSpec.goal.x - 1) * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: (2 * frame.tileSize) + 12, h: frame.tileSize + 12 },
          10
        );
        panels.push(await labelPng(buf, 'Player connection (tile*0.3 trim)', 640));
      }

      // Start: pre-spawn (player still on start)
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, { maze, player: straightSpec.start, trail: [straightSpec.start], hasPlayerEverLeftStart: false });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (straightSpec.start.x * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: frame.tileSize + 12, h: frame.tileSize + 12 }, 12);
        panels.push(await labelPng(buf, 'Start: pre-spawn (occupied)', 400));
      }

      // Start: post-spawn (player left)
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, { maze, player: straightSpec.goal, trail: straightPath(), hasPlayerEverLeftStart: true });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (straightSpec.start.x * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: frame.tileSize + 12, h: frame.tileSize + 12 }, 12);
        panels.push(await labelPng(buf, 'Start: post-spawn (left)', 400));
      }

      // Start: revisit (player back on start, latch must stay flipped)
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, { maze, player: straightSpec.start, trail: [straightSpec.start], hasPlayerEverLeftStart: true });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (straightSpec.start.x * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: frame.tileSize + 12, h: frame.tileSize + 12 }, 12);
        panels.push(await labelPng(buf, 'Start: revisited (still post-spawn)', 400));
      }

      // Goal: normal scale
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, { maze, player: straightSpec.start, trail: [straightSpec.start] });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (straightSpec.goal.x * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: frame.tileSize + 12, h: frame.tileSize + 12 }, 12);
        panels.push(await labelPng(buf, 'Goal (normal scale)', 400));
      }

      // Goal: compact scale
      {
        await page.setViewportSize({ width: 480, height: 360 });
        await page.waitForTimeout(150);
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (straightSpec.goal.x * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: frame.tileSize + 12, h: frame.tileSize + 12 }, 16);
        panels.push(await labelPng(buf, 'Goal (compact scale)', 400));
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(150);
      }

      // Goal: adjacent player
      {
        const maze = buildMazeSnapshot(straightSpec);
        const adjacent = { x: straightSpec.goal.x - 1, y: straightSpec.goal.y };
        await setSceneState(page, { maze, player: adjacent, trail: straightPath(straightSpec.start.x, adjacent.x) });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + ((adjacent.x - 2) * frame.tileSize) - 6, y: frame.top + (straightSpec.start.y * frame.tileSize) - 6, w: (3 * frame.tileSize) + 12, h: frame.tileSize + 12 }, 10);
        panels.push(await labelPng(buf, 'Goal adjacent to player', 480));
      }

      // Trail Fade off / on
      for (const toggleTrailFade of [false, true]) {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, {
          maze,
          player: straightSpec.goal,
          trail: straightPath(),
          toggleTrailFade,
          toggleTrailShine: false
        });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, straightRegion(frame));
        panels.push(await labelPng(buf, `Trail Fade ${toggleTrailFade ? 'ON' : 'OFF'}`, 640));
      }

      // Trail Shine off / on
      for (const toggleTrailShine of [false, true]) {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, {
          maze,
          player: straightSpec.goal,
          trail: straightPath(),
          toggleTrailFade: true,
          toggleTrailShine,
          reducedMotion: false
        });
        await setTrailClock(page, { elapsedMs: 500, lapStartedAtMs: 0 });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, straightRegion(frame));
        panels.push(await labelPng(buf, `Trail Shine ${toggleTrailShine ? 'ON' : 'OFF'}`, 640));
      }

      // Reduced motion
      {
        const maze = buildMazeSnapshot(straightSpec);
        await setSceneState(page, {
          maze,
          player: straightSpec.goal,
          trail: straightPath(),
          toggleTrailFade: true,
          toggleTrailShine: true,
          reducedMotion: true
        });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, straightRegion(frame));
        panels.push(await labelPng(buf, 'Reduced motion (no shine, trail stays)', 640));
      }

      const sheet = await compositeGrid(panels, 3, 480);
      writeFileSync(`${outDir}/mazer-wave4d-a-navigation-core-review-sheet.png`, sheet);
      process.stderr.write('Wrote mazer-wave4d-a-navigation-core-review-sheet.png\n');

      await context.close();
    }

    // ============================================================
    // Contact sheet #2: goal proof (normal/compact/adjacent/reduced-motion)
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(300);
      // Stop Phaser's own live requestAnimationFrame loop so the ONLY
      // clock advancing scene state is our manual game.loop.step() calls
      // below -- otherwise the real rAF loop keeps ticking in true wall-
      // clock time in parallel with our synthetic steps, racing our
      // pause/resume and shine-position math against real elapsed time.
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      const panels = [];
      const spec = MAZES.straight;
      const adjacentToGoal = { x: spec.goal.x - 1, y: spec.goal.y };

      const captureGoal = async (label, player, reducedMotion, scale) => {
        const maze = buildMazeSnapshot(spec);
        await setSceneState(page, { maze, player, trail: [spec.start], reducedMotion });
        await stepFrames(page);
        const frame = await getBoardFrame(page);
        const buf = await captureCanvasRegionPng(page, { x: frame.left + (spec.goal.x * frame.tileSize) - 8, y: frame.top + (spec.start.y * frame.tileSize) - 8, w: frame.tileSize + 16, h: frame.tileSize + 16 }, scale);
        panels.push(await labelPng(buf, label, 480));
      };

      await captureGoal('Goal: normal scale', spec.start, false, 12);
      await page.setViewportSize({ width: 480, height: 360 });
      await page.waitForTimeout(150);
      await captureGoal('Goal: compact scale', spec.start, false, 18);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(150);
      await captureGoal('Goal: adjacent player', adjacentToGoal, false, 12);
      await captureGoal('Goal: reduced motion', spec.start, true, 12);

      const sheet = await compositeGrid(panels, 2, 480);
      writeFileSync(`${outDir}/mazer-wave4d-a-goal-proof.png`, sheet);
      process.stderr.write('Wrote mazer-wave4d-a-goal-proof.png\n');
      await context.close();
    }

    // ============================================================
    // Contact sheet #3: trail motion frames (shine crossing a corner,
    // fade-out before player, quiet interval, invisible restart) --
    // exact positions computed via the real production math, not guessed.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(300);
      // Stop Phaser's own live requestAnimationFrame loop so the ONLY
      // clock advancing scene state is our manual game.loop.step() calls
      // below -- otherwise the real rAF loop keeps ticking in true wall-
      // clock time in parallel with our synthetic steps, racing our
      // pause/resume and shine-position math against real elapsed time.
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      const spec = MAZES.cornerSE; // right then down
      const maze = buildMazeSnapshot(spec);
      const trailPoints = [];
      for (let y = 0; y < maze.height; y += 1) {
        for (let x = 0; x < maze.width; x += 1) {
          if (maze.grid[y][x]) trailPoints.push({ x, y });
        }
      }
      await setSceneState(page, { maze, player: spec.goal, trail: trailPoints, toggleTrailShine: true });
      await stepFrames(page);

      const panels = [];
      const frame = await getBoardFrame(page);
      const region = { x: frame.left - 8, y: frame.top - 8, w: (maze.width * frame.tileSize) + 16, h: (maze.height * frame.tileSize) + 16 };

      const captureAtElapsed = async (label, elapsedMs) => {
        await setTrailClock(page, { elapsedMs, lapStartedAtMs: 0 });
        await stepFrames(page);
        const buf = await captureCanvasRegionPng(page, region, 8);
        panels.push(await labelPng(buf, label, 420));
      };

      // Real numbers read back from the browser's own production math
      // (window.__MAZER_QA__.getTrailPerfDiagnostics(), the same
      // instrumentation the frame-time measurement script uses) --
      // totalLengthPx here is the ACTUAL built geometry's length for this
      // exact synthetic corner maze, not assumed. Speed matches
      // LEGACY_PLAY_TRAIL_SHINE_SPEED_TILES_PER_SEC (4.2 tiles/sec).
      const perf = await page.evaluate(() => window.__MAZER_QA__.getTrailPerfDiagnostics());
      const speedPxPerMs = (frame.tileSize * 4.2) / 1000;
      const totalLength = perf.totalLengthPx;
      const cornerDistance = totalLength / 2; // the corner sits at the midpoint of this symmetric two-segment L

      await captureAtElapsed('Leaving start (short trail)', 0);
      await captureAtElapsed('Shine near origin (fade-in)', 20 / speedPxPerMs);
      await captureAtElapsed('Shine crossing the corner', cornerDistance / speedPxPerMs);
      await captureAtElapsed('Shine approaching player (fade-out)', (totalLength - 20) / speedPxPerMs);
      await captureAtElapsed('Shine at player end', totalLength / speedPxPerMs);
      await captureAtElapsed('Quiet interval (invisible)', (totalLength * 1.2) / speedPxPerMs);
      await captureAtElapsed('Invisible restart at origin', (totalLength * 1.5 + 5) / speedPxPerMs);

      const sheet = await compositeGrid(panels, 4, 420);
      writeFileSync(`${outDir}/mazer-wave4d-a-trail-motion-frames.png`, sheet);
      process.stderr.write('Wrote mazer-wave4d-a-trail-motion-frames.png\n');
      await context.close();
    }

    // ============================================================
    // Contact sheet #4: pause/resume frames with printed phase/distance
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(300);
      // Stop Phaser's own live requestAnimationFrame loop so the ONLY
      // clock advancing scene state is our manual game.loop.step() calls
      // below -- otherwise the real rAF loop keeps ticking in true wall-
      // clock time in parallel with our synthetic steps, racing our
      // pause/resume and shine-position math against real elapsed time.
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      const spec = MAZES.straight;
      const maze = buildMazeSnapshot(spec);
      const trailToGoal = [];
      for (let x = spec.start.x; x <= spec.goal.x; x += 1) trailToGoal.push({ x, y: spec.start.y });
      await setSceneState(page, { maze, player: spec.goal, trail: trailToGoal, toggleTrailShine: true });

      const panels = [];
      const frame = await getBoardFrame(page);
      const mazeWidthWithBorder = spec.goal.x - spec.start.x + 1 + 2;
      const region = { x: frame.left - 4, y: frame.top + (spec.start.y * frame.tileSize) - 4, w: (mazeWidthWithBorder * frame.tileSize) + 8, h: frame.tileSize + 8 };

      const readClock = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return { elapsedMs: scene.trailAnimationElapsedMs, overlay: scene.overlay };
      });

      const captureWithLabel = async (baseLabel) => {
        await stepFrames(page, 5);
        const clock = await readClock();
        const buf = await captureCanvasRegionPng(page, region);
        panels.push(await labelPng(buf, `${baseLabel} | elapsedMs=${clock.elapsedMs.toFixed(1)} overlay=${clock.overlay}`, 640));
        return clock;
      };

      // Before pause: let real time (via advanceLegacyTrailAnimationClock) accumulate a bit.
      await page.waitForTimeout(400);
      const before = await captureWithLabel('Before Pause');

      // Open Pause (a real overlay open, not a synthetic flag).
      await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      await page.waitForTimeout(600); // real elapsed time passes while paused
      const duringPause = await captureWithLabel('During Pause (phase must stay frozen)');

      // Resume (close the overlay the same way the real game does).
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.closeOverlay();
      });
      const firstAfterResume = await captureWithLabel('First frame after Resume (no jump)');
      await page.waitForTimeout(200);
      const laterContinuation = await captureWithLabel('Later continuation');

      const sheet = await compositeGrid(panels, 2, 640);
      writeFileSync(`${outDir}/mazer-wave4d-a-pause-resume-frames.png`, sheet);
      process.stderr.write(
        `Wrote mazer-wave4d-a-pause-resume-frames.png (before=${before.elapsedMs.toFixed(1)} duringPause=${duringPause.elapsedMs.toFixed(1)} firstAfterResume=${firstAfterResume.elapsedMs.toFixed(1)} later=${laterContinuation.elapsedMs.toFixed(1)})\n`
      );
      await context.close();
    }

    // ============================================================
    // Contact sheet #5: mobile proof (real 390x844, isMobile, hasTouch, DPR3)
    // ============================================================
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      // A real generated maze's own build/reveal animation can genuinely
      // take longer than a fixed short wait -- a fixed 500ms wait froze the
      // capture mid-build (the level-number announcement glyph and a
      // still-assembling corridor, no visible player/goal/trail at all: a
      // capture failure, not evidence the mobile game itself is broken).
      // Make real accepted moves instead of just waiting an arbitrary
      // duration: movePlayPlayer reports reason:'lifecycle-locked' while
      // the reveal is still in progress, so retrying real moves is both the
      // readiness signal AND what produces the visible trail this proof
      // needs -- not a synthetic scene-state assignment.
      const settledMoves = ['move_right', 'move_down', 'move_left', 'move_up'];
      let acceptedCount = 0;
      let directionIndex = 0;
      for (let attempt = 0; attempt < 200 && acceptedCount < 3; attempt += 1) {
        const move = settledMoves[directionIndex % settledMoves.length];
        // eslint-disable-next-line no-await-in-loop
        const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
        if (result?.accepted) {
          acceptedCount += 1;
        } else if (result?.reason !== 'lifecycle-locked') {
          // Genuinely blocked in that direction (a real wall) -- try the
          // next direction instead of spinning on this one.
          directionIndex += 1;
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(50);
      }
      if (acceptedCount === 0) {
        throw new Error('Mobile proof: no real move was ever accepted -- capture would show frozen mid-build state, not settled gameplay.');
      }

      // Stop Phaser's own live requestAnimationFrame loop so the ONLY
      // clock advancing scene state is our manual game.loop.step() calls
      // below -- otherwise the real rAF loop keeps ticking in true wall-
      // clock time in parallel with our synthetic steps, racing our
      // pause/resume and shine-position math against real elapsed time.
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        window.__mazerSyntheticTimeMs = scene.time.now;
      });
      await page.evaluate(() => {
        window.__mazerSyntheticTimeMs += 50;
        window.__MAZER_GAME__.loop.step(window.__mazerSyntheticTimeMs);
      });

      const fullShot = await page.screenshot();
      const labeled = await labelPng(
        fullShot,
        `Real 390x844 DPR3 isMobile hasTouch, ${acceptedCount} real moves accepted (${new Date().toISOString()})`,
        390 * 3
      );
      writeFileSync(`${outDir}/mazer-wave4d-a-mobile-proof.png`, labeled);
      process.stderr.write('Wrote mazer-wave4d-a-mobile-proof.png\n');
      await context.close();
    }

    // ============================================================
    // Contact sheet #6: REAL player movement, driven by the actual QA
    // movement command (window.__MAZER_QA__.movePlayPlayer) -- not a direct
    // scene.player/scene.trail assignment. Every prior scenario in this
    // script sets up a starting POSITION via direct scene-state assignment
    // (the same real fields the renderer already reads every frame), but
    // this sheet's actual MOVEMENT goes through the same authoritative
    // commit boundary real keyboard/touch input uses, so it proves the
    // trail extends smoothly behind an actually-moving player, the
    // endpoint tracks the interpolated (not logical) player position, and
    // arrival commits without a position or length pop -- none of which a
    // static end-state screenshot can demonstrate.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      // stepFrames (used everywhere else in this script) computes its tick
      // time as `performance.now() + n*16.6667` FRESH on every call -- fine
      // for jump-cutting between static scenarios, but a real player move's
      // glide is only 90-190ms long (resolveLegacyPlayerVisualMoveDurationMs
      // clamps to that range), and real Playwright round-trip jitter
      // between calls can easily make consecutive stepFrames(page,1) calls
      // advance the game's clock by far more than 16.67ms each -- enough to
      // blow through the ENTIRE glide in one or two ticks and never
      // actually observe it in progress. A synthetic clock anchored once
      // and advanced by an explicit, fixed, small delta every step (rather
      // than re-derived from real wall-clock time each call) gives exact
      // control over how much simulated time passes between samples,
      // independent of real IPC latency.
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        window.__mazerSyntheticTimeMs = scene.time.now;
      });
      const syntheticStep = (deltaMs) => page.evaluate((delta) => {
        window.__mazerSyntheticTimeMs += delta;
        window.__MAZER_GAME__.loop.step(window.__mazerSyntheticTimeMs);
      }, deltaMs);

      // resolveLegacyRenderedPlayerPoint/hasLegacyPlayerVisualMotionPendingFrame
      // are private MenuScene methods -- TypeScript privacy is compile-time
      // only, and calling them directly here (like getBoardFrame does for
      // resolveLegacyMazeRenderFrame) is what gives an unthrottled, exact
      // read of the same interpolation the real draw call uses, matching
      // this script's established pattern rather than reimplementing it.
      const readMotionDiagnostics = () => page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const time = scene.time.now;
        const rendered = scene.resolveLegacyRenderedPlayerPoint(time);
        const perf = window.__MAZER_QA__.getTrailPerfDiagnostics();
        return {
          logicalPlayer: { x: scene.player.x, y: scene.player.y },
          renderedPlayer: { x: Math.round(rendered.x * 1000) / 1000, y: Math.round(rendered.y * 1000) / 1000 },
          visualMotionActive: scene.hasLegacyPlayerVisualMotionPendingFrame(time),
          trailTotalLengthPx: perf ? Math.round(perf.totalLengthPx * 10) / 10 : null,
          animationElapsedMs: Math.round(scene.trailAnimationElapsedMs * 10) / 10
        };
      });

      // Drives ONE real accepted move via the actual QA entry point, then
      // samples every real tick until the glide fully settles (plus a
      // couple of settled frames after, so the exact commit moment is
      // unambiguous). Captures the region's PIXELS at the same instant as
      // the diagnostics for every sampled step (not just the diagnostics,
      // with a screenshot taken later against whatever the scene has
      // since become) -- otherwise every picked "frame" is really just a
      // real diagnostic reading mislabeling a single, later, fully-settled
      // screenshot, which is not motion evidence at all. captureRegionFn is
      // called once per step, synchronously with that step's diagnostics.
      const driveOneRealMove = async (direction, captureRegionFn) => {
        const moveResult = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), direction);
        if (!moveResult?.accepted) {
          throw new Error(`Real movement evidence: move '${direction}' was not accepted -- ${JSON.stringify(moveResult)}`);
        }
        const frames = [];
        let settledStreak = 0;
        for (let i = 0; i < 400 && settledStreak < 4; i += 1) {
          await syntheticStep(4);
          // eslint-disable-next-line no-await-in-loop
          const diag = await readMotionDiagnostics();
          // eslint-disable-next-line no-await-in-loop
          const image = await captureRegionFn();
          frames.push({ ...diag, image });
          settledStreak = diag.visualMotionActive ? 0 : settledStreak + 1;
        }
        return frames;
      };

      // Picks representative frames from a real recorded sequence: the
      // requested fractions are positions within the ACTIVE (glide-in-
      // progress) sub-sequence, plus the first settled frame is always
      // included separately as the "just committed" proof point.
      const pickMotionFrames = (frames) => {
        const activeIndices = frames.map((f, i) => (f.visualMotionActive ? i : -1)).filter((i) => i >= 0);
        const firstSettledIndex = frames.findIndex((f) => !f.visualMotionActive);
        const at = (fraction) => {
          if (activeIndices.length === 0) return frames[0];
          const idx = activeIndices[Math.min(activeIndices.length - 1, Math.round(fraction * (activeIndices.length - 1)))];
          return frames[idx];
        };
        return {
          leaving: at(0),
          quarter: at(0.25),
          half: at(0.5),
          threeQuarter: at(0.75),
          aboutToCommit: at(1),
          firstSettled: firstSettledIndex >= 0 ? frames[firstSettledIndex] : frames[frames.length - 1]
        };
      };

      const formatMotionLabel = (title, diag) => (
        `${title} | player=(${diag.logicalPlayer.x},${diag.logicalPlayer.y}) `
        + `rendered=(${diag.renderedPlayer.x},${diag.renderedPlayer.y}) `
        + `len=${diag.trailTotalLengthPx}px t=${diag.animationElapsedMs}ms `
        + `motion=${diag.visualMotionActive}`
      );

      const panels = [];

      // Scenario A: an ordinary straight-corridor move, well clear of both
      // Start's own special-cased latch and any corner.
      {
        const straightSpec = MAZES.straight;
        const maze = buildMazeSnapshot(straightSpec);
        const midX = straightSpec.start.x + Math.floor((straightSpec.goal.x - straightSpec.start.x) / 2);
        const player = { x: midX, y: straightSpec.start.y };
        const trail = [];
        for (let x = straightSpec.start.x; x <= midX; x += 1) trail.push({ x, y: straightSpec.start.y });
        await setSceneState(page, { maze, player, trail, hasPlayerEverLeftStart: true, toggleTrailShine: true });
        await syntheticStep(50);

        const before = await readMotionDiagnostics();
        panels.push(await labelPng(await screenshotStraightRegion(page), formatMotionLabel('Before move (settled)', before), 640));

        const frames = await driveOneRealMove('move_right', () => screenshotStraightRegion(page));
        const picked = pickMotionFrames(frames);
        for (const [title, diag] of [
          ['Leaving (~0-10% into the move)', picked.leaving],
          ['~25% into the move', picked.quarter],
          ['~50% into the move', picked.half],
          ['~75% into the move', picked.threeQuarter],
          ['~90-100% into the move (about to commit)', picked.aboutToCommit],
          ['First frame after commit (no pop)', picked.firstSettled]
        ]) {
          // The image is the ACTUAL screenshot captured at this frame's own
          // instant, stored alongside its diagnostics in driveOneRealMove --
          // never a fresh screenshot taken now (the scene has moved on).
          panels.push(await labelPng(diag.image, formatMotionLabel(title, diag), 640));
        }
      }

      async function screenshotStraightRegion(pageRef) {
        const frame = await getBoardFrame(pageRef);
        const straightSpec = MAZES.straight;
        const width = straightSpec.goal.x - straightSpec.start.x + 1 + 2;
        return captureCanvasRegionPng(pageRef, {
          x: frame.left - 4,
          y: frame.top + (straightSpec.start.y * frame.tileSize) - 4,
          w: (width * frame.tileSize) + 8,
          h: frame.tileSize + 8
        });
      }

      // Scenario B: one real move through/immediately after a corner --
      // set up one tile short of the turn, then make the real move that
      // completes it.
      {
        const spec = MAZES.cornerSE; // right then down
        const maze = buildMazeSnapshot(spec);
        const corner = { x: spec.goal.x, y: spec.start.y }; // the turn tile
        const player = { x: corner.x - 1, y: corner.y };
        const trail = [];
        for (let x = spec.start.x; x <= player.x; x += 1) trail.push({ x, y: spec.start.y });
        await setSceneState(page, { maze, player, trail, hasPlayerEverLeftStart: true, toggleTrailShine: true });
        await syntheticStep(50);

        const cornerRegion = async () => {
          const frame = await getBoardFrame(page);
          return captureCanvasRegionPng(
            page,
            { x: frame.left - 4, y: frame.top - 4, w: (maze.width * frame.tileSize) + 8, h: (maze.height * frame.tileSize) + 8 },
            6
          );
        };

        const before = await readMotionDiagnostics();
        panels.push(await labelPng(await cornerRegion(), formatMotionLabel('Corner: before the turn (settled)', before), 480));

        // One move onto the corner tile itself (its own frames aren't part
        // of the picked sheet -- only the move that continues past the
        // turn is), then one more move that continues past it (downward)
        // -- "through or immediately after".
        await driveOneRealMove('move_right', cornerRegion);
        const afterTurnFrames = await driveOneRealMove('move_down', cornerRegion);
        const picked = pickMotionFrames(afterTurnFrames);
        for (const [title, diag] of [
          ['Corner: leaving the turn tile (~0-10%)', picked.leaving],
          ['Corner: ~50% past the turn', picked.half],
          ['Corner: about to commit past the turn', picked.aboutToCommit],
          ['Corner: first frame after commit (no pop)', picked.firstSettled]
        ]) {
          panels.push(await labelPng(diag.image, formatMotionLabel(title, diag), 480));
        }
      }

      const sheet = await compositeGrid(panels, 3, 640);
      writeFileSync(`${outDir}/mazer-wave4d-a-real-player-motion-frames.png`, sheet);
      process.stderr.write('Wrote mazer-wave4d-a-real-player-motion-frames.png\n');
      await context.close();
    }

    // ============================================================
    // Optional: trail motion as real video (shine crossing the corner,
    // fade-out, quiet gap, invisible restart), driven by the same manual
    // clock as contact sheet #3 but stepped smoothly instead of jump-cut.
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
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

      const spec = MAZES.cornerSE;
      const maze = buildMazeSnapshot(spec);
      const trailPoints = [];
      for (let y = 0; y < maze.height; y += 1) {
        for (let x = 0; x < maze.width; x += 1) {
          if (maze.grid[y][x]) trailPoints.push({ x, y });
        }
      }
      await setSceneState(page, { maze, player: spec.goal, trail: trailPoints, toggleTrailShine: true });
      await stepFrames(page);

      const perf = await page.evaluate(() => window.__MAZER_QA__.getTrailPerfDiagnostics());
      const frame = await getBoardFrame(page);
      const speedPxPerMs = (frame.tileSize * 4.2) / 1000;
      const totalLength = perf.totalLengthPx;
      const cycleLengthMs = (totalLength * 1.35) / speedPxPerMs; // totalLength + 35% quiet gap
      const steps = 60;
      for (let i = 0; i <= steps; i += 1) {
        const elapsedMs = (cycleLengthMs * 1.2 * i) / steps; // sweep past one full cycle
        await setTrailClock(page, { elapsedMs, lapStartedAtMs: 0 });
        await stepFrames(page, 2);
        await page.waitForTimeout(50);
      }

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        const dest = `${outDir}/mazer-wave4d-a-trail-motion.webm`;
        copyFileSync(videoPath, dest);
        process.stderr.write('Wrote mazer-wave4d-a-trail-motion.webm\n');
      }
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
