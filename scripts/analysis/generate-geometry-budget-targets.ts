// Regenerates the baked calibration block in
// src/legacy-runtime/legacyGeometryBudget.ts (the felt-difficulty CEILING).
//
// Capacity pass: from the base profile the TOP of the ladder uses (plain, no wrap
// corridors) it generates mazes on the frozen board (portrait phone, landscape
// desktop), runs the felt tuner with an unreachable target, the route target and
// the branch cap of the ceiling levels, and records the felt value each seed
// reached. CEILING = the lowest per-board (1 - CAPACITY_SHARE) quantile rounded down to
// a multiple of 10: a target that at least CAPACITY_SHARE of base mazes can reach
// on every board.
// The selection tries the next base maze when one falls short, so a build still
// lands (P(no base of 24 reaches it) = (1 - share)^24).
//
// Usage (from the repo root):
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts
//     print the capacity pass and the resulting ceiling / saturation level
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --write
//     rewrite the GENERATED block in legacyGeometryBudget.ts
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --check
//     exit 1 if the baked block differs from a fresh calibration
//
// tests/reset/legacy-geometry-budget.test.ts checks the schedule's structure and
// spot-samples a few levels; the full recomputation is this script's --check.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetForks,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetRouteBranch,
  resolveGeometryBudgetRouteTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { tuneMazeFeltToTarget } from '../../src/legacy-runtime/legacyMazeFeltTuning';

export const GEOMETRY_BUDGET_CALIBRATION = {
  // Frozen board scale for the whole budget range (tutorial value).
  scale: 35,
  boards: [
    { name: 'phone', aspectRatio: 23 / 51 },
    { name: 'desktop', aspectRatio: 45 / 27 }
  ],
  capacitySeedsPerBoard: 160,
  // Share of base mazes that must be able to reach the ceiling (0.75: about 1.3 base
  // builds per top-of-ladder level, 2.5 ms each; P(none of 24 reach it) = 0.25^24).
  capacityShare: 0.75,
  // Route target and branch cap of the ceiling levels (the test pins the
  // resolved route target at saturation to be <= this).
  routeTarget: 300,
  maxBranch: 40,
  // Fork phase and fork length of the ceiling levels (test-pinned the same way).
  routeBranch: 16,
  forks: 30,
  seedBase: 777
} as const;

export interface GeometryBudgetCalibrationResult {
  ceiling: number;
  capacityMin: number;
  capacityMedian: number;
  capacityQuantile: number;
  // Per-board (1 - share) quantile of the felt value reached, in board order.
  perBoardQuantile: number[];
  reached: number[];
}

export const computeGeometryBudgetCalibration = (): GeometryBudgetCalibrationResult => {
  const { scale, boards, seedBase, capacitySeedsPerBoard, routeTarget, maxBranch, routeBranch, forks, capacityShare } = GEOMETRY_BUDGET_CALIBRATION;
  const profile = resolveGeometryBudgetProfileForRungs(0);
  const reached: number[] = [];
  const perBoardQuantile: number[] = [];
  boards.forEach((board, boardIndex) => {
    const boardReached: number[] = [];
    for (let index = 0; index < capacitySeedsPerBoard; index += 1) {
      const seed = resolveGeometryBudgetCandidateSeed(seedBase + index, 5000, boardIndex);
      const maze = createLegacyRuntimeMazeForMode('play', scale, seed, profile, {}, board.aspectRatio);
      boardReached.push(tuneMazeFeltToTarget(maze, 1e9, seed ^ 0x1234567, { routeTarget, maxBranch, routeBranch, forks }).felt);
    }
    reached.push(...boardReached);
    const boardSorted = [...boardReached].sort((a, b) => a - b);
    perBoardQuantile.push(boardSorted[Math.floor((1 - capacityShare) * (boardSorted.length - 1))]!);
  });
  const sorted = [...reached].sort((a, b) => a - b);
  // The weakest board decides: one ceiling serves every board, and a board whose
  // capacity is lower would otherwise spend most builds on fallback bases.
  const quantile = Math.min(...perBoardQuantile);
  return {
    perBoardQuantile,
    ceiling: Math.floor(quantile / 10) * 10,
    capacityMin: sorted[0]!,
    capacityMedian: sorted[Math.floor((sorted.length - 1) / 2)]!,
    capacityQuantile: quantile,
    reached
  };
};

const BLOCK_BEGIN = '// GENERATED:GEOMETRY_BUDGET_CALIBRATION:BEGIN';
const BLOCK_END = '// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END';

export const formatGeometryBudgetCalibrationBlock = (ceiling: number): string => [
  BLOCK_BEGIN,
  `export const GEOMETRY_BUDGET_CEILING = ${ceiling};`,
  BLOCK_END
].join('\n');

const main = (): void => {
  const modulePath = fileURLToPath(new URL('../../src/legacy-runtime/legacyGeometryBudget.ts', import.meta.url));
  const result = computeGeometryBudgetCalibration();
  const source = readFileSync(modulePath, 'utf8');
  const begin = source.indexOf(BLOCK_BEGIN);
  const end = source.indexOf(BLOCK_END);
  if (begin < 0 || end < 0) {
    throw new Error('Generated block markers not found in legacyGeometryBudget.ts');
  }
  const next = `${source.slice(0, begin)}${formatGeometryBudgetCalibrationBlock(result.ceiling)}${source.slice(end + BLOCK_END.length)}`;

  console.log(`capacity pass: ${result.reached.length} base mazes, min ${result.capacityMin}, median ${result.capacityMedian}, p${Math.round((1 - GEOMETRY_BUDGET_CALIBRATION.capacityShare) * 100)} ${result.capacityQuantile}; per board ${GEOMETRY_BUDGET_CALIBRATION.boards.map((board, index) => `${board.name} ${result.perBoardQuantile[index]}`).join(', ')}`);
  console.log(`ceiling ${result.ceiling} (baked ${GEOMETRY_BUDGET_CEILING}), saturation level ${GEOMETRY_BUDGET_SATURATION_LEVEL} (baked)`);
  console.log(`route branch / forks at saturation: ${resolveGeometryBudgetRouteBranch(GEOMETRY_BUDGET_SATURATION_LEVEL)} / ${resolveGeometryBudgetForks(GEOMETRY_BUDGET_SATURATION_LEVEL)} (calibration uses ${GEOMETRY_BUDGET_CALIBRATION.routeBranch} / ${GEOMETRY_BUDGET_CALIBRATION.forks})`);
  console.log(`route target at the baked saturation level: ${resolveGeometryBudgetRouteTarget(GEOMETRY_BUDGET_SATURATION_LEVEL)} (calibration uses ${GEOMETRY_BUDGET_CALIBRATION.routeTarget})`);

  if (process.argv.includes('--write')) {
    writeFileSync(modulePath, next, 'utf8');
    console.log('rewrote GENERATED block in legacyGeometryBudget.ts');
  } else if (process.argv.includes('--check')) {
    const matches = result.ceiling === GEOMETRY_BUDGET_CEILING;
    console.log(matches ? 'baked calibration is current' : 'baked calibration DRIFTED');
    if (!matches) {
      process.exitCode = 1;
    }
  }
};

// Runs only when launched through vite-node (not when imported by a test).
if (/vite-node/.test(process.argv[1] ?? '')) {
  main();
}
