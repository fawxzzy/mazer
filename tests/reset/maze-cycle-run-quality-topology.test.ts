import { describe, expect, test } from 'vitest';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import {
  MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
  summarizeMazeCycleRunQualityTopology
} from '../../src/legacy-runtime/mazeCycleRunQualityTopology';
import { scoreMazeCycleRunQuality } from '../../src/legacy-runtime/mazeCycleRunQualityScorer.mjs';

const maze = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  solutionPath: LegacyPoint[]
): LegacyMazeSnapshot => ({
  source: 'play-generated',
  size: Math.max(grid.length, grid[0]?.length ?? 0),
  grid,
  start,
  goal,
  solutionPath,
  seed: 73
});

const summarize = (
  snapshot: LegacyMazeSnapshot,
  playerPath: LegacyPoint[],
  overrides: Partial<Parameters<typeof summarizeMazeCycleRunQualityTopology>[0]> = {}
) => summarizeMazeCycleRunQualityTopology({
  backtracks: 0,
  completed: true,
  maze: snapshot,
  playerPath,
  playerPathLength: playerPath.length,
  playerPathTruncated: false,
  resetUsed: false,
  sourcePathComplete: true,
  wrongTurns: 0,
  ...overrides
});

describe('maze cycle run-quality topology metrics', () => {
  test('defines the exact clean-run numerator and denominator on a single route', () => {
    const solutionPath = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const snapshot = maze(
      [[false, true, true, true, false]],
      solutionPath[0]!,
      solutionPath[2]!,
      solutionPath
    );

    expect(summarize(snapshot, snapshot.solutionPath)).toEqual(expect.objectContaining({
      acceptedSteps: 2,
      cleanRun: true,
      coverageRatio: 1,
      explorationRatio: null,
      explorer: false,
      metricsVersion: '1.0.0',
      optimalSteps: 2,
      revisitSteps: 0,
      shortestCorridorFidelityRatio: 1,
      shortestCorridorUnionTileCount: 3,
      uniqueVisitedTileCount: 3,
      walkableTileCount: 3
    }));
  });

  test('scores either equally short valid route against the shortest-path corridor union', () => {
    const grid = [
      [false, true, true, true, false],
      [false, true, false, true, false],
      [false, true, true, true, false]
    ];
    const top = [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }];
    const bottom = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }];
    const snapshot = maze(grid, top[0]!, top.at(-1)!, top);

    for (const route of [top, bottom]) {
      expect(summarize(snapshot, route)).toEqual(expect.objectContaining({
        acceptedSteps: 4,
        cleanRun: true,
        optimalSteps: 4,
        offShortestCorridorUniqueTileCount: 0,
        shortestCorridorFidelityRatio: 1,
        shortestCorridorUnionTileCount: 8
      }));
    }
  });

  test('uses legal edge wrap in the optimal-step contract', () => {
    const path = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
    const snapshot = maze([[true, false, true]], path[0]!, path[1]!, path);

    expect(summarize(snapshot, path)).toEqual(expect.objectContaining({
      acceptedSteps: 1,
      cleanRun: true,
      optimalSteps: 1,
      shortestCorridorFidelityRatio: 1
    }));
  });

  test('defines optional exploration, revisits, reset behavior, and the Explorer threshold', () => {
    const grid = [
      [false, false, false, false, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, false, false, false, false]
    ];
    const direct = [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }];
    const explored = [direct[0]!, { x: 1, y: 1 }, direct[0]!, direct[1]!, direct[2]!];
    const snapshot = maze(grid, direct[0]!, direct[2]!, direct);
    const result = summarize(snapshot, explored, { backtracks: 1, resetUsed: true });

    expect(MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD).toBe(0.25);
    expect(result).toEqual(expect.objectContaining({
      cleanRun: false,
      explorationRatio: 0.167,
      exploredOptionalTileCount: 1,
      explorer: false,
      optionalWalkableTileCount: 6,
      revisitSteps: 1
    }));
  });

  test('keeps incomplete/truncated historical source metrics explicitly undefined', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const snapshot = maze([[true, true, true]], path[0]!, path[2]!, path);
    const result = summarize(snapshot, path.slice(-2), {
      completed: false,
      playerPathLength: 300,
      playerPathTruncated: true,
      sourcePathComplete: false
    });

    expect(result).toEqual(expect.objectContaining({
      acceptedSteps: 299,
      cleanRun: false,
      coverageRatio: null,
      explorer: false,
      playerPathTruncated: true,
      sourcePathComplete: false,
      uniqueVisitedTileCount: null,
      undefinedReasonCodes: ['player_path_incomplete', 'run_incomplete']
    }));
    expect(scoreMazeCycleRunQuality({
      averageFrameMs: 16,
      backtracks: 0,
      completed: false,
      completionTimeMs: 1_000,
      complexity: 20,
      playerPathLength: 3,
      resetUsed: false,
      shortestViablePathLength: 3,
      surface: 'play',
      wrongTurns: 0
    })).toBeNull();
  });
});
