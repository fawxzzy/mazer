import { describe, expect, test } from 'vitest';
import {
  findMazeV2LabCandidateWindowOverlap,
  isMazeV2LabSeedStrategyId,
  MAZE_V2_LAB_DEFAULT_SEED_CORPUS,
  MAZE_V2_LAB_MAX_CANDIDATE_WINDOW,
  MAZE_V2_LAB_NONOVERLAPPING_STRIDE,
  resolveMazeV2LabSeedPlan
} from '../../scripts/analysis/mazeV2SeedStrategies';

describe('isMazeV2LabSeedStrategyId', () => {
  test.each(['fixed', 'sequential-nonoverlapping', 'corpus'])('accepts %s', (value) => {
    expect(isMazeV2LabSeedStrategyId(value)).toBe(true);
  });

  test('rejects an unknown strategy id', () => {
    expect(isMazeV2LabSeedStrategyId('random')).toBe(false);
  });
});

describe('fixed strategy', () => {
  test('every level receives the exact same requested seed', () => {
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'fixed', baseSeed: 777, minLevel: 1, maxLevel: 10 });
    expect(plan).toHaveLength(10);
    expect(new Set(plan.map((entry) => entry.requestedSeed)).size).toBe(1);
    expect(plan[0]?.requestedSeed).toBe(777);
  });
});

describe('sequential-nonoverlapping strategy', () => {
  test('produces one entry per level with strictly increasing requested seeds', () => {
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'sequential-nonoverlapping', baseSeed: 1000, minLevel: 1, maxLevel: 5 });
    expect(plan).toHaveLength(5);
    for (let index = 1; index < plan.length; index += 1) {
      expect(plan[index]!.requestedSeed).toBeGreaterThan(plan[index - 1]!.requestedSeed);
    }
  });

  test('the stride between adjacent requested seeds exceeds the worst-case candidate window', () => {
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'sequential-nonoverlapping', baseSeed: 0, minLevel: 1, maxLevel: 3 });
    const strideA = plan[1]!.requestedSeed - plan[0]!.requestedSeed;
    const strideB = plan[2]!.requestedSeed - plan[1]!.requestedSeed;
    expect(strideA).toBe(MAZE_V2_LAB_NONOVERLAPPING_STRIDE);
    expect(strideB).toBe(MAZE_V2_LAB_NONOVERLAPPING_STRIDE);
    // The stride is only a real guarantee if it's strictly greater than the
    // largest window a single generation call could ever consume -- assert
    // the actual relationship, not just that some constant was used.
    expect(MAZE_V2_LAB_NONOVERLAPPING_STRIDE).toBeGreaterThan(MAZE_V2_LAB_MAX_CANDIDATE_WINDOW);
  });

  test('a synthetic worst-case candidate window between adjacent levels never overlaps', () => {
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'sequential-nonoverlapping', baseSeed: 0, minLevel: 1, maxLevel: 4 });
    const samples = plan.map((entry) => ({
      level: entry.level,
      candidateSeeds: Array.from(
        { length: MAZE_V2_LAB_MAX_CANDIDATE_WINDOW },
        (_, index) => entry.requestedSeed + index
      )
    }));
    expect(findMazeV2LabCandidateWindowOverlap(samples)).toBeNull();
  });

  test('detects a genuine overlap when two levels share a candidate seed', () => {
    const overlap = findMazeV2LabCandidateWindowOverlap([
      { level: 1, candidateSeeds: [10, 11, 12] },
      { level: 2, candidateSeeds: [12, 13, 14] }
    ]);
    expect(overlap).toEqual({ firstLevel: 1, secondLevel: 2, sharedSeed: 12 });
  });
});

describe('corpus strategy', () => {
  test('every level is run against the same seed corpus', () => {
    const corpus = [11, 22, 33];
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'corpus', baseSeed: 0, minLevel: 1, maxLevel: 2, seedCorpus: corpus });
    expect(plan).toHaveLength(6);
    const level1Seeds = plan.filter((entry) => entry.level === 1).map((entry) => entry.requestedSeed);
    const level2Seeds = plan.filter((entry) => entry.level === 2).map((entry) => entry.requestedSeed);
    expect(level1Seeds).toEqual(corpus);
    expect(level2Seeds).toEqual(corpus);
  });

  test('falls back to the committed default corpus of at least 32 seeds when none is supplied', () => {
    expect(MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length).toBeGreaterThanOrEqual(32);
    const plan = resolveMazeV2LabSeedPlan({ strategy: 'corpus', baseSeed: 0, minLevel: 1, maxLevel: 1 });
    expect(plan).toHaveLength(MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length);
  });

  test('the default corpus contains only well-formed uint32 values', () => {
    for (const seed of MAZE_V2_LAB_DEFAULT_SEED_CORPUS) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
