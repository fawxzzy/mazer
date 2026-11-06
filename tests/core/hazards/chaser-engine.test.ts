import { describe, expect, test } from 'vitest';
import { createHazardGraph, type HazardGraph } from '../../../src/mazer-core/hazards/graphContract';
import { stableStringify } from '../../../src/mazer-core/hazards/serialization';
import {
  CHASER_ENGINE_CONTRACT,
  createJunctionGreedyEnemy,
  hazardTargetDistance,
  junctionGreedyTargetCell,
  reverseJunctionGreedyEnemy,
  stepJunctionGreedyEnemy,
  type ChaserPlayerState,
  type JunctionGreedyEnemySpec,
  type JunctionGreedyEnemyState
} from '../../../src/mazer-core/hazards/chaserEngine';
import { createTestRng } from './fixtures';
import { chaserFixture } from './chaserFixtures';

const still = (cell: number): ChaserPlayerState => ({ cell, heading: null });

/** Runs `turns` enemy phases against a stationary player; returns the enemy cell after each turn. */
const trace = (
  graph: HazardGraph,
  spec: JunctionGreedyEnemySpec,
  player: ChaserPlayerState,
  turns: number
): number[] => {
  let state = createJunctionGreedyEnemy(spec, graph);
  const cells = [state.cell];
  for (let tick = 0; tick < turns; tick += 1) {
    state = stepJunctionGreedyEnemy(graph, state, player, tick);
    cells.push(state.cell);
  }
  return cells;
};

describe('junction-greedy movement rules', () => {
  test('keeps going along a corridor and turns corners without deciding', () => {
    const f = chaserFixture([
      '#####',
      '#C..#',
      '###.#',
      '###.#',
      '###S#',
      '#####'
    ]);
    // Dead-end spawn: the only exit is taken; the corner (3,1) has two exits, one of which is back.
    const cells = trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, still(f.start), 5);
    expect(cells.map((c) => [f.graph.cellX(c), f.graph.cellY(c)])).toEqual([
      [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4]
    ]);
  });

  test('never reverses at a junction even when the target is straight behind', () => {
    const f = chaserFixture([
      '#######',
      '#S....#',
      '###.###',
      '###.###',
      '#######'
    ]);
    // Facing right at (2,1); the junction at (3,1) offers right and down. The player is far to the
    // left. Distances to (1,1) from (4,1) and (3,2) are 3 and 3: tie, and 'down' precedes 'right'.
    const spec: JunctionGreedyEnemySpec = { rule: 'chaser', spawnCell: f.at(2, 1), initialHeading: 'right' };
    const cells = trace(f.graph, spec, still(f.start), 3).map((c) => [f.graph.cellX(c), f.graph.cellY(c)]);
    expect(cells).toEqual([[2, 1], [3, 1], [3, 2], [3, 3]]);
  });

  test('breaks distance ties up, left, down, right', () => {
    const room = chaserFixture([
      '#######',
      '#.....#',
      '#.....#',
      '#..C..#',
      '#.....#',
      '#.....#',
      '#######'
    ]);
    const spawn = room.spawns.C!;
    const first = (target: [number, number]) => {
      const cells = trace(room.graph, { rule: 'chaser', spawnCell: spawn }, still(room.at(...target)), 1);
      return [room.graph.cellX(cells[1]!), room.graph.cellY(cells[1]!)];
    };
    // Enemy at (3,3). Target = its own cell: every exit is distance 1, so 'up' wins.
    expect(first([3, 3])).toEqual([3, 2]);
    // Target (5,5): up/left are 5 away... down (3,4) and right (4,3) are both 3 away: 'down' precedes 'right'.
    expect(first([5, 5])).toEqual([3, 4]);
    // Target (1,5): up (3,2)=5, left (2,3)=3, down (3,4)=3, right (4,3)=5: 'left' precedes 'down'.
    expect(first([1, 5])).toEqual([2, 3]);
    // Target (5,1): up (3,2)=3, left=5, down=5, right (4,3)=3: 'up' precedes 'right'.
    expect(first([5, 1])).toEqual([3, 2]);
  });

  test('uses straight-line distance, not shortest path (decoy stub)', () => {
    // The player is behind a wall at (1,1). From the junction cell (3,3) the straight-line closer exit is
    // the dead-end stub going up; the shortest path to the player goes down and around. A greedy chaser
    // walks into the stub and has to reverse; a shortest-path pursuer would not.
    const f = chaserFixture([
      '#######',
      '#S#.###',
      '#.#.###',
      '#.#C###',
      '#.#.###',
      '#.....#',
      '#######'
    ]);
    const cells = trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, still(f.start), 10)
      .map((c) => [f.graph.cellX(c), f.graph.cellY(c)]);
    expect(cells).toEqual([
      [3, 3], [3, 2], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 5], [1, 5], [1, 4], [1, 3]
    ]);
    // The static shortest path from the spawn heads down immediately.
    const first = f.graph.neighbors(f.spawns.C!).map((n) => f.graph.cellY(n));
    expect(first).toContain(2);
    expect(hazardTargetDistance(f.graph, f.at(3, 2), f.start)).toBeLessThan(hazardTargetDistance(f.graph, f.at(3, 4), f.start));
  });

  test('reverses only at a dead end', () => {
    const f = chaserFixture([
      '#######',
      '#.C..##',
      '#######'
    ]);
    // Spawn in the middle of a sealed corridor facing right: runs to the right dead end, then reverses
    // all the way back, then reverses again at the left dead end.
    const spec: JunctionGreedyEnemySpec = { rule: 'chaser', spawnCell: f.spawns.C!, initialHeading: 'right' };
    const xs = trace(f.graph, spec, still(f.at(1, 1)), 8).map((c) => f.graph.cellX(c));
    expect(xs).toEqual([2, 3, 4, 3, 2, 1, 2, 3, 4]);
  });

  test('a sealed single cell never moves', () => {
    const f = chaserFixture(['###', '#C#', '###']);
    expect(trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, still(f.spawns.C!), 3)).toEqual([4, 4, 4, 4]);
  });

  test('moves at most one cell per turn', () => {
    const f = chaserFixture([
      '#########',
      '#S.....C#',
      '#.......#',
      '#########'
    ]);
    const cells = trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, still(f.start), 12);
    for (let i = 1; i < cells.length; i += 1) {
      expect(f.graph.neighbors(cells[i - 1]!).includes(cells[i]!) || cells[i] === cells[i - 1]).toBe(true);
    }
  });
});

describe('interceptor target', () => {
  const room = chaserFixture([
    '#########',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########'
  ]);

  test('is the cell lookahead steps ahead of the player heading (default 3)', () => {
    const spec = createJunctionGreedyEnemy({ rule: 'interceptor', spawnCell: room.at(7, 3) }, room.graph).spec;
    expect(spec.lookahead).toBe(3);
    expect(junctionGreedyTargetCell(room.graph, spec, { cell: room.at(1, 2), heading: 'right' })).toBe(room.at(4, 2));
    expect(junctionGreedyTargetCell(room.graph, spec, { cell: room.at(4, 3), heading: 'up' })).toBe(room.at(4, 1));
  });

  test('clamps to the last walkable cell before a wall', () => {
    const spec = createJunctionGreedyEnemy({ rule: 'interceptor', spawnCell: room.at(7, 3), lookahead: 5 }, room.graph).spec;
    expect(junctionGreedyTargetCell(room.graph, spec, { cell: room.at(5, 2), heading: 'right' })).toBe(room.at(7, 2));
    expect(junctionGreedyTargetCell(room.graph, spec, { cell: room.at(2, 1), heading: 'up' })).toBe(room.at(2, 1));
  });

  test('without a known heading it falls back to the player cell; chaser ignores heading', () => {
    const spec = createJunctionGreedyEnemy({ rule: 'interceptor', spawnCell: room.at(7, 3) }, room.graph).spec;
    expect(junctionGreedyTargetCell(room.graph, spec, still(room.at(3, 2)))).toBe(room.at(3, 2));
    const chaser = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: room.at(7, 3) }, room.graph).spec;
    expect(junctionGreedyTargetCell(room.graph, chaser, { cell: room.at(1, 2), heading: 'right' })).toBe(room.at(1, 2));
  });

  test('looks across a wrap edge', () => {
    const wrap = chaserFixture([
      '.......',
      '.......',
      '.......'
    ]);
    const spec = createJunctionGreedyEnemy({ rule: 'interceptor', spawnCell: wrap.at(3, 1), lookahead: 3 }, wrap.graph).spec;
    expect(junctionGreedyTargetCell(wrap.graph, spec, { cell: wrap.at(5, 1), heading: 'right' })).toBe(wrap.at(1, 1));
  });

  test('steers a different way than a chaser at the same junction', () => {
    // Enemy at the centre of a plus-shaped crossing, no heading; player below heading up.
    const f = chaserFixture([
      '#######',
      '###.###',
      '###.###',
      '#..C..#',
      '###.###',
      '###.###',
      '#######'
    ]);
    const player: ChaserPlayerState = { cell: f.at(3, 5), heading: 'left' };
    const chaser = trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, player, 1)[1]!;
    expect(chaser).toBe(f.at(3, 4));
    // Player at (3,5) heading up: 3 cells ahead is (3,2), so the interceptor goes up while a chaser goes down.
    const intercept = trace(f.graph, { rule: 'interceptor', spawnCell: f.spawns.C! }, { cell: f.at(3, 5), heading: 'up' }, 1)[1]!;
    expect(intercept).toBe(f.at(3, 2));
    const plain = trace(f.graph, { rule: 'chaser', spawnCell: f.spawns.C! }, { cell: f.at(3, 5), heading: 'up' }, 1)[1]!;
    expect(plain).toBe(f.at(3, 4));
  });
});

describe('wall-follower (left-hand rule)', () => {
  test('keeps its left hand on the wall around a loop', () => {
    const f = chaserFixture([
      '#######',
      '#.....#',
      '#.###.#',
      '#.#W#.#',
      '#.#.#.#',
      '#.....#',
      '#######'
    ]);
    // W sits at (3,3) facing up into a wall-stub: it has a single exit (down); follows then the ring.
    const spec: JunctionGreedyEnemySpec = { rule: 'wall-follower', spawnCell: f.spawns.W!, initialHeading: 'down' };
    const cells = trace(f.graph, spec, still(f.at(1, 1)), 12).map((c) => [f.graph.cellX(c), f.graph.cellY(c)]);
    expect(cells.slice(0, 5)).toEqual([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5]]);
    // Facing down at (3,5), the left of 'down' is 'right', so it turns into (4,5) and keeps the wall on its left.
  });

  test('ignores the player entirely', () => {
    const f = chaserFixture([
      '#######',
      '#.....#',
      '#.....#',
      '#..W..#',
      '#.....#',
      '#######'
    ]);
    const spec: JunctionGreedyEnemySpec = { rule: 'wall-follower', spawnCell: f.spawns.W! };
    const a = trace(f.graph, spec, still(f.at(1, 1)), 10);
    const b = trace(f.graph, spec, still(f.at(5, 4)), 10);
    expect(a).toEqual(b);
  });
});

describe('tiering knobs', () => {
  const corridor = chaserFixture([
    '###############',
    '#S...........C#',
    '###############'
  ]);
  const xs = (spec: Partial<JunctionGreedyEnemySpec>, turns: number) => (
    trace(corridor.graph, { rule: 'chaser', spawnCell: corridor.spawns.C!, ...spec }, still(corridor.start), turns)
      .map((c) => (c < 0 ? -1 : corridor.graph.cellX(c)))
  );

  test('spawnDelayTurns keeps the enemy off the board, then it appears without moving', () => {
    expect(xs({ spawnDelayTurns: 3 }, 6)).toEqual([-1, -1, -1, 13, 12, 11, 10]);
  });

  test('graceTurns holds a present enemy still before its first move', () => {
    expect(xs({ graceTurns: 3 }, 6)).toEqual([13, 13, 13, 13, 12, 11, 10]);
  });

  test('spawn delay and grace add up', () => {
    expect(xs({ spawnDelayTurns: 2, graceTurns: 2 }, 7)).toEqual([-1, -1, 13, 13, 13, 12, 11, 10]);
  });

  test('speedDivisor moves the enemy every k-th turn', () => {
    expect(xs({ speedDivisor: 2 }, 6)).toEqual([13, 13, 12, 12, 11, 11, 10]);
    expect(xs({ speedDivisor: 3 }, 7)).toEqual([13, 13, 13, 12, 12, 12, 11, 11]);
    expect(xs({ speedDivisor: 2, graceTurns: 1 }, 6)).toEqual([13, 13, 13, 12, 12, 11, 11]);
  });

  test('rejects invalid knobs', () => {
    const base = { rule: 'chaser', spawnCell: corridor.spawns.C! } as const;
    expect(() => createJunctionGreedyEnemy({ ...base, speedDivisor: 0 })).toThrow(RangeError);
    expect(() => createJunctionGreedyEnemy({ ...base, graceTurns: -1 })).toThrow(RangeError);
    expect(() => createJunctionGreedyEnemy({ ...base, spawnDelayTurns: 1.5 })).toThrow(RangeError);
    expect(() => createJunctionGreedyEnemy({ ...base, lookahead: 0 })).toThrow(RangeError);
    expect(() => createJunctionGreedyEnemy({ ...base, spawnCell: 0 }, corridor.graph)).toThrow(RangeError);
    expect(() => createJunctionGreedyEnemy({ ...base, rule: 'sniper' as never })).toThrow(RangeError);
  });
});

describe('wrap-edge behaviour', () => {
  test('measures distance across a wrap edge only when the graph wraps on that axis', () => {
    const wrapped = chaserFixture(['.......']);
    expect(hazardTargetDistance(wrapped.graph, wrapped.at(0, 0), wrapped.at(6, 0))).toBe(1);
    const walled = chaserFixture(['#.....#']);
    expect(hazardTargetDistance(walled.graph, walled.at(1, 0), walled.at(5, 0))).toBe(4);
    // Floor at only one end: no wrap edge exists, so distance is plain.
    const oneSided = chaserFixture(['......#']);
    expect(hazardTargetDistance(oneSided.graph, oneSided.at(0, 0), oneSided.at(5, 0))).toBe(5);
  });

  test('a chaser takes the wrap edge when it is the straight-line shortcut', () => {
    const f = chaserFixture([
      '.........',
      '#########'
    ]);
    const cells = trace(f.graph, { rule: 'chaser', spawnCell: f.at(1, 0), initialHeading: 'left' }, still(f.at(8, 0)), 3);
    expect(cells.map((c) => f.graph.cellX(c))).toEqual([1, 0, 8, 7]);
  });

  test('a decision uses wrap-aware distance (torus shortcut)', () => {
    const torus = chaserFixture(['.......', '.......', '.......']);
    // Enemy (1,1), player (6,1). Left (0,1) is 1 away across the wrap; plain Manhattan would pick right.
    const cells = trace(torus.graph, { rule: 'chaser', spawnCell: torus.at(1, 1) }, still(torus.at(6, 1)), 1);
    expect(cells.map((c) => torus.graph.cellX(c))).toEqual([1, 0]);
    // Same board but a wall column breaks the wrap on that axis: no shortcut, so it goes right.
    const walled = chaserFixture(['#......', '#......', '#......']);
    const plain = trace(walled.graph, { rule: 'chaser', spawnCell: walled.at(2, 1) }, still(walled.at(6, 1)), 1);
    expect(plain.map((c) => walled.graph.cellX(c))).toEqual([2, 3]);
  });

  test('a wrapped step is not a reversal and heading survives the wrap', () => {
    const f = chaserFixture(['.....', '#####']);
    const cells = trace(f.graph, { rule: 'wall-follower', spawnCell: f.at(0, 0), initialHeading: 'left' }, still(f.at(2, 0)), 4);
    expect(cells.map((c) => f.graph.cellX(c))).toEqual([0, 4, 3, 2, 1]);
  });
});

describe('global reverse event', () => {
  test('the next move goes back, once', () => {
    const f = chaserFixture(['#########', '#.......#', '#########']);
    let state = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: f.at(3, 0 + 1), initialHeading: 'right' }, f.graph);
    const player = still(f.at(7, 1));
    state = stepJunctionGreedyEnemy(f.graph, state, player, 0);
    state = stepJunctionGreedyEnemy(f.graph, state, player, 1);
    expect(f.graph.cellX(state.cell)).toBe(5);
    state = reverseJunctionGreedyEnemy(state);
    expect(state.reverseNext).toBe(true);
    state = stepJunctionGreedyEnemy(f.graph, state, player, 2);
    expect(f.graph.cellX(state.cell)).toBe(4);
    expect(state.reverseNext).toBe(false);
    // The target is to the right, but the heading is now left, so right is "back": it keeps going left
    // to the dead end before turning around.
    state = stepJunctionGreedyEnemy(f.graph, state, player, 3);
    expect(f.graph.cellX(state.cell)).toBe(3);
  });

  test('an absent or never-moved enemy ignores the event', () => {
    const f = chaserFixture(['###', '#C#', '###']);
    const state = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: f.spawns.C!, spawnDelayTurns: 2 }, f.graph);
    expect(reverseJunctionGreedyEnemy(state)).toBe(state);
  });
});

describe('purity and determinism', () => {
  test('does not mutate its input and is JSON-serializable', () => {
    const f = chaserFixture(['#####', '#S.C#', '#####']);
    const before = createJunctionGreedyEnemy({ rule: 'chaser', spawnCell: f.spawns.C! }, f.graph);
    const snapshot = JSON.stringify(before);
    const after = stepJunctionGreedyEnemy(f.graph, before, still(f.start), 0);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
    expect(after.contract).toBe(CHASER_ENGINE_CONTRACT);
  });

  test('a long run is byte-identical across two executions, including after a JSON round trip', () => {
    const rng = createTestRng(77);
    const width = 11;
    const height = 9;
    const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.7));
    const graph = createHazardGraph({ width, height, grid });
    const walkable = Array.from({ length: graph.cellCount }, (_, c) => c).filter((c) => graph.isWalkable(c));
    const run = (): string => {
      const walk = createTestRng(5);
      let state: JunctionGreedyEnemyState = createJunctionGreedyEnemy(
        { rule: 'interceptor', spawnCell: walkable[3]!, graceTurns: 2, speedDivisor: 2 }, graph
      );
      let player: ChaserPlayerState = { cell: walkable[walkable.length - 1]!, heading: null };
      const frames: string[] = [];
      for (let tick = 0; tick < 200; tick += 1) {
        const options = graph.neighbors(player.cell);
        if (options.length > 0 && walk() < 0.8) {
          const dest = options[Math.floor(walk() * options.length)]!;
          const heading = (['up', 'left', 'down', 'right'] as const).find((d) => graph.moveTarget(player.cell, d) === dest)!;
          player = { cell: dest, heading };
        }
        state = stepJunctionGreedyEnemy(graph, state, player, tick);
        state = JSON.parse(stableStringify(state)) as JunctionGreedyEnemyState;
        frames.push(stableStringify(state));
      }
      return frames.join('\n');
    };
    expect(run()).toBe(run());
  });
});

describe('graph assumptions the engine relies on', () => {
  test('every graph move is reversible by the opposite direction (random boards, with wrap)', () => {
    const rng = createTestRng(2026);
    const order = ['up', 'left', 'down', 'right'] as const;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    for (let round = 0; round < 60; round += 1) {
      const width = 1 + Math.floor(rng() * 7);
      const height = 1 + Math.floor(rng() * 6);
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => rng() < 0.7));
      const graph = createHazardGraph({ width, height, grid });
      for (let cell = 0; cell < graph.cellCount; cell += 1) {
        if (!graph.isWalkable(cell)) {
          continue;
        }
        for (const direction of order) {
          const dest = graph.moveTarget(cell, direction);
          if (dest >= 0) {
            expect(graph.moveTarget(dest, opposite[direction])).toBe(cell);
          }
        }
      }
    }
  });
});
