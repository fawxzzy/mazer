import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  createLegacyGenerationRequest,
  createLegacyRuntimeMazeForMode,
  type LegacyGenerationRequest
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  LEGACY_DEFAULTS,
  copyLegacySettings
} from '../../src/legacy-runtime/legacyDefaults';
import {
  createLegacyRoomCandidateMetadata,
  type LegacyRoomCandidateMetadata
} from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import {
  LEGACY_PATROL_AGENT_COLLISION_DELAY_MS,
  LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS,
  LEGACY_PATROL_AGENT_CONTRACT_VERSION,
  LEGACY_PATROL_AGENT_ROUND_TRIP_MS,
  LEGACY_PATROL_AGENT_STEP_MS,
  LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS,
  advanceLegacyPatrolAgent,
  applyLegacyPatrolAgentCollision,
  createLegacyPatrolAgentState,
  isLegacyPatrolAgentDelayActive,
  recordLegacyPatrolAgentBlockedMove,
  resolveLegacyPatrolAgentPoint,
  resolveLegacyPatrolAgentCollisionFeedback,
  resolveLegacyPatrolAgentRemainingMs,
  resolveLegacyPatrolAgentTelegraph,
  resolveLegacyPatrolAgentTick,
  type LegacyPatrolAgentState
} from '../../src/legacy-runtime/legacyPatrolAgent';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression,
  type LegacyProgressionDifficultyBand,
  type LegacyProgressionState
} from '../../src/legacy-runtime/legacyProgression';
import {
  createLegacyStaticSlowTileState,
  type LegacyStaticSlowTileState
} from '../../src/legacy-runtime/legacyStaticSlowTile';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import { WorldTurnHost } from '../../src/mazer-core/world';
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

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const roomFootprint = (room: LegacyRoomCandidateMetadata | null): LegacyPoint[] => {
  if (!room) {
    return [];
  }
  const { x, y } = room.candidate.topLeft;
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 }
  ];
};

const createPatrolDependencies = (maze: LegacyMazeSnapshot) => {
  const slowTile = createLegacyStaticSlowTileState(maze, 'mythic');
  const room = createLegacyRoomCandidateMetadata(
    maze,
    'mythic',
    slowTile.placement?.point ?? null
  );
  const excludedPoints = [
    ...(slowTile.placement ? [slowTile.placement.point] : []),
    ...roomFootprint(room)
  ];
  return {
    excludedPoints,
    room,
    slowTile
  };
};

const createMythicMaze = (seed = 1): LegacyMazeSnapshot => createLegacyRuntimeMazeForMode(
  'play',
  96,
  seed,
  resolveLegacyMazeGenerationProfileForProgression(180)
);

interface PauseResetHarness {
  boardDynamicDirty: boolean;
  closeOverlay: () => void;
  createLegacyPlayPatrolAgent: (
    band: LegacyProgressionDifficultyBand
  ) => LegacyPatrolAgentState | null;
  maze: LegacyMazeSnapshot;
  playCompletedAtMs: number | null;
  playCyclePath: LegacyPoint[];
  playCycleResetUsed: boolean;
  playPatrolAgent: LegacyPatrolAgentState | null;
  playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null;
  playStartedAtMs: number;
  playStaticSlowTile: LegacyStaticSlowTileState | null;
  player: LegacyPoint;
  progressionState: LegacyProgressionState;
  publishInteractionDiagnostics: () => void;
  resetLegacyPlayInputBuffer: () => void;
  resetLegacyWorldTurnHost: () => void;
  syncLegacyPlayerVisualMotionTo: (point: LegacyPoint) => void;
  time: { now: number };
  trail: LegacyPoint[];
}

interface ProgressionResetHarness {
  boardDynamicDirty: boolean;
  maze: LegacyMazeSnapshot;
  openOverlay: (overlay: 'pause') => void;
  playPatrolAgent: LegacyPatrolAgentState | null;
  playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null;
  playStaticSlowTile: LegacyStaticSlowTileState | null;
  progressionState: LegacyProgressionState;
  resetLegacyWorldTurnHost: () => void;
  resolveLegacyProgressionStorage: () => undefined;
  runtimeDiagnosticsLastPublishedAtMs: number;
  setLatestOverlayMessage: (message: unknown) => void;
  syncLegacyRemoteProgressionState: (mode: 'replace') => void;
  visualDiagnosticsLastPublishedAtMs: number;
}

interface CollisionFeedbackVisualHarness {
  boardDynamicDirty: boolean;
  mode: 'menu' | 'play';
  playPatrolCollisionFeedbackActive: boolean;
}

const applyPauseCommand = (
  MenuScene.prototype as unknown as {
    applyLegacyPauseCommand: (
      this: PauseResetHarness,
      command: 'reset-player'
    ) => void;
  }
).applyLegacyPauseCommand;

const resetPlayerProgression = (
  MenuScene.prototype as unknown as {
    resetLegacyPlayerProgression: (
      this: ProgressionResetHarness
    ) => void;
  }
).resetLegacyPlayerProgression;

const applyGenerationRequest = (
  MenuScene.prototype as unknown as {
    applyGenerationRequest: (
      this: MenuScene,
      request: LegacyGenerationRequest,
      nextDemoMoveAtMs?: number
    ) => void;
  }
).applyGenerationRequest;

const createWorldTurnHost = (
  MenuScene.prototype as unknown as {
    createLegacyWorldTurnHost: (this: MenuScene) => WorldTurnHost;
  }
).createLegacyWorldTurnHost;

const resetWorldTurnHost = (
  MenuScene.prototype as unknown as {
    resetLegacyWorldTurnHost: (this: MenuScene) => void;
  }
).resetLegacyWorldTurnHost;

const refreshCollisionFeedbackVisualState = (
  MenuScene.prototype as unknown as {
    refreshLegacyPatrolCollisionFeedbackVisualState: (
      this: CollisionFeedbackVisualHarness,
      active: boolean
    ) => void;
  }
).refreshLegacyPatrolCollisionFeedbackVisualState;

describe('legacy Mythic patrol agent', () => {
  test('selects one deterministic bypassable two-tile route and preserves every excluded surface', () => {
    const rows = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      const maze = createMythicMaze(seed);
      const before = JSON.stringify(maze);
      const { excludedPoints } = createPatrolDependencies(maze);
      const first = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints);
      const second = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints);

      expect(first, `seed ${seed}`).not.toBeNull();
      expect(first).toEqual(second);
      expect(first).toMatchObject({
        band: 'mythic',
        contractVersion: LEGACY_PATROL_AGENT_CONTRACT_VERSION,
        currentRouteIndex: 0,
        eligible: true,
        stepCount: 0
      });
      expect(first!.placement.route).toHaveLength(2);
      expect(first!.placement.solutionPathIndices[1]).toBe(
        first!.placement.solutionPathIndices[0] + 1
      );
      const excludedKeys = new Set(excludedPoints.map(pointKey));
      expect(first!.placement.route.every((point) => !excludedKeys.has(pointKey(point)))).toBe(true);
      expect(JSON.stringify(maze)).toBe(before);
      rows.push({
        route: first!.placement.route,
        seed,
        solutionPathIndices: first!.placement.solutionPathIndices
      });
    }

    expect(rows).toHaveLength(20);
    for (const band of ['tutorial', 'starter', 'explorer', 'navigator', 'architect'] as const) {
      expect(createLegacyPatrolAgentState(createMythicMaze(), band)).toBeNull();
    }
  }, 20_000);

  test('uses exact 440 ms ticks, skips paused time, and never catches up in a burst', () => {
    const maze = createMythicMaze();
    const { excludedPoints } = createPatrolDependencies(maze);
    const initial = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints);
    const epochMs = 10_000;

    expect(resolveLegacyPatrolAgentTick(initial, epochMs, epochMs, true)).toMatchObject({
      tickIndex: 0,
      triggered: false
    });
    expect(resolveLegacyPatrolAgentTick(initial, epochMs + 439, epochMs, true)).toMatchObject({
      tickIndex: 0,
      triggered: false
    });
    const firstTick = resolveLegacyPatrolAgentTick(initial, epochMs + 440, epochMs, true);
    expect(firstTick).toMatchObject({ tickIndex: 1, triggered: true });
    const firstStep = advanceLegacyPatrolAgent(firstTick.state, epochMs + 440);
    expect(firstStep).toMatchObject({
      currentRouteIndex: 1,
      lastResolvedTickIndex: 1,
      lastStepAtMs: epochMs + 440,
      stepCount: 1
    });

    const paused = resolveLegacyPatrolAgentTick(firstStep, epochMs + 5_280, epochMs, false);
    expect(paused).toMatchObject({
      state: { lastResolvedTickIndex: 12, stepCount: 1 },
      tickIndex: 12,
      triggered: false
    });
    expect(resolveLegacyPatrolAgentTick(paused.state, epochMs + 5_280, epochMs, true))
      .toMatchObject({ tickIndex: 12, triggered: false });
    const resumed = resolveLegacyPatrolAgentTick(paused.state, epochMs + 5_720, epochMs, true);
    expect(resumed).toMatchObject({ tickIndex: 13, triggered: true });
    expect(advanceLegacyPatrolAgent(resumed.state, epochMs + 5_720)).toMatchObject({
      currentRouteIndex: 0,
      stepCount: 2
    });
    expect(LEGACY_PATROL_AGENT_STEP_MS).toBe(440);
    expect(LEGACY_PATROL_AGENT_ROUND_TRIP_MS).toBe(880);
  });

  test('telegraphs exactly the final 220 ms before each existing patrol step', () => {
    const maze = createMythicMaze();
    const { excludedPoints } = createPatrolDependencies(maze);
    const initial = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints)!;
    const epochMs = 10_000;
    const expectedNextPoint = initial.placement.route[1];

    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs, epochMs, true)).toMatchObject({
      active: false,
      elapsedInStepMs: 0,
      msUntilStep: 440,
      nextPoint: expectedNextPoint,
      nextRouteIndex: 1,
      telegraphWindowMs: 220
    });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 219, epochMs, true))
      .toMatchObject({ active: false, elapsedInStepMs: 219, msUntilStep: 221 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 220, epochMs, true))
      .toMatchObject({ active: true, elapsedInStepMs: 220, msUntilStep: 220 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 439, epochMs, true))
      .toMatchObject({ active: true, elapsedInStepMs: 439, msUntilStep: 1 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 440, epochMs, true))
      .toMatchObject({ active: false, elapsedInStepMs: 0, msUntilStep: 440 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 660, epochMs, true))
      .toMatchObject({ active: true, elapsedInStepMs: 220, msUntilStep: 220 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 1_319, epochMs, true))
      .toMatchObject({ active: true, elapsedInStepMs: 439, msUntilStep: 1 });
    expect(resolveLegacyPatrolAgentTelegraph(initial, epochMs + 220, epochMs, false))
      .toMatchObject({
        active: false,
        nextPoint: expectedNextPoint,
        nextRouteIndex: 1
      });
    expect(resolveLegacyPatrolAgentTelegraph(null, epochMs + 220, epochMs, true))
      .toMatchObject({
        active: false,
        elapsedInStepMs: null,
        msUntilStep: null,
        nextPoint: null,
        nextRouteIndex: null
      });
    expect(LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS).toBe(220);
  });

  test('applies one non-additive 440 ms delay per overlap episode', () => {
    const maze = createMythicMaze();
    const { excludedPoints } = createPatrolDependencies(maze);
    const initial = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints);
    const firstPoint = resolveLegacyPatrolAgentPoint(initial)!;
    const firstCollision = applyLegacyPatrolAgentCollision(initial, firstPoint, 1_000);

    expect(firstCollision).toMatchObject({
      penaltyAppliedMs: LEGACY_PATROL_AGENT_COLLISION_DELAY_MS,
      state: {
        collisionCount: 1,
        collisionDelayUntilMs: 1_440,
        collisionEpisodeActive: true,
        penaltyCount: 1
      },
      triggered: true
    });
    expect(applyLegacyPatrolAgentCollision(firstCollision.state, firstPoint, 1_010))
      .toMatchObject({ penaltyAppliedMs: 0, triggered: false });
    expect(isLegacyPatrolAgentDelayActive(firstCollision.state, 1_439)).toBe(true);
    expect(resolveLegacyPatrolAgentRemainingMs(firstCollision.state, 1_439)).toBe(1);
    expect(isLegacyPatrolAgentDelayActive(firstCollision.state, 1_440)).toBe(false);
    expect(recordLegacyPatrolAgentBlockedMove(firstCollision.state, 1_100))
      .toMatchObject({ blockedMoveCount: 1 });

    const movedAway = advanceLegacyPatrolAgent(firstCollision.state, 1_100);
    const released = applyLegacyPatrolAgentCollision(movedAway, firstPoint, 1_100);
    expect(released.state).toMatchObject({ collisionEpisodeActive: false });
    const returned = advanceLegacyPatrolAgent(released.state, 1_200);
    const secondCollision = applyLegacyPatrolAgentCollision(returned, firstPoint, 1_200);
    expect(secondCollision).toMatchObject({
      penaltyAppliedMs: 440,
      state: {
        collisionCount: 2,
        collisionDelayUntilMs: 1_640,
        penaltyCount: 2
      },
      triggered: true
    });
  });

  test('shows collision feedback only for the first 220 ms of the existing delay', () => {
    const maze = createMythicMaze();
    const { excludedPoints } = createPatrolDependencies(maze);
    const initial = createLegacyPatrolAgentState(maze, 'mythic', excludedPoints);
    const point = resolveLegacyPatrolAgentPoint(initial)!;
    const collision = applyLegacyPatrolAgentCollision(initial, point, 1_000);

    expect(resolveLegacyPatrolAgentCollisionFeedback(null, 1_000)).toEqual({
      active: false,
      elapsedMs: null,
      windowMs: 220
    });
    expect(resolveLegacyPatrolAgentCollisionFeedback(collision.state, 1_000))
      .toMatchObject({ active: true, elapsedMs: 0, windowMs: 220 });
    expect(resolveLegacyPatrolAgentCollisionFeedback(collision.state, 1_219))
      .toMatchObject({ active: true, elapsedMs: 219 });
    expect(resolveLegacyPatrolAgentCollisionFeedback(collision.state, 1_220))
      .toMatchObject({ active: false, elapsedMs: 220 });
    expect(LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS).toBe(220);
  });

  test('forces one final dynamic redraw on the first inactive collision-feedback frame', () => {
    const scene: CollisionFeedbackVisualHarness = {
      boardDynamicDirty: false,
      mode: 'play',
      playPatrolCollisionFeedbackActive: false
    };

    refreshCollisionFeedbackVisualState.call(scene, true);
    expect(scene).toMatchObject({
      boardDynamicDirty: true,
      playPatrolCollisionFeedbackActive: true
    });

    scene.boardDynamicDirty = false;
    refreshCollisionFeedbackVisualState.call(scene, true);
    expect(scene.boardDynamicDirty).toBe(true);

    scene.boardDynamicDirty = false;
    refreshCollisionFeedbackVisualState.call(scene, false);
    expect(scene).toMatchObject({
      boardDynamicDirty: true,
      playPatrolCollisionFeedbackActive: false
    });

    scene.boardDynamicDirty = false;
    refreshCollisionFeedbackVisualState.call(scene, false);
    expect(scene.boardDynamicDirty).toBe(false);
  });

  test('re-arms on Pause Reset and clears on Reset Progression without maze regeneration', () => {
    const maze = createMythicMaze();
    const before = JSON.stringify(maze);
    const progressionState = createEmptyLegacyProgressionState();
    progressionState.tracks.player.targetComplexity = 180;
    const dependencies = createPatrolDependencies(maze);
    const fresh = createLegacyPatrolAgentState(maze, 'mythic', dependencies.excludedPoints)!;
    const consumed = applyLegacyPatrolAgentCollision(
      advanceLegacyPatrolAgent(fresh, 1_000),
      fresh.placement.route[1],
      1_000
    ).state;
    const createFreshPatrol = (band: LegacyProgressionDifficultyBand) => {
      const slowTile = createLegacyStaticSlowTileState(maze, band);
      const room = createLegacyRoomCandidateMetadata(
        maze,
        band,
        slowTile.placement?.point ?? null
      );
      return createLegacyPatrolAgentState(maze, band, [
        ...(slowTile.placement ? [slowTile.placement.point] : []),
        ...roomFootprint(room)
      ]);
    };
    const pauseScene: PauseResetHarness = {
      boardDynamicDirty: false,
      closeOverlay: vi.fn(),
      createLegacyPlayPatrolAgent: createFreshPatrol,
      maze,
      playCompletedAtMs: 1_500,
      playCyclePath: [{ x: 3, y: 3 }],
      playCycleResetUsed: false,
      playPatrolAgent: consumed,
      playRoomCandidateMetadata: dependencies.room,
      playStartedAtMs: 500,
      playStaticSlowTile: dependencies.slowTile,
      player: { x: 3, y: 3 },
      progressionState,
      publishInteractionDiagnostics: vi.fn(),
      resetLegacyPlayInputBuffer: vi.fn(),
      resetLegacyWorldTurnHost: vi.fn(),
      syncLegacyPlayerVisualMotionTo: vi.fn(),
      time: { now: 2_000 },
      trail: [{ x: 3, y: 3 }]
    };

    applyPauseCommand.call(pauseScene, 'reset-player');
    expect(pauseScene.playPatrolAgent).toEqual(createFreshPatrol('mythic'));
    expect(pauseScene.playPatrolAgent).toMatchObject({
      collisionCount: 0,
      collisionDelayUntilMs: null,
      currentRouteIndex: 0,
      penaltyCount: 0,
      stepCount: 0
    });
    expect(pauseScene.resetLegacyWorldTurnHost).toHaveBeenCalledOnce();

    const progressionScene: ProgressionResetHarness = {
      boardDynamicDirty: false,
      maze,
      openOverlay: vi.fn(),
      playPatrolAgent: pauseScene.playPatrolAgent,
      playRoomCandidateMetadata: pauseScene.playRoomCandidateMetadata,
      playStaticSlowTile: pauseScene.playStaticSlowTile,
      progressionState,
      resetLegacyWorldTurnHost: vi.fn(),
      resolveLegacyProgressionStorage: () => undefined,
      runtimeDiagnosticsLastPublishedAtMs: 4_000,
      setLatestOverlayMessage: vi.fn(),
      syncLegacyRemoteProgressionState: vi.fn(),
      visualDiagnosticsLastPublishedAtMs: 3_000
    };

    resetPlayerProgression.call(progressionScene);
    expect(progressionScene.playPatrolAgent).toBeNull();
    expect(progressionScene.playRoomCandidateMetadata).toBeNull();
    expect(progressionScene.resetLegacyWorldTurnHost).toHaveBeenCalledOnce();
    expect(JSON.stringify(maze)).toBe(before);
  });

  test('recreates the immutable timed-mode host after play-to-menu patrol state settles', () => {
    const progressionState = createEmptyLegacyProgressionState();
    progressionState.tracks.player.targetComplexity = 180;
    const scene = {
      activeInputField: null,
      armLegacyMenuStaticDrawStage: vi.fn(),
      boardDynamicDirty: false,
      boardPathDirty: false,
      boardStaticDirty: false,
      createLegacyPlayPatrolAgent(
        this: {
          maze: LegacyMazeSnapshot;
          playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null;
          playStaticSlowTile: LegacyStaticSlowTileState;
        },
        band: LegacyProgressionDifficultyBand
      ) {
        return createLegacyPatrolAgentState(this.maze, band, [
          ...(this.playStaticSlowTile.placement ? [this.playStaticSlowTile.placement.point] : []),
          ...roomFootprint(this.playRoomCandidateMetadata)
        ]);
      },
      createLegacyWorldTurnHost: createWorldTurnHost,
      legacyWorldTurnCommandSequence: 0,
      legacyWorldTurnHost: new WorldTurnHost({}, { timedModeEnabled: false }),
      legacyWorldTurnMove: null,
      playPatrolAgent: null,
      progressionState,
      refreshLayout: vi.fn(),
      resetLegacyWorldTurnHost: resetWorldTurnHost,
      resolveLegacyMenuStaticDrawDemoGateAtMs: () => 1_000,
      settings: copyLegacySettings(LEGACY_DEFAULTS),
      startLegacyPlayCompassSpin: vi.fn(),
      syncLegacyPlayerVisualMotionTo: vi.fn(),
      time: { now: 1_000 },
      titleGraphics: { setVisible: vi.fn() },
      uiDirty: false
    } as unknown as MenuScene;
    const readback = () => scene as unknown as {
      legacyWorldTurnHost: WorldTurnHost;
      playPatrolAgent: LegacyPatrolAgentState | null;
    };
    const generationProfile = resolveLegacyMazeGenerationProfileForProgression(180);

    applyGenerationRequest.call(scene, createLegacyGenerationRequest({
      currentSeed: 577_196_705,
      dueAtMs: 1_000,
      generationProfile,
      mode: 'play',
      reason: 'play-start',
      scale: 96,
      targetComplexity: 180
    }));
    expect(readback().playPatrolAgent).not.toBeNull();
    expect(readback().legacyWorldTurnHost.getDiagnostics().timedModeEnabled).toBe(true);

    applyGenerationRequest.call(scene, createLegacyGenerationRequest({
      currentSeed: 577_196_705,
      dueAtMs: 1_000,
      generationProfile,
      mode: 'menu',
      reason: 'boot-menu',
      scale: 96,
      targetComplexity: 180
    }));
    readback().legacyWorldTurnHost.setState('stopped');
    expect(readback().playPatrolAgent).toBeNull();
    expect(readback().legacyWorldTurnHost.getDiagnostics()).toMatchObject({
      state: 'stopped',
      timedModeEnabled: false
    });
  });

  test('wires the visible patrol through timed world turns and cloned diagnostics', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).toContain("'enemy-movement': (");
    expect(menuSceneSource).toContain('collisions: (): WorldTurnPhaseResult');
    expect(menuSceneSource).toContain('timedModeEnabled: this.playPatrolAgent !== null');
    expect(menuSceneSource).toContain("kind: 'timed-mode-tick'");
    expect(menuSceneSource).toContain('this.drawLegacyPlayPatrolAgent(');
    expect(menuSceneSource).toContain('patrol: this.playPatrolAgent && patrolPoint');
    expect(menuSceneSource).toContain('resolveLegacyPatrolAgentTelegraph(');
    expect(menuSceneSource).toContain('telegraphActive: patrolTelegraph.active');
    expect(diagnosticsSource).toContain("contractVersion: 'legacy-patrol-agent-v3';");
    expect(diagnosticsSource).toContain('collisionFeedbackWindowMs: 220;');
    expect(menuSceneSource).toContain('collisionFeedbackActive: patrolCollisionFeedback.active');
    expect(diagnosticsSource).toContain('telegraphWindowMs: 220;');
  });
});
