import { describe, expect, test } from 'vitest';
import {
  auditLegacyCompletedRouteAgainstPlayableShortestPath,
  createLegacyGeneratedMenuMaze,
  createLegacyMaze,
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath,
  resolveLegacyWalkableGridNeighbors,
  resolveLegacyWrapTopologyDiagnostics,
  type LegacyMazeGenerationProfile,
  type LegacyPoint
} from '../../src/legacy-runtime/legacyMaze';

const createGrid = (size: number): boolean[][] => (
  Array.from({ length: size }, () => Array.from({ length: size }, () => false))
);

const carve = (grid: boolean[][], points: readonly LegacyPoint[]): void => {
  for (const point of points) {
    grid[point.y]![point.x] = true;
  }
};

const horizontalLine = (size: number, y: number): LegacyPoint[] => (
  Array.from({ length: size }, (_, x) => ({ x, y }))
);

const verticalLine = (size: number, x: number): LegacyPoint[] => (
  Array.from({ length: size }, (_, y) => ({ x, y }))
);

describe('legacy wrap topology diagnostics', () => {
  test('keeps the fixed horizontal, vertical, multi-route, one-sided-invalid, and historical shortcut anomaly pack explicit', () => {
    const size = 11;
    const horizontalGrid = createGrid(size);
    const horizontalRoute = horizontalLine(size, 2);
    carve(horizontalGrid, horizontalRoute);
    const horizontal = resolveLegacyWrapTopologyDiagnostics({
      grid: horizontalGrid,
      size,
      start: horizontalRoute[0]!,
      goal: horizontalRoute.at(-1)!,
      solutionPath: horizontalRoute
    }, { horizontal: true, vertical: false });

    expect(horizontal.horizontal).toMatchObject({ endpointCount: 2, pairCount: 1, requiredSatisfied: true, unpairedEndpoints: [] });
    expect(horizontal.vertical).toMatchObject({ endpointCount: 0, pairCount: 0, requiredSatisfied: true, unpairedEndpoints: [] });
    expect(horizontal).toMatchObject({
      contractVersion: 'legacy-wrap-topology-v1',
      directShortestStepCount: 10,
      graphPolicy: 'playable-wrap-aware',
      graphTopologyValid: true,
      playableShortestStepCount: 1,
      playableShortcutDelta: 9,
      solutionPathPolicy: 'direct-floor'
    });
    expect(horizontal.solutionRouteAudit).toMatchObject({ validCompletedRoute: true, lowerBoundSatisfied: true });

    const verticalGrid = createGrid(size);
    const verticalRoute = verticalLine(size, 2);
    carve(verticalGrid, verticalRoute);
    const vertical = resolveLegacyWrapTopologyDiagnostics({
      grid: verticalGrid,
      size,
      start: verticalRoute[0]!,
      goal: verticalRoute.at(-1)!,
      solutionPath: verticalRoute
    }, { horizontal: false, vertical: true });
    expect(vertical.vertical).toMatchObject({ endpointCount: 2, pairCount: 1, requiredSatisfied: true, unpairedEndpoints: [] });
    expect(vertical.graphTopologyValid).toBe(true);

    const multiRouteGrid = createGrid(size);
    carve(multiRouteGrid, horizontalRoute);
    carve(multiRouteGrid, verticalRoute);
    const multiRoute = resolveLegacyWrapTopologyDiagnostics({
      grid: multiRouteGrid,
      size,
      start: horizontalRoute[0]!,
      goal: horizontalRoute.at(-1)!,
      solutionPath: horizontalRoute
    }, { horizontal: true, vertical: true });
    expect(multiRoute.horizontal.pairCount).toBe(1);
    expect(multiRoute.vertical.pairCount).toBe(1);
    expect(multiRoute.graphTopologyValid).toBe(true);

    const oneSidedGrid = createGrid(size);
    const oneSidedRoute = horizontalLine(6, 2);
    carve(oneSidedGrid, oneSidedRoute);
    const oneSided = resolveLegacyWrapTopologyDiagnostics({
      grid: oneSidedGrid,
      size,
      start: oneSidedRoute[0]!,
      goal: oneSidedRoute.at(-1)!,
      solutionPath: oneSidedRoute
    }, { horizontal: false, vertical: false });
    expect(oneSided.horizontal.unpairedEndpoints).toEqual([{ x: 0, y: 2 }]);
    expect(oneSided.graphTopologyValid).toBe(false);
    expect(resolveLegacyWalkableGridNeighbors(oneSidedGrid, { x: 0, y: 2 })).not.toContainEqual({ x: size - 1, y: 2 });

    const historicalGrid = [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, true, true, true, true]
    ];
    const historicalStart = { x: 0, y: 1 };
    const historicalGoal = { x: 4, y: 1 };
    expect(resolveLegacyShortestPath(historicalGrid, historicalStart, historicalGoal, 'direct-floor').stepCount).toBe(6);
    expect(resolveLegacyPlayableShortestPath(historicalGrid, historicalStart, historicalGoal)).toMatchObject({
      found: true,
      path: [historicalStart, historicalGoal],
      stepCount: 1
    });
  });

  test('deduplicates narrow-grid neighbors without inventing self-wraps', () => {
    const neighbors = resolveLegacyWalkableGridNeighbors([
      [true, true],
      [true, true]
    ], { x: 0, y: 0 });

    expect(neighbors).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 }
    ]);
    expect(new Set(neighbors.map((point) => `${point.x},${point.y}`)).size).toBe(neighbors.length);
    expect(neighbors).not.toContainEqual({ x: 0, y: 0 });
  });

  test('rejects an illegal completed-path shortcut and certifies legal routes against the playable lower bound', () => {
    const size = 11;
    const grid = createGrid(size);
    const solutionPath = Array.from({ length: 9 }, (_, offset) => ({ x: offset + 1, y: 5 }));
    carve(grid, solutionPath);
    const maze = {
      grid,
      start: solutionPath[0]!,
      goal: solutionPath.at(-1)!
    };

    expect(auditLegacyCompletedRouteAgainstPlayableShortestPath(maze, solutionPath)).toMatchObject({
      actualStepCount: 8,
      firstIllegalStepIndex: null,
      lowerBoundSatisfied: true,
      playableShortestStepCount: 8,
      validCompletedRoute: true
    });
    expect(auditLegacyCompletedRouteAgainstPlayableShortestPath(maze, [maze.start, maze.goal])).toMatchObject({
      actualStepCount: 1,
      firstIllegalStepIndex: 1,
      lowerBoundSatisfied: false,
      playableShortestStepCount: 8,
      validCompletedRoute: false
    });
  });

  test('publishes deterministic diagnostics across play/menu seed, scale, and required-axis bands', () => {
    const profiles: LegacyMazeGenerationProfile['requiredOppositeBorderConnections'][] = [
      { horizontal: false, vertical: false },
      { horizontal: true, vertical: false },
      { horizontal: false, vertical: true },
      { horizontal: true, vertical: true }
    ];
    const failures: unknown[] = [];

    for (const scale of [25, 37]) {
      for (const seed of [1, 13]) {
        for (const requiredOppositeBorderConnections of profiles) {
          const generationProfile = {
            borderFeederTargetPerSide: 0,
            requiredOppositeBorderConnections
          };
          for (const [kind, build] of [
            ['play', createLegacyMaze],
            ['menu', createLegacyGeneratedMenuMaze]
          ] as const) {
            const maze = build(scale, seed, undefined, generationProfile);
            const diagnostics = maze.wrapTopologyDiagnostics;
            const recomputed = resolveLegacyWrapTopologyDiagnostics(
              maze,
              requiredOppositeBorderConnections
            );
            if (
              !diagnostics
              || JSON.stringify(diagnostics) !== JSON.stringify(recomputed)
              || diagnostics.horizontal.required !== requiredOppositeBorderConnections.horizontal
              || diagnostics.vertical.required !== requiredOppositeBorderConnections.vertical
              || (requiredOppositeBorderConnections.horizontal && diagnostics.horizontal.pairCount < 1)
              || (requiredOppositeBorderConnections.vertical && diagnostics.vertical.pairCount < 1)
              || !diagnostics.graphTopologyValid
              || diagnostics.cornerBorderFloors.length > 0
              || diagnostics.horizontal.unpairedEndpoints.length > 0
              || diagnostics.vertical.unpairedEndpoints.length > 0
              || diagnostics.inwardDisconnectedEndpoints.length > 0
              || !diagnostics.solutionRouteAudit.validCompletedRoute
              || !diagnostics.solutionRouteAudit.lowerBoundSatisfied
              || diagnostics.solutionRouteAudit.actualStepCount !== maze.solutionPath.length - 1
              || diagnostics.directShortestStepCount !== maze.solutionPath.length - 1
              || diagnostics.playableShortestStepCount === null
              || diagnostics.playableShortestStepCount > diagnostics.directShortestStepCount
            ) {
              failures.push({ diagnostics, kind, requiredOppositeBorderConnections, scale, seed });
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  }, 30_000);
});
