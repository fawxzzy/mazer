// MAZER-GEN-031: gate frequency, saving and dead-end figures of the gate levels over a seed sweep.
//   npx vite-node scripts/analysis/gate-survival-report.ts --seeds=2 --board=phone --from=100 --to=600 --step=3
import { LADDER_BOARDS } from './lib/progressionLadderSampling';
import { sweepGateSurvival } from './lib/gateSurvivalSweep';

const arg = (name: string, fallback: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seeds = Number(arg('seeds', '2'));
const board = LADDER_BOARDS.find((b) => b.name === arg('board', 'phone')) ?? LADDER_BOARDS[0];
const from = Number(arg('from', '100'));
const to = Number(arg('to', '600'));
const step = Number(arg('step', '1'));
const levels: number[] = [];
for (let level = from; level <= to; level += step) { levels.push(level); }
const started = Date.now();
const result = sweepGateSurvival(levels, seeds, board);
console.log(`board ${board.name}, levels ${from}..${to} step ${step}, ${seeds} seeds, ${((Date.now() - started) / 1000).toFixed(0)} s`);
for (const [key, value] of Object.entries(result)) { console.log(`${key} ${typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : value}`); }
