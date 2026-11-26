// Can a cached Star Dust trail match the full painter's look exactly? (MAZER-PERF-017, owner feedback 2026-11-25:
// "parts blinking slower ... it looks bad"; no visible look loss is accepted.)
//
//   node scripts/analysis/check-star-dust-trail-exact-look.mjs --base-url=http://127.0.0.1:5201
//       [--engine=chromium|webkit] [--viewport=393x851] [--dpr=2.625] [--level=300] [--out=<file.json>]
//
// On the real game (trail-perf-options.html, the real scene, the real long trail, the real colour clock, breath, shine
// band and twinkle), a recording renderer captures the exact inputs of every trail paint for a few seconds idle and a few
// seconds walking, painting each with the full painter (drawStarDustTrailFullToCanvasContext, the pre-cache look). Then,
// off screen with those same inputs, it measures (every image composited over an opaque board-like colour, as the eye
// sees it; max channel delta 0..255, and the share of pixels off by more than 3 and by more than 16):
//   1. "cache-710": the cached painter as shipped in #710, fed the recorded paints in order, vs the full painter;
//   2. "natural-*": how much each layer of the full painter (bloom, thread, sparkles) changes between paints k apart
//      (the staleness any cache of that layer would show);
//   3. "bloom-xfade": the bloom cached at breath trough and peak and cross-faded (premultiplied lerp), fresh (pure lerp
//      error) and k paints stale, vs the exact bloom;
//   4. cost: ms per paint (raster flushed) of the full painter, each layer alone, and the #710 cache, on the recorded
//      paints.
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5201').replace(/\/$/, '');
const engine = arg('engine', 'chromium');
const [vw, vh] = arg('viewport', '393x851').split('x').map(Number);
const dpr = Number(arg('dpr', '2.625'));
const level = Number(arg('level', '300'));
const outFile = arg('out', '');
const pw = await import(arg('pw-module', 'playwright'));
const { chromium, webkit } = pw.default ?? pw;

const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: true, isMobile: engine !== 'webkit' });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/trail-perf-options.html?previewLevel=${level}&runtimeDiagnostics=1&autoTrail=0&trailVariant=shipped`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MAZER_TRAIL_PERF__ && window.__MAZER_QA__ && window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer), null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    return Boolean(scene && scene.maze && scene.mode === 'play' && !scene.isLegacyPlayLifecycleInputLocked());
  }, null, { timeout: 240000, polling: 500 });

  // Record the real paints.
  await page.evaluate(async () => {
    const seam = await import('/src/render/starDustRenderOverride.ts');
    const dust = await import('/src/render/starDustTrailCanvas.ts');
    window.__REC__ = [];
    window.__REC_ON__ = false;
    const h = window.__MAZER_TRAIL_PERF__;
    h.fillLongTrail(30);
    seam.setStarDustTrailRenderOverride((ctx, segments, options) => {
      if (window.__REC_ON__) {
        window.__REC__.push({
          at: performance.now(),
          w: ctx.canvas.width,
          h: ctx.canvas.height,
          scale: ctx.getTransform().a,
          options: { ...options },
          segments: segments.map((s) => ({
            previous: { x: s.previous.x, y: s.previous.y, distance: s.previous.distance },
            current: { x: s.current.x, y: s.current.y, distance: s.current.distance },
            glowColor: s.glowColor,
            coreColor: s.coreColor,
            alpha: s.alpha
          }))
        });
      }
      return dust.drawStarDustTrailFullToCanvasContext(ctx, segments, options);
    });
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    scene.boardDynamicDirty = true;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__REC_ON__ = true; });
  await page.waitForTimeout(3200); // idle: time-only repaints (one breath cycle is 3 s)
  const idleCount = await page.evaluate(() => window.__REC__.length);
  await page.evaluate(() => window.__MAZER_TRAIL_PERF__.startWalk(139));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__MAZER_TRAIL_PERF__.stopWalk(); window.__REC_ON__ = false; });
  const recorded = await page.evaluate(() => window.__REC__.length);
  console.log(JSON.stringify({ engine, viewport: `${vw}x${vh}@${dpr}`, recorded, idleCount }));

  const result = await page.evaluate(async ({ idleCount: idleN }) => {
    const dust = await import('/src/render/starDustTrailCanvas.ts');
    const cacheMod = await import('/src/render/starDustTrailCache.ts');
    const plans = await import('/src/render/starDustTrailPlan.ts');
    const rec = window.__REC__;
    const BG = [58, 53, 80];
    const mk = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return { c, x: c.getContext('2d') };
    };
    const comp = (src) => {
      const out = mk(src.width, src.height);
      out.x.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
      out.x.fillRect(0, 0, src.width, src.height);
      out.x.drawImage(src, 0, 0);
      return out.x.getImageData(0, 0, src.width, src.height).data;
    };
    const diff = (a, b) => {
      let max = 0;
      let over3 = 0;
      let over16 = 0;
      let lit = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > max) max = d;
        if (d > 3) over3 += 1;
        if (d > 16) over16 += 1;
        if (a[i] !== BG[0] || a[i + 1] !== BG[1] || a[i + 2] !== BG[2]) lit += 1;
      }
      return { max, over3: +(over3 / Math.max(1, lit)).toFixed(4), over16: +(over16 / Math.max(1, lit)).toFixed(4) };
    };
    const paint = (r, fn) => {
      const t = mk(r.w, r.h);
      t.x.setTransform(r.scale, 0, 0, r.scale, 0, 0);
      fn(t.x, r);
      return t.c;
    };
    const full = (ctx, r) => dust.drawStarDustTrailFullToCanvasContext(ctx, r.segments, r.options);
    const layerPlan = {
      bloom: { ...plans.SHIPPED_PLAN, thread: 'off', keyline: false, fills: false },
      thread: { ...plans.SHIPPED_PLAN, bloom: 'off', keyline: false, fills: false },
      sparkles: { ...plans.SHIPPED_PLAN, bloom: 'off', thread: 'off' }
    };
    const layer = (name) => (ctx, r) => plans.drawStarDustWithPlan(ctx, r.segments, r.options, layerPlan[name]);
    const summarize = (list) => {
      if (list.length === 0) return null;
      const maxes = list.map((d) => d.max).sort((a, b) => a - b);
      return {
        n: list.length,
        maxMax: maxes[maxes.length - 1],
        medianMax: maxes[Math.floor(maxes.length / 2)],
        meanOver3: +(list.reduce((a, d) => a + d.over3, 0) / list.length).toFixed(4),
        meanOver16: +(list.reduce((a, d) => a + d.over16, 0) / list.length).toFixed(4)
      };
    };
    const out = { paints: rec.length, idle: idleN, canvas: `${rec[0].w}x${rec[0].h}`, scale: rec[0].scale, segments: rec[0].segments.length };

    // 1. the #710 cache vs the full painter, recorded paints in order.
    const cache = cacheMod.createStarDustTrailCache();
    const refs = rec.map((r) => comp(paint(r, full)));
    const cacheDiffs = [];
    const cacheTarget = mk(rec[0].w, rec[0].h);
    for (let i = 0; i < rec.length; i += 1) {
      const r = rec[i];
      if (cacheTarget.c.width !== r.w || cacheTarget.c.height !== r.h) {
        cacheTarget.c.width = r.w;
        cacheTarget.c.height = r.h;
      } else {
        cacheTarget.x.setTransform(1, 0, 0, 1, 0, 0);
        cacheTarget.x.clearRect(0, 0, r.w, r.h);
      }
      cacheTarget.x.setTransform(r.scale, 0, 0, r.scale, 0, 0);
      cache(cacheTarget.x, r.segments, r.options);
      if (i >= 3) cacheDiffs.push(diff(refs[i], comp(cacheTarget.c)));
    }
    out.cache710 = summarize(cacheDiffs);
    out.cache710Stats = { ...cache.stats };

    // 2. natural staleness per layer (idle paints only: the route is unchanged).
    const idleRec = rec.slice(0, idleN);
    out.natural = {};
    for (const name of ['bloom', 'thread', 'sparkles']) {
      const imgs = idleRec.map((r) => comp(paint(r, layer(name))));
      for (const k of [1, 2, 4]) {
        const d = [];
        for (let i = 0; i + k < imgs.length; i += 1) {
          if (idleRec[i].w !== idleRec[i + k].w || idleRec[i].h !== idleRec[i + k].h) continue;
          d.push(diff(imgs[i], imgs[i + k]));
        }
        out.natural[`${name}-k${k}`] = summarize(d);
      }
    }
    out.idleGapsMs = idleRec.slice(1).map((r, i) => +(r.at - idleRec[i].at).toFixed(0));

    // 3. bloom at trough and peak, cross-faded.
    const atBreath = (r, b) => {
      const o = r.options;
      const resting = (o.steadyGlowWidth ?? o.glowWidth) / 1.05;
      const restingCore = (o.steadyCoreWidth ?? o.coreWidth) / 1.05;
      const baseAlpha = (o.steadyGlowAlphaRatio ?? o.glowAlphaRatio) / 0.85;
      const gw = resting * (1 + (0.1 * b));
      return { ...r, options: { ...o, glowWidth: gw, coreWidth: restingCore * (1 + (0.1 * b)), glowAlphaRatio: baseAlpha * (0.7 + (0.3 * b)), glowBlurPx: Math.max(2, gw * 0.5) * r.scale } };
    };
    const breathOf = (r) => {
      const o = r.options;
      const resting = (o.steadyGlowWidth ?? o.glowWidth) / 1.05;
      return ((o.glowWidth / resting) - 1) / 0.1;
    };
    const xfade = (lo, hi, b) => {
      const t = mk(lo.width, lo.height);
      t.x.globalAlpha = 1 - b;
      t.x.drawImage(lo, 0, 0);
      t.x.globalCompositeOperation = 'lighter';
      t.x.globalAlpha = b;
      t.x.drawImage(hi, 0, 0);
      return t.c;
    };
    const xfDiffs = { fresh: [], k1: [], k2: [], k4: [] };
    const breaths = [];
    for (let i = 0; i < idleRec.length; i += 1) {
      const r = idleRec[i];
      const b = breathOf(r);
      breaths.push(+b.toFixed(3));
      const exact = comp(paint(r, layer('bloom')));
      for (const [key, k] of [['fresh', 0], ['k1', 1], ['k2', 2], ['k4', 4]]) {
        const src = idleRec[i - k];
        if (!src || src.w !== r.w || src.h !== r.h) continue;
        const lo = paint(atBreath(src, 0), layer('bloom'));
        const hi = paint(atBreath(src, 1), layer('bloom'));
        xfDiffs[key].push(diff(exact, comp(xfade(lo, hi, b))));
      }
    }
    out.breaths = breaths;
    out.bloomXfade = Object.fromEntries(Object.entries(xfDiffs).map(([k, v]) => [k, summarize(v)]));

    // 4. cost per paint (raster flushed with a 1 px read), on the recorded paints.
    const target = mk(rec[0].w, rec[0].h);
    const time = (fn, list) => {
      const t0 = performance.now();
      for (const r of list) {
        if (target.c.width !== r.w || target.c.height !== r.h) {
          target.c.width = r.w;
          target.c.height = r.h;
        } else {
          target.x.setTransform(1, 0, 0, 1, 0, 0);
          target.x.clearRect(0, 0, r.w, r.h);
        }
        target.x.setTransform(r.scale, 0, 0, r.scale, 0, 0);
        fn(target.x, r);
        target.x.getImageData(0, 0, 1, 1);
      }
      return +((performance.now() - t0) / list.length).toFixed(2);
    };
    const costCache = cacheMod.createStarDustTrailCache();
    out.costMs = {
      full: time(full, rec),
      bloom: time(layer('bloom'), rec),
      thread: time(layer('thread'), rec),
      sparkles: time(layer('sparkles'), rec),
      cache710: time((ctx, r) => costCache(ctx, r.segments, r.options), rec),
      full2: time(full, rec)
    };
    return out;
  }, { idleCount });
  console.log(JSON.stringify(result, null, 1));
  if (outFile) writeFileSync(outFile, JSON.stringify({ engine, viewport: `${vw}x${vh}@${dpr}`, level, ...result }, null, 2));
} finally {
  await browser.close();
}
