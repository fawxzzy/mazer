import { describe, expect, test } from 'vitest';
import {
  ACTIVE_PLAY_GOAL_RESET_HOLD_MS,
  createLegacyResetRequest,
  hasPendingLegacyResetRequest,
  resolveLegacyResetEntryContract,
  resolveLegacyResetAction,
  shouldConsumeLegacyResetRequest
} from '../../src/legacy-runtime/legacyPlayLifecycle';

describe('legacy play lifecycle', () => {
  test('uses the legacy goal-reset hold duration', () => {
    expect(ACTIVE_PLAY_GOAL_RESET_HOLD_MS).toBe(340);
  });

  test('uses the reset request itself as the active-play return timer', () => {
    const playReset = createLegacyResetRequest({
      mode: 'play',
      nowMs: 1200,
      reason: 'goal'
    });

    expect(hasPendingLegacyResetRequest(playReset)).toBe(true);
    expect(playReset.dueAtMs).toBe(1540);
    expect(shouldConsumeLegacyResetRequest(playReset, 1539)).toBe(false);
    expect(shouldConsumeLegacyResetRequest(playReset, 1540)).toBe(true);
  });

  test('makes the initialized process-8 reset entry contract explicit for perpetual play and menu branches', () => {
    expect(resolveLegacyResetEntryContract('play')).toEqual({
      entryStageId: 8,
      bypassesLevelBuildingDelay: true,
      clearsResetFlagOnConsume: true,
      consumesWhileInitialized: true,
      rearmsDelayStart: false,
      returnsToTemplateLevel: false
    });
    expect(resolveLegacyResetEntryContract('menu')).toEqual({
      entryStageId: 8,
      bypassesLevelBuildingDelay: true,
      clearsResetFlagOnConsume: true,
      consumesWhileInitialized: true,
      rearmsDelayStart: true,
      returnsToTemplateLevel: false
    });
  });

  test('makes the process-8 reset branch explicit for play-loop and menu goals', () => {
    const playReset = createLegacyResetRequest({
      mode: 'play',
      nowMs: 1200,
      reason: 'goal'
    });
    const menuReset = createLegacyResetRequest({
      mode: 'menu',
      nowMs: 1200,
      delayMs: 620,
      reason: 'goal'
    });

    expect(resolveLegacyResetAction('play')).toBe('regenerate-maze');
    expect(resolveLegacyResetAction('menu')).toBe('regenerate-maze');
    expect(hasPendingLegacyResetRequest(playReset)).toBe(true);
    expect(playReset.entry.entryStageId).toBe(8);
    expect(playReset.entry.bypassesLevelBuildingDelay).toBe(true);
    expect(playReset.entry.returnsToTemplateLevel).toBe(false);
    expect(playReset.dueAtMs).toBe(1540);
    expect(playReset.action).toBe('regenerate-maze');
    expect(menuReset.entry.rearmsDelayStart).toBe(true);
    expect(menuReset.dueAtMs).toBe(1820);
    expect(menuReset.action).toBe('regenerate-maze');
    expect(shouldConsumeLegacyResetRequest(playReset, 1539)).toBe(false);
    expect(shouldConsumeLegacyResetRequest(playReset, 1540)).toBe(true);
    expect(shouldConsumeLegacyResetRequest(menuReset, 1819)).toBe(false);
    expect(shouldConsumeLegacyResetRequest(menuReset, 1820)).toBe(true);
  });
});
