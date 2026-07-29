import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  resolveLegacyPlayableShortestPath,
  type LegacyMazeSnapshot
} from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression,
  type LegacyProgressionState,
  type LegacyProgressionDifficultyBand
} from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION,
  LEGACY_STATIC_SLOW_TILE_PENALTY_MS,
  applyLegacyStaticSlowTileEntry,
  createLegacyStaticSlowTileState,
  isLegacyStaticSlowTileDelayActive,
  recordLegacyStaticSlowTileBlockedMove,
  resolveLegacyStaticSlowTileRemainingMs,
  type LegacyStaticSlowTileState
} from '../../src/legacy-runtime/legacyStaticSlowTile';
import { MenuScene } from '../../src/scenes/MenuScene';

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

interface PauseResetSceneHarness {
  boardDynamicDirty: boolean;
  closeOverlay: () => void;
  maze: LegacyMazeSnapshot;
  playCompletedAtMs: number | null;
  playCyclePath: Array<{ x: number; y: number }>;
  playCycleResetUsed: boolean;
  playStartedAtMs: number;
  playStaticSlowTile: LegacyStaticSlowTileState | null;
  player: { x: number; y: number };
  progressionState: LegacyProgressionState;
  publishInteractionDiagnostics: () => void;
  resetLegacyPlayInputBuffer: () => void;
  resetLegacyWorldTurnHost: () => void;
  syncLegacyPlayerVisualMotionTo: (point: { x: number; y: number }) => void;
  time: { now: number };
  trail: Array<{ x: number; y: number }>;
}

interface ProgressionResetSceneHarness {
  boardDynamicDirty: boolean;
  maze: LegacyMazeSnapshot;
  openOverlay: (overlay: 'pause') => void;
  playStaticSlowTile: LegacyStaticSlowTileState | null;
  progressionState: LegacyProgressionState;
  resolveLegacyProgressionStorage: () => undefined;
  runtimeDiagnosticsLastPublishedAtMs: number;
  setLatestOverlayMessage: (message: unknown) => void;
  syncLegacyRemoteProgressionState: (mode: 'replace') => void;
  visualDiagnosticsLastPublishedAtMs: number;
}

const applyPauseCommand = (
  MenuScene.prototype as unknown as {
    applyLegacyPauseCommand: (
      this: PauseResetSceneHarness,
      command: 'reset-player'
    ) => void;
  }
).applyLegacyPauseCommand;

const resetPlayerProgression = (
  MenuScene.prototype as unknown as {
    resetLegacyPlayerProgression: (
      this: ProgressionResetSceneHarness
    ) => void;
  }
).resetLegacyPlayerProgression;

const createBypassableMaze = (): LegacyMazeSnapshot => ({
  source: 'play-generated',
  size: 7,
  grid: [
    [false, false, false, false, false, false, false],
    [false, true, true, true, true, true, false],
    [false, true, true, true, true, true, false],
    [false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 5, y: 1 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 5, y: 1 }
  ],
  seed: 0x5a17f00d
});

describe('legacy static slow tile', () => {
  test('keeps the primitive disabled outside Architect and Mythic progression', () => {
    const maze = createBypassableMaze();
    const nonEligibleBands: LegacyProgressionDifficultyBand[] = [
      'tutorial',
      'starter',
      'explorer',
      'navigator'
    ];

    for (const band of nonEligibleBands) {
      expect(createLegacyStaticSlowTileState(maze, band)).toMatchObject({
        band,
        consumed: false,
        contractVersion: LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION,
        eligible: false,
        entryCount: 0,
        penaltyMs: LEGACY_STATIC_SLOW_TILE_PENALTY_MS,
        placement: null
      });
    }
  });

  test('places one deterministic tile on the normal route only when a bypass remains', () => {
    const maze = createBypassableMaze();
    const before = JSON.stringify(maze);
    const first = createLegacyStaticSlowTileState(maze, 'architect');
    const second = createLegacyStaticSlowTileState(maze, 'architect');

    expect(first).toEqual(second);
    expect(first.placement).not.toBeNull();
    expect(first.placement?.solutionPathIndex).toBeGreaterThan(0);
    expect(first.placement?.solutionPathIndex).toBeLessThan(maze.solutionPath.length - 1);

    const blockedPoint = first.placement!.point;
    const gridWithoutTile = maze.grid.map((row, y) => row.map((walkable, x) => (
      x === blockedPoint.x && y === blockedPoint.y ? false : walkable
    )));
    const alternateRoute = resolveLegacyPlayableShortestPath(gridWithoutTile, maze.start, maze.goal);

    expect(alternateRoute.found).toBe(true);
    expect(alternateRoute.stepCount).toBe(first.placement?.alternateRouteStepCount);
    expect(JSON.stringify(maze)).toBe(before);
  });

  test('applies exactly one 440 ms movement gate and keeps later re-entry inert', () => {
    const placement = createLegacyStaticSlowTileState(createBypassableMaze(), 'mythic');
    const entry = applyLegacyStaticSlowTileEntry(placement, placement.placement!.point, 1_000.4);

    expect(entry.triggered).toBe(true);
    expect(entry.state).toMatchObject({
      consumed: true,
      delayUntilMs: 1_440,
      enteredAtMs: 1_000,
      entryCount: 1,
      penaltyMs: 440
    });
    expect(resolveLegacyStaticSlowTileRemainingMs(entry.state, 1_000)).toBe(440);
    expect(isLegacyStaticSlowTileDelayActive(entry.state, 1_439)).toBe(true);

    const blocked = recordLegacyStaticSlowTileBlockedMove(entry.state, 1_100);
    expect(blocked?.blockedMoveCount).toBe(1);
    expect(recordLegacyStaticSlowTileBlockedMove(blocked, 1_440)?.blockedMoveCount).toBe(1);
    expect(isLegacyStaticSlowTileDelayActive(blocked, 1_440)).toBe(false);

    const reentry = applyLegacyStaticSlowTileEntry(blocked, placement.placement!.point, 2_000);
    expect(reentry.triggered).toBe(false);
    expect(reentry.state).toEqual(blocked);
  });

  test.each([
    { label: 'consumed state', resetAtMs: 2_000 },
    { label: 'in-flight delay', resetAtMs: 1_100 }
  ])('re-arms the actual pause Reset path from $label', ({ resetAtMs }) => {
    const maze = createBypassableMaze();
    const progressionState = createEmptyLegacyProgressionState();
    progressionState.tracks.player.targetComplexity = 132;
    const initial = createLegacyStaticSlowTileState(maze, 'architect');
    const entered = applyLegacyStaticSlowTileEntry(initial, initial.placement!.point, 1_000).state;
    const scene: PauseResetSceneHarness = {
      boardDynamicDirty: false,
      closeOverlay: vi.fn(),
      maze,
      playCompletedAtMs: 1_500,
      playCyclePath: [{ x: 4, y: 2 }],
      playCycleResetUsed: false,
      playStartedAtMs: 500,
      playStaticSlowTile: entered,
      player: { x: 4, y: 2 },
      progressionState,
      publishInteractionDiagnostics: vi.fn(),
      resetLegacyPlayInputBuffer: vi.fn(),
      resetLegacyWorldTurnHost: vi.fn(),
      syncLegacyPlayerVisualMotionTo: vi.fn(),
      time: { now: resetAtMs },
      trail: [{ x: 4, y: 2 }, { x: 5, y: 2 }]
    };

    expect(entered).toMatchObject({
      consumed: true,
      delayUntilMs: 1_440,
      entryCount: 1
    });
    applyPauseCommand.call(scene, 'reset-player');

    expect(scene.playStaticSlowTile).toEqual(createLegacyStaticSlowTileState(maze, 'architect'));
    expect(scene.playStaticSlowTile).toMatchObject({
      blockedMoveCount: 0,
      consumed: false,
      delayUntilMs: null,
      enteredAtMs: null,
      entryCount: 0
    });
    expect(scene.player).toEqual(maze.start);
    expect(scene.trail).toEqual([maze.start]);
    expect(scene.playStartedAtMs).toBe(resetAtMs);
    expect(scene.closeOverlay).toHaveBeenCalledOnce();

    const freshEntry = applyLegacyStaticSlowTileEntry(
      scene.playStaticSlowTile,
      scene.playStaticSlowTile!.placement!.point,
      resetAtMs + 10
    );
    expect(freshEntry).toMatchObject({
      triggered: true,
      state: {
        consumed: true,
        delayUntilMs: resetAtMs + 450,
        entryCount: 1,
        penaltyMs: 440
      }
    });
  });

  test.each([
    { label: 'consumed state', resetAtMs: 2_000 },
    { label: 'in-flight delay', resetAtMs: 1_100 }
  ])('disables pressure through the actual Reset Progression path from $label', ({ resetAtMs }) => {
    const maze = createBypassableMaze();
    const progressionState = createEmptyLegacyProgressionState();
    progressionState.tracks.player.targetComplexity = 132;
    progressionState.tracks['ai-runner'].targetComplexity = 180;
    const initial = createLegacyStaticSlowTileState(maze, 'architect');
    const entered = applyLegacyStaticSlowTileEntry(initial, initial.placement!.point, 1_000).state;
    const player = { x: 4, y: 2 };
    const trail = [{ x: 4, y: 2 }, { x: 5, y: 2 }];
    const scene: ProgressionResetSceneHarness & {
      player: { x: number; y: number };
      trail: Array<{ x: number; y: number }>;
    } = {
      boardDynamicDirty: false,
      maze,
      openOverlay: vi.fn(),
      playStaticSlowTile: entered,
      player,
      progressionState,
      resolveLegacyProgressionStorage: () => undefined,
      runtimeDiagnosticsLastPublishedAtMs: 4_000,
      setLatestOverlayMessage: vi.fn(),
      syncLegacyRemoteProgressionState: vi.fn(),
      trail,
      visualDiagnosticsLastPublishedAtMs: 3_000
    };

    expect(isLegacyStaticSlowTileDelayActive(entered, resetAtMs)).toBe(resetAtMs < 1_440);
    resetPlayerProgression.call(scene);

    expect(scene.progressionState.tracks.player).toEqual(
      createEmptyLegacyProgressionState().tracks.player
    );
    expect(scene.progressionState.tracks['ai-runner'].targetComplexity).toBe(180);
    expect(scene.playStaticSlowTile).toEqual(createLegacyStaticSlowTileState(maze, 'starter'));
    expect(scene.playStaticSlowTile).toMatchObject({
      band: 'starter',
      blockedMoveCount: 0,
      consumed: false,
      delayUntilMs: null,
      eligible: false,
      enteredAtMs: null,
      entryCount: 0,
      placement: null
    });
    expect(isLegacyStaticSlowTileDelayActive(scene.playStaticSlowTile, resetAtMs)).toBe(false);
    expect(scene.player).toBe(player);
    expect(scene.trail).toBe(trail);
    expect(scene.syncLegacyRemoteProgressionState).toHaveBeenCalledWith('replace');
    expect(scene.openOverlay).toHaveBeenCalledWith('pause');
  });

  test('finds deterministic bypassable placements across the fixed Architect/Mythic corpus', () => {
    const bands = [
      { band: 'architect' as const, targetComplexity: 132 },
      { band: 'mythic' as const, targetComplexity: 180 }
    ];
    const seeds = Array.from({ length: 20 }, (_, index) => index + 1);

    for (const { band, targetComplexity } of bands) {
      const generationProfile = resolveLegacyMazeGenerationProfileForProgression(targetComplexity);
      for (const seed of seeds) {
        const maze = createLegacyRuntimeMazeForMode(
          'play',
          band === 'architect' ? 71 : 96,
          seed,
          generationProfile
        );
        const before = JSON.stringify(maze);
        const first = createLegacyStaticSlowTileState(maze, band);
        const second = createLegacyStaticSlowTileState(maze, band);

        expect(first).toEqual(second);
        expect(first.placement, `${band} seed ${seed}`).not.toBeNull();
        expect(first.placement?.solutionPathIndex).toBeGreaterThanOrEqual(2);
        expect(first.placement?.solutionPathIndex).toBeLessThanOrEqual(maze.solutionPath.length - 3);
        expect(JSON.stringify(maze)).toBe(before);
      }
    }
  }, 30_000);

  test('wires placement, movement admission, diagnostics, and drawing through the play scene only', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).toContain('this.playStaticSlowTile = null;');
    expect(menuSceneSource).toContain('this.playStaticSlowTile = createLegacyStaticSlowTileState(');
    expect(menuSceneSource).toContain('if (isLegacyStaticSlowTileDelayActive(this.playStaticSlowTile, this.time.now))');
    expect(menuSceneSource).toContain("type: 'static-slow-tile-entered'");
    expect(menuSceneSource).toContain('this.drawLegacyPlayStaticSlowTile(mazeLeft, mazeTop, mazeTileSize);');
    expect(menuSceneSource).toContain('pressure: this.playStaticSlowTile');
    expect(diagnosticsSource).toContain("contractVersion: 'legacy-static-slow-tile-v1';");
    expect(diagnosticsSource).toContain('penaltyMs: 440;');
  });
});
