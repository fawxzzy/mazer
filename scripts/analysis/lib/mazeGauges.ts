// Independent difficulty gauges for a finished maze (analysis only; nothing at
// runtime reads this). The point of a gauge SUITE is that no single measure is
// trusted: each one answers a different question about what a player pays, and a
// level is only "harder" when several of them agree.
//
// All gauges read the floor grid with torus adjacency (a floor cell on one border
// is adjacent to the floor cell on the opposite border, exactly as the game's
// wrap corridors work) and are deterministic: the stochastic walkers use a fixed
// seeded stream, so a dump always produces the same numbers.
//
//   shortest            BFS route length (the optimum a solver who knows the map pays)
//   pullSteps           the generator's steering metric: pull-to-goal explorer steps
//   pullStepsMc         mean of the same explorer over 8 other tie seeds
//   randomWalkSteps     median steps of a non-backtracking random walk (5 runs)
//   humanSteps          median steps of a human-like explorer (straight-ahead and
//                       goal-ward bias, 48-cell memory), 8 runs
//   decisionPoints      route cells (not start/goal) with 3+ open neighbours
//   misleadingJunctions route junctions where the cell nearest the goal is NOT the
//                       route continuation (the pull points the wrong way)
//   ambiguousJunctions  route junctions with 2+ forward options within one cell of
//                       goal distance of each other (equally promising choices)
//   deadEnds, deadEndDepthMax, deadEndDepthMean
//   cyclomatic          independent cycles of the whole floor graph (E - V + C)
//   loopsInterior       independent cycles that do not use a wrap edge
//   loopStretches       maximal runs of the shortest route that lie on a cycle: each is
//                       a place with a real choice of ways (0 = a single route)
//   choiceStakes        sum over those stretches of (second-best way - best way):
//                       what a player who picks the wrong side pays
//   altRatioMean        mean over stretches of second-best / best way length
//                       (1 = a tie, 2 = twice as long); 0 when single route
//   tieStretches        stretches whose two ways are within 12 percent of each other
//                       (a real alternate: no obvious winner)
//                       (1 = an equally short second route, 2 = twice as long); null when single
//   shortestRoutes      number of distinct shortest routes (cap 999)
//   slack               pull-explorer path length minus shortest: what a solver who
//                       knows the map saves over this explorer (shortcut value)
import {
  analyzeMazeDifficulty,
  type MazeDifficultyMetrics
} from '../../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import {
  createFeltExplorer,
  simulatePullToGoalWalker
} from '../../../src/legacy-runtime/legacyMazeFeltDifficulty';

export interface GaugeMaze {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  // Steps loops give back to a map-knower, when the generator reports it.
  readonly loopStats?: { readonly saved: number } | null;
  // Steps the wrap corridors give back to a map-knower, when the generator reports it.
  readonly wrapStats?: { readonly saved: number } | null;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
}

export interface MazeGauges {
  // Explorer steps minus the steps loops and wrap corridors give back to a map-knower (the
  // ladder's priced felt, as the generator reports its savings).
  pricedSteps: number;
  // Shortest route with the wrap links severed minus the shortest route as built, measured
  // here from the floor grid alone (any tree): what the wrap corridors save a map-knower.
  wrapSaving: number;
  // Explorer steps minus the generator's loop saving minus `wrapSaving`: the priced felt with
  // wraps priced, estimated the same way for every tree (a tree that does not price wraps
  // shows its cliff here).
  pricedStepsWithWraps: number;
  floorCells: number;
  boardFill: number;
  shortest: number;
  shortestDirect: number;
  pullSteps: number;
  pullStepsMc: number;
  explorerPath: number;
  slack: number;
  randomWalkSteps: number;
  randomWalkCensored: number;
  humanSteps: number;
  humanCensored: number;
  decisionPoints: number;
  junctions: number;
  meanBranching: number;
  misleadingJunctions: number;
  ambiguousJunctions: number;
  deadEnds: number;
  deadEndDepthMax: number;
  deadEndDepthMean: number;
  cyclomatic: number;
  loopsInterior: number;
  loopsWrap: number;
  loopStretches: number;
  choiceStakes: number;
  altRatioMean: number;
  tieStretches: number;
  shortestRoutes: number;
  routeTurns: number;
  decoyCells: number;
  maxDecoyDepth: number;
  astarExpansions: number;
  greedySearchCells: number;
  deceptiveness: number;
}

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

const stream = (seed: number): (() => number) => {
  let state = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

interface Graph {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly open: Uint8Array;
  // cell * 4 + d, torus; -1 never (the torus always has a neighbour index).
  readonly nbr: Int32Array;
  // 1 when the step cell -> neighbour d crosses the board edge.
  readonly wrapStep: Uint8Array;
}

const buildGraph = (maze: GaugeMaze): Graph => {
  const { width, height } = maze;
  const size = width * height;
  const open = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maze.rows[y]![x] === '1') { open[(y * width) + x] = 1; }
    }
  }
  const nbr = new Int32Array(size * 4);
  const wrapStep = new Uint8Array(size * 4);
  for (let cell = 0; cell < size; cell += 1) {
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      nbr[(cell * 4) + d] = ((((ny + height) % height) * width) + ((nx + width) % width));
      wrapStep[(cell * 4) + d] = (nx < 0 || nx >= width || ny < 0 || ny >= height) ? 1 : 0;
    }
  }
  return { width, height, size, open, nbr, wrapStep };
};

const degree = (g: Graph, cell: number): number => {
  let n = 0;
  for (let d = 0; d < 4; d += 1) { n += g.open[g.nbr[(cell * 4) + d]!]!; }
  return n;
};

// BFS distances from `from`; skipWrap ignores wrap edges.
const bfs = (g: Graph, from: number, skipWrap: boolean): Int32Array => {
  const dist = new Int32Array(g.size).fill(-1);
  const queue = new Int32Array(g.size);
  let head = 0;
  let tail = 0;
  dist[from] = 0;
  queue[tail] = from;
  tail += 1;
  while (head < tail) {
    const cell = queue[head]!;
    head += 1;
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] !== 1 || dist[next] !== -1) { continue; }
      if (skipWrap && g.wrapStep[(cell * 4) + d] === 1) { continue; }
      dist[next] = dist[cell]! + 1;
      queue[tail] = next;
      tail += 1;
    }
  }
  return dist;
};

// Bridges of the open graph (torus adjacency), iterative lowlink. A route edge that
// is NOT a bridge lies on a cycle: a place where the player has two ways.
const findBridges = (g: Graph, skipWrap = false): Set<number> => {
  const disc = new Int32Array(g.size).fill(-1);
  const low = new Int32Array(g.size);
  const bridges = new Set<number>();
  const edgeKey = (u: number, v: number): number => (u < v ? (u * g.size) + v : (v * g.size) + u);
  let clock = 0;
  for (let root = 0; root < g.size; root += 1) {
    if (g.open[root] !== 1 || disc[root] !== -1) { continue; }
    const stackCell: number[] = [root];
    const stackDir: number[] = [0];
    const stackParent: number[] = [-1];
    disc[root] = clock; low[root] = clock; clock += 1;
    while (stackCell.length > 0) {
      const top = stackCell.length - 1;
      const cell = stackCell[top]!;
      const dir = stackDir[top]!;
      if (dir < 4) {
        stackDir[top] = dir + 1;
        const next = g.nbr[(cell * 4) + dir]!;
        if (g.open[next] !== 1 || next === stackParent[top]) { continue; }
        if (skipWrap && g.wrapStep[(cell * 4) + dir] === 1) { continue; }
        if (disc[next] === -1) {
          disc[next] = clock; low[next] = clock; clock += 1;
          stackCell.push(next); stackDir.push(0); stackParent.push(cell);
        } else {
          low[cell] = Math.min(low[cell]!, disc[next]!);
        }
      } else {
        stackCell.pop(); stackDir.pop();
        const parent = stackParent.pop()!;
        if (parent >= 0) {
          low[parent] = Math.min(low[parent]!, low[cell]!);
          if (low[cell]! > disc[parent]!) { bridges.add(edgeKey(parent, cell)); }
        }
      }
    }
  }
  return bridges;
};

// The two best edge-disjoint ways between two cells (min-cost unit flow, successive
// shortest paths): [best, marginal second]. Null when there is only one way.
const twoWays = (g: Graph, source: number, sink: number): [number, number] | null => {
  const arcTo: number[] = [];
  const arcCap: number[] = [];
  const arcCost: number[] = [];
  const first = new Int32Array(g.size).fill(-1);
  const nextArc: number[] = [];
  const addArc = (u: number, v: number, cap: number, cost: number): void => {
    arcTo.push(v); arcCap.push(cap); arcCost.push(cost); nextArc.push(first[u]!); first[u] = arcTo.length - 1;
  };
  for (let cell = 0; cell < g.size; cell += 1) {
    if (g.open[cell] !== 1) { continue; }
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] !== 1 || next < cell) { continue; }
      addArc(cell, next, 1, 1); addArc(next, cell, 0, -1);
      addArc(next, cell, 1, 1); addArc(cell, next, 0, -1);
    }
  }
  const costs: number[] = [];
  const dist = new Int32Array(g.size);
  const inQueue = new Uint8Array(g.size);
  const prevArc = new Int32Array(g.size);
  for (let route = 0; route < 2; route += 1) {
    dist.fill(1 << 28);
    prevArc.fill(-1);
    const queue: number[] = [source];
    dist[source] = 0;
    inQueue[source] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head]!;
      inQueue[u] = 0;
      for (let arc = first[u]!; arc !== -1; arc = nextArc[arc]!) {
        if (arcCap[arc]! <= 0) { continue; }
        const v = arcTo[arc]!;
        const candidate = dist[u]! + arcCost[arc]!;
        if (candidate < dist[v]!) {
          dist[v] = candidate;
          prevArc[v] = arc;
          if (inQueue[v] === 0) { inQueue[v] = 1; queue.push(v); }
        }
      }
    }
    if (dist[sink]! >= (1 << 28)) { break; }
    costs.push(dist[sink]!);
    let v = sink;
    while (v !== source) {
      const arc = prevArc[v]!;
      arcCap[arc] = arcCap[arc]! - 1;
      arcCap[arc ^ 1] = arcCap[arc ^ 1]! + 1;
      v = arcTo[arc ^ 1]!;
    }
  }
  return costs.length === 2 ? [costs[0]!, costs[1]!] : null;
};

const goalDistance = (g: Graph, goalX: number, goalY: number, cell: number): number => {
  const x = cell % g.width;
  const y = (cell - x) / g.width;
  const dx = Math.min(Math.abs(x - goalX), g.width - Math.abs(x - goalX));
  const dy = Math.min(Math.abs(y - goalY), g.height - Math.abs(y - goalY));
  return Math.sqrt((dx * dx) + (dy * dy));
};

// A non-backtracking random walk: never reverses except at a dead end.
const randomWalk = (g: Graph, start: number, goal: number, seed: number, cap: number): number => {
  const rand = stream(seed);
  let cell = start;
  let prev = -1;
  const options = [0, 0, 0, 0];
  for (let step = 1; step <= cap; step += 1) {
    let n = 0;
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] === 1 && next !== prev) { options[n] = next; n += 1; }
    }
    let chosen: number;
    if (n === 0) { chosen = prev; } else { chosen = options[Math.floor(rand() * n)]!; }
    prev = cell;
    cell = chosen;
    if (cell === goal) { return step; }
  }
  return cap;
};

// A human-like explorer: keeps going straight when it can, leans toward the goal
// (a compass), has a short memory (48 cells) it avoids re-entering, reverses only
// at a dead end. Weights: straight x3, goal-ward x3.5, remembered x0.08.
const HUMAN_MEMORY = 48;
const humanWalk = (g: Graph, start: number, goal: number, goalX: number, goalY: number, seed: number, cap: number): number => {
  const rand = stream(seed);
  const memory = new Int32Array(HUMAN_MEMORY).fill(-1);
  let memoryHead = 0;
  let cell = start;
  let prev = -1;
  let heading = -1;
  const optCell = [0, 0, 0, 0];
  const optDir = [0, 0, 0, 0];
  const optWeight = [0, 0, 0, 0];
  const remembered = (c: number): boolean => {
    for (let i = 0; i < HUMAN_MEMORY; i += 1) { if (memory[i] === c) { return true; } }
    return false;
  };
  for (let step = 1; step <= cap; step += 1) {
    const here = goalDistance(g, goalX, goalY, cell);
    let n = 0;
    let total = 0;
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] !== 1 || next === prev) { continue; }
      let weight = 1;
      if (d === heading) { weight *= 3; }
      if (goalDistance(g, goalX, goalY, next) < here) { weight *= 3.5; }
      if (remembered(next)) { weight *= 0.08; }
      optCell[n] = next; optDir[n] = d; optWeight[n] = weight; total += weight; n += 1;
    }
    let chosen: number;
    let chosenDir: number;
    if (n === 0) {
      chosen = prev;
      chosenDir = -1;
      for (let d = 0; d < 4; d += 1) { if (g.nbr[(cell * 4) + d] === prev) { chosenDir = d; } }
    } else {
      let pick = rand() * total;
      let index = 0;
      for (; index < n - 1; index += 1) {
        pick -= optWeight[index]!;
        if (pick <= 0) { break; }
      }
      chosen = optCell[index]!;
      chosenDir = optDir[index]!;
    }
    memory[memoryHead] = cell;
    memoryHead = (memoryHead + 1) % HUMAN_MEMORY;
    prev = cell;
    cell = chosen;
    heading = chosenDir;
    if (cell === goal) { return step; }
  }
  return cap;
};

// For drawing: the shortest route's cells and the cells that lie on a cycle (a non-bridge
// edge), as cell indices (y * width + x).
export const describeMazeStructure = (maze: GaugeMaze): { route: Set<number>; cycleCells: Set<number>; explorerVisited: Set<number> } => {
  const g = buildGraph(maze);
  const start = (maze.start.y * g.width) + maze.start.x;
  const goal = (maze.goal.y * g.width) + maze.goal.x;
  const dStart = bfs(g, start, false);
  const dGoal = bfs(g, goal, false);
  const route = new Set<number>([start]);
  for (let cell = start; cell !== goal;) {
    let chosen = -1;
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] === 1 && dStart[next] === dStart[cell]! + 1 && dGoal[next] === dGoal[cell]! - 1) { chosen = next; break; }
    }
    if (chosen < 0) { break; }
    route.add(chosen);
    cell = chosen;
  }
  const bridges = findBridges(g, true);
  const edgeKey = (u: number, v: number): number => (u < v ? (u * g.size) + v : (v * g.size) + u);
  const cycleCells = new Set<number>();
  for (let cell = 0; cell < g.size; cell += 1) {
    if (g.open[cell] !== 1) { continue; }
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] !== 1 || g.wrapStep[(cell * 4) + d] === 1) { continue; }
      if (!bridges.has(edgeKey(cell, next))) { cycleCells.add(cell); cycleCells.add(next); }
    }
  }
  const explorer = createFeltExplorer(g.width, g.height);
  const run = explorer.run(g.open, start, goal);
  const explorerVisited = new Set<number>();
  for (let cell = 0; cell < g.size; cell += 1) { if (run.visited[cell] === 1 && run.onPath[cell] !== 1) { explorerVisited.add(cell); } }
  return { route, cycleCells, explorerVisited };
};

export const RANDOM_WALK_CAP = 100_000;
export const HUMAN_WALK_CAP = 50_000;

export const computeMazeGauges = (maze: GaugeMaze): MazeGauges => {
  const g = buildGraph(maze);
  const start = (maze.start.y * g.width) + maze.start.x;
  const goal = (maze.goal.y * g.width) + maze.goal.x;
  const goalX = maze.goal.x;
  const goalY = maze.goal.y;
  let floorCells = 0;
  for (let cell = 0; cell < g.size; cell += 1) { floorCells += g.open[cell]!; }

  const dStart = bfs(g, start, false);
  const dGoal = bfs(g, goal, false);
  const dDirect = bfs(g, start, true);
  const shortest = dStart[goal]!;

  // One shortest route (deterministic: prefer the first neighbour that stays on a shortest route).
  const route: number[] = [start];
  for (let cell = start; cell !== goal;) {
    let chosen = -1;
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] === 1 && dStart[next] === dStart[cell]! + 1 && dGoal[next] === dGoal[cell]! - 1) { chosen = next; break; }
    }
    if (chosen < 0) { break; }
    route.push(chosen);
    cell = chosen;
  }

  // Number of distinct shortest routes (DP over BFS levels).
  const counts = new Float64Array(g.size);
  counts[start] = 1;
  const byLevel: number[] = [];
  for (let cell = 0; cell < g.size; cell += 1) { if (dStart[cell]! >= 0 && dStart[cell]! <= shortest) { byLevel.push(cell); } }
  byLevel.sort((a, b) => dStart[a]! - dStart[b]!);
  for (const cell of byLevel) {
    if (counts[cell] === 0) { continue; }
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] === 1 && dStart[next] === dStart[cell]! + 1 && dGoal[next] !== -1) { counts[next] = Math.min(999, counts[next]! + counts[cell]!); }
    }
  }

  // Explorer (the generator's steering metric) and its Monte-Carlo mean.
  const explorer = createFeltExplorer(g.width, g.height);
  const run = explorer.run(g.open, start, goal);
  const pullSteps = run.steps;
  const explorerPath = run.pathLength;
  let pullMc = 0;
  const feltMaze = {
    width: g.width,
    height: g.height,
    grid: Array.from({ length: g.height }, (_, y) => Array.from({ length: g.width }, (_, x) => g.open[(y * g.width) + x] === 1)),
    start: maze.start,
    goal: maze.goal,
    solutionPath: route.map((cell) => ({ x: cell % g.width, y: (cell - (cell % g.width)) / g.width }))
  };
  for (let tie = 1; tie <= 8; tie += 1) { pullMc += simulatePullToGoalWalker(feltMaze, tie * 7919); }
  pullMc /= 8;

  // Stochastic walkers.
  const walks: number[] = [];
  for (let k = 0; k < 5; k += 1) { walks.push(randomWalk(g, start, goal, 1000 + k, RANDOM_WALK_CAP)); }
  const humans: number[] = [];
  for (let k = 0; k < 8; k += 1) { humans.push(humanWalk(g, start, goal, goalX, goalY, 2000 + k, HUMAN_WALK_CAP)); }

  // Junction structure.
  let junctions = 0;
  let degreeSum = 0;
  let deadEnds = 0;
  let deadEndDepthMax = 0;
  let deadEndDepthSum = 0;
  for (let cell = 0; cell < g.size; cell += 1) {
    if (g.open[cell] !== 1) { continue; }
    const deg = degree(g, cell);
    degreeSum += deg;
    if (deg >= 3) { junctions += 1; }
    if (deg === 1 && cell !== start && cell !== goal) {
      deadEnds += 1;
      // Depth: steps back to the first junction.
      let depth = 0;
      let prev = -1;
      let walk = cell;
      for (;;) {
        let nextCell = -1;
        for (let d = 0; d < 4; d += 1) {
          const candidate = g.nbr[(walk * 4) + d]!;
          if (g.open[candidate] === 1 && candidate !== prev) { nextCell = candidate; break; }
        }
        if (nextCell < 0) { break; }
        depth += 1;
        prev = walk;
        walk = nextCell;
        if (degree(g, walk) >= 3 || walk === start || walk === goal || depth > g.size) { break; }
      }
      deadEndDepthMax = Math.max(deadEndDepthMax, depth);
      deadEndDepthSum += depth;
    }
  }

  // Route junctions: decision points, misleading pulls, ambiguous choices.
  let decisionPoints = 0;
  let misleading = 0;
  let ambiguous = 0;
  let branchingSum = 0;
  for (let i = 1; i < route.length - 1; i += 1) {
    const cell = route[i]!;
    if (degree(g, cell) < 3) { continue; }
    decisionPoints += 1;
    const forward: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const next = g.nbr[(cell * 4) + d]!;
      if (g.open[next] === 1 && next !== route[i - 1]) { forward.push(next); }
    }
    branchingSum += forward.length;
    const dists = forward.map((cellIndex) => goalDistance(g, goalX, goalY, cellIndex));
    let bestIndex = 0;
    dists.forEach((value, index) => { if (value < dists[bestIndex]!) { bestIndex = index; } });
    if (forward[bestIndex] !== route[i + 1]) { misleading += 1; }
    const sorted = [...dists].sort((a, b) => a - b);
    if (sorted.length >= 2 && (sorted[1]! - sorted[0]!) < 1) { ambiguous += 1; }
  }

  // Cycles: E - V + C over the whole graph, and without wrap edges.
  const cycleCount = (skipWrap: boolean): number => {
    let nodes = 0;
    let edges = 0;
    for (let cell = 0; cell < g.size; cell += 1) {
      if (g.open[cell] !== 1) { continue; }
      nodes += 1;
      for (let d = 0; d < 4; d += 1) {
        const next = g.nbr[(cell * 4) + d]!;
        if (g.open[next] !== 1) { continue; }
        if (skipWrap && g.wrapStep[(cell * 4) + d] === 1) { continue; }
        edges += 1;
      }
    }
    edges /= 2;
    const seen = new Uint8Array(g.size);
    let components = 0;
    for (let cell = 0; cell < g.size; cell += 1) {
      if (g.open[cell] !== 1 || seen[cell] === 1) { continue; }
      components += 1;
      const stack = [cell];
      seen[cell] = 1;
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (let d = 0; d < 4; d += 1) {
          const next = g.nbr[(current * 4) + d]!;
          if (g.open[next] !== 1 || seen[next] === 1) { continue; }
          if (skipWrap && g.wrapStep[(current * 4) + d] === 1) { continue; }
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    return edges - nodes + components;
  };
  const cyclomatic = cycleCount(false);
  const loopsInterior = cycleCount(true);

  // Loop stretches on the shortest route: maximal runs of non-bridge route edges.
  const bridges = findBridges(g);
  const edgeKey = (u: number, v: number): number => (u < v ? (u * g.size) + v : (v * g.size) + u);
  let loopStretches = 0;
  let choiceStakes = 0;
  let ratioSum = 0;
  let tieStretches = 0;
  for (let i = 0; i < route.length - 1;) {
    if (bridges.has(edgeKey(route[i]!, route[i + 1]!))) { i += 1; continue; }
    let j = i;
    while (j < route.length - 1 && !bridges.has(edgeKey(route[j]!, route[j + 1]!))) { j += 1; }
    const ways = twoWays(g, route[i]!, route[j]!);
    if (ways !== null) {
      loopStretches += 1;
      choiceStakes += ways[1] - ways[0];
      ratioSum += ways[1] / Math.max(1, ways[0]);
      if (ways[1] <= ways[0] * 1.12) { tieStretches += 1; }
    }
    i = j;
  }

  const loopSaved = (maze as { loopStats?: { saved: number } | null }).loopStats?.saved ?? 0;
  const wrapSaved = (maze as { wrapStats?: { saved: number } | null }).wrapStats?.saved ?? 0;
  const wrapSaving = Math.max(0, dDirect[goal]! - shortest);
  const analysis: MazeDifficultyMetrics = analyzeMazeDifficulty({
    ...feltMaze,
    solutionPath: feltMaze.solutionPath
  });

  return {
    pricedSteps: pullSteps - loopSaved - wrapSaved,
    wrapSaving,
    pricedStepsWithWraps: pullSteps - loopSaved - wrapSaving,
    floorCells,
    boardFill: floorCells / g.size,
    shortest,
    shortestDirect: dDirect[goal]!,
    pullSteps,
    pullStepsMc: pullMc,
    explorerPath,
    slack: Math.max(0, explorerPath - shortest),
    randomWalkSteps: median(walks),
    randomWalkCensored: walks.filter((value) => value >= RANDOM_WALK_CAP).length / walks.length,
    humanSteps: median(humans),
    humanCensored: humans.filter((value) => value >= HUMAN_WALK_CAP).length / humans.length,
    decisionPoints,
    junctions,
    meanBranching: decisionPoints > 0 ? branchingSum / decisionPoints : 0,
    misleadingJunctions: misleading,
    ambiguousJunctions: ambiguous,
    deadEnds,
    deadEndDepthMax,
    deadEndDepthMean: deadEnds > 0 ? deadEndDepthSum / deadEnds : 0,
    cyclomatic,
    loopsInterior,
    loopsWrap: cyclomatic - loopsInterior,
    loopStretches,
    choiceStakes,
    altRatioMean: loopStretches > 0 ? ratioSum / loopStretches : 0,
    tieStretches,
    shortestRoutes: counts[goal]!,
    routeTurns: analysis.routeTurns,
    decoyCells: analysis.decoyCells,
    maxDecoyDepth: analysis.maxDecoyDepth,
    astarExpansions: analysis.astarExpansions,
    greedySearchCells: analysis.greedySearchCells,
    deceptiveness: analysis.deceptiveness
  };
};
