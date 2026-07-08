import type { LegacyControlMode } from './legacyDefaults';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

export const MAZE_CYCLE_TELEMETRY_STORAGE_KEY = 'mazer.cycle-telemetry.v1';
export const MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT = 50;
export const MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT = 256;
export const MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT = 5;
export const MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT = 8;

export type MazeCycleTelemetrySurface = 'menu-demo' | 'play';

export interface MazeCycleTelemetryReceipt {
  id: string;
  surface: MazeCycleTelemetrySurface;
  mazeSeed: number;
  mazeSize: number;
  routeQuality: NonNullable<LegacyMazeSnapshot['routeQualityStats']>['routeQuality'] | null;
  start: LegacyPoint;
  goal: LegacyPoint;
  playerPath: LegacyPoint[];
  playerPathLength: number;
  playerPathTruncated: boolean;
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
  playerPathPreview: LegacyPoint[];
};

export interface MazeCycleTelemetryDiagnostics {
  diagnosticReceiptLimit: number;
  enabled: boolean;
  historyLimit: number;
  latestReceipt: MazeCycleTelemetryDiagnosticReceipt | null;
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

const isControlMode = (value: unknown): value is LegacyControlMode => (
  value === 'arrows' || value === 'stick'
);

const isSurface = (value: unknown): value is MazeCycleTelemetrySurface => (
  value === 'menu-demo' || value === 'play'
);

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
  const completedAt = input.completedAt ?? new Date().toISOString();

  return {
    id: `${input.surface}-${input.maze.seed}-${Date.parse(completedAt) || Date.now()}`,
    surface: input.surface,
    mazeSeed: input.maze.seed,
    mazeSize: input.maze.size,
    routeQuality: input.maze.routeQualityStats?.routeQuality ?? null,
    start: copyPoint(input.maze.start),
    goal: copyPoint(input.maze.goal),
    playerPath: normalizedPath.playerPath,
    playerPathLength: normalizedPath.playerPathLength,
    playerPathTruncated: normalizedPath.playerPathTruncated,
    wrongTurns: normalizeNonNegativeInteger(input.wrongTurns, derivedDeviation.wrongTurns),
    backtracks: normalizeNonNegativeInteger(input.backtracks, derivedDeviation.backtracks),
    completionTimeMs: normalizeNonNegativeInteger(input.completionTimeMs),
    resetUsed: input.resetUsed,
    controlMode: input.controlMode,
    averageFrameMs: normalizeNonNegativeNumber(input.averageFrameMs),
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
    mazeSeed: receipt.mazeSeed,
    mazeSize: receipt.mazeSize,
    routeQuality: receipt.routeQuality,
    start: copyPoint(receipt.start),
    goal: copyPoint(receipt.goal),
    playerPathLength: receipt.playerPathLength,
    playerPathTruncated: receipt.playerPathTruncated,
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

export const summarizeMazeCycleTelemetryDiagnostics = (
  history: MazeCycleTelemetryHistory
): MazeCycleTelemetryDiagnostics => ({
  diagnosticReceiptLimit: MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT,
  enabled: true,
  historyLimit: MAZE_CYCLE_TELEMETRY_HISTORY_LIMIT,
  latestReceipt: history.receipts[0] ? toDiagnosticReceipt(history.receipts[0]) : null,
  pathLimit: MAZE_CYCLE_TELEMETRY_PLAYER_PATH_LIMIT,
  recentReceipts: history.receipts
    .slice(0, MAZE_CYCLE_TELEMETRY_DIAGNOSTIC_RECEIPT_LIMIT)
    .map(toDiagnosticReceipt),
  storageKey: MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  storedCount: history.receipts.length
});
