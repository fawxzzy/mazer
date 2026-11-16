import { describe, expect, test } from 'vitest';
import {
  CONTINUOUS_CORNER_EXTENT,
  resolveCircularCornerHiddenDepth,
  resolveContinuousCornerDiagonalInset,
  resolveContinuousCornerHiddenDepth,
  resolveContinuousCornerOutline,
  toCornerLocal
} from '../../src/render/displayCornerMask';

/** MAZER-VIS-056: the continuous (iOS) display corner model the bottom corner stars are placed against. */
describe('continuous display corner model (MAZER-VIS-056)', () => {
  test('the outline runs edge to edge: starts 1.5287 R along the side edge, ends 1.5287 R up the other, monotone in between', () => {
    const outline = resolveContinuousCornerOutline(62);
    expect(outline[0]?.along).toBeCloseTo(CONTINUOUS_CORNER_EXTENT * 62, 9);
    expect(outline[0]?.across).toBeCloseTo(0, 9);
    expect(outline.at(-1)?.along).toBeCloseTo(0, 9);
    expect(outline.at(-1)?.across).toBeCloseTo(CONTINUOUS_CORNER_EXTENT * 62, 9);
    for (let index = 1; index < outline.length; index += 1) {
      expect(outline[index]!.along).toBeLessThanOrEqual(outline[index - 1]!.along + 1e-12);
      expect(outline[index]!.across).toBeGreaterThanOrEqual(outline[index - 1]!.across - 1e-12);
    }
    // Symmetric about the diagonal.
    const mirrored = outline.map((point) => ({ along: point.across, across: point.along })).reverse();
    mirrored.forEach((point, index) => {
      expect(point.along).toBeCloseTo(outline[index]!.along, 9);
      expect(point.across).toBeCloseTo(outline[index]!.across, 9);
    });
  });

  test('the continuous corner crosses the diagonal 0.2915 R in (a circle: 0.2929 R)', () => {
    expect(resolveContinuousCornerDiagonalInset(1)).toBeCloseTo(0.29151, 4);
    expect(resolveContinuousCornerDiagonalInset(66)).toBeCloseTo(66 * 0.29151, 3);
    expect(resolveContinuousCornerHiddenDepth({ along: resolveContinuousCornerDiagonalInset(55), across: resolveContinuousCornerDiagonalInset(55) }, 55)).toBeCloseTo(0, 3);
    expect(resolveCircularCornerHiddenDepth({ along: 55 * (1 - Math.SQRT1_2), across: 55 * (1 - Math.SQRT1_2) }, 55)).toBeCloseTo(0, 9);
  });

  test('hidden depth: positive on the corner side, negative inside the view, -Infinity outside the corner box, overshoot past an edge counts', () => {
    expect(resolveContinuousCornerHiddenDepth({ along: 5, across: 5 }, 55)).toBeCloseTo((resolveContinuousCornerDiagonalInset(55) - 5) * Math.SQRT2, 3);
    expect(resolveContinuousCornerHiddenDepth({ along: 30, across: 30 }, 55)).toBeLessThan(0);
    expect(resolveContinuousCornerHiddenDepth({ along: 200, across: 2 }, 55)).toBe(Number.NEGATIVE_INFINITY);
    expect(resolveContinuousCornerHiddenDepth({ along: -3, across: 300 }, 55)).toBe(3);
    // Near the side edge the continuous corner still hides a sliver where a circle of the same radius is already square.
    expect(resolveCircularCornerHiddenDepth({ along: 60, across: 0.2 }, 55)).toBe(Number.NEGATIVE_INFINITY);
    expect(resolveContinuousCornerHiddenDepth({ along: 60, across: 0.2 }, 55)).toBeGreaterThan(0);
    // A larger corner hides a superset: depth grows with the radius at a fixed point.
    const point = { along: 18, across: 18 };
    expect(resolveContinuousCornerHiddenDepth(point, 66)).toBeGreaterThan(resolveContinuousCornerHiddenDepth(point, 62));
    expect(resolveContinuousCornerHiddenDepth(point, 62)).toBeGreaterThan(resolveContinuousCornerHiddenDepth(point, 55));
  });

  test('toCornerLocal maps a canvas point to distances from the two edges of the named corner', () => {
    expect(toCornerLocal({ x: 10, y: 790 }, 'bottom-left', 390, 797)).toEqual({ along: 10, across: 7 });
    expect(toCornerLocal({ x: 380, y: 790 }, 'bottom-right', 390, 797)).toEqual({ along: 10, across: 7 });
    expect(toCornerLocal({ x: 10, y: 4 }, 'top-left', 390, 797)).toEqual({ along: 10, across: 4 });
  });
});
