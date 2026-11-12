import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TRAIL_SPLIT_EPOCH_MAX_GAP_MS,
  TRAIL_SPLIT_EPOCH_MIN_GAP_MS,
  TRAIL_SPLIT_MAX_TAIL_TILES,
  TRAIL_SPLIT_MIN_COST_MS,
  TRAIL_SPLIT_TAIL_TILES,
  chooseTrailSplit,
  isTrailPrefixUnchanged,
  isTrailTailWithinBound,
  planTrailRedraw,
  resolveTrailSplitEpochGapMs,
  type TrailSplitState,
  type TrailSplitVertex
} from '../../src/render/trailTailSplit';
import type { TrailDrawRecord, TrailDrawStamp } from '../../src/render/trailRedrawGate';
import { drawTrailLayersToCanvasContext, type TrailLayerSegment } from '../../src/render/trailLayersCanvas';

const TILE = 14.7;
const STEP = 4; // the resample interval (px)
const CLEARANCE = 6;

/** A straight run along x of `length` px, resampled every STEP px (vertex i at distance i * STEP). */
const straight = (length: number, y = 0): TrailSplitVertex[] => {
  const out: TrailSplitVertex[] = [];
  for (let d = 0; d <= length; d += STEP) {
    out.push({ x: d, y, distance: d, newSubpath: d === 0 });
  }
  return out;
};

/** A zigzag that turns every `run` vertices: never straight for the clearance window. */
const zigzag = (count: number, run: number): TrailSplitVertex[] => {
  const out: TrailSplitVertex[] = [];
  let x = 0;
  let y = 0;
  let horizontal = true;
  for (let i = 0; i < count; i += 1) {
    if (i % run === 0 && i > 0) {
      horizontal = !horizontal;
    }
    if (horizontal) {
      x += STEP;
    } else {
      y += STEP;
    }
    out.push({ x, y, distance: i * STEP, newSubpath: i === 0 });
  }
  return out;
};

describe('where the trail is cut (MAZER-PERF-004)', () => {
  it('keeps the tail the same length however long the route is: the work of a head-only frame does not grow with the route', () => {
    const tails = [200, 1000, 5000, 20000].map((length) => {
      const vertices = straight(length);
      const cut = chooseTrailSplit(vertices, TILE, CLEARANCE);
      expect(cut, `route ${length}px`).not.toBeNull();
      return vertices.length - 1 - cut!.cutIndex;
    });
    // 6 tiles of 14.7 px at 4 px a vertex is about 22 vertices; a longer route must not change it.
    expect(new Set(tails.slice(1)).size).toBe(1);
    expect(tails[1]!).toBeLessThanOrEqual(Math.ceil((TRAIL_SPLIT_TAIL_TILES * TILE) / STEP) + 2);
    expect(tails[1]!).toBeGreaterThanOrEqual(Math.floor((TRAIL_SPLIT_TAIL_TILES * TILE) / STEP) - 1);
  });

  it('cuts at a vertex, with the unit direction of the path and a stable stretch ahead of it', () => {
    const vertices = straight(1000, 40);
    const cut = chooseTrailSplit(vertices, TILE, CLEARANCE)!;
    expect(cut.y).toBe(40);
    expect(cut.dx).toBe(1);
    expect(cut.dy).toBe(0);
    expect(cut.cutDistance).toBe(vertices[cut.cutIndex]!.distance);
    expect(vertices[cut.stableIndex]!.distance - cut.cutDistance).toBeGreaterThanOrEqual(CLEARANCE);
    expect(cut.stableIndex).toBeGreaterThan(cut.cutIndex);
  });

  it('gives up (a full rebuild, as before) on a short route, a route with no straight stretch, a wrap break and a vetoed cut', () => {
    expect(chooseTrailSplit(straight(40), TILE, CLEARANCE)).toBeNull();
    expect(chooseTrailSplit(zigzag(600, 3), TILE, CLEARANCE)).toBeNull();
    const wrapped = straight(1000);
    wrapped[wrapped.length - 3]!.newSubpath = true;
    expect(chooseTrailSplit(wrapped, TILE, CLEARANCE)).toBeNull();
    expect(chooseTrailSplit(straight(1000), TILE, CLEARANCE, () => false)).toBeNull();
  });

  it('searches back for a straight cut rather than cutting on a corner, and never past the search window', () => {
    const vertices = straight(1000);
    // Make the last 34 vertices (about 9 tiles) a staircase that turns every 3 vertices: no straight stretch there.
    const turn = vertices.length - 34;
    let x = vertices[turn]!.x;
    let y = 0;
    for (let i = turn; i < vertices.length; i += 1) {
      if (Math.floor((i - turn) / 3) % 2 === 0) {
        x += STEP;
      } else {
        y += STEP;
      }
      vertices[i] = { ...vertices[i]!, x, y };
    }
    const cut = chooseTrailSplit(vertices, TILE, CLEARANCE);
    expect(cut).not.toBeNull();
    expect(cut!.cutIndex).toBeLessThanOrEqual(vertices.length - 34);
  });

  it('only accepts a cut the caller accepts (the scene accepts chunk starts, so tail chunks equal the whole trail chunks)', () => {
    const vertices = straight(2000);
    const accepted: number[] = [];
    const cut = chooseTrailSplit(vertices, TILE, CLEARANCE, (index) => {
      accepted.push(index);
      return index % 7 === 0;
    });
    expect(cut!.cutIndex % 7).toBe(0);
    expect(accepted.length).toBeGreaterThan(0);
  });
});

describe('the older trail is unchanged (MAZER-PERF-004)', () => {
  const previous = straight(1000);

  it('is unchanged when the route grows at the head, which is what a step forward does', () => {
    const next = straight(1060);
    expect(isTrailPrefixUnchanged(previous, next, 200)).toBe(true);
  });

  it('is changed by a different vertex, a different distance, or a route that shrank to the cut', () => {
    const moved = straight(1060);
    moved[150] = { ...moved[150]!, y: 1 };
    expect(isTrailPrefixUnchanged(previous, moved, 200)).toBe(false);
    const stretched = straight(1060).map((v) => ({ ...v, distance: v.distance + 0.5 }));
    expect(isTrailPrefixUnchanged(previous, stretched, 200)).toBe(false);
    expect(isTrailPrefixUnchanged(previous, straight(800), 200)).toBe(false);
    expect(isTrailPrefixUnchanged(previous, straight(1060), 0)).toBe(false);
  });
});

const stamp = (overrides: Partial<TrailDrawStamp> = {}): TrailDrawStamp => ({
  routeRevision: 1,
  previousTileKey: '3,4',
  headX: 5,
  headY: 6,
  originX: 10,
  originY: 20,
  tileSize: TILE,
  alphaMultiplier: 1,
  styleKey: 'chip|1|1|0|1|1',
  ...overrides
});

const split: TrailSplitState = {
  cutIndex: 100,
  stableIndex: 102,
  cutDistance: 400,
  x: 400,
  y: 0,
  dx: 1,
  dy: 0,
  prefixVertices: []
};

describe('what each frame redraws (MAZER-PERF-004)', () => {
  /**
   * Drives the planner the way the scene does: one request per frame, the head moving every frame, each full rebuild costing
   * `fullCostMs` and each tail redraw `tailCostMs`. Counts what was drawn and the strokes (segments) it took.
   */
  const walk = (options: { frameMs: number; durationMs: number; fullCostMs: number; routeSegments: number; tailSegments: number; split: boolean }) => {
    let record: (TrailDrawRecord & { split?: TrailSplitState }) | null = null;
    let full = 0;
    let tail = 0;
    let strokes = 0;
    let head = 0;
    for (let time = 0; time <= options.durationMs; time += options.frameMs) {
      head += 1;
      const next = stamp({ headX: head, routeRevision: head });
      const mode = record === null ? 'full' : planTrailRedraw(record, next, time, true);
      if (mode === 'full') {
        full += 1;
        strokes += options.routeSegments + head; // a rebuild strokes the whole route
        record = { stamp: next, drawnAtMs: time, totalLength: 1, costMs: options.fullCostMs };
        if (options.split) {
          record.split = split;
        }
      } else if (mode === 'tail') {
        tail += 1;
        strokes += options.tailSegments;
        record!.stamp = next;
      }
    }
    return { full, tail, strokes };
  };

  it('without a split (a cheap route) every frame in which the head moved rebuilds the whole trail, exactly as before', () => {
    const result = walk({ frameMs: 16.7, durationMs: 5000, fullCostMs: 10, routeSegments: 1300, tailSegments: 60, split: false });
    expect(result.tail).toBe(0);
    expect(result.full).toBe(Math.floor(5000 / 16.7) + 1);
  });

  it('with a split, the head-only frames redraw the tail and the whole trail is rebuilt once per epoch', () => {
    const result = walk({ frameMs: 16.7, durationMs: 10000, fullCostMs: 150, routeSegments: 1300, tailSegments: 60, split: true });
    const epochMs = resolveTrailSplitEpochGapMs(150);
    expect(epochMs).toBe(450);
    expect(result.full).toBeLessThanOrEqual(Math.ceil(10000 / epochMs) + 1);
    expect(result.tail).toBeGreaterThan(result.full * 10);
    // The strokes drawn over the walk: a full rebuild every frame would draw ~600 frames x 1300; the split draws far fewer.
    const baseline = walk({ frameMs: 16.7, durationMs: 10000, fullCostMs: 150, routeSegments: 1300, tailSegments: 60, split: false });
    expect(result.strokes).toBeLessThan(baseline.strokes / 8);
  });

  it('the strokes of a tail frame do not depend on the route length, a full rebuild does', () => {
    const short = walk({ frameMs: 16.7, durationMs: 3000, fullCostMs: 150, routeSegments: 400, tailSegments: 60, split: true });
    const long = walk({ frameMs: 16.7, durationMs: 3000, fullCostMs: 150, routeSegments: 4000, tailSegments: 60, split: true });
    expect(long.tail).toBe(short.tail);
    expect(long.strokes - short.strokes).toBe((4000 - 400) * long.full);
  });

  it('rebuilds in full when anything but the head changed (origin, tile size, fade, zoom style), or the colour clock is due with the head still', () => {
    const record: TrailDrawRecord & { split?: TrailSplitState } = { stamp: stamp(), drawnAtMs: 0, totalLength: 1, costMs: 150, split };
    expect(planTrailRedraw(record, stamp({ headX: 6 }), 16, true)).toBe('tail');
    expect(planTrailRedraw(record, stamp({ headX: 6, originX: 11 }), 16, true)).toBe('full');
    expect(planTrailRedraw(record, stamp({ headX: 6, tileSize: 15 }), 16, true)).toBe('full');
    expect(planTrailRedraw(record, stamp({ headX: 6, alphaMultiplier: 0.5 }), 16, true)).toBe('full');
    expect(planTrailRedraw(record, stamp({ headX: 6, styleKey: 'other' }), 16, true)).toBe('full');
    // Head still, picture unchanged: kept while the ordinary gap has not passed, then the colour clock rebuilds in full.
    expect(planTrailRedraw(record, stamp(), 16, true)).toBe('keep');
    expect(planTrailRedraw(record, stamp(), 300, true)).toBe('full');
    // A record without a split never takes the tail path.
    expect(planTrailRedraw({ ...record, split: undefined }, stamp({ headX: 6 }), 16, true)).toBe('full');
    expect(planTrailRedraw(null, stamp(), 0, true)).toBe('full');
  });

  it('an epoch is due after its gap while the head moves, and never when the colour clock is off (the tail bound ends it)', () => {
    const record: TrailDrawRecord & { split?: TrailSplitState } = { stamp: stamp(), drawnAtMs: 0, totalLength: 1, costMs: 150, split };
    expect(planTrailRedraw(record, stamp({ headX: 6 }), 449, true)).toBe('tail');
    expect(planTrailRedraw(record, stamp({ headX: 6 }), 450, true)).toBe('full');
    expect(planTrailRedraw(record, stamp({ headX: 6 }), 60000, false)).toBe('tail');
    expect(planTrailRedraw(record, stamp({ headX: 6 }), -5, true)).toBe('full');
  });

  it('the tail stops being redrawn alone once it is longer than the bound', () => {
    expect(isTrailTailWithinBound(400 + (TRAIL_SPLIT_MAX_TAIL_TILES * TILE), split, TILE)).toBe(true);
    expect(isTrailTailWithinBound(400 + (TRAIL_SPLIT_MAX_TAIL_TILES * TILE) + 1, split, TILE)).toBe(false);
  });
});

describe('the split numbers (MAZER-PERF-004)', () => {
  it('pins the thresholds and bounds', () => {
    expect(TRAIL_SPLIT_MIN_COST_MS).toBe(40);
    expect(TRAIL_SPLIT_TAIL_TILES).toBe(6);
    expect(TRAIL_SPLIT_MAX_TAIL_TILES).toBe(24);
    expect(TRAIL_SPLIT_EPOCH_MIN_GAP_MS).toBe(250);
    expect(TRAIL_SPLIT_EPOCH_MAX_GAP_MS).toBe(1000);
  });

  it('stretches the epoch with the measured rebuild cost between 250 ms and 1 s', () => {
    expect(resolveTrailSplitEpochGapMs(null)).toBe(250);
    expect(resolveTrailSplitEpochGapMs(0)).toBe(250);
    expect(resolveTrailSplitEpochGapMs(Number.NaN)).toBe(250);
    expect(resolveTrailSplitEpochGapMs(50)).toBe(250);
    expect(resolveTrailSplitEpochGapMs(150)).toBe(450);
    expect(resolveTrailSplitEpochGapMs(400)).toBe(1000);
    expect(resolveTrailSplitEpochGapMs(5000)).toBe(1000);
  });
});

describe('the tail canvas leaves the older trail alone (MAZER-PERF-004)', () => {
  const segment = (x0: number, x1: number): TrailLayerSegment => ({
    previous: { x: x0, y: 10, distance: x0, newSubpath: false },
    current: { x: x1, y: 10, distance: x1, newSubpath: false },
    glowColor: 0x336699,
    coreColor: 0xffffff,
    alpha: 1
  });
  const options = {
    originX: 100,
    originY: 0,
    coreWidth: 4,
    glowWidth: 10,
    underlayWidth: 8,
    glowAlphaRatio: 0.3,
    glowBlurPx: 0,
    underlayColor: 0x000010,
    underlayAlpha: 0.9
  };
  const fakeContext = (scale: number) => {
    const calls: string[][] = [];
    const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args.map(String)]); };
    const ctx = {
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      closePath: record('closePath'),
      rect: record('rect'),
      clip: record('clip'),
      stroke: record('stroke'),
      getTransform: () => ({ a: scale }),
      canvas: { width: 0, height: 0 }
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };

  it('does not clip anything by default: unsplit trails draw exactly as before', () => {
    const { ctx, calls } = fakeContext(3);
    drawTrailLayersToCanvasContext(ctx, [segment(110, 120)], options);
    expect(calls.some((c) => c[0] === 'clip')).toBe(false);
  });

  it('clips even-odd around a box behind the cut, with the cut line on a device pixel boundary', () => {
    const { ctx, calls } = fakeContext(3);
    drawTrailLayersToCanvasContext(ctx, [segment(110, 120)], { ...options, excludeBehind: { x: 110.1, y: 10, dx: 1, dy: 0, halfWidth: 5, depth: 8 } });
    const clip = calls.findIndex((c) => c[0] === 'clip');
    expect(clip).toBeGreaterThan(-1);
    expect(calls[clip]).toEqual(['clip', 'evenodd']);
    // The cut at x = 110.1 - 100 = 10.1 css px is 30.3 device px: snapped to 30 / 3 = 10.
    const moves = calls.filter((c, i) => i < clip && c[0] === 'moveTo').map((c) => Number(c[1]));
    expect(moves).toContain(10);
    // The box goes back (against dx) by its depth: 10 - 8 = 2.
    const lines = calls.filter((c, i) => i < clip && c[0] === 'lineTo').map((c) => Number(c[1]));
    expect(lines).toContain(2);
    // The clip is set up before the first stroke, and removed at the end (save ... restore).
    expect(calls.findIndex((c) => c[0] === 'stroke')).toBeGreaterThan(clip);
    expect(calls[calls.length - 1]![0]).toBe('restore');
  });
});

describe('scene wiring (MAZER-PERF-004)', () => {
  const source = readFileSync(new URL('../../src/scenes/MenuScene.ts', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

  it('plans each trail request through planTrailRedraw and confirms a tail redraw against the unchanged prefix and the tail bound', () => {
    expect(source).toContain("from '../render/trailTailSplit'");
    expect(source).toContain('planTrailRedraw(this.trailDrawRecord, gateStamp, time, gateMotionPlan.colourDrifts)');
    expect(source).toContain('isTrailPrefixUnchanged(splitState.prefixVertices, vertices, splitState.stableIndex)');
    expect(source).toContain('isTrailTailWithinBound(geometry.totalLength, splitState, tileSize)');
  });

  it('splits only an expensive trail, not with Trail Fade on, only in the Chip style, and only at a chunk start', () => {
    expect(source).toContain('!trailFadeEnabled && this.boardTileStyle ===');
    expect(source).toContain('>= TRAIL_SPLIT_MIN_COST_MS');
    expect(source).toContain('chunkStarts.has(vertices[cutIndex]!)');
  });

  it('draws the tail on its own canvas over the main one, hides it with the main one, and removes its texture on shutdown', () => {
    expect(source).toContain('this.trailTailCanvasImage');
    expect(source).toMatch(/this\.trailCanvasImage,\n\s+this\.trailTailCanvasImage,/);
    expect(source).toContain('this.textures.remove(this.trailTailCanvasTextureKey)');
    expect((source.match(/this\.trailTailCanvasImage\?\.setVisible\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('a tail redraw reuses the epoch clock, shine and widths instead of the live clock', () => {
    expect(source).toContain('colourTimeMs: epoch.colourTimeMs');
    expect(source).toContain('shineState: epoch.shineState');
    expect(source).toContain('epoch.coreWidth, epoch.glowWidth, epoch.underlayWidth, epoch.glowAlphaScale');
  });
});
