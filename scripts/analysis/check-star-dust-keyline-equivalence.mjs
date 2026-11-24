// Pixel identity of the star-dust keyline batching (MAZER-PERF-017), against the real module on the Vite dev server.
//
//   node scripts/analysis/check-star-dust-keyline-equivalence.mjs --base-url=http://127.0.0.1:5190 [--channel=chrome]
//
// In the page it imports src/render/starDustTrailCanvas.ts and draws the same long serpentine route twice into two canvases
// at the trail canvas's device scales: once with Path2D hidden (the module falls back to tracing every keyline into the
// context path, the code before the change) and once with Path2D present (batched Path2D + addPath). It compares every
// channel with getImageData and times both passes. Same clock, same segments, so any difference is the batching.
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5190').replace(/\/$/, '');
const channel = arg('channel', '');

const browser = await chromium.launch(channel ? { channel } : {});
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/src/render/starDustTrailCanvas.ts`, { waitUntil: 'domcontentloaded' });
  const rows = await page.evaluate(async () => {
    const dust = await import('/src/render/starDustTrailCanvas.ts');
    const palette = await import('/src/render/trailPalette.ts');
    const tile = 14.6;
    const columns = 25;
    const rows = 51;
    const points = [];
    let distance = 0;
    const push = (x, y) => {
      const last = points[points.length - 1];
      if (last) distance += Math.hypot(x - last.x, y - last.y);
      points.push({ x, y, distance });
    };
    for (let row = 0; row < rows - 1; row += 2) {
      const ltr = (row / 2) % 2 === 0;
      for (let i = 0; i < columns; i += 1) push(((ltr ? i : columns - 1 - i) + 0.5) * tile + 0.3, (row + 0.5) * tile + 0.7);
      push(((ltr ? columns - 1 : 0) + 0.5) * tile + 0.3, (row + 1.5) * tile + 0.7);
    }
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
      const sample = palette.sampleIridescentTrail(((points[i - 1].distance + points[i].distance) / 2) / tile, 1234, false);
      segments.push({ previous: points[i - 1], current: points[i], glowColor: sample.glow, coreColor: sample.core, alpha: 0.9 });
    }
    const out = [];
    for (const scale of [3, 2.625, 2.36, 2]) {
      const w = Math.ceil(columns * tile * scale);
      const h = Math.ceil(rows * tile * scale);
      const draw = (withPath2D) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const saved = window.Path2D;
        if (!withPath2D) window.Path2D = undefined;
        const t0 = performance.now();
        let count = 0;
        try {
          count = dust.drawStarDustTrailFullToCanvasContext(ctx, segments, {
            originX: 0, originY: 0, tileSize: tile, coreWidth: 4.2, glowWidth: 11, glowAlphaRatio: 0.5, glowBlurPx: 9 * scale,
            keylineColor: 0x05030a, keylineAlpha: 1, timeMs: 4321, animated: true, originAdvancePx: 0
          });
        } finally {
          window.Path2D = saved;
        }
        const pixels = ctx.getImageData(0, 0, w, h).data;
        return { ms: performance.now() - t0, pixels, count };
      };
      draw(false); draw(true); // warm both paths
      const before = draw(false);
      const after = draw(true);
      let diff = 0;
      let maxDelta = 0;
      let lit = 0;
      for (let k = 0; k < before.pixels.length; k += 1) {
        const d = Math.abs(before.pixels[k] - after.pixels[k]);
        if (d) { diff += 1; maxDelta = Math.max(maxDelta, d); }
        if (k % 4 === 3 && before.pixels[k]) lit += 1;
      }
      out.push({ scale, canvas: `${w}x${h}`, sparkles: after.count, litPixels: lit, diffChannels: diff, maxDelta, beforeMs: +before.ms.toFixed(1), afterMs: +after.ms.toFixed(1) });
    }
    return { ua: navigator.userAgent, rows: out };
  });
  console.log(JSON.stringify(rows, null, 1));
  if (rows.rows.some((r) => r.diffChannels !== 0)) process.exitCode = 1;
} finally {
  await browser.close();
}
