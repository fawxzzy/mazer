// Kept frame vs forced redraw for the wrap-dock glow (MAZER-PERF-007), in real headless Chromium.
//
//   node scripts/analysis/check-bleed-glow-redraw-equivalence.mjs --base-url=http://127.0.0.1:5670 \
//     [--level=30] [--viewports=390x844,1280x720] [--dpr=1] [--samples=120] [--trail-tiles=0] [--out=<file.json>]
//
// With the throttle in place the scene skips the dynamic-board redraw on about every other frame, so the canvas on that
// frame is the PREVIOUS frame's pixels (a "kept" frame). Before the change that frame would have been redrawn (a "forced"
// redraw, one rAF later). For each sample this script waits for a kept frame, snapshots the game canvas, then sets
// scene.boardDynamicDirty = true (a forced redraw on the next frame), snapshots again, and diffs the two:
//   - inside the glow lanes (the exact rects drawLegacyBleedOffGlow fills, mapped to canvas pixels, +1 px): the largest
//     per-channel (0..255) difference and the number of differing pixels. This is the whole visible cost of the throttle.
//   - outside the glow lanes: must be 0 on an idle board (anything else is another animation, listed separately).
// Offline the sign-in gate may lock the menu demo; previewLevel is an in-memory sandbox with no account writes.
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
const samples = Number(arg('samples', '120'));
const trailTiles = Number(arg('trail-tiles', '0'));
const outFile = arg('out', '');

const RUN = async ({ samples, trailTiles }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const canvas = game.canvas;
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  const snap = () => {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    sctx.drawImage(canvas, 0, 0);
    return sctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  // Count dynamic-board redraws and record the glow rects each redraw paints.
  let redraws = 0;
  let glowRects = [];
  let recording = false;
  const origDraw = scene.drawDynamicBoard;
  scene.drawDynamicBoard = function (...args) { redraws += 1; return origDraw.apply(this, args); };
  const origGlow = scene.drawLegacyBleedOffGlow;
  const g = scene.boardDynamicGraphics;
  const origFill = g.fillRect;
  g.fillRect = function (x, y, w, h) { if (recording) glowRects.push([x, y, w, h]); return origFill.call(this, x, y, w, h); };
  scene.drawLegacyBleedOffGlow = function (...args) {
    glowRects = [];
    recording = true;
    try { return origGlow.apply(this, args); } finally { recording = false; }
  };
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;

  if (trailTiles > 0) {
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
    const cut = path.slice(0, Math.min(trailTiles, path.length - 1));
    scene.trail = cut;
    scene.player = { ...cut[cut.length - 1] };
    scene.boardDynamicDirty = true;
  }

  const nextFrame = () => new Promise((resolve) => game.events.once('postrender', resolve));
  const resolution = canvas.width / (scene.scale.width || canvas.clientWidth);
  const mapRects = () => {
    const m = g.getWorldTransformMatrix ? g.getWorldTransformMatrix() : null;
    return glowRects.map(([x, y, w, h]) => {
      const sx = m ? m.a : 1; const sy = m ? m.d : 1; const tx = m ? m.tx : 0; const ty = m ? m.ty : 0;
      return [(x * sx + tx) * resolution, (y * sy + ty) * resolution, w * sx * resolution, h * sy * resolution];
    });
  };

  await nextFrame();
  const results = { samples: 0, inLaneMaxChannelDiff: 0, inLanePixelsMax: 0, inLanePixelsMean: 0, outOfLanePixelsMax: 0, outOfLaneMaxChannelDiff: 0, noGlowRects: 0, outCells: {}, keptFramesObserved: 0, framesObserved: 0, redrawsObserved: 0, perSample: [] };
  let inLaneSum = 0;
  let guard = 0;
  while (results.samples < samples && guard < samples * 60) {
    guard += 1;
    const before = redraws;
    await nextFrame();
    results.framesObserved += 1;
    if (redraws !== before) { results.redrawsObserved += 1; continue; }
    results.keptFramesObserved += 1;
    // A kept frame: its pixels are the previous redraw's.
    const kept = snap();
    scene.boardDynamicDirty = true; // force the redraw the old code would have made on this frame
    const rBefore = redraws;
    await nextFrame();
    if (redraws === rBefore) continue;
    const forced = snap();
    const rects = mapRects();
    if (rects.length === 0) results.noGlowRects += 1;
    const w = canvas.width; const h = canvas.height;
    const mask = new Uint8Array(w * h);
    for (const [x, y, rw, rh] of rects) {
      const x0 = Math.max(0, Math.floor(x) - 1); const x1 = Math.min(w, Math.ceil(x + rw) + 1);
      const y0 = Math.max(0, Math.floor(y) - 1); const y1 = Math.min(h, Math.ceil(y + rh) + 1);
      for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) mask[yy * w + xx] = 1;
    }
    let inPx = 0; let outPx = 0; let inMax = 0; let outMax = 0;
    const cellSize = 16; const cells = new Map();
    for (let i = 0; i < w * h; i += 1) {
      const o = i * 4;
      const d = Math.max(Math.abs(kept[o] - forced[o]), Math.abs(kept[o + 1] - forced[o + 1]), Math.abs(kept[o + 2] - forced[o + 2]));
      if (d === 0) continue;
      if (mask[i]) { inPx += 1; if (d > inMax) inMax = d; } else {
        outPx += 1; if (d > outMax) outMax = d;
        const ck = `${Math.floor((i % w) / cellSize) * cellSize},${Math.floor(Math.floor(i / w) / cellSize) * cellSize}`;
        const cell = cells.get(ck) ?? { px: 0, max: 0 }; cell.px += 1; cell.max = Math.max(cell.max, d); cells.set(ck, cell);
      }
    }
    results.samples += 1;
    inLaneSum += inPx;
    results.inLaneMaxChannelDiff = Math.max(results.inLaneMaxChannelDiff, inMax);
    results.inLanePixelsMax = Math.max(results.inLanePixelsMax, inPx);
    results.outOfLanePixelsMax = Math.max(results.outOfLanePixelsMax, outPx);
    results.outOfLaneMaxChannelDiff = Math.max(results.outOfLaneMaxChannelDiff, outMax);
    results.perSample.push([inPx, inMax, outPx, outMax]);
    for (const [ck, cell] of cells) { const agg = results.outCells[ck] ?? { samples: 0, px: 0, max: 0 }; agg.samples += 1; agg.px += cell.px; agg.max = Math.max(agg.max, cell.max); results.outCells[ck] = agg; }
    // let the schedule run free for a few frames so samples are spread across the 1900 ms pulse loop
    for (let i = 0; i < 7; i += 1) await nextFrame();
  }
  results.inLanePixelsMean = results.samples ? Number((inLaneSum / results.samples).toFixed(1)) : 0;
  results.canvas = { width: canvas.width, height: canvas.height, resolution };
  results.glowRectCountLastFrame = glowRects.length;
  results.perSample = results.perSample.slice(0, 12);
  results.outCellsTop = Object.entries(results.outCells).sort((a, b) => b[1].px - a[1].px).slice(0, 10).map(([k, v]) => ({ cell: k, ...v }));
  delete results.outCells;
  return results;
};

const browser = await chromium.launch();
const out = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
    await page.waitForFunction(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      return scene?.mode === 'play' && scene.menuStaticDrawLifecyclePhase === 'settled' && window.__MAZER_QA__.movePlayPlayer('move_up')?.reason !== 'lifecycle-locked';
    }, null, { timeout: 240000, polling: 500 }).catch(() => {});
    const wrap = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      const w = scene.maze.wrapTopologyDiagnostics;
      return { horizontal: w?.horizontal?.endpointCount ?? 0, vertical: w?.vertical?.endpointCount ?? 0, phase: scene.menuStaticDrawLifecyclePhase, reduced: scene.prefersLegacyReducedMotion?.() };
    });
    const result = await page.evaluate(RUN, { samples, trailTiles });
    const row = { viewport: `${viewport.width}x${viewport.height}`, dpr, level, trailTiles, wrap, ...result };
    out.push(row);
    console.log(JSON.stringify(row));
    await context.close();
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2));
