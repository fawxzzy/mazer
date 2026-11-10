import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_FRINGE_CAP,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_TOP_TARGET,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetForks,
  resolveGeometryBudgetMaxBranch,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRouteBranch,
  resolveGeometryBudgetRouteTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { FELT_VISION_CELLS, createFeltExplorer } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';

const countKinds = (grid: ReadonlyArray<ReadonlyArray<boolean>>): { floor: number; junctions: number; deadEnds: number } => {
  const height = grid.length;
  const width = grid[0]!.length;
  let floor = 0;
  let junctions = 0;
  let deadEnds = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!grid[y]![x]) { continue; }
      floor += 1;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (grid[(y + dy + height) % height]![(x + dx + width) % width]) { open += 1; }
      }
      if (open >= 3) { junctions += 1; }
      if (open === 1) { deadEnds += 1; }
    }
  }
  return { floor, junctions, deadEnds };
};

const tuneTop = (aspectRatio: number, index: number, fringeCells: number) => {
  const level = GEOMETRY_BUDGET_FELT_SATURATION_LEVEL;
  const seed = resolveGeometryBudgetCandidateSeed(4100 + index, 9000, 0);
  const base = createLegacyRuntimeMazeForMode('play', 35, seed, resolveGeometryBudgetProfileForRungs(0), {}, aspectRatio);
  const tuned = tuneMazeFeltToTarget(base, GEOMETRY_BUDGET_TOP_TARGET, seed ^ 0x51ed, {
    overshoot: 1,
    routeTarget: resolveGeometryBudgetRouteTarget(level),
    maxBranch: resolveGeometryBudgetMaxBranch(level),
    routeBranch: resolveGeometryBudgetRouteBranch(level),
    forks: resolveGeometryBudgetForks(level),
    fringeCells
  });
  return { base, tuned };
};

describe('fringe: zero-felt-cost side stubs past the felt saturation (tuner lever 3)', () => {
  test('the fringe adds exactly the requested cells and leaves the landed felt number and the route untouched', () => {
    for (const board of LADDER_BOARDS) {
      for (let index = 0; index < 4; index += 1) {
        const plain = tuneTop(board.aspectRatio, index, 0);
        const fringed = tuneTop(board.aspectRatio, index, 40);
        expect(plain.tuned.onTarget).toBe(true);
        expect(fringed.tuned.onTarget).toBe(true);
        expect(fringed.tuned.fringeShortfall).toBe(0);
        expect(fringed.tuned.fringeTiles.length).toBe(40);
        expect(plain.tuned.fringeTiles.length).toBe(0);
        // Same landed number: the explorer does not enter a stub of at most FELT_VISION_CELLS cells.
        expect(fringed.tuned.felt).toBe(plain.tuned.felt);
        // Exactly the stub cells differ, and every one of them is a new floor cell.
        const before = countKinds(plain.tuned.grid);
        const after = countKinds(fringed.tuned.grid);
        expect(after.floor - before.floor).toBe(40);
        // Real structure: every stub is a junction on its host and a dead end of its own.
        expect(after.junctions).toBeGreaterThan(before.junctions + 5);
        expect(after.deadEnds).toBeGreaterThan(before.deadEnds + 5);
        // An independent explorer run on the finished grid agrees with the tuner's number.
        const { width, height } = fringed.base;
        const open = new Uint8Array(width * height);
        fringed.tuned.grid.forEach((row, y) => row.forEach((cell, x) => { if (cell) { open[(y * width) + x] = 1; } }));
        const run = createFeltExplorer(width, height).run(
          open,
          (fringed.base.start.y * width) + fringed.base.start.x,
          (fringed.base.goal.y * width) + fringed.base.goal.x
        );
        expect(run.steps).toBe(plain.tuned.felt);
      }
    }
  });

  test('every stub is a dead end of at most FELT_VISION_CELLS cells on interior ground: no 2x2 block, no border cell', () => {
    for (const board of LADDER_BOARDS) {
      const { base, tuned } = tuneTop(board.aspectRatio, 1, 60);
      const plain = tuneTop(board.aspectRatio, 1, 0).tuned;
      const stubs = new Set(tuned.fringeTiles.map((tile) => `${tile.x},${tile.y}`));
      expect(stubs.size).toBe(60);
      for (const tile of tuned.fringeTiles) {
        expect(tile.x).toBeGreaterThanOrEqual(1);
        expect(tile.y).toBeGreaterThanOrEqual(1);
        expect(tile.x).toBeLessThanOrEqual(base.width - 2);
        expect(tile.y).toBeLessThanOrEqual(base.height - 2);
        expect(plain.grid[tile.y]![tile.x]).toBe(false);
        expect(tuned.grid[tile.y]![tile.x]).toBe(true);
      }
      // No 2x2 floor block anywhere that the plain maze did not already have.
      const block = (grid: boolean[][]): number => {
        let count = 0;
        for (let y = 0; y + 1 < grid.length; y += 1) {
          for (let x = 0; x + 1 < grid[0]!.length; x += 1) {
            if (grid[y]![x] && grid[y]![x + 1] && grid[y + 1]![x] && grid[y + 1]![x + 1]) { count += 1; }
          }
        }
        return count;
      };
      expect(block(tuned.grid)).toBe(block(plain.grid));
      expect(FELT_VISION_CELLS).toBe(3);
    }
  });

  test('a request the maze cannot hold is reported as a shortfall and as window distance, so the selection tries the next base', () => {
    const { tuned } = tuneTop(LADDER_BOARDS[0].aspectRatio, 2, 5_000);
    expect(tuned.fringeShortfall).toBeGreaterThan(0);
    expect(tuned.fringeTiles.length + tuned.fringeShortfall).toBe(5_000);
    expect(tuned.onTarget).toBe(false);
    expect(tuned.windowDistance).toBeGreaterThanOrEqual(tuned.fringeShortfall);
  });

  test('without the option the tuner is byte-identical (no fringe tiles, no shortfall)', () => {
    const { tuned } = tuneTop(LADDER_BOARDS[1].aspectRatio, 0, 0);
    expect(tuned.fringeTiles).toEqual([]);
    expect(tuned.fringeShortfall).toBe(0);
  });

  test('a ladder maze past the felt saturation is its felt-saturation maze plus the fringe: same base, route and felt class', () => {
    for (const board of LADDER_BOARDS) {
      let same = 0;
      for (let index = 0; index < 10; index += 1) {
        const seed = seedForIndex(index);
        const top = generateLadderMaze(GEOMETRY_BUDGET_SATURATION_LEVEL, board, seed);
        const felt = generateLadderMaze(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL, board, seed);
        expect((top as { fringeStats?: { cells: number } }).fringeStats?.cells).toBe(GEOMETRY_BUDGET_FRINGE_CAP);
        expect((felt as { fringeStats?: { cells: number } }).fringeStats).toBeUndefined();
        // The same felt maze whenever the full fringe fitted the first landing (a base that
        // cannot hold it is replaced by the next base, a different maze).
        let subset = true;
        felt.grid.forEach((row, y) => row.forEach((cell, x) => { if (cell && !top.grid[y]![x]) { subset = false; } }));
        if (subset) {
          same += 1;
          expect(top.start).toEqual(felt.start);
          expect(top.goal).toEqual(felt.goal);
          expect(top.solutionPath.length).toBe(felt.solutionPath.length);
          expect(countKinds(top.grid).floor - countKinds(felt.grid).floor).toBe(GEOMETRY_BUDGET_FRINGE_CAP);
        }
      }
      // Most seeds (the calibration share is 75 percent) hold the whole fringe on the first landing.
      expect(same).toBeGreaterThanOrEqual(5);
    }
  });
});
