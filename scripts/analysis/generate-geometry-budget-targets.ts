// Regenerates the baked calibration block in
// src/legacy-runtime/legacyGeometryBudget.ts (START, CEILING and the
// level -> rung-count table).
//
// Pass 1 (style): for every prefix r = 0..tape length it generates an UNGATED
// sample of mazes from that rung prefix on the frozen board (three aspect
// classes: portrait phone, landscape desktop, square), measures the H1 proxy,
// takes the pooled mean per prefix and makes it monotone non-decreasing in r
// (pool-adjacent-violators). START = round(mean of the base profile);
// RUNGS[N] = argmin_r |mean(r) - (T(N) - BASE_OFFSET)| (ties pick the smaller prefix).
//
// Pass 2 (capacity): from the FULL-tape base it runs the decoy tuner with an
// unreachable target, so it adds decoys until none fit, and records the proxy
// each seed reached. CEILING = the START + k * STEP grid value at or below
// (pooled capacity quantile - margin): a target that share-of-bases-complement of
// base mazes can reach, so the next-base fallback makes a miss astronomically rare. SATURATION level = the level where T reaches it.
//
// Usage (from the repo root):
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts
//     print the calibration, the saturation level and a per-level summary
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --write
//     rewrite the GENERATED block in legacyGeometryBudget.ts
//   npx vite-node scripts/analysis/generate-geometry-budget-targets.ts --check
//     exit 1 if the baked block differs from a fresh calibration
//
// tests/reset/legacy-geometry-budget.test.ts checks the baked block's structure
// and spot-samples a few levels; the full recomputation is this script's
// --check (about two minutes).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_BASE_OFFSET,
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_RUNGS_BY_LEVEL,
  GEOMETRY_BUDGET_START,
  GEOMETRY_BUDGET_TAPE,
  GEOMETRY_BUDGET_TARGET_STEP,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetProfileForRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { tuneMazeProxyToTarget } from '../../src/legacy-runtime/legacyMazeDecoyTuning';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

export const GEOMETRY_BUDGET_CALIBRATION = {
  // Frozen board scale for the whole budget range (tutorial value).
  scale: 35,
  boards: [
    { name: 'phone', aspectRatio: 23 / 51 },
    { name: 'desktop', aspectRatio: 45 / 27 },
    { name: 'square', aspectRatio: 1 }
  ],
  seedsPerBoard: 40,
  capacitySeedsPerBoard: 300,
  // Safety margin under the pooled capacity minimum (proxy points).
  capacityMargin: 5,
  // Quantile of the pooled capacity sample the ceiling is pinned to: that share of base
  // mazes cannot reach a ceiling target and the selection simply tries the next
  // base (GEOMETRY_BUDGET_BASE_CANDIDATES), so P(no base of 12 reaches it) = q^12.
  capacityQuantile: 0.1,
  seedBase: 777
} as const;

export interface GeometryBudgetCalibrationResult {
  start: number;
  ceiling: number;
  capacityMin: number;
  capacityQuantile: number;
  capacityMean: number;
  saturationLevel: number;
  // Pooled mean H1 per prefix length, before smoothing.
  rawMeans: number[];
  // Monotone (isotonic) mean per prefix length.
  monotoneMeans: number[];
  // Baked level -> rung count table, levels 2..saturationLevel.
  rungsByLevel: Record<number, number>;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const measureCapacity = (): { min: number; mean: number; quantile: number } => {
  const { scale, boards, seedBase, capacitySeedsPerBoard } = GEOMETRY_BUDGET_CALIBRATION;
  const profile = resolveGeometryBudgetProfileForRungs(GEOMETRY_BUDGET_TAPE.length);
  const reached: number[] = [];
  boards.forEach((board, boardIndex) => {
    for (let index = 0; index < capacitySeedsPerBoard; index += 1) {
      const seed = resolveGeometryBudgetCandidateSeed(seedBase + index, 5000, boardIndex);
      const maze = createLegacyRuntimeMazeForMode('play', scale, seed, profile, {}, board.aspectRatio);
      const base = measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze));
      reached.push(tuneMazeProxyToTarget(maze, base, 1e9, seed ^ 0x1234567, { maxEdits: 4000 }).proxy);
    }
  });
  const sorted = [...reached].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    mean: mean(reached),
    quantile: sorted[Math.floor(GEOMETRY_BUDGET_CALIBRATION.capacityQuantile * (sorted.length - 1))]!
  };
};

export const computeGeometryBudgetCalibration = (
  options: { seedsPerBoard?: number } = {}
): GeometryBudgetCalibrationResult => {
  const { scale, boards, seedBase } = GEOMETRY_BUDGET_CALIBRATION;
  const seedsPerBoard = options.seedsPerBoard ?? GEOMETRY_BUDGET_CALIBRATION.seedsPerBoard;
  const step = GEOMETRY_BUDGET_TARGET_STEP;
  const rawMeans: number[] = [];

  for (let rungs = 0; rungs <= GEOMETRY_BUDGET_TAPE.length; rungs += 1) {
    // Ungated: no level argument, so no gate key.
    const profile = resolveGeometryBudgetProfileForRungs(rungs);
    const pooled: number[] = [];
    boards.forEach((board, boardIndex) => {
      for (let index = 0; index < seedsPerBoard; index += 1) {
        const seed = resolveGeometryBudgetCandidateSeed(seedBase + index, 1000 + rungs, boardIndex);
        const maze = createLegacyRuntimeMazeForMode('play', scale, seed, profile, {}, board.aspectRatio);
        pooled.push(measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total);
      }
    });
    rawMeans.push(mean(pooled));
  }

  // Pool-adjacent-violators: least-squares monotone non-decreasing fit.
  const blocks: { sum: number; count: number }[] = [];
  for (const value of rawMeans) {
    blocks.push({ sum: value, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!;
      const previous = blocks[blocks.length - 2]!;
      if (previous.sum / previous.count <= last.sum / last.count) {
        break;
      }
      blocks.splice(blocks.length - 2, 2, { sum: previous.sum + last.sum, count: previous.count + last.count });
    }
  }
  const monotoneMeans: number[] = [];
  for (const block of blocks) {
    for (let index = 0; index < block.count; index += 1) {
      monotoneMeans.push(block.sum / block.count);
    }
  }

  const start = Math.round(monotoneMeans[0]!);
  const capacity = measureCapacity();
  const ceiling = start + (step * Math.floor((capacity.quantile - GEOMETRY_BUDGET_CALIBRATION.capacityMargin - start) / step));
  const saturationLevel = 2 + Math.ceil((ceiling - start) / step);
  const rungsByLevel: Record<number, number> = {};
  for (let level = 2; level <= saturationLevel; level += 1) {
    const target = Math.min(ceiling, start + (step * (level - 2))) - GEOMETRY_BUDGET_BASE_OFFSET;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    monotoneMeans.forEach((value, rungs) => {
      const distance = Math.abs(value - target);
      if (distance < bestDistance - 1e-9) {
        bestDistance = distance;
        best = rungs;
      }
    });
    rungsByLevel[level] = best;
  }
  return { start, ceiling, capacityMin: capacity.min, capacityQuantile: capacity.quantile, capacityMean: capacity.mean, saturationLevel, rawMeans, monotoneMeans, rungsByLevel };
};

const BLOCK_BEGIN = '// GENERATED:GEOMETRY_BUDGET_CALIBRATION:BEGIN';
const BLOCK_END = '// GENERATED:GEOMETRY_BUDGET_CALIBRATION:END';

export const formatGeometryBudgetCalibrationBlock = (
  result: Pick<GeometryBudgetCalibrationResult, 'start' | 'ceiling' | 'rungsByLevel'>
): string => {
  const lines = Object.keys(result.rungsByLevel)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => `  ${level}: ${result.rungsByLevel[level]}`);
  return [
    BLOCK_BEGIN,
    `export const GEOMETRY_BUDGET_START = ${result.start};`,
    `export const GEOMETRY_BUDGET_CEILING = ${result.ceiling};`,
    'export const GEOMETRY_BUDGET_RUNGS_BY_LEVEL: Readonly<Record<number, number>> = {',
    `${lines.join(',\n')}`,
    '};',
    BLOCK_END
  ].join('\n');
};

const main = (): void => {
  const modulePath = fileURLToPath(new URL('../../src/legacy-runtime/legacyGeometryBudget.ts', import.meta.url));
  const result = computeGeometryBudgetCalibration();
  const block = formatGeometryBudgetCalibrationBlock(result);
  const source = readFileSync(modulePath, 'utf8');
  const begin = source.indexOf(BLOCK_BEGIN);
  const end = source.indexOf(BLOCK_END);
  if (begin < 0 || end < 0) {
    throw new Error('Generated block markers not found in legacyGeometryBudget.ts');
  }
  const next = `${source.slice(0, begin)}${block}${source.slice(end + BLOCK_END.length)}`;

  console.log(`capacity min ${result.capacityMin.toFixed(0)} p10 ${result.capacityQuantile.toFixed(0)} mean ${result.capacityMean.toFixed(0)}`);
  console.log(`start ${result.start}  ceiling ${result.ceiling}  step ${GEOMETRY_BUDGET_TARGET_STEP}  saturation level ${result.saturationLevel}`);
  console.log('rungs  raw-mean  monotone  label');
  result.rawMeans.forEach((value, rungs) => {
    console.log([
      String(rungs).padStart(5),
      value.toFixed(1).padStart(9),
      result.monotoneMeans[rungs]!.toFixed(1).padStart(9),
      rungs === 0 ? 'base' : GEOMETRY_BUDGET_TAPE[rungs - 1]!.label
    ].join('  '));
  });
  console.log('level  target  rungs');
  for (let level = 2; level <= result.saturationLevel; level += 1) {
    console.log([
      String(level).padStart(5),
      String(Math.min(result.ceiling, result.start + (GEOMETRY_BUDGET_TARGET_STEP * (level - 2)))).padStart(7),
      String(result.rungsByLevel[level]).padStart(6)
    ].join('  '));
  }

  if (process.argv.includes('--write')) {
    writeFileSync(modulePath, next, 'utf8');
    console.log('rewrote GENERATED block in legacyGeometryBudget.ts');
  } else if (process.argv.includes('--check')) {
    const baked = GEOMETRY_BUDGET_RUNGS_BY_LEVEL;
    const matches = result.start === GEOMETRY_BUDGET_START
      && result.ceiling === GEOMETRY_BUDGET_CEILING
      && Object.keys(result.rungsByLevel).length === Object.keys(baked).length
      && Object.keys(result.rungsByLevel).every((key) => baked[Number(key)] === result.rungsByLevel[Number(key)]);
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
