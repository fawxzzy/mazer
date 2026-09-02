// Wave 1 metrics bridge: measures an ALREADY-GENERATED
// legacy-runtime LegacyMazeSnapshot (today's real generator output) against
// the new mazeV2 measured-metrics contract. This exists to validate the
// metric formulas and produce a real baseline (via
// scripts/analysis/mazev2-lab.mjs) before Wave 2's new generator exists --
// it does not generate anything itself, and nothing in production gameplay
// depends on it.
//
// Wave 1.5 correction (2026-08-28): route/turning/junction/wrap metrics now
// measure the playable, wrap-aware shortest route
// (resolveLegacyPlayableShortestPath) instead of maze.solutionPath, which
// is the generator's own direct-floor construction route
// (solutionPathPolicy: 'direct-floor') and is not wrap-aware -- it can
// disagree with what a player can actually walk once wrap/bleed topology
// exists. The direct-floor route is still exposed, separately and clearly
// labeled, under route.directFloorPathLength/directFloorDetourRatio for
// comparison. Also corrected: ambiguity no longer exposes a mislabeled
// "alternateRouteCount" (cycle rank is not an upper bound on simple
// start-to-goal paths -- see MazeV2AmbiguityMetrics's own comment), and
// dead-end deception now compares the branch's first step (not its
// terminal) against its root, matching MazeV2DeadEndMetrics's documented
// definition.
//
// Some axes here are exact (spatial, route, decision, turning, wrap --
// all directly computable from the grid/playable-route/wrap-topology data
// legacy-runtime already produces). One is deliberately approximate, and
// said so at its computation:
//   - shortcut.routeLengthReduction: a true measurement needs a
//     counterfactual "the same maze without its carved shortcuts" to diff
//     against, which this bridge does not regenerate. It reports null when
//     shortcuts exist but their reduction is unmeasured, and 0 only when
//     no shortcuts exist. The independent wrap-only delta remains under
//     wrap.wrapRouteImpact and is never relabeled as shortcut reduction.
// Wave 2's generator should compute this directly from its own
// construction process instead of inferring it after the fact.

import {
  resolveLegacyPlayableShortestPath,
  resolveLegacyWalkableGridNeighbors,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from '../../legacy-runtime/legacyMaze';
import { deriveMazeV2CanonicalMazeFromLegacySnapshot } from './canonicalMaze';
import { createMazeV2MetricFingerprint, createMazeV2RecipeDigest, createMazeV2TopologyFingerprint } from './hashing';
import {
  MAZE_V2_CONTRACT_VERSION,
  MAZE_V2_GENERATOR_VERSION,
  type MazeV2CandidateReview,
  type MazeV2MeasuredMetrics,
  type MazeV2RecipeDigest
} from './types';

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

const resolveTurnHeading = (
  from: LegacyPoint,
  to: LegacyPoint,
  width: number,
  height: number
): string => {
  const rawDx = to.x - from.x;
  const rawDy = to.y - from.y;
  const dx = from.y === to.y && width > 2 && Math.abs(rawDx) === width - 1
    ? -Math.sign(rawDx)
    : Math.sign(rawDx);
  const dy = from.x === to.x && height > 2 && Math.abs(rawDy) === height - 1
    ? -Math.sign(rawDy)
    : Math.sign(rawDy);
  return `${dx},${dy}`;
};

const resolveTurningMetrics = (solutionPath: readonly LegacyPoint[], width: number, height: number) => {
  if (solutionPath.length < 3) {
    return { turnCount: 0, turnRatio: 0, meanStraightRunLength: Math.max(0, solutionPath.length - 1), maxStraightRunLength: Math.max(0, solutionPath.length - 1), straightRunLengthVariance: 0 };
  }

  const runLengths: number[] = [];
  let turnCount = 0;
  let currentHeading = resolveTurnHeading(solutionPath[0]!, solutionPath[1]!, width, height);
  let currentRunLength = 1;
  for (let index = 1; index < solutionPath.length - 1; index += 1) {
    const nextHeading = resolveTurnHeading(solutionPath[index]!, solutionPath[index + 1]!, width, height);
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
// (degree >= 3) or exhausts the grid, returning the branch root, the number
// of steps from root to terminal, and the branch's first step away from
// root (the tile one step into the branch, toward the terminal) -- distinct
// from the terminal itself once the branch is more than one tile deep.
const resolveDeadEndBranch = (
  grid: boolean[][],
  terminal: LegacyPoint,
  degreeByKey: Map<string, number>
): { root: LegacyPoint; depth: number; firstStepFromRoot: LegacyPoint | null } => {
  let depth = 0;
  let previous: LegacyPoint | null = null;
  let current = terminal;
  for (;;) {
    const neighbors = resolveLegacyWalkableGridNeighbors(grid, current)
      .filter((neighbor) => previous === null || pointKey(neighbor) !== pointKey(previous!));
    const next = neighbors[0];
    const nextDegree = next ? degreeByKey.get(pointKey(next)) ?? 0 : 0;
    if (!next || nextDegree !== 2) {
      // `current` is always the neighbor-of-root that lies one step into
      // the branch (root not yet reassigned this iteration) -- exactly the
      // branch's first step away from root. When there's no `next` at all
      // (an isolated tile, not expected given upstream connectivity
      // guarantees but handled defensively), there is no root distinct
      // from the terminal to compare against, so this is null.
      return { root: next ?? current, depth: depth + (next ? 1 : 0), firstStepFromRoot: next ? current : null };
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

  // The playable, wrap-aware route -- what the player can actually walk,
  // including any wrap/bleed border connections. `found` should always be
  // true here (legacy-runtime guarantees connectivity before a maze reaches
  // this analyzer); fall back to the direct-floor route defensively rather
  // than crash if that guarantee is ever violated.
  const playableResult = resolveLegacyPlayableShortestPath(grid, start, goal);
  const playablePath = playableResult.found && playableResult.path.length > 0 ? playableResult.path : solutionPath;

  const manhattanDistance = resolveManhattanDistance(start, goal);
  const shortestPathLength = Math.max(0, playablePath.length - 1);
  const detourRatio = shortestPathLength / Math.max(1, manhattanDistance);
  const routeCoverage = playablePath.length / Math.max(1, graph.walkableTileCount);

  const directFloorPathLength = Math.max(0, solutionPath.length - 1);
  const directFloorDetourRatio = directFloorPathLength / Math.max(1, manhattanDistance);

  const junctionKeys = [...graph.degreeByKey.entries()].filter(([, degree]) => degree >= 3);
  const junctionCount = junctionKeys.length;
  const junctionDegrees = junctionKeys.map(([, degree]) => degree);
  const routeJunctionCount = playablePath.filter((point) => (graph.degreeByKey.get(pointKey(point)) ?? 0) >= 3).length;

  const terminals = [...graph.degreeByKey.entries()]
    .filter(([key, degree]) => degree === 1 && key !== pointKey(start) && key !== pointKey(goal))
    .map(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  const branches = terminals.map((terminal) => resolveDeadEndBranch(grid, terminal, graph.degreeByKey));
  const deadEndDepths = branches.map((branch) => branch.depth);
  // Deceptive = the branch's FIRST STEP moves closer to the goal than its
  // root does -- "looks like the real route at a glance," matching
  // MazeV2DeadEndMetrics.deceptiveBranchFraction's documented definition.
  // Not the branch's terminal distance (an earlier version compared that
  // instead, which measures something closer to "does this dead end
  // eventually get you nearer the goal," a different and less useful
  // question -- most of a branch's deceptiveness is felt on the first
  // step, not its dead stop).
  const deceptiveBranches = branches.filter((branch) => (
    branch.firstStepFromRoot !== null
    && resolveManhattanDistance(branch.firstStepFromRoot, goal) < resolveManhattanDistance(branch.root, goal)
  ));

  const turning = resolveTurningMetrics(playablePath, width, height);

  // Cycle rank (first Betti number) assumes one connected component --
  // legacy-runtime's own playableTopologyStats already guarantees full
  // connectivity for any maze that reached this analyzer, so this doesn't
  // re-verify it.
  const cycleRank = Math.max(0, graph.edgeCount - graph.walkableTileCount + 1);

  const shortcutCount = maze.shortcutsCreated ?? maze.shortcutStats?.created ?? 0;
  const wrapDiagnostics = maze.wrapTopologyDiagnostics;
  const wrapPairCount = (wrapDiagnostics?.horizontal.pairCount ?? 0) + (wrapDiagnostics?.vertical.pairCount ?? 0);
  let wrapPairsOnRoute = 0;
  for (let index = 1; index < playablePath.length; index += 1) {
    if (resolveManhattanDistance(playablePath[index - 1]!, playablePath[index]!) !== 1) {
      wrapPairsOnRoute += 1;
    }
  }

  const metricsWithoutFingerprint: Omit<MazeV2MeasuredMetrics, 'metricFingerprint'> = {
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
      routeCoverage,
      directFloorPathLength,
      directFloorDetourRatio
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
    // See MazeV2AmbiguityMetrics's own comment: cycleRank is exposed alone,
    // not relabeled as an alternate-route count -- it isn't a valid upper
    // bound on one.
    ambiguity: { cycleRank },
    shortcut: {
      shortcutCount,
      // A wrap-only route delta is not evidence about carved shortcuts.
      // Report unmeasured (null) when shortcuts exist, and 0 only when the
      // engine reports that no shortcuts were created.
      routeLengthReduction: shortcutCount > 0 ? null : 0
    },
    wrap: {
      wrapPairCount,
      wrapPairsOnRoute,
      wrapRouteImpact: wrapDiagnostics?.playableShortcutDelta ?? null
    }
  };

  return {
    ...metricsWithoutFingerprint,
    metricFingerprint: createMazeV2MetricFingerprint(metricsWithoutFingerprint)
  };
};

// Exact topology identity -- distinct from metricFingerprint above (which
// hashes the MEASURED METRIC VECTOR, so two genuinely different mazes with
// coincidentally-identical rounded metrics collide there without being the
// same maze) and from the recipe digest below (which identifies the RECIPE
// that was asked for, seed included). This hashes ONLY the actual graph --
// dimensions, walkable layout, start, goal -- so it only collides when the
// generator handed back the literal same maze, regardless of what seed
// produced it. Wave 1.5 correction: an earlier version of this function
// included maze.seed in the hashed value, which meant two different seeds
// that happened to produce the identical graph would NOT collide here --
// backwards for a field whose whole job is topology identity, not
// generation provenance (see MazeV2TopologyFingerprint's own doc comment in
// types.ts). Confirmed via tests/mazeV2/identity.test.ts that two distinct
// requested seeds selecting the same underlying graph now produce the same
// topology fingerprint.
export const computeLegacyMazeTopologyFingerprint = (
  maze: Pick<LegacyMazeSnapshot, 'width' | 'height' | 'grid' | 'start' | 'goal'>
) => {
  const canonicalMaze = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
  return createMazeV2TopologyFingerprint({
    width: canonicalMaze.width,
    height: canonicalMaze.height,
    start: canonicalMaze.start,
    goal: canonicalMaze.goal,
    walkable: canonicalMaze.walkable.map((row) => row.map((tile) => (tile ? '1' : '0')).join('')),
    wrapPairs: canonicalMaze.wrapPairs
  });
};

// Reconstructs the exact candidate seeds legacyGenerationLifecycle.ts's own
// bounded candidate search examined, from the requested seed the caller
// asked for (authoritative -- every caller that generates a maze already
// knows what seed it requested) and the counts LegacyMazeSnapshot.generation.selection
// already exposes -- without needing that module to separately export the
// list itself. Mirrors selectLegacyRuntimeMazeForMode's own inspectCandidate
// loop exactly: the initial window uses requestedSeed + index for
// index in [0, candidateCount), a pressure retry (if run) continues from
// requestedSeed + candidateCount, and an adaptive retry (if run) continues
// from there -- each computed with the same `>>> 0` unsigned wrap. Falls
// back to just [requestedSeed, selectedSeed] when the maze wasn't generated
// through the selection path at all (no generation.selection present, e.g.
// a maze built without a target-complexity search).
export const buildMazeV2CandidateReview = (
  maze: Pick<LegacyMazeSnapshot, 'seed' | 'generation'>,
  requestedSeed: number,
  generationDurationMs: number
): MazeV2CandidateReview => {
  const selection = maze.generation?.selection;
  const candidateSeeds: number[] = [];
  if (selection) {
    const totalCandidates = selection.candidateCount
      + selection.pressureRetryCandidateCount
      + selection.adaptiveRetryCandidateCount;
    for (let index = 0; index < totalCandidates; index += 1) {
      candidateSeeds.push((requestedSeed + index) >>> 0);
    }
  }
  if (!candidateSeeds.includes(maze.seed)) {
    candidateSeeds.push(maze.seed);
  }

  return {
    requestedSeed,
    selectedSeed: maze.seed,
    candidateSeeds,
    targetFitDistance: selection?.selectedDistance ?? 0,
    noveltyDistance: null,
    generationDurationMs,
    invariantFailures: []
  };
};

// Durable recipe provenance for the legacy-runtime bridge. Digests the
// fields this bridge actually has available (there is no
// MazeV2ResolvedGenerationContract yet -- nothing builds one; Wave 2's
// recipe resolver is what would produce a real one) rather than fabricating
// values for fields the bridge cannot resolve. Deliberately excludes
// measured outcome -- see MazeV2RecipeDigest's own doc comment.
export const computeLegacyMazeRecipeDigest = (
  maze: Pick<LegacyMazeSnapshot, 'width' | 'height' | 'seed'>,
  level: string,
  requestedSeed: number,
  targetComplexity: number,
  scale: number
): MazeV2RecipeDigest => (
  createMazeV2RecipeDigest({
    generatorVersion: MAZE_V2_GENERATOR_VERSION,
    contractVersion: MAZE_V2_CONTRACT_VERSION,
    level,
    requestedSeed,
    selectedSeed: maze.seed,
    width: maze.width,
    height: maze.height,
    targetComplexity,
    scale
  })
);
