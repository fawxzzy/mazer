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
 *   - route: the route's first vertex and the split vertex are checked every frame (a new level, a reset, a step back
 *     into the cached part, a trimmed start or a moved board all change one of them), and the cached part is
 *     fingerprinted in windows of ROUTE_WINDOW segments at rebuild, one window re-checked per frame in turn, so any
 *     other change inside the cached part is caught within one pass over the windows (a few frames; the colour clock
 *     bounds it too) without re-hashing the whole route every frame;
 *   - head too long: the head grew more than `rebuildAfterTiles` past `headTiles` (about every 8 steps while walking);
 *   - colour clock: `refreshMs` of animation time since it was painted (colours drift; older sparkles move in steps), or
 *     the animation clock went backwards (a restarted scene); a pause stops the clock, so nothing is repainted;
 *   - style: device scale (DPR, zoom, the backing budget), tile size (resize), keyline colour (theme), lifecycle alpha,
 *     Trail Shine / reduced motion (`animated`), Trail Fade's origin advance and the steady widths are compared field
 *     by field (no key string per frame);
 *   - placement: the trail canvas origin moved by a non-whole number of device pixels.
 * Short trails (under `minTiles`), a lifecycle fade, no DOM, or a layer bigger than `maxBodyPixels` (WebKit's canvas
 * memory: one more trail-sized canvas at most, 1.6 M px = 6.4 MB) paint the whole trail live with today's full layers
 * instead, exactly as before this change (A's lighter bloom is only for the head of a cached trail).
 * The cached canvas is released (width and height 0, which frees WebKit's backing store at once) when the trail turns
 * short, when it would be over budget, and on scene shutdown or a trail skin change (releaseStarDustTrailCache, which
 * also frees the coarse bloom's scratch canvas).
 *
 * Accepted trade-offs (owner-picked option C): cached sparkles hold still (no twinkle or spin) and their colours, and the
 * travelling shine band, move in steps at each rebuild instead of every frame. Breath (MAZER-PERF-017 follow-up): the
 * trail's 3 s glow breath (width +-5%, glow alpha +-15% around its middle) is not cached; the cached layer is painted at
 * the steady breath reduced motion holds (the `steady*` options) and only the live head breathes. Painting it at the
 * breath of the moment made the whole older trail jump to a new phase at every 2 s rebuild (measured: 31% of its lit
 * pixels off by more than 16 of 255 at 2.625x, scripts/analysis/check-star-dust-trail-breath-seam.mjs).
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
import {
  LIGHT_BLOOM_PLAN,
  SHIPPED_PLAN,
  drawStarDustWithPlan,
  releaseCoarseBloomScratch,
  type StarDustRenderPlan
} from './starDustTrailPlan';

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

/** What the cached layer was painted with; any change means a rebuild ('key'). Compared field by field. */
interface BodyKey {
  scale: number;
  tileSize: number;
  keylineColor: number;
  keylineAlpha: number;
  animated: boolean;
  originAdvancePx: number;
  steadyCoreWidth: number | undefined;
  steadyGlowWidth: number | undefined;
  steadyGlowAlphaRatio: number | undefined;
  steadyGlowBlurPx: number | undefined;
}

interface CachedBody extends BodyKey {
  builtAtMs: number;
  split: number;
  splitX: number;
  splitY: number;
  splitDistance: number;
  /** The route's first vertex when painted (checked every frame). */
  startX: number;
  startY: number;
  startDistance: number;
  /** Fingerprints of segments[w * ROUTE_WINDOW .. min(split, (w + 1) * ROUTE_WINDOW)); one is re-checked per frame. */
  windowHashes: Uint32Array;
  windowCount: number;
  windowCursor: number;
  /** Trail canvas origin (css px) when painted. */
  originX: number;
  originY: number;
  /** The layer's placed sparkles (scratch layout) for re-keylining the ones the head reaches. */
  sparkles: Float64Array;
  sparkleCount: number;
  /**
   * The cached sparkles near the split vertex (ascending): every one the head can reach while its reach stays within
   * `candidateReach` and its vertices within the longest head of the split vertex.
   */
  candidates: Int32Array;
  candidateCount: number;
  candidateReach: number;
}

const STRIDE = STAR_DUST_SCRATCH_STRIDE;

/** Segments per route fingerprint window (one window is re-hashed per frame). Exported for tests. */
export const ROUTE_WINDOW = 128;

/** Candidate sparkles are gathered at rebuild for a head reach up to this many times the reach at rebuild. */
const CANDIDATE_REACH_SLACK = 1.5;

const mixRouteHash = (h: number, value: number): number => {
  const next = Math.imul(h ^ (Math.round(value * 256) | 0), 0x01000193);
  return next ^ (next >>> 13);
};

/**
 * 32-bit fingerprint of segments[start..end)'s vertices (positions and distances, 1/256 px; segments[start].previous
 * included). Exported for tests.
 */
export const fingerprintStarDustRoute = (segments: readonly StarDustSegment[], end: number, start = 0): number => {
  let h = Math.imul(0x811c9dc5 ^ end, 0x01000193);
  if (end > start) {
    const first = segments[start]!.previous;
    h = mixRouteHash(h, first.x);
    h = mixRouteHash(h, first.y);
    h = mixRouteHash(h, first.distance ?? -1);
  }
  for (let i = start; i < end; i += 1) {
    const p = segments[i]!.current;
    h = mixRouteHash(h, p.x);
    h = mixRouteHash(h, p.y);
    h = mixRouteHash(h, p.distance ?? -1);
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
  /** Handed to the head's pass every frame (one object, refilled). */
  const overlay: { data: Float64Array; indices: Int32Array; count: number } = {
    data: new Float64Array(0),
    indices: underIndices,
    count: 0
  };

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

  const sameKey = (cached: BodyKey, options: StarDustDrawOptions, scale: number): boolean => (
    cached.scale === scale
    && cached.tileSize === options.tileSize
    && cached.keylineColor === options.keylineColor
    && cached.keylineAlpha === options.keylineAlpha
    && cached.animated === options.animated
    && cached.originAdvancePx === options.originAdvancePx
    && cached.steadyCoreWidth === options.steadyCoreWidth
    && cached.steadyGlowWidth === options.steadyGlowWidth
    && cached.steadyGlowAlphaRatio === options.steadyGlowAlphaRatio
    && cached.steadyGlowBlurPx === options.steadyGlowBlurPx
  );

  /** How far (css px) the head's bloom, thread, keylines or sparkles reach a cached sparkle's centre. */
  const headReachOf = (options: StarDustDrawOptions, scale: number): number => {
    const sparkleReach = resolveStarDustReach(options.tileSize);
    const bloomReach = ((options.glowWidth * STAR_DUST_TRAIL.bloomWidthScale) / 2) + (options.glowBlurPx / Math.max(1e-6, scale));
    return sparkleReach + Math.max(sparkleReach, bloomReach);
  };

  /** The longest head (css px of route) before a 'head' rebuild. */
  const maxHeadPx = (options: StarDustDrawOptions): number => (config.headTiles + config.rebuildAfterTiles) * options.tileSize;

  /** Why the cached layer cannot be reused for this paint, or null when it can. */
  const staleReason = (
    segments: readonly StarDustSegment[],
    options: StarDustDrawOptions,
    total: number,
    scale: number
  ): StarDustCacheRebuildReason | null => {
    if (!body) return 'first';
    if (invalidated) return 'invalidated';
    if (!sameKey(body, options, scale)) return 'key';
    if (!(options.timeMs >= body.builtAtMs) || options.timeMs - body.builtAtMs >= config.refreshMs) return 'clock';
    // Stepped back (undo, backtrack) to or behind the cached part: the cached layer shows trail that is gone.
    if (body.split >= segments.length || !(total > body.splitDistance)) return 'route';
    if (total - body.splitDistance > maxHeadPx(options)) return 'head';
    const at = segments[body.split]!.previous;
    if (at.x !== body.splitX || at.y !== body.splitY || !(Math.abs((at.distance ?? Number.NaN) - body.splitDistance) < 1e-6)) {
      return 'route';
    }
    const start = segments[0]!.previous;
    if (start.x !== body.startX || start.y !== body.startY || (start.distance ?? -1) !== body.startDistance) return 'route';
    const w = body.windowCursor;
    body.windowCursor = w + 1 < body.windowCount ? w + 1 : 0;
    const from = w * ROUTE_WINDOW;
    if (fingerprintStarDustRoute(segments, Math.min(body.split, from + ROUTE_WINDOW), from) !== body.windowHashes[w]) {
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
    // The cached layer is painted at the steady breath (see the header): the live head breathes, the older trail holds.
    const count = drawStarDustWithPlan(
      surface.ctx,
      segments.slice(0, split),
      {
        ...options,
        coreWidth: options.steadyCoreWidth ?? options.coreWidth,
        glowWidth: options.steadyGlowWidth ?? options.glowWidth,
        glowAlphaRatio: options.steadyGlowAlphaRatio ?? options.glowAlphaRatio,
        glowBlurPx: options.steadyGlowBlurPx ?? options.glowBlurPx,
        deviceScale: scale,
        routeLengthPx: total
      },
      config.bodyPlan,
      false
    );
    const scratch = getStarDustSparkleScratch();
    const sparkles = body && body.sparkles.length >= count * STRIDE ? body.sparkles : new Float64Array(Math.max(64, count) * STRIDE);
    sparkles.set(scratch.subarray(0, count * STRIDE));

    const windowCount = Math.ceil(split / ROUTE_WINDOW);
    const windowHashes = body && body.windowHashes.length >= windowCount ? body.windowHashes : new Uint32Array(Math.max(8, windowCount));
    for (let w = 0; w < windowCount; w += 1) {
      windowHashes[w] = fingerprintStarDustRoute(segments, Math.min(split, (w + 1) * ROUTE_WINDOW), w * ROUTE_WINDOW);
    }

    const at = segments[split]!.previous;
    const candidateReach = headReachOf(options, scale) * CANDIDATE_REACH_SLACK;
    const span = maxHeadPx(options) + candidateReach;
    const spanSq = span * span;
    const candidates = body && body.candidates.length >= count ? body.candidates : new Int32Array(Math.max(64, count));
    let candidateCount = 0;
    for (let i = 0; i < count; i += 1) {
      const dx = sparkles[i * STRIDE]! - at.x;
      const dy = sparkles[(i * STRIDE) + 1]! - at.y;
      if ((dx * dx) + (dy * dy) <= spanSq) {
        candidates[candidateCount] = i;
        candidateCount += 1;
      }
    }

    const start = segments[0]!.previous;
    body = {
      scale,
      tileSize: options.tileSize,
      keylineColor: options.keylineColor,
      keylineAlpha: options.keylineAlpha,
      animated: options.animated,
      originAdvancePx: options.originAdvancePx,
      steadyCoreWidth: options.steadyCoreWidth,
      steadyGlowWidth: options.steadyGlowWidth,
      steadyGlowAlphaRatio: options.steadyGlowAlphaRatio,
      steadyGlowBlurPx: options.steadyGlowBlurPx,
      builtAtMs: options.timeMs,
      split,
      splitX: at.x,
      splitY: at.y,
      splitDistance: at.distance!,
      startX: start.x,
      startY: start.y,
      startDistance: start.distance ?? -1,
      windowHashes,
      windowCount,
      windowCursor: 0,
      originX: options.originX,
      originY: options.originY,
      sparkles,
      sparkleCount: count,
      candidates,
      candidateCount,
      candidateReach
    };
    invalidated = false;
    stats.bodyRebuilds += 1;
    stats.bodyPixels = width * height;
    stats.lastRebuildReason = reason;
    return true;
  };

  /**
   * Indices (ascending) of the cached sparkles that the head's (segments[cached.split..]) bloom, thread, keylines or
   * sparkles reach. Scans only the candidates gathered at rebuild while the head stays inside the region they cover
   * (always, unless the reach grew past the slack or a head vertex left the longest head's radius); else every cached
   * sparkle. Same result either way.
   */
  const sparklesUnderHead = (segments: readonly StarDustSegment[], options: StarDustDrawOptions, scale: number): number => {
    const cached = body!;
    const reach = headReachOf(options, scale);
    const reachSq = reach * reach;
    const radius = maxHeadPx(options);
    const radiusSq = radius * radius;
    let withinRadius = true;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let j = cached.split; j < segments.length; j += 1) {
      const s = segments[j]!;
      minX = Math.min(minX, s.previous.x, s.current.x);
      minY = Math.min(minY, s.previous.y, s.current.y);
      maxX = Math.max(maxX, s.previous.x, s.current.x);
      maxY = Math.max(maxY, s.previous.y, s.current.y);
      const dx = s.current.x - cached.splitX;
      const dy = s.current.y - cached.splitY;
      if ((dx * dx) + (dy * dy) > radiusSq) withinRadius = false;
    }
    minX -= reach;
    minY -= reach;
    maxX += reach;
    maxY += reach;
    const useCandidates = withinRadius && reach <= cached.candidateReach;
    const scanCount = useCandidates ? cached.candidateCount : cached.sparkleCount;
    let found = 0;
    const data = cached.sparkles;
    for (let c = 0; c < scanCount; c += 1) {
      const i = useCandidates ? cached.candidates[c]! : c;
      const x = data[i * STRIDE]!;
      const y = data[(i * STRIDE) + 1]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      let near = false;
      for (let j = cached.split; j < segments.length; j += 1) {
        const s = segments[j]!;
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
    const knownScale = options.deviceScale !== undefined && options.deviceScale > 0;
    if (!last || !target || !(target.width! > 0) || !(target.height! > 0) || !(tile > 0)
      || (!knownScale && typeof ctx.getTransform !== 'function') || !Number.isFinite(last.current.distance)) {
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
    // The caller's device scale when it passes it (the game does): getTransform allocates a DOMMatrix per call.
    const scale = knownScale ? options.deviceScale! : ctx.getTransform().a;
    const reason = staleReason(segments, options, total, scale);
    if (reason !== null && !rebuild(target as { width: number; height: number }, segments, options, total, scale, reason)) {
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

    const under = sparklesUnderHead(segments, options, scale);
    overlay.data = cached.sparkles;
    overlay.indices = underIndices;
    overlay.count = under;
    stats.headPaints += 1;
    stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, config.headPlan, undefined, overlay, cached.split);
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

/**
 * Frees the game's cached trail layer and the coarse bloom's scratch canvas (scene shutdown; the trail skin stopped
 * being Star Dust).
 */
export const releaseStarDustTrailCache = (): void => {
  gameTrailCache.release();
  releaseCoarseBloomScratch();
};

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
