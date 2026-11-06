import { describe, expect, test } from 'vitest';
import {
  createHazardGraph,
  createHazardTimeline,
  shuttlePeriod,
  type HazardSpec
} from '../../../src/mazer-core/hazards/graphContract';
import { findWitnessRoute } from '../../../src/mazer-core/hazards/solvability';
import { stableStringify } from '../../../src/mazer-core/hazards/serialization';
import {
  createJunctionGreedyEnemy,
  type JunctionGreedyEnemySpec
} from '../../../src/mazer-core/hazards/chaserEngine';
import {
  CHASER_WITNESS_CONTRACT,
  createChaserSearchSpace,
  estimateChaserStateSpace,
  findWitnessRouteWithChasers,
  replayChaserActions,
  verifyChaserWitness,
  type ChaserWitness
} from '../../../src/mazer-core/hazards/chaserSolvability';
import { chaserAt, chaserFixture, type ChaserAsciiFixture } from './chaserFixtures';
import { createTestRng } from './fixtures';

const solve = (
  f: ChaserAsciiFixture,
  specs: readonly JunctionGreedyEnemySpec[],
  options: Partial<Parameters<typeof findWitnessRouteWithChasers>[3]> = {}
) => {
  const timeline = f.timeline();
  const enemies = specs.map((spec) => createJunctionGreedyEnemy(spec, f.graph));
  const result = findWitnessRouteWithChasers(f.graph, timeline, enemies, { start: f.start, goal: f.goal, ...options });
  return { result, timeline, enemies };
};

const expectSolvable = (
  f: ChaserAsciiFixture,
  specs: readonly JunctionGreedyEnemySpec[],
  options: Partial<Parameters<typeof findWitnessRouteWithChasers>[3]> = {}
): ChaserWitness => {
  const { result, timeline, enemies } = solve(f, specs, options);
  expect(result.status).toBe('solvable');
  if (result.status !== 'solvable') {
    throw new Error('unreachable');
  }
  expect(verifyChaserWitness(f.graph, timeline, enemies, result.witness)).toEqual({
    valid: true, failedAction: null, reason: null
  });
  return result.witness;
};

describe('golden fixtures', () => {
  test('open corridor chase: a chaser trailing the player never catches it', () => {
    const f = chaserFixture(['#########', '#C..S..G#', '#########']);
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'chaser')]);
    expect(witness.contract).toBe(CHASER_WITNESS_CONTRACT);
    expect(witness.actions).toEqual(['right', 'right', 'right']);
    expect(witness.waits).toBe(0);
    expect(witness.enemyCells.map((cells) => f.graph.cellX(cells[0]!))).toEqual([1, 2, 3, 4]);
  });

  test('open corridor chase: a chaser in front of the player cannot be passed', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    const { result } = solve(f, [chaserAt(f, 'C', 'chaser')]);
    expect(result).toMatchObject({ status: 'unsolvable', reason: 'no-route' });
  });

  test('safe pocket: a side loop lets the player slip past the chaser', () => {
    const f = chaserFixture([
      '###########',
      '#..#####..#',
      '#.S.C...G.#',
      '#..#####..#',
      '###########'
    ]);
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'chaser')]);
    // The player lures the chaser into the left room, doubles back past it and runs for the goal.
    expect(witness.actions).toEqual(['wait', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']);
    expect(witness.ticks).toBe(9);
    expect(witness.waits).toBe(1);
  });

  test('loop: a chaser can be circled around a ring', () => {
    const f = chaserFixture([
      '#########',
      '#.......#',
      '#.#####.#',
      '#S#####C#',
      '#.#####.#',
      '#...G...#',
      '#########'
    ]);
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'chaser')]);
    expect(witness.actions).toEqual(['wait', 'down', 'down', 'right', 'right', 'right']);
    // The chaser took the other way round the ring and is far from the goal at the end.
    const last = witness.enemyCells[witness.ticks]![0]!;
    expect(f.graph.cellY(last)).toBe(1);
  });

  test('dead-end trap: a spur that ends at the goal with the chaser at its mouth is reported unsolvable', () => {
    const f = chaserFixture([
      '#########',
      '#S..C...#',
      '###.#####',
      '###.#####',
      '###G#####'
    ]);
    // Statically the goal is reachable...
    const static_ = findWitnessRoute(f.graph, createHazardTimeline(f.graph, []), { start: f.start, goal: f.goal });
    expect(static_.solvable).toBe(true);
    // ...but the chaser seals the junction.
    const { result } = solve(f, [chaserAt(f, 'C', 'chaser')]);
    expect(result).toMatchObject({ status: 'unsolvable', reason: 'no-route' });
  });

  test('the target rule changes the outcome on the same board', () => {
    const f = chaserFixture([
      '#######',
      '#..S#.#',
      '###C.##',
      '#.G...#',
      '#######'
    ]);
    expect(solve(f, [chaserAt(f, 'C', 'chaser')]).result).toMatchObject({ status: 'unsolvable' });
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'interceptor')]);
    expect(witness.ticks).toBe(3);
  });

  test('tiering: a spawn delay lets the player run past the spawn cell', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    expect(solve(f, [chaserAt(f, 'C', 'chaser')]).result.status).toBe('unsolvable');
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'chaser', { spawnDelayTurns: 5 })]);
    expect(witness.ticks).toBe(6);
    expect(witness.enemyCells[2]![0]).toBe(-1);
  });

  test('tiering: a slower chaser can be outmanoeuvred where a full-speed one cannot', () => {
    // Full-speed chaser two cells from the player's only exit.
    const f = chaserFixture([
      '#########',
      '#.......#',
      '#S#####.#',
      '#.#####.#',
      '#C.....G#',
      '#########'
    ]);
    const fast = solve(f, [chaserAt(f, 'C', 'chaser')]).result;
    const slow = solve(f, [chaserAt(f, 'C', 'chaser', { speedDivisor: 3 })]).result;
    expect(slow.status).toBe('solvable');
    // A slower chaser can never make the level harder than a faster one.
    if (fast.status === 'solvable' && slow.status === 'solvable') {
      expect(slow.witness.ticks).toBeLessThanOrEqual(fast.witness.ticks);
    }
  });

  test('start and endpoint problems are reported, not thrown', () => {
    const f = chaserFixture(['#####', '#S.G#', '#####']);
    const timeline = f.timeline();
    const onStart = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: f.start }, f.graph);
    expect(findWitnessRouteWithChasers(f.graph, timeline, [onStart], { start: f.start, goal: f.goal }))
      .toMatchObject({ status: 'unsolvable', reason: 'start-contact' });
    expect(findWitnessRouteWithChasers(f.graph, timeline, [], { start: 0, goal: f.goal }))
      .toMatchObject({ status: 'unsolvable', reason: 'invalid-endpoint' });
    const zero = findWitnessRouteWithChasers(f.graph, timeline, [], { start: f.start, goal: f.start });
    expect(zero).toMatchObject({ status: 'solvable' });
    expect(zero.status === 'solvable' && zero.witness.ticks).toBe(0);
  });

  test('every golden witness is shortest: A* and BFS agree on length', () => {
    const f = chaserFixture([
      '###########',
      '#..#####..#',
      '#.S.C...G.#',
      '#..#####..#',
      '###########'
    ]);
    const a = expectSolvable(f, [chaserAt(f, 'C', 'chaser')]);
    const b = expectSolvable(f, [chaserAt(f, 'C', 'chaser')], { useHeuristic: false });
    expect(a.ticks).toBe(b.ticks);
  });
});

describe('replay verification', () => {
  const f = chaserFixture([
    '###########',
    '#..#####..#',
    '#.S.C...G.#',
    '#..#####..#',
    '###########'
  ]);
  const specs = [chaserAt(f, 'C', 'chaser')];
  const { result, timeline, enemies } = solve(f, specs);
  const witness = result.status === 'solvable' ? result.witness : null;

  test('a tampered action is rejected', () => {
    expect(witness).not.toBeNull();
    const actions = [...witness!.actions];
    actions[1] = 'right';
    const verdict = verifyChaserWitness(f.graph, timeline, enemies, { ...witness!, actions });
    expect(verdict.valid).toBe(false);
  });

  test('a tampered enemy trace is rejected', () => {
    const enemyCells = witness!.enemyCells.map((cells) => [...cells]);
    enemyCells[2] = [enemyCells[2]![0]! + 1];
    expect(verifyChaserWitness(f.graph, timeline, enemies, { ...witness!, enemyCells }))
      .toMatchObject({ valid: false, reason: 'enemy-trace-mismatch' });
  });

  test('a witness that walks into the chaser is rejected with the P3 contact reasons', () => {
    const corridor = chaserFixture(['#######', '#SC..G#', '#######']);
    const spec = chaserAt(corridor, 'C', 'chaser');
    const enemy = createJunctionGreedyEnemy(spec, corridor.graph);
    const tl = corridor.timeline();
    const manual = (actions: ChaserWitness['actions']): ChaserWitness => {
      const replay = replayChaserActions(corridor.graph, tl, [enemy], {
        start: corridor.start, startTick: 0, startHeading: null, actions
      });
      return {
        contract: CHASER_WITNESS_CONTRACT, width: 7, height: 3, start: corridor.start, goal: corridor.goal,
        startTick: 0, invulnerableTurns: 0, startHeading: null, ticks: actions.length, waits: 0,
        cells: replay.playerCells, actions, enemyCells: replay.enemyStates.map((s) => s.map((e) => e.cell))
      };
    };
    // Player steps onto the chaser's cell; the chaser (no heading, tie) steps left into the player's old cell.
    expect(verifyChaserWitness(corridor.graph, tl, [enemy], manual(['right']))).toMatchObject({
      valid: false, reason: 'contact-swap'
    });
    // Waiting next to the chaser lets it step onto the player.
    expect(verifyChaserWitness(corridor.graph, tl, [enemy], manual(['wait']))).toMatchObject({
      valid: false, reason: 'contact-occupancy'
    });
  });

  test('a head-on swap across a wrap edge counts like an in-bounds swap', () => {
    const wrap = chaserFixture(['S...C']);
    const enemy = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: wrap.spawns.C!, initialHeading: 'right' }, wrap.graph);
    const tl = wrap.timeline();
    const replay = replayChaserActions(wrap.graph, tl, [enemy], {
      start: wrap.start, startTick: 0, startHeading: null, actions: ['left']
    });
    expect(replay.playerCells).toEqual([0, 4]);
    expect(replay.enemyStates[1]![0]!.cell).toBe(0);
    const verdict = verifyChaserWitness(wrap.graph, tl, [enemy], {
      contract: CHASER_WITNESS_CONTRACT, width: 5, height: 1, start: 0, goal: 4, startTick: 0, invulnerableTurns: 0,
      startHeading: null, ticks: 1, waits: 0, cells: [0, 4], actions: ['left'], enemyCells: [[4], [0]]
    });
    expect(verdict).toMatchObject({ valid: false, reason: 'contact-swap' });
  });

  test('a malformed witness is rejected without throwing', () => {
    expect(verifyChaserWitness(f.graph, timeline, enemies, { ...witness!, cells: witness!.cells.slice(1) }))
      .toMatchObject({ valid: false, reason: 'malformed-witness' });
    expect(verifyChaserWitness(f.graph, timeline, enemies, { ...witness!, width: 3 }))
      .toMatchObject({ valid: false, reason: 'dimension-mismatch' });
  });
});

describe('wrap edges in the search', () => {
  test('the player may use a wrap edge to reach the goal', () => {
    const f = chaserFixture(['S.C.G']);
    const witness = expectSolvable(f, [chaserAt(f, 'C', 'chaser')]);
    expect(witness.actions).toEqual(['left']);
  });

  test('a chaser following the player across a wrap edge is replayed identically', () => {
    const f = chaserFixture([
      'S...G',
      '#####',
      '#####'
    ]);
    const witness = expectSolvable(f, [{ rule: 'chaser', spawnCell: f.at(2, 0), initialHeading: 'left' }]);
    // The chaser walks left through the wrap edge; the player leaves the other way round.
    expect(witness.actions).toEqual(['left']);
    expect(witness.enemyCells.map((cells) => cells[0])).toEqual([2, 1]);
  });
});

describe('determinism and conformance with P3', () => {
  test('two runs produce byte-identical witnesses', () => {
    const f = chaserFixture([
      '###########',
      '#..#####..#',
      '#.S.C...G.#',
      '#..#####..#',
      '###########'
    ]);
    const run = () => {
      const { result } = solve(f, [chaserAt(f, 'C', 'interceptor', { lookahead: 4, graceTurns: 1 })]);
      return stableStringify(result);
    };
    expect(run()).toBe(run());
  });

  test('with no chasers, BFS mode reproduces findWitnessRoute exactly on random hazard boards', () => {
    const rng = createTestRng(8_808);
    let solvable = 0;
    for (let round = 0; round < 120; round += 1) {
      const width = 5 + Math.floor(rng() * 5);
      const height = 4 + Math.floor(rng() * 4);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.75));
      const graph = createHazardGraph({ width, height, grid });
      const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
      if (walkable.length < 6) {
        continue;
      }
      const pick = () => walkable[Math.floor(rng() * walkable.length)]!;
      const start = pick();
      const goal = pick();
      const gateCell = pick();
      const specs: HazardSpec[] = [];
      if (gateCell !== start && gateCell !== goal) {
        specs.push({ kind: 'timedGate', cell: gateCell, period: 3, openFrom: 1, openFor: 1 });
      }
      const patrolStart = pick();
      const route = [patrolStart, ...graph.neighbors(patrolStart).slice(0, 1)];
      specs.push({ kind: 'patrol', route, period: shuttlePeriod(route.length), phase: Math.floor(rng() * 3) });
      const timeline = createHazardTimeline(graph, specs);
      const invulnerableTurns = round % 4 === 0 ? 2 : 0;
      const p3 = findWitnessRoute(graph, timeline, { start, goal, invulnerableTurns });
      const p6 = findWitnessRouteWithChasers(graph, timeline, [], { start, goal, invulnerableTurns, useHeuristic: false });
      const fast = findWitnessRouteWithChasers(graph, timeline, [], { start, goal, invulnerableTurns });
      if (p3.solvable) {
        solvable += 1;
        expect(p6.status).toBe('solvable');
        expect(fast.status).toBe('solvable');
        if (p6.status === 'solvable' && fast.status === 'solvable') {
          expect(p6.witness.cells).toEqual(p3.witness.cells);
          expect(p6.witness.actions).toEqual(p3.witness.actions);
          expect(fast.witness.ticks).toBe(p3.witness.ticks);
        }
      } else {
        expect(p6).toMatchObject({ status: 'unsolvable', reason: p3.reason });
        expect(fast.status).toBe('unsolvable');
      }
    }
    expect(solvable).toBeGreaterThan(40);
  });

  test('an immobile chaser is contact-equivalent to a one-cell P3 patrol', () => {
    const rng = createTestRng(1_212);
    let compared = 0;
    for (let round = 0; round < 80; round += 1) {
      const width = 5 + Math.floor(rng() * 4);
      const height = 4 + Math.floor(rng() * 3);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.8));
      const graph = createHazardGraph({ width, height, grid });
      const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
      if (walkable.length < 5) {
        continue;
      }
      const pick = () => walkable[Math.floor(rng() * walkable.length)]!;
      const start = pick();
      const goal = pick();
      const sitter = pick();
      const patrol: HazardSpec = { kind: 'patrol', route: [sitter], period: 1 };
      const p3 = findWitnessRoute(graph, createHazardTimeline(graph, [patrol]), { start, goal });
      const enemy = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: sitter, graceTurns: 4000 }, graph);
      const p6 = findWitnessRouteWithChasers(graph, createHazardTimeline(graph, []), [enemy], { start, goal, useHeuristic: false, maxTicks: 300 });
      compared += 1;
      if (p3.solvable) {
        expect(p6.status).toBe('solvable');
        if (p6.status === 'solvable') {
          expect(p6.witness.cells).toEqual(p3.witness.cells);
          expect(p6.witness.actions).toEqual(p3.witness.actions);
        }
      } else {
        // The sitter only stays put for its 4000-turn grace window; a bounded search sees the same refusal.
        expect(p6.status).toBe('unsolvable');
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  test('chasers and P3 patrols/gates combine; the witness replays through the shared contact rule', () => {
    const f = chaserFixture([
      '#############',
      '#S..........#',
      '#.##.####.#.#',
      '#.#C...#..#G#',
      '#.##.####.#.#',
      '#...........#',
      '#############'
    ]);
    const extra: HazardSpec[] = [{ kind: 'timedGate', cell: f.at(11, 2), period: 4, openFrom: 0, openFor: 2 }];
    const timeline = f.timeline(extra);
    const enemy = createJunctionGreedyEnemy(chaserAt(f, 'C', 'chaser', { graceTurns: 2 }), f.graph);
    const result = findWitnessRouteWithChasers(f.graph, timeline, [enemy], { start: f.start, goal: f.goal });
    expect(result.status).toBe('solvable');
    if (result.status === 'solvable') {
      expect(verifyChaserWitness(f.graph, timeline, [enemy], result.witness).valid).toBe(true);
      expect(timeline.period).toBe(4);
    }
  });
});

describe('state cap and unknown results', () => {
  const big = (() => {
    const rows = ['#'.repeat(41)];
    for (let y = 0; y < 15; y += 1) {
      rows.push(`#${'.'.repeat(39)}#`);
    }
    rows.push('#'.repeat(41));
    return rows;
  })();

  test('a cap ends the search with an explicit unknown result and never exceeds the cap', () => {
    const f = chaserFixture(big);
    const graph = f.graph;
    const goal = graph.cellId(39, 14);
    const enemies = [
      createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: graph.cellId(20, 7) }, graph),
      createJunctionGreedyEnemy({ rule: 'interceptor', spawnCell: graph.cellId(30, 3) }, graph)
    ];
    // Goal sealed off by blockers so the search cannot finish early.
    const sealed = createHazardTimeline(graph, graph.neighbors(goal).map((cell) => ({ kind: 'blocker' as const, cell })));
    const result = findWitnessRouteWithChasers(graph, sealed, enemies, {
      start: graph.cellId(1, 1), goal, stateCap: 5_000, useHeuristic: false
    });
    expect(result).toMatchObject({ status: 'unknown', reason: 'state-cap-exceeded', stateCap: 5_000 });
    expect(result.exploredStates).toBeLessThanOrEqual(5_000);
  });

  test('an exhausted small space is a proof of unsolvability, not unknown', () => {
    const f = chaserFixture(['#####', '#S#G#', '#####']);
    expect(solve(f, []).result).toMatchObject({ status: 'unsolvable', reason: 'no-route' });
  });

  test('a tiering period beyond the bound is reported as unknown', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    const { result } = solve(f, [chaserAt(f, 'C', 'chaser', { speedDivisor: 5 })], { maxCombinedPeriod: 4 });
    expect(result).toMatchObject({ status: 'unknown', reason: 'period-too-large' });
  });

  test('maxTicks truncation is reported distinctly', () => {
    const f = chaserFixture(['#########', '#S.....G#', '#########']);
    expect(solve(f, [], { maxTicks: 3 }).result).toMatchObject({ status: 'unsolvable', reason: 'max-ticks-exceeded' });
    expect(solve(f, [], { maxTicks: 6 }).result.status).toBe('solvable');
  });
});

describe('state-space bookkeeping', () => {
  test('the folded time key covers the tiering prefix and the combined period', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    const timeline = f.timeline([{ kind: 'timedGate', cell: f.at(2, 1), period: 4, openFrom: 0, openFor: 3 }]);
    const enemy = createJunctionGreedyEnemy(chaserAt(f, 'C', 'chaser', { spawnDelayTurns: 3, graceTurns: 2, speedDivisor: 3 }), f.graph);
    const space = createChaserSearchSpace(f.graph, timeline, [enemy.spec]);
    expect(space.prefixTurns).toBe(5);
    expect(space.combinedPeriod).toBe(12);
    expect(space.timeKeyCount).toBe(17);
    expect(space.timeKeyOf(4)).toBe(4);
    expect(space.timeKeyOf(5)).toBe(5);
    expect(space.timeKeyOf(5 + 12)).toBe(5);
    expect(space.timeKeyOf(5 + 12 + 7)).toBe(12);
  });

  test('estimateChaserStateSpace reports the joint ceiling', () => {
    const f = chaserFixture(['#########', '#S..C..G#', '#########']);
    const enemy = createJunctionGreedyEnemy(chaserAt(f, 'C', 'interceptor'), f.graph);
    const estimate = estimateChaserStateSpace(f.graph, f.timeline(), [enemy.spec, enemy.spec], 2);
    expect(estimate.enemies).toBe(2);
    expect(estimate.walkableCells).toBe(7);
    expect(estimate.positionalBound).toBe(1 * 7 ** 3 * 3);
    expect(estimate.keySpaceSize).toBeGreaterThan(estimate.positionalBound);
  });
});
