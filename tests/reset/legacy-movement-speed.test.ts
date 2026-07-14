import { describe, expect, test } from 'vitest';
import {
  formatLegacyMovementSpeedPercent,
  LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
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
      baseSpeed: 0,
      completedCycles: 0,
      contextApplied: false,
      effectiveSpeed: 0,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 316,
      level: 1,
      levelAdjustment: 0,
      paceAdjustment: 0,
      paceScore: 50,
      repeatIntervalMs: 132,
      turnDelayMs: 362
    });
    expect(defaultSpeed).toEqual({
      baseSpeed: 0.3,
      completedCycles: 0,
      contextApplied: false,
      effectiveSpeed: 0.3,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 258,
      level: 1,
      levelAdjustment: 0,
      paceAdjustment: 0,
      paceScore: 50,
      repeatIntervalMs: 112,
      turnDelayMs: 300
    });
    expect(fast).toEqual({
      baseSpeed: 1,
      completedCycles: 0,
      contextApplied: false,
      effectiveSpeed: 1,
      formulaVersion: LEGACY_MOVEMENT_PACE_PROFILE_VERSION,
      initialDelayMs: 160,
      level: 1,
      levelAdjustment: 0,
      paceAdjustment: 0,
      paceScore: 50,
      repeatIntervalMs: 78,
      turnDelayMs: 194
    });
    expect(slow.repeatIntervalMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.repeatIntervalMs).toBeGreaterThan(fast.repeatIntervalMs);
    expect(defaultSpeed.initialDelayMs).toBeGreaterThan(defaultSpeed.repeatIntervalMs);
    expect(defaultSpeed.turnDelayMs).toBeGreaterThan(defaultSpeed.initialDelayMs);
  });

  test('applies bounded level and established-pace adjustments without overriding speed endpoints', () => {
    const newPlayer = resolveLegacyMovementSpeedProfile(0.3, {
      completedCycles: 0,
      level: 99,
      paceScore: 100
    });
    const establishedFast = resolveLegacyMovementSpeedProfile(0.3, {
      completedCycles: 12,
      level: 99,
      paceScore: 100
    });
    const establishedSlow = resolveLegacyMovementSpeedProfile(0.3, {
      completedCycles: 12,
      level: 1,
      paceScore: 0
    });

    expect(newPlayer).toMatchObject({
      contextApplied: false,
      effectiveSpeed: 0.3,
      levelAdjustment: 0,
      paceAdjustment: 0
    });
    expect(establishedFast).toMatchObject({
      contextApplied: true,
      effectiveSpeed: 0.426,
      levelAdjustment: 0.1,
      paceAdjustment: 0.05
    });
    expect(establishedSlow).toMatchObject({
      contextApplied: true,
      effectiveSpeed: 0.258,
      levelAdjustment: 0,
      paceAdjustment: -0.05
    });
    expect(establishedFast.repeatIntervalMs).toBeLessThan(newPlayer.repeatIntervalMs);
    expect(establishedSlow.repeatIntervalMs).toBeGreaterThan(newPlayer.repeatIntervalMs);
    expect(resolveLegacyMovementSpeedProfile(0, {
      completedCycles: 12,
      level: 99,
      paceScore: 100
    }).effectiveSpeed).toBe(0);
    expect(resolveLegacyMovementSpeedProfile(1, {
      completedCycles: 12,
      level: 1,
      paceScore: 0
    }).effectiveSpeed).toBe(1);
  });
});
