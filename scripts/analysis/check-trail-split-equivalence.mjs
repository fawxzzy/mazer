// Pixel check for the head-only trail update (MAZER-PERF-004), in headless Chromium.
//
//   node scripts/analysis/check-trail-split-equivalence.mjs --base-url=http://127.0.0.1:5657 \
//     [--level=300] [--viewports=390x844,1280x720] [--steps=40] [--out=<file.json>]
//
// While the player walks a long route (forward, then a backward retrace over the trail, then forward again), the trail
// is drawn as a PREFIX canvas plus a small TAIL canvas at a frozen colour clock (the "epoch"). After a tail frame this
// composes the two canvases into one bitmap, then re-draws the SAME route in full at the SAME epoch clock into the main
// canvas (what a rebuild without the split paints) and composes that, and compares the two:
//   - differing pixels (any channel) and differing pixels by more than 8 / 32 levels, as a share of the lit pixels;
//   - the largest channel difference.
// The split is forced on (trailLastFullCostMs = 1000) so the check does not depend on this machine's speed. Headless
// Chromium is a proxy, not a phone.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5657').replace(/\/$/, '');
const level = Number(arg('level', '300'));
const steps = Number(arg('steps', '40'));
const outFile = arg('out', '');
const viewports = arg('viewports', '390x844,1280x720').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});

const RUN = ({ steps }) => new Promise((resolve) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const qa = window.__MAZER_QA__;
  scene.authGateLocked = false;
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
  const route = [];
  for (let c = goal; c; c = prev.get(key(c)) ?? null) route.push({ x: c.x, y: c.y });
  route.reverse();
  const cut = Math.max(2, route.length - 1 - steps - 6);
  scene.trail = route.slice(0, cut + 1);
  scene.player = { ...route[cut] };
  scene.boardDynamicDirty = true;
  scene.trailLastFullCostMs = 1000; // force the split on

  // Capture what the scene styles, so the reference can redraw the identical route at the identical clock.
  let captured = null;
  const originalStyle = scene.styleTrailSegments.bind(scene);
  scene.styleTrailSegments = (vertices, from, to, params) => {
    captured = { vertices, params };
    return originalStyle(vertices, from, to, params);
  };

  const compose = () => {
    const main = scene.trailCanvasImage;
    const tail = scene.trailTailCanvasImage;
    const res = scene.trailCanvasResolution || 1;
    const images = [main, tail].filter((img) => img && img.visible);
    const w = Math.ceil(Math.max(...images.map((img) => img.x + img.displayWidth)) * res) + 2;
    const h = Math.ceil(Math.max(...images.map((img) => img.y + img.displayHeight)) * res) + 2;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const img of images) {
      const source = img.texture.getSourceImage();
      ctx.drawImage(source, Math.round(img.x * res), Math.round(img.y * res), Math.round(img.displayWidth * res), Math.round(img.displayHeight * res));
    }
    return ctx.getImageData(0, 0, w, h);
  };

  const diff = (a, b, rect) => {
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    let lit = 0;
    let any = 0;
    let over8 = 0;
    let over32 = 0;
    let max = 0;
    let over32InTail = 0;
    let opaque = 0; let opaqueOver8 = 0; let opaqueOver2 = 0;
    let over8InTail = 0;
    const px = (img, x, y, c) => (x < img.width && y < img.height ? img.data[(((y * img.width) + x) * 4) + c] : 0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const alphaA = px(a, x, y, 3);
        const alphaB = px(b, x, y, 3);
        if (alphaA === 0 && alphaB === 0) continue;
        lit += 1;
        let m = 0;
        for (let c = 0; c < 4; c += 1) m = Math.max(m, Math.abs(px(a, x, y, c) - px(b, x, y, c)));
        if (m > 0) any += 1;
        if (alphaA === 255 && alphaB === 255) { opaque += 1; let mo = 0; for (let c = 0; c < 3; c += 1) mo = Math.max(mo, Math.abs(px(a, x, y, c) - px(b, x, y, c))); if (mo > 8) opaqueOver8 += 1; if (mo > 2) opaqueOver2 += 1; }
        const inTail = rect && x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
        if (m > 8) { over8 += 1; if (inTail) over8InTail += 1; }
        if (m > 32) { over32 += 1; if (inTail) over32InTail += 1; }
        if (m > max) max = m;
      }
    }
    return { lit, any, over8, over32, max, over8InTail, over32InTail, opaque, opaqueOver8, opaqueOver2 };
  };

  const dirFor = (a, b) => (b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up');
  // Walk plan: forward `steps`, back 10 over the trail, forward 10 again.
  const plan = [];
  let at = cut;
  for (let i = 0; i < steps && at < route.length - 2; i += 1) { plan.push(dirFor(route[at], route[at + 1])); at += 1; }
  for (let i = 0; i < 10 && at > cut; i += 1) { plan.push(dirFor(route[at], route[at - 1])); at -= 1; }
  for (let i = 0; i < 10 && at < route.length - 2; i += 1) { plan.push(dirFor(route[at], route[at + 1])); at += 1; }
  let planIndex = 0;
  const results = [];
  const modes = { tail: 0, 'split-full': 0, full: 0 };
  let tailFramesSinceEpoch = 0;
  let lastTailCount = 0;
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (planIndex < plan.length) {
      const r = qa.movePlayPlayer(plan[planIndex]);
      if (r?.accepted) planIndex += 1;
    }
    const d = qa.getTrailPerfDiagnostics();
    if (d) {
      if (d.trailTailRedrawCount !== lastTailCount) {
        lastTailCount = d.trailTailRedrawCount;
        modes.tail += 1;
        tailFramesSinceEpoch += 1;
      } else if (d.trailLastRedrawMode === 'split-full' || d.trailLastRedrawMode === 'full') {
        tailFramesSinceEpoch = 0;
      }
      if (d.trailLastRedrawMode === 'tail' && tailFramesSinceEpoch >= 3 && captured && scene.trailDrawRecord?.split && results.length < 40) {
        const kept = compose();
        const tailImg = scene.trailTailCanvasImage;
        const res = scene.trailCanvasResolution || 1;
        const rect = { x0: Math.floor(tailImg.x * res) - 4, y0: Math.floor(tailImg.y * res) - 4, x1: Math.ceil((tailImg.x + tailImg.displayWidth) * res) + 4, y1: Math.ceil((tailImg.y + tailImg.displayHeight) * res) + 4 };
        const epoch = scene.trailSplitEpoch;
        const keptTailVisible = scene.trailTailCanvasImage.visible;
        // Reference: the same route, full, at the same clock, into the main canvas; no tail.
        const segments = originalStyle(captured.vertices, 1, captured.vertices.length - 1, captured.params);
        scene.trailTailCanvasImage.setVisible(false);
        scene.drawTrailCanvasSegments(segments, epoch.coreWidth, epoch.glowWidth, epoch.underlayWidth, epoch.glowAlphaScale, null, true);
        const reference = compose();
        scene.drawTrailCanvasSegments(segments, epoch.coreWidth, epoch.glowWidth, epoch.underlayWidth, epoch.glowAlphaScale, null, true);
        const reference2 = compose();
        const selfDiff = diff(reference, reference2, null);
        results.push({ ...diff(kept, reference, rect), selfAny: selfDiff.any, selfMax: selfDiff.max, tailSegments: d.trailLastRedrawStrokeSegments, tailVisible: keptTailVisible, size: `${kept.width}x${kept.height}` });
        if (results.length === 1) {
          const crop = (img) => {
            const x0 = Math.max(0, rect.x0 - 20); const y0 = Math.max(0, rect.y0 - 20);
            const w = Math.min(img.width, rect.x1 + 20) - x0; const h = Math.min(img.height, rect.y1 + 20) - y0;
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const cx = c.getContext('2d');
            const out = cx.createImageData(w, h);
            for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) for (let k = 0; k < 4; k += 1) out.data[(y * w + x) * 4 + k] = img.data[((y + y0) * img.width + (x + x0)) * 4 + k];
            return { c, out, w, h };
          };
          const kc = crop(kept); const rc = crop(reference);
          const d = document.createElement('canvas'); d.width = kc.w; d.height = kc.h;
          const dctx = d.getContext('2d'); const dd = dctx.createImageData(kc.w, kc.h);
          for (let i = 0; i < kc.w * kc.h; i += 1) {
            let m = 0; for (let k = 0; k < 4; k += 1) m = Math.max(m, Math.abs(kc.out.data[i * 4 + k] - rc.out.data[i * 4 + k]));
            dd.data[i * 4] = m > 32 ? 255 : m > 0 ? 80 : 0; dd.data[i * 4 + 1] = m > 32 ? 0 : m > 0 ? 80 : 0; dd.data[i * 4 + 2] = 0; dd.data[i * 4 + 3] = 255;
          }
          dctx.putImageData(dd, 0, 0);
          kc.c.getContext('2d').putImageData(kc.out, 0, 0); rc.c.getContext('2d').putImageData(rc.out, 0, 0);
          window.__dump = { tailOnly: scene.trailTailCanvasTexture.getSourceImage().toDataURL(), kept: kc.c.toDataURL(), reference: rc.c.toDataURL(), diff: d.toDataURL() };
        }
        scene.trailDrawRecord = null; // the main canvas was overwritten: next frame is a full rebuild
        tailFramesSinceEpoch = 0;
      }
    }
    if (planIndex < plan.length || frames < 30) requestAnimationFrame(tick);
    else resolve({ plan: plan.length, frames, tailRedraws: modes.tail, results, routeLength: route.length - 1 });
  };
  requestAnimationFrame(tick);
});

const browser = await chromium.launch();
const out = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 3 : 1, hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });
    await page.waitForFunction(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      if (!(scene && scene.maze && scene.maze.grid && scene.mode === 'play')) return false;
      const r = window.__MAZER_QA__.movePlayPlayer('move_up');
      return r && r.reason !== 'lifecycle-locked';
    }, null, { timeout: 240000, polling: 500 }).catch(() => {});
    await page.waitForTimeout(1000);
    const result = await page.evaluate(RUN, { steps });
    const dumpDir = arg('dump', '');
    if (dumpDir) {
      const dump = await page.evaluate(() => window.__dump ?? null);
      if (dump) for (const k of ['kept', 'reference', 'diff', 'tailOnly']) writeFileSync(`${dumpDir}/${viewport.width}-${k}.png`, Buffer.from(dump[k].split(',')[1], 'base64'));
    }
    const rows = result.results;
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const summary = {
      viewport: `${viewport.width}x${viewport.height}`, level, routeLength: result.routeLength, plannedSteps: result.plan, tailRedraws: result.tailRedraws,
      comparisons: rows.length,
      litPixelsMean: rows.length ? Math.round(sum('lit') / rows.length) : 0,
      anyDiffShare: rows.length ? Number((sum('any') / Math.max(1, sum('lit'))).toFixed(5)) : null,
      over8Share: rows.length ? Number((sum('over8') / Math.max(1, sum('lit'))).toFixed(5)) : null,
      over32Share: rows.length ? Number((sum('over32') / Math.max(1, sum('lit'))).toFixed(5)) : null,
      maxChannelDiff: rows.length ? Math.max(...rows.map((r) => r.max)) : null,
      over8InTailShare: rows.length ? Number((sum('over8InTail') / Math.max(1, sum('over8'))).toFixed(3)) : null,
      over32InTailShare: rows.length ? Number((sum('over32InTail') / Math.max(1, sum('over32'))).toFixed(3)) : null,
      selfAnyMax: rows.length ? Math.max(...rows.map((r) => r.selfAny)) : null,
      selfMaxDiff: rows.length ? Math.max(...rows.map((r) => r.selfMax)) : null,
      opaquePixelsMean: rows.length ? Math.round(sum('opaque') / rows.length) : 0,
      opaqueOver2Share: rows.length ? Number((sum('opaqueOver2') / Math.max(1, sum('opaque'))).toFixed(5)) : null,
      opaqueOver8Share: rows.length ? Number((sum('opaqueOver8') / Math.max(1, sum('opaque'))).toFixed(5)) : null,
      tailVisibleAll: rows.every((r) => r.tailVisible),
      tailSegmentsMax: rows.length ? Math.max(...rows.map((r) => r.tailSegments)) : null
    };
    console.log(JSON.stringify(summary));
    out.push({ summary, rows });
    await context.close();
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 2));
