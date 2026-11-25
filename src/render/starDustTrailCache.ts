/**
 * MAZER-PERF-017: the game's Star Dust trail painter. Owner pick 2026-11-24: option C (the older trail cached in an
 * offscreen layer, only the live head repainted per frame) with option A's lighter bloom for the live head. The look is
 * unchanged in kind: pointed, rainbow-shifting four-point stars with their dark keylines, never a glow stand-in.
 *
 * Per frame, for a long trail:
 *   1. the cached layer (everything older than the newest `headTiles`..`headTiles + rebuildAfterTiles` tiles, painted
 *      once with today's full layers, SHIPPED_PLAN, sparkles still) is copied onto the trail canvas at a whole device
 *      pixel offset (no resampling);
 *   2. the head is painted live with LIGHT_BLOOM_PLAN (coarse bloom and thread, twinkling sparkles);
 *   3. cached sparkles that the head's layers reach are re-keylined and re-filled in the head's pass, so every keyline
 *      still sits over every bloom and every fill over every keyline, as in one full pass.
 *
 * The cached layer is rebuilt when its picture could be wrong:
 *   - route: the cached part of the route is fingerprinted (every vertex position and distance); a new level, a reset,
 *     a step back into the cached part, a trimmed start or a moved board all change it;
 *   - head too long: the head grew more than `rebuildAfterTiles` past `headTiles` (about every 8 steps while walking);
 *   - colour clock: `refreshMs` of animation time since it was painted (colours drift; older sparkles move in steps), or
 *     the animation clock went backwards (a restarted scene); a pause stops the clock, so nothing is repainted;
 *   - style: device scale (DPR, zoom, the backing budget), tile size (resize), keyline colour (theme), lifecycle alpha,
 *     Trail Shine / reduced motion (`animated`) and Trail Fade's origin advance are part of the cache key;
 *   - placement: the trail canvas origin moved by a non-whole number of device pixels.
 * Short trails (under `minTiles`), a lifecycle fade, no DOM, or a layer bigger than `maxBodyPixels` (WebKit's canvas
 * memory: one more trail-sized canvas at most, 1.6 M px = 6.4 MB) paint the whole trail live with today's full layers
 * instead, exactly as before this change (A's lighter bloom is only for the head of a cached trail).
 * The cached canvas is released (width and height 0, which frees WebKit's backing store at once) when the trail turns
 * short, when it would be over budget, and on scene shutdown (releaseStarDustTrailCache).
 *
 * Accepted trade-offs (owner-picked option C): cached sparkles hold still (no twinkle or spin) and their colours, and the
 * travelling shine band, move in steps at each rebuild instead of every frame.
 */
import { MAZER_TRAIL_BACKING_MAX_PIXELS } from './canvasBackingBudget';
import { withCosmeticColours } from '../theme/cosmeticScope';
import { getStarDustTrailRenderOverride, type StarDustTrailRenderer } from './starDustRenderOverride';
import {
  STAR_DUST_SCRATCH_STRIDE,
  STAR_DUST_TRAIL,
  getStarDustSparkleScratch,
  resolveStarDustReach,
  type StarDustDrawOptions,
  type StarDustSegment
} from './starDustTrailCanvas';
import { LIGHT_BLOOM_PLAN, SHIPPED_PLAN, drawStarDustWithPlan, type StarDustRenderPlan } from './starDustTrailPlan';

export interface StarDustTrailCacheConfig {
  /** Tiles of route painted live right after a rebuild. */
  headTiles: number;
  /** The head may grow this many tiles past `headTiles` before the cached layer is rebuilt. */
  rebuildAfterTiles: number;
  /** Animation-clock ms after which the cached layer is repainted (its colours catch up). */
  refreshMs: number;
  /** Shorter trails are painted whole every time (cheap, and their sparkle sizes taper fast). */
  minTiles: number;
  /** Largest cached layer (it is the trail canvas's size), in device pixels; over it the trail is painted whole. */
  maxBodyPixels: number;
  /** The cached layer, and any trail painted whole (short, fading, over budget, no DOM): today's full layers. */
  bodyPlan: Readonly<StarDustRenderPlan>;
  /** The live head of a cached trail. */
  headPlan: Readonly<StarDustRenderPlan>;
}

export const STAR_DUST_TRAIL_CACHE: Readonly<StarDustTrailCacheConfig> = Object.freeze({
  headTiles: 8,
  rebuildAfterTiles: 8,
  refreshMs: 2000,
  minTiles: 48,
  maxBodyPixels: MAZER_TRAIL_BACKING_MAX_PIXELS,
  bodyPlan: SHIPPED_PLAN,
  headPlan: LIGHT_BLOOM_PLAN
});

export type StarDustCacheRebuildReason =
  | 'first' | 'key' | 'clock' | 'head' | 'route' | 'offset' | 'invalidated';

export interface StarDustTrailCacheStats {
  /** Whole trail painted live (short trail, fade, no DOM, over budget). */
  fullPaints: number;
  /** Cached layer copied, head painted live. */
  headPaints: number;
  bodyRebuilds: number;
  /** Full paints because the cached layer would have been over `maxBodyPixels`. */
  cappedPaints: number;
  /** Cached canvas released (short trail, over budget, shutdown). */
  releases: number;
  lastSparkles: number;
  /** Device pixels of the cached canvas now held (0 when released). */
  bodyPixels: number;
  lastRebuildReason: StarDustCacheRebuildReason | null;
}

export interface StarDustTrailCache extends StarDustTrailRenderer {
  readonly stats: StarDustTrailCacheStats;
  /** Forces a rebuild on the next paint (keeps the canvas). */
  invalidate(): void;
  /** Frees the cached canvas now. */
  release(): void;
}

type Canvas2D = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

interface CachedBody {
  key: string;
  builtAtMs: number;
  split: number;
  splitX: number;
  splitY: number;
  splitDistance: number;
  fingerprint: number;
  /** Trail canvas origin (css px) when painted. */
  originX: number;
  originY: number;
  /** The layer's placed sparkles (scratch layout) for re-keylining the ones the head reaches. */
  sparkles: Float64Array;
  sparkleCount: number;
}

const STRIDE = STAR_DUST_SCRATCH_STRIDE;

/** 32-bit fingerprint of the first `end` segments' vertices (positions and distances, 1/256 px). Exported for tests. */
export const fingerprintStarDustRoute = (segments: readonly StarDustSegment[], end: number): number => {
  let h = Math.imul(0x811c9dc5 ^ end, 0x01000193);
  const mix = (value: number): void => {
    h = Math.imul(h ^ (Math.round(value * 256) | 0), 0x01000193);
    h ^= h >>> 13;
  };
  if (end > 0) {
    const first = segments[0]!.previous;
    mix(first.x);
    mix(first.y);
    mix(first.distance ?? -1);
  }
  for (let i = 0; i < end; i += 1) {
    const p = segments[i]!.current;
    mix(p.x);
    mix(p.y);
    mix(p.distance ?? -1);
  }
  return h >>> 0;
};

const createCanvas2D = (): Canvas2D | null => {
  try {
    if (typeof document === 'undefined') {
      return null;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch {
    return null;
  }
};

/** Squared distance from (px, py) to the segment a-b. */
const distanceToSegmentSq = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = (dx * dx) + (dy * dy);
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSq)) : 0;
  const ex = ax + (dx * t) - px;
  const ey = ay + (dy * t) - py;
  return (ex * ex) + (ey * ey);
};

export const createStarDustTrailCache = (overrides: Partial<StarDustTrailCacheConfig> = {}): StarDustTrailCache => {
  const config: StarDustTrailCacheConfig = { ...STAR_DUST_TRAIL_CACHE, ...overrides };
  const stats: StarDustTrailCacheStats = {
    fullPaints: 0,
    headPaints: 0,
    bodyRebuilds: 0,
    cappedPaints: 0,
    releases: 0,
    lastSparkles: 0,
    bodyPixels: 0,
    lastRebuildReason: null
  };
  let surface: Canvas2D | null = null;
  let body: CachedBody | null = null;
  let invalidated = false;
  let underIndices = new Int32Array(64);

  const release = (): void => {
    body = null;
    if (surface) {
      surface.canvas.width = 0;
      surface.canvas.height = 0;
      surface = null;
      stats.releases += 1;
    }
    stats.bodyPixels = 0;
  };

  const paintFull = (ctx: CanvasRenderingContext2D, segments: readonly StarDustSegment[], options: StarDustDrawOptions): number => {
    stats.fullPaints += 1;
    stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, config.bodyPlan);
    return stats.lastSparkles;
  };

  const keyOf = (options: StarDustDrawOptions, scale: number): string => (
    `${scale}|${options.tileSize}|${options.keylineColor}|${options.keylineAlpha}|${options.animated ? 1 : 0}|${options.originAdvancePx}`
  );

  /** Why the cached layer cannot be reused for this paint, or null when it can. */
  const staleReason = (
    segments: readonly StarDustSegment[],
    options: StarDustDrawOptions,
    key: string,
    total: number,
    scale: number
  ): StarDustCacheRebuildReason | null => {
    if (!body) return 'first';
    if (invalidated) return 'invalidated';
    if (body.key !== key) return 'key';
    if (!(options.timeMs >= body.builtAtMs) || options.timeMs - body.builtAtMs >= config.refreshMs) return 'clock';
    // Stepped back (undo, backtrack) to or behind the cached part: the cached layer shows trail that is gone.
    if (body.split >= segments.length || !(total > body.splitDistance)) return 'route';
    if (total - body.splitDistance > (config.headTiles + config.rebuildAfterTiles) * options.tileSize) return 'head';
    const at = segments[body.split]!.previous;
    if (at.x !== body.splitX || at.y !== body.splitY || !(Math.abs((at.distance ?? Number.NaN) - body.splitDistance) < 1e-6)
      || fingerprintStarDustRoute(segments, body.split) !== body.fingerprint) {
      return 'route';
    }
    const dx = (body.originX - options.originX) * scale;
    const dy = (body.originY - options.originY) * scale;
    if (Math.abs(dx - Math.round(dx)) > 1e-6 || Math.abs(dy - Math.round(dy)) > 1e-6) return 'offset';
    return null;
  };

  /** Paints segments[0..split) into the cached layer. False when it cannot (the caller paints the whole trail). */
  const rebuild = (
    target: { width: number; height: number },
    segments: readonly StarDustSegment[],
    options: StarDustDrawOptions,
    key: string,
    total: number,
    scale: number,
    reason: StarDustCacheRebuildReason
  ): boolean => {
    const tile = options.tileSize;
    const want = total - (config.headTiles * tile);
    let split = -1;
    for (let i = 0; i < segments.length; i += 1) {
      const d = segments[i]!.previous.distance;
      if (!Number.isFinite(d)) return false;
      if (d! >= want) {
        split = i;
        break;
      }
    }
    if (split <= 0) return false;

    // The layer is the trail canvas's size, so the bloom's downscaled blur, its upscale ratio, its clip and the canvas
    // edges are the full painter's exactly (a layer cropped to the cached part's box gave the blur another sampling grid
    // and cut its fringe: 24% of lit pixels off by more than 16 at 3x). The trail canvas is the route's box already, under
    // the same backing budget, so a crop would save little.
    const width = Math.floor(target.width);
    const height = Math.floor(target.height);
    if (!(width > 0) || !(height > 0)) return false;
    if (width * height > config.maxBodyPixels) {
      stats.cappedPaints += 1;
      release();
      return false;
    }
    surface ??= createCanvas2D();
    if (!surface) return false;
    if (surface.canvas.width !== width || surface.canvas.height !== height) {
      surface.canvas.width = width;
      surface.canvas.height = height;
    } else {
      surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
      surface.ctx.clearRect(0, 0, width, height);
    }
    surface.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const count = drawStarDustWithPlan(
      surface.ctx,
      segments.slice(0, split),
      { ...options, routeLengthPx: total },
      config.bodyPlan,
      false
    );
    const scratch = getStarDustSparkleScratch();
    const sparkles = body && body.sparkles.length >= count * STRIDE ? body.sparkles : new Float64Array(Math.max(64, count) * STRIDE);
    sparkles.set(scratch.subarray(0, count * STRIDE));
    const at = segments[split]!.previous;
    body = {
      key,
      builtAtMs: options.timeMs,
      split,
      splitX: at.x,
      splitY: at.y,
      splitDistance: at.distance!,
      fingerprint: fingerprintStarDustRoute(segments, split),
      originX: options.originX,
      originY: options.originY,
      sparkles,
      sparkleCount: count
    };
    invalidated = false;
    stats.bodyRebuilds += 1;
    stats.bodyPixels = width * height;
    stats.lastRebuildReason = reason;
    return true;
  };

  /** Indices of the cached sparkles that the head's bloom, thread, keylines or sparkles reach. */
  const sparklesUnderHead = (head: readonly StarDustSegment[], options: StarDustDrawOptions, scale: number): number => {
    const cached = body!;
    const k = STAR_DUST_TRAIL;
    const sparkleReach = resolveStarDustReach(options.tileSize);
    const bloomReach = ((options.glowWidth * k.bloomWidthScale) / 2) + (options.glowBlurPx / Math.max(1e-6, scale));
    const reach = sparkleReach + Math.max(sparkleReach, bloomReach);
    const reachSq = reach * reach;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of head) {
      minX = Math.min(minX, s.previous.x, s.current.x);
      minY = Math.min(minY, s.previous.y, s.current.y);
      maxX = Math.max(maxX, s.previous.x, s.current.x);
      maxY = Math.max(maxY, s.previous.y, s.current.y);
    }
    minX -= reach;
    minY -= reach;
    maxX += reach;
    maxY += reach;
    let found = 0;
    const data = cached.sparkles;
    for (let i = 0; i < cached.sparkleCount; i += 1) {
      const x = data[i * STRIDE]!;
      const y = data[(i * STRIDE) + 1]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      let near = false;
      for (const s of head) {
        if (distanceToSegmentSq(x, y, s.previous.x, s.previous.y, s.current.x, s.current.y) <= reachSq) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      if (found >= underIndices.length) {
        const grown = new Int32Array(underIndices.length * 2);
        grown.set(underIndices);
        underIndices = grown;
      }
      underIndices[found] = i;
      found += 1;
    }
    return found;
  };

  const renderer = ((ctx: CanvasRenderingContext2D, segments: readonly StarDustSegment[], options: StarDustDrawOptions): number => {
    const target = ctx.canvas as { width?: number; height?: number } | undefined;
    const last = segments[segments.length - 1];
    const tile = options.tileSize;
    if (!last || !target || !(target.width! > 0) || !(target.height! > 0) || !(tile > 0)
      || typeof ctx.getTransform !== 'function' || !Number.isFinite(last.current.distance)) {
      return paintFull(ctx, segments, options);
    }
    const total = last.current.distance!;
    if (total < config.minTiles * tile) {
      if (surface) release();
      return paintFull(ctx, segments, options);
    }
    if (options.keylineAlpha !== 1) {
      // Lifecycle fade: every frame differs, so a cache would rebuild every frame. Keep the layer for afterwards.
      return paintFull(ctx, segments, options);
    }
    const scale = ctx.getTransform().a;
    const key = keyOf(options, scale);
    const reason = staleReason(segments, options, key, total, scale);
    if (reason !== null && !rebuild(target as { width: number; height: number }, segments, options, key, total, scale, reason)) {
      return paintFull(ctx, segments, options);
    }
    const cached = body!;
    const offsetX = Math.round((cached.originX - options.originX) * scale);
    const offsetY = Math.round((cached.originY - options.originY) * scale);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(surface!.canvas, offsetX, offsetY);
    ctx.restore();

    const head = segments.slice(cached.split);
    const under = sparklesUnderHead(head, options, scale);
    stats.headPaints += 1;
    stats.lastSparkles = drawStarDustWithPlan(ctx, head, options, config.headPlan, undefined, {
      data: cached.sparkles,
      indices: underIndices,
      count: under
    });
    return stats.lastSparkles;
  }) as StarDustTrailCache;

  Object.defineProperty(renderer, 'stats', { value: stats, enumerable: true });
  renderer.invalidate = () => {
    invalidated = true;
  };
  renderer.release = release;
  return renderer;
};

/** The game's one trail cache (one trail canvas per scene, one play scene at a time). */
const gameTrailCache = createStarDustTrailCache();

/** Frees the game's cached trail layer (scene shutdown). */
export const releaseStarDustTrailCache = (): void => gameTrailCache.release();

/** Counters of the game's trail cache (diagnostics and the trail-cost bench). */
export const getStarDustTrailCacheStats = (): Readonly<StarDustTrailCacheStats> => gameTrailCache.stats;

/**
 * Draws the star-dust trail into the trail canvas (already cleared and transformed by the caller). Returns the number of
 * sparkles painted live this frame. MAZER-UI-102: cosmetics keep their own colours under dark mode (cosmeticScope.ts).
 * The override is the trail-cost options page's seam (starDustRenderOverride.ts); it is never set in the game.
 */
export const drawStarDustTrailToCanvasContext: StarDustTrailRenderer = (ctx, segments, options) => withCosmeticColours(
  () => (getStarDustTrailRenderOverride() ?? gameTrailCache)(ctx, segments, options)
);
