import { describe, expect, test } from 'vitest';
import {
  consumeLegacyGenerationRequest,
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  createLegacyRuntimeMazeForMode,
  LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID,
  LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS,
  resolveLegacyGenerationProcessStageIds,
  resolveLegacyMazeBuildKind,
  shouldConsumeLegacyGenerationRequest,
  stepLegacyGenerationSeed
} from '../../src/legacy-runtime/legacyGenerationLifecycle';

describe('legacy generation lifecycle', () => {
  test('keeps the required process-count stages in legacy order', () => {
    expect(LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS).toEqual([0, 3, 4, 6, 7, 8]);
  });

  test('only inserts the shortcut stage for scales above 35', () => {
    expect(resolveLegacyGenerationProcessStageIds(35)).toEqual([0, 3, 4, 6, 7, 8]);
    expect(resolveLegacyGenerationProcessStageIds(36)).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(resolveLegacyGenerationProcessStageIds(50)).toContain(LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID);
  });

  test('routes menu and play mode to the correct maze builders', () => {
    expect(resolveLegacyMazeBuildKind('menu')).toBe('menu-snapshot');
    expect(resolveLegacyMazeBuildKind('play')).toBe('play-generated');

    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.size).toBe(25);
    expect(playMaze.size).toBeGreaterThan(25);
    expect(menuMaze.goal).toEqual({ x: 22, y: 22 });
    expect(playMaze.start).not.toEqual(playMaze.goal);
  });

  test('steps regeneration seeds deterministically', () => {
    expect(stepLegacyGenerationSeed(0)).toBe(1);
    expect(stepLegacyGenerationSeed(3749)).toBe(3750);
    expect(stepLegacyGenerationSeed(0xffffffff)).toBe(0);
  });

  test('creates explicit queued generation requests instead of collapsing every branch into immediate rebuilds', () => {
    const menuBootRequest = createLegacyGenerationRequest({
      currentSeed: 3749,
      dueAtMs: 1200,
      mode: 'menu',
      reason: 'boot-menu',
      scale: 50
    });
    const goalResetRequest = createLegacyGenerationRequest({
      currentSeed: 3749,
      dueAtMs: 1540,
      mode: 'menu',
      reason: 'menu-demo-goal-reset',
      scale: 50,
      stepSeed: true
    });

    expect(menuBootRequest.seed).toBe(3749);
    expect(menuBootRequest.buildKind).toBe('menu-snapshot');
    expect(menuBootRequest.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(goalResetRequest.seed).toBe(3750);
    expect(goalResetRequest.reason).toBe('menu-demo-goal-reset');
    expect(shouldConsumeLegacyGenerationRequest(goalResetRequest, 1539)).toBe(false);
    expect(shouldConsumeLegacyGenerationRequest(goalResetRequest, 1540)).toBe(true);
  });

  test('consumes queued generation requests through the legacy builder routing', () => {
    const playRequest = createLegacyGenerationRequest({
      currentSeed: 902,
      dueAtMs: 0,
      mode: 'play',
      reason: 'play-start',
      scale: 50
    });

    const playMaze = consumeLegacyGenerationRequest(playRequest, 50);

    expect(playMaze.generation?.buildKind).toBe('play-generated');
    expect(playMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(playMaze.seed).toBe(902);
  });

  test('makes legacy stage-7 finalize responsibilities explicit for play and menu requests', () => {
    const playRequest = createLegacyGenerationRequest({
      currentSeed: 902,
      dueAtMs: 0,
      mode: 'play',
      reason: 'play-start',
      scale: 50
    });
    const menuRequest = createLegacyGenerationRequest({
      currentSeed: 3749,
      dueAtMs: 0,
      mode: 'menu',
      reason: 'menu-return',
      scale: 50
    });

    const playState = consumeLegacyGenerationRequestState(playRequest, 50);
    const menuState = consumeLegacyGenerationRequestState(menuRequest, 50);

    expect(playState.startsPlayTimer).toBe(true);
    expect(playState.titleVisible).toBe(false);
    expect(playState.initialPlayer).toEqual(playState.maze.start);
    expect(playState.initialTrail).toEqual([playState.maze.start]);

    expect(menuState.startsPlayTimer).toBe(false);
    expect(menuState.titleVisible).toBe(true);
    expect(menuState.initialPlayer).toEqual(menuState.maze.start);
    expect(menuState.initialTrail).toEqual([menuState.maze.start]);
  });
});
