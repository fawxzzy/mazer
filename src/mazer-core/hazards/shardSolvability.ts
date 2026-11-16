/**
 * Shard route solver (slice H8). Pure: no scene, no randomness, no clock.
 *
 * A Shard is an objective cell (product contract 2.2 and 2.6). Shards are
 * collected IN ORDER: only the next shard counts, stepping on a later one does
 * nothing, and the star (goal) is locked until every shard is collected. While
 * the star is locked its cell is ordinary floor (the player may cross it).
 *
 * The search state of `solvability.ts` gains the next-shard index:
 * `(cell, tick mod P, invulnerable, next)` with `next` in 0..k (k = all
 * collected). A shard is collected on ARRIVAL: an action whose destination is
 * shard `next` moves the state to `next + 1`. The legality of an action (gate
 * blocking, occupancy, head-on swap, invulnerability) is exactly the one of
 * `createHazardStateSpace`, which this module reuses for every transition, so
 * the two searches cannot drift. The state space grows by the factor k + 1
 * ("a small multiple", contract 2.6); cells are packed to walkable cells only.
 *
 * Hunters (slice H5) are not modelled here: the timeline is the H2 one (gates
 * and Sentries, a pure function of the tick).
 */

import {
  HAZARD_ACTION_ORDER,
  HazardSpecError,
  createHazardTimeline,
  type HazardAction,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec,
  type HazardTimeline
} from './graphContract';
import { createHazardStateSpace, type HazardStateSpace } from './solvability';
import { DEFAULT_INVULNERABLE_TURNS, resolvePushbackCell } from './validation';

export const SHARD_WITNESS_CONTRACT = 'mazer-shard-witness-v1' as const;
export const SHARD_VERDICT_CONTRACT = 'mazer-shard-verdict-v1' as const;

/**
 * Upper bound on product states (walkable cells x period x (k + 1)) a verdict may
 * allocate. Above it the verdict is `unknown`, which counts as a fail (manifest
 * `fairness.unknownVerdictCountsAsFail`). 4M states is about 50 MB of typed arrays.
 */
export const SHARD_MAX_PRODUCT_STATES = 4_000_000;

/** Index of the next shard after arriving at `cell` with progress `next`. */
export const resolveShardProgressAfter = (
  shards: readonly HazardCellId[],
  cell: HazardCellId,
  next: number
): number => (next < shards.length && shards[next] === cell ? next + 1 : next);

export type ShardInputProblem =
  | 'shard-not-walkable'
  | 'shard-duplicate'
  | 'shard-on-start'
  | 'shard-on-goal';

/** Structural check of a shard list. Null when valid. */
export const findShardInputProblem = (
  graph: HazardGraph,
  shards: readonly HazardCellId[],
  start: HazardCellId,
  goal: HazardCellId
): ShardInputProblem | null => {
  const seen = new Set<HazardCellId>();
  for (const cell of shards) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= graph.cellCount || !graph.isWalkable(cell)) return 'shard-not-walkable';
    if (seen.has(cell)) return 'shard-duplicate';
    if (cell === start) return 'shard-on-start';
    if (cell === goal) return 'shard-on-goal';
    seen.add(cell);
  }
  return null;
};

/**
 * The invulnerability-0 transition layer packed to walkable cells: for every
 * (walkable cell, tick mod P) its legal successors in action order.
 */
interface PackedLayer {
  readonly period: number;
  /** Walkable cells. */
  readonly size: number;
  readonly cellOfDense: Int32Array;
  readonly denseOfCell: Int32Array;
  /** Per layer state `tickMod * size + dense`: up to 5 successor layer states, -1 terminated. */
  readonly successors: Int32Array;
  /** Action index (HAZARD_ACTION_ORDER) per successor slot. */
  readonly actions: Uint8Array;
  readonly space: HazardStateSpace;
}

const buildPackedLayer = (graph: HazardGraph, timeline: HazardTimeline): PackedLayer => {
  const space = createHazardStateSpace(graph, timeline, 0);
  const period = space.period;
  const denseOfCell = new Int32Array(graph.cellCount).fill(-1);
  const cells: number[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (graph.isWalkable(cell)) {
      denseOfCell[cell] = cells.length;
      cells.push(cell);
    }
  }
  const size = cells.length;
  const cellOfDense = Int32Array.from(cells);
  const layer = period * size;
  const successors = new Int32Array(layer * 5).fill(-1);
  const actions = new Uint8Array(layer * 5);
  for (let tickMod = 0; tickMod < period; tickMod += 1) {
    for (let dense = 0; dense < size; dense += 1) {
      const z = tickMod * size + dense;
      let slot = 0;
      space.forEachSuccessor(space.stateIndex(cellOfDense[dense]!, tickMod, 0), (next, action) => {
        const cell = space.cellOf(next);
        const nextTick = (tickMod + 1) % period;
        successors[z * 5 + slot] = nextTick * size + denseOfCell[cell]!;
        actions[z * 5 + slot] = HAZARD_ACTION_ORDER.indexOf(action);
        slot += 1;
      });
    }
  }
  return { period, size, cellOfDense, denseOfCell, successors, actions, space };
};

export interface ShardWitness {
  readonly contract: typeof SHARD_WITNESS_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly shards: readonly HazardCellId[];
  readonly startTick: number;
  readonly period: number;
  /** Number of actions (steps + waits). */
  readonly ticks: number;
  readonly waits: number;
  /** Cell after each action; `cells[0] === start`, length `ticks + 1`. */
  readonly cells: readonly HazardCellId[];
  readonly actions: readonly HazardAction[];
  /** `shardIndices[i]` = index into `cells` where shard i is collected (strictly increasing). */
  readonly shardIndices: readonly number[];
}

export type ShardUnsolvableReason =
  | ShardInputProblem
  | 'invalid-endpoint'
  | 'start-blocked'
  | 'start-contact'
  | 'no-route'
  | 'state-cap';

export type ShardWitnessResult =
  | { readonly solvable: true; readonly witness: ShardWitness; readonly exploredStates: number; readonly productStates: number }
  | { readonly solvable: false; readonly reason: ShardUnsolvableReason; readonly exploredStates: number; readonly productStates: number };

export interface FindShardWitnessOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** Shard cells in collection order. Empty = plain start -> goal. */
  readonly shards: readonly HazardCellId[];
  readonly startTick?: number;
  readonly maxProductStates?: number;
}

const productStatesOf = (graph: HazardGraph, period: number, shards: number): number => (
  graph.walkableCellCount * period * (shards + 1)
);

const searchShardWitness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  packed: PackedLayer | null,
  options: FindShardWitnessOptions
): ShardWitnessResult => {
  const { start, goal, shards } = options;
  const k = shards.length;
  const startTick = options.startTick ?? 0;
  if (!Number.isInteger(startTick) || startTick < 0) {
    throw new RangeError('startTick must be a non-negative integer');
  }
  const productStates = productStatesOf(graph, timeline.period, k);
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
    return { solvable: false, reason: 'invalid-endpoint', exploredStates: 0, productStates };
  }
  const problem = findShardInputProblem(graph, shards, start, goal);
  if (problem !== null) {
    return { solvable: false, reason: problem, exploredStates: 0, productStates };
  }
  if (productStates > (options.maxProductStates ?? SHARD_MAX_PRODUCT_STATES)) {
    return { solvable: false, reason: 'state-cap', exploredStates: 0, productStates };
  }
  const layerPack = packed ?? buildPackedLayer(graph, timeline);
  const { period, size, cellOfDense, denseOfCell, successors, actions, space } = layerPack;
  const startMod = startTick % period;
  const entry = space.entryProblem(start, startMod, 0);
  if (entry === 'blocked') return { solvable: false, reason: 'start-blocked', exploredStates: 0, productStates };
  if (entry === 'contact') return { solvable: false, reason: 'start-contact', exploredStates: 0, productStates };

  const layer = period * size;
  const total = layer * (k + 1);
  const shardDense = shards.map((cell) => denseOfCell[cell]!);
  const goalDense = denseOfCell[goal]!;
  const previous = new Int32Array(total).fill(-2);
  const previousAction = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const startState = startMod * size + denseOfCell[start]!;
  previous[startState] = -1;
  queue[tail++] = startState;
  let goalState = k === 0 && start === goal ? startState : -1;

  while (goalState < 0 && head < tail) {
    const state = queue[head++]!;
    const next = Math.floor(state / layer);
    const z = state - (next * layer);
    for (let slot = 0; slot < 5; slot += 1) {
      const target = successors[z * 5 + slot]!;
      if (target < 0) break;
      const dense = target % size;
      const nextAfter = next < k && shardDense[next] === dense ? next + 1 : next;
      const product = nextAfter * layer + target;
      if (previous[product] !== -2) continue;
      previous[product] = state;
      previousAction[product] = actions[z * 5 + slot]!;
      if (nextAfter === k && dense === goalDense) {
        goalState = product;
        break;
      }
      queue[tail++] = product;
    }
  }
  if (goalState < 0) {
    return { solvable: false, reason: 'no-route', exploredStates: tail, productStates };
  }

  const cellsReversed: HazardCellId[] = [];
  const actionsReversed: HazardAction[] = [];
  for (let cursor = goalState; cursor !== -1; cursor = previous[cursor]!) {
    cellsReversed.push(cellOfDense[(cursor % layer) % size]!);
    if (previous[cursor] !== -1) actionsReversed.push(HAZARD_ACTION_ORDER[previousAction[cursor]!]!);
  }
  const cells = cellsReversed.reverse();
  const actionList = actionsReversed.reverse();
  const shardIndices: number[] = [];
  let progress = 0;
  cells.forEach((cell, index) => {
    const after = resolveShardProgressAfter(shards, cell, progress);
    if (after !== progress) {
      shardIndices.push(index);
      progress = after;
    }
  });
  return {
    solvable: true,
    exploredStates: tail,
    productStates,
    witness: {
      contract: SHARD_WITNESS_CONTRACT,
      width: graph.width,
      height: graph.height,
      start,
      goal,
      shards: [...shards],
      startTick,
      period,
      ticks: actionList.length,
      waits: actionList.filter((action) => action === 'wait').length,
      cells,
      actions: actionList,
      shardIndices
    }
  };
};

/**
 * Shortest witness start -> shard 1 -> ... -> shard k -> star with every hazard of
 * the timeline active (BFS, action order up, left, down, right, wait; first
 * parent kept, so ties break deterministically).
 */
export const findShardWitness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: FindShardWitnessOptions
): ShardWitnessResult => searchShardWitness(graph, timeline, null, options);

/**
 * Route ticks through every possible LAST shard: for each cell x, the witness
 * length of start -> prefix[0] -> ... -> prefix[n-1] -> x -> star with x as
 * shard n + 1 (-1 = no route or not walkable). Exact because shards count only
 * in order: earlier layers ignore x, the first arrival on x collects it, and
 * `min over tickMod m of F(x, m) + D(x, m)` equals the product-space BFS, where
 * F is the earliest arrival in the "prefix collected" layer and D the fastest
 * way from (x, m) to the star. Cost: one forward and one reverse BFS.
 */
export const measureFinalShardTicks = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: {
    readonly start: HazardCellId;
    readonly goal: HazardCellId;
    readonly prefix: readonly HazardCellId[];
    readonly startTick?: number;
    readonly maxProductStates?: number;
  },
  packedLayer?: PackedLayer
): Int32Array => {
  const { start, goal, prefix } = options;
  const out = new Int32Array(graph.cellCount).fill(-1);
  const n = prefix.length;
  if (!graph.isWalkable(start) || !graph.isWalkable(goal) || findShardInputProblem(graph, prefix, start, goal) !== null) return out;
  if (productStatesOf(graph, timeline.period, n + 1) > (options.maxProductStates ?? SHARD_MAX_PRODUCT_STATES)) return out;
  const packed = packedLayer ?? buildPackedLayer(graph, timeline);
  const { period, size, cellOfDense, denseOfCell, successors, space } = packed;
  const startMod = (options.startTick ?? 0) % period;
  if (space.entryProblem(start, startMod, 0) !== null) return out;
  const layer = period * size;
  const prefixDense = prefix.map((cell) => denseOfCell[cell]!);
  // Forward: earliest tick of every product state in layers 0..n.
  const time = new Int32Array(layer * (n + 1)).fill(-1);
  const queue = new Int32Array(layer * (n + 1));
  let head = 0;
  let tail = 0;
  const startState = startMod * size + denseOfCell[start]!;
  time[startState] = 0;
  queue[tail++] = startState;
  while (head < tail) {
    const state = queue[head++]!;
    const next = Math.floor(state / layer);
    const z = state - (next * layer);
    for (let slot = 0; slot < 5; slot += 1) {
      const target = successors[z * 5 + slot]!;
      if (target < 0) break;
      const dense = target % size;
      const nextAfter = next < n && prefixDense[next] === dense ? next + 1 : next;
      const product = nextAfter * layer + target;
      if (time[product] !== -1) continue;
      time[product] = time[state]! + 1;
      queue[tail++] = product;
    }
  }
  // Reverse: fastest ticks from each layer state to the star (all collected).
  const toGoal = new Int32Array(layer).fill(-1);
  const preds: number[][] = Array.from({ length: layer }, () => []);
  for (let z = 0; z < layer; z += 1) {
    for (let slot = 0; slot < 5; slot += 1) {
      const target = successors[z * 5 + slot]!;
      if (target < 0) break;
      preds[target]!.push(z);
    }
  }
  const goalDense = denseOfCell[goal]!;
  const back = new Int32Array(layer);
  head = 0;
  tail = 0;
  for (let tickMod = 0; tickMod < period; tickMod += 1) {
    const z = tickMod * size + goalDense;
    toGoal[z] = 0;
    back[tail++] = z;
  }
  while (head < tail) {
    const z = back[head++]!;
    for (const from of preds[z]!) {
      if (toGoal[from] === -1) {
        toGoal[from] = toGoal[z]! + 1;
        back[tail++] = from;
      }
    }
  }
  const base = n * layer;
  const used = new Set<HazardCellId>([start, goal, ...prefix]);
  for (let dense = 0; dense < size; dense += 1) {
    const cell = cellOfDense[dense]!;
    if (used.has(cell)) continue;
    let best = -1;
    for (let tickMod = 0; tickMod < period; tickMod += 1) {
      const z = tickMod * size + dense;
      const arrive = time[base + z]!;
      const rest = toGoal[z]!;
      if (arrive >= 0 && rest >= 0 && (best < 0 || arrive + rest < best)) best = arrive + rest;
    }
    out[cell] = best;
  }
  return out;
};

export interface ShardSolvableQuery {
  readonly period: number;
  /**
   * Can the star be reached (all shards collected) from this state? `next` is the
   * progress BEFORE standing on `cell`; standing on shard `next` collects it.
   */
  isSolvable(cell: HazardCellId, tickMod: number, invulnerable: number, next: number): boolean;
}

/**
 * Exact solvability over the product space. The invulnerability-0 product is
 * closed (k = 0 states only reach k = 0 states), so it is solved once, layer by
 * layer from `next = k` (goal states) down to `next = 0`: a layer-j state is
 * solved when it reaches, inside layer j, a state that steps onto shard j into a
 * solved layer-(j + 1) state. Invulnerable states (k > 0) are evaluated on demand
 * and memoised, like `createSolvableQuery`.
 */
export const createShardSolvableQuery = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: { readonly goal: HazardCellId; readonly shards: readonly HazardCellId[]; readonly maxInvulnerableTurns?: number },
  packedLayer?: PackedLayer
): ShardSolvableQuery => {
  const { goal, shards } = options;
  const k = shards.length;
  const packed = packedLayer ?? buildPackedLayer(graph, timeline);
  const { period, size, denseOfCell, successors } = packed;
  const layer = period * size;
  // Reverse CSR of the packed layer.
  const offsets = new Int32Array(layer + 1);
  for (let z = 0; z < layer; z += 1) {
    for (let slot = 0; slot < 5; slot += 1) {
      const target = successors[z * 5 + slot]!;
      if (target < 0) break;
      offsets[target + 1] = offsets[target + 1]! + 1;
    }
  }
  for (let i = 0; i < layer; i += 1) offsets[i + 1] = offsets[i + 1]! + offsets[i]!;
  const fill = new Int32Array(layer);
  const predecessors = new Int32Array(offsets[layer]!);
  for (let z = 0; z < layer; z += 1) {
    for (let slot = 0; slot < 5; slot += 1) {
      const target = successors[z * 5 + slot]!;
      if (target < 0) break;
      predecessors[offsets[target]! + fill[target]!] = z;
      fill[target] = fill[target]! + 1;
    }
  }

  const solved = new Uint8Array(layer * (k + 1));
  const queue = new Int32Array(layer);
  const goalDense = goal >= 0 && goal < graph.cellCount ? denseOfCell[goal]! : -1;
  for (let j = k; j >= 0; j -= 1) {
    const base = j * layer;
    const excluded = j < k ? denseOfCell[shards[j]!]! : -1;
    let head = 0;
    let tail = 0;
    const mark = (z: number): void => {
      if (solved[base + z] === 0 && (z % size) !== excluded) {
        solved[base + z] = 1;
        queue[tail++] = z;
      }
    };
    if (j === k) {
      if (goalDense >= 0) {
        for (let tickMod = 0; tickMod < period; tickMod += 1) mark(tickMod * size + goalDense);
      }
    } else {
      // Seeds: predecessors of "arrive on shard j" states whose layer-(j + 1) state is solved.
      for (let tickMod = 0; tickMod < period; tickMod += 1) {
        const arrive = tickMod * size + excluded;
        if (solved[(j + 1) * layer + arrive] !== 1) continue;
        for (let i = offsets[arrive]!; i < offsets[arrive + 1]!; i += 1) mark(predecessors[i]!);
      }
    }
    while (head < tail) {
      const z = queue[head++]!;
      for (let i = offsets[z]!; i < offsets[z + 1]!; i += 1) mark(predecessors[i]!);
    }
  }

  const maxInvulnerable = options.maxInvulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  const invSpace = maxInvulnerable > 0 ? createHazardStateSpace(graph, timeline, maxInvulnerable) : null;
  const memo = new Map<number, boolean>();
  const isSolvable = (cell: HazardCellId, tickMod: number, invulnerable: number, nextBefore: number): boolean => {
    const next = resolveShardProgressAfter(shards, cell, nextBefore);
    if (next === k && cell === goal) return true;
    const dense = denseOfCell[cell] ?? -1;
    if (dense < 0) return false;
    if (invulnerable === 0) return solved[next * layer + tickMod * size + dense] === 1;
    if (invSpace === null || invulnerable > maxInvulnerable) {
      throw new RangeError(`invulnerable ${invulnerable} exceeds maxInvulnerableTurns ${maxInvulnerable}`);
    }
    const state = invSpace.stateIndex(cell, tickMod, invulnerable);
    const key = state * (k + 1) + next;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const following: number[] = [];
    invSpace.forEachSuccessor(state, (successor) => { following.push(successor); });
    const levels = invSpace.invulnerabilityLevels;
    let result = false;
    for (const successor of following) {
      const rest = Math.floor(successor / levels);
      if (isSolvable(rest % graph.cellCount, Math.floor(rest / graph.cellCount), successor % levels, next)) {
        result = true;
        break;
      }
    }
    memo.set(key, result);
    return result;
  };
  return { period, isSolvable };
};

export interface ShardEscapeSlack {
  readonly tested: number;
  readonly survivable: number;
  readonly unsurvivable: number;
  readonly ratio: number | null;
  readonly firstFragileIndex: number | null;
}

export type ShardPostContactFailureReason = 'pushback-cell-blocked' | 'pushback-cell-contact' | 'no-route-after-contact';

export interface ShardRouteVerdict {
  readonly contract: typeof SHARD_VERDICT_CONTRACT;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly shards: readonly HazardCellId[];
  readonly period: number | null;
  readonly productStates: number;
  readonly invulnerableTurns: number;
  /** (a) A witness collects every shard in order and reaches the star with every hazard active. */
  readonly hazardsPresent: { readonly pass: boolean; readonly reason: string | null; readonly ticks: number | null; readonly waits: number | null };
  /** (c) After a contact on any witness state, the rewind state (collected shards kept) is still solvable. */
  readonly postContact: {
    readonly pass: boolean;
    readonly skipped: boolean;
    readonly checkedStates: number;
    readonly failureCount: number;
    readonly firstFailure: { readonly witnessIndex: number; readonly reason: ShardPostContactFailureReason } | null;
  };
  /**
   * Start, goal and every shard lie in one component of the floor with every Sentry
   * route cell removed, so no Sentry route is a mandatory cell of any leg (A6 for
   * shard legs). Gates may sit on mandatory cells: waiting gets you through.
   */
  readonly sentryFreeLegs: boolean;
  /** Forced-WAIT test along the witness (same definition as the H2 overlay), with shard progress. */
  readonly escapeSlack: ShardEscapeSlack | null;
  /** (a) and (c) and the Sentry rule. The phone forgiveness gate is applied by the caller (shards.ts). */
  readonly pass: boolean;
  readonly witness: ShardWitness | null;
}

/** Cells reachable on the static floor from `from` with `removed` cells taken out (1 = reached). */
export const reachableWithout = (
  graph: HazardGraph,
  from: HazardCellId,
  removed: ReadonlySet<HazardCellId>
): Uint8Array => {
  const seen = new Uint8Array(graph.cellCount);
  if (removed.has(from) || !graph.isWalkable(from)) return seen;
  const queue = new Int32Array(graph.cellCount);
  let head = 0;
  let tail = 0;
  seen[from] = 1;
  queue[tail++] = from;
  while (head < tail) {
    const cell = queue[head++]!;
    for (const next of graph.neighbors(cell)) {
      if (seen[next] === 0 && !removed.has(next)) {
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return seen;
};

/** True when every `targets` cell is reachable from `from` without entering a `removed` cell. */
export const connectsWithout = (
  graph: HazardGraph,
  from: HazardCellId,
  targets: readonly HazardCellId[],
  removed: ReadonlySet<HazardCellId>
): boolean => {
  const seen = reachableWithout(graph, from, removed);
  return targets.every((cell) => seen[cell] === 1);
};

/** Cells covered by any Sentry (patrol) route. */
export const sentryRouteCells = (specs: readonly HazardSpec[]): Set<HazardCellId> => {
  const cells = new Set<HazardCellId>();
  for (const spec of specs) {
    if (spec.kind === 'patrol') for (const cell of spec.route) cells.add(cell);
  }
  return cells;
};

export const measureShardEscapeSlack = (
  space: HazardStateSpace,
  query: ShardSolvableQuery,
  witness: ShardWitness
): ShardEscapeSlack => {
  const period = query.period;
  let survivable = 0;
  let unsurvivable = 0;
  let firstFragile: number | null = null;
  let progress = resolveShardProgressAfter(witness.shards, witness.cells[0]!, 0);
  for (let index = 0; index < witness.ticks; index += 1) {
    const cell = witness.cells[index]!;
    if (index > 0) progress = resolveShardProgressAfter(witness.shards, cell, progress);
    const nextMod = (witness.startTick + index + 1) % period;
    let landing: HazardCellId | null = cell;
    const problem = space.entryProblem(cell, nextMod, 0);
    if (problem === 'contact') {
      landing = null;
    } else if (problem === 'blocked') {
      landing = null;
      for (let back = index - 1; back >= 0; back -= 1) {
        if (witness.cells[back] !== cell) {
          landing = witness.cells[back]!;
          break;
        }
      }
      if (landing !== null && space.entryProblem(landing, nextMod, 0) !== null) landing = null;
    }
    if (landing !== null && query.isSolvable(landing, nextMod, 0, progress)) {
      survivable += 1;
    } else {
      unsurvivable += 1;
      firstFragile ??= index;
    }
  }
  const tested = survivable + unsurvivable;
  return {
    tested,
    survivable,
    unsurvivable,
    ratio: tested === 0 ? null : Math.round((survivable / tested) * 10000) / 10000,
    firstFragileIndex: firstFragile
  };
};

export interface ValidateShardRouteOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly shards: readonly HazardCellId[];
  /** Contact-free turns after a rewind (default 2: a pass at 2 implies a pass at play's 4). */
  readonly invulnerableTurns?: number;
  readonly maxProductStates?: number;
}

/**
 * The shard verdict: witness with every hazard active, post-contact rewind
 * solvability with collected shards kept, the Sentry rule for every leg, and the
 * escape slack along the witness. `state-cap` (too many product states) is an
 * `unknown` verdict and fails.
 */
export const validateShardRoute = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  options: ValidateShardRouteOptions
): ShardRouteVerdict => {
  const { start, goal, shards } = options;
  const invulnerableTurns = options.invulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  const sentryFreeLegs = connectsWithout(graph, start, [goal, ...shards], sentryRouteCells(specs));
  const skipped = { pass: false, skipped: true, checkedStates: 0, failureCount: 0, firstFailure: null };
  const base = { contract: SHARD_VERDICT_CONTRACT, start, goal, shards: [...shards], invulnerableTurns, sentryFreeLegs };
  let timeline: HazardTimeline;
  try {
    timeline = createHazardTimeline(graph, specs);
  } catch (error) {
    if (!(error instanceof HazardSpecError)) throw error;
    return {
      ...base,
      period: null,
      productStates: 0,
      hazardsPresent: { pass: false, reason: `invalid-spec:${error.code}`, ticks: null, waits: null },
      postContact: skipped,
      escapeSlack: null,
      pass: false,
      witness: null
    };
  }
  const productStates = productStatesOf(graph, timeline.period, shards.length);
  const cap = options.maxProductStates ?? SHARD_MAX_PRODUCT_STATES;
  const packed = productStates <= cap && graph.isWalkable(start) && graph.isWalkable(goal) ? buildPackedLayer(graph, timeline) : null;
  const result = searchShardWitness(graph, timeline, packed, { start, goal, shards, maxProductStates: cap });
  if (!result.solvable || packed === null) {
    return {
      ...base,
      period: timeline.period,
      productStates,
      hazardsPresent: { pass: false, reason: result.solvable ? 'state-cap' : result.reason, ticks: null, waits: null },
      postContact: skipped,
      escapeSlack: null,
      pass: false,
      witness: null
    };
  }
  const witness = result.witness;
  const query = createShardSolvableQuery(graph, timeline, { goal, shards, maxInvulnerableTurns: invulnerableTurns }, packed);
  const invSpace = createHazardStateSpace(graph, timeline, invulnerableTurns);
  let failureCount = 0;
  let checkedStates = 0;
  let firstFailure: ShardRouteVerdict['postContact']['firstFailure'] = null;
  let progress = resolveShardProgressAfter(shards, witness.cells[0]!, 0);
  for (let index = 1; index < witness.ticks; index += 1) {
    progress = resolveShardProgressAfter(shards, witness.cells[index]!, progress);
    checkedStates += 1;
    const pushback = resolvePushbackCell(graph, witness.cells, index);
    const tickMod = (witness.startTick + index) % timeline.period;
    let reason: ShardPostContactFailureReason | null = null;
    const problem = invSpace.entryProblem(pushback, tickMod, invulnerableTurns);
    if (problem === 'blocked') reason = 'pushback-cell-blocked';
    else if (problem === 'contact') reason = 'pushback-cell-contact';
    else if (!query.isSolvable(pushback, tickMod, invulnerableTurns, progress)) reason = 'no-route-after-contact';
    if (reason !== null) {
      failureCount += 1;
      firstFailure ??= { witnessIndex: index, reason };
    }
  }
  const escapeSlack = measureShardEscapeSlack(packed.space, query, witness);
  const postContactPass = failureCount === 0;
  return {
    ...base,
    period: timeline.period,
    productStates,
    hazardsPresent: { pass: true, reason: null, ticks: witness.ticks, waits: witness.waits },
    postContact: { pass: postContactPass, skipped: false, checkedStates, failureCount, firstFailure },
    escapeSlack,
    pass: postContactPass && sentryFreeLegs,
    witness
  };
};

export interface ShardWitnessReplay {
  readonly valid: boolean;
  readonly failedAction: number | null;
  readonly reason: string | null;
}

/**
 * Replays a stored shard witness with the public timeline interface only
 * (independent of the BFS tables): legal moves, no contact, every shard collected
 * in order, the star reached only once unlocked.
 */
export const verifyShardWitness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  witness: ShardWitness
): ShardWitnessReplay => {
  const fail = (failedAction: number | null, reason: string): ShardWitnessReplay => ({ valid: false, failedAction, reason });
  if (witness.cells.length !== witness.actions.length + 1 || witness.cells[0] !== witness.start) return fail(null, 'malformed-witness');
  let cell = witness.start;
  let next = resolveShardProgressAfter(witness.shards, cell, 0);
  if (timeline.blockedAt(cell, witness.startTick % timeline.period)) return fail(null, 'start-blocked');
  if (timeline.enemyCellsAt(witness.startTick % timeline.period).includes(cell)) return fail(null, 'start-contact');
  for (let index = 0; index < witness.actions.length; index += 1) {
    const tick = witness.startTick + index;
    const action = witness.actions[index]!;
    const dest = action === 'wait' ? cell : graph.moveTarget(cell, action);
    if (dest < 0 || dest !== witness.cells[index + 1]) return fail(index, 'illegal-move');
    if (timeline.blockedAt(dest, (tick + 1) % timeline.period)) return fail(index, 'blocked');
    const before = timeline.enemyCellsAt(tick % timeline.period);
    const after = timeline.enemyCellsAt((tick + 1) % timeline.period);
    if (after.includes(dest)) return fail(index, 'contact-occupancy');
    if (dest !== cell && before.some((enemy, e) => enemy === dest && after[e] === cell)) return fail(index, 'contact-swap');
    cell = dest;
    next = resolveShardProgressAfter(witness.shards, cell, next);
    if (cell === witness.goal && next === witness.shards.length && index !== witness.actions.length - 1) {
      return fail(index, 'continues-after-unlocked-star');
    }
  }
  if (next !== witness.shards.length) return fail(null, 'shards-not-collected');
  if (cell !== witness.goal) return fail(null, 'does-not-reach-goal');
  return { valid: true, failedAction: null, reason: null };
};
