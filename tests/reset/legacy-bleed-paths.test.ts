import { describe, expect, test } from 'vitest';
import {
  auditBleedPaths,
  enforceBleedPathLimits,
  isBleedPathAvailable,
  listBleedPaths,
  measureBleedShortestSteps,
  resolveBleedAxisCap,
  selectBleedPathsToKeep,
  type BleedLimitOptions
} from '../../src/legacy-runtime/legacyBleedPaths';
import { createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';

// 11 wide x 9 tall ring-free grid: one long corridor along row 4 plus open border cells on chosen rows.
const makeGrid = (width: number, height: number, floor: Array<[number, number]>): boolean[][] => {
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  floor.forEach(([x, y]) => { grid[y]![x] = true; });
  return grid;
};

const row = (y: number, from: number, to: number): Array<[number, number]> => (
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, y] as [number, number])
);

// A snake: start (1,1) goes right along row 1, down column 9, back left along row 7 to goal (1,7).
// Wrapping row 1 <-> row 7 is not possible, but the left/right border of row 1 and row 7 are.
const snake = (borderRows: number[]): { grid: boolean[][]; start: { x: number; y: number }; goal: { x: number; y: number } } => {
  const floor = [...row(1, 1, 9), ...row(7, 1, 9), ...[2, 3, 4, 5, 6].map((y) => [9, y] as [number, number])];
  const grid = makeGrid(11, 9, floor);
  borderRows.forEach((y) => { grid[y]![0] = true; grid[y]![10] = true; });
  return { grid, start: { x: 1, y: 1 }, goal: { x: 1, y: 7 } };
};

const options = (over: Partial<BleedLimitOptions> = {}): BleedLimitOptions => ({
  capPerAxis: { horizontal: 1, vertical: 1 },
  requiredAxes: { horizontal: false, vertical: false },
  minRouteRatio: 0.6,
  maxSingleSavingRatio: 0.3,
  minSeparation: () => 3,
  ...over
});

describe('bleed path audit', () => {
  test('lists paired border openings per axis and ignores one-sided ones', () => {
    const { grid } = snake([1, 7]);
    grid[4]![0] = true;
    expect(listBleedPaths(grid)).toEqual([
      { axis: 'horizontal', line: 1 },
      { axis: 'horizontal', line: 7 }
    ]);
  });

  test('wrap steps are measured with and without each path', () => {
    const { grid, start, goal } = snake([1, 7]);
    const open = measureBleedShortestSteps(grid, start, goal);
    const shut = measureBleedShortestSteps(grid, start, goal, new Set(['horizontal:1', 'horizontal:7']));
    expect(shut).toBe(8 + 6 + 8);
    expect(open).toBeLessThan(shut!);
    const audit = auditBleedPaths(grid, start, goal);
    expect(audit.directSteps).toBe(shut);
    expect(audit.perAxis).toEqual({ horizontal: 2, vertical: 0 });
    expect(audit.paths.every((path) => path.saving >= 0)).toBe(true);
    expect(audit.playableSteps).toBeLessThan(audit.directSteps!);
  });

  test('a gated path is unavailable until its gate is triggered', () => {
    const { grid, start, goal } = snake([1, 7]);
    const path = { axis: 'horizontal' as const, line: 1, gated: true };
    expect(isBleedPathAvailable(path)).toBe(false);
    expect(isBleedPathAvailable(path, new Set(['horizontal:1']))).toBe(true);
    expect(isBleedPathAvailable({ axis: 'horizontal', line: 1 })).toBe(true);
    const gated = auditBleedPaths(grid, start, goal, new Set());
    expect(gated.playableSteps).toBeLessThan(gated.directSteps!);
  });

  test('resolveBleedAxisCap is 1 unless the axis is large and 2 were asked for', () => {
    expect(resolveBleedAxisCap(27, 2)).toBe(1);
    expect(resolveBleedAxisCap(45, 1)).toBe(1);
    expect(resolveBleedAxisCap(45, 2)).toBe(2);
    expect(resolveBleedAxisCap(51, null)).toBe(1);
  });
});

describe('bleed path limits', () => {
  test('a path is rejected when keeping it would push the route below the floor', () => {
    const { grid, start, goal } = snake([1, 7]);
    // Each row alone saves 5 of 22 steps; both together leave 12 (55 percent), under the 60 percent floor.
    const result = selectBleedPathsToKeep(grid, start, goal, options({ capPerAxis: { horizontal: 2, vertical: 1 } }));
    expect(result.kept).toHaveLength(1);
    expect(result.closed).toHaveLength(1);
  });

  test('a path that saves more than the single-path share is rejected', () => {
    const { grid, start, goal } = snake([1, 7]);
    const result = selectBleedPathsToKeep(grid, start, goal, options({ maxSingleSavingRatio: 0.1 }));
    expect(result.kept).toEqual([]);
  });

  test('a required axis keeps its least harmful path even over the limits', () => {
    const { grid, start, goal } = snake([1, 7]);
    const kept = selectBleedPathsToKeep(grid, start, goal, options({
      maxSingleSavingRatio: 0.1,
      requiredAxes: { horizontal: true, vertical: false }
    })).kept;
    expect(kept).toHaveLength(1);
  });

  test('cap per axis and spacing: two far apart pass only when the cap is 2', () => {
    const grid = makeGrid(11, 21, [...row(10, 1, 9), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((y) => [5, y] as [number, number]), ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((y) => [5, y] as [number, number])]);
    [3, 17].forEach((y) => { grid[y]![0] = true; grid[y]![10] = true; grid[y]![1] = true; });
    const start = { x: 5, y: 1 };
    const goal = { x: 5, y: 19 };
    const loose = options({ minRouteRatio: 0, maxSingleSavingRatio: 1, minSeparation: () => 8 });
    expect(selectBleedPathsToKeep(grid, start, goal, { ...loose, capPerAxis: { horizontal: 1, vertical: 1 } }).kept).toHaveLength(1);
    expect(selectBleedPathsToKeep(grid, start, goal, { ...loose, capPerAxis: { horizontal: 2, vertical: 1 } }).kept).toHaveLength(2);
    expect(selectBleedPathsToKeep(grid, start, goal, { ...loose, capPerAxis: { horizontal: 2, vertical: 1 }, minSeparation: () => 20 }).kept).toHaveLength(1);
  });

  test('enforce clears both border cells of every closed path and is deterministic', () => {
    const a = snake([1, 7]);
    const b = snake([1, 7]);
    const first = enforceBleedPathLimits(a.grid, a.start, a.goal, options({ maxSingleSavingRatio: 0.1 }));
    const second = enforceBleedPathLimits(b.grid, b.start, b.goal, options({ maxSingleSavingRatio: 0.1 }));
    expect(first).toEqual(second);
    expect(first.clearedTiles).toHaveLength(4);
    expect(listBleedPaths(a.grid)).toEqual([]);
  });
});

describe('generation applies the limits', () => {
  test('mazes carry at most one bleed path per axis on a board below the large threshold, same seed same maze', () => {
    for (const seed of [11, 202, 3003]) {
      const profile = {
        bleedPlacement: 'least-saving' as const,
        borderFeederTargetPerSide: 3,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        checkpointCountOverride: 8
      };
      const maze = createLegacyMaze(25, 25, seed, 6, profile);
      const again = createLegacyMaze(25, 25, seed, 6, profile);
      expect(again.grid).toEqual(maze.grid);
      const paths = listBleedPaths(maze.grid);
      expect(paths.filter((p) => p.axis === 'horizontal').length).toBeLessThanOrEqual(1);
      expect(paths.filter((p) => p.axis === 'vertical').length).toBeLessThanOrEqual(1);
    }
  });

  test('least-saving placement keeps a required wrap and keeps its saving modest', () => {
    for (const seed of [5, 77, 909]) {
      const maze = createLegacyMaze(31, 31, seed, 4, {
        requiredOppositeBorderConnections: { horizontal: false, vertical: true },
        bleedPlacement: 'least-saving'
      });
      const audit = auditBleedPaths(maze.grid, maze.start, maze.goal);
      expect(audit.perAxis.vertical).toBe(1);
      expect(audit.directSteps).not.toBeNull();
    }
  });
});
