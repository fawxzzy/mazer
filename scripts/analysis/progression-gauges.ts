// Progression difficulty gauge suite.
//
// Gauges every dumped maze (progression-maze-dump.ts) with several INDEPENDENT
// measures (lib/mazeGauges.ts) and analyses how they scale across levels:
// per-level and per-band means, trend lines, monotonicity violations, plateaus,
// sudden jumps, the saturation point, and how well each gauge discriminates levels.
// It also compares two dumps (before / after) gauge by gauge.
//
//   # 1. gauge a dump (tree independent; run in the branch under test for both dumps)
//   npx vite-node --script scripts/analysis/progression-gauges.ts \
//     compute --dump=<dump.json> --out=<gauges.json>
//   # 2. analyse one or two gauged dumps
//   npx vite-node --script scripts/analysis/progression-gauges.ts \
//     analyze --after=<gauges.json> [--before=<gauges.json>] --out=<report.json>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeMazeGauges, type MazeGauges } from './lib/mazeGauges';
import type { DumpedMaze } from './progression-maze-dump';

const arg = (name: string, fallback = ''): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// ---------------------------------------------------------------------------
// Gauge catalogue: what each one answers, and which direction means "harder".
// ---------------------------------------------------------------------------
export interface GaugeSpec {
  readonly key: keyof MazeGauges;
  readonly label: string;
  readonly group: 'route' | 'walker' | 'structure' | 'loops' | 'cost';
  readonly question: string;
  // 1 = a larger value is harder, -1 = a smaller value is harder (none today).
  readonly direction: 1 | -1;
}

export const GAUGES: readonly GaugeSpec[] = [
  { key: 'shortest', label: 'Shortest route (A*)', group: 'route', question: 'How far is the goal for a solver who knows the map?', direction: 1 },
  { key: 'explorerPath', label: 'Explorer route', group: 'route', question: 'How long is the route a goal-pulled explorer finally walks?', direction: 1 },
  { key: 'pullSteps', label: 'Pull-to-goal steps', group: 'walker', question: 'How many moves does a goal-pulled explorer need, dead ends included? (the generator steers on this)', direction: 1 },
  { key: 'pricedSteps', label: 'Priced felt (steps - loop saving)', group: 'walker', question: 'The ladder\'s steered number: explorer steps minus what loops give back to a player who knows the map', direction: 1 },
  { key: 'pullStepsMc', label: 'Pull steps, tie-averaged', group: 'walker', question: 'The same explorer averaged over 8 other tie-breaks (the unbiased price)', direction: 1 },
  { key: 'humanSteps', label: 'Human-like explorer steps', group: 'walker', question: 'Moves for an explorer that keeps straight, leans to the goal and forgets after 48 cells (median of 8)', direction: 1 },
  { key: 'randomWalkSteps', label: 'Random-walk steps', group: 'walker', question: 'Moves for a non-backtracking random walk (median of 5)', direction: 1 },
  { key: 'decisionPoints', label: 'Decision points on route', group: 'structure', question: 'Junctions the shortest route passes through', direction: 1 },
  { key: 'misleadingJunctions', label: 'Misleading junctions', group: 'structure', question: 'Route junctions where the cell nearest the goal is the wrong way', direction: 1 },
  { key: 'ambiguousJunctions', label: 'Ambiguous junctions', group: 'structure', question: 'Route junctions with 2+ equally promising ways (within one cell of goal distance)', direction: 1 },
  { key: 'deadEnds', label: 'Dead ends', group: 'structure', question: 'Dead-end tips in the whole maze', direction: 1 },
  { key: 'deadEndDepthMax', label: 'Deepest dead end', group: 'structure', question: 'Cells in the longest dead-end branch (to its junction)', direction: 1 },
  { key: 'meanBranching', label: 'Branching factor', group: 'structure', question: 'Mean forward options at a route junction', direction: 1 },
  { key: 'boardFill', label: 'Board fill', group: 'structure', question: 'Share of the board that is floor', direction: 1 },
  { key: 'cyclomatic', label: 'Independent cycles (all)', group: 'loops', question: 'Independent cycles in the floor graph, wrap corridors included', direction: 1 },
  { key: 'loopsInterior', label: 'Interior loops', group: 'loops', question: 'Independent cycles that do not need a wrap', direction: 1 },
  { key: 'loopStretches', label: 'Loop stretches on route', group: 'loops', question: 'Places on the shortest route with a real choice of ways', direction: 1 },
  { key: 'choiceStakes', label: 'Choice stakes', group: 'loops', question: 'Steps a wrong pick costs, summed over route choices', direction: 1 },
  { key: 'tieStretches', label: 'Tied alternates', group: 'loops', question: 'Route choices whose two ways are within 12 percent of each other', direction: 1 },
  { key: 'slack', label: 'Shortcut value (slack)', group: 'loops', question: 'Explorer route minus shortest route: what knowing the map saves', direction: 1 },
  { key: 'astarExpansions', label: 'A* expansions', group: 'cost', question: 'Nodes an ideal solver expands', direction: 1 },
  { key: 'greedySearchCells', label: 'Greedy-solver cells', group: 'cost', question: 'Cells a greedy goal-first walker visits', direction: 1 }
] as const;

export const BANDS: readonly { readonly name: string; readonly from: number; readonly to: number }[] = [
  { name: 'L1', from: 1, to: 1 },
  { name: 'L2-9', from: 2, to: 9 },
  { name: 'L10-24', from: 10, to: 24 },
  { name: 'L25-49', from: 25, to: 49 },
  { name: 'L50-99', from: 50, to: 99 },
  { name: 'L100-149', from: 100, to: 149 },
  { name: 'L150-197', from: 150, to: 197 },
  { name: 'L198+', from: 198, to: 10_000 }
];

interface GaugedRecord {
  board: string;
  level: number;
  seedIndex: number;
  genMs: number;
  gauges: MazeGauges;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
};
const sd = (values: readonly number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

const slopeOf = (xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } => {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, r2 };
};

const valueOf = (record: GaugedRecord, key: keyof MazeGauges): number => {
  const raw = record.gauges[key];
  return typeof raw === 'number' ? raw : 0;
};

// ---------------------------------------------------------------------------
// compute
// ---------------------------------------------------------------------------
const compute = (): void => {
  const dumpPath = arg('dump');
  const outPath = arg('out');
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as { mode: string; seeds: number; levels: number[]; records: DumpedMaze[] };
  const started = Date.now();
  const records: GaugedRecord[] = dump.records.map((record, index) => {
    if (index % 600 === 0) { console.log(`gauged ${index}/${dump.records.length}`); }
    return {
      board: record.board,
      level: record.level,
      seedIndex: record.seedIndex,
      genMs: record.genMs,
      gauges: computeMazeGauges(record)
    };
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ mode: dump.mode, seeds: dump.seeds, levels: dump.levels, records }));
  console.log(`gauged ${records.length} mazes in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${outPath}`);
};

// ---------------------------------------------------------------------------
// analyze
// ---------------------------------------------------------------------------
interface LevelStat { level: number; mean: number; p10: number; p90: number; sd: number; n: number }
interface Violation { from: number; to: number; before: number; after: number }

const levelStats = (records: readonly GaugedRecord[], key: keyof MazeGauges, board: string | null): LevelStat[] => {
  const byLevel = new Map<number, number[]>();
  for (const record of records) {
    if (board !== null && record.board !== board) { continue; }
    const list = byLevel.get(record.level) ?? [];
    list.push(valueOf(record, key));
    byLevel.set(record.level, list);
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, values]) => ({
    level, mean: mean(values), p10: quantile(values, 0.1), p90: quantile(values, 0.9), sd: sd(values), n: values.length
  }));
};

const smooth = (stats: readonly LevelStat[], radius: number): number[] => stats.map((_, index) => {
  const lo = Math.max(0, index - radius);
  const hi = Math.min(stats.length - 1, index + radius);
  return mean(stats.slice(lo, hi + 1).map((stat) => stat.mean));
});

interface GaugeAnalysis {
  key: string;
  label: string;
  group: string;
  question: string;
  perLevel: LevelStat[];
  perBand: { band: string; mean: number; sd: number; slopePerLevel: number; r2: number; first: number; last: number }[];
  // Raw level-to-level decreases of the level mean larger than the noise floor.
  violations: Violation[];
  // Decreases of the 9-level smoothed mean larger than 3 percent of the gauge range.
  smoothedViolations: Violation[];
  plateaus: { from: number; to: number; mean: number }[];
  jumps: { from: number; to: number; delta: number; times: number }[];
  saturationLevel: number | null;
  // Share of (seed, seed) pairs, level apart by `gap`, where the higher level reads harder.
  pairAccuracy: { gap: number; accuracy: number }[];
  // Spearman rank correlation of the per-maze value with the level, levels 2..197.
  spearman: number;
  // Signal over noise: slope * 100 levels over the mean within-level spread.
  signalToNoise: number;
}

const rankCorrelation = (xs: readonly number[], ys: readonly number[]): number => {
  const rank = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) { j += 1; }
      const avg = (i + j) / 2;
      for (let k = i; k <= j; k += 1) { ranks[order[k]!.index] = avg; }
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    sxy += (rx[i]! - mx) * (ry[i]! - my); sxx += (rx[i]! - mx) ** 2; syy += (ry[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
};

const analyzeGauge = (records: readonly GaugedRecord[], spec: GaugeSpec, saturationFrom: number): GaugeAnalysis => {
  const perLevel = levelStats(records, spec.key, null);
  const ramp = perLevel.filter((stat) => stat.level >= 2 && stat.level < saturationFrom);
  const range = Math.max(1e-9, Math.max(...ramp.map((s) => s.mean)) - Math.min(...ramp.map((s) => s.mean)));
  // Noise floor for a raw decrease: two standard errors of the level mean difference.
  const violations: Violation[] = [];
  for (let i = 1; i < ramp.length; i += 1) {
    const a = ramp[i - 1]!; const b = ramp[i]!;
    const noise = 2 * Math.sqrt(((a.sd ** 2) / a.n) + ((b.sd ** 2) / b.n));
    if (b.level === a.level + 1 && b.mean < a.mean - noise) { violations.push({ from: a.level, to: b.level, before: a.mean, after: b.mean }); }
  }
  const smoothed = smooth(ramp, 4);
  const smoothedViolations: Violation[] = [];
  for (let i = 5; i < ramp.length; i += 1) {
    if (smoothed[i]! < smoothed[i - 5]! - (0.03 * range)) {
      smoothedViolations.push({ from: ramp[i - 5]!.level, to: ramp[i]!.level, before: smoothed[i - 5]!, after: smoothed[i]! });
    }
  }
  // Plateaus: runs of >= 15 levels whose smoothed mean moves < 2% of the range.
  const plateaus: { from: number; to: number; mean: number }[] = [];
  let runStart = 0;
  for (let i = 1; i <= ramp.length; i += 1) {
    const flat = i < ramp.length && Math.abs(smoothed[i]! - smoothed[runStart]!) < (0.02 * range);
    if (!flat) {
      if (i - runStart >= 15) { plateaus.push({ from: ramp[runStart]!.level, to: ramp[i - 1]!.level, mean: mean(ramp.slice(runStart, i).map((s) => s.mean)) }); }
      runStart = i;
    }
  }
  // Jumps: the biggest steps of the 3-level smoothed mean relative to the median step.
  const smooth3 = smooth(ramp, 1);
  const deltas = smooth3.slice(1).map((value, i) => value - smooth3[i]!);
  const medianAbs = quantile(deltas.map((d) => Math.abs(d)), 0.5) || 1e-9;
  const jumps = deltas.map((delta, i) => ({ from: ramp[i]!.level, to: ramp[i + 1]!.level, delta, times: Math.abs(delta) / medianAbs }))
    .filter((jump) => jump.times >= 6 && Math.abs(jump.delta) >= 0.04 * range)
    .sort((a, b) => b.times - a.times).slice(0, 5);
  // Saturation: first level after which the level mean stays within 3% of the plateau mean (levels >= saturationFrom).
  const plateauMean = mean(perLevel.filter((s) => s.level >= saturationFrom).map((s) => s.mean));
  let saturationLevel: number | null = null;
  if (Number.isFinite(plateauMean)) {
    const tolerance = Math.max(0.03 * Math.abs(plateauMean), 1e-9);
    const levels = perLevel.filter((s) => s.level >= 2);
    for (let i = levels.length - 1; i >= 0; i -= 1) {
      if (Math.abs(levels[i]!.mean - plateauMean) > tolerance) { saturationLevel = levels[Math.min(levels.length - 1, i + 1)]!.level; break; }
      if (i === 0) { saturationLevel = levels[0]!.level; }
    }
  }
  const perBand = BANDS.map((band) => {
    const inBand = perLevel.filter((s) => s.level >= band.from && s.level <= band.to);
    const fit = slopeOf(inBand.map((s) => s.level), inBand.map((s) => s.mean));
    return {
      band: band.name,
      mean: mean(inBand.map((s) => s.mean)),
      sd: mean(inBand.map((s) => s.sd)),
      slopePerLevel: inBand.length > 2 ? fit.slope : 0,
      r2: inBand.length > 2 ? fit.r2 : 0,
      first: inBand[0]?.mean ?? 0,
      last: inBand[inBand.length - 1]?.mean ?? 0
    };
  });
  // Pair accuracy at several level gaps, over (board-matched) seed pairs.
  const pairAccuracy = [1, 5, 25].map((gap) => {
    let wins = 0; let total = 0;
    const lookup = new Map<string, number>();
    for (const record of records) { lookup.set(`${record.board}|${record.level}|${record.seedIndex}`, valueOf(record, spec.key)); }
    const seeds = Math.max(...records.map((r) => r.seedIndex)) + 1;
    for (const record of records) {
      if (record.level < 2 || record.level + gap >= saturationFrom || record.seedIndex !== 0) { continue; }
      for (let other = 0; other < seeds; other += 1) {
        const high = lookup.get(`${record.board}|${record.level + gap}|${other}`);
        const low = lookup.get(`${record.board}|${record.level}|${record.seedIndex}`);
        if (high === undefined || low === undefined) { continue; }
        total += 1;
        if (high > low) { wins += 1; } else if (high === low) { wins += 0.5; }
      }
    }
    return { gap, accuracy: total > 0 ? wins / total : 0 };
  });
  const rampRecords = records.filter((record) => record.level >= 2 && record.level < saturationFrom);
  const spearman = rankCorrelation(rampRecords.map((r) => r.level), rampRecords.map((r) => valueOf(r, spec.key)));
  const fitAll = slopeOf(ramp.map((s) => s.level), ramp.map((s) => s.mean));
  const within = mean(ramp.map((s) => s.sd));
  return {
    key: spec.key as string,
    label: spec.label,
    group: spec.group,
    question: spec.question,
    perLevel,
    perBand,
    violations,
    smoothedViolations,
    plateaus,
    jumps,
    saturationLevel,
    pairAccuracy,
    spearman,
    signalToNoise: within > 0 ? (fitAll.slope * 100) / within : 0
  };
};

interface TimingSummary { level: number; meanMs: number; p95Ms: number; maxMs: number }

const analyze = (): void => {
  const afterPath = arg('after');
  const beforePath = arg('before');
  const outPath = arg('out');
  const saturationFrom = Number(arg('saturation', '198'));
  const load = (path: string): GaugedRecord[] => (JSON.parse(readFileSync(path, 'utf8')) as { records: GaugedRecord[] }).records;
  const after = load(afterPath);
  const before = beforePath ? load(beforePath) : null;
  const run = (records: GaugedRecord[]) => ({
    gauges: GAUGES.map((spec) => analyzeGauge(records, spec, saturationFrom)),
    timing: ((): TimingSummary[] => {
      const byLevel = new Map<number, number[]>();
      records.forEach((r) => { const l = byLevel.get(r.level) ?? []; l.push(r.genMs); byLevel.set(r.level, l); });
      return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, values]) => ({ level, meanMs: mean(values), p95Ms: quantile(values, 0.95), maxMs: Math.max(...values) }));
    })(),
    // Share of mazes with at least one interior loop, by band; and the loop-kind-free mix.
    loopShareByBand: BANDS.map((band) => {
      const inBand = records.filter((r) => r.level >= band.from && r.level <= band.to);
      return {
        band: band.name,
        anyInteriorLoop: inBand.length ? inBand.filter((r) => r.gauges.loopsInterior > 0).length / inBand.length : 0,
        singleRoute: inBand.length ? inBand.filter((r) => r.gauges.loopsInterior === 0 && r.gauges.loopsWrap === 0).length / inBand.length : 0
      };
    })
  });
  const report = { saturationFrom, after: run(after), before: before ? run(before) : null };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report));

  // Console summary.
  const fmt = (value: number): string => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));
  const print = (title: string, data: ReturnType<typeof run>): void => {
    console.log(`\n== ${title}: per-band mean (n=${after.length / 1 > 0 ? '' : ''}) ==`);
    const header = ['gauge'.padEnd(26), ...BANDS.map((b) => b.name.padStart(9)), 'viol'.padStart(5), 'sat'.padStart(5), 'rho'.padStart(6), 'acc1'.padStart(6), 'acc25'.padStart(6)];
    console.log(header.join(' '));
    for (const gauge of data.gauges) {
      console.log([
        gauge.label.slice(0, 26).padEnd(26),
        ...gauge.perBand.map((b) => fmt(b.mean).padStart(9)),
        String(gauge.violations.length).padStart(5),
        String(gauge.saturationLevel ?? '-').padStart(5),
        gauge.spearman.toFixed(2).padStart(6),
        (gauge.pairAccuracy[0]!.accuracy * 100).toFixed(0).padStart(5) + '%',
        (gauge.pairAccuracy[2]!.accuracy * 100).toFixed(0).padStart(5) + '%'
      ].join(' '));
    }
    console.log('loop share by band:', data.loopShareByBand.map((b) => `${b.band}: any ${(b.anyInteriorLoop * 100).toFixed(0)}% single ${(b.singleRoute * 100).toFixed(0)}%`).join(' | '));
  };
  print('AFTER', report.after);
  if (report.before) { print('BEFORE', report.before); }
  console.log(`\nreport -> ${outPath}`);
};

const command = process.argv.find((value) => value === 'compute' || value === 'analyze');
if (command === 'compute') { compute(); } else if (command === 'analyze') { analyze(); } else { console.error('usage: compute|analyze'); process.exitCode = 1; }
