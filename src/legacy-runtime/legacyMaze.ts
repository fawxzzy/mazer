import { clampInteger } from './legacyDefaults';

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
}

const LEGACY_MIN_SCALE = 25;
const LEGACY_MAX_SCALE = 150;
const LEGACY_MENU_SNAPSHOT_SIZE = 25;

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

const appendSegment = (path: LegacyPoint[], to: LegacyPoint): void => {
  const from = path[path.length - 1];
  if (!from) {
    path.push({ ...to });
    return;
  }

  if (from.x !== to.x && from.y !== to.y) {
    throw new Error(`Legacy path segment must stay orthogonal: ${from.x},${from.y} -> ${to.x},${to.y}`);
  }

  const stepX = from.x === to.x ? 0 : (from.x < to.x ? 1 : -1);
  const stepY = from.y === to.y ? 0 : (from.y < to.y ? 1 : -1);
  let cursorX = from.x;
  let cursorY = from.y;

  while (cursorX !== to.x || cursorY !== to.y) {
    cursorX += stepX;
    cursorY += stepY;
    path.push({ x: cursorX, y: cursorY });
  }
};

const carvePolyline = (grid: boolean[][], points: readonly LegacyPoint[]): void => {
  for (const point of points) {
    grid[point.y]![point.x] = true;
  }
};

const buildStaircase = (
  start: LegacyPoint,
  steps: number,
  horizontalDirection: 1 | -1,
  verticalDirection: 1 | -1
): LegacyPoint[] => {
  const points: LegacyPoint[] = [{ ...start }];
  let cursor = { ...start };

  for (let index = 0; index < steps; index += 1) {
    cursor = { x: cursor.x + horizontalDirection, y: cursor.y };
    points.push({ ...cursor });
    cursor = { x: cursor.x, y: cursor.y + verticalDirection };
    points.push({ ...cursor });
  }

  return points;
};

const buildLegacyMenuSolutionPath = (): LegacyPoint[] => {
  const path: LegacyPoint[] = [{ x: 3, y: 4 }];

  appendSegment(path, { x: 8, y: 4 });
  appendSegment(path, { x: 8, y: 7 });
  appendSegment(path, { x: 5, y: 7 });
  appendSegment(path, { x: 5, y: 12 });
  appendSegment(path, { x: 10, y: 12 });
  appendSegment(path, { x: 10, y: 9 });
  appendSegment(path, { x: 14, y: 9 });
  appendSegment(path, { x: 14, y: 13 });
  appendSegment(path, { x: 12, y: 13 });
  appendSegment(path, { x: 12, y: 17 });
  appendSegment(path, { x: 14, y: 17 });
  appendSegment(path, { x: 14, y: 18 });
  appendSegment(path, { x: 15, y: 18 });
  appendSegment(path, { x: 15, y: 19 });
  appendSegment(path, { x: 16, y: 19 });
  appendSegment(path, { x: 16, y: 20 });
  appendSegment(path, { x: 17, y: 20 });
  appendSegment(path, { x: 17, y: 21 });
  appendSegment(path, { x: 20, y: 21 });
  appendSegment(path, { x: 20, y: 13 });
  appendSegment(path, { x: 22, y: 13 });
  appendSegment(path, { x: 22, y: 22 });

  return path;
};

const buildLegacyMenuBranchPolylines = (): LegacyPoint[][] => {
  const branches: LegacyPoint[][] = [];

  const topSpine: LegacyPoint[] = [{ x: 3, y: 2 }];
  appendSegment(topSpine, { x: 10, y: 2 });
  appendSegment(topSpine, { x: 10, y: 5 });
  appendSegment(topSpine, { x: 16, y: 5 });
  appendSegment(topSpine, { x: 16, y: 2 });
  appendSegment(topSpine, { x: 21, y: 2 });
  appendSegment(topSpine, { x: 21, y: 8 });
  appendSegment(topSpine, { x: 18, y: 8 });
  branches.push(topSpine);

  const leftFrame: LegacyPoint[] = [{ x: 2, y: 4 }];
  appendSegment(leftFrame, { x: 2, y: 22 });
  appendSegment(leftFrame, { x: 6, y: 22 });
  appendSegment(leftFrame, { x: 6, y: 19 });
  appendSegment(leftFrame, { x: 9, y: 19 });
  branches.push(leftFrame);

  const centerBand: LegacyPoint[] = [{ x: 8, y: 10 }];
  appendSegment(centerBand, { x: 18, y: 10 });
  appendSegment(centerBand, { x: 18, y: 16 });
  appendSegment(centerBand, { x: 15, y: 16 });
  appendSegment(centerBand, { x: 15, y: 12 });
  branches.push(centerBand);

  branches.push(buildStaircase({ x: 6, y: 5 }, 6, 1, 1));
  branches.push(buildStaircase({ x: 8, y: 14 }, 6, 1, 1));

  const lowerBand: LegacyPoint[] = [{ x: 7, y: 15 }];
  appendSegment(lowerBand, { x: 7, y: 21 });
  appendSegment(lowerBand, { x: 13, y: 21 });
  appendSegment(lowerBand, { x: 13, y: 23 });
  appendSegment(lowerBand, { x: 18, y: 23 });
  branches.push(lowerBand);

  const rightPocket: LegacyPoint[] = [{ x: 19, y: 13 }];
  appendSegment(rightPocket, { x: 19, y: 6 });
  appendSegment(rightPocket, { x: 23, y: 6 });
  appendSegment(rightPocket, { x: 23, y: 18 });
  appendSegment(rightPocket, { x: 21, y: 18 });
  branches.push(rightPocket);

  const rightSpine: LegacyPoint[] = [{ x: 21, y: 12 }];
  appendSegment(rightSpine, { x: 23, y: 12 });
  appendSegment(rightSpine, { x: 23, y: 20 });
  appendSegment(rightSpine, { x: 20, y: 20 });
  branches.push(rightSpine);

  return branches;
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

export const createLegacyMaze = (scale: number, seed: number): LegacyMazeSnapshot => {
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
  const solutionPath = buildShortestPath(grid, start, goal);

  return {
    size,
    grid,
    start,
    goal,
    solutionPath,
    seed
  };
};

export const createLegacyMenuMaze = (seed: number): LegacyMazeSnapshot => {
  const size = LEGACY_MENU_SNAPSHOT_SIZE;
  const grid = createEmptyGrid(size);
  const solutionPath = buildLegacyMenuSolutionPath();

  carvePolyline(grid, solutionPath);
  for (const branch of buildLegacyMenuBranchPolylines()) {
    carvePolyline(grid, branch);
  }

  const start = solutionPath[0]!;
  const goal = solutionPath.at(-1)!;

  return {
    size,
    grid,
    start,
    goal,
    solutionPath,
    seed
  };
};

export const isWalkableTile = (maze: LegacyMazeSnapshot, point: LegacyPoint): boolean => (
  maze.grid[point.y]?.[point.x] === true
);

export const movePoint = (point: LegacyPoint, deltaX: number, deltaY: number): LegacyPoint => ({
  x: point.x + deltaX,
  y: point.y + deltaY
});
