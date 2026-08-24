import { describe, expect, test } from 'vitest';

import {
  AI_NAVIGATION_ACCEPTANCE_CADENCE_MS,
  AI_NAVIGATION_ACCEPTANCE_RANKS,
  runAiNavigationAcceptance
} from '../../scripts/analysis/ai-navigation-acceptance';

describe('AI navigation acceptance harness', () => {
  test('is deterministic and preserves the rank, route, and cadence contract', () => {
    const options = {
      scales: [25, 37] as const,
      seedStart: 1,
      seedEnd: 3
    };
    const first = runAiNavigationAcceptance(options);
    const replay = runAiNavigationAcceptance(options);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      mazeCases: 6,
      rankCases: 6 * AI_NAVIGATION_ACCEPTANCE_RANKS.length,
      acceptance: {
        everyRouteCompleted: true,
        zeroInvalidMoves: true,
        equalCadence: true,
        ranksDThroughSExactShortestPath: true,
        rankEP95WithinBound: true,
        rankEMaxWithinBound: true,
        passed: true
      }
    });
    expect(first.routeCaseDigestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(AI_NAVIGATION_ACCEPTANCE_CADENCE_MS).toBe(88);
    for (const summary of first.rankSummaries.slice(1)) {
      expect(summary.exactShortestPathCases).toBe(summary.cases);
    }
  }, 20_000);
});
