/**
 * DRAFT solvability search with player-dependent enemies (packet P6). Dormant and pure.
 *
 * Extends the P3 witness search (solvability.ts) to a JOINT state
 *   (player cell, player heading*, enemy states, time key, invulnerability k)
 * (* only tracked when an interceptor is present). A chaser or interceptor moves
 * as a function of the player's move, so the witness is a PLAYER ACTION SEQUENCE
 * that is valid against the deterministic enemy response. It is checked by replay
 * (`verifyChaserWitness`), which re-runs the actions through the public
 * `stepJunctionGreedyEnemy` and then hands the recorded enemy trace to P3's
 * `verifyWitness`, so the contact definition is evaluated by the P3 code, not by
 * a copy.
 *
 * Turn model and legality are exactly P3's (solvability.ts header): one action
 * takes tick t to t + 1 as player phase -> enemy phase -> collision phase.
 * Obstacle blocking at the arrival tick is never suspended; contact is
 * (a) occupancy of `dest` after the enemy phase, or (b) a head-on swap; both are
 * ignored while the invulnerability counter k > 0, which decrements. Action
 * order is up, left, down, right, wait, first-discovered parent wins. P3 patrols
 * and obstacles come from the same `HazardTimeline`; chasers are added on top.
 *
 * Time key: enemy tiering (spawn delay, grace, speed divisor) depends on absolute
 * turn counts, obstacles on tick mod P. The key is the absolute tick while
 * `tick < E` (E = max over enemies of spawnDelay + grace) and
 * `E + ((tick - E) mod Q)` afterwards, where Q = lcm(P, speed divisors); it
 * folds exactly onto both clocks.
 *
 * Search: bucketed A* with unit costs and the consistent heuristic "static
 * distance to goal" (so the witness is a shortest one); `useHeuristic: false`
 * degrades to plain BFS whose result is identical to P3's `findWitnessRoute`
 * when there are no chasers. A hard `stateCap` ends every search with an explicit
 * `unknown` result instead of hanging.
 */

import {
  HAZARD_ACTION_ORDER,
  HAZARD_MAX_PERIOD,
  HazardSpecError,
  boundedLcm,
  type HazardAction,
  type HazardCellId,
  type HazardGraph,
  type HazardMoveDirection,
  type HazardTimeline
} from './graphContract';
import {
  HAZARD_WITNESS_CONTRACT,
  verifyWitness,
  type WitnessReplayResult
} from './solvability';
import {
  NO_HEADING_INDEX,
  getJunctionGreedyGeometry,
  headingToIndex,
  packEnemy,
  stepJunctionGreedyEnemy,
  stepJunctionGreedyPacked,
  unpackEnemyCell,
  type EnemyBlockedPredicate,
  type JunctionGreedyEnemyState,
  type NormalizedJunctionGreedySpec
} from './chaserEngine';

export const CHASER_WITNESS_CONTRACT = 'mazer-chaser-witness-draft-v0' as const;

/** Default hard cap on joint states created by one search. */
export const DEFAULT_CHASER_STATE_CAP = 1_500_000;
/** Largest tiering prefix (spawn delay + grace) the folded time key supports. */
export const MAX_CHASER_PREFIX_TURNS = 4096;

const WAIT_INDEX = 4;

export interface ChaserWitness {
  readonly contract: typeof CHASER_WITNESS_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly startTick: number;
  readonly invulnerableTurns: number;
  readonly startHeading: HazardMoveDirection | null;
  /** Number of actions (steps + waits). */
  readonly ticks: number;
  readonly waits: number;
  /** Player cell after each action; `cells[0] === start`, length `ticks + 1`. */
  readonly cells: readonly HazardCellId[];
  /** One entry per action, length `ticks`. */
  readonly actions: readonly HazardAction[];
  /** `enemyCells[i][e]`: chaser `e` after `i` actions (-1 = not spawned), length `ticks + 1`. */
  readonly enemyCells: ReadonlyArray<readonly HazardCellId[]>;
}

export type ChaserUnsolvableReason =
  | 'invalid-endpoint'
  | 'start-blocked'
  | 'start-contact'
  | 'no-route'
  | 'max-ticks-exceeded';

export type ChaserUnknownReason = 'state-cap-exceeded' | 'period-too-large';

export type ChaserWitnessResult =
  | { readonly status: 'solvable'; readonly witness: ChaserWitness; readonly exploredStates: number }
  | { readonly status: 'unsolvable'; readonly reason: ChaserUnsolvableReason; readonly exploredStates: number }
  | {
    readonly status: 'unknown';
    readonly reason: ChaserUnknownReason;
    readonly exploredStates: number;
    readonly stateCap: number;
  };

export interface FindChaserWitnessOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  /** Absolute tick at which the search begins (default 0). `enemies` are their states at this tick. */
  readonly startTick?: number;
  /** Contact-free turns remaining at the start (default 0). */
  readonly invulnerableTurns?: number;
  /** Player's last move direction at the start (default null). */
  readonly startHeading?: HazardMoveDirection | null;
  /** Optional cap on the number of actions in the witness. */
  readonly maxTicks?: number;
  /** Hard cap on joint states (default DEFAULT_CHASER_STATE_CAP). */
  readonly stateCap?: number;
  /** Largest allowed lcm(P, speed divisors) (default HAZARD_MAX_PERIOD). */
  readonly maxCombinedPeriod?: number;
  /** false = plain BFS (P3-identical tie-breaking). Default true (A*). */
  readonly useHeuristic?: boolean;
}

// ---------------------------------------------------------------------------
// Joint search space
// ---------------------------------------------------------------------------

export interface ChaserSearchPoint {
  readonly cell: HazardCellId;
  readonly heading: HazardMoveDirection | null;
  /** Absolute tick. */
  readonly tick: number;
  readonly invulnerable: number;
  readonly enemies: readonly JunctionGreedyEnemyState[];
}

export interface DecodedChaserNode {
  readonly timeKey: number;
  readonly cell: HazardCellId;
  readonly headingIndex: number;
  readonly invulnerable: number;
  /** Packed enemy states (see chaserEngine `packEnemy`). */
  readonly enemies: readonly number[];
}

export interface ChaserSearchOptions {
  readonly maxTicks?: number;
  readonly stateCap?: number;
  readonly useHeuristic?: boolean;
  /**
   * Success shortcut: a state is "known solvable" when its key without k maps to a
   * minimum k that is <= the state's k (more invulnerability is never worse).
   */
  readonly knownSolvable?: ReadonlyMap<number, number>;
}

export interface ChaserSearchOutcome {
  readonly status: 'goal' | 'known' | 'exhausted' | 'capped' | 'truncated';
  readonly exploredStates: number;
  /** Keys from the start to the end state (empty unless goal/known). */
  readonly path: readonly number[];
  /** Action indices (0..3 moves in up, left, down, right order, 4 = wait). */
  readonly actionIndices: readonly number[];
}

export interface ChaserSearchSpace {
  readonly specs: readonly NormalizedJunctionGreedySpec[];
  readonly period: number;
  readonly prefixTurns: number;
  readonly combinedPeriod: number;
  readonly timeKeyCount: number;
  readonly invulnerabilityLevels: number;
  readonly trackHeading: boolean;
  /** Upper bound on the number of distinct keys (product of the radices). */
  readonly keySpaceSize: number;
  timeKeyOf(tick: number): number;
  encode(point: ChaserSearchPoint): number;
  decode(key: number): DecodedChaserNode;
  /** Key without the invulnerability digit. */
  restKey(key: number): number;
  invulnerabilityOf(key: number): number;
  entryProblem(point: ChaserSearchPoint): 'blocked' | 'contact' | null;
  /** The key after one action, or -1 when the action is illegal. */
  step(key: number, action: HazardAction): number;
  search(startKey: number, goal: HazardCellId, options?: ChaserSearchOptions): ChaserSearchOutcome;
}

export interface ChaserSearchSpaceOptions {
  /** Highest invulnerability counter the space has to represent. */
  readonly maxInvulnerableTurns?: number;
  readonly maxCombinedPeriod?: number;
}

const MAX_SAFE_KEY_SPACE = 2 ** 52;

export const createChaserSearchSpace = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  specs: readonly NormalizedJunctionGreedySpec[],
  options: ChaserSearchSpaceOptions = {}
): ChaserSearchSpace => {
  const geometry = getJunctionGreedyGeometry(graph);
  const cells = graph.cellCount;
  const P = timeline.period;
  const m = specs.length;
  const levels = (options.maxInvulnerableTurns ?? 0) + 1;

  const prefixTurns = specs.reduce((max, spec) => Math.max(max, spec.spawnDelayTurns + spec.graceTurns), 0);
  if (prefixTurns > MAX_CHASER_PREFIX_TURNS) {
    throw new HazardSpecError(
      'period-too-large',
      `spawn delay + grace of ${prefixTurns} turns exceeds the bound of ${MAX_CHASER_PREFIX_TURNS}`,
      null
    );
  }
  const Q = boundedLcm([P, ...specs.map((spec) => spec.speedDivisor)], options.maxCombinedPeriod ?? HAZARD_MAX_PERIOD);
  const T = prefixTurns + Q;
  const trackHeading = specs.some((spec) => spec.rule === 'interceptor');
  const headingRadix = trackHeading ? 5 : 1;
  const enemyRadix = (cells + 1) * 5;

  let keySpaceSize = T * cells * headingRadix * levels;
  for (let i = 0; i < m; i += 1) {
    keySpaceSize *= enemyRadix;
  }
  if (!(keySpaceSize <= MAX_SAFE_KEY_SPACE)) {
    throw new HazardSpecError('period-too-large', 'joint state key space exceeds 2^52', null);
  }

  // Obstacle and patrol tables, indexed by tick mod P.
  const blocked = new Uint8Array(P * cells);
  const patrolOccupied = new Uint8Array(P * cells);
  const patrolCells: Array<readonly HazardCellId[]> = [];
  for (let tick = 0; tick < P; tick += 1) {
    const here = timeline.enemyCellsAt(tick);
    patrolCells.push(here);
    for (const cell of here) {
      patrolOccupied[tick * cells + cell] = 1;
    }
    for (let cell = 0; cell < cells; cell += 1) {
      if (timeline.blockedAt(cell, tick)) {
        blocked[tick * cells + cell] = 1;
      }
    }
  }
  const enemyBlocked: EnemyBlockedPredicate = (cell, turn) => blocked[(turn % P) * cells + cell] === 1;

  const timeKeyOf = (tick: number): number => (tick < prefixTurns ? tick : prefixTurns + ((tick - prefixTurns) % Q));

  const encodeParts = (
    timeKey: number, cell: number, headingIndex: number, enemies: ArrayLike<number>, invulnerable: number
  ): number => {
    let key = (timeKey * cells + cell) * headingRadix + (trackHeading ? headingIndex : 0);
    for (let i = 0; i < m; i += 1) {
      key = key * enemyRadix + enemies[i]!;
    }
    return key * levels + invulnerable;
  };

  const scratchEnemies = new Int32Array(Math.max(m, 1));
  const nextEnemies = new Int32Array(Math.max(m, 1));
  const scratchDests = new Int32Array(4);
  let decodedTimeKey = 0;
  let decodedCell = 0;
  let decodedHeading = 0;
  let decodedInvulnerable = 0;

  const decodeInto = (key: number): void => {
    let rest = key;
    decodedInvulnerable = rest % levels;
    rest = (rest - decodedInvulnerable) / levels;
    for (let i = m - 1; i >= 0; i -= 1) {
      const value = rest % enemyRadix;
      scratchEnemies[i] = value;
      rest = (rest - value) / enemyRadix;
    }
    const heading = rest % headingRadix;
    rest = (rest - heading) / headingRadix;
    decodedHeading = trackHeading ? heading : NO_HEADING_INDEX;
    decodedCell = rest % cells;
    decodedTimeKey = (rest - decodedCell) / cells;
  };

  const expand = (key: number, visit: (child: number, actionIndex: number) => void, only: number): void => {
    decodeInto(key);
    const timeKey = decodedTimeKey;
    const cell = decodedCell;
    const heading = decodedHeading;
    const invulnerable = decodedInvulnerable;
    const turn = timeKey + 1;
    const currentMod = timeKey % P;
    const nextMod = turn % P;
    const nextTimeKey = turn < T ? turn : prefixTurns;
    const nextInvulnerable = invulnerable > 0 ? invulnerable - 1 : 0;
    const currentEnemies = Array.from(scratchEnemies.subarray(0, m));
    let emitted = 0;

    for (let a = 0; a <= WAIT_INDEX; a += 1) {
      if (only >= 0 && a !== only) {
        continue;
      }
      let dest = cell;
      if (a < 4) {
        dest = geometry.moves[cell * 4 + a]!;
        if (dest < 0) {
          continue;
        }
        let duplicate = false;
        for (let i = 0; i < emitted; i += 1) {
          if (scratchDests[i] === dest) {
            duplicate = true;
          }
        }
        if (duplicate) {
          continue;
        }
        scratchDests[emitted++] = dest;
      }
      if (blocked[nextMod * cells + dest] === 1) {
        continue;
      }
      const nextHeading = a < 4 ? a : heading;
      const coreHeading = trackHeading ? nextHeading : NO_HEADING_INDEX;
      for (let i = 0; i < m; i += 1) {
        nextEnemies[i] = stepJunctionGreedyPacked(
          geometry, specs[i]!, currentEnemies[i]!, dest, coreHeading, turn, false, enemyBlocked
        );
      }
      if (invulnerable === 0) {
        if (patrolOccupied[nextMod * cells + dest] === 1) {
          continue;
        }
        let contact = false;
        for (let i = 0; i < m && !contact; i += 1) {
          contact = unpackEnemyCell(nextEnemies[i]!) === dest;
        }
        if (contact) {
          continue;
        }
        if (dest !== cell) {
          const before = patrolCells[currentMod]!;
          const after = patrolCells[nextMod]!;
          for (let e = 0; e < before.length && !contact; e += 1) {
            contact = before[e] === dest && after[e] === cell;
          }
          for (let i = 0; i < m && !contact; i += 1) {
            contact = unpackEnemyCell(currentEnemies[i]!) === dest && unpackEnemyCell(nextEnemies[i]!) === cell;
          }
          if (contact) {
            continue;
          }
        }
      }
      visit(encodeParts(nextTimeKey, dest, nextHeading, nextEnemies, nextInvulnerable), a);
    }
  };

  const pointToParts = (point: ChaserSearchPoint): { timeKey: number; enemies: number[] } => {
    if (point.enemies.length !== m) {
      throw new RangeError(`expected ${m} enemy states, received ${point.enemies.length}`);
    }
    if (!Number.isInteger(point.tick) || point.tick < 0) {
      throw new RangeError('tick must be a non-negative integer');
    }
    if (!Number.isInteger(point.invulnerable) || point.invulnerable < 0 || point.invulnerable >= levels) {
      throw new RangeError(`invulnerable must be an integer in [0, ${levels - 1}]`);
    }
    const enemies = point.enemies.map((enemy) => {
      if (enemy.reverseNext) {
        throw new RangeError('a pending global reverse event is not modelled by the solver');
      }
      return packEnemy(enemy.cell, headingToIndex(enemy.heading));
    });
    return { timeKey: timeKeyOf(point.tick), enemies };
  };

  const staticDistanceCache = new Map<number, Int32Array>();
  const staticDistanceTo = (goal: HazardCellId): Int32Array => {
    const cached = staticDistanceCache.get(goal);
    if (cached) {
      return cached;
    }
    const impassable = new Set<number>(blockerCellsOf(timeline));
    const distance = new Int32Array(cells).fill(-1);
    const queue = new Int32Array(cells);
    let head = 0;
    let tail = 0;
    if (!impassable.has(goal)) {
      distance[goal] = 0;
      queue[tail++] = goal;
    }
    while (head < tail) {
      const current = queue[head++]!;
      for (const next of graph.neighbors(current)) {
        if (distance[next] === -1 && !impassable.has(next)) {
          distance[next] = distance[current]! + 1;
          queue[tail++] = next;
        }
      }
    }
    staticDistanceCache.set(goal, distance);
    return distance;
  };

  const search = (startKey: number, goal: HazardCellId, searchOptions: ChaserSearchOptions = {}): ChaserSearchOutcome => {
    const stateCap = searchOptions.stateCap ?? DEFAULT_CHASER_STATE_CAP;
    const maxTicks = searchOptions.maxTicks ?? Number.POSITIVE_INFINITY;
    const useHeuristic = searchOptions.useHeuristic ?? true;
    const known = searchOptions.knownSolvable ?? null;
    const heuristicTable = useHeuristic ? staticDistanceTo(goal) : null;

    let capacity = 1024;
    let keys = new Float64Array(capacity);
    let parent = new Int32Array(capacity);
    let actionOf = new Uint8Array(capacity);
    let cost = new Int32Array(capacity);
    const grow = (): void => {
      capacity *= 2;
      const nextKeys = new Float64Array(capacity);
      nextKeys.set(keys);
      keys = nextKeys;
      const nextParent = new Int32Array(capacity);
      nextParent.set(parent);
      parent = nextParent;
      const nextAction = new Uint8Array(capacity);
      nextAction.set(actionOf);
      actionOf = nextAction;
      const nextCost = new Int32Array(capacity);
      nextCost.set(cost);
      cost = nextCost;
    };

    const index = new Map<number, number>();
    const buckets: number[][] = [];
    const heads: number[] = [];
    let count = 0;
    let cursor = 0;

    const heuristicOfKey = (key: number): number => {
      if (heuristicTable === null) {
        return 0;
      }
      decodeInto(key);
      return heuristicTable[decodedCell]!;
    };

    const push = (node: number, f: number): void => {
      while (buckets.length <= f) {
        buckets.push([]);
        heads.push(0);
      }
      buckets[f]!.push(node);
      if (f < cursor) {
        cursor = f;
      }
    };

    const startH = heuristicOfKey(startKey);
    if (startH < 0) {
      return { status: 'exhausted', exploredStates: 0, path: [], actionIndices: [] };
    }
    keys[0] = startKey;
    parent[0] = -1;
    cost[0] = 0;
    index.set(startKey, 0);
    count = 1;
    push(0, startH);

    let truncated = false;
    let found = -1;
    let foundKind: 'goal' | 'known' = 'goal';

    while (true) {
      while (cursor < buckets.length && heads[cursor]! >= buckets[cursor]!.length) {
        cursor += 1;
      }
      if (cursor >= buckets.length) {
        break;
      }
      const node = buckets[cursor]![heads[cursor]!++]!;
      const key = keys[node]!;
      const nodeH = heuristicOfKey(key);
      if (cost[node]! + nodeH !== cursor) {
        continue; // stale entry superseded by a cheaper discovery
      }
      decodeInto(key);
      if (decodedCell === goal) {
        found = node;
        foundKind = 'goal';
        break;
      }
      if (known !== null) {
        const minK = known.get(Math.floor(key / levels));
        if (minK !== undefined && minK <= decodedInvulnerable) {
          found = node;
          foundKind = 'known';
          break;
        }
      }
      if (cost[node]! >= maxTicks) {
        truncated = true;
        continue;
      }
      const nodeCost = cost[node]!;
      let capped = false;
      expand(key, (child, actionIndex) => {
        if (capped) {
          return;
        }
        const existing = index.get(child);
        if (existing === undefined) {
          if (count >= stateCap) {
            capped = true;
            return;
          }
          let h = 0;
          if (heuristicTable !== null) {
            // child's cell is encoded in the key; avoid re-entering expand's scratch by decoding arithmetically
            h = heuristicTable[cellOfKey(child)]!;
            if (h < 0) {
              return;
            }
          }
          if (count >= capacity) {
            grow();
          }
          keys[count] = child;
          parent[count] = node;
          actionOf[count] = actionIndex;
          cost[count] = nodeCost + 1;
          index.set(child, count);
          push(count, nodeCost + 1 + h);
          count += 1;
        } else if (nodeCost + 1 < cost[existing]!) {
          cost[existing] = nodeCost + 1;
          parent[existing] = node;
          actionOf[existing] = actionIndex;
          const h = heuristicTable === null ? 0 : heuristicTable[cellOfKey(child)]!;
          push(existing, nodeCost + 1 + h);
        }
      }, -1);
      if (capped) {
        return { status: 'capped', exploredStates: count, path: [], actionIndices: [] };
      }
    }

    if (found < 0) {
      return { status: truncated ? 'truncated' : 'exhausted', exploredStates: count, path: [], actionIndices: [] };
    }
    const path: number[] = [];
    const actionIndices: number[] = [];
    for (let at = found; at !== -1; at = parent[at]!) {
      path.push(keys[at]!);
      if (parent[at] !== -1) {
        actionIndices.push(actionOf[at]!);
      }
    }
    path.reverse();
    actionIndices.reverse();
    return { status: foundKind, exploredStates: count, path, actionIndices };
  };

  // Player cell of a key without disturbing the shared decode scratch.
  const cellOfKey = (key: number): number => {
    let rest = Math.floor(key / levels);
    for (let i = 0; i < m; i += 1) {
      rest = Math.floor(rest / enemyRadix);
    }
    rest = Math.floor(rest / headingRadix);
    return rest % cells;
  };

  return {
    specs,
    period: P,
    prefixTurns,
    combinedPeriod: Q,
    timeKeyCount: T,
    invulnerabilityLevels: levels,
    trackHeading,
    keySpaceSize,
    timeKeyOf,
    encode(point) {
      const { timeKey, enemies } = pointToParts(point);
      return encodeParts(timeKey, point.cell, headingToIndex(point.heading), enemies, point.invulnerable);
    },
    decode(key) {
      decodeInto(key);
      return {
        timeKey: decodedTimeKey,
        cell: decodedCell,
        headingIndex: decodedHeading,
        invulnerable: decodedInvulnerable,
        enemies: Array.from(scratchEnemies.subarray(0, m))
      };
    },
    restKey: (key) => Math.floor(key / levels),
    invulnerabilityOf: (key) => key % levels,
    entryProblem(point) {
      const tickMod = point.tick % P;
      if (blocked[tickMod * cells + point.cell] === 1) {
        return 'blocked';
      }
      if (point.invulnerable === 0) {
        if (patrolOccupied[tickMod * cells + point.cell] === 1) {
          return 'contact';
        }
        if (point.enemies.some((enemy) => enemy.cell === point.cell)) {
          return 'contact';
        }
      }
      return null;
    },
    step(key, action) {
      const actionIndex = HAZARD_ACTION_ORDER.indexOf(action);
      let result = -1;
      expand(key, (child) => {
        result = child;
      }, actionIndex);
      return result;
    },
    search
  };
};

/** Static blockers of a timeline, when it exposes them (P3 `BuiltHazardTimeline`). */
const blockerCellsOf = (timeline: HazardTimeline): readonly HazardCellId[] => (
  (timeline as { blockerCells?: readonly HazardCellId[] }).blockerCells ?? []
);

// ---------------------------------------------------------------------------
// Replay (public engine API only)
// ---------------------------------------------------------------------------

export interface ChaserReplay {
  readonly ok: boolean;
  readonly failedAction: number | null;
  readonly reason: string | null;
  /** `enemyStates[i]`: chaser states after `i` actions (length ticks + 1 when ok). */
  readonly enemyStates: ReadonlyArray<readonly JunctionGreedyEnemyState[]>;
  /** Player cell after each action (length ticks + 1 when ok). */
  readonly playerCells: readonly HazardCellId[];
  /** Player heading after each action (length ticks + 1 when ok). */
  readonly playerHeadings: ReadonlyArray<HazardMoveDirection | null>;
}

/**
 * Replays player actions through `stepJunctionGreedyEnemy` (the engine's public
 * step, not the solver's packed path). Contact is NOT evaluated here.
 */
export const replayChaserActions = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  enemies: readonly JunctionGreedyEnemyState[],
  options: {
    readonly start: HazardCellId;
    readonly startTick: number;
    readonly startHeading: HazardMoveDirection | null;
    readonly actions: readonly HazardAction[];
  }
): ChaserReplay => {
  const blocked: EnemyBlockedPredicate = (cell, turn) => timeline.blockedAt(cell, turn);
  let cell = options.start;
  let heading = options.startHeading;
  let states = enemies;
  const enemyStates: Array<readonly JunctionGreedyEnemyState[]> = [states];
  const playerCells: HazardCellId[] = [cell];
  const playerHeadings: Array<HazardMoveDirection | null> = [heading];
  for (let index = 0; index < options.actions.length; index += 1) {
    const action = options.actions[index]!;
    const dest = action === 'wait' ? cell : graph.moveTarget(cell, action);
    if (dest < 0) {
      return { ok: false, failedAction: index, reason: 'illegal-move', enemyStates, playerCells, playerHeadings };
    }
    if (action !== 'wait') {
      heading = action;
    }
    cell = dest;
    const tick = options.startTick + index;
    states = states.map((state) => stepJunctionGreedyEnemy(graph, state, { cell, heading }, tick, { blocked }));
    enemyStates.push(states);
    playerCells.push(cell);
    playerHeadings.push(heading);
  }
  return { ok: true, failedAction: null, reason: null, enemyStates, playerCells, playerHeadings };
};

/** A `HazardTimeline` view of a recorded run: the base timeline plus the replayed chasers. */
const createRecordedTimeline = (
  base: HazardTimeline,
  startTick: number,
  chaserCells: ReadonlyArray<readonly HazardCellId[]>,
  chaserCount: number
): HazardTimeline => ({
  period: base.period,
  enemyCount: base.enemyCount + chaserCount,
  blockedAt: (cell, tick) => base.blockedAt(cell, tick),
  enemyCellsAt(tick) {
    const recorded = chaserCells[tick - startTick];
    if (recorded === undefined) {
      throw new RangeError(`tick ${tick} is outside the recorded run`);
    }
    return [...base.enemyCellsAt(tick), ...recorded];
  }
});

/**
 * Re-verifies a stored witness. The actions are replayed through the public
 * `stepJunctionGreedyEnemy`, the recorded enemy trace must match the witness, and
 * the resulting timeline is checked by P3's `verifyWitness` (the single contact
 * definition). Independent of the solver's tables.
 */
export const verifyChaserWitness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  enemies: readonly JunctionGreedyEnemyState[],
  witness: ChaserWitness
): WitnessReplayResult => {
  const fail = (failedAction: number | null, reason: string): WitnessReplayResult => (
    { valid: false, failedAction, reason }
  );
  if (witness.width !== graph.width || witness.height !== graph.height) {
    return fail(null, 'dimension-mismatch');
  }
  if (
    witness.cells.length !== witness.actions.length + 1
    || witness.cells[0] !== witness.start
    || witness.ticks !== witness.actions.length
    || witness.enemyCells.length !== witness.actions.length + 1
  ) {
    return fail(null, 'malformed-witness');
  }
  const replay = replayChaserActions(graph, timeline, enemies, {
    start: witness.start,
    startTick: witness.startTick,
    startHeading: witness.startHeading,
    actions: witness.actions
  });
  if (!replay.ok) {
    return fail(replay.failedAction, replay.reason ?? 'illegal-move');
  }
  const trace = replay.enemyStates.map((states) => states.map((state) => state.cell));
  for (let i = 0; i < trace.length; i += 1) {
    const recorded = witness.enemyCells[i]!;
    if (recorded.length !== enemies.length || recorded.some((cell, e) => cell !== trace[i]![e])) {
      return fail(Math.max(0, i - 1), 'enemy-trace-mismatch');
    }
  }
  const composite = createRecordedTimeline(timeline, witness.startTick, trace, enemies.length);
  return verifyWitness(graph, composite, {
    contract: HAZARD_WITNESS_CONTRACT,
    width: witness.width,
    height: witness.height,
    start: witness.start,
    goal: witness.goal,
    startTick: witness.startTick,
    invulnerableTurns: witness.invulnerableTurns,
    period: timeline.period,
    ticks: witness.ticks,
    waits: witness.waits,
    cells: witness.cells,
    actions: witness.actions
  });
};

// ---------------------------------------------------------------------------
// Public search
// ---------------------------------------------------------------------------

export const findWitnessRouteWithChasers = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  enemies: readonly JunctionGreedyEnemyState[],
  options: FindChaserWitnessOptions
): ChaserWitnessResult => {
  const { start, goal } = options;
  const startTick = options.startTick ?? 0;
  const invulnerableTurns = options.invulnerableTurns ?? 0;
  const startHeading = options.startHeading ?? null;
  if (!Number.isInteger(startTick) || startTick < 0) {
    throw new RangeError('startTick must be a non-negative integer');
  }
  if (!Number.isInteger(invulnerableTurns) || invulnerableTurns < 0) {
    throw new RangeError('invulnerableTurns must be a non-negative integer');
  }
  const stateCap = options.stateCap ?? DEFAULT_CHASER_STATE_CAP;
  if (!graph.isWalkable(start) || !graph.isWalkable(goal)) {
    return { status: 'unsolvable', reason: 'invalid-endpoint', exploredStates: 0 };
  }
  for (const enemy of enemies) {
    if (enemy.cell >= 0 && !graph.isWalkable(enemy.cell)) {
      throw new RangeError(`enemy cell ${enemy.cell} is not walkable`);
    }
  }

  let space: ChaserSearchSpace;
  try {
    space = createChaserSearchSpace(graph, timeline, enemies.map((enemy) => enemy.spec), {
      maxInvulnerableTurns: invulnerableTurns,
      maxCombinedPeriod: options.maxCombinedPeriod
    });
  } catch (error) {
    if (error instanceof HazardSpecError) {
      return { status: 'unknown', reason: 'period-too-large', exploredStates: 0, stateCap };
    }
    throw error;
  }

  const point: ChaserSearchPoint = {
    cell: start, heading: startHeading, tick: startTick, invulnerable: invulnerableTurns, enemies
  };
  const problem = space.entryProblem(point);
  if (problem === 'blocked') {
    return { status: 'unsolvable', reason: 'start-blocked', exploredStates: 0 };
  }
  if (problem === 'contact') {
    return { status: 'unsolvable', reason: 'start-contact', exploredStates: 0 };
  }

  const outcome = space.search(space.encode(point), goal, {
    maxTicks: options.maxTicks,
    stateCap,
    useHeuristic: options.useHeuristic
  });
  if (outcome.status === 'capped') {
    return { status: 'unknown', reason: 'state-cap-exceeded', exploredStates: outcome.exploredStates, stateCap };
  }
  if (outcome.status !== 'goal') {
    return {
      status: 'unsolvable',
      reason: outcome.status === 'truncated' ? 'max-ticks-exceeded' : 'no-route',
      exploredStates: outcome.exploredStates
    };
  }

  const decoded = outcome.path.map((key) => space.decode(key));
  const actions = outcome.actionIndices.map((a) => HAZARD_ACTION_ORDER[a]!);
  const witness: ChaserWitness = {
    contract: CHASER_WITNESS_CONTRACT,
    width: graph.width,
    height: graph.height,
    start,
    goal,
    startTick,
    invulnerableTurns,
    startHeading,
    ticks: actions.length,
    waits: actions.filter((action) => action === 'wait').length,
    cells: decoded.map((node) => node.cell),
    actions,
    enemyCells: decoded.map((node) => node.enemies.map((packed) => unpackEnemyCell(packed)))
  };
  return { status: 'solvable', witness, exploredStates: outcome.exploredStates };
};

export interface ChaserStateSpaceEstimate {
  readonly walkableCells: number;
  readonly enemies: number;
  readonly timeKeys: number;
  readonly combinedPeriod: number;
  readonly prefixTurns: number;
  /** Ceiling on distinct joint keys: a product of radices, NOT a reachable-state count. */
  readonly keySpaceSize: number;
  /** Joint states ignoring heading digits: timeKeys * walkable^(1 + enemies) * levels. */
  readonly positionalBound: number;
}

/** Reports the joint state-space ceiling for a configuration without searching. */
export const estimateChaserStateSpace = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  specs: readonly NormalizedJunctionGreedySpec[],
  maxInvulnerableTurns = 0
): ChaserStateSpaceEstimate => {
  const space = createChaserSearchSpace(graph, timeline, specs, { maxInvulnerableTurns });
  return {
    walkableCells: graph.walkableCellCount,
    enemies: specs.length,
    timeKeys: space.timeKeyCount,
    combinedPeriod: space.combinedPeriod,
    prefixTurns: space.prefixTurns,
    keySpaceSize: space.keySpaceSize,
    positionalBound: space.timeKeyCount * graph.walkableCellCount ** (1 + specs.length) * space.invulnerabilityLevels
  };
};
