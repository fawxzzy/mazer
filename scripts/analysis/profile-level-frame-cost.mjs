// Per-level frame-cost profile of the real game in headless Chromium (MAZER-PERF-002).
//
//   node scripts/analysis/profile-level-frame-cost.mjs --base-url=http://127.0.0.1:5656 \
//     [--levels=1,100,300,500,700,999] [--viewports=390x844,1280x720] [--throttle=4] \
//     [--idle-ms=10000] [--walk-ms=10000] [--out=<file.json>]
//
// For each level it opens `?previewLevel=N&runtimeDiagnostics=1` (an in-memory sandbox, no account writes), waits for the
// build reveal to finish, then records:
//   - start: wall time from navigation to the first rendered game frame, and the longest main-thread task (longtask) seen
//     while the level was generated and revealed;
//   - idle: requestAnimationFrame interval mean / p95 / max over `idle-ms`;
//   - walk: the same over `walk-ms` while the real solved route is driven through window.__MAZER_QA__.movePlayPlayer;
//   - a per-frame breakdown measured with timing wrappers around the scene's draw calls (ms per rAF frame, mean):
//     update (whole scene update), perfectPath (resolveLegacyPlayPerfectPathTrail), trailDraw (drawLegacyContinuousPlayTrail,
//     which includes perfectPath), trailCanvas (drawTrailCanvasSegments), bleedGlow, drawDynamicBoard, drawBoardPaths, drawHud,
//     and `render` (the Phaser renderer, i.e. canvas composition of every game object).
// CPU throttling uses CDP Emulation.setCPUThrottlingRate (4x approximates a mid-range phone). Headless Chromium is a proxy,
// not a device. Dev-server modules are unminified.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5656').replace(/\/$/, '');
const levels = arg('levels', '1,100,300,500,700,999').split(',').map(Number);
const viewports = arg('viewports', '390x844,1280x720').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});
const throttle = Number(arg('throttle', '4'));
const idleMs = Number(arg('idle-ms', '10000'));
const walkMs = Number(arg('walk-ms', '10000'));
const outFile = arg('out', '');
// --dpr=N overrides the device pixel ratio (default 3 on a phone-width viewport, else 1). A software-rendered headless run
// at DPR 3 is render-bound, so a throttled-by-frame-rate redraw cannot show its saving there; --dpr=1 shows it.
const dprOverride = Number(arg('dpr', '0'));
// --fulltrail: before sampling, put the player one tile short of the goal with the whole solved route as its trail (the worst
// case for any per-frame cost that scales with trail length), then sample `idle` with the trail pulse redrawing.
const fullTrail = process.argv.includes('--fulltrail');

const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    n: values.length,
    mean: Number(mean.toFixed(2)),
    p95: Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2))
  };
};

const INSTALL_OBSERVERS = () => {
  window.__perf = { longtasks: [], firstFrameAt: null, navStart: performance.now() };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.longtasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported */ }
};

const WRAP_SCENE = () => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const sums = {};
  const counts = {};
  const wrap = (obj, name, key = name) => {
    const original = obj[name];
    if (typeof original !== 'function') return false;
    obj[name] = function wrapped(...args) {
      const t0 = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        sums[key] = (sums[key] ?? 0) + (performance.now() - t0);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    };
    return true;
  };
  const wrapped = [];
  for (const name of [
    'update', 'resolveLegacyPlayPerfectPathTrail', 'drawLegacyContinuousPlayTrail', 'drawTrailCanvasSegments',
    'drawLegacyBleedOffGlow', 'drawDynamicBoard', 'drawBoardPaths', 'drawStaticBoard', 'drawHud', 'drawBackdrop', 'rebuildUi'
  ]) {
    if (wrap(scene, name)) wrapped.push(name);
  }
  // Phaser captured scene.update at boot (sys.sceneUpdate), so point it at the wrapper too.
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;
  // Phaser renderer: scene graph -> canvas composition (the part the draw calls above only queue).
  if (wrap(game.renderer, 'render', 'render')) wrapped.push('render');
  window.__perfSums = sums;
  window.__perfCounts = counts;
  return wrapped;
};

const SAMPLE_FRAMES = ({ durationMs, walk }) => new Promise((resolve) => {
  const sums = window.__perfSums;
  for (const key of Object.keys(sums)) { sums[key] = 0; window.__perfCounts[key] = 0; }
  const qa = window.__MAZER_QA__;
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  const deltas = [];
  let last = null;
  const start = performance.now();
  let route = null;
  let routeIndex = 1;
  let moves = 0;
  const bfs = () => {
    const { grid, goal } = scene.maze;
    const from = { x: scene.player.x, y: scene.player.y };
    const key = (p) => `${p.x},${p.y}`;
    const prev = new Map([[key(from), null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.x === goal.x && cur.y === goal.y) break;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = { x: cur.x + dx, y: cur.y + dy };
        if (grid[next.y]?.[next.x] !== true || prev.has(key(next))) continue;
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
    const path = [];
    let cursor = prev.has(key(goal)) ? goal : null;
    while (cursor) { path.push(cursor); cursor = prev.get(key(cursor)) ?? null; }
    return path.reverse();
  };
  if (walk) route = bfs();
  const dirFor = (a, b) => (b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up');
  const tick = (t) => {
    if (last !== null) deltas.push(t - last);
    last = t;
    if (walk && route && routeIndex < route.length) {
      const result = qa.movePlayPlayer(dirFor(route[routeIndex - 1], route[routeIndex]));
      if (result?.accepted) { routeIndex += 1; moves += 1; }
    }
    if (performance.now() - start < durationMs) requestAnimationFrame(tick);
    else {
      const frames = Math.max(1, deltas.length);
      const per = {};
      for (const key of Object.keys(sums)) per[key] = Number((sums[key] / frames).toFixed(3));
      const diag = qa.getTrailPerfDiagnostics();
      resolve({ deltas, perFrameMs: per, calls: { ...window.__perfCounts }, moves, routeLength: route ? route.length - 1 : null, trail: diag });
    }
  };
  requestAnimationFrame(tick);
});

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    for (const level of levels) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: dprOverride > 0 ? dprOverride : (viewport.width < 600 ? 3 : 1), hasTouch: viewport.width < 600 });
      const page = await context.newPage();
      await page.addInitScript(INSTALL_OBSERVERS);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      const t0 = Date.now();
      await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
      const firstFrameMs = Date.now() - t0;
      // Wait for the build reveal to unlock input (movePlayPlayer stops reporting lifecycle-locked).
      const revealStarted = Date.now();
      await page.waitForFunction(() => {
        const qa = window.__MAZER_QA__;
        const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
        const snap = scene && scene.maze && scene.maze.grid && scene.mode === 'play';
        if (!snap) return false;
        const r = qa.movePlayPlayer('move_up');
        return r && r.reason !== 'lifecycle-locked';
      }, null, { timeout: 240000, polling: 500 }).catch(() => {});
      const revealMs = Date.now() - revealStarted;
      const longtasks = await page.evaluate(() => window.__perf.longtasks.map((t) => t.duration));
      const wrapped = await page.evaluate(WRAP_SCENE);
      const mazeInfo = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
        const grid = scene.maze.grid;
        let floor = 0;
        for (const row of grid) for (const cell of row) if (cell === true) floor += 1;
        return { width: scene.maze.width, height: scene.maze.height, floorTiles: floor, mode: scene.mode, level: scene.progressionState?.tracks?.player?.level ?? null };
      });
      if (fullTrail) {
        await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
          const { grid, start, goal } = scene.maze;
          const key = (p) => `${p.x},${p.y}`;
          const prev = new Map([[key(start), null]]);
          const queue = [{ x: start.x, y: start.y }];
          while (queue.length) {
            const cur = queue.shift();
            if (cur.x === goal.x && cur.y === goal.y) break;
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
              const next = { x: cur.x + dx, y: cur.y + dy };
              if (grid[next.y]?.[next.x] !== true || prev.has(key(next))) continue;
              prev.set(key(next), cur);
              queue.push(next);
            }
          }
          const path = [];
          for (let c = goal; c; c = prev.get(key(c)) ?? null) path.push({ x: c.x, y: c.y });
          path.reverse();
          path.pop();
          scene.trail = path;
          scene.player = { ...path[path.length - 1] };
          scene.boardDynamicDirty = true;
        });
      }
      const idle = await page.evaluate(SAMPLE_FRAMES, { durationMs: idleMs, walk: false });
      const walk = fullTrail ? { deltas: [], perFrameMs: {}, calls: {}, moves: 0, routeLength: null, trail: await page.evaluate(() => window.__MAZER_QA__.getTrailPerfDiagnostics()) } : await page.evaluate(SAMPLE_FRAMES, { durationMs: walkMs, walk: true });
      const row = {
        level, viewport: `${viewport.width}x${viewport.height}`, throttle, maze: mazeInfo, wrapped,
        firstFrameMs, revealMs, longestTaskMs: longtasks.length ? Math.max(...longtasks) : 0, longTaskCount: longtasks.length,
        idle: { frameMs: stats(idle.deltas), perFrameMs: idle.perFrameMs, calls: idle.calls },
        walk: { frameMs: stats(walk.deltas), perFrameMs: walk.perFrameMs, calls: walk.calls, moves: walk.moves, routeLength: walk.routeLength, trail: walk.trail }
      };
      results.push(row);
      console.log(JSON.stringify(row));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
