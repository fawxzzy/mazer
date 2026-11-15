// "Does it read like a real maze" gauges for MAZER-GEN-021, shared by the census script and its regression test.
// Pure, integer-only, deterministic. Adjacency is the torus the game uses (a floor tile on one border touches the
// floor tile on the opposite border), so decision points and branches count wrap corridors like any other.
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';

export interface MazeRealness {
  readonly width: number;
  readonly height: number;
  // Start to goal, as a share of the board: Manhattan distance over (width - 1) + (height - 1), and Chebyshev
  // distance over the matching axis span. Plain (non-wrapped) grid distance: it is what the eye measures on screen.
  readonly spanManhattan: number;
  readonly spanChebyshev: number;
  // Shortest route start to goal, in cells (the solution path), and over the board's linear size ((w + h) / 2).
  readonly routeCells: number;
  readonly routeOverLinear: number;
  // Cells of the route that are junctions (3+ open neighbours): the choices a player meets on the way.
  readonly routeDecisions: number;
  // Junctions of the whole maze, and dead-end branches that hang off the route directly (decoys at a decision point).
  readonly junctions: number;
  readonly routeDecoys: number;
  // Dead-end branches of the whole maze and their mean / max length in cells.
  readonly deadEnds: number;
  readonly deadEndMean: number;
  readonly deadEndMax: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

export const measureMazeRealness = (maze: Pick<LegacyMazeSnapshot, 'width' | 'height' | 'grid' | 'start' | 'goal' | 'solutionPath'>): MazeRealness => {
  const { width, height, grid, start, goal, solutionPath } = maze;
  const open = (x: number, y: number): boolean => grid[y]?.[x] === true;
  const neighbours = (x: number, y: number): number[] => {
    const out: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const nx = (x + DX[d]! + width) % width;
      const ny = (y + DY[d]! + height) % height;
      if ((nx !== x || ny !== y) && open(nx, ny)) { out.push((ny * width) + nx); }
    }
    return out;
  };
  const onRoute = new Set<number>(solutionPath.map((p) => (p.y * width) + p.x));
  let junctions = 0;
  let routeDecisions = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!open(x, y)) { continue; }
      if (neighbours(x, y).length >= 3) {
        junctions += 1;
        if (onRoute.has((y * width) + x)) { routeDecisions += 1; }
      }
    }
  }
  // Dead-end branches: walk from each dead end to the first junction. A branch whose host sits on the route is a
  // decoy at a decision point.
  const lengths: number[] = [];
  let routeDecoys = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!open(x, y) || neighbours(x, y).length !== 1) { continue; }
      let length = 1;
      let previous = (y * width) + x;
      let current = neighbours(x, y)[0]!;
      let host: number | null = current;
      for (;;) {
        const cx = current % width; const cy = Math.floor(current / width);
        const next = neighbours(cx, cy).filter((n) => n !== previous);
        if (next.length === 0) { host = null; break; }
        if (next.length >= 2) { host = current; break; }
        length += 1; previous = current; current = next[0]!;
      }
      lengths.push(length);
      if (host !== null && onRoute.has(host)) { routeDecoys += 1; }
    }
  }
  const spanX = Math.abs(goal.x - start.x) / Math.max(1, width - 1);
  const spanY = Math.abs(goal.y - start.y) / Math.max(1, height - 1);
  const linear = (width + height) / 2;
  return {
    width,
    height,
    spanManhattan: (Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y)) / Math.max(1, (width - 1) + (height - 1)),
    spanChebyshev: Math.max(spanX, spanY),
    routeCells: solutionPath.length,
    routeOverLinear: solutionPath.length / linear,
    routeDecisions,
    junctions,
    routeDecoys,
    deadEnds: lengths.length,
    deadEndMean: lengths.length === 0 ? 0 : lengths.reduce((a, b) => a + b, 0) / lengths.length,
    deadEndMax: lengths.length === 0 ? 0 : Math.max(...lengths)
  };
};
