import { describe, expect, test } from 'vitest';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  LEGACY_PROGRESSION_MENU_MIN_TILE_PX,
  LEGACY_PROGRESSION_PLAY_MIN_TILE_PX,
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  readLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionViewportScaleCap,
  summarizeLegacyProgressionDiagnostics
} from '../../src/legacy-runtime/legacyProgression';
import { createMazeCycleTelemetryReceipt } from '../../src/legacy-runtime/mazeCycleTelemetry';

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
    expect(readLegacyProgressionState(storage).tracks['ai-runner'].completedCycles).toBe(1);
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

    expect(resolveLegacyMazeComplexity(complexMaze).total).toBeGreaterThan(resolveLegacyMazeComplexity(simpleMaze).total);
  });

  test('uses target complexity to tune future maze scale and visual progression color', () => {
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
    expect(advancedPalette.playerCoreColor).toBe(0xff61c7);
    expect(resolveLegacyProgressionGenerationScale(50, advancedTrack)).toBeGreaterThan(50);
  });

  test('caps progression maze scale with the same snapped mobile render math as the board', () => {
    const state = createEmptyLegacyProgressionState();
    const maxedTrack = {
      ...state.tracks['ai-runner'],
      targetComplexity: 180
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
    expect(LEGACY_PROGRESSION_PLAY_MIN_TILE_PX).toBeGreaterThanOrEqual(5.2);
    expect(unrestrictedScale).toBeGreaterThan(viewportCap);
    expect(phoneScale).toBe(viewportCap);
    expect(narrowScale).toBe(narrowViewportCap);
    expect(narrowScale).toBe(50);
    expect(phoneScale).toBe(50);
    expect(normalPhoneViewportCap).toBe(50);
    expect(playViewportCap).toBeGreaterThan(narrowViewportCap);
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
    expect(diagnostics.palette.label.startsWith('AI ')).toBe(true);
  });
});
