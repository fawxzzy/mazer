import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_FILL_FIRST_LEVEL,
  resolveGeometryBudgetFillFloor,
  resolveGeometryBudgetProfileForRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { HALL_MIN_CELLS, analyzeMazeDensity } from '../../src/legacy-runtime/legacyMazeDensity';
import { measureFelt, measureFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { collectOneTileStubs } from '../../src/legacy-runtime/legacyMazeStubs';
import { analyzeMazeWinding } from '../../src/legacy-runtime/legacyMazeWinding';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';

const gridFrom = (rows: readonly string[]): boolean[][] => rows.map((row) => [...row].map((char) => char !== '#'));

describe('density metrics (MAZER-GEN-007)', () => {
  test('the largest blank patch is an all-wall block inside the interior, and a long straight hall is counted', () => {
    const rows = [
      '###############',
      '#.............#',
      '#.###########.#',
      '#.###########.#',
      '#.###########.#',
      '#.............#',
      '###############'
    ];
    const m = analyzeMazeDensity({ width: 15, height: 7, grid: gridFrom(rows) });
    // The wall block between the two corridors: 11 wide, 3 tall.
    expect(m.emptyRectW).toBe(11);
    expect(m.emptyRectH).toBe(3);
    expect(m.emptyRectArea).toBe(33);
    expect(m.blankPatches).toBe(1);
    // Row 1 and row 5 are 13-cell halls less their two corner cells: 11 in-line cells each.
    expect(m.hallCount).toBeGreaterThanOrEqual(2);
    expect(m.longestHall).toBeGreaterThanOrEqual(HALL_MIN_CELLS);
    expect(m.floorCells).toBe(13 + 13 + 3 + 3);
  });

  test('a junction inside a hall breaks it', () => {
    const rows = [
      '###############',
      '#.............#',
      '######.########',
      '###############'
    ].map((row) => row.slice(0, 15).padEnd(15, '#'));
    const m = analyzeMazeDensity({ width: 15, height: 4, grid: gridFrom(rows) });
    expect(m.hallCount).toBe(0);
  });
});

describe('density fill floor schedule', () => {
  test('zero for the corridor and the tutorial mazes, rising and within the old floors from level 10', () => {
    for (const level of [0, 1, 2, 9, Number.NaN]) {
      expect(resolveGeometryBudgetFillFloor(level)).toBe(0);
    }
    // The fringe levels carry the felt saturation level's own fill (their maze is that maze plus the fringe).
    for (const level of [GEOMETRY_BUDGET_FELT_SATURATION_LEVEL + 1, 500]) {
      expect(resolveGeometryBudgetFillFloor(level)).toBe(resolveGeometryBudgetFillFloor(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL));
    }
    expect(GEOMETRY_BUDGET_FILL_FIRST_LEVEL).toBe(10);
    let previous = 0;
    for (let level = 10; level <= GEOMETRY_BUDGET_FELT_SATURATION_LEVEL; level += 1) {
      const floor = resolveGeometryBudgetFillFloor(level);
      expect(floor).toBeGreaterThanOrEqual(previous);
      previous = floor;
    }
    // 97 percent of the old mean floor at the control points (origin/main: 413 at level 50, 460 at 100).
    expect(resolveGeometryBudgetFillFloor(50)).toBe(400);
    expect(resolveGeometryBudgetFillFloor(100)).toBe(446);
  });
});

describe('tuner lever 6: density fill', () => {
  const build = (seed: number) => {
    for (let attempt = 0; ; attempt += 1) {
      const maze = createLegacyRuntimeMazeForMode('play', 35, seed + (attempt * 1009), resolveGeometryBudgetProfileForRungs(0), {}, 23 / 51);
      const route = measureFelt(maze).pathLength;
      if ((route >= 40 && route <= 130) || attempt > 40) { return maze; }
    }
  };
  const floorOf = (grid: boolean[][]): number => grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const blocks = (grid: boolean[][]): number => {
    let count = 0;
    for (let y = 0; y + 1 < grid.length; y += 1) {
      for (let x = 0; x + 1 < grid[0]!.length; x += 1) {
        if (grid[y]![x] && grid[y]![x + 1] && grid[y + 1]![x] && grid[y + 1]![x + 1]) { count += 1; }
      }
    }
    return count;
  };

  test('omitted or 0 is byte-identical; a fill keeps the landed felt number, adds floor, makes no stub, no 2x2 block, and no turn', () => {
    let filledMazes = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const maze = build(seed);
      const target = measureFeltSteps(maze) + 160;
      const options = { routeTarget: 0, maxBranch: 20, straightBranches: true };
      const plain = tuneMazeFeltToTarget(maze, target, seed + 7, options);
      const zero = tuneMazeFeltToTarget(maze, target, seed + 7, { ...options, fillFloor: 0 });
      expect(zero.grid).toEqual(plain.grid);
      expect(plain.fillTiles).toEqual([]);
      if (!plain.onTarget) { continue; }
      const wanted = floorOf(plain.grid) + 40;
      const filled = tuneMazeFeltToTarget(maze, target, seed + 7, { ...options, fillFloor: wanted });
      if (!filled.onTarget) { continue; }
      // Same maze apart from the fill (the plain tuning landed on its first attempt; the filled one may restart).
      if (floorOf(filled.grid) - filled.fillTiles.length !== floorOf(plain.grid)) { continue; }
      filledMazes += 1;
      expect(filled.felt).toBe(plain.felt);
      expect(measureFeltSteps({ ...maze, grid: filled.grid })).toBe(plain.felt);
      expect(filled.fillTiles.length).toBeGreaterThan(0);
      expect(floorOf(filled.grid)).toBeGreaterThan(floorOf(plain.grid));
      expect(collectOneTileStubs({ ...maze, grid: filled.grid })).toEqual([]);
      expect(blocks(filled.grid)).toBe(blocks(plain.grid));
      const asMaze = (grid: boolean[][]) => ({ width: maze.width, height: maze.height, grid, start: maze.start, goal: maze.goal });
      expect(analyzeMazeWinding(asMaze(filled.grid)).totalTurns).toBeLessThanOrEqual(analyzeMazeWinding(asMaze(plain.grid)).totalTurns);
      expect(analyzeMazeDensity(asMaze(filled.grid)).hallCount).toBeLessThanOrEqual(analyzeMazeDensity(asMaze(plain.grid)).hallCount);
    }
    expect(filledMazes).toBeGreaterThanOrEqual(3);
  });
});

// Baseline (origin/main 1b2d8ebf, 50 seeds per band, phone and desktop averaged): mean floor cells and mean largest
// blank patch (cells).
const BASELINE_FLOOR: Readonly<Record<number, number>> = { 20: 324, 50: 413, 100: 460, 150: 483, 198: 522 };
const BASELINE_EMPTY_RECT: Readonly<Record<number, number>> = { 20: 195, 50: 135, 100: 82, 150: 62, 198: 33 };

describe('the filled ladder is as dense as before (MAZER-GEN-007)', () => {
  test('mean floor within 7 percent of the old maze (measured 94 to 96 percent), largest blank patch within 1.5 times the old one, from level 20 to 198', () => {
    for (const level of [20, 50, 100, 150, 198]) {
      let floor = 0;
      let rect = 0;
      let mazes = 0;
      for (const board of LADDER_BOARDS) {
        for (let index = 0; index < 10; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index));
          const density = analyzeMazeDensity(maze);
          floor += density.floorCells;
          rect += density.emptyRectArea;
          mazes += 1;
          expect(collectOneTileStubs(maze), `${board.name} level ${level} seed ${index}`).toEqual([]);
        }
      }
      expect(floor / mazes, `floor level ${level}`).toBeGreaterThanOrEqual(BASELINE_FLOOR[level]! * 0.93);
      expect(rect / mazes, `blank patch level ${level}`).toBeLessThanOrEqual(BASELINE_EMPTY_RECT[level]! * 1.5);
    }
  }, 240_000);

  test('deterministic per seed with the fill', () => {
    for (const board of LADDER_BOARDS) {
      const first = generateLadderMaze(60, board, seedForIndex(2));
      expect(hashLadderMaze(generateLadderMaze(60, board, seedForIndex(2)))).toBe(hashLadderMaze(first));
    }
  });
});
