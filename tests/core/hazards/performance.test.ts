import { describe, expect, test } from 'vitest';
import {
  createHazardTimeline,
  findWitnessRoute,
  shuttlePeriod,
  serializeLevelVerdict,
  validateLevelHazards,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe('hazard search performance (51x25, period 12)', () => {
  const maze = createLegacyMaze(51, 25, 20261105, undefined, {
    requiredOppositeBorderConnections: { horizontal: true, vertical: true }
  });
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);

  // Gates of period 4 and 3 plus a 7-cell shuttle patrol (cycle 12) => lcm 12.
  const specs = ((): HazardSpec[] => {
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
    route.reverse();
    const patrolRoute = route.slice(Math.floor(route.length / 2), Math.floor(route.length / 2) + 7);
    return [
      { kind: 'timedGate', cell: route[Math.floor(route.length / 4)]!, period: 4, openFrom: 1, openFor: 2 },
      { kind: 'timedGate', cell: route[Math.floor(route.length / 3)]!, period: 3, openFrom: 0, openFor: 2 },
      { kind: 'patrol', route: patrolRoute, period: shuttlePeriod(patrolRoute.length) }
    ];
  })();

  test('fixture is a 51x25 board with a combined period of exactly 12', () => {
    expect(graph.width).toBe(51);
    expect(graph.height).toBe(25);
    expect(createHazardTimeline(graph, specs).period).toBe(12);
  });

  test('findWitnessRoute completes in well under 150 ms (median of 7)', () => {
    const timeline = createHazardTimeline(graph, specs);
    findWitnessRoute(graph, timeline, { start, goal });
    const samples: number[] = [];
    let ticks = 0;
    for (let run = 0; run < 7; run += 1) {
      const begin = performance.now();
      const result = findWitnessRoute(graph, timeline, { start, goal });
      samples.push(performance.now() - begin);
      ticks = result.solvable ? result.witness.ticks : -1;
    }
    expect(ticks).toBeGreaterThan(0);
    const elapsed = median(samples);
    console.info(`hazard-perf findWitnessRoute median=${elapsed.toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms ticks=${ticks}`);
    expect(elapsed).toBeLessThan(150);
  });

  test('full level validation including post-contact reverse reachability stays interactive', () => {
    validateLevelHazards(graph, specs, { start, goal });
    const samples: number[] = [];
    let checked = 0;
    for (let run = 0; run < 3; run += 1) {
      const begin = performance.now();
      const verdict = validateLevelHazards(graph, specs, { start, goal });
      samples.push(performance.now() - begin);
      checked = verdict.postContact.checkedStates;
    }
    const elapsed = median(samples);
    console.info(`hazard-perf validateLevelHazards median=${elapsed.toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms postContactStates=${checked}`);
    expect(elapsed).toBeLessThan(500);
  });

  test('verdict records are byte-identical across runs on the production board', () => {
    const run = () => serializeLevelVerdict(validateLevelHazards(graph, specs, { start, goal, levelId: 'perf-51x25' }));
    const first = run();
    expect(run()).toBe(first);
    expect(first.length).toBeGreaterThan(100);
  });
});
