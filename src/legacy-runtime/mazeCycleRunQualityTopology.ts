import {
  resolveLegacyWalkableGridNeighbors,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import {
  MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
  MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION
} from './mazeCycleRunQualityScorer.mjs';

export {
  MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD,
  MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION
} from './mazeCycleRunQualityScorer.mjs';

export interface MazeCycleRunQualityTopologyMetrics {
  acceptedSteps: number;
  cleanRun: boolean;
  completed: boolean;
  coverageRatio: number | null;
  explorationRatio: number | null;
  exploredOptionalTileCount: number | null;
  explorer: boolean;
  graphPolicy: 'playable-wrap-aware';
  metricsVersion: string;
  offShortestCorridorUniqueTileCount: number | null;
  optimalSteps: number | null;
  optionalWalkableTileCount: number | null;
  playerPathTruncated: boolean;
  revisitSteps: number | null;
  shortestCorridorFidelityRatio: number | null;
  shortestCorridorUnionTileCount: number | null;
  sourcePathComplete: boolean;
  undefinedReasonCodes: string[];
  uniqueVisitedTileCount: number | null;
  walkableTileCount: number;
}

export interface MazeCycleRunQualityTopologyInput {
  backtracks: number;
  completed: boolean;
  maze: LegacyMazeSnapshot;
  playerPath: readonly LegacyPoint[];
  playerPathLength: number;
  playerPathTruncated: boolean;
  resetUsed: boolean;
  sourcePathComplete: boolean;
  wrongTurns: number;
}

const keyForPoint = (point: LegacyPoint): string => `${Math.round(point.x)},${Math.round(point.y)}`;
const roundRatio = (value: number): number => Math.round(value * 1000) / 1000;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const readNullableNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const buildDistanceMap = (grid: boolean[][], origin: LegacyPoint): Map<string, number> => {
  const distances = new Map<string, number>();
  const queue: LegacyPoint[] = [];
  if (grid[origin.y]?.[origin.x] !== true) return distances;
  distances.set(keyForPoint(origin), 0);
  queue.push(origin);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const distance = distances.get(keyForPoint(current)) ?? 0;
    for (const neighbor of resolveLegacyWalkableGridNeighbors(grid, current)) {
      const key = keyForPoint(neighbor);
      if (distances.has(key)) continue;
      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
};

const listWalkablePoints = (grid: boolean[][]): LegacyPoint[] => {
  const points: LegacyPoint[] = [];
  grid.forEach((row, y) => row.forEach((walkable, x) => {
    if (walkable) points.push({ x, y });
  }));
  return points;
};

export const summarizeMazeCycleRunQualityTopology = (
  input: MazeCycleRunQualityTopologyInput
): MazeCycleRunQualityTopologyMetrics => {
  const acceptedSteps = Math.max(0, Math.round(input.playerPathLength) - 1);
  const walkablePoints = listWalkablePoints(input.maze.grid);
  const walkableTileCount = walkablePoints.length;
  const walkableKeys = new Set(walkablePoints.map(keyForPoint));
  const distanceFromStart = buildDistanceMap(input.maze.grid, input.maze.start);
  const distanceFromGoal = buildDistanceMap(input.maze.grid, input.maze.goal);
  const optimalSteps = distanceFromStart.get(keyForPoint(input.maze.goal)) ?? null;
  const corridorKeys = optimalSteps === null
    ? null
    : new Set(walkablePoints
      .filter((point) => {
        const fromStart = distanceFromStart.get(keyForPoint(point));
        const fromGoal = distanceFromGoal.get(keyForPoint(point));
        return fromStart !== undefined && fromGoal !== undefined && fromStart + fromGoal === optimalSteps;
      })
      .map(keyForPoint));
  const undefinedReasonCodes: string[] = [];
  if (!input.sourcePathComplete) undefinedReasonCodes.push('player_path_incomplete');
  if (optimalSteps === null) undefinedReasonCodes.push('playable_shortest_path_missing');
  if (!input.completed) undefinedReasonCodes.push('run_incomplete');

  if (!input.sourcePathComplete || corridorKeys === null) {
    return {
      acceptedSteps,
      cleanRun: false,
      completed: input.completed,
      coverageRatio: null,
      explorationRatio: null,
      exploredOptionalTileCount: null,
      explorer: false,
      graphPolicy: 'playable-wrap-aware',
      metricsVersion: MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
      offShortestCorridorUniqueTileCount: null,
      optimalSteps,
      optionalWalkableTileCount: corridorKeys === null ? null : Math.max(0, walkableTileCount - corridorKeys.size),
      playerPathTruncated: input.playerPathTruncated,
      revisitSteps: null,
      shortestCorridorFidelityRatio: null,
      shortestCorridorUnionTileCount: corridorKeys?.size ?? null,
      sourcePathComplete: input.sourcePathComplete,
      undefinedReasonCodes,
      uniqueVisitedTileCount: null,
      walkableTileCount
    };
  }

  const uniqueVisitedKeys = new Set(input.playerPath.map(keyForPoint).filter((key) => walkableKeys.has(key)));
  const uniqueVisitedTileCount = uniqueVisitedKeys.size;
  const offShortestCorridorUniqueTileCount = [...uniqueVisitedKeys]
    .filter((key) => !corridorKeys.has(key)).length;
  const optionalWalkableTileCount = Math.max(0, walkableTileCount - corridorKeys.size);
  const exploredOptionalTileCount = Math.min(optionalWalkableTileCount, offShortestCorridorUniqueTileCount);
  const explorationRatio = optionalWalkableTileCount > 0
    ? roundRatio(exploredOptionalTileCount / optionalWalkableTileCount)
    : null;
  const coverageRatio = walkableTileCount > 0
    ? roundRatio(uniqueVisitedTileCount / walkableTileCount)
    : null;
  const revisitSteps = Math.max(0, acceptedSteps - Math.max(0, uniqueVisitedTileCount - 1));
  const shortestCorridorFidelityRatio = uniqueVisitedTileCount > 0
    ? roundRatio((uniqueVisitedTileCount - offShortestCorridorUniqueTileCount) / uniqueVisitedTileCount)
    : null;
  const cleanRun = input.completed
    && !input.resetUsed
    && acceptedSteps === optimalSteps
    && offShortestCorridorUniqueTileCount === 0
    && revisitSteps === 0;
  const explorer = input.completed
    && !input.resetUsed
    && explorationRatio !== null
    && explorationRatio >= MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD;

  return {
    acceptedSteps,
    cleanRun,
    completed: input.completed,
    coverageRatio,
    explorationRatio,
    exploredOptionalTileCount,
    explorer,
    graphPolicy: 'playable-wrap-aware',
    metricsVersion: MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
    offShortestCorridorUniqueTileCount,
    optimalSteps,
    optionalWalkableTileCount,
    playerPathTruncated: input.playerPathTruncated,
    revisitSteps,
    shortestCorridorFidelityRatio,
    shortestCorridorUnionTileCount: corridorKeys.size,
    sourcePathComplete: input.sourcePathComplete,
    undefinedReasonCodes,
    uniqueVisitedTileCount,
    walkableTileCount
  };
};

export const normalizeStoredMazeCycleRunQualityTopologyMetrics = (
  value: unknown
): MazeCycleRunQualityTopologyMetrics | null => {
  if (!isRecord(value)) return null;
  if (value.graphPolicy !== 'playable-wrap-aware' || typeof value.metricsVersion !== 'string') return null;
  if (!Array.isArray(value.undefinedReasonCodes)) return null;

  return {
    acceptedSteps: Math.max(0, Math.round(readNullableNumber(value.acceptedSteps) ?? 0)),
    cleanRun: value.cleanRun === true,
    completed: value.completed === true,
    coverageRatio: readNullableNumber(value.coverageRatio),
    explorationRatio: readNullableNumber(value.explorationRatio),
    exploredOptionalTileCount: readNullableNumber(value.exploredOptionalTileCount),
    explorer: value.explorer === true,
    graphPolicy: 'playable-wrap-aware',
    metricsVersion: value.metricsVersion,
    offShortestCorridorUniqueTileCount: readNullableNumber(value.offShortestCorridorUniqueTileCount),
    optimalSteps: readNullableNumber(value.optimalSteps),
    optionalWalkableTileCount: readNullableNumber(value.optionalWalkableTileCount),
    playerPathTruncated: value.playerPathTruncated === true,
    revisitSteps: readNullableNumber(value.revisitSteps),
    shortestCorridorFidelityRatio: readNullableNumber(value.shortestCorridorFidelityRatio),
    shortestCorridorUnionTileCount: readNullableNumber(value.shortestCorridorUnionTileCount),
    sourcePathComplete: value.sourcePathComplete === true,
    undefinedReasonCodes: value.undefinedReasonCodes.filter((entry): entry is string => typeof entry === 'string'),
    uniqueVisitedTileCount: readNullableNumber(value.uniqueVisitedTileCount),
    walkableTileCount: Math.max(0, Math.round(readNullableNumber(value.walkableTileCount) ?? 0))
  };
};
