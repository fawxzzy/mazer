/**
 * Trail-cost OPTIONS (MAZER-PERF-017 follow-up): cheaper ways to paint the Star Dust trail, for the owner to pick from on
 * the options page `trail-perf-options.html`. NOT used by the game: nothing in a shipping entry imports this module; the
 * page installs one of these renderers through starDustRenderOverride.ts on the real scene.
 *
 * Every renderer here draws from the same placed sparkles, colours and widths as the shipped draw
 * (starDustTrailCanvas.ts). A plan says which layers run and how:
 *   - bloom / thread: 'shipped' (one stroke per colour chunk: ~1 per 4 px of route, ~1,300 at level 300), 'coarse'
 *     (one flush, butt-capped stroke per `coarseTiles` of route, coloured by a gradient from the piece's first segment
 *     to its last; same total light as today, measured by scripts/analysis/trail-perf-options-calibrate.mjs), or 'off'
 *     (ablation only);
 *   - keyline / fills: on, or off (ablation only);
 *   - still: sparkles hold their size and angle (no twinkle, no spin); colours still shift;
 *   - idleRepaintMs: the shortest gap between repaints that only the colour clock asks for (standing still). The scene's
 *     redraw gate owns that gap; the options page holds it open (trailPerfOptionsHarness.ts) as the game would;
 *   - bodyCache: everything older than the last `headTiles` of route is painted once into a cached layer, re-painted
 *     every `refreshMs` (or when the route changes); only the head is painted per frame.
 *
 * With SHIPPED_PLAN the draw issues the same canvas calls as the shipped one (tests/render/starDustTrailVariants.test.ts).
 */
import { chunkTrailSegments, type TrailCanvasSegment } from '../navigationCoreTrailCanvas';
import { drawTrailBloomChunks, resolveBloomDownscale, type TrailBloomOptions } from '../trailLayersCanvas';
import { resolveTrailBloomClip } from '../trailBloomClip';
import {
  STAR_DUST_KEYLINE_BATCH,
  STAR_DUST_SCRATCH_STRIDE,
  STAR_DUST_TRAIL,
  getStarDustSparkleScratch,
  placeStarDustSparkles,
  resolveStarDustKeylineWidth,
  type StarDustDrawOptions,
  type StarDustSegment
} from '../starDustTrailCanvas';
import type { StarDustTrailRenderer } from '../starDustRenderOverride';

export type LayerMode = 'shipped' | 'coarse' | 'off';

export interface StarDustRenderPlan {
  bloom: LayerMode;
  thread: LayerMode;
  /** Route length per coarse chunk, in tiles (at least; pieces end only on a straight run). */
  coarseTiles: number;
  /**
   * Alpha gain for the coarse bloom. Today's ~4 px pieces stack their round caps a few deep, so one flush stroke at the
   * same alpha gives less light; the gain brings the total back (measured by scripts/analysis/trail-perf-options-calibrate.mjs).
   */
  coarseBloomGain: number;
  keyline: boolean;
  fills: boolean;
  still: boolean;
  idleRepaintMs: number;
  bodyCache: { headTiles: number; refreshMs: number; minTiles: number } | null;
}

export const SHIPPED_PLAN: Readonly<StarDustRenderPlan> = Object.freeze({
  bloom: 'shipped',
  thread: 'shipped',
  coarseTiles: 1,
  coarseBloomGain: 1,
  keyline: true,
  fills: true,
  still: false,
  idleRepaintMs: 0,
  bodyCache: null
});

export type TrailPerfVariantId = 'shipped' | 'A' | 'B' | 'C';

export interface TrailPerfVariant {
  id: TrailPerfVariantId;
  name: string;
  /** Plain words: what the player sees change. */
  look: string;
  plan: Readonly<StarDustRenderPlan>;
}

export const TRAIL_PERF_VARIANTS: readonly TrailPerfVariant[] = Object.freeze([
  {
    id: 'shipped',
    name: 'Today (shipped)',
    look: 'Star Dust as it ships: bloom and thread stroked in ~1,300 small colour pieces, every sparkle twinkles.',
    plan: SHIPPED_PLAN
  },
  {
    id: 'A',
    name: 'A. Light bloom',
    look: 'Same sparkles. The soft glow and the thin thread are stroked one piece per tile (about 25x fewer blurred '
      + 'strokes), each a smooth colour fade, so the rainbow still flows; the glow\'s halo shifts colour per tile.',
    // Gain 2.5: alpha coverage 0.98x today's on the level-300 trail (0.37x per unit gain; calibrate script, Chrome DPR3).
    plan: Object.freeze({ ...SHIPPED_PLAN, bloom: 'coarse', thread: 'coarse', coarseTiles: 1, coarseBloomGain: 2.5 })
  },
  {
    id: 'B',
    name: 'B. Calm sparkles',
    look: 'Sparkles hold still (no twinkle or spin; colours still shift). While you stand still the trail repaints '
      + '4 times a second instead of every other frame. Walking is unchanged.',
    plan: Object.freeze({ ...SHIPPED_PLAN, still: true, idleRepaintMs: 250 })
  },
  {
    id: 'C',
    name: 'C. Cached tail',
    look: 'The newest 8 to 16 tiles are painted live and twinkle. Everything older is painted once into a saved layer '
      + 'and refreshed every 2 s (or after 8 steps): older sparkles hold still and their colours move in steps.',
    plan: Object.freeze({ ...SHIPPED_PLAN, bodyCache: Object.freeze({ headTiles: 8, refreshMs: 2000, minTiles: 24 }) })
  }
]);

export const findTrailPerfVariant = (id: string | null | undefined): TrailPerfVariant => (
  TRAIL_PERF_VARIANTS.find((variant) => variant.id === id) ?? TRAIL_PERF_VARIANTS[0]!
);

const STRIDE = STAR_DUST_SCRATCH_STRIDE;
const STAR_UNIT_X = new Float64Array(8);
const STAR_UNIT_Y = new Float64Array(8);
for (let j = 0; j < 8; j += 1) {
  STAR_UNIT_X[j] = Math.cos((j * Math.PI) / 4);
  STAR_UNIT_Y[j] = Math.sin((j * Math.PI) / 4);
}

const HEX_PAIRS: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const hexColor = (color: number): string => `#${HEX_PAIRS[(color >> 16) & 255]}${HEX_PAIRS[(color >> 8) & 255]}${HEX_PAIRS[color & 255]}`;
const rgba = (color: number, alpha: number): string => (
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.max(0, Math.min(1, alpha))})`
);

type StarPathSink = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>;

const traceStar = (ctx: StarPathSink, data: Float64Array, base: number, ox: number, oy: number, waist: number): void => {
  const x = data[base]! - ox;
  const y = data[base + 1]! - oy;
  const r = data[base + 2]!;
  const c = data[base + 3]!;
  const s = data[base + 4]!;
  for (let j = 0; j < 8; j += 1) {
    const reach = (j & 1) === 0 ? r : r * waist;
    const ux = STAR_UNIT_X[j]!;
    const uy = STAR_UNIT_Y[j]!;
    const px = x + (((ux * c) - (uy * s)) * reach);
    const py = y + (((ux * s) + (uy * c)) * reach);
    if (j === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
};

const runsStraight = (a: TrailCanvasSegment, b: TrailCanvasSegment): boolean => {
  const ax = a.current.x - a.previous.x;
  const ay = a.current.y - a.previous.y;
  const bx = b.current.x - b.previous.x;
  const by = b.current.y - b.previous.y;
  return Math.abs((ax * by) - (ay * bx)) < 1e-6 && ((ax * bx) + (ay * by)) > 0;
};

/**
 * Splits connected segments into chunks of at least `maxLengthPx` of route, ignoring colour. A chunk only ends where the
 * route runs straight on, so butt-capped pieces meet flush (corners stay inside one piece, under its round join);
 * subpath breaks always split.
 */
export const chunkTrailSegmentsByLength = <T extends TrailCanvasSegment>(segments: readonly T[], maxLengthPx: number): T[][] => {
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let length = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const previous = chunk[chunk.length - 1];
    const connected = previous !== undefined
      && previous.current.x === segment.previous.x
      && previous.current.y === segment.previous.y;
    if (chunk.length > 0 && (!connected || (length >= maxLengthPx && runsStraight(previous!, segment)))) {
      chunks.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(segment);
    length += Math.hypot(segment.current.x - segment.previous.x, segment.current.y - segment.previous.y);
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
};

/**
 * One coarse piece: butt caps (set by the caller) so neighbouring pieces meet flush instead of stacking their round caps
 * into bright beads, and a gradient from the piece's first colour to its last so the rainbow still runs smoothly.
 */
const strokeCoarseChunk = (
  ctx: CanvasRenderingContext2D,
  chunk: readonly TrailCanvasSegment[],
  width: number,
  alphaRatio: number,
  ox: number,
  oy: number
): void => {
  const first = chunk[0]!;
  const last = chunk[chunk.length - 1]!;
  const x0 = first.previous.x - ox;
  const y0 = first.previous.y - oy;
  const x1 = last.current.x - ox;
  const y1 = last.current.y - oy;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (const segment of chunk) {
    ctx.lineTo(segment.current.x - ox, segment.current.y - oy);
  }
  const from = rgba(first.glowColor, first.alpha * alphaRatio);
  const to = rgba(last.glowColor, last.alpha * alphaRatio);
  if (from === to || Math.hypot(x1 - x0, y1 - y0) < 0.5 || typeof ctx.createLinearGradient !== 'function') {
    ctx.strokeStyle = from;
  } else {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.strokeStyle = gradient;
  }
  ctx.lineWidth = width;
  ctx.stroke();
};

let coarseBloomScratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

const acquireCoarseBloomScratch = (width: number, height: number): typeof coarseBloomScratch => {
  try {
    if (typeof document === 'undefined') return null;
    if (!coarseBloomScratch) {
      const canvas = document.createElement('canvas');
      const sctx = canvas.getContext('2d');
      if (!sctx) return null;
      coarseBloomScratch = { canvas, ctx: sctx };
    }
    if (coarseBloomScratch.canvas.width !== width || coarseBloomScratch.canvas.height !== height) {
      coarseBloomScratch.canvas.width = width;
      coarseBloomScratch.canvas.height = height;
    }
    return coarseBloomScratch;
  } catch {
    return null;
  }
};

/**
 * Option A's bloom: the shipped downscaled blur (trailLayersCanvas.ts drawBloomDownscaled: 1/f scratch, shadowBlur, clipped
 * upscale), but over coarse flush pieces. The blur's shadow takes one colour per piece (its middle segment's).
 */
const drawCoarseBloom = (
  ctx: CanvasRenderingContext2D,
  chunks: readonly (readonly TrailCanvasSegment[])[],
  options: TrailBloomOptions
): void => {
  const factor = options.glowBlurPx > 0 ? resolveBloomDownscale(options.glowBlurPx) : 1;
  const target = ctx.canvas as { width?: number; height?: number } | undefined;
  const canScale = factor >= 2 && target !== undefined && target.width! > 0 && target.height! > 0 && typeof ctx.getTransform === 'function';
  const scratch = canScale ? acquireCoarseBloomScratch(Math.ceil(target.width! / factor), Math.ceil(target.height! / factor)) : null;
  const paint = (into: CanvasRenderingContext2D, blurPx: number): void => {
    into.lineJoin = 'round';
    into.lineCap = 'butt';
    into.shadowBlur = blurPx;
    for (const chunk of chunks) {
      const middle = chunk[chunk.length >> 1]!;
      if (blurPx > 0) into.shadowColor = rgba(middle.glowColor, middle.alpha * options.glowAlphaRatio);
      strokeCoarseChunk(into, chunk, options.glowWidth, options.glowAlphaRatio, options.originX, options.originY);
    }
    into.shadowBlur = 0;
    into.shadowColor = 'transparent';
  };
  ctx.save();
  if (!scratch) {
    paint(ctx, options.glowBlurPx);
    ctx.restore();
    return;
  }
  const sctx = scratch.ctx;
  const scale = ctx.getTransform().a / factor;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
  sctx.setTransform(scale, 0, 0, scale, 0, 0);
  paint(sctx, options.glowBlurPx / factor);
  const clip = resolveTrailBloomClip(chunks, {
    width: target!.width!,
    height: target!.height!,
    scale: ctx.getTransform().a,
    originX: options.originX,
    originY: options.originY,
    glowWidth: options.glowWidth,
    glowBlurPx: options.glowBlurPx,
    factor
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clip) {
    ctx.beginPath();
    const r = clip.rects;
    for (let i = 0; i < r.length; i += 4) {
      ctx.rect(r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!);
    }
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch.canvas, 0, 0, scratch.canvas.width, scratch.canvas.height, 0, 0, target!.width!, target!.height!);
  ctx.restore();
};

/**
 * The plan's layers for `segments`, into `ctx` (already transformed by the caller, as the shipped draw expects). Returns the
 * sparkle count. Mirrors drawStarDustTrailToCanvasContextImpl call for call when the plan is SHIPPED_PLAN.
 */
export const drawStarDustWithPlan = (
  ctx: CanvasRenderingContext2D,
  segments: readonly StarDustSegment[],
  options: StarDustDrawOptions,
  plan: Readonly<StarDustRenderPlan>,
  animatedOverride?: boolean
): number => {
  if (segments.length === 0) {
    return 0;
  }
  const k = STAR_DUST_TRAIL;
  const ox = options.originX;
  const oy = options.originY;
  const coarsePx = Math.max(1, options.tileSize * plan.coarseTiles);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let shippedChunks: TrailCanvasSegment[][] | null = null;
  const shipped = (): TrailCanvasSegment[][] => {
    shippedChunks ??= chunkTrailSegments(segments);
    return shippedChunks;
  };

  let coarseChunks: TrailCanvasSegment[][] | null = null;
  const coarse = (): TrailCanvasSegment[][] => {
    coarseChunks ??= chunkTrailSegmentsByLength(segments, coarsePx);
    return coarseChunks;
  };

  if (plan.bloom !== 'off') {
    const bloomOptions = {
      originX: ox,
      originY: oy,
      glowWidth: options.glowWidth * k.bloomWidthScale,
      glowAlphaRatio: options.glowAlphaRatio * k.bloomAlphaScale,
      glowBlurPx: options.glowBlurPx
    };
    if (plan.bloom === 'coarse') {
      drawCoarseBloom(ctx, coarse(), { ...bloomOptions, glowAlphaRatio: bloomOptions.glowAlphaRatio * plan.coarseBloomGain });
    } else {
      drawTrailBloomChunks(ctx, shipped(), bloomOptions);
    }
  }

  if (plan.thread !== 'off') {
    const threadWidth = Math.max(k.threadMinCss, options.coreWidth * k.threadOfCore);
    if (plan.thread === 'coarse') {
      ctx.save();
      ctx.lineCap = 'butt';
      for (const chunk of coarse()) {
        strokeCoarseChunk(ctx, chunk, threadWidth, k.threadAlpha, ox, oy);
      }
      ctx.restore();
    } else {
      ctx.lineWidth = threadWidth;
      for (const chunk of shipped()) {
        const first = chunk[0]!;
        ctx.beginPath();
        ctx.moveTo(first.previous.x - ox, first.previous.y - oy);
        for (const segment of chunk) {
          ctx.lineTo(segment.current.x - ox, segment.current.y - oy);
        }
        ctx.strokeStyle = rgba(first.glowColor, first.alpha * k.threadAlpha);
        ctx.stroke();
      }
    }
  }

  const animated = animatedOverride ?? (plan.still ? false : options.animated);
  const count = placeStarDustSparkles(segments, { ...options, animated });
  const data = getStarDustSparkleScratch();
  if (count > 0) {
    if (plan.keyline) {
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 4;
      let path: Path2D | null = null;
      if (typeof Path2D === 'function') {
        path = new Path2D();
        for (let first = 0; first < count; first += STAR_DUST_KEYLINE_BATCH) {
          const batch = new Path2D();
          const end = Math.min(count, first + STAR_DUST_KEYLINE_BATCH);
          for (let i = first; i < end; i += 1) {
            traceStar(batch, data, i * STRIDE, ox, oy, k.waistRatio);
          }
          path.addPath(batch);
        }
      } else {
        ctx.beginPath();
        for (let i = 0; i < count; i += 1) {
          traceStar(ctx, data, i * STRIDE, ox, oy, k.waistRatio);
        }
      }
      ctx.lineWidth = resolveStarDustKeylineWidth(options.tileSize);
      ctx.strokeStyle = rgba(options.keylineColor, k.keylineAlpha * Math.max(0, Math.min(1, options.keylineAlpha)));
      if (path) {
        ctx.stroke(path);
      } else {
        ctx.stroke();
      }
    }
    if (plan.fills) {
      for (let i = 0; i < count; i += 1) {
        const base = i * STRIDE;
        ctx.globalAlpha = Math.max(0, Math.min(1, data[base + 6]!));
        ctx.fillStyle = hexColor(data[base + 5]!);
        ctx.beginPath();
        traceStar(ctx, data, base, ox, oy, k.waistRatio);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  return count;
};

type Canvas2D = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

const createCanvas2D = (): Canvas2D | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
};

const sizeCanvas = (target: Canvas2D, width: number, height: number): void => {
  if (target.canvas.width !== width || target.canvas.height !== height) {
    target.canvas.width = width;
    target.canvas.height = height;
  } else {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.clearRect(0, 0, width, height);
  }
};

const blit = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, dx: number, dy: number): void => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(source, dx, dy);
  ctx.restore();
};

const segmentEnd = (segment: StarDustSegment, fallback: number): number => (
  Number.isFinite(segment.current.distance) ? segment.current.distance! : fallback
);

/** Counters the options page shows: how many paints were full, head-only (C), or rebuilt C's cached body. */
export interface TrailPerfRenderStats {
  fullPaints: number;
  headPaints: number;
  bodyRebuilds: number;
  lastSparkles: number;
}

/**
 * A renderer for the override seam that follows `plan`. Keeps its own cached body canvas for bodyCache; `stats` counts
 * what it did.
 */
export const createStarDustPlanRenderer = (
  plan: Readonly<StarDustRenderPlan>,
  stats: TrailPerfRenderStats = { fullPaints: 0, headPaints: 0, bodyRebuilds: 0, lastSparkles: 0 }
): StarDustTrailRenderer & { stats: TrailPerfRenderStats } => {
  let body: (Canvas2D & {
    originX: number; originY: number; scale: number; splitDistance: number; splitX: number; splitY: number;
    builtAtMs: number; key: string;
  }) | null = null;

  const renderer = ((ctx, segments, options) => {
    const target = ctx.canvas as HTMLCanvasElement | undefined;
    const scale = typeof ctx.getTransform === 'function' ? ctx.getTransform().a : 1;
    const last = segments[segments.length - 1];
    if (!target || !last) {
      stats.fullPaints += 1;
      return drawStarDustWithPlan(ctx, segments, options, plan);
    }

    // B's idle cadence (idleRepaintMs) is not a painter concern: the scene's redraw gate decides when to call this, and the
    // page holds that gap open (trailPerfOptionsHarness), exactly as the game would. Here B only paints still sparkles.

    // C: body layer cached, head painted live.
    const cache = plan.bodyCache;
    const tile = options.tileSize;
    let total = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const s = segments[i]!;
      total = segmentEnd(s, total + Math.hypot(s.current.x - s.previous.x, s.current.y - s.previous.y));
    }
    if (!cache || !(tile > 0) || total < cache.minTiles * tile || !Number.isFinite(last.current.distance)) {
      stats.fullPaints += 1;
      stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
      return stats.lastSparkles;
    }
    const headPx = cache.headTiles * tile;
    const styleKey = `${scale}|${tile}|${options.keylineAlpha}|${options.keylineColor}`;
    let split = -1;
    if (body && body.key === styleKey && options.timeMs >= body.builtAtMs && options.timeMs - body.builtAtMs < cache.refreshMs
      && total - body.splitDistance <= headPx * 2 && body.splitDistance < total) {
      // The route up to the cached split must be the same route (not a new level, a step back, or a trimmed start).
      for (let i = 0; i < segments.length; i += 1) {
        const p = segments[i]!.previous;
        if (Math.abs((p.distance ?? Number.NaN) - body.splitDistance) < 1e-6) {
          if (p.x === body.splitX && p.y === body.splitY) {
            split = i;
          }
          break;
        }
      }
    }
    const dx = body ? (body.originX - options.originX) * scale : 0;
    const dy = body ? (body.originY - options.originY) * scale : 0;
    const whole = Math.abs(dx - Math.round(dx)) < 1e-6 && Math.abs(dy - Math.round(dy)) < 1e-6;
    if (split < 0 || !whole) {
      // Rebuild: split at the first segment start at or past (total - head).
      const want = total - headPx;
      split = segments.findIndex((s) => (s.previous.distance ?? 0) >= want);
      if (split <= 0) {
        stats.fullPaints += 1;
        stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
        return stats.lastSparkles;
      }
      if (!body) {
        const made = createCanvas2D();
        body = made ? { ...made, originX: 0, originY: 0, scale: 0, splitDistance: 0, splitX: 0, splitY: 0, builtAtMs: 0, key: '' } : null;
      }
      if (!body) {
        stats.fullPaints += 1;
        stats.lastSparkles = drawStarDustWithPlan(ctx, segments, options, plan);
        return stats.lastSparkles;
      }
      sizeCanvas(body, target.width, target.height);
      body.ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawStarDustWithPlan(body.ctx, segments.slice(0, split), options, plan, false);
      const at = segments[split]!.previous;
      body.originX = options.originX;
      body.originY = options.originY;
      body.scale = scale;
      body.splitDistance = at.distance ?? 0;
      body.splitX = at.x;
      body.splitY = at.y;
      body.builtAtMs = options.timeMs;
      body.key = styleKey;
      stats.bodyRebuilds += 1;
      blit(ctx, body.canvas, 0, 0);
    } else {
      blit(ctx, body!.canvas, Math.round(dx), Math.round(dy));
    }
    stats.headPaints += 1;
    stats.lastSparkles = drawStarDustWithPlan(ctx, segments.slice(split), options, plan);
    return stats.lastSparkles;
  }) as StarDustTrailRenderer & { stats: TrailPerfRenderStats };
  renderer.stats = stats;
  return renderer;
};
