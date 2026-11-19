import { describe, expect, test } from 'vitest';
import {
  TRAIL_BLOOM_CLIP_CELL_PX,
  resolveTrailBloomClip,
  resolveTrailBloomReachPx,
  type TrailBloomClipInput,
  type TrailBloomClipSegment
} from '../../src/render/trailBloomClip';
import { drawTrailBloomChunks } from '../../src/render/trailLayersCanvas';

/**
 * MAZER-PERF-015: the trail bloom's upscale used to repaint the whole trail canvas (the route's bounding box at device
 * resolution) on every rebuild, so its cost grew with the trail. These tests pin the fix: the clip covers every pixel
 * the bloom can reach (so the picture cannot change) and its area follows the route, not the route's bounding box.
 */

const TILE = 14.7;
const RES = 3;

const input = (overrides: Partial<TrailBloomClipInput> = {}): TrailBloomClipInput => ({
  width: 1044,
  height: 2109,
  scale: RES,
  originX: 0,
  originY: 0,
  glowWidth: TILE * 0.5,
  glowBlurPx: 9,
  factor: 3,
  ...overrides
});

/** A route through tile centres, one segment per step. */
const path = (tiles: readonly [number, number][]): TrailBloomClipSegment[] => {
  const centre = ([x, y]: [number, number]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
  const segments: TrailBloomClipSegment[] = [];
  for (let i = 1; i < tiles.length; i += 1) {
    segments.push({ previous: centre(tiles[i - 1]!), current: centre(tiles[i]!) });
  }
  return segments;
};

/** A serpentine across a cols x rows tile box: long horizontal runs joined by short drops, corridors `gap` tiles apart. */
const serpentine = (cols: number, rows: number, gap: number): [number, number][] => {
  const tiles: [number, number][] = [];
  for (let y = 0, dir = 1; y < rows; y += gap, dir = -dir) {
    for (let i = 0; i < cols; i += 1) {
      tiles.push([dir > 0 ? i : cols - 1 - i, y]);
    }
    for (let d = 1; d < gap && y + d < rows; d += 1) {
      tiles.push([dir > 0 ? cols - 1 : 0, y + d]);
    }
  }
  return tiles;
};

const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = (dx * dx) + (dy * dy);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / len2));
  return Math.hypot(px - (ax + (t * dx)), py - (ay + (t * dy)));
};

const coveredMask = (rects: readonly number[], width: number, height: number): Uint8Array => {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < rects.length; i += 4) {
    const [x, y, w, h] = rects.slice(i, i + 4) as [number, number, number, number];
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        mask[(yy * width) + xx] += 1;
      }
    }
  }
  return mask;
};

describe('trail bloom clip', () => {
  test('rectangles are whole device pixels, inside the canvas and never overlap; area adds up', () => {
    const opts = input({ width: 600, height: 900 });
    const clip = resolveTrailBloomClip([path(serpentine(12, 18, 4))], opts);
    expect(clip).not.toBeNull();
    const { rects, area } = clip!;
    expect(rects.length % 4).toBe(0);
    let sum = 0;
    for (let i = 0; i < rects.length; i += 4) {
      const [x, y, w, h] = rects.slice(i, i + 4) as [number, number, number, number];
      for (const v of [x, y, w, h]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(opts.width);
      expect(y + h).toBeLessThanOrEqual(opts.height);
      sum += w * h;
    }
    expect(sum).toBe(area);
    const mask = coveredMask(rects, opts.width, opts.height);
    expect(mask.every((v) => v <= 1)).toBe(true);
  });

  test('covers every device pixel within the bloom reach of every segment (the picture cannot change)', () => {
    const opts = input({ width: 620, height: 940, originX: 3.3, originY: -1.7 });
    const segments = path([...serpentine(13, 20, 5), [7, 19], [7, 18]]);
    // a mid-glide head: the newest segment can end between tile centres
    segments.push({ previous: segments[segments.length - 1]!.current, current: { x: 7.5 * TILE, y: 17.1 * TILE } });
    const clip = resolveTrailBloomClip([segments.slice(0, 40), segments.slice(40)], opts)!;
    const mask = coveredMask(clip.rects, opts.width, opts.height);
    const reach = resolveTrailBloomReachPx(opts);
    const device = segments.map((s) => [
      (s.previous.x - opts.originX) * RES, (s.previous.y - opts.originY) * RES,
      (s.current.x - opts.originX) * RES, (s.current.y - opts.originY) * RES
    ] as const);
    let missed = 0;
    let checked = 0;
    for (const [ax, ay, bx, by] of device) {
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach - 2));
      const x1 = Math.min(opts.width - 1, Math.ceil(Math.max(ax, bx) + reach + 2));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach - 2));
      const y1 = Math.min(opts.height - 1, Math.ceil(Math.max(ay, by) + reach + 2));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) > reach) continue;
          checked += 1;
          if (!mask[(y * opts.width) + x]) missed += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
    expect(missed).toBe(0);
  });

  test('reach is at least the stroke half width plus 3 sigma of the blur plus the smoothing support', () => {
    const opts = input();
    const sigma = opts.glowBlurPx / 2;
    expect(resolveTrailBloomReachPx(opts)).toBeGreaterThanOrEqual(
      (opts.glowWidth * opts.scale * 0.5) + (3 * sigma) + (2 * opts.factor)
    );
  });

  test('bounded work: on a long route the clip follows the route, not its bounding box', () => {
    // a phone-sized trail canvas (25 x 51 tiles at 3x) filled by a serpentine with corridors 6 tiles apart
    const width = Math.ceil(25 * TILE * RES);
    const height = Math.ceil(51 * TILE * RES);
    const opts = input({ width, height });
    const tiles = serpentine(25, 51, 6);
    const clip = resolveTrailBloomClip([path(tiles)], opts)!;
    expect(clip).not.toBeNull();
    expect(clip.area / clip.canvasArea).toBeLessThan(0.5);
    // per tile of route the clip adds about one band of fixed height: it scales with length, capped by the band width
    const band = 2 * (resolveTrailBloomReachPx(opts) + TRAIL_BLOOM_CLIP_CELL_PX);
    expect(clip.area).toBeLessThanOrEqual(tiles.length * TILE * RES * band);
    // the rectangle count stays small enough for one canvas clip path
    expect(clip.rects.length / 4).toBeLessThan(200);
  });

  test('a short trail on a big canvas clips to a small fraction of it', () => {
    const clip = resolveTrailBloomClip([path([[2, 2], [3, 2], [4, 2], [4, 3]])], input())!;
    expect(clip.area / clip.canvasArea).toBeLessThan(0.02);
  });

  test('a vertical corridor is one tall rectangle, not one per cell row', () => {
    const tiles: [number, number][] = Array.from({ length: 30 }, (_, i) => [5, i] as [number, number]);
    const clip = resolveTrailBloomClip([path(tiles)], input())!;
    expect(clip.rects.length / 4).toBe(1);
  });

  test('null (draw unclipped, as before) when it would save nothing or the input is unusable', () => {
    const tiny = input({ width: 40, height: 40 });
    expect(resolveTrailBloomClip([path([[0, 0], [1, 0]])], tiny)).toBeNull();
    expect(resolveTrailBloomClip([], input())).toBeNull();
    expect(resolveTrailBloomClip([path([[1, 1], [2, 1]])], input({ width: 0 }))).toBeNull();
    expect(resolveTrailBloomClip([path([[1, 1], [2, 1]])], input({ scale: 0 }))).toBeNull();
    expect(resolveTrailBloomClip([[{ previous: { x: Number.NaN, y: 0 }, current: { x: 1, y: 1 } }]], input())).toBeNull();
    // entirely off canvas
    expect(resolveTrailBloomClip([path([[1, 1], [2, 1]])], input({ originX: 10_000 }))).toBeNull();
  });
});

describe('drawTrailBloomChunks uses the clip', () => {
  /** A recording 2D context; enough of the API for the bloom path. */
  const recorder = (width: number, height: number) => {
    const calls: string[] = [];
    let rects = 0;
    const ctx = {
      canvas: { width, height },
      getTransform: () => ({ a: RES }),
      setTransform: () => undefined,
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => calls.push('stroke'),
      rect: () => { rects += 1; },
      clip: () => calls.push('clip'),
      drawImage: () => calls.push('drawImage'),
      clearRect: () => undefined
    };
    return { ctx, calls, rectCount: () => rects };
  };

  test('one clipped upscale of the scratch, whatever the trail length', () => {
    const fakeScratch = recorder(1, 1).ctx;
    const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeScratch }) };
    const g = globalThis as { document?: unknown };
    const previous = g.document;
    g.document = doc;
    try {
      for (const tiles of [serpentine(6, 6, 3), serpentine(25, 51, 6)]) {
        const { ctx, calls, rectCount } = recorder(Math.ceil(25 * TILE * RES), Math.ceil(51 * TILE * RES));
        const segments = path(tiles).map((s) => ({ ...s, glowColor: 0x336699, coreColor: 0x88ccff, alpha: 1 }));
        drawTrailBloomChunks(ctx as unknown as CanvasRenderingContext2D, [segments], {
          originX: 0,
          originY: 0,
          glowWidth: TILE * 0.5,
          glowAlphaRatio: 0.5,
          glowBlurPx: 9
        });
        expect(calls.filter((c) => c === 'drawImage')).toHaveLength(1);
        expect(calls.indexOf('clip')).toBeGreaterThan(-1);
        expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('drawImage'));
        expect(rectCount()).toBeGreaterThan(0);
        // the strokes went to the scratch, not the target
        expect(calls.filter((c) => c === 'stroke')).toHaveLength(0);
      }
    } finally {
      g.document = previous;
    }
  });
});
