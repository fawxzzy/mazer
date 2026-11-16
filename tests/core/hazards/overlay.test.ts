import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  checkHazardFairness,
  computeHazardOverlay,
  computeSolvableStates,
  createHazardStateSpace,
  createHazardTimeline,
  createSolvableQuery,
  findWitnessRoute,
  measureEscapeSlack,
  placeLevelHazards,
  resolveHazardSeed,
  shuttlePeriod,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture, createTestRng } from './fixtures';

const walkableCells = (graph: HazardGraph): number[] => {
  const cells: number[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isWalkable(cell)) cells.push(cell);
  }
  return cells;
};

const randomTimelineSpecs = (graph: HazardGraph, rng: () => number, start: number, goal: number): HazardSpec[] => {
  const cells = walkableCells(graph).filter((cell) => cell !== start && cell !== goal);
  const pick = (): number => cells[Math.floor(rng() * cells.length)]!;
  const specs: HazardSpec[] = [];
  const used = new Set<number>();
  for (let i = 0; i < 1 + Math.floor(rng() * 3); i += 1) {
    const cell = pick();
    if (used.has(cell)) continue;
    used.add(cell);
    const period = [2, 3, 4][Math.floor(rng() * 3)]!;
    specs.push({ kind: 'timedGate', cell, period, openFrom: Math.floor(rng() * period), openFor: 1 + Math.floor(rng() * (period - 1)) });
  }
  for (let i = 0; i < 1 + Math.floor(rng() * 2); i += 1) {
    const route = [pick()];
    while (route.length < 2 + Math.floor(rng() * 3)) {
      const options = graph.neighbors(route[route.length - 1]!).filter((cell) => !route.includes(cell) && !used.has(cell));
      if (options.length === 0) break;
      route.push(options[Math.floor(rng() * options.length)]!);
    }
    if (route.some((cell) => used.has(cell))) continue;
    specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase: Math.floor(rng() * 4) });
  }
  return specs;
};

/** Own BFS on the static graph: does removing `removed` disconnect start from goal? */
const disconnects = (graph: HazardGraph, start: number, goal: number, removed: number): boolean => {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell === goal) return false;
    for (const next of graph.neighbors(cell)) {
      if (next !== removed && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return true;
};

describe('layered solvable query', () => {
  test('answers exactly like the full reverse-reachability pass for every state', () => {
    let compared = 0;
    let solvedStates = 0;
    const mismatches: string[] = [];
    for (let seed = 1; seed <= 6; seed += 1) {
      const maze = createLegacyMaze(15, 15, seed);
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      const rng = createTestRng(seed * 977);
      for (let trial = 0; trial < 3; trial += 1) {
        const specs = randomTimelineSpecs(graph, rng, start, goal);
        let timeline;
        try {
          timeline = createHazardTimeline(graph, specs);
        } catch {
          continue;
        }
        for (const turns of [0, 2, 4]) {
          const space = createHazardStateSpace(graph, timeline, turns);
          const full = computeSolvableStates(space, goal);
          const query = createSolvableQuery(graph, space, goal);
          for (let tickMod = 0; tickMod < space.period; tickMod += 1) {
            for (const cell of walkableCells(graph)) {
              for (let k = 0; k <= turns; k += 1) {
                const expected = full[space.stateIndex(cell, tickMod, k)] === 1;
                if (query.isSolvable(cell, tickMod, k) !== expected && mismatches.length < 5) {
                  mismatches.push(`seed ${seed} cell ${cell} t${tickMod} k${k}`);
                }
                compared += 1;
                if (expected) solvedStates += 1;
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(10_000);
    // Both answers occur, so the comparison is not vacuous.
    expect(solvedStates).toBeGreaterThan(0);
    expect(solvedStates).toBeLessThan(compared);
  });
});

describe('escape slack for timeline hazards', () => {
  const corridor = asciiFixture([
    '###########',
    '#S.......G#',
    '###########'
  ]);

  test('a hazard-free corridor is fully survivable', () => {
    const timeline = createHazardTimeline(corridor.graph, []);
    const result = findWitnessRoute(corridor.graph, timeline, { start: corridor.start, goal: corridor.goal });
    if (!result.solvable) throw new Error('corridor must be solvable');
    const slack = measureEscapeSlack(corridor.graph, [], result.witness);
    expect(slack).toMatchObject({ tested: result.witness.ticks, survivable: result.witness.ticks, ratio: 1, firstFragileIndex: null });
  });

  test('a Sentry shuttling through a corridor makes hesitation fatal somewhere (no pocket to dodge into)', () => {
    const route = [corridor.at(5, 1), corridor.at(6, 1), corridor.at(7, 1)];
    const specs: HazardSpec[] = [{ kind: 'patrol', route, period: shuttlePeriod(route.length), phase: 0 }];
    const timeline = createHazardTimeline(corridor.graph, specs);
    const result = findWitnessRoute(corridor.graph, timeline, { start: corridor.start, goal: corridor.goal });
    // A shuttle fills a dead corridor: either no contact-free route at all, or a fragile one.
    if (result.solvable) {
      const slack = measureEscapeSlack(corridor.graph, specs, result.witness);
      expect(slack.unsurvivable).toBeGreaterThan(0);
    } else {
      expect(result.reason).toBe('no-route');
    }
  });

  test('a gate closing on a waiting player ejects them one cell back instead of counting as fatal', () => {
    // Gate at x=4 is open on ticks 0..2 of 4 (closed on tick 3).
    const gate: HazardSpec = { kind: 'timedGate', cell: corridor.at(4, 1), period: 4, openFrom: 0, openFor: 3 };
    const timeline = createHazardTimeline(corridor.graph, [gate]);
    const result = findWitnessRoute(corridor.graph, timeline, { start: corridor.start, goal: corridor.goal });
    if (!result.solvable) throw new Error('gate corridor must be solvable');
    const slack = measureEscapeSlack(corridor.graph, [gate], result.witness);
    expect(slack.tested).toBe(result.witness.ticks);
    // Standing in the gate on tick 2 and waiting: closes on tick 3, eject to x=3, still solvable.
    expect(slack.ratio).toBe(1);
  });
});

describe('fairness gate', () => {
  const room = asciiFixture([
    '#########',
    '#S......#',
    '#.#####.#',
    '#.......#',
    '####.####',
    '#......G#',
    '#########'
  ]);

  test('flags a static blocker (A5) and a Sentry on a mandatory cell (A6)', () => {
    const mandatory = room.at(4, 4);
    expect(disconnects(room.graph, room.start, room.goal, mandatory)).toBe(true);
    const route = [room.at(4, 3), mandatory];
    const check = checkHazardFairness(room.graph, [
      { kind: 'blocker', cell: room.at(2, 1) },
      { kind: 'patrol', route, period: shuttlePeriod(route.length), phase: 0 }
    ], { start: room.start, goal: room.goal });
    const codes = check.reasons.map((reason) => reason.code);
    expect(check.pass).toBe(false);
    expect(codes).toContain('blocker-present');
    expect(codes).toContain('patrol-on-chokepoint');
  });

  test('no hazards passes', () => {
    const check = checkHazardFairness(room.graph, [], { start: room.start, goal: room.goal });
    expect(check.pass).toBe(true);
    expect(check.escapeSlack?.ratio).toBe(1);
  });
});

describe('placement A6 option: Sentries avoid mandatory cells', () => {
  test('no patrol route covers a cell whose removal disconnects the goal', () => {
    let patrolsChecked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const maze = createLegacyMaze(25, 25, seed, undefined, { straightnessBias: 0.6 });
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      const result = placeLevelHazards(graph, {
        start,
        goal,
        seed: seed * 7919,
        loadout: { blockers: 0, timedGates: 1, patrols: 3, patrolTier: 1 },
        patrolsAvoidChokepoints: true
      });
      for (const spec of result.specs) {
        if (spec.kind !== 'patrol') continue;
        for (const cell of spec.route) {
          expect(disconnects(graph, start, goal, cell), `seed ${seed} cell ${cell}`).toBe(false);
        }
        patrolsChecked += 1;
      }
      expect(result.verdict.pass).toBe(true);
    }
    expect(patrolsChecked).toBeGreaterThan(5);
  });

  test('the option is off by default: existing placements are unchanged', () => {
    const maze = createLegacyMaze(25, 25, 3);
    const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
    const options = { start, goal, seed: 42, loadout: { blockers: 1, timedGates: 1, patrols: 1 } };
    expect(JSON.stringify(placeLevelHazards(graph, options)))
      .toBe(JSON.stringify(placeLevelHazards(graph, { ...options, patrolsAvoidChokepoints: false })));
  });
});

describe('computeHazardOverlay on a small maze', () => {
  const maze = createLegacyMaze(25, 25, 11);
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  const run = (level: number, exposureStage?: number) => computeHazardOverlay(graph, {
    start, goal, mazeSeed: maze.seed, level, saturationLevel: 288, exposureStage
  });

  test('below level 10 nothing is placed and no validator runs', () => {
    const result = run(9);
    expect(result).toMatchObject({ status: 'none', specs: [], verdict: null, placement: null });
  });

  test('is deterministic and uses its own seed stream', () => {
    expect(JSON.stringify(run(40))).toBe(JSON.stringify(run(40)));
    expect(run(40).seed).toBe(resolveHazardSeed(maze.seed, 40));
    expect(resolveHazardSeed(maze.seed, 40)).not.toBe(maze.seed);
    expect(resolveHazardSeed(maze.seed, 40)).not.toBe(resolveHazardSeed(maze.seed, 41));
  });

  test('never ships a blocker, and every shipped placement passes the fairness gate', () => {
    for (const level of [10, 20, 35, 50, 80, 120]) {
      const result = run(level);
      expect(result.specs.some((spec) => spec.kind === 'blocker')).toBe(false);
      if (result.status === 'full') {
        expect(result.degradeReasons).toEqual([]);
      } else {
        expect(result.degradeReasons.length).toBeGreaterThan(0);
      }
      const check = checkHazardFairness(graph, result.specs, { start, goal });
      expect(check.pass, `L${level}`).toBe(true);
      expect(result.verdict?.pass).toBe(true);
    }
  });

  test('hunters and shards are allocated but deferred to their slices', () => {
    const result = run(60);
    expect(result.deferred).toEqual([
      { unit: 'hunter', count: result.allocation.hunters, slice: 'H5' },
      { unit: 'shard', count: 1, slice: 'H8' }
    ]);
  });
});

describe('overlay source stays pure', () => {
  test('overlay and schedule modules import no runtime, scene or clock', () => {
    for (const name of ['overlay.ts', 'schedule.ts']) {
      const source = readFileSync(new URL(`../../../src/mazer-core/hazards/${name}`, import.meta.url), 'utf8');
      expect(source, name).not.toMatch(/legacy-runtime|scenes|phaser|localStorage|location\.search/i);
      expect(source, name).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
