import { describe, expect, test } from 'vitest';

import {
  advanceDemoWalker,
  createDemoWalkerState,
  resolveDemoWalkerViewFrame
} from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import {
  generateMaze,
  isTileFloor,
  resolveDirectionBetween,
  TILE_END,
  TILE_FLOOR,
  TILE_PATH,
  type MazeEpisode
} from '../../src/domain/maze';

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

describe('demo walker', () => {
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
  });

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

  test('surfaces branch, dead-end, backtrack, and reacquire cues with cue-specific delays', () => {
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
    expect(branchCommitAdvance?.delayMs).toBe(config.cadence.branchCommitMs);
    expect(deadEndAdvance).not.toBeNull();
    expect(deadEndAdvance?.delayMs).toBe(config.cadence.decisionPauseMs);
    expect(backtrackAdvance).not.toBeNull();
    expect(backtrackAdvance?.delayMs).toBe(config.cadence.backtrackStepMs);
    expect(reacquireAdvance).not.toBeNull();
    expect(reacquireAdvance?.delayMs).toBe(config.cadence.branchResumeMs);
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
      let state = createDemoWalkerState(episode, config);
      let sawWrongBranchOrRecovery = false;
      const maxSteps = Math.max(256, episode.raster.pathIndices.length * 8);

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
});
