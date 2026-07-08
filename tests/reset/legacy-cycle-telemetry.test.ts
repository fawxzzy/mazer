import { describe, expect, test } from 'vitest';
import {
  MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT,
  MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
  MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT,
  MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  createMazeCycleTelemetryReceipt,
  readMazeCycleTelemetryHistory,
  recordMazeCycleTelemetryReceipt,
  summarizeMazeCyclePathDeviation,
  summarizeMazeCycleTelemetryDiagnostics
} from '../../src/legacy-runtime/mazeCycleTelemetry';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const createTestMaze = (): LegacyMazeSnapshot => ({
  source: 'play-generated',
  size: 6,
  grid: [
    [false, false, false, false, false, false],
    [false, true, true, true, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, true, false],
    [false, false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 4, y: 4 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 2 },
    { x: 4, y: 3 },
    { x: 4, y: 4 }
  ],
  seed: 123,
  routeQualityStats: {
    bypassableRouteBands: 2,
    bypassableSolutionEdges: 4,
    meaningfulBypassableRouteBands: 2,
    meaningfulBypassableSolutionEdges: 3,
    minimumMeaningfulDetour: 2,
    routeQuality: 'multi-route',
    sampledSolutionEdges: 6
  }
});

const createLongPath = (length: number): LegacyPoint[] => (
  Array.from({ length }, (_, index) => ({
    x: index % 49,
    y: Math.floor(index / 49)
  }))
);

describe('legacy maze cycle telemetry', () => {
  test('records recent local cycle receipts without storing unbounded player paths', () => {
    const storage = new MemoryStorage();
    const maze = createTestMaze();
    const longPath = createLongPath(MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT + 40);

    const history = recordMazeCycleTelemetryReceipt(storage, {
      averageFrameMs: 16.667,
      completedAt: '2026-07-08T12:00:00.000Z',
      completionTimeMs: 12_345,
      controlMode: 'stick',
      maze,
      playerPath: longPath,
      resetUsed: false,
      surface: 'play'
    });

    expect(history.receipts).toHaveLength(1);
    expect(history.receipts[0]).toMatchObject({
      averageFrameMs: 16.667,
      completionTimeMs: 12_345,
      controlMode: 'stick',
      mazeSeed: 123,
      mazeSize: 6,
      playerPathLength: MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT + 40,
      playerPathTruncated: true,
      routeQuality: 'multi-route',
      surface: 'play'
    });
    expect(history.receipts[0]?.playerPath).toHaveLength(MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT);
    expect(JSON.parse(storage.getItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY) ?? '{}').receipts).toHaveLength(1);
  });

  test('caps local history to the recent receipt limit and keeps newest first', () => {
    const storage = new MemoryStorage();
    const maze = createTestMaze();
    let history = readMazeCycleTelemetryHistory(storage);

    for (let index = 0; index < MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT + 3; index += 1) {
      history = recordMazeCycleTelemetryReceipt(storage, {
        averageFrameMs: 14 + index,
        completedAt: `2026-07-08T12:00:${String(index).padStart(2, '0')}.000Z`,
        completionTimeMs: 1000 + index,
        controlMode: index % 2 === 0 ? 'stick' : 'arrows',
        maze: {
          ...maze,
          seed: maze.seed + index
        },
        playerPath: maze.solutionPath,
        resetUsed: index % 3 === 0,
        surface: index % 2 === 0 ? 'play' : 'menu-demo'
      });
    }

    expect(history.receipts).toHaveLength(MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT);
    expect(history.receipts[0]?.mazeSeed).toBe(maze.seed + MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT + 2);
    expect(history.receipts.at(-1)?.mazeSeed).toBe(maze.seed + 3);
  });

  test('surfaces compact diagnostics without dumping full path history', () => {
    const storage = new MemoryStorage();
    const maze = createTestMaze();
    const history = recordMazeCycleTelemetryReceipt(storage, {
      averageFrameMs: 12.5,
      completedAt: '2026-07-08T13:00:00.000Z',
      completionTimeMs: 6000,
      controlMode: 'arrows',
      maze,
      playerPath: createLongPath(30),
      resetUsed: true,
      surface: 'menu-demo',
      backtracks: 2,
      wrongTurns: 3
    });

    const diagnostics = summarizeMazeCycleTelemetryDiagnostics(history);

    expect(diagnostics).toMatchObject({
      diagnosticReceiptLimit: MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT,
      enabled: true,
      historyLimit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
      pathLimit: MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
      storageKey: MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
      storedCount: 1
    });
    expect(diagnostics.latestReceipt?.playerPathPreview).toHaveLength(MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT);
    expect('playerPath' in (diagnostics.latestReceipt ?? {})).toBe(false);
  });

  test('continues with empty history when local storage is corrupt or blocked', () => {
    const corruptStorage = new MemoryStorage();
    corruptStorage.setItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY, '{');

    expect(readMazeCycleTelemetryHistory(corruptStorage)).toEqual({
      version: 1,
      limit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
      receipts: []
    });

    const history = recordMazeCycleTelemetryReceipt({
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      }
    }, {
      averageFrameMs: 17,
      completedAt: '2026-07-08T14:00:00.000Z',
      completionTimeMs: 5000,
      controlMode: 'stick',
      maze: createTestMaze(),
      playerPath: createTestMaze().solutionPath,
      resetUsed: false,
      surface: 'play'
    });

    expect(history.receipts).toHaveLength(1);
  });

  test('derives simple wrong-turn and backtrack counts from player path when explicit counts are absent', () => {
    const maze = createTestMaze();
    const playerPath = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 4 }
    ];

    expect(summarizeMazeCyclePathDeviation(playerPath, maze.solutionPath)).toEqual({
      backtracks: 1,
      wrongTurns: 1
    });

    expect(createMazeCycleTelemetryReceipt({
      averageFrameMs: 15,
      completedAt: '2026-07-08T15:00:00.000Z',
      completionTimeMs: 7000,
      controlMode: 'stick',
      maze,
      playerPath,
      resetUsed: false,
      surface: 'play'
    })).toMatchObject({
      backtracks: 1,
      wrongTurns: 1
    });
  });
});
