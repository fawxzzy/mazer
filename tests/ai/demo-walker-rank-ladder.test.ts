import { describe, expect, test } from 'vitest';

import {
  collectDemoWalkerRouteDiagnostics,
  type DemoWalkerAiSkillRank
} from '../../src/domain/ai';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyGeneratedMenuMaze } from '../../src/legacy-runtime/legacyMaze';

describe('human-memory AI rank ladder', () => {
  test('keeps every rank local while making higher ranks more capable', () => {
    const ranks: readonly DemoWalkerAiSkillRank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
    const seeds = [1, 2, 3, 5, 8] as const;
    const averages = new Map<DemoWalkerAiSkillRank, { routeLength: number; score: number }>();
    const perceptions = new Map<DemoWalkerAiSkillRank, ReturnType<typeof collectDemoWalkerRouteDiagnostics>['perception']>();

    for (const rank of ranks) {
      let routeLength = 0;
      let score = 0;

      for (const seed of seeds) {
        const episode = createLegacyDemoWalkerEpisode(createLegacyGeneratedMenuMaze(37, seed));
        const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
        const diagnostics = collectDemoWalkerRouteDiagnostics(episode, {
          ...baseConfig,
          behavior: {
            ...baseConfig.behavior,
            aiSkillRank: rank,
            aiSkillLevel: 1
          }
        });

        expect(diagnostics.aiResetPathCursor).toBeNull();
        perceptions.set(rank, diagnostics.perception);
        routeLength += diagnostics.routeLength;
        score += diagnostics.telemetry.recoveryCount;
      }

      averages.set(rank, {
        routeLength: routeLength / seeds.length,
        score: score / seeds.length
      });
    }

    expect(perceptions.get('E')?.lookaheadDepth).toBeLessThan(perceptions.get('S')?.lookaheadDepth ?? 0);
    expect(perceptions.get('E')?.confidenceNoisePenalty).toBeGreaterThan(perceptions.get('S')?.confidenceNoisePenalty ?? 0);
    expect(perceptions.get('E')?.wrapMentalCost).toBeGreaterThan(perceptions.get('S')?.wrapMentalCost ?? 0);
    expect(perceptions.get('S')?.solvePreviewBudget).toBeGreaterThan(0);
    expect(averages.get('S')?.routeLength).toBeLessThanOrEqual(averages.get('E')?.routeLength ?? 0);
  });
});
