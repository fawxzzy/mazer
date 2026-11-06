import { describe, expect, test } from 'vitest';
import { createHazardGraph, createHazardTimeline, type HazardGraph } from '../../../src/mazer-core/hazards/graphContract';
import {
  createJunctionGreedyEnemy,
  stepJunctionGreedyEnemy,
  type ChaserPlayerState,
  type JunctionGreedyEnemySpec
} from '../../../src/mazer-core/hazards/chaserEngine';
import {
  findWitnessRouteWithChasers,
  verifyChaserWitness
} from '../../../src/mazer-core/hazards/chaserSolvability';
import { createTestRng } from './fixtures';
import {
  REF_ORDER,
  refExits,
  refInitialEnemy,
  refShortestSolve,
  refStepEnemy,
  type RefDir,
  type RefEnemy,
  type RefPlayer,
  type RefRule,
  type RefSpec,
  type RefWorld
} from './chaserReference';

const RULES: readonly RefRule[] = ['chaser', 'interceptor', 'wall-follower'];
const NAMES = { U: 'up', L: 'left', D: 'down', R: 'right' } as const;

interface Scenario {
  readonly graph: HazardGraph;
  readonly world: RefWorld;
  readonly walkable: readonly number[];
  readonly staticBlocked: ReadonlySet<number>;
}

const buildScenario = (rng: () => number, withBlockers: boolean): Scenario => {
  const width = 3 + Math.floor(rng() * 7);
  const height = 3 + Math.floor(rng() * 5);
  const density = 0.55 + rng() * 0.25;
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < density));
  grid[0]![0] = true;
  const graph = createHazardGraph({ width, height, grid });
  const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
  const staticBlocked = new Set<number>();
  if (withBlockers) {
    for (const cell of walkable) {
      if (rng() < 0.08) {
        staticBlocked.add(cell);
      }
    }
  }
  const world: RefWorld = {
    grid,
    width,
    height,
    blocked: (x, y, turn) => staticBlocked.has(y * width + x) || ((y * width + x) % 7 === 3 && withBlockers && turn % 3 === 0)
  };
  return { graph, world, walkable, staticBlocked };
};

const randomSpecPair = (
  rng: () => number,
  scenario: Scenario,
  rule: RefRule
): { prod: JunctionGreedyEnemySpec; ref: RefSpec } | null => {
  const open = scenario.walkable.filter((c) => !scenario.staticBlocked.has(c));
  if (open.length < 2) {
    return null;
  }
  const spawn = open[Math.floor(rng() * open.length)]!;
  const delay = Math.floor(rng() * 4);
  const grace = Math.floor(rng() * 4);
  const divisor = 1 + Math.floor(rng() * 3);
  const lookahead = 1 + Math.floor(rng() * 5);
  const facing: RefDir | null = rng() < 0.4 ? REF_ORDER[Math.floor(rng() * 4)]! : null;
  const { width } = scenario.graph;
  return {
    prod: {
      rule,
      spawnCell: spawn,
      lookahead,
      spawnDelayTurns: delay,
      graceTurns: grace,
      speedDivisor: divisor,
      ...(facing ? { initialHeading: NAMES[facing] } : {})
    },
    ref: {
      rule,
      spawn: { x: spawn % width, y: Math.floor(spawn / width) },
      lookahead,
      initialFacing: facing,
      delay,
      grace,
      divisor
    }
  };
};

describe('engine vs independent reference implementation', () => {
  test('matches the reference on random boards, rules, tiering knobs and wrap edges', () => {
    const rng = createTestRng(61_026);
    let compared = 0;
    let moves = 0;
    for (let round = 0; round < 450; round += 1) {
      const scenario = buildScenario(rng, round % 2 === 1);
      const rule = RULES[round % 3]!;
      const pair = randomSpecPair(rng, scenario, rule);
      if (!pair) {
        continue;
      }
      const { graph, world } = scenario;
      const blocked = (cell: number, turn: number): boolean => (
        world.blocked!(cell % graph.width, Math.floor(cell / graph.width), turn)
      );
      let prod = createJunctionGreedyEnemy(pair.prod, graph);
      let ref: RefEnemy = refInitialEnemy(world, pair.ref);
      let playerCell = scenario.walkable[Math.floor(rng() * scenario.walkable.length)]!;
      let playerFacing: RefDir | null = null;
      for (let tick = 0; tick < 60; tick += 1) {
        const exits = refExits(world, playerCell % graph.width, Math.floor(playerCell / graph.width));
        if (exits.length > 0 && rng() < 0.75) {
          const exit = exits[Math.floor(rng() * exits.length)]!;
          playerCell = exit.y * graph.width + exit.x;
          playerFacing = exit.dir;
        }
        const player: ChaserPlayerState = {
          cell: playerCell,
          heading: playerFacing === null ? null : NAMES[playerFacing]
        };
        const refPlayer: RefPlayer = {
          x: playerCell % graph.width, y: Math.floor(playerCell / graph.width), facing: playerFacing
        };
        const before = prod.cell;
        prod = stepJunctionGreedyEnemy(graph, prod, player, tick, { blocked });
        ref = refStepEnemy(world, pair.ref, ref, refPlayer, tick + 1);
        const refCell = ref.present ? ref.y * graph.width + ref.x : -1;
        expect(prod.cell, `round ${round} rule ${rule} tick ${tick}`).toBe(refCell);
        compared += 1;
        if (prod.cell !== before && before >= 0) {
          moves += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(15_000);
    expect(moves).toBeGreaterThan(2_000);
  });
});

describe('solver vs brute-force oracle (absolute-time layers, reference movement)', () => {
  test('shortest contact-free route length agrees on random small boards', () => {
    const rng = createTestRng(404_040);
    let solvable = 0;
    let unsolvable = 0;
    for (let round = 0; round < 260; round += 1) {
      const width = 3 + Math.floor(rng() * 4);
      const height = 3 + Math.floor(rng() * 3);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.72));
      grid[0]![0] = true;
      const graph = createHazardGraph({ width, height, grid });
      const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
      if (walkable.length < 4) {
        continue;
      }
      const world: RefWorld = { grid, width, height, blocked: undefined };
      const start = walkable[Math.floor(rng() * walkable.length)]!;
      const goal = walkable[Math.floor(rng() * walkable.length)]!;
      const enemyCount = 1 + (round % 3 === 0 ? 1 : 0);
      const prodSpecs: JunctionGreedyEnemySpec[] = [];
      const refSpecs: RefSpec[] = [];
      const scenario: Scenario = { graph, world, walkable, staticBlocked: new Set() };
      for (let e = 0; e < enemyCount; e += 1) {
        const pair = randomSpecPair(rng, scenario, RULES[Math.floor(rng() * 3)]!);
        if (pair) {
          prodSpecs.push(pair.prod);
          refSpecs.push(pair.ref);
        }
      }
      const enemies = prodSpecs.map((spec) => createJunctionGreedyEnemy(spec, graph));
      const maxTicks = 18;
      const oracle = refShortestSolve(world, refSpecs, {
        start: { x: start % width, y: Math.floor(start / width) },
        goal: { x: goal % width, y: Math.floor(goal / width) },
        maxTicks
      });
      const timeline = createHazardTimeline(graph, []);
      const result = findWitnessRouteWithChasers(graph, timeline, enemies, { start, goal });
      const label = `round ${round} ${JSON.stringify(prodSpecs)} start ${start} goal ${goal}`;
      if (oracle !== null) {
        expect(result.status, label).toBe('solvable');
        if (result.status === 'solvable') {
          expect(result.witness.ticks, label).toBe(oracle);
          expect(verifyChaserWitness(graph, timeline, enemies, result.witness).valid, label).toBe(true);
          solvable += 1;
        }
      } else if (result.status === 'solvable') {
        expect(result.witness.ticks, label).toBeGreaterThan(maxTicks);
      } else {
        expect(result.status, label).toBe('unsolvable');
        unsolvable += 1;
      }
    }
    expect(solvable).toBeGreaterThan(60);
    expect(unsolvable).toBeGreaterThan(10);
  });

  test('static blockers act as walls for both the player and the chaser', () => {
    const rng = createTestRng(515_151);
    let agreed = 0;
    for (let round = 0; round < 120; round += 1) {
      const width = 4 + Math.floor(rng() * 3);
      const height = 3 + Math.floor(rng() * 3);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.8));
      grid[0]![0] = true;
      const graph = createHazardGraph({ width, height, grid });
      const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
      if (walkable.length < 6) {
        continue;
      }
      const blockerCells = new Set<number>();
      for (const cell of walkable) {
        if (rng() < 0.12) {
          blockerCells.add(cell);
        }
      }
      const open = walkable.filter((c) => !blockerCells.has(c));
      if (open.length < 3) {
        continue;
      }
      const pick = () => open[Math.floor(rng() * open.length)]!;
      const start = pick();
      const goal = pick();
      const spawn = pick();
      const rule = RULES[round % 3]!;
      const world: RefWorld = {
        grid, width, height, blocked: (x, y) => blockerCells.has(y * width + x)
      };
      const refSpec: RefSpec = {
        rule, spawn: { x: spawn % width, y: Math.floor(spawn / width) }, lookahead: 3,
        initialFacing: null, delay: 0, grace: 1, divisor: 1
      };
      const timeline = createHazardTimeline(graph, [...blockerCells].map((cell) => ({ kind: 'blocker' as const, cell })));
      const enemy = createJunctionGreedyEnemy({ rule, spawnCell: spawn, graceTurns: 1 }, graph);
      const oracle = refShortestSolve(world, [refSpec], {
        start: { x: start % width, y: Math.floor(start / width) },
        goal: { x: goal % width, y: Math.floor(goal / width) },
        maxTicks: 16,
        impassable: new Set([...blockerCells].map((c) => `${c % width},${Math.floor(c / width)}`))
      });
      const result = findWitnessRouteWithChasers(graph, timeline, [enemy], { start, goal });
      if (oracle !== null) {
        expect(result.status).toBe('solvable');
        if (result.status === 'solvable') {
          expect(result.witness.ticks).toBe(oracle);
          expect(verifyChaserWitness(graph, timeline, [enemy], result.witness).valid).toBe(true);
        }
        agreed += 1;
      } else if (result.status === 'solvable') {
        expect(result.witness.ticks).toBeGreaterThan(16);
      }
    }
    expect(agreed).toBeGreaterThan(25);
  });
});
