import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_TAPE_LENGTH,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetProfileForRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { DECOY_TUNING_TOLERANCE, tuneMazeProxyToTarget } from '../../src/legacy-runtime/legacyMazeDecoyTuning';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

const build = (rungs: number, seed: number, aspectRatio: number) => {
  const maze = createLegacyRuntimeMazeForMode('play', 35, seed, resolveGeometryBudgetProfileForRungs(rungs), {}, aspectRatio);
  return { maze, base: measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)) };
};

const neighbors = (grid: boolean[][], x: number, y: number): [number, number][] => {
  const h = grid.length;
  const w = grid[0]!.length;
  return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .map(([dx, dy]) => [(x + dx + w) % w, (y + dy + h) % h] as [number, number])
    .filter(([nx, ny]) => grid[ny]![nx] === true);
};

const edgeCount = (grid: boolean[][]): number => {
  let degreeSum = 0;
  grid.forEach((row, y) => row.forEach((cell, x) => { if (cell) { degreeSum += neighbors(grid, x, y).length; } }));
  return degreeSum / 2;
};
const floorCount = (grid: boolean[][]): number => grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

describe('decoy tuning', () => {
  const boards = [23 / 51, 45 / 27, 1];

  test('lands within tolerance of every reachable target, up and down', () => {
    for (const aspect of boards) {
      for (const seed of [11, 4242, 90001]) {
        const { maze, base } = build(20, seed, aspect);
        for (const target of [base.total - 6, base.total + 4, base.total + 41, base.total + 160]) {
          const result = tuneMazeProxyToTarget(maze, base, target, seed + 1);
          expect(result.onTarget).toBe(true);
          expect(Math.abs(result.proxy - target)).toBeLessThanOrEqual(DECOY_TUNING_TOLERANCE);
        }
      }
    }
  });

  test('reported proxy equals the independently re-measured proxy of the returned grid', () => {
    const { maze, base } = build(30, 777, boards[0]!);
    const result = tuneMazeProxyToTarget(maze, base, base.total + 80, 5);
    const tuned = { ...maze, grid: result.grid };
    const remeasured = measureGeometryBudgetProxy(tuned, resolveLegacyMazeComplexity(tuned)).total;
    expect(remeasured).toBeCloseTo(result.proxy, 9);
  });

  test('keeps the solution path, start, goal, border ring and tree-ness intact', () => {
    for (const aspect of boards) {
      const { maze, base } = build(30, 321, aspect);
      for (const delta of [-25, 60, 200]) {
        const result = tuneMazeProxyToTarget(maze, base, base.total + delta, 9);
        const grid = result.grid;
        maze.solutionPath.forEach((point) => expect(grid[point.y]![point.x]).toBe(true));
        expect(grid[maze.start.y]![maze.start.x]).toBe(true);
        expect(grid[maze.goal.y]![maze.goal.x]).toBe(true);
        for (let x = 0; x < maze.width; x += 1) {
          expect(grid[0]![x]).toBe(maze.grid[0]![x]);
          expect(grid[maze.height - 1]![x]).toBe(maze.grid[maze.height - 1]![x]);
        }
        for (let y = 0; y < maze.height; y += 1) {
          expect(grid[y]![0]).toBe(maze.grid[y]![0]);
          expect(grid[y]![maze.width - 1]).toBe(maze.grid[y]![maze.width - 1]);
        }
        // Every cell added/removed carries exactly one edge: no cycle created or removed.
        expect(edgeCount(grid) - edgeCount(maze.grid)).toBe(floorCount(grid) - floorCount(maze.grid));
        // Still one connected component containing start and goal.
        const seen = new Set<string>([`${maze.start.x},${maze.start.y}`]);
        const stack: [number, number][] = [[maze.start.x, maze.start.y]];
        while (stack.length > 0) {
          const [x, y] = stack.pop()!;
          neighbors(grid, x, y).forEach(([nx, ny]) => {
            const key = `${nx},${ny}`;
            if (!seen.has(key)) { seen.add(key); stack.push([nx, ny]); }
          });
        }
        expect(seen.has(`${maze.goal.x},${maze.goal.y}`)).toBe(true);
        expect(seen.size).toBe(floorCount(grid));
      }
    }
  });

  test('is deterministic, never mutates its input and differs by seed', () => {
    const { maze, base } = build(30, 555, boards[1]!);
    const before = JSON.stringify(maze.grid);
    const a = tuneMazeProxyToTarget(maze, base, base.total + 90, 3);
    const b = tuneMazeProxyToTarget(maze, base, base.total + 90, 3);
    const c = tuneMazeProxyToTarget(maze, base, base.total + 90, 4);
    expect(JSON.stringify(maze.grid)).toBe(before);
    expect(JSON.stringify(a.grid)).toBe(JSON.stringify(b.grid));
    expect(JSON.stringify(a.grid)).not.toBe(JSON.stringify(c.grid));
  });

  test('reports capacity exhaustion instead of looping', () => {
    const { maze, base } = build(GEOMETRY_BUDGET_TAPE_LENGTH, 12, boards[0]!);
    const result = tuneMazeProxyToTarget(maze, base, 1e6, 1, { maxEdits: 5000 });
    expect(result.capacityExhausted).toBe(true);
    expect(result.onTarget).toBe(false);
    expect(result.proxy).toBeGreaterThan(base.total);
  });

  test('source is free of ambient nondeterminism', () => {
    const source = readFileSync(new URL('../../src/legacy-runtime/legacyMazeDecoyTuning.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
  });
});
