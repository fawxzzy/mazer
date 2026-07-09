import { clampInteger } from './legacyDefaults';
import type { LegacyMazeSnapshot } from './legacyMaze';
import { resolveLegacyMenuLayout } from './legacyMenuLayout';
import type { MazeCycleTelemetryReceipt, MazeCycleTelemetrySurface } from './mazeCycleTelemetry';

export const LEGACY_PROGRESSION_STORAGE_KEY = 'mazer.progression.v1';
export const LEGACY_PROGRESSION_MIN_COMPLEXITY = 8;
export const LEGACY_PROGRESSION_MAX_COMPLEXITY = 180;
export const LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY = 24;
export const LEGACY_PROGRESSION_MENU_MIN_TILE_PX = 5.35;
export const LEGACY_PROGRESSION_PLAY_MIN_TILE_PX = 5.25;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_RATIO = 0.018;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_MIN = 4;
export const LEGACY_PROGRESSION_RENDER_SAFE_INSET_MAX = 7;
export const LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH = 430;

export type LegacyProgressionTrackId = 'player' | 'ai-runner';
export type LegacyProgressionRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type LegacyProgressionSignal = 'challenge' | 'ease' | 'hold';

export interface LegacyProgressionTrack {
  cleanCycles: number;
  colorTier: number;
  completedCycles: number;
  lastCompletedAt: string | null;
  lastMazeSeed: number | null;
  lastSignal: LegacyProgressionSignal;
  level: number;
  peakComplexity: number;
  rank: LegacyProgressionRank;
  struggleCycles: number;
  targetComplexity: number;
}

export interface LegacyProgressionState {
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
  updatedAt: string | null;
  version: 1;
}

export interface LegacyMazeComplexityBreakdown {
  checkpointScore: number;
  floorScore: number;
  routeScore: number;
  shortcutScore: number;
  sizeScore: number;
  solutionScore: number;
  total: number;
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
  storageKey: string;
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
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
    trailColor: 0x66eebf,
    trailPulseColor: 0x36ff7d,
    trailPulseEdgeColor: 0xecfff5
  },
  {
    badgeColor: '#59fff0',
    playerCoreColor: 0x59fff0,
    playerHaloColor: 0x18bfc8,
    rankColor: 0x59fff0,
    trailColor: 0x8fffe8,
    trailPulseColor: 0x59fff0,
    trailPulseEdgeColor: 0xecffff
  },
  {
    badgeColor: '#7da8ff',
    playerCoreColor: 0x7da8ff,
    playerHaloColor: 0x315cc9,
    rankColor: 0x7da8ff,
    trailColor: 0xa7c8ff,
    trailPulseColor: 0x7da8ff,
    trailPulseEdgeColor: 0xf1f6ff
  },
  {
    badgeColor: '#fff05a',
    playerCoreColor: 0xfff05a,
    playerHaloColor: 0xff9f1c,
    rankColor: 0xfff05a,
    trailColor: 0xffd36a,
    trailPulseColor: 0xfff05a,
    trailPulseEdgeColor: 0xfff7c4
  },
  {
    badgeColor: '#ff61c7',
    playerCoreColor: 0xff61c7,
    playerHaloColor: 0xb72ba4,
    rankColor: 0xff61c7,
    trailColor: 0xff9cdc,
    trailPulseColor: 0xff61c7,
    trailPulseEdgeColor: 0xffecfa
  },
  {
    badgeColor: '#ffffff',
    playerCoreColor: 0xffffff,
    playerHaloColor: 0xb7f2ff,
    rankColor: 0xffffff,
    trailColor: 0xdffcff,
    trailPulseColor: 0xffffff,
    trailPulseEdgeColor: 0xb7f2ff
  }
];

const copyTrack = (track: LegacyProgressionTrack): LegacyProgressionTrack => ({ ...track });

const roundNumber = (value: number, precision = 3): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const countWalkableTiles = (maze: LegacyMazeSnapshot): number => (
  maze.grid.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0
  )
);

const resolveLegacyProgressionRank = (targetComplexity: number): LegacyProgressionRank => {
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

const resolveLegacyProgressionLevel = (targetComplexity: number): number => (
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
    cleanCycles: 0,
    colorTier: resolveLegacyProgressionColorTier(normalizedTarget),
    completedCycles: 0,
    lastCompletedAt: null,
    lastMazeSeed: null,
    lastSignal: 'hold',
    level: resolveLegacyProgressionLevel(normalizedTarget),
    peakComplexity: normalizedTarget,
    rank: resolveLegacyProgressionRank(normalizedTarget),
    struggleCycles: 0,
    targetComplexity: normalizedTarget
  };
};

export const createEmptyLegacyProgressionState = (): LegacyProgressionState => ({
  version: 1,
  updatedAt: null,
  tracks: {
    player: createTrack(),
    'ai-runner': createTrack(LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY - 4)
  }
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
);

const normalizeSignal = (value: unknown): LegacyProgressionSignal => (
  value === 'challenge' || value === 'ease' || value === 'hold' ? value : 'hold'
);

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
    cleanCycles: normalizeNonNegativeInteger(value.cleanCycles, fallback.cleanCycles),
    colorTier: resolveLegacyProgressionColorTier(targetComplexity),
    completedCycles: normalizeNonNegativeInteger(value.completedCycles, fallback.completedCycles),
    lastCompletedAt: typeof value.lastCompletedAt === 'string' ? value.lastCompletedAt : fallback.lastCompletedAt,
    lastMazeSeed: typeof value.lastMazeSeed === 'number' && Number.isFinite(value.lastMazeSeed)
      ? Math.max(0, Math.round(value.lastMazeSeed))
      : fallback.lastMazeSeed,
    lastSignal: normalizeSignal(value.lastSignal),
    level: resolveLegacyProgressionLevel(targetComplexity),
    peakComplexity,
    rank: resolveLegacyProgressionRank(targetComplexity),
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
  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    tracks: {
      player: normalizeTrack(tracks.player, fallback.tracks.player),
      'ai-runner': normalizeTrack(tracks['ai-runner'], fallback.tracks['ai-runner'])
    }
  };
};

export const readLegacyProgressionState = (
  storage: Pick<Storage, 'getItem'> | undefined
): LegacyProgressionState => {
  if (!storage) {
    return createEmptyLegacyProgressionState();
  }

  try {
    const raw = storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY);
    return raw ? normalizeLegacyProgressionState(JSON.parse(raw)) : createEmptyLegacyProgressionState();
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
  const total = clampInteger(
    sizeScore + solutionScore + floorScore + routeScore + shortcutScore + checkpointScore,
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );

  return {
    checkpointScore: roundNumber(checkpointScore),
    floorScore: roundNumber(floorScore),
    routeScore: roundNumber(routeScore),
    shortcutScore: roundNumber(shortcutScore),
    sizeScore: roundNumber(sizeScore),
    solutionScore: roundNumber(solutionScore),
    total
  };
};

export const resolveLegacyProgressionTrackIdForSurface = (
  surface: MazeCycleTelemetrySurface
): LegacyProgressionTrackId => (
  surface === 'play' ? 'player' : 'ai-runner'
);

const resolveProgressionSignal = (
  receipt: MazeCycleTelemetryReceipt,
  complexity: number
): LegacyProgressionSignal => {
  const highFrameCost = receipt.averageFrameMs >= 24;
  if (highFrameCost) {
    return 'hold';
  }

  if (receipt.resetUsed || receipt.wrongTurns >= 6 || receipt.backtracks >= 6) {
    return 'ease';
  }

  const expectedMs = Math.max(12_000, complexity * 420);
  if (
    receipt.wrongTurns <= 1
    && receipt.backtracks <= 1
    && receipt.completionTimeMs > 0
    && receipt.completionTimeMs <= expectedMs
  ) {
    return 'challenge';
  }

  return 'hold';
};

const applyTrackSignal = (
  track: LegacyProgressionTrack,
  receipt: MazeCycleTelemetryReceipt,
  complexity: number,
  signal: LegacyProgressionSignal
): LegacyProgressionTrack => {
  const completedBase = Math.max(track.targetComplexity, complexity);
  const adjustment = signal === 'challenge' ? 2 : signal === 'ease' ? -1 : 0;
  const targetComplexity = clampInteger(
    completedBase + adjustment,
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );

  return {
    cleanCycles: track.cleanCycles + (signal === 'challenge' ? 1 : 0),
    colorTier: resolveLegacyProgressionColorTier(targetComplexity),
    completedCycles: track.completedCycles + 1,
    lastCompletedAt: receipt.completedAt,
    lastMazeSeed: receipt.mazeSeed,
    lastSignal: signal,
    level: resolveLegacyProgressionLevel(targetComplexity),
    peakComplexity: Math.max(track.peakComplexity, complexity, targetComplexity),
    rank: resolveLegacyProgressionRank(targetComplexity),
    struggleCycles: track.struggleCycles + (signal === 'ease' ? 1 : 0),
    targetComplexity
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
  const palette = LEGACY_PROGRESS_COLOR_TIERS[tier] ?? LEGACY_PROGRESS_COLOR_TIERS[0]!;
  const prefix = trackId === 'player' ? 'LV' : 'AI';

  return {
    ...palette,
    label: `${prefix} ${String(track.level).padStart(2, '0')} | ${track.rank}${track.targetComplexity}`,
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

  const minimumTileSize = options.surface === 'play'
    ? LEGACY_PROGRESSION_PLAY_MIN_TILE_PX
    : LEGACY_PROGRESSION_MENU_MIN_TILE_PX;
  const boardScale = clampInteger(options.boardScale ?? 50, 25, 150);
  const layoutSurface = options.surface === 'play' ? 'play' : 'menu';
  const isPhoneMenu = layoutSurface === 'menu'
    && Math.min(viewport.width, viewport.height) <= LEGACY_PROGRESSION_PHONE_MENU_MAX_WIDTH;

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
  return {
    activeTrackId,
    complexity: resolveLegacyMazeComplexity(maze),
    palette: resolveLegacyProgressionPalette(activeTrack, activeTrackId),
    storageKey,
    tracks: {
      player: copyTrack(normalized.tracks.player),
      'ai-runner': copyTrack(normalized.tracks['ai-runner'])
    }
  };
};
