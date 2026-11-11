import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_TOP_TARGET,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetForks,
  resolveGeometryBudgetMaxBranch,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRouteBranch,
  resolveGeometryBudgetRouteTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';
import { LADDER_BOARDS } from '../../scripts/analysis/lib/progressionLadderSampling';

const LEVEL = GEOMETRY_BUDGET_FELT_SATURATION_LEVEL;

const tune = (aspectRatio: number, index: number, extra: { doubleLure?: boolean; reverseFloor?: number }) => {
  const seed = resolveGeometryBudgetCandidateSeed(5200 + index, 9100, 0);
  const base = createLegacyRuntimeMazeForMode('play', 35, seed, resolveGeometryBudgetProfileForRungs(0), {}, aspectRatio);
  const tuned = tuneMazeFeltToTarget(base, GEOMETRY_BUDGET_TOP_TARGET, seed ^ 0x51ed, {
    overshoot: 1,
    routeTarget: resolveGeometryBudgetRouteTarget(LEVEL),
    maxBranch: resolveGeometryBudgetMaxBranch(LEVEL),
    routeBranch: resolveGeometryBudgetRouteBranch(LEVEL),
    forks: resolveGeometryBudgetForks(LEVEL),
    ...extra
  });
  return { base, tuned };
};

const reverseSteps = (base: ReturnType<typeof tune>['base'], grid: boolean[][]): number => measureFelt({
  ...base,
  grid,
  start: base.goal,
  goal: base.start
}).steps;

describe('mastery: reverse-solve resistance (tuner lever 4)', () => {
  test('without the option the tuner is byte-identical and only reports the reverse number', () => {
    for (const board of LADDER_BOARDS) {
      const plain = tune(board.aspectRatio, 0, {});
      const explicitOff = tune(board.aspectRatio, 0, { doubleLure: false, reverseFloor: 0 });
      expect(explicitOff.tuned.grid).toEqual(plain.tuned.grid);
      expect(explicitOff.tuned.felt).toBe(plain.tuned.felt);
      expect(plain.tuned.reverseShortfall).toBe(0);
      // Reported on every tune and equal to the explorer run goal -> start on the finished grid.
      expect(plain.tuned.reverseFelt).toBe(reverseSteps(plain.base, plain.tuned.grid));
    }
  });

  test('the double lure leaves the forward felt landing in its window and raises the reverse felt on average', () => {
    for (const board of LADDER_BOARDS) {
      let plainTotal = 0;
      let lureTotal = 0;
      let landed = 0;
      for (let index = 0; index < 16; index += 1) {
        const plain = tune(board.aspectRatio, index, {});
        const lured = tune(board.aspectRatio, index, { doubleLure: true });
        // The lure narrows the hosts a fork may use, so a base can run out of room (measured: 10 to
        // 20 percent of the bases; the selection then tries the next base). Judge the landed ones.
        if (!plain.tuned.onTarget || !lured.tuned.onTarget) { continue; }
        landed += 1;
        expect(lured.tuned.felt).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET);
        expect(lured.tuned.felt).toBeLessThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET + 1);
        // The reverse number is the real one on the finished grid (no loops or wraps on this base).
        expect(lured.tuned.reverseFelt).toBe(reverseSteps(lured.base, lured.tuned.grid));
        plainTotal += plain.tuned.reverseFelt;
        lureTotal += lured.tuned.reverseFelt;
      }
      expect(landed).toBeGreaterThanOrEqual(10);
      // Measured: about 450 against 700 (phone and desktop); a wide margin keeps this robust.
      expect(lureTotal / landed).toBeGreaterThan((plainTotal / landed) + 120);
    }
  });

  test('the double lure never changes the board: the border ring, the start and the goal stay as they were', () => {
    for (const board of LADDER_BOARDS) {
      const { base, tuned } = tune(board.aspectRatio, 3, { doubleLure: true });
      const height = base.grid.length;
      const width = base.grid[0]!.length;
      for (let x = 0; x < width; x += 1) {
        expect(tuned.grid[0]![x]).toBe(base.grid[0]![x]);
        expect(tuned.grid[height - 1]![x]).toBe(base.grid[height - 1]![x]);
      }
      for (let y = 0; y < height; y += 1) {
        expect(tuned.grid[y]![0]).toBe(base.grid[y]![0]);
        expect(tuned.grid[y]![width - 1]).toBe(base.grid[y]![width - 1]);
      }
      expect(tuned.grid[base.start.y]![base.start.x]).toBe(true);
      expect(tuned.grid[base.goal.y]![base.goal.x]).toBe(true);
    }
  });

  test('a reverse floor the maze cannot reach is reported as a shortfall and keeps the maze off target; a reachable one is met', () => {
    for (const board of LADDER_BOARDS) {
      const impossible = tune(board.aspectRatio, 1, { doubleLure: true, reverseFloor: 5_000 });
      expect(impossible.tuned.reverseShortfall).toBe(5_000 - impossible.tuned.reverseFelt);
      expect(impossible.tuned.onTarget).toBe(false);
      expect(impossible.tuned.windowDistance).toBeGreaterThanOrEqual(impossible.tuned.reverseShortfall);
      const modest = tune(board.aspectRatio, 1, { doubleLure: true, reverseFloor: 300 });
      expect(modest.tuned.reverseShortfall).toBe(0);
      expect(modest.tuned.reverseFelt).toBeGreaterThanOrEqual(300);
    }
  });
});
