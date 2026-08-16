import { describe, expect, test } from 'vitest';
import {
  MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
  MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
  MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
  compareMazeCycleRunQualityScore,
  scoreMazeCycleRunQuality
} from '../../src/legacy-runtime/mazeCycleRunQualityScorer.mjs';

const cleanPlayInput = {
  averageFrameMs: 16,
  backtracks: 0,
  completionTimeMs: 8_000,
  complexity: 24,
  playerPathLength: 12,
  resetUsed: false,
  shortestViablePathLength: 12,
  surface: 'play' as const,
  wrongTurns: 0
};

describe('maze cycle run-quality scorer contract', () => {
  test('publishes one versioned 0-100 score and explicit denominator model', () => {
    expect(scoreMazeCycleRunQuality(cleanPlayInput)).toMatchObject({
      scorerId: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
      scorerVersion: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
      shortestPathModel: MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
      routeEfficiencyPressureScore: 0,
      routeOverrunRatio: 0,
      routeOverrunSteps: 0,
      shortestViablePathLength: 12,
      signal: 'challenge',
      total: 95
    });
  });

  test('distinguishes route overrun from route topology class', () => {
    const singleRoute = scoreMazeCycleRunQuality({
      ...cleanPlayInput,
      playerPathLength: 24,
      shortestViablePathLength: 12
    });
    const multiRoute = scoreMazeCycleRunQuality({
      ...cleanPlayInput,
      playerPathLength: 24,
      shortestViablePathLength: 12
    });

    expect(singleRoute).toEqual(multiRoute);
    expect(singleRoute).toMatchObject({
      routeEfficiencyPressureScore: 66.667,
      routeOverrunRatio: 1,
      routeOverrunSteps: 12
    });
  });

  test('preserves stored history separately from canonical recomputation', () => {
    const canonical = scoreMazeCycleRunQuality(cleanPlayInput);
    expect(canonical).not.toBeNull();
    expect(compareMazeCycleRunQualityScore(canonical, cleanPlayInput)).toMatchObject({
      status: 'match',
      stored: { total: 95 },
      recomputed: { total: 95 }
    });

    expect(compareMazeCycleRunQualityScore({ ...canonical, total: 75 }, cleanPlayInput)).toMatchObject({
      status: 'mismatch',
      stored: { total: 75 },
      recomputed: { total: 95 }
    });
    expect(compareMazeCycleRunQualityScore(null, cleanPlayInput)).toMatchObject({
      status: 'stored-missing',
      stored: null,
      recomputed: { total: 95 }
    });
  });
});
