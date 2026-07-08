import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAZER_CYCLE_TELEMETRY_STORAGE_KEY = 'mazer.cycle-telemetry.v1';
export const MAZER_CYCLE_LEARNING_REPORT_SCHEMA = 'mazer.cycle-learning.report.v1';
const PATH_PREVIEW_LIMIT = 8;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const roundNumber = (value, precision = 3) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const averageOrNull = (values) => {
  const safeValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return safeValues.length > 0
    ? roundNumber(safeValues.reduce((total, value) => total + value, 0) / safeValues.length)
    : null;
};

const countBy = (items, resolveKey, allowedKeys) => {
  const counts = Object.fromEntries(allowedKeys.map((key) => [key, 0]));
  for (const item of items) {
    const key = resolveKey(item);
    counts[allowedKeys.includes(key) ? key : 'unknown'] += 1;
  }
  return counts;
};

const copyPoint = (point) => ({
  x: Number.isFinite(point?.x) ? Math.round(point.x) : 0,
  y: Number.isFinite(point?.y) ? Math.round(point.y) : 0
});

const normalizeReceipt = (receipt) => {
  if (!isRecord(receipt)) {
    return null;
  }

  const rawPath = Array.isArray(receipt.playerPath) ? receipt.playerPath : [];
  const rawPreview = Array.isArray(receipt.playerPathPreview) ? receipt.playerPathPreview : [];
  const pathPreviewSource = rawPath.length > 0
    ? rawPath.slice(Math.max(0, rawPath.length - PATH_PREVIEW_LIMIT))
    : rawPreview.slice(Math.max(0, rawPreview.length - PATH_PREVIEW_LIMIT));

  return {
    id: typeof receipt.id === 'string' ? receipt.id : null,
    surface: receipt.surface === 'menu-demo' || receipt.surface === 'play' ? receipt.surface : 'unknown',
    mazeSeed: Number.isFinite(receipt.mazeSeed) ? Math.round(receipt.mazeSeed) : null,
    mazeSize: Number.isFinite(receipt.mazeSize) ? Math.round(receipt.mazeSize) : null,
    routeQuality: receipt.routeQuality === 'multi-route' || receipt.routeQuality === 'single-route'
      ? receipt.routeQuality
      : 'unknown',
    start: copyPoint(receipt.start),
    goal: copyPoint(receipt.goal),
    playerPathLength: Number.isFinite(receipt.playerPathLength)
      ? Math.max(0, Math.round(receipt.playerPathLength))
      : rawPath.length,
    playerPathTruncated: receipt.playerPathTruncated === true,
    wrongTurns: Number.isFinite(receipt.wrongTurns) ? Math.max(0, Math.round(receipt.wrongTurns)) : 0,
    backtracks: Number.isFinite(receipt.backtracks) ? Math.max(0, Math.round(receipt.backtracks)) : 0,
    completionTimeMs: Number.isFinite(receipt.completionTimeMs)
      ? Math.max(0, Math.round(receipt.completionTimeMs))
      : 0,
    resetUsed: receipt.resetUsed === true,
    controlMode: receipt.controlMode === 'stick' || receipt.controlMode === 'arrows'
      ? receipt.controlMode
      : 'unknown',
    averageFrameMs: Number.isFinite(receipt.averageFrameMs) ? roundNumber(receipt.averageFrameMs) : null,
    completedAt: typeof receipt.completedAt === 'string' ? receipt.completedAt : null,
    playerPathPreview: pathPreviewSource.map(copyPoint)
  };
};

const normalizeHistory = (historyLike) => {
  const rawReceipts = Array.isArray(historyLike)
    ? historyLike
    : isRecord(historyLike) && Array.isArray(historyLike.receipts)
      ? historyLike.receipts
      : [];

  return rawReceipts.map(normalizeReceipt).filter(Boolean);
};

const resolveSignal = (receipts) => {
  const playReceipts = receipts.filter((receipt) => receipt.surface === 'play');
  const signalReceipts = playReceipts.length >= 3 ? playReceipts : receipts;
  if (signalReceipts.length < 3) {
    return 'hold';
  }

  const averageWrongTurns = averageOrNull(signalReceipts.map((receipt) => receipt.wrongTurns)) ?? 0;
  const averageBacktracks = averageOrNull(signalReceipts.map((receipt) => receipt.backtracks)) ?? 0;
  const averageCompletionTimeMs = averageOrNull(signalReceipts.map((receipt) => receipt.completionTimeMs)) ?? 0;
  const resetRate = signalReceipts.filter((receipt) => receipt.resetUsed).length / signalReceipts.length;

  if (resetRate >= 0.4 || averageWrongTurns >= 6 || averageBacktracks >= 6) {
    return 'ease';
  }

  if (
    resetRate <= 0.1
    && averageWrongTurns <= 1
    && averageBacktracks <= 1
    && averageCompletionTimeMs > 0
    && averageCompletionTimeMs <= 20_000
  ) {
    return 'challenge';
  }

  return 'hold';
};

const summarizeReceipts = (receipts) => {
  const playReceipts = receipts.filter((receipt) => receipt.surface === 'play');
  const menuDemoReceipts = receipts.filter((receipt) => receipt.surface === 'menu-demo');
  const preferredControlMode = (() => {
    const stickCount = receipts.filter((receipt) => receipt.controlMode === 'stick').length;
    const arrowCount = receipts.filter((receipt) => receipt.controlMode === 'arrows').length;
    if (stickCount === 0 && arrowCount === 0) {
      return null;
    }
    return stickCount >= arrowCount ? 'stick' : 'arrows';
  })();

  return {
    averageBacktracks: averageOrNull(receipts.map((receipt) => receipt.backtracks)),
    averageCompletionTimeMs: averageOrNull(receipts.map((receipt) => receipt.completionTimeMs)),
    averageFrameMs: averageOrNull(receipts.map((receipt) => receipt.averageFrameMs)),
    averageWrongTurns: averageOrNull(receipts.map((receipt) => receipt.wrongTurns)),
    confidence: roundNumber(Math.min(1, (playReceipts.length >= 3 ? playReceipts.length : receipts.length) / 10)),
    menuDemoSampleCount: menuDemoReceipts.length,
    playSampleCount: playReceipts.length,
    preferredControlMode,
    resetRate: receipts.length > 0
      ? roundNumber(receipts.filter((receipt) => receipt.resetUsed).length / receipts.length)
      : null,
    routeQualityCounts: countBy(receipts, (receipt) => receipt.routeQuality, ['multi-route', 'single-route', 'unknown']),
    sampleCount: receipts.length,
    signal: resolveSignal(receipts)
  };
};

const unwrapPayload = (payload) => {
  if (typeof payload === 'string') {
    return unwrapPayload(JSON.parse(payload));
  }

  if (!isRecord(payload)) {
    return {
      diagnostics: null,
      inputKind: 'unknown',
      receipts: []
    };
  }

  if (isRecord(payload.cycleTelemetry)) {
    return unwrapPayload(payload.cycleTelemetry);
  }

  if (isRecord(payload.localStorage) && typeof payload.localStorage[MAZER_CYCLE_TELEMETRY_STORAGE_KEY] === 'string') {
    return {
      diagnostics: null,
      inputKind: 'localStorage-export',
      receipts: normalizeHistory(JSON.parse(payload.localStorage[MAZER_CYCLE_TELEMETRY_STORAGE_KEY]))
    };
  }

  if (typeof payload[MAZER_CYCLE_TELEMETRY_STORAGE_KEY] === 'string') {
    return {
      diagnostics: null,
      inputKind: 'localStorage-export',
      receipts: normalizeHistory(JSON.parse(payload[MAZER_CYCLE_TELEMETRY_STORAGE_KEY]))
    };
  }

  if (isRecord(payload.learning) && (Array.isArray(payload.recentReceipts) || isRecord(payload.latestReceipt))) {
    const receipts = normalizeHistory(
      Array.isArray(payload.recentReceipts)
        ? payload.recentReceipts
        : payload.latestReceipt
          ? [payload.latestReceipt]
          : []
    );
    return {
      diagnostics: payload,
      inputKind: 'runtime-diagnostics',
      receipts
    };
  }

  return {
    diagnostics: null,
    inputKind: Array.isArray(payload.receipts) ? 'history' : 'unknown',
    receipts: normalizeHistory(payload)
  };
};

const resolveRecommendedAction = (learning) => {
  if (learning.sampleCount < 3) {
    return 'collect-more-cycles';
  }
  if (learning.signal === 'ease') {
    return 'reduce-pressure';
  }
  if (learning.signal === 'challenge') {
    return 'increase-pressure';
  }
  return 'hold-current-tuning';
};

const resolveRisks = (learning, inputKind, receipts) => {
  const risks = [];
  if (learning.sampleCount < 3) {
    risks.push('sample-count-too-low-for-adaptive-tuning');
  }
  if (learning.playSampleCount === 0 && learning.menuDemoSampleCount > 0) {
    risks.push('menu-demo-only-data-cannot-prove-human-play-difficulty');
  }
  if ((learning.averageFrameMs ?? 0) >= 24) {
    risks.push('performance-may-distort-completion-and-control-readings');
  }
  if (inputKind === 'runtime-diagnostics' && receipts.length < learning.sampleCount) {
    risks.push('diagnostic-input-may-only-include-recent-receipt-previews');
  }
  return risks;
};

const resolveNextActions = (learning) => {
  const actions = [];
  if (learning.playSampleCount < 3) {
    actions.push('capture-at-least-three-play-completions-before-changing gameplay difficulty');
  }
  if (learning.menuDemoSampleCount > 0) {
    actions.push('compare menu-demo wrong-branch/backtrack counts against human play receipts before tuning AI cadence');
  }
  if (learning.signal === 'ease') {
    actions.push('test lower branch density, slower movement, or clearer compass/trail affordances');
  } else if (learning.signal === 'challenge') {
    actions.push('test larger mazes, more meaningful shortcuts, or enemy/obstacle pressure in a gated lane');
  } else {
    actions.push('keep current tuning until more cycle receipts accumulate');
  }
  actions.push('write only compact reports to Atlas; keep raw browser path history local and bounded');
  return actions;
};

const buildCohorts = (receipts) => ({
  byControlMode: countBy(receipts, (receipt) => receipt.controlMode, ['stick', 'arrows', 'unknown']),
  byRouteQuality: countBy(receipts, (receipt) => receipt.routeQuality, ['multi-route', 'single-route', 'unknown']),
  bySurface: countBy(receipts, (receipt) => receipt.surface, ['menu-demo', 'play', 'unknown'])
});

export const createMazeCycleTelemetryAtlasReport = (payload, options = {}) => {
  const { diagnostics, inputKind, receipts } = unwrapPayload(payload);
  const learning = diagnostics?.learning && isRecord(diagnostics.learning)
    ? {
      ...summarizeReceipts(receipts),
      ...diagnostics.learning
    }
    : summarizeReceipts(receipts);
  const recentReceipts = receipts.slice(0, 5);

  return {
    schema: MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: {
      appId: 'fawxzzy-mazer',
      repoId: 'mazer',
      inputKind,
      storageKey: diagnostics?.storageKey ?? MAZER_CYCLE_TELEMETRY_STORAGE_KEY,
      storedCount: diagnostics?.storedCount ?? receipts.length,
      historyLimit: diagnostics?.historyLimit ?? 50,
      pathLimit: diagnostics?.pathLimit ?? 256,
      diagnosticReceiptLimit: diagnostics?.diagnosticReceiptLimit ?? 5,
      cohortSampleKind: diagnostics ? 'diagnostic-recent-receipts' : 'full-history'
    },
    learning,
    cohorts: buildCohorts(receipts),
    latestReceipt: recentReceipts[0] ?? null,
    recentReceipts,
    aiReview: {
      menuDemoReceipts: learning.menuDemoSampleCount,
      playReceipts: learning.playSampleCount,
      canTuneMenuAiFromCurrentData: learning.menuDemoSampleCount >= 3,
      canTuneHumanDifficultyFromCurrentData: learning.playSampleCount >= 3,
      note: 'Menu demo AI is deterministic restored route logic; this report summarizes its observed counters but does not train a model.'
    },
    decision: {
      signal: learning.signal,
      confidence: learning.confidence,
      recommendedAction: resolveRecommendedAction(learning)
    },
    dataPolicy: {
      remoteAnalyticsEnabled: false,
      atlasSafe: true,
      rawPlayerPathExcludedFromReport: true,
      boundedBrowserHistory: true,
      notes: [
        'Report keeps only compact receipt previews and aggregates.',
        'Raw browser localStorage remains local unless explicitly exported.'
      ]
    },
    atlas: {
      recommendedReceiptRoot: 'runtime/receipts/mazer/cycle-telemetry',
      latestReceiptName: 'latest.json',
      durableUse: 'Atlas can use this compact report as project context for future tuning decisions.'
    },
    risks: resolveRisks(learning, inputKind, receipts),
    nextActions: resolveNextActions(learning)
  };
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseArgs = (argv) => {
  const args = {
    input: null,
    output: null,
    atlasReceiptRoot: null,
    pretty: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      args.input = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--output') {
      args.output = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--atlas-receipt-root') {
      args.atlasReceiptRoot = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--pretty') {
      args.pretty = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
};

const helpText = `Usage:
  node scripts/analysis/maze-cycle-telemetry-report.mjs --input <file|-> [--output <file>] [--atlas-receipt-root <dir>] [--pretty]

Input may be:
  - raw mazer.cycle-telemetry.v1 history JSON
  - runtime diagnostics JSON containing cycleTelemetry
  - localStorage-style JSON containing the mazer.cycle-telemetry.v1 string
`;

const writeJsonFile = async (filePath, value, pretty) => {
  const resolvedPath = resolve(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(value, null, pretty ? 2 : 0) + '\n', 'utf8');
  return resolvedPath;
};

export const runMazeCycleTelemetryReportCli = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(helpText);
    return { help: true };
  }

  const inputText = args.input === '-'
    ? await readStdin()
    : args.input
      ? await readFile(resolve(args.input), 'utf8')
      : await readStdin();
  const payload = JSON.parse(inputText);
  const report = createMazeCycleTelemetryAtlasReport(payload);
  const text = JSON.stringify(report, null, args.pretty ? 2 : 0) + '\n';
  const writes = {};

  if (args.output) {
    writes.output = await writeJsonFile(args.output, report, args.pretty);
  }

  if (args.atlasReceiptRoot) {
    const timestamp = report.generatedAt.replace(/[:.]/g, '-');
    const receiptRoot = resolve(args.atlasReceiptRoot);
    writes.atlasReceipt = await writeJsonFile(join(receiptRoot, `${timestamp}.json`), report, args.pretty);
    writes.atlasLatest = await writeJsonFile(join(receiptRoot, 'latest.json'), report, args.pretty);
  }

  if (!args.output && !args.atlasReceiptRoot) {
    process.stdout.write(text);
  }

  return { report, writes };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMazeCycleTelemetryReportCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
