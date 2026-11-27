/**
 * Hazard allocator on the signed schedule manifest v2 (slice H2; v2 from first-time
 * cards spec slice 6, D4). Pure: no scene, no geometry, no randomness, no clock.
 *
 * Source of truth: docs/contracts/mazer-hazard-schedule.v2.json and
 * docs/architecture/MAZER-HAZARD-PRODUCT-CONTRACT.md section 2.5 (v2 amendment).
 * A test pins every constant below to the manifest, so the two cannot drift.
 * Manifest v1 stays in docs/contracts as signed history.
 *
 * `allocateHazardUnits(level)` answers how many units of each kind a level asks
 * for, before any maze is seen:
 *   - levels 1..9 carry nothing;
 *   - the intro schedule adds one kind at its level, alone and in its
 *     first-encounter shape: Pulse Gate 10, Sentry 20, Hunter 35;
 *   - shards (locked gates) enter at 100 behind the lock roll (curve A): a level
 *     carries shards only when `isShardLockLevel(level)`, 30% at 100 rising to
 *     100% at 283 and held. The first lock level is 102, and that is where the
 *     shard is first met (`resolveHazardKindFirstLevel('shard')`);
 *   - the tail adds exactly one unit at levels 36, 51, 66, ... up to the geometry
 *     saturation level, picked by the convex-price tape of `loadout.ts` with the
 *     static blocker removed and the readability caps applied;
 *   - past saturation the allocation is frozen (the Shard route target is the
 *     forever axis, slice H8).
 * Gates, enemies and tiers only ever add: the allocation for level L + 1 contains
 * the one for L. Shards are the exception from v2: in 100..282 a level without a
 * lock roll carries none; from 283 every level carries them and the count only grows.
 *
 * Exposure (contract 2.5): a player whose local `exposureStage` is below the
 * schedule meets the next skipped kind in its first-encounter shape, one kind per
 * level. The shard, last in the schedule, is met on the first lock level at or
 * after the player reaches stage 3 (it is placed with that level's own
 * allocation). A missing stage means a new player, whose stage equals the schedule.
 */

import { MAX_GATE_TIER, MAX_PATROL_TIER } from './loadout';

export const HAZARD_SCHEDULE_MANIFEST_ID = 'mazer-hazard-schedule' as const;
export const HAZARD_SCHEDULE_VERSION = 2;

export type HazardUnitKind = 'pulseGate' | 'sentry' | 'hunter' | 'shard';

/** Signed intro schedule, in order. The index of an entry is its exposure stage. */
export const HAZARD_INTRO_SCHEDULE: readonly { readonly level: number; readonly unit: HazardUnitKind }[] = [
  { level: 10, unit: 'pulseGate' },
  { level: 20, unit: 'sentry' },
  { level: 35, unit: 'hunter' },
  // v2: the level the shard lock roll starts; the first lock level (102) is where shards are first met.
  { level: 100, unit: 'shard' }
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

/**
 * Curve A (first-time cards spec section 3, approved D4): the chance a level carries shards (locks its star). 0 below
 * the shard entry level, 30% there, rising linearly to 100% at `HAZARD_SHARD_LOCK.fullFromLevel` and held.
 */
export const HAZARD_SHARD_LOCK = {
  /** Salt of the level hash ("LOCK"), so the lock roll never correlates with the Switch roll (salt 0x6a09e667). */
  salt: 0x4c4f434b,
  chanceAtEntry: 0.3,
  fullFromLevel: 283
} as const;

/** Integer hash (lowbias32) of the level with the lock salt: the same hash as the Switch cadence (F1). */
const hashShardLockLevel = (level: number): number => {
  let value = (Math.trunc(level) ^ HAZARD_SHARD_LOCK.salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
};

const shardEntryLevel = (): number => HAZARD_INTRO_SCHEDULE.find((entry) => entry.unit === 'shard')!.level;

/** Curve A: 0 below the shard entry level, then `0.3 + 0.7 * (L - entry) / (full - entry)`, 1 from `fullFromLevel`. */
export const resolveShardLockChance = (level: number): number => {
  const entry = shardEntryLevel();
  if (!Number.isFinite(level) || level < entry) {
    return 0;
  }
  if (level >= HAZARD_SHARD_LOCK.fullFromLevel) {
    return 1;
  }
  const t = (Math.trunc(level) - entry) / (HAZARD_SHARD_LOCK.fullFromLevel - entry);
  return HAZARD_SHARD_LOCK.chanceAtEntry + ((1 - HAZARD_SHARD_LOCK.chanceAtEntry) * t);
};

/** Whether `level` carries shards (a locked star). Keyed on the level only: same level, same answer, every board. */
export const isShardLockLevel = (level: number): boolean => {
  const chance = resolveShardLockChance(level);
  return chance >= 1 || (chance > 0 && (hashShardLockLevel(level) / 0x100000000) < chance);
};

/** The first lock level at or after `from` (always found: every level from `fullFromLevel` locks). */
export const resolveShardFirstLockLevel = (from: number = shardEntryLevel()): number => {
  let level = Math.max(shardEntryLevel(), Number.isFinite(from) ? Math.trunc(from) : 0);
  while (!isShardLockLevel(level)) {
    level += 1;
  }
  return level;
};

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

/**
 * The level a kind is first met on by a player on the schedule: its intro level, and for the shard the first lock
 * level at or after its entry (v2: 102).
 */
export const resolveHazardKindFirstLevel = (unit: HazardUnitKind): number => {
  const entry = HAZARD_INTRO_SCHEDULE.find((candidate) => candidate.unit === unit)!;
  return unit === 'shard' ? resolveShardFirstLockLevel(entry.level) : entry.level;
};

/** Number of kinds a player on the schedule has met by `level` (each counted from its first level). */
export const resolveScheduledStage = (level: number): number => (
  HAZARD_INTRO_SCHEDULE.filter((entry) => resolveHazardKindFirstLevel(entry.unit) <= level).length
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
  // A player behind the schedule gets the intro level of the next skipped kind. The shard (last kind) is placed with
  // the level's own allocation instead, and only on a lock level: its first encounter is the first lock level at or
  // after the player reaches it.
  const skipped = exposureStage < scheduledStage ? HAZARD_INTRO_SCHEDULE[exposureStage]! : null;
  const allocationLevel = skipped === null || skipped.unit === 'shard' ? level : skipped.level;

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
  if (allocationLevel >= introLevelOf('shard') && isShardLockLevel(allocationLevel)) {
    shards = 1 + (allocationLevel >= saturationLevel
      ? Math.floor((allocationLevel - saturationLevel) / HAZARD_SHARD_GROWTH_LEVELS)
      : 0);
    if (skipped?.unit === 'shard') {
      // First-encounter shape (manifest: 1 shard, star locked), even past saturation.
      shards = 1;
    }
  }
  let firstEncounter: HazardUnitKind | null;
  if (skipped !== null) {
    firstEncounter = skipped.unit === 'shard' ? (shards > 0 ? 'shard' : null) : skipped.unit;
  } else {
    firstEncounter = HAZARD_INTRO_SCHEDULE.find((entry) => resolveHazardKindFirstLevel(entry.unit) === allocationLevel)?.unit ?? null;
  }
  return {
    manifestId: HAZARD_SCHEDULE_MANIFEST_ID,
    scheduleVersion: HAZARD_SCHEDULE_VERSION,
    level,
    scheduledStage,
    exposureStage,
    allocationLevel,
    firstEncounter,
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
