/**
 * Where the trail bloom can have any pixels (MAZER-PERF-015), so its upscale only paints there.
 *
 * Measured cause of "the trail gets laggy as it grows": the bloom (trailLayersCanvas.ts) is drawn on a 1/f scratch canvas
 * and scaled back up over the WHOLE trail canvas with high-quality smoothing on every trail rebuild. The trail canvas is
 * the route's bounding box at device resolution, so on a long route it is the whole board (about 1040 x 2150 px at 3x),
 * and that one upscale was most of the frame: at a 4x CPU throttle, 390x844 at 3x, a 184-tile route spent about 230 of
 * 280 ms per rebuild in the bloom, against about 45 ms with the bloom off. Star dust and the neon tube share this bloom.
 * Only about a fifth of those pixels are ever lit: the route is a thin line snaking across its box.
 *
 * The fix keeps the picture: the upscale still draws the same image with the same transform and smoothing, under a clip
 * made of whole-device-pixel rectangles that cover every pixel the bloom can reach (stroke half width, the blur's reach,
 * the smoothing filter's support, plus a margin). Every pixel outside them is zero in the unclipped upscale too, so the
 * result is identical pixel for pixel, and the canvas skips the empty ones. Pure: no DOM; tested in
 * tests/render/trail-bloom-clip.test.ts.
 */

/** Clip cell edge, device px: small enough to hug a thin route, large enough to keep the rectangle count low. */
export const TRAIL_BLOOM_CLIP_CELL_PX = 16;

export interface TrailBloomClipSegment {
  previous: { x: number; y: number };
  current: { x: number; y: number };
}

export interface TrailBloomClipInput {
  /** Target canvas size, device px. */
  width: number;
  height: number;
  /** Device px per logical px on the target (the trail canvas transform's scale). */
  scale: number;
  /** Logical origin subtracted from every vertex (the trail canvas's top-left). */
  originX: number;
  originY: number;
  /** Bloom stroke width, logical px. */
  glowWidth: number;
  /** shadowBlur in target device px (before the downscale divides it). */
  glowBlurPx: number;
  /** The bloom's downscale factor (resolveBloomDownscale). */
  factor: number;
}

/**
 * How far (device px) from a segment the upscaled bloom can still be non-zero: the stroke's half width, the blur's reach
 * (the canvas blurs with sigma = shadowBlur / 2 and its kernel stops at 3 sigma = 1.5 x shadowBlur, rounded up to a whole
 * scratch px), the smoothing filter's support (2 scratch px each side), one scratch px for the stroke's antialiased edge,
 * a scratch px being `factor` device px, and 4 device px of margin. The cells round it further outward. Same-frame A/B
 * pixel compares in headless Chromium (390x844 at 3x, 412x915 at 2.625x, star dust and neon tube) found zero differences.
 */
export const resolveTrailBloomReachPx = (input: Pick<TrailBloomClipInput, 'scale' | 'glowWidth' | 'glowBlurPx' | 'factor'>): number => (
  (Math.max(0, input.glowWidth) * Math.max(0, input.scale) * 0.5)
  + (1.5 * Math.max(0, input.glowBlurPx))
  + (4 * Math.max(1, input.factor))
  + 4
);

export interface TrailBloomClip {
  /** Rectangles x, y, w, h (device px, whole numbers, non-overlapping), flattened. */
  rects: number[];
  /** Pixels the rectangles cover, and the canvas's pixel count (diagnostics and the tests' bounded-work check). */
  area: number;
  canvasArea: number;
}

/**
 * The clip for one bloom upscale: the cells within reach of any segment, merged into one rectangle per horizontal run
 * (runs with the same span in consecutive rows become one taller rectangle). The bloom stroke uses the same transform
 * as the target minus any translation (drawBloomDownscaled sets scale only), which is why only `scale` is taken here.
 * Returns null when the clip would not save anything (it covers the whole canvas) or the input is degenerate; the caller
 * then upscales unclipped, as before.
 */
export const resolveTrailBloomClip = (
  chunks: readonly (readonly TrailBloomClipSegment[])[],
  input: TrailBloomClipInput
): TrailBloomClip | null => {
  const width = Math.floor(input.width);
  const height = Math.floor(input.height);
  if (!(width > 0) || !(height > 0) || !(input.scale > 0)) {
    return null;
  }
  const cell = TRAIL_BLOOM_CLIP_CELL_PX;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const marked = new Uint8Array(cols * rows);
  const reach = resolveTrailBloomReachPx(input);
  const s = input.scale;
  const ox = input.originX;
  const oy = input.originY;
  let any = false;
  for (const chunk of chunks) {
    for (const segment of chunk) {
      const ax = (segment.previous.x - ox) * s;
      const ay = (segment.previous.y - oy) * s;
      const bx = (segment.current.x - ox) * s;
      const by = (segment.current.y - oy) * s;
      if (!Number.isFinite(ax + ay + bx + by)) {
        return null;
      }
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / cell));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + reach) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - reach) / cell));
      const r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + reach) / cell));
      for (let r = r0; r <= r1; r += 1) {
        const row = r * cols;
        for (let c = c0; c <= c1; c += 1) {
          marked[row + c] = 1;
        }
      }
      any = any || (c0 <= c1 && r0 <= r1);
    }
  }
  if (!any) {
    return null;
  }
  // One rectangle per horizontal run of marked cells; a run with the same span as one directly above extends it downward
  // instead (fewer rectangles for the canvas to clip with: a vertical corridor is one tall rectangle, not one per row).
  const rects: number[] = [];
  let area = 0;
  let open = new Map<number, number>();
  for (let r = 0; r < rows; r += 1) {
    const y = r * cell;
    const h = Math.min(cell, height - y);
    const next = new Map<number, number>();
    let c = 0;
    while (c < cols) {
      if (marked[(r * cols) + c] === 0) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cols && marked[(r * cols) + c] === 1) {
        c += 1;
      }
      const x = start * cell;
      const w = Math.min(c * cell, width) - x;
      const spanKey = (start * (cols + 1)) + c;
      const above = open.get(spanKey);
      if (above !== undefined) {
        rects[above + 3] = rects[above + 3]! + h;
        next.set(spanKey, above);
      } else {
        next.set(spanKey, rects.length);
        rects.push(x, y, w, h);
      }
      area += w * h;
    }
    open = next;
  }
  const canvasArea = width * height;
  if (area >= canvasArea) {
    return null;
  }
  return { rects, area, canvasArea };
};
