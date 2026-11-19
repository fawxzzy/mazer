// Frame cost of the play trail against its length (MAZER-PERF-015), headless Chromium.
//
//   node scripts/analysis/measure-trail-length-cost.mjs --base-url=http://127.0.0.1:5656 \
//     [--levels=150] [--lengths=20,100,200,400,max] [--viewport=390x844] [--dpr=3] [--throttle=4] \
//     [--idle-ms=3000] [--walk-ms=3000] [--step-ms=139] [--query=k=v&k2=v2] [--profile=<file.cpuprofile>] [--out=<file.json>]
//
// For each level it opens `?previewLevel=N&runtimeDiagnostics=1` (an in-memory sandbox, no account writes), waits for the
// build reveal, then finds the longest simple route on the maze (double BFS; the drawn trail is the shortest route over the
// visited tiles, so its length is bounded by the maze, not by how long the player has walked). For each trail length L it
// puts the first L tiles of that route into the scene's trail with the player on its end, then records:
//   - idle: rAF interval and per-frame ms (scene update, Phaser render, trail draw, trail canvas) while standing still;
//   - walk: the same while stepping forward along the route every `step-ms` (the glide rebuilds the trail).
// Per-frame ms come from timing wrappers round the scene's methods and the Phaser renderer (the Phaser update + render
// step, not only the canvas draw call). CPU throttling: CDP Emulation.setCPUThrottlingRate. Headless is a proxy, not a phone.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5656').replace(/\/$/, '');
const levels = arg('levels', '150').split(',').map(Number);
const lengths = arg('lengths', '20,100,200,400,max').split(',');
const [vw, vh] = arg('viewport', '390x844').split('x').map(Number);
const dpr = Number(arg('dpr', '3'));
const throttle = Number(arg('throttle', '4'));
const idleMs = Number(arg('idle-ms', '3000'));
const walkMs = Number(arg('walk-ms', '3000'));
const stepMs = Number(arg('step-ms', '139'));
const extraQuery = arg('query', '');
const profileFile = arg('profile', '');
const outFile = arg('out', '');

const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, mean: +mean.toFixed(2), p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
};

const WRAP_SCENE = () => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const sums = {};
  const counts = {};
  const wrap = (obj, name, key = name) => {
    const original = obj[name];
    if (typeof original !== 'function') return;
    obj[name] = function wrapped(...args) {
      const t0 = performance.now();
      try { return original.apply(this, args); } finally {
        sums[key] = (sums[key] ?? 0) + (performance.now() - t0);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    };
  };
  for (const name of ['update', 'drawLegacyContinuousPlayTrail', 'drawTrailCanvasSegments', 'drawDynamicBoard']) wrap(scene, name);
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;
  wrap(game.renderer, 'render', 'render');
  window.__perfSums = sums;
  window.__perfCounts = counts;
  const findRoute = () => {
    const { grid } = scene.maze;
    const key = (p) => `${p.x},${p.y}`;
    const bfs = (from) => {
      const prev = new Map([[key(from), null]]);
      const queue = [from];
      let last = from;
      while (queue.length) {
        const cur = queue.shift();
        last = cur;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const next = { x: cur.x + dx, y: cur.y + dy };
          if (grid[next.y]?.[next.x] !== true || prev.has(key(next))) continue;
          prev.set(key(next), cur);
          queue.push(next);
        }
      }
      const path = [];
      for (let c = last; c; c = prev.get(key(c)) ?? null) path.push({ x: c.x, y: c.y });
      return path.reverse();
    };
    const far = bfs({ x: scene.player.x, y: scene.player.y });
    return bfs(far[far.length - 1]);
  };
  window.__trailRoute = findRoute();
  return window.__trailRoute.length;
};

const SET_TRAIL = (length) => {
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  const route = window.__trailRoute;
  const path = route.slice(0, length).map((p) => ({ ...p }));
  scene.trail = path;
  scene.player = { ...path[path.length - 1] };
  scene.boardDynamicDirty = true;
  return path.length;
};

const SAMPLE = ({ durationMs, walk, stepMs: stepEvery }) => new Promise((resolve) => {
  const sums = window.__perfSums;
  const counts = window.__perfCounts;
  for (const key of Object.keys(sums)) { sums[key] = 0; counts[key] = 0; }
  const qa = window.__MAZER_QA__;
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  const route = window.__trailRoute;
  const deltas = [];
  let last = null;
  let lastStep = -Infinity;
  let moves = 0;
  const start = performance.now();
  const dirFor = (a, b) => (b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up');
  const tick = (t) => {
    if (last !== null) deltas.push(t - last);
    last = t;
    if (walk && t - lastStep >= stepEvery) {
      const i = route.findIndex((p) => p.x === scene.player.x && p.y === scene.player.y);
      if (i >= 0 && i + 1 < route.length) {
        const r = qa.movePlayPlayer(dirFor(route[i], route[i + 1]));
        if (r?.accepted) { moves += 1; lastStep = t; }
      }
    }
    if (performance.now() - start < durationMs) requestAnimationFrame(tick);
    else {
      const frames = Math.max(1, deltas.length);
      const per = {};
      for (const key of Object.keys(sums)) per[key] = +(sums[key] / frames).toFixed(2);
      const diag = qa.getTrailPerfDiagnostics?.() ?? null;
      resolve({ deltas, per, calls: { ...counts }, moves, trailLen: scene.trail.length, diag });
    }
  };
  requestAnimationFrame(tick);
});

const browser = await chromium.launch();
const rows = [];
try {
  for (const level of levels) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: vw < 600 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1${extraQuery ? `&${extraQuery}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 180000 });
    await page.waitForFunction(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      if (!(scene && scene.maze && scene.mode === 'play')) return false;
      return !scene.isLegacyPlayLifecycleInputLocked();
    }, null, { timeout: 240000, polling: 500 });
    const routeLength = await page.evaluate(WRAP_SCENE);
    for (const raw of lengths) {
      const target = raw === 'max' ? routeLength - Math.ceil(walkMs / stepMs) - 2 : Math.min(Number(raw), routeLength - 2);
      if (!(target >= 2)) continue;
      const placed = await page.evaluate(SET_TRAIL, target);
      await page.waitForTimeout(800);
      if (profileFile && raw === lengths[lengths.length - 1]) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
        await cdp.send('Profiler.start');
      }
      const idle = await page.evaluate(SAMPLE, { durationMs: idleMs, walk: false, stepMs });
      const walk = await page.evaluate(SAMPLE, { durationMs: walkMs, walk: true, stepMs });
      if (profileFile && raw === lengths[lengths.length - 1]) {
        const { profile } = await cdp.send('Profiler.stop');
        writeFileSync(profileFile, JSON.stringify(profile));
      }
      const row = {
        level, query: extraQuery, viewport: `${vw}x${vh}@${dpr}`, throttle, routeLength, trailTiles: placed,
        idle: { frame: stats(idle.deltas), per: idle.per, calls: idle.calls },
        walk: { frame: stats(walk.deltas), per: walk.per, calls: walk.calls, moves: walk.moves, trailEnd: walk.trailLen },
        diag: walk.diag && { segments: walk.diag.strokeSegmentCount, buildMs: +walk.diag.geometryBuildMs.toFixed(2), drawMs: +walk.diag.drawMs.toFixed(2), rebuilds: walk.diag.trailRebuildCount, skipped: walk.diag.trailSkippedRedrawCount }
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 2));
