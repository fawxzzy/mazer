/**
 * Star Dust trail painter with a per-layer plan (MAZER-PERF-017). The game paints its trail through the cached painter
 * in starDustTrailCache.ts, which uses this module twice per frame at most: the older trail with SHIPPED_PLAN (today's
 * layers exactly, into a cached layer) and the live head with LIGHT_BLOOM_PLAN (option A's lighter bloom and thread).
 * The trail-cost options page (trail-perf-options.html, dev only) also builds its rows from these plans.
 *
 * Every plan draws from the same placed sparkles, colours and widths as the full painter (starDustTrailCanvas.ts). A
 * plan says which layers run and how:
 *   - bloom / thread: 'shipped' (one stroke per colour chunk: ~1 per 4 px of route, ~1,300 at level 300), 'coarse'
 *     (one flush, butt-capped stroke per `coarseTiles` of route, coloured by a gradient from the piece's first segment
 *     to its last; same total light as today, measured by scripts/analysis/trail-perf-options-calibrate.mjs), or 'off'
 *     (ablation only);
 *   - keyline / fills: on, or off (ablation only);
 *   - still: sparkles hold their size and angle (no twinkle, no spin); colours still shift;
 *   - idleRepaintMs / bodyCache: options-page knobs only (see the page's starDustTrailVariants.ts).
 *
 * With SHIPPED_PLAN the draw issues the same canvas calls as the full painter (tests/render/starDustTrailVariants.test.ts).
 */
import { chunkTrailSegments, type TrailCanvasSegment } from './navigationCoreTrailCanvas';
import { drawTrailBloomChunks, resolveBloomDownscale, type TrailBloomOptions } from './trailLayersCanvas';
import { resolveTrailBloomClip } from './trailBloomClip';
import {
  STAR_DUST_KEYLINE_BATCH,
  STAR_DUST_SCRATCH_STRIDE,
  STAR_DUST_TRAIL,
  getStarDustSparkleScratch,
  placeStarDustSparkles,
  resolveStarDustKeylineWidth,
  type StarDustDrawOptions,
  type StarDustSegment
} from './starDustTrailCanvas';

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

/**
 * Option A "Light bloom" (owner pick 2026-11-24, for the live head): the same sparkles; the soft glow and the thin
 * thread stroked one flush piece per tile with a colour fade, about 25x fewer blurred strokes. Gain 2.5: alpha coverage
 * 0.98x today's on the level-300 trail (0.37x per unit gain; calibrate script, Chrome DPR3).
 */
export const LIGHT_BLOOM_PLAN: Readonly<StarDustRenderPlan> = Object.freeze({
  ...SHIPPED_PLAN,
  bloom: 'coarse',
  thread: 'coarse',
  coarseTiles: 1,
  coarseBloomGain: 2.5
});

/**
 * Already-placed sparkles from an earlier pass that must sit ABOVE this pass's bloom, thread and keylines, as they do in
 * the full painter (all keylines over all bloom, all fills over all keylines). The cached painter hands over the cached
 * layer's sparkles that the live head's layers reach; they are re-keylined in the same stroke as the head's (first, as
 * they are older) and re-filled before the head's fills. `data` uses the sparkle scratch layout (STAR_DUST_SCRATCH_STRIDE).
 */
export interface StarDustUnderSparkles {
  data: Float64Array;
  indices: ArrayLike<number>;
  count: number;
}

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
 * subpath breaks always split. `startIndex`: chunk only segments[startIndex..] (same as chunking segments.slice(startIndex)).
 */
export const chunkTrailSegmentsByLength = <T extends TrailCanvasSegment>(
  segments: readonly T[],
  maxLengthPx: number,
  startIndex = 0
): T[][] => {
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let length = 0;
  for (let i = startIndex; i < segments.length; i += 1) {
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

/**
 * Frees the coarse bloom's scratch canvas (about 1/f^2 of the trail canvas). The cached trail painter calls this when it
 * releases its layer: on scene shutdown and when the trail skin stops being Star Dust. The next coarse bloom makes a new one.
 */
export const releaseCoarseBloomScratch = (): void => {
  if (coarseBloomScratch) {
    coarseBloomScratch.canvas.width = 0;
    coarseBloomScratch.canvas.height = 0;
    coarseBloomScratch = null;
  }
};

/** Tests: whether the coarse bloom scratch canvas is held. */
export const hasCoarseBloomScratch = (): boolean => coarseBloomScratch !== null;

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
  options: TrailBloomOptions,
  deviceScale?: number
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
  // The caller's device scale when it knows it (the cached painter passes it: getTransform allocates a DOMMatrix).
  const device = deviceScale !== undefined && deviceScale > 0 ? deviceScale : ctx.getTransform().a;
  const scale = device / factor;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
  sctx.setTransform(scale, 0, 0, scale, 0, 0);
  paint(sctx, options.glowBlurPx / factor);
  const clip = resolveTrailBloomClip(chunks, {
    width: target!.width!,
    height: target!.height!,
    scale: device,
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
 * The plan's layers for `segments`, into `ctx` (already transformed by the caller, as the full painter expects). Returns
 * the sparkle count. Mirrors the full painter (drawStarDustTrailToCanvasContextImpl) call for call when the plan is
 * SHIPPED_PLAN and no `under` sparkles are given. `startIndex`: draw only segments[startIndex..] (the cached trail's
 * live head, without copying the array); same result as drawing segments.slice(startIndex).
 */
export const drawStarDustWithPlan = (
  ctx: CanvasRenderingContext2D,
  segments: readonly StarDustSegment[],
  options: StarDustDrawOptions,
  plan: Readonly<StarDustRenderPlan>,
  animatedOverride?: boolean,
  under?: StarDustUnderSparkles | null,
  startIndex = 0
): number => {
  if (segments.length <= startIndex) {
    return 0;
  }
  const k = STAR_DUST_TRAIL;
  const ox = options.originX;
  const oy = options.originY;
  const coarsePx = Math.max(1, options.tileSize * plan.coarseTiles);
  const stride = STAR_DUST_SCRATCH_STRIDE;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let shippedChunks: TrailCanvasSegment[][] | null = null;
  const shipped = (): TrailCanvasSegment[][] => {
    shippedChunks ??= chunkTrailSegments(startIndex > 0 ? segments.slice(startIndex) : segments);
    return shippedChunks;
  };

  let coarseChunks: TrailCanvasSegment[][] | null = null;
  const coarse = (): TrailCanvasSegment[][] => {
    coarseChunks ??= chunkTrailSegmentsByLength(segments, coarsePx, startIndex);
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
      drawCoarseBloom(
        ctx,
        coarse(),
        { ...bloomOptions, glowAlphaRatio: bloomOptions.glowAlphaRatio * plan.coarseBloomGain },
        options.deviceScale
      );
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
  const count = placeStarDustSparkles(segments, animated === options.animated ? options : { ...options, animated }, startIndex);
  const data = getStarDustSparkleScratch();
  const underCount = under ? under.count : 0;
  if (count > 0 || underCount > 0) {
    if (plan.keyline) {
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 4;
      let path: Path2D | null = null;
      if (typeof Path2D === 'function') {
        path = new Path2D();
        if (underCount > 0) {
          const batch = new Path2D();
          for (let i = 0; i < underCount; i += 1) {
            traceStar(batch, under!.data, under!.indices[i]! * stride, ox, oy, k.waistRatio);
          }
          path.addPath(batch);
        }
        for (let first = 0; first < count; first += STAR_DUST_KEYLINE_BATCH) {
          const batch = new Path2D();
          const end = Math.min(count, first + STAR_DUST_KEYLINE_BATCH);
          for (let i = first; i < end; i += 1) {
            traceStar(batch, data, i * stride, ox, oy, k.waistRatio);
          }
          path.addPath(batch);
        }
      } else {
        ctx.beginPath();
        for (let i = 0; i < underCount; i += 1) {
          traceStar(ctx, under!.data, under!.indices[i]! * stride, ox, oy, k.waistRatio);
        }
        for (let i = 0; i < count; i += 1) {
          traceStar(ctx, data, i * stride, ox, oy, k.waistRatio);
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
      // Older first: the cached layer's sparkles under the head's, as in one full pass.
      for (let i = 0; i < underCount; i += 1) {
        const base = under!.indices[i]! * stride;
        ctx.globalAlpha = Math.max(0, Math.min(1, under!.data[base + 6]!));
        ctx.fillStyle = hexColor(under!.data[base + 5]!);
        ctx.beginPath();
        traceStar(ctx, under!.data, base, ox, oy, k.waistRatio);
        ctx.fill();
      }
      for (let i = 0; i < count; i += 1) {
        const base = i * stride;
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
