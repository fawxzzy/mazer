// Walking-frame cost of the play trail in headless Chromium (MAZER-PERF-004).
//
//   node scripts/analysis/profile-trail-walk-cost.mjs --base-url=http://127.0.0.1:5657 \
//     [--levels=1,100,300,999] [--viewports=390x844,1280x720] [--throttle=1] [--tail=10] [--out=<file.json>]
//
// For each level it opens `?previewLevel=N&runtimeDiagnostics=1` (in-memory sandbox, no account writes), waits for the build
// reveal, puts the player `tail` tiles before the goal with the solved route behind it as its trail (the long-trail case), then
// samples
//   - still:   ~3 s of frames with the player standing still (colour clock only);
//   - walking: the last `tail` steps driven through window.__MAZER_QA__.movePlayPlayer, frames from the first step to the last
//              glide frame only (a walking frame = a frame in which the head is moving).
// Per frame (ms, mean over those frames): trailDraw (drawLegacyContinuousPlayTrail whole), trailCanvas (drawTrailCanvasSegments),
// strokeCalls / strokeMs (CanvasRenderingContext2D.stroke on the trail canvas only, bloom + underlay + core), update, render
// (the Phaser renderer: canvas composition; rasterisation of the queued canvas commands is flushed here), plus rAF interval.
// Each page is measured twice, `before` (the head-only trail update forced off: trailLastFullCostMs pinned to 0, i.e. the
// MAZER-PERF-002 behaviour) and `after` (the shipped behaviour), in the same page load. CPU throttling uses CDP Emulation.setCPUThrottlingRate. Headless Chromium is a proxy, not a phone.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5657').replace(/\/$/, '');
const levels = arg('levels', '1,100,300,999').split(',').map(Number);
const viewports = arg('viewports', '390x844,1280x720').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});
const throttle = Number(arg('throttle', '1'));
const tail = Number(arg('tail', '10'));
const stillMs = Number(arg('still-ms', '3000'));
const outFile = arg('out', '');

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

const SETUP = ({ tailSteps, variant }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const sums = window.__perfSums ?? {};
  const counts = window.__perfCounts ?? {};
  const wrap = (obj, name, key = name) => {
    const original = obj[name];
    if (typeof original !== 'function') return;
    obj[name] = function wrapped(...args) {
      const t0 = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        sums[key] = (sums[key] ?? 0) + (performance.now() - t0);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    };
  };
  if (!window.__perfInstalled) {
  window.__perfInstalled = true;
  for (const name of ['update', 'drawLegacyContinuousPlayTrail', 'drawTrailCanvasSegments', 'resolveLegacyPlayPerfectPathTrail']) wrap(scene, name);
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;
  wrap(game.renderer, 'render', 'render');
  window.__perfSums = sums;
  window.__perfCounts = counts;
  }
  Object.defineProperty(scene, 'trailLastFullCostMs', variant === 'before'
    ? { get: () => 0, set: () => {}, configurable: true }
    : { value: null, writable: true, configurable: true, enumerable: true });
  scene.trailDrawRecord = null;
  // Route + trail placement.
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
  window.__route = path;
  const cut = Math.max(1, path.length - 1 - tailSteps);
  scene.trail = path.slice(0, cut + 1);
  scene.player = { ...path[cut] };
  scene.boardDynamicDirty = true;
  return { routeLength: path.length - 1, cut };
};

const SAMPLE = ({ durationMs, walk, cut }) => new Promise((resolve) => {
  const sums = window.__perfSums;
  for (const k of Object.keys(sums)) { sums[k] = 0; window.__perfCounts[k] = 0; }
  const qa = window.__MAZER_QA__;
  const route = window.__route;
  const startDiag = qa.getTrailPerfDiagnostics();
  const dirFor = (a, b) => (b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up');
  const deltas = [];
  const byMode = { tail: [], full: [], keep: [] };
  let lastRebuilds = startDiag.trailRebuildCount;
  let lastTails = startDiag.trailTailRedrawCount;
  let last = null;
  let idx = cut + 1;
  const start = performance.now();
  let finishing = 0;
  const tick = (t) => {
    if (last !== null) {
      deltas.push(t - last);
      const dg = qa.getTrailPerfDiagnostics();
      const mode = dg.trailTailRedrawCount > lastTails ? 'tail' : dg.trailRebuildCount > lastRebuilds ? 'full' : 'keep';
      byMode[mode].push(t - last);
      lastRebuilds = dg.trailRebuildCount;
      lastTails = dg.trailTailRedrawCount;
    }
    last = t;
    let more = true;
    if (walk) {
      if (idx < route.length - 1) {
        const r = qa.movePlayPlayer(dirFor(route[idx - 1], route[idx]));
        if (r?.accepted) idx += 1;
      } else {
        finishing += 1;
        more = finishing < 12; // let the last glide finish
      }
    } else {
      more = performance.now() - start < durationMs;
    }
    if (more) requestAnimationFrame(tick);
    else {
      const frames = Math.max(1, deltas.length);
      const per = {};
      for (const k of Object.keys(sums)) per[k] = Number((sums[k] / frames).toFixed(3));
      const diag = qa.getTrailPerfDiagnostics();
      resolve({ deltas, byMode, perFrameMs: per, calls: { ...window.__perfCounts }, trail: diag, rebuilds: diag.trailRebuildCount - startDiag.trailRebuildCount, tailRedraws: diag.trailTailRedrawCount - startDiag.trailTailRedrawCount });
    }
  };
  requestAnimationFrame(tick);
});

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    for (const level of levels) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 3 : 1, hasTouch: viewport.width < 600 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
      await page.waitForFunction(() => {
        const qa = window.__MAZER_QA__;
        const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
        if (!(scene && scene.maze && scene.maze.grid && scene.mode === 'play')) return false;
        const r = qa.movePlayPlayer('move_up');
        return r && r.reason !== 'lifecycle-locked';
      }, null, { timeout: 240000, polling: 500 }).catch(() => {});
      // The sign-in gate locks the offline menu demo; lift it for a local check.
      await page.evaluate(() => { const s = window.__MAZER_GAME__.scene.scenes.find((x) => x.boardTileLayer); if (s && 'authGateLocked' in s) s.authGateLocked = false; });
      for (const variant of ['before', 'after']) {
        const setup = await page.evaluate(SETUP, { tailSteps: tail, variant });
        await page.waitForTimeout(1500);
        const still = await page.evaluate(SAMPLE, { durationMs: stillMs, walk: false, cut: setup.cut });
        const walking = await page.evaluate(SAMPLE, { durationMs: 0, walk: true, cut: setup.cut });
        const row = {
          variant, level, viewport: `${viewport.width}x${viewport.height}`, throttle, routeLength: setup.routeLength,
          trailSegments: walking.trail?.vertexCountAfterResample ?? null,
          still: { frameMs: stats(still.deltas), perFrameMs: still.perFrameMs, rebuilds: still.rebuilds, tailRedraws: still.tailRedraws },
          walking: { frameMs: stats(walking.deltas), perFrameMs: walking.perFrameMs, rebuilds: walking.rebuilds, tailRedraws: walking.tailRedraws, framesOver50ms: walking.deltas.filter((d) => d > 50).length, byMode: { tail: stats(walking.byMode.tail), full: stats(walking.byMode.full), keep: stats(walking.byMode.keep) } }
        };
        results.push(row);
        console.log(JSON.stringify(row));
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
