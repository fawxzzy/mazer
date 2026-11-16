/**
 * Trail rewind with the runtime rewind-safety check (slice H4, amendment A2).
 * Pure: no scene, no randomness, no clock. Not called by any scene yet.
 *
 * On contact the player snaps back to the LAST JUNCTION on their own trail
 * (strictly behind the contact cell), with the world clock held, and then has
 * `PLAY_INVULNERABLE_TICKS` (4) contact-free ticks. Runtime safety: the rewind
 * state `(cell, tick, 4)` must still reach the goal under the graph-contract
 * transition rules. If it cannot, the player goes to the PREVIOUS trail
 * junction, and finally to the validated START.
 *
 * Never strands (a theorem, not a hope): the start fallback first tries the
 * start with 4 ticks. If even that has no route at this tick, the plan extends
 * the invulnerability to the shortest wait at the start after which the k = 0
 * start state is solvable (`'start-rescue'`, at most period - 1 ticks). Waiting
 * at the start is legal for that long (checked at construction), contact is
 * ignored throughout, and more invulnerability is never worse, so the rescued
 * state reaches the goal. `canAlwaysRescue` is false only for a level whose start
 * is gated shut or that is unsolvable; the overlay never ships either.
 *
 * Why not a per-contact A* search: an A* that fails (no witness) explores the
 * whole `(cell, tick mod P, k)` space, up to P x cells x 5 states, far over the
 * 2 ms budget, and it allocates per call. Instead the planner solves the k = 0
 * layer ONCE per level (reverse BFS from the goal over `(cell, tick mod P)`,
 * exact shortest distances) and a check at k <= 4 is a bounded exact recursion
 * on top of it (at most 5 + 25 + 125 + 625 states, no allocation). Answers equal
 * `findWitnessRoute` exactly (solvability and witness length; tested).
 *
 * Hot path: `distanceFrom` and `planRewind` allocate nothing. `planRewind`
 * returns one plan object owned by the planner and overwritten on the next call.
 */

import {
  HAZARD_MOVE_ORDER,
  type HazardCellId,
  type HazardGraph,
  type HazardTimeline
} from './graphContract';
import { PLAY_INVULNERABLE_TICKS } from './contact';

export const HAZARD_REWIND_CONTRACT = 'mazer-hazard-rewind-v1' as const;

/** Trail junctions tried before the start (the last one, then the previous one). */
export const REWIND_JUNCTION_TRIES = 2;

/**
 * - `junction`: the last junction on the trail.
 * - `previous-junction`: the last junction failed the check; the one before it passed.
 * - `start`: both junction tries failed (or none exist); the start passed with N ticks.
 * - `start-rescue`: the start at N ticks had no route at this tick; invulnerability extended.
 * - `stranded`: impossible on a level with `canAlwaysRescue` (start gated shut or unsolvable level).
 */
export type HazardRewindOutcome = 'junction' | 'previous-junction' | 'start' | 'start-rescue' | 'stranded';

export interface HazardRewindPlan {
  outcome: HazardRewindOutcome;
  /** Cell the player resumes on. */
  cell: HazardCellId;
  /**
   * Trail index of that cell: keep `trail[0..trailIndex]`, retract the rest cell by
   * cell (newest first). -1 when the start is not `trail[0]` (reset the trail to it).
   */
  trailIndex: number;
  /** Cells retracted from the trail (`length - 1 - trailIndex`, or `length` when trailIndex is -1). */
  retractedCells: number;
  /** World tick at which the player resumes (the clock is held during the retract). */
  tick: number;
  /** Invulnerable ticks to grant (N, or more for `start-rescue`). */
  invulnerableTicks: number;
  /**
   * Ticks of the shortest route from the resumed state to the goal. For
   * `start-rescue` an upper bound (wait, then the k = 0 route). -1 when stranded.
   */
  routeTicks: number;
  /** Junction cells that were checked (0..REWIND_JUNCTION_TRIES). */
  junctionsChecked: number;
}

export interface CreateRewindPlannerOptions {
  /** Validated level start (the final fallback). */
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** Invulnerable ticks after a rewind (default PLAY_INVULNERABLE_TICKS = 4). */
  readonly invulnerableTicks?: number;
}

export interface HazardRewindPlanner {
  readonly contract: typeof HAZARD_REWIND_CONTRACT;
  readonly period: number;
  readonly invulnerableTicks: number;
  /** True when the start fallback can always be rescued (see module doc). */
  readonly canAlwaysRescue: boolean;
  /**
   * Ticks of the shortest route to the goal from `cell` at world `tick` with
   * `invulnerable` contact-free ticks, or -1 when there is none (same answer and
   * same entry rules as `findWitnessRoute`). `invulnerable` must be at most the
   * planner's `invulnerableTicks`.
   */
  distanceFrom(cell: HazardCellId, tick: number, invulnerable: number): number;
  /**
   * Plans the rewind after a contact. `trail[0..length)` is the player's own
   * trail, oldest first; `trail[length - 1]` is the contact cell (the cell after
   * the movement phase). `tick` is the arrival tick of the contact (`t + 1`),
   * which is also the resume tick.
   */
  planRewind(trail: ArrayLike<HazardCellId>, length: number, tick: number): Readonly<HazardRewindPlan>;
}

export const createRewindPlanner = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: CreateRewindPlannerOptions
): HazardRewindPlanner => {
  const { start, goal } = options;
  const maxK = options.invulnerableTicks ?? PLAY_INVULNERABLE_TICKS;
  if (!Number.isInteger(maxK) || maxK < 0 || maxK > 6) {
    throw new RangeError(`invulnerableTicks must be an integer in 0..6, received ${String(maxK)}`);
  }
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
    throw new RangeError('rewind planner needs a walkable start and goal');
  }

  const period = timeline.period;
  const cells = graph.cellCount;
  const layer = period * cells;

  // Static tables, read once from the public interfaces.
  const blocked = new Uint8Array(layer);
  const occupied = new Uint8Array(layer);
  const enemyCount = timeline.enemyCount;
  const enemyAt = new Int32Array(Math.max(1, period * enemyCount));
  for (let t = 0; t < period; t += 1) {
    const here = timeline.enemyCellsAt(t);
    for (let e = 0; e < enemyCount; e += 1) {
      const cell = here[e]!;
      enemyAt[t * enemyCount + e] = cell;
      occupied[t * cells + cell] = 1;
    }
    for (let cell = 0; cell < cells; cell += 1) {
      if (timeline.blockedAt(cell, t)) {
        blocked[t * cells + cell] = 1;
      }
    }
  }
  const walkable = new Uint8Array(cells);
  const junction = new Uint8Array(cells);
  const moveTable = new Int32Array(cells * 4).fill(-1);
  for (let cell = 0; cell < cells; cell += 1) {
    if (!graph.isWalkable(cell)) {
      continue;
    }
    walkable[cell] = 1;
    junction[cell] = graph.isJunction(cell) ? 1 : 0;
    for (let d = 0; d < 4; d += 1) {
      moveTable[cell * 4 + d] = graph.moveTarget(cell, HAZARD_MOVE_ORDER[d]!);
    }
  }
  // Reverse adjacency (distinct cells with a step into `dest`), CSR.
  const reverseOffsets = new Int32Array(cells + 1);
  const isDuplicateMove = (cell: HazardCellId, d: number): boolean => {
    const dest = moveTable[cell * 4 + d]!;
    for (let earlier = 0; earlier < d; earlier += 1) {
      if (moveTable[cell * 4 + earlier] === dest) {
        return true;
      }
    }
    return false;
  };
  for (let cell = 0; cell < cells; cell += 1) {
    for (let d = 0; d < 4; d += 1) {
      const dest = moveTable[cell * 4 + d]!;
      if (dest >= 0 && !isDuplicateMove(cell, d)) {
        reverseOffsets[dest + 1] = reverseOffsets[dest + 1]! + 1;
      }
    }
  }
  for (let cell = 0; cell < cells; cell += 1) {
    reverseOffsets[cell + 1] = reverseOffsets[cell + 1]! + reverseOffsets[cell]!;
  }
  const reverseFill = new Int32Array(cells);
  const reverseList = new Int32Array(reverseOffsets[cells]!);
  for (let cell = 0; cell < cells; cell += 1) {
    for (let d = 0; d < 4; d += 1) {
      const dest = moveTable[cell * 4 + d]!;
      if (dest >= 0 && !isDuplicateMove(cell, d)) {
        reverseList[reverseOffsets[dest]! + reverseFill[dest]!] = cell;
        reverseFill[dest] = reverseFill[dest]! + 1;
      }
    }
  }

  /** Legality of `cell -> dest` from tick `t0` to `t1` (graph contract, solvability.ts `legal`). */
  const legal = (cell: HazardCellId, dest: HazardCellId, t0: number, t1: number, invulnerable: number): boolean => {
    if (blocked[t1 * cells + dest] === 1) {
      return false;
    }
    if (invulnerable > 0) {
      return true;
    }
    if (occupied[t1 * cells + dest] === 1) {
      return false;
    }
    if (dest !== cell) {
      const b = t0 * enemyCount;
      const a = t1 * enemyCount;
      for (let e = 0; e < enemyCount; e += 1) {
        if (enemyAt[b + e] === dest && enemyAt[a + e] === cell) {
          return false;
        }
      }
    }
    return true;
  };

  // k = 0 layer: exact shortest distance to the goal for every (cell, tick mod P),
  // by a multi-source reverse BFS from every goal state.
  const distance0 = new Int32Array(layer).fill(-1);
  {
    const queue = new Int32Array(layer);
    let head = 0;
    let tail = 0;
    for (let t = 0; t < period; t += 1) {
      distance0[t * cells + goal] = 0;
      queue[tail++] = t * cells + goal;
    }
    while (head < tail) {
      const z = queue[head++]!;
      const t1 = Math.floor(z / cells);
      const dest = z - t1 * cells;
      const t0 = t1 === 0 ? period - 1 : t1 - 1;
      const nextDistance = distance0[z]! + 1;
      // WAIT at `dest`, then every distinct step into `dest`.
      for (let i = reverseOffsets[dest]! - 1; i < reverseOffsets[dest + 1]!; i += 1) {
        const cell = i < reverseOffsets[dest]! ? dest : reverseList[i]!;
        if (cell === goal) {
          continue;
        }
        const from = t0 * cells + cell;
        if (distance0[from] !== -1 || !legal(cell, dest, t0, t1, 0)) {
          continue;
        }
        distance0[from] = nextDistance;
        queue[tail++] = from;
      }
    }
  }

  // Start rescue: for each tick mod P, the fewest WAITs at the start (start
  // unblocked at every tick on the way, including the first) that reach a
  // k = 0 solvable start state. -1 when impossible.
  const rescueWait = new Int32Array(period).fill(-1);
  {
    const startOpen = (t: number): boolean => blocked[t * cells + start] === 0;
    const solvedAt = (t: number): boolean => startOpen(t) && distance0[t * cells + start]! >= 0;
    // Two passes over a doubled circle resolve every wrap-around.
    let next = -1;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let t = period - 1; t >= 0; t -= 1) {
        if (!startOpen(t)) {
          next = -1;
        } else if (solvedAt(t)) {
          next = 0;
        } else if (next >= 0) {
          next += 1;
        }
        if (pass === 1) {
          rescueWait[t] = next;
        }
      }
    }
  }
  let canAlwaysRescue = true;
  for (let t = 0; t < period; t += 1) {
    if (rescueWait[t]! < 0) {
      canAlwaysRescue = false;
    }
  }

  const reduce = (tick: number): number => {
    if (!Number.isInteger(tick)) {
      throw new RangeError(`tick must be an integer, received ${String(tick)}`);
    }
    return ((tick % period) + period) % period;
  };

  /** Exact shortest distance from a legal state (cell != goal), bounded recursion over k. */
  const search = (cell: HazardCellId, t0: number, invulnerable: number): number => {
    if (invulnerable === 0) {
      return distance0[t0 * cells + cell]!;
    }
    const t1 = t0 + 1 === period ? 0 : t0 + 1;
    const nextK = invulnerable - 1;
    let best = -1;
    for (let d = 0; d < 5; d += 1) {
      let dest: number;
      if (d < 4) {
        dest = moveTable[cell * 4 + d]!;
        if (dest < 0 || isDuplicateMove(cell, d)) {
          continue;
        }
      } else {
        dest = cell;
      }
      if (!legal(cell, dest, t0, t1, invulnerable)) {
        continue;
      }
      const rest = dest === goal ? 0 : search(dest, t1, nextK);
      if (rest >= 0 && (best < 0 || rest + 1 < best)) {
        best = rest + 1;
        if (best === 1) {
          break;
        }
      }
    }
    return best;
  };

  const distanceFrom = (cell: HazardCellId, tick: number, invulnerable: number): number => {
    if (!Number.isInteger(invulnerable) || invulnerable < 0 || invulnerable > maxK) {
      throw new RangeError(`invulnerable must be an integer in 0..${maxK}, received ${String(invulnerable)}`);
    }
    const t = reduce(tick);
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells || walkable[cell] === 0) {
      return -1;
    }
    if (blocked[t * cells + cell] === 1) {
      return -1;
    }
    if (invulnerable === 0 && occupied[t * cells + cell] === 1) {
      return -1;
    }
    if (cell === goal) {
      return 0;
    }
    return search(cell, t, invulnerable);
  };

  const plan: HazardRewindPlan = {
    outcome: 'stranded',
    cell: start,
    trailIndex: -1,
    retractedCells: 0,
    tick: 0,
    invulnerableTicks: maxK,
    routeTicks: -1,
    junctionsChecked: 0
  };

  const settle = (
    outcome: HazardRewindOutcome,
    cell: HazardCellId,
    trailIndex: number,
    length: number,
    invulnerableTicks: number,
    routeTicks: number,
    junctionsChecked: number
  ): Readonly<HazardRewindPlan> => {
    plan.outcome = outcome;
    plan.cell = cell;
    plan.trailIndex = trailIndex;
    plan.retractedCells = trailIndex < 0 ? length : length - 1 - trailIndex;
    plan.invulnerableTicks = invulnerableTicks;
    plan.routeTicks = routeTicks;
    plan.junctionsChecked = junctionsChecked;
    return plan;
  };

  const planRewind = (trail: ArrayLike<HazardCellId>, length: number, tick: number): Readonly<HazardRewindPlan> => {
    if (!Number.isInteger(length) || length < 0 || length > trail.length) {
      throw new RangeError(`trail length ${String(length)} is outside 0..${trail.length}`);
    }
    const t = reduce(tick);
    plan.tick = tick;
    const contactCell = length > 0 ? trail[length - 1]! : -1;
    let checked = 0;
    let firstChecked = -1;
    for (let i = length - 2; i >= 0 && checked < REWIND_JUNCTION_TRIES; i -= 1) {
      const cell = trail[i]!;
      if (cell < 0 || cell >= cells || junction[cell] === 0 || cell === contactCell || cell === firstChecked) {
        continue;
      }
      checked += 1;
      firstChecked = firstChecked < 0 ? cell : firstChecked;
      const routeTicks = distanceFrom(cell, t, maxK);
      if (routeTicks >= 0) {
        return settle(checked === 1 ? 'junction' : 'previous-junction', cell, i, length, maxK, routeTicks, checked);
      }
    }
    const startIndex = length > 0 && trail[0] === start ? 0 : -1;
    const startTicks = distanceFrom(start, t, maxK);
    if (startTicks >= 0) {
      return settle('start', start, startIndex, length, maxK, startTicks, checked);
    }
    const wait = rescueWait[t]!;
    if (wait >= 0) {
      const rescueTicks = Math.max(maxK, wait);
      const routeTicks = wait + distance0[((t + wait) % period) * cells + start]!;
      return settle('start-rescue', start, startIndex, length, rescueTicks, routeTicks, checked);
    }
    return settle('stranded', start, startIndex, length, maxK, -1, checked);
  };

  return {
    contract: HAZARD_REWIND_CONTRACT,
    period,
    invulnerableTicks: maxK,
    canAlwaysRescue,
    distanceFrom,
    planRewind
  };
};
