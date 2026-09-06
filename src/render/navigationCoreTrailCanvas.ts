/**
 * Canvas-2D compositor for Navigation Core v1's continuous play trail.
 *
 * The game runs with `type: Phaser.CANVAS` (src/boot/phaserConfig.ts) --
 * Phaser's postFX/preFX blur pipeline is WebGL-only, so it is never an
 * option here regardless of how the effect is wired up. A raw
 * CanvasRenderingContext2D, by contrast, is exactly what Phaser's own
 * CanvasRenderer draws through, and it has two native capabilities this
 * module leans on that a `Phaser.GameObjects.Graphics` stroke does not
 * expose control over:
 *
 * - `lineJoin`/`lineCap` = 'round', applied to a single continuous
 *   multi-point path (one beginPath, many lineTo, one stroke). A real
 *   round join is drawn once, at the vertex, by the browser's own path
 *   rasterizer -- not as a series of independently-capped short segments
 *   whose caps can fan out at a bend or bead up along a straight run.
 * - `shadowBlur`/`shadowColor`, which gives an actual blurred halo around
 *   whatever is stroked, entirely separate from the crisp stroke itself.
 *   This is what makes the glow a soft halo instead of another wide,
 *   sharply-bounded translucent stroke sitting on top of the core.
 *
 * Segments still need per-position color (the frozen contract's spectral
 * gradient), so the path is still split into "chunks" of visually similar
 * color/alpha and stroked chunk-by-chunk -- but each chunk is ONE
 * continuous path (not one stroke call per ~4px resampled segment), so
 * bends and straight runs within a chunk get real joins, and the shadow
 * blur softens whatever seam remains at a chunk boundary instead of
 * leaving a hard edge.
 */

export interface TrailCanvasSegment {
  previous: { x: number; y: number };
  current: { x: number; y: number };
  /** 24-bit RGB, e.g. 0xff8800 -- the glow's own color. Stays the plain spectral base color even where the core is shine-highlighted, matching the reference's glow (an echo of the underlying hue, not a bright flash). */
  glowColor: number;
  /** 24-bit RGB -- the crisp core's color, with the shine highlight already blended in by the caller where applicable. */
  coreColor: number;
  alpha: number;
}

export interface TrailCanvasDrawOptions {
  /** Subtracted from every point's x/y before drawing -- the canvas's own local origin, in the same coordinate space the segments are given in. */
  originX: number;
  originY: number;
  coreWidth: number;
  glowWidth: number;
  /** Multiplies each segment's own alpha for the glow pass (the glow is meant to sit well under the core's own brightness). */
  glowAlphaRatio: number;
  /** CanvasRenderingContext2D shadowBlur radius, in px, for the glow pass only -- 0 disables the blur (falls back to a plain soft stroke). */
  glowBlurPx: number;
}

const colorToRgba = (color: number, alpha: number): string => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const TRAIL_STROKE_CHUNK_COLOR_TOLERANCE = 4;
const TRAIL_STROKE_CHUNK_ALPHA_TOLERANCE = 0.02;

const colorChannelsClose = (a: number, b: number, tolerance: number): boolean => {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return Math.abs(ar - br) <= tolerance && Math.abs(ag - bg) <= tolerance && Math.abs(ab - bb) <= tolerance;
};

/**
 * Groups consecutive segments into runs of visually-indistinguishable
 * color/alpha, stopping a run wherever the segments are non-adjacent in
 * space (a subpath break -- e.g. a wraparound crossing -- must never be
 * bridged by a stray line just because the colors either side happen to be
 * close) or wherever color/alpha drifts past the tolerance. Exported
 * separately from the draw function so the grouping logic itself is
 * directly unit-testable without a real canvas.
 */
export const chunkTrailSegments = (
  segments: readonly TrailCanvasSegment[]
): TrailCanvasSegment[][] => {
  const chunks: TrailCanvasSegment[][] = [];
  let i = 0;
  while (i < segments.length) {
    const chunkStart = segments[i]!;
    const chunk = [chunkStart];
    let j = i;
    while (
      j + 1 < segments.length
      && segments[j]!.current.x === segments[j + 1]!.previous.x
      && segments[j]!.current.y === segments[j + 1]!.previous.y
      && colorChannelsClose(segments[j + 1]!.glowColor, chunkStart.glowColor, TRAIL_STROKE_CHUNK_COLOR_TOLERANCE)
      && colorChannelsClose(segments[j + 1]!.coreColor, chunkStart.coreColor, TRAIL_STROKE_CHUNK_COLOR_TOLERANCE)
      && Math.abs(segments[j + 1]!.alpha - chunkStart.alpha) <= TRAIL_STROKE_CHUNK_ALPHA_TOLERANCE
    ) {
      j += 1;
      chunk.push(segments[j]!);
    }
    chunks.push(chunk);
    i = j + 1;
  }
  return chunks;
};

const strokeChunk = (
  ctx: CanvasRenderingContext2D,
  chunk: readonly TrailCanvasSegment[],
  width: number,
  strokeStyle: string,
  originX: number,
  originY: number
): void => {
  const first = chunk[0]!;
  ctx.beginPath();
  ctx.moveTo(first.previous.x - originX, first.previous.y - originY);
  for (const segment of chunk) {
    ctx.lineTo(segment.current.x - originX, segment.current.y - originY);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.stroke();
};

/**
 * Draws the trail's glow (soft, blurred, subordinate, using each segment's
 * own glowColor) then its crisp core (coreColor, with the shine highlight
 * already blended in by the caller where applicable) into the given 2D
 * context. Caller is responsible for clearing the canvas first and for
 * translating/scaling the destination image afterward -- this function
 * only ever draws relative to options.originX/originY.
 */
export const drawTrailToCanvasContext = (
  ctx: CanvasRenderingContext2D,
  segments: readonly TrailCanvasSegment[],
  options: TrailCanvasDrawOptions
): void => {
  if (segments.length === 0) {
    return;
  }
  const chunks = chunkTrailSegments(segments);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Pass 1: soft glow. shadowBlur/shadowColor give a real blurred halo
  // around each chunk's stroke -- the actual "soft light" the frozen
  // reference shows, not a second wide hard-edged stroke.
  if (options.glowBlurPx > 0) {
    ctx.shadowBlur = options.glowBlurPx;
  }
  for (const chunk of chunks) {
    const first = chunk[0]!;
    const glowStrokeStyle = colorToRgba(first.glowColor, first.alpha * options.glowAlphaRatio);
    if (options.glowBlurPx > 0) {
      ctx.shadowColor = glowStrokeStyle;
    }
    strokeChunk(ctx, chunk, options.glowWidth, glowStrokeStyle, options.originX, options.originY);
  }

  // Pass 2: crisp core, no shadow, entirely on top of every glow stroke
  // from pass 1 (two full passes, not interleaved per-chunk, for the same
  // reason as the glow/core draw-order fix this replaces). Each chunk still
  // gets its own stroke call (coreColor varies per chunk), but within a
  // chunk it's one continuous multi-point path.
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  for (const chunk of chunks) {
    const first = chunk[0]!;
    strokeChunk(
      ctx,
      chunk,
      options.coreWidth,
      colorToRgba(first.coreColor, first.alpha),
      options.originX,
      options.originY
    );
  }

  ctx.restore();
};

export interface TrailCanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space bounding box every segment's stroke (including its glow
 * radius) needs, expanded by `padding` on every side -- what the caller
 * should size/position the backing canvas to, so the glow is never clipped
 * at the canvas edge and the canvas itself stays no bigger than this one
 * trail actually needs (not a full-board canvas).
 */
export const computeTrailCanvasBounds = (
  segments: readonly TrailCanvasSegment[],
  padding: number
): TrailCanvasBounds | null => {
  if (segments.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of segments) {
    minX = Math.min(minX, segment.previous.x, segment.current.x);
    minY = Math.min(minY, segment.previous.y, segment.current.y);
    maxX = Math.max(maxX, segment.previous.x, segment.current.x);
    maxY = Math.max(maxY, segment.previous.y, segment.current.y);
  }
  return {
    left: minX - padding,
    top: minY - padding,
    width: (maxX - minX) + (padding * 2),
    height: (maxY - minY) + (padding * 2)
  };
};
