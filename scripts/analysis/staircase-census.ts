// MAZER-GEN-020: before/after census of the staircase prototype (flag off vs on), same level and seed.
//
//   npx vite-node --script scripts/analysis/staircase-census.ts -- [--levels=5,20,60,100] [--seeds=6] [--out=<file.json>]
//
// One row per (level, seed, variant): route length, turns, decisions, openings, stubs, staircase count, felt number
// and generation time with the pass off and on. The summary prints a markdown table per level.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { LADDER_BOARDS, ladderScaleForLevel, seedForIndex, trackForLevel } from './lib/progressionLadderSampling';
import { countMazeStubs } from './lib/oneTileStubCensus';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

export interface StaircaseCensusRow {
  readonly level: number;
  readonly seedIndex: number;
  readonly variant: 'off' | 'on';
  readonly routeLength: number;
  readonly routeTurns: number;
  readonly decisions: number;
  readonly openings: number;
  readonly stubs: number;
  readonly deadEnds: number;
  readonly staircases: number;
  readonly deadEndStaircases: number;
  readonly cellsMoved: number;
  readonly felt: number;
  readonly reverted: boolean;
  readonly ms: number;
}

const openingsOf = (maze: LegacyMazeSnapshot): number => {
  let count = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if ((x === 0 || y === 0 || x === maze.width - 1 || y === maze.height - 1) && maze.grid[y]![x] === true) { count += 1; }
    }
  }
  return count;
};

export const censusRow = (
  maze: LegacyMazeSnapshot,
  level: number,
  seedIndex: number,
  variant: 'off' | 'on',
  ms: number
): StaircaseCensusRow => {
  const metrics = analyzeMazeDifficulty(maze);
  return {
    level,
    seedIndex,
    variant,
    routeLength: metrics.routeLength,
    routeTurns: metrics.routeTurns,
    decisions: metrics.decisionPoints,
    openings: openingsOf(maze),
    stubs: countMazeStubs(maze).strict,
    deadEnds: metrics.deadEnds,
    staircases: maze.staircaseStats?.staircases ?? 0,
    deadEndStaircases: maze.staircaseStats?.deadEndStaircases ?? 0,
    cellsMoved: maze.staircaseStats?.cellsMoved ?? 0,
    felt: measureFelt(maze).steps,
    reverted: maze.staircaseStats?.reverted ?? false,
    ms
  };
};

export const generateStaircaseCensusMaze = (
  level: number,
  board: typeof LADDER_BOARDS[number],
  seed: number,
  staircase: boolean
): LegacyMazeSnapshot => createLegacyRuntimeMazeForMode(
  'play',
  ladderScaleForLevel(level),
  seed,
  resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level)),
  { staircase },
  board.aspectRatio
);

if (process.argv.some((value) => value.includes('staircase-census'))) {
  const levels = arg('levels', '5,20,60,100').split(',').map(Number);
  const seeds = Number(arg('seeds', '6'));
  const out = arg('out', 'tmp/staircase-census.json');
  const rows: StaircaseCensusRow[] = [];
  const board = LADDER_BOARDS[0];
  for (const level of levels) {
    for (let index = 0; index < seeds; index += 1) {
      const seed = seedForIndex(index);
      // Interleave off/on and keep the best of three runs of each, so the timing ratio is not the order.
      let bestOff = Number.POSITIVE_INFINITY;
      let bestOn = Number.POSITIVE_INFINITY;
      let off!: LegacyMazeSnapshot;
      let on!: LegacyMazeSnapshot;
      for (let rep = 0; rep < 3; rep += 1) {
        let t = performance.now();
        off = generateStaircaseCensusMaze(level, board, seed, false);
        bestOff = Math.min(bestOff, performance.now() - t);
        t = performance.now();
        on = generateStaircaseCensusMaze(level, board, seed, true);
        bestOn = Math.min(bestOn, performance.now() - t);
      }
      rows.push(censusRow(off, level, index, 'off', bestOff));
      rows.push(censusRow(on, level, index, 'on', bestOn));
    }
  }
  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const f = (value: number, digits = 1): string => value.toFixed(digits);
  console.log('| level | variant | route | turns | decisions | openings | stubs | dead ends | staircases (dead-end) | felt | gen ms |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const level of levels) {
    for (const variant of ['off', 'on'] as const) {
      const set = rows.filter((row) => row.level === level && row.variant === variant);
      console.log(`| ${level} | ${variant} | ${f(mean(set.map((r) => r.routeLength)))} | ${f(mean(set.map((r) => r.routeTurns)))} | ${f(mean(set.map((r) => r.decisions)))} | ${f(mean(set.map((r) => r.openings)))} | ${set.reduce((a, r) => a + r.stubs, 0)} | ${f(mean(set.map((r) => r.deadEnds)))} | ${f(mean(set.map((r) => r.staircases)))} (${f(mean(set.map((r) => r.deadEndStaircases)))}) | ${f(mean(set.map((r) => r.felt)))} | ${f(mean(set.map((r) => r.ms)))} |`);
    }
  }
  const pairs = rows.filter((row) => row.variant === 'on').map((on, i) => ({ on, off: rows[i * 2]! }));
  console.log(`felt mismatches: ${pairs.filter((p) => p.on.felt !== p.off.felt).length}; route mismatches: ${pairs.filter((p) => p.on.routeLength !== p.off.routeLength).length}; decision mismatches: ${pairs.filter((p) => p.on.decisions !== p.off.decisions).length}; openings mismatches: ${pairs.filter((p) => p.on.openings !== p.off.openings).length}; reverted: ${pairs.filter((p) => p.on.reverted).length}; stubs on: ${pairs.reduce((a, p) => a + p.on.stubs, 0)}`);
  console.log(`time ratio on/off (sum): ${f(pairs.reduce((a, p) => a + p.on.ms, 0) / pairs.reduce((a, p) => a + p.off.ms, 0), 3)}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows));
}
