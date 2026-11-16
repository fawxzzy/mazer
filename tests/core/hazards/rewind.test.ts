import { describe, expect, test } from 'vitest';
import {
  PLAY_INVULNERABLE_TICKS,
  REWIND_JUNCTION_TRIES,
  createHazardTimeline,
  createRewindPlanner,
  findWitnessRoute,
  shuttlePeriod,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture, createTestRng } from './fixtures';

// Junctions: S (1,2), A (3,2) and B (5,2) each have 3+ neighbours; C (7,2) has 2.
const comb = asciiFixture([
  '###########',
  '#.#.#.#####',
  '#S.A.B.C.G#',
  '#.#.#.#####',
  '###########'
]);
const S = comb.at(1, 2);
const A = comb.at(3, 2);
const B = comb.at(5, 2);
const C = comb.at(7, 2);
const row = (from: number, to: number): number[] => {
  const cells: number[] = [];
  for (let x = from; x <= to; x += 1) cells.push(comb.at(x, 2));
  return cells;
};
const shut = (cell: number): HazardSpec => ({ kind: 'timedGate', cell, period: 1, openFrom: 0, openFor: 0 });

describe('trail rewind: last junction, previous junction, start', () => {
  test('fixture junctions are what the rule needs', () => {
    expect([S, A, B].every((cell) => comb.graph.isJunction(cell))).toBe(true);
    expect(comb.graph.isJunction(C)).toBe(false);
  });

  test('rewinds to the last junction strictly behind the contact cell and retracts the rest', () => {
    const planner = createRewindPlanner(comb.graph, createHazardTimeline(comb.graph, []), { start: comb.start, goal: comb.goal });
    const trail = row(1, 7); // S . A . B . C, contact on C
    const plan = planner.planRewind(trail, trail.length, 9);
    expect(plan.outcome).toBe('junction');
    expect(plan.cell).toBe(B);
    expect(plan.trailIndex).toBe(4);
    expect(plan.retractedCells).toBe(2);
    expect(plan.tick).toBe(9);
    expect(plan.invulnerableTicks).toBe(PLAY_INVULNERABLE_TICKS);
    expect(plan.routeTicks).toBe(4);
    expect(plan.junctionsChecked).toBe(1);
  });

  test('a contact ON a junction rewinds to the junction before it, never in place', () => {
    const planner = createRewindPlanner(comb.graph, createHazardTimeline(comb.graph, []), { start: comb.start, goal: comb.goal });
    const trail = row(1, 5); // contact on B
    expect(planner.planRewind(trail, trail.length, 0).cell).toBe(A);
    // A loop back onto the contact junction is skipped too.
    const loop = [S, comb.at(2, 2), A, comb.at(3, 1), A, comb.at(4, 2), B];
    const plan = planner.planRewind(loop, loop.length, 0);
    expect(plan.cell).toBe(A);
    expect(plan.trailIndex).toBe(4);
  });

  test('when the last junction has no route it tries the previous junction', () => {
    // The goal sits on the stub above A, so A still has a route when B is shut.
    const fixture = asciiFixture([
      '###########',
      '#.#G#.#####',
      '#S...B...##',
      '#.#.#.#####',
      '###########'
    ]);
    const a = fixture.at(3, 2);
    const b = fixture.at(5, 2);
    const timeline = createHazardTimeline(fixture.graph, [shut(b)]);
    const planner = createRewindPlanner(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal });
    const trail = [fixture.start, fixture.at(2, 2), a, fixture.at(4, 2), b, fixture.at(6, 2)];
    const plan = planner.planRewind(trail, trail.length, 3);
    expect(plan.outcome).toBe('previous-junction');
    expect(plan.cell).toBe(a);
    expect(plan.trailIndex).toBe(2);
    expect(plan.routeTicks).toBe(1);
    expect(plan.junctionsChecked).toBe(2);
  });

  test(`after ${REWIND_JUNCTION_TRIES} failed junctions it goes to the validated start`, () => {
    // Gates shut on the two trail junctions j1 and j2 (the junction at (1, 2) is
    // never tried: the chain stops after two). The start reaches the goal below.
    const fixture = asciiFixture([
      '#########',
      '#.#.#.#.#',
      '#.......#',
      '#.#.#.#.#',
      '#S#######',
      '#.......#',
      '#######G#',
      '#########'
    ]);
    const j1 = fixture.at(3, 2);
    const j2 = fixture.at(5, 2);
    const timeline = createHazardTimeline(fixture.graph, [shut(j1), shut(j2)]);
    const planner = createRewindPlanner(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal });
    const trail = [fixture.start, fixture.at(1, 3), fixture.at(1, 2), fixture.at(2, 2), j1, fixture.at(4, 2), j2, fixture.at(6, 2)];
    const plan = planner.planRewind(trail, trail.length, 0);
    expect(plan.outcome).toBe('start');
    expect(plan.cell).toBe(fixture.start);
    expect(plan.trailIndex).toBe(0);
    expect(plan.retractedCells).toBe(trail.length - 1);
    expect(plan.junctionsChecked).toBe(2);
    // A trail that does not begin at the start asks the caller to reset it.
    const partial = trail.slice(3);
    expect(planner.planRewind(partial, partial.length, 0).trailIndex).toBe(-1);
    expect(planner.planRewind(partial, partial.length, 0).retractedCells).toBe(partial.length);
  });

  test('start rescue: when the start has no route at this tick, invulnerability is extended until it does', () => {
    // x S g . G : a Sentry shuttles x <-> S (on S at even ticks); the gate g next
    // to the start opens only at ticks = 0 mod 12. From S with 4 ticks the player
    // cannot reach the opening at ticks 0..6; the shortest rescue from tick 0 is 10 immune waits (the
    // tenth arrival is still immune; from (S, 10, k = 0) wait once, then go at 12).
    const fixture = asciiFixture(['#######', '#.S..G#', '#######']);
    const x = fixture.at(1, 1);
    const g = fixture.at(3, 1);
    const specs: HazardSpec[] = [
      { kind: 'patrol', route: [fixture.start, x], period: shuttlePeriod(2) },
      { kind: 'timedGate', cell: g, period: 12, openFrom: 0, openFor: 1 }
    ];
    const timeline = createHazardTimeline(fixture.graph, specs);
    const planner = createRewindPlanner(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal });
    expect(planner.canAlwaysRescue).toBe(true);
    const trail = [fixture.start];
    for (let tick = 0; tick < 24; tick += 1) {
      const plan = planner.planRewind(trail, 1, tick);
      expect(plan.outcome === 'start' || plan.outcome === 'start-rescue').toBe(true);
      const result = findWitnessRoute(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal, startTick: tick, invulnerableTurns: plan.invulnerableTicks });
      expect(result.solvable, `tick ${tick}`).toBe(true);
      if (plan.outcome === 'start') {
        expect(plan.invulnerableTicks).toBe(PLAY_INVULNERABLE_TICKS);
        expect(result.solvable && result.witness.ticks).toBe(plan.routeTicks);
      } else {
        expect(plan.invulnerableTicks).toBeGreaterThan(PLAY_INVULNERABLE_TICKS);
        expect(findWitnessRoute(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal, startTick: tick, invulnerableTurns: PLAY_INVULNERABLE_TICKS }).solvable).toBe(false);
        expect(result.solvable && result.witness.ticks).toBeLessThanOrEqual(plan.routeTicks);
        // The extension is the smallest one that works.
        expect(findWitnessRoute(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal, startTick: tick, invulnerableTurns: plan.invulnerableTicks - 1 }).solvable).toBe(false);
      }
    }
    expect(planner.planRewind(trail, 1, 0)).toMatchObject({ outcome: 'start-rescue', invulnerableTicks: 10 });
  });

  test('stranded only on a level the overlay never ships (start sealed in), and it says so up front', () => {
    const fixture = asciiFixture(['#######', '#.S..G#', '#######']);
    const timeline = createHazardTimeline(fixture.graph, [shut(fixture.at(3, 1))]);
    const planner = createRewindPlanner(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal });
    expect(planner.canAlwaysRescue).toBe(false);
    expect(planner.planRewind([fixture.start], 1, 0)).toMatchObject({ outcome: 'stranded', routeTicks: -1 });
  });

  test('hot path: the plan is one reused object; bad input throws', () => {
    const planner = createRewindPlanner(comb.graph, createHazardTimeline(comb.graph, []), { start: comb.start, goal: comb.goal });
    const trail = row(1, 7);
    expect(planner.planRewind(trail, trail.length, 0)).toBe(planner.planRewind(trail, 3, 1));
    expect(() => planner.planRewind(trail, trail.length + 1, 0)).toThrow(RangeError);
    expect(() => planner.planRewind(trail, 2, 0.5)).toThrow(RangeError);
    expect(() => planner.distanceFrom(S, 0, PLAY_INVULNERABLE_TICKS + 1)).toThrow(RangeError);
    expect(() => createRewindPlanner(comb.graph, createHazardTimeline(comb.graph, []), { start: 0, goal: comb.goal })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Exactness: distanceFrom equals findWitnessRoute (solvability AND witness length)
// ---------------------------------------------------------------------------

const randomSpecs = (graph: HazardGraph, rng: () => number, avoid: readonly number[]): HazardSpec[] => {
  const floor: number[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isWalkable(cell) && !avoid.includes(cell)) floor.push(cell);
  }
  const pick = (): number => floor[Math.floor(rng() * floor.length)]!;
  const specs: HazardSpec[] = [];
  const gates = new Set<number>();
  for (let i = 0; i < Math.floor(rng() * 3); i += 1) {
    const cell = pick();
    if (gates.has(cell)) continue;
    gates.add(cell);
    const period = 2 + Math.floor(rng() * 3);
    specs.push({ kind: 'timedGate', cell, period, openFrom: Math.floor(rng() * period), openFor: 1 + Math.floor(rng() * (period - 1)) });
  }
  for (let i = 0; i < 1 + Math.floor(rng() * 4); i += 1) {
    const route = [pick()];
    while (route.length < 2 + Math.floor(rng() * 3)) {
      const options = graph.neighbors(route[route.length - 1]!).filter((cell) => !route.includes(cell));
      if (options.length === 0) break;
      route.push(options[Math.floor(rng() * options.length)]!);
    }
    specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase: Math.floor(rng() * 4) });
  }
  return specs;
};

describe('runtime rewind check is exact', () => {
  test('distanceFrom equals findWitnessRoute on every sampled state of random wrapped mazes (k = 0..4)', () => {
    const rng = createTestRng(20261115);
    let compared = 0;
    let unsolvable = 0;
    for (let scenario = 0; scenario < 24; scenario += 1) {
      const maze = createLegacyMaze(11, 11, 900 + scenario, undefined, {
        requiredOppositeBorderConnections: { horizontal: true, vertical: true }
      });
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      let timeline;
      try {
        timeline = createHazardTimeline(graph, randomSpecs(graph, rng, [start, goal]));
      } catch {
        continue;
      }
      const planner = createRewindPlanner(graph, timeline, { start, goal });
      const floor: number[] = [];
      for (let cell = 0; cell < graph.cellCount; cell += 1) if (graph.isWalkable(cell)) floor.push(cell);
      for (let sample = 0; sample < 40; sample += 1) {
        const cell = floor[Math.floor(rng() * floor.length)]!;
        const tick = Math.floor(rng() * 3 * timeline.period);
        for (let k = 0; k <= PLAY_INVULNERABLE_TICKS; k += 1) {
          const oracle = findWitnessRoute(graph, timeline, { start: cell, goal, startTick: tick, invulnerableTurns: k });
          const expected = oracle.solvable ? oracle.witness.ticks : -1;
          expect(planner.distanceFrom(cell, tick, k), `scenario ${scenario} cell ${cell} tick ${tick} k ${k}`).toBe(expected);
          compared += 1;
          if (expected < 0) unsolvable += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(3000);
    expect(unsolvable).toBeGreaterThan(50);
  });
});
