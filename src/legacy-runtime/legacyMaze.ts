import { clampInteger } from './legacyDefaults';
import { resolveLegacyMenuSnapshotBlueprint } from './legacyMenuSnapshot';
import { legacyTuning } from '../config/tuning';

export interface LegacyPoint {
  x: number;
  y: number;
}

export interface LegacyMazeSnapshot {
  size: number;
  grid: boolean[][];
  start: LegacyPoint;
  goal: LegacyPoint;
  solutionPath: LegacyPoint[];
  seed: number;
  shortcutsCreated?: number;
  shortcutStats?: {
    requested: number;
    attempts: number;
    wallArrayEntries: number;
    uniqueWallCandidates: number;
    created: number;
    exhaustedWallArray: boolean;
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
    buildKind: 'menu-snapshot' | 'play-generated';
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

const shuffledDirections = (rng: () => number): LegacyPoint[] => {
  const directions: LegacyPoint[] = [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
    { x: 2, y: 0 }
  ];

  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [directions[index], directions[swapIndex]] = [directions[swapIndex], directions[index]];
  }

  return directions;
};

const keyForPoint = (point: LegacyPoint): string => `${point.x},${point.y}`;

const createEmptyGrid = (size: number): boolean[][] => (
  Array.from({ length: size }, () => Array.from({ length: size }, () => false))
);

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

const breadthFirstDistances = (grid: boolean[][], origin: LegacyPoint): Map<string, number> => {
  const distances = new Map<string, number>();
  const queue: LegacyPoint[] = [origin];
  distances.set(keyForPoint(origin), 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const currentDistance = distances.get(keyForPoint(current)) ?? 0;
    for (const neighbor of walkableNeighbors(grid, current)) {
      const neighborKey = keyForPoint(neighbor);
      if (distances.has(neighborKey)) {
        continue;
      }

      distances.set(neighborKey, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
};

const furthestPointFrom = (grid: boolean[][], origin: LegacyPoint): LegacyPoint => {
  const distances = breadthFirstDistances(grid, origin);
  let furthest = origin;
  let furthestDistance = -1;

  for (const [pointKey, distance] of distances.entries()) {
    if (distance <= furthestDistance) {
      continue;
    }

    furthestDistance = distance;
    const [x, y] = pointKey.split(',').map((value) => Number.parseInt(value, 10));
    furthest = { x, y };
  }

  return furthest;
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

const isLegacyShortcutBridgeCandidate = (
  grid: boolean[][],
  point: LegacyPoint
): boolean => {
  if (grid[point.y]?.[point.x] === true) {
    return false;
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
    return false;
  }

  const verticalWalls = top === false && bottom === false;
  const horizontalWalls = left === false && right === false;
  const horizontalPaths = left === true && right === true;
  const verticalPaths = top === true && bottom === true;
  return (verticalWalls && horizontalPaths) || (horizontalWalls && verticalPaths);
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
  shortcutCount: number
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

  const wallArray = collectLegacyShortcutWallArray(grid);
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

export const createLegacyMaze = (scale: number, seed: number, shortcutCount?: number): LegacyMazeSnapshot => {
  const size = normalizeGridSize(scale);
  const grid = createEmptyGrid(size);
  const rng = createSeededRng(seed);
  const stack: LegacyPoint[] = [{ x: 1, y: 1 }];

  grid[1]![1] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    if (!current) {
      break;
    }

    const nextCandidates = shuffledDirections(rng)
      .map((direction) => ({
        x: current.x + direction.x,
        y: current.y + direction.y,
        wallX: current.x + (direction.x / 2),
        wallY: current.y + (direction.y / 2)
      }))
      .filter((candidate) => (
        candidate.x > 0
        && candidate.y > 0
        && candidate.x < size - 1
        && candidate.y < size - 1
        && grid[candidate.y]?.[candidate.x] === false
      ));

    const next = nextCandidates[0];
    if (!next) {
      stack.pop();
      continue;
    }

    grid[next.wallY]![next.wallX] = true;
    grid[next.y]![next.x] = true;
    stack.push({ x: next.x, y: next.y });
  }

  const randomInterior = {
    x: 1 + (Math.floor(rng() * Math.max(1, Math.floor(size / 2))) * 2),
    y: 1 + (Math.floor(rng() * Math.max(1, Math.floor(size / 2))) * 2)
  };
  const anchor = grid[randomInterior.y]?.[randomInterior.x] === true ? randomInterior : { x: 1, y: 1 };
  const start = furthestPointFrom(grid, anchor);
  const goal = furthestPointFrom(grid, start);
  const resolvedShortcutCount = size > 35
    ? (shortcutCount ?? Math.trunc(size * legacyTuning.board.shortcutCountModifier.game))
    : 0;
  const shortcutStats = applyLegacyShortcutBridges(grid, rng, resolvedShortcutCount);
  const solutionPath = buildShortestPath(grid, start, goal);

  return {
    size,
    grid,
    start: clonePoint(start),
    goal: clonePoint(goal),
    solutionPath,
    seed,
    shortcutsCreated: shortcutStats.created,
    shortcutStats
  };
};

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
