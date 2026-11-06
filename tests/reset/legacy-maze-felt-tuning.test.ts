import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_WINDOW,
  resolveGeometryBudgetProfile,
  resolveGeometryBudgetProfileForRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { analyzeFeltStructure, measureFelt, measureFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { FELT_TUNING_OVERSHOOT, tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { resolveLegacyPlayableShortestPath, resolveLegacyShortestPath } from '../../src/legacy-runtime/legacyMaze';

const BOARDS = [23 / 51, 45 / 27];

// A base maze for a seed; a degenerate base (start and goal a few cells apart, or a
// huge route) walks on to the next seed so the tests exercise ordinary mazes.
const build = (rungs: number, seed: number, aspectRatio: number) => {
  for (let attempt = 0; ; attempt += 1) {
    const maze = createLegacyRuntimeMazeForMode('play', 35, seed + (attempt * 1009), resolveGeometryBudgetProfileForRungs(rungs), {}, aspectRatio);
    const route = measureFelt(maze).pathLength;
    if ((route >= 40 && route <= 130) || attempt > 40) { return maze; }
  }
};

const floorCount = (grid: boolean[][]): number => grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
const openTwoByTwoBlocks = (grid: boolean[][]): number => {
  let blocks = 0;
  for (let y = 0; y + 1 < grid.length; y += 1) {
    for (let x = 0; x + 1 < grid[0]!.length; x += 1) {
      if (grid[y]![x] && grid[y]![x + 1] && grid[y + 1]![x] && grid[y + 1]![x + 1]) { blocks += 1; }
    }
  }
  return blocks;
};

describe('felt tuning', () => {
  test('lands inside [target, target + overshoot] for reachable targets, up and down', () => {
    expect(FELT_TUNING_OVERSHOOT).toBe(GEOMETRY_BUDGET_WINDOW);
    for (const aspect of BOARDS) {
      for (const seed of [11, 4242, 90001]) {
        const maze = build(0, seed, aspect);
        const base = measureFeltSteps(maze);
        for (const target of [base + 4, base + 41, base + 160, base + 330]) {
          const result = tuneMazeFeltToTarget(maze, target, seed + 1, { routeTarget: 120, maxBranch: 20 });
          expect(result.onTarget).toBe(true);
          expect(result.felt).toBeGreaterThanOrEqual(target);
          expect(result.felt).toBeLessThanOrEqual(target + FELT_TUNING_OVERSHOOT);
          expect(result.windowDistance).toBe(0);
        }
      }
    }
  });

  test('the reported felt value equals the independent re-measure of the returned grid', () => {
    const maze = build(0, 777, BOARDS[0]!);
    const result = tuneMazeFeltToTarget(maze, measureFeltSteps(maze) + 150, 5, { routeTarget: 140 });
    expect(measureFeltSteps({ ...maze, grid: result.grid })).toBe(result.felt);
  });

  test('can also trim a maze that is above the target', () => {
    let trimmed = 0;
    let grownOk = 0;
    for (const seed of [31, 32, 33, 34, 35, 36]) {
      const maze = build(1, seed, BOARDS[1]!);
      const base = measureFeltSteps(maze);
      const grown = tuneMazeFeltToTarget(maze, base + 200, seed, { maxBranch: 20 });
      if (!grown.onTarget) { continue; }
      grownOk += 1;
      const heavy = { ...maze, grid: grown.grid };
      const result = tuneMazeFeltToTarget(heavy, base + 100, seed + 5, { maxBranch: 20 });
      expect(result.onTarget).toBe(true);
      expect(result.felt).toBeLessThan(grown.felt);
      trimmed += result.cellsTrimmed;
    }
    expect(grownOk).toBeGreaterThanOrEqual(3);
    expect(trimmed).toBeGreaterThan(0);
  });

  test('never touches the border ring, the start or the goal, and never mutates its input', () => {
    for (const aspect of BOARDS) {
      const maze = build(2, 321, aspect);
      const before = JSON.stringify(maze.grid);
      const result = tuneMazeFeltToTarget(maze, measureFeltSteps(maze) + 220, 9, { routeTarget: 160, maxBranch: 24 });
      expect(JSON.stringify(maze.grid)).toBe(before);
      const { width, height } = maze;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            expect(result.grid[y]![x]).toBe(maze.grid[y]![x]);
          }
        }
      }
      expect(result.grid[maze.start.y]![maze.start.x]).toBe(true);
      expect(result.grid[maze.goal.y]![maze.goal.x]).toBe(true);
      expect(floorCount(result.grid)).toBeGreaterThan(floorCount(maze.grid));
    }
  });

  test('adds no open 2x2 floor block and keeps every cell reachable', () => {
    for (const aspect of BOARDS) {
      const maze = build(0, 99, aspect);
      const result = tuneMazeFeltToTarget(maze, measureFeltSteps(maze) + 300, 3, { routeTarget: 200, maxBranch: 30 });
      expect(openTwoByTwoBlocks(result.grid)).toBeLessThanOrEqual(openTwoByTwoBlocks(maze.grid));
      const tuned = { ...maze, grid: result.grid };
      const reachable = resolveLegacyPlayableShortestPath(tuned.grid, tuned.start, tuned.goal);
      expect(reachable.found).toBe(true);
      expect(measureFelt(tuned).reachedGoal).toBe(true);
    }
  });

  test('the stretch lever lengthens the route the explorer walks and keeps a single shortest route', () => {
    for (const aspect of BOARDS) {
      const maze = build(0, 2468, aspect);
      const baseLength = measureFelt(maze).pathLength;
      const target = baseLength + 90;
      const result = tuneMazeFeltToTarget(maze, 1_000_000, 17, { routeTarget: target, maxBranch: 4 });
      expect(result.bumps).toBeGreaterThan(0);
      expect(result.routeLength).toBeGreaterThanOrEqual(Math.min(target, baseLength + 40));
      expect(result.stretchTiles.length).toBeGreaterThan(0);
      expect(result.stretchRemovedTiles.length).toBe(result.bumps);
      const tuned = { ...maze, grid: result.grid };
      const route = resolveLegacyShortestPath(tuned.grid, tuned.start, tuned.goal, 'direct-floor');
      expect(route.found).toBe(true);
      // The explorer path got longer, and the recomputed shortest route is never
      // shorter than the original one (a bump only ever removes a corridor cell it
      // replaces with a longer detour).
      expect(measureFelt(tuned).pathLength).toBeGreaterThan(baseLength);
      expect(route.path.length - 1).toBeGreaterThanOrEqual(maze.solutionPath.length - 1);
      expect(analyzeFeltStructure({ ...tuned, solutionPath: route.path }).routeLength).toBe(route.path.length - 1);
    }
  });

  test('deep deceptive branches appear: long dead-end corridors, not 1-tile nubs', () => {
    const maze = build(0, 1357, BOARDS[0]!);
    const result = tuneMazeFeltToTarget(maze, 1_000_000, 4, { maxBranch: 24 });
    const structure = analyzeFeltStructure({ ...maze, grid: result.grid, solutionPath: maze.solutionPath });
    expect(result.branchesAdded).toBeGreaterThan(3);
    expect(structure.deepDeadEnds).toBeGreaterThan(5);
    expect(structure.lureCells).toBeGreaterThan(100);
  });

  test('the fork phase puts many short lure forks on the route before the deep fill', () => {
    const maze = build(0, 1357, BOARDS[1]!);
    const target = measureFeltSteps(maze) + 420;
    const plain = tuneMazeFeltToTarget(maze, target, 4, { maxBranch: 30, routeBranch: 8 });
    const forked = tuneMazeFeltToTarget(maze, target, 4, { maxBranch: 30, routeBranch: 8, forks: 14 });
    expect(forked.onTarget).toBe(true);
    const forkedStructure = analyzeFeltStructure({ ...maze, grid: forked.grid });
    const plainStructure = analyzeFeltStructure({ ...maze, grid: plain.grid });
    expect(forkedStructure.trapBranches).toBeGreaterThan(plainStructure.trapBranches);
    expect(forkedStructure.trapBranches).toBeGreaterThanOrEqual(8);
  });

  test('is deterministic for a seed and different seeds give different mazes', () => {
    const maze = build(0, 555, BOARDS[0]!);
    const target = measureFeltSteps(maze) + 120;
    const a = tuneMazeFeltToTarget(maze, target, 1, { routeTarget: 120 });
    const b = tuneMazeFeltToTarget(maze, target, 1, { routeTarget: 120 });
    const c = tuneMazeFeltToTarget(maze, target, 2, { routeTarget: 120 });
    expect(b.grid).toEqual(a.grid);
    expect(JSON.stringify(c.grid)).not.toBe(JSON.stringify(a.grid));
  });

  test('every ladder level lands in its window through the lifecycle on both boards', () => {
    for (const level of [2, 3, 7, 12, 25, 60, 150]) {
      const profile = resolveGeometryBudgetProfile(level);
      for (const aspect of BOARDS) {
        const maze = createLegacyRuntimeMazeForMode('play', 35, 31337 + level, profile, {}, aspect);
        expect(maze.generation?.selection?.selectedDistance).toBe(0);
        // The snapshot's route is the recomputed direct-floor shortest path.
        const route = resolveLegacyShortestPath(maze.grid, maze.start, maze.goal, 'direct-floor');
        expect(maze.solutionPath).toEqual(route.path);
      }
    }
  });
});
