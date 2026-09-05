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
  // The exact production ratios, per the frozen contract -- deliberately
  // NOT a test-only inflated value (an earlier version of this test used
  // fadeRatio: 0.4, which silently protected nothing about the real 0.04
  // contract). travelEnvelopeRatio is a fraction of TOTAL PATH LENGTH, not
  // of the shine's own (lengthRatio) body -- see TrailShineOptions' own
  // header for why conflating the two made the real fade window 10x too
  // short (0.095 * 0.04 = 0.38% of the path instead of 4%).
  const options = {
    speedPxPerMs: 1,
    lengthRatio: 0.095,
    travelEnvelopeRatio: 0.04,
    quietGapRatio: 0.5,
    minTotalLengthForShine: 20
  };

  it('suppresses the shine on a very short trail', () => {
    const result = advanceTrailShineState(5, 0, 0, 0, options);
    expect(result.visible).toBe(false);
  });

  it('is visible and near the origin right after a lap starts', () => {
    const result = advanceTrailShineState(1000, 10, 0, 0, options);
    expect(result.visible).toBe(true);
    expect(result.centerDistance).toBeCloseTo(10, 6);
  });

  it('advances at a constant physical speed regardless of total length changing between calls', () => {
    const first = advanceTrailShineState(1000, 100, 0, 0, options);
    // trail grows (player took another step) -- the shine's position at the
    // same elapsed time must be identical, not remapped.
    const afterGrowth = advanceTrailShineState(2000, 100, first.lapStartedAtMs, first.lapCycleLength, options);
    expect(afterGrowth.centerDistance).toBeCloseTo(first.centerDistance, 6);
  });

  it('goes invisible once past the total length (quiet interval) and reports a stable lap start', () => {
    const result = advanceTrailShineState(1000, 1010, 0, 0, options);
    expect(result.visible).toBe(false);
    expect(result.centerDistance).toBeGreaterThanOrEqual(1000);
  });

  it('restarts at the origin after a full lap + quiet gap, carrying over exact overshoot', () => {
    // cycleLength = 1000 * 1.5 = 1500 at speed 1px/ms -> completes at t=1500.
    const justAfterWrap = advanceTrailShineState(1000, 1510, 0, 0, options);
    expect(justAfterWrap.visible).toBe(true);
    expect(justAfterWrap.centerDistance).toBeCloseTo(10, 6);
  });

  it('never produces a visible shine during the quiet interval', () => {
    for (let t = 1001; t < 1500; t += 50) {
      const result = advanceTrailShineState(1000, t, 0, 0, options);
      expect(result.visible).toBe(false);
    }
  });

  it('fades in near the origin and out near the player end (envelope alpha)', () => {
    const nearOrigin = advanceTrailShineState(1000, 1, 0, 0, options);
    const middle = advanceTrailShineState(1000, 500, 0, 0, options);
    const nearEnd = advanceTrailShineState(1000, 999, 0, 0, options);
    expect(nearOrigin.envelopeAlpha).toBeLessThan(middle.envelopeAlpha);
    expect(nearEnd.envelopeAlpha).toBeLessThan(middle.envelopeAlpha);
  });

  it('scales shine length with the current total length', () => {
    const shortTrail = advanceTrailShineState(500, 10, 0, 0, options);
    const longTrail = advanceTrailShineState(5000, 10, 0, 0, options);
    expect(longTrail.halfLength).toBeGreaterThan(shortTrail.halfLength);
  });

  it('is a no-op speed guard against zero/negative speed', () => {
    const result = advanceTrailShineState(1000, 500, 0, 0, { ...options, speedPxPerMs: 0 });
    expect(result.visible).toBe(false);
  });

  it('computes the travel envelope as 4% of TOTAL path length, not 4% of the shine body', () => {
    // totalLength=1000 -> travelEnvelopeLength must be 40 (4% of 1000), not
    // 0.095*1000*0.04=3.8 (4% of the ~9.5%-length shine body).
    const result = advanceTrailShineState(1000, 10, 0, 0, options);
    expect(result.travelEnvelopeLength).toBeCloseTo(40, 6);
  });

  it('is at exactly zero envelope alpha at the trail origin (distance 0) and ramps up smoothly across the first 4% of path length', () => {
    // At t=0 the shine sits at distance 0 -- envelopeAlpha must start at 0
    // (a real fade-IN, not an instant pop to full brightness) and reach 1.0
    // once it has traveled the full 40px (4% of 1000) envelope window.
    const atOrigin = advanceTrailShineState(1000, 0, 0, 0, options);
    expect(atOrigin.envelopeAlpha).toBeCloseTo(0, 6);
    const quarterIntoEnvelope = advanceTrailShineState(1000, 10, 0, 0, options); // distance 10 of 40
    expect(quarterIntoEnvelope.envelopeAlpha).toBeCloseTo(0.25, 6);
    const halfwayIntoEnvelope = advanceTrailShineState(1000, 20, 0, 0, options); // distance 20 of 40
    expect(halfwayIntoEnvelope.envelopeAlpha).toBeCloseTo(0.5, 6);
    const fullyFadedIn = advanceTrailShineState(1000, 40, 0, 0, options); // distance 40 of 40
    expect(fullyFadedIn.envelopeAlpha).toBeCloseTo(1, 6);
  });

  it('ramps down smoothly across the final 4% of path length before reaching the player, not a hard cut', () => {
    // totalLength=1000, envelope window=40 -- fade-out starts at distance
    // 960 and reaches exactly 0 at distance 1000.
    const beforeFadeOutWindow = advanceTrailShineState(1000, 950, 0, 0, options);
    expect(beforeFadeOutWindow.envelopeAlpha).toBeCloseTo(1, 6);
    const tenIntoFadeOut = advanceTrailShineState(1000, 970, 0, 0, options); // 30 of 40 remaining
    expect(tenIntoFadeOut.envelopeAlpha).toBeCloseTo(0.75, 6);
    const nearEnd = advanceTrailShineState(1000, 990, 0, 0, options); // 10 of 40 remaining
    expect(nearEnd.envelopeAlpha).toBeCloseTo(0.25, 6);
    const atPlayerEnd = advanceTrailShineState(1000, 1000, 0, 0, options);
    expect(atPlayerEnd.envelopeAlpha).toBeCloseTo(0, 6);
  });

  it('holds full brightness (envelopeAlpha === 1) through the entire middle of the path, outside both envelope windows', () => {
    // totalLength=1000, envelope window=40 -- full brightness expected
    // anywhere in [40, 960].
    for (const distance of [40, 100, 300, 500, 700, 900, 960]) {
      const result = advanceTrailShineState(1000, distance, 0, 0, options);
      expect(result.envelopeAlpha).toBeCloseTo(1, 6);
    }
  });

  it('is fully invisible (envelopeAlpha 0) during the quiet reset interval, not merely dim', () => {
    const result = advanceTrailShineState(1000, 1250, 0, 0, options); // mid-quiet-gap (interval is [1000,1500])
    expect(result.visible).toBe(false);
    expect(result.envelopeAlpha).toBe(0);
  });

  it('does not hard-cut at either the origin or the player end -- envelope alpha is continuous, not a step function', () => {
    // Sample densely across the fade-in window and assert monotonic, gapless increase.
    const samples = [0, 5, 10, 15, 20, 25, 30, 35, 40].map(
      (d) => advanceTrailShineState(1000, d, 0, 0, options).envelopeAlpha
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]!);
    }
  });

  // A shrinking path (backtracking makes the perfect-path shortest-path
  // search shorter, or a Trail Fade origin advance) must never remap an
  // in-flight shine to an unrelated earlier position via
  // `traveled % newShorterCycleLength` -- it must instead just fade/suppress
  // the shine (via `visible`, which reads the CURRENT totalLength) until
  // either the path grows back past it or the ORIGINAL, longer cycle
  // genuinely elapses. See advanceTrailShineState's own header.
  describe('path shrink continuity (no modulo teleport)', () => {
    it('goes invisible instead of remapping when a 100->40 shrink happens while the shine is at distance 80', () => {
      const atLapStart = advanceTrailShineState(100, 0, 0, 0, options);
      // Advance to distance 80 while the path is still length 100.
      const at80 = advanceTrailShineState(100, 80, atLapStart.lapStartedAtMs, atLapStart.lapCycleLength, options);
      expect(at80.visible).toBe(true);
      expect(at80.centerDistance).toBeCloseTo(80, 6);

      // The path shrinks to 40 at the same elapsed time (same lapStartedAtMs
      // / lapCycleLength carried forward, as a real caller would).
      const afterShrink = advanceTrailShineState(40, 80, at80.lapStartedAtMs, at80.lapCycleLength, options);
      // Naive `80 % (40*1.5=60) = 20` would put the shine back near the
      // origin -- a visible teleport. The fix must not do that: the shine
      // is simply past the (now shorter) path, so it goes invisible.
      expect(afterShrink.visible).toBe(false);
      expect(afterShrink.envelopeAlpha).toBe(0);
    });

    it('keeps a stable, non-jumping center when a shrink still leaves the shine within the new (shorter) path', () => {
      const atLapStart = advanceTrailShineState(100, 0, 0, 0, options);
      const at50 = advanceTrailShineState(100, 50, atLapStart.lapStartedAtMs, atLapStart.lapCycleLength, options);
      expect(at50.centerDistance).toBeCloseTo(50, 6);

      // Shrink to 70 -- the shine (at 50) is still within the new path.
      const afterShrink = advanceTrailShineState(70, 50, at50.lapStartedAtMs, at50.lapCycleLength, options);
      expect(afterShrink.visible).toBe(true);
      // Same physical center as before the shrink -- no jump.
      expect(afterShrink.centerDistance).toBeCloseTo(50, 6);
    });

    it('resumes at the same physical position (no jump) once the path grows back past a shine hidden by a shrink', () => {
      const atLapStart = advanceTrailShineState(100, 0, 0, 0, options);
      const at80 = advanceTrailShineState(100, 80, atLapStart.lapStartedAtMs, atLapStart.lapCycleLength, options);
      const hidden = advanceTrailShineState(40, 80, at80.lapStartedAtMs, at80.lapCycleLength, options);
      expect(hidden.visible).toBe(false);

      // Path grows back to 100 at the same elapsed time -- the shine must
      // reappear at exactly distance 80, not some remapped position.
      const regrown = advanceTrailShineState(100, 80, hidden.lapStartedAtMs, hidden.lapCycleLength, options);
      expect(regrown.visible).toBe(true);
      expect(regrown.centerDistance).toBeCloseTo(80, 6);
    });

    it('survives repeated shrink/grow cycles without ever teleporting the visible center', () => {
      let state = advanceTrailShineState(100, 0, 0, 0, options);
      const lengths = [100, 60, 100, 30, 100, 80, 40, 100];
      let previousT = 0;

      for (let i = 0; i < lengths.length; i += 1) {
        const t = i * 10;
        const previous = state;
        state = advanceTrailShineState(lengths[i]!, t, state.lapStartedAtMs, state.lapCycleLength, options);
        const noWrapHappened = state.lapStartedAtMs === previous.lapStartedAtMs;

        // As long as no wrap happened and BOTH samples were visible (so
        // neither centerDistance was clamped by an invisible totalLength),
        // the shine's position must have advanced by EXACTLY the real
        // elapsed time since the immediately preceding call, at the
        // constant speed -- never anything else. A modulo-teleport (the
        // bug) would instead land it at some unrelated position, violating
        // this exact equality.
        if (noWrapHappened && previous.visible && state.visible) {
          const expectedDistance = previous.centerDistance + ((t - previousT) * options.speedPxPerMs);
          expect(state.centerDistance).toBeCloseTo(expectedDistance, 6);
        }

        previousT = t;
      }
    });

    it('stays invisible if a shrink happens during the already-invisible quiet interval', () => {
      const atLapStart = advanceTrailShineState(100, 0, 0, 0, options);
      // 1250 is mid-quiet-gap for a length-1000 path per the earlier test
      // above; scale down: length 100, quietGapRatio 0.5 -> quiet interval
      // is [100, 150].
      const duringQuiet = advanceTrailShineState(100, 125, atLapStart.lapStartedAtMs, atLapStart.lapCycleLength, options);
      expect(duringQuiet.visible).toBe(false);

      const shrunkDuringQuiet = advanceTrailShineState(40, 125, duringQuiet.lapStartedAtMs, duringQuiet.lapCycleLength, options);
      expect(shrunkDuringQuiet.visible).toBe(false);
    });

    it('eventually starts a fresh lap from the current path length once the original (longer) cycle elapses despite an intervening shrink', () => {
      const atLapStart = advanceTrailShineState(100, 0, 0, 0, options);
      // Original cycle length = 100 * 1.5 = 150, so it wraps at t=150.
      const shrunkMidLap = advanceTrailShineState(40, 80, atLapStart.lapStartedAtMs, atLapStart.lapCycleLength, options);
      expect(shrunkMidLap.visible).toBe(false);

      const afterOriginalCycleElapses = advanceTrailShineState(
        40,
        151,
        shrunkMidLap.lapStartedAtMs,
        shrunkMidLap.lapCycleLength,
        options
      );
      expect(afterOriginalCycleElapses.visible).toBe(true);
      // A fresh lap just started -- near the origin.
      expect(afterOriginalCycleElapses.centerDistance).toBeCloseTo(1, 0);
    });
  });
});
