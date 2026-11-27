// DRAFT P3 adapter: projects a production legacy maze onto the dormant hazard
// graph contract (src/mazer-core/hazards). Not imported by any scene.
// Slice 5 (first-time cards spec D8): a maze's Switch-gated wrap openings are walled
// for every graph built here, so no hazard relies on a path the player cannot see.
import {
  createHazardGraph,
  type HazardCellId,
  type HazardGraph
} from '../mazer-core/hazards/graphContract';
import { resolveLegacyBleedGateBorderCells, type LegacyBleedGate } from './legacyBleedGateState';
import {
  resolveLegacyWalkableGridNeighbors,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';

/**
 * What the adapter reads from a maze. `bleedGates` (optional) are the maze's Switches: when present, the graph is
 * built on the masked grid (`maskLegacyBleedGatedCells`), so every hazard placed through the adapter treats the
 * wrap path behind an unlit Switch as blocked (first-time cards spec D8 / K3, slice 5).
 */
export type LegacyHazardGraphSource = Pick<LegacyMazeSnapshot, 'grid' | 'start' | 'goal'> & {
  readonly bleedGates?: readonly Pick<LegacyBleedGate, 'axis' | 'line'>[];
};

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

/**
 * The grid with the two openings of every bleed-gated wrap path walled (first-time cards spec D8 / K3): a wrap
 * behind an unlit Switch counts as blocked, so a route proved on this grid never needs it. Reads the gates
 * from the maze (`resolveLegacyBleedGateBorderCells`), never the runtime lit state, so the result is
 * deterministic per maze. Returns `grid` itself when there are no gates; never mutates it.
 */
export const maskLegacyBleedGatedCells = (
  grid: boolean[][],
  bleedGates: readonly Pick<LegacyBleedGate, 'axis' | 'line'>[] | undefined
): boolean[][] => {
  if (!bleedGates || bleedGates.length === 0) {
    return grid;
  }
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const masked = grid.map((row) => [...row]);
  for (const gate of bleedGates) {
    for (const cell of resolveLegacyBleedGateBorderCells(gate, width, height)) {
      if (masked[cell.y]?.[cell.x] === true) {
        masked[cell.y]![cell.x] = false;
      }
    }
  }
  return masked;
};

/**
 * Dimensions come from the grid itself (the production snapshot's own source of truth). A maze with Switches is
 * built on the masked grid: the two openings of each gated wrap are walls, whatever the runtime lit state (a lit
 * Switch can only shorten a run, so hazards keep treating that wrap as a wall). Pass `bleedGates: []` to read the
 * open grid on purpose (a comparison in a test or a sweep).
 */
export const createLegacyMazeHazardGraph = (maze: LegacyHazardGraphSource): LegacyMazeHazardGraph => {
  const grid = maskLegacyBleedGatedCells(maze.grid, maze.bleedGates);
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const graph = createHazardGraph({ width, height, grid });
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
 * and generation-time assertions. With `bleedGates`, production movement is read
 * on the same masked grid the adapter builds from (every Switch unlit).
 */
export const findHazardGraphLegacyMismatches = (
  graph: HazardGraph,
  maze: Pick<LegacyHazardGraphSource, 'grid' | 'bleedGates'>
): string[] => {
  const grid = maskLegacyBleedGatedCells(maze.grid, maze.bleedGates);
  const mismatches: string[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    const point = hazardCellToLegacyPoint(graph, cell);
    const walkable = grid[point.y]?.[point.x] === true;
    if (walkable !== graph.isWalkable(cell)) {
      mismatches.push(`walkable mismatch at ${point.x},${point.y}`);
      continue;
    }
    if (!walkable) {
      continue;
    }
    const production = resolveLegacyWalkableGridNeighbors(grid, point)
      .map((neighbor) => graph.cellId(neighbor.x, neighbor.y))
      .sort((left, right) => left - right);
    const ours = [...graph.neighbors(cell)].sort((left, right) => left - right);
    if (production.length !== ours.length || production.some((value, index) => value !== ours[index])) {
      mismatches.push(`neighbor mismatch at ${point.x},${point.y}`);
    }
  }
  return mismatches;
};
