// Regenerates the baked geometry-budget proxy targets T(N) in
// src/legacy-runtime/legacyGeometryBudget.ts.
//
// For every budget level N in 2..LAST_BUDGET_LEVEL it generates an UNGATED
// sample of mazes from that level's profile on the frozen board (three aspect
// classes: portrait phone, landscape desktop, square), measures the H1 proxy,
// takes the pooled mean per level, makes the curve monotone non-decreasing
// (pool-adjacent-violators) and then enforces a minimum step of
// GEOMETRY_BUDGET_TARGET_MIN_STEP between adjacent levels. The result is the
// table the runtime gate steers toward.
//
// Usage (from the repo root):
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts
//     print the table and a per-level summary
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --write
//     rewrite the GENERATED block in legacyGeometryBudget.ts
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --check
//     exit 1 if the baked table differs from a fresh calibration
//
// tests/reset/legacy-geometry-budget.test.ts recomputes the table through
// computeGeometryBudgetTargets() and fails on drift.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_TARGET_MIN_STEP,
  GEOMETRY_BUDGET_TARGETS,
  LAST_BUDGET_LEVEL,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetProfile
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

export const GEOMETRY_BUDGET_CALIBRATION = {
  // Frozen board scale for the whole budget range (tutorial value).
  scale: 35,
  boards: [
    { name: 'phone', aspectRatio: 23 / 51 },
    { name: 'desktop', aspectRatio: 45 / 27 },
    { name: 'square', aspectRatio: 1 }
  ],
  seedsPerBoard: 16,
  seedBase: 777
} as const;

export interface GeometryBudgetCalibrationResult {
  // Pooled mean H1 per level, before smoothing.
  rawMeans: Record<number, number>;
  // Baked table: monotone and at least MIN_STEP between adjacent levels.
  targets: Record<number, number>;
  // Per-board raw means, for review.
  boardMeans: Record<string, Record<number, number>>;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const computeGeometryBudgetTargets = (
  options: { seedsPerBoard?: number } = {}
): GeometryBudgetCalibrationResult => {
  const { scale, boards, seedBase } = GEOMETRY_BUDGET_CALIBRATION;
  const seedsPerBoard = options.seedsPerBoard ?? GEOMETRY_BUDGET_CALIBRATION.seedsPerBoard;
  const rawMeans: Record<number, number> = {};
  const boardMeans: Record<string, Record<number, number>> = {};
  for (const board of boards) {
    boardMeans[board.name] = {};
  }

  for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
    // Ungated: drop the gate key so the sample is the raw profile distribution.
    const { geometryBudgetLevel: _gateKey, ...profile } = resolveGeometryBudgetProfile(level);
    void _gateKey;
    const pooled: number[] = [];
    for (const board of boards) {
      const perBoard: number[] = [];
      for (let index = 0; index < seedsPerBoard; index += 1) {
        const seed = resolveGeometryBudgetCandidateSeed(seedBase + index, level, boards.indexOf(board));
        const maze = createLegacyRuntimeMazeForMode('play', scale, seed, profile, {}, board.aspectRatio);
        perBoard.push(measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total);
      }
      boardMeans[board.name]![level] = mean(perBoard);
      pooled.push(...perBoard);
    }
    rawMeans[level] = mean(pooled);
  }

  // Pool-adjacent-violators: least-squares monotone non-decreasing fit.
  const blocks: { sum: number; count: number }[] = [];
  for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
    blocks.push({ sum: rawMeans[level]!, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!;
      const previous = blocks[blocks.length - 2]!;
      if (previous.sum / previous.count <= last.sum / last.count) {
        break;
      }
      blocks.splice(blocks.length - 2, 2, { sum: previous.sum + last.sum, count: previous.count + last.count });
    }
  }
  const monotone: number[] = [];
  for (const block of blocks) {
    for (let index = 0; index < block.count; index += 1) {
      monotone.push(block.sum / block.count);
    }
  }

  const targets: Record<number, number> = {};
  for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
    const floor = level === 2 ? Number.NEGATIVE_INFINITY : targets[level - 1]! + GEOMETRY_BUDGET_TARGET_MIN_STEP;
    targets[level] = Math.round(Math.max(monotone[level - 2]!, floor) * 4) / 4;
    // Rounding to a quarter must not eat into the minimum step.
    if (level > 2 && targets[level]! - targets[level - 1]! < GEOMETRY_BUDGET_TARGET_MIN_STEP) {
      targets[level] = targets[level - 1]! + GEOMETRY_BUDGET_TARGET_MIN_STEP;
    }
  }
  return { rawMeans, targets, boardMeans };
};

const BLOCK_BEGIN = '// GENERATED:GEOMETRY_BUDGET_TARGETS:BEGIN';
const BLOCK_END = '// GENERATED:GEOMETRY_BUDGET_TARGETS:END';

export const formatGeometryBudgetTargetsBlock = (targets: Record<number, number>): string => {
  const lines = Object.keys(targets)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => `  ${level}: ${targets[level]}`);
  return `${BLOCK_BEGIN}\nexport const GEOMETRY_BUDGET_TARGETS: Readonly<Record<number, number>> = {\n${lines.join(',\n')}\n};\n${BLOCK_END}`;
};

const main = (): void => {
  const modulePath = fileURLToPath(new URL('../../src/legacy-runtime/legacyGeometryBudget.ts', import.meta.url));
  const result = computeGeometryBudgetTargets();
  const block = formatGeometryBudgetTargetsBlock(result.targets);
  const source = readFileSync(modulePath, 'utf8');
  const begin = source.indexOf(BLOCK_BEGIN);
  const end = source.indexOf(BLOCK_END);
  if (begin < 0 || end < 0) {
    throw new Error('Generated block markers not found in legacyGeometryBudget.ts');
  }
  const next = `${source.slice(0, begin)}${block}${source.slice(end + BLOCK_END.length)}`;

  console.log('level  raw-pooled  phone  desktop  square  target');
  for (let level = 2; level <= LAST_BUDGET_LEVEL; level += 1) {
    console.log([
      String(level).padStart(5),
      result.rawMeans[level]!.toFixed(1).padStart(10),
      result.boardMeans.phone![level]!.toFixed(1).padStart(6),
      result.boardMeans.desktop![level]!.toFixed(1).padStart(8),
      result.boardMeans.square![level]!.toFixed(1).padStart(7),
      String(result.targets[level]).padStart(7)
    ].join(' '));
  }

  if (process.argv.includes('--write')) {
    writeFileSync(modulePath, next, 'utf8');
    console.log('rewrote GENERATED block in legacyGeometryBudget.ts');
  } else if (process.argv.includes('--check')) {
    const matches = LAST_BUDGET_LEVEL - 1 === Object.keys(GEOMETRY_BUDGET_TARGETS).length
      && Object.keys(result.targets).every((key) => GEOMETRY_BUDGET_TARGETS[Number(key)] === result.targets[Number(key)]);
    console.log(matches ? 'baked table is current' : 'baked table DRIFTED');
    if (!matches) {
      process.exitCode = 1;
    }
  }
};

// Runs only when launched through vite-node (not when imported by a test).
if (/vite-node/.test(process.argv[1] ?? '')) {
  main();
}
