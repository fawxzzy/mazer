import { describe, expect, test } from 'vitest';
import { createHazardTimeline, type HazardGraph } from '../../../src/mazer-core/hazards/graphContract';
import { createJunctionGreedyEnemy } from '../../../src/mazer-core/hazards/chaserEngine';
import { findWitnessRouteWithChasers } from '../../../src/mazer-core/hazards/chaserSolvability';
import { serializeChaserVerdict, validateLevelWithChasers } from '../../../src/mazer-core/hazards/chaserValidation';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const staticRoute = (graph: HazardGraph, start: number, goal: number): number[] => {
  const previous = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length > 0 && !previous.has(goal)) {
    const current = queue.shift()!;
    for (const next of graph.neighbors(current)) {
      if (!previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  const route: number[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous.get(cursor)!) {
    route.push(cursor);
  }
  return route.reverse();
};

const level = (width: number, height: number, seed: number) => {
  const maze = createLegacyMaze(width, height, 20261100 + seed, undefined, {
    requiredOppositeBorderConnections: { horizontal: true, vertical: true }
  });
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  const route = staticRoute(graph, start, goal);
  return { graph, start, goal, route, spawn: route[Math.floor(route.length * 0.6)]! };
};

const SEEDS = [1, 2, 3, 4, 5, 6, 7];

describe('chaser search performance (51x25, one chaser)', () => {
  test('fixture is a 51x25 board', () => {
    const { graph } = level(51, 25, 1);
    expect(graph.width).toBe(51);
    expect(graph.height).toBe(25);
  });

  test('A* witness search is interactive (median and max over 7 seeded mazes)', () => {
    const samples: number[] = [];
    const explored: number[] = [];
    for (const seed of SEEDS) {
      const { graph, start, goal, spawn } = level(51, 25, seed);
      const timeline = createHazardTimeline(graph, []);
      const enemy = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: spawn }, graph);
      findWitnessRouteWithChasers(graph, timeline, [enemy], { start, goal });
      const begin = performance.now();
      const result = findWitnessRouteWithChasers(graph, timeline, [enemy], { start, goal });
      samples.push(performance.now() - begin);
      explored.push(result.exploredStates);
      expect(result.status).toBe('solvable');
    }
    console.info(`chaser-perf astar 51x25 median=${median(samples).toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms exploredMedian=${median(explored)} exploredMax=${Math.max(...explored)}`);
    expect(median(samples)).toBeLessThan(150);
    expect(Math.max(...samples)).toBeLessThan(1500);
  });

  test('plain BFS mode stays bounded', () => {
    const samples: number[] = [];
    const explored: number[] = [];
    for (const seed of SEEDS.slice(0, 5)) {
      const { graph, start, goal, spawn } = level(51, 25, seed);
      const timeline = createHazardTimeline(graph, []);
      const enemy = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: spawn }, graph);
      const begin = performance.now();
      const result = findWitnessRouteWithChasers(graph, timeline, [enemy], { start, goal, useHeuristic: false });
      samples.push(performance.now() - begin);
      explored.push(result.exploredStates);
      expect(result.status).toBe('solvable');
    }
    console.info(`chaser-perf bfs 51x25 median=${median(samples).toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms exploredMedian=${median(explored)} exploredMax=${Math.max(...explored)}`);
    expect(median(samples)).toBeLessThan(3000);
  }, 60_000);

  test('full validation (witness, replay, post-contact, fairness) stays interactive', () => {
    const samples: number[] = [];
    for (const seed of SEEDS.slice(0, 5)) {
      const { graph, start, goal, spawn } = level(51, 25, seed);
      const begin = performance.now();
      const verdict = validateLevelWithChasers(graph, [], [{ rule: 'chaser', spawnCell: spawn }], {
        start, goal, includeFairness: true
      });
      samples.push(performance.now() - begin);
      expect(verdict.hazardsPresent.replayVerified).toBe(true);
      expect(verdict.postContact.unknownCount).toBe(0);
    }
    console.info(`chaser-perf validate 51x25 median=${median(samples).toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms`);
    expect(median(samples)).toBeLessThan(1500);
  }, 60_000);

  test('verdict records are byte-identical across runs on the production board', () => {
    const { graph, start, goal, spawn } = level(51, 25, 3);
    const run = () => serializeChaserVerdict(validateLevelWithChasers(
      graph, [], [{ rule: 'interceptor', spawnCell: spawn, graceTurns: 2 }], { start, goal, levelId: 'perf-51x25' }
    ));
    const first = run();
    expect(run()).toBe(first);
    expect(first.length).toBeGreaterThan(100);
  });
});

describe('state-space growth with board size (exhaustive proof of unsolvability)', () => {
  // Sealing the goal forces the search to enumerate every reachable joint state.
  const exhaustive = (width: number, height: number, seed: number, chasers: number, stateCap?: number) => {
    const { graph, start, goal, route } = level(width, height, seed);
    const sealed = createHazardTimeline(graph, graph.neighbors(goal).map((cell) => ({ kind: 'blocker' as const, cell })));
    const enemies = [0.6, 0.35].slice(0, chasers).map((fraction) => (
      createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: route[Math.floor(route.length * fraction)]! }, graph)
    ));
    const begin = performance.now();
    const result = findWitnessRouteWithChasers(graph, sealed, enemies, { start, goal, useHeuristic: false, stateCap });
    return { result, ms: performance.now() - begin, walkable: graph.walkableCellCount, width: graph.width, height: graph.height };
  };

  test('one chaser: reachable joint states grow with the walkable area and finish well under the default cap', () => {
    const rows: string[] = [];
    const medians: number[] = [];
    for (const [width, height] of [[11, 11], [31, 15], [51, 25]] as const) {
      const runs = [1, 2, 3].map((seed) => exhaustive(width, height, seed, 1));
      const explored = runs.map((run) => run.result.exploredStates);
      for (const run of runs) {
        expect(run.result.status).toBe('unsolvable');
      }
      medians.push(median(explored));
      rows.push(`${runs[0]!.width}x${runs[0]!.height} walkable~${runs[0]!.walkable} exploredMedian=${median(explored)} timeMedian=${median(runs.map((run) => run.ms)).toFixed(0)}ms`);
    }
    console.info(`chaser-growth one-chaser ${rows.join(' | ')}`);
    expect(medians[2]!).toBeGreaterThan(medians[0]!);
  }, 120_000);

  test('two chasers on 51x25 hit the cap and report unknown, quickly', () => {
    const run = exhaustive(51, 25, 1, 2, 200_000);
    console.info(`chaser-growth two-chaser 51x25 status=${run.result.status} explored=${run.result.exploredStates} time=${run.ms.toFixed(0)}ms`);
    expect(run.result).toMatchObject({ status: 'unknown', reason: 'state-cap-exceeded' });
    expect(run.result.exploredStates).toBeLessThanOrEqual(200_000);
    expect(run.ms).toBeLessThan(15_000);
  }, 60_000);
});
