import { describe, expect, test } from 'vitest';
import {
  GOAL_STAR_SPIN,
  GOAL_STAR_TOOTH_RAD,
  isGoalStarSpinning,
  resolveGoalStarRotation
} from '../../src/render/goalStarSpin';

const TAU = Math.PI * 2;
const TOOTH_MS = GOAL_STAR_SPIN.periodMs / GOAL_STAR_SPIN.symmetry;

describe('goal star spin (MAZER-VIS-041): a pure function of the shared scene clock', () => {
  test('one revolution takes 14 s, inside the 12..16 s "slow" band', () => {
    expect(GOAL_STAR_SPIN.periodMs).toBeGreaterThanOrEqual(12000);
    expect(GOAL_STAR_SPIN.periodMs).toBeLessThanOrEqual(16000);
    expect(GOAL_STAR_SPIN.symmetry).toBe(5);
    expect(GOAL_STAR_TOOTH_RAD).toBeCloseTo(TAU / 5, 12);
  });

  test('starts tip-up (angle 0) and turns clockwise: the angle only grows within a tooth', () => {
    expect(resolveGoalStarRotation(0, false)).toBe(0);
    let last = 0;
    for (let t = 50; t < TOOTH_MS; t += 50) {
      const a = resolveGoalStarRotation(t, false);
      expect(a).toBeGreaterThan(last);
      last = a;
    }
  });

  test('the speed is the same everywhere: 360 / 14 degrees per second, no easing, no pulsing', () => {
    const perSecond = (TAU / GOAL_STAR_SPIN.periodMs) * 1000;
    for (const t0 of [0, 123, 1000, 2500, 60000, 3_600_000]) {
      const dt = 20;
      let d = resolveGoalStarRotation(t0 + dt, false) - resolveGoalStarRotation(t0, false);
      if (d < 0) d += GOAL_STAR_TOOTH_RAD; // crossed the wrap of one 72 degree tooth
      expect(d / (dt / 1000)).toBeCloseTo(perSecond, 6);
    }
  });

  test('five-fold symmetry: it repeats every 2.8 s, and after a full 14 s it is back where it was', () => {
    for (const t of [0, 321, 1777, 9000]) {
      const a = resolveGoalStarRotation(t, false);
      const b = resolveGoalStarRotation(t + TOOTH_MS, false);
      expect(Math.abs(a - b)).toBeLessThan(1e-9);
      expect(Math.abs(resolveGoalStarRotation(t + GOAL_STAR_SPIN.periodMs, false) - a)).toBeLessThan(1e-9);
    }
    expect(resolveGoalStarRotation(TOOTH_MS / 2, false)).toBeCloseTo(GOAL_STAR_TOOTH_RAD / 2, 12);
  });

  test('always inside one tooth [0, 72 degrees), precise after hours, and tolerant of a negative or broken clock', () => {
    for (const t of [0, 1, 2799, 2800, 14000, 3_600_000.5, 86_400_000 * 3 + 7, -1, -2800.5]) {
      const a = resolveGoalStarRotation(t, false);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(GOAL_STAR_TOOTH_RAD);
    }
    expect(resolveGoalStarRotation(Number.NaN, false)).toBe(0);
    expect(resolveGoalStarRotation(Number.POSITIVE_INFINITY, false)).toBe(0);
  });

  test('Reduce Motion: no spin at any time (static, tip up); full motion spins', () => {
    for (const t of [0, 500, 1400, 99999]) {
      expect(resolveGoalStarRotation(t, true)).toBe(0);
    }
    expect(isGoalStarSpinning(true)).toBe(false);
    expect(isGoalStarSpinning(false)).toBe(true);
    expect(resolveGoalStarRotation(1400, false)).toBeGreaterThan(0);
  });
});
