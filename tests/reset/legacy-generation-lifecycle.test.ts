import { describe, expect, test } from 'vitest';
import {
  consumeLegacyGenerationRequest,
  consumeLegacyGenerationRequestState,
  createLegacyGenerationRequest,
  createLegacyMenuResetGenerationRequest,
  createLegacyPlayResetGenerationRequest,
  createLegacyRuntimeMazeForMode,
  LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID,
  LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS,
  resolveLegacyGenerationExecutionPlan,
  resolveLegacyGenerationBudgetContract,
  resolveLegacyGenerationStageCursor,
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
    expect(resolveLegacyGenerationBudgetContract('menu', 37)).toEqual({
      scale: 37,
      checkpointModifier: 0.35,
      checkpointCount: 49,
      shortcutCountModifier: 0.13,
      shortcutCount: 6,
      shortcutStageEnabled: true
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
      requiresLevelBuildingStartTime: true,
      requiresLevelBuildingDelayStartedFlag: true,
      levelBuildingDelayDurationMs: null,
      levelBuildingDelayDurationSource: 'legacy-variable-unrecovered',
      initializedResetBypassesDelayGate: true,
      resetsLevelBuildingTimerAfterConsume: true
    });
  });

  test('makes the legacy 0/3/4/5/6 execution cadence explicit for menu and play generation', () => {
    expect(resolveLegacyGenerationExecutionPlan('play', 50)).toEqual([
      { id: 0, name: 'CreateGrid', completionSignal: 'grid-spawn-complete', advancesToStageId: 3, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 3, name: 'MapPath', completionSignal: 'checkpoint-budget-exhausted', advancesToStageId: 4, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 4, name: 'CreatePath', completionSignal: 'path-array-exhausted', advancesToStageId: 5, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 5, name: 'CreateShortCuts', completionSignal: 'shortcut-budget-exhausted', advancesToStageId: 6, executionKind: 'full-stage', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: 6 },
      { id: 6, name: 'Draw', completionSignal: 'draw-iteration-complete', advancesToStageId: 7, executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows', skipToStageIdWhenDisabled: null },
      { id: 7, name: 'Finalize', completionSignal: 'player-finalized', advancesToStageId: null, executionKind: 'finalize-state', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 8, name: 'Reset', completionSignal: 'play-reset-template-return', advancesToStageId: null, executionKind: 'reset-branch', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null }
    ]);

    expect(resolveLegacyGenerationExecutionPlan('menu', 50)).toEqual([
      { id: 0, name: 'CreateGrid', completionSignal: 'grid-spawn-complete', advancesToStageId: 3, executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows', skipToStageIdWhenDisabled: null },
      { id: 3, name: 'MapPath', completionSignal: 'checkpoint-budget-exhausted', advancesToStageId: 4, executionKind: 'checkpoint-pass', batchSize: 1, batchUnit: 'checkpoint-passes', skipToStageIdWhenDisabled: null },
      { id: 4, name: 'CreatePath', completionSignal: 'path-array-exhausted', advancesToStageId: 5, executionKind: 'path-batch', batchSize: 4, batchUnit: 'path-tiles', skipToStageIdWhenDisabled: null },
      { id: 5, name: 'CreateShortCuts', completionSignal: 'shortcut-budget-exhausted', advancesToStageId: 6, executionKind: 'shortcut-attempt', batchSize: 1, batchUnit: 'shortcut-attempts', skipToStageIdWhenDisabled: 6 },
      { id: 6, name: 'Draw', completionSignal: 'draw-iteration-complete', advancesToStageId: 7, executionKind: 'row-slice', batchSize: 1, batchUnit: 'rows', skipToStageIdWhenDisabled: null },
      { id: 7, name: 'Finalize', completionSignal: 'player-finalized', advancesToStageId: null, executionKind: 'finalize-state', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null },
      { id: 8, name: 'Reset', completionSignal: 'menu-reset-delay-rearmed', advancesToStageId: 0, executionKind: 'reset-branch', batchSize: null, batchUnit: null, skipToStageIdWhenDisabled: null }
    ]);
  });

  test('skips shortcut stage transitions when scale disables process 5', () => {
    const menuSmallPlan = resolveLegacyGenerationExecutionPlan('menu', 35);
    const playSmallPlan = resolveLegacyGenerationExecutionPlan('play', 35);

    expect(menuSmallPlan.map((stage) => stage.id)).toEqual([0, 3, 4, 6, 7, 8]);
    expect(playSmallPlan.map((stage) => stage.id)).toEqual([0, 3, 4, 6, 7, 8]);
    expect(menuSmallPlan.find((stage) => stage.id === 4)).toMatchObject({
      advancesToStageId: 6,
      completionSignal: 'path-array-exhausted',
      executionKind: 'path-batch'
    });
    expect(playSmallPlan.find((stage) => stage.id === 4)).toMatchObject({
      advancesToStageId: 6,
      completionSignal: 'path-array-exhausted',
      executionKind: 'full-stage'
    });
    expect(menuSmallPlan.some((stage) => stage.id === 5)).toBe(false);
    expect(playSmallPlan.some((stage) => stage.id === 5)).toBe(false);
  });

  test('projects queued and consumed stage cursors from the legacy execution plan', () => {
    const menuPlan = resolveLegacyGenerationExecutionPlan('menu', 50);

    expect(resolveLegacyGenerationStageCursor(menuPlan, 'queued-entry')).toEqual({
      phase: 'queued-entry',
      currentStageId: 0,
      completionSignal: 'grid-spawn-complete',
      previousStageIds: [],
      remainingStageIds: [3, 4, 5, 6, 7, 8],
      processComplete: false
    });

    expect(resolveLegacyGenerationStageCursor(menuPlan, 'consumed-finalized')).toEqual({
      phase: 'consumed-finalized',
      currentStageId: 7,
      completionSignal: 'player-finalized',
      previousStageIds: [0, 3, 4, 5, 6],
      remainingStageIds: [8],
      processComplete: true
    });

    expect(resolveLegacyGenerationStageCursor(menuPlan, 'reset-branch')).toEqual({
      phase: 'reset-branch',
      currentStageId: 8,
      completionSignal: 'menu-reset-delay-rearmed',
      previousStageIds: [0, 3, 4, 5, 6, 7],
      remainingStageIds: [],
      processComplete: false
    });
  });

  test('routes menu and play mode to procedural maze builders', () => {
    expect(resolveLegacyMazeBuildKind('menu')).toBe('menu-generated');
    expect(resolveLegacyMazeBuildKind('play')).toBe('play-generated');

    const menuMaze = createLegacyRuntimeMazeForMode('menu', 50, 3749);
    const playMaze = createLegacyRuntimeMazeForMode('play', 50, 3749);

    expect(menuMaze.size).toBe(49);
    expect(playMaze.size).toBeGreaterThan(25);
    expect(menuMaze.source).toBe('menu-generated');
    expect(playMaze.source).toBe('play-generated');
    expect(menuMaze.start).not.toEqual(menuMaze.goal);
    expect(playMaze.start).not.toEqual(playMaze.goal);
    expect(menuMaze.pathBuilderStats?.topology).toBe('legacy-checkpoint-path-builder');
    expect(playMaze.pathBuilderStats?.topology).toBe('legacy-checkpoint-path-builder');
    expect(menuMaze.shortcutStats?.requested).toBe(6);
    expect(playMaze.shortcutStats?.requested).toBe(9);
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
    expect(menuBootRequest.queuedAtMs).toBe(1200);
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
      requiresLevelBuildingStartTime: true,
      requiresLevelBuildingDelayStartedFlag: true,
      levelBuildingDelayDurationMs: null,
      levelBuildingDelayDurationSource: 'legacy-variable-unrecovered',
      initializedResetBypassesDelayGate: true,
      resetsLevelBuildingTimerAfterConsume: true
    });
    expect(menuBootRequest.buildKind).toBe('menu-generated');
    expect(menuBootRequest.processStageIds).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(menuBootRequest.stageCursor).toEqual({
      phase: 'queued-entry',
      currentStageId: 0,
      completionSignal: 'grid-spawn-complete',
      previousStageIds: [],
      remainingStageIds: [3, 4, 5, 6, 7, 8],
      processComplete: false
    });
    expect(menuBootRequest.executionPlan[0]).toEqual({
      id: 0,
      name: 'CreateGrid',
      completionSignal: 'grid-spawn-complete',
      advancesToStageId: 3,
      executionKind: 'row-slice',
      batchSize: 1,
      batchUnit: 'rows',
      skipToStageIdWhenDisabled: null
    });
    expect(goalResetRequest.seed).toBe(3750);
    expect(goalResetRequest.queuedAtMs).toBe(1540);
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
    expect(playMaze.generation?.stageCursor).toEqual({
      phase: 'consumed-finalized',
      currentStageId: 7,
      completionSignal: 'player-finalized',
      previousStageIds: [0, 3, 4, 5, 6],
      remainingStageIds: [8],
      processComplete: true
    });
    expect(playMaze.generation?.executionPlan[0]).toEqual({
      id: 0,
      name: 'CreateGrid',
      completionSignal: 'grid-spawn-complete',
      advancesToStageId: 3,
      executionKind: 'full-stage',
      batchSize: null,
      batchUnit: null,
      skipToStageIdWhenDisabled: null
    });
    expect(playMaze.seed).toBe(902);
  });

  test('converts menu process-8 reset into the next queued process-0 generation request', () => {
    const resetGenerationRequest = createLegacyMenuResetGenerationRequest({
      currentSeed: 3749,
      nowMs: 1820,
      scale: 50
    });

    expect(resetGenerationRequest.reason).toBe('menu-demo-goal-reset');
    expect(resetGenerationRequest.mode).toBe('menu');
    expect(resetGenerationRequest.seed).toBe(3750);
    expect(resetGenerationRequest.queuedAtMs).toBe(1820);
    expect(resetGenerationRequest.dueAtMs).toBe(1820);
    expect(resetGenerationRequest.stageCursor).toEqual({
      phase: 'queued-entry',
      currentStageId: 0,
      completionSignal: 'grid-spawn-complete',
      previousStageIds: [],
      remainingStageIds: [3, 4, 5, 6, 7, 8],
      processComplete: false
    });
  });

  test('allows play regeneration to use a fresh procedural seed override', () => {
    const resetGenerationRequest = createLegacyPlayResetGenerationRequest({
      currentSeed: 3749,
      nowMs: 2220,
      seedOverride: 982_451_653,
      scale: 64
    });

    expect(resetGenerationRequest.reason).toBe('play-goal-reset');
    expect(resetGenerationRequest.mode).toBe('play');
    expect(resetGenerationRequest.seed).toBe(982_451_653);
    expect(resetGenerationRequest.seed).not.toBe(3749);
    expect(resetGenerationRequest.seed).not.toBe(3750);
    expect(resetGenerationRequest.budget.scale).toBe(64);
    expect(resetGenerationRequest.budget.shortcutCountModifier).toBe(0.18);
    expect(resetGenerationRequest.buildKind).toBe('play-generated');
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
