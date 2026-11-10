// FELT difficulty: what a player pays to find the way, as opposed to the H1
// geometry proxy (legacyGeometryBudget.ts), which counts structure.
//
// The measure is the step count of a "pull-to-goal" explorer, simulated exactly
// and deterministically on the final floor grid:
//
//  * at every cell it tries the open neighbour nearest the goal first (torus
//    Euclidean distance; an exact tie is broken by a fixed hash of the cell, so
//    the result is a pure function of the grid -- other tie seeds give the
//    Monte-Carlo samples the tests and the evidence compare against),
//  * it backtracks out of dead ends and never re-enters a visited cell,
//  * VISION: at a junction (a cell with 3+ open neighbours) it does not enter
//    a side branch whose whole dead end is at most FELT_VISION_CELLS cells and
//    holds no goal -- a person sees a nub for what it is. Inside a corridor it is
//    committed. So single-tile decoys cost nothing and a deep wrong branch costs
//    its full length in and back out,
//  * steps = moves made until the goal cell is entered, backtrack moves included.
//
// Why this and not the old proxy: wrong turns that point toward the goal and run
// deep are what a person actually pays for. The explorer charges exactly those
// (a branch the explorer finds the goal before ever trying costs nothing; a lure
// costs 2 * length), it counts route length one for one, and it is not moved by
// cheap structure like 1-tile nubs. In a maze whose wrong turns are pendant
// branches it equals
//     routeLength + sum_B P(B tried first) * 2 * |B| * [|B| > vision]
// (analyzeFeltStructure reports that decomposition). It stays exact on mazes with
// wrap loops because it is simulated, not modelled.
//
// Pure and deterministic: integer arithmetic only, no clock, no ambient
// randomness.

export const FELT_VISION_CELLS = 3;
// Branch depth that counts as a "deep" dead end in the evidence tables.
export const FELT_DEEP_BRANCH_DEPTH = 8;

export interface FeltMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly solutionPath: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

const mixTie = (cell: number, tieSeed: number): number => {
  let h = (Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(tieSeed, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
};

export interface FeltRun {
  // Moves until the goal was entered (0 when start is the goal).
  steps: number;
  // 1 = the explorer visited the cell.
  visited: Uint8Array;
  // Cells on the explorer's final path (start..goal), 1 = on it.
  onPath: Uint8Array;
  // For a cell on the final path, the next cell on it (else -1).
  pathNext: Int32Array;
  // True when the explorer reached the goal.
  reachedGoal: boolean;
  // Moves on the final path (start to goal), backtracks excluded.
  pathLength: number;
}

export interface FeltExplorer {
  readonly width: number;
  readonly height: number;
  // torus neighbour table: cell * 4 + direction.
  readonly neighbors: Int32Array;
  // Squared torus distance to a goal cell, for the goal the explorer was last run with.
  run: (open: Uint8Array, startCell: number, goalCell: number, tieSeed?: number) => FeltRun;
}

const explorerCache = new Map<number, FeltExplorer>();

// An explorer for one board size. Buffers are reused between runs, so the
// returned FeltRun arrays are valid until the next run on the same explorer.
export const createFeltExplorer = (width: number, height: number): FeltExplorer => {
  const cacheKey = (width * 4096) + height;
  const cached = explorerCache.get(cacheKey);
  if (cached) { return cached; }
  const size = width * height;
  const neighbors = new Int32Array(size * 4);
  for (let cell = 0; cell < size; cell += 1) {
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 4; d += 1) {
      neighbors[(cell * 4) + d] = ((((y + DY[d]! + height) % height) * width) + ((x + DX[d]! + width) % width));
    }
  }
  const dist2 = new Int32Array(size);
  const visited = new Uint8Array(size);
  const onPath = new Uint8Array(size);
  const pathNext = new Int32Array(size);
  const stackCell = new Int32Array(size + 1);
  const stackNext = new Int8Array(size + 1);
  const stackCount = new Int8Array(size + 1);
  const stackOptions = new Int32Array((size + 1) * 4);
  const stamp = new Int32Array(size);
  let stampCounter = 0;
  const queue = new Int32Array(FELT_VISION_CELLS + 2);

  const run = (open: Uint8Array, startCell: number, goalCell: number, tieSeed = 0): FeltRun => {
    const goalX = goalCell % width;
    const goalY = (goalCell - goalX) / width;
    for (let cell = 0; cell < size; cell += 1) {
      const x = cell % width;
      const y = (cell - x) / width;
      const dx = Math.min(Math.abs(x - goalX), width - Math.abs(x - goalX));
      const dy = Math.min(Math.abs(y - goalY), height - Math.abs(y - goalY));
      dist2[cell] = (dx * dx) + (dy * dy);
    }
    visited.fill(0);
    onPath.fill(0);
    pathNext.fill(-1);

    const openDegree = (cell: number): number => {
      let n = 0;
      for (let d = 0; d < 4; d += 1) { n += open[neighbors[(cell * 4) + d]!]!; }
      return n;
    };
    // Is the dead end behind `entry` (never passing `from`) at most vision cells
    // with no goal in it?
    const visibleDeadEnd = (from: number, entry: number): boolean => {
      stampCounter += 1;
      stamp[from] = stampCounter;
      stamp[entry] = stampCounter;
      let head = 0;
      let tail = 0;
      queue[tail] = entry;
      tail += 1;
      while (head < tail) {
        const current = queue[head]!;
        head += 1;
        if (current === goalCell) { return false; }
        for (let d = 0; d < 4; d += 1) {
          const next = neighbors[(current * 4) + d]!;
          if (open[next] !== 1 || stamp[next] === stampCounter) { continue; }
          stamp[next] = stampCounter;
          if (tail >= FELT_VISION_CELLS) { return false; }
          queue[tail] = next;
          tail += 1;
        }
      }
      return true;
    };

    let depth = 0;
    const push = (cell: number): void => {
      visited[cell] = 1;
      const junction = openDegree(cell) >= 3;
      // Gather, filter and order the options (<= 4, insertion sort).
      let count = 0;
      const base = depth * 4;
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[(cell * 4) + d]!;
        if (open[next] !== 1 || visited[next] === 1) { continue; }
        if (junction && next !== goalCell && visibleDeadEnd(cell, next)) { continue; }
        let slot = count;
        while (slot > 0) {
          const other = stackOptions[base + slot - 1]!;
          const before = dist2[next]! < dist2[other]!
            || (dist2[next] === dist2[other] && mixTie(next, tieSeed) < mixTie(other, tieSeed));
          if (!before) { break; }
          stackOptions[base + slot] = other;
          slot -= 1;
        }
        stackOptions[base + slot] = next;
        count += 1;
      }
      stackCell[depth] = cell;
      stackNext[depth] = 0;
      stackCount[depth] = count;
    };

    let steps = 0;
    let reachedGoal = false;
    if (open[startCell] === 1) {
      push(startCell);
      const cap = size * 4;
      for (;;) {
        const cell = stackCell[depth]!;
        if (cell === goalCell) { reachedGoal = true; break; }
        if (stackNext[depth]! >= stackCount[depth]!) {
          if (depth === 0) { break; }
          depth -= 1;
          steps += 1;
          if (steps > cap) { break; }
          continue;
        }
        const next = stackOptions[(depth * 4) + stackNext[depth]!]!;
        stackNext[depth] = stackNext[depth]! + 1;
        if (visited[next] === 1) { continue; }
        depth += 1;
        steps += 1;
        push(next);
      }
      if (reachedGoal) {
        for (let level = 0; level <= depth; level += 1) {
          const cell = stackCell[level]!;
          onPath[cell] = 1;
          if (level < depth) { pathNext[cell] = stackCell[level + 1]!; }
        }
      }
    }
    return { steps, visited, onPath, pathNext, reachedGoal, pathLength: reachedGoal ? depth : 0 };
  };

  const explorer: FeltExplorer = { width, height, neighbors, run };
  explorerCache.set(cacheKey, explorer);
  return explorer;
};

const openFromGrid = (maze: FeltMaze): Uint8Array => {
  const open = new Uint8Array(maze.width * maze.height);
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (maze.grid[y]?.[x] === true) { open[(y * maze.width) + x] = 1; }
    }
  }
  return open;
};

// The primary felt-difficulty measure: deterministic explorer steps, and the
// length of the path it finally walks (backtracks excluded).
export const measureFelt = (maze: FeltMaze): { steps: number; pathLength: number; reachedGoal: boolean } => {
  const explorer = createFeltExplorer(maze.width, maze.height);
  const run = explorer.run(
    openFromGrid(maze),
    (maze.start.y * maze.width) + maze.start.x,
    (maze.goal.y * maze.width) + maze.goal.x
  );
  return { steps: run.steps, pathLength: run.pathLength, reachedGoal: run.reachedGoal };
};

export const measureFeltSteps = (maze: FeltMaze): number => measureFelt(maze).steps;

// The PRICED felt value the ladder lands on: explorer steps minus the steps the maze's
// loops and wrap corridors give back to a player who knows the map (maze.loopStats.saved
// and maze.wrapStats.saved, set by the felt tuner; 0 for a single-route plain maze, so the
// two numbers are then identical).
export const measurePricedFeltSteps = (maze: FeltMaze & {
  readonly loopStats?: { readonly saved: number };
  readonly wrapStats?: { readonly saved: number };
}): number => (
  measureFeltSteps(maze) - (maze.loopStats?.saved ?? 0) - (maze.wrapStats?.saved ?? 0)
);

// Monte-Carlo sample: same explorer with a different tie seed (validation).
export const simulatePullToGoalWalker = (maze: FeltMaze, tieSeed: number): number => {
  const explorer = createFeltExplorer(maze.width, maze.height);
  return explorer.run(
    openFromGrid(maze),
    (maze.start.y * maze.width) + maze.start.x,
    (maze.goal.y * maze.width) + maze.goal.x,
    tieSeed | 1
  ).steps;
};

export interface FeltStructure {
  routeLength: number;
  // Off-route components hanging off the route, with at least one cell.
  branches: number;
  // Branches whose first cell is nearer the goal than the next route cell.
  lureBranches: number;
  // Lure branches big enough that the explorer enters them (> vision cells).
  trapBranches: number;
  // Branches whose deepest cell is >= FELT_DEEP_BRANCH_DEPTH steps from the route.
  deepBranches: number;
  deepLureBranches: number;
  // Cells in trap lure branches.
  lureCells: number;
  // Branches touching the route in more than one place (wrap loops).
  loopedBranches: number;
  // Independent cycles in the floor graph (edges - nodes + components).
  cycles: number;
  // Single-tile / <= 3-cell branches (cost nothing to the explorer).
  nubs: number;
  // Dead-end tips (a cell with one open neighbour, off the route) at least
  // FELT_DEEP_BRANCH_DEPTH steps from the route: long dead-end corridors.
  deepDeadEnds: number;
  // Deepest off-route cell, in steps back to the route.
  maxDepth: number;
  // Open floor cells in the maze.
  floorCells: number;
}

// Structure behind the number: the pendant-branch decomposition of the route's
// side branches, for the evidence tables.
export const analyzeFeltStructure = (maze: FeltMaze): FeltStructure => {
  const { width, height } = maze;
  const size = width * height;
  const open = openFromGrid(maze);
  const route = maze.solutionPath.map((point) => (point.y * width) + point.x);
  const routeIndex = new Int32Array(size).fill(-1);
  route.forEach((cell, index) => { routeIndex[cell] = index; });
  const goalX = maze.goal.x;
  const goalY = maze.goal.y;
  const dist2 = (cell: number): number => {
    const x = cell % width;
    const y = (cell - x) / width;
    const dx = Math.min(Math.abs(x - goalX), width - Math.abs(x - goalX));
    const dy = Math.min(Math.abs(y - goalY), height - Math.abs(y - goalY));
    return (dx * dx) + (dy * dy);
  };
  const neighborsOf = (cell: number, out: number[]): number => {
    const x = cell % width;
    const y = (cell - x) / width;
    let n = 0;
    for (let d = 0; d < 4; d += 1) {
      const next = ((((y + DY[d]! + height) % height) * width) + ((x + DX[d]! + width) % width));
      if (open[next] === 1) { out[n] = next; n += 1; }
    }
    return n;
  };
  let nodes = 0;
  let edges = 0;
  const seen = new Uint8Array(size);
  const depthOf = new Int32Array(size);
  const scratch = [0, 0, 0, 0];
  const local = [0, 0, 0, 0];
  const stack: number[] = [];
  const out: FeltStructure = {
    routeLength: Math.max(0, route.length - 1),
    branches: 0, lureBranches: 0, trapBranches: 0, deepBranches: 0, deepLureBranches: 0,
    lureCells: 0, loopedBranches: 0, cycles: 0, nubs: 0, deepDeadEnds: 0, maxDepth: 0, floorCells: 0
  };
  for (let cell = 0; cell < size; cell += 1) {
    if (open[cell] !== 1) { continue; }
    nodes += 1;
    edges += neighborsOf(cell, scratch);
  }
  edges /= 2;
  // Components of the open graph (for the cycle count).
  const compSeen = new Uint8Array(size);
  let components = 0;
  for (let cell = 0; cell < size; cell += 1) {
    if (open[cell] !== 1 || compSeen[cell] === 1) { continue; }
    components += 1;
    compSeen[cell] = 1;
    stack.length = 0;
    stack.push(cell);
    while (stack.length > 0) {
      const current = stack.pop()!;
      const c = neighborsOf(current, local);
      for (let n = 0; n < c; n += 1) {
        if (compSeen[local[n]!] === 0) { compSeen[local[n]!] = 1; stack.push(local[n]!); }
      }
    }
  }
  out.cycles = edges - nodes + components;
  out.floorCells = nodes;
  // Multi-source BFS depth back to the route.
  const routeDepth = new Int32Array(size).fill(-1);
  const bfs: number[] = [];
  route.forEach((cell) => { routeDepth[cell] = 0; bfs.push(cell); });
  for (let head = 0; head < bfs.length; head += 1) {
    const current = bfs[head]!;
    const c = neighborsOf(current, local);
    for (let n = 0; n < c; n += 1) {
      const next = local[n]!;
      if (routeDepth[next] === -1) { routeDepth[next] = routeDepth[current]! + 1; bfs.push(next); }
    }
  }
  for (let cell = 0; cell < size; cell += 1) {
    if (open[cell] !== 1 || routeDepth[cell]! < 0) { continue; }
    out.maxDepth = Math.max(out.maxDepth, routeDepth[cell]!);
    if (routeDepth[cell]! >= FELT_DEEP_BRANCH_DEPTH && neighborsOf(cell, local) === 1) { out.deepDeadEnds += 1; }
  }

  for (let i = 0; i < route.length - 1; i += 1) {
    const cell = route[i]!;
    const nextDist = dist2(route[i + 1]!);
    const count = neighborsOf(cell, scratch);
    const entries: number[] = [];
    for (let k = 0; k < count; k += 1) { entries.push(scratch[k]!); }
    for (const entry of entries) {
      if (routeIndex[entry]! >= 0 || seen[entry] === 1) { continue; }
      let componentSize = 0;
      let maxDepth = 0;
      let looped = false;
      seen[entry] = 1;
      depthOf[entry] = 1;
      stack.length = 0;
      stack.push(entry);
      while (stack.length > 0) {
        const current = stack.pop()!;
        componentSize += 1;
        maxDepth = Math.max(maxDepth, depthOf[current]!);
        const c = neighborsOf(current, local);
        for (let n = 0; n < c; n += 1) {
          const next = local[n]!;
          if (routeIndex[next]! >= 0) {
            if (routeIndex[next] !== i) { looped = true; }
            continue;
          }
          if (seen[next] === 0) {
            seen[next] = 1;
            depthOf[next] = depthOf[current]! + 1;
            stack.push(next);
          }
        }
      }
      let bestEntryDist = Number.POSITIVE_INFINITY;
      for (const candidate of entries) {
        if (routeIndex[candidate]! < 0 && seen[candidate] === 1) {
          bestEntryDist = Math.min(bestEntryDist, dist2(candidate));
        }
      }
      const lure = bestEntryDist < nextDist;
      out.branches += 1;
      if (looped) { out.loopedBranches += 1; }
      if (componentSize <= FELT_VISION_CELLS) { out.nubs += 1; }
      if (lure) { out.lureBranches += 1; }
      if (lure && componentSize > FELT_VISION_CELLS) {
        out.trapBranches += 1;
        out.lureCells += componentSize;
      }
      if (maxDepth >= FELT_DEEP_BRANCH_DEPTH) {
        out.deepBranches += 1;
        if (lure) { out.deepLureBranches += 1; }
      }
    }
  }
  return out;
};
