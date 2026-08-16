import { describe, expect, test } from 'vitest';
import {
  MAZE_CYCLE_AI_SCORER_ID,
  MAZE_CYCLE_AI_SCORER_VERSION,
  compareMazeCycleAiDecisionScore,
  scoreMazeCycleAiDecisionSummary
} from '../../src/legacy-runtime/mazeCycleAiScorer.mjs';
import { scoreMazeCycleAiDecisionSummary as scoreThroughTelemetry } from '../../src/legacy-runtime/mazeCycleTelemetry';

const summary = {
  backtrackCount: 2,
  decisionCount: 18,
  optionalRetargetCount: 1,
  recoveryCount: 1,
  thinkingModel: 'human-local-memory' as const,
  visitedUndoCount: 0,
  wrongBranchCount: 3
};

describe('maze cycle AI scorer contract', () => {
  test('preserves the runtime formula as version 1', () => {
    expect(scoreMazeCycleAiDecisionSummary(summary)).toEqual({
      scorerId: MAZE_CYCLE_AI_SCORER_ID,
      scorerVersion: MAZE_CYCLE_AI_SCORER_VERSION,
      pressureScore: 21.18,
      reliabilityScore: 78.82,
      recoveryPressureScore: 20.833,
      routeNoiseScore: 25,
      retargetPressureScore: 5.556,
      signal: 'clean'
    });
  });

  test('keeps the telemetry runtime on the canonical scorer', () => {
    expect(scoreThroughTelemetry(summary)).toEqual(scoreMazeCycleAiDecisionSummary(summary));
  });

  test('preserves stored history separately from canonical recomputation', () => {
    const stored = {
      pressureScore: 40.305,
      reliabilityScore: 59.695,
      recoveryPressureScore: 30,
      routeNoiseScore: 58.333,
      retargetPressureScore: 5.556,
      signal: 'searching'
    };

    expect(compareMazeCycleAiDecisionScore(stored, summary)).toMatchObject({
      canonicalScorerId: MAZE_CYCLE_AI_SCORER_ID,
      canonicalScorerVersion: MAZE_CYCLE_AI_SCORER_VERSION,
      status: 'mismatch',
      stored,
      recomputed: {
        pressureScore: 21.18,
        signal: 'clean'
      }
    });
  });
});
