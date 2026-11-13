// MAZER-PERF-008: measure how long one level-start maze generation blocks the
// main thread. Measurement only: it calls the production entry point
// (createLegacyRuntimeMazeForMode) and never changes generation.
//
//   npx vite-node --script ./scripts/analysis/measure-level-generation.ts
//
// Node numbers are the un-throttled floor. The in-browser number at 4x CPU
// throttle is roughly 4x this plus a cold-JIT penalty; see the PERF-008 notes
// in docs/ for the browser protocol.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  LADDER_BOARDS,
  generateLadderMaze,
  seedForIndex
} from './lib/progressionLadderSampling';

export const MEASURE_LEVEL_GENERATION_SCHEMA = 'mazer.level-generation-timing.v1';
export const MEASURE_LEVEL_GENERATION_DEFAULT_LEVELS: readonly number[] = [1, 8, 25, 50, 100, 150, 198, 230, 268];

export interface LevelGenerationTimingRow {
  readonly level: number;
  readonly board: string;
  readonly samples: number;
  readonly p50Ms: number;
  readonly maxMs: number;
}

export interface LevelGenerationTimingReport {
  readonly schema: typeof MEASURE_LEVEL_GENERATION_SCHEMA;
  readonly rows: readonly LevelGenerationTimingRow[];
  readonly worstMs: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export const measureLevelGeneration = (
  levels: readonly number[] = MEASURE_LEVEL_GENERATION_DEFAULT_LEVELS,
  seedsPerLevel = 5
): LevelGenerationTimingReport => {
  const rows: LevelGenerationTimingRow[] = [];
  for (const board of LADDER_BOARDS) {
    for (const level of levels) {
      const times: number[] = [];
      for (let index = 0; index < seedsPerLevel; index += 1) {
        const started = performance.now();
        generateLadderMaze(level, board, seedForIndex(index));
        times.push(performance.now() - started);
      }
      const sorted = [...times].sort((a, b) => a - b);
      rows.push({
        level,
        board: board.name,
        samples: sorted.length,
        p50Ms: round1(sorted[Math.floor(sorted.length / 2)] ?? 0),
        maxMs: round1(sorted[sorted.length - 1] ?? 0)
      });
    }
  }
  return { schema: MEASURE_LEVEL_GENERATION_SCHEMA, rows, worstMs: Math.max(...rows.map((row) => row.maxMs)) };
};

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain || process.argv.some((arg) => arg.endsWith('measure-level-generation.ts'))) {
  // One warm-up pass so the JIT is hot, then the measured pass.
  measureLevelGeneration([1, 50], 1);
  const report = measureLevelGeneration();
  console.log(JSON.stringify(report, null, 2));
}
