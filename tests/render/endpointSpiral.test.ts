import { describe, expect, test } from 'vitest';
import {
  isStartSpiralSpinning,
  resolveStartSpiralArm,
  resolveStartSpiralRotation,
  START_SPIRAL
} from '../../src/render/endpointSpiral';
import { GOAL_STAR_SPIN, GOAL_STAR_TOOTH_RAD, resolveGoalStarRotation } from '../../src/render/goalStarSpin';
import { resolveEdgeMarkerStates } from '../../src/render/edgeMarkers';
import { resolveSharedBorderColor } from '../../src/render/trailPalette';
import { resolveTrailPaletteBorderColor } from '../../src/render/trailPalette';

/**
 * MAZER-VIS-053: the start spiral spins slowly in phase with the end star, reduced motion stops it, and the star's border
 * is the same colour as the corner diamonds' border (one shared function).
 */
const TWO_PI = Math.PI * 2;
const TIMES = [0, 1, 333, 1000, 3500, 7000, 13999, 14000, 14001, 21000, 98765, 1234567];
/** Distance between two angles on the circle. */
const gap = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % TWO_PI + TWO_PI) % TWO_PI);
  return Math.min(d, TWO_PI - d);
};

describe('start spiral clock', () => {
  test('starts at 0, turns once per star period, and stays in [0, 2 pi)', () => {
    expect(resolveStartSpiralRotation(0, false)).toBe(0);
    for (const t of TIMES) {
      const angle = resolveStartSpiralRotation(t, false);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TWO_PI);
      expect(gap(angle, resolveStartSpiralRotation(t + GOAL_STAR_SPIN.periodMs, false))).toBeLessThan(1e-9);
    }
    expect(resolveStartSpiralRotation(GOAL_STAR_SPIN.periodMs / 2, false)).toBeCloseTo(Math.PI, 9);
  });

  test('is slow: one revolution takes at least ten seconds', () => {
    expect(GOAL_STAR_SPIN.periodMs).toBeGreaterThanOrEqual(10000);
  });

  test('IN PHASE with the end star: at every time the spiral angle is the star angle plus a whole number of star teeth', () => {
    for (const t of TIMES) {
      const spiral = resolveStartSpiralRotation(t, false);
      const star = resolveGoalStarRotation(t, false);
      const teeth = (spiral - star) / GOAL_STAR_TOOTH_RAD;
      expect(Math.abs(teeth - Math.round(teeth)), `t=${t}`).toBeLessThan(1e-6);
      // and they turn the same way (clockwise): over a short step both advance
      const dSpiral = ((resolveStartSpiralRotation(t + 50, false) - spiral) + TWO_PI) % TWO_PI;
      expect(dSpiral, `t=${t}`).toBeGreaterThan(0);
      expect(dSpiral).toBeLessThan(0.1);
    }
  });

  test('REDUCED MOTION stops the spin: angle 0 at every time, and no redraws are needed', () => {
    for (const t of TIMES) {
      expect(resolveStartSpiralRotation(t, true)).toBe(0);
    }
    expect(isStartSpiralSpinning(true)).toBe(false);
    expect(isStartSpiralSpinning(false)).toBe(true);
  });

  test('a non-finite clock is the rest angle, a negative one still lands in range', () => {
    expect(resolveStartSpiralRotation(Number.NaN, false)).toBe(0);
    expect(resolveStartSpiralRotation(Number.POSITIVE_INFINITY, false)).toBe(0);
    const negative = resolveStartSpiralRotation(-3000, false);
    expect(negative).toBeGreaterThanOrEqual(0);
    expect(negative).toBeLessThan(TWO_PI);
  });
});

describe('start spiral geometry', () => {
  const geometry = { cx: 50, cy: 40, outer: 6, inner: 6 * START_SPIRAL.innerShare };

  test('each arm winds from the inner to the outer radius, clockwise outward', () => {
    for (let arm = 0; arm < START_SPIRAL.arms; arm += 1) {
      const pts = resolveStartSpiralArm(geometry, arm, 0);
      expect(pts.length).toBe((START_SPIRAL.segments + 1) * 2);
      const radii: number[] = [];
      const angles: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i]! - geometry.cx;
        const dy = pts[i + 1]! - geometry.cy;
        radii.push(Math.hypot(dx, dy));
        angles.push(Math.atan2(dy, dx));
      }
      expect(radii[0]).toBeCloseTo(geometry.inner, 9);
      expect(radii[radii.length - 1]).toBeCloseTo(geometry.outer, 9);
      for (let i = 1; i < radii.length; i += 1) {
        expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
        // y grows down, so a positive angle step is clockwise on screen
        const step = ((angles[i]! - angles[i - 1]!) + (3 * Math.PI)) % TWO_PI - Math.PI;
        expect(step).toBeGreaterThan(0);
      }
    }
  });

  test('the arms are half a turn apart, so the painted mass is centred on the spin axis at every angle', () => {
    for (const rotation of [0, 0.3, 1.1, 2.5, 4]) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let arm = 0; arm < START_SPIRAL.arms; arm += 1) {
        const pts = resolveStartSpiralArm(geometry, arm, rotation);
        for (let i = 0; i < pts.length; i += 2) {
          sx += pts[i]!;
          sy += pts[i + 1]!;
          n += 1;
        }
      }
      expect(sx / n).toBeCloseTo(geometry.cx, 9);
      expect(sy / n).toBeCloseTo(geometry.cy, 9);
    }
  });

  test('turning by the rotation moves every point on its circle about the axis (rigid rotation)', () => {
    const at0 = resolveStartSpiralArm(geometry, 0, 0);
    const at1 = resolveStartSpiralArm(geometry, 0, 1.2);
    for (let i = 0; i < at0.length; i += 2) {
      const r0 = Math.hypot(at0[i]! - geometry.cx, at0[i + 1]! - geometry.cy);
      const r1 = Math.hypot(at1[i]! - geometry.cx, at1[i + 1]! - geometry.cy);
      expect(r1).toBeCloseTo(r0, 9);
      const a0 = Math.atan2(at0[i + 1]! - geometry.cy, at0[i]! - geometry.cx);
      const a1 = Math.atan2(at1[i + 1]! - geometry.cy, at1[i]! - geometry.cx);
      expect(gap(a1 - a0, 1.2)).toBeLessThan(1e-9);
    }
  });
});

describe('the star border is the same shared colour as the corner diamond border', () => {
  test('resolveSharedBorderColor is the trail palette border colour at the trail head, and honours reduced motion', () => {
    const head = { distanceTiles: 7.5, timeMs: 4200, animated: true };
    expect(resolveSharedBorderColor(head, 0, false)).toBe(resolveTrailPaletteBorderColor(7.5, 4200, false));
    expect(resolveSharedBorderColor({ ...head, animated: false }, 0, false)).toBe(resolveTrailPaletteBorderColor(7.5, 4200, true));
    expect(resolveSharedBorderColor(head, 0, true)).toBe(resolveTrailPaletteBorderColor(7.5, 4200, true));
    expect(resolveSharedBorderColor(null, 1500, false)).toBe(resolveTrailPaletteBorderColor(0, 1500, false));
  });

  test('the edge-marker states use that very function for their border', () => {
    const input = {
      timeMs: 2000, reducedMotion: false, trailHeadDistanceTiles: 12, trailTimeMs: 3100, trailAnimated: true
    };
    const states = resolveEdgeMarkerStates({ ...(input as never) });
    const expected = resolveSharedBorderColor({ distanceTiles: 12, timeMs: 3100, animated: true }, 2000, false);
    const borders = (Array.isArray(states) ? states : Object.values(states as object)) as Array<{ borderColor?: number }>;
    const found = borders.map((s) => s.borderColor).filter((c): c is number => typeof c === 'number');
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      expect(c).toBe(expected);
    }
  });
});
