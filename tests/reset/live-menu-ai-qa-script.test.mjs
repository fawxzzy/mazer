import { describe, expect, test } from 'vitest';

import {
  resolveMenuAiTargetSnapshot,
  summarizeMenuAiTargetSamples
} from '../../scripts/analysis/live-menu-ai-qa.mjs';

describe('live menu AI QA script helpers', () => {
  test('summarizes pre-goal non-end targets as passing proof samples', () => {
    const samples = Array.from({ length: 28 }, (_, index) => ({
      cue: index === 0 ? 'spawn' : 'explore',
      elapsedMs: index * 70,
      goal: { x: 9, y: 9 },
      optionCount: index,
      pathCursor: index,
      phase: 'explore',
      player: { x: index, y: 1 },
      playerAtGoal: false,
      reachedGoal: false,
      target: index < 4 ? null : { x: index, y: 2 },
      targetEqualsGoal: false
    }));

    expect(summarizeMenuAiTargetSamples(samples)).toMatchObject({
      leakCount: 0,
      pass: true,
      preGoalSampleCount: 28,
      targetSampleCount: 24
    });
  });

  test('fails when a visible pre-goal target equals the end tile', () => {
    const samples = Array.from({ length: 28 }, (_, index) => ({
      cue: 'explore',
      elapsedMs: index * 70,
      goal: { x: 9, y: 9 },
      optionCount: 3,
      pathCursor: index,
      phase: 'explore',
      player: { x: index, y: 1 },
      playerAtGoal: false,
      reachedGoal: false,
      target: index === 8 ? { x: 9, y: 9 } : { x: index, y: 2 },
      targetEqualsGoal: index === 8
    }));

    const summary = summarizeMenuAiTargetSamples(samples);

    expect(summary.pass).toBe(false);
    expect(summary.leakCount).toBe(1);
    expect(summary.leaks[0]).toMatchObject({
      pathCursor: 8,
      target: { x: 9, y: 9 }
    });
  });

  test('normalizes runtime and visual diagnostics into a target snapshot', () => {
    expect(resolveMenuAiTargetSnapshot({
      runtime: {
        generation: {
          maze: {
            goal: { x: 12, y: 4 }
          }
        },
        menuDemo: {
          aiMemory: {
            optionCount: 2,
            targetPoint: { x: 8, y: 4 }
          },
          cue: 'explore',
          pathCursor: 12,
          phase: 'explore',
          reachedGoal: false
        },
        play: {
          player: { x: 7, y: 4 }
        }
      }
    })).toMatchObject({
      cue: 'explore',
      goal: { x: 12, y: 4 },
      optionCount: 2,
      pathCursor: 12,
      phase: 'explore',
      player: { x: 7, y: 4 },
      playerAtGoal: false,
      reachedGoal: false,
      target: { x: 8, y: 4 },
      targetEqualsGoal: false
    });
  });
});
