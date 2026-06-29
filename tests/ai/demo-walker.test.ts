import { describe, expect, test } from 'vitest';

import {
  advanceDemoWalker,
  createDemoWalkerState,
  resolveDemoWalkerViewFrame
} from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { generateMaze } from '../../src/domain/maze';

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
});
