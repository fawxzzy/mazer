import { describe, expect, test } from 'vitest';
import {
  formatLegacyMovementSpeedPercent,
  normalizeLegacyMovementSpeed,
  quantizeLegacyMovementSpeed,
  resolveLegacyMovementSpeedProfile
} from '../../src/legacy-runtime/legacyMovementSpeed';

describe('legacy movement speed profile', () => {
  test('normalizes slider values into a safe range', () => {
    expect(normalizeLegacyMovementSpeed(-1)).toBe(0);
    expect(normalizeLegacyMovementSpeed(2)).toBe(1);
    expect(normalizeLegacyMovementSpeed(Number.NaN)).toBe(0.3);
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

    expect(slow).toEqual({
      initialDelayMs: 316,
      repeatIntervalMs: 132,
      turnDelayMs: 362
    });
    expect(defaultSpeed).toEqual({
      initialDelayMs: 258,
      repeatIntervalMs: 112,
      turnDelayMs: 300
    });
    expect(fast).toEqual({
      initialDelayMs: 160,
      repeatIntervalMs: 78,
      turnDelayMs: 194
    });
    expect(slow.repeatIntervalMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.repeatIntervalMs).toBeGreaterThan(fast.repeatIntervalMs);
    expect(defaultSpeed.initialDelayMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.turnDelayMs).toBeGreaterThan(defaultSpeed.initialDelayMs);
  });
});
