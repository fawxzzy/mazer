/**
 * MAZER-PERF-017 review follow-ups for the cached Star Dust trail painter (starDustTrailCache.ts):
 *   - breath: the cached layer is painted at the steady breath (`steady*` options), so the trail's 3 s glow breath no
 *     longer makes the whole older trail jump at each rebuild; only the live head breathes;
 *   - per-frame work: the head is drawn by start index (no slice), the device scale comes from the caller (no
 *     getTransform), the route is re-checked one window per frame, and the cached sparkles under the head are found from
 *     candidates gathered at rebuild, with the same result as a full scan;
 *   - memory: releaseStarDustTrailCache also frees the coarse bloom's scratch canvas, and the scene releases on a skin change;
 *   - the trail canvas growing by whole device pixels reuses the layer at a whole-pixel offset (the pixel check is
 *     scripts/analysis/check-star-dust-trail-breath-seam.mjs).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  STAR_DUST_SCRATCH_STRIDE,
  STAR_DUST_TRAIL,
  getStarDustSparkleScratch,
  placeStarDustSparkles,
  resolveStarDustReach,
  type StarDustDrawOptions,
  type StarDustSegment
} from '../../src/render/starDustTrailCanvas';
import {
  ROUTE_WINDOW,
  STAR_DUST_TRAIL_CACHE,
  createStarDustTrailCache,
  drawStarDustTrailCachedToCanvasContext,
  releaseStarDustTrailCache
} from '../../src/render/starDustTrailCache';
import {
  LIGHT_BLOOM_PLAN,
  SHIPPED_PLAN,
  chunkTrailSegmentsByLength,
  drawStarDustWithPlan,
  hasCoarseBloomScratch
} from '../../src/render/starDustTrailPlan';
import { setStarDustTrailRenderOverride } from '../../src/render/starDustRenderOverride';

type Logged = unknown[];
interface FakeCanvas { width: number; height: number; log: Logged[]; getContext: () => CanvasRenderingContext2D }

/** A 2D context that logs calls and property writes; getTransform follows setTransform and counts its calls. */
const loggingContext = (width = 400, height = 1000, scale = 1) => {
  const log: Logged[] = [];
  const props: Record<string, unknown> = {};
  let a = scale;
  const transformReads = { count: 0 };
  // eslint-disable-next-line prefer-const -- canvas and context refer to each other
  let ctx: CanvasRenderingContext2D;
  const canvas: FakeCanvas = { width, height, log, getContext: () => ctx };
  ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === 'canvas') return canvas;
      if (name === 'getTransform') {
        return () => {
          transformReads.count += 1;
          return { a, d: a, e: 0, f: 0 };
        };
      }
      if (name === 'createLinearGradient') {
        return (...args: unknown[]) => {
          log.push([name, ...args]);
          return { addColorStop: () => undefined };
        };
      }
      if (name in props) return props[name];
      return (...args: unknown[]) => {
        if (name === 'setTransform') a = Number(args[0]);
        log.push([name, ...args]);
      };
    },
    set(_t, name: string, value: unknown) {
      props[name] = value;
      log.push([`=${name}`, value]);
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log, canvas, transformReads };
};

const stubDocument = (): FakeCanvas[] => {
  const made: FakeCanvas[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const { canvas } = loggingContext(0, 0);
      made.push(canvas);
      return canvas;
    }
  });
  return made;
};

const TILE = 16;
/** A serpentine route, 4 segments per tile, `tiles` tiles long (same shape as starDustTrailCache.test.ts). */
const route = (tiles = 120, columns = 20): StarDustSegment[] => {
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; cells.length <= tiles; row += 2) {
    const ltr = (row / 2) % 2 === 0;
    for (let i = 0; i < columns; i += 1) cells.push({ x: ltr ? i : columns - 1 - i, y: row });
    cells.push({ x: ltr ? columns - 1 : 0, y: row + 1 });
  }
  const segments: StarDustSegment[] = [];
  let distance = 0;
  for (let c = 1; c <= tiles; c += 1) {
    const from = cells[c - 1]!;
    const to = cells[c]!;
    for (let q = 0; q < 4; q += 1) {
      const at = (f: number) => ({
        x: (from.x + ((to.x - from.x) * f) + 0.5) * TILE,
        y: (from.y + ((to.y - from.y) * f) + 0.5) * TILE,
        distance: distance + (TILE * f)
      });
      const colour = (0x336699 + (c * 0x0a0b0c)) & 0xffffff;
      segments.push({ previous: at(q / 4), current: at((q + 1) / 4), glowColor: colour, coreColor: colour ^ 0x404040, alpha: 0.9 });
    }
    distance += TILE;
  }
  return segments;
};

const OPTIONS: StarDustDrawOptions = {
  originX: 0,
  originY: 0,
  tileSize: TILE,
  coreWidth: 4,
  glowWidth: 10,
  glowAlphaRatio: 0.5,
  glowBlurPx: 0,
  keylineColor: 0x05030a,
  keylineAlpha: 1,
  timeMs: 10_000,
  animated: true,
  originAdvancePx: 0
};

/** The trail at breath b (0..1) around steady 0.5, as MenuScene computes it (width +-10% x b, glow alpha 0.7 + 0.3 b). */
const breathing = (b: number, scale = 1): StarDustDrawOptions => {
  const width = 1 + (0.1 * b);
  const steadyWidth = 1.05;
  return {
    ...OPTIONS,
    coreWidth: 4 * width,
    glowWidth: 10 * width,
    glowAlphaRatio: 0.5 * (0.7 + (0.3 * b)),
    glowBlurPx: Math.max(2, 10 * width * 0.5) * scale,
    steadyCoreWidth: 4 * steadyWidth,
    steadyGlowWidth: 10 * steadyWidth,
    steadyGlowAlphaRatio: 0.5 * 0.85,
    steadyGlowBlurPx: Math.max(2, 10 * steadyWidth * 0.5) * scale,
    deviceScale: scale
  };
};

/** The same steady values as the live ones, without steady fields (what a still trail is painted with). */
const steadyLive = (scale = 1): StarDustDrawOptions => {
  const { steadyCoreWidth, steadyGlowWidth, steadyGlowAlphaRatio, steadyGlowBlurPx, ...rest } = breathing(0.5, scale);
  return { ...rest, coreWidth: steadyCoreWidth!, glowWidth: steadyGlowWidth!, glowAlphaRatio: steadyGlowAlphaRatio!, glowBlurPx: steadyGlowBlurPx! };
};

afterEach(() => {
  vi.unstubAllGlobals();
  setStarDustTrailRenderOverride(null);
  releaseStarDustTrailCache();
});

describe('breath: the cached layer holds the steady breath, the head breathes', () => {
  test('the cached layer is painted with the steady widths whatever the breath at rebuild', () => {
    for (const b of [0, 0.25, 1]) {
      const breathingMade = stubDocument();
      createStarDustTrailCache()(loggingContext(800, 2000, 2).ctx, route(100), breathing(b, 2));
      const steadyMade = stubDocument();
      createStarDustTrailCache()(loggingContext(800, 2000, 2).ctx, route(100), steadyLive(2));
      const layer = (made: FakeCanvas[]) => made.find((c) => c.width === 800 && c.height === 2000)!;
      expect(layer(breathingMade).log.length).toBeGreaterThan(100);
      expect(JSON.stringify(layer(breathingMade).log)).toBe(JSON.stringify(layer(steadyMade).log));
    }
  });

  test('the breath changing every frame never rebuilds; the head is painted with the live widths', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext(800, 2000, 2).ctx, route(100), breathing(1, 2));
    for (let f = 1; f <= 20; f += 1) {
      cache(loggingContext(800, 2000, 2).ctx, route(100), { ...breathing(f / 20, 2), timeMs: OPTIONS.timeMs + (f * 16) });
    }
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 21 });
    const frame = loggingContext(800, 2000, 2);
    cache(frame.ctx, route(100), { ...breathing(0, 2), timeMs: OPTIONS.timeMs + 400 });
    // The head's coarse thread at the live core width (4 x 1.0 x threadOfCore), not the steady one.
    const widths = frame.log.filter((c) => c[0] === '=lineWidth').map((c) => Number(c[1]));
    expect(widths).toContain(Math.max(STAR_DUST_TRAIL.threadMinCss, 4 * STAR_DUST_TRAIL.threadOfCore));
    expect(widths).not.toContain(Math.max(STAR_DUST_TRAIL.threadMinCss, 4 * 1.05 * STAR_DUST_TRAIL.threadOfCore));
  });

  test('the steady values are part of the key; without them the live values are used as before', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), breathing(0.3));
    cache(loggingContext().ctx, route(100), { ...breathing(0.3), steadyGlowWidth: 12 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'key' });

    const made = stubDocument();
    createStarDustTrailCache()(loggingContext().ctx, route(100), OPTIONS);
    const reference = stubDocument();
    createStarDustTrailCache()(loggingContext().ctx, route(100), { ...OPTIONS, steadyGlowWidth: undefined });
    expect(JSON.stringify(made[0]!.log)).toBe(JSON.stringify(reference[0]!.log));
  });
});

describe('per-frame work', () => {
  test('a start index draws, places and chunks exactly what a slice does', () => {
    const segments = route(60);
    for (const start of [1, 37, 200]) {
      for (const plan of [SHIPPED_PLAN, LIGHT_BLOOM_PLAN]) {
        const byIndex = loggingContext();
        const bySlice = loggingContext();
        const options = { ...OPTIONS, glowBlurPx: 6 };
        expect(drawStarDustWithPlan(byIndex.ctx, segments, options, plan, undefined, null, start))
          .toBe(drawStarDustWithPlan(bySlice.ctx, segments.slice(start), options, plan));
        expect(JSON.stringify(byIndex.log)).toBe(JSON.stringify(bySlice.log));
      }
      const n = placeStarDustSparkles(segments, OPTIONS, start);
      const a = Array.from(getStarDustSparkleScratch().subarray(0, n * STAR_DUST_SCRATCH_STRIDE));
      const m = placeStarDustSparkles(segments.slice(start), OPTIONS);
      expect(Array.from(getStarDustSparkleScratch().subarray(0, m * STAR_DUST_SCRATCH_STRIDE))).toEqual(a);
      expect(chunkTrailSegmentsByLength(segments, TILE, start)).toEqual(chunkTrailSegmentsByLength(segments.slice(start), TILE));
    }
  });

  test('with the caller\'s device scale, a cached frame never reads the transform (no DOMMatrix per frame)', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    const options = { ...OPTIONS, glowBlurPx: 8, deviceScale: 2 };
    cache(loggingContext(800, 2000, 2).ctx, route(100), options);
    const frame = loggingContext(800, 2000, 2);
    cache(frame.ctx, route(102), { ...options, timeMs: OPTIONS.timeMs + 16 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    expect(frame.transformReads.count).toBe(0);
    // Without it the scale is still read from the context, as before.
    const legacy = loggingContext(800, 2000, 2);
    cache(legacy.ctx, route(102), { ...OPTIONS, glowBlurPx: 8, timeMs: OPTIONS.timeMs + 32 });
    expect(legacy.transformReads.count).toBeGreaterThan(0);
  });

  test('route: a change in any window of the cached part is caught within one pass over the windows', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    const segments = route(160);
    cache(loggingContext().ctx, segments, OPTIONS);
    const split = segments.findIndex((s) => s.previous.distance! >= segments[segments.length - 1]!.current.distance! - (STAR_DUST_TRAIL_CACHE.headTiles * TILE));
    const windows = Math.ceil(split / ROUTE_WINDOW);
    expect(windows).toBeGreaterThanOrEqual(4);
    // A vertex in the last window moves (same length, another route).
    const at = ((windows - 1) * ROUTE_WINDOW) + 5;
    const bent = segments.map((s, i) => (i === at ? { ...s, current: { ...s.current, x: s.current.x + 3 } } : i === at + 1 ? { ...s, previous: { ...s.previous, x: s.previous.x + 3 } } : s));
    let frames = 0;
    while (cache.stats.bodyRebuilds === 1 && frames < windows + 1) {
      frames += 1;
      cache(loggingContext().ctx, bent, OPTIONS);
    }
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'route' });
    expect(frames).toBeLessThanOrEqual(windows);
    // A trimmed or moved start is caught on the very next frame.
    const trimmedStart = bent.map((s, i) => (i === 0 ? { ...s, previous: { ...s.previous, x: s.previous.x - 1 } } : s));
    cache(loggingContext().ctx, trimmedStart, OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 3, lastRebuildReason: 'route' });
  });

  test('the cached sparkles re-drawn under the head are exactly those within the head\'s reach (candidates = full scan)', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    const full = route(120);
    const options = { ...OPTIONS, glowBlurPx: 6 };
    cache(loggingContext().ctx, full.slice(0, 100 * 4), options);
    const built = full.slice(0, 100 * 4);
    const total = built[built.length - 1]!.current.distance!;
    const split = built.findIndex((s) => s.previous.distance! >= total - (STAR_DUST_TRAIL_CACHE.headTiles * TILE));
    const cachedCount = placeStarDustSparkles(built.slice(0, split), { ...options, animated: false, routeLengthPx: total });
    const cached = Array.from(getStarDustSparkleScratch().subarray(0, cachedCount * STAR_DUST_SCRATCH_STRIDE));
    const sparkleReach = resolveStarDustReach(TILE);
    let overlaid = 0;
    for (const tiles of [100, 103, 107, 108]) {
      for (const glowWidth of [10, 11, 30]) {
        const segments = full.slice(0, tiles * 4);
        const frameOptions = { ...options, glowWidth, timeMs: OPTIONS.timeMs + tiles };
        const reach = sparkleReach + Math.max(sparkleReach, ((glowWidth * STAR_DUST_TRAIL.bloomWidthScale) / 2) + 6);
        let expected = 0;
        for (let i = 0; i < cachedCount; i += 1) {
          const x = cached[i * STAR_DUST_SCRATCH_STRIDE]!;
          const y = cached[(i * STAR_DUST_SCRATCH_STRIDE) + 1]!;
          const near = segments.slice(split).some((s) => {
            const dx = s.current.x - s.previous.x;
            const dy = s.current.y - s.previous.y;
            const l = (dx * dx) + (dy * dy);
            const t = l > 0 ? Math.max(0, Math.min(1, (((x - s.previous.x) * dx) + ((y - s.previous.y) * dy)) / l)) : 0;
            return ((s.previous.x + (dx * t) - x) ** 2) + ((s.previous.y + (dy * t) - y) ** 2) <= reach * reach;
          });
          if (near) expected += 1;
        }
        const frame = loggingContext();
        const live = cache(frame.ctx, segments, frameOptions);
        expect(cache.stats.bodyRebuilds).toBe(1);
        expect(frame.log.filter((c) => c[0] === 'fill').length - live).toBe(expected);
        overlaid += expected;
      }
    }
    expect(overlaid).toBeGreaterThan(0);
  });
});

describe('memory and growth', () => {
  test('releasing the shared cache also frees the coarse bloom scratch canvas', () => {
    const made = stubDocument();
    drawStarDustTrailCachedToCanvasContext(loggingContext(800, 2000, 2).ctx, route(100), { ...OPTIONS, glowBlurPx: 8 });
    expect(hasCoarseBloomScratch()).toBe(true);
    const scratch = made.find((c) => c.width > 0 && c.width < 800)!;
    expect(scratch).toBeDefined();
    releaseStarDustTrailCache();
    expect(hasCoarseBloomScratch()).toBe(false);
    expect(scratch).toMatchObject({ width: 0, height: 0 });
  });

  test('the scene releases the cache when the trail skin is no longer Star Dust, and passes the steady breath', () => {
    const scene = readFileSync(join(__dirname, '..', '..', 'src', 'scenes', 'MenuScene.ts'), 'utf8');
    expect(scene).toMatch(/if \(!starDustSkin && this\.starDustTrailCacheHeld\) \{\s*releaseStarDustTrailCache\(\);/);
    for (const field of ['steadyCoreWidth', 'steadyGlowWidth', 'steadyGlowAlphaRatio', 'steadyGlowBlurPx', 'deviceScale: resolution']) {
      expect(scene).toContain(field);
    }
    expect(scene).toMatch(/resolveTrailBreath\(0, true\)/);
  });

  test.each([
    ['down', 0],
    ['up', 5]
  ] as const)('the trail canvas growing %s by whole device pixels reuses the layer at a whole-pixel offset', (_dir, upDevicePx) => {
    const made = stubDocument();
    const cache = createStarDustTrailCache();
    const scale = 2;
    cache(loggingContext(800, 2000, scale).ctx, route(100), OPTIONS);
    const grown = loggingContext(800, 2000 + 10, scale);
    cache(grown.ctx, route(101), { ...OPTIONS, originY: OPTIONS.originY - (upDevicePx / scale), timeMs: OPTIONS.timeMs + 16 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    const blit = grown.log.find((c) => c[0] === 'drawImage' && c[1] === made[0])!;
    expect([Number(blit[2]), Number(blit[3])]).toEqual([0, upDevicePx]);
  });
});
