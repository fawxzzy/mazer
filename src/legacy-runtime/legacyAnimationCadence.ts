import { resolveLegacyWalkableGridNeighbors, type LegacyPoint } from './legacyMaze';

export const LEGACY_ANIMATION_CADENCE_VERSION = 'legacy-animation-cadence-v2' as const;
export const LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS = 8000;
export const LEGACY_TRAIL_SHINE_CYCLE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS * 2;
export const LEGACY_TRAIL_PULSE_SWEEP_PERIOD_MS = 2600;
export const LEGACY_MAZE_REVEAL_STRATEGY_VERSION = 'flood-fill-bfs-v1' as const;

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
  width: number;
  height: number;
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

export interface LegacyTrailPulseSweepMotion {
  cadenceVersion: typeof LEGACY_ANIMATION_CADENCE_VERSION;
  centerIndex: number;
  periodMs: number;
  progress: number;
}

// Single-direction pulse: always sweeps from the player's tile (the trail's
// last index) back to the start tile (index 0), then loops -- no ping-pong,
// unlike resolveLegacyTrailShineMotion above.
export const resolveLegacyTrailPulseSweepMotion = ({
  timeMs,
  trailLength,
  periodMs = LEGACY_TRAIL_PULSE_SWEEP_PERIOD_MS
}: {
  timeMs: number;
  trailLength: number;
  periodMs?: number;
}): LegacyTrailPulseSweepMotion => {
  const safePeriodMs = Math.max(1, periodMs);
  const elapsedMs = normalizeElapsed(timeMs, safePeriodMs);
  const progress = clamp01(elapsedMs / safePeriodMs);
  const maxTrailIndex = Math.max(0, Math.floor(trailLength) - 1);

  return {
    cadenceVersion: LEGACY_ANIMATION_CADENCE_VERSION,
    centerIndex: maxTrailIndex * (1 - progress),
    periodMs: safePeriodMs,
    progress
  };
};

// Floods outward from the start tile through the maze's own real
// connectivity (a plain grid BFS, reusing the same wrap-aware neighbor
// resolver the solver itself uses) instead of the old
// generationBuildTrace-ordered-then-row-scanned approach. The trace order
// reflected internal carving order, not spatial adjacency, so tiles from
// opposite corners of the board could land next to each other in the
// reveal sequence -- a "confetti" scatter that only looked like a single
// coherent maze once the later full-grid row scan finally caught up and
// visibly flooded the remaining rows all at once. BFS guarantees a tile
// only reveals once something already-revealed is physically adjacent to
// it, so every corridor -- side branch or main route alike -- grows
// continuously from its own branch point outward, the way water actually
// spreads through a maze. It also satisfies "don't show the solution
// first" for free: a BFS frontier reveals every tile at a given graph
// distance together, so a side branch at the same depth as the solution's
// next step reveals in the same wave as that step, not after it.
export const buildLegacyMazeRevealOrder = (maze: LegacyRevealMaze): LegacyPoint[] => {
  const grid = maze.grid as boolean[][];
  const orderedTiles: LegacyPoint[] = [];
  const seen = new Set<string>();
  const enqueue = (point: LegacyPoint): boolean => {
    if (grid[point.y]?.[point.x] !== true) {
      return false;
    }
    const key = pointKey(point);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    orderedTiles.push(copyPoint(point));
    return true;
  };

  const seedPoint = maze.generationBuildTrace?.start ?? maze.start;
  let frontier: LegacyPoint[] = [];
  if (enqueue(seedPoint)) {
    frontier = [seedPoint];
  } else {
    // Defensive only: a real maze's own start is always walkable. If it
    // somehow isn't, seed the flood from the first walkable tile found
    // instead of producing an empty order.
    outer: for (let y = 0; y < maze.height; y += 1) {
      for (let x = 0; x < maze.width; x += 1) {
        const point = { x, y };
        if (enqueue(point)) {
          frontier = [point];
          break outer;
        }
      }
    }
  }

  while (frontier.length > 0) {
    const nextFrontier: LegacyPoint[] = [];
    for (const point of frontier) {
      for (const neighbor of resolveLegacyWalkableGridNeighbors(grid, point)) {
        if (enqueue(neighbor)) {
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
  }

  // Defensive only: every generated play/menu maze is normalized to one
  // connected floor component elsewhere, so BFS from a walkable start
  // should already reach every floor tile. Kept as a fallback so an
  // unreachable stray tile is still appended rather than silently missing
  // from the order the draw loop iterates.
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      enqueue({ x, y });
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
