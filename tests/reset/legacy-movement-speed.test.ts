import { describe, expect, test } from 'vitest';
import {
  formatLegacyMovementSpeedPercent,
  LEGACY_MOVEMENT_SPEED_DEFAULT,
  LEGACY_MOVEMENT_SPEED_STEP,
  LEGACY_MOVEMENT_STEP_RATE_FACTOR,
  scaleLegacyMovementDelayMs,
  LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
  normalizeLegacyMovementSpeed,
  quantizeLegacyMovementSpeed,
  resolveLegacyMovementSpeedProfile
} from '../../src/legacy-runtime/legacyMovementSpeed';

describe('legacy movement speed profile', () => {
  test('normalizes slider values into a safe range', () => {
    expect(normalizeLegacyMovementSpeed(-1)).toBe(0);
    expect(normalizeLegacyMovementSpeed(2)).toBe(1);
    expect(normalizeLegacyMovementSpeed(Number.NaN)).toBe(LEGACY_MOVEMENT_SPEED_DEFAULT);
    expect(formatLegacyMovementSpeedPercent(0.625)).toBe('63%');
  });

  test('quantizes slider commits to bounded five-percent steps', () => {
    expect(quantizeLegacyMovementSpeed(0.01)).toBe(0);
    expect(quantizeLegacyMovementSpeed(0.026)).toBe(0.05);
    expect(quantizeLegacyMovementSpeed(0.625)).toBe(0.65);
    expect(quantizeLegacyMovementSpeed(0.974)).toBe(0.95);
    expect(quantizeLegacyMovementSpeed(0.976)).toBe(1);
  });

  test('maps higher speed to faster hold repeats while preserving ramp and turn delay', () => {
    const slow = resolveLegacyMovementSpeedProfile(0);
    const defaultSpeed = resolveLegacyMovementSpeedProfile(0.3);
    const fast = resolveLegacyMovementSpeedProfile(1);

    // Old formula values (132/112/78 repeat, 316/258/160 initial) divided by the 0.92 step-rate factor.
    expect(slow).toEqual({
      baseSpeed: 0,
      effectiveSpeed: 0,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 343,
      repeatIntervalMs: 143,
      turnDelayMs: 389
    });
    expect(defaultSpeed).toEqual({
      baseSpeed: 0.3,
      effectiveSpeed: 0.3,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 280,
      repeatIntervalMs: 122,
      turnDelayMs: 322
    });
    expect(fast).toEqual({
      baseSpeed: 1,
      effectiveSpeed: 1,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 174,
      repeatIntervalMs: 85,
      turnDelayMs: 208
    });
    expect(slow.repeatIntervalMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.repeatIntervalMs).toBeGreaterThan(fast.repeatIntervalMs);
    expect(defaultSpeed.initialDelayMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.turnDelayMs).toBeGreaterThan(defaultSpeed.initialDelayMs);
  });

  test('is 8 percent slower than the previous default timing (owner request 2026-11-12)', () => {
    expect(LEGACY_MOVEMENT_STEP_RATE_FACTOR).toBe(0.92);
    const profile = resolveLegacyMovementSpeedProfile(LEGACY_MOVEMENT_SPEED_DEFAULT);
    const oldRepeat = Math.round(132 - (Math.pow(LEGACY_MOVEMENT_SPEED_DEFAULT, 0.82) * 54));
    const oldInitial = Math.round(316 - (Math.pow(LEGACY_MOVEMENT_SPEED_DEFAULT, 0.82) * 156));
    expect(oldRepeat).toBe(128);
    expect(profile.repeatIntervalMs).toBe(Math.round(oldRepeat / 0.92));
    expect(profile.initialDelayMs).toBe(Math.round(oldInitial / 0.92));
    expect(scaleLegacyMovementDelayMs(104)).toBe(113);
  });

  test('speed is constant: it depends on the setting only, never on level or pace', () => {
    const profile = resolveLegacyMovementSpeedProfile as (speed: number, ...ignored: unknown[]) => ReturnType<typeof resolveLegacyMovementSpeedProfile>;
    for (const speed of [0, 0.04, 0.3, 0.5, 1]) {
      const baseline = profile(speed);
      for (const level of [1, 50, 99]) {
        for (const paceScore of [0, 25, 50, 100]) {
          expect(profile(speed, { completedCycles: '12', level, paceScore })).toEqual(baseline);
        }
      }
      expect(baseline.effectiveSpeed).toBe(baseline.baseSpeed);
    }
  });

  test('is monotonic across the whole slider and keeps the ramp ordering', () => {
    let previous = resolveLegacyMovementSpeedProfile(0);
    for (let step = 1; step <= 20; step += 1) {
      const next = resolveLegacyMovementSpeedProfile(step * LEGACY_MOVEMENT_SPEED_STEP);
      expect(next.repeatIntervalMs).toBeLessThanOrEqual(previous.repeatIntervalMs);
      expect(next.initialDelayMs).toBeLessThanOrEqual(previous.initialDelayMs);
      expect(next.initialDelayMs).toBeGreaterThan(next.repeatIntervalMs);
      expect(next.turnDelayMs).toBeGreaterThan(next.initialDelayMs);
      previous = next;
    }
    expect(previous.repeatIntervalMs).toBe(85);
  });
});
