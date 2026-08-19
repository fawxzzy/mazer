import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import { createLegacyGuestAuthSnapshot } from '../../src/legacy-runtime/legacyAuth';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_STORAGE_KEY,
  type LegacyProgressionState
} from '../../src/legacy-runtime/legacyProgression';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import type { MazeCycleTelemetryHistory } from '../../src/legacy-runtime/mazeCycleTelemetry';
import type { LegacyRemoteProgressionSyncResult } from '../../src/legacy-runtime/legacyRemoteProgression';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

class MemoryStorage {
  public readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const recordMazeCycleCompletion = (
  MenuScene.prototype as unknown as {
    recordMazeCycleCompletion: (this: PlayerProgressionSceneHarness, surface: 'play') => void;
  }
).recordMazeCycleCompletion;

const publishLegacyRemoteSyncResult = (
  MenuScene.prototype as unknown as {
    publishLegacyRemoteSyncResult: (
      this: PlayerProgressionSceneHarness,
      result: LegacyRemoteProgressionSyncResult
    ) => void;
  }
).publishLegacyRemoteSyncResult;

const armLegacyMenuStaticDeconstructStage = (
  MenuScene.prototype as unknown as {
    armLegacyMenuStaticDeconstructStage: (this: PlayerProgressionSceneHarness, time: number) => void;
  }
).armLegacyMenuStaticDeconstructStage;

interface PlayerProgressionSceneHarness {
  authSnapshot: ReturnType<typeof createLegacyGuestAuthSnapshot>;
  boardDynamicDirty: boolean;
  boardPathDirty: boolean;
  maze: LegacyMazeSnapshot;
  mazeCycleTelemetryHistory: MazeCycleTelemetryHistory;
  mazeSeed: number;
  latestRemoteSyncResult: LegacyRemoteProgressionSyncResult | null;
  menuDemoCompletedAtMs: number | null;
  menuDemoCycleRecorded: boolean;
  menuDemoCycleStartedAtMs: number;
  menuDemoEpisode: null;
  menuDemoConfig: null;
  menuStaticBuildPrerollStartedAtMs: number | null;
  menuStaticDeconstructStartedAtMs: number | null;
  menuStaticDeconstructZeroHoldStartedAtMs: number | null;
  menuStaticDrawLifecyclePhase: 'idle' | 'deconstructing';
  menuStaticDrawNextRowAtMs: number;
  menuStaticDrawNextTileAtMs: number;
  menuStaticDrawRowsVisible: number | null;
  menuStaticDrawTileOrder: Array<{ x: number; y: number }>;
  menuStaticDrawTilesVisible: number | null;
  menuStaticDrawVisibleTileKeys: Set<string>;
  mode: 'play';
  pendingGenerationRequest: { targetComplexity?: number; reason?: string } | null;
  playCompletedAtMs: number;
  playCyclePath: LegacyMazeSnapshot['solutionPath'];
  playCycleResetUsed: boolean;
  playStartedAtMs: number;
  progressionState: LegacyProgressionState;
  publishLegacyRemoteSyncException: ReturnType<typeof vi.fn>;
  publishLegacyRemoteSyncResult: ReturnType<typeof vi.fn>;
  pushLegacyPlayerMessage: ReturnType<typeof vi.fn>;
  refreshLegacyMenuStaticDrawVisibleTileKeys: ReturnType<typeof vi.fn>;
  resolveLegacyMenuStaticDeconstructDurationMs: () => number;
  resolveLegacyMenuStaticDeconstructTileStartAtMs: (time: number) => number;
  resolveLegacyBoardAspectRatioForMode: () => number;
  resolveLegacyMazeGenerationProfileForMode: () => object;
  resolveLegacyProgressionScaleForMode: () => number;
  resolveLegacyProgressionStorage: () => MemoryStorage;
  resolveLegacyTargetComplexityForMode: () => number;
  resolveMazeCycleTelemetryStorage: () => MemoryStorage;
  resolveRuntimeAverageFrameMs: () => number;
  runtimeDiagnosticsLastPublishedAtMs: number;
  settings: { controlMode: 'stick' };
  syncLegacyRemoteProgressionState: ReturnType<typeof vi.fn>;
  time: { now: number };
  visualDiagnosticsLastPublishedAtMs: number;
  createFreshLegacyPlayGenerationSeed: () => number;
}

const createProgressionMaze = (): LegacyMazeSnapshot => ({
  source: 'play-generated',
  width: 5,
  height: 5,
  grid: [
    [false, false, false, false, false],
    [false, true, true, true, false],
    [false, false, false, true, false],
    [false, true, true, true, false],
    [false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 3, y: 3 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 2 },
    { x: 3, y: 3 }
  ],
  seed: 741,
  routeQualityStats: {
    bypassableRouteBands: 1,
    bypassableSolutionEdges: 1,
    meaningfulBypassableRouteBands: 1,
    meaningfulBypassableSolutionEdges: 1,
    minimumMeaningfulDetour: 2,
    routeQuality: 'multi-route',
    sampledSolutionEdges: 4
  },
  shortcutStats: {
    requested: 1,
    attempts: 1,
    created: 1,
    wallArrayEntries: 1,
    uniqueWallCandidates: 1,
    exhaustedWallArray: false
  },
  shortcutsCreated: 1,
  pathBuilderStats: {
    acceptedCheckpoints: 3,
    backtracks: 0,
    deterministicSafetyStart: false,
    exhaustedCheckpoints: false,
    longestPathLength: 5,
    pathTiles: 5,
    requestedCheckpoints: 3,
    topology: 'legacy-checkpoint-path-builder',
    wallArrayEntries: 1
  }
});

const createScene = (): { scene: PlayerProgressionSceneHarness; storage: MemoryStorage } => {
  const storage = new MemoryStorage();
  const maze = createProgressionMaze();
  const progressionState = createEmptyLegacyProgressionState();
  const scene: PlayerProgressionSceneHarness = {
    authSnapshot: createLegacyGuestAuthSnapshot(),
    boardDynamicDirty: false,
    boardPathDirty: false,
    maze,
    mazeCycleTelemetryHistory: { receipts: [], version: 1 },
    mazeSeed: maze.seed,
    latestRemoteSyncResult: null,
    menuDemoCompletedAtMs: null,
    menuDemoCycleRecorded: false,
    menuDemoCycleStartedAtMs: 0,
    menuDemoEpisode: null,
    menuDemoConfig: null,
    menuStaticBuildPrerollStartedAtMs: null,
    menuStaticDeconstructStartedAtMs: null,
    menuStaticDeconstructZeroHoldStartedAtMs: null,
    menuStaticDrawLifecyclePhase: 'idle',
    menuStaticDrawNextRowAtMs: 0,
    menuStaticDrawNextTileAtMs: 0,
    menuStaticDrawRowsVisible: null,
    menuStaticDrawTileOrder: [{ x: 1, y: 1 }],
    menuStaticDrawTilesVisible: null,
    menuStaticDrawVisibleTileKeys: new Set(),
    mode: 'play',
    pendingGenerationRequest: null,
    playCompletedAtMs: 8_000,
    playCyclePath: maze.solutionPath,
    playCycleResetUsed: false,
    playStartedAtMs: 0,
    progressionState,
    publishLegacyRemoteSyncException: vi.fn(),
    publishLegacyRemoteSyncResult: vi.fn(),
    pushLegacyPlayerMessage: vi.fn(),
    refreshLegacyMenuStaticDrawVisibleTileKeys: vi.fn(),
    resolveLegacyMenuStaticDeconstructDurationMs: () => 120,
    resolveLegacyMenuStaticDeconstructTileStartAtMs: (time) => time,
    resolveLegacyBoardAspectRatioForMode: () => 1,
    resolveLegacyMazeGenerationProfileForMode: () => ({}),
    resolveLegacyProgressionScaleForMode: () => 37,
    resolveLegacyProgressionStorage: () => storage,
    resolveLegacyTargetComplexityForMode: () => scene.progressionState.tracks.player.targetComplexity,
    resolveMazeCycleTelemetryStorage: () => storage,
    resolveRuntimeAverageFrameMs: () => 16,
    runtimeDiagnosticsLastPublishedAtMs: 1,
    settings: { controlMode: 'stick' },
    syncLegacyRemoteProgressionState: vi.fn(),
    time: { now: 8_000 },
    visualDiagnosticsLastPublishedAtMs: 1,
    createFreshLegacyPlayGenerationSeed: () => 742
  };

  return { scene, storage };
};

describe('player progression completion flow', () => {
  test('advances one visible level for a completed maze, without a completion message', () => {
    const { scene, storage } = createScene();

    recordMazeCycleCompletion.call(scene, 'play');

    expect(scene.progressionState.tracks.player).toMatchObject({
      completedCycles: 1,
      lastSignal: 'challenge',
      level: 2,
      targetComplexity: 12
    });
    expect(JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY) ?? '{}').tracks.player.completedCycles).toBe(1);
    expect(scene.pushLegacyPlayerMessage).not.toHaveBeenCalled();

    armLegacyMenuStaticDeconstructStage.call(scene, scene.time.now);

    expect(scene.pendingGenerationRequest).toMatchObject({
      reason: 'play-goal-reset',
      targetComplexity: 12
    });
    expect(scene.boardDynamicDirty).toBe(true);
    expect(scene.boardPathDirty).toBe(true);
  });


  test('keeps a completed maze visible even when the route contains an extreme detour', () => {
    const { scene } = createScene();
    scene.playCyclePath = [
      ...scene.maze.solutionPath,
      ...scene.maze.solutionPath,
      ...scene.maze.solutionPath
    ];

    recordMazeCycleCompletion.call(scene, 'play');

    expect(scene.progressionState.tracks.player).toMatchObject({
      completedCycles: 1,
      lastSignal: 'challenge',
      level: 2,
      targetComplexity: 12
    });
    expect(scene.pushLegacyPlayerMessage).not.toHaveBeenCalled();
  });

  test('keeps a completed maze visible after a slow restart', () => {
    const { scene } = createScene();
    scene.playCompletedAtMs = 100_000;
    scene.time.now = 100_000;
    scene.playCycleResetUsed = true;

    recordMazeCycleCompletion.call(scene, 'play');

    expect(scene.progressionState.tracks.player).toMatchObject({
      completedCycles: 1,
      lastSignal: 'challenge',
      level: 2,
      targetComplexity: 12
    });
    expect(scene.pushLegacyPlayerMessage).not.toHaveBeenCalled();
  });

  test('keeps local and cloud persistence outcomes out of player messaging while retaining diagnostics', () => {
    const { scene } = createScene();
    const result: LegacyRemoteProgressionSyncResult = {
      error: 'network unavailable',
      playerMessage: {
        copy: 'Progress saved locally. Cloud sync will retry later.',
        durationMs: 2_400,
        id: 'remote.progression.error',
        source: 'progression',
        technicalDetail: 'network unavailable',
        tone: 'warning'
      },
      skippedReason: null,
      synced: false
    };

    publishLegacyRemoteSyncResult.call(scene, result);

    expect(scene.latestRemoteSyncResult).toBe(result);
    expect(scene.pushLegacyPlayerMessage).not.toHaveBeenCalled();
    expect(scene.visualDiagnosticsLastPublishedAtMs).toBe(Number.NEGATIVE_INFINITY);
  });
});
