import { describe, expect, test } from 'vitest';
import {
  consumeLegacyGenerationRequest,
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  createLegacyRuntimeMazeForMode,
  LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID,
  LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS,
  resolveLegacyGenerationExecutionPlan,
  resolveLegacyGenerationBudgetContract,
  resolveLegacyGenerationTickGateContract,
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

  test('makes the legacy checkpoint and shortcut budget formulas explicit for menu and play lanes', () => {
    expect(resolveLegacyGenerationBudgetContract('menu', 24)).toEqual({
      scale: 25,
      checkpointModifier: 0.35,
      checkpointCount: 33,
      shortcutCountModifier: 0.13,
      shortcutCount: 3,
      shortcutStageEnabled: false
    });

    expect(resolveLegacyGenerationBudgetContract('play', 50)).toEqual({
      scale: 50,
      checkpointModifier: 0.35,
      checkpointCount: 67,
      shortcutCountModifier: 0.18,
      shortcutCount: 9,
      shortcutStageEnabled: true
    });
  });

  test('makes the legacy delay-gated process-0 entry contract explicit for queued generation', () => {
    expect(resolveLegacyGenerationTickGateContract()).toEqual({
      entryStageId: 0,
      waitsForLevelBuildingDelay: true,
      armsDelayStartOnQueue: true,
      consumesWhileUninitialized: true,
      consumesWhileInitialized: false,
      resetsLevelBuildingTimerAfterConsume: true
    });
  });

  test('makes the legacy 0/3/4/5/6 execution cadence explicit for menu and play generation', () => {
    expect(resolveLegacyGenerationExecutionPlan('play', 50)).toEqual([
      { id: 0, name: 'CreateGrid', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 3, name: 'MapPath', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 4, name: 'CreatePath', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 5, name: 'CreateShortCuts', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 6, name: 'Draw', executionKind: 'full-stage', batchSize: null, batchUnit: null },
      { id: 7, name: 'Finalize', executionKind: 'finalize-state', batchSize: null, batchUnit: null },
      { id: 8, name: 'Reset', executionKind: 'reset-branch', batchSize: null, batchUnit: null }
    ]);

    expect(resolveLegacyGenerationExecutionPlan('menu', 50)).toEqual([
      { id: 0, name: 'CreateGrid', executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows' },
      { id: 3, name: 'MapPath', executionKind: 'checkpoint-pass', batchSize: 1, batchUnit: 'checkpoint-passes' },
      { id: 4, name: 'CreatePath', executionKind: 'path-batch', batchSize: 4, batchUnit: 'path-tiles' },
      { id: 5, name: 'CreateShortCuts', executionKind: 'shortcut-attempt', batchSize: 1, batchUnit: 'shortcut-attempts' },
      { id: 6, name: 'Draw', executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows' },
      { id: 7, name: 'Finalize', executionKind: 'finalize-state', batchSize: null, batchUnit: null },
      { id: 8, name: 'Reset', executionKind: 'reset-branch', batchSize: null, batchUnit: null }
    ]);
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
    expect(menuBootRequest.budget).toEqual({
      scale: 50,
      checkpointModifier: 0.35,
      checkpointCount: 67,
      shortcutCountModifier: 0.13,
      shortcutCount: 6,
      shortcutStageEnabled: true
    });
    expect(menuBootRequest.gate).toEqual({
      entryStageId: 0,
      waitsForLevelBuildingDelay: true,
      armsDelayStartOnQueue: true,
      consumesWhileUninitialized: true,
      consumesWhileInitialized: false,
      resetsLevelBuildingTimerAfterConsume: true
    });
    expect(menuBootRequest.buildKind).toBe('menu-snapshot');
    expect(menuBootRequest.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(menuBootRequest.executionPlan[0]).toEqual({
      id: 0,
      name: 'CreateGrid',
      executionKind: 'row-slice',
      batchSize: 1,
      batchUnit: 'rows'
    });
    expect(goalResetRequest.seed).toBe(3750);
    expect(goalResetRequest.budget.shortcutCountModifier).toBe(0.13);
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
    expect(playMaze.generation?.executionPlan[0]).toEqual({
      id: 0,
      name: 'CreateGrid',
      executionKind: 'full-stage',
      batchSize: null,
      batchUnit: null
    });
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
