import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MAZE_CYCLE_AI_SCORER_ID,
  MAZE_CYCLE_AI_SCORER_VERSION,
  compareMazeCycleAiDecisionScore,
  scoreMazeCycleAiDecisionSummary
} from '../../src/legacy-runtime/mazeCycleAiScorer.mjs';
import {
  MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
  MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
  MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
  MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
  MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
  compareMazeCycleRunQualityScore
} from '../../src/legacy-runtime/mazeCycleRunQualityScorer.mjs';

export const MAZER_CYCLE_TELEMETRY_STORAGE_KEY = 'mazer.cycle-telemetry.v1';
export const MAZER_CYCLE_LEARNING_REPORT_SCHEMA = 'mazer.cycle-learning.report.v1';
export const MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA = 'mazer.cycle-learning.consumer.v1';
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

const readNumber = (value, fallback = 0) => (
  Number.isFinite(value) ? Math.max(0, Math.round(value * 1000) / 1000) : fallback
);

const readInteger = (value, fallback = 0) => (
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
);

const readReceiptField = (receipt, camelKey, snakeKey) => {
  if (!isRecord(receipt)) {
    return undefined;
  }
  return receipt[camelKey] ?? (snakeKey ? receipt[snakeKey] : undefined);
};

const normalizeMazeComplexity = (value) => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    checkpointScore: readNumber(value.checkpointScore),
    deadEndCount: readInteger(value.deadEndCount),
    deadEndPressureScore: readNumber(value.deadEndPressureScore),
    edgeWrapChoiceScore: readNumber(value.edgeWrapChoiceScore),
    edgeWrapCount: readInteger(value.edgeWrapCount),
    edgeWrapReliefScore: readNumber(value.edgeWrapReliefScore),
    edgeWrapScore: readNumber(value.edgeWrapScore),
    edgeWrapShortcutReliefScore: readNumber(value.edgeWrapShortcutReliefScore),
    fillQualityScore: readNumber(value.fillQualityScore),
    floorScore: readNumber(value.floorScore),
    routeScore: readNumber(value.routeScore),
    shortcutScore: readNumber(value.shortcutScore),
    sizeScore: readNumber(value.sizeScore),
    solutionScore: readNumber(value.solutionScore),
    splitCount: readInteger(value.splitCount),
    splitScore: readNumber(value.splitScore),
    total: readInteger(value.total),
    weightedDeadEndPressureScore: readNumber(value.weightedDeadEndPressureScore),
    weightedSplitPressureScore: readNumber(value.weightedSplitPressureScore)
  };
};

const normalizeProgressionPacing = (value) => {
  if (!isRecord(value)) {
    return null;
  }

  const rawSignalWindow = Array.isArray(value.signalWindow) ? value.signalWindow : [];
  const signalWindow = rawSignalWindow
    .filter((signal) => signal === 'challenge' || signal === 'ease' || signal === 'hold')
    .slice(0, 6);

  return {
    activeLevel: readInteger(value.activeLevel),
    activeRank: typeof value.activeRank === 'string' ? value.activeRank : 'unknown',
    activeTargetComplexity: readInteger(value.activeTargetComplexity),
    challengeStep: readInteger(value.challengeStep),
    easeStep: Number.isFinite(value.easeStep) ? Math.round(value.easeStep) : 0,
    measuredMazeComplexity: readInteger(value.measuredMazeComplexity),
    measuredMazeLevel: readInteger(value.measuredMazeLevel),
    measuredMazeRank: typeof value.measuredMazeRank === 'string' ? value.measuredMazeRank : 'unknown',
    nextChallengeTargetComplexity: readInteger(value.nextChallengeTargetComplexity),
    nextEaseTargetComplexity: readInteger(value.nextEaseTargetComplexity),
    recentChallengeCount: readInteger(value.recentChallengeCount),
    recentEaseCount: readInteger(value.recentEaseCount),
    signalWindow
  };
};

const normalizeGenerationReview = (value) => {
  if (!isRecord(value)) {
    return null;
  }

  const delivery = ['under-target', 'on-target', 'over-target'].includes(value.delivery)
    ? value.delivery
    : 'unknown';

  return {
    adaptiveRetryCandidateCount: readInteger(value.adaptiveRetryCandidateCount),
    adaptiveRetryScale: Number.isFinite(value.adaptiveRetryScale)
      ? readInteger(value.adaptiveRetryScale)
      : null,
    adaptiveRetryUsed: value.adaptiveRetryUsed === true,
    allCandidatesOverTarget: value.allCandidatesOverTarget === true,
    allCandidatesUnderTarget: value.allCandidatesUnderTarget === true,
    delivery,
    difference: Number.isFinite(value.difference) ? Math.round(value.difference) : 0,
    initialWindowUnderTarget: value.initialWindowUnderTarget === true,
    measuredComplexity: readInteger(value.measuredComplexity),
    pressureRetryCandidateCount: readInteger(value.pressureRetryCandidateCount),
    pressureRetryUsed: value.pressureRetryUsed === true,
    profileBand: typeof value.profileBand === 'string' ? value.profileBand : 'unknown',
    searchedCandidateCount: readInteger(value.searchedCandidateCount),
    selectedDistance: readInteger(value.selectedDistance),
    targetComplexity: readInteger(value.targetComplexity),
    tolerance: readInteger(value.tolerance)
  };
};

const normalizeReceipt = (receipt) => {
  if (!isRecord(receipt)) {
    return null;
  }

  const embeddedReceipt = isRecord(receipt.receipt) ? receipt.receipt : {};
  const mergedReceipt = {
    ...embeddedReceipt,
    ...receipt,
    aiDecisionSummary: receipt.aiDecisionSummary ?? embeddedReceipt.aiDecisionSummary,
    mazeComplexity: receipt.mazeComplexity ?? embeddedReceipt.mazeComplexity,
    playerPath: receipt.playerPath ?? embeddedReceipt.playerPath,
    playerPathLength: receipt.playerPathLength ?? embeddedReceipt.playerPathLength,
    playerPathPreview: receipt.playerPathPreview ?? embeddedReceipt.playerPathPreview,
    playerPathTruncated: receipt.playerPathTruncated ?? embeddedReceipt.playerPathTruncated,
    routeOverrunRatio: receipt.routeOverrunRatio ?? embeddedReceipt.routeOverrunRatio,
    routeOverrunSteps: receipt.routeOverrunSteps ?? embeddedReceipt.routeOverrunSteps,
    renderSafetyPenaltyScore: receipt.renderSafetyPenaltyScore ?? embeddedReceipt.renderSafetyPenaltyScore,
    routeEfficiencyPressureScore: receipt.routeEfficiencyPressureScore ?? embeddedReceipt.routeEfficiencyPressureScore,
    runQualityMetrics: receipt.runQualityMetrics ?? embeddedReceipt.runQualityMetrics,
    runQualityScore: receipt.runQualityScore ?? embeddedReceipt.runQualityScore,
    shortestViablePathLength: receipt.shortestViablePathLength ?? embeddedReceipt.shortestViablePathLength
  };
  const rawPath = Array.isArray(readReceiptField(mergedReceipt, 'playerPath', 'player_path'))
    ? readReceiptField(mergedReceipt, 'playerPath', 'player_path')
    : [];
  const rawPreview = Array.isArray(readReceiptField(mergedReceipt, 'playerPathPreview', 'player_path_preview'))
    ? readReceiptField(mergedReceipt, 'playerPathPreview', 'player_path_preview')
    : [];
  const pathPreviewSource = rawPath.length > 0
    ? rawPath.slice(Math.max(0, rawPath.length - PATH_PREVIEW_LIMIT))
    : rawPreview.slice(Math.max(0, rawPreview.length - PATH_PREVIEW_LIMIT));
  const aiDecisionSummary = readReceiptField(mergedReceipt, 'aiDecisionSummary', 'ai_decision_summary');
  const normalizedAiDecisionSummary = isRecord(aiDecisionSummary)
    ? {
      backtrackCount: Number.isFinite(aiDecisionSummary.backtrackCount)
        ? Math.max(0, Math.round(aiDecisionSummary.backtrackCount))
        : 0,
      decisionCount: Number.isFinite(aiDecisionSummary.decisionCount)
        ? Math.max(0, Math.round(aiDecisionSummary.decisionCount))
        : 0,
      optionalRetargetCount: Number.isFinite(aiDecisionSummary.optionalRetargetCount)
        ? Math.max(0, Math.round(aiDecisionSummary.optionalRetargetCount))
        : 0,
      recoveryCount: Number.isFinite(aiDecisionSummary.recoveryCount)
        ? Math.max(0, Math.round(aiDecisionSummary.recoveryCount))
        : 0,
      thinkingModel: ['human-local-memory', 'legacy-source', 'unknown'].includes(aiDecisionSummary.thinkingModel)
        ? aiDecisionSummary.thinkingModel
        : 'unknown',
      visitedUndoCount: Number.isFinite(aiDecisionSummary.visitedUndoCount)
        ? Math.max(0, Math.round(aiDecisionSummary.visitedUndoCount))
        : 0,
      wrongBranchCount: Number.isFinite(aiDecisionSummary.wrongBranchCount)
        ? Math.max(0, Math.round(aiDecisionSummary.wrongBranchCount))
        : 0
    }
    : null;
  const surface = readReceiptField(mergedReceipt, 'surface');
  const routeQuality = readReceiptField(mergedReceipt, 'routeQuality', 'route_quality');
  const controlMode = readReceiptField(mergedReceipt, 'controlMode', 'control_mode');
  const playerPathLength = readReceiptField(mergedReceipt, 'playerPathLength', 'path_length');
  const playerPathTruncated = readReceiptField(mergedReceipt, 'playerPathTruncated', 'player_path_truncated');
  const shortestViablePathLength = readReceiptField(mergedReceipt, 'shortestViablePathLength');
  const completedAt = readReceiptField(mergedReceipt, 'completedAt', 'completed_at');
  const normalizedPlayerPathLength = Number.isFinite(playerPathLength)
    ? Math.max(0, Math.round(playerPathLength))
    : rawPath.length;
  const normalizedShortestViablePathLength = Number.isFinite(shortestViablePathLength)
    ? Math.max(1, Math.round(shortestViablePathLength))
    : Math.max(1, normalizedPlayerPathLength);
  const fallbackRouteOverrunSteps = Math.max(0, normalizedPlayerPathLength - normalizedShortestViablePathLength);
  const routeOverrunSteps = readReceiptField(mergedReceipt, 'routeOverrunSteps');
  const routeOverrunRatio = readReceiptField(mergedReceipt, 'routeOverrunRatio');
  const aiDecisionScoreComparison = compareMazeCycleAiDecisionScore(
    readReceiptField(mergedReceipt, 'aiDecisionScore', 'ai_decision_score'),
    normalizedAiDecisionSummary
  );
  const normalizedMazeComplexity = normalizeMazeComplexity(readReceiptField(mergedReceipt, 'mazeComplexity'));
  const normalizedAverageFrameMs = Number.isFinite(readReceiptField(mergedReceipt, 'averageFrameMs', 'average_frame_ms'))
    ? roundNumber(readReceiptField(mergedReceipt, 'averageFrameMs', 'average_frame_ms'))
    : null;
  const normalizedWrongTurns = Number.isFinite(readReceiptField(mergedReceipt, 'wrongTurns', 'wrong_turns'))
    ? Math.max(0, Math.round(readReceiptField(mergedReceipt, 'wrongTurns', 'wrong_turns')))
    : 0;
  const normalizedBacktracks = Number.isFinite(readReceiptField(mergedReceipt, 'backtracks'))
    ? Math.max(0, Math.round(readReceiptField(mergedReceipt, 'backtracks')))
    : 0;
  const normalizedCompletionTimeMs = Number.isFinite(readReceiptField(mergedReceipt, 'completionTimeMs', 'completion_time_ms'))
    ? Math.max(0, Math.round(readReceiptField(mergedReceipt, 'completionTimeMs', 'completion_time_ms')))
    : 0;
  const normalizedSurface = surface === 'menu-demo' || surface === 'play' ? surface : 'unknown';
  const runQualityScoreComparison = compareMazeCycleRunQualityScore(
    readReceiptField(mergedReceipt, 'runQualityScore', 'run_quality_score'),
    normalizedSurface === 'unknown' || normalizedMazeComplexity === null
      ? null
      : {
        aiDecisionSummary: normalizedAiDecisionSummary,
        averageFrameMs: normalizedAverageFrameMs ?? 0,
        backtracks: normalizedBacktracks,
        completionTimeMs: normalizedCompletionTimeMs,
        complexity: normalizedMazeComplexity.total,
        playerPathLength: normalizedPlayerPathLength,
        resetUsed: readReceiptField(mergedReceipt, 'resetUsed', 'reset_used') === true,
        shortestViablePathLength: normalizedShortestViablePathLength,
        surface: normalizedSurface,
        wrongTurns: normalizedWrongTurns
      }
  );
  const storedRunQualityMetrics = readReceiptField(mergedReceipt, 'runQualityMetrics', 'run_quality_metrics');
  const runQualityMetrics = isRecord(storedRunQualityMetrics)
    ? { ...storedRunQualityMetrics }
    : null;

  return {
    id: typeof mergedReceipt.id === 'string' ? mergedReceipt.id : null,
    surface: normalizedSurface,
    aiDecisionSummary: normalizedAiDecisionSummary,
    aiDecisionScore: aiDecisionScoreComparison.recomputed,
    aiDecisionScoreComparison,
    mazeSeed: Number.isFinite(readReceiptField(mergedReceipt, 'mazeSeed', 'maze_seed'))
      ? Math.round(readReceiptField(mergedReceipt, 'mazeSeed', 'maze_seed'))
      : null,
    mazeSize: Number.isFinite(readReceiptField(mergedReceipt, 'mazeSize', 'maze_size'))
      ? Math.round(readReceiptField(mergedReceipt, 'mazeSize', 'maze_size'))
      : null,
    mazeComplexity: normalizedMazeComplexity,
    routeQuality: routeQuality === 'multi-route' || routeQuality === 'single-route'
      ? routeQuality
      : 'unknown',
    start: copyPoint(readReceiptField(mergedReceipt, 'start', 'start_cell')),
    goal: copyPoint(readReceiptField(mergedReceipt, 'goal', 'goal_cell')),
    playerPathLength: normalizedPlayerPathLength,
    playerPathTruncated: playerPathTruncated === true,
    routeOverrunRatio: Number.isFinite(routeOverrunRatio)
      ? roundNumber(Math.max(0, routeOverrunRatio))
      : roundNumber(fallbackRouteOverrunSteps / normalizedShortestViablePathLength),
    routeOverrunSteps: Number.isFinite(routeOverrunSteps)
      ? Math.max(0, Math.round(routeOverrunSteps))
      : fallbackRouteOverrunSteps,
    renderSafetyPenaltyScore: readNumber(readReceiptField(mergedReceipt, 'renderSafetyPenaltyScore')),
    routeEfficiencyPressureScore: readNumber(readReceiptField(mergedReceipt, 'routeEfficiencyPressureScore')),
    shortestViablePathLength: normalizedShortestViablePathLength,
    runQualityMetrics,
    runQualityScore: runQualityScoreComparison.recomputed,
    runQualityScoreComparison,
    wrongTurns: normalizedWrongTurns,
    backtracks: normalizedBacktracks,
    completionTimeMs: normalizedCompletionTimeMs,
    resetUsed: readReceiptField(mergedReceipt, 'resetUsed', 'reset_used') === true,
    controlMode: controlMode === 'stick' || controlMode === 'arrows'
      ? controlMode
      : 'unknown',
    averageFrameMs: normalizedAverageFrameMs,
    completedAt: typeof completedAt === 'string' ? completedAt : null,
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

const looksLikeSupabaseReceiptRows = (receipts) => receipts.some((receipt) => (
  isRecord(receipt)
  && (
    typeof receipt.user_id === 'string'
    || Object.prototype.hasOwnProperty.call(receipt, 'maze_seed')
    || Object.prototype.hasOwnProperty.call(receipt, 'start_cell')
    || Object.prototype.hasOwnProperty.call(receipt, 'goal_cell')
  )
));

const resolveSignal = (receipts) => {
  const playReceipts = receipts.filter((receipt) => receipt.surface === 'play');
  const signalReceipts = playReceipts.length >= 3 ? playReceipts : receipts;
  const scores = signalReceipts.map((receipt) => receipt.runQualityScore).filter(Boolean);
  if (scores.length < 3) return 'hold';
  const majority = Math.ceil(scores.length / 2);
  if (scores.filter((score) => score.signal === 'ease').length >= majority) return 'ease';
  if (scores.filter((score) => score.signal === 'challenge').length >= majority) return 'challenge';
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
    averageRenderSafetyPenaltyScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.renderSafetyPenaltyScore)),
    averageRouteEfficiencyPressureScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.routeEfficiencyPressureScore)),
    averageRunQualityScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.total)),
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

  if (Array.isArray(payload)) {
    return {
      diagnostics: null,
      inputKind: looksLikeSupabaseReceiptRows(payload) ? 'supabase-export' : 'history',
      receipts: normalizeHistory(payload)
    };
  }

  if (!isRecord(payload)) {
    return {
      diagnostics: null,
      inputKind: 'unknown',
      receipts: []
    };
  }

  if (isRecord(payload.cycleTelemetry)) {
    const unwrapped = unwrapPayload(payload.cycleTelemetry);
    return {
      ...unwrapped,
      diagnostics: {
        ...payload.cycleTelemetry,
        progression: payload.progression
      },
      inputKind: 'runtime-diagnostics'
    };
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

  const exportedReceipts = Array.isArray(payload.receipts) ? payload.receipts : [];
  const looksLikeSupabaseRows = looksLikeSupabaseReceiptRows(exportedReceipts);

  return {
    diagnostics: null,
    inputKind: looksLikeSupabaseRows ? 'supabase-export' : Array.isArray(payload.receipts) ? 'history' : 'unknown',
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

const buildAiDecisionReview = (receipts, learning) => {
  const summaries = receipts
    .map((receipt) => receipt.aiDecisionSummary)
    .filter(Boolean);
  const scores = summaries
    .map(scoreMazeCycleAiDecisionSummary)
    .filter(Boolean);
  const comparisonCounts = countBy(
    receipts.map((receipt) => receipt.aiDecisionScoreComparison),
    (comparison) => comparison?.status,
    ['match', 'mismatch', 'stored-missing', 'stored-incomplete', 'recomputation-unavailable', 'unavailable', 'unknown']
  );

  return {
    scorerId: MAZE_CYCLE_AI_SCORER_ID,
    scorerVersion: MAZE_CYCLE_AI_SCORER_VERSION,
    scoreComparisonCounts: comparisonCounts,
    menuDemoReceipts: learning.menuDemoSampleCount,
    playReceipts: learning.playSampleCount,
    aiDecisionReceiptCount: summaries.length,
    canTuneMenuAiFromCurrentData: learning.menuDemoSampleCount >= 3 && summaries.length >= 3,
    canTuneHumanDifficultyFromCurrentData: learning.playSampleCount >= 3,
    averageDecisionCount: averageOrNull(summaries.map((summary) => summary.decisionCount)),
    averageWrongBranchCount: averageOrNull(summaries.map((summary) => summary.wrongBranchCount)),
    averageBacktrackCount: averageOrNull(summaries.map((summary) => summary.backtrackCount)),
    averageRecoveryCount: averageOrNull(summaries.map((summary) => summary.recoveryCount)),
    averageOptionalRetargetCount: averageOrNull(summaries.map((summary) => summary.optionalRetargetCount)),
    averagePressureScore: averageOrNull(scores.map((score) => score.pressureScore)),
    averageReliabilityScore: averageOrNull(scores.map((score) => score.reliabilityScore)),
    decisionSignalCounts: countBy(scores, (score) => score.signal, ['clean', 'searching', 'chaotic']),
    thinkingModelCounts: countBy(summaries, (summary) => summary.thinkingModel, [
      'human-local-memory',
      'legacy-source',
      'unknown'
    ]),
    note: 'Menu demo AI receipts are compact behavior summaries. They do not add enemies, traps, items, obstacles, or remote training.'
  };
};

const buildComplexityReview = (receipts) => {
  const complexities = receipts
    .map((receipt) => receipt.mazeComplexity)
    .filter(Boolean);

  return {
    complexityReceiptCount: complexities.length,
    averageMeasuredComplexity: averageOrNull(complexities.map((complexity) => complexity.total)),
    averageEdgeWrapCount: averageOrNull(complexities.map((complexity) => complexity.edgeWrapCount)),
    averageEdgeWrapChoiceScore: averageOrNull(complexities.map((complexity) => complexity.edgeWrapChoiceScore)),
    averageEdgeWrapReliefScore: averageOrNull(complexities.map((complexity) => complexity.edgeWrapReliefScore)),
    averageEdgeWrapShortcutReliefScore: averageOrNull(complexities.map((complexity) => complexity.edgeWrapShortcutReliefScore)),
    averageSplitCount: averageOrNull(complexities.map((complexity) => complexity.splitCount)),
    averageWeightedDeadEndPressureScore: averageOrNull(complexities.map((complexity) => complexity.weightedDeadEndPressureScore)),
    averageWeightedSplitPressureScore: averageOrNull(complexities.map((complexity) => complexity.weightedSplitPressureScore)),
    averageDeadEndCount: averageOrNull(complexities.map((complexity) => complexity.deadEndCount)),
    averageFillQualityScore: averageOrNull(complexities.map((complexity) => complexity.fillQualityScore)),
    canTuneComplexityFromCurrentData: complexities.length >= 3,
    note: 'Complexity receipts are measured from maze topology. They do not imply enemies, traps, rooms, obstacles, or diagonal graph support.'
  };
};

const buildPerformancePressureReview = (receipts) => ({
  scorerId: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
  scorerVersion: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
  shortestPathModel: MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
  topologyMetricsVersion: MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
  explorerThreshold: MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
  receiptCount: receipts.length,
  averageRunQualityScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.total)),
  averageRouteEfficiencyPressureScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.routeEfficiencyPressureScore)),
  averageRenderSafetyPenaltyScore: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.renderSafetyPenaltyScore)),
  averageRouteOverrunRatio: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.routeOverrunRatio)),
  averageRouteOverrunSteps: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.routeOverrunSteps)),
  averageShortestViablePathLength: averageOrNull(receipts.map((receipt) => receipt.runQualityScore?.shortestViablePathLength)),
  averageCoverageRatio: averageOrNull(receipts.map((receipt) => receipt.runQualityMetrics?.coverageRatio)),
  averageExplorationRatio: averageOrNull(receipts.map((receipt) => receipt.runQualityMetrics?.explorationRatio)),
  averageRevisitSteps: averageOrNull(receipts.map((receipt) => receipt.runQualityMetrics?.revisitSteps)),
  cleanRunReceiptCount: receipts.filter((receipt) => receipt.runQualityMetrics?.cleanRun === true).length,
  explorerReceiptCount: receipts.filter((receipt) => receipt.runQualityMetrics?.explorer === true).length,
  topologyMetricsReceiptCount: receipts.filter((receipt) => receipt.runQualityMetrics !== null).length,
  routeEfficiencyPressureReceiptCount: receipts.filter((receipt) => (receipt.runQualityScore?.routeEfficiencyPressureScore ?? 0) > 0).length,
  routeOverrunReceiptCount: receipts.filter((receipt) => (receipt.runQualityScore?.routeOverrunSteps ?? 0) > 0).length,
  renderSafetyPenaltyReceiptCount: receipts.filter((receipt) => (receipt.runQualityScore?.renderSafetyPenaltyScore ?? 0) > 0).length,
  scoreComparisonCounts: countBy(
    receipts.map((receipt) => receipt.runQualityScoreComparison),
    (comparison) => comparison?.status,
    ['match', 'mismatch', 'stored-missing', 'stored-incomplete', 'recomputation-unavailable', 'unavailable', 'unknown']
  ),
  canTunePerformancePressureFromCurrentData: receipts.length >= 3,
  note: 'Shortest-path comparison, route-efficiency, and render-safety pressure are cycle-level signals. They influence tuning review without changing static maze topology.'
});

const buildProgressionReview = (diagnostics) => {
  const progression = isRecord(diagnostics?.progression) ? diagnostics.progression : null;
  const pacing = normalizeProgressionPacing(progression?.pacing);

  return {
    hasProgressionDiagnostics: progression !== null,
    activeTrackId: typeof progression?.activeTrackId === 'string' ? progression.activeTrackId : null,
    pacing,
    canTuneLevelPacingFromCurrentData: Boolean(pacing && pacing.signalWindow.length >= 2),
    note: 'Progression review summarizes level/rank pacing state only. It excludes raw path history and does not auto-tune without a validated Atlas consumer.'
  };
};

const buildGenerationReview = (diagnostics) => {
  const progression = isRecord(diagnostics?.progression) ? diagnostics.progression : null;
  const normalizedReview = normalizeGenerationReview(progression?.generationReview);

  return {
    hasGenerationDiagnostics: normalizedReview !== null,
    review: normalizedReview,
    canTuneGenerationFromCurrentData: Boolean(
      normalizedReview
        && normalizedReview.searchedCandidateCount >= 3
        && normalizedReview.delivery !== 'unknown'
    ),
    note: 'Generation review summarizes target delivery and bounded retry usage. It excludes raw paths and should be calibrated against multiple cycle reports before changing generation pressure.'
  };
};

export const validateMazeCycleTelemetryAtlasReport = (report) => {
  const issues = [];

  if (!isRecord(report)) {
    return {
      schema: MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
      valid: false,
      issues: ['report-not-object'],
      canConsumeForTuning: false
    };
  }

  if (report.schema !== MAZER_CYCLE_LEARNING_REPORT_SCHEMA) {
    issues.push('schema-mismatch');
  }
  if (!isRecord(report.source) || report.source.appId !== 'fawxzzy-mazer' || report.source.repoId !== 'mazer') {
    issues.push('source-mismatch');
  }
  if (!isRecord(report.learning) || !['challenge', 'ease', 'hold'].includes(report.learning.signal)) {
    issues.push('learning-signal-missing');
  }
  if (!isRecord(report.dataPolicy) || report.dataPolicy.atlasSafe !== true) {
    issues.push('data-policy-not-atlas-safe');
  }
  if (isRecord(report.dataPolicy) && report.dataPolicy.rawPlayerPathExcludedFromReport !== true) {
    issues.push('raw-path-policy-not-enforced');
  }
  if (isRecord(report.latestReceipt) && Array.isArray(report.latestReceipt.playerPath)) {
    issues.push('latest-receipt-contains-raw-path');
  }
  if (Array.isArray(report.recentReceipts) && report.recentReceipts.some((receipt) => isRecord(receipt) && Array.isArray(receipt.playerPath))) {
    issues.push('recent-receipts-contain-raw-path');
  }
  if (!isRecord(report.aiReview)) {
    issues.push('ai-review-missing');
  }
  if (
    !isRecord(report.aiScorer)
    || report.aiScorer.id !== MAZE_CYCLE_AI_SCORER_ID
    || report.aiScorer.version !== MAZE_CYCLE_AI_SCORER_VERSION
  ) {
    issues.push('ai-scorer-contract-missing');
  }
  if (!isRecord(report.complexityReview)) {
    issues.push('complexity-review-missing');
  }
  if (!isRecord(report.performancePressureReview)) {
    issues.push('performance-pressure-review-missing');
  }
  if (
    !isRecord(report.runQualityScorer)
    || report.runQualityScorer.id !== MAZE_CYCLE_RUN_QUALITY_SCORER_ID
    || report.runQualityScorer.version !== MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION
    || report.runQualityScorer.shortestPathModel !== MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL
  ) {
    issues.push('run-quality-scorer-contract-missing');
  }
  if (!isRecord(report.progressionReview)) {
    issues.push('progression-review-missing');
  }
  if (!isRecord(report.generationReview)) {
    issues.push('generation-review-missing');
  }

  const sampleCount = Number.isFinite(report.learning?.sampleCount) ? report.learning.sampleCount : 0;
  const hasTunableSample = sampleCount >= 3;

  return {
    schema: MAZER_CYCLE_LEARNING_REPORT_SCHEMA,
    valid: issues.length === 0,
    issues,
    canConsumeForTuning: issues.length === 0 && hasTunableSample
  };
};

const resolveConsumerFocus = (report) => {
  const performance = isRecord(report.performancePressureReview) ? report.performancePressureReview : {};
  const aiReview = isRecord(report.aiReview) ? report.aiReview : {};
  const complexity = isRecord(report.complexityReview) ? report.complexityReview : {};
  const averageRenderSafetyPenaltyScore = Number.isFinite(performance.averageRenderSafetyPenaltyScore)
    ? performance.averageRenderSafetyPenaltyScore
    : 0;
  const averageRouteEfficiencyPressureScore = Number.isFinite(performance.averageRouteEfficiencyPressureScore)
    ? performance.averageRouteEfficiencyPressureScore
    : 0;
  const averageAiPressureScore = Number.isFinite(aiReview.averagePressureScore)
    ? aiReview.averagePressureScore
    : 0;
  const complexityReceiptCount = Number.isFinite(complexity.complexityReceiptCount)
    ? complexity.complexityReceiptCount
    : 0;

  if ((report.learning?.sampleCount ?? 0) < 3) {
    return 'collect-more-cycles';
  }
  if (averageRenderSafetyPenaltyScore >= 34) {
    return 'render-safety';
  }
  if (averageRouteEfficiencyPressureScore >= 45) {
    return 'route-efficiency';
  }
  if (averageAiPressureScore >= 60) {
    return 'ai-chaos';
  }
  if (complexityReceiptCount >= 3 && report.learning?.signal === 'challenge') {
    return 'increase-complexity';
  }
  if (report.learning?.signal === 'ease') {
    return 'reduce-complexity';
  }
  return 'hold-and-observe';
};

export const createMazeCycleTelemetryAtlasConsumerReceipt = (
  report,
  options = {}
) => {
  const validation = validateMazeCycleTelemetryAtlasReport(report);
  const focus = validation.canConsumeForTuning ? resolveConsumerFocus(report) : 'blocked-validation';

  return {
    schema: MAZER_CYCLE_LEARNING_CONSUMER_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceSchema: report?.schema ?? null,
    validation,
    decision: {
      focus,
      reportSignal: report?.learning?.signal ?? 'unknown',
      reportConfidence: Number.isFinite(report?.learning?.confidence) ? report.learning.confidence : 0,
      recommendedAction: validation.canConsumeForTuning ? report?.decision?.recommendedAction ?? 'hold-current-tuning' : 'fix-report-contract'
    },
    safeguards: {
      noAutoTuningWithoutValidator: true,
      rawPlayerPathRejected: validation.issues.includes('latest-receipt-contains-raw-path')
        || validation.issues.includes('recent-receipts-contain-raw-path'),
      diagonalGraphDeferred: true,
      enemiesObstaclesDeferred: true
    }
  };
};

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
    aiScorer: {
      id: MAZE_CYCLE_AI_SCORER_ID,
      version: MAZE_CYCLE_AI_SCORER_VERSION,
      historicalStoredScoresImmutable: true,
      reportScoresRecomputed: true
    },
    runQualityScorer: {
      id: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
      version: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
      shortestPathModel: MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
      topologyMetricsVersion: MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
      explorerThreshold: MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
      historicalStoredScoresImmutable: true,
      reportScoresRecomputed: true
    },
    aiReview: buildAiDecisionReview(receipts, learning),
    complexityReview: buildComplexityReview(receipts),
    performancePressureReview: buildPerformancePressureReview(receipts),
    progressionReview: buildProgressionReview(diagnostics),
    generationReview: buildGenerationReview(diagnostics),
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
    atlasConsumerRoot: null,
    input: null,
    output: null,
    atlasReceiptRoot: null,
    consumerOutput: null,
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
    } else if (arg === '--consumer-output') {
      args.consumerOutput = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--atlas-consumer-root') {
      args.atlasConsumerRoot = argv[index + 1] ?? null;
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
  node scripts/analysis/maze-cycle-telemetry-report.mjs --input <file|-> [--output <file>] [--consumer-output <file>] [--atlas-receipt-root <dir>] [--atlas-consumer-root <dir>] [--pretty]

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
  const consumerReceipt = createMazeCycleTelemetryAtlasConsumerReceipt(report);
  const text = JSON.stringify(report, null, args.pretty ? 2 : 0) + '\n';
  const writes = {};

  if (args.output) {
    writes.output = await writeJsonFile(args.output, report, args.pretty);
  }

  if (args.consumerOutput) {
    writes.consumerOutput = await writeJsonFile(args.consumerOutput, consumerReceipt, args.pretty);
  }

  if (args.atlasReceiptRoot) {
    const timestamp = report.generatedAt.replace(/[:.]/g, '-');
    const receiptRoot = resolve(args.atlasReceiptRoot);
    writes.atlasReceipt = await writeJsonFile(join(receiptRoot, `${timestamp}.json`), report, args.pretty);
    writes.atlasLatest = await writeJsonFile(join(receiptRoot, 'latest.json'), report, args.pretty);
  }

  if (args.atlasConsumerRoot) {
    const timestamp = consumerReceipt.generatedAt.replace(/[:.]/g, '-');
    const consumerRoot = resolve(args.atlasConsumerRoot);
    writes.atlasConsumerReceipt = await writeJsonFile(join(consumerRoot, `${timestamp}.json`), consumerReceipt, args.pretty);
    writes.atlasConsumerLatest = await writeJsonFile(join(consumerRoot, 'latest.json'), consumerReceipt, args.pretty);
  }

  if (!args.output && !args.consumerOutput && !args.atlasReceiptRoot && !args.atlasConsumerRoot) {
    process.stdout.write(text);
  }

  return { consumerReceipt, report, writes };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMazeCycleTelemetryReportCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
