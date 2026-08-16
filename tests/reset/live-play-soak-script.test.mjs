import { describe, expect, test } from 'vitest';

import {
  resolveLivePlaySoakSeeds,
  summarizeLivePlaySoakRuns
} from '../../scripts/analysis/live-play-soak.mjs';

const createPassingRun = (initialSeed, freshSeed, moves = 40) => ({
  artifacts: { screenshotPath: `${initialSeed}.png`, summaryPath: `${initialSeed}.json` },
  controls: { controlMode: 'stick', visible: true },
  inputMethod: 'stick',
  performance: { estimatedFps: 60, recentSpikeCount: 0 },
  postGoalLifecycle: {
    elapsedMs: 9000,
    freshReady: { pass: true },
    freshSeed,
    inputLockProbes: [
      { pass: true, phase: 'goal-hold' },
      { pass: true, phase: 'deconstructing' },
      { pass: true, phase: 'handoff' },
      { pass: true, phase: 'building' }
    ],
    pass: true
  },
  repo: { commit: 'abc123', dirty: false },
  result: { executedMoveCount: moves, pass: true, plannedMoveCount: moves },
  route: { seed: initialSeed }
});

describe('live play multi-cycle soak', () => {
  test('derives a bounded deterministic seed family', () => {
    expect(resolveLivePlaySoakSeeds(3, 3749)).toEqual([3749, 11668, 19587]);
    expect(resolveLivePlaySoakSeeds(1, 5)).toHaveLength(2);
    expect(resolveLivePlaySoakSeeds(99, 5)).toHaveLength(10);
  });

  test('passes only when every stick cycle proves lifecycle, locks, freshness, readiness, and frame health', () => {
    const seeds = [3749, 11668, 19587];
    const summary = summarizeLivePlaySoakRuns([
      createPassingRun(seeds[0], 1001, 41),
      createPassingRun(seeds[1], 1002, 42),
      createPassingRun(seeds[2], 1003, 43)
    ], seeds);

    expect(summary).toMatchObject({
      pass: true,
      cycleCount: 3,
      distinctInitialSeeds: true,
      distinctFreshSeeds: true,
      totalExecutedMoveCount: 126
    });

    const failedRun = createPassingRun(seeds[2], 1003);
    failedRun.postGoalLifecycle.freshReady.pass = false;
    expect(summarizeLivePlaySoakRuns([
      createPassingRun(seeds[0], 1001),
      createPassingRun(seeds[1], 1002),
      failedRun
    ], seeds).pass).toBe(false);
  });
});
