import { describe, expect, test } from 'vitest';
import {
  ACTIVE_PLAY_GOAL_RESET_HOLD_MS,
  hasPendingLegacyPlayResetReturn,
  scheduleLegacyPlayResetReturnAtMs,
  shouldConsumeLegacyPlayResetReturn
} from '../../src/legacy-runtime/legacyPlayLifecycle';

describe('legacy play lifecycle', () => {
  test('uses the legacy goal-reset hold duration', () => {
    expect(ACTIVE_PLAY_GOAL_RESET_HOLD_MS).toBe(340);
  });

  test('tracks whether a play reset return is pending', () => {
    expect(hasPendingLegacyPlayResetReturn('play', 100)).toBe(true);
    expect(hasPendingLegacyPlayResetReturn('play', 0)).toBe(false);
    expect(hasPendingLegacyPlayResetReturn('menu', 100)).toBe(false);
  });

  test('consumes the play reset return only after the hold elapses', () => {
    expect(shouldConsumeLegacyPlayResetReturn('play', 1500, 1499)).toBe(false);
    expect(shouldConsumeLegacyPlayResetReturn('play', 1500, 1500)).toBe(true);
    expect(shouldConsumeLegacyPlayResetReturn('menu', 1500, 1800)).toBe(false);
  });

  test('schedules the reset return from the current scene time', () => {
    expect(scheduleLegacyPlayResetReturnAtMs(1200)).toBe(1540);
    expect(scheduleLegacyPlayResetReturnAtMs(1200, 0)).toBe(1200);
  });
});
