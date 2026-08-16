import { describe, expect, test } from 'vitest';
import { summarizeInputEquivalenceRuns } from '../../scripts/analysis/live-play-input-equivalence.mjs';

const passingRun = (inputMethod, moves) => ({
  artifacts: { screenshotPath: `${inputMethod}.png`, summaryPath: `${inputMethod}.json` },
  inputMethod,
  performance: { estimatedFps: 60, recentSpikeCount: 0 },
  postGoalLifecycle: {
    freshReady: { pass: true },
    inputLockProbePass: true,
    inputLockProbes: Array.from({ length: 4 }, () => ({ pass: true })),
    pass: true
  },
  result: { executedMoveCount: moves, failedAt: null, pass: true, plannedMoveCount: moves, reached: true },
  worldTurn: { atGoal: { acceptedTurnCount: moves }, freshMazePass: true, pass: true }
});

describe('live play input equivalence matrix', () => {
  test('requires keyboard and stick to pass the same movement and lifecycle invariants', () => {
    const result = summarizeInputEquivalenceRuns({
      keyboard: passingRun('keyboard', 80),
      stick: passingRun('stick', 72)
    });
    expect(result).toMatchObject({ pass: true, methodCount: 2, totalPlannedMoveCount: 152 });

    const failedStick = passingRun('stick', 72);
    failedStick.worldTurn.freshMazePass = false;
    expect(summarizeInputEquivalenceRuns({
      keyboard: passingRun('keyboard', 80),
      stick: failedStick
    }).pass).toBe(false);
  });
});
