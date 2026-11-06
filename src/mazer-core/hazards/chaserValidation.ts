/**
 * DRAFT level validation and fairness analytics with chasers/interceptors
 * (packet P6). Dormant and pure. Mirrors validation.ts (P3) for the
 * player-dependent enemy class; see docs/architecture/MAZER-CHASER-ENGINE.md.
 *
 * Verdicts:
 *   (a) hazardsPresent - a witness exists with every hazard and chaser active,
 *                        and it re-verifies by replay.
 *   (b) itemsAbsent    - by construction (items are not modeled).
 *   (c) postContact    - after a contact on ANY state of the witness, the
 *                        pushback state is still solvable. Pushback model is P3's
 *                        `resolvePushbackCell` (nearest junction behind the player
 *                        along the witness, else the start) with N contact-free
 *                        turns; the chasers keep the state they had at the contact.
 */

import {
  HazardSpecError,
  createHazardGraph,
  createHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardGraphInput,
  type HazardMoveDirection,
  type HazardSpec,
  type HazardSpecErrorCode,
  type HazardTimeline
} from './graphContract';
import { stableStringify } from './serialization';
import { DEFAULT_INVULNERABLE_TURNS, resolvePushbackCell, type PostContactFailureReason } from './validation';
import {
  createJunctionGreedyEnemy,
  type JunctionGreedyEnemySpec,
  type JunctionGreedyEnemyState
} from './chaserEngine';
import {
  createChaserSearchSpace,
  findWitnessRouteWithChasers,
  replayChaserActions,
  verifyChaserWitness,
  type ChaserReplay,
  type ChaserSearchPoint,
  type ChaserSearchSpace,
  type ChaserWitness
} from './chaserSolvability';

export const CHASER_VERDICT_CONTRACT = 'mazer-chaser-verdict-draft-v0' as const;
export const CHASER_FAIRNESS_CONTRACT = 'mazer-chaser-fairness-draft-v0' as const;
export const DEFAULT_POST_CONTACT_STATE_CAP = 250_000;
const MAX_REPORTED_FAILURES = 16;

export type ChaserPostContactFailureReason = PostContactFailureReason | 'state-cap-exceeded';

export interface ChaserPostContactFailure {
  readonly witnessIndex: number;
  readonly contactCell: HazardCellId;
  readonly pushbackCell: HazardCellId;
  readonly tick: number;
  readonly reason: ChaserPostContactFailureReason;
}

export interface ChaserLevelVerdict {
  readonly contract: typeof CHASER_VERDICT_CONTRACT;
  readonly levelId: string | null;
  readonly width: number;
  readonly height: number;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly period: number | null;
  readonly hazards: {
    readonly blockers: number;
    readonly timedGates: number;
    readonly patrols: number;
    readonly chasers: number;
    readonly interceptors: number;
    readonly wallFollowers: number;
  };
  readonly invulnerableTurns: number;
  readonly specError: {
    readonly code: HazardSpecErrorCode | 'invalid-chaser';
    readonly index: number | null;
    readonly message: string;
  } | null;
  readonly hazardsPresent: {
    readonly pass: boolean;
    readonly status: 'solvable' | 'unsolvable' | 'unknown' | 'invalid';
    readonly reason: string | null;
    readonly ticks: number | null;
    readonly waits: number | null;
    readonly exploredStates: number;
    /** True when the witness re-verified through `verifyChaserWitness`. */
    readonly replayVerified: boolean;
  };
  readonly itemsAbsent: { readonly pass: true; readonly basis: 'by-construction' };
  readonly postContact: {
    readonly pass: boolean;
    /** True when the check could not run because (a) did not pass. */
    readonly skipped: boolean;
    readonly checkedStates: number;
    readonly failureCount: number;
    /** Checks that hit the per-check state cap: neither passed nor proven failed. */
    readonly unknownCount: number;
    readonly failures: readonly ChaserPostContactFailure[];
  };
  readonly fairness: ChaserFairnessReport | null;
  readonly pass: boolean;
  readonly witness: ChaserWitness | null;
}

export interface ValidateLevelWithChasersOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly levelId?: string | null;
  readonly startHeading?: HazardMoveDirection | null;
  /** Contact-free turns granted after a pushback (default 2). */
  readonly invulnerableTurns?: number;
  /** State cap for the main witness search. */
  readonly stateCap?: number;
  /** State cap for each post-contact / slack check (default 250000). */
  readonly postContactStateCap?: number;
  /** Check every n-th witness state (default 1). */
  readonly postContactStride?: number;
  readonly maxPeriod?: number;
  /** Also compute the fairness report (extra searches). Default false. */
  readonly includeFairness?: boolean;
}

const countRules = (chasers: readonly JunctionGreedyEnemySpec[]) => ({
  chasers: chasers.filter((spec) => spec.rule === 'chaser').length,
  interceptors: chasers.filter((spec) => spec.rule === 'interceptor').length,
  wallFollowers: chasers.filter((spec) => spec.rule === 'wall-follower').length
});

const countKinds = (specs: readonly HazardSpec[], chasers: readonly JunctionGreedyEnemySpec[]) => ({
  blockers: specs.filter((spec) => spec.kind === 'blocker').length,
  timedGates: specs.filter((spec) => spec.kind === 'timedGate').length,
  patrols: specs.filter((spec) => spec.kind === 'patrol').length,
  ...countRules(chasers)
});

/** `restKey -> min k` over the replayed witness states (k = 0). */
const knownFromReplay = (
  space: ChaserSearchSpace,
  witness: ChaserWitness,
  replay: ChaserReplay
): Map<number, number> => {
  const known = new Map<number, number>();
  for (let i = 0; i <= witness.ticks; i += 1) {
    const key = space.encode({
      cell: witness.cells[i]!,
      heading: replay.playerHeadings[i]!,
      tick: witness.startTick + i,
      invulnerable: 0,
      enemies: replay.enemyStates[i]!
    });
    known.set(space.restKey(key), 0);
  }
  return known;
};

const rememberPath = (space: ChaserSearchSpace, known: Map<number, number>, path: readonly number[]): void => {
  for (const key of path) {
    const rest = space.restKey(key);
    const k = space.invulnerabilityOf(key);
    const existing = known.get(rest);
    if (existing === undefined || k < existing) {
      known.set(rest, k);
    }
  }
};

export const validateLevelWithChasers = (
  input: HazardGraphInput | HazardGraph,
  specs: readonly HazardSpec[],
  chaserSpecs: readonly JunctionGreedyEnemySpec[],
  options: ValidateLevelWithChasersOptions
): ChaserLevelVerdict => {
  const graph = 'contract' in input ? input : createHazardGraph(input);
  const invulnerableTurns = options.invulnerableTurns ?? DEFAULT_INVULNERABLE_TURNS;
  if (!Number.isInteger(invulnerableTurns) || invulnerableTurns < 0) {
    throw new RangeError('invulnerableTurns must be a non-negative integer');
  }
  const stride = options.postContactStride ?? 1;
  if (!Number.isInteger(stride) || stride < 1) {
    throw new RangeError('postContactStride must be a positive integer');
  }
  const postContactCap = options.postContactStateCap ?? DEFAULT_POST_CONTACT_STATE_CAP;
  const base = {
    contract: CHASER_VERDICT_CONTRACT,
    levelId: options.levelId ?? null,
    width: graph.width,
    height: graph.height,
    start: options.start,
    goal: options.goal,
    hazards: countKinds(specs, chaserSpecs),
    invulnerableTurns,
    itemsAbsent: { pass: true, basis: 'by-construction' } as const
  };
  const skippedPostContact = {
    pass: false, skipped: true, checkedStates: 0, failureCount: 0, unknownCount: 0,
    failures: [] as ChaserPostContactFailure[]
  };
  const failed = (
    period: number | null,
    specError: ChaserLevelVerdict['specError'],
    hazardsPresent: ChaserLevelVerdict['hazardsPresent']
  ): ChaserLevelVerdict => ({
    ...base, period, specError, hazardsPresent, postContact: skippedPostContact, fairness: null, pass: false, witness: null
  });
  const notRun = { pass: false, ticks: null, waits: null, exploredStates: 0, replayVerified: false } as const;

  let timeline: HazardTimeline;
  try {
    timeline = createHazardTimeline(graph, specs, { maxPeriod: options.maxPeriod });
  } catch (error) {
    if (!(error instanceof HazardSpecError)) {
      throw error;
    }
    return failed(
      null,
      { code: error.code, index: error.index, message: error.message },
      { ...notRun, status: 'invalid', reason: `invalid-spec:${error.code}` }
    );
  }

  let enemies: JunctionGreedyEnemyState[];
  try {
    enemies = chaserSpecs.map((spec) => createJunctionGreedyEnemy(spec, graph));
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    return failed(
      timeline.period,
      { code: 'invalid-chaser', index: null, message: error.message },
      { ...notRun, status: 'invalid', reason: 'invalid-spec:invalid-chaser' }
    );
  }

  const result = findWitnessRouteWithChasers(graph, timeline, enemies, {
    start: options.start,
    goal: options.goal,
    startHeading: options.startHeading ?? null,
    stateCap: options.stateCap,
    maxCombinedPeriod: options.maxPeriod
  });
  if (result.status !== 'solvable') {
    return failed(timeline.period, null, {
      ...notRun,
      status: result.status,
      reason: result.reason,
      exploredStates: result.exploredStates
    });
  }

  const witness = result.witness;
  const verified = verifyChaserWitness(graph, timeline, enemies, witness).valid;
  const replay = replayChaserActions(graph, timeline, enemies, {
    start: witness.start,
    startTick: witness.startTick,
    startHeading: witness.startHeading,
    actions: witness.actions
  });
  const hazardsPresent = {
    pass: verified,
    status: 'solvable' as const,
    reason: verified ? null : 'witness-replay-failed',
    ticks: witness.ticks,
    waits: witness.waits,
    exploredStates: result.exploredStates,
    replayVerified: verified
  };
  if (!verified) {
    return { ...base, period: timeline.period, specError: null, hazardsPresent, postContact: skippedPostContact, fairness: null, pass: false, witness };
  }

  const space = createChaserSearchSpace(graph, timeline, enemies.map((enemy) => enemy.spec), {
    maxInvulnerableTurns: invulnerableTurns,
    maxCombinedPeriod: options.maxPeriod
  });
  const known = knownFromReplay(space, witness, replay);
  const failures: ChaserPostContactFailure[] = [];
  let failureCount = 0;
  let unknownCount = 0;
  let checkedStates = 0;
  for (let index = 1; index < witness.ticks; index += stride) {
    checkedStates += 1;
    const contactCell = witness.cells[index]!;
    const pushbackCell = resolvePushbackCell(graph, witness.cells, index);
    const tick = witness.startTick + index;
    const point: ChaserSearchPoint = {
      cell: pushbackCell,
      heading: replay.playerHeadings[index]!,
      tick,
      invulnerable: invulnerableTurns,
      enemies: replay.enemyStates[index]!
    };
    let reason: ChaserPostContactFailureReason | null = null;
    const problem = space.entryProblem(point);
    if (problem === 'blocked') {
      reason = 'pushback-cell-blocked';
    } else if (problem === 'contact') {
      reason = 'pushback-cell-contact';
    } else {
      const outcome = space.search(space.encode(point), options.goal, {
        stateCap: postContactCap,
        knownSolvable: known
      });
      if (outcome.status === 'goal' || outcome.status === 'known') {
        rememberPath(space, known, outcome.path);
      } else if (outcome.status === 'capped') {
        reason = 'state-cap-exceeded';
      } else {
        reason = 'no-route-after-contact';
      }
    }
    if (reason !== null) {
      if (reason === 'state-cap-exceeded') {
        unknownCount += 1;
      } else {
        failureCount += 1;
      }
      if (failures.length < MAX_REPORTED_FAILURES) {
        failures.push({ witnessIndex: index, contactCell, pushbackCell, tick, reason });
      }
    }
  }
  const postContactPass = failureCount === 0 && unknownCount === 0;
  const fairness = options.includeFairness === true
    ? analyzeChaserFairness(graph, timeline, enemies, witness, { stateCap: postContactCap, stride })
    : null;
  return {
    ...base,
    period: timeline.period,
    specError: null,
    hazardsPresent,
    postContact: { pass: postContactPass, skipped: false, checkedStates, failureCount, unknownCount, failures },
    fairness,
    pass: postContactPass,
    witness
  };
};

/** Canonical JSON for a chaser verdict (sorted keys, no trailing newline). */
export const serializeChaserVerdict = (verdict: ChaserLevelVerdict): string => stableStringify(verdict);

/** Canonical JSON for a chaser witness. */
export const serializeChaserWitness = (witness: ChaserWitness): string => stableStringify(witness);

// ---------------------------------------------------------------------------
// Fairness analytics
// ---------------------------------------------------------------------------

export interface ChaserEnemyFairness {
  readonly index: number;
  readonly rule: JunctionGreedyEnemyState['spec']['rule'];
  readonly speedDivisor: number;
  /** Witness states at which the enemy is on the board. */
  readonly presentStates: number;
  /** Smallest static-graph distance (cells) between player and enemy on the witness; null if never present. */
  readonly minDistanceSteps: number | null;
  /** `minDistanceSteps * speedDivisor`: the enemy's approximate time-to-reach in world turns. */
  readonly minDistanceTurns: number | null;
  readonly atWitnessIndex: number | null;
  readonly meanDistanceSteps: number | null;
}

export interface ChaserEscapeSlack {
  /** Witness states tested: "if the player hesitated (WAIT) here, is the level still solvable?" */
  readonly tested: number;
  readonly survivable: number;
  /** WAIT illegal, or the post-wait state cannot reach the goal. */
  readonly unsurvivable: number;
  /** Checks that hit the state cap. */
  readonly unknown: number;
  /** `survivable / (tested - unknown)`; null when nothing was decided. */
  readonly ratio: number | null;
  readonly firstFragileIndex: number | null;
}

export interface ChaserFairnessReport {
  readonly contract: typeof CHASER_FAIRNESS_CONTRACT;
  readonly ticks: number;
  readonly waits: number;
  readonly enemies: readonly ChaserEnemyFairness[];
  /** Minimum across all enemies; null when no enemy was ever present. */
  readonly minDistanceSteps: number | null;
  readonly minDistanceTurns: number | null;
  readonly escapeSlack: ChaserEscapeSlack;
}

export interface AnalyzeChaserFairnessOptions {
  /** Per-check state cap (default 250000). */
  readonly stateCap?: number;
  /** Test every n-th witness state for escape slack (default 1). */
  readonly stride?: number;
}

/**
 * Fairness metrics for a witness. Definitions (DRAFT):
 *   - distance: static shortest-path length between the player and each present
 *     enemy at every witness state, with static blockers as walls. Not the
 *     enemy's real catch time (it cannot reverse), but a stable proxy that is
 *     scaled to turns by the enemy's speed divisor.
 *   - waits: WAIT actions in the witness.
 *   - escape slack: over witness states, the share from which a one-turn
 *     hesitation (forced WAIT) still leaves a contact-free route to the goal.
 *     1.0 = forgiving, near 0 = every step must be perfect.
 */
export const analyzeChaserFairness = (
  graph: HazardGraph,
  timeline: HazardTimeline,
  enemies: readonly JunctionGreedyEnemyState[],
  witness: ChaserWitness,
  options: AnalyzeChaserFairnessOptions = {}
): ChaserFairnessReport => {
  if (witness.invulnerableTurns !== 0) {
    throw new RangeError('fairness analysis expects a witness with invulnerableTurns = 0');
  }
  const stride = options.stride ?? 1;
  if (!Number.isInteger(stride) || stride < 1) {
    throw new RangeError('stride must be a positive integer');
  }
  const stateCap = options.stateCap ?? DEFAULT_POST_CONTACT_STATE_CAP;
  const replay = replayChaserActions(graph, timeline, enemies, {
    start: witness.start,
    startTick: witness.startTick,
    startHeading: witness.startHeading,
    actions: witness.actions
  });
  if (!replay.ok) {
    throw new RangeError(`witness does not replay: ${replay.reason ?? 'unknown'}`);
  }

  const blockers = new Set<number>((timeline as { blockerCells?: readonly number[] }).blockerCells ?? []);
  const distanceCache = new Map<number, Int32Array>();
  const distancesFrom = (source: number): Int32Array => {
    const cached = distanceCache.get(source);
    if (cached) {
      return cached;
    }
    const distance = new Int32Array(graph.cellCount).fill(-1);
    const queue = new Int32Array(graph.cellCount);
    let head = 0;
    let tail = 0;
    distance[source] = 0;
    queue[tail++] = source;
    while (head < tail) {
      const current = queue[head++]!;
      for (const next of graph.neighbors(current)) {
        if (distance[next] === -1 && !blockers.has(next)) {
          distance[next] = distance[current]! + 1;
          queue[tail++] = next;
        }
      }
    }
    distanceCache.set(source, distance);
    return distance;
  };

  const perEnemy: ChaserEnemyFairness[] = enemies.map((enemy, e) => {
    let present = 0;
    let min: number | null = null;
    let minAt: number | null = null;
    let sum = 0;
    for (let i = 0; i <= witness.ticks; i += 1) {
      const enemyCell = replay.enemyStates[i]![e]!.cell;
      if (enemyCell < 0) {
        continue;
      }
      const distance = distancesFrom(witness.cells[i]!)[enemyCell]!;
      if (distance < 0) {
        continue;
      }
      present += 1;
      sum += distance;
      if (min === null || distance < min) {
        min = distance;
        minAt = i;
      }
    }
    return {
      index: e,
      rule: enemy.spec.rule,
      speedDivisor: enemy.spec.speedDivisor,
      presentStates: present,
      minDistanceSteps: min,
      minDistanceTurns: min === null ? null : min * enemy.spec.speedDivisor,
      atWitnessIndex: minAt,
      meanDistanceSteps: present === 0 ? null : Math.round((sum / present) * 1000) / 1000
    };
  });
  const overallSteps = perEnemy.reduce<number | null>(
    (best, item) => (item.minDistanceSteps === null ? best : best === null ? item.minDistanceSteps : Math.min(best, item.minDistanceSteps)),
    null
  );
  const overallTurns = perEnemy.reduce<number | null>(
    (best, item) => (item.minDistanceTurns === null ? best : best === null ? item.minDistanceTurns : Math.min(best, item.minDistanceTurns)),
    null
  );

  const space = createChaserSearchSpace(graph, timeline, enemies.map((enemy) => enemy.spec));
  const known = knownFromReplay(space, witness, replay);
  let tested = 0;
  let survivable = 0;
  let unsurvivable = 0;
  let unknown = 0;
  let firstFragile: number | null = null;
  for (let index = 0; index < witness.ticks; index += stride) {
    tested += 1;
    const here = space.encode({
      cell: witness.cells[index]!,
      heading: replay.playerHeadings[index]!,
      tick: witness.startTick + index,
      invulnerable: 0,
      enemies: replay.enemyStates[index]!
    });
    const after = space.step(here, 'wait');
    let survived = false;
    if (after >= 0) {
      const outcome = space.search(after, witness.goal, { stateCap, knownSolvable: known });
      if (outcome.status === 'goal' || outcome.status === 'known') {
        rememberPath(space, known, outcome.path);
        survived = true;
      } else if (outcome.status === 'capped') {
        unknown += 1;
        continue;
      }
    }
    if (survived) {
      survivable += 1;
    } else {
      unsurvivable += 1;
      if (firstFragile === null) {
        firstFragile = index;
      }
    }
  }
  const decided = tested - unknown;
  return {
    contract: CHASER_FAIRNESS_CONTRACT,
    ticks: witness.ticks,
    waits: witness.waits,
    enemies: perEnemy,
    minDistanceSteps: overallSteps,
    minDistanceTurns: overallTurns,
    escapeSlack: {
      tested,
      survivable,
      unsurvivable,
      unknown,
      ratio: decided === 0 ? null : Math.round((survivable / decided) * 10000) / 10000,
      firstFragileIndex: firstFragile
    }
  };
};
