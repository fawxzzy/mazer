/**
 * Hazard allocator on the signed schedule manifest v1 (slice H2). Pure: no
 * scene, no geometry, no randomness, no clock.
 *
 * Source of truth: docs/contracts/mazer-hazard-schedule.v1.json and
 * docs/architecture/MAZER-HAZARD-PRODUCT-CONTRACT.md section 2.5. A test pins
 * every constant below to the manifest, so the two cannot drift.
 *
 * `allocateHazardUnits(level)` answers how many units of each kind a level asks
 * for, before any maze is seen:
 *   - levels 1..9 carry nothing;
 *   - the intro schedule adds one kind at its level, alone and in its
 *     first-encounter shape: Pulse Gate 10, Sentry 20, Hunter 35, Shard 60;
 *   - the tail adds exactly one unit at levels 36, 51, 66, ... up to the geometry
 *     saturation level, picked by the convex-price tape of `loadout.ts` with the
 *     static blocker removed and the readability caps applied;
 *   - past saturation the allocation is frozen (the Shard route target is the
 *     forever axis, slice H8).
 * Hazards only ever add: the allocation for level L + 1 contains the one for L.
 *
 * Exposure (contract 2.5): a player whose local `exposureStage` is below the
 * schedule meets the next skipped kind in its first-encounter shape, one kind per
 * level. A missing stage means a new player, whose stage equals the schedule.
 */

import { MAX_GATE_TIER, MAX_PATROL_TIER } from './loadout';

export const HAZARD_SCHEDULE_MANIFEST_ID = 'mazer-hazard-schedule' as const;
export const HAZARD_SCHEDULE_VERSION = 1;

export type HazardUnitKind = 'pulseGate' | 'sentry' | 'hunter' | 'shard';

/** Signed intro schedule, in order. The index of an entry is its exposure stage. */
export const HAZARD_INTRO_SCHEDULE: readonly { readonly level: number; readonly unit: HazardUnitKind }[] = [
  { level: 10, unit: 'pulseGate' },
  { level: 20, unit: 'sentry' },
  { level: 35, unit: 'hunter' },
  { level: 60, unit: 'shard' }
];

export const HAZARD_SCHEDULE_FIRST_LEVEL = HAZARD_INTRO_SCHEDULE[0]!.level;

export const HAZARD_TAIL = { fromLevel: 36, everyLevels: 15, unitsPerStep: 1 } as const;

/** Readability caps per board (manifest `caps`). Shards follow the tail rule instead of a number. */
export const HAZARD_CAPS = { gates: 6, sentries: 4, hunters: 2, enemiesTotal: 5 } as const;

export const HAZARD_FAIRNESS = {
  escapeSlackRatioMin: 0.9,
  noFragileStepInFirstWitnessSteps: 10
} as const;

export const HAZARD_EXPOSURE_STAGE_MIN = 0;
export const HAZARD_EXPOSURE_STAGE_MAX = HAZARD_INTRO_SCHEDULE.length;

/** Manifest `forever.shardCountGrowsEveryLevels`: one more shard per this many levels past saturation (H8). */
export const HAZARD_SHARD_GROWTH_LEVELS = 50;

/** Hunter speed divisor by tier (manifest: 3 at intro, never below 2). */
export const HUNTER_SPEED_DIVISORS: readonly number[] = [3, 2];
export const MAX_HUNTER_TIER = HUNTER_SPEED_DIVISORS.length - 1;

/**
 * Tail tape prices. Count unit for the k-th hazard of a kind: `base * (1 + k^2)`;
 * tier unit from tier j to j + 1: `base * (1 + j)^2` (the `loadout.ts` shapes).
 * Gate and Sentry bases are the draft's timedGate/patrol bases; the blocker unit
 * is removed (manifest `tail.blockersRemoved`). The Hunter bases are new in H2:
 * dearer than a Sentry because a Hunter is the hardest enemy.
 */
export const HAZARD_TAIL_COUNT_BASE_PRICE = { gates: 4, sentries: 6, hunters: 10 } as const;
export const HAZARD_TAIL_TIER_BASE_PRICE = { gates: 6, sentries: 9, hunters: 12 } as const;

export type HazardTailUnit =
  | 'gate'
  | 'gateTier'
  | 'sentry'
  | 'sentryTier'
  | 'hunter'
  | 'hunterTier'
  /** Nothing left on the menu (every count capped, every tier at its maximum). */
  | 'none';

export interface HazardAllocation {
  readonly manifestId: typeof HAZARD_SCHEDULE_MANIFEST_ID;
  readonly scheduleVersion: number;
  /** The level asked for. */
  readonly level: number;
  /** Kinds the schedule has introduced by this level (0..4). */
  readonly scheduledStage: number;
  /** Effective stage after clamping the player's stage to 0..scheduledStage. */
  readonly exposureStage: number;
  /** Level whose allocation is used: `level`, or the intro level of the kind being introduced. */
  readonly allocationLevel: number;
  /** Kind met for the first time on this level (placed alone, in its first-encounter shape), or null. */
  readonly firstEncounter: HazardUnitKind | null;
  readonly gates: number;
  readonly sentries: number;
  readonly hunters: number;
  readonly shards: number;
  readonly gateTier: number;
  readonly sentryTier: number;
  readonly hunterTier: number;
  readonly hunterSpeedDivisor: number | null;
  /** Tail units bought so far, in order (one per tail step). */
  readonly tailUnits: readonly HazardTailUnit[];
  /** True once the allocation level is at or past the geometry saturation level. */
  readonly saturated: boolean;
}

export interface AllocateHazardUnitsOptions {
  /** Geometry saturation level (the legacy runtime passes GEOMETRY_BUDGET_SATURATION_LEVEL). */
  readonly saturationLevel: number;
  /**
   * The player's local exposure stage. `undefined` = new player (stage equals the
   * schedule). Non-finite values count as 0; others are truncated and clamped.
   */
  readonly exposureStage?: number;
}

export const HAZARD_SCHEDULE_MAX_LEVEL = 1_000_000;

/** Number of intro entries at or below `level`. */
export const resolveScheduledStage = (level: number): number => (
  HAZARD_INTRO_SCHEDULE.filter((entry) => entry.level <= level).length
);

/** The stage actually used: never above the schedule, never below 0. */
export const resolveEffectiveExposureStage = (level: number, exposureStage: number | undefined): number => {
  const scheduled = resolveScheduledStage(level);
  if (exposureStage === undefined) {
    return scheduled;
  }
  if (!Number.isFinite(exposureStage)) {
    return HAZARD_EXPOSURE_STAGE_MIN;
  }
  return Math.max(HAZARD_EXPOSURE_STAGE_MIN, Math.min(scheduled, Math.trunc(exposureStage)));
};

export interface HazardTailState {
  gates: number;
  sentries: number;
  hunters: number;
  gateTier: number;
  sentryTier: number;
  hunterTier: number;
}

const countPrice = (base: number, count: number): number => base * (1 + count * count);
const tierPrice = (base: number, tier: number): number => base * (1 + tier) * (1 + tier);

/** Cheapest next tail unit; ties go to the earlier menu entry. */
export const nextHazardTailUnit = (state: Readonly<HazardTailState>): HazardTailUnit => {
  const enemies = state.sentries + state.hunters;
  const menu: Array<readonly [HazardTailUnit, number]> = [];
  if (state.gates < HAZARD_CAPS.gates) {
    menu.push(['gate', countPrice(HAZARD_TAIL_COUNT_BASE_PRICE.gates, state.gates)]);
  }
  if (state.gates > 0 && state.gateTier < MAX_GATE_TIER) {
    menu.push(['gateTier', tierPrice(HAZARD_TAIL_TIER_BASE_PRICE.gates, state.gateTier)]);
  }
  if (state.sentries < HAZARD_CAPS.sentries && enemies < HAZARD_CAPS.enemiesTotal) {
    menu.push(['sentry', countPrice(HAZARD_TAIL_COUNT_BASE_PRICE.sentries, state.sentries)]);
  }
  if (state.sentries > 0 && state.sentryTier < MAX_PATROL_TIER) {
    menu.push(['sentryTier', tierPrice(HAZARD_TAIL_TIER_BASE_PRICE.sentries, state.sentryTier)]);
  }
  if (state.hunters < HAZARD_CAPS.hunters && enemies < HAZARD_CAPS.enemiesTotal) {
    menu.push(['hunter', countPrice(HAZARD_TAIL_COUNT_BASE_PRICE.hunters, state.hunters)]);
  }
  if (state.hunters > 0 && state.hunterTier < MAX_HUNTER_TIER) {
    menu.push(['hunterTier', tierPrice(HAZARD_TAIL_TIER_BASE_PRICE.hunters, state.hunterTier)]);
  }
  let best: HazardTailUnit = 'none';
  let bestPrice = Number.POSITIVE_INFINITY;
  for (const [unit, price] of menu) {
    if (price < bestPrice) {
      best = unit;
      bestPrice = price;
    }
  }
  return best;
};

const applyTailUnit = (state: HazardTailState, unit: HazardTailUnit): void => {
  switch (unit) {
    case 'gate': state.gates += 1; break;
    case 'gateTier': state.gateTier += 1; break;
    case 'sentry': state.sentries += 1; break;
    case 'sentryTier': state.sentryTier += 1; break;
    case 'hunter': state.hunters += 1; break;
    case 'hunterTier': state.hunterTier += 1; break;
    case 'none': break;
  }
};

const introLevelOf = (unit: HazardUnitKind): number => HAZARD_INTRO_SCHEDULE.find((entry) => entry.unit === unit)!.level;

export const allocateHazardUnits = (level: number, options: AllocateHazardUnitsOptions): HazardAllocation => {
  if (!Number.isInteger(level) || level < 1 || level > HAZARD_SCHEDULE_MAX_LEVEL) {
    throw new RangeError(`level must be an integer in 1..${HAZARD_SCHEDULE_MAX_LEVEL}, received ${String(level)}`);
  }
  const { saturationLevel } = options;
  if (!Number.isInteger(saturationLevel) || saturationLevel < 1) {
    throw new RangeError('saturationLevel must be a positive integer');
  }
  const scheduledStage = resolveScheduledStage(level);
  const exposureStage = resolveEffectiveExposureStage(level, options.exposureStage);
  // A player behind the schedule gets the intro level of the next skipped kind.
  const allocationLevel = exposureStage < scheduledStage ? HAZARD_INTRO_SCHEDULE[exposureStage]!.level : level;

  const state: HazardTailState = { gates: 0, sentries: 0, hunters: 0, gateTier: 0, sentryTier: 0, hunterTier: 0 };
  if (allocationLevel >= introLevelOf('pulseGate')) state.gates = 1;
  if (allocationLevel >= introLevelOf('sentry')) state.sentries = 1;
  if (allocationLevel >= introLevelOf('hunter')) state.hunters = 1;
  const tailUnits: HazardTailUnit[] = [];
  const tailEnd = Math.min(allocationLevel, saturationLevel);
  for (let at = HAZARD_TAIL.fromLevel; at <= tailEnd; at += HAZARD_TAIL.everyLevels) {
    const unit = nextHazardTailUnit(state);
    applyTailUnit(state, unit);
    tailUnits.push(unit);
  }
  let shards = 0;
  if (allocationLevel >= introLevelOf('shard')) {
    shards = 1 + (allocationLevel >= saturationLevel
      ? Math.floor((allocationLevel - saturationLevel) / HAZARD_SHARD_GROWTH_LEVELS)
      : 0);
  }
  const intro = HAZARD_INTRO_SCHEDULE.find((entry) => entry.level === allocationLevel);
  return {
    manifestId: HAZARD_SCHEDULE_MANIFEST_ID,
    scheduleVersion: HAZARD_SCHEDULE_VERSION,
    level,
    scheduledStage,
    exposureStage,
    allocationLevel,
    firstEncounter: intro === undefined ? null : intro.unit,
    gates: state.gates,
    sentries: state.sentries,
    hunters: state.hunters,
    shards,
    gateTier: state.gateTier,
    sentryTier: state.sentryTier,
    hunterTier: state.hunterTier,
    hunterSpeedDivisor: state.hunters > 0 ? HUNTER_SPEED_DIVISORS[state.hunterTier]! : null,
    tailUnits,
    saturated: allocationLevel >= saturationLevel
  };
};

/** Kinds present in an allocation, in schedule order. */
export const allocatedKinds = (allocation: HazardAllocation): HazardUnitKind[] => {
  const kinds: HazardUnitKind[] = [];
  if (allocation.gates > 0) kinds.push('pulseGate');
  if (allocation.sentries > 0) kinds.push('sentry');
  if (allocation.hunters > 0) kinds.push('hunter');
  if (allocation.shards > 0) kinds.push('shard');
  return kinds;
};
