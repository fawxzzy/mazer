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

    // Old formula values (132/112/78 repeat, 316/258/160 initial) divided by the 0.85 step-rate factor.
    expect(slow).toEqual({
      baseSpeed: 0,
      effectiveSpeed: 0,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 372,
      repeatIntervalMs: 155,
      turnDelayMs: 418
    });
    expect(defaultSpeed).toEqual({
      baseSpeed: 0.3,
      effectiveSpeed: 0.3,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 304,
      repeatIntervalMs: 132,
      turnDelayMs: 346
    });
    expect(fast).toEqual({
      baseSpeed: 1,
      effectiveSpeed: 1,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 188,
      repeatIntervalMs: 92,
      turnDelayMs: 222
    });
    expect(slow.repeatIntervalMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.repeatIntervalMs).toBeGreaterThan(fast.repeatIntervalMs);
    expect(defaultSpeed.initialDelayMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.turnDelayMs).toBeGreaterThan(defaultSpeed.initialDelayMs);
  });

  test('step rate is 0.85 of the unscaled timing: one constant, applied once (owner requests 2026-11-12 and 2026-11-19)', () => {
    expect(LEGACY_MOVEMENT_STEP_RATE_FACTOR).toBe(0.85);
    const profile = resolveLegacyMovementSpeedProfile(LEGACY_MOVEMENT_SPEED_DEFAULT);
    const oldRepeat = Math.round(132 - (Math.pow(LEGACY_MOVEMENT_SPEED_DEFAULT, 0.82) * 54));
    const oldInitial = Math.round(316 - (Math.pow(LEGACY_MOVEMENT_SPEED_DEFAULT, 0.82) * 156));
    expect(oldRepeat).toBe(128);
    expect(profile.repeatIntervalMs).toBe(Math.round(oldRepeat / 0.85));
    expect(profile.initialDelayMs).toBe(Math.round(oldInitial / 0.85));
    // Resolved values at the default speed and the two touch-stick caps, in whole ms.
    expect(profile.repeatIntervalMs).toBe(151);
    expect(profile.initialDelayMs).toBe(359);
    expect(scaleLegacyMovementDelayMs(104)).toBe(122);
    expect(scaleLegacyMovementDelayMs(144)).toBe(169);
  });

  test('real step periods vs the 2026-11-19 baseline: the stick is 5 percent slower than the 116.7 ms the frame grid really gave it', () => {
    const previousStickRealMs = 7 * (1000 / 60); // 113 ms nominal landed on 7 frames at 60 Hz and on 14 frames at 120 Hz
    const nextStickMs = scaleLegacyMovementDelayMs(104);
    expect(nextStickMs / previousStickRealMs).toBeGreaterThan(1.04);
    expect(nextStickMs / previousStickRealMs).toBeLessThan(1.06);
    // The d-pad / hold repeat: equal to its old 60 Hz real period (9 frames = 150 ms), slower than its 120 Hz one (141.7 ms).
    const dpadMs = resolveLegacyMovementSpeedProfile(LEGACY_MOVEMENT_SPEED_DEFAULT).repeatIntervalMs;
    expect(dpadMs / 150).toBeGreaterThan(0.99);
    expect(dpadMs / 150).toBeLessThan(1.02);
    expect(dpadMs / (17 * (1000 / 120))).toBeGreaterThan(1.05);
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
    expect(previous.repeatIntervalMs).toBe(92);
  });
});
