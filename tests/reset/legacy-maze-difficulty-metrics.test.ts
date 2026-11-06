import { describe, expect, test } from 'vitest';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';

// '#' wall, '.' floor.
const parse = (rows: string[]) => rows.map((row) => [...row].map((cell) => cell === '.'));

describe('analyzeMazeDifficulty', () => {
  // 9x5 board. The route runs along row 3 from the left edge to the right edge;
  // a 2-cell decoy branch hangs off column 4 (upward) and a 1-cell stub hangs off
  // column 6 (downward).
  const grid = parse([
    '#########',
    '####.####',
    '####.####',
    '.........',
    '######.##'
  ]);
  const route = Array.from({ length: 9 }, (_, x) => ({ x, y: 3 }));
  const maze = { width: 9, height: 5, grid, start: { x: 0, y: 3 }, goal: { x: 8, y: 3 }, solutionPath: route };

  test('measures route shape, decisions, decoys and dead ends', () => {
    const metrics = analyzeMazeDifficulty(maze);
    expect(metrics.routeLength).toBe(8);
    expect(metrics.routeTurns).toBe(0);
    expect(metrics.decisionPoints).toBe(2);
    expect(metrics.deadEnds).toBe(2);
    expect(metrics.decoyCells).toBe(3);
    expect(metrics.maxDecoyDepth).toBe(2);
    expect(metrics.meanDeadEndDepth).toBeCloseTo(1.5, 5);
    expect(metrics.floorCells).toBe(12);
    expect(metrics.wrapSteps).toBe(0);
    expect(metrics.deceptiveness).toBeGreaterThanOrEqual(0);
    expect(metrics.deceptiveness).toBeLessThanOrEqual(1);
  });

  test('counts wrap steps and treats a wrapped straight run as no turn', () => {
    const wrapGrid = parse(['.#.#.#.#.', '.........', '#########']);
    const wrapRoute = [{ x: 7, y: 1 }, { x: 8, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    const metrics = analyzeMazeDifficulty({
      width: 9, height: 3, grid: wrapGrid, start: { x: 7, y: 1 }, goal: { x: 1, y: 1 }, solutionPath: wrapRoute
    });
    expect(metrics.wrapSteps).toBe(1);
    expect(metrics.routeTurns).toBe(0);
    expect(metrics.routeLength).toBe(3);
  });

  test('search-effort metrics are bounded by the floor and by the route', () => {
    const metrics = analyzeMazeDifficulty(maze);
    expect(metrics.astarExpansions).toBeLessThanOrEqual(metrics.floorCells);
    expect(metrics.astarExpansions).toBeGreaterThanOrEqual(1);
    expect(metrics.greedySearchCells).toBeGreaterThanOrEqual(2);
    expect(metrics.greedySearchCells).toBeLessThanOrEqual(metrics.floorCells);
  });

  test('a longer dead-end branch toward the goal is more deceptive and costs the greedy solver more', () => {
    // Same route; a decoy from column 2 that climbs and runs right (toward the
    // goal column) versus none.
    const lured = parse([
      '#########',
      '..#######',
      '.########',
      '.........',
      '#########'
    ]);
    const plain = parse([
      '#########',
      '#########',
      '#########',
      '.........',
      '#########'
    ]);
    const base = { width: 9, height: 5, start: { x: 0, y: 3 }, goal: { x: 8, y: 3 }, solutionPath: route };
    const withDecoy = analyzeMazeDifficulty({ ...base, grid: lured });
    const without = analyzeMazeDifficulty({ ...base, grid: plain });
    expect(withDecoy.decoyCells).toBeGreaterThan(without.decoyCells);
    expect(withDecoy.floorCells).toBeGreaterThan(without.floorCells);
  });

  test('is deterministic', () => {
    expect(analyzeMazeDifficulty(maze)).toEqual(analyzeMazeDifficulty(maze));
  });
});
