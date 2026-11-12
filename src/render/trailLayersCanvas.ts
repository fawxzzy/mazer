/**
 * Chip-floor layering of the Navigation Core trail on a real 2D canvas: neon bloom (outermost, soft), dark
 * underlay (near-opaque bg.canvas, wider than the core), crisp core. Same path, same colours and chunking as
 * `drawTrailToCanvasContext` (src/render/navigationCoreTrailCanvas.ts, whose `chunkTrailSegments` and segment
 * type this reuses unchanged); it only controls the ORDER, which the single-call compositor fixes as glow then
 * core: with the underlay wider than the glow stroke, an underlay drawn between them is not possible there.
 *
 * Bloom first means the underlay always sits on top of it, so the bloom shows only outside the underlay (a soft
 * halo on the chips beside the trail) and never washes the dark ground the core's contrast depends on.
 */
import { chunkTrailSegments, type TrailCanvasSegment } from './navigationCoreTrailCanvas';

export interface TrailLayerSegment extends TrailCanvasSegment {
  /** Alpha for the underlay, independent of `alpha` (the age fade). Falls back to `alpha`. */
  underlayAlpha?: number;
}

export interface TrailLayersOptions {
  originX: number;
  originY: number;
  coreWidth: number;
  glowWidth: number;
  /** Underlay stroke width (core plus its pad each side). */
  underlayWidth: number;
  glowAlphaRatio: number;
  /** shadowBlur in DEVICE px (the canvas ignores the transform for it), 0 for a plain soft stroke. */
  glowBlurPx: number;
  /** bg.canvas, and the alpha it is laid down at. */
  underlayColor: number;
  underlayAlpha: number;
  /**
   * Leave a small box untouched: it lies BEHIND the point (x, y), square to the unit direction (dx, dy), `halfWidth` to
   * each side and `depth` back (board coordinates, same space as the segments). Used by the head-only tail redraw
   * (src/render/trailTailSplit.ts): the tail starts at a straight cut, and its first segment would otherwise paint its
   * round caps (the dark underlay in particular) and its bloom over the end of the older trail drawn on another canvas.
   * The box is only as wide as that older stretch, so a later part of the tail that curls back alongside it is unaffected.
   */
  /**
   * Scale the bloom's scratch canvas back up by exactly its downscale factor instead of stretching it to the target's size.
   * The stretch differs a little (up to half a scratch pixel across the canvas) with the canvas size, so two canvases that
   * must agree pixel for pixel (the split trail's prefix and tail) set this. Off by default: unsplit trails are unchanged.
   */
  bloomExactScale?: boolean;
  excludeBehind?: { x: number; y: number; dx: number; dy: number; halfWidth: number; depth: number };
}

const rgba = (color: number, alpha: number): string => (
  `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${Math.max(0, Math.min(1, alpha))})`
);

/** Largest bloom downscale: the blur radius is divided by it, so the halo stays soft but never blocky. */
const MAX_BLOOM_DOWNSCALE = 4;
/** One blur radius (device px) per downscale step: about 3 px of blur survives each step. */
const BLOOM_BLUR_PX_PER_STEP = 3;

type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;
type ScratchContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let bloomScratch: { canvas: ScratchCanvas; ctx: ScratchContext } | null = null;

/** The bloom's downscale factor for a blur radius in device px (1 means: blur in place, no scratch canvas). */
export const resolveBloomDownscale = (glowBlurPx: number): number => (
  Math.max(1, Math.min(MAX_BLOOM_DOWNSCALE, Math.round(glowBlurPx / BLOOM_BLUR_PX_PER_STEP)))
);

const acquireBloomScratch = (width: number, height: number): { canvas: ScratchCanvas; ctx: ScratchContext } | null => {
  try {
    if (!bloomScratch) {
      if (typeof document === 'undefined') {
        return null;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      bloomScratch = { canvas, ctx };
    }
    if (bloomScratch.canvas.width !== width || bloomScratch.canvas.height !== height) {
      bloomScratch.canvas.width = width;
      bloomScratch.canvas.height = height;
    }
    return bloomScratch;
  } catch {
    return null;
  }
};

const strokeChunk = (
  ctx: CanvasRenderingContext2D,
  chunk: readonly TrailCanvasSegment[],
  width: number,
  style: string,
  originX: number,
  originY: number
): void => {
  const first = chunk[0]!;
  ctx.beginPath();
  ctx.moveTo(first.previous.x - originX, first.previous.y - originY);
  for (const segment of chunk) {
    ctx.lineTo(segment.current.x - originX, segment.current.y - originY);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
};

/**
 * The bloom on a 1/f scratch canvas, scaled back up onto `ctx` (see the COST note in the file header). Returns false,
 * having drawn nothing, when it cannot (no DOM or canvas size, or a blur too small to be worth it).
 */
const drawBloomDownscaled = (
  ctx: CanvasRenderingContext2D,
  chunks: readonly (readonly TrailCanvasSegment[])[],
  options: TrailLayersOptions
): boolean => {
  const factor = options.glowBlurPx > 0 ? resolveBloomDownscale(options.glowBlurPx) : 1;
  const target = ctx.canvas as { width?: number; height?: number } | undefined;
  if (factor < 2 || !target || !(target.width! > 0) || !(target.height! > 0) || typeof ctx.getTransform !== 'function') {
    return false;
  }
  const scratch = acquireBloomScratch(Math.ceil(target.width! / factor), Math.ceil(target.height! / factor));
  if (!scratch) {
    return false;
  }
  const scale = ctx.getTransform().a / factor;
  const sctx = scratch.ctx;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
  sctx.setTransform(scale, 0, 0, scale, 0, 0);
  sctx.lineJoin = 'round';
  sctx.lineCap = 'round';
  sctx.shadowBlur = options.glowBlurPx / factor;
  for (const chunk of chunks) {
    const first = chunk[0]!;
    const style = rgba(first.glowColor, first.alpha * options.glowAlphaRatio);
    sctx.shadowColor = style;
    strokeChunk(sctx as CanvasRenderingContext2D, chunk, options.glowWidth, style, options.originX, options.originY);
  }
  sctx.shadowBlur = 0;
  sctx.shadowColor = 'transparent';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    scratch.canvas as CanvasImageSource,
    0,
    0,
    scratch.canvas.width,
    scratch.canvas.height,
    0,
    0,
    options.bloomExactScale ? scratch.canvas.width * factor : target.width!,
    options.bloomExactScale ? scratch.canvas.height * factor : target.height!
  );
  ctx.restore();
  return true;
};

export const drawTrailLayersToCanvasContext = (
  ctx: CanvasRenderingContext2D,
  segments: readonly TrailLayerSegment[],
  options: TrailLayersOptions
): void => {
  if (segments.length === 0) {
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (options.excludeBehind) {
    const { x, y, dx, dy, halfWidth, depth } = options.excludeBehind;
    const reach = 8192;
    let px = x - options.originX;
    let py = y - options.originY;
    // The trail runs along the board grid, so at a straight cut the line is square to an axis: put it on a device pixel
    // boundary, so no edge pixel is half covered (a half covered dark underlay over the older core is a visible hairline).
    const scale = typeof ctx.getTransform === 'function' ? ctx.getTransform().a : 1;
    if (scale > 0 && Math.abs(dx) > 0.999) {
      px = Math.round(px * scale) / scale;
    } else if (scale > 0 && Math.abs(dy) > 0.999) {
      py = Math.round(py * scale) / scale;
    }
    // Square to (dx, dy) is (-dy, dx). An even-odd clip of a huge rectangle with the box cut out of it.
    ctx.beginPath();
    ctx.rect(px - reach, py - reach, 2 * reach, 2 * reach);
    ctx.moveTo(px - (dy * halfWidth), py + (dx * halfWidth));
    ctx.lineTo(px + (dy * halfWidth), py - (dx * halfWidth));
    ctx.lineTo(px + (dy * halfWidth) - (dx * depth), py - (dx * halfWidth) - (dy * depth));
    ctx.lineTo(px - (dy * halfWidth) - (dx * depth), py + (dx * halfWidth) - (dy * depth));
    ctx.closePath();
    ctx.clip('evenodd');
  }

  // 1. Bloom: blurred glow in each segment's own base colour.
  const chunks = chunkTrailSegments(segments);
  if (!drawBloomDownscaled(ctx, chunks, options)) {
    if (options.glowBlurPx > 0) {
      ctx.shadowBlur = options.glowBlurPx;
    }
    for (const chunk of chunks) {
      const first = chunk[0]!;
      const style = rgba(first.glowColor, first.alpha * options.glowAlphaRatio);
      if (options.glowBlurPx > 0) {
        ctx.shadowColor = style;
      }
      strokeChunk(ctx, chunk, options.glowWidth, style, options.originX, options.originY);
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // 2. Dark underlay: one colour, so it chunks into few strokes.
  const underlaySegments = segments.map((segment) => ({
    ...segment,
    glowColor: options.underlayColor,
    coreColor: options.underlayColor,
    alpha: (segment.underlayAlpha ?? segment.alpha) * options.underlayAlpha
  }));
  for (const chunk of chunkTrailSegments(underlaySegments)) {
    strokeChunk(ctx, chunk, options.underlayWidth, rgba(options.underlayColor, chunk[0]!.alpha), options.originX, options.originY);
  }

  // 3. Crisp core on top.
  for (const chunk of chunks) {
    const first = chunk[0]!;
    strokeChunk(ctx, chunk, options.coreWidth, rgba(first.coreColor, first.alpha), options.originX, options.originY);
  }
  ctx.restore();
};
