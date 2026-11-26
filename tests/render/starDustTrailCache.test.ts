/**
 * MAZER-PERF-017 cached trail (owner pick C + A, 2026-11-24; withdrawn from the game 2026-11-25, kept for the options
 * page): caches the older trail in an offscreen layer and repaints only the live head. The game painter is the full
 * painter again ('the game painter' below). These tests pin when the cached layer must be rebuilt (anything that
 * would make its picture wrong), when it must not be (a pause, a few steps), that it never holds more memory than the
 * cap, and that a cached frame places exactly the sparkles a full paint places (none doubled or lost at the split).
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  drawStarDustTrailFullToCanvasContext,
  getStarDustSparkleScratch,
  placeStarDustSparkles,
  STAR_DUST_SCRATCH_STRIDE,
  type StarDustDrawOptions,
  type StarDustSegment
} from '../../src/render/starDustTrailCanvas';
import {
  STAR_DUST_TRAIL_CACHE,
  createStarDustTrailCache,
  drawStarDustTrailCachedToCanvasContext,
  drawStarDustTrailToCanvasContext,
  fingerprintStarDustRoute,
  getStarDustTrailCacheStats,
  releaseStarDustTrailCache
} from '../../src/render/starDustTrailCache';
import { setStarDustTrailRenderOverride } from '../../src/render/starDustRenderOverride';
import { LIGHT_BLOOM_PLAN, SHIPPED_PLAN } from '../../src/render/starDustTrailPlan';

type Logged = unknown[];
interface FakeCanvas { width: number; height: number; log: Logged[]; getContext: () => CanvasRenderingContext2D }

/** A 2D context that logs calls and property writes; getTransform follows setTransform. */
const loggingContext = (width = 400, height = 1000, scale = 1): { ctx: CanvasRenderingContext2D; log: Logged[]; canvas: FakeCanvas } => {
  const log: Logged[] = [];
  const props: Record<string, unknown> = {};
  let a = scale;
  // eslint-disable-next-line prefer-const -- canvas and context refer to each other
  let ctx: CanvasRenderingContext2D;
  const canvas: FakeCanvas = { width, height, log, getContext: () => ctx };
  ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === 'canvas') return canvas;
      if (name === 'getTransform') return () => ({ a, d: a, e: 0, f: 0 });
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
  return { ctx, log, canvas };
};

/** Offscreen canvases the cache (and the coarse bloom scratch) create. */
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
/** A serpentine route, 4 segments per tile (as the scene resamples it), `tiles` tiles long. */
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

const count = (log: Logged[], name: string): number => log.filter((c) => c[0] === name).length;
const drawImagesOf = (log: Logged[], source: unknown): Logged[] => log.filter((c) => c[0] === 'drawImage' && c[1] === source);

afterEach(() => {
  vi.unstubAllGlobals();
  setStarDustTrailRenderOverride(null);
  releaseStarDustTrailCache();
});

describe('cached star-dust trail: reuse', () => {
  test('a long trail builds the cached layer once, then paints only the head while the route grows a few tiles', () => {
    const made = stubDocument();
    const cache = createStarDustTrailCache();
    const full = route(120);
    const first = loggingContext();
    cache(first.ctx, full.slice(0, 100 * 4), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 1, fullPaints: 0, lastRebuildReason: 'first' });
    expect(made).toHaveLength(1);
    expect(drawImagesOf(first.log, made[0])).toHaveLength(1);

    const next = loggingContext();
    cache(next.ctx, full.slice(0, 103 * 4), { ...OPTIONS, timeMs: OPTIONS.timeMs + 400 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    const whole = loggingContext();
    createStarDustTrailCache({ minTiles: 1e9 })(whole.ctx, full.slice(0, 103 * 4), OPTIONS);
    expect(count(next.log, 'fill')).toBeLessThan(count(whole.log, 'fill') / 4);
    expect(count(next.log, 'stroke')).toBeLessThan(count(whole.log, 'stroke') / 4);
  });

  test('a pause (same animation time, every frame) never rebuilds', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    const segments = route(100);
    for (let i = 0; i < 30; i += 1) cache(loggingContext().ctx, segments, OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 30 });
  });

  test('the head plan is A (light bloom), the cached layer is today\'s full layers', () => {
    expect(STAR_DUST_TRAIL_CACHE.headPlan).toBe(LIGHT_BLOOM_PLAN);
    expect(STAR_DUST_TRAIL_CACHE.bodyPlan).toBe(SHIPPED_PLAN);
    expect(STAR_DUST_TRAIL_CACHE.maxBodyPixels).toBeLessThanOrEqual(1_600_000);
  });

  test('a trail painted whole (short) issues exactly the canvas calls of the full painter: today\'s look', () => {
    stubDocument();
    const segments = route(30);
    const viaCache = loggingContext(400, 1000, 2);
    createStarDustTrailCache()(viaCache.ctx, segments, { ...OPTIONS, glowBlurPx: 8 });
    const viaFull = loggingContext(400, 1000, 2);
    drawStarDustTrailFullToCanvasContext(viaFull.ctx, segments, { ...OPTIONS, glowBlurPx: 8 });
    expect(viaCache.log.length).toBeGreaterThan(100);
    expect(JSON.stringify(viaCache.log)).toBe(JSON.stringify(viaFull.log));
  });
});

describe('cached star-dust trail: invalidation', () => {
  const build = () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats.bodyRebuilds).toBe(1);
    return cache;
  };

  test('head grown past headTiles + rebuildAfterTiles (walking on)', () => {
    const cache = build();
    const { headTiles, rebuildAfterTiles } = STAR_DUST_TRAIL_CACHE;
    cache(loggingContext().ctx, route(100 + rebuildAfterTiles - 1), OPTIONS);
    expect(cache.stats.bodyRebuilds).toBe(1);
    cache(loggingContext().ctx, route(100 + rebuildAfterTiles + 1), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'head' });
    expect(headTiles + rebuildAfterTiles).toBeLessThan(STAR_DUST_TRAIL_CACHE.minTiles);
  });

  test('colour clock: refreshMs later, or the clock running backwards (restarted scene)', () => {
    const cache = build();
    cache(loggingContext().ctx, route(100), { ...OPTIONS, timeMs: OPTIONS.timeMs + STAR_DUST_TRAIL_CACHE.refreshMs - 1 });
    expect(cache.stats.bodyRebuilds).toBe(1);
    cache(loggingContext().ctx, route(100), { ...OPTIONS, timeMs: OPTIONS.timeMs + STAR_DUST_TRAIL_CACHE.refreshMs });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'clock' });
    cache(loggingContext().ctx, route(100), { ...OPTIONS, timeMs: 5 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 3, lastRebuildReason: 'clock' });
  });

  test.each([
    ['device scale (DPR, zoom, backing budget)', { scale: 2.75 }],
    ['tile size (resize)', { tileSize: TILE + 2 }],
    ['keyline colour (theme)', { keylineColor: 0xffffff }],
    ['Trail Shine / reduced motion', { animated: false }],
    ['Trail Fade origin advance', { originAdvancePx: 12 }]
  ] as const)('style key: %s', (_name, change) => {
    const cache = build();
    const { scale, ...rest } = { scale: 1, ...change };
    const target = loggingContext(400, 1000, scale);
    cache(target.ctx, route(100), { ...OPTIONS, ...rest });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'key' });
  });

  test('route: a new level (different cells), a changed cell inside the cached part, an undo back behind the split', () => {
    const cache = build();
    const moved = route(100).map((s) => ({ ...s, previous: { ...s.previous, y: s.previous.y + TILE }, current: { ...s.current, y: s.current.y + TILE } }));
    cache(loggingContext().ctx, moved, OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'route' });

    // One vertex in the middle of the cached part moves (a backtrack that took another branch): same length, other route.
    const bent = moved.map((s, i) => (i === 40 ? { ...s, current: { ...s.current, x: s.current.x + 3 } } : i === 41 ? { ...s, previous: { ...s.previous, x: s.previous.x + 3 } } : s));
    cache(loggingContext().ctx, bent, OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 3, lastRebuildReason: 'route' });

    // Undo inside the head: reuse. Undo back past the split: rebuild.
    cache(loggingContext().ctx, bent.slice(0, 97 * 4), OPTIONS);
    expect(cache.stats.bodyRebuilds).toBe(3);
    cache(loggingContext().ctx, bent.slice(0, 80 * 4), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 4, lastRebuildReason: 'route' });
  });

  test('placement: the trail canvas origin moving by whole device pixels reuses the layer; by a fraction rebuilds', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    const scale = 2;
    cache(loggingContext(800, 2000, scale).ctx, route(100), OPTIONS);
    const shifted = loggingContext(800, 2000, scale);
    cache(shifted.ctx, route(100), { ...OPTIONS, originX: OPTIONS.originX - (3 / scale) });
    expect(cache.stats.bodyRebuilds).toBe(1);
    const blit = shifted.log.find((c) => c[0] === 'drawImage')!;
    expect(Number.isInteger(blit[2])).toBe(true);
    cache(loggingContext(800, 2000, scale).ctx, route(100), { ...OPTIONS, originX: OPTIONS.originX - (3.5 / scale) });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'offset' });
  });

  test('invalidate() forces the next paint to rebuild', () => {
    const cache = build();
    cache.invalidate();
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'invalidated' });
  });

  test('fingerprint covers positions and distances of the cached part only', () => {
    const a = route(60);
    const b = a.map((s, i) => (i === a.length - 1 ? { ...s, current: { ...s.current, x: s.current.x + 1 } } : s));
    expect(fingerprintStarDustRoute(a, 100)).toBe(fingerprintStarDustRoute(b, 100));
    expect(fingerprintStarDustRoute(a, a.length)).not.toBe(fingerprintStarDustRoute(b, b.length));
    const c = a.map((s, i) => (i === 10 ? { ...s, current: { ...s.current, distance: s.current.distance! + 0.5 } } : s));
    expect(fingerprintStarDustRoute(a, 100)).not.toBe(fingerprintStarDustRoute(c, 100));
  });
});

describe('cached star-dust trail: memory and fallbacks', () => {
  test('short trails paint whole and release a held layer (new level, reset)', () => {
    const made = stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats.bodyPixels).toBeGreaterThan(0);
    cache(loggingContext().ctx, route(STAR_DUST_TRAIL_CACHE.minTiles - 1), OPTIONS);
    expect(cache.stats).toMatchObject({ fullPaints: 1, releases: 1, bodyPixels: 0 });
    expect(made[0]).toMatchObject({ width: 0, height: 0 });
    // Long again: a fresh layer.
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'first' });
  });

  test('a layer over maxBodyPixels is never made: the whole trail is painted and nothing is held', () => {
    const made = stubDocument();
    const cache = createStarDustTrailCache({ maxBodyPixels: 1000 });
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats).toMatchObject({ cappedPaints: 1, fullPaints: 1, bodyRebuilds: 0, bodyPixels: 0 });
    expect(made.filter((c) => c.width * c.height > 1000)).toEqual([]);
  });

  test('the layer is the trail canvas size (same bloom grid as a full paint) and is blitted at the canvas corner', () => {
    const made = stubDocument();
    const cache = createStarDustTrailCache();
    const target = loggingContext(900, 1700, 3);
    cache(target.ctx, route(100), OPTIONS);
    const layer = made.find((c) => c.width === 900 && c.height === 1700);
    expect(layer).toBeDefined();
    expect(cache.stats.bodyPixels).toBe(900 * 1700);
    const blit = target.log.find((c) => c[0] === 'drawImage' && c[1] === layer)!;
    expect([Number(blit[2]), Number(blit[3])]).toEqual([0, 0]);
  });

  test('lifecycle fade paints whole but keeps the layer; no DOM paints whole', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), OPTIONS);
    cache(loggingContext().ctx, route(100), { ...OPTIONS, keylineAlpha: 0.5 });
    expect(cache.stats).toMatchObject({ fullPaints: 1, releases: 0 });
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    vi.unstubAllGlobals();
    const bare = createStarDustTrailCache();
    bare(loggingContext().ctx, route(100), OPTIONS);
    expect(bare.stats).toMatchObject({ fullPaints: 1, bodyRebuilds: 0 });
  });

  test('release() frees the canvas (scene shutdown); the next paint rebuilds', () => {
    const made = stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), OPTIONS);
    cache.release();
    expect(made[0]).toMatchObject({ width: 0, height: 0 });
    expect(cache.stats.bodyPixels).toBe(0);
    cache(loggingContext().ctx, route(100), OPTIONS);
    expect(cache.stats).toMatchObject({ bodyRebuilds: 2, lastRebuildReason: 'first' });
  });
});

describe('cached star-dust trail: same sparkles as a full paint', () => {
  const positions = (n: number): string[] => {
    const data = getStarDustSparkleScratch();
    return Array.from({ length: n }, (_, i) => `${data[i * STAR_DUST_SCRATCH_STRIDE]!.toFixed(4)},${data[(i * STAR_DUST_SCRATCH_STRIDE) + 1]!.toFixed(4)}`);
  };

  test('older slice + head place every sparkle of the whole route once (none doubled or lost at the split)', () => {
    const segments = route(100);
    const options = { ...OPTIONS, animated: false };
    const all = positions(placeStarDustSparkles(segments, options));
    for (const split of [37, 200, 361]) {
      const total = segments[segments.length - 1]!.current.distance!;
      const older = positions(placeStarDustSparkles(segments.slice(0, split), { ...options, routeLengthPx: total }));
      const head = positions(placeStarDustSparkles(segments.slice(split), options));
      expect([...older, ...head]).toEqual(all);
    }
  });

  test('routeLengthPx: the older slice tapers by age along the whole route', () => {
    const segments = route(100);
    const options = { ...OPTIONS, animated: false };
    const total = segments[segments.length - 1]!.current.distance!;
    const n = placeStarDustSparkles(segments, options);
    const fullRadii = Array.from({ length: n }, (_, i) => getStarDustSparkleScratch()[(i * STAR_DUST_SCRATCH_STRIDE) + 2]!);
    const m = placeStarDustSparkles(segments.slice(0, 200), { ...options, routeLengthPx: total });
    const sliceRadii = Array.from({ length: m }, (_, i) => getStarDustSparkleScratch()[(i * STAR_DUST_SCRATCH_STRIDE) + 2]!);
    expect(sliceRadii).toEqual(fullRadii.slice(0, m));
  });

  test('a head paint keylines and fills the cached sparkles the head reaches, in one keyline stroke, before the head\'s', () => {
    stubDocument();
    const cache = createStarDustTrailCache();
    cache(loggingContext().ctx, route(100), OPTIONS);
    const frame = loggingContext();
    const live = cache(frame.ctx, route(100), OPTIONS);
    const fills = count(frame.log, 'fill');
    expect(fills).toBeGreaterThan(live);
    // Head sparkles only: about 8 tiles' worth, plus the cached ones under the head's glow.
    expect(live).toBeLessThan(Math.ceil((STAR_DUST_TRAIL_CACHE.headTiles + 1) / 0.34) + 2);
    // One keyline stroke (no Path2D here: one context path) after the blit, then fills.
    const blitAt = frame.log.findIndex((c) => c[0] === 'drawImage');
    const firstFill = frame.log.findIndex((c) => c[0] === 'fill');
    expect(blitAt).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeGreaterThan(blitAt);
    const keylineStrokes = frame.log.slice(blitAt, firstFill).filter((c) => c[0] === 'stroke');
    expect(keylineStrokes.length).toBeGreaterThanOrEqual(1);
    expect(frame.log.slice(firstFill).filter((c) => c[0] === 'stroke')).toEqual([]);
  });
});

describe('the game painter', () => {
  test('is the full painter (look restored 2026-11-25): call for call the same, the cache untouched', () => {
    stubDocument();
    releaseStarDustTrailCache();
    const statsBefore = { ...getStarDustTrailCacheStats() };
    const game = loggingContext();
    const full = loggingContext();
    const gameSparkles = drawStarDustTrailToCanvasContext(game.ctx, route(100), OPTIONS);
    const fullSparkles = drawStarDustTrailFullToCanvasContext(full.ctx, route(100), OPTIONS);
    expect(gameSparkles).toBe(fullSparkles);
    expect(game.log).toEqual(full.log);
    expect(getStarDustTrailCacheStats()).toEqual(statsBefore);
    expect(getStarDustTrailCacheStats().bodyPixels).toBe(0);
  });

  test('the options page can install the withdrawn cached painter through the seam; release frees it', () => {
    stubDocument();
    setStarDustTrailRenderOverride(drawStarDustTrailCachedToCanvasContext);
    const before = getStarDustTrailCacheStats().headPaints + getStarDustTrailCacheStats().fullPaints;
    drawStarDustTrailToCanvasContext(loggingContext().ctx, route(100), OPTIONS);
    drawStarDustTrailToCanvasContext(loggingContext().ctx, route(100), OPTIONS);
    const stats = getStarDustTrailCacheStats();
    expect(stats.headPaints + stats.fullPaints).toBe(before + 2);
    expect(stats.bodyPixels).toBeGreaterThan(0);
    setStarDustTrailRenderOverride(() => -3);
    expect(drawStarDustTrailToCanvasContext(loggingContext().ctx, route(100), OPTIONS)).toBe(-3);
    releaseStarDustTrailCache();
    expect(getStarDustTrailCacheStats().bodyPixels).toBe(0);
  });
});
