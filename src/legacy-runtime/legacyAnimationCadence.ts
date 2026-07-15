import type { LegacyPoint } from './legacyMaze';

export const LEGACY_ANIMATION_CADENCE_VERSION = 'legacy-animation-cadence-v1' as const;
export const LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS = 2600;
export const LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS * 2;
export const LEGACY_MAZE_REVEAL_STRATEGY_VERSION = 'interleaved-non-solution-v1' as const;
export const LEGACY_MAZE_REVEAL_NON_SOLUTION_BURST = 2;

export type LegacyTrailShineDirection = 'away-from-player' | 'toward-player';

export interface LegacyTrailShineMotion {
  cadenceVersion: typeof LEGACY_ANIMATION_CADENCE_VERSION;
  centerIndex: number;
  cyclePeriodMs: number;
  cycleProgress: number;
  direction: LegacyTrailShineDirection;
  distanceProgress: number;
  oneWayPeriodMs: number;
  speedTilesPerSecond: number;
}

export interface LegacyMazeRevealDiagnostics {
  nonSolutionTileCountBeforeSolutionComplete: number;
  solutionCompletedAtIndex: number | null;
  solutionFirstRevealPrevented: boolean;
  solutionPrefixLength: number;
  strategyVersion: typeof LEGACY_MAZE_REVEAL_STRATEGY_VERSION;
  tileCount: number;
}

interface LegacyRevealMaze {
  generationBuildTrace?: {
    finalGoal?: LegacyPoint;
    pathTiles?: readonly LegacyPoint[];
    reinforcementShortcutTiles?: readonly LegacyPoint[];
    shortcutTiles?: readonly LegacyPoint[];
    start?: LegacyPoint;
  } | null;
  grid: readonly (readonly boolean[])[];
  size: number;
  solutionPath: readonly LegacyPoint[];
  start: LegacyPoint;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeElapsed = (timeMs: number, periodMs: number): number => {
  if (!Number.isFinite(timeMs) || periodMs <= 0) {
    return 0;
  }
  return ((timeMs % periodMs) + periodMs) % periodMs;
};

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

export const resolveLegacyTrailShineMotion = ({
  timeMs,
  trailLength,
  oneWayPeriodMs = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS
}: {
  timeMs: number;
  trailLength: number;
  oneWayPeriodMs?: number;
}): LegacyTrailShineMotion => {
  const safeOneWayPeriodMs = Math.max(1, oneWayPeriodMs);
  const cyclePeriodMs = safeOneWayPeriodMs * 2;
  const elapsedMs = normalizeElapsed(timeMs, cyclePeriodMs);
  const direction: LegacyTrailShineDirection = elapsedMs <= safeOneWayPeriodMs
    ? 'away-from-player'
    : 'toward-player';
  const legProgress = direction === 'away-from-player'
    ? elapsedMs / safeOneWayPeriodMs
    : (elapsedMs - safeOneWayPeriodMs) / safeOneWayPeriodMs;
  const distanceProgress = direction === 'away-from-player'
    ? clamp01(legProgress)
    : clamp01(1 - legProgress);
  const maxTrailIndex = Math.max(0, Math.floor(trailLength) - 1);

  return {
    cadenceVersion: LEGACY_ANIMATION_CADENCE_VERSION,
    centerIndex: maxTrailIndex * (1 - distanceProgress),
    cyclePeriodMs,
    cycleProgress: elapsedMs / cyclePeriodMs,
    direction,
    distanceProgress,
    oneWayPeriodMs: safeOneWayPeriodMs,
    speedTilesPerSecond: maxTrailIndex / (safeOneWayPeriodMs / 1000)
  };
};

export const buildLegacyMazeRevealOrder = (maze: LegacyRevealMaze): LegacyPoint[] => {
  const orderedTiles: LegacyPoint[] = [];
  const seen = new Set<string>();
  const solutionKeys = new Set(maze.solutionPath.map(pointKey));
  const appendTile = (target: LegacyPoint[], point: LegacyPoint | undefined): void => {
    if (!point || maze.grid[point.y]?.[point.x] !== true) {
      return;
    }
    const key = pointKey(point);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push(copyPoint(point));
  };

  appendTile(orderedTiles, maze.generationBuildTrace?.start ?? maze.start);

  const nonSolutionTiles: LegacyPoint[] = [];
  const solutionTiles: LegacyPoint[] = [];
  const candidateSeen = new Set(seen);
  const appendCandidate = (target: LegacyPoint[], point: LegacyPoint | undefined): void => {
    if (!point || maze.grid[point.y]?.[point.x] !== true) {
      return;
    }
    const key = pointKey(point);
    if (candidateSeen.has(key)) {
      return;
    }
    candidateSeen.add(key);
    target.push(copyPoint(point));
  };

  for (const point of maze.generationBuildTrace?.pathTiles ?? []) {
    if (!solutionKeys.has(pointKey(point))) {
      appendCandidate(nonSolutionTiles, point);
    }
  }
  for (const point of maze.generationBuildTrace?.shortcutTiles ?? []) {
    if (!solutionKeys.has(pointKey(point))) {
      appendCandidate(nonSolutionTiles, point);
    }
  }
  for (const point of maze.generationBuildTrace?.reinforcementShortcutTiles ?? []) {
    if (!solutionKeys.has(pointKey(point))) {
      appendCandidate(nonSolutionTiles, point);
    }
  }
  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
      const point = { x, y };
      if (maze.grid[y]?.[x] === true && !solutionKeys.has(pointKey(point))) {
        appendCandidate(nonSolutionTiles, point);
      }
    }
  }
  for (const point of maze.solutionPath) {
    appendCandidate(solutionTiles, point);
  }

  let nonSolutionIndex = 0;
  let solutionIndex = 0;
  while (nonSolutionIndex < nonSolutionTiles.length || solutionIndex < solutionTiles.length) {
    for (
      let burstIndex = 0;
      burstIndex < LEGACY_MAZE_REVEAL_NON_SOLUTION_BURST && nonSolutionIndex < nonSolutionTiles.length;
      burstIndex += 1
    ) {
      appendTile(orderedTiles, nonSolutionTiles[nonSolutionIndex]);
      nonSolutionIndex += 1;
    }
    if (solutionIndex < solutionTiles.length) {
      appendTile(orderedTiles, solutionTiles[solutionIndex]);
      solutionIndex += 1;
    }
  }

  return orderedTiles;
};

export const summarizeLegacyMazeRevealOrder = (
  order: readonly LegacyPoint[],
  solutionPath: readonly LegacyPoint[]
): LegacyMazeRevealDiagnostics => {
  const solutionKeys = new Set(solutionPath.map(pointKey));
  const solutionIndices = order
    .map((point, index) => solutionKeys.has(pointKey(point)) ? index : -1)
    .filter((index) => index >= 0);
  const solutionCompletedAtIndex = solutionIndices.length > 0 ? Math.max(...solutionIndices) : null;
  let solutionPrefixLength = 0;
  for (const point of order) {
    if (!solutionKeys.has(pointKey(point))) {
      break;
    }
    solutionPrefixLength += 1;
  }
  const nonSolutionTileCountBeforeSolutionComplete = solutionCompletedAtIndex === null
    ? 0
    : order.slice(0, solutionCompletedAtIndex + 1)
      .filter((point) => !solutionKeys.has(pointKey(point))).length;

  return {
    nonSolutionTileCountBeforeSolutionComplete,
    solutionCompletedAtIndex,
    solutionFirstRevealPrevented: solutionPath.length <= 1
      || (
        nonSolutionTileCountBeforeSolutionComplete > 0
        && solutionPrefixLength < solutionPath.length
      ),
    solutionPrefixLength,
    strategyVersion: LEGACY_MAZE_REVEAL_STRATEGY_VERSION,
    tileCount: order.length
  };
};
