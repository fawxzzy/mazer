/**
 * Shards (slice H8): the forever difficulty axis past geometry saturation
 * (product contract 2.6, manifest `forever`). Pure: no scene, no randomness
 * outside the seeded stream, no clock. Not wired: nothing outside tests and
 * analysis scripts calls this module yet, so flag-off play and the golden
 * geometry corpus are untouched.
 *
 * Pieces:
 * - `resolveShardRoutePlan`: how many shards a level gets (the allocator's
 *   `shards`) and the route-target band. From saturation on the target is
 *   strict: a shard DETOUR of `SHARD_ROUTE_BASE + SHARD_ROUTE_STEP * (level - saturation)`
 *   ticks on top of the maze's own static start -> star distance `d`, band
 *   `[d + target, d + target + SHARD_ROUTE_BAND]`. STEP 2 / BAND 1 keeps every
 *   realized detour strictly above the previous level's (`R + 2 > R + 1`)
 *   even though a plain grid fixes the parity of a static tour. From saturation
 *   on a play seed builds the same maze at every level (same `d`), so on one
 *   seed the realized route itself rises strictly too.
 *   Why anchored (2026-11-27): the band used to be absolute (`[target, target + 1]`),
 *   calibrated on the ~23x51 ladder boards. On the shipped rule-2 play board
 *   (about 59x131 phone, 117x65 desktop) `d` alone is 430-600 ticks, so every
 *   level until the absolute target passed `d` failed with
 *   `route-too-long-for-target` and shipped without shards.
 * - `placeShards`: deterministic shard cells whose static tour
 *   start -> shard 1 -> ... -> shard k -> star lands in a band.
 * - `computeShardLayer`: placement + the shard verdict + the phone forgiveness
 *   gate, retried on the seeded stream; `failed` tells the caller to try the
 *   next base (the contract's reject-and-try-next-base loop).
 * - `advanceShardProgress` / `isStarUnlocked`: the locked-star rule for play.
 */

import {
  HazardSpecError,
  createHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec,
  type HazardTimeline
} from './graphContract';
import { resolveHazardSeed } from './overlay';
import { mix32 } from './placement';
import { HAZARD_FAIRNESS, allocateHazardUnits } from './schedule';
import { stableStringify } from './serialization';
import {
  measureFinalShardTicks,
  reachableWithout,
  resolveShardProgressAfter,
  sentryRouteCells,
  validateShardRoute,
  type ShardEscapeSlack,
  type ShardRouteVerdict
} from './shardSolvability';

export const SHARD_LAYER_CONTRACT = 'mazer-shard-layer-v1' as const;
/** Seed stream tag ("SHRD") mixed into the level's hazard seed. */
export const SHARD_SEED_STREAM = 0x53485244;
/** Shard detour target at the saturation level: witness ticks beyond the maze's static start -> star distance. */
export const SHARD_ROUTE_BASE = 160;
/** Ticks added per level from saturation on (manifest `forever.minRiseTicksPerLevel` is 1; 2 survives grid parity). */
export const SHARD_ROUTE_STEP = 2;
/** Accepted overshoot above the target. Must stay below SHARD_ROUTE_STEP so consecutive bands never overlap. */
export const SHARD_ROUTE_BAND = 1;
/** Placement + verdict attempts per base before `failed`. */
export const SHARD_LAYER_ATTEMPTS = 12;
/** Near-best candidates the seeded pick chooses among for a non-final shard. */
const SHARD_PICK_POOL = 6;

/** The locked-star rule: progress after the player arrives on `cell`. Shards count only in order. */
export const advanceShardProgress = resolveShardProgressAfter;

/** The star (goal) finishes the level only once every shard is collected. */
export const isStarUnlocked = (next: number, shardCount: number): boolean => next >= shardCount;

export interface ShardRoutePlan {
  readonly level: number;
  readonly saturationLevel: number;
  /** Shards on this level (equals `allocateHazardUnits(level).shards`). */
  readonly count: number;
  /** True from saturation on: the band is the strict per-level route target. */
  readonly strict: boolean;
  /** Strict shard detour target in witness ticks (on top of the maze's start -> star distance), or null before saturation. */
  readonly target: number | null;
}

/** Strict shard detour target for a level (ticks beyond the maze's start -> star distance), or null before saturation. */
export const resolveShardRouteTarget = (level: number, saturationLevel: number): number | null => (
  level < saturationLevel ? null : SHARD_ROUTE_BASE + SHARD_ROUTE_STEP * (level - saturationLevel)
);

export const resolveShardRoutePlan = (
  level: number,
  options: { readonly saturationLevel: number; readonly exposureStage?: number }
): ShardRoutePlan => {
  const allocation = allocateHazardUnits(level, options);
  const target = allocation.shards > 0 ? resolveShardRouteTarget(level, options.saturationLevel) : null;
  return { level, saturationLevel: options.saturationLevel, count: allocation.shards, strict: target !== null, target };
};

/**
 * Band for the route in ticks, anchored at `d`, the maze's static start -> star distance.
 * Strict levels: `[d + target, d + target + SHARD_ROUTE_BAND]`: the shard detour is the
 * per-level rung, so the band is reachable whatever the board size.
 * Before saturation the single shard is a modest detour: `[d + 2, d + max(4, ceil(d / 2))]`
 * (a preference, not a ladder rung).
 */
export const resolveShardRouteBand = (
  plan: ShardRoutePlan,
  startGoalDistance: number
): { readonly min: number; readonly max: number } => (
  plan.target !== null
    ? { min: startGoalDistance + plan.target, max: startGoalDistance + plan.target + SHARD_ROUTE_BAND }
    : { min: startGoalDistance + 2, max: startGoalDistance + Math.max(4, Math.ceil(startGoalDistance / 2)) }
);

/** Static BFS distances on the floor (no hazards). -1 = unreachable. */
export const shardFloorDistances = (graph: HazardGraph, from: HazardCellId): Int32Array => {
  const distance = new Int32Array(graph.cellCount).fill(-1);
  const queue = new Int32Array(graph.cellCount);
  let head = 0;
  let tail = 0;
  distance[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const cell = queue[head++]!;
    for (const next of graph.neighbors(cell)) {
      if (distance[next] === -1) {
        distance[next] = distance[cell]! + 1;
        queue[tail++] = next;
      }
    }
  }
  return distance;
};

/** Static tour length start -> shards... -> goal, or -1 when a leg is unreachable. */
export const measureShardTour = (
  graph: HazardGraph,
  start: HazardCellId,
  goal: HazardCellId,
  shards: readonly HazardCellId[]
): number => {
  let total = 0;
  let from = start;
  for (const to of [...shards, goal]) {
    const leg = shardFloorDistances(graph, from)[to]!;
    if (leg < 0) return -1;
    total += leg;
    from = to;
  }
  return total;
};

/**
 * Cells a shard may occupy: walkable, not start or goal, not a gate cell, not on
 * a Sentry route, and reachable from the start without crossing any Sentry
 * route. With the goal also reachable that way, no leg ever has to cross a
 * Sentry rail (A6 extended to shard legs), so a shard is never parked behind a
 * mandatory enemy. Gates are allowed on legs: waiting gets you through.
 */
export const resolveShardEligibleCells = (
  graph: HazardGraph,
  specs: readonly HazardSpec[],
  start: HazardCellId,
  goal: HazardCellId
): HazardCellId[] => {
  const sentry = sentryRouteCells(specs);
  const occupied = new Set<HazardCellId>(sentry);
  for (const spec of specs) {
    if (spec.kind !== 'patrol') occupied.add(spec.cell);
  }
  const free = reachableWithout(graph, start, sentry);
  if (free[goal] !== 1) return [];
  const cells: HazardCellId[] = [];
  for (let cell = 0; cell < graph.cellCount; cell += 1) {
    if (cell !== start && cell !== goal && graph.isWalkable(cell) && !occupied.has(cell) && free[cell] === 1) cells.push(cell);
  }
  return cells;
};

export type ShardPlacementFailure = 'no-eligible-cells' | 'too-few-cells' | 'route-too-long-for-target' | 'band-missed';

export type ShardPlacementResult =
  | {
    readonly placed: true;
    readonly shards: readonly HazardCellId[];
    /** Static tour (no waits). */
    readonly tour: number;
    /** Route length the band was checked against: `finalTicks` when given, else the static tour. */
    readonly route: number;
    /** False only for a non-strict placement that took the closest route outside the band. */
    readonly inBand: boolean;
  }
  | { readonly placed: false; readonly reason: ShardPlacementFailure; readonly closestRoute: number | null };

export interface PlaceShardsOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly count: number;
  /** Route band (ticks), inclusive. */
  readonly min: number;
  readonly max: number;
  readonly seed: number;
  /** Hazards already on the level (gates, Sentries); shards avoid them. */
  readonly specs?: readonly HazardSpec[];
  /**
   * Route ticks for every possible LAST shard given the earlier ones (index = cell,
   * -1 = unreachable), e.g. `measureFinalShardTicks` with hazards. Omitted = static tour.
   */
  readonly finalTicks?: (prefix: readonly HazardCellId[]) => Int32Array;
  /** Ticks the earlier legs are expected to lose to waits; the prefix aims this much shorter. Default 0. */
  readonly expectedWaits?: number;
  /** Strict (default): no cell in the band fails. Non-strict: take the closest route instead. */
  readonly strict?: boolean;
}

/**
 * Greedy seeded placement. Earlier shards: leg j aims at `remaining / remainingLegs`
 * steps from the previous shard and the seeded pick chooses among the
 * `SHARD_PICK_POOL` best-scoring cells. The last shard is chosen (seeded) among
 * the cells whose route closes inside the band. Because shards count only in
 * order, the route through a last shard x is exactly "earliest states on x with
 * the earlier shards collected" plus "fastest x -> star", so `finalTicks` is exact.
 */
export const placeShards = (graph: HazardGraph, options: PlaceShardsOptions): ShardPlacementResult => {
  const { start, goal, count, min, max, seed } = options;
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new RangeError('band must be integers with min <= max');
  const eligible = resolveShardEligibleCells(graph, options.specs ?? [], start, goal);
  if (eligible.length === 0) return { placed: false, reason: 'no-eligible-cells', closestRoute: null };
  if (eligible.length < count) return { placed: false, reason: 'too-few-cells', closestRoute: null };
  const toGoal = shardFloorDistances(graph, goal);
  const used = new Set<HazardCellId>();
  const shards: HazardCellId[] = [];
  const aimMin = min - Math.max(0, options.expectedWaits ?? 0);
  let from = start;
  let spent = 0;
  for (let j = 0; j < count - 1; j += 1) {
    const fromDistance = shardFloorDistances(graph, from);
    const remainingLegs = count - j + 1;
    const aim = (aimMin - spent) / remainingLegs;
    const scored = eligible
      .filter((cell) => !used.has(cell))
      .map((cell) => {
        const leg = fromDistance[cell]!;
        // The rest (more shards, then the star) needs at least toGoal steps.
        const overshoot = Math.max(0, spent + leg + toGoal[cell]! - max);
        return { cell, score: Math.abs(leg - aim) + 4 * overshoot };
      })
      .sort((x, y) => x.score - y.score || x.cell - y.cell);
    const pool = scored.slice(0, Math.min(SHARD_PICK_POOL, scored.length));
    const pick = pool[mix32(seed, j) % pool.length]!;
    shards.push(pick.cell);
    used.add(pick.cell);
    spent += fromDistance[pick.cell]!;
    from = pick.cell;
  }
  const fromDistance = shardFloorDistances(graph, from);
  const routes = options.finalTicks?.(shards) ?? null;
  const routeOf = (cell: HazardCellId): number => (routes === null ? spent + fromDistance[cell]! + toGoal[cell]! : routes[cell]!);
  const free = eligible.filter((cell) => !used.has(cell) && routeOf(cell) >= 0);
  const closing = free.filter((cell) => routeOf(cell) >= min && routeOf(cell) <= max);
  const finish = (cell: HazardCellId, inBand: boolean): ShardPlacementResult => {
    shards.push(cell);
    return { placed: true, shards, tour: spent + fromDistance[cell]! + toGoal[cell]!, route: routeOf(cell), inBand };
  };
  if (closing.length > 0) return finish(closing[mix32(seed, count - 1) % closing.length]!, true);
  let closest: HazardCellId | null = null;
  let closestGap = Number.POSITIVE_INFINITY;
  for (const cell of free) {
    const route = routeOf(cell);
    const gap = route < min ? min - route : route - max;
    if (gap < closestGap) {
      closestGap = gap;
      closest = cell;
    }
  }
  if (closest === null) return { placed: false, reason: 'band-missed', closestRoute: null };
  if (options.strict === false) return finish(closest, false);
  return {
    placed: false,
    reason: routeOf(closest) > max ? 'route-too-long-for-target' : 'band-missed',
    closestRoute: routeOf(closest)
  };
};

export type ShardLayerStatus =
  /** No shard on this level (before the Shard intro). */
  | 'none'
  /**
   * Shards placed; the verdict and the forgiveness gate passed. Strict levels landed in the band unless the
   * caller asked for `onStrictMiss: 'nearest'` and no attempt hit it (`inBand` false).
   */
  | 'placed'
  /** No attempt passed: try the next base (strict levels) or ship without shards (before saturation). */
  | 'failed';

export type ShardLayerReasonCode =
  | ShardPlacementFailure
  | 'verdict-failed'
  | 'sentry-on-leg'
  | 'escape-slack-low'
  | 'fragile-early-step'
  | 'witness-outside-band';

export interface ShardLayerResult {
  readonly contract: typeof SHARD_LAYER_CONTRACT;
  readonly level: number;
  readonly status: ShardLayerStatus;
  readonly plan: ShardRoutePlan;
  readonly seed: number;
  /** Witness-tick band the route had to land in. */
  readonly band: { readonly min: number; readonly max: number } | null;
  readonly shards: readonly HazardCellId[];
  /** Static tour of the shipped shards (no waits). */
  readonly tour: number | null;
  /** Witness ticks of the shipped route (the felt route target). */
  readonly routeTicks: number | null;
  /** True when the shipped witness ticks lie inside `band`; false when nothing shipped or a nearest-route fallback shipped. */
  readonly inBand: boolean;
  readonly verdict: ShardRouteVerdict | null;
  readonly escapeSlack: ShardEscapeSlack | null;
  readonly attempts: number;
  /** Why each rejected attempt failed, in order. */
  readonly rejections: readonly ShardLayerReasonCode[];
  /** FNV-1a of the canonical (level, seed, shards) record; '' when nothing ships. */
  readonly digest: string;
}

export interface ComputeShardLayerOptions {
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly mazeSeed: number;
  readonly level: number;
  readonly saturationLevel: number;
  readonly exposureStage?: number;
  /** The H2 overlay's shipped specs (gates, Sentries). */
  readonly specs: readonly HazardSpec[];
  readonly maxProductStates?: number;
  /**
   * What a strict level does when no attempt lands in the band. `'fail'` (default): status `failed`, the
   * caller's cue to reject the base and try the next one (the contract loop the runway uses). `'nearest'`:
   * for a caller with only this base (play), the same attempts run, and when none lands in the band the
   * attempt whose route closed nearest it ships (ties: earliest), still behind the full verdict and
   * forgiveness gate (`inBand` false). No second pass: a miss costs what a `'fail'` miss costs plus its verdicts.
   */
  readonly onStrictMiss?: 'fail' | 'nearest';
}

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const computeShardDigest = (record: { readonly level: number; readonly seed: number; readonly shards: readonly HazardCellId[] }): string => (
  fnv1a(stableStringify({ contract: SHARD_LAYER_CONTRACT, level: record.level, seed: record.seed, shards: record.shards }))
);

/** Seed of the shard stream for a level (derived from the maze seed, separate from the hazard stream). */
export const resolveShardSeed = (mazeSeed: number, level: number): number => mix32(resolveHazardSeed(mazeSeed, level), SHARD_SEED_STREAM);

/**
 * Placement + verdict + forgiveness gate for one base maze. On strict levels the
 * witness ticks (waits included) must land in the band; when a witness
 * carries `w` waits, the next attempt aims the static tour `w` lower. Before
 * saturation the band only steers placement. A strict miss is `failed` unless
 * `onStrictMiss: 'nearest'` (see the option).
 */
export const computeShardLayer = (graph: HazardGraph, options: ComputeShardLayerOptions): ShardLayerResult => {
  const { start, goal, level, specs } = options;
  if (!Number.isInteger(options.mazeSeed)) throw new RangeError('mazeSeed must be an integer');
  const plan = resolveShardRoutePlan(level, { saturationLevel: options.saturationLevel, exposureStage: options.exposureStage });
  const seed = resolveShardSeed(options.mazeSeed, level);
  const empty = {
    contract: SHARD_LAYER_CONTRACT,
    level,
    plan,
    seed,
    shards: [] as HazardCellId[],
    tour: null,
    routeTicks: null,
    inBand: false,
    verdict: null,
    escapeSlack: null,
    digest: ''
  };
  if (plan.count === 0) {
    return { ...empty, status: 'none', band: null, attempts: 0, rejections: [] };
  }
  const band = resolveShardRouteBand(plan, shardFloorDistances(graph, start)[goal]!);
  const rejections: ShardLayerReasonCode[] = [];
  let timeline: HazardTimeline;
  try {
    timeline = createHazardTimeline(graph, specs);
  } catch (error) {
    if (!(error instanceof HazardSpecError)) throw error;
    return { ...empty, status: 'failed', band, attempts: 1, rejections: ['verdict-failed'] };
  }
  const finalTicks = (prefix: readonly HazardCellId[]): Int32Array => (
    measureFinalShardTicks(graph, timeline, { start, goal, prefix, maxProductStates: options.maxProductStates })
  );
  /** Verdict + forgiveness gate for one placement: the shipped result, or the reason it was rejected. */
  const verify = (shards: readonly HazardCellId[], tour: number, requireBand: boolean): ShardLayerResult | ShardLayerReasonCode => {
    const verdict = validateShardRoute(graph, specs, { start, goal, shards, maxProductStates: options.maxProductStates });
    if (!verdict.pass || verdict.witness === null) {
      return verdict.hazardsPresent.pass && !verdict.sentryFreeLegs ? 'sentry-on-leg' : 'verdict-failed';
    }
    const ticks = verdict.witness.ticks;
    const inBand = ticks >= band.min && ticks <= band.max;
    // Cannot happen when finalTicks is exact; kept as the guard the ladder relies on.
    if (requireBand && !inBand) return 'witness-outside-band';
    const slack = verdict.escapeSlack;
    if (slack === null || slack.ratio === null || slack.ratio < HAZARD_FAIRNESS.escapeSlackRatioMin) return 'escape-slack-low';
    if (slack.firstFragileIndex !== null && slack.firstFragileIndex < HAZARD_FAIRNESS.noFragileStepInFirstWitnessSteps) {
      return 'fragile-early-step';
    }
    return {
      ...empty,
      status: 'placed',
      band,
      shards,
      tour,
      routeTicks: ticks,
      inBand,
      verdict,
      escapeSlack: slack,
      attempts: rejections.length + 1,
      rejections: [...rejections],
      digest: computeShardDigest({ level, seed, shards })
    };
  };
  // One shard: the prefix is empty, so every attempt sees the same candidates.
  const attempts = plan.count === 1 ? 1 : SHARD_LAYER_ATTEMPTS;
  // 'nearest': placement closes every attempt on its nearest cell (strict false) and an out-of-band close is
  // rejected here with the same code a strict placement would give, so the in-band search is unchanged and
  // costs no second pass; the misses wait as fallback candidates.
  const keepNearest = plan.strict && options.onStrictMiss === 'nearest';
  const candidates: { readonly shards: readonly HazardCellId[]; readonly tour: number; readonly gap: number; readonly attempt: number }[] = [];
  let expectedWaits = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const placement = placeShards(graph, {
      start,
      goal,
      count: plan.count,
      min: band.min,
      max: band.max,
      seed: mix32(seed, attempt),
      specs,
      finalTicks,
      expectedWaits,
      strict: plan.strict && !keepNearest
    });
    if (!placement.placed) {
      rejections.push(placement.reason);
      if (placement.reason === 'no-eligible-cells' || placement.reason === 'too-few-cells') break;
      // Waits the prefix lost on this attempt; aim the next prefix that much shorter.
      if (placement.reason === 'route-too-long-for-target' && placement.closestRoute !== null) {
        expectedWaits += Math.max(1, placement.closestRoute - band.max);
      }
      continue;
    }
    if (keepNearest && !placement.inBand) {
      const tooLong = placement.route > band.max;
      rejections.push(tooLong ? 'route-too-long-for-target' : 'band-missed');
      if (tooLong) expectedWaits += Math.max(1, placement.route - band.max);
      const gap = tooLong ? placement.route - band.max : band.min - placement.route;
      candidates.push({ shards: placement.shards, tour: placement.tour, gap, attempt });
      continue;
    }
    const result = verify(placement.shards, placement.tour, plan.strict);
    if (typeof result !== 'string') return result;
    rejections.push(result);
  }
  // No attempt hit the band: ship the verified candidate nearest it (ties: earliest attempt).
  candidates.sort((x, y) => x.gap - y.gap || x.attempt - y.attempt);
  for (const candidate of candidates) {
    const result = verify(candidate.shards, candidate.tour, false);
    if (typeof result !== 'string') return result;
    rejections.push(result);
  }
  return { ...empty, status: 'failed', band, attempts: rejections.length, rejections };
};
