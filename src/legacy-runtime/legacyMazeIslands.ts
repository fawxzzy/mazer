// Floor-island audit (MAZER-GEN-005). Pure, integer-only. An ISLAND is a group of floor cells that no path
// from the start reaches, i.e. an "orphan" the player sees as a lit tile with no way in. Reachability uses
// the playable torus adjacency exactly like legacyMazeStubs.ts / legacyMazeDifficultyMetrics.ts (a floor
// tile on one border is adjacent to the floor tile on the opposite border).

export interface IslandMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
}

export interface FloorIsland {
  // Cells of the island in row-major order of discovery (first cell is the row-major smallest).
  readonly cells: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface FloorIslandReport {
  readonly floorCells: number;
  readonly reachableCells: number;
  readonly islands: ReadonlyArray<FloorIsland>;
  readonly islandCells: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

// Flood fill from `from` over floor cells (torus adjacency); returns the visited flags.
const flood = (maze: Pick<IslandMaze, 'width' | 'height' | 'grid'>, fromX: number, fromY: number, visited: Uint8Array, wrap: boolean): number => {
  const { width, height, grid } = maze;
  if (grid[fromY]?.[fromX] !== true || visited[(fromY * width) + fromX] === 1) { return 0; }
  const stack: number[] = [(fromY * width) + fromX];
  visited[(fromY * width) + fromX] = 1;
  let count = 0;
  while (stack.length > 0) {
    const cell = stack.pop()!;
    count += 1;
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (let d = 0; d < 4; d += 1) {
      if (!wrap && (x + DX[d]! < 0 || x + DX[d]! >= width || y + DY[d]! < 0 || y + DY[d]! >= height)) { continue; }
      const nx = (x + DX[d]! + width) % width;
      const ny = (y + DY[d]! + height) % height;
      const index = (ny * width) + nx;
      if (grid[ny]?.[nx] === true && visited[index] === 0) {
        visited[index] = 1;
        stack.push(index);
      }
    }
  }
  return count;
};

// `wrap` false = the planar view (a border tile is NOT adjacent to the opposite border): analysis only.
export const findFloorIslands = (maze: IslandMaze, wrap = true): FloorIslandReport => {
  const { width, height, grid } = maze;
  const visited = new Uint8Array(width * height);
  const reachableCells = flood(maze, maze.start.x, maze.start.y, visited, wrap);
  let floorCells = 0;
  const islands: FloorIsland[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] !== true) { continue; }
      floorCells += 1;
      if (visited[(y * width) + x] === 1) { continue; }
      // Collect this island's cells with its own flood (marks them visited).
      const before = visited.slice();
      flood(maze, x, y, visited, wrap);
      const cells: { x: number; y: number }[] = [];
      for (let i = 0; i < visited.length; i += 1) {
        if (visited[i] === 1 && before[i] === 0) { cells.push({ x: i % width, y: Math.floor(i / width) }); }
      }
      islands.push({ cells });
    }
  }
  const islandCells = islands.reduce((sum, island) => sum + island.cells.length, 0);
  return { floorCells, reachableCells, islands, islandCells };
};

// Walls up every floor cell the start cannot reach. Returns the cells filled, row-major. A cell the
// start cannot reach is by definition off the route, so route, start, goal and the reachable maze (and so
// every felt / winding / stub metric of it) are untouched; only the orphan tiles change.
export const fillFloorIslands = (maze: IslandMaze & { grid: boolean[][] }): { x: number; y: number }[] => {
  const report = findFloorIslands(maze);
  const filled: { x: number; y: number }[] = [];
  for (const island of report.islands) {
    for (const cell of island.cells) {
      maze.grid[cell.y]![cell.x] = false;
      filled.push({ x: cell.x, y: cell.y });
    }
  }
  filled.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return filled;
};

// Flat-index twin for the tuner's typed-array world (`neighbors` is the torus table cell * 4 + direction of
// createFeltExplorer). Walls up every open cell the start cannot reach (the same cells findFloorIslands
// reports) and returns them in ascending cell order. The explorer starts at `startCell`, so it can never
// enter such a cell: the felt number, the route and every metric of the reachable maze are unchanged.
export const fillUnreachableCells = (open: Uint8Array, neighbors: Int32Array, startCell: number): number[] => {
  const seen = new Uint8Array(open.length);
  if (open[startCell] === 1) {
    const stack = [startCell];
    seen[startCell] = 1;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[(cell * 4) + d]!;
        if (open[next] === 1 && seen[next] === 0) { seen[next] = 1; stack.push(next); }
      }
    }
  }
  const filled: number[] = [];
  for (let cell = 0; cell < open.length; cell += 1) {
    if (open[cell] === 1 && seen[cell] === 0) { open[cell] = 0; filled.push(cell); }
  }
  return filled;
};
