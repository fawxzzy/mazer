import { describe, expect, test } from 'vitest';

import {
  collectDemoWalkerRouteDiagnostics,
  type DemoWalkerAiSkillRank
} from '../../src/domain/ai';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import {
  createLegacyGeneratedMenuMaze,
  resolveLegacyPlayableShortestPath
} from '../../src/legacy-runtime/legacyMaze';

describe('human-memory AI rank ladder', () => {
  test('keeps every rank local while making route skill monotonically stronger', () => {
    const ranks: readonly DemoWalkerAiSkillRank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
    const scales = [37, 50, 75] as const;
    const seeds = [1, 2, 3, 5, 8, 13] as const;
    const averages = new Map<DemoWalkerAiSkillRank, { routeLength: number; routeRatio: number }>();
    const perceptions = new Map<DemoWalkerAiSkillRank, ReturnType<typeof collectDemoWalkerRouteDiagnostics>['perception']>();

    for (const rank of ranks) {
      let routeLength = 0;
      let routeRatio = 0;
      let count = 0;

      for (const scale of scales) {
        for (const seed of seeds) {
          const maze = createLegacyGeneratedMenuMaze(scale, scale, seed);
          const episode = createLegacyDemoWalkerEpisode(maze);
          const shortestPath = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
          const config = createLegacyMenuDemoWalkerConfig(seed, {
            aiSkillRank: rank,
            aiSkillLevel: 1
          });
          const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);

          expect(diagnostics.aiResetPathCursor).toBeNull();
          expect(config.cadence.exploreStepMs).toBe(88);
          expect(config.cadence.backtrackStepMs).toBe(88);
          expect(diagnostics.traverseMs).toBe(diagnostics.segmentCount * 88);
          expect(shortestPath.found).toBe(true);
          expect(diagnostics.routeLength).toBeGreaterThanOrEqual(shortestPath.path.length);
          perceptions.set(rank, diagnostics.perception);
          routeLength += diagnostics.routeLength;
          routeRatio += diagnostics.routeLength / shortestPath.path.length;
          count += 1;

          if (rank !== 'E') {
            expect(diagnostics.routeLength).toBe(shortestPath.path.length);
            expect(diagnostics.telemetry).toMatchObject({
              backtrackCount: 0,
              optionalRetargetCount: 0,
              recoveryCount: 0,
              wrongBranchCount: 0
            });
          }
        }
      }

      averages.set(rank, {
        routeLength: routeLength / count,
        routeRatio: routeRatio / count
      });
    }

    expect(perceptions.get('E')?.lookaheadDepth).toBeLessThan(perceptions.get('S')?.lookaheadDepth ?? 0);
    expect(perceptions.get('C')?.lookaheadDepth).toBe(10);
    expect(perceptions.get('B')?.lookaheadDepth).toBe(10);
    expect(perceptions.get('A')?.lookaheadDepth).toBe(12);
    expect(perceptions.get('E')?.rankedLookaheadProgressWeight).toBe(0);
    expect(perceptions.get('E')?.rankedLookaheadAmbiguityWeight).toBe(0);
    expect(perceptions.get('D')?.rankedLookaheadProgressWeight).toBe(0.75);
    expect(perceptions.get('D')?.rankedLookaheadAmbiguityWeight).toBe(1);
    for (const rank of ['C', 'B', 'A', 'S'] as const) {
      expect(perceptions.get(rank)?.rankedLookaheadProgressWeight).toBe(1);
      expect(perceptions.get(rank)?.rankedLookaheadAmbiguityWeight).toBe(1);
    }
    expect(perceptions.get('E')?.confidenceNoisePenalty).toBeGreaterThan(perceptions.get('S')?.confidenceNoisePenalty ?? 0);
    expect(perceptions.get('E')?.wrapMentalCost).toBeGreaterThan(perceptions.get('S')?.wrapMentalCost ?? 0);
    expect(perceptions.get('E')?.shortestPathAssistBuckets).toBe(4);
    expect(perceptions.get('S')?.shortestPathAssistBuckets).toBe(5);
    expect(perceptions.get('S')?.solvePreviewBudget).toBeGreaterThan(0);
    for (let cursor = 1; cursor < ranks.length; cursor += 1) {
      const previous = averages.get(ranks[cursor - 1]!)!;
      const current = averages.get(ranks[cursor]!)!;
      expect(
        current.routeRatio,
        `${ranks[cursor - 1]} -> ${ranks[cursor]} route-ratio regression: ${JSON.stringify({ previous, current })}`
      ).toBeLessThanOrEqual(previous.routeRatio);
    }
  }, 20_000);
});
