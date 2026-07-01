import { describe, expect, test } from 'vitest';
import {
  formatLegacyHudClock,
  resolveLegacyHudArrowAngle,
  resolveLegacyPlayHudFrame
} from '../../src/legacy-runtime/legacyPlayHud';

describe('legacy play HUD', () => {
  test('formats elapsed world time as M:SS', () => {
    expect(formatLegacyHudClock(-100)).toBe('0:00');
    expect(formatLegacyHudClock(999)).toBe('0:00');
    expect(formatLegacyHudClock(1_000)).toBe('0:01');
    expect(formatLegacyHudClock(61_200)).toBe('1:01');
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

    expect(frame.timerText).toBe('Time 1:02');
    expect(frame.timerBounds).toMatchObject({
      left: 14,
      top: 14,
      width: 118,
      height: 22
    });
    expect(frame.arrowOrigin).toEqual({ x: 1250, y: 22 });
    expect(frame.arrowAngleRadians).toBeCloseTo(0);
    expect(frame.arrowBounds.left).toBeLessThanOrEqual(frame.arrowOrigin.x);
    expect(frame.arrowBounds.right).toBeGreaterThan(frame.arrowTip.x);
    expect(frame.bounds.left).toBe(frame.timerBounds.left);
    expect(frame.bounds.right).toBe(frame.arrowBounds.right);
  });
});
