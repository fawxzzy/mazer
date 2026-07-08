import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';

describe('legacy generation diagnostics contract', () => {
  test('attaches build-kind and process-stage metadata to runtime mazes', () => {
    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.generation?.budget).toEqual({
      scale: 50,
      checkpointModifier: 0.35,
      checkpointCount: 67,
      shortcutCountModifier: 0.13,
      shortcutCount: 6,
      shortcutStageEnabled: true
    });
    expect(menuMaze.source).toBe('menu-generated');
    expect(menuMaze.generation?.buildKind).toBe('menu-generated');
    expect(menuMaze.generation?.gate).toEqual({
      entryStageId: 0,
      waitsForLevelBuildingDelay: true,
      armsDelayStartOnQueue: true,
      consumesWhileUninitialized: true,
      consumesWhileInitialized: false,
      requiresLevelBuildingStartTime: true,
      requiresLevelBuildingDelayStartedFlag: true,
      levelBuildingDelayDurationMs: null,
      levelBuildingDelayDurationSource: 'legacy-variable-unrecovered',
      initializedResetBypassesDelayGate: true,
      resetsLevelBuildingTimerAfterConsume: true
    });
    expect(menuMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(menuMaze.pathBuilderStats?.topology).toBe('legacy-checkpoint-path-builder');
    expect(menuMaze.shortcutStats?.requested).toBe(6);
    expect(menuMaze.generationBuildTrace?.start).toEqual(menuMaze.start);
    expect(menuMaze.generationBuildTrace?.finalGoal).toEqual(menuMaze.goal);
    expect(menuMaze.generationBuildTrace?.pathTiles.length).toBe(menuMaze.pathBuilderStats?.pathTiles);
    expect(menuMaze.generationBuildTrace?.checkpointTiles.length).toBe(menuMaze.pathBuilderStats?.acceptedCheckpoints);
    expect(menuMaze.generationBuildTrace?.shortcutTiles.length).toBeLessThanOrEqual(menuMaze.shortcutStats?.created ?? 0);
    expect(menuMaze.generation?.stageCursor).toEqual({
      phase: 'consumed-finalized',
      currentStageId: 7,
      completionSignal: 'player-finalized',
      previousStageIds: [0, 3, 4, 5, 6],
      remainingStageIds: [8],
      processComplete: true
    });
    expect(menuMaze.generation?.executionPlan).toEqual([
      { id: 0, name: 'CreateGrid', completionSignal: 'grid-spawn-complete', advancesToStageId: 3, executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows', skipToStageIdWhenDisabled: null },
      { id: 3, name: 'MapPath', completionSignal: 'checkpoint-budget-exhausted', advancesToStageId: 4, executionKind: 'checkpoint-pass', batchSize: 1, batchUnit: 'checkpoint-passes', skipToStageIdWhenDisabled: null },
      { id: 4, name: 'CreatePath', completionSignal: 'path-array-exhausted', advancesToStageId: 5, executionKind: 'path-batch', batchSize: 4, batchUnit: 'path-tiles', skipToStageIdWhenDisabled: null },
      { id: 5, name: 'CreateShortCuts', completionSignal: 'shortcut-budget-exhausted', advancesToStageId: 6, executionKind: 'shortcut-attempt', batchSize: 1, batchUnit: 'shortcut-attempts', skipToStageIdWhenDisabled: 6 },
      { id: 6, name: 'Draw', completionSignal: 'draw-iteration-complete', advancesToStageId: 7, executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows', skipToStageIdWhenDisabled: null },
      { id: 7, name: 'Finalize', completionSignal: 'player-finalized', advancesToStageId: null, executionKind: 'finalize-state', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 8, name: 'Reset', completionSignal: 'menu-reset-delay-rearmed', advancesToStageId: 0, executionKind: 'reset-branch', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null }
    ]);
    expect(playMaze.generation?.budget).toEqual({
      scale: 50,
      checkpointModifier: 0.35,
      checkpointCount: 67,
      shortcutCountModifier: 0.18,
      shortcutCount: 9,
      shortcutStageEnabled: true
    });
    expect(playMaze.generation?.buildKind).toBe('play-generated');
    expect(playMaze.generation?.gate).toEqual({
      entryStageId: 0,
      waitsForLevelBuildingDelay: true,
      armsDelayStartOnQueue: true,
      consumesWhileUninitialized: true,
      consumesWhileInitialized: false,
      requiresLevelBuildingStartTime: true,
      requiresLevelBuildingDelayStartedFlag: true,
      levelBuildingDelayDurationMs: null,
      levelBuildingDelayDurationSource: 'legacy-variable-unrecovered',
      initializedResetBypassesDelayGate: true,
      resetsLevelBuildingTimerAfterConsume: true
    });
    expect(playMaze.generation?.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(playMaze.generation?.stageCursor).toEqual({
      phase: 'consumed-finalized',
      currentStageId: 7,
      completionSignal: 'player-finalized',
      previousStageIds: [0, 3, 4, 5, 6],
      remainingStageIds: [8],
      processComplete: true
    });
    expect(playMaze.generation?.executionPlan).toEqual([
      { id: 0, name: 'CreateGrid', completionSignal: 'grid-spawn-complete', advancesToStageId: 3, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 3, name: 'MapPath', completionSignal: 'checkpoint-budget-exhausted', advancesToStageId: 4, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 4, name: 'CreatePath', completionSignal: 'path-array-exhausted', advancesToStageId: 5, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 5, name: 'CreateShortCuts', completionSignal: 'shortcut-budget-exhausted', advancesToStageId: 6, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: 6 },
      { id: 6, name: 'Draw', completionSignal: 'draw-iteration-complete', advancesToStageId: 7, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 7, name: 'Finalize', completionSignal: 'player-finalized', advancesToStageId: null, executionKind: 'finalize-state', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 8, name: 'Reset', completionSignal: 'play-reset-template-return', advancesToStageId: null, executionKind: 'reset-branch', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null }
    ]);
  });

  test('publishes shortcut-disabled stage transitions without impossible process-5 edges', () => {
    const menuSmallMaze = createLegacyRuntimeMazeForMode('menu', 35, 3749);
    const playSmallMaze = createLegacyRuntimeMazeForMode('play', 35, 3749);

    expect(menuSmallMaze.generation?.budget.shortcutStageEnabled).toBe(false);
    expect(playSmallMaze.generation?.budget.shortcutStageEnabled).toBe(false);
    expect(menuSmallMaze.generation?.processStageIds).toEqual([0, 3, 4, 6, 7, 8]);
    expect(playSmallMaze.generation?.processStageIds).toEqual([0, 3, 4, 6, 7, 8]);
    expect(menuSmallMaze.generation?.executionPlan.find((stage) => stage.id === 4)).toMatchObject({
      advancesToStageId: 6,
      completionSignal: 'path-array-exhausted'
    });
    expect(playSmallMaze.generation?.executionPlan.find((stage) => stage.id === 4)).toMatchObject({
      advancesToStageId: 6,
      completionSignal: 'path-array-exhausted'
    });
    expect(menuSmallMaze.generation?.executionPlan.some((stage) => stage.id === 5)).toBe(false);
    expect(playSmallMaze.generation?.executionPlan.some((stage) => stage.id === 5)).toBe(false);
  });
});
