import { describe, expect, test } from 'vitest';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { fillFloorIslands, fillUnreachableCells, findFloorIslands } from '../../src/legacy-runtime/legacyMazeIslands';
import { collectDeadEndBranches, MIN_DEAD_END_BRANCH_CELLS } from '../../src/legacy-runtime/legacyMazeStubs';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';

const gridFrom = (rows: readonly string[]): boolean[][] => rows.map((row) => [...row].map((char) => char !== '#'));
const boardNamed = (name: string) => LADDER_BOARDS.find((candidate) => candidate.name === name)!;

describe('floor island analysis (MAZER-GEN-005)', () => {
  // 7 wide, 5 tall. The corridor on row 2 runs across both borders and (3,0),(3,1) hang off it; (5,4) is a lone cell.
  const rows = [
    '###.###',
    '###.###',
    '.......',
    '#######',
    '#####.#'
  ];
  const maze = { width: 7, height: 5, grid: gridFrom(rows), start: { x: 1, y: 2 } };

  test('finds the one orphan cell and counts floor, reachable and island cells', () => {
    const report = findFloorIslands(maze);
    expect(report.islands.map((island) => island.cells)).toEqual([[{ x: 5, y: 4 }]]);
    expect(report.islandCells).toBe(1);
    expect(report.floorCells).toBe(10);
    expect(report.reachableCells).toBe(9);
  });

  test('a floor tile on one border is adjacent to the opposite border (wrap); the planar view disagrees', () => {
    const wrapOnly = { width: 5, height: 3, grid: gridFrom(['.#...', '#####', '#####']), start: { x: 0, y: 0 } };
    expect(findFloorIslands(wrapOnly).islands).toEqual([]);
    expect(findFloorIslands(wrapOnly, false).islands.map((island) => island.cells)).toEqual([[{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]]);
  });

  test('fillFloorIslands walls up exactly the unreachable cells, row-major, and a second pass finds nothing', () => {
    const copy = { ...maze, grid: gridFrom(rows) };
    expect(fillFloorIslands(copy)).toEqual([{ x: 5, y: 4 }]);
    expect(copy.grid[4]![5]).toBe(false);
    expect(findFloorIslands(copy).islands).toEqual([]);
    expect(fillFloorIslands(copy)).toEqual([]);
  });

  test('fillUnreachableCells (the tuner\'s flat-index twin) agrees on a torus neighbour table', () => {
    const { width, height } = maze;
    const open = new Uint8Array(width * height);
    maze.grid.forEach((row, y) => row.forEach((cell, x) => { open[(y * width) + x] = cell ? 1 : 0; }));
    const neighbors = new Int32Array(width * height * 4);
    for (let cell = 0; cell < width * height; cell += 1) {
      const x = cell % width;
      const y = (cell - x) / width;
      neighbors[cell * 4] = (y * width) + ((x + 1) % width);
      neighbors[(cell * 4) + 1] = (y * width) + ((x + width - 1) % width);
      neighbors[(cell * 4) + 2] = (((y + 1) % height) * width) + x;
      neighbors[(cell * 4) + 3] = (((y + height - 1) % height) * width) + x;
    }
    expect(fillUnreachableCells(open, neighbors, (2 * width) + 1)).toEqual([(4 * width) + 5]);
    expect(open[(4 * width) + 5]).toBe(0);
    expect(fillUnreachableCells(open, neighbors, (2 * width) + 1)).toEqual([]);
  });
});

// Mazes that carried an orphan island on origin/main before MAZER-GEN-005 (board, level, seed index).
// Group 1: a wrap spoke the base build carved on a column with no floor (a 51-cell orphan corridor).
// Group 2: stretch detours stranded when a ceiling-dropped loop connector closed.
const FORMER_BASE_ORPHANS = [['phone', 11, 2], ['phone', 116, 4], ['phone', 122, 2], ['phone', 124, 2], ['phone', 129, 5]] as const;
const FORMER_STRANDED_DETOURS = [
  ['phone', 254, 5], ['phone', 266, 1], ['phone', 269, 0], ['phone', 269, 4], ['phone', 272, 3], ['phone', 275, 0], ['phone', 278, 4],
  ['desktop', 288, 7], ['desktop', 300, 7], ['desktop', 999, 7]
] as const;

// The MAZER-GEN-006 property-test level list (the sample the board card's "about 6 percent" was read from)
// plus a stride over the whole ladder.
const PROPERTY_LEVELS = [2, 3, 10, 20, 50, 100, 139, 150, 198, 218, 268, 288, 289, 293, 298, 299, 300, 999] as const;
const STRIDE_LEVELS = Array.from({ length: 43 }, (_, index) => 5 + (index * 7));

describe('no generated ladder maze carries unreachable floor (MAZER-GEN-005)', () => {
  test('the mazes that used to carry an island are now clean and still solved by the explorer', () => {
    for (const [boardName, level, index] of [...FORMER_BASE_ORPHANS, ...FORMER_STRANDED_DETOURS]) {
      const maze = generateLadderMaze(level, boardNamed(boardName), seedForIndex(index));
      const label = `${boardName} level ${level} seed ${index}`;
      expect(findFloorIslands(maze).islands, label).toEqual([]);
      expect(measureFelt(maze).steps, label).toBeGreaterThan(0);
      expect(maze.islandStats?.forced ?? 0, label).toBe(0);
    }
  });

  test('a base whose wrap spoke could not join the maze is passed over for one that keeps its wrap', () => {
    for (const [boardName, level, index] of FORMER_BASE_ORPHANS) {
      const maze = generateLadderMaze(level, boardNamed(boardName), seedForIndex(index));
      expect(maze.islandStats?.base ?? 0, `${boardName} level ${level} seed ${index}`).toBe(0);
    }
  });

  test('a loop connector closed by the ceiling no longer strands its stretch detours: they are walled up in the tuner', () => {
    // The golden-fixture seed of phone level 278 (20261106 + level) stranded 8 detour cells on origin/main.
    const maze = generateLadderMaze(278, boardNamed('phone'), 20261106 + 278);
    expect(maze.islandStats?.dropped ?? 0).toBeGreaterThan(0);
    expect(findFloorIslands(maze).islands).toEqual([]);
  });

  test('zero islands over a seed sweep of both boards (property levels x 8 seeds, plus a stride over 5..299 x 2 seeds)', () => {
    let mazes = 0;
    const check = (level: number, board: typeof LADDER_BOARDS[number], index: number): void => {
      const maze = generateLadderMaze(level, board, seedForIndex(index));
      mazes += 1;
      const label = `${board.name} level ${level} seed ${index}`;
      const report = findFloorIslands(maze);
      expect(report.islands.map((island) => island.cells.length), label).toEqual([]);
      expect(report.reachableCells, label).toBe(report.floorCells);
      // The last-resort sweep at the end of the tune is never what saved the maze.
      expect(maze.islandStats?.forced ?? 0, label).toBe(0);
      // The one-tile stub rule still holds on the cleaned maze.
      for (const branch of collectDeadEndBranches(maze)) { expect(branch.length, label).toBeGreaterThanOrEqual(MIN_DEAD_END_BRANCH_CELLS); }
    };
    for (const board of LADDER_BOARDS) {
      for (const level of PROPERTY_LEVELS) { for (let index = 0; index < 8; index += 1) { check(level, board, index); } }
      for (const level of STRIDE_LEVELS) { for (let index = 0; index < 2; index += 1) { check(level, board, index + 8); } }
    }
    expect(mazes).toBe(LADDER_BOARDS.length * ((PROPERTY_LEVELS.length * 8) + (STRIDE_LEVELS.length * 2)));
  }, 600_000);

  test('deterministic: the same level and seed give the same maze, islandStats included', () => {
    for (const [boardName, level, index] of [...FORMER_BASE_ORPHANS.slice(0, 2), ...FORMER_STRANDED_DETOURS.slice(0, 3)]) {
      const board = boardNamed(boardName);
      const first = generateLadderMaze(level, board, seedForIndex(index));
      const second = generateLadderMaze(level, board, seedForIndex(index));
      expect(hashLadderMaze(second)).toBe(hashLadderMaze(first));
      expect(second.islandStats).toEqual(first.islandStats);
    }
  });
});
