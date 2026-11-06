import { describe, expect, test } from 'vitest';
import {
  createHazardTimeline,
  findWitnessRoute,
  parseWitness,
  serializeWitness,
  verifyWitness,
  type HazardSpec,
  type HazardWitness
} from '../../../src/mazer-core/hazards';
import { asciiFixture, timelineFor } from './fixtures';

const solve = (
  fixture: ReturnType<typeof asciiFixture>,
  extra: readonly HazardSpec[] = [],
  options: { startTick?: number; invulnerableTurns?: number; maxTicks?: number } = {}
) => {
  const timeline = timelineFor(fixture, extra);
  return { timeline, result: findWitnessRoute(fixture.graph, timeline, { start: fixture.start, goal: fixture.goal, ...options }) };
};

const expectWitness = (outcome: ReturnType<typeof solve>, fixture: ReturnType<typeof asciiFixture>): HazardWitness => {
  if (!outcome.result.solvable) {
    throw new Error(`expected a witness, got ${outcome.result.reason}`);
  }
  expect(verifyWitness(fixture.graph, outcome.timeline, outcome.result.witness)).toEqual({
    valid: true,
    failedAction: null,
    reason: null
  });
  return outcome.result.witness;
};

describe('golden witnesses', () => {
  test('open corridor: straight walk, no waits', () => {
    const f = asciiFixture([
      '#######',
      '#S...G#',
      '#######'
    ]);
    const witness = expectWitness(solve(f), f);
    expect(witness.ticks).toBe(4);
    expect(witness.waits).toBe(0);
    expect(witness.actions).toEqual(['right', 'right', 'right', 'right']);
    expect(witness.cells).toEqual([1, 2, 3, 4, 5].map((x) => f.at(x, 1)));
    expect(witness.period).toBe(1);
  });

  test('start equals goal needs zero actions', () => {
    const f = asciiFixture([
      '###',
      '#S#',
      '###'
    ]);
    const witness = expectWitness(solve({ ...f, goal: f.start }), { ...f, goal: f.start });
    expect(witness.ticks).toBe(0);
    expect(witness.cells).toEqual([f.start]);
  });

  test('blocker on the short route forces the detour', () => {
    const f = asciiFixture([
      '#########',
      '#S.X...G#',
      '#.#####.#',
      '#.......#',
      '#########'
    ]);
    const witness = expectWitness(solve(f), f);
    expect(witness.ticks).toBe(10);
    expect(witness.actions).toEqual([
      'down', 'down', 'right', 'right', 'right', 'right', 'right', 'right', 'up', 'up'
    ]);
    expect(witness.cells[0]).toBe(f.at(1, 1));
    expect(witness.cells[2]).toBe(f.at(1, 3));
    expect(witness.cells.at(-1)).toBe(f.at(7, 1));
  });

  test('timed gate next to a dead-end start requires a wait for the arrival tick to be open', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '#########'
    ]);
    // The gate on x=2 is open only when the ARRIVAL tick is 2 mod 4.
    const gate: HazardSpec = { kind: 'timedGate', cell: f.at(2, 1), period: 4, openFrom: 2, openFor: 1 };
    const witness = expectWitness(solve(f, [gate]), f);
    expect(witness.period).toBe(4);
    expect(witness.actions).toEqual(['wait', 'right', 'right', 'right', 'right', 'right', 'right']);
    expect(witness).toMatchObject({ ticks: 7, waits: 1 });
    expect(witness.cells[2]).toBe(f.at(2, 1));
  });

  test('tie-break order puts WAIT last: an equal-length shuffle beats waiting in place', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '#########'
    ]);
    // Open only when the arrival tick is 0 mod 4: reaching x=3 takes 4 ticks either way.
    const gate: HazardSpec = { kind: 'timedGate', cell: f.at(3, 1), period: 4, openFrom: 0, openFor: 1 };
    const witness = expectWitness(solve(f, [gate]), f);
    expect(witness.ticks).toBe(8);
    expect(witness.actions.slice(0, 4)).toEqual(['right', 'left', 'right', 'right']);
    expect(witness.waits).toBe(0);
    expect(witness.cells[4]).toBe(f.at(3, 1));
  });

  test('patrol on a corridor is dodged through the safe pocket', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '####.####',
      '#########'
    ]);
    const route = [2, 3, 4, 5, 6].map((x) => f.at(x, 1));
    const patrol: HazardSpec = { kind: 'patrol', route, period: 8 };
    const witness = expectWitness(solve(f, [patrol]), f);
    expect(witness.period).toBe(8);
    expect(witness.actions).toEqual([
      'right', 'left', 'right', 'right', 'right', 'down', 'up', 'right', 'right', 'right'
    ]);
    expect(witness.cells[6]).toBe(f.at(4, 2));
    expect(witness.ticks).toBe(10);
  });

  test('the same patrol without a pocket makes the corridor unsolvable', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '#########'
    ]);
    const route = [2, 3, 4, 5, 6].map((x) => f.at(x, 1));
    const { result } = solve(f, [{ kind: 'patrol', route, period: 8 }]);
    expect(result).toMatchObject({ solvable: false, reason: 'no-route' });
  });

  test('wrap edge is a legal one-turn move', () => {
    const f = asciiFixture([
      '######',
      'S###.G',
      '######'
    ]);
    const witness = expectWitness(solve(f), f);
    expect(witness.actions).toEqual(['left']);
    expect(witness.cells).toEqual([f.start, f.goal]);
  });

  test('a head-on swap across a wrap edge counts as contact', () => {
    const f = asciiFixture([
      '######',
      'S###.G',
      '######'
    ]);
    // The patroller shuttles G<->S every tick. Moving left onto G at tick 1 would land
    // on a cell the patroller just left while it lands on S: a swap.
    const patrol: HazardSpec = { kind: 'patrol', route: [f.goal, f.start], period: 2 };
    const { result } = solve(f, [patrol]);
    expect(result).toMatchObject({ solvable: false, reason: 'no-route' });
    // Invulnerability suppresses contact for exactly that window.
    const shielded = solve(f, [patrol], { invulnerableTurns: 1 });
    expect(shielded.result.solvable).toBe(true);
  });

  test('a single-cell patrol is plain occupancy: it blocks a corridor but not a side pocket', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '####.####',
      '#########'
    ]);
    const inCorridor = solve(f, [{ kind: 'patrol', route: [f.at(3, 1)], period: 1 }]);
    expect(inCorridor.result).toMatchObject({ solvable: false, reason: 'no-route' });
    const inPocket = solve(f, [{ kind: 'patrol', route: [f.at(4, 2)], period: 1 }]);
    expect(expectWitness(inPocket, f).ticks).toBe(6);
  });
});

describe('unsolvable and degenerate cases', () => {
  const corridor = () => asciiFixture([
    '#########',
    '#S.....G#',
    '#########'
  ]);

  test('a blocker that seals the corridor', () => {
    const f = asciiFixture([
      '#########',
      '#S..X..G#',
      '#########'
    ]);
    expect(solve(f).result).toMatchObject({ solvable: false, reason: 'no-route' });
  });

  test('a permanently closed gate', () => {
    const f = corridor();
    const closed: HazardSpec = { kind: 'timedGate', cell: f.at(4, 1), period: 3, openFrom: 0, openFor: 0 };
    expect(solve(f, [closed]).result).toMatchObject({ solvable: false, reason: 'no-route' });
  });

  test('start blocked or start in contact at the first tick', () => {
    const f = corridor();
    const closedAtStart: HazardSpec = { kind: 'timedGate', cell: f.start, period: 3, openFrom: 1, openFor: 1 };
    expect(solve(f, [closedAtStart]).result).toMatchObject({ solvable: false, reason: 'start-blocked' });
    const onStart: HazardSpec = { kind: 'patrol', route: [f.start, f.at(2, 1)], period: 2 };
    expect(solve(f, [onStart]).result).toMatchObject({ solvable: false, reason: 'start-contact' });
    expect(solve(f, [onStart], { invulnerableTurns: 1 }).result.solvable).toBe(true);
  });

  test('wall endpoints are invalid', () => {
    const f = corridor();
    const timeline = timelineFor(f);
    expect(findWitnessRoute(f.graph, timeline, { start: 0, goal: f.goal })).toMatchObject({
      solvable: false,
      reason: 'invalid-endpoint'
    });
  });

  test('maxTicks truncates the search and reports it distinctly', () => {
    const f = corridor();
    expect(solve(f, [], { maxTicks: 3 }).result).toMatchObject({ solvable: false, reason: 'max-ticks-exceeded' });
    expect(solve(f, [], { maxTicks: 6 }).result.solvable).toBe(true);
  });
});

describe('determinism and persistence', () => {
  test('repeated solves serialize to identical bytes and round-trip', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '####.####',
      '#########'
    ]);
    const specs: HazardSpec[] = [
      { kind: 'patrol', route: [2, 3, 4, 5, 6].map((x) => f.at(x, 1)), period: 8 },
      { kind: 'timedGate', cell: f.at(4, 2), period: 3, openFrom: 0, openFor: 2 }
    ];
    const first = solve(f, specs);
    const second = solve(f, specs);
    if (!first.result.solvable || !second.result.solvable) {
      throw new Error('fixture should be solvable');
    }
    const a = serializeWitness(first.result.witness);
    const b = serializeWitness(second.result.witness);
    expect(a).toBe(b);
    expect(a).not.toContain(' ');
    expect(Object.keys(JSON.parse(a))).toEqual([...Object.keys(JSON.parse(a))].sort());
    const parsed = parseWitness(a);
    expect(verifyWitness(f.graph, first.timeline, parsed).valid).toBe(true);
    expect(serializeWitness(parsed)).toBe(a);
  });

  test('verifyWitness rejects tampered witnesses', () => {
    const f = asciiFixture([
      '#########',
      '#S.....G#',
      '#########'
    ]);
    const gate: HazardSpec = { kind: 'timedGate', cell: f.at(2, 1), period: 4, openFrom: 2, openFor: 1 };
    const outcome = solve(f, [gate]);
    const witness = expectWitness(outcome, f);
    // Dropping the wait makes the gate step land on tick 1, when the gate is closed.
    const noWait: HazardWitness = {
      ...witness,
      actions: witness.actions.slice(1),
      cells: [witness.cells[0]!, ...witness.cells.slice(2)],
      ticks: witness.ticks - 1,
      waits: 0
    };
    expect(verifyWitness(f.graph, outcome.timeline, noWait)).toMatchObject({ valid: false, reason: 'blocked' });
    expect(verifyWitness(f.graph, outcome.timeline, { ...witness, goal: f.at(5, 1) }).valid).toBe(false);
    expect(verifyWitness(f.graph, outcome.timeline, { ...witness, width: 3 })).toMatchObject({ reason: 'dimension-mismatch' });
    expect(() => parseWitness('{"contract":"x"}')).toThrow(TypeError);
    expect(createHazardTimeline(f.graph, []).period).toBe(1);
  });

  test('tie-break prefers up, left, down, right, wait', () => {
    // Two equal-length routes around a 2x2 room: expect the one starting with "up"/"left" order.
    const f = asciiFixture([
      '#####',
      '#S..#',
      '#..G#',
      '#####'
    ]);
    const witness = expectWitness(solve(f), f);
    expect(witness.ticks).toBe(3);
    // First discovered shortest path: down is explored before right, but up/left are walls;
    // BFS discovers (1,2) via 'down' first and (2,1) via 'right' second, so the goal's parent
    // is the earlier-discovered (2,2) via the 'down' branch.
    expect(witness.actions).toEqual(['down', 'right', 'right']);
  });
});
