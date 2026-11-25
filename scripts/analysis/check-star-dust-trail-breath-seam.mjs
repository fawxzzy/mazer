// Pixel check of two seams of the cached Star Dust trail (MAZER-PERF-017 review follow-up), on the real modules in a real
// browser (Vite dev server):
//
//   node scripts/analysis/check-star-dust-trail-breath-seam.mjs --base-url=http://127.0.0.1:5195
//       [--engine=chromium|webkit] [--channel=chrome] [--pw-module=<file url of a Playwright index.mjs>] [--out=<dir>]
//
// 1. Breath across a rebuild. The scene breathes the trail's widths and bloom alpha on a 3 s period (trailIridescence.ts;
//    the options are built here exactly as MenuScene.drawTrailCanvasSegments builds them). The cached layer is rebuilt
//    every 2 s. The check builds the layer at the breath peak (t = 750 ms), then paints the frame just before the clock
//    rebuild (t = 2734) and the frame of the rebuild (t = 2750), and measures how much the picture changes between those
//    two consecutive frames outside the live head ("rebuildStep*"), next to the full painter's own change over the same
//    16 ms ("fullStep*", the natural frame-to-frame change). Sparkles are still here (animated false) so only the breath
//    moves: the accepted sparkle and colour steps of option C are not part of this number. "seamVsFull*" is the frame
//    before the rebuild against the full painter at the same time, in a box round the split point.
// 2. Trail canvas growth. The route grows by one row, so the trail canvas grows (down: same origin; up: the origin moves
//    by whole css px). The cached layer was painted on the smaller canvas; the check paints the grown frame through the
//    cache and against the same layer built on the grown canvas, and measures the largest difference in a band round the
//    old canvas edge, outside the live head ("edgeBand*", a clipped bloom line would show here), and over everything
//    outside the head ("outsideHead"). "fullPainterGrowthStep" is the full painter's own change when its canvas grows the
//    same way (its bloom's downscale grid follows the canvas size), for scale.
//
// Canvas: 393 css px wide (an odd phone width) at device scales 2.625 (fractional) and 3. Differences are premultiplied
// (colour x alpha, what lands on the board) so faint bloom edges do not read as 255. Reports per case the max
// channel delta, the mean over lit pixels and the share of lit pixels off by more than 16. With --out it writes, for
// 2.625x, PNG crops (x2) of the seam box: before-rebuild, at-rebuild and their diff (x4), and for each reused growth
// case the whole-canvas diff (x4, half size; the live head's box tinted green), per engine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5195').replace(/\/$/, '');
const engine = arg('engine', 'chromium');
const outDir = arg('out', '');
const channel = arg('channel', '');
const label = arg('label', '');
const pw = await import(arg('pw-module', 'playwright'));
const { chromium, webkit } = pw.default ?? pw;

const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(channel ? { channel } : {});
try {
  const page = await browser.newPage();
  await page.route(`${baseUrl}/__star-dust-breath__`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>breath</title>' }));
  await page.goto(`${baseUrl}/__star-dust-breath__`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async (wantImages) => {
    const dust = await import('/src/render/starDustTrailCanvas.ts');
    const cached = await import('/src/render/starDustTrailCache.ts');
    const palette = await import('/src/render/trailPalette.ts');
    const legibility = await import('/src/render/trailLegibility.ts');
    const iridescence = await import('/src/render/trailIridescence.ts');
    const columns = 25;
    const cssWidth = 393;
    const tile = cssWidth / (columns + 1);
    const rest = legibility.resolveTrailWidths(tile);
    const reach = dust.resolveStarDustReach(tile);

    /** Serpentine route, 4 segments per tile; `up` mirrors it so it grows upward. */
    const makeRoute = (rows, up) => {
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
          const at = (f) => {
            const gy = from.y + ((to.y - from.y) * f);
            return {
              x: ((from.x + ((to.x - from.x) * f) + 0.5) * tile) + 0.3,
              y: ((up ? 60 - gy : gy) + 0.5) * tile + 0.7,
              distance: distance + (tile * f)
            };
          };
          const sample = palette.sampleIridescentTrail((distance + (tile * (q + 0.5) / 4)) / tile, 1234, false);
          segments.push({ previous: at(q / 4), current: at((q + 1) / 4), glowColor: sample.glow, coreColor: sample.core, alpha: 0.9 });
        }
        distance += tile;
      }
      return segments;
    };

    /** The trail canvas as MenuScene sizes it: route box + padding, whole css px origin, device size ceil(css * scale). */
    const canvasFor = (segments, scale) => {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const s of segments) {
        x0 = Math.min(x0, s.previous.x, s.current.x); y0 = Math.min(y0, s.previous.y, s.current.y);
        x1 = Math.max(x1, s.previous.x, s.current.x); y1 = Math.max(y1, s.previous.y, s.current.y);
      }
      const padding = Math.ceil(Math.max(rest.glowWidth * 1.1, reach));
      const left = Math.floor(x0 - padding);
      const top = Math.floor(y0 - padding);
      const width = Math.ceil(x1 + padding - left);
      const height = Math.ceil(y1 + padding - top);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return { canvas, ctx, left, top };
    };

    /** Draw options exactly as MenuScene builds them for the star-dust trail at animation time t. */
    const optionsAt = (t, scale, left, top) => {
      const breath = iridescence.resolveTrailBreath(t, false);
      const widthScale = iridescence.resolveTrailWidthScale(breath);
      const steadyBreath = iridescence.resolveTrailBreath(t, true);
      const steadyWidthScale = iridescence.resolveTrailWidthScale(steadyBreath);
      const glowWidth = rest.glowWidth * widthScale;
      const steadyGlowWidth = rest.glowWidth * steadyWidthScale;
      return {
        originX: left,
        originY: top,
        coreWidth: rest.coreWidth * widthScale,
        glowWidth,
        glowAlphaRatio: legibility.TRAIL_GLOW_ALPHA_RATIO * iridescence.resolveTrailGlowAlphaScale(breath),
        glowBlurPx: Math.max(2, glowWidth * 0.5) * scale,
        steadyCoreWidth: rest.coreWidth * steadyWidthScale,
        steadyGlowWidth,
        steadyGlowAlphaRatio: legibility.TRAIL_GLOW_ALPHA_RATIO * iridescence.resolveTrailGlowAlphaScale(steadyBreath),
        steadyGlowBlurPx: Math.max(2, steadyGlowWidth * 0.5) * scale,
        deviceScale: scale,
        tileSize: tile,
        keylineColor: 0x05030a,
        keylineAlpha: 1,
        timeMs: t,
        animated: false,
        originAdvancePx: 0
      };
    };

    const compare = (a, b, w, include) => {
      let max = 0; let sum = 0; let lit = 0; let off16 = 0;
      for (let k = 0; k < a.length; k += 4) {
        const px = (k / 4) % w;
        const py = Math.floor((k / 4) / w);
        if (!include(px, py)) continue;
        if (!a[k + 3] && !b[k + 3]) continue;
        // Premultiplied (what lands on the board): an unpremultiplied colour channel at alpha 1/255 swings 0..255.
        let pixelMax = Math.abs(a[k + 3] - b[k + 3]);
        for (let ch = 0; ch < 3; ch += 1) {
          const d = Math.abs(((a[k + ch] * a[k + 3]) - (b[k + ch] * b[k + 3])) / 255);
          if (d > pixelMax) pixelMax = d;
        }
        lit += 1;
        sum += pixelMax;
        if (pixelMax > max) max = pixelMax;
        if (pixelMax > 16) off16 += 1;
      }
      return { max, mean: +(sum / Math.max(1, lit)).toFixed(3), off16Pct: +((off16 / Math.max(1, lit)) * 100).toFixed(3), lit };
    };

    const headBoxOf = (segments, scale, left, top) => {
      const box = segments.slice(-64).reduce((b, s) => ({
        x0: Math.min(b.x0, s.previous.x, s.current.x), y0: Math.min(b.y0, s.previous.y, s.current.y),
        x1: Math.max(b.x1, s.previous.x, s.current.x), y1: Math.max(b.y1, s.previous.y, s.current.y)
      }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      return (px, py) => {
        const x = (px / scale) + left;
        const y = (py / scale) + top;
        return x >= box.x0 - 25 && x <= box.x1 + 25 && y >= box.y0 - 25 && y <= box.y1 + 25;
      };
    };

    const crop = (canvas, box, zoom, gain) => {
      const out = document.createElement('canvas');
      out.width = Math.round(box.w * zoom);
      out.height = Math.round(box.h * zoom);
      const octx = out.getContext('2d');
      octx.fillStyle = '#1a1626';
      octx.fillRect(0, 0, out.width, out.height);
      octx.imageSmoothingEnabled = false;
      octx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
      if (gain) {
        const img = octx.getImageData(0, 0, out.width, out.height);
        for (let k = 0; k < img.data.length; k += 4) {
          img.data[k] = Math.min(255, img.data[k] * gain);
          img.data[k + 1] = Math.min(255, img.data[k + 1] * gain);
          img.data[k + 2] = Math.min(255, img.data[k + 2] * gain);
          img.data[k + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
      }
      return out.toDataURL('image/png');
    };

    const rows = [];
    const images = {};
    const rebuildAt = 750 + cached.STAR_DUST_TRAIL_CACHE.refreshMs;
    for (const scale of [2.625, 3]) {
      // 1. Breath across a clock rebuild.
      const route = makeRoute(31, false);
      const cache = cached.createStarDustTrailCache();
      const paint = (t, viaCache) => {
        const target = canvasFor(route, scale);
        const options = optionsAt(t, scale, target.left, target.top);
        if (viaCache) cache(target.ctx, route, options);
        else dust.drawStarDustTrailFullToCanvasContext(target.ctx, route, options);
        return target;
      };
      paint(750, true);
      const beforeRebuild = paint(rebuildAt - 16, true);
      const rebuildsBefore = cache.stats.bodyRebuilds;
      const atRebuild = paint(rebuildAt, true);
      const rebuilt = cache.stats.bodyRebuilds - rebuildsBefore;
      const fullBefore = paint(rebuildAt - 16, false);
      const fullAt = paint(rebuildAt, false);
      const w = atRebuild.canvas.width;
      const h = atRebuild.canvas.height;
      const read = (t) => t.ctx.getImageData(0, 0, w, h).data;
      const inHead = headBoxOf(route, scale, atRebuild.left, atRebuild.top);
      const outsideHead = (px, py) => !inHead(px, py);
      // Seam box: 3 tiles round the split point (the start of the newest headTiles tiles).
      const splitSegment = route[route.length - (cached.STAR_DUST_TRAIL_CACHE.headTiles * 4)];
      const sx = (splitSegment.previous.x - atRebuild.left) * scale;
      const sy = (splitSegment.previous.y - atRebuild.top) * scale;
      const half = 3 * tile * scale;
      const seamBox = { x: Math.max(0, Math.floor(sx - half)), y: Math.max(0, Math.floor(sy - half)), w: Math.floor(2 * half), h: Math.floor(2 * half) };
      const inSeam = (px, py) => px >= seamBox.x && px < seamBox.x + seamBox.w && py >= seamBox.y && py < seamBox.y + seamBox.h;
      const aB = read(beforeRebuild);
      const aR = read(atRebuild);
      const fB = read(fullBefore);
      const fR = read(fullAt);
      rows.push({
        scale,
        case: 'breath-across-rebuild',
        canvas: `${w}x${h}`,
        clockRebuildHappened: rebuilt === 1,
        breathAtBuild: +iridescence.resolveTrailBreath(750, false).toFixed(3),
        breathAtRebuild: +iridescence.resolveTrailBreath(rebuildAt, false).toFixed(3),
        rebuildStepOutsideHead: compare(aB, aR, w, outsideHead),
        rebuildStepSeam: compare(aB, aR, w, inSeam),
        fullStepOutsideHead: compare(fB, fR, w, outsideHead),
        fullStepSeam: compare(fB, fR, w, inSeam),
        seamVsFullBeforeRebuild: compare(aB, fB, w, inSeam),
        outsideHeadVsFullBeforeRebuild: compare(aB, fB, w, outsideHead)
      });
      if (wantImages && scale === 2.625) {
        const diff = document.createElement('canvas');
        diff.width = w; diff.height = h;
        const dctx = diff.getContext('2d');
        const img = dctx.createImageData(w, h);
        for (let k = 0; k < aB.length; k += 4) {
          let m = 0;
          m = Math.abs(aB[k + 3] - aR[k + 3]);
          for (let ch = 0; ch < 3; ch += 1) m = Math.max(m, Math.abs(((aB[k + ch] * aB[k + 3]) - (aR[k + ch] * aR[k + 3])) / 255));
          img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, m * 4);
          img.data[k + 3] = 255;
        }
        dctx.putImageData(img, 0, 0);
        images['2.625x-seam-before-rebuild'] = crop(beforeRebuild.canvas, seamBox, 2, 0);
        images['2.625x-seam-at-rebuild'] = crop(atRebuild.canvas, seamBox, 2, 0);
        images['2.625x-seam-rebuild-diff-x4'] = crop(diff, seamBox, 2, 0);
      }
      cache.release();

      // 2. Canvas growth by one row (down: same origin; up: origin moves by whole css px).
      for (const up of [false, true]) {
        const grown = makeRoute(31, up);
        const shorter = grown.slice(0, grown.length - (5 * 4)); // the last 5 tiles start a new row
        const growCache = cached.createStarDustTrailCache();
        const t = 1000;
        const small = canvasFor(shorter, scale);
        growCache(small.ctx, shorter, optionsAt(t, scale, small.left, small.top));
        const rebuilds = growCache.stats.bodyRebuilds;
        const big = canvasFor(grown, scale);
        growCache(big.ctx, grown, optionsAt(t, scale, big.left, big.top));
        const reused = growCache.stats.bodyRebuilds === rebuilds;
        // Reference: the same layer (same shorter route, same time) built on the GROWN canvas, so the only difference
        // left is the smaller canvas the cached layer was painted on (its edges, its bloom grid and clip).
        const refCache = cached.createStarDustTrailCache();
        const refBuild = canvasFor(grown, scale);
        refCache(refBuild.ctx, shorter, optionsAt(t, scale, refBuild.left, refBuild.top));
        const ref = canvasFor(grown, scale);
        refCache(ref.ctx, grown, optionsAt(t, scale, ref.left, ref.top));
        refCache.release();
        const gw = big.canvas.width;
        const gh = big.canvas.height;
        const b = big.ctx.getImageData(0, 0, gw, gh).data;
        const r = ref.ctx.getImageData(0, 0, gw, gh).data;
        const head = headBoxOf(grown, scale, big.left, big.top);
        // Old canvas edges in the grown canvas's device px.
        const ox = Math.round((small.left - big.left) * scale);
        const oy = Math.round((small.top - big.top) * scale);
        const edges = { left: ox, top: oy, right: ox + small.canvas.width, bottom: oy + small.canvas.height };
        const band = 4;
        const nearEdge = (px, py) => !head(px, py) && (
          Math.abs(px - edges.left) <= band || Math.abs(px - edges.right) <= band
          || Math.abs(py - edges.top) <= band || Math.abs(py - edges.bottom) <= band
        );
        // The full painter's own change when its canvas grows (same shorter route, painted on the small canvas and on the
        // grown one, aligned at the whole-pixel offset): its bloom's downscale grid depends on the canvas size too.
        const fullSmall = canvasFor(shorter, scale);
        dust.drawStarDustTrailFullToCanvasContext(fullSmall.ctx, shorter, optionsAt(t, scale, fullSmall.left, fullSmall.top));
        const fullSmallOnBig = document.createElement('canvas');
        fullSmallOnBig.width = gw; fullSmallOnBig.height = gh;
        fullSmallOnBig.getContext('2d').drawImage(fullSmall.canvas, ox, oy);
        const fullBig = canvasFor(grown, scale);
        dust.drawStarDustTrailFullToCanvasContext(fullBig.ctx, shorter, optionsAt(t, scale, fullBig.left, fullBig.top));
        const fs = fullSmallOnBig.getContext('2d').getImageData(0, 0, gw, gh).data;
        const fb = fullBig.ctx.getImageData(0, 0, gw, gh).data;
        rows.push({
          scale,
          case: up ? 'canvas-grows-up' : 'canvas-grows-down',
          canvas: `${small.canvas.width}x${small.canvas.height} -> ${gw}x${gh}`,
          originMoveDevicePx: [ox, oy],
          layerReused: reused,
          lastRebuildReason: growCache.stats.lastRebuildReason,
          edgeBandOutsideHead: compare(b, r, gw, nearEdge),
          outsideHead: compare(b, r, gw, (px, py) => !head(px, py)),
          fullPainterGrowthStep: compare(fs, fb, gw, (px, py) => !head(px, py))
        });
        if (wantImages && reused) {
          const diff = document.createElement('canvas');
          diff.width = gw; diff.height = gh;
          const dctx = diff.getContext('2d');
          const img = dctx.createImageData(gw, gh);
          for (let k = 0; k < b.length; k += 4) {
            let m = Math.abs(b[k + 3] - r[k + 3]);
            for (let ch = 0; ch < 3; ch += 1) m = Math.max(m, Math.abs(((b[k + ch] * b[k + 3]) - (r[k + ch] * r[k + 3])) / 255));
            img.data[k] = Math.min(255, m * 4);
            img.data[k + 1] = head((k / 4) % gw, Math.floor((k / 4) / gw)) ? 60 : Math.min(255, m * 4);
            img.data[k + 2] = Math.min(255, m * 4);
            img.data[k + 3] = 255;
          }
          dctx.putImageData(img, 0, 0);
          images[`${scale}x-${up ? 'grows-up' : 'grows-down'}-diff-x4`] = crop(diff, { x: 0, y: 0, w: gw, h: gh }, 0.5, 0);
        }
        growCache.release();
      }
    }
    return { ua: navigator.userAgent, rows, images };
  }, Boolean(outDir));
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    for (const [name, url] of Object.entries(result.images)) {
      writeFileSync(join(outDir, `${label ? `${label}-` : ''}${engine}-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  console.log(JSON.stringify({ engine, ua: result.ua, rows: result.rows }, null, 1));
} finally {
  await browser.close();
}
