/**
 * DRAFT fallible practice bots (packet P7). Dormant and pure: not wired into any
 * scene and not exported through the mazer-core barrel or `eval/index.ts`.
 * See docs/architecture/MAZER-DIFFICULTY-MONITOR-BOTS.md.
 *
 * The bots are difficulty MONITORS, not players. They run on a hazard graph and
 * timeline (`../hazards`) under the P3 turn model and contact rule:
 *   - legality and contact are read from `createHazardStateSpace` (the single P3
 *     transition definition); this file never re-implements the contact rule;
 *   - a contact does not end the run: the bot is pushed back to
 *     `resolvePushbackCell` (nearest junction behind on its own path) and is
 *     invulnerable for N turns (default 2).
 *
 * Determinism: every random draw comes from a small seeded PRNG (mulberry32)
 * created per run. There is no clock and no ambient randomness.
 */

import {
  HAZARD_ACTION_ORDER,
  type HazardAction,
  type HazardCellId,
  type HazardGraph,
  type HazardMoveDirection,
  type HazardTimeline
} from '../hazards/graphContract';
import { findWitnessRoute, createHazardStateSpace, type HazardStateSpace } from '../hazards/solvability';
import { DEFAULT_INVULNERABLE_TURNS, resolvePushbackCell } from '../hazards/validation';

export const BOT_CONTRACT = 'mazer-fallible-bots-draft-v0' as const;

/** Enemy distances are reported up to this many graph steps (bounded cost). */
export const ENEMY_DISTANCE_CAP = 32;

export interface OracleBotSpec {
  readonly kind: 'oracle';
  readonly label?: string;
}

export interface PlannerLimitedBotSpec {
  readonly kind: 'planner-limited';
  readonly label?: string;
  /**
   * Lookahead depth in turns (actions). The planner scores every state within the
   * horizon by `depth + h(cell)` where `h` starts as straight-line distance to the
   * goal and is raised online after each turn (LRTA*-style), so the bot is
   * complete on a static maze but pays steps for every dead end it explores.
   */
  readonly horizon: number;
}

export interface PlannerNoisyBotSpec {
  readonly kind: 'planner-noisy';
  readonly label?: string;
  readonly horizon: number;
  /** Per-turn probability of replacing the planned action with a random obstacle-legal one. */
  readonly mistakeProbability: number;
  /** The planner sees enemy positions from this many turns ago. */
  readonly reactionDelay: number;
}

export interface MyopicBotSpec {
  readonly kind: 'myopic';
  readonly label?: string;
}

export type BotSpec = OracleBotSpec | PlannerLimitedBotSpec | PlannerNoisyBotSpec | MyopicBotSpec;
export type BotKind = BotSpec['kind'];

export const BOT_TIER: Readonly<Record<BotKind, number>> = {
  oracle: 0,
  'planner-limited': 1,
  'planner-noisy': 2,
  myopic: 3
};

export const botTier = (spec: BotSpec): number => BOT_TIER[spec.kind];

/** True when the run never consumes a random draw, so the seed cannot change the result. */
export const isDeterministicBot = (spec: BotSpec): boolean => (
  spec.kind === 'oracle'
  || spec.kind === 'planner-limited'
  || (spec.kind === 'planner-noisy' && spec.mistakeProbability === 0)
);

export const botLabel = (spec: BotSpec): string => {
  if (spec.label !== undefined) {
    return spec.label;
  }
  switch (spec.kind) {
    case 'oracle':
      return 'oracle';
    case 'planner-limited':
      return `limited(h=${spec.horizon})`;
    case 'planner-noisy':
      return `noisy(h=${spec.horizon},p=${spec.mistakeProbability},d=${spec.reactionDelay})`;
    case 'myopic':
      return 'myopic';
  }
};

/** Default monitor ladder, tier order. Parameters are draft starting points, not tuned. */
export const DEFAULT_BOT_LADDER: readonly BotSpec[] = [
  { kind: 'oracle' },
  { kind: 'planner-limited', horizon: 6 },
  { kind: 'planner-noisy', horizon: 4, mistakeProbability: 0.08, reactionDelay: 1 },
  { kind: 'myopic' }
];

export interface RunBotOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly maxTurns: number;
  readonly seed: number;
  /** Absolute tick at which the run begins (default 0). */
  readonly startTick?: number;
  /** Contact-free turns granted after a pushback (default P3's 2). */
  readonly invulnerableTurns?: number;
}

export interface BotContactEvent {
  /** 1-based turn on which the contact happened (the world moved from tick `startTick + turn - 1`). */
  readonly turn: number;
  /** The cell the bot tried to enter. */
  readonly contactCell: HazardCellId;
  /** Where the pushback placed it (`path[turn]`). */
  readonly pushbackCell: HazardCellId;
}

export interface BotRunResult {
  readonly reached: boolean;
  /** Actions taken (steps, waits, and contact turns). */
  readonly turns: number;
  readonly waits: number;
  /** Turns on which a random mistake replaced the planned action. */
  readonly mistakes: number;
  /** Contact events (each costs a pushback, not the run). */
  readonly contacts: number;
  readonly contactEvents: readonly BotContactEvent[];
  /** Minimum graph distance to any enemy over the run, capped; null when there are no enemies. */
  readonly minEnemyDistance: number | null;
  /** Player cell after each turn; `path[0] === start`, length `turns + 1`. */
  readonly path: readonly HazardCellId[];
}

/** mulberry32: small, fast, seedable. Returns floats in [0, 1). */
export const createSeededRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const ACTION_COUNT = HAZARD_ACTION_ORDER.length;
const WAIT_INDEX = HAZARD_ACTION_ORDER.indexOf('wait');
const actionIndexOf = (action: HazardAction): number => HAZARD_ACTION_ORDER.indexOf(action);
const requireNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, received ${String(value)}`);
  }
};

/** The planner perceives enemies `delay` turns late; obstacles are telegraphed and exact. */
const createDelayedTimeline = (timeline: HazardTimeline, delay: number): HazardTimeline => ({
  period: timeline.period,
  enemyCount: timeline.enemyCount,
  blockedAt: (cell, tick) => timeline.blockedAt(cell, tick),
  enemyCellsAt: (tick) => timeline.enemyCellsAt(tick - delay)
});

interface EnemyDistanceProbe {
  distanceFrom(cell: HazardCellId, enemyCells: readonly HazardCellId[]): number;
}

const createEnemyDistanceProbe = (graph: HazardGraph): EnemyDistanceProbe => {
  const stamp = new Int32Array(graph.cellCount);
  const marked = new Uint8Array(graph.cellCount);
  const distance = new Int32Array(graph.cellCount);
  const queue = new Int32Array(graph.cellCount);
  let epoch = 0;
  return {
    distanceFrom(cell, enemyCells) {
      for (const enemy of enemyCells) {
        marked[enemy] = 1;
      }
      epoch += 1;
      let head = 0;
      let tail = 0;
      stamp[cell] = epoch;
      distance[cell] = 0;
      queue[tail++] = cell;
      let result = ENEMY_DISTANCE_CAP;
      while (head < tail) {
        const current = queue[head++]!;
        if (marked[current] === 1) {
          result = distance[current]!;
          break;
        }
        if (distance[current]! >= ENEMY_DISTANCE_CAP) {
          continue;
        }
        for (const next of graph.neighbors(current)) {
          if (stamp[next] !== epoch) {
            stamp[next] = epoch;
            distance[next] = distance[current]! + 1;
            queue[tail++] = next;
          }
        }
      }
      for (const enemy of enemyCells) {
        marked[enemy] = 0;
      }
      return Math.min(result, ENEMY_DISTANCE_CAP);
    }
  };
};

const createGoalDistanceTable = (graph: HazardGraph, goal: HazardCellId): Float64Array => {
  const table = new Float64Array(graph.cellCount);
  const gx = graph.cellX(goal);
  const gy = graph.cellY(goal);
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    table[cell] = Math.hypot(graph.cellX(cell) - gx, graph.cellY(cell) - gy);
  }
  return table;
};

const mask = (index: number): number => 1 << index;

/** Bitmask of actions whose successor exists from `(cell, tickMod, k)` in `space`. */
const collectActionMask = (
  space: HazardStateSpace,
  cell: HazardCellId,
  tickMod: number,
  invulnerable: number
): number => {
  let result = 0;
  space.forEachSuccessor(space.stateIndex(cell, tickMod, invulnerable), (_next, action) => {
    result |= mask(actionIndexOf(action));
  });
  return result;
};

const maskActions = (bits: number): number[] => {
  const actions: number[] = [];
  for (let index = 0; index < ACTION_COUNT; index += 1) {
    if ((bits & mask(index)) !== 0) {
      actions.push(index);
    }
  }
  return actions;
};

const emptyResult = (start: HazardCellId): BotRunResult => ({
  reached: false,
  turns: 0,
  waits: 0,
  mistakes: 0,
  contacts: 0,
  contactEvents: [],
  minEnemyDistance: null,
  path: [start]
});

const runOracle = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: RunBotOptions,
  startTick: number
): BotRunResult => {
  const found = findWitnessRoute(graph, timeline, {
    start: options.start,
    goal: options.goal,
    startTick,
    maxTicks: options.maxTurns
  });
  if (!found.solvable) {
    return emptyResult(options.start);
  }
  const { witness } = found;
  let minEnemyDistance: number | null = null;
  if (timeline.enemyCount > 0) {
    const probe = createEnemyDistanceProbe(graph);
    minEnemyDistance = ENEMY_DISTANCE_CAP;
    witness.cells.forEach((cell, index) => {
      minEnemyDistance = Math.min(minEnemyDistance!, probe.distanceFrom(cell, timeline.enemyCellsAt(startTick + index)));
    });
  }
  return {
    reached: true,
    turns: witness.ticks,
    waits: witness.waits,
    mistakes: 0,
    contacts: 0,
    contactEvents: [],
    minEnemyDistance,
    path: witness.cells.slice()
  };
};

export const runBot = (
  spec: BotSpec,
  graph: HazardGraph,
  timeline: HazardTimeline,
  options: RunBotOptions
): BotRunResult => {
  const { start, goal, maxTurns, seed } = options;
  const startTick = options.startTick ?? 0;
  const pushbackTurns = options.invulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  requireNonNegativeInteger(maxTurns, 'maxTurns');
  requireNonNegativeInteger(startTick, 'startTick');
  requireNonNegativeInteger(pushbackTurns, 'invulnerableTurns');
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
    return emptyResult(start);
  }
  if (spec.kind === 'oracle') {
    return runOracle(graph, timeline, options, startTick);
  }
  if (start === goal) {
    return { ...emptyResult(start), reached: true };
  }

  const rng = createSeededRng(seed);
  const horizon = spec.kind === 'planner-limited' || spec.kind === 'planner-noisy' ? spec.horizon : 0;
  const mistakeProbability = spec.kind === 'planner-noisy' ? spec.mistakeProbability : 0;
  const reactionDelay = spec.kind === 'planner-noisy' ? spec.reactionDelay : 0;
  requireNonNegativeInteger(horizon, 'horizon');
  requireNonNegativeInteger(reactionDelay, 'reactionDelay');
  if (!(mistakeProbability >= 0 && mistakeProbability <= 1)) {
    throw new RangeError('mistakeProbability must be within [0, 1]');
  }

  const period = timeline.period;
  const space = createHazardStateSpace(graph, timeline, Math.max(pushbackTurns, 1));
  const plannerSpace = reactionDelay > 0
    ? createHazardStateSpace(graph, createDelayedTimeline(timeline, reactionDelay), Math.max(pushbackTurns, 1))
    : space;
  const goalDistance = createGoalDistanceTable(graph, goal);
  // Learned heuristic (LRTA*): starts as straight-line distance, only ever raised.
  const learned = Float64Array.from(goalDistance);
  const probe = timeline.enemyCount > 0 ? createEnemyDistanceProbe(graph) : null;

  // Lookahead scratch: the planner state space can be large, so only planners allocate it.
  const planning = spec.kind === 'planner-limited' || spec.kind === 'planner-noisy';
  const stamp = planning ? new Int32Array(plannerSpace.stateCount) : new Int32Array(0);
  let epoch = 0;

  /**
   * Returns the action index of the best first move, or -1 when the lookahead has
   * no contact-free move. Raises the learned heuristic of `cell` to the best score.
   */
  const planAction = (cell: HazardCellId, tickMod: number, invulnerable: number): number => {
    epoch += 1;
    const states: number[] = [plannerSpace.stateIndex(cell, tickMod, invulnerable)];
    const depths: number[] = [0];
    const firsts: number[] = [-1];
    stamp[states[0]!] = epoch;
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestDepth = Number.POSITIVE_INFINITY;
    for (let head = 0; head < states.length; head += 1) {
      const state = states[head]!;
      const depth = depths[head]!;
      if (head > 0) {
        const here = plannerSpace.cellOf(state);
        if (here === goal) {
          return firsts[head]!;
        }
        // Waiting is only instrumental (a gate or patrol timing): ending the
        // lookahead back on the current cell is never a goal in itself.
        const score = here === cell ? Number.POSITIVE_INFINITY : depth + learned[here]!;
        if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && depth < bestDepth)) {
          best = firsts[head]!;
          bestScore = score;
          bestDepth = depth;
        }
      }
      if (depth < horizon) {
        const first = firsts[head]!;
        plannerSpace.forEachSuccessor(state, (next, action) => {
          if (stamp[next] === epoch) {
            return;
          }
          stamp[next] = epoch;
          states.push(next);
          depths.push(depth + 1);
          firsts.push(depth === 0 ? actionIndexOf(action) : first);
        });
      }
    }
    if (best >= 0 && bestScore > learned[cell]!) {
      learned[cell] = bestScore;
    }
    return best;
  };

  const pickMinScore = (candidates: readonly number[], cell: HazardCellId): number => {
    let best = candidates[0]!;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const dest = candidate === WAIT_INDEX ? cell : graph.moveTarget(cell, HAZARD_ACTION_ORDER[candidate] as HazardMoveDirection);
      const score = learned[dest]!;
      if (score < bestScore - 1e-9) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  };

  let cell = start;
  let previousCell = -1;
  let invulnerable = 0;
  let waits = 0;
  let mistakes = 0;
  const contactEvents: BotContactEvent[] = [];
  let turns = 0;
  const path: HazardCellId[] = [start];
  let minEnemy = probe ? probe.distanceFrom(start, timeline.enemyCellsAt(startTick)) : null;

  while (turns < maxTurns && cell !== goal) {
    const tick = startTick + turns;
    const tickMod = tick % period;
    const safeBits = collectActionMask(space, cell, tickMod, invulnerable);
    const legalBits = invulnerable > 0 ? safeBits : collectActionMask(space, cell, tickMod, 1);
    const legal = maskActions(legalBits);

    let chosen = -1;
    if (legal.length > 0) {
      if (spec.kind === 'myopic') {
        const safeMoves = maskActions(safeBits & ~mask(WAIT_INDEX));
        const forward = safeMoves.filter((index) => (
          graph.moveTarget(cell, HAZARD_ACTION_ORDER[index] as HazardMoveDirection) !== previousCell
        ));
        const pool = forward.length > 0 ? forward : safeMoves;
        if (pool.length > 0) {
          let bestScore = Number.POSITIVE_INFINITY;
          const ties: number[] = [];
          for (const index of pool) {
            const score = goalDistance[graph.moveTarget(cell, HAZARD_ACTION_ORDER[index] as HazardMoveDirection)]!;
            if (score < bestScore - 1e-9) {
              bestScore = score;
              ties.length = 0;
              ties.push(index);
            } else if (Math.abs(score - bestScore) <= 1e-9) {
              ties.push(index);
            }
          }
          chosen = ties.length === 1 ? ties[0]! : ties[Math.floor(rng() * ties.length)]!;
        } else if ((safeBits & mask(WAIT_INDEX)) !== 0) {
          chosen = WAIT_INDEX;
        } else {
          chosen = pickMinScore(legal, cell);
        }
      } else {
        const planned = planAction(cell, tickMod, invulnerable);
        const plannedOk = planned >= 0 && (legalBits & mask(planned)) !== 0;
        const intended = plannedOk ? planned : pickMinScore(legal, cell);
        chosen = intended;
        if (mistakeProbability > 0 && rng() < mistakeProbability) {
          const alternative = legal[Math.floor(rng() * legal.length)]!;
          if (alternative !== intended) {
            mistakes += 1;
          }
          chosen = alternative;
        }
      }
    }

    const nextTick = tick + 1;
    const dest = chosen < 0 || chosen === WAIT_INDEX
      ? cell
      : graph.moveTarget(cell, HAZARD_ACTION_ORDER[chosen] as HazardMoveDirection);
    // Contact = obstacle-legal but not contact-free under the P3 rule; no legal action = crushed.
    const contact = chosen < 0 || (invulnerable === 0 && (safeBits & mask(chosen)) === 0);
    if (chosen === WAIT_INDEX) {
      waits += 1;
    }

    previousCell = cell;
    if (contact) {
      const route = path.concat(dest);
      const preferred = resolvePushbackCell(graph, route, path.length);
      let placement = preferred;
      if (timeline.blockedAt(placement, nextTick)) {
        placement = -1;
        for (let i = path.length - 1; i >= 0; i -= 1) {
          if (!timeline.blockedAt(path[i]!, nextTick)) {
            placement = path[i]!;
            break;
          }
        }
        if (placement < 0) {
          placement = cell;
        }
      }
      cell = placement;
      invulnerable = pushbackTurns;
      contactEvents.push({ turn: turns + 1, contactCell: dest, pushbackCell: placement });
    } else {
      cell = dest;
      invulnerable = invulnerable > 0 ? invulnerable - 1 : 0;
    }
    turns += 1;
    path.push(cell);
    if (probe) {
      minEnemy = Math.min(minEnemy!, probe.distanceFrom(cell, timeline.enemyCellsAt(nextTick)));
    }
  }

  return {
    reached: cell === goal,
    turns,
    waits,
    mistakes,
    contacts: contactEvents.length,
    contactEvents,
    minEnemyDistance: minEnemy,
    path
  };
};
