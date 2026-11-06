import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  analyzeFeltStructure,
  FELT_DEEP_BRANCH_DEPTH,
  FELT_VISION_CELLS,
  measureFelt,
  measureFeltSteps,
  simulatePullToGoalWalker,
  type FeltMaze
} from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { resolveGeometryBudgetProfile } from '../../src/legacy-runtime/legacyGeometryBudget';

// Big enough that no torus wrap shortens any distance used below.
const SIZE = 81;
const START = { x: 10, y: 30 };
const GOAL = { x: 35, y: 55 };

interface Branch { from: { x: number; y: number }; dx: number; dy: number; length: number }

// An L-shaped route (right along y = 30, then down x = 35) plus pendant branches.
const buildMaze = (branches: Branch[]): FeltMaze => {
  const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
  const solutionPath: { x: number; y: number }[] = [];
  for (let x = START.x; x <= GOAL.x; x += 1) { grid[START.y]![x] = true; solutionPath.push({ x, y: START.y }); }
  for (let y = START.y + 1; y <= GOAL.y; y += 1) { grid[y]![GOAL.x] = true; solutionPath.push({ x: GOAL.x, y }); }
  for (const branch of branches) {
    for (let k = 1; k <= branch.length; k += 1) {
      grid[branch.from.y + (branch.dy * k)]![branch.from.x + (branch.dx * k)] = true;
    }
  }
  return { width: SIZE, height: SIZE, grid, start: START, goal: GOAL, solutionPath };
};

const ROUTE = 25 + 25;

describe('felt difficulty: the pull-to-goal explorer', () => {
  test('a bare route costs exactly its length', () => {
    const maze = buildMaze([]);
    expect(measureFeltSteps(maze)).toBe(ROUTE);
    expect(measureFelt(maze)).toEqual({ steps: ROUTE, pathLength: ROUTE, reachedGoal: true });
  });

  test('a lure branch (first cell nearer the goal than the next route cell) costs 2 per cell', () => {
    // Down from (20, 30): (20, 31) is nearer (35, 55) than the next route cell (21, 30).
    const maze = buildMaze([{ from: { x: 20, y: 30 }, dx: 0, dy: 1, length: 6 }]);
    expect(measureFeltSteps(maze)).toBe(ROUTE + 12);
    expect(analyzeFeltStructure(maze)).toMatchObject({ lureBranches: 1, trapBranches: 1, lureCells: 6, branches: 1 });
  });

  test('a branch pointing away from the goal costs nothing: the explorer is at the goal before it returns', () => {
    const maze = buildMaze([{ from: { x: 25, y: 30 }, dx: 0, dy: -1, length: 9 }]);
    expect(measureFeltSteps(maze)).toBe(ROUTE);
    const structure = analyzeFeltStructure(maze);
    expect(structure.lureBranches).toBe(0);
    expect(structure.trapBranches).toBe(0);
    expect(structure.deepBranches).toBe(1);
  });

  test('vision: a dead end of at most FELT_VISION_CELLS cells is a nub and is free; one cell more costs its length', () => {
    expect(FELT_VISION_CELLS).toBe(3);
    const nub = buildMaze([{ from: { x: 15, y: 30 }, dx: 0, dy: 1, length: FELT_VISION_CELLS }]);
    expect(measureFeltSteps(nub)).toBe(ROUTE);
    expect(analyzeFeltStructure(nub).nubs).toBe(1);
    const trap = buildMaze([{ from: { x: 15, y: 30 }, dx: 0, dy: 1, length: FELT_VISION_CELLS + 1 }]);
    expect(measureFeltSteps(trap)).toBe(ROUTE + (2 * (FELT_VISION_CELLS + 1)));
  });

  test('costs add up across branches and deep dead ends are counted', () => {
    const maze = buildMaze([
      { from: { x: 20, y: 30 }, dx: 0, dy: 1, length: FELT_DEEP_BRANCH_DEPTH },
      { from: { x: 29, y: 30 }, dx: 0, dy: 1, length: 5 },
      { from: { x: 25, y: 30 }, dx: 0, dy: -1, length: 12 }
    ]);
    expect(measureFeltSteps(maze)).toBe(ROUTE + (2 * FELT_DEEP_BRANCH_DEPTH) + 10);
    const structure = analyzeFeltStructure(maze);
    expect(structure.deepDeadEnds).toBe(2);
    expect(structure.maxDepth).toBe(12);
    expect(structure.cycles).toBe(0);
    expect(structure.floorCells).toBe(ROUTE + 1 + FELT_DEEP_BRANCH_DEPTH + 5 + 12);
  });

  test('is a pure function of the grid: repeated runs and a fresh explorer agree', () => {
    const maze = buildMaze([{ from: { x: 20, y: 30 }, dx: 0, dy: 1, length: 6 }]);
    expect(measureFeltSteps(maze)).toBe(measureFeltSteps(maze));
    // The input is not mutated.
    const copy = JSON.stringify(maze);
    measureFeltSteps(maze);
    expect(JSON.stringify(maze)).toBe(copy);
  });

  test('the deterministic value tracks the Monte-Carlo mean of other tie seeds on generated mazes', () => {
    let relativeError = 0;
    let count = 0;
    for (const level of [5, 20, 60, 120, 200]) {
      for (const aspectRatio of [23 / 51, 45 / 27]) {
        for (let index = 0; index < 3; index += 1) {
          const maze = createLegacyRuntimeMazeForMode('play', 35, 700 + (index * 7919) + level, resolveGeometryBudgetProfile(level), {}, aspectRatio);
          const deterministic = measureFeltSteps(maze);
          let sum = 0;
          for (let tie = 1; tie <= 16; tie += 1) { sum += simulatePullToGoalWalker(maze, tie * 7919); }
          relativeError += Math.abs(deterministic - (sum / 16)) / deterministic;
          count += 1;
        }
      }
    }
    // Ties between equally distant neighbours are rare, so the fixed tie hash is a
    // sample of the same distribution: within a few percent on average.
    expect(relativeError / count).toBeLessThan(0.05);
  }, 60_000);
});
