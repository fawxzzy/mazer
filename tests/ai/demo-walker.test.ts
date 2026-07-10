import { describe, expect, test } from 'vitest';

import {
  advanceDemoWalker,
  collectDemoWalkerRouteDiagnostics,
  createDemoWalkerState,
  resolveDemoWalkerViewFrame
} from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { createLegacyGeneratedMenuMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import {
  generateMaze,
  isTileFloor,
  resolveDirectionBetween,
  TILE_END,
  TILE_FLOOR,
  TILE_PATH,
  type MazeEpisode
} from '../../src/domain/maze';

const HUMAN_MEMORY_ROUTE_BOUND_MULTIPLIER = 14;
// A low-rank runner now completes remembered-frontier recovery instead of
// regenerating mid-run, so the guard must cover a full poor-search outcome.
const HUMAN_MEMORY_TRAVERSE_MS_BOUND = 240_000;

const expectAiMemoryDoesNotLeakGoalTarget = (
  episode: MazeEpisode,
  currentIndex: number,
  targetIndex: number | null,
  context: string
): void => {
  if (targetIndex !== episode.raster.endIndex || currentIndex === episode.raster.endIndex) {
    return;
  }

  throw new Error(`AI memory target leaked unseen goal for ${context}`);
};

const createSingleSpurEpisode = (): MazeEpisode => {
  const tiles = new Uint8Array(35);
  const canonicalPath = [15, 16, 17, 18, 19];
  for (const index of canonicalPath) {
    tiles[index] |= TILE_FLOOR | TILE_PATH;
  }
  tiles[10] |= TILE_FLOOR;
  tiles[19] |= TILE_END;

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: 15,
      uniqueTileCount: 6,
      steps: [{ phase: 'seed', tileIndices: [15] }]
    },
    metrics: {
      solutionLength: canonicalPath.length,
      deadEnds: 2,
      junctions: 1,
      branchDensity: 1 / 6,
      straightness: 1,
      coverage: canonicalPath.length / 6
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width: 7,
      height: 5,
      tiles,
      startIndex: 15,
      endIndex: 19,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 0,
      nearGoalBranches: 0,
      hubJunctions: 1,
      chokeCorridors: 0,
      loopDetours: 0
    },
    seed: 7,
    shortcutsCreated: 0,
    size: 'small'
  };
};

const createBorderWrapEpisode = (): MazeEpisode => {
  const width = 5;
  const height = 3;
  const tiles = new Uint8Array(width * height);
  const startIndex = 5;
  const endIndex = 9;
  const canonicalPath = [startIndex, endIndex];
  for (const index of canonicalPath) {
    tiles[index] |= TILE_FLOOR | TILE_PATH;
  }
  tiles[endIndex] |= TILE_END;

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: startIndex,
      uniqueTileCount: canonicalPath.length,
      steps: [{ phase: 'seed', tileIndices: [startIndex] }]
    },
    metrics: {
      solutionLength: canonicalPath.length,
      deadEnds: 0,
      junctions: 0,
      branchDensity: 0,
      straightness: 1,
      coverage: 1
    },
    placementStrategy: 'edge-biased',
    presentationPreset: 'classic',
    raster: {
      width,
      height,
      tiles,
      startIndex,
      endIndex,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 0,
      nearGoalBranches: 0,
      hubJunctions: 0,
      chokeCorridors: 0,
      loopDetours: 0
    },
    seed: 91_009,
    shortcutsCreated: 0,
    size: 'small'
  };
};

const createCompassTrapEpisode = (): MazeEpisode => {
  const width = 7;
  const height = 5;
  const tiles = new Uint8Array(width * height);
  const toIndex = (x: number, y: number): number => (y * width) + x;
  const startIndex = toIndex(3, 2);
  const deadEndIndex = toIndex(4, 2);
  const endIndex = toIndex(6, 2);
  const canonicalPath = [
    startIndex,
    toIndex(3, 1),
    toIndex(4, 1),
    toIndex(5, 1),
    toIndex(6, 1),
    endIndex
  ];

  for (const index of [...canonicalPath, deadEndIndex]) {
    tiles[index] |= TILE_FLOOR;
  }
  for (const index of canonicalPath) {
    tiles[index] |= TILE_PATH;
  }
  tiles[endIndex] |= TILE_END;

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: startIndex,
      uniqueTileCount: canonicalPath.length + 1,
      steps: [{ phase: 'seed', tileIndices: [startIndex] }]
    },
    metrics: {
      solutionLength: canonicalPath.length,
      deadEnds: 1,
      junctions: 1,
      branchDensity: 1 / (canonicalPath.length + 1),
      straightness: 0.66,
      coverage: canonicalPath.length / (canonicalPath.length + 1)
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width,
      height,
      tiles,
      startIndex,
      endIndex,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 1,
      nearGoalBranches: 1,
      hubJunctions: 1,
      chokeCorridors: 1,
      loopDetours: 0
    },
    seed: 42_424,
    shortcutsCreated: 0,
    size: 'small'
  };
};

const createVisitedUndoEpisode = (): MazeEpisode => {
  const width = 7;
  const height = 7;
  const tiles = new Uint8Array(width * height);
  const floorIndices = [
    0, 2, 8, 10, 13, 15, 16, 17, 19, 20,
    22, 23, 25, 26, 29, 30, 31, 32, 45, 47
  ];
  const canonicalPath = [22, 29, 30, 31, 32, 25, 26];
  for (const index of floorIndices) {
    tiles[index] |= TILE_FLOOR;
  }
  for (const index of canonicalPath) {
    tiles[index] |= TILE_PATH;
  }
  tiles[26] |= TILE_END;

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: 22,
      uniqueTileCount: floorIndices.length,
      steps: [{ phase: 'seed', tileIndices: [22] }]
    },
    metrics: {
      solutionLength: canonicalPath.length,
      deadEnds: 4,
      junctions: 4,
      branchDensity: 4 / floorIndices.length,
      straightness: 0.5,
      coverage: canonicalPath.length / floorIndices.length
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width,
      height,
      tiles,
      startIndex: 22,
      endIndex: 26,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 2,
      nearGoalBranches: 1,
      hubJunctions: 2,
      chokeCorridors: 1,
      loopDetours: 1
    },
    seed: 17_474,
    shortcutsCreated: 0,
    size: 'small'
  };
};

const createOptionalRetargetEpisode = (): MazeEpisode => {
  const width = 10;
  const height = 9;
  const tiles = new Uint8Array(width * height);
  const toIndex = (x: number, y: number): number => (y * width) + x;
  const floorCoordinates = [
    [4, 4], [5, 4], [5, 5], [5, 6], [4, 6], [3, 6], [3, 5], [3, 4],
    [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [8, 4]
  ] as const;
  const canonicalPath = [
    toIndex(4, 4),
    toIndex(4, 3),
    toIndex(5, 3),
    toIndex(6, 3),
    toIndex(7, 3),
    toIndex(8, 3),
    toIndex(8, 4)
  ];

  for (const [x, y] of floorCoordinates) {
    tiles[toIndex(x, y)] |= TILE_FLOOR;
  }
  for (const index of canonicalPath) {
    tiles[index] |= TILE_PATH;
  }
  tiles[toIndex(8, 4)] |= TILE_END;

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: toIndex(4, 4),
      uniqueTileCount: floorCoordinates.length,
      steps: [{ phase: 'seed', tileIndices: [toIndex(4, 4)] }]
    },
    metrics: {
      solutionLength: canonicalPath.length,
      deadEnds: 1,
      junctions: 2,
      branchDensity: 2 / floorCoordinates.length,
      straightness: 0.5,
      coverage: canonicalPath.length / floorCoordinates.length
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width,
      height,
      tiles,
      startIndex: toIndex(4, 4),
      endIndex: toIndex(8, 4),
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 1,
      nearGoalBranches: 1,
      hubJunctions: 1,
      chokeCorridors: 1,
      loopDetours: 1
    },
    seed: 1,
    shortcutsCreated: 0,
    size: 'small'
  };
};

describe('demo walker', () => {
  test('treats opposite-border exits as adjacent AI navigation choices', () => {
    const episode = createBorderWrapEpisode();
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };
    const state = createDemoWalkerState(episode, config);
    const advance = advanceDemoWalker(episode, state, config);

    expect(advance.state.currentIndex).toBe(episode.raster.endIndex);
    expect(advance.state.lastDirection).toBe(2);
    expect(advance.state.reachedGoal).toBe(true);
    expect(collectDemoWalkerRouteDiagnostics(episode, config).routeLength).toBe(2);
  });

  test('steps forward along the validated A* solution path', () => {
    const episode = generateMaze({
      scale: 30,
      seed: 22,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    const next = advanceDemoWalker(episode, state);
    state = next.state;

    expect(state.currentIndex).toBe(episode.raster.pathIndices[1]);
    expect(state.pathCursor).toBe(1);
    expect(state.canonicalCursor).toBe(1);
    expect(state.cue).toBe('explore');
    expect(state.trailSteps).toEqual([
      { index: episode.raster.startIndex, mode: 'explore' },
      { index: episode.raster.pathIndices[1], mode: 'explore' }
    ]);
  });

  test('enters goal-hold after reaching the end of the solution path', () => {
    const episode = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    while (state.currentIndex !== episode.raster.endIndex) {
      state = advanceDemoWalker(episode, state).state;
    }

    expect(state.phase).toBe('goal-hold');
    expect(state.reachedGoal).toBe(true);
    expect(state.cue).toBe('goal');
    expect(state.trailSteps.at(-1)).toEqual({ index: episode.raster.endIndex, mode: 'goal' });
  });

  test('requests regeneration after the goal hold completes', () => {
    const episode = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    while (state.currentIndex !== episode.raster.endIndex) {
      state = advanceDemoWalker(episode, state).state;
    }

    const resetAdvance = advanceDemoWalker(episode, state);
    expect(resetAdvance.state.phase).toBe('reset-hold');
    expect(resetAdvance.state.resetReason).toBe('goal');
    expect(resetAdvance.state.cue).toBe('reset');

    const regenerateAdvance = advanceDemoWalker(episode, resetAdvance.state);
    expect(regenerateAdvance.shouldRegenerateMaze).toBe(true);
    expect(regenerateAdvance.nextSeed).toBe(1989);
    expect(regenerateAdvance.state.currentIndex).toBe(episode.raster.startIndex);
    expect(regenerateAdvance.state.loops).toBe(1);
    expect(regenerateAdvance.state.cue).toBe('spawn');
  });

  test('can perform an AI-only reset on the same maze before a later goal regeneration', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    let state = createDemoWalkerState(episode, config);
    let aiResetAdvance: ReturnType<typeof advanceDemoWalker> | null = null;
    const maxSteps = Math.max(256, episode.raster.pathIndices.length * 6);

    for (let step = 0; step < maxSteps; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;
      if (advance.state.resetReason === 'ai-path-exhausted') {
        aiResetAdvance = advance;
        break;
      }
    }

    expect(aiResetAdvance).not.toBeNull();
    expect(aiResetAdvance?.shouldRegenerateMaze).toBeUndefined();
    expect(aiResetAdvance?.state.phase).toBe('reset-hold');
    expect(aiResetAdvance?.state.cue).toBe('reset');

    const resetReplay = advanceDemoWalker(episode, aiResetAdvance!.state, config);
    expect(resetReplay.shouldRegenerateMaze).toBeUndefined();
    expect(resetReplay.nextSeed).toBeUndefined();
    expect(resetReplay.state.currentIndex).toBe(episode.raster.startIndex);
    expect(resetReplay.state.loops).toBe(1);
    expect(resetReplay.state.aiLogicSwitch).toBe(true);

    state = resetReplay.state;
    let reachedGoal = false;
    for (let step = 0; step < maxSteps; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;
      if (state.phase === 'goal-hold') {
        reachedGoal = true;
        break;
      }
    }

    expect(reachedGoal).toBe(true);
  }, 15_000);

  test('caps trail buffers instead of retaining the full path', () => {
    const episode = generateMaze({
      scale: 30,
      seed: 55,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    for (let step = 0; step < 8; step += 1) {
      state = advanceDemoWalker(episode, state, {
        seed: 1988,
        cadence: {
          spawnHoldMs: 1,
          exploreStepMs: 1,
          backtrackStepMs: 1,
          decisionPauseMs: 1,
          anticipationStepMs: 1,
          branchCommitMs: 1,
          branchResumeMs: 1,
          goalHoldMs: 1,
          resetHoldMs: 1
        },
        behavior: {
          trailMaxLength: 3,
          aiTilePathAdditionalPaths: 0,
          preserveVisitedOnAiReset: true,
          emulateLogicSwitchPotentialCheckBug: true,
          regenerateSeedStep: 1,
          prerollSteps: 0
        }
      }).state;
      expect(state.trailIndices.length).toBeLessThanOrEqual(3);
      expect(state.trailSteps.length).toBeLessThanOrEqual(3);
    }
  });

  test('view frames stay on canonical pathIndices with a bounded visible window', () => {
    const episode = generateMaze({
      scale: 40,
      seed: 73,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    });

    const elapsedMs = legacyTuning.demo.cadence.spawnHoldMs + (legacyTuning.demo.cadence.exploreStepMs * 2.5);
    const frame = resolveDemoWalkerViewFrame(episode, elapsedMs, legacyTuning.demo, 4);

    expect(episode.raster.pathIndices.includes(frame.currentIndex)).toBe(true);
    expect(episode.raster.pathIndices.includes(frame.nextIndex)).toBe(true);
    expect(frame.trailLimit - frame.trailStart).toBeLessThanOrEqual(4);
    expect(frame.progress).toBeGreaterThan(0);
    expect(frame.progress).toBeLessThan(1);
    expect(frame.canonicalCursor).toBeGreaterThanOrEqual(0);
  });

  test('final traversal segment reveals the goal tile before arrival settles', () => {
    const episode = generateMaze({
      scale: 40,
      seed: 144,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    });

    const elapsedMs = legacyTuning.demo.cadence.spawnHoldMs
      + ((episode.raster.pathIndices.length - 2) * legacyTuning.demo.cadence.exploreStepMs)
      + Math.floor(legacyTuning.demo.cadence.exploreStepMs * 0.2);
    const frame = resolveDemoWalkerViewFrame(episode, elapsedMs, legacyTuning.demo, 4);

    expect(frame.nextIndex).toBe(episode.raster.endIndex);
    expect(frame.trailLimit).toBe(episode.raster.pathIndices.length);
    expect(frame.progress).toBeGreaterThan(0);
  });

  test('core-only watch mode can make deterministic wrong turns and recoveries without changing solver truth', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    const firstFrame = resolveDemoWalkerViewFrame(
      episode,
      config.cadence.spawnHoldMs + Math.floor(config.cadence.exploreStepMs * 0.5),
      config,
      8
    );
    const lateFrame = resolveDemoWalkerViewFrame(
      episode,
      config.cadence.spawnHoldMs + Math.floor(config.cadence.exploreStepMs * 6.5),
      config,
      8
    );

    expect(lateFrame.telemetry.wrongBranchCount).toBeGreaterThan(0);
    expect(lateFrame.telemetry.backtrackCount).toBeGreaterThan(0);
    expect(lateFrame.telemetry.recoveryCount).toBeGreaterThan(0);
    expect(lateFrame.canonicalCursor).toBeLessThanOrEqual(episode.raster.pathIndices.length - 1);
    expect(firstFrame.canonicalCursor).toBeGreaterThanOrEqual(0);
  });

  test('does not commit a wrong turn into a spur that legacy AiTilePathCheck would reject', () => {
    const episode = createSingleSpurEpisode();
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    let state = createDemoWalkerState(episode, config);
    const maxSteps = Math.max(16, episode.raster.pathIndices.length * 6);
    for (let step = 0; step < maxSteps; step += 1) {
      state = advanceDemoWalker(episode, state, config).state;
    }

    expect(state.telemetry.wrongBranchCount).toBe(0);
    expect(state.telemetry.backtrackCount).toBe(0);
    expect(state.trailSteps.some((trailStep) => trailStep.index === 10)).toBe(false);
  });

  test('uses compass-local pressure instead of solved goal-distance when a branch looks tempting', () => {
    const episode = createCompassTrapEpisode();
    const config = createLegacyMenuDemoWalkerConfig(episode.seed);
    let state = createDemoWalkerState(episode, config);
    const firstAdvance = advanceDemoWalker(episode, state, config);
    state = firstAdvance.state;

    expect(state.currentIndex).toBe(18);
    expect(state.cue).toBe('anticipate');
    expectAiMemoryDoesNotLeakGoalTarget(
      episode,
      state.currentIndex,
      state.aiMemory.targetIndex,
      'compass trap first step'
    );

    let sawBacktrack = false;
    let sawReacquire = false;
    const maxSteps = Math.max(32, episode.raster.pathIndices.length * 8);
    for (let step = 0; step < maxSteps && state.phase !== 'goal-hold'; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;
      sawBacktrack = sawBacktrack || state.cue === 'backtrack';
      sawReacquire = sawReacquire || state.cue === 'reacquire';
    }

    expect(sawBacktrack).toBe(true);
    expect(sawReacquire).toBe(true);
    expect(state.telemetry.wrongBranchCount).toBeGreaterThan(0);
    expect(state.telemetry.backtrackCount).toBeGreaterThan(0);
    expect(state.telemetry.recoveryCount).toBeGreaterThan(0);
    expect(state.phase).toBe('goal-hold');
  });

  test('surfaces branch, dead-end, backtrack, and reacquire cues on the single legacy AI timer', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    let state = createDemoWalkerState(episode, config);
    let branchCommitAdvance: ReturnType<typeof advanceDemoWalker> | null = null;
    let deadEndAdvance: ReturnType<typeof advanceDemoWalker> | null = null;
    let backtrackAdvance: ReturnType<typeof advanceDemoWalker> | null = null;
    let reacquireAdvance: ReturnType<typeof advanceDemoWalker> | null = null;
    const maxSteps = Math.max(256, episode.raster.pathIndices.length * 8);

    for (let step = 0; step < maxSteps; step += 1) {
      const previousState = state;
      const advance = advanceDemoWalker(episode, state, config);

      if (
        branchCommitAdvance === null
        && advance.state.cue === 'anticipate'
        && advance.state.canonicalCursor === previousState.canonicalCursor
      ) {
        branchCommitAdvance = advance;
      }
      if (deadEndAdvance === null && advance.state.cue === 'dead-end') {
        deadEndAdvance = advance;
      }
      if (backtrackAdvance === null && advance.state.cue === 'backtrack') {
        backtrackAdvance = advance;
      }
      if (reacquireAdvance === null && advance.state.cue === 'reacquire') {
        reacquireAdvance = advance;
      }

      state = advance.state;
      if (branchCommitAdvance && deadEndAdvance && backtrackAdvance && reacquireAdvance) {
        break;
      }
    }

    expect(branchCommitAdvance).not.toBeNull();
    expect(deadEndAdvance).not.toBeNull();
    expect(backtrackAdvance).not.toBeNull();
    expect(reacquireAdvance).not.toBeNull();
    expect(branchCommitAdvance?.delayMs).toBe(config.cadence.exploreStepMs);
    expect(deadEndAdvance?.delayMs).toBe(config.cadence.exploreStepMs);
    expect(backtrackAdvance?.delayMs).toBe(config.cadence.exploreStepMs);
    expect(reacquireAdvance?.delayMs).toBe(config.cadence.exploreStepMs);
  });

  test('summarizes humanized menu AI route shape for diagnostics', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);

    expect(diagnostics.routeLength).toBeGreaterThan(episode.raster.pathIndices.length);
    expect(diagnostics.routeLength).toBeLessThanOrEqual(episode.raster.pathIndices.length * 4);
    expect(diagnostics.segmentCount).toBe(diagnostics.routeLength - 1);
    expect(diagnostics.canonicalPathLength).toBe(episode.raster.pathIndices.length);
    expect(diagnostics.traverseMs).toBeGreaterThan(0);
    expect(diagnostics.traverseMs).toBeLessThan(60_000);
    expect(diagnostics.aiResetPathCursor).not.toBeNull();
    expect(diagnostics.telemetry.wrongBranchCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.backtrackCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.recoveryCount).toBeGreaterThan(0);
    // The representative proof route covers recovery, but not the rarer legacy visited-undo branch.
    expect(diagnostics.telemetry.visitedUndoCount).toBe(0);
    expect(diagnostics.cueCounts['dead-end']).toBeGreaterThan(0);
    expect(diagnostics.cueCounts.backtrack).toBeGreaterThan(0);
    expect(diagnostics.cueCounts.reacquire).toBeGreaterThan(0);
    expect(diagnostics.trailModeCounts.backtrack).toBeGreaterThan(0);
  });

  test('exposes rank-scaled AI perception without changing the default E-rank contract', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const baseConfig = createLegacyMenuDemoWalkerConfig(episode.seed);
    const defaultDiagnostics = collectDemoWalkerRouteDiagnostics(episode, baseConfig);
    const highRankDiagnostics = collectDemoWalkerRouteDiagnostics(episode, {
      ...baseConfig,
      behavior: {
        ...baseConfig.behavior,
        aiSkillLevel: 99,
        aiSkillRank: 'S'
      }
    });

    expect(defaultDiagnostics.perception).toMatchObject({
      confidenceNoisePenalty: 14,
      level: 1,
      lookaheadDepth: 5,
      optionalRetargetLimit: 2,
      rank: 'E',
      solvePreviewBudget: 0,
      splitUncertaintyPenalty: 1.5,
      wrapMentalCost: 0.72
    });
    expect(highRankDiagnostics.perception.rank).toBe('S');
    expect(highRankDiagnostics.perception.level).toBe(99);
    expect(highRankDiagnostics.perception.lookaheadDepth).toBeGreaterThan(defaultDiagnostics.perception.lookaheadDepth);
    expect(highRankDiagnostics.perception.optionalRetargetLimit).toBe(defaultDiagnostics.perception.optionalRetargetLimit);
    expect(highRankDiagnostics.perception.wrapMentalCost).toBeLessThan(defaultDiagnostics.perception.wrapMentalCost);
    expect(highRankDiagnostics.perception.solvePreviewBudget).toBeGreaterThan(0);
  });

  test('exposes human bias profiles without changing the balanced default', () => {
    const seeds = [1, 2, 3];
    const profileDiagnostics = seeds.map((seed) => {
      const maze = createLegacyGeneratedMenuMaze(37, seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
      return {
        balanced: collectDemoWalkerRouteDiagnostics(episode, {
          ...baseConfig,
          behavior: {
            ...baseConfig.behavior,
            aiBiasProfile: 'balanced',
            aiSkillLevel: 60,
            aiSkillRank: 'B'
          }
        }),
        shortcutGambler: collectDemoWalkerRouteDiagnostics(episode, {
          ...baseConfig,
          behavior: {
            ...baseConfig.behavior,
            aiBiasProfile: 'shortcut-gambler',
            aiSkillLevel: 60,
            aiSkillRank: 'B'
          }
        }),
        cautiousMapper: collectDemoWalkerRouteDiagnostics(episode, {
          ...baseConfig,
          behavior: {
            ...baseConfig.behavior,
            aiBiasProfile: 'cautious-mapper',
            aiSkillLevel: 60,
            aiSkillRank: 'B'
          }
        }),
        speedrunner: collectDemoWalkerRouteDiagnostics(episode, {
          ...baseConfig,
          behavior: {
            ...baseConfig.behavior,
            aiBiasProfile: 'speedrunner',
            aiSkillLevel: 60,
            aiSkillRank: 'B'
          }
        })
      };
    });
    const averageRouteLength = (select: (entry: (typeof profileDiagnostics)[number]) => number): number => (
      profileDiagnostics.reduce((total, entry) => total + select(entry), 0) / profileDiagnostics.length
    );
    const balancedDiagnostics = profileDiagnostics[0]!.balanced;
    const speedrunnerDiagnostics = profileDiagnostics[0]!.speedrunner;
    const shortcutGamblerDiagnostics = profileDiagnostics[0]!.shortcutGambler;
    const cautiousMapperDiagnostics = profileDiagnostics[0]!.cautiousMapper;

    expect(balancedDiagnostics.perception.biasProfile).toBe('balanced');
    expect(speedrunnerDiagnostics.perception.biasProfile).toBe('speedrunner');
    expect(shortcutGamblerDiagnostics.perception.biasProfile).toBe('shortcut-gambler');
    expect(cautiousMapperDiagnostics.perception.biasProfile).toBe('cautious-mapper');
    expect(averageRouteLength((entry) => entry.speedrunner.routeLength)).toBeLessThan(
      averageRouteLength((entry) => entry.cautiousMapper.routeLength)
    );
  });

  test('exercises the legacy visited-undo side effect while backtracking toward a potential target', () => {
    const episode = createVisitedUndoEpisode();
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);

    expect(diagnostics.telemetry.wrongBranchCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.backtrackCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.recoveryCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.visitedUndoCount).toBe(1);
    expect(diagnostics.routeLength).toBeGreaterThan(episode.raster.pathIndices.length);
    expect(diagnostics.routeLength).toBeLessThanOrEqual(episode.raster.pathIndices.length * 4);
    expect(diagnostics.aiResetPathCursor).not.toBeNull();
  });

  test('view frames expose recovery cues during deterministic wrong-turn playback', () => {
    const episode = generateMaze({
      scale: 50,
      seed: 902,
      size: 'large',
      family: 'split-flow',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    let state = createDemoWalkerState(episode, config);
    let elapsedMs = config.cadence.spawnHoldMs;
    const seenCues = new Set<string>();
    const maxSteps = Math.max(256, episode.raster.pathIndices.length * 8);

    for (let step = 0; step < maxSteps; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      const sampleElapsedMs = elapsedMs + Math.max(1, Math.floor(advance.delayMs / 2));
      const frame = resolveDemoWalkerViewFrame(episode, sampleElapsedMs, config, 8);

      seenCues.add(frame.cue);
      elapsedMs += advance.delayMs;
      state = advance.state;

      if (seenCues.has('dead-end') && seenCues.has('backtrack') && seenCues.has('reacquire')) {
        break;
      }
    }

    expect(seenCues.has('dead-end')).toBe(true);
    expect(seenCues.has('backtrack')).toBe(true);
    expect(seenCues.has('reacquire')).toBe(true);
  });

  test('can retarget to a remembered optional split without jumping', () => {
    const episode = createOptionalRetargetEpisode();
    const config = createLegacyMenuDemoWalkerConfig(1988);
    const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
    let state = createDemoWalkerState(episode, config);
    let sawOptionalRetarget = false;
    let sawMemoryOptions = false;
    let sawMemoryTarget = false;
    const maxSteps = Math.max(32, episode.raster.pathIndices.length * 8);

    expect(diagnostics.telemetry.optionalRetargetCount).toBe(1);
    expect(diagnostics.telemetry.backtrackCount).toBeGreaterThan(0);
    expect(diagnostics.telemetry.recoveryCount).toBeGreaterThan(0);
    expect(diagnostics.routeLength).toBeGreaterThan(episode.raster.pathIndices.length);

    for (let step = 0; step < maxSteps; step += 1) {
      const previousIndex = state.currentIndex;
      const previousPhase = state.phase;
      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;

      expect(isTileFloor(episode.raster.tiles, state.currentIndex)).toBe(true);
      for (const optionIndex of state.aiMemory.optionIndices) {
        expect(isTileFloor(episode.raster.tiles, optionIndex)).toBe(true);
      }
      if (state.aiMemory.targetIndex !== null) {
        expect(isTileFloor(episode.raster.tiles, state.aiMemory.targetIndex)).toBe(true);
      }
      if (previousPhase === 'explore' && state.phase === 'explore') {
        const direction = resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width);
        if (direction === null) {
          throw new Error(
            `Non-adjacent optional-retarget AI move at step=${step}`
            + ` from=${previousIndex} to=${state.currentIndex}`
            + ` cue=${state.cue} cursor=${state.pathCursor} canonical=${state.canonicalCursor}`
          );
        }
      }

      sawOptionalRetarget = sawOptionalRetarget || state.telemetry.optionalRetargetCount > 0;
      sawMemoryOptions = sawMemoryOptions || state.aiMemory.optionIndices.length > 0;
      sawMemoryTarget = sawMemoryTarget || state.aiMemory.targetIndex !== null;
      if (state.phase === 'goal-hold') {
        break;
      }
    }

    expect(sawOptionalRetarget).toBe(true);
    expect(sawMemoryOptions).toBe(true);
    expect(sawMemoryTarget).toBe(true);
    expect(state.phase).toBe('goal-hold');
  });

  test('humanized menu AI route never emits invalid jumps while exploring wrong branches', () => {
    const cases = [
      { scale: 50, seed: 902, size: 'large', family: 'split-flow', shortcutCountModifier: 0.18 },
      { scale: 50, seed: 3749, size: 'medium', family: 'classic', shortcutCountModifier: 0.13 },
      { scale: 75, seed: 8_811, size: 'huge', family: 'braided', shortcutCountModifier: 0.24 }
    ] as const;
    const config = {
      ...legacyTuning.demo,
      behavior: {
        ...legacyTuning.demo.behavior,
        enableRunnerMistakes: true
      }
    };

    for (const testCase of cases) {
      const episode = generateMaze({
        scale: testCase.scale,
        seed: testCase.seed,
        size: testCase.size,
        family: testCase.family,
        checkPointModifier: 0.35,
        shortcutCountModifier: testCase.shortcutCountModifier
      });
      const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
      let state = createDemoWalkerState(episode, config);
      let sawWrongBranchOrRecovery = false;
      const maxSteps = Math.max(256, diagnostics.routeLength + 8);

      for (let step = 0; step < maxSteps; step += 1) {
        const previousIndex = state.currentIndex;
        const previousPhase = state.phase;
        const advance = advanceDemoWalker(episode, state, config);
        state = advance.state;

        expect(isTileFloor(episode.raster.tiles, state.currentIndex)).toBe(true);
        if (previousPhase === 'explore' && state.phase === 'explore') {
          const direction = resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width);
          if (direction === null) {
            throw new Error(
              `Non-adjacent demo AI move for seed=${testCase.seed} step=${step}`
              + ` from=${previousIndex} to=${state.currentIndex}`
              + ` cue=${state.cue} cursor=${state.pathCursor} canonical=${state.canonicalCursor}`
            );
          }
        }

        sawWrongBranchOrRecovery = sawWrongBranchOrRecovery
          || state.telemetry.wrongBranchCount > 0
          || state.telemetry.backtrackCount > 0
          || state.telemetry.recoveryCount > 0;

        if (advance.shouldRegenerateMaze || state.phase === 'goal-hold') {
          break;
        }
      }

      expect(sawWrongBranchOrRecovery).toBe(true);
    }
  }, 15_000);

  test('generated legacy menu mazes keep AI routes adjacent and bounded', () => {
    const cases = [
      { scale: 50, seed: 1 },
      { scale: 50, seed: 2 },
      { scale: 50, seed: 3 },
      { scale: 50, seed: 5 },
      { scale: 50, seed: 8 },
      { scale: 50, seed: 13 },
      { scale: 50, seed: 21 },
      { scale: 50, seed: 34 },
      { scale: 50, seed: 55 },
      { scale: 50, seed: 89 },
      { scale: 50, seed: 144 },
      { scale: 50, seed: 233 },
      { scale: 50, seed: 3749 },
      { scale: 50, seed: 777 },
      { scale: 50, seed: 1001 },
      { scale: 50, seed: 0x5a17f00d },
      { scale: 75, seed: 8_811 }
    ] as const;

    for (const testCase of cases) {
      const maze = createLegacyGeneratedMenuMaze(testCase.scale, testCase.seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const config = createLegacyMenuDemoWalkerConfig(testCase.seed);
      const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
      let state = createDemoWalkerState(episode, config);
      let sawRegenerationRequest = false;
      const maxSteps = Math.max(256, diagnostics.routeLength + 8);

      expect(maze.source).toBe('menu-generated');
      expect(diagnostics.canonicalPathLength).toBe(episode.raster.pathIndices.length);
      if (diagnostics.aiResetPathCursor !== null) {
        expect(diagnostics.aiResetPathCursor).toBeGreaterThan(0);
      }
      expect(diagnostics.routeLength).toBeGreaterThanOrEqual(2);
      expect(diagnostics.routeLength).toBeLessThanOrEqual(
        episode.raster.pathIndices.length * HUMAN_MEMORY_ROUTE_BOUND_MULTIPLIER
      );
      expect(diagnostics.traverseMs).toBeLessThan(HUMAN_MEMORY_TRAVERSE_MS_BOUND);
      expect(config.behavior.enableRunnerMistakes).toBe(true);
      expect(config.behavior.runnerThinkingModel).toBe('human-local-memory');
      expect(config.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);

      for (let step = 0; step < maxSteps; step += 1) {
        const previousIndex = state.currentIndex;
        const previousPhase = state.phase;
        const advance = advanceDemoWalker(episode, state, config);
        state = advance.state;

        expect(isTileFloor(episode.raster.tiles, state.currentIndex)).toBe(true);
        expectAiMemoryDoesNotLeakGoalTarget(
          episode,
          state.currentIndex,
          state.aiMemory.targetIndex,
          `seed=${testCase.seed} step=${step}`
        );
        if (previousPhase === 'explore' && state.phase === 'explore') {
          const direction = resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width);
          if (direction === null) {
            throw new Error(
              `Non-adjacent generated-menu AI move for seed=${testCase.seed} step=${step}`
              + ` from=${previousIndex} to=${state.currentIndex}`
              + ` cue=${state.cue} cursor=${state.pathCursor} canonical=${state.canonicalCursor}`
            );
          }
        }

        if (advance.shouldRegenerateMaze) {
          sawRegenerationRequest = true;
          break;
        }
        if (state.phase === 'goal-hold') {
          break;
        }
      }

      expect(state.phase === 'goal-hold' || sawRegenerationRequest).toBe(true);
    }
  }, 30_000);

  test('generated menu AI follows bounded human local-memory routes and later requests goal regeneration across scale bands', () => {
    const cases = [
      { scale: 37, seed: 55 },
      { scale: 37, seed: 89 },
      { scale: 50, seed: 3749 },
      { scale: 50, seed: 0x5a17f00d },
      { scale: 75, seed: 8_811 },
      { scale: 75, seed: 233 }
    ] as const;

    for (const testCase of cases) {
      const maze = createLegacyGeneratedMenuMaze(testCase.scale, testCase.seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const config = createLegacyMenuDemoWalkerConfig(testCase.seed);
      const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
      let state = createDemoWalkerState(episode, config);
      let sawGoalReset = false;
      let sawGoalRegenerationRequest = false;
      const maxSteps = Math.max(512, diagnostics.routeLength + 8);

      expect(diagnostics.canonicalPathLength).toBe(episode.raster.pathIndices.length);
      expect(diagnostics.routeLength).toBeGreaterThanOrEqual(2);
      expect(diagnostics.routeLength).toBeLessThanOrEqual(
        episode.raster.pathIndices.length * HUMAN_MEMORY_ROUTE_BOUND_MULTIPLIER
      );
      expect(diagnostics.traverseMs).toBeLessThan(HUMAN_MEMORY_TRAVERSE_MS_BOUND);
      if (diagnostics.aiResetPathCursor !== null) {
        expect(diagnostics.aiResetPathCursor).toBeGreaterThan(0);
      }
      expect(config.behavior.enableRunnerMistakes).toBe(true);
      expect(config.behavior.runnerThinkingModel).toBe('human-local-memory');
      expect(config.behavior.emulateLogicSwitchPotentialCheckBug).toBe(false);

      for (let step = 0; step < maxSteps; step += 1) {
        const previousIndex = state.currentIndex;
        const previousPhase = state.phase;
        const advance = advanceDemoWalker(episode, state, config);
        state = advance.state;

        expect(isTileFloor(episode.raster.tiles, state.currentIndex)).toBe(true);
        expectAiMemoryDoesNotLeakGoalTarget(
          episode,
          state.currentIndex,
          state.aiMemory.targetIndex,
          `scale=${testCase.scale} seed=${testCase.seed} step=${step}`
        );
        if (previousPhase === 'explore' && state.phase === 'explore') {
          const direction = resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width);
          if (direction === null) {
            throw new Error(
              `Non-adjacent generated-menu replay move for scale=${testCase.scale} seed=${testCase.seed} step=${step}`
              + ` from=${previousIndex} to=${state.currentIndex}`
              + ` cue=${state.cue} cursor=${state.pathCursor} canonical=${state.canonicalCursor}`
            );
          }
        }

        if (state.resetReason === 'goal' || state.resetReason === 'ai-path-exhausted') {
          sawGoalReset = true;
        }
        if (advance.shouldRegenerateMaze) {
          sawGoalRegenerationRequest = true;
          expect(advance.nextSeed).toBeGreaterThan(testCase.seed);
          break;
        }
      }

      expect(sawGoalReset).toBe(true);
      expect(sawGoalRegenerationRequest).toBe(true);
    }
  }, 30_000);
});
