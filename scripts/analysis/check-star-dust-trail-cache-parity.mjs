// Pixel check of the cached Star Dust trail (MAZER-PERF-017, owner pick C + A) against the full repaint, on the real
// modules in a real browser (Vite dev server).
//
//   node scripts/analysis/check-star-dust-trail-cache-parity.mjs --base-url=http://127.0.0.1:5193
//       [--engine=chromium|webkit] [--channel=chrome] [--webkit-exe=<Playwright.exe>] [--pw-module=<url>] [--out=<dir>]
//
// In the page it builds a long serpentine route with the real trail palette (4 segments per tile, as the scene resamples
// it), then at three device scales paints:
//   - "before": drawStarDustTrailFullToCanvasContext (every layer of every sparkle, the painter until this change);
//   - "cached": a fresh createStarDustTrailCache() painting a frame (layer blit + live head with A's light bloom + the
//     cached sparkles under the head re-keylined), its layer built
//       "fresh": in this same frame (every difference is the painter: A's bloom on the head, the split seam);
//       "stale": 4 tiles ago (adds the cached sparkles' age taper, sized for a 4-tile-shorter route);
//       "animated": 4 tiles and 500 ms ago with twinkle on (adds the cached sparkles holding still, by design);
//   "painted-whole": the cache painting the trail whole (as it does for short or fading trails): must be 0 everywhere;
//   and, for reference, "A-whole-trail": the whole trail painted with the head's plan (option A alone, not shipped).
// maxChannelDeltaOutsideHead: the largest difference outside a box round the newest 16 tiles (the cached layer's own).
// Segment colours are fixed here, so the colour drift and the shine band (which the cached layer holds for up to 2 s)
// are NOT part of this check. Reports per channel: max delta, mean delta, share of pixels off by more than 16, and the
// alpha coverage ratio cached / before. With --out it writes before / cached / diff (x4) PNGs for the 3x still cases.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5193').replace(/\/$/, '');
const engine = arg('engine', 'chromium');
const outDir = arg('out', '');
const channel = arg('channel', '');
const webkitExe = arg('webkit-exe', '');
// --pw-module=<file URL of another Playwright's index.mjs> (as in trail-perf-options-bench.mjs) drives a browser build
// this repo's Playwright does not match: a WebKit build newer than the pinned Playwright hangs at newPage.
const pw = await import(arg('pw-module', 'playwright'));
const { chromium, webkit } = pw.default ?? pw;

const browser = engine === 'webkit'
  ? await webkit.launch(webkitExe ? { executablePath: webkitExe } : {})
  : await chromium.launch(channel ? { channel } : {});
try {
  const page = await browser.newPage();
  // A blank same-origin page (WebKit treats a navigated .ts module as a download and never loads it).
  await page.route(`${baseUrl}/__star-dust-parity__`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>parity</title>' }));
  await page.goto(`${baseUrl}/__star-dust-parity__`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async (wantImages) => {
    const dust = await import('/src/render/starDustTrailCanvas.ts');
    const cached = await import('/src/render/starDustTrailCache.ts');
    const plans = await import('/src/render/starDustTrailPlan.ts');
    const palette = await import('/src/render/trailPalette.ts');
    const tile = 14.6;
    const columns = 20;
    const rows = 29;
    const cells = [];
    for (let row = 0; row < rows - 1; row += 2) {
      const ltr = (row / 2) % 2 === 0;
      for (let i = 0; i < columns; i += 1) cells.push({ x: ltr ? i : columns - 1 - i, y: row });
      cells.push({ x: ltr ? columns - 1 : 0, y: row + 1 });
    }
    const segments = [];
    let distance = 0;
    for (let c = 1; c < cells.length; c += 1) {
      const from = cells[c - 1];
      const to = cells[c];
      for (let q = 0; q < 4; q += 1) {
        const at = (f) => ({
          x: (from.x + ((to.x - from.x) * f) + 0.5) * tile + 0.3,
          y: (from.y + ((to.y - from.y) * f) + 0.5) * tile + 0.7,
          distance: distance + (tile * f)
        });
        const sample = palette.sampleIridescentTrail((distance + (tile * (q + 0.5) / 4)) / tile, 1234, false);
        segments.push({ previous: at(q / 4), current: at((q + 1) / 4), glowColor: sample.glow, coreColor: sample.core, alpha: 0.9 });
      }
      distance += tile;
    }
    const encode = (canvas) => canvas.toDataURL('image/png');
    const out = [];
    const images = {};
    for (const scale of [3, 2.625, 2]) {
      const w = Math.ceil(columns * tile * scale);
      const h = Math.ceil(rows * tile * scale);
      const canvasAt = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        return { canvas, ctx };
      };
      // Box around the newest 16 tiles (the most a head can be) plus 25 px of glow: differences outside it are the cached layer's.
      const headBox = segments.slice(-64).reduce((box, s) => ({
        x0: Math.min(box.x0, s.previous.x, s.current.x), y0: Math.min(box.y0, s.previous.y, s.current.y),
        x1: Math.max(box.x1, s.previous.x, s.current.x), y1: Math.max(box.y1, s.previous.y, s.current.y)
      }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      const inHead = (k) => {
        const px = ((k / 4) % w) / scale;
        const py = Math.floor((k / 4) / w) / scale;
        return px >= headBox.x0 - 25 && px <= headBox.x1 + 25 && py >= headBox.y0 - 25 && py <= headBox.y1 + 25;
      };
      for (const { label, animated, builtShort, dt, whole } of [
        { label: 'painted-whole', animated: false, builtShort: 0, dt: 0, whole: 'cache' },
        { label: 'A-whole-trail', animated: false, builtShort: 0, dt: 0, whole: 'A' },
        { label: 'fresh', animated: false, builtShort: 0, dt: 0 },
        { label: 'stale', animated: false, builtShort: 16, dt: 0 },
        { label: 'animated', animated: true, builtShort: 16, dt: 500 }
      ]) {
        const options = {
          originX: 0, originY: 0, tileSize: tile, coreWidth: 4.2, glowWidth: 11, glowAlphaRatio: 0.5, glowBlurPx: 9 * scale,
          keylineColor: 0x05030a, keylineAlpha: 1, timeMs: 4321, animated, originAdvancePx: 0
        };
        const frameTime = 4321 + dt;
        const before = canvasAt();
        dust.drawStarDustTrailFullToCanvasContext(before.ctx, segments, { ...options, timeMs: frameTime });
        const cache = cached.createStarDustTrailCache(whole === 'cache' ? { minTiles: Infinity } : {});
        if (builtShort > 0) cache(canvasAt().ctx, segments.slice(0, segments.length - builtShort), options);
        const after = canvasAt();
        if (whole === 'A') plans.drawStarDustWithPlan(after.ctx, segments, { ...options, timeMs: frameTime }, plans.LIGHT_BLOOM_PLAN);
        else cache(after.ctx, segments, { ...options, timeMs: frameTime });
        const stats = { ...cache.stats };
        cache.release();
        const a = before.ctx.getImageData(0, 0, w, h).data;
        const b = after.ctx.getImageData(0, 0, w, h).data;
        let maxDelta = 0;
        let maxOutsideHead = 0;
        let sum = 0;
        let off16 = 0;
        let alphaA = 0;
        let alphaB = 0;
        let lit = 0;
        const diff = wantImages && scale === 3 && (label === 'fresh' || label === 'stale') ? new Uint8ClampedArray(a.length) : null;
        for (let k = 0; k < a.length; k += 4) {
          let pixelMax = 0;
          for (let ch = 0; ch < 4; ch += 1) {
            const d = Math.abs(a[k + ch] - b[k + ch]);
            sum += d;
            if (d > pixelMax) pixelMax = d;
          }
          if (pixelMax > maxDelta) maxDelta = pixelMax;
          if (pixelMax > maxOutsideHead && !inHead(k)) maxOutsideHead = pixelMax;
          if (pixelMax > 16) off16 += 1;
          alphaA += a[k + 3];
          alphaB += b[k + 3];
          if (a[k + 3] || b[k + 3]) lit += 1;
          if (diff) {
            const v = Math.min(255, pixelMax * 4);
            diff[k] = v; diff[k + 1] = v; diff[k + 2] = v; diff[k + 3] = 255;
          }
        }
        if (diff) {
          const d = canvasAt();
          d.ctx.putImageData(new ImageData(diff, w, h), 0, 0);
          images.before = encode(before.canvas);
          images[`${label}-cached`] = encode(after.canvas);
          images[`${label}-diff`] = encode(d.canvas);
        }
        out.push({
          scale,
          case: label,
          canvas: `${w}x${h}`,
          bodyRebuilds: stats.bodyRebuilds,
          headPaints: stats.headPaints,
          maxChannelDelta: maxDelta,
          maxChannelDeltaOutsideHead: maxOutsideHead,
          meanChannelDeltaOverLit: +(sum / (Math.max(1, lit) * 4)).toFixed(3),
          pixelsOff16PctOfLit: +((off16 / Math.max(1, lit)) * 100).toFixed(3),
          alphaCoverageRatio: +(alphaB / Math.max(1, alphaA)).toFixed(4)
        });
      }
    }
    return { ua: navigator.userAgent, rows: out, images };
  }, Boolean(outDir));
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    for (const [name, url] of Object.entries(result.images)) {
      writeFileSync(join(outDir, `${engine}-3x-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  console.log(JSON.stringify({ engine, ua: result.ua, rows: result.rows }, null, 1));
} finally {
  await browser.close();
}
