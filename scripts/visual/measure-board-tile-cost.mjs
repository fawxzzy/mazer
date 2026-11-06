/**
 * Measures the Chip board tile cost in the real game (real clock, real Canvas 2D, headless Chromium).
 *
 *   node scripts/visual/measure-board-tile-cost.mjs --base-url http://127.0.0.1:5199 [--runs 40]
 *
 * For each config (viewport, DPR, level) it loads the app, presses Start, waits for the settled board, then
 * calls the scene's own draw methods in-page and reports milliseconds:
 *   bake       - one full bake (createBoardTileBakeCache miss), the cost paid only when the maze, tile size,
 *                backing scale, docks or style change
 *   reveal     - drawBoardPaths while the tile-by-tile reveal advances (re-mask + blit every call): the worst
 *                per-frame cost of the build/deconstruct animation
 *   settled    - drawBoardPaths when nothing changed (hash check only; the scene normally skips the call)
 *   dynamic    - drawDynamicBoard (trail, start/goal markers, player) on the settled board
 * These are CPU-only numbers from the machine that runs the script; a phone was not measured.
 */
import { chromium } from 'playwright';
import { PROGRESSION_STORAGE_KEY, createProgressionState } from './capture-maze-lifecycle.mjs';
import { parseCliArgs } from './common.mjs';

const START_BUTTON_SELECTOR = 'button[data-mazer-accessibility-command="start"]';

const CONFIGS = [
  { label: 'phone 390x844 dpr2 L1 (straight corridor)', width: 390, height: 844, dpr: 2, level: 1, mobile: true },
  { label: 'phone 390x844 dpr2 L12', width: 390, height: 844, dpr: 2, level: 12, mobile: true },
  { label: 'phone 390x844 dpr3 L40 (25x51 class)', width: 390, height: 844, dpr: 3, level: 40, mobile: true },
  { label: 'phone 390x844 dpr2 L99', width: 390, height: 844, dpr: 2, level: 99, mobile: true },
  { label: 'desktop 1280x720 dpr1 L40 (45x27 class)', width: 1280, height: 720, dpr: 1, level: 40, mobile: false },
  { label: 'desktop 1280x720 dpr1 L99', width: 1280, height: 720, dpr: 1, level: 99, mobile: false }
];

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  return { n: values.length, mean: +mean.toFixed(3), p50: +at(0.5).toFixed(3), p95: +at(0.95).toFixed(3), max: +sorted[sorted.length - 1].toFixed(3) };
};

const MEASURE = `(async ({ runs }) => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const layer = scene.boardTileLayer;
  const now = () => scene.time.now;
  const bake = [];
  for (let i = 0; i < Math.max(5, Math.floor(runs / 4)); i += 1) {
    layer.cache.clear();
    layer.composedKey = null;
    scene.drawBoardPaths(now());
    bake.push(layer.lastBakeMs);
  }
  const order = scene.buildLegacyMenuStaticDrawTileOrder();
  scene.menuStaticDrawTileOrder = order;
  scene.menuStaticDrawLifecyclePhase = 'building';
  const reveal = [];
  const compose = [];
  const steps = Math.max(runs, 20);
  for (let i = 0; i < steps; i += 1) {
    scene.menuStaticDrawTilesVisible = Math.max(1, Math.floor((order.length * (i + 1)) / (steps + 1)));
    const t0 = performance.now();
    scene.drawBoardPaths(now());
    reveal.push(performance.now() - t0);
    compose.push(layer.lastComposeMs);
  }
  scene.menuStaticDrawTilesVisible = null;
  scene.menuStaticDrawTileOrder = [];
  scene.menuStaticDrawLifecyclePhase = 'settled';
  scene.drawBoardPaths(now());
  const settled = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    scene.drawBoardPaths(now());
    settled.push(performance.now() - t0);
  }
  const dynamic = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    scene.drawDynamicBoard(now());
    dynamic.push(performance.now() - t0);
  }
  const b = layer.currentBake;
  return {
    maze: { width: scene.maze.width, height: scene.maze.height, floorTiles: b ? b.stats.floorTiles : null, tileSize: scene.resolveLegacyMazeRenderFrame(scene.layout.boardLeft, scene.layout.boardTop, scene.layout.boardWidth, scene.layout.boardHeight).tileSize },
    bakeCanvas: b ? { pixelWidth: b.pixelWidth, pixelHeight: b.pixelHeight, scale: b.scale, paintOps: b.stats.paintOps, pathOps: b.stats.pathOps } : null,
    bake, reveal, compose, settled, dynamic
  };
})`;

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = typeof args['base-url'] === 'string' ? args['base-url'].replace(/\/$/, '') : null;
  if (!baseUrl) throw new Error('--base-url is required (start `npx vite --port 5199` first).');
  const runs = Number(args.runs) > 0 ? Number(args.runs) : 40;
  const browser = await chromium.launch({ headless: true });
  const out = [];
  try {
    for (const config of CONFIGS) {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
        deviceScaleFactor: config.dpr,
        hasTouch: config.mobile,
        isMobile: config.mobile
      });
      await context.addInitScript(`(() => { try { if (!sessionStorage.getItem('__m')) { sessionStorage.setItem('__m','1'); localStorage.clear(); ${config.level > 1 ? `localStorage.setItem(${JSON.stringify(PROGRESSION_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(createProgressionState(config.level)))});` : ''} } } catch (e) {} })();`);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=1337`, { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__), null, { timeout: 120000 });
      await page.waitForFunction(() => {
        const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return s && s.mode === 'menu' && s.menuStaticDrawLifecyclePhase === 'settled';
      }, null, { timeout: 120000 });
      await page.waitForTimeout(500);
      await page.evaluate((selector) => document.querySelector(selector).click(), START_BUTTON_SELECTOR);
      await page.waitForFunction(() => {
        const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return s.mode === 'play' && s.menuStaticDrawLifecyclePhase === 'settled' && !s.isLegacyPlayLifecycleInputLocked();
      }, null, { timeout: 120000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(`${MEASURE}({ runs: ${runs} })`);
      out.push({
        config: config.label,
        maze: r.maze,
        bakeCanvas: r.bakeCanvas,
        bakeMs: stats(r.bake),
        revealFrameMs: stats(r.reveal),
        revealComposeMs: stats(r.compose),
        settledCallMs: stats(r.settled),
        dynamicFrameMs: stats(r.dynamic)
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
};

main().catch((error) => { console.error('FATAL', error); process.exitCode = 1; });
