// The ONE shared analyzer both generator-convergence adapters (PR B of
// Generation V2 Wave 1.5) measure through -- operates purely on
// MazeV2CanonicalMaze (walkable grid + start/goal + wrap pairs), with no
// engine-specific knowledge at all. This is what makes the legacy-runtime
// and src/domain/maze comparison meaningful: both engines' output converts
// into the same neutral shape (see canonicalMaze.ts and
// adapters/canonicalMazeFromDomainMaze.ts), then this one analyzer measures
// either identically.
//
// Deliberately NOT the same function as metrics.ts's own
// analyzeLegacyMazeAsMazeV2Metrics, which stays legacy-runtime-specific
// (PR A shipped and tested it against LegacyMazeSnapshot's own
// solutionPath/wrapTopologyDiagnostics fields, including the
// legacy-only "direct floor route vs playable route" comparison that has
// no equivalent concept in a generator with no wrap topology at all).
// Unifying the two analyzer entry points is a reasonable future cleanup
// once this comparison proves out -- not attempted here, to avoid touching
// PR A's already-shipped, already-tested contract while still meeting
// this PR's own "one shared analyzer" requirement for the comparison
// itself.
//
// Route/turn/junction/dead-end/cycle-rank are all computed fresh from the
// canonical grid via BFS, rather than trusting either engine's own
// internal solution path or metrics -- the whole point of a neutral
// analyzer is that it doesn't need to trust either engine's bookkeeping.

import type { MazeV2CanonicalMaze, MazeV2MeasuredMetrics, MazeV2WrapPair } from './types';
import { createMazeV2MetricFingerprint } from './hashing';

interface CanonicalPoint {
  x: number;
  y: number;
}

const pointKey = (point: CanonicalPoint): string => `${point.x},${point.y}`;

const resolveManhattanDistance = (left: CanonicalPoint, right: CanonicalPoint): number => (
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
);

const isWalkable = (maze: MazeV2CanonicalMaze, point: CanonicalPoint): boolean => (
  point.y >= 0 && point.y < maze.height && point.x >= 0 && point.x < maze.width && maze.walkable[point.y]![point.x] === true
);

const resolveWrapNeighbors = (
  wrapPairs: readonly MazeV2WrapPair[],
  point: CanonicalPoint
): CanonicalPoint[] => {
  const neighbors: CanonicalPoint[] = [];
  for (const pair of wrapPairs) {
    if (pair.from.x === point.x && pair.from.y === point.y) {
      neighbors.push(pair.to);
    } else if (pair.to.x === point.x && pair.to.y === point.y) {
      neighbors.push(pair.from);
    }
  }
  return neighbors;
};

// Wrap-aware 4-directional neighbor resolution -- identical policy to
// legacy-runtime's own 'playable-wrap-aware' graph, generalized to any
// MazeV2CanonicalMaze regardless of which engine produced it. Returns an
// empty wrap-neighbor list (falling back to plain 4-directional adjacency)
// when wrapPairs is empty, which is the honest current state for BOTH
// engines' bridges today (see canonicalMaze.ts's own comment on the
// legacy-runtime bridge-fidelity gap; src/domain/maze has no wrap concept
// at all).
const resolveNeighbors = (maze: MazeV2CanonicalMaze, point: CanonicalPoint): CanonicalPoint[] => {
  const candidates: CanonicalPoint[] = [
    { x: point.x, y: point.y - 1 },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y },
    { x: point.x + 1, y: point.y },
    ...resolveWrapNeighbors(maze.wrapPairs, point)
  ];
  return candidates.filter((candidate) => isWalkable(maze, candidate));
};

interface WalkableGraphSummary {
  degreeByKey: Map<string, number>;
  walkableTileCount: number;
  edgeCount: number;
}

const summarizeWalkableGraph = (maze: MazeV2CanonicalMaze): WalkableGraphSummary => {
  const degreeByKey = new Map<string, number>();
  let walkableTileCount = 0;
  let degreeSum = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (!maze.walkable[y]![x]) continue;
      walkableTileCount += 1;
      const degree = resolveNeighbors(maze, { x, y }).length;
      degreeByKey.set(`${x},${y}`, degree);
      degreeSum += degree;
    }
  }
  return { degreeByKey, walkableTileCount, edgeCount: degreeSum / 2 };
};

// Plain BFS shortest path -- sufficient here since every edge (including a
// wrap pair) has unit cost; no need for A*/Dijkstra's extra bookkeeping.
const resolveShortestPath = (
  maze: MazeV2CanonicalMaze,
  start: CanonicalPoint,
  goal: CanonicalPoint
): CanonicalPoint[] => {
  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  const queue: CanonicalPoint[] = [start];
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor]!;
    cursor += 1;
    if (pointKey(current) === goalKey) break;
    for (const neighbor of resolveNeighbors(maze, current)) {
      const neighborKey = pointKey(neighbor);
      if (cameFrom.has(neighborKey)) continue;
      cameFrom.set(neighborKey, pointKey(current));
      queue.push(neighbor);
    }
  }
  if (!cameFrom.has(goalKey)) {
    return [];
  }
  const path: CanonicalPoint[] = [];
  let cursorKey: string | null = goalKey;
  while (cursorKey !== null) {
    const [x, y] = cursorKey.split(',').map(Number);
    path.unshift({ x: x!, y: y! });
    cursorKey = cameFrom.get(cursorKey) ?? null;
  }
  return path;
};

const resolveTurnHeading = (from: CanonicalPoint, to: CanonicalPoint): string => (
  `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`
);

const resolveTurningMetrics = (path: readonly CanonicalPoint[]) => {
  if (path.length < 3) {
    return {
      turnCount: 0,
      turnRatio: 0,
      meanStraightRunLength: Math.max(0, path.length - 1),
      maxStraightRunLength: Math.max(0, path.length - 1),
      straightRunLengthVariance: 0
    };
  }
  const runLengths: number[] = [];
  let turnCount = 0;
  let currentHeading = resolveTurnHeading(path[0]!, path[1]!);
  let currentRunLength = 1;
  for (let index = 1; index < path.length - 1; index += 1) {
    const nextHeading = resolveTurnHeading(path[index]!, path[index + 1]!);
    if (nextHeading === currentHeading) {
      currentRunLength += 1;
      continue;
    }
    turnCount += 1;
    runLengths.push(currentRunLength);
    currentHeading = nextHeading;
    currentRunLength = 1;
  }
  runLengths.push(currentRunLength);
  const meanStraightRunLength = runLengths.reduce((total, value) => total + value, 0) / runLengths.length;
  const maxStraightRunLength = Math.max(...runLengths);
  const variance = runLengths.reduce((total, value) => total + ((value - meanStraightRunLength) ** 2), 0) / runLengths.length;
  return {
    turnCount,
    turnRatio: turnCount / Math.max(1, path.length - 2),
    meanStraightRunLength,
    maxStraightRunLength,
    straightRunLengthVariance: variance
  };
};

const resolveDeadEndBranch = (
  maze: MazeV2CanonicalMaze,
  terminal: CanonicalPoint,
  degreeByKey: Map<string, number>
): { root: CanonicalPoint; depth: number; firstStepFromRoot: CanonicalPoint | null } => {
  let depth = 0;
  let previous: CanonicalPoint | null = null;
  let current = terminal;
  for (;;) {
    const neighbors = resolveNeighbors(maze, current)
      .filter((neighbor) => previous === null || pointKey(neighbor) !== pointKey(previous));
    const next = neighbors[0];
    const nextDegree = next ? degreeByKey.get(pointKey(next)) ?? 0 : 0;
    if (!next || nextDegree !== 2) {
      return { root: next ?? current, depth: depth + (next ? 1 : 0), firstStepFromRoot: next ? current : null };
    }
    previous = current;
    current = next;
    depth += 1;
  }
};

export const analyzeMazeV2CanonicalMaze = (maze: MazeV2CanonicalMaze): MazeV2MeasuredMetrics => {
  const graph = summarizeWalkableGraph(maze);
  const floorRatio = graph.walkableTileCount / Math.max(1, maze.width * maze.height);
  const path = resolveShortestPath(maze, maze.start, maze.goal);
  const manhattanDistance = resolveManhattanDistance(maze.start, maze.goal);
  const shortestPathLength = Math.max(0, path.length - 1);
  const detourRatio = shortestPathLength / Math.max(1, manhattanDistance);
  const routeCoverage = path.length / Math.max(1, graph.walkableTileCount);

  const junctionKeys = [...graph.degreeByKey.entries()].filter(([, degree]) => degree >= 3);
  const junctionCount = junctionKeys.length;
  const junctionDegrees = junctionKeys.map(([, degree]) => degree);
  const routeJunctionCount = path.filter((point) => (graph.degreeByKey.get(pointKey(point)) ?? 0) >= 3).length;

  const terminals = [...graph.degreeByKey.entries()]
    .filter(([key, degree]) => degree === 1 && key !== pointKey(maze.start) && key !== pointKey(maze.goal))
    .map(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return { x: x!, y: y! };
    });
  const branches = terminals.map((terminal) => resolveDeadEndBranch(maze, terminal, graph.degreeByKey));
  const deadEndDepths = branches.map((branch) => branch.depth);
  const deceptiveBranches = branches.filter((branch) => (
    branch.firstStepFromRoot !== null
    && resolveManhattanDistance(branch.firstStepFromRoot, maze.goal) < resolveManhattanDistance(branch.root, maze.goal)
  ));

  const turning = resolveTurningMetrics(path);
  const cycleRank = Math.max(0, graph.edgeCount - graph.walkableTileCount + 1);

  let wrapPairsOnRoute = 0;
  for (let index = 1; index < path.length; index += 1) {
    if (resolveManhattanDistance(path[index - 1]!, path[index]!) !== 1) {
      wrapPairsOnRoute += 1;
    }
  }

  const metricsWithoutFingerprint: Omit<MazeV2MeasuredMetrics, 'metricFingerprint'> = {
    contractVersion: 'mazev2-contract-v2',
    spatial: {
      width: maze.width,
      height: maze.height,
      walkableTileCount: graph.walkableTileCount,
      floorRatio
    },
    route: {
      shortestPathLength,
      manhattanDistance,
      detourRatio,
      routeCoverage,
      // A generic canonical maze has no separate "direct floor" concept
      // distinct from its one measured route -- see this module's own
      // header comment. Set equal to the playable pair rather than left at
      // a misleading 0, so a comparison report that happens to read this
      // field doesn't see a false "huge divergence" for every domain/maze
      // sample.
      directFloorPathLength: shortestPathLength,
      directFloorDetourRatio: detourRatio
    },
    decision: {
      junctionCount,
      junctionDensity: junctionCount / Math.max(1, graph.walkableTileCount),
      routeJunctionCount,
      meanJunctionDegree: junctionDegrees.length > 0
        ? junctionDegrees.reduce((total, value) => total + value, 0) / junctionDegrees.length
        : 0,
      maxJunctionDegree: junctionDegrees.length > 0 ? Math.max(...junctionDegrees) : 0
    },
    deadEnd: {
      deadEndCount: terminals.length,
      meanDeadEndDepth: deadEndDepths.length > 0
        ? deadEndDepths.reduce((total, value) => total + value, 0) / deadEndDepths.length
        : 0,
      maxDeadEndDepth: deadEndDepths.length > 0 ? Math.max(...deadEndDepths) : 0,
      deceptiveBranchFraction: terminals.length > 0 ? deceptiveBranches.length / terminals.length : 0
    },
    turning,
    ambiguity: { cycleRank },
    shortcut: {
      // Neither adapter currently reports a construction-time shortcut
      // count into MazeV2CanonicalMaze (that's an engine-internal
      // bookkeeping detail, not part of the neutral shape) -- 0 rather
      // than a guess. Wave 2's own generator, built against this contract
      // from the start, should report this directly instead of it being
      // inferred after the fact.
      shortcutCount: 0,
      routeLengthReduction: 0
    },
    wrap: {
      wrapPairCount: maze.wrapPairs.length,
      wrapPairsOnRoute,
      wrapRouteImpact: null
    }
  };

  return {
    ...metricsWithoutFingerprint,
    metricFingerprint: createMazeV2MetricFingerprint(metricsWithoutFingerprint)
  };
};
