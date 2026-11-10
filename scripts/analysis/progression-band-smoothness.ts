// Is a band of levels smooth, or does a gauge step there? Per-level table plus step statistics.
//
// Reads one or two gauged dumps (progression-gauges.ts compute) and, for each requested gauge,
// prints the per-level mean over every maze of the level (both boards, all seeds), its
// level-to-level change, and the change of the 7-level smoothed mean (radius 3: a single
// noisy level cannot make a step, a real step cannot hide). A step is judged against the
// gauge's OWN neighbouring-level trend: the median absolute smoothed change over the band.
// A cliff shows as a ratio far above 1; a smooth ramp stays near 1 to 3. z is the same step in
// standard errors of the smoothed mean (a step under about 3 is indistinguishable from noise).
//
//   npx vite-node --script scripts/analysis/progression-band-smoothness.ts \
//     --after=<gauges.json> [--before=<gauges.json>] [--from=100] [--to=150] [--step=1] \
//     [--keys=shortest,decisionPoints,randomWalkSteps] [--out=<json>]
//
// (The gauged dump must cover from-3 .. to+3.)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name: string, fallback = ''): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const from = Number(arg('from', '100'));
const to = Number(arg('to', '150'));
const step = Number(arg('step', '1'));
const keys = arg('keys', 'shortest,decisionPoints,randomWalkSteps,humanSteps,pricedStepsWithWraps').split(',');
const out = arg('out');
const RADIUS = 3;

interface GaugedRow { level: number; gauges: Record<string, number> }
const load = (path: string): Map<number, Map<string, number[]>> => {
  const records = (JSON.parse(readFileSync(path, 'utf8')) as { records: GaugedRow[] }).records;
  const byLevel = new Map<number, Map<string, number[]>>();
  for (const record of records) {
    const gauges = byLevel.get(record.level) ?? new Map<string, number[]>();
    for (const key of keys) {
      const list = gauges.get(key) ?? [];
      list.push(Number(record.gauges[key] ?? 0));
      gauges.set(key, list);
    }
    byLevel.set(record.level, gauges);
  }
  return byLevel;
};
const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

interface Series { levels: number[]; mean: number[]; se: number[]; smooth: number[] }
const series = (data: Map<number, Map<string, number[]>>, key: string): Series => {
  const levels: number[] = [];
  for (let level = from - RADIUS; level <= to + RADIUS; level += 1) { if (data.has(level)) { levels.push(level); } }
  const means = levels.map((level) => mean(data.get(level)!.get(key)!));
  const se = levels.map((level) => {
    const values = data.get(level)!.get(key)!;
    const m = mean(values);
    return Math.sqrt(mean(values.map((v) => (v - m) ** 2)) / Math.max(1, values.length));
  });
  const smooth = levels.map((_, index) => mean(means.slice(Math.max(0, index - RADIUS), index + RADIUS + 1)));
  return { levels, mean: means, se, smooth };
};

interface Summary { key: string; maxStep: number; atLevel: number; medianStep: number; ratio: number; z: number; band: { from: number; to: number }; bandMean: number }
const summarize = (s: Series, key: string): Summary => {
  const inBand: { level: number; delta: number }[] = [];
  for (let i = 1; i < s.levels.length; i += 1) {
    if (s.levels[i]! >= from && s.levels[i]! <= to) { inBand.push({ level: s.levels[i]!, delta: s.smooth[i]! - s.smooth[i - 1]! }); }
  }
  const abs = inBand.map((entry) => Math.abs(entry.delta));
  const max = Math.max(...abs);
  const medianStep = median(abs);
  const atLevel = inBand[abs.indexOf(max)]!.level;
  // Standard error of that smoothed step: the two window ends that differ, over the window width.
  const at = s.levels.indexOf(atLevel);
  const hi = Math.min(s.levels.length - 1, at + RADIUS);
  const lo = Math.max(0, at - RADIUS - 1);
  const z = max / Math.max(1e-9, Math.sqrt((s.se[hi]! ** 2) + (s.se[lo]! ** 2)) / (hi - lo));
  return {
    key,
    maxStep: max,
    atLevel,
    medianStep,
    ratio: max / Math.max(1e-9, medianStep),
    z,
    band: { from, to },
    bandMean: mean(s.mean.filter((_, i) => s.levels[i]! >= from && s.levels[i]! <= to))
  };
};

const trees: { name: string; path: string }[] = [];
if (arg('before')) { trees.push({ name: 'before', path: arg('before') }); }
trees.push({ name: 'after', path: arg('after') });
const loaded = trees.map((tree) => ({ ...tree, data: load(tree.path) }));
const fmt = (value: number): string => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1));
const result: Record<string, Record<string, Summary>> = {};
const perLevel: Record<string, Record<string, Series>> = {};

for (const key of keys) {
  console.log(`\n== ${key}: per-level mean (both boards, ${[...loaded[0]!.data.values()][0]!.get(key)!.length} mazes per level), change, 7-level smoothed change ==`);
  const all = loaded.map((tree) => ({ tree, s: series(tree.data, key) }));
  const header = ['level'.padStart(5), ...all.flatMap(({ tree }) => [`${tree.name}`.padStart(9), 'chg'.padStart(7), 'smooth'.padStart(8)])];
  console.log(header.join(' '));
  const levels = all[0]!.s.levels.filter((level) => level >= from && level <= to);
  for (const level of levels) {
    if ((level - from) % step !== 0 && level !== to) { continue; }
    const cells = all.flatMap(({ s }) => {
      const i = s.levels.indexOf(level);
      const change = i > 0 ? s.mean[i]! - s.mean[i - 1]! : 0;
      const smoothChange = i > 0 ? s.smooth[i]! - s.smooth[i - 1]! : 0;
      return [fmt(s.mean[i]!).padStart(9), fmt(change).padStart(7), fmt(smoothChange).padStart(8)];
    });
    console.log([String(level).padStart(5), ...cells].join(' '));
  }
  for (const { tree, s } of all) {
    const summary = summarize(s, key);
    (result[tree.name] ??= {})[key] = summary;
    (perLevel[tree.name] ??= {})[key] = s;
    console.log(`${tree.name.padEnd(7)} largest smoothed step ${fmt(summary.maxStep)} at ${summary.atLevel} (band median step ${fmt(summary.medianStep)}, ratio ${summary.ratio.toFixed(1)}x, z ${summary.z.toFixed(1)}, band mean ${fmt(summary.bandMean)})`);
  }
}
console.log('\nsummary (largest 7-level-smoothed single-level step against the band median step):');
for (const tree of loaded) {
  console.log(`${tree.name}: ${keys.map((key) => `${key} ${result[tree.name]![key]!.ratio.toFixed(1)}x z ${result[tree.name]![key]!.z.toFixed(1)} (max ${fmt(result[tree.name]![key]!.maxStep)} at L${result[tree.name]![key]!.atLevel})`).join('; ')}`);
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ from, to, keys, result, perLevel }, null, 1));
}
