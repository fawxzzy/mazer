import { describe, expect, test } from 'vitest';
import { createHazardTimeline, shuttlePeriod, type HazardSpec } from '../../../src/mazer-core/hazards';
import { DEFAULT_BOT_LADDER, runBot } from '../../../src/mazer-core/eval/bots';
import { measureLevelDifficulty } from '../../../src/mazer-core/eval/difficultyReport';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';

const maze = createLegacyMaze(51, 25, 20261105, undefined, {
  requiredOppositeBorderConnections: { horizontal: true, vertical: true }
});
const { graph, start, goal } = createLegacyMazeHazardGraph(maze);

// Same shape as the P3 performance fixture: two gates plus a 7-cell shuttle patrol (period 12).
const route = ((): number[] => {
  const previous = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && !previous.has(goal); head += 1) {
    for (const next of graph.neighbors(queue[head]!)) {
      if (!previous.has(next)) {
        previous.set(next, queue[head]!);
        queue.push(next);
      }
    }
  }
  const cells: number[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous.get(cursor)!) {
    cells.push(cursor);
  }
  return cells.reverse();
})();
const patrolRoute = route.slice(Math.floor(route.length / 2), Math.floor(route.length / 2) + 7);
const specs: HazardSpec[] = [
  { kind: 'timedGate', cell: route[Math.floor(route.length / 4)]!, period: 4, openFrom: 1, openFor: 2 },
  { kind: 'timedGate', cell: route[Math.floor(route.length / 3)]!, period: 3, openFrom: 0, openFor: 2 },
  { kind: 'patrol', route: patrolRoute, period: shuttlePeriod(patrolRoute.length) }
];

describe('bot performance bounds (51x25, period 12)', () => {
  test('each fallible bot finishes a full run well inside the budget', () => {
    const timeline = createHazardTimeline(graph, specs);
    const maxTurns = 8 * route.length + 80;
    for (const spec of DEFAULT_BOT_LADDER) {
      const begin = performance.now();
      const result = runBot(spec, graph, timeline, { start, goal, maxTurns, seed: 1 });
      const elapsed = performance.now() - begin;
      expect(result.turns, spec.kind).toBeLessThanOrEqual(maxTurns);
      // Generous CI bound; measured cost is reported in the packet, not guaranteed.
      expect(elapsed, spec.kind).toBeLessThan(2500);
    }
  });

  test('measuring a level with the default ladder and 4 seeds stays bounded and deterministic', () => {
    const level = { graph, start, goal, hazards: specs };
    const begin = performance.now();
    const first = measureLevelDifficulty(level, DEFAULT_BOT_LADDER, [1, 2, 3, 4]);
    const elapsed = performance.now() - begin;
    expect(elapsed).toBeLessThan(10000);
    expect(JSON.stringify(measureLevelDifficulty(level, DEFAULT_BOT_LADDER, [1, 2, 3, 4]))).toBe(JSON.stringify(first));
    expect(first.solvable).toBe(true);
  });

  test('no run exceeds its turn budget and paths are bounded by it', () => {
    const timeline = createHazardTimeline(graph, specs);
    for (const spec of DEFAULT_BOT_LADDER) {
      const result = runBot(spec, graph, timeline, { start, goal, maxTurns: 25, seed: 9 });
      expect(result.turns).toBeLessThanOrEqual(25);
      expect(result.path.length).toBe(result.turns + 1);
    }
  });
});
