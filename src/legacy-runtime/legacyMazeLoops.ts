// Multiple routes: deterministic loop carving for the felt-tuned ladder mazes.
//
// Every ladder maze used to be a spanning tree (one route) plus wrap corridors.
// This stage carves LOOPS: a connector corridor between two cells of the maze, so a
// level can offer a second way to the goal. Three kinds:
//
//   shortcut   a connector between two cells of the shortest route that is shorter
//              than the route stretch it bypasses by at least LOOP_SHORTCUT_MIN_SAVE
//              steps (and at most LOOP_SHORTCUT_MAX_SAVE_PERCENT of the route): the
//              shortest route gets shorter, a real reward for finding it.
//   alternate  a connector between two route cells within a tolerance of the stretch
//              it parallels (max(4, 12 percent of the route)): two ways of about the
//              same length, a real choice with no obvious winner.
//   decoy      a loop inside WRONG ground: a connector joining two cells of the same
//              dead-end region, so the region the walker is lured into is a tangle
//              with a cycle instead of a plain dead end. It costs the pull-to-goal
//              explorer about two steps per cell (the same as a dead-end branch, so
//              it spends the board as efficiently), and for a person it is a false
//              way on: a loop that looks like progress and returns to where they have
//              been. (The tuner places decoys: it needs the explorer's visited set.)
//
// For shortcuts and alternates both endpoints are cells of the current shortest route
// (BFS, wrap-aware, i.e. what a player who can wrap really has), so for a connector
// of c cells between route cells i < j the route through it is c + 1 long against
// j - i for the stretch and the saving (or loss) is exact before carving.
//
// Constraints, so a loop looks like the rest of the maze and never harms it:
//  * only interior cells are carved: the border ring (wrap corridors, wrap
//    topology), the start and the goal are never touched;
//  * every carved cell touches exactly one open cell when it is carved (its
//    predecessor), except the last, which also touches the far endpoint, so no
//    2x2 open block and no accidental adjacency to another corridor appears;
//  * every carve is verified by re-running the felt explorer (the same one the
//    tuner steers on) and rolled back unless the maze is still solvable and its
//    felt value stays at or below `feltLimit`, so the tuner always has headroom
//    left to land the level's exact target afterwards.
//
// Wraps and loops are one family of optional structure. A wrap corridor is a loop through
// the board edge; the loops here are interior only (the border ring is never carved), so
// the two never touch. The loop search runs on the torus, so every shortcut is measured
// against the route a wrap-using player really has (a connector must still save at least
// LOOP_SHORTCUT_MIN_SAVE and 5 percent of THAT route, and the total cap is a share of that
// original route), and a wrap never makes a loop redundant or a loop a wrap. Both are
// priced against one baseline by the tuner (legacyMazeFeltTuning.ts): the wrap saving is the
// planar route (wrap links severed, connectors closed) minus the torus route (connectors
// closed), the loop saving is the torus route (connectors closed) minus the route as built,
// so the two add up to the whole saving exactly and nothing is counted twice.
//
// Pure and deterministic: integer arithmetic, a caller-supplied random stream, no
// clock, no ambient randomness.

import type { FeltRun } from './legacyMazeFeltDifficulty';

export type LegacyLoopKind = 'shortcut' | 'alternate' | 'decoy';

export interface LegacyLoopPlan {
  readonly shortcuts: number;
  readonly alternates: number;
  readonly decoys: number;
  // Longest connector, in cells.
  readonly maxConnector: number;
  // Upper bound on connector cells carved in total for the maze (shortcuts and alternates).
  readonly cellBudget: number;
}

export const LEGACY_EMPTY_LOOP_PLAN: LegacyLoopPlan = Object.freeze({
  shortcuts: 0, alternates: 0, decoys: 0, maxConnector: 0, cellBudget: 0
});

export const legacyLoopPlanSize = (plan: LegacyLoopPlan): number => plan.shortcuts + plan.alternates + plan.decoys;

// A shortcut must save at least this many steps (and 5 percent of the route).
export const LOOP_SHORTCUT_MIN_SAVE = 6;
// ...but never more than this share of the route (percent) per loop: a shortcut is a
// reward, not the end of the maze.
export const LOOP_SHORTCUT_MAX_SAVE_PERCENT = 12;
// All shortcuts together may take at most this share of the ORIGINAL shortest route.
export const LOOP_TOTAL_SAVE_PERCENT = 18;
// An alternate's two ways differ by at most max(LOOP_TOLERANCE_MIN, this percent of the
// route) when the connector is the longer one, and the connector may be the SHORTER by at
// most max(2, LOOP_ALTERNATE_GAIN_PERCENT of the route): a real choice, not a shortcut.
export const LOOP_TOLERANCE_MIN = 4;
export const LOOP_TOLERANCE_PERCENT = 12;
export const LOOP_ALTERNATE_GAIN_PERCENT = 4;
// Shortest stretch (route steps, or tree distance for a decoy) a loop bypasses.
export const LOOP_MIN_SEGMENT = 8;
// Placement attempts per requested loop.
export const LOOP_ATTEMPTS = 28;
// Fewest cells a decoy connector may have (a shorter one is a visible nub).
export const LOOP_DECOY_MIN_CELLS = 5;
// Headroom the tuner needs under its target after the loops are placed.
export const LOOP_FELT_HEADROOM = 10;

export interface LegacyLoopRecord {
  readonly kind: LegacyLoopKind;
  // Carved cells, in order from the host endpoint.
  readonly cells: readonly number[];
  // Route index of the two endpoints (from < to) on the shortest route at carve time
  // (0 for a decoy, which is not placed on the route).
  readonly from: number;
  readonly to: number;
  // Stretch bypassed minus connector route (positive = shorter way); 0 for a decoy.
  readonly saving: number;
}

export interface LoopCandidate {
  readonly path: number[];
  // The lane index (route index, or tree distance for a decoy) of the far endpoint.
  readonly targetIndex: number;
}

export interface LoopSearch {
  // Every connector from `host` (lane index `hostIndex`) that ends touching another
  // lane cell (`idx[cell] >= 0`) at least LOOP_MIN_SEGMENT lane steps away.
  collect: (host: number, hostIndex: number, maxCells: number, idx: Int32Array) => LoopCandidate[];
  // Carves a connector with the per-cell invariant verified live; undoes itself on a miss.
  carve: (cells: readonly number[]) => boolean;
}

// Searching from a host to ANY lane cell, instead of to one chosen cell, is what makes a
// loop findable on a maze whose corridors are only a few cells apart: a BFS through
// closed interior cells whose first cell touches only the host, whose middle cells
// touch nothing, and whose last cell touches only its target (or a single wall cell
// touching exactly the host and a target straight through).
export const createLoopSearch = (width: number, height: number, open: Uint8Array): LoopSearch => {
  const size = width * height;
  const step = [1, -1, width, -width] as const;
  const interior = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  };
  const openCount = (cell: number): number => (
    open[cell + 1]! + open[cell - 1]! + open[cell + width]! + open[cell - width]!
  );
  const queue = new Int32Array(size);
  const mark = new Int32Array(size);
  const parent = new Int32Array(size);
  const depth = new Int32Array(size);
  let markStamp = 0;
  const CANDIDATE_LIMIT = 96;

  const collect: LoopSearch['collect'] = (host, hostIndex, maxCells, idx) => {
    const found: LoopCandidate[] = [];
    if (maxCells < 1) { return found; }
    markStamp += 1;
    let head = 0;
    let tail = 0;
    for (let d = 0; d < 4; d += 1) {
      const cell = host + step[d]!;
      if (!interior(cell) || open[cell] === 1) { continue; }
      const count = openCount(cell);
      if (count === 2) {
        // A single wall cell between the host and a second lane cell, straight through.
        const far = cell + step[d]!;
        if (open[far] === 1 && idx[far]! >= 0 && Math.abs(idx[far]! - hostIndex) >= LOOP_MIN_SEGMENT) {
          found.push({ path: [cell], targetIndex: idx[far]! });
        }
        continue;
      }
      if (count !== 1) { continue; }
      mark[cell] = markStamp; parent[cell] = -1; depth[cell] = 1;
      queue[tail] = cell; tail += 1;
    }
    while (head < tail && found.length < CANDIDATE_LIMIT) {
      const cell = queue[head]!; head += 1;
      const cellDepth = depth[cell]!;
      if (cellDepth >= maxCells) { continue; }
      for (let d = 0; d < 4; d += 1) {
        const next = cell + step[d]!;
        if (!interior(next) || open[next] === 1 || mark[next] === markStamp) { continue; }
        const count = openCount(next);
        if (count === 1) {
          // A terminal touches one lane cell and nothing else.
          mark[next] = markStamp;
          let far = -1;
          for (let e = 0; e < 4; e += 1) { if (open[next + step[e]!] === 1) { far = next + step[e]!; } }
          if (far >= 0 && idx[far]! >= 0 && Math.abs(idx[far]! - hostIndex) >= LOOP_MIN_SEGMENT) {
            const path = [next];
            for (let at = cell; at !== -1; at = parent[at]!) { path.push(at); }
            path.reverse();
            found.push({ path, targetIndex: idx[far]! });
          }
          continue;
        }
        if (count !== 0) { continue; }
        mark[next] = markStamp; parent[next] = cell; depth[next] = cellDepth + 1;
        queue[tail] = next; tail += 1;
      }
    }
    return found;
  };

  const carve: LoopSearch['carve'] = (cells) => {
    const done: number[] = [];
    for (let k = 0; k < cells.length; k += 1) {
      const cell = cells[k]!;
      const expected = k === cells.length - 1 ? 2 : 1;
      if (!interior(cell) || open[cell] === 1 || openCount(cell) !== expected) {
        done.forEach((undo) => { open[undo] = 0; });
        return false;
      }
      open[cell] = 1;
      done.push(cell);
    }
    return true;
  };

  return { collect, carve };
};

// Accidental cycles. The base maze generator sometimes closes a loop by accident (about
// one base in five on the plain levels), which would make a "single route" level a
// two-route one and put a shortcut of unbounded size into a level whose loops are meant
// to be designed. This stage breaks every such cycle (cycles of the interior grid; wrap
// links across the board edge are never touched) by closing ONE two-neighbour cell on
// it, so the cycle becomes two dead-end tails and no floor is lost. A cell off the
// protected route is preferred, so the level's own route is unchanged where it can be;
// the start, the goal and the border ring are never closed. Returns the closed cells.
export const breakAccidentalCycles = (
  width: number,
  height: number,
  open: Uint8Array,
  startCell: number,
  goalCell: number,
  protectedRoute: ReadonlySet<number>
): number[] => {
  const size = width * height;
  const closed: number[] = [];
  const step = [1, -1, width, -width] as const;
  const inGrid = (cell: number, d: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    if (d === 0) { return x < width - 1; }
    if (d === 1) { return x > 0; }
    if (d === 2) { return y < height - 1; }
    return y > 0;
  };
  const interior = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  };
  const degree = (cell: number): number => {
    let n = 0;
    for (let d = 0; d < 4; d += 1) { if (inGrid(cell, d) && open[cell + step[d]!] === 1) { n += 1; } }
    return n;
  };
  for (let round = 0; round < 24; round += 1) {
    const disc = new Int32Array(size).fill(-1);
    const parent = new Int32Array(size).fill(-1);
    let clock = 0;
    let chord: [number, number] | null = null;
    for (let root = 0; root < size && chord === null; root += 1) {
      if (open[root] !== 1 || disc[root] !== -1) { continue; }
      const stackCell: number[] = [root];
      const stackDir: number[] = [0];
      disc[root] = clock; clock += 1;
      while (stackCell.length > 0 && chord === null) {
        const top = stackCell.length - 1;
        const cell = stackCell[top]!;
        const d = stackDir[top]!;
        if (d >= 4) { stackCell.pop(); stackDir.pop(); continue; }
        stackDir[top] = d + 1;
        if (!inGrid(cell, d)) { continue; }
        const next = cell + step[d]!;
        if (open[next] !== 1 || next === parent[cell]) { continue; }
        if (disc[next] === -1) {
          disc[next] = clock; clock += 1;
          parent[next] = cell;
          stackCell.push(next); stackDir.push(0);
        } else if (disc[next]! < disc[cell]!) {
          // A back edge to an ancestor closes a cycle.
          chord = [cell, next];
        }
      }
    }
    if (chord === null) { break; }
    // The cycle: from the chord's lower end up the tree to its ancestor.
    const cycle: number[] = [];
    for (let at = chord[0]; at !== -1; at = parent[at]!) {
      cycle.push(at);
      if (at === chord[1]) { break; }
    }
    const candidates = cycle
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => interior(cell) && cell !== startCell && cell !== goalCell && degree(cell) === 2);
    if (candidates.length === 0) { break; }
    const middle = (cycle.length - 1) / 2;
    const rank = (entry: { cell: number; index: number }): number => (
      (protectedRoute.has(entry.cell) ? 1000 : 0) + Math.abs(entry.index - middle)
    );
    candidates.sort((a, b) => rank(a) - rank(b));
    const cut = candidates[0]!.cell;
    open[cut] = 0;
    closed.push(cut);
  }
  return closed;
};

// Shortest route (BFS over the torus, wrap corridors included) from start to goal on an
// open grid; -1 when unreachable. One meter reuses its buffers.
export const createRouteMeter = (
  size: number,
  neighbors: Int32Array,
  startCell: number,
  goalCell: number
): ((open: Uint8Array) => number) => {
  const dist = new Int32Array(size);
  const queue = new Int32Array(size);
  return (open) => {
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    dist[startCell] = 0;
    queue[tail] = startCell; tail += 1;
    while (head < tail) {
      const cell = queue[head]!; head += 1;
      if (cell === goalCell) { return dist[cell]!; }
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[(cell * 4) + d]!;
        if (open[next] !== 1 || dist[next] !== -1) { continue; }
        dist[next] = dist[cell]! + 1;
        queue[tail] = next; tail += 1;
      }
    }
    return -1;
  };
};

// The neighbour table of the board WITHOUT its wrap links: the same layout as the torus
// table of the felt explorer (cell * 4 + direction: right, left, down, up), with -1 where
// a step would cross the board edge. `createRouteMeter` run on it measures the route a
// player has when every wrap corridor is closed (`open[-1]` is undefined, never 1).
// Memoized per board size; the table is read-only.
const planarNeighborCache = new Map<number, Int32Array>();
export const createPlanarNeighbors = (width: number, height: number): Int32Array => {
  const key = (width * 4096) + height;
  const cached = planarNeighborCache.get(key);
  if (cached !== undefined) { return cached; }
  const table = new Int32Array(width * height * 4);
  for (let cell = 0; cell < width * height; cell += 1) {
    const x = cell % width;
    const y = (cell - x) / width;
    table[(cell * 4)] = x < width - 1 ? cell + 1 : -1;
    table[(cell * 4) + 1] = x > 0 ? cell - 1 : -1;
    table[(cell * 4) + 2] = y < height - 1 ? cell + width : -1;
    table[(cell * 4) + 3] = y > 0 ? cell - width : -1;
  }
  planarNeighborCache.set(key, table);
  return table;
};

export interface LegacyLoopCarveInput {
  readonly width: number;
  readonly height: number;
  // Mutated: connector cells are set to 1.
  readonly open: Uint8Array;
  // Torus neighbour table, cell * 4 + direction (right, left, down, up).
  readonly neighbors: Int32Array;
  readonly startCell: number;
  readonly goalCell: number;
  readonly plan: LegacyLoopPlan;
  readonly rand: () => number;
  // Re-runs the felt explorer on `open` (the tuner's own evaluate).
  readonly evaluate: () => FeltRun;
  // Loops are rolled back unless the explorer reaches the goal in at most this many steps.
  readonly feltLimit: number;
  readonly search: LoopSearch;
}

export interface LegacyLoopCarveResult {
  readonly records: LegacyLoopRecord[];
  readonly cellsCarved: number;
  readonly attempts: number;
  // Why attempts were rejected (diagnostics for the analysis scripts and tests).
  readonly rejected: { readonly noConnector: number; readonly kindMismatch: number; readonly carveFailed: number; readonly feltRejected: number };
}

// Carves the plan's shortcuts and alternates (decoys belong to the tuner).
export const carveLegacyLoops = (input: LegacyLoopCarveInput): LegacyLoopCarveResult => {
  const { width, open, neighbors, startCell, goalCell, plan, rand, evaluate, feltLimit, search } = input;
  const size = width * input.height;
  const records: LegacyLoopRecord[] = [];
  let cellsCarved = 0;
  let attempts = 0;
  const rejected = { noConnector: 0, kindMismatch: 0, carveFailed: 0, feltRejected: 0 };
  const wanted: LegacyLoopKind[] = [];
  for (let n = 0; n < plan.shortcuts; n += 1) { wanted.push('shortcut'); }
  for (let n = 0; n < plan.alternates; n += 1) { wanted.push('alternate'); }
  if (wanted.length === 0) { return { records, cellsCarved, attempts, rejected }; }
  // Deterministic shuffle so kinds are placed in a seed-dependent order.
  for (let index = wanted.length - 1; index > 0; index -= 1) {
    const other = rand() % (index + 1);
    const tmp = wanted[index]!; wanted[index] = wanted[other]!; wanted[other] = tmp;
  }

  const dS = new Int32Array(size);
  const dG = new Int32Array(size);
  const queue = new Int32Array(size);
  const bfs = (from: number, out: Int32Array): void => {
    out.fill(-1);
    let head = 0;
    let tail = 0;
    out[from] = 0;
    queue[tail] = from; tail += 1;
    while (head < tail) {
      const cell = queue[head]!; head += 1;
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[(cell * 4) + d]!;
        if (open[next] !== 1 || out[next] !== -1) { continue; }
        out[next] = out[cell]! + 1;
        queue[tail] = next; tail += 1;
      }
    }
  };
  const buildRoute = (): number[] => {
    bfs(startCell, dS);
    bfs(goalCell, dG);
    const route = [startCell];
    for (let cell = startCell; cell !== goalCell;) {
      let chosen = -1;
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[(cell * 4) + d]!;
        if (open[next] === 1 && dS[next] === dS[cell]! + 1 && dG[next] === dG[cell]! - 1) { chosen = next; break; }
      }
      if (chosen < 0) { return []; }
      route.push(chosen);
      cell = chosen;
    }
    return route;
  };

  const routeIdx = new Int32Array(size);
  let route = buildRoute();
  const refreshRoute = (): void => {
    routeIdx.fill(-1);
    route.forEach((cell, index) => { routeIdx[cell] = index; });
  };
  refreshRoute();
  const initialRoute = route.length - 1;
  evaluate();
  if (route.length < (2 * LOOP_MIN_SEGMENT) + 6) { return { records, cellsCarved, attempts, rejected }; }
  let savedTotal = 0;

  for (const kind of wanted) {
    if (cellsCarved >= plan.cellBudget) { break; }
    for (let attempt = 0; attempt < LOOP_ATTEMPTS; attempt += 1) {
      attempts += 1;
      const routeLength = route.length - 1;
      const tolerance = Math.max(LOOP_TOLERANCE_MIN, Math.floor((routeLength * LOOP_TOLERANCE_PERCENT) / 100));
      const gainLimit = Math.max(2, Math.floor((routeLength * LOOP_ALTERNATE_GAIN_PERCENT) / 100));
      const minSave = Math.max(LOOP_SHORTCUT_MIN_SAVE, Math.ceil(routeLength / 20));
      const maxSave = Math.max(
        minSave,
        Math.min(
          Math.floor((routeLength * LOOP_SHORTCUT_MAX_SAVE_PERCENT) / 100),
          Math.floor((initialRoute * LOOP_TOTAL_SAVE_PERCENT) / 100) - savedTotal
        )
      );
      const hostIndex = 2 + (rand() % Math.max(1, routeLength - 3));
      const host = route[hostIndex]!;
      const budgetLeft = plan.cellBudget - cellsCarved;
      const candidates = search.collect(host, hostIndex, Math.min(plan.maxConnector, budgetLeft), routeIdx);
      if (candidates.length === 0) { rejected.noConnector += 1; continue; }
      const fitting = candidates.filter((candidate) => {
        const segment = Math.abs(candidate.targetIndex - hostIndex);
        const saving = segment - (candidate.path.length + 1);
        if (kind === 'shortcut') { return saving >= minSave && saving <= maxSave; }
        return saving >= -tolerance && saving <= gainLimit && candidate.path.length >= 3;
      });
      if (fitting.length === 0) { rejected.kindMismatch += 1; continue; }
      const chosen = fitting[rand() % fitting.length]!;
      if (!search.carve(chosen.path)) { rejected.carveFailed += 1; continue; }
      const next = evaluate();
      if (!next.reachedGoal || next.steps > feltLimit) {
        chosen.path.forEach((cell) => { open[cell] = 0; });
        rejected.feltRejected += 1;
        continue;
      }
      const segment = Math.abs(chosen.targetIndex - hostIndex);
      const saving = segment - (chosen.path.length + 1);
      records.push({
        kind,
        cells: chosen.path,
        from: Math.min(hostIndex, chosen.targetIndex),
        to: Math.max(hostIndex, chosen.targetIndex),
        saving
      });
      cellsCarved += chosen.path.length;
      if (saving > 0) { savedTotal += saving; }
      route = buildRoute();
      refreshRoute();
      if (route.length < (2 * LOOP_MIN_SEGMENT) + 6) { return { records, cellsCarved, attempts, rejected }; }
      break;
    }
  }
  return { records, cellsCarved, attempts, rejected };
};
