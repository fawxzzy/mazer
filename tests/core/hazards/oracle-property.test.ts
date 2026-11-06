import { describe, expect, test } from 'vitest';
import {
  createHazardGraph,
  createHazardTimeline,
  findWitnessRoute,
  shuttlePeriod,
  verifyWitness,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { createTestRng } from './fixtures';
import { oracleSolve, type OracleHazards } from './oracle';

interface Scenario {
  specs: HazardSpec[];
  oracle: OracleHazards;
}

const buildScenario = (
  graph: HazardGraph,
  rng: () => number,
  start: number,
  goal: number,
  limits: { blockers: number; gates: number; patrols: number; maxRoute: number }
): Scenario => {
  const cells: number[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isWalkable(cell)) {
      cells.push(cell);
    }
  }
  const pick = (): number => cells[Math.floor(rng() * cells.length)]!;
  const point = (cell: number) => ({ x: graph.cellX(cell), y: graph.cellY(cell) });

  const specs: HazardSpec[] = [];
  const oracle: OracleHazards = { blockers: [], gates: [], patrols: [] };
  const obstacleCells = new Set<number>();

  const blockerCount = Math.floor(rng() * (limits.blockers + 1));
  for (let i = 0; i < blockerCount; i += 1) {
    const cell = pick();
    if (cell === start || cell === goal || obstacleCells.has(cell)) {
      continue;
    }
    obstacleCells.add(cell);
    specs.push({ kind: 'blocker', cell });
    oracle.blockers.push(point(cell));
  }
  const gateCount = Math.floor(rng() * (limits.gates + 1));
  for (let i = 0; i < gateCount; i += 1) {
    const cell = pick();
    if (obstacleCells.has(cell)) {
      continue;
    }
    obstacleCells.add(cell);
    const period = [2, 3, 4, 6][Math.floor(rng() * 4)]!;
    const openFrom = Math.floor(rng() * period);
    const openFor = Math.floor(rng() * (period + 1));
    specs.push({ kind: 'timedGate', cell, period, openFrom, openFor });
    oracle.gates.push({ cell: point(cell), period, openFrom, openFor });
  }
  const patrolCount = Math.floor(rng() * (limits.patrols + 1));
  for (let i = 0; i < patrolCount; i += 1) {
    const route = [pick()];
    const length = 1 + Math.floor(rng() * limits.maxRoute);
    while (route.length < length) {
      const options = graph.neighbors(route[route.length - 1]!).filter((cell) => !route.includes(cell));
      if (options.length === 0) {
        break;
      }
      route.push(options[Math.floor(rng() * options.length)]!);
    }
    if (route.some((cell) => specs.some((spec) => spec.kind === 'blocker' && spec.cell === cell))) {
      continue;
    }
    const phase = Math.floor(rng() * 5);
    specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase });
    oracle.patrols.push({ route: route.map(point), phase });
  }
  return { specs, oracle };
};

interface Tally {
  cases: number;
  solvable: number;
  unsolvable: number;
}

const checkAgainstOracle = (
  grid: boolean[][],
  graph: HazardGraph,
  start: number,
  goal: number,
  scenario: Scenario,
  options: { startTick: number; invulnerableTurns: number },
  tally: Tally,
  label: string
): void => {
  const timeline = createHazardTimeline(graph, scenario.specs);
  const result = findWitnessRoute(graph, timeline, { start, goal, ...options });
  const expected = oracleSolve(
    grid,
    { x: graph.cellX(start), y: graph.cellY(start) },
    { x: graph.cellX(goal), y: graph.cellY(goal) },
    scenario.oracle,
    options
  );
  tally.cases += 1;
  expect({ label, solvable: result.solvable }).toEqual({ label, solvable: expected.solvable });
  if (result.solvable) {
    tally.solvable += 1;
    expect({ label, ticks: result.witness.ticks }).toEqual({ label, ticks: expected.ticks });
    expect(verifyWitness(graph, timeline, result.witness).valid).toBe(true);
  } else {
    tally.unsolvable += 1;
  }
};

describe('BFS agrees with the brute-force oracle', () => {
  test('production-generated corridor and starter mazes with random blockers, gates and patrols', () => {
    const tally: Tally = { cases: 0, solvable: 0, unsolvable: 0 };
    const profiles = [
      { label: 'corridor', profile: { straightnessBias: 0.95, maxDeadEndCount: 0, checkpointCountOverride: 1 } },
      { label: 'starter', profile: null },
      {
        label: 'wrap',
        profile: { requiredOppositeBorderConnections: { horizontal: true, vertical: true } }
      }
    ];
    for (const { label, profile } of profiles) {
      for (const seed of [3, 17, 91, 2026, 31337, 77777]) {
        const maze = createLegacyMaze(25, 25, seed, undefined, profile);
        const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
        const rng = createTestRng(seed * 31 + label.length);
        for (let trial = 0; trial < 3; trial += 1) {
          const scenario = buildScenario(graph, rng, start, goal, { blockers: 4, gates: 3, patrols: 2, maxRoute: 6 });
          checkAgainstOracle(
            maze.grid,
            graph,
            start,
            goal,
            scenario,
            { startTick: Math.floor(rng() * 4), invulnerableTurns: trial === 2 ? 2 : 0 },
            tally,
            `${label}:${seed}:${trial}`
          );
        }
      }
    }
    expect(tally.cases).toBe(54);
    expect(tally.solvable).toBeGreaterThan(5);
  });

  test('production mazes with a hazard planted on the shortest route stress unsolvable and wait cases', () => {
    const tally: Tally = { cases: 0, solvable: 0, unsolvable: 0 };
    for (const seed of [5, 44, 505, 6060]) {
      const maze = createLegacyMaze(25, 25, seed, undefined, { straightnessBias: 0.9, maxDeadEndCount: 0, checkpointCountOverride: 1 });
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      const rng = createTestRng(seed);
      // Walk a BFS-shortest route and plant obstacles ON it.
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
      const interior = route.slice(2, -2);
      for (let trial = 0; trial < 6; trial += 1) {
        const cell = interior[Math.floor(rng() * interior.length)]!;
        const point = { x: graph.cellX(cell), y: graph.cellY(cell) };
        const kind = trial % 3;
        let scenario: Scenario;
        if (kind === 0) {
          scenario = { specs: [{ kind: 'blocker', cell }], oracle: { blockers: [point], gates: [], patrols: [] } };
        } else if (kind === 1) {
          const period = 2 + Math.floor(rng() * 4);
          const openFrom = Math.floor(rng() * period);
          scenario = {
            specs: [{ kind: 'timedGate', cell, period, openFrom, openFor: 1 }],
            oracle: { blockers: [], gates: [{ cell: point, period, openFrom, openFor: 1 }], patrols: [] }
          };
        } else {
          const index = route.indexOf(cell);
          const patrolRoute = route.slice(Math.max(1, index - 1), Math.min(route.length - 1, index + 3));
          scenario = {
            specs: [{ kind: 'patrol', route: patrolRoute, period: shuttlePeriod(patrolRoute.length) }],
            oracle: {
              blockers: [],
              gates: [],
              patrols: [{ route: patrolRoute.map((c) => ({ x: graph.cellX(c), y: graph.cellY(c) })), phase: 0 }]
            }
          };
        }
        checkAgainstOracle(maze.grid, graph, start, goal, scenario, { startTick: 0, invulnerableTurns: 0 }, tally, `planted:${seed}:${trial}`);
      }
    }
    expect(tally.cases).toBe(24);
    expect(tally.solvable).toBeGreaterThan(0);
    expect(tally.unsolvable).toBeGreaterThan(0);
  });

  test('small random grids with wraps, many hazards, start ticks and invulnerability', () => {
    const tally: Tally = { cases: 0, solvable: 0, unsolvable: 0 };
    const rng = createTestRng(424242);
    for (let iteration = 0; iteration < 250; iteration += 1) {
      const width = 3 + Math.floor(rng() * 4);
      const height = 3 + Math.floor(rng() * 3);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.72));
      const walkableCells: number[] = [];
      grid.forEach((row, y) => row.forEach((open, x) => {
        if (open) {
          walkableCells.push(y * width + x);
        }
      }));
      if (walkableCells.length < 2) {
        continue;
      }
      const graph = createHazardGraph({ width, height, grid });
      const start = walkableCells[Math.floor(rng() * walkableCells.length)]!;
      let goal = walkableCells[Math.floor(rng() * walkableCells.length)]!;
      if (goal === start) {
        goal = walkableCells[(walkableCells.indexOf(start) + 1) % walkableCells.length]!;
      }
      const scenario = buildScenario(graph, rng, start, goal, { blockers: 2, gates: 3, patrols: 2, maxRoute: 4 });
      checkAgainstOracle(
        grid,
        graph,
        start,
        goal,
        scenario,
        { startTick: Math.floor(rng() * 7), invulnerableTurns: Math.floor(rng() * 3) },
        tally,
        `small:${iteration}`
      );
    }
    expect(tally.cases).toBeGreaterThan(200);
    expect(tally.solvable).toBeGreaterThan(30);
    expect(tally.unsolvable).toBeGreaterThan(30);
  });
});
