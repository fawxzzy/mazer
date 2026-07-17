import { describe, expect, test } from 'vitest';
import {
  formatLegacyHudClock,
  resolveLegacyCompassSpinFrame,
  resolveLegacyFrozenElapsedMs,
  resolveLegacyHudArrowAngle,
  resolveLegacyPlayHudFrame
} from '../../src/legacy-runtime/legacyPlayHud';

describe('legacy play HUD', () => {
  test('formats elapsed world time as M:SS', () => {
    expect(formatLegacyHudClock(-100)).toBe('0:00');
    expect(formatLegacyHudClock(999)).toBe('0:00');
    expect(formatLegacyHudClock(1_000)).toBe('0:01');
    expect(formatLegacyHudClock(61_200)).toBe('1:01');
    expect(formatLegacyHudClock(600_000)).toBe('0:00');
  });

  test('freezes elapsed time at the exact goal-arrival timestamp', () => {
    expect(resolveLegacyFrozenElapsedMs({
      nowMs: 18_000,
      startedAtMs: 10_000
    })).toBe(8_000);
    expect(resolveLegacyFrozenElapsedMs({
      completedAtMs: 16_240,
      nowMs: 99_000,
      startedAtMs: 10_000
    })).toBe(6_240);
  });

  test('points the goal arrow from player screen position toward the end tile', () => {
    expect(resolveLegacyHudArrowAngle({ x: 10, y: 10 }, { x: 20, y: 10 })).toBeCloseTo(0);
    expect(resolveLegacyHudArrowAngle({ x: 10, y: 10 }, { x: 10, y: 20 })).toBeCloseTo(Math.PI / 2);
    expect(resolveLegacyHudArrowAngle({ x: 10, y: 10 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI);
  });

  test('returns bounded timer and arrow proof rectangles for diagnostics', () => {
    const frame = resolveLegacyPlayHudFrame({
      elapsedMs: 62_100,
      layoutWidth: 1280,
      playerScreen: { x: 100, y: 100 },
      goalScreen: { x: 160, y: 100 }
    });

    expect(frame.timerText).toBe('1:02');
    expect(frame.timerBounds).toMatchObject({
      left: 584,
      top: 10,
      width: 112,
      height: 38
    });
    expect(frame.arrowOrigin).toEqual({ x: 1246, y: 30 });
    expect(frame.arrowAngleRadians).toBeCloseTo(0);
    expect(frame.arrowAngleDegrees).toBeCloseTo(0);
    expect(frame.arrowBounds).toMatchObject({
      left: 1224,
      top: 8,
      width: 44,
      height: 44
    });
    expect(frame.arrowBounds.left).toBeLessThanOrEqual(frame.arrowOrigin.x);
    expect(frame.arrowBounds.right).toBeGreaterThan(frame.arrowTip.x);
    expect(frame.bounds.left).toBe(frame.timerBounds.left);
    expect(frame.bounds.right).toBe(frame.arrowBounds.right);
  });

  test('can pin the compass to an explicit touch-control center', () => {
    const frame = resolveLegacyPlayHudFrame({
      compassBounds: { left: 179, top: 719, width: 32, height: 32 },
      elapsedMs: 12_000,
      layoutWidth: 390,
      playerScreen: { x: 100, y: 100 },
      goalScreen: { x: 100, y: 160 }
    });

    expect(frame.arrowBounds).toMatchObject({
      left: 179,
      top: 719,
      width: 32,
      height: 32
    });
    expect(frame.arrowOrigin).toEqual({ x: 195, y: 735 });
    expect(frame.arrowAngleRadians).toBeCloseTo(Math.PI / 2);
  });

  test('eases the compass spin onto the true goal angle', () => {
    const start = resolveLegacyCompassSpinFrame({
      durationMs: 1_800,
      elapsedMs: 0,
      targetAngleRadians: Math.PI / 2,
      turns: 3.25
    });
    const middle = resolveLegacyCompassSpinFrame({
      durationMs: 1_800,
      elapsedMs: 900,
      targetAngleRadians: Math.PI / 2,
      turns: 3.25
    });
    const settled = resolveLegacyCompassSpinFrame({
      durationMs: 1_800,
      elapsedMs: 1_800,
      targetAngleRadians: Math.PI / 2,
      turns: 3.25
    });

    expect(start.active).toBe(true);
    expect(start.progress).toBe(0);
    expect(middle.active).toBe(true);
    expect(middle.angleRadians).not.toBeCloseTo(Math.PI / 2);
    expect(settled.active).toBe(false);
    expect(settled.progress).toBe(1);
    expect(settled.angleRadians).toBeCloseTo(Math.PI / 2);
  });
});
