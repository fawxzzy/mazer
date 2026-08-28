// Mazer Generation V2 -- Wave 1 offline generation laboratory.
//
// Generates a range of levels through TODAY's real generator
// (legacy-runtime), measures each one against the new mazeV2 metrics
// contract (src/domain/mazeV2/metrics.ts), and reports:
//   - the full per-level measured-metrics vector (JSON + CSV)
//   - summary statistics per axis across the range
//   - structural-fingerprint collisions (would-be "identical adjacent
//     recipe" violations under the later-wave novelty rule)
//   - a plain-HTML data report (no screenshots -- see
//     capture-level-progression-gallery.mjs for the visual contact sheet;
//     this is the numeric counterpart Wave 1 needs)
//
// This does NOT generate with a new V2 generator -- Wave 2 doesn't exist
// yet. It measures the CURRENT generator's real output so the metric
// formulas have a validated baseline before anything depends on them.
//
// Usage:
//   npx tsx scripts/analysis/mazev2-lab.ts [--minLevel=1] [--maxLevel=200]
//     [--outputDir=C:\ATLAS\tmp\captures\mazev2-lab] [--seed=12345]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../src/legacy-runtime/legacyProgression';
import { analyzeLegacyMazeAsMazeV2Metrics, computeLegacyMazeTopologyFingerprint } from '../../src/domain/mazeV2/metrics';
import { MAZE_V2_CONTRACT_VERSION, type MazeV2MeasuredMetrics } from '../../src/domain/mazeV2/types';

const DEFAULT_OUTPUT_DIR = 'C:\\ATLAS\\tmp\\captures\\mazev2-lab';
const DEFAULT_MIN_LEVEL = 1;
const DEFAULT_MAX_LEVEL = 200;
const DEFAULT_SEED = 12345;
// Mirrors legacyProgression.ts's own targetComplexity formula exactly --
// see this repo's own gallery script for the same mirrored constant, kept
// in sync there rather than imported so this lab has no dependency on the
// gallery script's own module.
const LEGACY_PROGRESSION_MIN_COMPLEXITY = 8;
const resolveTargetComplexityForLevel = (level: number): number => (
  LEGACY_PROGRESSION_MIN_COMPLEXITY + ((Math.min(level, 99) - 1) * 4)
);

interface CliArgs {
  minLevel: number;
  maxLevel: number;
  outputDir: string;
  seed: number;
}

const parseCliArgs = (): CliArgs => {
  const args: Record<string, string> = {};
  for (const entry of process.argv.slice(2)) {
    if (!entry.startsWith('--')) continue;
    const [key, value] = entry.slice(2).split('=');
    if (key) args[key] = value ?? 'true';
  }
  return {
    minLevel: args.minLevel !== undefined ? Number.parseInt(args.minLevel, 10) : DEFAULT_MIN_LEVEL,
    maxLevel: args.maxLevel !== undefined ? Number.parseInt(args.maxLevel, 10) : DEFAULT_MAX_LEVEL,
    outputDir: args.outputDir ?? DEFAULT_OUTPUT_DIR,
    seed: args.seed !== undefined ? Number.parseInt(args.seed, 10) : DEFAULT_SEED
  };
};

interface LevelSample {
  level: number;
  targetComplexity: number;
  scale: number;
  // The seed handed to the generator for this level, and the seed it
  // actually selected (maze.seed) after its own internal bounded candidate
  // search. Wave 1.5 correction: an earlier version of this lab never
  // recorded either, so its "structural-fingerprint collision" report
  // could not tell "the generator's candidate-search window overlapped
  // enough that two nearby levels selected the literal same maze" (a real,
  // pre-existing mechanism -- see legacyGeneration's own widened-window
  // candidate search for high target complexity) apart from "two different
  // mazes that happen to measure to the same rounded metric vector." Both
  // are now exported so a collision can be classified correctly.
  requestedSeed: number;
  selectedSeed: number;
  // Exact topology identity (grid + start/goal + selectedSeed), separate
  // from metrics.structuralFingerprint (a rounded MEASURED-METRIC-VECTOR
  // hash, which two different mazes can coincidentally share). See
  // computeLegacyMazeTopologyFingerprint's own comment.
  topologyFingerprint: string;
  metrics: MazeV2MeasuredMetrics;
}

// Fixed board scale for this lab, deliberately NOT the device-relative
// scale resolver -- this measures the generator's own recipe response to
// level, holding the device/viewport variable constant, the same isolation
// principle the level-progression gallery script already uses.
const LAB_BOARD_SCALE = 50;

const generateSample = (level: number, baseSeed: number): LevelSample => {
  const baseline = createEmptyLegacyProgressionState();
  const targetComplexity = resolveTargetComplexityForLevel(level);
  const track = { ...baseline.tracks.player, level: String(level), targetComplexity };
  const profile = resolveLegacyMazeGenerationProfileForProgression(track);
  // Varies per level by default (real play always steps the seed on
  // completion -- see legacyGenerationLifecycle.ts's stepLegacyGenerationSeed)
  // rather than reusing one fixed seed across the whole range. A fixed
  // seed is still available via --seed=X held constant by the caller if
  // the point is specifically isolating "does the profile alone vary
  // enough" from "does seed variety alone paper over a flat profile" --
  // the two questions want different seed strategies, so this defaults to
  // the one that matches actual gameplay.
  const requestedSeed = baseSeed + level;
  const maze = createLegacyRuntimeMazeForMode('play', LAB_BOARD_SCALE, requestedSeed, profile, { targetComplexity });
  return {
    level,
    targetComplexity,
    scale: LAB_BOARD_SCALE,
    requestedSeed,
    selectedSeed: maze.seed,
    topologyFingerprint: computeLegacyMazeTopologyFingerprint(maze),
    metrics: analyzeLegacyMazeAsMazeV2Metrics(maze)
  };
};

type FlatMetricRow = Record<string, number | string>;

const flattenSample = (sample: LevelSample): FlatMetricRow => ({
  level: sample.level,
  targetComplexity: sample.targetComplexity,
  scale: sample.scale,
  requestedSeed: sample.requestedSeed,
  selectedSeed: sample.selectedSeed,
  topologyFingerprint: sample.topologyFingerprint,
  width: sample.metrics.spatial.width,
  height: sample.metrics.spatial.height,
  walkableTileCount: sample.metrics.spatial.walkableTileCount,
  floorRatio: sample.metrics.spatial.floorRatio,
  shortestPathLength: sample.metrics.route.shortestPathLength,
  manhattanDistance: sample.metrics.route.manhattanDistance,
  detourRatio: sample.metrics.route.detourRatio,
  routeCoverage: sample.metrics.route.routeCoverage,
  directFloorPathLength: sample.metrics.route.directFloorPathLength,
  directFloorDetourRatio: sample.metrics.route.directFloorDetourRatio,
  junctionCount: sample.metrics.decision.junctionCount,
  junctionDensity: sample.metrics.decision.junctionDensity,
  routeJunctionCount: sample.metrics.decision.routeJunctionCount,
  meanJunctionDegree: sample.metrics.decision.meanJunctionDegree,
  maxJunctionDegree: sample.metrics.decision.maxJunctionDegree,
  deadEndCount: sample.metrics.deadEnd.deadEndCount,
  meanDeadEndDepth: sample.metrics.deadEnd.meanDeadEndDepth,
  maxDeadEndDepth: sample.metrics.deadEnd.maxDeadEndDepth,
  deceptiveBranchFraction: sample.metrics.deadEnd.deceptiveBranchFraction,
  turnCount: sample.metrics.turning.turnCount,
  turnRatio: sample.metrics.turning.turnRatio,
  meanStraightRunLength: sample.metrics.turning.meanStraightRunLength,
  maxStraightRunLength: sample.metrics.turning.maxStraightRunLength,
  straightRunLengthVariance: sample.metrics.turning.straightRunLengthVariance,
  cycleRank: sample.metrics.ambiguity.cycleRank,
  shortcutCount: sample.metrics.shortcut.shortcutCount,
  routeLengthReduction: sample.metrics.shortcut.routeLengthReduction,
  wrapPairCount: sample.metrics.wrap.wrapPairCount,
  wrapPairsOnRoute: sample.metrics.wrap.wrapPairsOnRoute,
  wrapRouteImpact: sample.metrics.wrap.wrapRouteImpact ?? '',
  structuralFingerprint: sample.metrics.structuralFingerprint
});

const toCsv = (rows: readonly FlatMetricRow[]): string => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => String(row[header] ?? '')).join(','));
  }
  return lines.join('\n');
};

interface AxisSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
}

const summarizeAxis = (values: readonly number[]): AxisSummary => {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: values.reduce((total, value) => total + value, 0) / Math.max(1, values.length),
    median
  };
};

const buildHtmlReport = (
  rows: readonly FlatMetricRow[],
  summaries: Record<string, AxisSummary>,
  topologyCollisions: readonly string[],
  coincidentalMetricCollisions: readonly string[]
): string => {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const tableRows = rows.map((row) => (
    `<tr>${headers.map((h) => `<td>${row[h]}</td>`).join('')}</tr>`
  )).join('\n');
  const summaryRows = Object.entries(summaries).map(([axis, summary]) => (
    `<tr><td>${axis}</td><td>${summary.min.toFixed(2)}</td><td>${summary.mean.toFixed(2)}</td><td>${summary.median.toFixed(2)}</td><td>${summary.max.toFixed(2)}</td></tr>`
  )).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mazer V2 Lab</title>
<style>
body { font-family: ui-monospace, monospace; background: #0f1115; color: #e7e9ee; font-size: 12px; }
table { border-collapse: collapse; margin-bottom: 24px; }
td, th { border: 1px solid #333; padding: 3px 6px; text-align: right; }
th { background: #1c212b; position: sticky; top: 0; }
h1, h2 { font-family: system-ui, sans-serif; }
.warn { color: #f0a94e; }
</style></head>
<body>
<h1>Mazer V2 Lab -- ${MAZE_V2_CONTRACT_VERSION}</h1>
<p>${rows.length} levels analyzed. Measures TODAY's real generator against the new mazeV2 metrics contract -- no V2 generator exists yet (Wave 1 only).</p>
<h2>Reused mazes (${topologyCollisions.length})</h2>
<p>Same grid + start/goal + selected seed across levels -- the generator handed back the literal same maze. This is the real novelty-rule finding.</p>
${topologyCollisions.length > 0 ? `<p class="warn">${topologyCollisions.join('<br>')}</p>` : '<p>None -- every level in this range selected a distinct maze.</p>'}
<h2>Coincidental metric-vector matches (${coincidentalMetricCollisions.length})</h2>
<p>Different mazes whose rounded measured-metric vector happens to match -- not reused mazes, just two topologies that read the same on these axes.</p>
${coincidentalMetricCollisions.length > 0 ? `<p class="warn">${coincidentalMetricCollisions.join('<br>')}</p>` : '<p>None.</p>'}
<h2>Per-axis summary</h2>
<table><tr><th>axis</th><th>min</th><th>mean</th><th>median</th><th>max</th></tr>${summaryRows}</table>
<h2>Per-level data</h2>
<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>${tableRows}</table>
</body></html>`;
};

const main = async (): Promise<void> => {
  const args = parseCliArgs();
  const outputDir = resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });

  const samples: LevelSample[] = [];
  for (let level = args.minLevel; level <= args.maxLevel; level += 1) {
    samples.push(generateSample(level, args.seed));
    if (level % 50 === 0) process.stdout.write(`analyzed level ${level}\n`);
  }

  const rows = samples.map(flattenSample);
  const numericAxes = Object.keys(rows[0] ?? {}).filter((key) => typeof rows[0]![key] === 'number' && key !== 'level');
  const summaries: Record<string, AxisSummary> = {};
  for (const axis of numericAxes) {
    summaries[axis] = summarizeAxis(rows.map((row) => row[axis] as number));
  }

  // Wave 1.5 correction: an earlier version of this lab bucketed only by
  // metrics.structuralFingerprint (a rounded MEASURED-METRIC-VECTOR hash)
  // and reported every bucket with >1 level as a "collision," without being
  // able to tell "the generator actually reused the same maze" apart from
  // "two different mazes happen to measure to the same rounded vector."
  // Now bucketed by both fingerprints so those two findings are reported
  // separately and correctly labeled.
  const metricFingerprintCounts = new Map<string, number[]>();
  const topologyFingerprintCounts = new Map<string, number[]>();
  for (const sample of samples) {
    const metricLevels = metricFingerprintCounts.get(sample.metrics.structuralFingerprint) ?? [];
    metricLevels.push(sample.level);
    metricFingerprintCounts.set(sample.metrics.structuralFingerprint, metricLevels);

    const topologyLevels = topologyFingerprintCounts.get(sample.topologyFingerprint) ?? [];
    topologyLevels.push(sample.level);
    topologyFingerprintCounts.set(sample.topologyFingerprint, topologyLevels);
  }

  // Real duplicates: the generator handed back the literal same maze (grid
  // + start/goal + selected seed all identical) -- e.g. the seed-window
  // candidate search overlapping enough between two nearby requested seeds
  // that both selected the same winning candidate. This is the actual
  // novelty-rule violation a later wave should reject.
  const topologyCollisions = [...topologyFingerprintCounts.entries()]
    .filter(([, levels]) => levels.length > 1)
    .map(([fingerprint, levels]) => `${fingerprint}: levels ${levels.join(', ')} -- same maze reused`);

  // Coincidental: different mazes whose rounded measured-metric vector
  // happens to match -- not a duplicate maze, just two distinct topologies
  // that read the same on these axes. Worth knowing (it bears on how
  // discriminating the metric vector itself is) but a different finding
  // from a reused maze, so kept in its own list rather than merged in.
  const coincidentalMetricCollisions = [...metricFingerprintCounts.entries()]
    .filter(([, levels]) => levels.length > 1)
    .map(([fingerprint, levels]) => ({
      fingerprint,
      levels,
      distinctTopologies: new Set(levels.map((level) => samples.find((sample) => sample.level === level)!.topologyFingerprint)).size
    }))
    .filter((group) => group.distinctTopologies > 1)
    .map((group) => `${group.fingerprint}: levels ${group.levels.join(', ')} -- different mazes, same measured vector`);

  await writeFile(
    resolve(outputDir, 'metrics.json'),
    JSON.stringify({ contractVersion: MAZE_V2_CONTRACT_VERSION, samples: rows, summaries, topologyCollisions, coincidentalMetricCollisions }, null, 2)
  );
  await writeFile(resolve(outputDir, 'metrics.csv'), toCsv(rows));
  await writeFile(resolve(outputDir, 'report.html'), buildHtmlReport(rows, summaries, topologyCollisions, coincidentalMetricCollisions));

  process.stdout.write(`\n${samples.length} levels analyzed -> ${outputDir}\n`);
  process.stdout.write(`Reused mazes: ${topologyCollisions.length}\n`);
  if (topologyCollisions.length > 0) {
    process.stdout.write(`${topologyCollisions.join('\n')}\n`);
  }
  process.stdout.write(`Coincidental metric-vector matches: ${coincidentalMetricCollisions.length}\n`);
  if (coincidentalMetricCollisions.length > 0) {
    process.stdout.write(`${coincidentalMetricCollisions.join('\n')}\n`);
  }
};

await main();
