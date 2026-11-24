// MAZER-GEN-030: prints the before/after maze-quality table (dead-end count and length, alternate-route rate,
// solve length) over a seed sweep of the real ladder generator.
//   npx vite-node scripts/analysis/maze-quality-report.ts --seeds=8 --board=phone --from=12 --to=200 --step=4
import { LADDER_BOARDS } from './lib/progressionLadderSampling';
import { sweepMazeQuality } from './lib/mazeQualitySweep';

const arg = (name: string, fallback: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seeds = Number(arg('seeds', '8'));
const board = LADDER_BOARDS.find((b) => b.name === arg('board', 'phone')) ?? LADDER_BOARDS[0];
const from = Number(arg('from', '12'));
const to = Number(arg('to', '200'));
const step = Number(arg('step', '4'));
const levels: number[] = [];
for (let level = from; level <= to; level += step) { levels.push(level); }
const before = sweepMazeQuality(levels, seeds, false, board);
const after = sweepMazeQuality(levels, seeds, true, board);
const rows: [string, keyof typeof before, number][] = [
  ['dead ends per maze', 'deadEnds', 1],
  ['dead ends of 3 cells or fewer per maze', 'shortDeadEnds', 1],
  ['short share of dead ends (%)', 'shortShare', 100],
  ['mean dead-end length (cells)', 'meanDeadEndLen', 1],
  ['alternate-route rate, wrap walkable (% of mazes)', 'alternateRouteRate', 100],
  ['alternate-route rate, board as drawn (% of mazes)', 'alternateRouteRatePlanar', 100],
  ['route steps with a way round (%)', 'bypassShare', 100],
  ['independent loops', 'cyclomatic', 1],
  ['solve length (route steps)', 'solutionLength', 1]
];
console.log(`board ${board.name}, levels ${from}..${to} step ${step}, ${seeds} seeds, ${before.mazes} mazes per column`);
console.log('metric | before | after');
for (const [label, key, factor] of rows) { console.log(`${label} | ${(before[key] * factor).toFixed(1)} | ${(after[key] * factor).toFixed(1)}`); }
