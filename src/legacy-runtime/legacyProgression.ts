import { clampInteger } from './legacyDefaults';
import type { LegacyMazeGenerationProfile, LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import { resolveLegacyMenuBoardAspectRatio, resolveLegacyMenuLayout } from './legacyMenuLayout';
import { LEGACY_TRAIL_SHINE_COLOR, LEGACY_TRAIL_SHINE_EDGE_COLOR } from './legacyIridescentMaterial';
import {
  type MazeCycleTelemetryReceipt,
  type MazeCycleTelemetrySurface
} from './mazeCycleTelemetry';
import {
  MAZE_CYCLE_RUN_QUALITY_AI_CHALLENGE_SCORE_THRESHOLD,
  MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD,
  resolveMazeCycleExpectedCompletionMs,
  scoreMazeCyclePace,
  scoreMazeCycleRunQuality
} from './mazeCycleRunQualityScorer.mjs';

export const LEGACY_PROGRESSION_STORAGE_KEY = 'mazer.progression.v1';
export const LEGACY_PROGRESSION_MIN_COMPLEXITY = 8;
export const LEGACY_PROGRESSION_MAX_COMPLEXITY = 400;
export const LEGACY_PROGRESSION_BASE_TARGET_COMPLEXITY = 24;
export const LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY = LEGACY_PROGRESSION_MIN_COMPLEXITY;
export const LEGACY_PROGRESSION_AI_BASE_TARGET_COMPLEXITY = LEGACY_PROGRESSION_MIN_COMPLEXITY;
export const LEGACY_PROGRESSION_AI_BASELINE_VERSION = 3;
export const LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION = 5;
// Player difficulty does not consume `struggleCycles`; it is legacy AI
// telemetry. Reserve an impossible player count in that existing compatible
// field so a stale tab cannot erase baseline provenance when it rewrites the
// top-level baseline version during remote sync.
const LEGACY_PROGRESSION_PLAYER_BASELINE_V5_PROVENANCE_STRUGGLE_CYCLES = Number.MAX_SAFE_INTEGER;
// Difficulty pressure remains bounded and advances independently from the
// visible completion ordinal. Every accepted completion increments `level`
// by exactly one; this step only controls the next maze's bounded pressure.
export const LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP = 4;
export const LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT = 6;
export const LEGACY_PROGRESSION_CONSISTENT_SIGNAL_THRESHOLD = 2;
export const LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD = MAZE_CYCLE_RUN_QUALITY_AI_CHALLENGE_SCORE_THRESHOLD;
export const LEGACY_PROGRESSION_AI_EASE_SCORE_THRESHOLD = MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD;
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
export type LegacyProgressionOrdinal = string;
export type LegacyProgressionDifficultyBand =
  | 'tutorial'
  | 'starter'
  | 'explorer'
  | 'navigator'
  | 'architect'
  | 'mythic';

export interface LegacyProgressionTrack {
  bestCompletionTimeMs: number | null;
  cleanCycles: number;
  colorTier: number;
  completedCycles: LegacyProgressionOrdinal;
  lastCompletedAt: string | null;
  lastCompletionTimeMs: number | null;
  lastMazeSeed: number | null;
  lastReceiptId: string | null;
  lastSignal: LegacyProgressionSignal;
  level: LegacyProgressionOrdinal;
  paceScore: number;
  peakComplexity: number;
  rank: LegacyProgressionRank;
  recentSignals: LegacyProgressionSignal[];
  struggleCycles: number;
  targetComplexity: number;
}

export interface LegacyProgressionState {
  aiRunnerBaselineVersion: number;
  playerProgressionBaselineVersion: number;
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
  updatedAt: string | null;
  version: 1;
}

export interface LegacyMazeComplexityBreakdown {
  checkpointScore: number;
  deadEndCount: number;
  deadEndPressureScore: number;
  edgeWrapChoiceScore: number;
  edgeWrapReliefScore: number;
  edgeWrapCount: number;
  edgeWrapScore: number;
  edgeWrapShortcutReliefScore: number;
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
  difficultyProfile: LegacyProgressionDifficultyProfile;
  generationReview: LegacyProgressionGenerationReview;
  palette: LegacyProgressionPalette;
  pacing: LegacyProgressionPacingSummary;
  storageKey: string;
  tracks: Record<LegacyProgressionTrackId, LegacyProgressionTrack>;
}

export interface LegacyProgressionDifficultyProfile {
  band: LegacyProgressionDifficultyBand;
  branchPressure: 'minimal' | 'light' | 'moderate' | 'high' | 'extreme';
  deadEndPressure: 'minimal' | 'light' | 'moderate' | 'high' | 'extreme';
  expectedEdgeWraps: {
    horizontal: number;
    vertical: number;
  };
  fillPressure: 'open' | 'balanced' | 'dense' | 'maze-dense';
  label: string;
  levelRange: {
    max: number;
    min: number;
  };
  shortcutPressure: 'off' | 'rare' | 'light' | 'moderate' | 'high' | 'extreme';
  targetScale: number;
}

export interface LegacyProgressionPacingSummary {
  activeLevel: LegacyProgressionOrdinal;
  activeRank: LegacyProgressionRank;
  activeTargetComplexity: number;
  challengeStep: number;
  complexityUntilNextLevel: number;
  easeStep: number;
  lastCompletionTimeMs: number | null;
  levelBaseTargetComplexity: number;
  levelProgressPercent: number;
  measuredMazeComplexity: number;
  measuredMazeLevel: number;
  measuredMazeRank: LegacyProgressionRank;
  nextChallengeTargetComplexity: number;
  nextEaseTargetComplexity: number;
  nextLevelTargetComplexity: number;
  paceScore: number;
  recentChallengeCount: number;
  recentEaseCount: number;
  skillTrend: 'rising' | 'falling' | 'mixed' | 'steady';
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
  // Without these, the tile-size cap search below simulates a layout with
  // zero safe-area inset and no floating touch controls -- always more
  // generous than the real render (which does account for both) -- so the
  // cap (and the cell count it ultimately allows) came out sized for a
  // bigger box than actually exists on any device with a nonzero bottom
  // inset, leaving the real board short of the true safe edge once actual
  // margins were applied. Optional so existing non-scene callers (tests,
  // offline tooling) aren't forced to supply device geometry they don't have.
  safeArea?: { top?: number; right?: number; bottom?: number; left?: number };
  useFloatingTouchControls?: boolean;
}

export interface LegacyProgressionGenerationScaleOptions {
  boardScale?: number;
  surface?: MazeCycleTelemetrySurface;
  viewport?: LegacyProgressionViewport | null;
}

export interface LegacyProgressionGenerationReview {
  delivery: 'under-target' | 'on-target' | 'over-target';
  difference: number;
  measuredComplexity: number;
  profileBand: LegacyProgressionDifficultyBand;
  targetComplexity: number;
  tolerance: number;
}

const LEGACY_PROGRESS_COLOR_TIERS: Array<Omit<LegacyProgressionPalette, 'label' | 'tier'>> = [
  {
    badgeColor: '#36ff7d',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0x36ff7d,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  },
  {
    badgeColor: '#59fff0',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0x59fff0,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  },
  {
    badgeColor: '#7da8ff',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0x7da8ff,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  },
  {
    badgeColor: '#fff05a',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0xfff05a,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  },
  {
    badgeColor: '#ff61c7',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0xff61c7,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  },
  {
    badgeColor: '#ffd36a',
    playerCoreColor: 0x36ff7d,
    playerHaloColor: 0x00b84a,
    rankColor: 0xffd36a,
    trailColor: 0x36ff7d,
    trailPulseColor: LEGACY_TRAIL_SHINE_COLOR,
    trailPulseEdgeColor: LEGACY_TRAIL_SHINE_EDGE_COLOR
  }
];

const LEGACY_PROGRESS_PATH_CORE_CONTRAST_COLOR = 0xe7fff4;
const LEGACY_PROGRESS_MIN_PATH_COLOR_DISTANCE = 145;
const LEGACY_PROGRESS_FALLBACK_PLAYER_COLOR = 0x36ff7d;
const LEGACY_PROGRESS_FALLBACK_TRAIL_COLOR = 0x36ff7d;
const LEGACY_PROGRESS_FALLBACK_TRAIL_PULSE_COLOR = LEGACY_TRAIL_SHINE_COLOR;
const LEGACY_PROGRESSION_ORDINAL_PATTERN = /^(0|[1-9]\d*)$/;

const isCanonicalLegacyProgressionOrdinal = (value: unknown): value is LegacyProgressionOrdinal => (
  typeof value === 'string' && LEGACY_PROGRESSION_ORDINAL_PATTERN.test(value)
);

const parseLegacyProgressionOrdinal = (value: unknown): bigint | null => {
  if (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
  ) {
    return BigInt(value);
  }
  if (typeof value === 'string' && LEGACY_PROGRESSION_ORDINAL_PATTERN.test(value)) {
    return BigInt(value);
  }
  return null;
};

export const resolveLegacyProgressionOrdinal = (
  value: unknown
): LegacyProgressionOrdinal | null => parseLegacyProgressionOrdinal(value)?.toString() ?? null;

/**
 * Canonical lossless representation for every persisted or transported
 * completion ordinal. Legacy numeric inputs are accepted only while they are
 * exact safe integers; unsafe numbers are rejected instead of rounded.
 */
export const normalizeLegacyProgressionOrdinal = (
  value: unknown,
  fallback: LegacyProgressionOrdinal = '0'
): LegacyProgressionOrdinal => (
  (parseLegacyProgressionOrdinal(value) ?? parseLegacyProgressionOrdinal(fallback) ?? 0n).toString()
);

export const normalizeLegacyPositiveProgressionOrdinal = (
  value: unknown,
  fallback: LegacyProgressionOrdinal = '1'
): LegacyProgressionOrdinal => {
  const normalized = parseLegacyProgressionOrdinal(value);
  if (normalized !== null && normalized >= 1n) {
    return normalized.toString();
  }
  const normalizedFallback = parseLegacyProgressionOrdinal(fallback);
  return normalizedFallback !== null && normalizedFallback >= 1n
    ? normalizedFallback.toString()
    : '1';
};

export const compareLegacyProgressionOrdinals = (
  left: unknown,
  right: unknown
): number => {
  const leftValue = BigInt(normalizeLegacyProgressionOrdinal(left));
  const rightValue = BigInt(normalizeLegacyProgressionOrdinal(right));
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
};

export const maxLegacyProgressionOrdinal = (
  left: unknown,
  right: unknown
): LegacyProgressionOrdinal => (
  compareLegacyProgressionOrdinals(left, right) >= 0
    ? normalizeLegacyProgressionOrdinal(left)
    : normalizeLegacyProgressionOrdinal(right)
);

export const incrementLegacyProgressionOrdinal = (
  value: unknown
): LegacyProgressionOrdinal => (
  (BigInt(normalizeLegacyProgressionOrdinal(value)) + 1n).toString()
);

export const resolveLegacyProgressionOrdinalModulo = (
  value: unknown,
  modulus: number
): number => {
  if (!Number.isSafeInteger(modulus) || modulus <= 0) {
    throw new Error(`Progression ordinal modulus must be a positive safe integer, got ${modulus}`);
  }
  return Number(BigInt(normalizeLegacyProgressionOrdinal(value)) % BigInt(modulus));
};

export const resolveLegacyProgressionOrdinalSeedComponent = (
  value: unknown,
  modulus = 2_147_483_647
): number => resolveLegacyProgressionOrdinalModulo(value, modulus);

export const formatLegacyProgressionOrdinal = (value: unknown): string => (
  BigInt(normalizeLegacyProgressionOrdinal(value)).toLocaleString('en-US')
);

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

const resolveLegacyProgressionWrappedContinuityMetrics = (
  maze: LegacyMazeSnapshot
): {
  choicePressure: number;
  count: number;
} => {
  const wrappedPairs = new Set<string>();
  let choicePressure = 0;
  const maxX = maze.width - 1;
  const maxY = maze.height - 1;

  // Horizontal pairs (left/right border wrap) are indexed by row, so they
  // range over height; vertical pairs (top/bottom) are indexed by column,
  // so they range over width -- these were conflated into one shared loop
  // bound before, which only happened to be harmless while width === height.
  for (let row = 0; row < maze.height; row += 1) {
    if (isLegacyProgressionWalkable(maze, 0, row) && isLegacyProgressionWalkable(maze, maxX, row)) {
      wrappedPairs.add(`h:${row}`);
      const leftChoices = Math.max(0, collectLegacyProgressionWalkableNeighbors(maze, 0, row).length - 1);
      const rightChoices = Math.max(0, collectLegacyProgressionWalkableNeighbors(maze, maxX, row).length - 1);
      choicePressure += Math.min(4, leftChoices + rightChoices);
    }
  }

  for (let column = 0; column < maze.width; column += 1) {
    if (isLegacyProgressionWalkable(maze, column, 0) && isLegacyProgressionWalkable(maze, column, maxY)) {
      wrappedPairs.add(`v:${column}`);
      const topChoices = Math.max(0, collectLegacyProgressionWalkableNeighbors(maze, column, 0).length - 1);
      const bottomChoices = Math.max(0, collectLegacyProgressionWalkableNeighbors(maze, column, maxY).length - 1);
      choicePressure += Math.min(4, topChoices + bottomChoices);
    }
  }

  return {
    choicePressure,
    count: wrappedPairs.size
  };
};

const collectLegacyProgressionWalkableNeighbors = (
  maze: LegacyMazeSnapshot,
  x: number,
  y: number
): LegacyPoint[] => {
  const maxX = maze.width - 1;
  const maxY = maze.height - 1;
  return [
    { x: x - 1 < 0 ? maxX : x - 1, y },
    { x: x + 1 > maxX ? 0 : x + 1, y },
    { x, y: y - 1 < 0 ? maxY : y - 1 },
    { x, y: y + 1 > maxY ? 0 : y + 1 }
  ].filter((point) => isLegacyProgressionWalkable(maze, point.x, point.y));
};

const distanceToLegacyGoal = (maze: LegacyMazeSnapshot, point: LegacyPoint): number => {
  const dx = Math.min(
    Math.abs(point.x - maze.goal.x),
    maze.width - Math.abs(point.x - maze.goal.x)
  );
  const dy = Math.min(
    Math.abs(point.y - maze.goal.y),
    maze.height - Math.abs(point.y - maze.goal.y)
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
  // Reduces to the exact old value when width === height.
  const linearSize = (maze.width + maze.height) / 2;
  const maxGoalDistance = Math.max(1, Math.sqrt(2) * linearSize);

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
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
            distanceToLegacyGoal(maze, neighbor) <= currentDistance + Math.max(2, linearSize * 0.08)
          )).length;
          weightedSplitPressure += 0.5 + ((neighborCount - 2) * 0.28) + (plausibleChoiceCount * 0.22);
        }

        continue;
      }

      const isInterior = x > 0 && y > 0 && x < maze.width - 1 && y < maze.height - 1;
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

const resolveLegacyProgressionLevelBaseTargetComplexity = (level: number): number => clampInteger(
  LEGACY_PROGRESSION_MIN_COMPLEXITY + ((clampInteger(level, 1, 99) - 1) * 4),
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_MAX_COMPLEXITY
);

const resolveLegacyProgressionNextLevelTargetComplexity = (level: number): number => clampInteger(
  LEGACY_PROGRESSION_MIN_COMPLEXITY + (clampInteger(level, 1, 99) * 4),
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_MAX_COMPLEXITY
);

export const resolveLegacyProgressionDifficultyProfile = (
  trackOrTargetComplexity: Pick<LegacyProgressionTrack, 'level' | 'targetComplexity'> | number
): LegacyProgressionDifficultyProfile => {
  const targetComplexity = typeof trackOrTargetComplexity === 'number'
    ? trackOrTargetComplexity
    : trackOrTargetComplexity.targetComplexity;
  const difficultyLevel = resolveLegacyProgressionLevel(targetComplexity);
  // Maze pressure climbs at half the bounded difficulty index. The player/AI
  // completion ordinal is intentionally not read here: it can grow forever,
  // while generation remains bounded and independently paced.
  const normalizedLevel = clampInteger(Math.ceil(difficultyLevel / 2), 1, 99);

  if (normalizedLevel <= 1) {
    return {
      band: 'tutorial',
      branchPressure: 'minimal',
      deadEndPressure: 'minimal',
      expectedEdgeWraps: { horizontal: 0, vertical: 0 },
      fillPressure: 'open',
      label: 'Level 1 / first clear',
      levelRange: { min: 1, max: 1 },
      shortcutPressure: 'off',
      targetScale: 29
    };
  }

  if (normalizedLevel <= 8) {
    // The first several clears are deliberately gentle. A player should be
    // able to feel a new maze arrive after each clear without jumping from the
    // first tutorial board into the full starter pressure profile.
    const starterDepth = clampInteger(normalizedLevel - 2, 0, 6);
    return {
      band: 'starter',
      branchPressure: starterDepth <= 1 ? 'minimal' : 'light',
      deadEndPressure: starterDepth <= 2 ? 'minimal' : 'light',
      expectedEdgeWraps: { horizontal: 0, vertical: starterDepth >= 4 ? 1 : 0 },
      fillPressure: 'open',
      label: 'Starter maze',
      levelRange: { min: 2, max: 8 },
      shortcutPressure: starterDepth <= 2 ? 'off' : starterDepth <= 4 ? 'rare' : 'light',
      targetScale: 29 + Math.min(6, starterDepth + 1)
    };
  }

  if (normalizedLevel <= 18) {
    return {
      band: 'explorer',
      branchPressure: 'moderate',
      deadEndPressure: 'light',
      expectedEdgeWraps: { horizontal: 1, vertical: 1 },
      fillPressure: 'balanced',
      label: 'Explorer maze',
      levelRange: { min: 9, max: 18 },
      shortcutPressure: 'light',
      targetScale: 43
    };
  }

  if (normalizedLevel <= 29) {
    return {
      band: 'navigator',
      branchPressure: 'moderate',
      deadEndPressure: 'moderate',
      expectedEdgeWraps: { horizontal: 1, vertical: 1 },
      fillPressure: 'balanced',
      label: 'Navigator maze',
      levelRange: { min: 19, max: 29 },
      shortcutPressure: 'moderate',
      targetScale: 55
    };
  }

  if (normalizedLevel <= 41) {
    return {
      band: 'architect',
      branchPressure: 'high',
      deadEndPressure: 'high',
      expectedEdgeWraps: { horizontal: 2, vertical: 2 },
      fillPressure: 'dense',
      label: 'Architect maze',
      levelRange: { min: 30, max: 41 },
      shortcutPressure: 'high',
      targetScale: 71
    };
  }

  return {
    band: 'mythic',
    branchPressure: 'extreme',
    deadEndPressure: 'high',
    expectedEdgeWraps: { horizontal: 2, vertical: 2 },
    fillPressure: 'maze-dense',
    label: 'Mythic maze',
    levelRange: { min: 42, max: 99 },
    shortcutPressure: 'extreme',
    targetScale: 96
  };
};

export const resolveLegacyMazeGenerationProfileForProgression = (
  trackOrTargetComplexity: Pick<LegacyProgressionTrack, 'level' | 'targetComplexity'> | number
): LegacyMazeGenerationProfile => {
  const profile = resolveLegacyProgressionDifficultyProfile(trackOrTargetComplexity);
  const targetComplexity = typeof trackOrTargetComplexity === 'number'
    ? trackOrTargetComplexity
    : trackOrTargetComplexity.targetComplexity;
  // Use the same bounded difficulty index as band selection. Never feed the
  // unbounded completion ordinal back into maze geometry.
  const level = clampInteger(
    Math.ceil(resolveLegacyProgressionLevel(targetComplexity) / 2),
    1,
    99
  );

  switch (profile.band) {
    case 'tutorial':
      // The very first maze: a single checkpoint (so there's only ever one
      // leg to walk, no waypoint-to-waypoint zig-zagging), a strong
      // straightness bias on top of that single leg, and zero dead ends --
      // as close to "the longest straightest possible line" as the
      // checkpoint-chasing path builder can produce.
      return {
        borderFeederTargetPerSide: 0,
        checkpointCountMultiplier: 0.42,
        checkpointCountOverride: 1,
        maxDeadEndCount: 0,
        minCheckpoints: 1,
        requiredOppositeBorderConnections: { horizontal: false, vertical: false },
        routeQualityReinforcementMultiplier: 0,
        shortcutCountMultiplier: 0,
        straightnessBias: 0.88
      };
    case 'starter':
      {
        const starterDepth = clampInteger(level - 2, 0, 6);
        // Modifiers are introduced one at a time and ramp in gradually as
        // starterDepth climbs: split paths first (checkpoint count rising
        // off the tutorial's single leg), then dead ends (maxDeadEndCount
        // rising off zero), then multiple routes to the goal
        // (routeQualityReinforcementMultiplier, already present below) and
        // finally bleed-off/wrap paths (borderFeederTargetPerSide /
        // requiredOppositeBorderConnections.vertical, both still gated to
        // starterDepth >= 4 i.e. level 6+, unchanged from before).
        // minCheckpoints must never sit above checkpointCountOverride --
        // normalizeLegacyMazeGenerationProfile clamps the override up to
        // minCheckpoints, so a flat minCheckpoints: 4 floor was silently
        // pushing the intended 2/3 checkpoint counts (starterDepth 0/1)
        // back up to 4, undoing the early part of this exact ramp.
        const checkpointCountOverride = [2, 3, 5, 8][starterDepth] ?? null;
        return {
          borderFeederTargetPerSide: starterDepth >= 4 ? 1 : 0,
          checkpointCountMultiplier: 0.44 + (starterDepth * (0.2 / 6)),
          checkpointCountOverride,
          maxDeadEndCount: [0, 1, 2, 3, 5][starterDepth] ?? null,
          minCheckpoints: Math.min(4, checkpointCountOverride ?? 4),
          requiredOppositeBorderConnections: { horizontal: false, vertical: starterDepth >= 4 },
          routeQualityReinforcementMultiplier: Math.min(0.35, starterDepth * (0.35 / 6)),
          shortcutCountMultiplier: Math.min(0.35, starterDepth * (0.35 / 6)),
          straightnessBias: Math.max(0.1, 0.6 - (starterDepth * 0.08))
        };
      }
    case 'explorer':
      return {
        // Bleed-off density stays low and grows slowly across the higher
        // bands too (1/1/2/2 instead of the old 2/2/3/4) -- per-side
        // feeder counts compound with the always-on mandatory
        // opposite-border connection, so even "2 per side" meant a lot of
        // simultaneous bleed-off points on one maze.
        borderFeederTargetPerSide: 1,
        checkpointCountMultiplier: 0.86,
        checkpointCountOverride: null,
        maxDeadEndCount: null,
        minCheckpoints: 4,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        routeQualityReinforcementMultiplier: 0.7,
        shortcutCountMultiplier: 0.62,
        straightnessBias: 0
      };
    case 'navigator':
      return {
        borderFeederTargetPerSide: 1,
        checkpointCountMultiplier: 1,
        checkpointCountOverride: null,
        maxDeadEndCount: null,
        minCheckpoints: 4,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        routeQualityReinforcementMultiplier: 1,
        shortcutCountMultiplier: 1,
        straightnessBias: 0
      };
    case 'architect':
      return {
        borderFeederTargetPerSide: 2,
        checkpointCountMultiplier: 1.16,
        checkpointCountOverride: null,
        maxDeadEndCount: null,
        minCheckpoints: 4,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        routeQualityReinforcementMultiplier: 1.22,
        shortcutCountMultiplier: 1.28,
        straightnessBias: 0
      };
    case 'mythic':
      return {
        borderFeederTargetPerSide: 2,
        checkpointCountMultiplier: 1.32,
        checkpointCountOverride: null,
        maxDeadEndCount: null,
        minCheckpoints: 4,
        requiredOppositeBorderConnections: { horizontal: true, vertical: true },
        routeQualityReinforcementMultiplier: 1.45,
        shortcutCountMultiplier: 1.58,
        straightnessBias: 0
      };
    default:
      return profile.band satisfies never;
  }
};

const resolveLegacyProgressionColorTier = (targetComplexity: number): number => (
  clampInteger(
    Math.floor((resolveLegacyProgressionLevel(targetComplexity) - 1) / 5),
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
    completedCycles: '0',
    lastCompletedAt: null,
    lastCompletionTimeMs: null,
    lastMazeSeed: null,
    lastReceiptId: null,
    lastSignal: 'hold',
    level: String(resolveLegacyProgressionLevel(normalizedTarget)),
    paceScore: 0,
    peakComplexity: normalizedTarget,
    rank: resolveLegacyProgressionRank(normalizedTarget),
    recentSignals: [],
    struggleCycles: 0,
    targetComplexity: normalizedTarget
  };
};

const createPlayerBaselineTrack = (): LegacyProgressionTrack => ({
  ...createTrack(LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY),
  struggleCycles: LEGACY_PROGRESSION_PLAYER_BASELINE_V5_PROVENANCE_STRUGGLE_CYCLES
});

const formatLegacyProgressionCycleCount = (completedCycles: LegacyProgressionOrdinal): string => {
  const normalized = normalizeLegacyProgressionOrdinal(completedCycles);
  return compareLegacyProgressionOrdinals(normalized, '99999') > 0 ? '99999+' : normalized;
};

export const createEmptyLegacyProgressionState = (): LegacyProgressionState => ({
  version: 1,
  aiRunnerBaselineVersion: LEGACY_PROGRESSION_AI_BASELINE_VERSION,
  playerProgressionBaselineVersion: LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION,
  updatedAt: null,
  tracks: {
    player: createPlayerBaselineTrack(),
    'ai-runner': createTrack(LEGACY_PROGRESSION_AI_BASE_TARGET_COMPLEXITY)
  }
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)))
    : fallback
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
    completedCycles: normalizeLegacyProgressionOrdinal(value.completedCycles, fallback.completedCycles),
    lastCompletedAt: typeof value.lastCompletedAt === 'string' ? value.lastCompletedAt : fallback.lastCompletedAt,
    lastCompletionTimeMs: normalizeNullableNonNegativeInteger(value.lastCompletionTimeMs, fallback.lastCompletionTimeMs),
    lastMazeSeed: typeof value.lastMazeSeed === 'number' && Number.isFinite(value.lastMazeSeed)
      ? Math.max(0, Math.round(value.lastMazeSeed))
      : fallback.lastMazeSeed,
    lastReceiptId: typeof value.lastReceiptId === 'string' && value.lastReceiptId.length > 0
      ? value.lastReceiptId
      : fallback.lastReceiptId,
    lastSignal: normalizeSignal(value.lastSignal),
    // `level` is the player-facing completion ordinal. Old states that do
    // not carry it fall back to their bounded difficulty-derived value, but
    // a present positive integer is never recomputed from difficulty.
    level: normalizeLegacyPositiveProgressionOrdinal(value.level, String(resolveLegacyProgressionLevel(targetComplexity))),
    paceScore: clampInteger(normalizeNonNegativeInteger(value.paceScore, fallback.paceScore), 0, 100),
    peakComplexity,
    rank: resolveLegacyProgressionRank(targetComplexity),
    recentSignals: normalizeSignalWindow(value.recentSignals, fallback.recentSignals),
    struggleCycles: normalizeNonNegativeInteger(value.struggleCycles, fallback.struggleCycles),
    targetComplexity
  };
};

const rebaseLegacyPlayerProgressionBaseline = (): LegacyProgressionTrack => {
  // Historical completion counts are lifetime history, not evidence of an
  // earned visible difficulty level. Reusing them can put a player straight
  // into late-game generation and hazards. Start the player lane from the
  // gentle, complete Level 1 state instead; every new player clear then
  // advances exactly one level through the current contract.
  return createPlayerBaselineTrack();
};

const hasLegacyPlayerBaselineV5Provenance = (track: LegacyProgressionTrack): boolean => (
  track.struggleCycles >= LEGACY_PROGRESSION_PLAYER_BASELINE_V5_PROVENANCE_STRUGGLE_CYCLES
);

// The maximum targetComplexity a player track could possibly have legitimately
// earned in this many completed cycles -- every completion now gains a flat
// +4/cycle, but this is deliberately an UPPER BOUND rather than an exact-match
// simulation of that formula. A previous version of the game tapered the
// per-cycle gain down at higher levels; real accounts that earned their
// progress under that taper have a targetComplexity BELOW what a flat +4/cycle
// run of the same length would reach (taper only ever gives <=4/cycle), so
// they still satisfy this bound and read as coherent. An exact-match check
// against whichever formula happens to be live today would instead treat
// every account that leveled up before this formula last changed as
// "impossible" and wipe it back to level 1 the next time it's read or
// written -- see hasCoherentLegacyPlayerProgression below.
const resolveLegacyPlayerMaxTargetComplexityForCompletedCycles = (
  completedCycles: LegacyProgressionOrdinal
): number => {
  const cyclesToMaximum = Math.ceil(
    (LEGACY_PROGRESSION_MAX_COMPLEXITY - LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY)
    / LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP
  );
  if (compareLegacyProgressionOrdinals(completedCycles, String(cyclesToMaximum)) >= 0) {
    return LEGACY_PROGRESSION_MAX_COMPLEXITY;
  }
  const boundedCycles = resolveLegacyProgressionOrdinalModulo(completedCycles, cyclesToMaximum + 1);
  return clampInteger(
    LEGACY_PROGRESSION_PLAYER_BASE_TARGET_COMPLEXITY
    + (boundedCycles * LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP),
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );
};

const hasCoherentLegacyPlayerProgression = (track: LegacyProgressionTrack): boolean => (
  track.targetComplexity <= resolveLegacyPlayerMaxTargetComplexityForCompletedCycles(track.completedCycles)
  && compareLegacyProgressionOrdinals(
    track.level,
    incrementLegacyProgressionOrdinal(track.completedCycles)
  ) <= 0
);

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
  const normalizedPlayer = normalizeTrack(tracks.player, fallback.tracks.player);
  const shouldRebaseLegacyPlayerProgression = (
    !hasLegacyPlayerBaselineV5Provenance(normalizedPlayer)
    || !hasCoherentLegacyPlayerProgression(normalizedPlayer)
  );
  return {
    version: 1,
    aiRunnerBaselineVersion: LEGACY_PROGRESSION_AI_BASELINE_VERSION,
    playerProgressionBaselineVersion: LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    tracks: {
      player: shouldRebaseLegacyPlayerProgression
        ? rebaseLegacyPlayerProgressionBaseline()
        : normalizedPlayer,
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
      const parsedTracks = isRecord(parsed) && isRecord(parsed.tracks) ? parsed.tracks : null;
      const parsedPlayer = parsedTracks && isRecord(parsedTracks.player) ? parsedTracks.player : null;
      const parsedAiRunner = parsedTracks && isRecord(parsedTracks['ai-runner']) ? parsedTracks['ai-runner'] : null;
      const ordinalsAreCanonical = parsedPlayer !== null
        && parsedAiRunner !== null
        && isCanonicalLegacyProgressionOrdinal(parsedPlayer.completedCycles)
        && isCanonicalLegacyProgressionOrdinal(parsedPlayer.level)
        && isCanonicalLegacyProgressionOrdinal(parsedAiRunner.completedCycles)
        && isCanonicalLegacyProgressionOrdinal(parsedAiRunner.level);
      if (
        !isRecord(parsed)
        || normalizeNonNegativeInteger(parsed.aiRunnerBaselineVersion) < LEGACY_PROGRESSION_AI_BASELINE_VERSION
        || normalizeNonNegativeInteger(parsed.playerProgressionBaselineVersion) < LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION
        || !ordinalsAreCanonical
      ) {
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
  const floorRatio = walkableTiles / Math.max(1, maze.width * maze.height);
  const topology = resolveLegacyProgressionTopologyMetrics(maze);
  const edgeWrapMetrics = resolveLegacyProgressionWrappedContinuityMetrics(maze);
  const edgeWrapCount = edgeWrapMetrics.count;
  // Reduces to the exact old value when width === height.
  const linearSize = (maze.width + maze.height) / 2;
  const sizeScore = linearSize * 0.52;
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
  const edgeWrapChoiceScore = Math.min(10, edgeWrapMetrics.choicePressure * 0.65);
  const edgeWrapShortcutReliefScore = edgeWrapCount > 0
    ? Math.min(12, Math.max(0, ((linearSize * 0.72) - maze.solutionPath.length) * edgeWrapCount * 0.22))
    : 0;
  const edgeWrapReliefScore = edgeWrapShortcutReliefScore;
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
    + edgeWrapChoiceScore
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
    edgeWrapChoiceScore: roundNumber(edgeWrapChoiceScore),
    edgeWrapCount,
    edgeWrapReliefScore: roundNumber(edgeWrapReliefScore),
    edgeWrapScore: roundNumber(edgeWrapScore),
    edgeWrapShortcutReliefScore: roundNumber(edgeWrapShortcutReliefScore),
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
): number => resolveMazeCycleExpectedCompletionMs(receipt, complexity);

export const resolveLegacyProgressionPaceScore = (
  receipt: Pick<MazeCycleTelemetryReceipt, 'completionTimeMs' | 'playerPathLength' | 'surface'>,
  complexity: number
): number => scoreMazeCyclePace(receipt, complexity);

const scoreLegacyProgressionReceipt = (
  receipt: Pick<
    MazeCycleTelemetryReceipt,
    | 'aiDecisionSummary'
    | 'averageFrameMs'
    | 'backtracks'
    | 'completionTimeMs'
    | 'playerPathLength'
    | 'resetUsed'
    | 'shortestViablePathLength'
    | 'surface'
    | 'wrongTurns'
  >,
  complexity: number
): LegacyProgressionPerformanceScore => {
  const score = scoreMazeCycleRunQuality({
    aiDecisionSummary: receipt.aiDecisionSummary,
    averageFrameMs: receipt.averageFrameMs,
    backtracks: receipt.backtracks,
    completionTimeMs: receipt.completionTimeMs,
    complexity,
    playerPathLength: receipt.playerPathLength,
    resetUsed: receipt.resetUsed,
    shortestViablePathLength: receipt.shortestViablePathLength,
    surface: receipt.surface,
    wrongTurns: receipt.wrongTurns
  });
  if (!score) {
    throw new Error('maze_cycle_run_quality_input_incomplete');
  }
  return {
    backtrackScore: score.backtrackScore,
    resetScore: score.resetScore,
    routeEfficiencyScore: score.routeEfficiencyScore,
    signal: score.signal,
    stabilityScore: score.stabilityScore,
    timeScore: score.timeScore,
    total: score.total,
    wrongTurnScore: score.wrongTurnScore
  };
};

export const resolveLegacyProgressionPerformanceScore = (
  receipt: Pick<
    MazeCycleTelemetryReceipt,
    | 'aiDecisionSummary'
    | 'averageFrameMs'
    | 'backtracks'
    | 'completionTimeMs'
    | 'playerPathLength'
    | 'resetUsed'
    | 'shortestViablePathLength'
    | 'surface'
    | 'wrongTurns'
  >,
  complexity: number
): LegacyProgressionPerformanceScore => scoreLegacyProgressionReceipt(receipt, complexity);

const resolveProgressionSignal = (
  receipt: MazeCycleTelemetryReceipt,
  complexity: number
): LegacyProgressionSignal => {
  if (receipt.surface === 'play') {
    // A player completion is the visible advancement contract. Quality data is
    // still stored for diagnostics, but it cannot hide a completed maze behind
    // an opaque score or route-perfectness threshold.
    return 'challenge';
  }
  const signal = resolveLegacyProgressionPerformanceScoreForReceipt(receipt, complexity).signal;
  return signal;
};

export const resolveLegacyProgressionPerformanceScoreForReceipt = (
  receipt: MazeCycleTelemetryReceipt,
  complexity: number
): LegacyProgressionPerformanceScore => scoreLegacyProgressionReceipt(receipt, complexity);

const resolveLegacyProgressionTargetAdjustment = (): number => (
  LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP
);

const resolveLegacyProgressionPacedTarget = (
  track: LegacyProgressionTrack
): number => clampInteger(
  track.targetComplexity + resolveLegacyProgressionTargetAdjustment(),
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_MAX_COMPLEXITY
);

const applyTrackSignal = (
  track: LegacyProgressionTrack,
  receipt: MazeCycleTelemetryReceipt,
  complexity: number,
  signal: LegacyProgressionSignal
): LegacyProgressionTrack => {
  const targetComplexity = resolveLegacyProgressionPacedTarget(track);
  const recentSignals = appendLegacyProgressionSignal(track, signal);
  const lastCompletionTimeMs = Math.max(0, Math.round(receipt.completionTimeMs));
  const previousBest = track.bestCompletionTimeMs;
  const bestCompletionTimeMs = lastCompletionTimeMs > 0
    ? previousBest === null
      ? lastCompletionTimeMs
      : Math.min(previousBest, lastCompletionTimeMs)
    : previousBest;
  const performanceScore = resolveLegacyProgressionPerformanceScoreForReceipt(receipt, complexity);

  return {
    bestCompletionTimeMs,
    cleanCycles: track.cleanCycles + (signal === 'challenge' ? 1 : 0),
    colorTier: resolveLegacyProgressionColorTier(targetComplexity),
    completedCycles: incrementLegacyProgressionOrdinal(track.completedCycles),
    lastCompletedAt: receipt.completedAt,
    lastCompletionTimeMs,
    lastMazeSeed: receipt.mazeSeed,
    lastReceiptId: receipt.id,
    lastSignal: signal,
    level: incrementLegacyProgressionOrdinal(track.level),
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
  measuredMazeComplexity: number,
  _trackId: LegacyProgressionTrackId = 'ai-runner'
): LegacyProgressionPacingSummary => {
  const signalWindow = normalizeSignalWindow(track.recentSignals);
  const recentChallengeCount = countSignals(signalWindow, 'challenge');
  const recentEaseCount = countSignals(signalWindow, 'ease');
  const difficultyLevel = resolveLegacyProgressionLevel(track.targetComplexity);
  const levelBaseTargetComplexity = resolveLegacyProgressionLevelBaseTargetComplexity(difficultyLevel);
  const nextLevelTargetComplexity = resolveLegacyProgressionNextLevelTargetComplexity(difficultyLevel);
  const levelRange = Math.max(1, nextLevelTargetComplexity - levelBaseTargetComplexity);
  const complexityUntilNextLevel = Math.max(0, nextLevelTargetComplexity - track.targetComplexity);
  const skillTrend = recentChallengeCount > recentEaseCount
    ? 'rising'
    : recentEaseCount > recentChallengeCount
      ? 'falling'
      : signalWindow.length > 0
        ? 'mixed'
        : 'steady';

  return {
    activeLevel: track.level,
    activeRank: track.rank,
    activeTargetComplexity: track.targetComplexity,
    challengeStep: resolveLegacyProgressionTargetAdjustment(),
    complexityUntilNextLevel,
    easeStep: resolveLegacyProgressionTargetAdjustment(),
    lastCompletionTimeMs: track.lastCompletionTimeMs,
    levelBaseTargetComplexity,
    levelProgressPercent: clampInteger(
      ((track.targetComplexity - levelBaseTargetComplexity) / levelRange) * 100,
      0,
      100
    ),
    measuredMazeComplexity,
    measuredMazeLevel: resolveLegacyProgressionLevel(measuredMazeComplexity),
    measuredMazeRank: resolveLegacyProgressionRank(measuredMazeComplexity),
    nextChallengeTargetComplexity: resolveLegacyProgressionPacedTarget(track),
    nextEaseTargetComplexity: resolveLegacyProgressionPacedTarget(track),
    nextLevelTargetComplexity,
    paceScore: track.paceScore,
    recentChallengeCount,
    recentEaseCount,
    skillTrend,
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
  if (normalized.tracks[trackId].lastReceiptId === receipt.id) {
    return writeLegacyProgressionState(storage, normalized);
  }
  const complexity = resolveLegacyMazeComplexity(maze ?? {
    source: receipt.surface === 'play' ? 'play-generated' : 'menu-generated',
    // Telemetry only carries one representative size figure (see
    // mazeCycleTelemetry.ts); square is the best available approximation
    // when reconstructing a maze-shaped object for this fallback path.
    width: receipt.mazeSize,
    height: receipt.mazeSize,
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
    playerProgressionBaselineVersion: normalized.playerProgressionBaselineVersion,
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
  const profile = resolveLegacyProgressionDifficultyProfile(track);
  const difficultyLevel = resolveLegacyProgressionLevel(track.targetComplexity);
  const progressionScale = profile.targetScale + Math.min(8, Math.max(0, track.targetComplexity - resolveLegacyProgressionLevelBaseTargetComplexity(difficultyLevel)) * 0.8);
  const blendedScale = (baseScale * 0.28) + (progressionScale * 0.72);
  const progressionMaxScale = Math.min(96, baseScale + 28);
  const viewportMaxScale = resolveLegacyProgressionViewportScaleCap({
    ...options,
    boardScale: baseScale
  });
  const maxScale = Math.max(25, Math.min(progressionMaxScale, viewportMaxScale));
  const minScale = Math.min(25, maxScale);
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

  // Real device geometry the actual render will use -- without this, every
  // call below simulates zero safe-area inset and no floating touch
  // controls, always more generous than reality, so the cap this search
  // returns (and the cell count it allows through) came out sized for a
  // bigger box than genuinely exists on any device with a nonzero bottom
  // inset. See LegacyProgressionViewport's own comment.
  const layoutOptions = {
    safeArea: viewport.safeArea,
    useFloatingTouchControls: viewport.useFloatingTouchControls
  };

  // Probe with the same width:height aspect ratio the real generation call
  // will request for this viewport (see resolveLegacyMenuBoardAspectRatio),
  // instead of a square candidate grid -- so the cap search reflects the
  // actual rectangular board that gets built, not a square stand-in for it.
  const aspectRatio = resolveLegacyMenuBoardAspectRatio(viewport.width, viewport.height, boardScale, layoutSurface, layoutOptions);
  const ratioRoot = Math.sqrt(aspectRatio);

  for (let candidateScale = 96; candidateScale >= 25; candidateScale -= 1) {
    const candidateWidth = Math.max(1, Math.round(candidateScale * ratioRoot));
    const candidateHeight = Math.max(1, Math.round(candidateScale / ratioRoot));
    const layout = resolveLegacyMenuLayout(
      viewport.width,
      viewport.height,
      boardScale,
      candidateWidth,
      candidateHeight,
      layoutSurface,
      layoutOptions
    );
    const boardSizeForInset = Math.min(layout.boardWidth, layout.boardHeight);
    const safeInset = clampInteger(
      Math.round(boardSizeForInset * LEGACY_PROGRESSION_RENDER_SAFE_INSET_RATIO),
      LEGACY_PROGRESSION_RENDER_SAFE_INSET_MIN,
      LEGACY_PROGRESSION_RENDER_SAFE_INSET_MAX
    );
    const renderWidth = Math.max(1, layout.boardWidth - (safeInset * 2));
    const renderHeight = Math.max(1, layout.boardHeight - (safeInset * 2));
    const tileSize = Math.min(renderWidth / candidateWidth, renderHeight / candidateHeight);

    if (tileSize >= minimumTileSize) {
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
  const difficultyProfile = resolveLegacyProgressionDifficultyProfile(activeTrack);
  const targetComplexity = clampInteger(
    activeTrack.targetComplexity,
    LEGACY_PROGRESSION_MIN_COMPLEXITY,
    LEGACY_PROGRESSION_MAX_COMPLEXITY
  );
  const difference = complexity.total - targetComplexity;
  const tolerance = 8;
  const delivery = difference < -tolerance
    ? 'under-target'
    : difference > tolerance
      ? 'over-target'
      : 'on-target';
  return {
    activeTrackId,
    complexity,
    difficultyProfile,
    generationReview: {
      delivery,
      difference,
      measuredComplexity: complexity.total,
      profileBand: difficultyProfile.band,
      targetComplexity,
      tolerance
    },
    palette: resolveLegacyProgressionPalette(activeTrack, activeTrackId),
    pacing: summarizeLegacyProgressionPacing(activeTrack, complexity.total, activeTrackId),
    storageKey,
    tracks: {
      player: copyTrack(normalized.tracks.player),
      'ai-runner': copyTrack(normalized.tracks['ai-runner'])
    }
  };
};
