// Mazer Generation V2 -- Wave 1/1.5 offline generation laboratory.
//
// Generates a range of levels through TODAY's real generator
// (legacy-runtime), measures each one against the mazeV2 metrics contract
// (src/domain/mazeV2/metrics.ts), and reports:
//   - the full per-sample measured-metrics vector (JSON + CSV)
//   - summary statistics per axis across the range
//   - six distinct collision categories (see mazeV2LabCollisions.ts)
//   - a plain-HTML data report (no screenshots -- see
//     capture-level-progression-gallery.mjs for the visual contact sheet;
//     this is the numeric counterpart Wave 1 needs)
//
// This does NOT generate with a new V2 generator -- Wave 2 doesn't exist
// yet. It measures the CURRENT generator's real output so the metric
// formulas have a validated baseline before anything depends on them.
//
// Wave 1.5 correction: seed derivation is now one of three explicit
// strategies (see mazeV2SeedStrategies.ts's own header comment for why the
// old implicit `baseSeed + level` default was corrupting this lab's own
// "felt difficulty flatness" findings), and collisions are classified into
// six distinct questions (see mazeV2LabCollisions.ts) instead of two.
//
// Usage:
//   npx tsx scripts/analysis/mazev2-lab.ts [--minLevel=1] [--maxLevel=200]
//     [--strategy=sequential-nonoverlapping] [--seed=12345]
//     [--outputDir=C:\ATLAS\tmp\captures\mazev2-lab]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../src/legacy-runtime/legacyProgression';
import {
  analyzeLegacyMazeAsMazeV2Metrics,
  buildMazeV2CandidateReview,
  computeLegacyMazeRecipeDigest,
  computeLegacyMazeTopologyFingerprint
} from '../../src/domain/mazeV2/metrics';
import { MAZE_V2_CONTRACT_VERSION, type MazeV2CandidateReview, type MazeV2MeasuredMetrics } from '../../src/domain/mazeV2/types';
import {
  classifyMazeV2LabCollisions,
  type MazeV2LabCollisionGroup
} from './mazeV2LabCollisions';
import {
  findMazeV2LabCandidateWindowOverlap,
  isMazeV2LabSeedStrategyId,
  MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION,
  resolveMazeV2LabSeedPlan,
  type MazeV2LabSeedStrategyId
} from './mazeV2SeedStrategies';

const DEFAULT_OUTPUT_DIR = 'C:\\ATLAS\\tmp\\captures\\mazev2-lab';
const DEFAULT_MIN_LEVEL = 1;
const DEFAULT_MAX_LEVEL = 200;
const DEFAULT_SEED = 12345;
const DEFAULT_STRATEGY: MazeV2LabSeedStrategyId = 'sequential-nonoverlapping';
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
  strategy: MazeV2LabSeedStrategyId;
}

const parseCliArgs = (): CliArgs => {
  const args: Record<string, string> = {};
  for (const entry of process.argv.slice(2)) {
    if (!entry.startsWith('--')) continue;
    const [key, value] = entry.slice(2).split('=');
    if (key) args[key] = value ?? 'true';
  }
  const strategyArg = args.strategy ?? DEFAULT_STRATEGY;
  if (!isMazeV2LabSeedStrategyId(strategyArg)) {
    throw new Error(`Unknown --strategy=${strategyArg}. Expected one of: fixed, sequential-nonoverlapping, corpus.`);
  }
  return {
    minLevel: args.minLevel !== undefined ? Number.parseInt(args.minLevel, 10) : DEFAULT_MIN_LEVEL,
    maxLevel: args.maxLevel !== undefined ? Number.parseInt(args.maxLevel, 10) : DEFAULT_MAX_LEVEL,
    outputDir: args.outputDir ?? DEFAULT_OUTPUT_DIR,
    seed: args.seed !== undefined ? Number.parseInt(args.seed, 10) : DEFAULT_SEED,
    strategy: strategyArg
  };
};

interface LevelSample {
  level: number;
  corpusIndex: number;
  targetComplexity: number;
  scale: number;
  requestedSeed: number;
  selectedSeed: number;
  topologyFingerprint: string;
  recipeDigest: string;
  candidateReview: MazeV2CandidateReview;
  metrics: MazeV2MeasuredMetrics;
}

// Fixed board scale for this lab, deliberately NOT the device-relative
// scale resolver -- this measures the generator's own recipe response to
// level, holding the device/viewport variable constant, the same isolation
// principle the level-progression gallery script already uses.
const LAB_BOARD_SCALE = 50;

const generateSample = (level: number, corpusIndex: number, requestedSeed: number): LevelSample => {
  const baseline = createEmptyLegacyProgressionState();
  const targetComplexity = resolveTargetComplexityForLevel(level);
  const track = { ...baseline.tracks.player, level: String(level), targetComplexity };
  const profile = resolveLegacyMazeGenerationProfileForProgression(track);
  const generationStartedAtMs = performance.now();
  const maze = createLegacyRuntimeMazeForMode('play', LAB_BOARD_SCALE, requestedSeed, profile, { targetComplexity });
  const generationDurationMs = performance.now() - generationStartedAtMs;

  return {
    level,
    corpusIndex,
    targetComplexity,
    scale: LAB_BOARD_SCALE,
    requestedSeed,
    selectedSeed: maze.seed,
    topologyFingerprint: computeLegacyMazeTopologyFingerprint(maze),
    recipeDigest: computeLegacyMazeRecipeDigest(maze, String(level), requestedSeed, targetComplexity, LAB_BOARD_SCALE),
    candidateReview: buildMazeV2CandidateReview(maze, requestedSeed, generationDurationMs),
    metrics: analyzeLegacyMazeAsMazeV2Metrics(maze)
  };
};

type FlatMetricRow = Record<string, number | string>;

const flattenSample = (sample: LevelSample): FlatMetricRow => ({
  level: sample.level,
  corpusIndex: sample.corpusIndex,
  targetComplexity: sample.targetComplexity,
  scale: sample.scale,
  requestedSeed: sample.requestedSeed,
  selectedSeed: sample.selectedSeed,
  candidateCount: sample.candidateReview.candidateSeeds.length,
  generationDurationMs: sample.candidateReview.generationDurationMs,
  topologyFingerprint: sample.topologyFingerprint,
  recipeDigest: sample.recipeDigest,
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
  metricFingerprint: sample.metrics.metricFingerprint
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
  p95: number;
}

const summarizeAxis = (values: readonly number[]): AxisSummary => {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: values.reduce((total, value) => total + value, 0) / Math.max(1, values.length),
    median,
    p95: sorted[Math.max(0, p95Index)] ?? 0
  };
};

const renderCollisionGroups = (label: string, description: string, groups: readonly MazeV2LabCollisionGroup[]): string => `
<h2>${label} (${groups.length})</h2>
<p>${description}</p>
${groups.length > 0
    ? `<p class="warn">${groups.map((group) => `${group.key}: levels ${group.levels.join(', ')}`).join('<br>')}</p>`
    : '<p>None.</p>'}`;

const buildHtmlReport = (
  rows: readonly FlatMetricRow[],
  summaries: Record<string, AxisSummary>,
  collisions: ReturnType<typeof classifyMazeV2LabCollisions>,
  meta: { strategy: MazeV2LabSeedStrategyId; baseSeed: number; minLevel: number; maxLevel: number; cliInvocation: string }
): string => {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const tableRows = rows.map((row) => (
    `<tr>${headers.map((h) => `<td>${row[h]}</td>`).join('')}</tr>`
  )).join('\n');
  const summaryRows = Object.entries(summaries).map(([axis, summary]) => (
    `<tr><td>${axis}</td><td>${summary.min.toFixed(2)}</td><td>${summary.mean.toFixed(2)}</td><td>${summary.median.toFixed(2)}</td><td>${summary.p95.toFixed(2)}</td><td>${summary.max.toFixed(2)}</td></tr>`
  )).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mazer V2 Lab</title>
<style>
body { font-family: ui-monospace, monospace; background: #0f1115; color: #e7e9ee; font-size: 12px; }
table { border-collapse: collapse; margin-bottom: 24px; }
td, th { border: 1px solid #333; padding: 3px 6px; text-align: right; }
th { background: #1c212b; position: sticky; top: 0; }
h1, h2 { font-family: system-ui, sans-serif; }
.warn { color: #f0a94e; }
code { color: #8ac6ff; }
</style></head>
<body>
<h1>Mazer V2 Lab -- ${MAZE_V2_CONTRACT_VERSION}</h1>
<p>${rows.length} samples analyzed. Measures TODAY's real generator against the mazeV2 metrics contract -- no V2 generator exists yet.</p>
<p>strategy=<code>${meta.strategy}</code> baseSeed=<code>${meta.baseSeed}</code> levels=<code>${meta.minLevel}-${meta.maxLevel}</code></p>
<p>CLI: <code>${meta.cliInvocation}</code></p>
${renderCollisionGroups(
    'Same requested + selected seed',
    'Only possible when a strategy deliberately repeats a requested seed across levels. Not itself proof of a reused maze -- target complexity and profile still vary with level.',
    collisions.sameRequestedAndSelectedSeed
  )}
${renderCollisionGroups(
    'Different requested, same selected seed',
    'The original Wave 1 bug mechanism: overlapping candidate-search windows converging on one winning candidate. Real evidence of a reused maze.',
    collisions.differentRequestedSameSelectedSeed
  )}
${renderCollisionGroups(
    'Different selected seed, same topology',
    'A genuine generator collision independent of seed-window mechanics: two unrelated seeds produced the identical graph.',
    collisions.differentSelectedSeedSameTopology
  )}
${renderCollisionGroups(
    'Different topology, same metric fingerprint',
    'Coincidental similarity, not a duplicate maze -- bears on how discriminating the metric vector is.',
    collisions.differentTopologySameMetricFingerprint
  )}
${renderCollisionGroups(
    'Same recipe digest',
    'Expected empty for every strategy this lab implements today (no (level, seed) pair repeats within one run).',
    collisions.sameRecipeDigest
  )}
${renderCollisionGroups(
    'Digest collision across different recipes',
    'Structurally undetectable by any dataset this lab could produce (SHA-256 collision resistance). Always expected empty; non-empty means a hashing bug, not a maze finding.',
    collisions.digestCollisionAcrossDifferentRecipes
  )}
<h2>Per-axis summary</h2>
<table><tr><th>axis</th><th>min</th><th>mean</th><th>median</th><th>p95</th><th>max</th></tr>${summaryRows}</table>
<h2>Per-sample data</h2>
<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>${tableRows}</table>
</body></html>`;
};

const main = async (): Promise<void> => {
  const args = parseCliArgs();
  const outputDir = resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });

  const plan = resolveMazeV2LabSeedPlan({
    strategy: args.strategy,
    baseSeed: args.seed,
    minLevel: args.minLevel,
    maxLevel: args.maxLevel
  });

  const samples: LevelSample[] = [];
  let processed = 0;
  for (const entry of plan) {
    samples.push(generateSample(entry.level, entry.corpusIndex, entry.requestedSeed));
    processed += 1;
    if (processed % 200 === 0) process.stdout.write(`analyzed ${processed}/${plan.length} samples\n`);
  }

  // Verify the nonoverlapping guarantee against what actually happened,
  // not just the stride arithmetic -- see findMazeV2LabCandidateWindowOverlap's
  // own comment on why legacyGenerationLifecycle.ts's real behavior is the
  // source of truth.
  if (args.strategy === 'sequential-nonoverlapping') {
    const overlap = findMazeV2LabCandidateWindowOverlap(
      samples.map((sample) => ({ level: sample.level, candidateSeeds: sample.candidateReview.candidateSeeds }))
    );
    if (overlap) {
      process.stdout.write(
        `WARNING: sequential-nonoverlapping strategy still observed a candidate-window overlap between levels ${overlap.firstLevel} and ${overlap.secondLevel} (shared candidate seed ${overlap.sharedSeed}) -- the stride constant in mazeV2SeedStrategies.ts may be stale against legacyGenerationLifecycle.ts's own candidate-search bounds.\n`
      );
    }
  }

  const rows = samples.map(flattenSample);
  const numericAxes = Object.keys(rows[0] ?? {}).filter((key) => typeof rows[0]![key] === 'number' && key !== 'level' && key !== 'corpusIndex');
  const summaries: Record<string, AxisSummary> = {};
  for (const axis of numericAxes) {
    summaries[axis] = summarizeAxis(rows.map((row) => row[axis] as number));
  }

  const collisions = classifyMazeV2LabCollisions(samples.map((sample) => ({
    level: sample.level,
    requestedSeed: sample.requestedSeed,
    selectedSeed: sample.selectedSeed,
    topologyFingerprint: sample.topologyFingerprint,
    metricFingerprint: sample.metrics.metricFingerprint,
    recipeDigest: sample.recipeDigest
  })));

  const cliInvocation = `npx tsx scripts/analysis/mazev2-lab.ts --strategy=${args.strategy} --seed=${args.seed} --minLevel=${args.minLevel} --maxLevel=${args.maxLevel}`;

  await writeFile(
    resolve(outputDir, 'metrics.json'),
    JSON.stringify({
      contractVersion: MAZE_V2_CONTRACT_VERSION,
      seedCorpusVersion: args.strategy === 'corpus' ? MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION : null,
      cliInvocation,
      strategy: args.strategy,
      baseSeed: args.seed,
      samples: rows,
      summaries,
      collisions
    }, null, 2)
  );
  await writeFile(resolve(outputDir, 'metrics.csv'), toCsv(rows));
  await writeFile(
    resolve(outputDir, 'report.html'),
    buildHtmlReport(rows, summaries, collisions, {
      strategy: args.strategy,
      baseSeed: args.seed,
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
      cliInvocation
    })
  );

  process.stdout.write(`\n${samples.length} samples analyzed (strategy=${args.strategy}) -> ${outputDir}\n`);
  process.stdout.write(`Same requested+selected seed: ${collisions.sameRequestedAndSelectedSeed.length}\n`);
  process.stdout.write(`Different requested, same selected seed (real reuse): ${collisions.differentRequestedSameSelectedSeed.length}\n`);
  process.stdout.write(`Different selected seed, same topology: ${collisions.differentSelectedSeedSameTopology.length}\n`);
  process.stdout.write(`Different topology, same metric fingerprint (coincidental): ${collisions.differentTopologySameMetricFingerprint.length}\n`);
  process.stdout.write(`Same recipe digest: ${collisions.sameRecipeDigest.length}\n`);
};

await main();
