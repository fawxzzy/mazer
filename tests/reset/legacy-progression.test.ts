import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { createLegacyRuntimeMazeForMode, resolveLegacyGenerationBudgetContract } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  LEGACY_PROGRESSION_MENU_MIN_TILE_PX,
  LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD,
  LEGACY_PROGRESSION_AI_EASE_SCORE_THRESHOLD,
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX,
  LEGACY_PROGRESSION_PLAY_MIN_TILE_PX,
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  readLegacyProgressionState,
  resolveLegacyProgressionLevel,
  resolveLegacyProgressionExpectedCompletionMs,
  resolveLegacyProgressionDifficultyProfile,
  resolveLegacyMazeGenerationProfileForProgression,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionPaceScore,
  resolveLegacyProgressionPerformanceScore,
  resolveLegacyProgressionViewportScaleCap,
  summarizeLegacyProgressionPacing,
  summarizeLegacyProgressionDiagnostics
} from '../../src/legacy-runtime/legacyProgression';
import {
  createMazeCycleTelemetryReceipt,
  scoreMazeCycleAiDecisionSummary
} from '../../src/legacy-runtime/mazeCycleTelemetry';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const createProgressionTestMaze = (overrides: Partial<LegacyMazeSnapshot> = {}): LegacyMazeSnapshot => ({
  source: 'play-generated',
  size: 9,
  grid: [
    [false, false, false, false, false, false, false, false, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, false, false, false, false, true, false],
    [false, true, true, true, true, true, false, true, false],
    [false, false, false, false, false, true, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, true, false, false, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, false, false, false, false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 7, y: 7 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    { x: 6, y: 1 },
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 3 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
    { x: 7, y: 6 },
    { x: 7, y: 7 }
  ],
  seed: 917,
  routeQualityStats: {
    bypassableRouteBands: 3,
    bypassableSolutionEdges: 5,
    meaningfulBypassableRouteBands: 2,
    meaningfulBypassableSolutionEdges: 3,
    minimumMeaningfulDetour: 3,
    routeQuality: 'multi-route',
    sampledSolutionEdges: 12
  },
  shortcutStats: {
    requested: 8,
    attempts: 10,
    created: 4,
    wallArrayEntries: 18,
    uniqueWallCandidates: 12,
    exhaustedWallArray: false
  },
  shortcutsCreated: 4,
  pathBuilderStats: {
    acceptedCheckpoints: 9,
    backtracks: 2,
    deterministicSafetyStart: false,
    exhaustedCheckpoints: true,
    longestPathLength: 13,
    pathTiles: 13,
    requestedCheckpoints: 9,
    topology: 'legacy-checkpoint-path-builder',
    wallArrayEntries: 12
  },
  ...overrides
});

describe('legacy progression', () => {
  test('starts and normalizes the menu AI runner back to a level-one baseline', () => {
    const state = createEmptyLegacyProgressionState();
    expect(state.tracks['ai-runner']).toMatchObject({
      completedCycles: 0,
      level: 1,
      rank: 'E',
      recentSignals: [],
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });

    const legacyStoredState = {
      version: 1,
      updatedAt: '2026-07-08T12:00:00.000Z',
      tracks: {
        player: {
          ...state.tracks.player,
          completedCycles: 9,
          targetComplexity: 64
        },
        'ai-runner': {
          ...state.tracks['ai-runner'],
          completedCycles: 5180,
          targetComplexity: 180
        }
      }
    };
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(legacyStoredState));
    const normalized = readLegacyProgressionState(storage);

    expect(normalized.tracks.player.completedCycles).toBe(9);
    expect(normalized.tracks.player.level).toBe(resolveLegacyProgressionLevel(64));
    expect(normalized.tracks['ai-runner']).toMatchObject({
      completedCycles: 0,
      level: 1,
      rank: 'E',
      recentSignals: [],
      targetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY
    });
  });

  test('records player and ai-runner cycle progression as separate local tracks', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();
    const playerReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    state = recordLegacyProgressionCycle(storage, state, playerReceipt, maze);

    expect(state.tracks.player.completedCycles).toBe(1);
    expect(state.tracks.player.lastSignal).toBe('challenge');
    expect(state.tracks.player.lastCompletionTimeMs).toBe(8000);
    expect(state.tracks.player.bestCompletionTimeMs).toBe(8000);
    expect(state.tracks.player.paceScore).toBeGreaterThanOrEqual(70);
    expect(state.tracks.player.recentSignals).toEqual(['challenge']);
    expect(state.tracks.player.targetComplexity).toBe(26);
    expect(state.tracks['ai-runner'].completedCycles).toBe(0);
    expect(JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY) ?? '{}').tracks.player.completedCycles).toBe(1);

    const aiReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 14,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 32_000,
      controlMode: 'arrows',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 7,
      wrongTurns: 8
    });

    state = recordLegacyProgressionCycle(storage, state, aiReceipt, maze);

    expect(state.tracks.player.completedCycles).toBe(1);
    expect(state.tracks['ai-runner'].completedCycles).toBe(1);
    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].lastCompletionTimeMs).toBe(32_000);
    expect(state.tracks['ai-runner'].bestCompletionTimeMs).toBe(32_000);
    expect(state.tracks['ai-runner'].recentSignals).toEqual(['ease']);
    expect(state.tracks['ai-runner'].targetComplexity).toBe(LEGACY_PROGRESSION_MIN_COMPLEXITY);
    expect(readLegacyProgressionState(storage).tracks['ai-runner'].completedCycles).toBe(1);
  });

  test('scores completion time against route and complexity pressure for level pacing', () => {
    const maze = createProgressionTestMaze();
    const fastReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 7000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 0,
      wrongTurns: 0
    });
    const slowReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 70_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 2,
      wrongTurns: 2
    });
    const complexity = resolveLegacyMazeComplexity(maze).total;

    expect(resolveLegacyProgressionExpectedCompletionMs(fastReceipt, complexity)).toBeGreaterThan(0);
    expect(resolveLegacyProgressionPaceScore(fastReceipt, complexity)).toBeGreaterThan(resolveLegacyProgressionPaceScore(slowReceipt, complexity));

    let state = createEmptyLegacyProgressionState();
    state = recordLegacyProgressionCycle(new MemoryStorage(), state, fastReceipt, maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('challenge');
    expect(state.tracks['ai-runner'].paceScore).toBeGreaterThanOrEqual(70);

    state = recordLegacyProgressionCycle(new MemoryStorage(), state, slowReceipt, maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].paceScore).toBeLessThanOrEqual(28);
  });

  test('lets human-like AI runs move skill level without requiring perfect pathing', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const createSearchingAiReceipt = (completedAt: string) => createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 4,
        decisionCount: 40,
        optionalRetargetCount: 1,
        recoveryCount: 2,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 3
      },
      averageFrameMs: 16,
      completedAt,
      completionTimeMs: 18_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 4,
      wrongTurns: 3
    });

    let state = createEmptyLegacyProgressionState();
    const startingAiTrack = state.tracks['ai-runner'];

    state = recordLegacyProgressionCycle(storage, state, createSearchingAiReceipt('2026-07-08T12:00:00.000Z'), maze);
    expect(state.tracks['ai-runner'].lastSignal).toBe('challenge');
    expect(state.tracks['ai-runner'].paceScore).toBeGreaterThanOrEqual(LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD);
    expect(state.tracks['ai-runner'].targetComplexity).toBeGreaterThan(startingAiTrack.targetComplexity);

    state = recordLegacyProgressionCycle(storage, state, createSearchingAiReceipt('2026-07-08T12:01:00.000Z'), maze);
    expect(state.tracks['ai-runner'].recentSignals.slice(0, 2)).toEqual(['challenge', 'challenge']);
    expect(state.tracks['ai-runner'].level).toBeGreaterThan(startingAiTrack.level);
  });

  test('calibrates AI skill progression across repeated competent sample runs', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (let run = 0; run < 6; run += 1) {
      const receipt = createMazeCycleTelemetryReceipt({
        aiDecisionSummary: {
          backtrackCount: run % 2 === 0 ? 3 : 4,
          decisionCount: 42,
          optionalRetargetCount: run % 3 === 0 ? 1 : 0,
          recoveryCount: 1,
          thinkingModel: 'human-local-memory',
          visitedUndoCount: 0,
          wrongBranchCount: 2
        },
        averageFrameMs: 16,
        completedAt: `2026-07-08T12:0${run}:00.000Z`,
        completionTimeMs: 17_000 + (run * 350),
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'menu-demo',
        backtracks: run % 2 === 0 ? 3 : 4,
        wrongTurns: 2
      });

      state = recordLegacyProgressionCycle(storage, state, receipt, maze);
    }

    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, resolveLegacyMazeComplexity(maze).total);

    expect(aiTrack.completedCycles).toBe(6);
    expect(aiTrack.level).toBeGreaterThan(1);
    expect(aiTrack.targetComplexity).toBeGreaterThan(LEGACY_PROGRESSION_MIN_COMPLEXITY + 8);
    expect(aiTrack.rank).toBe('E');
    expect(pacing.skillTrend).toBe('rising');
    expect(pacing.levelProgressPercent).toBeGreaterThanOrEqual(0);
    expect(pacing.levelProgressPercent).toBeLessThanOrEqual(100);
    expect(pacing.complexityUntilNextLevel).toBeGreaterThanOrEqual(0);
    expect(pacing.nextLevelTargetComplexity).toBeGreaterThanOrEqual(aiTrack.targetComplexity);
  });

  test('moves AI rank only after sustained competent progression', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();

    for (let run = 0; run < 8; run += 1) {
      state = recordLegacyProgressionCycle(storage, state, createMazeCycleTelemetryReceipt({
        aiDecisionSummary: {
          backtrackCount: 2,
          decisionCount: 44,
          optionalRetargetCount: run % 4 === 0 ? 1 : 0,
          recoveryCount: 1,
          thinkingModel: 'human-local-memory',
          visitedUndoCount: 0,
          wrongBranchCount: 2
        },
        averageFrameMs: 16,
        completedAt: `2026-07-08T13:0${run}:00.000Z`,
        completionTimeMs: 16_800 + (run * 220),
        controlMode: 'stick',
        maze,
        playerPath: maze.solutionPath,
        resetUsed: false,
        surface: 'menu-demo',
        backtracks: 2,
        wrongTurns: 2
      }), maze);
    }

    const aiTrack = state.tracks['ai-runner'];

    expect(aiTrack.completedCycles).toBe(8);
    expect(aiTrack.rank).toBe('D');
    expect(aiTrack.targetComplexity).toBeGreaterThanOrEqual(28);
    expect(aiTrack.recentSignals.every((signal) => signal === 'challenge')).toBe(true);
  });

  test('holds or eases AI progression when decision pressure is chaotic', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const chaoticAiReceipt = createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 12,
        decisionCount: 24,
        optionalRetargetCount: 5,
        recoveryCount: 7,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 4,
        wrongBranchCount: 10
      },
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 12,
      wrongTurns: 10
    });

    const state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), chaoticAiReceipt, maze);

    expect(state.tracks['ai-runner'].lastSignal).toBe('ease');
    expect(state.tracks['ai-runner'].paceScore).toBeLessThanOrEqual(LEGACY_PROGRESSION_AI_EASE_SCORE_THRESHOLD);
    expect(state.tracks['ai-runner'].targetComplexity).toBe(LEGACY_PROGRESSION_MIN_COMPLEXITY);
  });

  test('holds AI maze level when local-memory search exhausts without chaotic pressure', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const searchingExhaustionReceipt = createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 15,
        decisionCount: 60,
        optionalRetargetCount: 1,
        recoveryCount: 7,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 20
      },
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 30_000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: true,
      surface: 'menu-demo',
      backtracks: 15,
      wrongTurns: 20
    });

    expect(scoreMazeCycleAiDecisionSummary(searchingExhaustionReceipt.aiDecisionSummary)?.signal).toBe('searching');
    expect(searchingExhaustionReceipt.routeEfficiencyPressureScore).toBeGreaterThanOrEqual(88);

    const state = recordLegacyProgressionCycle(
      storage,
      createEmptyLegacyProgressionState(),
      searchingExhaustionReceipt,
      maze
    );

    expect(state.tracks['ai-runner'].lastSignal).toBe('hold');
    expect(state.tracks['ai-runner'].targetComplexity).toBe(LEGACY_PROGRESSION_MIN_COMPLEXITY);
    expect(state.tracks['ai-runner'].struggleCycles).toBe(0);
  });

  test('uses shortest-path waste and render safety in the progression score', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const complexity = resolveLegacyMazeComplexity(maze).total;
    const efficientReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const routeWasteReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: [
        ...maze.solutionPath,
        ...maze.solutionPath,
        ...maze.solutionPath
      ],
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const unsafeFrameReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 34,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    expect(routeWasteReceipt.shortestViablePathLength).toBe(maze.solutionPath.length);
    expect(routeWasteReceipt.routeEfficiencyPressureScore).toBeGreaterThanOrEqual(75);
    expect(resolveLegacyProgressionPerformanceScore(efficientReceipt, complexity).signal).toBe('challenge');
    expect(resolveLegacyProgressionPerformanceScore(routeWasteReceipt, complexity).signal).toBe('ease');
    expect(resolveLegacyProgressionPerformanceScore(unsafeFrameReceipt, complexity).signal).toBe('hold');

    let state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), routeWasteReceipt, maze);
    expect(state.tracks.player.lastSignal).toBe('ease');
    expect(state.tracks.player.targetComplexity).toBe(22);

    state = recordLegacyProgressionCycle(storage, createEmptyLegacyProgressionState(), unsafeFrameReceipt, maze);
    expect(state.tracks.player.lastSignal).toBe('hold');
    expect(state.tracks.player.targetComplexity).toBe(24);
  });

  test('paces level changes from a recent signal window instead of only the latest cycle', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    let state = createEmptyLegacyProgressionState();
    const firstChallengeReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 8000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });
    const secondChallengeReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:01:00.000Z',
      completionTimeMs: 7600,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'play',
      backtracks: 0,
      wrongTurns: 0
    });

    state = recordLegacyProgressionCycle(storage, state, firstChallengeReceipt, maze);
    expect(state.tracks.player.targetComplexity).toBe(26);

    state = recordLegacyProgressionCycle(storage, state, secondChallengeReceipt, maze);
    expect(state.tracks.player.recentSignals).toEqual(['challenge', 'challenge']);
    expect(state.tracks.player.targetComplexity).toBe(29);
    expect(state.tracks.player.level).toBe(resolveLegacyProgressionLevel(29));

    const strugglingReceipt = createMazeCycleTelemetryReceipt({
      averageFrameMs: 16,
      completedAt: '2026-07-08T12:02:00.000Z',
      completionTimeMs: 90_000,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: true,
      surface: 'play',
      backtracks: 7,
      wrongTurns: 8
    });
    state = {
      ...state,
      tracks: {
        ...state.tracks,
        player: {
          ...state.tracks.player,
          recentSignals: ['ease']
        }
      }
    };

    state = recordLegacyProgressionCycle(storage, state, strugglingReceipt, maze);
    expect(state.tracks.player.recentSignals.slice(0, 2)).toEqual(['ease', 'ease']);
    expect(state.tracks.player.targetComplexity).toBe(27);
  });

  test('scores real maze complexity from route, shortcut, floor, and solution shape', () => {
    const simpleMaze = createProgressionTestMaze({
      size: 5,
      grid: [
        [false, false, false, false, false],
        [false, true, true, true, false],
        [false, false, false, true, false],
        [false, false, false, true, false],
        [false, false, false, false, false]
      ],
      goal: { x: 3, y: 3 },
      solutionPath: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 }
      ],
      routeQualityStats: {
        bypassableRouteBands: 0,
        bypassableSolutionEdges: 0,
        meaningfulBypassableRouteBands: 0,
        meaningfulBypassableSolutionEdges: 0,
        minimumMeaningfulDetour: 2,
        routeQuality: 'single-route',
        sampledSolutionEdges: 4
      },
      shortcutsCreated: 0,
      shortcutStats: {
        requested: 0,
        attempts: 0,
        created: 0,
        wallArrayEntries: 0,
        uniqueWallCandidates: 0,
        exhaustedWallArray: false
      }
    });
    const complexMaze = createProgressionTestMaze();
    const simpleBreakdown = resolveLegacyMazeComplexity(simpleMaze);
    const complexBreakdown = resolveLegacyMazeComplexity(complexMaze);

    expect(complexBreakdown.total).toBeGreaterThan(simpleBreakdown.total);
    expect(complexBreakdown.splitCount).toBeGreaterThan(simpleBreakdown.splitCount);
    expect(complexBreakdown.splitScore).toBeGreaterThan(simpleBreakdown.splitScore);
    expect(complexBreakdown.weightedSplitPressureScore).toBeGreaterThan(simpleBreakdown.weightedSplitPressureScore);
    expect(complexBreakdown.deadEndPressureScore).toBeGreaterThanOrEqual(0);
    expect(simpleBreakdown.deadEndPressureScore).toBeGreaterThan(0);
    expect(simpleBreakdown.weightedDeadEndPressureScore).toBeGreaterThan(0);
    expect(complexBreakdown.fillQualityScore).toBeGreaterThan(0);
  });

  test('scores paired off-border paths as real wrapped complexity', () => {
    const wrappedMaze = createProgressionTestMaze({
      size: 5,
      grid: [
        [false, false, false, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, false, true, false, false],
        [false, false, false, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ],
      routeQualityStats: {
        bypassableRouteBands: 0,
        bypassableSolutionEdges: 0,
        meaningfulBypassableRouteBands: 0,
        meaningfulBypassableSolutionEdges: 0,
        minimumMeaningfulDetour: 0,
        routeQuality: 'single-route',
        sampledSolutionEdges: 1
      },
      shortcutsCreated: 0,
      shortcutStats: {
        requested: 0,
        attempts: 0,
        created: 0,
        wallArrayEntries: 0,
        uniqueWallCandidates: 0,
        exhaustedWallArray: false
      }
    });
    const breakdown = resolveLegacyMazeComplexity(wrappedMaze);

    expect(breakdown.edgeWrapCount).toBe(1);
    expect(breakdown.edgeWrapScore).toBeGreaterThan(0);
    expect(breakdown.edgeWrapReliefScore).toBeGreaterThan(0);
    expect(breakdown.edgeWrapShortcutReliefScore).toBe(breakdown.edgeWrapReliefScore);
    expect(breakdown.edgeWrapChoiceScore).toBeGreaterThan(0);
    expect(breakdown.splitCount).toBeGreaterThan(0);
    expect(breakdown.weightedSplitPressureScore).toBeGreaterThan(0);
  });

  test('separates wrapped shortcut relief from wrapped choice complexity', () => {
    const directShortcutMaze = createProgressionTestMaze({
      size: 5,
      grid: [
        [false, false, false, false, false],
        [false, false, false, false, false],
        [true, true, true, true, true],
        [false, false, false, false, false],
        [false, false, false, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ]
    });
    const branchyWrappedMaze = createProgressionTestMaze({
      size: 5,
      grid: [
        [false, false, true, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, true, true, true, false],
        [false, false, true, false, false]
      ],
      start: { x: 0, y: 2 },
      goal: { x: 4, y: 2 },
      solutionPath: [
        { x: 0, y: 2 },
        { x: 4, y: 2 }
      ]
    });

    const directBreakdown = resolveLegacyMazeComplexity(directShortcutMaze);
    const branchyBreakdown = resolveLegacyMazeComplexity(branchyWrappedMaze);

    expect(directBreakdown.edgeWrapShortcutReliefScore).toBeGreaterThan(0);
    expect(branchyBreakdown.edgeWrapShortcutReliefScore).toBeGreaterThan(0);
    expect(branchyBreakdown.edgeWrapChoiceScore).toBeGreaterThan(directBreakdown.edgeWrapChoiceScore);
    expect(branchyBreakdown.total).toBeGreaterThan(directBreakdown.total);
  });

  test('summarizes bounded maze-level pacing without jumping target to measured complexity', () => {
    const state = createEmptyLegacyProgressionState();
    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, 92);

    expect(pacing).toMatchObject({
      activeLevel: 1,
      activeRank: 'E',
      activeTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY,
      complexityUntilNextLevel: 4,
      levelBaseTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY,
      levelProgressPercent: 0,
      measuredMazeLevel: resolveLegacyProgressionLevel(92),
      nextChallengeTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 2,
      nextEaseTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY,
      nextLevelTargetComplexity: LEGACY_PROGRESSION_MIN_COMPLEXITY + 4,
      recentChallengeCount: 0,
      recentEaseCount: 0,
      skillTrend: 'steady',
      signalWindow: []
    });
  });

  test('allows S-rank AI progression to keep leveling past the old level-44 cap', () => {
    const storage = new MemoryStorage();
    const maze = createProgressionTestMaze();
    const baseState = createEmptyLegacyProgressionState();
    let state = {
      ...baseState,
      tracks: {
        ...baseState.tracks,
        'ai-runner': {
          ...baseState.tracks['ai-runner'],
          cleanCycles: 33,
          completedCycles: 742,
          level: resolveLegacyProgressionLevel(180),
          rank: 'S' as const,
          recentSignals: ['challenge', 'challenge'],
          targetComplexity: 180
        }
      }
    };

    const createCapBreakReceipt = (completedAt: string) => createMazeCycleTelemetryReceipt({
      aiDecisionSummary: {
        backtrackCount: 1,
        decisionCount: 48,
        optionalRetargetCount: 1,
        recoveryCount: 1,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 0,
        wrongBranchCount: 2
      },
      averageFrameMs: 16,
      completedAt,
      completionTimeMs: 16_500,
      controlMode: 'stick',
      maze,
      playerPath: maze.solutionPath,
      resetUsed: false,
      surface: 'menu-demo',
      backtracks: 1,
      wrongTurns: 2
    });

    state = recordLegacyProgressionCycle(storage, state, createCapBreakReceipt('2026-07-10T08:20:00.000Z'), maze);
    state = recordLegacyProgressionCycle(storage, state, createCapBreakReceipt('2026-07-10T08:21:00.000Z'), maze);

    const aiTrack = state.tracks['ai-runner'];
    const pacing = summarizeLegacyProgressionPacing(aiTrack, resolveLegacyMazeComplexity(maze).total);

    expect(aiTrack.rank).toBe('S');
    expect(aiTrack.targetComplexity).toBeGreaterThan(180);
    expect(aiTrack.level).toBeGreaterThan(44);
    expect(pacing.nextLevelTargetComplexity).toBeGreaterThan(180);
    expect(pacing.complexityUntilNextLevel).toBeGreaterThanOrEqual(0);
  });

  test('uses target complexity to tune future maze scale while player and trail stay green', () => {
    const state = createEmptyLegacyProgressionState();
    const basePalette = resolveLegacyProgressionPalette(state.tracks.player, 'player');
    const advancedTrack = {
      ...state.tracks.player,
      colorTier: 4,
      level: 31,
      rank: 'A' as const,
      targetComplexity: 132
    };
    const advancedPalette = resolveLegacyProgressionPalette(advancedTrack, 'player');

    expect(basePalette.playerCoreColor).toBe(0x36ff7d);
    expect(basePalette.trailColor).toBe(0x36ff7d);
    expect(basePalette.trailPulseColor).toBe(0xffffff);
    expect(basePalette.trailPulseEdgeColor).toBe(0xe8fff5);
    expect(advancedPalette.playerCoreColor).toBe(0x36ff7d);
    expect(advancedPalette.trailColor).toBe(0x36ff7d);
    expect(advancedPalette.trailPulseColor).toBe(0xffffff);
    expect(advancedPalette.trailPulseEdgeColor).toBe(0xe8fff5);
    expect(resolveLegacyProgressionGenerationScale(50, advancedTrack)).toBeGreaterThan(50);
  });

  test('defines level-one mazes as small simple no-room routes', () => {
    const state = createEmptyLegacyProgressionState();
    const aiTrack = state.tracks['ai-runner'];
    const profile = resolveLegacyProgressionDifficultyProfile(aiTrack);
    const generationProfile = resolveLegacyMazeGenerationProfileForProgression(aiTrack);
    const scale = resolveLegacyProgressionGenerationScale(50, aiTrack);
    const budget = resolveLegacyGenerationBudgetContract('menu', scale, generationProfile);
    const maze = createLegacyRuntimeMazeForMode('menu', scale, 3749, generationProfile);
    const complexity = resolveLegacyMazeComplexity(maze);

    expect(aiTrack.level).toBe(1);
    expect(profile).toMatchObject({
      band: 'tutorial',
      branchPressure: 'minimal',
      deadEndPressure: 'minimal',
      expectedEdgeWraps: { horizontal: 0, vertical: 0 },
      fillPressure: 'open',
      roomsEnabled: false,
      shortcutPressure: 'off'
    });
    expect(scale).toBeLessThanOrEqual(35);
    expect(budget.shortcutStageEnabled).toBe(false);
    expect(budget.shortcutCount).toBe(0);
    expect(generationProfile.borderFeederTargetPerSide).toBe(0);
    expect(generationProfile.requiredOppositeBorderConnections).toEqual({ horizontal: false, vertical: false });
    expect(maze.shortcutStats?.requested).toBe(0);
    expect(complexity.edgeWrapCount).toBe(0);
  });

  test('maps progression bands to increasing procedural pressure', () => {
    const tutorial = resolveLegacyProgressionDifficultyProfile(8);
    const starter = resolveLegacyProgressionDifficultyProfile(28);
    const explorer = resolveLegacyProgressionDifficultyProfile(64);
    const navigator = resolveLegacyProgressionDifficultyProfile(104);
    const architect = resolveLegacyProgressionDifficultyProfile(152);
    const mythic = resolveLegacyProgressionDifficultyProfile(180);

    expect([
      tutorial.band,
      starter.band,
      explorer.band,
      navigator.band,
      architect.band,
      mythic.band
    ]).toEqual(['tutorial', 'starter', 'explorer', 'navigator', 'architect', 'mythic']);
    expect(tutorial.targetScale).toBeLessThan(starter.targetScale);
    expect(starter.targetScale).toBeLessThan(explorer.targetScale);
    expect(explorer.targetScale).toBeLessThan(navigator.targetScale);
    expect(navigator.targetScale).toBeLessThan(architect.targetScale);
    expect(architect.targetScale).toBeLessThan(mythic.targetScale);
    expect(mythic.roomsEnabled).toBe(false);
    expect(mythic.expectedEdgeWraps.horizontal).toBeGreaterThan(tutorial.expectedEdgeWraps.horizontal);
    expect(mythic.expectedEdgeWraps.vertical).toBeGreaterThan(tutorial.expectedEdgeWraps.vertical);
  });

  test('turns higher difficulty bands into stronger generation pressure', () => {
    const tutorialProfile = resolveLegacyMazeGenerationProfileForProgression(8);
    const mythicProfile = resolveLegacyMazeGenerationProfileForProgression(180);
    const tutorialBudget = resolveLegacyGenerationBudgetContract('menu', 29, tutorialProfile);
    const mythicBudget = resolveLegacyGenerationBudgetContract('menu', 96, mythicProfile);
    const mythicMaze = createLegacyRuntimeMazeForMode('menu', 96, 3749, mythicProfile);
    const mythicComplexity = resolveLegacyMazeComplexity(mythicMaze);

    expect(tutorialBudget.shortcutCount).toBe(0);
    expect(mythicProfile.checkpointCountMultiplier).toBeGreaterThan(tutorialProfile.checkpointCountMultiplier);
    expect(mythicProfile.shortcutCountMultiplier).toBeGreaterThan(tutorialProfile.shortcutCountMultiplier);
    expect(mythicProfile.routeQualityReinforcementMultiplier).toBeGreaterThan(tutorialProfile.routeQualityReinforcementMultiplier);
    expect(mythicProfile.borderFeederTargetPerSide).toBeGreaterThan(tutorialProfile.borderFeederTargetPerSide ?? 0);
    expect(mythicBudget.checkpointCount).toBeGreaterThan(tutorialBudget.checkpointCount);
    expect(mythicBudget.shortcutCount).toBeGreaterThan(0);
    expect(mythicBudget.shortcutStageEnabled).toBe(true);
    expect(mythicComplexity.edgeWrapCount).toBeGreaterThanOrEqual(2);
  });

  test('keeps player and trail progression colors distinct from the pale maze path', () => {
    const state = createEmptyLegacyProgressionState();
    const pathCore = 0xe7fff4;
    const colorDistance = (color: number): number => {
      const colorR = (color >> 16) & 0xff;
      const colorG = (color >> 8) & 0xff;
      const colorB = color & 0xff;
      const pathR = (pathCore >> 16) & 0xff;
      const pathG = (pathCore >> 8) & 0xff;
      const pathB = pathCore & 0xff;
      return Math.sqrt(
        ((colorR - pathR) ** 2)
        + ((colorG - pathG) ** 2)
        + ((colorB - pathB) ** 2)
      );
    };

    for (let colorTier = 0; colorTier < 6; colorTier += 1) {
      const palette = resolveLegacyProgressionPalette({
        ...state.tracks.player,
        colorTier
      }, 'player');

      expect(colorDistance(palette.playerCoreColor)).toBeGreaterThanOrEqual(145);
      expect(colorDistance(palette.trailColor)).toBeGreaterThanOrEqual(145);
      expect(palette.trailPulseColor).toBe(0xffffff);
      expect(palette.trailPulseEdgeColor).toBe(0xe8fff5);
    }
  });

  test('keeps maxed progression badge readable while surfacing completed cycles', () => {
    const state = createEmptyLegacyProgressionState();
    const maxedTrack = {
      ...state.tracks['ai-runner'],
      completedCycles: 5180,
      level: 99,
      rank: 'S' as const,
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    const palette = resolveLegacyProgressionPalette(maxedTrack, 'ai-runner');

    expect(palette.label).toBe('AI Skill Lv 99 Rank S Runs 5180');
    expect(palette.label).not.toContain('S400');
    expect(palette.label).not.toContain('R:');
  });

  test('caps progression maze scale with the same snapped mobile render math as the board', () => {
    const state = createEmptyLegacyProgressionState();
    const maxedTrack = {
      ...state.tracks['ai-runner'],
      targetComplexity: LEGACY_PROGRESSION_MAX_COMPLEXITY
    };
    const phoneViewport = { width: 365, height: 863 };
    const narrowViewport = { width: 332, height: 958 };
    const normalPhoneViewport = { width: 405, height: 958 };
    const unrestrictedScale = resolveLegacyProgressionGenerationScale(50, maxedTrack);
    const viewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: phoneViewport
    });
    const narrowViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: narrowViewport
    });
    const normalPhoneViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'menu-demo',
      viewport: normalPhoneViewport
    });
    const playViewportCap = resolveLegacyProgressionViewportScaleCap({
      surface: 'play',
      viewport: narrowViewport
    });
    const phoneScale = resolveLegacyProgressionGenerationScale(50, maxedTrack, {
      surface: 'menu-demo',
      viewport: phoneViewport
    });
    const narrowScale = resolveLegacyProgressionGenerationScale(50, maxedTrack, {
      surface: 'menu-demo',
      viewport: narrowViewport
    });

    expect(LEGACY_PROGRESSION_MENU_MIN_TILE_PX).toBeGreaterThanOrEqual(5.3);
    expect(LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX).toBe(8);
    expect(LEGACY_PROGRESSION_PLAY_MIN_TILE_PX).toBeGreaterThanOrEqual(5.2);
    expect(unrestrictedScale).toBeGreaterThan(viewportCap);
    expect(phoneScale).toBe(viewportCap);
    expect(narrowScale).toBe(narrowViewportCap);
    expect(narrowScale).toBe(37);
    expect(phoneScale).toBe(41);
    expect(normalPhoneViewportCap).toBe(46);
    expect(playViewportCap).toBeGreaterThan(narrowViewportCap);

    const normalPhoneLayout = resolveLegacyMenuLayout(
      normalPhoneViewport.width,
      normalPhoneViewport.height,
      50,
      normalPhoneViewportCap,
      'menu'
    );
    expect(normalPhoneLayout.tileSize).toBe(8);
    expect(normalPhoneLayout.boardLeft).toBeGreaterThanOrEqual(8);
    expect(normalPhoneLayout.boardLeft + normalPhoneLayout.boardSize).toBeLessThanOrEqual(normalPhoneViewport.width - 8);

    for (const targetComplexity of [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 220, 300, LEGACY_PROGRESSION_MAX_COMPLEXITY]) {
      const scale = resolveLegacyProgressionGenerationScale(50, {
        ...maxedTrack,
        targetComplexity
      }, {
        surface: 'menu-demo',
        viewport: normalPhoneViewport
      });
      const layout = resolveLegacyMenuLayout(
        normalPhoneViewport.width,
        normalPhoneViewport.height,
        50,
        scale,
        'menu'
      );

      expect(layout.tileSize).toBe(8);
      expect(layout.boardLeft).toBeGreaterThanOrEqual(8);
      expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(normalPhoneViewport.width - 8);
    }
  });

  test('summarizes diagnostics without exposing full cycle path history', () => {
    const maze = createProgressionTestMaze();
    const state = createEmptyLegacyProgressionState();
    const diagnostics = summarizeLegacyProgressionDiagnostics(state, 'ai-runner', maze);

    expect(diagnostics).toMatchObject({
      activeTrackId: 'ai-runner',
      storageKey: LEGACY_PROGRESSION_STORAGE_KEY,
      tracks: {
        player: {
          completedCycles: 0
        },
        'ai-runner': {
          completedCycles: 0
        }
      }
    });
    expect(diagnostics.complexity.total).toBe(resolveLegacyMazeComplexity(maze).total);
    expect(diagnostics.difficultyProfile.band).toBe('tutorial');
    expect(diagnostics.generationReview).toMatchObject({
      measuredComplexity: diagnostics.complexity.total,
      profileBand: 'tutorial',
      targetComplexity: state.tracks['ai-runner'].targetComplexity,
      tolerance: 8
    });
    expect(['under-target', 'on-target', 'over-target']).toContain(diagnostics.generationReview.delivery);
    expect(diagnostics.generationReview.difference).toBe(
      diagnostics.complexity.total - state.tracks['ai-runner'].targetComplexity
    );
    expect(diagnostics.palette.label.startsWith('AI Skill Lv ')).toBe(true);
    expect(diagnostics.pacing.activeLevel).toBe(1);
    expect(diagnostics.pacing.measuredMazeComplexity).toBe(diagnostics.complexity.total);
  });
});
