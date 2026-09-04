import { describe, expect, it } from 'vitest';
import type { LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import {
  advanceTrailShineState,
  buildContinuousTrailPath,
  collapseCollinearPoints,
  projectGridPointToPixel,
  resampleTrailVertices,
  roundPolylineCorners,
  sampleTrailEnergyColor,
  splitGridPathAtDiscontinuities,
  trimPolylineEnd,
  type PixelPoint
} from '../../src/render/navigationCoreTrail';

const point = (x: number, y: number): LegacyPoint => ({ x, y });
const px = (x: number, y: number): PixelPoint => ({ x, y });

describe('splitGridPathAtDiscontinuities', () => {
  it('returns an empty array for an empty path', () => {
    expect(splitGridPathAtDiscontinuities([])).toEqual([]);
  });

  it('keeps one subpath for a single point', () => {
    expect(splitGridPathAtDiscontinuities([point(1, 1)])).toEqual([[point(1, 1)]]);
  });

  it('keeps one subpath for a straight adjacent run', () => {
    const path = [point(0, 0), point(1, 0), point(2, 0)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([path]);
  });

  it('drops consecutive duplicate points', () => {
    const path = [point(0, 0), point(0, 0), point(1, 0)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([[point(0, 0), point(1, 0)]]);
  });

  it('keeps a 180-degree reversal as one subpath (still grid-adjacent)', () => {
    const path = [point(0, 0), point(1, 0), point(0, 0)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([path]);
  });

  it('splits at a non-adjacent (wraparound) jump', () => {
    const path = [point(0, 5), point(1, 5), point(9, 5)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([
      [point(0, 5), point(1, 5)],
      [point(9, 5)]
    ]);
  });

  it('splits at a vertical wraparound jump', () => {
    const path = [point(3, 0), point(3, 9)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([[point(3, 0)], [point(3, 9)]]);
  });

  it('handles a fractional final point (mid-glide) without treating it as discontinuous', () => {
    const path = [point(4, 4), point(5, 4.42)];
    expect(splitGridPathAtDiscontinuities(path)).toEqual([path]);
  });
});

describe('collapseCollinearPoints', () => {
  it('leaves fewer than 3 points untouched', () => {
    expect(collapseCollinearPoints([px(0, 0)])).toEqual([px(0, 0)]);
    expect(collapseCollinearPoints([px(0, 0), px(1, 0)])).toEqual([px(0, 0), px(1, 0)]);
  });

  it('drops a redundant collinear midpoint', () => {
    const result = collapseCollinearPoints([px(0, 0), px(1, 0), px(2, 0)]);
    expect(result).toEqual([px(0, 0), px(2, 0)]);
  });

  it('keeps a real corner', () => {
    const result = collapseCollinearPoints([px(0, 0), px(1, 0), px(1, 1)]);
    expect(result).toEqual([px(0, 0), px(1, 0), px(1, 1)]);
  });

  it('keeps a 180-degree reversal vertex (never merges it away)', () => {
    const result = collapseCollinearPoints([px(0, 0), px(1, 0), px(0, 0)]);
    expect(result).toEqual([px(0, 0), px(1, 0), px(0, 0)]);
  });

  it('collapses several consecutive collinear points on a long straight run', () => {
    const result = collapseCollinearPoints([px(0, 0), px(1, 0), px(2, 0), px(3, 0), px(4, 1)]);
    expect(result).toEqual([px(0, 0), px(3, 0), px(4, 1)]);
  });
});

describe('roundPolylineCorners', () => {
  it('returns the input unchanged for fewer than 3 points', () => {
    expect(roundPolylineCorners([px(0, 0), px(1, 0)], 5)).toEqual([px(0, 0), px(1, 0)]);
  });

  it('returns collapsed-only geometry when cornerRadius is 0', () => {
    const result = roundPolylineCorners([px(0, 0), px(1, 0), px(1, 1)], 0);
    expect(result).toEqual([px(0, 0), px(1, 0), px(1, 1)]);
  });

  it('rounds a right-angle corner: horizontal-to-vertical turn', () => {
    const result = roundPolylineCorners([px(0, 0), px(10, 0), px(10, 10)], 2, 4);
    // start point untouched, and the corner is replaced by a smooth run of
    // points strictly between the two trimmed tangent points -- more points
    // than the original 3, and none of them sit exactly on the sharp corner.
    expect(result[0]).toEqual(px(0, 0));
    expect(result[result.length - 1]).toEqual(px(10, 10));
    expect(result.length).toBeGreaterThan(3);
    expect(result.some((p) => p.x === 10 && p.y === 0)).toBe(false);
  });

  it('caps corner radius by half the shorter adjacent segment', () => {
    // segments of length 2 and 10 -- radius should cap at 1 (half of 2), not
    // the requested 5, so the incoming tangent point sits at x=1 (one unit
    // before the sharp corner at x=2), not x=0 (which a radius of 2 would give).
    const result = roundPolylineCorners([px(0, 0), px(2, 0), px(2, 10)], 5, 2);
    const tangentIn = result.find((p) => Math.abs(p.y) < 1e-9 && p.x > 0 && p.x < 2);
    expect(tangentIn).toBeDefined();
    expect(tangentIn!.x).toBeCloseTo(1, 6);
  });

  it('does not round a 180-degree reversal into a loop', () => {
    const result = roundPolylineCorners([px(0, 0), px(5, 0), px(0, 0)], 2, 4);
    expect(result).toEqual([px(0, 0), px(5, 0), px(0, 0)]);
  });

  it('rounds all four turn orientations without producing NaN/undefined points', () => {
    const corners: [PixelPoint, PixelPoint, PixelPoint][] = [
      [px(0, 0), px(10, 0), px(10, 10)], // right-down
      [px(0, 0), px(10, 0), px(10, -10)], // right-up
      [px(0, 0), px(-10, 0), px(-10, 10)], // left-down
      [px(0, 0), px(-10, 0), px(-10, -10)] // left-up
    ];
    for (const path of corners) {
      const result = roundPolylineCorners(path, 2, 4);
      expect(result.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    }
  });
});

describe('trimPolylineEnd', () => {
  it('leaves the polyline unchanged for zero/negative trim', () => {
    const path = [px(0, 0), px(10, 0)];
    expect(trimPolylineEnd(path, 0)).toEqual(path);
    expect(trimPolylineEnd(path, -5)).toEqual(path);
  });

  it('trims exactly within the final segment', () => {
    const result = trimPolylineEnd([px(0, 0), px(10, 0)], 3);
    expect(result).toEqual([px(0, 0), px(7, 0)]);
  });

  it('trims across multiple short trailing segments', () => {
    const result = trimPolylineEnd([px(0, 0), px(2, 0), px(4, 0), px(5, 0)], 4);
    // total remaining length after removing 4 from the end (1+2+... ) -- last
    // segment (4->5, len 1) fully consumed, then (2->4, len 2) fully
    // consumed, then 1 unit remains to trim from (0->2): endpoint at x=1.
    expect(result).toEqual([px(0, 0), px(1, 0)]);
  });

  it('collapses to a single point when the trim exceeds the whole length', () => {
    const result = trimPolylineEnd([px(0, 0), px(1, 0), px(2, 0)], 100);
    expect(result).toEqual([px(0, 0)]);
  });

  it('handles an empty or single-point polyline', () => {
    expect(trimPolylineEnd([], 5)).toEqual([]);
    expect(trimPolylineEnd([px(1, 1)], 5)).toEqual([px(1, 1)]);
  });
});

describe('projectGridPointToPixel', () => {
  it('maps a grid point to its continuous pixel center', () => {
    expect(projectGridPointToPixel(point(2, 3), 10, 20, 8)).toEqual({ x: 30, y: 48 });
  });

  it('supports fractional grid points (mid-glide)', () => {
    const result = projectGridPointToPixel(point(2.5, 3), 0, 0, 10);
    expect(result.x).toBeCloseTo(30, 6);
    expect(result.y).toBeCloseTo(35, 6);
  });
});

describe('buildContinuousTrailPath', () => {
  const baseOptions = {
    originX: 0,
    originY: 0,
    tileSize: 10,
    cornerRadiusRatio: 0.16,
    playerTrimRatio: 0.3
  };

  it('returns empty geometry for an empty grid path', () => {
    const result = buildContinuousTrailPath({ ...baseOptions, gridPath: [] });
    expect(result.vertices).toEqual([]);
    expect(result.totalLength).toBe(0);
  });

  it('builds a straight single-segment path with the exact tile*0.3 player trim', () => {
    const result = buildContinuousTrailPath({ ...baseOptions, gridPath: [point(0, 0), point(1, 0)] });
    // centers at (5,5) and (15,5), 10px apart, trimmed by tileSize*0.3 = 3px.
    expect(result.totalLength).toBeCloseTo(10 - 3, 6);
    const last = result.vertices[result.vertices.length - 1]!;
    expect(last.x).toBeCloseTo(12, 6);
    expect(last.y).toBeCloseTo(5, 6);
  });

  it('produces strictly nondecreasing cumulative distance across every vertex', () => {
    const gridPath = [point(0, 0), point(1, 0), point(1, 1), point(1, 2), point(2, 2)];
    const result = buildContinuousTrailPath({ ...baseOptions, gridPath });
    for (let i = 1; i < result.vertices.length; i += 1) {
      expect(result.vertices[i]!.distance).toBeGreaterThanOrEqual(result.vertices[i - 1]!.distance);
    }
  });

  it('marks a new subpath at a wraparound split and keeps one continuous distance coordinate across it', () => {
    const gridPath = [point(0, 5), point(1, 5), point(9, 5), point(8, 5)];
    const result = buildContinuousTrailPath({ ...baseOptions, gridPath, playerTrimRatio: 0 });
    const splitIndex = result.vertices.findIndex((v) => v.newSubpath && v !== result.vertices[0]);
    expect(splitIndex).toBeGreaterThan(0);
    // No stroke length is added by the jump itself (no line is drawn across
    // it) -- the split vertex's distance equals where the prior subpath
    // ended, it does not add extra length for the discontinuity.
    expect(result.vertices[splitIndex]!.distance).toBeCloseTo(result.vertices[splitIndex - 1]!.distance, 6);
    // distance keeps climbing after the split rather than resetting to 0
    expect(result.vertices[result.vertices.length - 1]!.distance).toBeGreaterThan(result.vertices[splitIndex]!.distance);
  });

  it('supports the exact 64px and 26px reference tile scales, and a fractional tile size', () => {
    for (const tileSize of [64, 26, 25.44]) {
      const result = buildContinuousTrailPath({
        ...baseOptions,
        tileSize,
        gridPath: [point(0, 0), point(1, 0), point(1, 1)]
      });
      expect(result.totalLength).toBeGreaterThan(0);
      expect(Number.isFinite(result.totalLength)).toBe(true);
    }
  });

  it('extends smoothly to a fractional (mid-glide) final point instead of popping to the next full tile', () => {
    // A real caller always appends the fractional interpolated point AFTER
    // the last fully-committed grid point -- e.g. mid-glide from committed
    // tile (1,0) toward (2,0) is [.., point(1,0), point(1.5,0)], never a
    // single step spanning more than one grid unit (that would itself be a
    // discontinuity, see splitGridPathAtDiscontinuities).
    const atStart = buildContinuousTrailPath({
      ...baseOptions,
      playerTrimRatio: 0,
      gridPath: [point(0, 0), point(1, 0)]
    });
    const midGlide = buildContinuousTrailPath({
      ...baseOptions,
      playerTrimRatio: 0,
      gridPath: [point(0, 0), point(1, 0), point(1.5, 0)]
    });
    const fullStep = buildContinuousTrailPath({
      ...baseOptions,
      playerTrimRatio: 0,
      gridPath: [point(0, 0), point(1, 0), point(2, 0)]
    });
    expect(midGlide.totalLength).toBeGreaterThan(atStart.totalLength);
    expect(midGlide.totalLength).toBeLessThan(fullStep.totalLength);
  });
});

describe('resampleTrailVertices', () => {
  const baseOptions = {
    originX: 0,
    originY: 0,
    tileSize: 10,
    cornerRadiusRatio: 0.16,
    playerTrimRatio: 0
  };

  it('leaves the input unchanged for interval <= 0', () => {
    const geometry = buildContinuousTrailPath({ ...baseOptions, gridPath: [point(0, 0), point(1, 0)] });
    expect(resampleTrailVertices(geometry.vertices, 0)).toEqual(geometry.vertices);
  });

  it('adds intermediate points along a long straight run', () => {
    const geometry = buildContinuousTrailPath({
      ...baseOptions,
      gridPath: [point(0, 0), point(1, 0), point(2, 0), point(3, 0)]
    });
    const resampled = resampleTrailVertices(geometry.vertices, 2);
    expect(resampled.length).toBeGreaterThan(geometry.vertices.length);
  });

  it('preserves subpath breaks and never draws across them', () => {
    const geometry = buildContinuousTrailPath({
      ...baseOptions,
      gridPath: [point(0, 5), point(1, 5), point(9, 5), point(8, 5)]
    });
    const resampled = resampleTrailVertices(geometry.vertices, 2);
    const breakCount = resampled.filter((v) => v.newSubpath).length;
    expect(breakCount).toBe(geometry.vertices.filter((v) => v.newSubpath).length);
  });

  it('produces monotonically nondecreasing distance throughout', () => {
    const geometry = buildContinuousTrailPath({
      ...baseOptions,
      gridPath: [point(0, 0), point(1, 0), point(1, 1), point(2, 1)]
    });
    const resampled = resampleTrailVertices(geometry.vertices, 1.5);
    for (let i = 1; i < resampled.length; i += 1) {
      expect(resampled[i]!.distance).toBeGreaterThanOrEqual(resampled[i - 1]!.distance);
    }
  });

  it('exactly reaches the final point of each straight run (no truncation)', () => {
    const geometry = buildContinuousTrailPath({ ...baseOptions, gridPath: [point(0, 0), point(2, 0)] });
    const resampled = resampleTrailVertices(geometry.vertices, 3);
    const last = resampled[resampled.length - 1]!;
    const originalLast = geometry.vertices[geometry.vertices.length - 1]!;
    expect(last.x).toBeCloseTo(originalLast.x, 6);
    expect(last.y).toBeCloseTo(originalLast.y, 6);
    expect(last.distance).toBeCloseTo(originalLast.distance, 6);
  });
});

describe('sampleTrailEnergyColor', () => {
  const options = { distancePeriodPx: 100, timePeriodMs: 1000 };

  it('is a pure function of distance and time (same inputs, same output)', () => {
    expect(sampleTrailEnergyColor(42, 500, options)).toBe(sampleTrailEnergyColor(42, 500, options));
  });

  it('does not depend on any notion of "total length" -- extending the trail never recolors an existing distance', () => {
    // The function signature itself has no total-length parameter, so this
    // is really a type-level guarantee, but assert the two calls a caller
    // would actually make (before/after appending a new point) agree.
    const beforeExtend = sampleTrailEnergyColor(20, 0, options);
    const afterExtend = sampleTrailEnergyColor(20, 0, options);
    expect(beforeExtend).toBe(afterExtend);
  });

  it('varies smoothly with distance (no discrete per-cell banding)', () => {
    const a = sampleTrailEnergyColor(0, 0, options);
    const b = sampleTrailEnergyColor(1, 0, options);
    expect(a).not.toBe(b);
  });

  it('cycles back to (approximately) the same color after one full distance period', () => {
    const start = sampleTrailEnergyColor(0, 0, options);
    const afterOneCycle = sampleTrailEnergyColor(options.distancePeriodPx, 0, options);
    expect(afterOneCycle).toBe(start);
  });
});

describe('advanceTrailShineState', () => {
  const options = {
    speedPxPerMs: 1,
    lengthRatio: 0.095,
    fadeRatio: 0.4,
    quietGapRatio: 0.5,
    minTotalLengthForShine: 20
  };

  it('suppresses the shine on a very short trail', () => {
    const result = advanceTrailShineState(5, 0, 0, options);
    expect(result.visible).toBe(false);
  });

  it('is visible and near the origin right after a lap starts', () => {
    const result = advanceTrailShineState(1000, 10, 0, options);
    expect(result.visible).toBe(true);
    expect(result.centerDistance).toBeCloseTo(10, 6);
  });

  it('advances at a constant physical speed regardless of total length changing between calls', () => {
    const first = advanceTrailShineState(1000, 100, 0, options);
    // trail grows (player took another step) -- the shine's position at the
    // same elapsed time must be identical, not remapped.
    const afterGrowth = advanceTrailShineState(2000, 100, first.lapStartedAtMs, options);
    expect(afterGrowth.centerDistance).toBeCloseTo(first.centerDistance, 6);
  });

  it('goes invisible once past the total length (quiet interval) and reports a stable lap start', () => {
    const result = advanceTrailShineState(1000, 1010, 0, options);
    expect(result.visible).toBe(false);
    expect(result.centerDistance).toBeGreaterThanOrEqual(1000);
  });

  it('restarts at the origin after a full lap + quiet gap, carrying over exact overshoot', () => {
    // cycleLength = 1000 * 1.5 = 1500 at speed 1px/ms -> completes at t=1500.
    const justAfterWrap = advanceTrailShineState(1000, 1510, 0, options);
    expect(justAfterWrap.visible).toBe(true);
    expect(justAfterWrap.centerDistance).toBeCloseTo(10, 6);
  });

  it('never produces a visible shine during the quiet interval', () => {
    for (let t = 1001; t < 1500; t += 50) {
      const result = advanceTrailShineState(1000, t, 0, options);
      expect(result.visible).toBe(false);
    }
  });

  it('fades in near the origin and out near the player end (envelope alpha)', () => {
    const nearOrigin = advanceTrailShineState(1000, 1, 0, options);
    const middle = advanceTrailShineState(1000, 500, 0, options);
    const nearEnd = advanceTrailShineState(1000, 999, 0, options);
    expect(nearOrigin.envelopeAlpha).toBeLessThan(middle.envelopeAlpha);
    expect(nearEnd.envelopeAlpha).toBeLessThan(middle.envelopeAlpha);
  });

  it('scales shine length with the current total length', () => {
    const shortTrail = advanceTrailShineState(500, 10, 0, options);
    const longTrail = advanceTrailShineState(5000, 10, 0, options);
    expect(longTrail.halfLength).toBeGreaterThan(shortTrail.halfLength);
  });

  it('is a no-op speed guard against zero/negative speed', () => {
    const result = advanceTrailShineState(1000, 500, 0, { ...options, speedPxPerMs: 0 });
    expect(result.visible).toBe(false);
  });
});
