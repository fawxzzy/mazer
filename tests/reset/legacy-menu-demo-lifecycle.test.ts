import { describe, expect, test } from 'vitest';
import { isTileFloor } from '../../src/domain/maze';
import { createLegacyMenuMaze, createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoGoalResetRequest,
  createLegacyMenuDemoBootstrap,
  isFixedLegacyMenuSnapshot
} from '../../src/legacy-runtime/legacyMenuDemoLifecycle';

describe('legacy menu demo lifecycle', () => {
  test('treats the fixed front-door maze as the snapshot bootstrap path', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, true, 16);

    expect(isFixedLegacyMenuSnapshot(menuMaze)).toBe(true);
    expect(bootstrap.config.behavior.enableRunnerMistakes).toBe(false);
    expect(bootstrap.config.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);
    expect(bootstrap.config.behavior.prerollSteps).toBe(0);
    expect(bootstrap.state.phase).toBe('explore');
    expect(bootstrap.state.cue).toBe('spawn');
    expect(bootstrap.state.cue).not.toBe('reset');
    expect(bootstrap.state.cue).not.toBe('goal');
    expect(bootstrap.state.currentIndex).toBe(bootstrap.episode.raster.startIndex);
    expect(bootstrap.state.pathCursor).toBe(0);
    expect(bootstrap.player).toEqual(menuMaze.start);
    expect(bootstrap.trail).toEqual([menuMaze.start]);
  });

  test('keeps generated mazes on the generic demo config path', () => {
    const playMaze = createLegacyMaze(50, 3749);
    const bootstrap = createLegacyMenuDemoBootstrap(playMaze, false, 16);

    expect(isFixedLegacyMenuSnapshot(playMaze)).toBe(false);
    expect(bootstrap.config.behavior.enableRunnerMistakes).toBe(false);
    expect(bootstrap.config.behavior.prerollSteps).toBe(0);
    expect(bootstrap.config.cadence.goalHoldMs).toBe(0);
    expect(bootstrap.config.cadence.resetHoldMs).toBe(0);
    expect(bootstrap.state.phase).toBe('explore');
    expect(bootstrap.state.pathCursor).toBe(0);
    expect(bootstrap.player).toEqual(playMaze.start);
    expect(bootstrap.player).toEqual(bootstrap.trail.at(-1));
    expect(bootstrap.trail).toEqual([playMaze.start]);
    expect(isTileFloor(bootstrap.episode.raster.tiles, bootstrap.state.currentIndex)).toBe(true);
  });

  test('advances the menu demo frame through the shared trail/player projection', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, true, 16);
    const nextFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      bootstrap.state,
      bootstrap.config,
      true,
      16
    );

    expect(nextFrame.delayMs).toBeGreaterThan(0);
    expect(nextFrame.state.currentIndex).not.toBe(bootstrap.state.currentIndex);
    expect(nextFrame.trail.length).toBeGreaterThan(0);
    expect(nextFrame.trail.length).toBeLessThanOrEqual(16);
  });

  test('bounds the fixed menu bootstrap trail when trail fade is enabled', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const fadedBootstrap = createLegacyMenuDemoBootstrap(menuMaze, true, 3);
    const persistentBootstrap = createLegacyMenuDemoBootstrap(menuMaze, false, 3);

    expect(fadedBootstrap.trail).toHaveLength(1);
    expect(fadedBootstrap.trail.at(-1)).toEqual(fadedBootstrap.player);
    expect(persistentBootstrap.trail).toHaveLength(1);
    expect(persistentBootstrap.trail.at(-1)).toEqual(persistentBootstrap.player);
  });

  test('bounds the menu demo advance trail when trail fade is enabled', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, false, 3);
    const fadedFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      bootstrap.state,
      bootstrap.config,
      true,
      3
    );
    const persistentFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      bootstrap.state,
      bootstrap.config,
      false,
      3
    );

    expect(fadedFrame.trail).toHaveLength(2);
    expect(fadedFrame.trail.at(-1)).toEqual(fadedFrame.player);
    expect(persistentFrame.trail).toHaveLength(2);
    expect(persistentFrame.trail.at(-1)).toEqual(persistentFrame.player);
  });

  test('keeps the fixed front-door snapshot on the clean solver attract path', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, false, 16);
    let state = bootstrap.state;
    const seenCues = new Set<string>([state.cue]);

    for (let step = 0; step < 512; step += 1) {
      const nextFrame = advanceLegacyMenuDemoFrame(
        bootstrap.episode,
        state,
        bootstrap.config,
        false,
        16
      );
      state = nextFrame.state;
      seenCues.add(state.cue);
      if (state.phase === 'goal-hold') {
        break;
      }
    }

    expect(state.phase).toBe('goal-hold');
    expect(seenCues.has('dead-end')).toBe(false);
    expect(seenCues.has('backtrack')).toBe(false);
    expect(seenCues.has('reacquire')).toBe(false);
  });

  test('regenerates the fixed menu maze after a clean goal completion instead of AI-only reset replay', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, false, 16);
    let state = bootstrap.state;
    let goalFrame: ReturnType<typeof advanceLegacyMenuDemoFrame> | null = null;

    for (let step = 0; step < 512; step += 1) {
      const nextFrame = advanceLegacyMenuDemoFrame(
        bootstrap.episode,
        state,
        bootstrap.config,
        false,
        16
      );
      state = nextFrame.state;
      if (state.phase === 'goal-hold') {
        goalFrame = nextFrame;
        break;
      }
    }

    expect(goalFrame).not.toBeNull();
    expect(goalFrame?.state.resetReason).not.toBe('ai-path-exhausted');

    const resetFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      goalFrame!.state,
      bootstrap.config,
      false,
      16
    );
    const regenerateFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      resetFrame.state,
      bootstrap.config,
      false,
      16
    );

    expect(resetFrame.state.resetReason).toBe('goal');
    expect(regenerateFrame.shouldRegenerateMaze).toBe(true);
    expect(regenerateFrame.state.currentIndex).toBe(bootstrap.episode.raster.startIndex);
    expect(regenerateFrame.state.aiLogicSwitch).toBe(false);
  });

  test('creates an immediate process-8 menu reset request after goal reset-hold has elapsed', () => {
    const request = createLegacyMenuDemoGoalResetRequest(4200);

    expect(request.mode).toBe('menu');
    expect(request.reason).toBe('goal');
    expect(request.action).toBe('regenerate-maze');
    expect(request.dueAtMs).toBe(4200);
    expect(request.entry.entryStageId).toBe(8);
    expect(request.entry.rearmsDelayStart).toBe(true);
    expect(request.entry.returnsToTemplateLevel).toBe(false);
  });
});
