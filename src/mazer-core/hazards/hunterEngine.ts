/**
 * Hunter engine (slice H5, pure core). Pure: no scene, no randomness, no clock.
 *
 * The Hunter is the `chaserEngine` junction-greedy kind with the `chaser` target
 * rule (targets the player's cell, never reverses except at dead ends, ties
 * broken up/left/down/right). This module adds what the signed contract asks on
 * top of the engine (docs/architecture/MAZER-HAZARD-PRODUCT-CONTRACT.md 2.2, 2.3
 * and 2.5; graph contract amendments A1 and A4):
 *   - speed tiers: `speedDivisor` 3 at the intro tier, 2 after one tier step,
 *     never below 2 (`HUNTER_SPEED_DIVISORS` in schedule.ts, pinned to the manifest);
 *   - the den: the spawn cell, at least 60% of the static route length away from
 *     the start and out of sight of the start, picked from the hazard seed stream;
 *   - burnout (A4): the third contact with the same Hunter in one level removes it.
 *     A burned-out Hunter has no cell, never moves and never makes contact again.
 *
 * Movement itself is `stepJunctionGreedyEnemy`; this module never re-implements it.
 */

import {
  createJunctionGreedyEnemy,
  stepJunctionGreedyEnemy,
  type ChaserPlayerState,
  type JunctionGreedyEnemySpec,
  type JunctionGreedyEnemyState,
  type StepJunctionGreedyOptions
} from './chaserEngine';
import { HAZARD_MOVE_ORDER, type HazardCellId, type HazardGraph } from './graphContract';
import { mix32 } from './placement';
import { HUNTER_SPEED_DIVISORS, MAX_HUNTER_TIER } from './schedule';

export const HUNTER_ENGINE_CONTRACT = 'mazer-hunter-engine-v1' as const;

/** A4: the third contact with the same Hunter in one level burns it out. */
export const HUNTER_BURNOUT_CONTACTS = 3;
/** Contract 2.2: a Hunter's speed divisor never goes below 2. */
export const HUNTER_MIN_SPEED_DIVISOR = 2;
/** Contract 2.5 (L35 first-encounter shape): the den is at least 60% of the route from the start. */
export const HUNTER_DEN_MIN_ROUTE_FRACTION = 0.6;
/** A den never sits on or next to the goal, so a Hunter cannot spawn onto the star. */
export const HUNTER_DEN_MIN_GOAL_DISTANCE = 2;
/** Two dens on one board are at least this many static steps apart. */
export const HUNTER_DEN_MIN_SEPARATION = 6;
/** Salt of the den stream ("HUNT"), mixed into the hazard seed. */
export const HUNTER_DEN_STREAM = 0x48554e54;

/** Speed divisor of a Hunter tier. Tiers outside 0..MAX_HUNTER_TIER are clamped. */
export const resolveHunterSpeedDivisor = (tier: number): number => {
  const clamped = Number.isFinite(tier) ? Math.max(0, Math.min(MAX_HUNTER_TIER, Math.trunc(tier))) : 0;
  return Math.max(HUNTER_MIN_SPEED_DIVISOR, HUNTER_SPEED_DIVISORS[clamped]!);
};

export interface HunterSpecOptions {
  readonly tier?: number;
  readonly graceTurns?: number;
  readonly spawnDelayTurns?: number;
}

/** Engine spec of one Hunter at `den`. */
export const createHunterSpec = (den: HazardCellId, options: HunterSpecOptions = {}): JunctionGreedyEnemySpec => ({
  rule: 'chaser',
  spawnCell: den,
  speedDivisor: resolveHunterSpeedDivisor(options.tier ?? 0),
  ...(options.graceTurns === undefined ? {} : { graceTurns: options.graceTurns }),
  ...(options.spawnDelayTurns === undefined ? {} : { spawnDelayTurns: options.spawnDelayTurns })
});

// ---------------------------------------------------------------------------
// Den selection
// ---------------------------------------------------------------------------

/** Static BFS distances (graph steps, wrap edges included) from `source`; -1 = unreachable. */
export const staticDistancesFrom = (graph: HazardGraph, source: HazardCellId): Int32Array => {
  const distance = new Int32Array(graph.cellCount).fill(-1);
  if (!graph.isWalkable(source)) {
    return distance;
  }
  const queue = new Int32Array(graph.cellCount);
  let head = 0;
  let tail = 0;
  distance[source] = 0;
  queue[tail++] = source;
  while (head < tail) {
    const current = queue[head++]!;
    for (const next of graph.neighbors(current)) {
      if (distance[next] === -1) {
        distance[next] = distance[current]! + 1;
        queue[tail++] = next;
      }
    }
  }
  return distance;
};

/**
 * Cells in straight line of sight of `origin`: walking one direction cell by cell
 * through `moveTarget` (so a wrap edge continues the line) until a wall. The
 * origin itself is included.
 */
export const lineOfSightCells = (graph: HazardGraph, origin: HazardCellId): Set<HazardCellId> => {
  const seen = new Set<HazardCellId>([origin]);
  const limit = graph.width + graph.height;
  for (const direction of HAZARD_MOVE_ORDER) {
    let cell = origin;
    for (let step = 0; step < limit; step += 1) {
      const next = graph.moveTarget(cell, direction);
      if (next < 0 || next === origin) {
        break;
      }
      seen.add(next);
      cell = next;
    }
  }
  return seen;
};

export interface HunterDenCandidates {
  /** Static shortest route length start -> goal (graph steps). */
  readonly routeLength: number;
  /** Smallest allowed static distance from the start: ceil(0.6 * routeLength). */
  readonly minStartDistance: number;
  /** Eligible cells off the static shortest route, ascending cell id. */
  readonly offRoute: readonly HazardCellId[];
  /** Eligible cells on a static shortest route, ascending cell id. */
  readonly onRoute: readonly HazardCellId[];
}

/**
 * Den rule: walkable, static distance from the start at least
 * `ceil(0.6 * routeLength)`, not in line of sight of the start, at least 2 steps
 * from the goal. Cells on some static shortest route are listed separately: the
 * picker prefers dens off the route (a den is a side pocket, not a roadblock).
 */
export const listHunterDenCandidates = (
  graph: HazardGraph,
  options: { readonly start: HazardCellId; readonly goal: HazardCellId }
): HunterDenCandidates => {
  const fromStart = staticDistancesFrom(graph, options.start);
  const fromGoal = staticDistancesFrom(graph, options.goal);
  const routeLength = fromStart[options.goal]!;
  if (routeLength < 0) {
    return { routeLength: -1, minStartDistance: 0, offRoute: [], onRoute: [] };
  }
  const minStartDistance = Math.ceil(HUNTER_DEN_MIN_ROUTE_FRACTION * routeLength);
  const visible = lineOfSightCells(graph, options.start);
  const offRoute: HazardCellId[] = [];
  const onRoute: HazardCellId[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    const ds = fromStart[cell]!;
    const dg = fromGoal[cell]!;
    if (ds < 0 || dg < 0 || ds < minStartDistance || dg < HUNTER_DEN_MIN_GOAL_DISTANCE || visible.has(cell)) {
      continue;
    }
    (ds + dg === routeLength ? onRoute : offRoute).push(cell);
  }
  return { routeLength, minStartDistance, offRoute, onRoute };
};

export interface SelectHunterDenOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** Den stream seed (derive it with `resolveHunterDenSeed`). */
  readonly seed: number;
  /** Index of the Hunter on this board (0-based). */
  readonly index: number;
  /** Retry counter: a different attempt picks a different den. */
  readonly attempt: number;
  /** Dens already used on this board; the new den keeps HUNTER_DEN_MIN_SEPARATION from each. */
  readonly existingDens?: readonly HazardCellId[];
  /** Cells a den may not use (Sentry routes, gate cells). */
  readonly excludeCells?: ReadonlySet<HazardCellId>;
}

export const resolveHunterDenSeed = (hazardSeed: number): number => mix32(hazardSeed, HUNTER_DEN_STREAM);

/** Deterministic den pick, or null when no cell satisfies the den rule. */
export const selectHunterDen = (graph: HazardGraph, options: SelectHunterDenOptions): HazardCellId | null => {
  const candidates = listHunterDenCandidates(graph, options);
  const existing = options.existingDens ?? [];
  const separated = existing.map((den) => staticDistancesFrom(graph, den));
  const usable = (cell: HazardCellId): boolean => (
    !(options.excludeCells?.has(cell) ?? false)
    && !existing.includes(cell)
    && separated.every((distance) => distance[cell]! < 0 || distance[cell]! >= HUNTER_DEN_MIN_SEPARATION)
  );
  const offRoute = candidates.offRoute.filter(usable);
  const pool = offRoute.length > 0 ? offRoute : candidates.onRoute.filter(usable);
  if (pool.length === 0) {
    return null;
  }
  return pool[mix32(options.seed, options.index, options.attempt) % pool.length]!;
};

// ---------------------------------------------------------------------------
// Runtime state with burnout
// ---------------------------------------------------------------------------

export interface HunterState {
  readonly contract: typeof HUNTER_ENGINE_CONTRACT;
  /** Index of the Hunter on its board. */
  readonly index: number;
  readonly engine: JunctionGreedyEnemyState;
  /** Contacts with this Hunter so far in this level. */
  readonly contacts: number;
  readonly burnedOut: boolean;
  /** World tick at which the burnout contact happened, or null. */
  readonly burnedOutAtTick: number | null;
}

export const createHunterState = (spec: JunctionGreedyEnemySpec, index: number, graph?: HazardGraph): HunterState => {
  const engine = createJunctionGreedyEnemy(spec, graph);
  if (engine.spec.rule !== 'chaser') {
    throw new RangeError('a Hunter uses the chaser target rule');
  }
  if (engine.spec.speedDivisor < HUNTER_MIN_SPEED_DIVISOR) {
    throw new RangeError(`a Hunter speedDivisor is never below ${HUNTER_MIN_SPEED_DIVISOR}`);
  }
  return { contract: HUNTER_ENGINE_CONTRACT, index, engine, contacts: 0, burnedOut: false, burnedOutAtTick: null };
};

/** Cell the Hunter occupies, or -1 when it has not spawned or has burned out. */
export const hunterCell = (state: HunterState): HazardCellId => (state.burnedOut ? -1 : state.engine.cell);

export const isHunterActive = (state: HunterState): boolean => !state.burnedOut;

/** Enemy phase for one Hunter. A burned-out Hunter never moves. */
export const stepHunter = (
  graph: HazardGraph,
  state: HunterState,
  player: ChaserPlayerState,
  tick: number,
  options: StepJunctionGreedyOptions = {}
): HunterState => {
  if (state.burnedOut) {
    return state;
  }
  const engine = stepJunctionGreedyEnemy(graph, state.engine, player, tick, options);
  return engine === state.engine ? state : { ...state, engine };
};

/**
 * Records one contact at world tick `tick`. The third contact burns the Hunter
 * out (A4). Contact with a burned-out Hunter is impossible; calling this on one
 * throws, so a caller bug cannot inflate the count silently.
 */
export const registerHunterContact = (state: HunterState, tick: number): HunterState => {
  if (state.burnedOut) {
    throw new RangeError(`hunter ${state.index} is burned out and cannot make contact`);
  }
  const contacts = state.contacts + 1;
  const burnedOut = contacts >= HUNTER_BURNOUT_CONTACTS;
  return { ...state, contacts, burnedOut, burnedOutAtTick: burnedOut ? tick : null };
};
