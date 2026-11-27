// Slice H8: shard solver, locked star, placement and the tail route target.
// Route lengths and solvability are re-measured with tests/core/hazards/shardOracle.ts
// (coordinates, production movement, absolute-time layers carrying the shard index).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  HAZARD_SHARD_GROWTH_LEVELS,
  SHARD_ROUTE_BASE,
  SHARD_ROUTE_STEP,
  SHARD_ROUTE_BAND,
  advanceShardProgress,
  allocateHazardUnits,
  computeShardLayer,
  createHazardTimeline,
  createShardSolvableQuery,
  findShardInputProblem,
  findShardWitness,
  isStarUnlocked,
  measureFinalShardTicks,
  measureShardTour,
  placeShards,
  resolveShardEligibleCells,
  resolveShardRoutePlan,
  resolveShardRouteTarget,
  resolveShardRouteBand,
  shuttlePeriod,
  validateShardRoute,
  verifyShardWitness,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture, createTestRng } from './fixtures';
import type { OracleHazards, OraclePoint } from './oracle';
import { oracleShardSolve } from './shardOracle';

const NO_HAZARDS: OracleHazards = { blockers: [], gates: [], patrols: [] };
const pt = (graph: HazardGraph, cell: HazardCellId): OraclePoint => ({ x: graph.cellX(cell), y: graph.cellY(cell) });

describe('locked star and ordered shards (fixtures)', () => {
  test('the star is plain floor until every shard is collected', () => {
    const fx = asciiFixture([
      '#########',
      '#S..G..A#',
      '#########'
    ]);
    const shard = fx.at(7, 1);
    const timeline = createHazardTimeline(fx.graph, []);
    const plain = findShardWitness(fx.graph, timeline, { start: fx.start, goal: fx.goal, shards: [] });
    expect(plain.solvable && plain.witness.ticks).toBe(3);
    const locked = findShardWitness(fx.graph, timeline, { start: fx.start, goal: fx.goal, shards: [shard] });
    if (!locked.solvable) throw new Error('expected a route');
    // Crosses the locked star on the way out, then comes back.
    expect(locked.witness.ticks).toBe(9);
    expect(locked.witness.cells.indexOf(fx.goal)).toBe(3);
    expect(locked.witness.shardIndices).toEqual([6]);
    expect(verifyShardWitness(fx.graph, timeline, locked.witness)).toEqual({ valid: true, failedAction: null, reason: null });
    const oracle = oracleShardSolve(fx.grid, pt(fx.graph, fx.start), pt(fx.graph, fx.goal), [pt(fx.graph, shard)], NO_HAZARDS);
    expect(oracle).toEqual({ solvable: true, ticks: 9 });
  });

  test('shards count only in order: passing a later shard early does nothing', () => {
    const fx = asciiFixture([
      '###########',
      '#S.N..F..G#',
      '###########'
    ]);
    const near = fx.at(3, 1);
    const far = fx.at(6, 1);
    const timeline = createHazardTimeline(fx.graph, []);
    const ordered = findShardWitness(fx.graph, timeline, { start: fx.start, goal: fx.goal, shards: [near, far] });
    const reversed = findShardWitness(fx.graph, timeline, { start: fx.start, goal: fx.goal, shards: [far, near] });
    expect(ordered.solvable && ordered.witness.ticks).toBe(8);
    expect(reversed.solvable && reversed.witness.ticks).toBe(5 + 3 + 6);
    const oracle = oracleShardSolve(fx.grid, pt(fx.graph, fx.start), pt(fx.graph, fx.goal), [pt(fx.graph, far), pt(fx.graph, near)], NO_HAZARDS);
    expect(oracle.ticks).toBe(14);
    // The in-order route replayed against the reversed order never unlocks the star.
    if (!ordered.solvable) throw new Error('expected a route');
    const forged = { ...ordered.witness, shards: [far, near] };
    expect(verifyShardWitness(fx.graph, timeline, forged).valid).toBe(false);
  });

  test('a gate between the start and the shard costs waits, matching the oracle', () => {
    const fx = asciiFixture([
      '#########',
      '#S.....A#',
      '#.#######',
      '#G......#',
      '#########'
    ]);
    const shard = fx.at(7, 1);
    const gateCell = fx.at(4, 1);
    const specs: HazardSpec[] = [{ kind: 'timedGate', cell: gateCell, period: 6, openFrom: 5, openFor: 1 }];
    const timeline = createHazardTimeline(fx.graph, specs);
    const result = findShardWitness(fx.graph, timeline, { start: fx.start, goal: fx.goal, shards: [shard] });
    const oracle = oracleShardSolve(fx.grid, pt(fx.graph, fx.start), pt(fx.graph, fx.goal), [pt(fx.graph, shard)], {
      blockers: [],
      gates: [{ cell: pt(fx.graph, gateCell), period: 6, openFrom: 5, openFor: 1 }],
      patrols: []
    });
    if (!result.solvable) throw new Error('expected a route');
    expect(result.witness.ticks).toBe(oracle.ticks);
    // Static tour 6 + 8 = 14; the closed gate costs extra ticks (waits or a step back and forth).
    expect(result.witness.ticks).toBeGreaterThan(measureShardTour(fx.graph, fx.start, fx.goal, [shard]));
    expect(measureShardTour(fx.graph, fx.start, fx.goal, [shard])).toBe(14);
    expect(verifyShardWitness(fx.graph, timeline, result.witness).valid).toBe(true);
  });

  test('progress helpers and input checks', () => {
    expect(advanceShardProgress([5, 9], 9, 0)).toBe(0);
    expect(advanceShardProgress([5, 9], 5, 0)).toBe(1);
    expect(advanceShardProgress([5, 9], 9, 1)).toBe(2);
    expect(advanceShardProgress([5, 9], 9, 2)).toBe(2);
    expect(isStarUnlocked(1, 2)).toBe(false);
    expect(isStarUnlocked(2, 2)).toBe(true);
    expect(isStarUnlocked(0, 0)).toBe(true);
    const fx = asciiFixture(['#####', '#S.G#', '#####']);
    expect(findShardInputProblem(fx.graph, [fx.at(2, 1)], fx.start, fx.goal)).toBeNull();
    expect(findShardInputProblem(fx.graph, [fx.at(0, 0)], fx.start, fx.goal)).toBe('shard-not-walkable');
    expect(findShardInputProblem(fx.graph, [fx.at(2, 1), fx.at(2, 1)], fx.start, fx.goal)).toBe('shard-duplicate');
    expect(findShardInputProblem(fx.graph, [fx.start], fx.start, fx.goal)).toBe('shard-on-start');
    expect(findShardInputProblem(fx.graph, [fx.goal], fx.start, fx.goal)).toBe('shard-on-goal');
  });

  test('a shard behind a Sentry rail is never eligible and fails the verdict', () => {
    const fx = asciiFixture([
      '#########',
      '#S.G..AB#',
      '#########'
    ]);
    const rail = [fx.at(4, 1), fx.at(5, 1)];
    const specs: HazardSpec[] = [{ kind: 'patrol', route: rail, period: shuttlePeriod(2) }];
    const eligible = resolveShardEligibleCells(fx.graph, specs, fx.start, fx.goal);
    expect(eligible).toEqual([fx.at(2, 1)]);
    const verdict = validateShardRoute(fx.graph, specs, { start: fx.start, goal: fx.goal, shards: [fx.at(6, 1)] });
    expect(verdict.sentryFreeLegs).toBe(false);
    expect(verdict.pass).toBe(false);
    const fine = validateShardRoute(fx.graph, specs, { start: fx.start, goal: fx.goal, shards: [fx.at(2, 1)] });
    expect(fine.sentryFreeLegs).toBe(true);
    expect(fine.pass).toBe(true);
    expect(fine.postContact.checkedStates).toBe(fine.witness!.ticks - 1);
  });

  test('the product-state cap gives an unknown verdict that fails', () => {
    const fx = asciiFixture(['#######', '#S.A.G#', '#######']);
    const verdict = validateShardRoute(fx.graph, [], { start: fx.start, goal: fx.goal, shards: [fx.at(3, 1)], maxProductStates: 3 });
    expect(verdict.hazardsPresent).toMatchObject({ pass: false, reason: 'state-cap' });
    expect(verdict.pass).toBe(false);
  });
});

// Random scenario on a production maze: gates + Sentries + 1..3 shards, mirrored for the oracle.
const buildScenario = (graph: HazardGraph, rng: () => number, start: number, goal: number) => {
  const cells: number[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) if (graph.isWalkable(cell)) cells.push(cell);
  const pick = (): number => cells[Math.floor(rng() * cells.length)]!;
  const specs: HazardSpec[] = [];
  const oracle: OracleHazards = { blockers: [], gates: [], patrols: [] };
  const taken = new Set<number>([start, goal]);
  for (let i = 0; i < 2; i += 1) {
    const cell = pick();
    if (taken.has(cell)) continue;
    taken.add(cell);
    const period = [2, 3, 4, 6][Math.floor(rng() * 4)]!;
    const openFrom = Math.floor(rng() * period);
    const openFor = 1 + Math.floor(rng() * period);
    specs.push({ kind: 'timedGate', cell, period, openFrom, openFor });
    oracle.gates.push({ cell: pt(graph, cell), period, openFrom, openFor });
  }
  const route = [pick()];
  while (route.length < 4) {
    const options = graph.neighbors(route[route.length - 1]!).filter((cell) => !route.includes(cell));
    if (options.length === 0) break;
    route.push(options[Math.floor(rng() * options.length)]!);
  }
  const phase = Math.floor(rng() * 5);
  specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase });
  oracle.patrols.push({ route: route.map((cell) => pt(graph, cell)), phase });
  const shards: number[] = [];
  const count = 1 + Math.floor(rng() * 3);
  while (shards.length < count) {
    const cell = pick();
    if (!taken.has(cell)) {
      taken.add(cell);
      shards.push(cell);
    }
  }
  return { specs, oracle, shards };
};

describe('the shard solver agrees with the brute-force oracle', () => {
  test('witness ticks, exact solvability and last-shard route ticks on production mazes', () => {
    let cases = 0;
    let solvable = 0;
    let queries = 0;
    let finals = 0;
    const profiles = [
      { label: 'corridor', profile: { straightnessBias: 0.95, maxDeadEndCount: 0, checkpointCountOverride: 1 } },
      { label: 'starter', profile: null },
      { label: 'wrap', profile: { requiredOppositeBorderConnections: { horizontal: true, vertical: true } } }
    ];
    for (const { label, profile } of profiles) {
      for (const seed of [3, 91, 2026]) {
        const maze = createLegacyMaze(21, 21, seed, undefined, profile);
        const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
        const rng = createTestRng(seed * 7 + label.length);
        for (let trial = 0; trial < 2; trial += 1) {
          const { specs, oracle, shards } = buildScenario(graph, rng, start, goal);
          const timeline = createHazardTimeline(graph, specs);
          const tag = `${label}:${seed}:${trial}`;
          const result = findShardWitness(graph, timeline, { start, goal, shards });
          const expected = oracleShardSolve(maze.grid, pt(graph, start), pt(graph, goal), shards.map((cell) => pt(graph, cell)), oracle);
          cases += 1;
          expect({ tag, solvable: result.solvable }).toEqual({ tag, solvable: expected.solvable });
          if (result.solvable) {
            solvable += 1;
            expect({ tag, ticks: result.witness.ticks }).toEqual({ tag, ticks: expected.ticks });
            expect(verifyShardWitness(graph, timeline, result.witness).valid).toBe(true);
          }
          const query = createShardSolvableQuery(graph, timeline, { goal, shards });
          for (let sample = 0; sample < 4; sample += 1) {
            const cell = shards[sample % shards.length]! === goal ? start : [start, ...shards][sample % (shards.length + 1)]!;
            const tickMod = Math.floor(rng() * timeline.period);
            const invulnerable = sample % 3;
            const next = Math.floor(rng() * (shards.length + 1));
            if (timeline.blockedAt(cell, tickMod)) continue;
            if (invulnerable === 0 && timeline.enemyCellsAt(tickMod).includes(cell)) continue;
            const want = oracleShardSolve(maze.grid, pt(graph, cell), pt(graph, goal), shards.map((c) => pt(graph, c)), oracle, {
              startTick: tickMod,
              invulnerableTurns: invulnerable,
              startNext: next
            });
            queries += 1;
            expect({ tag, cell, tickMod, invulnerable, next, solvable: query.isSolvable(cell, tickMod, invulnerable, next) })
              .toEqual({ tag, cell, tickMod, invulnerable, next, solvable: want.solvable });
          }
          const prefix = shards.slice(0, -1);
          const routes = measureFinalShardTicks(graph, timeline, { start, goal, prefix });
          const candidates = [shards[shards.length - 1]!, ...Array.from({ length: 2 }, () => Math.floor(rng() * graph.cellCount))]
            .filter((cell) => graph.isWalkable(cell) && cell !== start && cell !== goal && !prefix.includes(cell));
          for (const cell of candidates) {
            const want = oracleShardSolve(maze.grid, pt(graph, start), pt(graph, goal), [...prefix, cell].map((c) => pt(graph, c)), oracle);
            finals += 1;
            expect({ tag, cell, ticks: routes[cell] }).toEqual({ tag, cell, ticks: want.solvable ? want.ticks : -1 });
          }
        }
      }
    }
    expect(cases).toBe(18);
    expect(solvable).toBeGreaterThan(5);
    expect(queries).toBeGreaterThan(30);
    expect(finals).toBeGreaterThan(18);
  });
});

describe('placement', () => {
  const maze = createLegacyMaze(31, 31, 4242, undefined, null);
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  const base = measureShardTour(graph, start, goal, []);

  test('deterministic, lands the static tour in the band, avoids start and goal', () => {
    const options = { start, goal, count: 3, min: base + 40, max: base + 41, seed: 99 };
    const first = placeShards(graph, options);
    const again = placeShards(graph, options);
    expect(again).toEqual(first);
    if (!first.placed) throw new Error(`expected placement, got ${first.reason}`);
    expect(first.shards).toHaveLength(3);
    expect(new Set(first.shards).size).toBe(3);
    expect(first.shards).not.toContain(start);
    expect(first.shards).not.toContain(goal);
    expect(first.tour).toBe(measureShardTour(graph, start, goal, first.shards));
    expect(first.tour).toBeGreaterThanOrEqual(base + 40);
    expect(first.tour).toBeLessThanOrEqual(base + 41);
    const other = placeShards(graph, { ...options, seed: 100 });
    expect(other.placed).toBe(true);
  });

  test('an unreachable band fails strictly and degrades to the closest route when not strict', () => {
    const strict = placeShards(graph, { start, goal, count: 1, min: 10_000, max: 10_001, seed: 1 });
    expect(strict).toMatchObject({ placed: false, reason: 'band-missed' });
    const loose = placeShards(graph, { start, goal, count: 1, min: 10_000, max: 10_001, seed: 1, strict: false });
    expect(loose).toMatchObject({ placed: true, inBand: false });
  });

  test('the strict band is anchored at the maze start -> star distance (a detour target, any board size)', () => {
    const plan = resolveShardRoutePlan(300, { saturationLevel: 288 });
    const target = SHARD_ROUTE_BASE + (SHARD_ROUTE_STEP * 12);
    expect(plan.target).toBe(target);
    // A 59x131 play board's own route (~560 ticks) is far above the bare target: the band sits above it.
    expect(resolveShardRouteBand(plan, 560)).toEqual({ min: 560 + target, max: 560 + target + SHARD_ROUTE_BAND });
    const layer = computeShardLayer(graph, { start, goal, mazeSeed: 4242, level: 300, saturationLevel: 288, specs: [] });
    expect(layer.band).toEqual({ min: base + target, max: base + target + SHARD_ROUTE_BAND });
  });

  test('a strict miss is failed by default; onStrictMiss nearest ships the nearest verified route', () => {
    // L288 on a 31x31 maze: a 160-tick detour is more than its deepest branch adds, so no attempt can hit the band.
    const options = { start, goal, mazeSeed: 4242, level: 288, saturationLevel: 288, specs: [] as HazardSpec[] };
    const strict = computeShardLayer(graph, options);
    expect(strict).toMatchObject({ status: 'failed', inBand: false, shards: [], routeTicks: null, digest: '' });
    const nearest = computeShardLayer(graph, { ...options, onStrictMiss: 'nearest' });
    expect(nearest).toMatchObject({ status: 'placed', inBand: false });
    expect(nearest.shards).toHaveLength(1);
    expect(nearest.verdict?.pass).toBe(true);
    expect(nearest.routeTicks).toBe(nearest.verdict?.witness?.ticks);
    expect(nearest.routeTicks!).toBeLessThan(nearest.band!.min);
    expect(nearest.rejections[0]).toBe(strict.rejections[0]);
    expect(computeShardLayer(graph, { ...options, onStrictMiss: 'nearest' })).toEqual(nearest);
  });

  test('a strict hit lands in the band whether or not the fallback is allowed', () => {
    const big = createLegacyMaze(61, 61, 7, undefined, null);
    const read = createLegacyMazeHazardGraph(big);
    const options = { start: read.start, goal: read.goal, mazeSeed: 7, level: 288, saturationLevel: 288, specs: [] as HazardSpec[] };
    const strict = computeShardLayer(read.graph, options);
    expect(strict).toMatchObject({ status: 'placed', inBand: true });
    expect(strict.routeTicks!).toBeGreaterThanOrEqual(strict.band!.min);
    expect(strict.routeTicks!).toBeLessThanOrEqual(strict.band!.max);
    expect(computeShardLayer(read.graph, { ...options, onStrictMiss: 'nearest' })).toEqual(strict);
  });
});

describe('tail route-target schedule', () => {
  test('count equals the allocator; target is null before saturation', () => {
    for (const saturationLevel of [288, 368, 420]) {
      for (let level = 1; level <= 3000; level += 7) {
        const plan = resolveShardRoutePlan(level, { saturationLevel });
        expect(plan.count).toBe(allocateHazardUnits(level, { saturationLevel }).shards);
        expect(plan.strict).toBe(level >= saturationLevel);
        expect(plan.target === null).toBe(level < saturationLevel);
      }
    }
    expect(resolveShardRoutePlan(60, { saturationLevel: 288 }).count).toBe(1);
    expect(resolveShardRoutePlan(59, { saturationLevel: 288 }).count).toBe(0);
  });

  test('strict per-level rise with disjoint bands from saturation to L2000', () => {
    expect(SHARD_ROUTE_BAND).toBeLessThan(SHARD_ROUTE_STEP);
    for (const saturationLevel of [288, 368, 420]) {
      expect(resolveShardRouteTarget(saturationLevel, saturationLevel)).toBe(SHARD_ROUTE_BASE);
      let previousMax = -1;
      let previousCount = 0;
      for (let level = saturationLevel; level <= 2000; level += 1) {
        const plan = resolveShardRoutePlan(level, { saturationLevel });
        const band = resolveShardRouteBand(plan, 0);
        expect(band.min).toBeGreaterThan(previousMax);
        expect(band.min).toBeGreaterThanOrEqual(previousMax + 1);
        expect(plan.count).toBeGreaterThanOrEqual(previousCount);
        previousMax = band.max;
        previousCount = plan.count;
      }
      const tail = resolveShardRoutePlan(2000, { saturationLevel });
      expect(tail.count).toBe(1 + Math.floor((2000 - saturationLevel) / HAZARD_SHARD_GROWTH_LEVELS));
    }
  });
});

describe('shard modules are reached only through the H8 run state', () => {
  test('outside src/mazer-core/hazards only legacyShardRun.ts (H8 shards UI v1, flag-gated) references the shard placement', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (path.replace(/\\/g, '/').endsWith('src/mazer-core/hazards')) continue;
          walk(path);
        } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
          const text = readFileSync(path, 'utf8');
          if (/hazards\/(shards|shardSolvability)['"]|computeShardLayer|validateShardRoute/.test(text)) offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders.map((path) => path.split(/[\\/]/).pop())).toEqual(['legacyShardRun.ts']);
  });
});
