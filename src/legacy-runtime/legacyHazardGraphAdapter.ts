// DRAFT P3 adapter: projects a production legacy maze onto the dormant hazard
// graph contract (src/mazer-core/hazards). Not imported by any scene.
import {
  createHazardGraph,
  type HazardCellId,
  type HazardGraph
} from '../mazer-core/hazards/graphContract';
import {
  resolveLegacyWalkableGridNeighbors,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';

export type LegacyHazardGraphSource = Pick<LegacyMazeSnapshot, 'grid' | 'start' | 'goal'>;

export interface LegacyMazeHazardGraph {
  readonly graph: HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
}

export const legacyPointToHazardCell = (graph: HazardGraph, point: LegacyPoint): HazardCellId => (
  graph.cellId(point.x, point.y)
);

export const hazardCellToLegacyPoint = (graph: HazardGraph, cell: HazardCellId): LegacyPoint => ({
  x: graph.cellX(cell),
  y: graph.cellY(cell)
});

/** Dimensions come from the grid itself (the production snapshot's own source of truth). */
export const createLegacyMazeHazardGraph = (maze: LegacyHazardGraphSource): LegacyMazeHazardGraph => {
  const height = maze.grid.length;
  const width = maze.grid[0]?.length ?? 0;
  const graph = createHazardGraph({ width, height, grid: maze.grid });
  return {
    graph,
    start: legacyPointToHazardCell(graph, maze.start),
    goal: legacyPointToHazardCell(graph, maze.goal)
  };
};

/**
 * Differences between the hazard graph and production movement
 * (`resolveLegacyWalkableGridNeighbors`), as human-readable strings. Empty means
 * the neighbour sets are identical for every walkable cell. Intended for tests
 * and generation-time assertions.
 */
export const findHazardGraphLegacyMismatches = (
  graph: HazardGraph,
  maze: Pick<LegacyMazeSnapshot, 'grid'>
): string[] => {
  const mismatches: string[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    const point = hazardCellToLegacyPoint(graph, cell);
    const walkable = maze.grid[point.y]?.[point.x] === true;
    if (walkable !== graph.isWalkable(cell)) {
      mismatches.push(`walkable mismatch at ${point.x},${point.y}`);
      continue;
    }
    if (!walkable) {
      continue;
    }
    const production = resolveLegacyWalkableGridNeighbors(maze.grid, point)
      .map((neighbor) => graph.cellId(neighbor.x, neighbor.y))
      .sort((left, right) => left - right);
    const ours = [...graph.neighbors(cell)].sort((left, right) => left - right);
    if (production.length !== ours.length || production.some((value, index) => value !== ours[index])) {
      mismatches.push(`neighbor mismatch at ${point.x},${point.y}`);
    }
  }
  return mismatches;
};
