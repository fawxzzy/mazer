// Decoy tuning: a deterministic, integer-only post-carve stage that nudges a
// generated maze's H1 geometry proxy onto an exact per-level target by adding or
// pruning dead-end DECOY branches, instead of searching hundreds of candidate
// mazes for one that happens to land near the target.
//
// Why: the proxy of an untouched maze varies by a standard deviation of ~25 around
// its profile mean. Making every level strictly harder than the last, with a
// fine step, by candidate search alone needs dozens of builds per level (hundreds
// of milliseconds on a phone) and its ceiling is the tail of the distribution.
// Here ONE base maze is built and the proxy is steered exactly, so the cost is one
// build plus a few cheap grid edits and the ceiling is the board's decoy capacity.
//
// What a decoy is: a short self-avoiding dead-end branch carved into wall space,
// attached to a floor corridor cell. It never touches the border ring (so wrap
// topology and the edge-wrap count are unchanged), never touches the start/goal
// cells, never connects to any other floor cell (each carved cell has exactly one
// floor neighbour, torus adjacency), so the maze stays a tree where it was one,
// the solution path and every shortest-path / route audit are unchanged, and the
// maze stays solvable. Pruning removes whole off-route dead-end branches back to
// their junction, with the same guarantees.
//
// Proxy effect (H1 = turns + len/4 + 3*splits + 2*max(0, dead-2) + 6*wraps; only
// splits and dead ends move): a decoy off a 2-neighbour corridor cell adds a
// junction and a dead end (+5); off a 3-neighbour junction it adds a dead end
// only (+2). Pruning is the exact inverse (-5 / -2). Moves of +5 and +2 reach every
// integer offset except 1 and 3, so the stage lands within +-TOLERANCE (1.0)
// of the target; with a target step above 2 * TOLERANCE adjacent levels can
// therefore never tie or invert.
//
// Pure: no ambient randomness or clock, no floats in any placement decision (only the final
// proxy comparison uses the fixed 1/4 weight, which is exact in binary floating
// point), no time, no I/O.

import type { GeometryBudgetProxyBreakdown } from './legacyGeometryBudget';

export interface DecoyTuningMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly solutionPath: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface DecoyTuningOptions {
  // Accept window around the target.
  readonly tolerance?: number;
  // Decoy branch length bounds (cells carved per decoy).
  readonly minLength?: number;
  readonly maxLength?: number;
  // Hard cap on edits per call (safety bound; never reached in practice).
  readonly maxEdits?: number;
}

export interface DecoyTuningResult {
  // New grid (the input is never mutated).
  readonly grid: boolean[][];
  readonly proxy: number;
  readonly target: number;
  readonly onTarget: boolean;
  // Decoy branches added / pruned.
  readonly added: number;
  readonly pruned: number;
  readonly decoyTiles: { x: number; y: number }[];
  readonly prunedTiles: { x: number; y: number }[];
  // True when an add was needed and no site was left (the board's decoy capacity).
  readonly capacityExhausted: boolean;
  // Planned moves in execution order (+5 / +2 add, -5 / -2 prune); a trailing '!' marks a move that found no site.
  readonly moveLog: readonly string[];
}

export const DECOY_TUNING_TOLERANCE = 1;
export const DECOY_DEFAULT_MIN_LENGTH = 2;
export const DECOY_DEFAULT_MAX_LENGTH = 6;
export const DECOY_DEFAULT_MAX_EDITS = 2000;

const DX = [1, -1, 0, 0] as const;
const DY = [0, 0, 1, -1] as const;

// Integer-only deterministic stream (LCG step + xorshift scramble of the high
// bits), draws are `(state >>> 8) % n`.
const createStream = (seed: number): (() => number) => {
  let state = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

const tuneOnce = (
  maze: DecoyTuningMaze,
  baseProxy: GeometryBudgetProxyBreakdown,
  target: number,
  seed: number,
  options: DecoyTuningOptions
): DecoyTuningResult => {
  const tolerance = options.tolerance ?? DECOY_TUNING_TOLERANCE;
  const minLength = Math.max(1, options.minLength ?? DECOY_DEFAULT_MIN_LENGTH);
  const maxLength = Math.max(minLength, options.maxLength ?? DECOY_DEFAULT_MAX_LENGTH);
  const maxEdits = options.maxEdits ?? DECOY_DEFAULT_MAX_EDITS;
  const { width, height } = maze;
  const size = width * height;
  const open = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (maze.grid[y]?.[x] === true) {
        open[(y * width) + x] = 1;
      }
    }
  }
  const protectedCell = new Uint8Array(size);
  maze.solutionPath.forEach((point) => { protectedCell[(point.y * width) + point.x] = 1; });
  protectedCell[(maze.start.y * width) + maze.start.x] = 1;
  protectedCell[(maze.goal.y * width) + maze.goal.x] = 1;

  const idx = (x: number, y: number): number => (y * width) + x;
  const interior = (x: number, y: number): boolean => x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2;
  const openNeighborCount = (x: number, y: number): number => {
    let n = 0;
    for (let d = 0; d < 4; d += 1) {
      const nx = (x + DX[d]! + width) % width;
      const ny = (y + DY[d]! + height) % height;
      n += open[idx(nx, ny)]!;
    }
    return n;
  };

  const degree = new Uint8Array(size);
  let splits = 0;
  let dead = 0;
  const countCell = (index: number, sign: 1 | -1): void => {
    if (open[index] !== 1) { return; }
    const d = degree[index]!;
    if (d <= 1) { dead += sign; }
    if (d >= 3) { splits += sign; }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = idx(x, y);
      if (open[index] === 1) {
        degree[index] = openNeighborCount(x, y);
        countCell(index, 1);
      }
    }
  }
  const fixed = baseProxy.turns + (baseProxy.length / 4) + (6 * baseProxy.wraps);
  const proxyOf = (): number => fixed + (3 * splits) + (2 * Math.max(0, dead - 2));

  const bumpDegree = (index: number, delta: 1 | -1): void => {
    countCell(index, -1);
    degree[index] = degree[index]! + delta;
    countCell(index, 1);
  };

  const rand = createStream(seed);
  const decoyTiles: { x: number; y: number }[] = [];
  const prunedTiles: { x: number; y: number }[] = [];
  // Cells that may host a new decoy attachment: every interior floor cell that is
  // not start/goal. Maintained as carving adds cells (so branches can branch).
  const hosts: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const x = index % width;
    const y = (index - x) / width;
    if (open[index] === 1 && interior(x, y) && !(x === maze.start.x && y === maze.start.y) && !(x === maze.goal.x && y === maze.goal.y)) {
      hosts.push(index);
    }
  }

  // Try to carve one decoy from `host` in direction order starting at `first`.
  const tryCarve = (host: number, wantDegree: number): boolean => {
    if (degree[host] !== wantDegree) { return false; }
    const hx = host % width;
    const hy = (host - hx) / width;
    const startDir = rand() % 4;
    const length = minLength + (rand() % (maxLength - minLength + 1));
    for (let k = 0; k < 4; k += 1) {
      const dir = (startDir + k) % 4;
      const nx = hx + DX[dir]!;
      const ny = hy + DY[dir]!;
      if (!interior(nx, ny) || open[idx(nx, ny)] === 1 || openNeighborCount(nx, ny) !== 1) { continue; }
      // Commit the first cell, then extend a self-avoiding meander.
      const carved: number[] = [];
      let cx = nx;
      let cy = ny;
      let heading = dir;
      for (;;) {
        const cell = idx(cx, cy);
        open[cell] = 1;
        carved.push(cell);
        if (carved.length >= length) { break; }
        // Prefer to turn (alternate), else go straight, else the other turn.
        const turnFirst = (rand() & 1) === 0;
        const swap = (rand() & 1) === 0;
        const perpA = swap ? [2, 3, 0, 1][heading]! : [3, 2, 1, 0][heading]!;
        const perpB = swap ? [3, 2, 1, 0][heading]! : [2, 3, 0, 1][heading]!;
        const order = turnFirst ? [perpA, heading, perpB] : [heading, perpA, perpB];
        let moved = false;
        for (const next of order) {
          const tx = cx + DX[next]!;
          const ty = cy + DY[next]!;
          if (interior(tx, ty) && open[idx(tx, ty)] !== 1 && openNeighborCount(tx, ty) === 1) {
            cx = tx;
            cy = ty;
            heading = next;
            moved = true;
            break;
          }
        }
        if (!moved) { break; }
      }
      // Degrees: host +1; each carved cell has 1 or 2 open neighbours now.
      bumpDegree(host, 1);
      carved.forEach((cell) => {
        const x = cell % width;
        const y = (cell - x) / width;
        // Computed after the whole chain is open so its own links are counted.
        degree[cell] = openNeighborCount(x, y);
        countCell(cell, 1);
        hosts.push(cell);
        decoyTiles.push({ x, y });
      });
      return true;
    }
    return false;
  };

  const carveOne = (wantDegree: number): boolean => {
    // Seeded probes first (cheap), then an ordered exhaustive scan (so the stage
    // reports a true capacity, not a probe miss).
    for (let probe = 0; probe < 48; probe += 1) {
      const host = hosts[rand() % hosts.length]!;
      if (tryCarve(host, wantDegree)) { return true; }
    }
    const offset = rand() % hosts.length;
    for (let k = 0; k < hosts.length; k += 1) {
      if (tryCarve(hosts[(offset + k) % hosts.length]!, wantDegree)) { return true; }
    }
    return false;
  };

  // Prune one off-route dead-end branch back to its junction. Returns the delta
  // actually applied (negative) or 0 when no branch of that kind exists.
  const pruneOne = (wantParentDegree: number): boolean => {
    const leaves: number[] = [];
    for (let index = 0; index < size; index += 1) {
      if (open[index] === 1 && degree[index] === 1 && protectedCell[index] !== 1) {
        const x = index % width;
        const y = (index - x) / width;
        if (interior(x, y)) { leaves.push(index); }
      }
    }
    if (leaves.length === 0) { return false; }
    const offset = rand() % leaves.length;
    for (let k = 0; k < leaves.length; k += 1) {
      const leaf = leaves[(offset + k) % leaves.length]!;
      // Walk the chain toward the junction.
      const chain: number[] = [leaf];
      let current = leaf;
      let parent = -1;
      for (;;) {
        const cx = current % width;
        const cy = (current - cx) / width;
        let next = -1;
        for (let d = 0; d < 4; d += 1) {
          const nx = (cx + DX[d]! + width) % width;
          const ny = (cy + DY[d]! + height) % height;
          const candidate = idx(nx, ny);
          if (open[candidate] === 1 && candidate !== chain[chain.length - 2]) {
            next = candidate;
            break;
          }
        }
        if (next < 0) { parent = -1; break; }
        if (degree[next] >= 3 || protectedCell[next] === 1) { parent = next; break; }
        const nxX = next % width;
        const nxY = (next - nxX) / width;
        if (!interior(nxX, nxY)) { parent = -1; break; }
        chain.push(next);
        current = next;
      }
      if (parent < 0 || degree[parent] !== wantParentDegree) { continue; }
      chain.forEach((cell) => {
        countCell(cell, -1);
        open[cell] = 0;
        degree[cell] = 0;
        prunedTiles.push({ x: cell % width, y: (cell - (cell % width)) / width });
      });
      bumpDegree(parent, -1);
      return true;
    }
    return false;
  };

  // Move planner. The four available moves change the proxy by +5 (decoy off a
  // 2-neighbour cell), +2 (decoy off a 3-neighbour cell), -5 and -2 (prune a branch
  // back to a 3- / 4-neighbour junction). Each iteration finds the cheapest
  // multiset of moves whose sum lands within tolerance of the current gap
  // (fewest edits, then fewest 2-moves because they are scarcer), executes its
  // first move, and re-plans. A move that finds no site is banned for the rest of
  // the call, so the loop always terminates and never oscillates.
  const banned = new Set<number>();
  const planFirstMove = (gap: number): number | null => {
    // Far from the target the cheapest plan is simply more of the big move.
    if (Math.abs(gap) > 40) {
      const big = gap > 0 ? 5 : -5;
      const small = gap > 0 ? 2 : -2;
      return !banned.has(big) ? big : (!banned.has(small) ? small : null);
    }
    let best: { cost: number; twos: number; first: number } | null = null;
    const fiveRange = Math.ceil(Math.abs(gap) / 5) + 2;
    for (let n5 = -fiveRange; n5 <= fiveRange; n5 += 1) {
      for (let n2 = -4; n2 <= 4; n2 += 1) {
        if (Math.abs(gap - ((5 * n5) + (2 * n2))) > tolerance) { continue; }
        if ((n5 > 0 && banned.has(5)) || (n5 < 0 && banned.has(-5)) || (n2 > 0 && banned.has(2)) || (n2 < 0 && banned.has(-2))) { continue; }
        const cost = Math.abs(n5) + Math.abs(n2);
        const twos = Math.abs(n2);
        if (best === null || cost < best.cost || (cost === best.cost && twos < best.twos)) {
          best = { cost, twos, first: n5 !== 0 ? (n5 > 0 ? 5 : -5) : (n2 > 0 ? 2 : -2) };
        }
      }
    }
    return best === null ? null : best.first;
  };

  const moveLog: string[] = [];
  let added = 0;
  let pruned = 0;
  let capacityExhausted = false;
  let edits = 0;
  while (edits < maxEdits) {
    const gap = target - proxyOf();
    if (Math.abs(gap) <= tolerance) { break; }
    const move = planFirstMove(gap);
    if (move === null) {
      capacityExhausted = gap > 0;
      break;
    }
    edits += 1;
    let done = false;
    if (move > 0) {
      done = carveOne(move === 5 ? 2 : 3);
      if (done) { added += 1; }
    } else {
      done = pruneOne(move === -5 ? 3 : 4);
      if (done) { pruned += 1; }
    }
    moveLog.push(`${move}${done ? '' : '!'}`);
    if (!done) { banned.add(move); }
  }

  const grid: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push(open[idx(x, y)] === 1);
    }
    grid.push(row);
  }
  const proxy = proxyOf();
  return {
    grid,
    proxy,
    target,
    onTarget: Math.abs(target - proxy) <= tolerance,
    added,
    pruned,
    decoyTiles,
    prunedTiles,
    capacityExhausted,
    moveLog
  };
};

// Cheap restarts. A single pass can dead-end (for example a +2 move needs a
// 3-neighbour host with a free pocket and the random +5 host left none). Restarting
// from the untouched base with another deterministic stream costs ~1-2 ms, far
// less than building another base maze, so up to DECOY_TUNING_ATTEMPTS passes run
// before the caller falls back to a different base maze. The first pass that lands
// on target wins; otherwise the closest pass is returned.
export const DECOY_TUNING_ATTEMPTS = 8;

export const tuneMazeProxyToTarget = (
  maze: DecoyTuningMaze,
  baseProxy: GeometryBudgetProxyBreakdown,
  target: number,
  seed: number,
  options: DecoyTuningOptions = {}
): DecoyTuningResult => {
  let best: DecoyTuningResult | null = null;
  for (let attempt = 0; attempt < DECOY_TUNING_ATTEMPTS; attempt += 1) {
    const result = tuneOnce(maze, baseProxy, target, (Math.imul(seed >>> 0, 0x2545f491) + Math.imul(attempt, 0x9e3779b1)) >>> 0, options);
    if (best === null || Math.abs(result.proxy - target) < Math.abs(best.proxy - target)) {
      best = result;
    }
    if (result.onTarget || result.capacityExhausted) {
      break;
    }
  }
  return best!;
};
