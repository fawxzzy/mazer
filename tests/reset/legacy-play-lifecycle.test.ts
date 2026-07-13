import { describe, expect, test } from 'vitest';
import {
  ACTIVE_PLAY_GOAL_RESET_HOLD_MS,
  createLegacyEndlessLifecycleState,
  createLegacyResetRequest,
  hasPendingLegacyResetRequest,
  resolveLegacyEndlessLifecycleTransition,
  resolveLegacyPlayLifecycleSnapshot,
  resolveLegacyResetEntryContract,
  resolveLegacyResetAction,
  shouldConsumeLegacyResetRequest
} from '../../src/legacy-runtime/legacyPlayLifecycle';

describe('legacy play lifecycle', () => {
  test('keeps an Endless checkpoint while a failed attempt resets only the current level', () => {
    const started = createLegacyEndlessLifecycleState();
    const completed = resolveLegacyEndlessLifecycleTransition(started, 'complete');
    const failed = resolveLegacyEndlessLifecycleTransition(completed.state, 'fail-current-attempt');

    expect(completed).toMatchObject({
      effect: 'advance-checkpoint',
      state: { checkpointLevel: 0, currentLevel: 1, attempt: 1, status: 'active', version: 1 }
    });
    expect(failed).toMatchObject({
      effect: 'reset-current-attempt',
      state: { checkpointLevel: 0, currentLevel: 1, attempt: 2, status: 'active', version: 1 }
    });
  });

  test('marks an Endless run abandoned without losing its next checkpoint-resume target', () => {
    const afterCompletion = resolveLegacyEndlessLifecycleTransition(
      createLegacyEndlessLifecycleState(7),
      'complete'
    ).state;
    const abandoned = resolveLegacyEndlessLifecycleTransition(afterCompletion, 'abandon');
    const resumed = resolveLegacyEndlessLifecycleTransition(abandoned.state, 'resume');

    expect(abandoned).toMatchObject({
      effect: 'none',
      state: { checkpointLevel: 7, currentLevel: 8, attempt: 1, status: 'abandoned' }
    });
    expect(resumed).toMatchObject({
      effect: 'resume-current-attempt',
      state: { checkpointLevel: 7, currentLevel: 8, attempt: 1, status: 'active' }
    });
  });

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

  test('projects explicit play lifecycle phases from draw, reset, and input state', () => {
    expect(resolveLegacyPlayLifecycleSnapshot({
      drawPhase: 'building',
      generationPending: false,
      handoffActive: false,
      mode: 'play',
      nextSeedQueued: false,
      overlayOpen: false,
      playerAlpha: 1,
      resetPending: false,
      stagedBuildVisible: true,
      timerStarted: true,
      trailAlpha: 1,
      trailLength: 1
    })).toMatchObject({
      phase: 'building',
      inputLocked: true,
      timerRunning: false,
      playerVisible: false,
      compassSpinExpected: true
    });

    expect(resolveLegacyPlayLifecycleSnapshot({
      drawPhase: 'settled',
      generationPending: false,
      handoffActive: false,
      mode: 'play',
      nextSeedQueued: false,
      overlayOpen: false,
      playerAlpha: 1,
      resetPending: false,
      stagedBuildVisible: false,
      timerStarted: true,
      trailAlpha: 1,
      trailLength: 1
    })).toMatchObject({
      phase: 'ready',
      inputLocked: false,
      timerRunning: true,
      playerVisible: true,
      trailVisible: true
    });

    expect(resolveLegacyPlayLifecycleSnapshot({
      drawPhase: 'settled',
      generationPending: false,
      handoffActive: false,
      mode: 'play',
      nextSeedQueued: false,
      overlayOpen: false,
      playerAlpha: 1,
      resetPending: true,
      stagedBuildVisible: false,
      timerStarted: true,
      trailAlpha: 1,
      trailLength: 8
    })).toMatchObject({
      phase: 'goal-hold',
      inputLocked: true,
      timerRunning: false
    });

    expect(resolveLegacyPlayLifecycleSnapshot({
      drawPhase: 'deconstructing',
      generationPending: true,
      handoffActive: true,
      mode: 'play',
      nextSeedQueued: true,
      overlayOpen: false,
      playerAlpha: 0,
      resetPending: false,
      stagedBuildVisible: false,
      timerStarted: true,
      trailAlpha: 0,
      trailLength: 8
    })).toMatchObject({
      phase: 'handoff',
      inputLocked: true,
      nextSeedQueued: true,
      playerVisible: false,
      trailVisible: false,
      compassSpinExpected: true
    });

    expect(resolveLegacyPlayLifecycleSnapshot({
      drawPhase: 'deconstructing',
      generationPending: true,
      handoffActive: false,
      mode: 'play',
      nextSeedQueued: true,
      overlayOpen: false,
      playerAlpha: 0,
      resetPending: false,
      stagedBuildVisible: true,
      timerStarted: true,
      trailAlpha: 0,
      trailLength: 8
    })).toMatchObject({
      phase: 'deconstructing',
      inputLocked: true,
      nextSeedQueued: true,
      compassSpinExpected: true
    });
  });
});
