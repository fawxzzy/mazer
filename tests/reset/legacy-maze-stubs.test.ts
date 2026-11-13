import { describe, expect, test } from 'vitest';
import {
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_TOP_TARGET,
  LAST_BUDGET_LEVEL,
  GEOMETRY_BUDGET_WINDOW,
  resolveGeometryBudgetFringeCells
} from '../../src/legacy-runtime/legacyGeometryBudget';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { createFeltExplorer, measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { findFloorIslands } from '../../src/legacy-runtime/legacyMazeIslands';
import {
  MIN_DEAD_END_BRANCH_CELLS,
  collectDeadEndBranches,
  collectOneTileStubs,
  countStubTips,
  fixOneTileStubs,
  forceRemoveOneTileStubs,
  probeDeadEndBranch
} from '../../src/legacy-runtime/legacyMazeStubs';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';

const gridFrom = (rows: readonly string[]): boolean[][] => rows.map((row) => [...row].map((char) => char !== '#'));

describe('one-tile stub analysis (MAZER-GEN-004)', () => {
  // 9 wide, 7 tall; start (1,3), goal (7,3). Row 3 is a corridor (open across the border at x = 0 and 8).
  // A 1-cell nub hangs above it at (5,2), a 2-cell spur below it at (6,4),(6,5), and the run (1..3,2) is a
  // loop through the corridor, not a dead end.
  const rows = [
    '#########',
    '#########',
    '#...#.###',
    '.........',
    '######.##',
    '######.##',
    '#########'
  ];
  const maze = {
    width: 9,
    height: 7,
    grid: gridFrom(rows),
    start: { x: 1, y: 3 },
    goal: { x: 7, y: 3 }
  };

  test('a dead end whose single neighbour is a junction is a branch of length 1; spurs and corridors count their cells', () => {
    const branches = collectDeadEndBranches(maze);
    const byTip = new Map(branches.map((branch) => [`${branch.tip.x},${branch.tip.y}`, branch]));
    // (5,2) is a nub on the corridor cell (5,3): one cell.
    expect(byTip.get('5,2')?.length).toBe(1);
    // (6,5) ends a 2-cell spur (6,5),(6,4) off the corridor cell (6,3).
    expect(byTip.get('6,5')?.length).toBe(2);
    expect(byTip.has('1,2')).toBe(false);
  });

  test('the start and goal caps are never counted, and the wrapped neighbour counts as open', () => {
    // Row 3 is open at x = 0 and x = 8, so (0,3) and (8,3) are joined across the border (torus): neither
    // is a dead end, and the goal cap (7,3) is exempt anyway.
    const tips = collectDeadEndBranches(maze).map((branch) => `${branch.tip.x},${branch.tip.y}`);
    expect(tips).not.toContain('0,3');
    expect(tips).not.toContain('8,3');
    expect(tips).not.toContain('1,3');
    expect(tips).not.toContain('7,3');
    expect(collectOneTileStubs(maze).map((branch) => `${branch.tip.x},${branch.tip.y}`)).toEqual(['5,2']);
  });

  test('the flat-index probe agrees with the grid analysis on every tip', () => {
    const explorer = createFeltExplorer(maze.width, maze.height);
    const open = new Uint8Array(maze.width * maze.height);
    maze.grid.forEach((row, y) => row.forEach((cell, x) => { if (cell) { open[(y * maze.width) + x] = 1; } }));
    const start = (maze.start.y * maze.width) + maze.start.x;
    const goal = (maze.goal.y * maze.width) + maze.goal.x;
    for (const branch of collectDeadEndBranches(maze)) {
      const probe = probeDeadEndBranch(open, explorer.neighbors, (branch.tip.y * maze.width) + branch.tip.x, start, goal);
      expect(probe?.length).toBe(branch.length);
    }
  });

  test('fixOneTileStubs lengthens a nub when the wall has room, walls it up when not, and keeps what the verifier refuses as remaining', () => {
    const width = 11;
    const height = 9;
    const build = (rowsText: readonly string[]): { open: Uint8Array } => {
      const open = new Uint8Array(width * height);
      rowsText.forEach((row, y) => [...row].forEach((char, x) => { if (char !== '#') { open[(y * width) + x] = 1; } }));
      return { open };
    };
    const explorer = createFeltExplorer(width, height);
    const step = [1, -1, width, -width];
    const interior = (cell: number): boolean => {
      const x = cell % width;
      const y = (cell - x) / width;
      return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
    };
    const startCell = (4 * width) + 1;
    const goalCell = (4 * width) + 9;
    // Row 4 is the route. (5,3) is a nub on it with free wall above (room: lengthened), (3,5) a nub below
    // with the wall at (3,6) taken by a second corridor (no room straight, but sides are free).
    const { open } = build([
      '###########',
      '###########',
      '###########',
      '#####.#####',
      '#.........#',
      '###.#######',
      '###########',
      '###########',
      '###########'
    ]);
    const context = { open, neighbors: explorer.neighbors, startCell, goalCell, step, interior, rand: () => 0 };
    expect(countStubTips(context)).toBe(2);
    const result = fixOneTileStubs({ ...context, verify: () => true });
    expect(result.remaining).toBe(0);
    expect(result.removed).toEqual([]);
    expect(result.lengthened.length).toBe(2);
    expect(countStubTips(context)).toBe(0);
    // Lengthening opened exactly one new cell per stub, straight on from the host.
    expect(result.lengthened).toContain((2 * width) + 5);
    expect(result.lengthened).toContain((6 * width) + 3);

    // No room (the one wall cell straight on from the nub touches another floor cell, and the sides touch
    // the route): the nub is walled up instead.
    const crowded = build([
      '###########',
      '#####.#####',
      '###########',
      '#####.#####',
      '#.........#',
      '###########',
      '###########',
      '###########',
      '###########'
    ]);
    const crowdedContext = { open: crowded.open, neighbors: explorer.neighbors, startCell, goalCell, step, interior, rand: () => 0 };
    expect(countStubTips(crowdedContext)).toBe(1);
    const fixed = fixOneTileStubs({ ...crowdedContext, verify: () => true });
    expect(fixed.lengthened).toEqual([]);
    expect(fixed.removed).toEqual([(3 * width) + 5]);
    expect(fixed.remaining).toBe(0);
    expect(crowded.open[(3 * width) + 5]).toBe(0);
    expect(countStubTips(crowdedContext)).toBe(0);

    // A verifier that refuses every edit leaves the stubs and reports them; the grid is restored.
    const refused = build([
      '###########',
      '###########',
      '###########',
      '#####.#####',
      '#.........#',
      '###########',
      '###########',
      '###########',
      '###########'
    ]);
    const snapshot = Array.from(refused.open);
    const refusedResult = fixOneTileStubs({
      open: refused.open, neighbors: explorer.neighbors, startCell, goalCell, step, interior, rand: () => 0, verify: () => false
    });
    expect(refusedResult.remaining).toBe(1);
    expect(refusedResult.lengthened).toEqual([]);
    expect(refusedResult.removed).toEqual([]);
    expect(Array.from(refused.open)).toEqual(snapshot);
  });

  test('a grid without a stub is not touched', () => {
    const width = 11;
    const height = 9;
    const explorer = createFeltExplorer(width, height);
    const open = new Uint8Array(width * height);
    for (let x = 1; x <= 9; x += 1) { open[(4 * width) + x] = 1; }
    const snapshot = Array.from(open);
    let calls = 0;
    const result = fixOneTileStubs({
      open,
      neighbors: explorer.neighbors,
      startCell: (4 * width) + 1,
      goalCell: (4 * width) + 9,
      step: [1, -1, width, -width],
      interior: () => true,
      rand: () => { calls += 1; return 0; },
      verify: () => { calls += 1; return true; }
    });
    expect(result).toEqual({ lengthened: [], removed: [], remaining: 0 });
    expect(calls).toBe(0);
    expect(Array.from(open)).toEqual(snapshot);
  });

  test('the backstop walls up every remaining stub tip and nothing else', () => {
    const grid = gridFrom(rows);
    const copy = { ...maze, grid };
    const removed = forceRemoveOneTileStubs(copy);
    expect(removed).toEqual([{ x: 5, y: 2 }]);
    expect(collectOneTileStubs(copy)).toEqual([]);
    expect(grid[3]!.every((cell) => cell)).toBe(true);
  });

  test('the minimum is two cells: one-tile stubs are what the owner named', () => {
    expect(MIN_DEAD_END_BRANCH_CELLS).toBe(2);
  });
});

// Every generated ladder maze, every band, both frozen boards: no dead-end branch shorter than the rule's
// minimum (the start and goal caps excepted), the maze still solvable and connected, deterministic per seed,
// and the contracts the ladder pins (felt window, exact fringe count) intact.
const PROPERTY_LEVELS = [2, 3, 10, 20, 50, 100, 139, 150, 198, 218, 268, 288, 289, 293, 298, 299, 300, 999] as const;
const PROPERTY_SEEDS = 10;

const reachableFloor = (maze: LegacyMazeSnapshot): Set<number> => {
  const { width, height, grid } = maze;
  const seen = new Set<number>();
  const queue = [(maze.start.y * width) + maze.start.x];
  seen.add(queue[0]!);
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!;
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = (x + dx + width) % width;
      const ny = (y + dy + height) % height;
      const next = (ny * width) + nx;
      if (grid[ny]![nx] && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
};

describe('no one-tile stubs in any generated ladder maze', () => {
  test('zero stubs, solvable, start and goal on open floor, on every sampled level and board', () => {
    let mazes = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of PROPERTY_LEVELS) {
        for (let index = 0; index < PROPERTY_SEEDS; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          mazes += 1;
          const label = `${board.name} level ${level} seed ${index}`;
          expect(collectOneTileStubs(maze), label).toEqual([]);
          for (const branch of collectDeadEndBranches(maze)) {
            expect(branch.length, label).toBeGreaterThanOrEqual(MIN_DEAD_END_BRANCH_CELLS);
          }
          // Start and goal are open floor, distinct, and the route joins them step by step.
          expect(maze.grid[maze.start.y]![maze.start.x], label).toBe(true);
          expect(maze.grid[maze.goal.y]![maze.goal.x], label).toBe(true);
          expect(maze.solutionPath[0], label).toEqual(maze.start);
          expect(maze.solutionPath[maze.solutionPath.length - 1], label).toEqual(maze.goal);
          // The goal is reachable from the start over open floor (torus steps), and so is EVERY floor tile
          // (MAZER-GEN-005: no orphan islands; the dedicated sweep is tests/reset/legacy-maze-islands.test.ts).
          expect(reachableFloor(maze).has((maze.goal.y * maze.width) + maze.goal.x), label).toBe(true);
          expect(findFloorIslands(maze).islands, label).toEqual([]);
          // The explorer solves it (the felt number is a solved run).
          expect(measureFelt(maze).steps, label).toBeGreaterThan(0);
          // The rule needs no last-resort edit.
          expect(maze.stubStats?.forced ?? 0, label).toBe(0);
        }
      }
    }
    expect(mazes).toBe(PROPERTY_LEVELS.length * PROPERTY_SEEDS * LADDER_BOARDS.length);
  }, 240_000);

  test('deterministic per seed: the same level and seed give the same maze, stubStats included', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [20, 150, 290, 300]) {
        const first = generateLadderMaze(level, board, seedForIndex(3));
        const second = generateLadderMaze(level, board, seedForIndex(3));
        expect(hashLadderMaze(second)).toBe(hashLadderMaze(first));
        expect(second.stubStats).toEqual(first.stubStats);
      }
    }
  });

  test('the ladder contracts hold on the sampled mazes: felt in its window past the felt saturation, exact fringe count', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [GEOMETRY_BUDGET_FELT_SATURATION_LEVEL + 1, GEOMETRY_BUDGET_FELT_SATURATION_LEVEL + 5, LAST_BUDGET_LEVEL, 300]) {
        for (let index = 0; index < 6; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          const label = `${board.name} level ${level} seed ${index}`;
          expect(maze.fringeStats?.cells ?? 0, label).toBe(resolveGeometryBudgetFringeCells(level));
          const felt = measureFelt(maze).steps - (maze.loopStats?.saved ?? 0) - (maze.wrapStats?.saved ?? 0);
          expect(felt, label).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET);
          expect(felt, label).toBeLessThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET + GEOMETRY_BUDGET_WINDOW);
        }
      }
    }
  }, 120_000);

  test('the level-1 corridor has no branches at all, and the rule leaves it alone', () => {
    for (const board of LADDER_BOARDS) {
      const maze = generateLadderMaze(1, board, seedForIndex(0));
      expect(collectDeadEndBranches(maze)).toEqual([]);
      expect(maze.stubStats).toBeUndefined();
    }
  });
});
