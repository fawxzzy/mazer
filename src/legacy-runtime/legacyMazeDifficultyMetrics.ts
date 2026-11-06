// Independent maze difficulty metrics (analysis + tests only; NOT read by the
// runtime gate). The gate steers on the H1 proxy (legacyGeometryBudget.ts); these
// metrics exist so that "this level is harder" can be checked against measures
// the gate does not optimise, and so the progression ceiling can be reported
// honestly instead of only on the proxy the generator is tuned to.
//
// Pure and deterministic: integer arithmetic over the floor grid, torus (wrap)
// adjacency exactly as the game's own topology metrics use it (a floor tile on
// one border is adjacent to the floor tile on the opposite border), and no
// randomness. Every function is total for a well-formed snapshot.

export interface DifficultyMetricsMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly solutionPath: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface MazeDifficultyMetrics {
  // Cells on the route minus one.
  routeLength: number;
  // Direction changes along the route (wrap-aware).
  routeTurns: number;
  // Route cells (excluding start/goal) with 3+ open neighbours: places the
  // player must choose.
  decisionPoints: number;
  // Off-route branch decisions weighted by how long the wrong branch is: the sum
  // over route decision points of the off-route cells reachable only through
  // that branch (capped per branch at nothing; whole branch size).
  decoyCells: number;
  // Deepest off-route excursion: max over all off-route cells of the graph
  // distance back to the route.
  maxDecoyDepth: number;
  // Mean over off-route dead ends of that dead end's distance back to the route.
  meanDeadEndDepth: number;
  // Dead ends in the whole maze (floor cells with exactly one open neighbour,
  // start and goal excluded).
  deadEnds: number;
  // Fraction of dead ends whose straight-line (torus) distance to the goal is
  // smaller than that of the route cell their branch leaves from: a branch that
  // "looks" like it is heading to the goal and is not. 0 when there are none.
  deceptiveness: number;
  // Route steps that cross the board edge (torus wrap).
  wrapSteps: number;
  // routeLength divided by the torus Manhattan distance start -> goal.
  tortuosity: number;
  // Cells a greedy goal-first depth-first walker visits before reaching the
  // goal (a "human-ish" solver; lower = easier to stumble through).
  greedySearchCells: number;
  // Nodes a Manhattan-heuristic A* expands (an "ideal solver" effort measure).
  astarExpansions: number;
  // Floor cells in the maze.
  floorCells: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

export const analyzeMazeDifficulty = (maze: DifficultyMetricsMaze): MazeDifficultyMetrics => {
  const { width, height, grid } = maze;
  const size = width * height;
  const open = new Uint8Array(size);
  let floorCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] === true) {
        open[(y * width) + x] = 1;
        floorCells += 1;
      }
    }
  }
  const neighbors = (index: number, out: number[]): number => {
    const x = index % width;
    const y = (index - x) / width;
    let n = 0;
    for (let d = 0; d < 4; d += 1) {
      const nx = (x + DX[d]! + width) % width;
      const ny = (y + DY[d]! + height) % height;
      const next = (ny * width) + nx;
      if (open[next] === 1) {
        out[n] = next;
        n += 1;
      }
    }
    return n;
  };
  const scratch: number[] = [0, 0, 0, 0];
  const degree = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    if (open[index] === 1) {
      degree[index] = neighbors(index, scratch);
    }
  }

  const startIndex = (maze.start.y * width) + maze.start.x;
  const goalIndex = (maze.goal.y * width) + maze.goal.x;
  const route = maze.solutionPath.map((point) => (point.y * width) + point.x);
  const onRoute = new Uint8Array(size);
  route.forEach((index) => { onRoute[index] = 1; });

  const torusDistance = (a: number, b: number): number => {
    const ax = a % width;
    const ay = (a - ax) / width;
    const bx = b % width;
    const by = (b - bx) / width;
    const dx = Math.min(Math.abs(ax - bx), width - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), height - Math.abs(ay - by));
    return Math.sqrt((dx * dx) + (dy * dy));
  };
  const torusManhattan = (a: number, b: number): number => {
    const ax = a % width;
    const ay = (a - ax) / width;
    const bx = b % width;
    const by = (b - bx) / width;
    return Math.min(Math.abs(ax - bx), width - Math.abs(ax - bx))
      + Math.min(Math.abs(ay - by), height - Math.abs(ay - by));
  };

  // Route shape.
  const routeLength = Math.max(0, route.length - 1);
  let routeTurns = 0;
  let wrapSteps = 0;
  let previousStep = '';
  for (let i = 1; i < route.length; i += 1) {
    const ax = route[i - 1]! % width;
    const ay = (route[i - 1]! - ax) / width;
    const bx = route[i]! % width;
    const by = (route[i]! - bx) / width;
    let dx = bx - ax;
    let dy = by - ay;
    if (dx > 1) { dx = -1; wrapSteps += 1; } else if (dx < -1) { dx = 1; wrapSteps += 1; }
    if (dy > 1) { dy = -1; wrapSteps += 1; } else if (dy < -1) { dy = 1; wrapSteps += 1; }
    const step = `${dx},${dy}`;
    if (i > 1 && step !== previousStep) {
      routeTurns += 1;
    }
    previousStep = step;
  }

  // Decision points on the route.
  let decisionPoints = 0;
  for (let i = 1; i < route.length - 1; i += 1) {
    if (degree[route[i]!]! >= 3) {
      decisionPoints += 1;
    }
  }

  // Off-route structure: multi-source BFS from the route through off-route cells.
  const depth = new Int32Array(size).fill(-1);
  const anchor = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  route.forEach((index) => {
    depth[index] = 0;
    anchor[index] = index;
    queue[tail] = index;
    tail += 1;
  });
  let offRouteCells = 0;
  let maxDecoyDepth = 0;
  while (head < tail) {
    const current = queue[head]!;
    head += 1;
    const count = neighbors(current, scratch);
    for (let n = 0; n < count; n += 1) {
      const next = scratch[n]!;
      if (depth[next] === -1) {
        depth[next] = depth[current]! + 1;
        anchor[next] = anchor[current]!;
        offRouteCells += 1;
        maxDecoyDepth = Math.max(maxDecoyDepth, depth[next]!);
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  let deadEnds = 0;
  let deceptive = 0;
  let deadEndDepthSum = 0;
  let offRouteDeadEnds = 0;
  for (let index = 0; index < size; index += 1) {
    if (open[index] !== 1 || degree[index]! > 1 || index === startIndex || index === goalIndex) {
      continue;
    }
    deadEnds += 1;
    if (onRoute[index] === 1 || depth[index]! < 0) {
      continue;
    }
    offRouteDeadEnds += 1;
    deadEndDepthSum += depth[index]!;
    const root = anchor[index]!;
    if (torusDistance(index, goalIndex) < torusDistance(root, goalIndex)) {
      deceptive += 1;
    }
  }

  // Search effort. A* with a binary-heap-free bucket queue is overkill; a simple
  // binary heap keeps this readable.
  const astarExpansions = ((): number => {
    const g = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const heap: number[] = [];
    const key = (index: number): number => (g[index]! + torusManhattan(index, goalIndex)) * 4096 + (index % 4096);
    const push = (index: number): void => {
      heap.push(index);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (key(heap[parent]!) <= key(heap[i]!)) { break; }
        [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
        i = parent;
      }
    };
    const pop = (): number => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = (2 * i) + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && key(heap[l]!) < key(heap[m]!)) { m = l; }
          if (r < heap.length && key(heap[r]!) < key(heap[m]!)) { m = r; }
          if (m === i) { break; }
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    g[startIndex] = 0;
    push(startIndex);
    let expansions = 0;
    while (heap.length > 0) {
      const current = pop();
      if (closed[current] === 1) { continue; }
      closed[current] = 1;
      expansions += 1;
      if (current === goalIndex) { break; }
      const local = [0, 0, 0, 0];
      const count = neighbors(current, local);
      for (let n = 0; n < count; n += 1) {
        const next = local[n]!;
        if (g[next] === -1 || g[current]! + 1 < g[next]!) {
          g[next] = g[current]! + 1;
          push(next);
        }
      }
    }
    return expansions;
  })();

  // Greedy goal-first DFS (always tries the unvisited neighbour nearest the goal).
  const greedySearchCells = ((): number => {
    const seen = new Uint8Array(size);
    const stack: number[] = [startIndex];
    seen[startIndex] = 1;
    let visited = 0;
    const local = [0, 0, 0, 0];
    while (stack.length > 0) {
      const current = stack.pop()!;
      visited += 1;
      if (current === goalIndex) { break; }
      const count = neighbors(current, local);
      const options: number[] = [];
      for (let n = 0; n < count; n += 1) {
        if (seen[local[n]!] === 0) {
          options.push(local[n]!);
        }
      }
      // Push farthest first so the nearest is popped first; ties by index.
      options.sort((a, b) => (torusDistance(b, goalIndex) - torusDistance(a, goalIndex)) || (b - a));
      options.forEach((next) => { seen[next] = 1; stack.push(next); });
    }
    return visited;
  })();

  // Off-route cells hanging off decision points: size of every off-route
  // component counted once.
  const decoyCells = offRouteCells;

  return {
    routeLength,
    routeTurns,
    decisionPoints,
    decoyCells,
    maxDecoyDepth,
    meanDeadEndDepth: offRouteDeadEnds > 0 ? deadEndDepthSum / offRouteDeadEnds : 0,
    deadEnds,
    deceptiveness: offRouteDeadEnds > 0 ? deceptive / offRouteDeadEnds : 0,
    wrapSteps,
    tortuosity: routeLength / Math.max(1, torusManhattan(startIndex, goalIndex)),
    greedySearchCells,
    astarExpansions,
    floorCells
  };
};
