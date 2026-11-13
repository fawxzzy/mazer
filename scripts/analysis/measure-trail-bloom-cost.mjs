// MEASURE ONLY (MAZER-PERF-005): what the trail bloom costs on a long route, in real headless Chromium.
//
//   node scripts/analysis/measure-trail-bloom-cost.mjs --base-url=http://127.0.0.1:5670 \
//     [--level=30] [--viewports=390x844,1280x720] [--dpr=1] [--throttle=1] [--iterations=40] [--out=<file.json>]
//
// It changes no pixels and no source. Needs a Vite dev server (it imports src/render/trailLayersCanvas.ts through it).
// Steps: open ?previewLevel=N&runtimeDiagnostics=1, put the whole solved route (one tile short of the goal) in the scene as
// the trail, let the game draw it, and capture the real arguments of MenuScene.drawTrailCanvasSegments plus the canvas
// size and resolution it used. Then replay drawTrailLayersToCanvasContext on a canvas of the same backing size with
// the exact same segments and options, in three variants, timing each call and forcing the raster to finish
// (getImageData of one pixel) so deferred canvas work is counted:
//   full      - bloom + dark underlay + core (what the game draws)
//   noBloom   - same but glowAlphaRatio 0 and glowBlurPx 0 (plain, invisible glow strokes): underlay + core only
//   bloomCost - median(full) minus median(noBloom)
// Also reports how many trail redraws a second the live game does on that route (calls of drawTrailCanvasSegments over 5 s)
// so the cost can be read as ms per second. Headless Chromium on this host is a proxy, not a phone.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5670').replace(/\/$/, '');
const level = Number(arg('level', '30'));
const viewports = arg('viewports', '390x844,1280x720').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});
const dpr = Number(arg('dpr', '1'));
const throttle = Number(arg('throttle', '1'));
const iterations = Number(arg('iterations', '40'));
const outFile = arg('out', '');

const CAPTURE_AND_REPLAY = async ({ iterations }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const layers = await import('/src/render/trailLayersCanvas.ts');
  const legibility = await import('/src/render/trailLegibility.ts');
  const tileStyle = await import('/src/render/boardTileStyle.ts');

  let captured = null;
  const original = scene.drawTrailCanvasSegments;
  let liveCalls = 0;
  scene.drawTrailCanvasSegments = function (segments, coreWidth, glowWidth, underlayWidth, glowAlphaScale) {
    liveCalls += 1;
    const result = original.call(this, segments, coreWidth, glowWidth, underlayWidth, glowAlphaScale);
    captured = {
      segments: JSON.parse(JSON.stringify(segments)),
      coreWidth, glowWidth, underlayWidth, glowAlphaScale,
      originX: this.trailCanvasImage.x, originY: this.trailCanvasImage.y,
      backingWidth: this.trailCanvasWidth, backingHeight: this.trailCanvasHeight, resolution: this.trailCanvasResolution
    };
    return result;
  };
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;

  // Whole solved route as the trail, player one tile short of the goal.
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

  // Wait for the game to draw it, then count live trail redraws for 5 s.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  liveCalls = 0;
  const liveStart = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const liveSeconds = (performance.now() - liveStart) / 1000;
  const liveRedrawsPerSecond = liveCalls / liveSeconds;
  if (!captured) return { error: 'no trail draw captured', liveCalls };

  const canvas = document.createElement('canvas');
  canvas.width = captured.backingWidth;
  canvas.height = captured.backingHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const options = {
    originX: captured.originX,
    originY: captured.originY,
    coreWidth: captured.coreWidth,
    glowWidth: captured.glowWidth,
    glowAlphaRatio: legibility.TRAIL_GLOW_ALPHA_RATIO * captured.glowAlphaScale,
    glowBlurPx: Math.max(2, captured.glowWidth * 0.5) * captured.resolution,
    underlayWidth: captured.underlayWidth,
    underlayColor: tileStyle.boardMaterial.void,
    underlayAlpha: legibility.TRAIL_UNDERLAY_ALPHA
  };
  const run = (opts) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(captured.resolution, 0, 0, captured.resolution, 0, 0);
    const t0 = performance.now();
    layers.drawTrailLayersToCanvasContext(ctx, captured.segments, opts);
    const t1 = performance.now();
    ctx.getImageData(0, 0, 1, 1); // force the deferred raster to finish
    const t2 = performance.now();
    return { record: t1 - t0, total: t2 - t0 };
  };
  const noBloomOptions = { ...options, glowAlphaRatio: 0, glowBlurPx: 0 };
  for (let i = 0; i < 5; i += 1) { run(options); run(noBloomOptions); } // warm up
  const full = []; const noBloom = [];
  for (let i = 0; i < iterations; i += 1) {
    full.push(run(options));
    noBloom.push(run(noBloomOptions));
  }
  const median = (rows, field) => {
    const sorted = rows.map((r) => r[field]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const p95 = (rows, field) => {
    const sorted = rows.map((r) => r[field]).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  };
  const r2 = (v) => Number(v.toFixed(2));
  return {
    routeTiles: path.length,
    segments: captured.segments.length,
    backing: `${captured.backingWidth}x${captured.backingHeight}`,
    resolution: captured.resolution,
    glowBlurPx: options.glowBlurPx,
    bloomDownscale: layers.resolveBloomDownscale(options.glowBlurPx),
    liveTrailRedrawsPerSecond: r2(liveRedrawsPerSecond),
    fullMs: { medianRecord: r2(median(full, 'record')), medianTotal: r2(median(full, 'total')), p95Total: r2(p95(full, 'total')) },
    noBloomMs: { medianRecord: r2(median(noBloom, 'record')), medianTotal: r2(median(noBloom, 'total')), p95Total: r2(p95(noBloom, 'total')) },
    bloomCostMs: { record: r2(median(full, 'record') - median(noBloom, 'record')), total: r2(median(full, 'total') - median(noBloom, 'total')) },
    bloomShareOfTrailCanvasPct: r2(100 * (median(full, 'total') - median(noBloom, 'total')) / Math.max(0.001, median(full, 'total')))
  };
};

const browser = await chromium.launch();
const out = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
    await page.waitForFunction(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      return scene?.mode === 'play' && scene.menuStaticDrawLifecyclePhase === 'settled' && window.__MAZER_QA__.movePlayPlayer('move_up')?.reason !== 'lifecycle-locked';
    }, null, { timeout: 240000, polling: 500 }).catch(() => {});
    const result = await page.evaluate(CAPTURE_AND_REPLAY, { iterations });
    const row = { viewport: `${viewport.width}x${viewport.height}`, dpr, throttle, level, ...result };
    out.push(row);
    console.log(JSON.stringify(row));
    await context.close();
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2));
