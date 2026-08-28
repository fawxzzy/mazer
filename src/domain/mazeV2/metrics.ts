// Wave 1 metrics bridge: measures an ALREADY-GENERATED
// legacy-runtime LegacyMazeSnapshot (today's real generator output) against
// the new mazeV2 measured-metrics contract. This exists to validate the
// metric formulas and produce a real baseline (via
// scripts/analysis/mazev2-lab.mjs) before Wave 2's new generator exists --
// it does not generate anything itself, and nothing in production gameplay
// depends on it.
//
// Some axes here are exact (spatial, route, decision, turning, wrap --
// all directly computable from the grid/solution-path/wrap-topology data
// legacy-runtime already produces). Two are deliberately approximate, and
// said so at each computation:
//   - ambiguity.alternateRouteCount: exact route enumeration is
//     combinatorially expensive in general; cycle rank is used as an
//     upper-bound proxy (every independent cycle is a POTENTIAL alternate
//     route, not a guaranteed meaningfully-different one).
//   - shortcut.routeLengthReduction: a true measurement needs a
//     counterfactual "the same maze without its shortcuts" to diff
//     against, which this bridge does not regenerate. Falls back to the
//     wrap-topology system's own already-exact playableShortcutDelta where
//     available (wrap shortcuts only), else 0.
// Wave 2's generator should compute both directly from its own
// construction process instead of inferring them after the fact.

import { resolveLegacyWalkableGridNeighbors, type LegacyMazeSnapshot, type LegacyPoint } from '../../legacy-runtime/legacyMaze';
import { hashMazeV2Value } from './hashing';
import { MAZE_V2_CONTRACT_VERSION, type MazeV2MeasuredMetrics } from './types';

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const resolveManhattanDistance = (left: LegacyPoint, right: LegacyPoint): number => (
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
);

interface WalkableGraphSummary {
  degreeByKey: Map<string, number>;
  walkableTileCount: number;
  edgeCount: number;
}

// Degree = count of wrap-aware walkable neighbors. One pass over every
// walkable tile; each edge is discovered from both endpoints, so
// edgeCount = (sum of degrees) / 2.
const summarizeWalkableGraph = (grid: boolean[][]): WalkableGraphSummary => {
  const degreeByKey = new Map<string, number>();
  let walkableTileCount = 0;
  let degreeSum = 0;
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y]!;
    for (let x = 0; x < row.length; x += 1) {
      if (!row[x]) {
        continue;
      }
      walkableTileCount += 1;
      const degree = resolveLegacyWalkableGridNeighbors(grid, { x, y }).length;
      degreeByKey.set(`${x},${y}`, degree);
      degreeSum += degree;
    }
  }
  return { degreeByKey, walkableTileCount, edgeCount: degreeSum / 2 };
};

const resolveTurnHeading = (from: LegacyPoint, to: LegacyPoint): string => (
  `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`
);

const resolveTurningMetrics = (solutionPath: readonly LegacyPoint[]) => {
  if (solutionPath.length < 3) {
    return { turnCount: 0, turnRatio: 0, meanStraightRunLength: Math.max(0, solutionPath.length - 1), maxStraightRunLength: Math.max(0, solutionPath.length - 1), straightRunLengthVariance: 0 };
  }

  const runLengths: number[] = [];
  let turnCount = 0;
  let currentHeading = resolveTurnHeading(solutionPath[0]!, solutionPath[1]!);
  let currentRunLength = 1;
  for (let index = 1; index < solutionPath.length - 1; index += 1) {
    const nextHeading = resolveTurnHeading(solutionPath[index]!, solutionPath[index + 1]!);
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
    turnRatio: turnCount / Math.max(1, solutionPath.length - 2),
    meanStraightRunLength,
    maxStraightRunLength,
    straightRunLengthVariance: variance
  };
};

// Walks backward from a degree-1 terminal along its unique corridor (every
// intermediate tile has degree exactly 2) until it reaches a junction
// (degree >= 3) or exhausts the grid, returning the branch root and the
// number of steps from root to terminal.
const resolveDeadEndBranch = (
  grid: boolean[][],
  terminal: LegacyPoint,
  degreeByKey: Map<string, number>
): { root: LegacyPoint; depth: number } => {
  let depth = 0;
  let previous: LegacyPoint | null = null;
  let current = terminal;
  for (;;) {
    const neighbors = resolveLegacyWalkableGridNeighbors(grid, current)
      .filter((neighbor) => previous === null || pointKey(neighbor) !== pointKey(previous!));
    const next = neighbors[0];
    const nextDegree = next ? degreeByKey.get(pointKey(next)) ?? 0 : 0;
    if (!next || nextDegree !== 2) {
      return { root: next ?? current, depth: depth + (next ? 1 : 0) };
    }
    previous = current;
    current = next;
    depth += 1;
  }
};

export const analyzeLegacyMazeAsMazeV2Metrics = (maze: LegacyMazeSnapshot): MazeV2MeasuredMetrics => {
  const { grid, width, height, start, goal, solutionPath } = maze;
  const graph = summarizeWalkableGraph(grid);
  const floorRatio = graph.walkableTileCount / Math.max(1, width * height);

  const shortestPathLength = Math.max(0, solutionPath.length - 1);
  const manhattanDistance = resolveManhattanDistance(start, goal);
  const detourRatio = shortestPathLength / Math.max(1, manhattanDistance);
  const routeCoverage = solutionPath.length / Math.max(1, graph.walkableTileCount);

  const junctionKeys = [...graph.degreeByKey.entries()].filter(([, degree]) => degree >= 3);
  const junctionCount = junctionKeys.length;
  const junctionDegrees = junctionKeys.map(([, degree]) => degree);
  const routeJunctionCount = solutionPath.filter((point) => (graph.degreeByKey.get(pointKey(point)) ?? 0) >= 3).length;

  const terminals = [...graph.degreeByKey.entries()]
    .filter(([key, degree]) => degree === 1 && key !== pointKey(start) && key !== pointKey(goal))
    .map(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  const branches = terminals.map((terminal) => resolveDeadEndBranch(grid, terminal, graph.degreeByKey));
  const deadEndDepths = branches.map((branch) => branch.depth);
  const deceptiveBranches = branches.filter((branch) => {
    const rootDistance = resolveManhattanDistance(branch.root, goal);
    const terminalTerminalPoint = terminals[branches.indexOf(branch)]!;
    return resolveManhattanDistance(terminalTerminalPoint, goal) < rootDistance;
  });

  const turning = resolveTurningMetrics(solutionPath);

  // Cycle rank (first Betti number) assumes one connected component --
  // legacy-runtime's own playableTopologyStats already guarantees full
  // connectivity for any maze that reached this analyzer, so this doesn't
  // re-verify it.
  const cycleRank = Math.max(0, graph.edgeCount - graph.walkableTileCount + 1);

  const shortcutCount = maze.shortcutsCreated ?? maze.shortcutStats?.created ?? 0;
  const wrapDiagnostics = maze.wrapTopologyDiagnostics;
  const wrapPairCount = (wrapDiagnostics?.horizontal.pairCount ?? 0) + (wrapDiagnostics?.vertical.pairCount ?? 0);
  let wrapPairsOnRoute = 0;
  for (let index = 1; index < solutionPath.length; index += 1) {
    if (resolveManhattanDistance(solutionPath[index - 1]!, solutionPath[index]!) !== 1) {
      wrapPairsOnRoute += 1;
    }
  }

  const metricsWithoutFingerprint: Omit<MazeV2MeasuredMetrics, 'structuralFingerprint'> = {
    contractVersion: MAZE_V2_CONTRACT_VERSION,
    spatial: {
      width,
      height,
      walkableTileCount: graph.walkableTileCount,
      floorRatio
    },
    route: {
      shortestPathLength,
      manhattanDistance,
      detourRatio,
      routeCoverage
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
    ambiguity: {
      cycleRank,
      // See module header: an upper-bound proxy, not exact enumeration.
      alternateRouteCount: cycleRank
    },
    shortcut: {
      shortcutCount,
      // See module header: exact only when the wrap-topology system's own
      // playableShortcutDelta applies; 0 otherwise rather than a guess.
      routeLengthReduction: wrapDiagnostics?.playableShortcutDelta ?? 0
    },
    wrap: {
      wrapPairCount,
      wrapPairsOnRoute,
      wrapRouteImpact: wrapDiagnostics?.playableShortcutDelta ?? null
    }
  };

  return {
    ...metricsWithoutFingerprint,
    structuralFingerprint: hashMazeV2Value(metricsWithoutFingerprint)
  };
};
