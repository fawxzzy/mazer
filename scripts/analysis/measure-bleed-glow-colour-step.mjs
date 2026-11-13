// Per-frame colour step of the wrap-dock glow at the sheen crossing (MAZER-PERF-007 follow-up), in real headless Chromium.
//
//   node scripts/analysis/measure-bleed-glow-colour-step.mjs --base-url=http://127.0.0.1:5605 \
//     [--level=30] [--viewports=390x844,1280x720] [--dprs=1,3] [--ms=12000] [--trail-tiles=40] [--out=<file.json>]
//
// For every (viewport, DPR) it runs two passes on the same build: "raw" (the scene's bounded smoother replaced by the
// identity, which is the pre-fix behaviour of PR #488) and "fixed" (the shipped smoother). On every rendered frame it records:
//   - the colour the scene passed to drawLegacyBleedOffGlow (the exact core colour painted, held between redraws), and
//   - the canvas pixel at the middle of the first dock lane (a fixed device pixel; it includes the moving band alpha),
// then reports the largest per-frame change of each (max over R, G, B, of 255), the number of frames that changed, and the
// redraw rate. Headless Chromium runs at the host refresh (about 60 Hz); 120 and 144 Hz are covered by the pure simulation
// in tests/render/bleed-glow-colour-step.test.ts. Nothing here runs on a real phone.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5605').replace(/\/$/, '');
const level = Number(arg('level', '30'));
const viewports = arg('viewports', '390x844,1280x720').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});
const dprs = arg('dprs', '1,3').split(',').map(Number);
const durationMs = Number(arg('ms', '12000'));
const trailTiles = Number(arg('trail-tiles', '40'));
const outFile = arg('out', '');

const RUN = async ({ durationMs, trailTiles, raw }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const canvas = game.canvas;
  if (raw) scene.bleedGlowColourSmoother.next = (target) => target;
  else scene.bleedGlowColourSmoother.reset();

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

  let glowColour = null;
  let redraws = 0;
  let rects = [];
  let recording = false;
  const g = scene.boardDynamicGraphics;
  const origFill = g.fillRect;
  let alpha = 0;
  const origStyle = g.fillStyle;
  g.fillStyle = function (c, a) { alpha = a ?? 1; return origStyle.call(this, c, a); };
  g.fillRect = function (x, y, w, h) { if (recording) rects.push([x, y, w, h, alpha]); return origFill.call(this, x, y, w, h); };
  const origGlow = scene.drawLegacyBleedOffGlow;
  scene.drawLegacyBleedOffGlow = function (...args) {
    glowColour = args[args.length - 1];
    redraws += 1;
    rects = [];
    recording = true;
    try { return origGlow.apply(this, args); } finally { recording = false; }
  };
  const resolution = canvas.width / (scene.scale.width || canvas.clientWidth);
  const scratch = document.createElement('canvas');
  scratch.width = 1; scratch.height = 1;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  const nextFrame = () => new Promise((resolve) => game.events.once('postrender', resolve));
  const readPixel = (x, y) => {
    sctx.clearRect(0, 0, 1, 1);
    sctx.drawImage(canvas, x, y, 1, 1, 0, 0, 1, 1);
    const d = sctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const toCanvas = (x, y) => {
    const m = g.getWorldTransformMatrix ? g.getWorldTransformMatrix() : null;
    return [Math.round(((x * (m ? m.a : 1)) + (m ? m.tx : 0)) * resolution), Math.round(((y * (m ? m.d : 1)) + (m ? m.ty : 0)) * resolution)];
  };

  // Pick the pixel: the centre of the most opaque glow rect seen over one full 1.9 s loop (the band peak inside a dock lane).
  let best = null;
  const probeStart = performance.now();
  while (performance.now() - probeStart < 2600 || (best === null && performance.now() - probeStart < 20000)) {
    await nextFrame();
    for (const [x, y, w, h, a] of rects) if (best === null || a > best.a) best = { a, cx: x + w / 2, cy: y + h / 2 };
  }
  if (best === null) return { error: 'no glow rects' };
  const [px, py] = toCanvas(best.cx, best.cy);

  const frames = [];
  const redrawAtStart = redraws;
  const started = performance.now();
  let last = null;
  while (performance.now() - started < durationMs) {
    await nextFrame();
    const pixel = readPixel(px, py);
    frames.push({ t: performance.now() - started, colour: glowColour, pixel, redrawn: redraws !== (last?.redraws ?? redrawAtStart) });
    last = { redraws };
  }
  const chan = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  let colourMax = 0; let colourChanges = 0; let pixelMax = 0; let pixelChanges = 0;
  const colourSteps = []; const pixelSteps = [];
  for (let i = 1; i < frames.length; i += 1) {
    const a = chan(frames[i - 1].colour ?? 0); const b = chan(frames[i].colour ?? 0);
    const cs = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const ps = Math.max(...frames[i].pixel.map((v, k) => Math.abs(v - frames[i - 1].pixel[k])));
    if (cs > 0) { colourChanges += 1; colourSteps.push(cs); }
    if (ps > 0) { pixelChanges += 1; pixelSteps.push(ps); }
    colourMax = Math.max(colourMax, cs); pixelMax = Math.max(pixelMax, ps);
  }
  const p = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const elapsed = (frames[frames.length - 1].t - frames[0].t) / 1000;
  return {
    frames: frames.length,
    fps: Number((frames.length / elapsed).toFixed(1)),
    redrawsPerSecond: Number(((redraws - redrawAtStart) / (durationMs / 1000)).toFixed(1)),
    colourStepMax: colourMax, colourStepP99: p(colourSteps, 0.99), colourFramesChanged: colourChanges,
    pixelStepMax: pixelMax, pixelStepP99: p(pixelSteps, 0.99), pixelFramesChanged: pixelChanges,
    pixelAt: [px, py], canvas: [canvas.width, canvas.height], resolution
  };
};

const browser = await chromium.launch();
const out = [];
try {
  for (const viewport of viewports) {
    for (const dpr of dprs) {
      for (const raw of [true, false]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: viewport.width < 600 });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
        await page.waitForFunction(() => {
          const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
          return scene?.mode === 'play' && scene.menuStaticDrawLifecyclePhase === 'settled';
        }, null, { timeout: 240000, polling: 500 }).catch(() => {});
        const result = await page.evaluate(RUN, { durationMs, trailTiles, raw });
        const row = { viewport: `${viewport.width}x${viewport.height}`, dpr, pass: raw ? 'raw (pre-fix)' : 'fixed', level, trailTiles, ...result };
        out.push(row);
        console.log(JSON.stringify(row));
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2));
