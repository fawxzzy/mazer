import type { LegacyControlMode } from './legacyDefaults';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import {
  resolveLegacyMazeComplexity,
  type LegacyMazeComplexityBreakdown
} from './legacyProgression';

export const MAZE_CYCLE_TELEMETRY_STORAGE_KEY = 'mazer.cycle-telemetry.v1';
export const MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT = 50;
export const MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT = 256;
export const MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT = 5;
export const MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT = 8;

export type MazeCycleRouteQuality = NonNullable<LegacyMazeSnapshot['routeQualityStats']>['routeQuality'];
export type MazeCycleTelemetrySurface = 'menu-demo' | 'play';
export type MazeCycleTelemetryLearningSignal = 'challenge' | 'ease' | 'hold';
export type MazeCycleAiThinkingModel = 'human-local-memory' | 'legacy-source' | 'unknown';
export type MazeCycleAiDecisionSignal = 'clean' | 'searching' | 'chaotic';

export interface MazeCycleAiDecisionSummary {
  backtrackCount: number;
  decisionCount: number;
  optionalRetargetCount: number;
  recoveryCount: number;
  thinkingModel: MazeCycleAiThinkingModel;
  visitedUndoCount: number;
  wrongBranchCount: number;
}

export interface MazeCycleAiDecisionScore {
  pressureScore: number;
  reliabilityScore: number;
  recoveryPressureScore: number;
  routeNoiseScore: number;
  retargetPressureScore: number;
  signal: MazeCycleAiDecisionSignal;
}

export interface MazeCycleTelemetryReceipt {
  id: string;
  surface: MazeCycleTelemetrySurface;
  aiDecisionSummary: MazeCycleAiDecisionSummary | null;
  mazeComplexity: LegacyMazeComplexityBreakdown | null;
  mazeSeed: number;
  mazeSize: number;
  routeQuality: MazeCycleRouteQuality | null;
  start: LegacyPoint;
  goal: LegacyPoint;
  playerPath: LegacyPoint[];
  playerPathLength: number;
  playerPathTruncated: boolean;
  routeOverrunRatio: number;
  routeOverrunSteps: number;
  renderSafetyPenaltyScore: number;
  routeEfficiencyPressureScore: number;
  shortestViablePathLength: number;
  wrongTurns: number;
  backtracks: number;
  completionTimeMs: number;
  resetUsed: boolean;
  controlMode: LegacyControlMode;
  averageFrameMs: number;
  completedAt: string;
}

export interface MazeCycleTelemetryHistory {
  version: 1;
  limit: number;
  receipts: MazeCycleTelemetryReceipt[];
}

export interface MazeCycleTelemetryRecordInput {
  aiDecisionSummary?: MazeCycleAiDecisionSummary | null;
  averageFrameMs: number;
  completedAt?: string;
  completionTimeMs: number;
  controlMode: LegacyControlMode;
  maze: LegacyMazeSnapshot;
  playerPath: readonly LegacyPoint[];
  resetUsed: boolean;
  surface: MazeCycleTelemetrySurface;
  backtracks?: number;
  wrongTurns?: number;
}

export type MazeCycleTelemetryDiagnosticReceipt = Omit<MazeCycleTelemetryReceipt, 'playerPath'> & {
  aiDecisionScore: MazeCycleAiDecisionScore | null;
  playerPathPreview: LegacyPoint[];
};

export interface MazeCycleTelemetryLearningSummary {
  averageBacktracks: number | null;
  averageCompletionTimeMs: number | null;
  averageFrameMs: number | null;
  averageAiDecisionPressureScore: number | null;
  averageRenderSafetyPenaltyScore: number | null;
  averageRouteOverrunRatio: number | null;
  averageRouteOverrunSteps: number | null;
  averageRouteEfficiencyPressureScore: number | null;
  aiDecisionSignalCounts: Record<MazeCycleAiDecisionSignal, number>;
  averageWrongTurns: number | null;
  confidence: number;
  menuDemoSampleCount: number;
  playSampleCount: number;
  preferredControlMode: LegacyControlMode | null;
  resetRate: number | null;
  routeQualityCounts: Record<'multi-route' | 'single-route' | 'unknown', number>;
  sampleCount: number;
  signal: MazeCycleTelemetryLearningSignal;
}

export interface MazeCycleTelemetryDiagnostics {
  diagnosticReceiptLimit: number;
  enabled: boolean;
  historyLimit: number;
  latestReceipt: MazeCycleTelemetryDiagnosticReceipt | null;
  learning: MazeCycleTelemetryLearningSummary;
  pathLimit: number;
  recentReceipts: MazeCycleTelemetryDiagnosticReceipt[];
  storageKey: string;
  storedCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

const isLegacyPointLike = (value: unknown): value is LegacyPoint => (
  isRecord(value)
  && typeof value.x === 'number'
  && Number.isFinite(value.x)
  && typeof value.y === 'number'
  && Number.isFinite(value.y)
);

const normalizePoint = (value: unknown, fallback: LegacyPoint): LegacyPoint => (
  isLegacyPointLike(value)
    ? { x: Math.round(value.x), y: Math.round(value.y) }
    : copyPoint(fallback)
);

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
);

const normalizeNonNegativeNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 1000) / 1000) : fallback
);

const roundNumber = (value: number, precision = 3): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const averageOrNull = (values: readonly number[]): number | null => (
  values.length > 0
    ? roundNumber(values.reduce((total, value) => total + value, 0) / values.length)
    : null
);

const clampScore = (value: number): number => Math.max(0, Math.min(100, roundNumber(value, 3)));

const isControlMode = (value: unknown): value is LegacyControlMode => (
  value === 'arrows' || value === 'stick'
);

const isSurface = (value: unknown): value is MazeCycleTelemetrySurface => (
  value === 'menu-demo' || value === 'play'
);

const isAiThinkingModel = (value: unknown): value is MazeCycleAiThinkingModel => (
  value === 'human-local-memory' || value === 'legacy-source' || value === 'unknown'
);

const normalizeAiDecisionSummary = (value: unknown): MazeCycleAiDecisionSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    backtrackCount: normalizeNonNegativeInteger(value.backtrackCount),
    decisionCount: normalizeNonNegativeInteger(value.decisionCount),
    optionalRetargetCount: normalizeNonNegativeInteger(value.optionalRetargetCount),
    recoveryCount: normalizeNonNegativeInteger(value.recoveryCount),
    thinkingModel: isAiThinkingModel(value.thinkingModel) ? value.thinkingModel : 'unknown',
    visitedUndoCount: normalizeNonNegativeInteger(value.visitedUndoCount),
    wrongBranchCount: normalizeNonNegativeInteger(value.wrongBranchCount)
  };
};

const normalizeMazeComplexityBreakdown = (value: unknown): LegacyMazeComplexityBreakdown | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    checkpointScore: normalizeNonNegativeNumber(value.checkpointScore),
    deadEndCount: normalizeNonNegativeInteger(value.deadEndCount),
    deadEndPressureScore: normalizeNonNegativeNumber(value.deadEndPressureScore),
    edgeWrapCount: normalizeNonNegativeInteger(value.edgeWrapCount),
    edgeWrapReliefScore: normalizeNonNegativeNumber(value.edgeWrapReliefScore),
    edgeWrapScore: normalizeNonNegativeNumber(value.edgeWrapScore),
    fillQualityScore: normalizeNonNegativeNumber(value.fillQualityScore),
    floorScore: normalizeNonNegativeNumber(value.floorScore),
    routeScore: normalizeNonNegativeNumber(value.routeScore),
    shortcutScore: normalizeNonNegativeNumber(value.shortcutScore),
    sizeScore: normalizeNonNegativeNumber(value.sizeScore),
    solutionScore: normalizeNonNegativeNumber(value.solutionScore),
    splitCount: normalizeNonNegativeInteger(value.splitCount),
    splitScore: normalizeNonNegativeNumber(value.splitScore),
    total: normalizeNonNegativeInteger(value.total),
    weightedDeadEndPressureScore: normalizeNonNegativeNumber(value.weightedDeadEndPressureScore),
    weightedSplitPressureScore: normalizeNonNegativeNumber(value.weightedSplitPressureScore)
  };
};

export const scoreMazeCycleAiDecisionSummary = (
  summary: MazeCycleAiDecisionSummary | null
): MazeCycleAiDecisionScore | null => {
  const normalized = normalizeAiDecisionSummary(summary);
  if (normalized === null) {
    return null;
  }

  const decisionCount = Math.max(1, normalized.decisionCount);
  const routeNoiseScore = clampScore(((
    normalized.wrongBranchCount * 3
    + normalized.optionalRetargetCount * 1.5
    + normalized.visitedUndoCount * 4
  ) / decisionCount) * 100);
  const recoveryPressureScore = clampScore(((
    normalized.backtrackCount * 1.2
    + normalized.recoveryCount * 3
  ) / decisionCount) * 100);
  const retargetPressureScore = clampScore((normalized.optionalRetargetCount / decisionCount) * 100);
  const pressureScore = clampScore((
    routeNoiseScore * 0.45
    + recoveryPressureScore * 0.45
    + retargetPressureScore * 0.1
  ));

  return {
    pressureScore,
    reliabilityScore: clampScore(100 - pressureScore),
    recoveryPressureScore,
    routeNoiseScore,
    retargetPressureScore,
    signal: pressureScore >= 60 ? 'chaotic' : pressureScore >= 25 ? 'searching' : 'clean'
  };
};

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const normalizePlayerPath = (
  points: readonly LegacyPoint[],
  limit = MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT
): {
  playerPath: LegacyPoint[];
  playerPathLength: number;
  playerPathTruncated: boolean;
} => {
  const safePoints = points.filter(isLegacyPointLike).map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y)
  }));
  if (safePoints.length <= limit) {
    return {
      playerPath: safePoints,
      playerPathLength: safePoints.length,
      playerPathTruncated: false
    };
  }

  const firstPoint = safePoints[0];
  const tail = safePoints.slice(Math.max(1, safePoints.length - (limit - 1)));
  return {
    playerPath: firstPoint ? [firstPoint, ...tail] : tail,
    playerPathLength: safePoints.length,
    playerPathTruncated: true
  };
};

export const scoreMazeCycleRouteEfficiencyPressure = (
  playerPathLength: number,
  solutionPathLength: number
): number => {
  const safeSolutionLength = Math.max(1, Math.round(solutionPathLength));
  const safePathLength = Math.max(0, Math.round(playerPathLength));
  if (safePathLength <= safeSolutionLength) {
    return 0;
  }

  const routeWasteRatio = (safePathLength - safeSolutionLength) / safeSolutionLength;
  return clampScore((routeWasteRatio / 1.5) * 100);
};

export const summarizeMazeCycleShortestPathComparison = (
  playerPathLength: number,
  solutionPathLength: number
): {
  routeOverrunRatio: number;
  routeOverrunSteps: number;
  shortestViablePathLength: number;
} => {
  const shortestViablePathLength = Math.max(1, Math.round(solutionPathLength));
  const safePathLength = Math.max(0, Math.round(playerPathLength));
  const routeOverrunSteps = Math.max(0, safePathLength - shortestViablePathLength);

  return {
    routeOverrunRatio: roundNumber(routeOverrunSteps / shortestViablePathLength),
    routeOverrunSteps,
    shortestViablePathLength
  };
};

export const scoreMazeCycleRenderSafetyPenalty = (averageFrameMs: number): number => {
  if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 18) {
    return 0;
  }

  return clampScore(((averageFrameMs - 18) / 18) * 100);
};

export const summarizeMazeCyclePathDeviation = (
  playerPath: readonly LegacyPoint[],
  solutionPath: readonly LegacyPoint[]
): { backtracks: number; wrongTurns: number } => {
  const solutionIndexByPoint = new Map<string, number>();
  solutionPath.forEach((point, index) => {
    solutionIndexByPoint.set(pointKey(point), index);
  });

  let backtracks = 0;
  let wrongTurns = 0;
  let farthestSolutionIndex = solutionIndexByPoint.get(pointKey(playerPath[0] ?? solutionPath[0] ?? { x: 0, y: 0 })) ?? 0;

  for (let index = 1; index < playerPath.length; index += 1) {
    const previousIndex = solutionIndexByPoint.get(pointKey(playerPath[index - 1]!));
    const nextIndex = solutionIndexByPoint.get(pointKey(playerPath[index]!));
    if (nextIndex === undefined) {
      wrongTurns += 1;
      continue;
    }
    if (
      (previousIndex !== undefined && nextIndex < previousIndex)
      || nextIndex < farthestSolutionIndex
    ) {
      backtracks += 1;
    }
    if (nextIndex > farthestSolutionIndex + 1) {
      wrongTurns += 1;
    }
    farthestSolutionIndex = Math.max(farthestSolutionIndex, nextIndex);
  }

  return { backtracks, wrongTurns };
};

export const createEmptyMazeCycleTelemetryHistory = (): MazeCycleTelemetryHistory => ({
  version: 1,
  limit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
  receipts: []
});

const normalizeReceipt = (value: unknown): MazeCycleTelemetryReceipt | null => {
  if (!isRecord(value)) {
    return null;
  }

  const surface = isSurface(value.surface) ? value.surface : null;
  const controlMode = isControlMode(value.controlMode) ? value.controlMode : null;
  if (!surface || !controlMode || typeof value.id !== 'string' || typeof value.completedAt !== 'string') {
    return null;
  }

  const fallbackStart = { x: 0, y: 0 };
  const fallbackGoal = { x: 0, y: 0 };
  const rawPlayerPath = Array.isArray(value.playerPath) ? value.playerPath : [];
  const normalizedPath = normalizePlayerPath(rawPlayerPath, MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT);

  return {
    id: value.id,
    surface,
    aiDecisionSummary: normalizeAiDecisionSummary(value.aiDecisionSummary),
    mazeComplexity: normalizeMazeComplexityBreakdown(value.mazeComplexity),
    mazeSeed: normalizeNonNegativeInteger(value.mazeSeed),
    mazeSize: normalizeNonNegativeInteger(value.mazeSize),
    routeQuality: value.routeQuality === 'multi-route' || value.routeQuality === 'single-route'
      ? value.routeQuality
      : null,
    start: normalizePoint(value.start, fallbackStart),
    goal: normalizePoint(value.goal, fallbackGoal),
    playerPath: normalizedPath.playerPath,
    playerPathLength: normalizeNonNegativeInteger(value.playerPathLength, normalizedPath.playerPathLength),
    playerPathTruncated: value.playerPathTruncated === true || normalizedPath.playerPathTruncated,
    routeOverrunRatio: normalizeNonNegativeNumber(value.routeOverrunRatio),
    routeOverrunSteps: normalizeNonNegativeInteger(value.routeOverrunSteps),
    renderSafetyPenaltyScore: normalizeNonNegativeNumber(value.renderSafetyPenaltyScore),
    routeEfficiencyPressureScore: normalizeNonNegativeNumber(value.routeEfficiencyPressureScore),
    shortestViablePathLength: normalizeNonNegativeInteger(value.shortestViablePathLength, 1),
    wrongTurns: normalizeNonNegativeInteger(value.wrongTurns),
    backtracks: normalizeNonNegativeInteger(value.backtracks),
    completionTimeMs: normalizeNonNegativeInteger(value.completionTimeMs),
    resetUsed: value.resetUsed === true,
    controlMode,
    averageFrameMs: normalizeNonNegativeNumber(value.averageFrameMs),
    completedAt: value.completedAt
  };
};

const normalizeHistory = (value: unknown): MazeCycleTelemetryHistory => {
  const rawReceipts = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.receipts)
      ? value.receipts
      : [];
  const receipts = rawReceipts
    .map(normalizeReceipt)
    .filter((receipt): receipt is MazeCycleTelemetryReceipt => receipt !== null)
    .slice(0, MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT);

  return {
    version: 1,
    limit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
    receipts
  };
};

export const readMazeCycleTelemetryHistory = (
  storage: Pick<Storage, 'getItem'> | undefined
): MazeCycleTelemetryHistory => {
  if (!storage) {
    return createEmptyMazeCycleTelemetryHistory();
  }

  try {
    const raw = storage.getItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY);
    return raw ? normalizeHistory(JSON.parse(raw)) : createEmptyMazeCycleTelemetryHistory();
  } catch {
    return createEmptyMazeCycleTelemetryHistory();
  }
};

export const writeMazeCycleTelemetryHistory = (
  storage: Pick<Storage, 'setItem'> | undefined,
  history: MazeCycleTelemetryHistory
): MazeCycleTelemetryHistory => {
  const normalized = normalizeHistory(history);
  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Local learning is best-effort; gameplay must continue if storage is blocked.
  }

  return normalized;
};

export const createMazeCycleTelemetryReceipt = (
  input: MazeCycleTelemetryRecordInput
): MazeCycleTelemetryReceipt => {
  const normalizedPath = normalizePlayerPath(input.playerPath, MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT);
  const derivedDeviation = summarizeMazeCyclePathDeviation(normalizedPath.playerPath, input.maze.solutionPath);
  const shortestPathComparison = summarizeMazeCycleShortestPathComparison(
    normalizedPath.playerPathLength,
    input.maze.solutionPath.length
  );
  const completedAt = input.completedAt ?? new Date().toISOString();
  const averageFrameMs = normalizeNonNegativeNumber(input.averageFrameMs);

  return {
    id: `${input.surface}-${input.maze.seed}-${Date.parse(completedAt) || Date.now()}`,
    surface: input.surface,
    aiDecisionSummary: normalizeAiDecisionSummary(input.aiDecisionSummary),
    mazeComplexity: resolveLegacyMazeComplexity(input.maze),
    mazeSeed: input.maze.seed,
    mazeSize: input.maze.size,
    routeQuality: input.maze.routeQualityStats?.routeQuality ?? null,
    start: copyPoint(input.maze.start),
    goal: copyPoint(input.maze.goal),
    playerPath: normalizedPath.playerPath,
    playerPathLength: normalizedPath.playerPathLength,
    playerPathTruncated: normalizedPath.playerPathTruncated,
    routeOverrunRatio: shortestPathComparison.routeOverrunRatio,
    routeOverrunSteps: shortestPathComparison.routeOverrunSteps,
    renderSafetyPenaltyScore: scoreMazeCycleRenderSafetyPenalty(averageFrameMs),
    routeEfficiencyPressureScore: scoreMazeCycleRouteEfficiencyPressure(
      normalizedPath.playerPathLength,
      input.maze.solutionPath.length
    ),
    shortestViablePathLength: shortestPathComparison.shortestViablePathLength,
    wrongTurns: normalizeNonNegativeInteger(input.wrongTurns, derivedDeviation.wrongTurns),
    backtracks: normalizeNonNegativeInteger(input.backtracks, derivedDeviation.backtracks),
    completionTimeMs: normalizeNonNegativeInteger(input.completionTimeMs),
    resetUsed: input.resetUsed,
    controlMode: input.controlMode,
    averageFrameMs,
    completedAt
  };
};

export const recordMazeCycleTelemetryReceipt = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  input: MazeCycleTelemetryRecordInput
): MazeCycleTelemetryHistory => {
  const history = readMazeCycleTelemetryHistory(storage);
  const receipt = createMazeCycleTelemetryReceipt(input);
  return writeMazeCycleTelemetryHistory(storage, {
    ...history,
    receipts: [receipt, ...history.receipts].slice(0, MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT)
  });
};

const toDiagnosticReceipt = (
  receipt: MazeCycleTelemetryReceipt
): MazeCycleTelemetryDiagnosticReceipt => {
  const previewStart = Math.max(0, receipt.playerPath.length - MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT);
  return {
    id: receipt.id,
    surface: receipt.surface,
    aiDecisionSummary: receipt.aiDecisionSummary
      ? { ...receipt.aiDecisionSummary }
      : null,
    aiDecisionScore: scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary),
    mazeComplexity: receipt.mazeComplexity
      ? { ...receipt.mazeComplexity }
      : null,
    mazeSeed: receipt.mazeSeed,
    mazeSize: receipt.mazeSize,
    routeQuality: receipt.routeQuality,
    start: copyPoint(receipt.start),
    goal: copyPoint(receipt.goal),
    playerPathLength: receipt.playerPathLength,
    playerPathTruncated: receipt.playerPathTruncated,
    routeOverrunRatio: receipt.routeOverrunRatio,
    routeOverrunSteps: receipt.routeOverrunSteps,
    renderSafetyPenaltyScore: receipt.renderSafetyPenaltyScore,
    routeEfficiencyPressureScore: receipt.routeEfficiencyPressureScore,
    shortestViablePathLength: receipt.shortestViablePathLength,
    wrongTurns: receipt.wrongTurns,
    backtracks: receipt.backtracks,
    completionTimeMs: receipt.completionTimeMs,
    resetUsed: receipt.resetUsed,
    controlMode: receipt.controlMode,
    averageFrameMs: receipt.averageFrameMs,
    completedAt: receipt.completedAt,
    playerPathPreview: receipt.playerPath.slice(previewStart).map(copyPoint)
  };
};

const resolvePreferredControlMode = (
  receipts: readonly MazeCycleTelemetryReceipt[]
): LegacyControlMode | null => {
  if (receipts.length === 0) {
    return null;
  }

  const stickCount = receipts.filter((receipt) => receipt.controlMode === 'stick').length;
  const arrowCount = receipts.length - stickCount;
  return stickCount >= arrowCount ? 'stick' : 'arrows';
};

const resolveLearningSignal = (
  receipts: readonly MazeCycleTelemetryReceipt[]
): MazeCycleTelemetryLearningSignal => {
  if (receipts.length < 3) {
    return 'hold';
  }

  const averageWrongTurns = averageOrNull(receipts.map((receipt) => receipt.wrongTurns)) ?? 0;
  const averageBacktracks = averageOrNull(receipts.map((receipt) => receipt.backtracks)) ?? 0;
  const averageCompletionTimeMs = averageOrNull(receipts.map((receipt) => receipt.completionTimeMs)) ?? 0;
  const averageRenderSafetyPenaltyScore = averageOrNull(receipts.map((receipt) => receipt.renderSafetyPenaltyScore)) ?? 0;
  const averageRouteEfficiencyPressureScore = averageOrNull(receipts.map((receipt) => receipt.routeEfficiencyPressureScore)) ?? 0;
  const resetRate = receipts.filter((receipt) => receipt.resetUsed).length / receipts.length;

  if (
    resetRate >= 0.4
    || averageWrongTurns >= 6
    || averageBacktracks >= 6
    || averageRouteEfficiencyPressureScore >= 45
    || averageRenderSafetyPenaltyScore >= 34
  ) {
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

export const summarizeMazeCycleTelemetryLearning = (
  history: MazeCycleTelemetryHistory
): MazeCycleTelemetryLearningSummary => {
  const receipts = history.receipts;
  const playReceipts = receipts.filter((receipt) => receipt.surface === 'play');
  const menuDemoReceipts = receipts.filter((receipt) => receipt.surface === 'menu-demo');
  const aiDecisionScores = receipts
    .map((receipt) => scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary))
    .filter((score): score is MazeCycleAiDecisionScore => score !== null);
  const aiDecisionSignalCounts: MazeCycleTelemetryLearningSummary['aiDecisionSignalCounts'] = {
    clean: 0,
    searching: 0,
    chaotic: 0
  };
  const signalReceipts = playReceipts.length >= 3 ? playReceipts : receipts;
  const routeQualityCounts: MazeCycleTelemetryLearningSummary['routeQualityCounts'] = {
    'multi-route': 0,
    'single-route': 0,
    unknown: 0
  };

  receipts.forEach((receipt) => {
    if (receipt.routeQuality === 'multi-route' || receipt.routeQuality === 'single-route') {
      routeQualityCounts[receipt.routeQuality] += 1;
    } else {
      routeQualityCounts.unknown += 1;
    }
  });
  aiDecisionScores.forEach((score) => {
    aiDecisionSignalCounts[score.signal] += 1;
  });

  return {
    aiDecisionSignalCounts,
    averageAiDecisionPressureScore: averageOrNull(aiDecisionScores.map((score) => score.pressureScore)),
    averageBacktracks: averageOrNull(receipts.map((receipt) => receipt.backtracks)),
    averageCompletionTimeMs: averageOrNull(receipts.map((receipt) => receipt.completionTimeMs)),
    averageFrameMs: averageOrNull(receipts.map((receipt) => receipt.averageFrameMs)),
    averageRenderSafetyPenaltyScore: averageOrNull(receipts.map((receipt) => receipt.renderSafetyPenaltyScore)),
    averageRouteOverrunRatio: averageOrNull(receipts.map((receipt) => receipt.routeOverrunRatio)),
    averageRouteOverrunSteps: averageOrNull(receipts.map((receipt) => receipt.routeOverrunSteps)),
    averageRouteEfficiencyPressureScore: averageOrNull(receipts.map((receipt) => receipt.routeEfficiencyPressureScore)),
    averageWrongTurns: averageOrNull(receipts.map((receipt) => receipt.wrongTurns)),
    confidence: roundNumber(Math.min(1, signalReceipts.length / 10)),
    menuDemoSampleCount: menuDemoReceipts.length,
    playSampleCount: playReceipts.length,
    preferredControlMode: resolvePreferredControlMode(receipts),
    resetRate: receipts.length > 0
      ? roundNumber(receipts.filter((receipt) => receipt.resetUsed).length / receipts.length)
      : null,
    routeQualityCounts,
    sampleCount: receipts.length,
    signal: resolveLearningSignal(signalReceipts)
  };
};

export const summarizeMazeCycleTelemetryDiagnostics = (
  history: MazeCycleTelemetryHistory
): MazeCycleTelemetryDiagnostics => ({
  diagnosticReceiptLimit: MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT,
  enabled: true,
  historyLimit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
  latestReceipt: history.receipts[0] ? toDiagnosticReceipt(history.receipts[0]) : null,
  learning: summarizeMazeCycleTelemetryLearning(history),
  pathLimit: MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
  recentReceipts: history.receipts
    .slice(0, MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT)
    .map(toDiagnosticReceipt),
  storageKey: MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  storedCount: history.receipts.length
});
