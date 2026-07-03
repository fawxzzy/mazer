import { clampInteger } from './legacyDefaults';
import { resolveLegacyMenuSnapshotBlueprint } from './legacyMenuSnapshot';
import { legacyTuning } from '../config/tuning';

export interface LegacyPoint {
  x: number;
  y: number;
}

export interface LegacyMazeSnapshot {
  source: 'menu-snapshot' | 'menu-generated' | 'play-generated';
  size: number;
  grid: boolean[][];
  start: LegacyPoint;
  goal: LegacyPoint;
  solutionPath: LegacyPoint[];
  seed: number;
  pathBuilderStats?: {
    acceptedCheckpoints: number;
    backtracks: number;
    deterministicSafetyStart: boolean;
    exhaustedCheckpoints: boolean;
    longestPathLength: number;
    pathTiles: number;
    requestedCheckpoints: number;
    topology: 'legacy-checkpoint-path-builder';
    wallArrayEntries: number;
  };
  playableTopologyStats?: {
    disconnectedComponentsPruned: number;
    disconnectedFloorTilesPruned: number;
    goalRebasedToFarthestReachableFloor: boolean;
    originalGoalDistance: number | null;
    reachableFloors: number;
    resolvedGoalDistance: number;
  };
  routeQualityStats?: {
    bypassableRouteBands: number;
    bypassableSolutionEdges: number;
    meaningfulBypassableRouteBands: number;
    meaningfulBypassableSolutionEdges: number;
    minimumMeaningfulDetour: number;
    routeQuality: 'single-route' | 'multi-route';
    sampledSolutionEdges: number;
  };
  shortcutsCreated?: number;
  shortcutStats?: {
    requested: number;
    attempts: number;
    wallArrayEntries: number;
    uniqueWallCandidates: number;
    created: number;
    exhaustedWallArray: boolean;
    qualityReinforcementAttempts?: number;
    qualityReinforcementCreated?: number;
  };
  generation?: {
    budget: {
      checkpointCount: number;
      checkpointModifier: number;
      scale: number;
      shortcutCount: number;
      shortcutCountModifier: number;
      shortcutStageEnabled: boolean;
    };
    buildKind: 'menu-snapshot' | 'menu-generated' | 'play-generated';
    executionPlan: Array<{
      advancesToStageId: number | null;
      batchSize: number | null;
      batchUnit: 'checkpoint-passes' | 'path-tiles' | 'rows' | 'shortcut-attempts' | null;
      completionSignal:
        | 'grid-spawn-complete'
        | 'checkpoint-budget-exhausted'
        | 'path-array-exhausted'
        | 'shortcut-budget-exhausted'
        | 'draw-iteration-complete'
        | 'player-finalized'
        | 'menu-reset-delay-rearmed'
        | 'play-reset-template-return';
      executionKind: 'checkpoint-pass' | 'finalize-state' | 'full-stage' | 'path-batch' | 'reset-branch' | 'row-slice' | 'shortcut-attempt';
      id: number;
      name: 'CreateGrid' | 'CreatePath' | 'CreateShortCuts' | 'Draw' | 'Finalize' | 'MapPath' | 'Reset';
      skipToStageIdWhenDisabled: number | null;
    }>;
    gate: {
      armsDelayStartOnQueue: boolean;
      consumesWhileInitialized: boolean;
      consumesWhileUninitialized: boolean;
      entryStageId: number;
      initializedResetBypassesDelayGate: boolean;
      levelBuildingDelayDurationMs: number | null;
      levelBuildingDelayDurationSource: 'legacy-variable-unrecovered';
      requiresLevelBuildingDelayStartedFlag: boolean;
      requiresLevelBuildingStartTime: boolean;
      resetsLevelBuildingTimerAfterConsume: boolean;
      waitsForLevelBuildingDelay: boolean;
    };
    processStageIds: number[];
    stageCursor: {
      completionSignal:
        | 'grid-spawn-complete'
        | 'checkpoint-budget-exhausted'
        | 'path-array-exhausted'
        | 'shortcut-budget-exhausted'
        | 'draw-iteration-complete'
        | 'player-finalized'
        | 'menu-reset-delay-rearmed'
        | 'play-reset-template-return';
      currentStageId: number;
      phase: 'queued-entry' | 'consumed-finalized' | 'reset-branch';
      previousStageIds: number[];
      processComplete: boolean;
      remainingStageIds: number[];
    };
  };
}

const LEGACY_MIN_SCALE = 25;
const LEGACY_MAX_SCALE = 150;

const createSeededRng = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const normalizeGridSize = (scale: number): number => {
  const clamped = clampInteger(scale, LEGACY_MIN_SCALE, LEGACY_MAX_SCALE);
  const normalized = clamped % 2 === 0 ? clamped - 1 : clamped;
  return Math.max(LEGACY_MIN_SCALE, normalized);
};

const keyForPoint = (point: LegacyPoint): string => `${point.x},${point.y}`;

const createEmptyGrid = (size: number): boolean[][] => (
  Array.from({ length: size }, () => Array.from({ length: size }, () => false))
);

const createLegacyFloorGrid = (size: number): boolean[][] => {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => true));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        grid[y]![x] = false;
      }
    }
  }

  return grid;
};

const clonePoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

const carvePolyline = (grid: boolean[][], points: readonly LegacyPoint[]): void => {
  for (const point of points) {
    grid[point.y]![point.x] = true;
  }
};

const walkableNeighbors = (grid: boolean[][], point: LegacyPoint): LegacyPoint[] => {
  const neighbors: LegacyPoint[] = [];
  const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 }
  ];

  for (const direction of directions) {
    const nextX = point.x + direction.x;
    const nextY = point.y + direction.y;

    if (grid[nextY]?.[nextX] === true) {
      neighbors.push({ x: nextX, y: nextY });
    }
  }

  return neighbors;
};

const buildShortestPath = (grid: boolean[][], start: LegacyPoint, goal: LegacyPoint): LegacyPoint[] => {
  const queue: LegacyPoint[] = [start];
  const previous = new Map<string, string | null>();
  previous.set(keyForPoint(start), null);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (current.x === goal.x && current.y === goal.y) {
      break;
    }

    for (const neighbor of walkableNeighbors(grid, current)) {
      const neighborKey = keyForPoint(neighbor);
      if (previous.has(neighborKey)) {
        continue;
      }

      previous.set(neighborKey, keyForPoint(current));
      queue.push(neighbor);
    }
  }

  const path: LegacyPoint[] = [];
  let cursor: string | null = keyForPoint(goal);

  while (cursor) {
    const [x, y] = cursor.split(',').map((value) => Number.parseInt(value, 10));
    path.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }

  path.reverse();
  return path;
};

const measureAlternativeRouteDistanceWithoutEdge = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  blockedFrom: LegacyPoint,
  blockedTo: LegacyPoint
): number | null => {
  const queue: Array<{ point: LegacyPoint; distance: number }> = [{ point: start, distance: 0 }];
  const visited = new Set<string>([keyForPoint(start)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    if (isSamePoint(current.point, goal)) {
      return current.distance;
    }

    for (const direction of LEGACY_STEP_DIRECTIONS) {
      const next = {
        x: current.point.x + direction.x,
        y: current.point.y + direction.y
      };
      if (grid[next.y]?.[next.x] !== true) {
        continue;
      }

      const crossesBlockedEdge = (
        (isSamePoint(current.point, blockedFrom) && isSamePoint(next, blockedTo))
        || (isSamePoint(current.point, blockedTo) && isSamePoint(next, blockedFrom))
      );
      if (crossesBlockedEdge) {
        continue;
      }

      const nextKey = keyForPoint(next);
      if (visited.has(nextKey)) {
        continue;
      }

      visited.add(nextKey);
      queue.push({ point: next, distance: current.distance + 1 });
    }
  }

  return null;
};

const measureLegacyRouteQuality = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint,
  solutionPath: readonly LegacyPoint[]
): NonNullable<LegacyMazeSnapshot['routeQualityStats']> => {
  const sampledSolutionEdges = Math.max(0, solutionPath.length - 1);
  const bypassableBands = new Set<number>();
  const meaningfulBypassableBands = new Set<number>();
  let bypassableSolutionEdges = 0;
  let meaningfulBypassableSolutionEdges = 0;
  const minimumMeaningfulDetour = Math.max(2, Math.ceil(sampledSolutionEdges * 0.03));

  for (let index = 1; index < solutionPath.length; index += 1) {
    const from = solutionPath[index - 1];
    const to = solutionPath[index];
    if (!from || !to) {
      continue;
    }

    const alternativeDistance = measureAlternativeRouteDistanceWithoutEdge(grid, start, goal, from, to);
    if (alternativeDistance === null) {
      continue;
    }

    bypassableSolutionEdges += 1;
    const routeBand = Math.min(4, Math.floor((index / Math.max(1, sampledSolutionEdges)) * 5));
    bypassableBands.add(routeBand);

    if (alternativeDistance - sampledSolutionEdges < minimumMeaningfulDetour) {
      continue;
    }

    meaningfulBypassableSolutionEdges += 1;
    meaningfulBypassableBands.add(routeBand);
  }

  const minimumMeaningfulEdges = Math.max(2, Math.ceil(sampledSolutionEdges * 0.02));

  return {
    bypassableRouteBands: bypassableBands.size,
    bypassableSolutionEdges,
    meaningfulBypassableRouteBands: meaningfulBypassableBands.size,
    meaningfulBypassableSolutionEdges,
    minimumMeaningfulDetour,
    routeQuality: (
      meaningfulBypassableSolutionEdges >= minimumMeaningfulEdges
      && meaningfulBypassableBands.size >= 2
    ) ? 'multi-route' : 'single-route',
    sampledSolutionEdges
  };
};

const resolveReachableFloorDistances = (
  grid: boolean[][],
  start: LegacyPoint
): Map<string, { distance: number; point: LegacyPoint }> => {
  const reachable = new Map<string, { distance: number; point: LegacyPoint }>();
  if (grid[start.y]?.[start.x] !== true) {
    return reachable;
  }

  const queue: Array<{ distance: number; point: LegacyPoint }> = [{ distance: 0, point: start }];
  reachable.set(keyForPoint(start), { distance: 0, point: clonePoint(start) });

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    for (const direction of LEGACY_STEP_DIRECTIONS) {
      const next = {
        x: current.point.x + direction.x,
        y: current.point.y + direction.y
      };
      const nextKey = keyForPoint(next);
      if (grid[next.y]?.[next.x] !== true || reachable.has(nextKey)) {
        continue;
      }

      const entry = { distance: current.distance + 1, point: next };
      reachable.set(nextKey, entry);
      queue.push(entry);
    }
  }

  return reachable;
};

const normalizeLegacyPlayableTopology = (
  grid: boolean[][],
  start: LegacyPoint,
  goal: LegacyPoint
): {
  goal: LegacyPoint;
  stats: NonNullable<LegacyMazeSnapshot['playableTopologyStats']>;
} => {
  const reachable = resolveReachableFloorDistances(grid, start);
  let disconnectedComponentsPruned = 0;
  let disconnectedFloorTilesPruned = 0;

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) {
      continue;
    }

    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== true || reachable.has(`${x},${y}`)) {
        continue;
      }

      disconnectedComponentsPruned += 1;
      const queue: LegacyPoint[] = [{ x, y }];
      row[x] = false;

      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        if (!current) {
          continue;
        }

        disconnectedFloorTilesPruned += 1;
        for (const direction of LEGACY_STEP_DIRECTIONS) {
          const next = {
            x: current.x + direction.x,
            y: current.y + direction.y
          };
          if (grid[next.y]?.[next.x] !== true || reachable.has(keyForPoint(next))) {
            continue;
          }

          grid[next.y]![next.x] = false;
          queue.push(next);
        }
      }
    }
  }

  let farthest = reachable.get(keyForPoint(start)) ?? { distance: 0, point: clonePoint(start) };
  for (const entry of reachable.values()) {
    if (entry.distance > farthest.distance) {
      farthest = entry;
    }
  }

  const originalGoalDistance = reachable.get(keyForPoint(goal))?.distance ?? null;
  const minPlayableRouteDistance = Math.max(LEGACY_MIN_SCALE, Math.floor(grid.length * 1.5));
  const shouldRebaseGoal = (
    originalGoalDistance === null
    || originalGoalDistance < Math.min(minPlayableRouteDistance, farthest.distance)
  );
  const resolvedGoal = shouldRebaseGoal ? farthest.point : goal;
  const resolvedGoalDistance = shouldRebaseGoal
    ? farthest.distance
    : (originalGoalDistance ?? farthest.distance);

  return {
    goal: clonePoint(resolvedGoal),
    stats: {
      disconnectedComponentsPruned,
      disconnectedFloorTilesPruned,
      goalRebasedToFarthestReachableFloor: shouldRebaseGoal,
      originalGoalDistance,
      reachableFloors: reachable.size,
      resolvedGoalDistance
    }
  };
};

const isLegacyShortcutBridgeCandidate = (
  grid: boolean[][],
  point: LegacyPoint
): boolean => resolveLegacyShortcutBridgeEndpoints(grid, point) !== null;

const resolveLegacyShortcutBridgeEndpoints = (
  grid: boolean[][],
  point: LegacyPoint
): [LegacyPoint, LegacyPoint] | null => {
  if (grid[point.y]?.[point.x] === true) {
    return null;
  }

  const top = grid[point.y - 1]?.[point.x];
  const bottom = grid[point.y + 1]?.[point.x];
  const left = grid[point.y]?.[point.x - 1];
  const right = grid[point.y]?.[point.x + 1];
  if (
    top === undefined
    || bottom === undefined
    || left === undefined
    || right === undefined
  ) {
    return null;
  }

  const verticalWalls = top === false && bottom === false;
  const horizontalWalls = left === false && right === false;
  const horizontalPaths = left === true && right === true;
  const verticalPaths = top === true && bottom === true;
  if (verticalWalls && horizontalPaths) {
    return [
      { x: point.x - 1, y: point.y },
      { x: point.x + 1, y: point.y }
    ];
  }

  if (horizontalWalls && verticalPaths) {
    return [
      { x: point.x, y: point.y - 1 },
      { x: point.x, y: point.y + 1 }
    ];
  }

  return null;
};

const collectLegacyShortcutWallArray = (grid: boolean[][]): LegacyPoint[] => {
  const wallArray: LegacyPoint[] = [];
  const directions: LegacyPoint[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 }
  ];

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) {
      continue;
    }

    for (let x = 0; x < row.length; x += 1) {
      if (grid[y]?.[x] !== true) {
        continue;
      }

      for (const direction of directions) {
        const neighbor = { x: x + direction.x, y: y + direction.y };
        if (grid[neighbor.y]?.[neighbor.x] === false) {
          wallArray.push(neighbor);
        }
      }
    }
  }

  return wallArray;
};

const applyLegacyShortcutBridges = (
  grid: boolean[][],
  rng: () => number,
  shortcutCount: number,
  sourceWallArray?: LegacyPoint[]
): NonNullable<LegacyMazeSnapshot['shortcutStats']> => {
  if (shortcutCount <= 0) {
    return {
      requested: 0,
      attempts: 0,
      wallArrayEntries: 0,
      uniqueWallCandidates: 0,
      created: 0,
      exhaustedWallArray: false
    };
  }

  const wallArray = sourceWallArray?.map(clonePoint) ?? collectLegacyShortcutWallArray(grid);
  const uniqueWallCandidates = new Set(wallArray.map((point) => keyForPoint(point))).size;
  let created = 0;
  let attempts = 0;

  while (created < shortcutCount && wallArray.length > 0) {
    attempts += 1;
    const candidateIndex = Math.floor(rng() * wallArray.length);
    const [candidate] = wallArray.splice(candidateIndex, 1);
    if (!candidate || !isLegacyShortcutBridgeCandidate(grid, candidate)) {
      continue;
    }

    grid[candidate.y]![candidate.x] = true;
    created += 1;
  }

  return {
    requested: shortcutCount,
    attempts,
    wallArrayEntries: attempts + wallArray.length,
    uniqueWallCandidates,
    created,
    exhaustedWallArray: wallArray.length === 0 && created < shortcutCount
  };
};

const reinforceLegacyRouteQuality = (
  grid: boolean[][],
  rng: () => number,
  start: LegacyPoint,
  goal: LegacyPoint,
  solutionPath: LegacyPoint[],
  routeQualityStats: NonNullable<LegacyMazeSnapshot['routeQualityStats']>,
  maxExtraShortcuts: number
): {
  routeQualityStats: NonNullable<LegacyMazeSnapshot['routeQualityStats']>;
  solutionPath: LegacyPoint[];
  attempts: number;
  created: number;
} => {
  if (routeQualityStats.routeQuality === 'multi-route' || maxExtraShortcuts <= 0) {
    return {
      routeQualityStats,
      solutionPath,
      attempts: 0,
      created: 0
    };
  }

  const wallArray = collectLegacyShortcutWallArray(grid);
  let attempts = 0;
  let created = 0;
  let nextSolutionPath = solutionPath;
  let nextRouteQualityStats = routeQualityStats;

  while (
    created < maxExtraShortcuts
    && wallArray.length > 0
    && nextRouteQualityStats.routeQuality !== 'multi-route'
  ) {
    attempts += 1;
    const candidateIndex = Math.floor(rng() * wallArray.length);
    const [candidate] = wallArray.splice(candidateIndex, 1);
    if (!candidate || !isLegacyShortcutBridgeCandidate(grid, candidate)) {
      continue;
    }

    grid[candidate.y]![candidate.x] = true;
    created += 1;
    nextSolutionPath = buildShortestPath(grid, start, goal);
    nextRouteQualityStats = measureLegacyRouteQuality(grid, start, goal, nextSolutionPath);
  }

  return {
    routeQualityStats: nextRouteQualityStats,
    solutionPath: nextSolutionPath,
    attempts,
    created
  };
};

interface LegacyCheckpointPathBuilderResult {
  grid: boolean[][];
  goal: LegacyPoint;
  pathBuilderStats: NonNullable<LegacyMazeSnapshot['pathBuilderStats']>;
  start: LegacyPoint;
  wallArray: LegacyPoint[];
}

const LEGACY_STEP_DIRECTIONS: readonly LegacyPoint[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 }
];

const isSamePoint = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

const distanceBetween = (left: LegacyPoint, right: LegacyPoint): number => (
  Math.hypot(left.x - right.x, left.y - right.y)
);

const hasFullLegacyNeighborContext = (size: number, point: LegacyPoint): boolean => (
  point.x > 0 && point.y > 0 && point.x < size - 1 && point.y < size - 1
);

const isPathAt = (pathMask: boolean[][], point: LegacyPoint): boolean => (
  pathMask[point.y]?.[point.x] === true
);

const countPathNeighbors = (
  pathMask: boolean[][],
  point: LegacyPoint,
  ignored: readonly LegacyPoint[]
): number => {
  let count = 0;

  for (const direction of LEGACY_STEP_DIRECTIONS) {
    const neighbor = { x: point.x + direction.x, y: point.y + direction.y };
    if (ignored.some((ignoredPoint) => isSamePoint(ignoredPoint, neighbor))) {
      continue;
    }

    if (isPathAt(pathMask, neighbor)) {
      count += 1;
    }
  }

  return count;
};

const canUseLegacyNextTile = (
  size: number,
  pathMask: boolean[][],
  current: LegacyPoint,
  next: LegacyPoint,
  start: LegacyPoint,
  checkpoint: LegacyPoint,
  backtracking: boolean
): boolean => {
  if (!hasFullLegacyNeighborContext(size, next) || isPathAt(pathMask, next)) {
    return false;
  }

  if (isSamePoint(next, checkpoint)) {
    return true;
  }

  const neighborPathCount = countPathNeighbors(pathMask, next, [start, current]);
  return backtracking ? neighborPathCount <= 1 : neighborPathCount === 0;
};

const findClosestLegacyNextTile = (
  size: number,
  pathMask: boolean[][],
  current: LegacyPoint,
  checkpoint: LegacyPoint,
  start: LegacyPoint,
  backtracking: boolean
): LegacyPoint | null => {
  let best: LegacyPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const direction of LEGACY_STEP_DIRECTIONS) {
    const next = { x: current.x + direction.x, y: current.y + direction.y };
    if (!canUseLegacyNextTile(size, pathMask, current, next, start, checkpoint, backtracking)) {
      continue;
    }

    if (isSamePoint(next, checkpoint)) {
      return next;
    }

    const distance = distanceBetween(next, checkpoint);
    if (distance < bestDistance) {
      best = next;
      bestDistance = distance;
    }
  }

  return best;
};

const findRandomLegacyNextTile = (
  size: number,
  pathMask: boolean[][],
  current: LegacyPoint,
  checkpoint: LegacyPoint,
  start: LegacyPoint,
  backtracking: boolean,
  rng: () => number
): LegacyPoint | null => {
  const direction = LEGACY_STEP_DIRECTIONS[Math.floor(rng() * LEGACY_STEP_DIRECTIONS.length)];
  if (!direction) {
    return null;
  }

  const next = { x: current.x + direction.x, y: current.y + direction.y };
  return canUseLegacyNextTile(size, pathMask, current, next, start, checkpoint, backtracking) ? next : null;
};

const findPreferredLegacyNextTile = (
  size: number,
  pathMask: boolean[][],
  current: LegacyPoint,
  checkpoint: LegacyPoint,
  start: LegacyPoint,
  backtracking: boolean
): LegacyPoint | null => {
  const deltaX = checkpoint.x - current.x;
  const deltaY = checkpoint.y - current.y;
  const direction = Math.abs(deltaX) <= Math.abs(deltaY)
    ? { x: deltaX > 0 ? 1 : -1, y: 0 }
    : { x: 0, y: deltaY > 0 ? 1 : -1 };
  const next = { x: current.x + direction.x, y: current.y + direction.y };
  return canUseLegacyNextTile(size, pathMask, current, next, start, checkpoint, backtracking) ? next : null;
};

const findLegacyNextTile = (
  size: number,
  pathMask: boolean[][],
  current: LegacyPoint,
  checkpoint: LegacyPoint,
  start: LegacyPoint,
  backtracking: boolean,
  rng: () => number
): LegacyPoint | null => {
  const selectors = [0, 1, 2];

  while (selectors.length > 0) {
    const selectorIndex = Math.floor(rng() * selectors.length);
    const [selector] = selectors.splice(selectorIndex, 1);

    if (selector === 0) {
      const next = findClosestLegacyNextTile(size, pathMask, current, checkpoint, start, backtracking);
      if (next) {
        return next;
      }
    } else if (selector === 1) {
      const next = findRandomLegacyNextTile(size, pathMask, current, checkpoint, start, backtracking, rng);
      if (next) {
        return next;
      }
    } else {
      const next = findPreferredLegacyNextTile(size, pathMask, current, checkpoint, start, backtracking);
      if (next) {
        return next;
      }
    }
  }

  return null;
};

const hasNeighboringPath = (pathMask: boolean[][], point: LegacyPoint): boolean => (
  LEGACY_STEP_DIRECTIONS.some((direction) => isPathAt(pathMask, {
    x: point.x + direction.x,
    y: point.y + direction.y
  }))
);

const isAdjacentTo = (left: LegacyPoint, right: LegacyPoint): boolean => (
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1
);

const resolveLegacyCheckpoint = (
  size: number,
  pathMask: boolean[][],
  start: LegacyPoint,
  remainingCheckpoints: number,
  rng: () => number
): { checkpoint: LegacyPoint | null; remainingCheckpoints: number } => {
  const subScale = size * 3;
  const gridSize = size * size;
  let attempts = 0;
  let remaining = remainingCheckpoints;

  while (remaining > 0) {
    attempts += 1;
    if (attempts % 10 === 0) {
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }

    const tileIndex = subScale + Math.floor(rng() * Math.max(1, gridSize - subScale));
    const checkpoint = { x: tileIndex % size, y: Math.floor(tileIndex / size) };

    if (
      hasFullLegacyNeighborContext(size, checkpoint)
      && !isSamePoint(checkpoint, start)
      && !isAdjacentTo(checkpoint, start)
      && !isPathAt(pathMask, checkpoint)
      && !hasNeighboringPath(pathMask, checkpoint)
    ) {
      return { checkpoint, remainingCheckpoints: remaining - 1 };
    }
  }

  return { checkpoint: null, remainingCheckpoints: 0 };
};

const backtrackLegacyPath = (
  size: number,
  pathMask: boolean[][],
  pathTiles: LegacyPoint[],
  checkpoint: LegacyPoint,
  start: LegacyPoint,
  rng: () => number
): LegacyPoint | null => {
  const potentialPathArray: LegacyPoint[] = [];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const pathTile of pathTiles) {
    const distance = distanceBetween(pathTile, checkpoint);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      potentialPathArray.push(pathTile);
    }
  }

  if (potentialPathArray.length === 0) {
    return null;
  }

  if (Math.floor(rng() * 4) === 3) {
    const candidate = potentialPathArray[Math.floor(rng() * potentialPathArray.length)];
    if (!candidate) {
      return null;
    }

    return findLegacyNextTile(size, pathMask, candidate, checkpoint, start, true, rng);
  }

  for (let index = potentialPathArray.length - 1; index >= 0; index -= 1) {
    const candidate = potentialPathArray[index];
    if (!candidate) {
      continue;
    }

    const next = findLegacyNextTile(size, pathMask, candidate, checkpoint, start, true, rng);
    if (next) {
      return next;
    }
  }

  return null;
};

const createLegacyCheckpointPathMaze = (
  size: number,
  seed: number
): LegacyCheckpointPathBuilderResult => {
  const rng = createSeededRng(seed);
  const requestedCheckpoints = Math.trunc(size + (size * legacyTuning.board.checkPointModifier));
  const pathMask = createEmptyGrid(size);
  const pathTiles: LegacyPoint[] = [];
  const pathLengths = new Map<string, number>();
  const randomStartIndex = Math.floor(rng() * (size * size));
  const rawStart = { x: randomStartIndex % size, y: Math.floor(randomStartIndex / size) };
  const deterministicSafetyStart = !hasFullLegacyNeighborContext(size, rawStart);
  const start = deterministicSafetyStart ? { x: 1, y: 1 } : rawStart;
  let current = clonePoint(start);
  let remainingCheckpoints = requestedCheckpoints;
  let acceptedCheckpoints = 0;
  let backtracks = 0;
  let longestPathLength = 0;
  let goal = clonePoint(start);
  let pathLengthCount = 0;
  let safetyIterations = 0;
  const safetyIterationLimit = Math.max(size * size * 8, requestedCheckpoints * size * 4);

  while (remainingCheckpoints > 0 && safetyIterations < safetyIterationLimit) {
    const checkpointResult = resolveLegacyCheckpoint(size, pathMask, start, remainingCheckpoints, rng);
    remainingCheckpoints = checkpointResult.remainingCheckpoints;
    const checkpoint = checkpointResult.checkpoint;
    if (!checkpoint) {
      break;
    }

    acceptedCheckpoints += 1;

    while (safetyIterations < safetyIterationLimit) {
      safetyIterations += 1;
      if (!isPathAt(pathMask, current)) {
        pathMask[current.y]![current.x] = true;
        pathTiles.push(clonePoint(current));
      }
      pathLengths.set(keyForPoint(current), pathLengthCount);

      if (isSamePoint(current, checkpoint)) {
        break;
      }

      const previous = clonePoint(current);
      const next = findLegacyNextTile(size, pathMask, current, checkpoint, start, false, rng);
      if (next) {
        current = next;
        pathLengthCount += 1;
        continue;
      }

      if (pathLengthCount > longestPathLength) {
        longestPathLength = pathLengthCount;
        goal = previous;
      }

      const backtracked = backtrackLegacyPath(size, pathMask, pathTiles, checkpoint, start, rng);
      backtracks += 1;
      if (!backtracked) {
        break;
      }

      current = backtracked;
      pathLengthCount = pathLengths.get(keyForPoint(current)) ?? 0;
    }
  }

  if (isSamePoint(goal, start) && pathTiles.length > 1) {
    goal = pathTiles[pathTiles.length - 1] ?? start;
    longestPathLength = Math.max(longestPathLength, pathTiles.length - 1);
  }

  const grid = createLegacyFloorGrid(size);
  const wallArray: LegacyPoint[] = [];

  for (const pathTile of pathTiles) {
    for (const direction of LEGACY_STEP_DIRECTIONS) {
      const neighbor = { x: pathTile.x + direction.x, y: pathTile.y + direction.y };
      if (
        hasFullLegacyNeighborContext(size, neighbor)
        && !isPathAt(pathMask, neighbor)
        && !isSamePoint(neighbor, goal)
      ) {
        grid[neighbor.y]![neighbor.x] = false;
        wallArray.push(neighbor);
      }
    }
  }

  for (const pathTile of pathTiles) {
    grid[pathTile.y]![pathTile.x] = true;
  }

  return {
    grid,
    start,
    goal,
    wallArray,
    pathBuilderStats: {
      topology: 'legacy-checkpoint-path-builder',
      requestedCheckpoints,
      acceptedCheckpoints,
      pathTiles: pathTiles.length,
      wallArrayEntries: wallArray.length,
      backtracks,
      exhaustedCheckpoints: remainingCheckpoints === 0,
      longestPathLength,
      deterministicSafetyStart
    }
  };
};

export const createLegacyMaze = (scale: number, seed: number, shortcutCount?: number): LegacyMazeSnapshot => {
  const size = normalizeGridSize(scale);
  const { grid, start, goal: sourceGoal, wallArray, pathBuilderStats } = createLegacyCheckpointPathMaze(size, seed);
  const rng = createSeededRng(seed ^ 0x5a17c0de);
  const resolvedShortcutCount = size > 35
    ? (shortcutCount ?? Math.trunc(size * legacyTuning.board.shortcutCountModifier.game))
    : 0;
  const shortcutStats = applyLegacyShortcutBridges(grid, rng, resolvedShortcutCount, wallArray);
  const { goal, stats: playableTopologyStats } = normalizeLegacyPlayableTopology(grid, start, sourceGoal);
  let solutionPath = buildShortestPath(grid, start, goal);
  let routeQualityStats = measureLegacyRouteQuality(grid, start, goal, solutionPath);

  const reinforcementStats = reinforceLegacyRouteQuality(
    grid,
    rng,
    start,
    goal,
    solutionPath,
    routeQualityStats,
    resolvedShortcutCount > 0 ? Math.max(2, resolvedShortcutCount) : 0
  );
  if (reinforcementStats.created > 0) {
    solutionPath = reinforcementStats.solutionPath;
    routeQualityStats = reinforcementStats.routeQualityStats;
    shortcutStats.created += reinforcementStats.created;
    shortcutStats.qualityReinforcementAttempts = reinforcementStats.attempts;
    shortcutStats.qualityReinforcementCreated = reinforcementStats.created;
  }

  return {
    source: 'play-generated',
    size,
    grid,
    start: clonePoint(start),
    goal: clonePoint(goal),
    solutionPath,
    seed,
    pathBuilderStats,
    playableTopologyStats,
    routeQualityStats,
    shortcutsCreated: shortcutStats.created,
    shortcutStats
  };
};

export const createLegacyGeneratedMenuMaze = (
  scale: number,
  seed: number,
  shortcutCount?: number
): LegacyMazeSnapshot => ({
  ...createLegacyMaze(
    scale,
    seed,
    shortcutCount ?? Math.trunc(normalizeGridSize(scale) * legacyTuning.board.shortcutCountModifier.menu)
  ),
  source: 'menu-generated'
});

export const createLegacyMenuMaze = (seed: number): LegacyMazeSnapshot => {
  const blueprint = resolveLegacyMenuSnapshotBlueprint();
  const size = blueprint.size;
  const grid = createEmptyGrid(size);
  const solutionPath = blueprint.solutionPath.map((point) => ({ ...point }));

  carvePolyline(grid, solutionPath);
  for (const branch of blueprint.branches) {
    carvePolyline(grid, branch.points);
  }

  const start = solutionPath[0]!;
  const goal = solutionPath.at(-1)!;

  return {
    source: 'menu-snapshot',
    size,
    grid,
    start,
    goal,
    solutionPath,
    seed,
    shortcutsCreated: 0,
    shortcutStats: {
      requested: 0,
      attempts: 0,
      wallArrayEntries: 0,
      uniqueWallCandidates: 0,
      created: 0,
      exhaustedWallArray: false
    }
  };
};

export const isWalkableTile = (maze: LegacyMazeSnapshot, point: LegacyPoint): boolean => (
  maze.grid[point.y]?.[point.x] === true
);

export const movePoint = (point: LegacyPoint, deltaX: number, deltaY: number): LegacyPoint => ({
  x: point.x + deltaX,
  y: point.y + deltaY
});
