import { clampInteger } from './legacyDefaults';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import { resolveLegacyMenuLayout } from './legacyMenuLayout';
import type { MazeCycleTelemetryReceipt, MazeCycleTelemetrySurface } from './mazeCycleTelemetry';

export const LEGACY_PROGRESSION_STORAGE_KEY = 'mazer.progression.v1';
export const LEGACY_PROGRESSION_MIN_COMPLEXITY = 8;
export const LEGACY_PROGRESSION_MAX_COMPLEXITY = 180;
export const LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY = 24;
export const LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY = LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY;
export const LEGACY_PROGRESSION_AI_BASE_TARGET_COMPLEXITY = LEGACY_PROGRESSION_MIN_COMPLEXITY;
export const LEGACY_PROGRESSION_AI_BASELINE_VERSION = 3;
export const LEGACY_PROGRESSION_CHALLENGE_STEP = 1;
export const LEGACY_PROGRESSION_CHALLENGE_PRESSURE_BONUS = 1;
export const LEGACY_PROGRESSION_CHALLENGE_STREAK_BONUS_EVERY = 3;
export const LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT = 6;
export const LEGACY_PROGRESSION_CONSISTENT_SIGNAL_THRESHOLD = 2;
export const LEGACY_PROGRESSION_MAX_CHALLENGE_STEP = 3;
export const LEGACY_PROGRESSION_EASE_STEP = -1;
export const LEGACY_PROGRESSION_EASE_PRESSURE_STEP = -2;
export const LEGACY_PROGRESSION_MENU_MIN_TILE_PX = 5.35;
export const LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX = 8;
export const LEGACY_PROGRESSION_PLAY_MIN_TILE_PX = 5.25;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_RATIO = 0.018;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_MIN = 4;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_MAX = 7;
export const LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH = 430;

export type LegacyProgressionTrackId = 'player' | 'ai-runner';
export type LegacyProgressionRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type LegacyProgressionSignal = 'challenge' | 'ease' | 'hold';

export interface LegacyProgressionTrack {
  bestCompletionTimeMs: number | null;
  cleanCycles: number;
  colorTier: number;
  completedCycles: number;
  lastCompletedAt: string | null;
  lastCompletionTimeMs: number | null;
  lastMazeSeed: number | null;
  lastSignal: LegacyProgressionSignal;
  level: number;
  paceScore: number;
  peakComplexity: number;
  rank: LegacyProgressionRank;
  recentSignals: LegacyProgressionSignal[];
  struggleCycles: number;
  targetComplexity: number;
}

export interface LegacyProgressionState {
  aiRunnerBaselineVersion: number;
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
  updatedAt: string | null;
  version: 1;
}

export interface LegacyMazeComplexityBreakdown {
  checkpointScore: number;
  deadEndCount: number;
  deadEndPressureScore: number;
  edgeWrapReliefScore: number;
  edgeWrapCount: number;
  edgeWrapScore: number;
  fillQualityScore: number;
  floorScore: number;
  routeScore: number;
  shortcutScore: number;
  sizeScore: number;
  solutionScore: number;
  splitCount: number;
  splitScore: number;
  total: number;
  weightedDeadEndPressureScore: number;
  weightedSplitPressureScore: number;
}

export interface LegacyProgressionPalette {
  badgeColor: string;
  label: string;
  playerCoreColor: number;
  playerHaloColor: number;
  rankColor: number;
  tier: number;
  trailColor: number;
  trailPulseColor: number;
  trailPulseEdgeColor: number;
}

export interface LegacyProgressionDiagnostics {
  activeTrackId: LegacyProgressionTrackId;
  complexity: LegacyMazeComplexityBreakdown;
  palette: LegacyProgressionPalette;
  pacing: LegacyProgressionPacingSummary;
  storageKey: string;
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
}

export interface LegacyProgressionPacingSummary {
  activeLevel: number;
  activeRank: LegacyProgressionRank;
  activeTargetComplexity: number;
  challengeStep: number;
  easeStep: number;
  lastCompletionTimeMs: number | null;
  measuredMazeComplexity: number;
  measuredMazeLevel: number;
  measuredMazeRank: LegacyProgressionRank;
  nextChallengeTargetComplexity: number;
  nextEaseTargetComplexity: number;
  paceScore: number;
  recentChallengeCount: number;
  recentEaseCount: number;
  signalWindow: LegacyProgressionSignal[];
}

export interface LegacyProgressionPerformanceScore {
  backtrackScore: number;
  routeEfficiencyScore: number;
  resetScore: number;
  signal: LegacyProgressionSignal;
  stabilityScore: number;
  timeScore: number;
  total: number;
  wrongTurnScore: number;
}

export interface LegacyProgressionViewport {
  height: number;
  width: number;
}

export interface LegacyProgressionGenerationScaleOptions {
  boardScale?: number;
  surface?: MazeCycleTelemetrySurface;
  viewport?: LegacyProgressionViewport | null;
}

const LEGACY_PROGRESS_COLOR_TIERS: Array<Omit<LegacyProgressionPalette, 'label' | 'tier'>> = [
  {
    badgeColor: '#36ff7d',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0x36ff7d,
    trailColor: 0x36ff7d,
    trailPulseColor: 0x8dffb7,
    trailPulseEdgeColor: 0x009f52
  },
  {
    badgeColor: '#59fff0',
    playerCoreColor: 0x59fff0,
    playerHaloColor: 0x18bfc8,
    rankColor: 0x59fff0,
    trailColor: 0xff61c7,
    trailPulseColor: 0xff8dde,
    trailPulseEdgeColor: 0xc21b8c
  },
  {
    badgeColor: '#7da8ff',
    playerCoreColor: 0x7da8ff,
    playerHaloColor: 0x315cc9,
    rankColor: 0x7da8ff,
    trailColor: 0xffd36a,
    trailPulseColor: 0xfff05a,
    trailPulseEdgeColor: 0xd97706
  },
  {
    badgeColor: '#fff05a',
    playerCoreColor: 0xfff05a,
    playerHaloColor: 0xff9f1c,
    rankColor: 0xfff05a,
    trailColor: 0x7da8ff,
    trailPulseColor: 0x9dbbff,
    trailPulseEdgeColor: 0x315cc9
  },
  {
    badgeColor: '#ff61c7',
    playerCoreColor: 0xff61c7,
    playerHaloColor: 0xb72ba4,
    rankColor: 0xff61c7,
    trailColor: 0x36ff7d,
    trailPulseColor: 0x7dffae,
    trailPulseEdgeColor: 0x009f52
  },
  {
    badgeColor: '#ffd36a',
    playerCoreColor: 0xffd36a,
    playerHaloColor: 0xff61c7,
    rankColor: 0xffd36a,
    trailColor: 0x16c7ff,
    trailPulseColor: 0x25f0ff,
    trailPulseEdgeColor: 0x0077ff
  }
];

const LEGACY_PROGRESS_PATH_CORE_CONTRAST_COLOR = 0xe7fff4;
const LEGACY_PROGRESS_MIN_PATH_COLOR_DISTANCE = 145;
const LEGACY_PROGRESS_FALLBACK_PLAYER_COLOR = 0x36ff7d;
const LEGACY_PROGRESS_FALLBACK_TRAIL_COLOR = 0x36ff7d;
const LEGACY_PROGRESS_FALLBACK_TRAIL_PULSE_COLOR = 0xff61c7;

const copyTrack = (track: LegacyProgressionTrack): LegacyProgressionTrack => ({
  ...track,
  recentSignals: [...track.recentSignals]
});

const roundNumber = (value: number, precision = 3): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const colorChannelDistance = (left: number, right: number): number => {
  const leftR = (left >> 16) & 0xff;
  const leftG = (left >> 8) & 0xff;
  const leftB = left & 0xff;
  const rightR = (right >> 16) & 0xff;
  const rightG = (right >> 8) & 0xff;
  const rightB = right & 0xff;
  return Math.sqrt(
    ((leftR - rightR) ** 2)
    + ((leftG - rightG) ** 2)
    + ((leftB - rightB) ** 2)
  );
};

const resolvePathContrastColor = (color: number, fallback: number): number => (
  colorChannelDistance(color, LEGACY_PROGRESS_PATH_CORE_CONTRAST_COLOR) < LEGACY_PROGRESS_MIN_PATH_COLOR_DISTANCE
    ? fallback
    : color
);

const resolvePathContrastPalette = (
  palette: Omit<LegacyProgressionPalette, 'label' | 'tier'>
): Omit<LegacyProgressionPalette, 'label' | 'tier'> => ({
  ...palette,
  playerCoreColor: resolvePathContrastColor(palette.playerCoreColor, LEGACY_PROGRESS_FALLBACK_PLAYER_COLOR),
  trailColor: resolvePathContrastColor(palette.trailColor, LEGACY_PROGRESS_FALLBACK_TRAIL_COLOR),
  trailPulseColor: resolvePathContrastColor(palette.trailPulseColor, LEGACY_PROGRESS_FALLBACK_TRAIL_PULSE_COLOR)
});

const countWalkableTiles = (maze: LegacyMazeSnapshot): number => (
  maze.grid.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0
  )
);

const isLegacyProgressionWalkable = (maze: LegacyMazeSnapshot, x: number, y: number): boolean => (
  maze.grid[y]?.[x] === true
);

const countLegacyProgressionWrappedContinuities = (maze: LegacyMazeSnapshot): number => {
  const wrappedPairs = new Set<string>();
  const maxIndex = maze.size - 1;

  for (let index = 0; index < maze.size; index += 1) {
    if (isLegacyProgressionWalkable(maze, 0, index) && isLegacyProgressionWalkable(maze, maxIndex, index)) {
      wrappedPairs.add(`h:${index}`);
    }

    if (isLegacyProgressionWalkable(maze, index, 0) && isLegacyProgressionWalkable(maze, index, maxIndex)) {
      wrappedPairs.add(`v:${index}`);
    }
  }

  return wrappedPairs.size;
};

const collectLegacyProgressionWalkableNeighbors = (
  maze: LegacyMazeSnapshot,
  x: number,
  y: number
): LegacyPoint[] => {
  const maxIndex = maze.size - 1;
  return [
    { x: x - 1 < 0 ? maxIndex : x - 1, y },
    { x: x + 1 > maxIndex ? 0 : x + 1, y },
    { x, y: y - 1 < 0 ? maxIndex : y - 1 },
    { x, y: y + 1 > maxIndex ? 0 : y + 1 }
  ].filter((point) => isLegacyProgressionWalkable(maze, point.x, point.y));
};

const distanceToLegacyGoal = (maze: LegacyMazeSnapshot, point: LegacyPoint): number => {
  const dx = Math.min(
    Math.abs(point.x - maze.goal.x),
    maze.size - Math.abs(point.x - maze.goal.x)
  );
  const dy = Math.min(
    Math.abs(point.y - maze.goal.y),
    maze.size - Math.abs(point.y - maze.goal.y)
  );
  return Math.sqrt((dx ** 2) + (dy ** 2));
};

const resolveLegacyProgressionTopologyMetrics = (maze: LegacyMazeSnapshot): {
  deadEndCount: number;
  isolatedGapCount: number;
  splitCount: number;
  weightedDeadEndPressure: number;
  weightedSplitPressure: number;
} => {
  let deadEndCount = 0;
  let isolatedGapCount = 0;
  let splitCount = 0;
  let weightedDeadEndPressure = 0;
  let weightedSplitPressure = 0;
  const maxGoalDistance = Math.max(1, Math.sqrt(2) * maze.size);

  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
      const neighbors = collectLegacyProgressionWalkableNeighbors(maze, x, y);
      const neighborCount = neighbors.length;

      if (isLegacyProgressionWalkable(maze, x, y)) {
        if (neighborCount <= 1) {
          deadEndCount += 1;
          const goalProximity = 1 - Math.min(1, distanceToLegacyGoal(maze, { x, y }) / maxGoalDistance);
          weightedDeadEndPressure += 0.35 + (goalProximity * 0.9);
        }

        if (neighborCount >= 3) {
          splitCount += 1;
          const currentDistance = distanceToLegacyGoal(maze, { x, y });
          const plausibleChoiceCount = neighbors.filter((neighbor) => (
            distanceToLegacyGoal(maze, neighbor) <= currentDistance + Math.max(2, maze.size * 0.08)
          )).length;
          weightedSplitPressure += 0.5 + ((neighborCount - 2) * 0.28) + (plausibleChoiceCount * 0.22);
        }

        continue;
      }

      const isInterior = x > 0 && y > 0 && x < maze.size - 1 && y < maze.size - 1;
      if (isInterior && neighborCount >= 3) {
        isolatedGapCount += 1;
      }
    }
  }

  return {
    deadEndCount,
    isolatedGapCount,
    splitCount,
    weightedDeadEndPressure,
    weightedSplitPressure
  };
};

export const resolveLegacyProgressionRank = (targetComplexity: number): LegacyProgressionRank => {
  if (targetComplexity >= 125) {
    return 'S';
  }
  if (targetComplexity >= 96) {
    return 'A';
  }
  if (targetComplexity >= 70) {
    return 'B';
  }
  if (targetComplexity >= 46) {
    return 'C';
  }
  if (targetComplexity >= 28) {
    return 'D';
  }
  return 'E';
};

export const resolveLegacyProgressionLevel = (targetComplexity: number): number => (
  clampInteger(Math.floor((targetComplexity - LEGACY_PROGRESSION_MIN_COMPLEXITY) / 4) + 1, 1, 99)
);

const resolveLegacyProgressionColorTier = (targetComplexity: number): number => (
  clampInteger(
    Math.floor(Math.max(0, targetComplexity - LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY) / 24),
    0,
    LEGACY_PROGRESS_COLOR_TIERS.length - 1
  )
);

const createTrack = (targetComplexity = LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY): LegacyProgressionTrack => {
  const normalizedTarget = clampInteger(targetComplexity, LEGACY_PROGRESSION_MIN_COMPLEXITY, LEGACY_PROGRESSION_MAX_COMPLEXITY);
  return {
    bestCompletionTimeMs: null,
    cleanCycles: 0,
    colorTier: resolveLegacyProgressionColorTier(normalizedTarget),
    completedCycles: 0,
    lastCompletedAt: null,
    lastCompletionTimeMs: null,
    lastMazeSeed: null,
    lastSignal: 'hold',
    level: resolveLegacyProgressionLevel(normalizedTarget),
    paceScore: 0,
    peakComplexity: normalizedTarget,
    rank: resolveLegacyProgressionRank(normalizedTarget),
    recentSignals: [],
    struggleCycles: 0,
    targetComplexity: normalizedTarget
  };
};

const formatLegacyProgressionCycleCount = (completedCycles: number): string => (
  `${Math.min(99_999, Math.max(0, Math.round(completedCycles)))}${completedCycles > 99_999 ? '+' : ''}`
);

export const createEmptyLegacyProgressionState = (): LegacyProgressionState => ({
  version: 1,
  aiRunnerBaselineVersion: LEGACY_PROGRESSION_AI_BASELINE_VERSION,
  updatedAt: null,
  tracks: {
    player: createTrack(LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY),
    'ai-runner': createTrack(LEGACY_PROGRESSION_AI_BASE_TARGET_COMPLEXITY)
  }
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
);

const normalizeNullableNonNegativeInteger = (value: unknown, fallback: number | null = null): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
);

const normalizeSignal = (value: unknown): LegacyProgressionSignal => (
  value === 'challenge' || value === 'ease' || value === 'hold' ? value : 'hold'
);

const normalizeSignalWindow = (value: unknown, fallback: readonly LegacyProgressionSignal[] = []): LegacyProgressionSignal[] => (
  (Array.isArray(value) ? value : fallback)
    .map(normalizeSignal)
    .slice(0, LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT)
);

const appendLegacyProgressionSignal = (
  track: Pick<LegacyProgressionTrack, 'recentSignals'>,
  signal: LegacyProgressionSignal
): LegacyProgressionSignal[] => [
  signal,
  ...normalizeSignalWindow(track.recentSignals)
].slice(0, LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT);

const countSignals = (
  signals: readonly LegacyProgressionSignal[],
  signal: LegacyProgressionSignal
): number => signals.filter((entry) => entry === signal).length;

const normalizeTrack = (value: unknown, fallback: LegacyProgressionTrack): LegacyProgressionTrack => {
  if (!isRecord(value)) {
    return copyTrack(fallback);
  }

  const targetComplexity = clampInteger(
    normalizeNonNegativeInteger(value.targetComplexity, fallback.targetComplexity),
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );
  const peakComplexity = clampInteger(
    normalizeNonNegativeInteger(value.peakComplexity, Math.max(fallback.peakComplexity, targetComplexity)),
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );

  return {
    bestCompletionTimeMs: normalizeNullableNonNegativeInteger(value.bestCompletionTimeMs, fallback.bestCompletionTimeMs),
    cleanCycles: normalizeNonNegativeInteger(value.cleanCycles, fallback.cleanCycles),
    colorTier: resolveLegacyProgressionColorTier(targetComplexity),
    completedCycles: normalizeNonNegativeInteger(value.completedCycles, fallback.completedCycles),
    lastCompletedAt: typeof value.lastCompletedAt === 'string' ? value.lastCompletedAt : fallback.lastCompletedAt,
    lastCompletionTimeMs: normalizeNullableNonNegativeInteger(value.lastCompletionTimeMs, fallback.lastCompletionTimeMs),
    lastMazeSeed: typeof value.lastMazeSeed === 'number' && Number.isFinite(value.lastMazeSeed)
      ? Math.max(0, Math.round(value.lastMazeSeed))
      : fallback.lastMazeSeed,
    lastSignal: normalizeSignal(value.lastSignal),
    level: resolveLegacyProgressionLevel(targetComplexity),
    paceScore: clampInteger(normalizeNonNegativeInteger(value.paceScore, fallback.paceScore), 0, 100),
    peakComplexity,
    rank: resolveLegacyProgressionRank(targetComplexity),
    recentSignals: normalizeSignalWindow(value.recentSignals, fallback.recentSignals),
    struggleCycles: normalizeNonNegativeInteger(value.struggleCycles, fallback.struggleCycles),
    targetComplexity
  };
};

export const normalizeLegacyProgressionState = (value: unknown): LegacyProgressionState => {
  const fallback = createEmptyLegacyProgressionState();
  if (!isRecord(value)) {
    return fallback;
  }

  const tracks = isRecord(value.tracks) ? value.tracks : {};
  const aiRunnerBaselineVersion = normalizeNonNegativeInteger(
    value.aiRunnerBaselineVersion,
    0
  );
  const shouldResetLegacyAiRunner = aiRunnerBaselineVersion < LEGACY_PROGRESSION_AI_BASELINE_VERSION;
  return {
    version: 1,
    aiRunnerBaselineVersion: LEGACY_PROGRESSION_AI_BASELINE_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    tracks: {
      player: normalizeTrack(tracks.player, fallback.tracks.player),
      'ai-runner': shouldResetLegacyAiRunner
        ? copyTrack(fallback.tracks['ai-runner'])
        : normalizeTrack(tracks['ai-runner'], fallback.tracks['ai-runner'])
    }
  };
};

export const readLegacyProgressionState = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
): LegacyProgressionState => {
  if (!storage) {
    return createEmptyLegacyProgressionState();
  }

  try {
    const raw = storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY);
    const normalized = raw ? normalizeLegacyProgressionState(JSON.parse(raw)) : createEmptyLegacyProgressionState();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed) || normalizeNonNegativeInteger(parsed.aiRunnerBaselineVersion) < LEGACY_PROGRESSION_AI_BASELINE_VERSION) {
        storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(normalized));
      }
    }
    return normalized;
  } catch {
    return createEmptyLegacyProgressionState();
  }
};

export const writeLegacyProgressionState = (
  storage: Pick<Storage, 'setItem'> | undefined,
  state: LegacyProgressionState
): LegacyProgressionState => {
  const normalized = normalizeLegacyProgressionState(state);
  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Progression is local-first and best-effort; gameplay should not depend on storage.
  }

  return normalized;
};

export const resolveLegacyMazeComplexity = (maze: LegacyMazeSnapshot): LegacyMazeComplexityBreakdown => {
  const walkableTiles = countWalkableTiles(maze);
  const floorRatio = walkableTiles / Math.max(1, maze.size * maze.size);
  const topology = resolveLegacyProgressionTopologyMetrics(maze);
  const edgeWrapCount = countLegacyProgressionWrappedContinuities(maze);
  const sizeScore = maze.size * 0.52;
  const solutionScore = maze.solutionPath.length * 0.24;
  const floorScore = floorRatio * 16;
  const routeScore = maze.routeQualityStats
    ? (
      (maze.routeQualityStats.routeQuality === 'multi-route' ? 8 : 2)
      + (maze.routeQualityStats.meaningfulBypassableRouteBands * 4)
      + (maze.routeQualityStats.meaningfulBypassableSolutionEdges * 2.2)
      + (maze.routeQualityStats.minimumMeaningfulDetour * 0.6)
    )
    : 2;
  const shortcutScore = (maze.shortcutsCreated ?? maze.shortcutStats?.created ?? 0) * 1.8;
  const checkpointScore = (maze.pathBuilderStats?.acceptedCheckpoints ?? maze.generation?.budget.checkpointCount ?? 0) * 0.08;
  const edgeWrapScore = Math.min(16, edgeWrapCount * 2.4);
  const edgeWrapReliefScore = edgeWrapCount > 0
    ? Math.min(12, Math.max(0, ((maze.size * 0.72) - maze.solutionPath.length) * edgeWrapCount * 0.22))
    : 0;
  const splitScore = Math.min(20, topology.splitCount * 0.78);
  const deadEndPressureScore = Math.min(18, topology.deadEndCount * 0.72);
  const weightedSplitPressureScore = Math.min(12, topology.weightedSplitPressure * 0.18);
  const weightedDeadEndPressureScore = Math.min(10, topology.weightedDeadEndPressure * 0.16);
  const fillQualityScore = Math.max(
    0,
    Math.min(10, (Math.min(1, floorRatio / 0.38) * 10) - Math.min(6, topology.isolatedGapCount * 0.4))
  );
  const total = clampInteger(
    sizeScore
    + solutionScore
    + floorScore
    + routeScore
    + shortcutScore
    + checkpointScore
    + edgeWrapScore
    - edgeWrapReliefScore
    + splitScore
    + deadEndPressureScore
    + weightedSplitPressureScore
    + weightedDeadEndPressureScore
    + fillQualityScore,
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );

  return {
    checkpointScore: roundNumber(checkpointScore),
    deadEndCount: topology.deadEndCount,
    deadEndPressureScore: roundNumber(deadEndPressureScore),
    edgeWrapCount,
    edgeWrapReliefScore: roundNumber(edgeWrapReliefScore),
    edgeWrapScore: roundNumber(edgeWrapScore),
    fillQualityScore: roundNumber(fillQualityScore),
    floorScore: roundNumber(floorScore),
    routeScore: roundNumber(routeScore),
    shortcutScore: roundNumber(shortcutScore),
    sizeScore: roundNumber(sizeScore),
    solutionScore: roundNumber(solutionScore),
    splitCount: topology.splitCount,
    splitScore: roundNumber(splitScore),
    total,
    weightedDeadEndPressureScore: roundNumber(weightedDeadEndPressureScore),
    weightedSplitPressureScore: roundNumber(weightedSplitPressureScore)
  };
};

export const resolveLegacyProgressionTrackIdForSurface = (
  surface: MazeCycleTelemetrySurface
): LegacyProgressionTrackId => (
  surface === 'play' ? 'player' : 'ai-runner'
);

export const resolveLegacyProgressionExpectedCompletionMs = (
  receipt: Pick<MazeCycleTelemetryReceipt, 'playerPathLength' | 'surface'>,
  complexity: number
): number => {
  const surfaceMultiplier = receipt.surface === 'menu-demo' ? 1.18 : 1;
  const routePressureMs = Math.max(8_000, receipt.playerPathLength * 440);
  const complexityPressureMs = Math.max(10_000, complexity * 360);

  return Math.round(Math.max(routePressureMs, complexityPressureMs) * surfaceMultiplier);
};

export const resolveLegacyProgressionPaceScore = (
  receipt: Pick<MazeCycleTelemetryReceipt, 'completionTimeMs' | 'playerPathLength' | 'surface'>,
  complexity: number
): number => {
  if (!Number.isFinite(receipt.completionTimeMs) || receipt.completionTimeMs <= 0) {
    return 0;
  }

  const expectedMs = resolveLegacyProgressionExpectedCompletionMs(receipt, complexity);
  const ratio = receipt.completionTimeMs / Math.max(1, expectedMs);
  if (ratio <= 0.68) {
    return 100;
  }
  if (ratio >= 1.7) {
    return 0;
  }

  return clampInteger(100 - (((ratio - 0.68) / (1.7 - 0.68)) * 100), 0, 100);
};

export const resolveLegacyProgressionPerformanceScore = (
  receipt: Pick<
    MazeCycleTelemetryReceipt,
    | 'averageFrameMs'
    | 'backtracks'
    | 'completionTimeMs'
    | 'playerPathLength'
    | 'renderSafetyPenaltyScore'
    | 'resetUsed'
    | 'routeEfficiencyPressureScore'
    | 'surface'
    | 'wrongTurns'
  >,
  complexity: number
): LegacyProgressionPerformanceScore => {
  const timeScore = resolveLegacyProgressionPaceScore(receipt, complexity);
  const routeEfficiencyScore = clampInteger(100 - receipt.routeEfficiencyPressureScore, 0, 100);
  const wrongTurnScore = clampInteger(100 - (receipt.wrongTurns * 16), 0, 100);
  const backtrackScore = clampInteger(100 - (receipt.backtracks * 14), 0, 100);
  const resetScore = receipt.resetUsed ? 0 : 100;
  const stabilityScore = clampInteger(
    100 - Math.max(receipt.renderSafetyPenaltyScore, receipt.averageFrameMs >= 24 ? 75 : 0),
    0,
    100
  );
  const weightedTotal = (
    (timeScore * 0.38)
    + (routeEfficiencyScore * 0.22)
    + (wrongTurnScore * 0.14)
    + (backtrackScore * 0.12)
    + (resetScore * 0.08)
    + (stabilityScore * 0.06)
  );
  const timeStruggleCap = timeScore <= 5 && (receipt.wrongTurns >= 2 || receipt.backtracks >= 2)
    ? 28
    : 100;
  const resetStruggleCap = receipt.resetUsed ? 36 : 100;
  const unsafeRenderCap = stabilityScore <= 25 ? 62 : 100;
  const total = clampInteger(Math.min(weightedTotal, timeStruggleCap, resetStruggleCap, unsafeRenderCap), 0, 100);
  let signal: LegacyProgressionSignal = 'hold';

  if (stabilityScore <= 25 || receipt.averageFrameMs >= 24) {
    signal = 'hold';
  } else if (
    receipt.resetUsed
    || receipt.wrongTurns >= 6
    || receipt.backtracks >= 6
    || receipt.routeEfficiencyPressureScore >= 75
    || total <= 38
    || (total <= 48 && (receipt.wrongTurns >= 2 || receipt.backtracks >= 2))
  ) {
    signal = 'ease';
  } else if (
    total >= 72
    && receipt.wrongTurns <= 1
    && receipt.backtracks <= 1
    && receipt.routeEfficiencyPressureScore <= 25
  ) {
    signal = 'challenge';
  }

  return {
    backtrackScore,
    resetScore,
    routeEfficiencyScore,
    signal,
    stabilityScore,
    timeScore,
    total,
    wrongTurnScore
  };
};

const resolveProgressionSignal = (
  receipt: MazeCycleTelemetryReceipt,
  complexity: number
): LegacyProgressionSignal => resolveLegacyProgressionPerformanceScore(receipt, complexity).signal;

const resolveLegacyProgressionTargetAdjustment = (
  track: LegacyProgressionTrack,
  complexity: number,
  signal: LegacyProgressionSignal
): number => {
  const nextSignals = appendLegacyProgressionSignal(track, signal);
  const recentChallengeCount = countSignals(nextSignals, 'challenge');
  const recentEaseCount = countSignals(nextSignals, 'ease');

  if (signal === 'ease') {
    return complexity > track.targetComplexity + 18
      || track.struggleCycles >= 2
      || recentEaseCount >= LEGACY_PROGRESSION_CONSISTENT_SIGNAL_THRESHOLD
      ? LEGACY_PROGRESSION_EASE_PRESSURE_STEP
      : LEGACY_PROGRESSION_EASE_STEP;
  }

  if (signal !== 'challenge') {
    return 0;
  }

  const nextCleanCycles = track.cleanCycles + 1;
  const measuredPressureBonus = complexity >= track.targetComplexity + 8
    ? LEGACY_PROGRESSION_CHALLENGE_PRESSURE_BONUS
    : 0;
  const consistencyBonus = recentChallengeCount >= LEGACY_PROGRESSION_CONSISTENT_SIGNAL_THRESHOLD
    ? 1
    : 0;
  const longStreakBonus = nextCleanCycles % LEGACY_PROGRESSION_CHALLENGE_STREAK_BONUS_EVERY === 0
    ? 1
    : 0;

  return Math.min(
    LEGACY_PROGRESSION_MAX_CHALLENGE_STEP,
    LEGACY_PROGRESSION_CHALLENGE_STEP + measuredPressureBonus + consistencyBonus + longStreakBonus
  );
};

const resolveLegacyProgressionPacedTarget = (
  track: LegacyProgressionTrack,
  complexity: number,
  signal: LegacyProgressionSignal
): number => clampInteger(
  track.targetComplexity + resolveLegacyProgressionTargetAdjustment(track, complexity, signal),
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_MAX_COMPLEXITY
);

const applyTrackSignal = (
  track: LegacyProgressionTrack,
  receipt: MazeCycleTelemetryReceipt,
  complexity: number,
  signal: LegacyProgressionSignal
): LegacyProgressionTrack => {
  const targetComplexity = resolveLegacyProgressionPacedTarget(track, complexity, signal);
  const recentSignals = appendLegacyProgressionSignal(track, signal);
  const lastCompletionTimeMs = Math.max(0, Math.round(receipt.completionTimeMs));
  const previousBest = track.bestCompletionTimeMs;
  const bestCompletionTimeMs = lastCompletionTimeMs > 0
    ? previousBest === null
      ? lastCompletionTimeMs
      : Math.min(previousBest, lastCompletionTimeMs)
    : previousBest;
  const performanceScore = resolveLegacyProgressionPerformanceScore(receipt, complexity);

  return {
    bestCompletionTimeMs,
    cleanCycles: track.cleanCycles + (signal === 'challenge' ? 1 : 0),
    colorTier: resolveLegacyProgressionColorTier(targetComplexity),
    completedCycles: track.completedCycles + 1,
    lastCompletedAt: receipt.completedAt,
    lastCompletionTimeMs,
    lastMazeSeed: receipt.mazeSeed,
    lastSignal: signal,
    level: resolveLegacyProgressionLevel(targetComplexity),
    paceScore: performanceScore.total,
    peakComplexity: Math.max(track.peakComplexity, complexity, targetComplexity),
    rank: resolveLegacyProgressionRank(targetComplexity),
    recentSignals,
    struggleCycles: track.struggleCycles + (signal === 'ease' ? 1 : 0),
    targetComplexity
  };
};

export const summarizeLegacyProgressionPacing = (
  track: LegacyProgressionTrack,
  measuredMazeComplexity: number
): LegacyProgressionPacingSummary => {
  const signalWindow = normalizeSignalWindow(track.recentSignals);

  return {
    activeLevel: track.level,
    activeRank: track.rank,
    activeTargetComplexity: track.targetComplexity,
    challengeStep: resolveLegacyProgressionTargetAdjustment(track, measuredMazeComplexity, 'challenge'),
    easeStep: resolveLegacyProgressionTargetAdjustment(track, measuredMazeComplexity, 'ease'),
    lastCompletionTimeMs: track.lastCompletionTimeMs,
    measuredMazeComplexity,
    measuredMazeLevel: resolveLegacyProgressionLevel(measuredMazeComplexity),
    measuredMazeRank: resolveLegacyProgressionRank(measuredMazeComplexity),
    nextChallengeTargetComplexity: resolveLegacyProgressionPacedTarget(track, measuredMazeComplexity, 'challenge'),
    nextEaseTargetComplexity: resolveLegacyProgressionPacedTarget(track, measuredMazeComplexity, 'ease'),
    paceScore: track.paceScore,
    recentChallengeCount: countSignals(signalWindow, 'challenge'),
    recentEaseCount: countSignals(signalWindow, 'ease'),
    signalWindow
  };
};

export const recordLegacyProgressionCycle = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  state: LegacyProgressionState,
  receipt: MazeCycleTelemetryReceipt,
  maze?: LegacyMazeSnapshot
): LegacyProgressionState => {
  const normalized = normalizeLegacyProgressionState(state);
  const trackId = resolveLegacyProgressionTrackIdForSurface(receipt.surface);
  const complexity = resolveLegacyMazeComplexity(maze ?? {
    source: receipt.surface === 'play' ? 'play-generated' : 'menu-generated',
    size: receipt.mazeSize,
    grid: [],
    start: receipt.start,
    goal: receipt.goal,
    solutionPath: receipt.playerPath,
    seed: receipt.mazeSeed,
    routeQualityStats: receipt.routeQuality
      ? {
        bypassableRouteBands: 0,
        bypassableSolutionEdges: 0,
        meaningfulBypassableRouteBands: receipt.routeQuality === 'multi-route' ? 1 : 0,
        meaningfulBypassableSolutionEdges: receipt.routeQuality === 'multi-route' ? 1 : 0,
        minimumMeaningfulDetour: receipt.routeQuality === 'multi-route' ? 2 : 0,
        routeQuality: receipt.routeQuality,
        sampledSolutionEdges: Math.max(0, receipt.playerPathLength - 1)
      }
      : undefined
  });
  const signal = resolveProgressionSignal(receipt, complexity.total);

  return writeLegacyProgressionState(storage, {
    version: 1,
    aiRunnerBaselineVersion: normalized.aiRunnerBaselineVersion,
    updatedAt: receipt.completedAt,
    tracks: {
      ...normalized.tracks,
      [trackId]: applyTrackSignal(normalized.tracks[trackId], receipt, complexity.total, signal)
    }
  });
};

export const resolveLegacyProgressionPalette = (
  track: LegacyProgressionTrack,
  trackId: LegacyProgressionTrackId
): LegacyProgressionPalette => {
  const tier = clampInteger(track.colorTier, 0, LEGACY_PROGRESS_COLOR_TIERS.length - 1);
  const palette = resolvePathContrastPalette(
    LEGACY_PROGRESS_COLOR_TIERS[tier] ?? LEGACY_PROGRESS_COLOR_TIERS[0]!
  );
  const trackLabel = trackId === 'player' ? 'Player Skill' : 'AI Skill';

  return {
    ...palette,
    label: `${trackLabel} Lv ${String(track.level).padStart(2, '0')} Rank ${track.rank} Runs ${formatLegacyProgressionCycleCount(track.completedCycles)}`,
    tier
  };
};

export const resolveLegacyProgressionGenerationScale = (
  baseScale: number,
  track: LegacyProgressionTrack,
  options: LegacyProgressionGenerationScaleOptions = {}
): number => {
  const progressionScale = 32 + (track.targetComplexity * 0.46);
  const blendedScale = (baseScale * 0.62) + (progressionScale * 0.38);
  const progressionMaxScale = Math.min(96, baseScale + 28);
  const viewportMaxScale = resolveLegacyProgressionViewportScaleCap({
    ...options,
    boardScale: baseScale
  });
  const maxScale = Math.max(25, Math.min(progressionMaxScale, viewportMaxScale));
  const minScale = Math.min(Math.max(25, baseScale - 8), maxScale);
  return clampInteger(blendedScale, minScale, maxScale);
};

export const resolveLegacyProgressionViewportScaleCap = (
  options: LegacyProgressionGenerationScaleOptions
): number => {
  const viewport = options.viewport;
  if (
    !viewport
    || !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || viewport.width <= 0
    || viewport.height <= 0
  ) {
    return 96;
  }

  const boardScale = clampInteger(options.boardScale ?? 50, 25, 150);
  const layoutSurface = options.surface === 'play' ? 'play' : 'menu';
  const isPhoneMenu = layoutSurface === 'menu'
    && Math.min(viewport.width, viewport.height) <= LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH;
  const minimumTileSize = options.surface === 'play'
    ? LEGACY_PROGRESSION_PLAY_MIN_TILE_PX
    : isPhoneMenu
      ? LEGACY_PROGRESSION_PHONE_MENU_TARGET_TILE_PX
      : LEGACY_PROGRESSION_MENU_MIN_TILE_PX;

  for (let candidateScale = 96; candidateScale >= 25; candidateScale -= 1) {
    const layout = resolveLegacyMenuLayout(
      viewport.width,
      viewport.height,
      boardScale,
      candidateScale,
      layoutSurface
    );
    const safeInset = clampInteger(
      Math.round(layout.boardSize * LEGACY_PROGRESSION_RENDER_SAFE_INSET_RATIO),
      LEGACY_PROGRESSION_RENDER_SAFE_INSET_MIN,
      LEGACY_PROGRESSION_RENDER_SAFE_INSET_MAX
    );
    const renderSize = Math.max(1, layout.boardSize - (safeInset * 2));

    if ((renderSize / candidateScale) >= minimumTileSize) {
      return isPhoneMenu ? Math.min(candidateScale, boardScale) : candidateScale;
    }
  }

  return isPhoneMenu ? Math.min(25, boardScale) : 25;
};

export const summarizeLegacyProgressionDiagnostics = (
  state: LegacyProgressionState,
  activeTrackId: LegacyProgressionTrackId,
  maze: LegacyMazeSnapshot,
  storageKey = LEGACY_PROGRESSION_STORAGE_KEY
): LegacyProgressionDiagnostics => {
  const normalized = normalizeLegacyProgressionState(state);
  const activeTrack = normalized.tracks[activeTrackId];
  const complexity = resolveLegacyMazeComplexity(maze);
  return {
    activeTrackId,
    complexity,
    palette: resolveLegacyProgressionPalette(activeTrack, activeTrackId),
    pacing: summarizeLegacyProgressionPacing(activeTrack, complexity.total),
    storageKey,
    tracks: {
      player: copyTrack(normalized.tracks.player),
      'ai-runner': copyTrack(normalized.tracks['ai-runner'])
    }
  };
};
