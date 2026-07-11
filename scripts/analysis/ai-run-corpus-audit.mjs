import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MAZE_CYCLE_AI_SCORER_ID,
  MAZE_CYCLE_AI_SCORER_VERSION,
  compareMazeCycleAiDecisionScore
} from '../../src/legacy-runtime/mazeCycleAiScorer.mjs';

export const MAZER_AI_RUN_CORPUS_AUDIT_SCHEMA = 'mazer.ai-run-corpus-audit.v1';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const round = (value, precision = 3) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const readField = (receipt, camelKey, snakeKey) => (
  receipt?.[camelKey] ?? (snakeKey ? receipt?.[snakeKey] : undefined)
);

const countBy = (items, keyOf) => {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item) || 'missing';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]);
};

const distribution = (values) => {
  const safe = values.filter(Number.isFinite).map(Number);
  if (safe.length === 0) return { count: 0, min: null, median: null, max: null };
  return {
    count: safe.length,
    min: Math.min(...safe),
    median: median(safe),
    max: Math.max(...safe)
  };
};

const unwrapRows = (payload) => {
  if (Array.isArray(payload)) return { progressionCount: null, receipts: payload };
  if (!isRecord(payload)) return { progressionCount: null, receipts: [] };
  const progressionCount = Number.isFinite(payload.progressionCount)
    ? Math.max(0, Math.round(payload.progressionCount))
    : null;
  return { progressionCount, receipts: Array.isArray(payload.receipts) ? payload.receipts : [] };
};

const resolveEmbedded = (receipt) => (isRecord(receipt?.receipt) ? receipt.receipt : {});

const readEmbeddedField = (receipt, camelKey, snakeKey) => {
  const embedded = resolveEmbedded(receipt);
  return readField(receipt, camelKey, snakeKey) ?? readField(embedded, camelKey, snakeKey);
};

const normalizeReceipt = (receipt) => {
  const surface = readEmbeddedField(receipt, 'surface');
  const aiDecisionSummary = readEmbeddedField(receipt, 'aiDecisionSummary', 'ai_decision_summary');
  const mazeComplexity = readEmbeddedField(receipt, 'mazeComplexity', 'maze_complexity');
  const aiDecisionScore = readEmbeddedField(receipt, 'aiDecisionScore', 'ai_decision_score');
  const shortestPathLength = readEmbeddedField(receipt, 'shortestViablePathLength', 'shortest_viable_path_length');
  const pathLength = readEmbeddedField(receipt, 'playerPathLength', 'path_length');
  const averageFrameMs = readEmbeddedField(receipt, 'averageFrameMs', 'average_frame_ms');
  const edgeWrapCount = Number.isFinite(mazeComplexity?.edgeWrapCount)
    ? Math.max(0, Math.round(mazeComplexity.edgeWrapCount))
    : 0;
  const safeShortestPathLength = Number.isFinite(shortestPathLength) && shortestPathLength > 0
    ? Math.round(shortestPathLength)
    : null;
  const safePathLength = Number.isFinite(pathLength) && pathLength >= 0 ? Math.round(pathLength) : null;
  const aiDecisionScoreComparison = compareMazeCycleAiDecisionScore(aiDecisionScore, aiDecisionSummary);
  const storedSignal = ['clean', 'searching', 'chaotic'].includes(aiDecisionScoreComparison.stored?.signal)
    ? aiDecisionScoreComparison.stored.signal
    : 'unknown';
  const recomputedSignal = aiDecisionScoreComparison.recomputed?.signal ?? 'unknown';
  const schemaVersion = readEmbeddedField(receipt, 'receiptSchemaVersion', 'receipt_schema_version');
  const buildVersion = readEmbeddedField(receipt, 'appBuild', 'app_build');
  const aiAlgorithmVersion = readEmbeddedField(receipt, 'aiAlgorithmVersion', 'ai_algorithm_version');
  const generatorContractVersion = readEmbeddedField(receipt, 'generatorContractVersion', 'generator_contract_version');
  const benchmarkGraphVersion = readEmbeddedField(receipt, 'benchmarkGraphVersion', 'benchmark_graph_version');
  const runOrigin = readEmbeddedField(receipt, 'runOrigin', 'run_origin');
  const mazeSeed = readEmbeddedField(receipt, 'mazeSeed', 'maze_seed');
  const reasonCodes = [];

  if (!isRecord(aiDecisionSummary)) reasonCodes.push('ai_decision_summary_missing');
  if (!isRecord(mazeComplexity)) reasonCodes.push('maze_complexity_missing');
  if (safeShortestPathLength === null || safePathLength === null) reasonCodes.push('route_benchmark_missing');
  if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 0) reasonCodes.push('performance_metric_missing');
  if (!schemaVersion || !buildVersion || !aiAlgorithmVersion || !generatorContractVersion || !benchmarkGraphVersion || !runOrigin) {
    reasonCodes.push('legacy_schema');
  }
  if (safeShortestPathLength !== null && safePathLength !== null && safePathLength < safeShortestPathLength) {
    reasonCodes.push('benchmark_graph_mismatch');
  }
  if (surface === 'play') reasonCodes.push('human_sample_only');
  if (aiDecisionScoreComparison.status === 'mismatch') reasonCodes.push('stored_scorer_mismatch');
  if (aiDecisionScoreComparison.status === 'stored-incomplete') reasonCodes.push('stored_scorer_incomplete');

  return {
    surface: surface === 'menu-demo' || surface === 'play' ? surface : 'unknown',
    aiDecisionPresent: isRecord(aiDecisionSummary),
    aiSignal: recomputedSignal,
    storedAiSignal: storedSignal,
    aiDecisionScoreComparison,
    mazeComplexityPresent: isRecord(mazeComplexity),
    edgeWrapCount,
    shortestPathLength: safeShortestPathLength,
    pathLength: safePathLength,
    averageFrameMs: Number.isFinite(averageFrameMs) ? round(averageFrameMs) : null,
    schemaVersion: typeof schemaVersion === 'string' && schemaVersion ? schemaVersion : 'missing',
    buildVersion: typeof buildVersion === 'string' && buildVersion ? buildVersion : 'missing',
    aiAlgorithmVersion: typeof aiAlgorithmVersion === 'string' && aiAlgorithmVersion ? aiAlgorithmVersion : 'missing',
    generatorContractVersion: typeof generatorContractVersion === 'string' && generatorContractVersion ? generatorContractVersion : 'missing',
    benchmarkGraphVersion: typeof benchmarkGraphVersion === 'string' && benchmarkGraphVersion ? benchmarkGraphVersion : 'missing',
    runOrigin: typeof runOrigin === 'string' && runOrigin ? runOrigin : 'missing',
    mazeSeed: Number.isFinite(mazeSeed) ? Math.round(mazeSeed) : null,
    reasonCodes
  };
};

const classifyReceipt = (receipt) => ({
  behaviorAnalysis: receipt.surface === 'menu-demo' && receipt.aiDecisionPresent,
  routeEfficiencyAnalysis: receipt.surface === 'menu-demo'
    && receipt.shortestPathLength !== null
    && receipt.pathLength !== null
    && !receipt.reasonCodes.includes('benchmark_graph_mismatch'),
  performanceAnalysis: receipt.averageFrameMs !== null && receipt.averageFrameMs > 0,
  progressionSimulation: receipt.surface === 'menu-demo'
    && receipt.aiDecisionPresent
    && !receipt.reasonCodes.includes('benchmark_graph_mismatch'),
  legacyOnlyReview: receipt.reasonCodes.includes('legacy_schema')
});

const countPurposeReady = (classifications, key) => classifications.filter((classification) => classification[key]).length;

export const createMazerAiRunCorpusAudit = (payload, options = {}) => {
  const { progressionCount, receipts: rawReceipts } = unwrapRows(payload);
  const receipts = rawReceipts.filter(isRecord).map(normalizeReceipt);
  const classifications = receipts.map(classifyReceipt);
  const uniqueSeeds = new Set(receipts.map((receipt) => receipt.mazeSeed).filter((seed) => seed !== null));
  const repeatedSeedCount = Object.values(countBy(
    receipts.filter((receipt) => receipt.mazeSeed !== null),
    (receipt) => String(receipt.mazeSeed)
  ))
    .filter((count) => count > 1).length;
  const benchmarkComparable = receipts.filter((receipt) => receipt.shortestPathLength !== null && receipt.pathLength !== null);
  const actualShorter = benchmarkComparable.filter((receipt) => receipt.pathLength < receipt.shortestPathLength);
  const wrappedActualShorter = actualShorter.filter((receipt) => receipt.edgeWrapCount > 0);
  const exactDuplicateCount = Object.values(countBy(rawReceipts.filter(isRecord), (receipt) => (
    typeof receipt.id === 'string' && receipt.id ? receipt.id : null
  ))).filter((count) => count > 1).reduce((total, count) => total + count - 1, 0);
  const scoreComparisonCounts = countBy(
    receipts,
    (receipt) => receipt.aiDecisionScoreComparison.status
  );

  return {
    schema: MAZER_AI_RUN_CORPUS_AUDIT_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: {
      inputKind: 'supabase-export',
      rawReceiptCount: rawReceipts.length,
      normalizedReceiptCount: receipts.length,
      rawIdentifiersExcluded: true,
      rawPathsExcluded: true,
      liveDatabaseAccessed: false
    },
    coverage: {
      progressionCount,
      durableReceiptCount: receipts.length,
      coverageGap: progressionCount === null ? null : Math.max(0, progressionCount - receipts.length),
      exactDuplicateReceiptCount: exactDuplicateCount
    },
    cohorts: {
      bySurface: countBy(receipts, (receipt) => receipt.surface),
      byReceiptSchemaVersion: countBy(receipts, (receipt) => receipt.schemaVersion),
      byBuildVersion: countBy(receipts, (receipt) => receipt.buildVersion),
      byAiAlgorithmVersion: countBy(receipts, (receipt) => receipt.aiAlgorithmVersion),
      byGeneratorContractVersion: countBy(receipts, (receipt) => receipt.generatorContractVersion),
      byBenchmarkGraphVersion: countBy(receipts, (receipt) => receipt.benchmarkGraphVersion),
      byRunOrigin: countBy(receipts, (receipt) => receipt.runOrigin),
      distinctMazeSeedCount: uniqueSeeds.size,
      repeatedMazeSeedCount: repeatedSeedCount
    },
    missingFieldCounts: {
      aiDecisionSummary: receipts.filter((receipt) => !receipt.aiDecisionPresent).length,
      mazeComplexity: receipts.filter((receipt) => !receipt.mazeComplexityPresent).length,
      routeBenchmark: receipts.filter((receipt) => receipt.reasonCodes.includes('route_benchmark_missing')).length,
      performanceMetric: receipts.filter((receipt) => receipt.reasonCodes.includes('performance_metric_missing')).length,
      explicitVersionMetadata: receipts.filter((receipt) => receipt.reasonCodes.includes('legacy_schema')).length
    },
    quality: {
      behaviorReadyCount: countPurposeReady(classifications, 'behaviorAnalysis'),
      routeCalibrationReadyCount: countPurposeReady(classifications, 'routeEfficiencyAnalysis'),
      performanceReadyCount: countPurposeReady(classifications, 'performanceAnalysis'),
      progressionSimulationReadyCount: countPurposeReady(classifications, 'progressionSimulation'),
      legacyOnlyReviewCount: countPurposeReady(classifications, 'legacyOnlyReview'),
      reasonCodeCounts: countBy(receipts.flatMap((receipt) => receipt.reasonCodes), (reasonCode) => reasonCode),
      decisionSignalCounts: countBy(receipts, (receipt) => receipt.aiSignal),
      storedDecisionSignalCounts: countBy(receipts, (receipt) => receipt.storedAiSignal)
    },
    aiScorer: {
      id: MAZE_CYCLE_AI_SCORER_ID,
      version: MAZE_CYCLE_AI_SCORER_VERSION,
      recomputedReceiptCount: receipts.filter((receipt) => receipt.aiDecisionScoreComparison.recomputed !== null).length,
      storedScoreReceiptCount: receipts.filter((receipt) => receipt.aiDecisionScoreComparison.stored !== null).length,
      comparisonStatusCounts: scoreComparisonCounts,
      historicalStoredScoresImmutable: true,
      calibrationUsesRecomputedScores: true
    },
    routeBenchmark: {
      comparableReceiptCount: benchmarkComparable.length,
      actualShorterThanBenchmarkCount: actualShorter.length,
      wrappedActualShorterThanBenchmarkCount: wrappedActualShorter.length,
      routeEfficiencyCalibrationBlocked: actualShorter.length > 0,
      note: 'A path shorter than the stored benchmark is preserved as evidence and excluded from route-efficiency calibration until graph parity is fixed.'
    },
    distributions: {
      completionTimeMs: distribution(rawReceipts.filter(isRecord).map((receipt) => readEmbeddedField(receipt, 'completionTimeMs', 'completion_time_ms'))),
      pathLength: distribution(receipts.map((receipt) => receipt.pathLength)),
      shortestPathLength: distribution(receipts.map((receipt) => receipt.shortestPathLength)),
      averageFrameMs: distribution(receipts.map((receipt) => receipt.averageFrameMs))
    },
    dataPolicy: {
      rawReceiptsImmutable: true,
      syntheticBackfillForbidden: true,
      automaticLiveTuningForbidden: true,
      accountProgressionMutationPerformed: false,
      receiptDeletionPerformed: false
    },
    nextActions: [
      're-export the corpus after graph parity when current route-benchmark calibration is required',
      'add future-only receipt versioning and idempotent coverage metadata',
      'generate deterministic representative, stress, and wrap-anomaly seed packs from quality-approved cohorts'
    ]
  };
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const parseArgs = (argv) => {
  const args = { input: null, output: null, pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') { args.input = argv[index + 1] ?? null; index += 1; }
    else if (arg === '--output') { args.output = argv[index + 1] ?? null; index += 1; }
    else if (arg === '--pretty') args.pretty = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
};

const helpText = `Usage:\n  node scripts/analysis/ai-run-corpus-audit.mjs --input <redacted-export.json|-> [--output <audit.json>] [--pretty]\n\nThe command reads an existing export only. It does not create a Supabase client, write a database row, or include raw account identifiers or paths in its output.\n`;

export const runMazerAiRunCorpusAuditCli = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(helpText); return { help: true }; }
  const inputText = args.input === '-' ? await readStdin() : args.input ? await readFile(resolve(args.input), 'utf8') : await readStdin();
  const audit = createMazerAiRunCorpusAudit(JSON.parse(inputText));
  const text = JSON.stringify(audit, null, args.pretty ? 2 : 0) + '\n';
  if (!args.output) { process.stdout.write(text); return { audit, writes: {} }; }
  const outputPath = resolve(args.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, 'utf8');
  return { audit, writes: { output: outputPath } };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMazerAiRunCorpusAuditCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
