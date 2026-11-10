// How should a loop be priced? A paired experiment.
//
// For sampled (level, board, seed) the same level is generated with one forced loop
// plan per arm (single route, 3 shortcuts, 3 alternates, 3 decoys, one of each) and
// every arm is gauged with the independent suite. The generator steers on the
// pull-to-goal explorer steps, so those are equal across arms by construction; the
// question is what the loops do to everything ELSE at equal explorer steps:
//
//   * if the human-like explorer and the random walk (which the generator does not
//     see) finish no faster in a looped arm, the explorer number prices loops
//     correctly as it is;
//   * if they finish faster, the loops are easier than the explorer number says and
//     the metric must charge for it (a surcharge on the shortcut value).
//
//   npx vite-node --script scripts/analysis/progression-loop-pricing.ts \
//     [--levels=20,40,60,80,100,120,150,198] [--seeds=10] [--out=<json>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { LEGACY_EMPTY_LOOP_PLAN, type LegacyLoopPlan } from '../../src/legacy-runtime/legacyMazeLoops';
import { LADDER_BOARDS, seedForIndex, trackForLevel } from './lib/progressionLadderSampling';
import { computeMazeGauges, type MazeGauges } from './lib/mazeGauges';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const levels = arg('levels', '20,40,60,80,100,120,150,198').split(',').map(Number);
const seeds = Number(arg('seeds', '10'));
const out = arg('out', '');

const plan = (shortcuts: number, alternates: number, decoys: number): LegacyLoopPlan => ({
  shortcuts, alternates, decoys, maxConnector: 30, cellBudget: 90
});
const ARMS: { name: string; plan: LegacyLoopPlan }[] = [
  { name: 'single route', plan: LEGACY_EMPTY_LOOP_PLAN },
  { name: '3 shortcuts', plan: plan(3, 0, 0) },
  { name: '3 alternates', plan: plan(0, 3, 0) },
  { name: '3 decoys', plan: plan(0, 0, 3) },
  { name: 'one of each', plan: plan(1, 1, 1) }
];

const KEYS: (keyof MazeGauges)[] = [
  'pullSteps', 'pullStepsMc', 'shortest', 'explorerPath', 'humanSteps', 'randomWalkSteps',
  'loopsInterior', 'loopStretches', 'choiceStakes', 'tieStretches', 'slack', 'misleadingJunctions', 'ambiguousJunctions',
  'deadEnds', 'boardFill'
];

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

const table: Record<string, Record<string, number[]>> = {};
let missed = 0;
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    for (let index = 0; index < seeds; index += 1) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      for (const arm of ARMS) {
        const maze = createLegacyRuntimeMazeForMode('play', 35, seedForIndex(index), profile, { loopPlan: arm.plan }, board.aspectRatio);
        const gauges = computeMazeGauges({
          width: maze.width, height: maze.height,
          rows: maze.grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')),
          start: maze.start, goal: maze.goal
        });
        const armTable = (table[arm.name] ??= {});
        for (const key of KEYS) { (armTable[key] ??= []).push(Number(gauges[key] ?? 0)); }
        (armTable.loopsDelivered ??= []).push((maze.loopStats?.shortcuts ?? 0) + (maze.loopStats?.alternates ?? 0) + (maze.loopStats?.decoys ?? 0));
        if (arm.plan.shortcuts + arm.plan.alternates + arm.plan.decoys > 0 && (maze.loopStats === undefined)) { missed += 1; }
      }
    }
  }
}

const base = table['single route']!;
console.log(`levels ${levels.join(',')}  seeds ${seeds}  boards ${LADDER_BOARDS.length}  (cells = n ${levels.length * seeds * LADDER_BOARDS.length} per arm); arms with no loop delivered: ${missed}`);
const header = ['arm'.padEnd(14), ...KEYS.map((key) => String(key).slice(0, 9).padStart(10)), 'delivered'.padStart(10)];
console.log(header.join(' '));
const result: Record<string, Record<string, number>> = {};
for (const arm of ARMS) {
  const row = table[arm.name]!;
  result[arm.name] = {};
  const cells = KEYS.map((key) => {
    const value = mean(row[key]!);
    result[arm.name]![key as string] = value;
    return value.toFixed(key === 'boardFill' ? 3 : 1).padStart(10);
  });
  result[arm.name]!.loopsDelivered = mean(row.loopsDelivered!);
  console.log([arm.name.padEnd(14), ...cells, mean(row.loopsDelivered!).toFixed(2).padStart(10)].join(' '));
}
// Paired change (same level, board and seed in every arm), as a percent of the single-route
// mean, with its standard error: the human-like explorer and the random walk are noisy, so
// a difference is only evidence when it is a few standard errors wide.
console.log('\nchange against the single-route arm, paired, percent of the single-route mean (+- 1 standard error):');
const pairedChange = (row: Record<string, number[]>, key: string): string => {
  const diffs = row[key]!.map((value, index) => value - base[key]![index]!);
  const m = mean(diffs);
  const variance = mean(diffs.map((d) => (d - m) ** 2));
  const se = Math.sqrt(variance / Math.max(1, diffs.length));
  const denominator = Math.max(1e-9, mean(base[key]!));
  return `${key}:${((m / denominator) * 100).toFixed(1)}%+-${((se / denominator) * 100).toFixed(1)}`;
};
for (const arm of ARMS.slice(1)) {
  const row = table[arm.name]!;
  console.log(arm.name.padEnd(14), ['pullSteps', 'shortest', 'explorerPath', 'humanSteps', 'randomWalkSteps', 'misleadingJunctions', 'ambiguousJunctions', 'deadEnds']
    .map((key) => pairedChange(row, key)).join('  '));
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ levels, seeds, result }, null, 2));
}
