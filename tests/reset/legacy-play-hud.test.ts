import { describe, expect, test } from 'vitest';
import {
  formatLegacyHudClock,
  resolveLegacyFrozenElapsedMs,
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

  test('centers the timer at the true horizontal screen center', () => {
    const frame = resolveLegacyPlayHudFrame({
      elapsedMs: 62_100,
      layoutWidth: 1280
    });

    expect(frame.timerText).toBe('1:02');
    // The compass used to anchor the true horizontal center, with the timer
    // sitting beside it -- now that the compass is gone, the timer itself
    // takes the centered slot.
    expect(frame.timerBounds).toMatchObject({
      left: 584,
      top: 10,
      width: 112,
      height: 38
    });
    expect(frame.bounds).toEqual(frame.timerBounds);
  });

  test('pushes the HUD row below the device safe-area top inset', () => {
    const frame = resolveLegacyPlayHudFrame({
      elapsedMs: 0,
      layoutWidth: 390,
      safeAreaTop: 44
    });

    expect(frame.timerBounds.top).toBe(54);
  });
});
