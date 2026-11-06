import { describe, expect, test } from 'vitest';
import {
  HAZARD_MAX_PERIOD,
  HazardSpecError,
  createHazardGraph,
  createHazardTimeline,
  findSeparatorCells,
  isTimedGateOpenAt,
  patrolCellAt,
  shuttleIndexAt,
  shuttlePeriod,
  type HazardGraph
} from '../../../src/mazer-core/hazards';
import { createLegacyMaze } from '../../../src/legacy-runtime/legacyMaze';
import {
  createLegacyMazeHazardGraph,
  findHazardGraphLegacyMismatches,
  hazardCellToLegacyPoint,
  legacyPointToHazardCell
} from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { asciiFixture } from './fixtures';

const reachableWithout = (graph: HazardGraph, start: number, goal: number, removed: number): boolean => {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.neighbors(current)) {
      if (next !== removed && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.has(goal);
};

describe('hazard graph neighbours', () => {
  test('orders neighbours up, left, down, right and detects junctions and dead ends', () => {
    const f = asciiFixture([
      '#####',
      '##.##',
      '#...#',
      '##.S#',
      '#####'
    ]);
    const centre = f.at(2, 2);
    expect(f.graph.neighbors(centre)).toEqual([f.at(2, 1), f.at(1, 2), f.at(2, 3), f.at(3, 2)]);
    expect(f.graph.moveTarget(centre, 'up')).toBe(f.at(2, 1));
    expect(f.graph.moveTarget(centre, 'right')).toBe(f.at(3, 2));
    expect(f.graph.isJunction(centre)).toBe(true);
    expect(f.graph.isDeadEnd(f.at(2, 1))).toBe(true);
    expect(f.graph.isJunction(f.at(2, 3))).toBe(false);
    expect(f.graph.moveTarget(f.at(2, 1), 'up')).toBe(-1);
    expect(f.graph.isWalkable(f.at(0, 0))).toBe(false);
    expect(() => f.graph.cellId(9, 9)).toThrow(RangeError);
  });

  test('wraps across opposite edges only when both edge cells are floor and distinct', () => {
    const horizontal = asciiFixture([
      '######',
      'S###.G',
      '######'
    ]);
    expect(horizontal.graph.moveTarget(horizontal.start, 'left')).toBe(horizontal.goal);
    expect(horizontal.graph.moveTarget(horizontal.goal, 'right')).toBe(horizontal.start);
    expect(horizontal.graph.neighbors(horizontal.start)).toEqual([horizontal.goal]);

    const vertical = asciiFixture([
      '#S#',
      '###',
      '#G#'
    ]);
    expect(vertical.graph.moveTarget(vertical.start, 'up')).toBe(vertical.goal);
    expect(vertical.graph.moveTarget(vertical.goal, 'down')).toBe(vertical.start);

    // A one-row board would wrap each cell onto itself vertically: rejected.
    const flat = asciiFixture(['S.G']);
    expect(flat.graph.moveTarget(flat.start, 'up')).toBe(-1);
    expect(flat.graph.moveTarget(flat.start, 'down')).toBe(-1);
    expect(flat.graph.moveTarget(flat.start, 'left')).toBe(flat.goal);

    // Width 2: the wrapped and direct neighbour coincide and are de-duplicated.
    const narrow = asciiFixture(['SG']);
    expect(narrow.graph.neighbors(narrow.start)).toEqual([narrow.goal]);
  });

  test('rejects malformed grids', () => {
    expect(() => createHazardGraph({ width: 2, height: 2, grid: [[true], [true, true]] })).toThrow(RangeError);
    expect(() => createHazardGraph({ width: 0, height: 0, grid: [] })).toThrow(RangeError);
  });

  test('separator cells are exactly the mandatory interior cells', () => {
    const f = asciiFixture([
      '#########',
      '#S..#...#',
      '#.#.#.#.#',
      '#.#...#G#',
      '#########'
    ]);
    const separators = findSeparatorCells(f.graph, f.start, f.goal);
    for (let cell = 0; cell < f.graph.cellCount; cell += 1) {
      if (!f.graph.isWalkable(cell) || cell === f.start || cell === f.goal) {
        continue;
      }
      expect(separators.includes(cell)).toBe(!reachableWithout(f.graph, f.start, f.goal, cell));
    }
    expect(separators).toContain(f.at(4, 3));
    expect(separators.length).toBeGreaterThan(0);
  });
});

describe('graph matches production movement', () => {
  const profiles = [
    null,
    { requiredOppositeBorderConnections: { horizontal: true, vertical: true } },
    { straightnessBias: 0.95, maxDeadEndCount: 0, checkpointCountOverride: 1 }
  ];

  test.each([11, 29, 101, 2027, 40961])('neighbour sets equal resolveLegacyWalkableGridNeighbors (seed %i)', (seed) => {
    for (const profile of profiles) {
      const maze = createLegacyMaze(25, 25, seed, undefined, profile);
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      expect(findHazardGraphLegacyMismatches(graph, maze)).toEqual([]);
      expect(hazardCellToLegacyPoint(graph, start)).toEqual(maze.start);
      expect(legacyPointToHazardCell(graph, maze.goal)).toBe(goal);
      for (let cell = 0; cell < graph.cellCount; cell += 1) {
        for (const next of graph.neighbors(cell)) {
          expect(graph.neighbors(next)).toContain(cell);
        }
      }
    }
  });

  test('generated mazes with required wrap axes contain wrap edges the graph honours', () => {
    let wrapEdges = 0;
    for (const seed of [101, 2027, 40961]) {
      const maze = createLegacyMaze(25, 25, seed, undefined, {
        requiredOppositeBorderConnections: { horizontal: true, vertical: true }
      });
      const { graph } = createLegacyMazeHazardGraph(maze);
      for (let cell = 0; cell < graph.cellCount; cell += 1) {
        for (const next of graph.neighbors(cell)) {
          if (Math.abs(graph.cellX(next) - graph.cellX(cell)) > 1 || Math.abs(graph.cellY(next) - graph.cellY(cell)) > 1) {
            wrapEdges += 1;
          }
        }
      }
    }
    expect(wrapEdges).toBeGreaterThan(0);
  });
});

describe('deterministic hazard timeline', () => {
  const f = asciiFixture([
    '#########',
    '#S.....G#',
    '#########'
  ]);

  test('shuttle patrol is a ping-pong over the route with period 2 * (n - 1)', () => {
    expect(shuttlePeriod(1)).toBe(1);
    expect(shuttlePeriod(4)).toBe(6);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((tick) => shuttleIndexAt(4, tick))).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
    const route = [f.at(2, 1), f.at(3, 1), f.at(4, 1)];
    const spec = { kind: 'patrol', route, period: 4, phase: 1 } as const;
    expect([0, 1, 2, 3, 4].map((tick) => patrolCellAt(spec, tick))).toEqual([route[1], route[2], route[1], route[0], route[1]]);
  });

  test('timed gate opens for openFor ticks starting at openFrom', () => {
    const gate = { kind: 'timedGate', cell: f.at(3, 1), period: 5, openFrom: 2, openFor: 2 } as const;
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((tick) => isTimedGateOpenAt(gate, tick))).toEqual(
      [false, false, true, true, false, false, false, true]
    );
  });

  test('timeline period is the bounded lcm and queries wrap modulo the period', () => {
    const timeline = createHazardTimeline(f.graph, [
      { kind: 'timedGate', cell: f.at(3, 1), period: 4, openFrom: 0, openFor: 1 },
      { kind: 'timedGate', cell: f.at(4, 1), period: 3, openFrom: 1, openFor: 1 },
      { kind: 'patrol', route: [f.at(5, 1), f.at(6, 1), f.at(7, 1)], period: 4 }
    ]);
    expect(timeline.period).toBe(12);
    expect(timeline.enemyCount).toBe(1);
    expect(timeline.blockedAt(f.at(3, 1), 0)).toBe(false);
    expect(timeline.blockedAt(f.at(3, 1), 1)).toBe(true);
    expect(timeline.blockedAt(f.at(3, 1), 12)).toBe(false);
    expect(timeline.blockedAt(f.at(3, 1), -11)).toBe(true);
    expect(timeline.enemyCellsAt(2)).toEqual([f.at(7, 1)]);
    expect(timeline.enemyCellsAt(14)).toEqual([f.at(7, 1)]);
    expect(createHazardTimeline(f.graph, []).period).toBe(1);
  });

  test('invalid specs fail with stable error codes', () => {
    const code = (specs: Parameters<typeof createHazardTimeline>[1], max?: number): string | null => {
      try {
        createHazardTimeline(f.graph, specs, { maxPeriod: max });
        return null;
      } catch (error) {
        return error instanceof HazardSpecError ? error.code : 'other';
      }
    };
    expect(code([{ kind: 'blocker', cell: 0 }])).toBe('cell-not-walkable');
    expect(code([{ kind: 'blocker', cell: f.at(3, 1) }, { kind: 'blocker', cell: f.at(3, 1) }])).toBe('duplicate-obstacle-cell');
    expect(code([{ kind: 'timedGate', cell: f.at(3, 1), period: 3, openFrom: 3, openFor: 1 }])).toBe('invalid-gate');
    expect(code([{ kind: 'patrol', route: [f.at(2, 1), f.at(4, 1)], period: 2 }])).toBe('invalid-patrol-route');
    expect(code([{ kind: 'patrol', route: [f.at(2, 1), f.at(3, 1)], period: 5 }])).toBe('invalid-patrol-period');
    expect(code([
      { kind: 'blocker', cell: f.at(3, 1) },
      { kind: 'patrol', route: [f.at(2, 1), f.at(3, 1)], period: 2 }
    ])).toBe('patrol-overlaps-blocker');
    expect(code([
      { kind: 'timedGate', cell: f.at(2, 1), period: 7, openFrom: 0, openFor: 3 },
      { kind: 'timedGate', cell: f.at(3, 1), period: 11, openFrom: 0, openFor: 3 }
    ], 50)).toBe('period-too-large');
    expect(HAZARD_MAX_PERIOD).toBe(720);
  });
});
