/**
 * DRAFT hazard solvability search (packet P3). Dormant and pure.
 *
 * Turn model (matches docs/architecture/MAZER-WORLD-TURN-CONTRACT.md phase order):
 * the world advances only on player actions. One action (a cardinal step or WAIT)
 * takes the world from tick `t` to tick `t + 1`:
 *   1. player phase: the player steps to `dest` (or stays);
 *   2. enemy phase: every enemy moves to its position at tick `t + 1`;
 *   3. collision phase: contact is evaluated.
 *
 * Legality of an action from `(cell, t)` to `dest` at `t + 1`:
 *   - OBSTACLE: `dest` must not be blocked at tick `t + 1` (this also forbids
 *     waiting in a gate cell that closes on the player). Obstacle blocking is never
 *     suspended by invulnerability.
 *   - CONTACT (suppressed while invulnerability remains): contact is
 *       (a) occupancy: `dest` is some enemy's cell at tick `t + 1` (after the
 *           enemy phase), or
 *       (b) head-on swap: the same enemy was on `dest` at tick `t` and is on
 *           `cell` at tick `t + 1`. Cells are compared, so a swap across a wrap
 *           edge counts exactly like an in-bounds swap.
 *     Passing a stationary enemy never happens (patrols always move or the
 *     route has a single cell, which is plain occupancy).
 *   - An invulnerability counter `k > 0` ignores contact for this action and
 *     decrements to `k - 1`.
 *
 * Search: BFS over `(cell, tick mod P, k)` with the action order
 * up, left, down, right, wait. The first-discovered parent is kept, so the
 * returned witness is the shortest one and ties break deterministically.
 *
 * Extension (P6, not built here): chasers/interceptors are functions of player
 * history, so their position joins the search state (player cell, enemy state,
 * tick mod P) and the enemy phase becomes a deterministic update inside
 * `forEachSuccessor`. The legality rules above stay unchanged.
 */

import {
  HAZARD_ACTION_ORDER,
  HAZARD_MOVE_ORDER,
  type HazardAction,
  type HazardCellId,
  type HazardGraph,
  type HazardTimeline
} from './graphContract';

export const HAZARD_WITNESS_CONTRACT = 'mazer-hazard-witness-draft-v0' as const;

export interface HazardWitness {
  readonly contract: typeof HAZARD_WITNESS_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly startTick: number;
  readonly invulnerableTurns: number;
  readonly period: number;
  /** Number of actions (steps + waits). */
  readonly ticks: number;
  readonly waits: number;
  /** Cell after each action; `cells[0] === start`, length `ticks + 1`. */
  readonly cells: readonly HazardCellId[];
  /** One entry per action, length `ticks`. */
  readonly actions: readonly HazardAction[];
}

export type HazardUnsolvableReason =
  | 'invalid-endpoint'
  | 'start-blocked'
  | 'start-contact'
  | 'no-route'
  | 'max-ticks-exceeded';

export type HazardWitnessResult =
  | { readonly solvable: true; readonly witness: HazardWitness; readonly exploredStates: number }
  | { readonly solvable: false; readonly reason: HazardUnsolvableReason; readonly exploredStates: number };

export interface FindWitnessOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** Absolute tick at which the search begins (default 0). */
  readonly startTick?: number;
  /** Contact-free turns remaining at the start (default 0). */
  readonly invulnerableTurns?: number;
  /** Optional cap on the number of actions in the witness. */
  readonly maxTicks?: number;
}

export interface HazardStateSpace {
  readonly stateCount: number;
  readonly period: number;
  readonly invulnerabilityLevels: number;
  stateIndex(cell: HazardCellId, tickMod: number, invulnerable: number): number;
  cellOf(state: number): HazardCellId;
  /** Legality of merely being in a state (obstacle + contact), used for start states. */
  entryProblem(cell: HazardCellId, tickMod: number, invulnerable: number): 'blocked' | 'contact' | null;
  /** Visits legal successors in action order. */
  forEachSuccessor(state: number, visit: (next: number, action: HazardAction) => void): void;
}

export const createHazardStateSpace = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  maxInvulnerableTurns: number
): HazardStateSpace => {
  const period = timeline.period;
  const cells = graph.cellCount;
  const levels = maxInvulnerableTurns + 1;
  const stateCount = period * cells * levels;

  const blocked = new Uint8Array(period * cells);
  const occupied = new Uint8Array(period * cells);
  const positions: Array<readonly HazardCellId[]> = [];
  for (let tick = 0; tick < period; tick += 1) {
    const here = timeline.enemyCellsAt(tick);
    positions.push(here);
    for (const cell of here) {
      occupied[tick * cells + cell] = 1;
    }
    for (let cell = 0; cell < cells; cell += 1) {
      if (timeline.blockedAt(cell, tick)) {
        blocked[tick * cells + cell] = 1;
      }
    }
  }

  const stateIndex = (cell: HazardCellId, tickMod: number, invulnerable: number): number => (
    ((tickMod * cells) + cell) * levels + invulnerable
  );

  const legal = (
    cell: HazardCellId,
    dest: HazardCellId,
    tickMod: number,
    nextTickMod: number,
    invulnerable: number
  ): boolean => {
    if (blocked[nextTickMod * cells + dest] === 1) {
      return false;
    }
    if (invulnerable > 0) {
      return true;
    }
    if (occupied[nextTickMod * cells + dest] === 1) {
      return false;
    }
    if (dest !== cell) {
      const before = positions[tickMod]!;
      const after = positions[nextTickMod]!;
      for (let e = 0; e < before.length; e += 1) {
        if (before[e] === dest && after[e] === cell) {
          return false;
        }
      }
    }
    return true;
  };

  // Reused per call; visit callbacks must not re-enter forEachSuccessor.
  const scratch = new Int32Array(4);

  return {
    stateCount,
    period,
    invulnerabilityLevels: levels,
    stateIndex,
    cellOf(state) {
      return Math.floor(state / levels) % cells;
    },
    entryProblem(cell, tickMod, invulnerable) {
      if (blocked[tickMod * cells + cell] === 1) {
        return 'blocked';
      }
      if (invulnerable === 0 && occupied[tickMod * cells + cell] === 1) {
        return 'contact';
      }
      return null;
    },
    forEachSuccessor(state, visit) {
      const invulnerable = state % levels;
      const rest = Math.floor(state / levels);
      const cell = rest % cells;
      const tickMod = Math.floor(rest / cells);
      const nextTickMod = (tickMod + 1) % period;
      const nextInvulnerable = invulnerable > 0 ? invulnerable - 1 : 0;
      let emittedCount = 0;
      for (let d = 0; d < 4; d += 1) {
        const dest = graph.moveTarget(cell, HAZARD_MOVE_ORDER[d]!);
        if (dest < 0) {
          continue;
        }
        let duplicate = false;
        for (let i = 0; i < emittedCount; i += 1) {
          if (scratch[i] === dest) {
            duplicate = true;
          }
        }
        if (duplicate) {
          continue;
        }
        scratch[emittedCount++] = dest;
        if (legal(cell, dest, tickMod, nextTickMod, invulnerable)) {
          visit(stateIndex(dest, nextTickMod, nextInvulnerable), HAZARD_ACTION_ORDER[d]!);
        }
      }
      if (legal(cell, cell, tickMod, nextTickMod, invulnerable)) {
        visit(stateIndex(cell, nextTickMod, nextInvulnerable), 'wait');
      }
    }
  };
};

const normalizeTick = (tick: number, period: number): number => ((tick % period) + period) % period;

export const findWitnessRoute = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: FindWitnessOptions
): HazardWitnessResult => {
  const { start, goal } = options;
  const startTick = options.startTick ?? 0;
  const invulnerableTurns = options.invulnerableTurns ?? 0;
  if (!Number.isInteger(startTick) || startTick < 0) {
    throw new RangeError('startTick must be a non-negative integer');
  }
  if (!Number.isInteger(invulnerableTurns) || invulnerableTurns < 0) {
    throw new RangeError('invulnerableTurns must be a non-negative integer');
  }
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
    return { solvable: false, reason: 'invalid-endpoint', exploredStates: 0 };
  }

  const space = createHazardStateSpace(graph, timeline, invulnerableTurns);
  const startMod = normalizeTick(startTick, space.period);
  const problem = space.entryProblem(start, startMod, invulnerableTurns);
  if (problem === 'blocked') {
    return { solvable: false, reason: 'start-blocked', exploredStates: 0 };
  }
  if (problem === 'contact') {
    return { solvable: false, reason: 'start-contact', exploredStates: 0 };
  }

  const startState = space.stateIndex(start, startMod, invulnerableTurns);
  const previous = new Int32Array(space.stateCount).fill(-2);
  const previousAction = new Uint8Array(space.stateCount);
  const depth = new Int32Array(space.stateCount);
  const queue = new Int32Array(space.stateCount);
  let head = 0;
  let tail = 0;
  previous[startState] = -1;
  queue[tail++] = startState;

  const maxTicks = options.maxTicks ?? Number.POSITIVE_INFINITY;
  let truncated = false;
  let goalState = start === goal ? startState : -1;

  while (goalState < 0 && head < tail) {
    const current = queue[head++]!;
    if (depth[current]! >= maxTicks) {
      truncated = true;
      continue;
    }
    space.forEachSuccessor(current, (next, action) => {
      if (goalState >= 0 || previous[next] !== -2) {
        return;
      }
      previous[next] = current;
      previousAction[next] = HAZARD_ACTION_ORDER.indexOf(action);
      depth[next] = depth[current]! + 1;
      if (space.cellOf(next) === goal) {
        goalState = next;
        return;
      }
      queue[tail++] = next;
    });
  }

  if (goalState < 0) {
    return { solvable: false, reason: truncated ? 'max-ticks-exceeded' : 'no-route', exploredStates: tail };
  }

  const cellsReversed: HazardCellId[] = [];
  const actionsReversed: HazardAction[] = [];
  for (let cursor = goalState; cursor !== -1; cursor = previous[cursor]!) {
    cellsReversed.push(space.cellOf(cursor));
    if (previous[cursor] !== -1) {
      actionsReversed.push(HAZARD_ACTION_ORDER[previousAction[cursor]!]!);
    }
  }
  const cells = cellsReversed.reverse();
  const actions = actionsReversed.reverse();
  return {
    solvable: true,
    exploredStates: tail,
    witness: {
      contract: HAZARD_WITNESS_CONTRACT,
      width: graph.width,
      height: graph.height,
      start,
      goal,
      startTick,
      invulnerableTurns,
      period: timeline.period,
      ticks: actions.length,
      waits: actions.filter((action) => action === 'wait').length,
      cells,
      actions
    }
  };
};

/**
 * Set of states from which the goal is reachable (reverse reachability over the
 * same transition relation as `findWitnessRoute`). Goal-cell states are solved.
 * One pass answers any number of "is this post-contact state still solvable" queries.
 */
export const computeSolvableStates = (space: HazardStateSpace, goal: HazardCellId): Uint8Array => {
  const count = space.stateCount;
  const inDegree = new Int32Array(count + 1);
  for (let state = 0; state < count; state += 1) {
    if (space.cellOf(state) === goal) {
      continue;
    }
    space.forEachSuccessor(state, (next) => {
      inDegree[next + 1] = inDegree[next + 1]! + 1;
    });
  }
  for (let i = 0; i < count; i += 1) {
    inDegree[i + 1] = inDegree[i + 1]! + inDegree[i]!;
  }
  const offsets = inDegree;
  const fill = new Int32Array(count);
  const predecessors = new Int32Array(offsets[count]!);
  for (let state = 0; state < count; state += 1) {
    if (space.cellOf(state) === goal) {
      continue;
    }
    space.forEachSuccessor(state, (next) => {
      predecessors[offsets[next]! + fill[next]!] = state;
      fill[next] = fill[next]! + 1;
    });
  }

  const solvable = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let state = 0; state < count; state += 1) {
    if (space.cellOf(state) === goal) {
      solvable[state] = 1;
      queue[tail++] = state;
    }
  }
  while (head < tail) {
    const state = queue[head++]!;
    for (let i = offsets[state]!; i < offsets[state + 1]!; i += 1) {
      const predecessor = predecessors[i]!;
      if (solvable[predecessor] === 0) {
        solvable[predecessor] = 1;
        queue[tail++] = predecessor;
      }
    }
  }
  return solvable;
};

export interface WitnessReplayResult {
  readonly valid: boolean;
  /** Index of the first illegal action, or null when valid. */
  readonly failedAction: number | null;
  readonly reason: string | null;
}

/**
 * Replays a persisted witness against a graph and timeline using the public
 * `HazardTimeline` interface only (independent of the BFS tables), so a stored
 * witness can be re-verified after any generator or timeline change.
 */
export const verifyWitness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  witness: HazardWitness
): WitnessReplayResult => {
  const fail = (failedAction: number | null, reason: string): WitnessReplayResult => (
    { valid: false, failedAction, reason }
  );
  if (witness.width !== graph.width || witness.height !== graph.height) {
    return fail(null, 'dimension-mismatch');
  }
  if (witness.cells.length !== witness.actions.length + 1 || witness.cells[0] !== witness.start) {
    return fail(null, 'malformed-witness');
  }
  if (!graph.isWalkable(witness.start) || !graph.isWalkable(witness.goal)) {
    return fail(null, 'invalid-endpoint');
  }
  let invulnerable = witness.invulnerableTurns;
  let cell = witness.start;
  if (timeline.blockedAt(cell, witness.startTick)) {
    return fail(null, 'start-blocked');
  }
  if (invulnerable === 0 && timeline.enemyCellsAt(witness.startTick).includes(cell)) {
    return fail(null, 'start-contact');
  }
  for (let index = 0; index < witness.actions.length; index += 1) {
    const tick = witness.startTick + index;
    const action = witness.actions[index]!;
    const dest = action === 'wait' ? cell : graph.moveTarget(cell, action);
    if (dest < 0 || dest !== witness.cells[index + 1]) {
      return fail(index, 'illegal-move');
    }
    if (timeline.blockedAt(dest, tick + 1)) {
      return fail(index, 'blocked');
    }
    if (invulnerable === 0) {
      if (timeline.enemyCellsAt(tick + 1).includes(dest)) {
        return fail(index, 'contact-occupancy');
      }
      const before = timeline.enemyCellsAt(tick);
      const after = timeline.enemyCellsAt(tick + 1);
      if (dest !== cell && before.some((enemyCell, e) => enemyCell === dest && after[e] === cell)) {
        return fail(index, 'contact-swap');
      }
    } else {
      invulnerable -= 1;
    }
    cell = dest;
  }
  if (cell !== witness.goal) {
    return fail(null, 'does-not-reach-goal');
  }
  if (witness.ticks !== witness.actions.length) {
    return fail(null, 'malformed-witness');
  }
  return { valid: true, failedAction: null, reason: null };
};
