// How should a wrap corridor be priced? A paired experiment (the loop-pricing method,
// progression-loop-pricing.ts, applied to the wrap corridors).
//
// For sampled (level, board, seed) the same level is generated plain (no wrap corridor) and
// with one or two wrap corridors, each wrap arm at several PRICE percents: the share of the
// wrap saving (shortest route with the wrap links severed minus the shortest route as built)
// the generator adds to its explorer target. Loops are forced off so the wrap is the only
// difference. Every maze is gauged with the independent suite. At price 0 the explorer
// steps are equal across arms by construction; the question is what the wrap does to the
// held-out walkers (human-like explorer, random walk) that the generator does not see:
//
//   * if they finish faster in a wrap arm at price 0, the explorer number understates the wrap
//     and the metric must charge for it;
//   * the price at which the paired change of the held-out walkers crosses zero is the price
//     that makes a maze with a wrap as hard to those walkers as the plain maze at the same
//     level (interpolated below, with its standard error).
//
//   npx vite-node --script scripts/analysis/progression-wrap-pricing.ts \
//     [--levels=40,60,80,100,110,120,130,139] [--seeds=30] [--prices=0,50,100,150] [--out=<json>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { LEGACY_EMPTY_LOOP_PLAN } from '../../src/legacy-runtime/legacyMazeLoops';
import { LADDER_BOARDS, seedForIndex, trackForLevel } from './lib/progressionLadderSampling';
import { computeMazeGauges, type MazeGauges } from './lib/mazeGauges';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const levels = arg('levels', '40,60,80,100,110,120,130,139').split(',').map(Number);
const seeds = Number(arg('seeds', '30'));
const prices = arg('prices', '0,50,100,150').split(',').map(Number);
const out = arg('out', '');

interface Arm { name: string; rungs: number; price: number }
const ARMS: Arm[] = [{ name: 'plain', rungs: 0, price: 0 }];
for (const rungs of [1, 2]) {
  for (const price of prices) { ARMS.push({ name: `${rungs} wrap${rungs > 1 ? 's' : ''} @${price}%`, rungs, price }); }
}

const KEYS: (keyof MazeGauges)[] = [
  'pullSteps', 'pullStepsMc', 'shortest', 'explorerPath', 'humanSteps', 'randomWalkSteps',
  'wrapSaving', 'decisionPoints', 'misleadingJunctions', 'deadEnds', 'boardFill', 'greedySearchCells', 'astarExpansions'
];

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

const table: Record<string, Record<string, number[]>> = {};
let missed = 0;
let total = 0;
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    for (let index = 0; index < seeds; index += 1) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      for (const arm of ARMS) {
        const maze = createLegacyRuntimeMazeForMode('play', 35, seedForIndex(index), profile, {
          loopPlan: LEGACY_EMPTY_LOOP_PLAN, wrapRungs: arm.rungs, wrapPricePercent: arm.price
        }, board.aspectRatio);
        const gauges = computeMazeGauges({
          width: maze.width, height: maze.height,
          rows: maze.grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')),
          start: maze.start, goal: maze.goal
        });
        const armTable = (table[arm.name] ??= {});
        for (const key of KEYS) { (armTable[key] ??= []).push(Number(gauges[key] ?? 0)); }
        (armTable.rungsDelivered ??= []).push(maze.wrapStats?.rungs ?? 0);
        total += 1;
        if (arm.rungs > 0 && (maze.wrapStats?.rungs ?? 0) < arm.rungs) { missed += 1; }
      }
    }
  }
}

const base = table.plain!;
console.log(`levels ${levels.join(',')}  seeds ${seeds}  boards ${LADDER_BOARDS.length}  n ${levels.length * seeds * LADDER_BOARDS.length} per arm; wrap arms that fell back to a plain base: ${missed} of ${total}`);
console.log(['arm'.padEnd(16), ...KEYS.map((key) => String(key).slice(0, 9).padStart(10)), 'rungs'.padStart(7)].join(' '));
const result: Record<string, Record<string, number>> = {};
for (const arm of ARMS) {
  const row = table[arm.name]!;
  result[arm.name] = {};
  const cells = KEYS.map((key) => {
    const value = mean(row[key]!);
    result[arm.name]![key as string] = value;
    return value.toFixed(key === 'boardFill' ? 3 : 1).padStart(10);
  });
  result[arm.name]!.rungsDelivered = mean(row.rungsDelivered!);
  console.log([arm.name.padEnd(16), ...cells, mean(row.rungsDelivered!).toFixed(2).padStart(7)].join(' '));
}

const pairedStats = (row: Record<string, number[]>, key: string): { percent: number; se: number } => {
  const diffs = row[key]!.map((value, index) => value - base[key]![index]!);
  const m = mean(diffs);
  const se = Math.sqrt(mean(diffs.map((d) => (d - m) ** 2)) / Math.max(1, diffs.length));
  const denominator = Math.max(1e-9, mean(base[key]!));
  return { percent: (m / denominator) * 100, se: (se / denominator) * 100 };
};
console.log('\nchange against the plain arm, paired, percent of the plain mean (+- 1 standard error):');
const SHOWN = ['pullSteps', 'shortest', 'explorerPath', 'humanSteps', 'randomWalkSteps', 'greedySearchCells', 'astarExpansions', 'decisionPoints', 'misleadingJunctions', 'deadEnds'];
for (const arm of ARMS.slice(1)) {
  const row = table[arm.name]!;
  console.log(arm.name.padEnd(16), SHOWN.map((key) => {
    const stat = pairedStats(row, key);
    return `${key}:${stat.percent.toFixed(1)}%+-${stat.se.toFixed(1)}`;
  }).join('  '));
}

// The price that makes the held-out walkers equal to the plain arm: where the paired change
// of their mean (human-like and random walk averaged) crosses zero, interpolated linearly.
console.log('\nbreak-even price (held-out walkers = plain), by wrap count:');
const breakEven: Record<string, { price: number; atZero: number; atMax: number }> = {};
for (const rungs of [1, 2]) {
  const points = prices.map((price) => {
    const row = table[`${rungs} wrap${rungs > 1 ? 's' : ''} @${price}%`]!;
    const human = pairedStats(row, 'humanSteps');
    const random = pairedStats(row, 'randomWalkSteps');
    return { price, change: (human.percent + random.percent) / 2 };
  });
  let price = Number.NaN;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!; const b = points[i]!;
    if ((a.change <= 0 && b.change >= 0) || (a.change >= 0 && b.change <= 0)) {
      price = a.price + ((b.price - a.price) * (0 - a.change)) / ((b.change - a.change) || 1);
      break;
    }
  }
  breakEven[`${rungs}`] = { price, atZero: points[0]!.change, atMax: points[points.length - 1]!.change };
  console.log(`${rungs} wrap(s): held-out change ${points.map((p) => `@${p.price}%:${p.change.toFixed(1)}%`).join(' ')} -> break-even price ${Number.isNaN(price) ? 'outside the sampled range' : `${price.toFixed(0)}%`}`);
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ levels, seeds, prices, result, breakEven }, null, 2));
}
