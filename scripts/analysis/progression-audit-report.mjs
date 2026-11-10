// Before / after metric profile of the progression ladder at sample levels, both frozen boards.
//
//   node scripts/analysis/progression-audit-report.mjs --gauges=<gauged dump> [--out=<report.json>] [--plateau=268]
//
// Input: a gauged dump (progression-maze-dump.ts + progression-gauges.ts compute) of THIS tree.
// The "before" tree is main before the mastery tier, where every level past `--plateau` (268, the end
// of the fringe) generated the maze of level 268 for the same play seed (geometry clamped), and
// levels up to 268 are byte-identical in both trees (the golden fixture changes only past 268), so
// before(level) = this tree's row at min(level, plateau). The report says so in its `method` field.
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (name, fallback = '') => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const gaugesPath = arg('gauges');
const outPath = arg('out');
const plateau = Number(arg('plateau', '268'));
const sampleLevels = arg('levels', '1,10,50,100,198,268,328,360,388,400,1000,5000,18000').split(',').map(Number);
const records = JSON.parse(readFileSync(gaugesPath, 'utf8')).records;

const COLUMNS = [
  ['pricedSteps', 'felt (fwd, priced)'],
  ['reversePricedSteps', 'reverse felt'],
  ['twoWayPricedSteps', 'two-way felt'],
  ['humanSteps', 'human-like fwd'],
  ['reverseHumanSteps', 'human-like rev'],
  ['twoWayHumanSteps', 'two-way human'],
  ['randomWalkSteps', 'random walk'],
  ['decisionPoints', 'route junctions'],
  ['deadEnds', 'dead ends'],
  ['boardFill', 'board fill'],
  ['shortest', 'shortest route'],
  ['routeTurns', 'route turns'],
  ['maxDecoyDepth', 'max decoy depth'],
  ['astarExpansions', 'A* expansions'],
  ['greedySearchCells', 'greedy cells']
];

const rowsOf = (level, board) => records.filter((r) => r.level === level && r.board === board);
const mean = (rs, key) => rs.reduce((s, r) => s + (r.gauges[key] ?? 0), 0) / Math.max(1, rs.length);
const quantile = (rs, key, q) => {
  const values = rs.map((r) => r.gauges[key] ?? 0).sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0;
};
const summary = (rs) => Object.fromEntries(COLUMNS.map(([key]) => [key, Number(mean(rs, key).toFixed(3))]));

const report = {
  method: `Gauged dump of this tree (seeds per level and board: ${Math.max(...records.map((r) => r.seedIndex)) + 1}). before(level) = this tree's maze of level min(level, ${plateau}): main generated the level-${plateau} maze for every level past ${plateau} (geometry clamped) and levels up to ${plateau} are byte-identical in both trees. Modelled walkers, not player-tested.`,
  plateau,
  columns: Object.fromEntries(COLUMNS),
  samples: []
};
for (const level of sampleLevels) {
  for (const board of ['phone', 'desktop']) {
    const after = rowsOf(level, board);
    const before = rowsOf(Math.min(level, plateau), board);
    if (after.length === 0 || before.length === 0) { continue; }
    report.samples.push({
      level,
      board,
      seeds: after.length,
      before: summary(before),
      after: summary(after),
      reverseFeltAfter: {
        p5: quantile(after, 'reversePricedSteps', 0.05),
        p50: quantile(after, 'reversePricedSteps', 0.5),
        p95: quantile(after, 'reversePricedSteps', 0.95)
      },
      reverseFeltBefore: {
        p5: quantile(before, 'reversePricedSteps', 0.05),
        p50: quantile(before, 'reversePricedSteps', 0.5),
        p95: quantile(before, 'reversePricedSteps', 0.95)
      }
    });
  }
}
if (outPath) { writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`); }

const fmt = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2));
const lines = [];
for (const board of ['phone', 'desktop']) {
  lines.push(`\n### ${board}\n`);
  lines.push(`| Level | Tree | ${COLUMNS.map(([, label]) => label).join(' | ')} |`);
  lines.push(`|---:|---|${COLUMNS.map(() => '---:').join('|')}|`);
  for (const sample of report.samples.filter((s) => s.board === board)) {
    const same = sample.level <= plateau;
    lines.push(`| ${sample.level} | before | ${COLUMNS.map(([key]) => fmt(sample.before[key])).join(' | ')} |`);
    if (!same) { lines.push(`| ${sample.level} | after | ${COLUMNS.map(([key]) => fmt(sample.after[key])).join(' | ')} |`); }
  }
}
console.log(lines.join('\n'));
