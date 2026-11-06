/**
 * DRAFT hazard loadout schedule (packet P5, pure part). Dormant and pure: no
 * scene, no geometry, no randomness, no clock. See
 * docs/architecture/MAZER-HAZARD-PLACEMENT-AND-LOADOUT.md.
 *
 * `resolveHazardLoadout(level)` answers one question: how many blockers, timed
 * gates and patrols does level N ask for, and at which tier. It never sees a maze;
 * `placement.ts` turns the requirement into cells and clamps it to what the maze
 * can host.
 *
 * The schedule is a nested tape. Level L >= 6 owns `L - 5` hazard points, and the
 * allocation for level L + 1 is the allocation for level L plus exactly ONE unit.
 * A unit is either one more hazard of a kind ("count unit") or one tier upgrade
 * of a kind ("tier unit"). Forced units introduce each kind alone at its unlock
 * level; every other unit is the cheapest next unit by a convex price, ties broken
 * by menu order. All prices are integers, so the tape is exact and portable.
 */

export const HAZARD_LOADOUT_CONTRACT = 'mazer-hazard-loadout-draft-v0' as const;

export type HazardLoadoutKind = 'blocker' | 'timedGate' | 'patrol';

/** First level on which each kind appears. Each is introduced alone (count 1). [DEFAULT, pending owner] */
export const HAZARD_UNLOCK_LEVELS: Readonly<Record<HazardLoadoutKind, number>> = {
  blocker: 6,
  timedGate: 11,
  patrol: 16
};

/** Levels strictly below this carry no hazard of any kind. */
export const HAZARD_FIRST_LEVEL = HAZARD_UNLOCK_LEVELS.blocker;

/** Spacing between unlocks (the "K" of the design report). */
export const HAZARD_UNLOCK_SPACING = 5;

/**
 * Count-unit price for the k-th (0-based) hazard of a kind: `base * (1 + k * k)`.
 * Quadratic, so counts grow roughly as the square root of the spent price.
 */
export const HAZARD_COUNT_BASE_PRICE: Readonly<Record<HazardLoadoutKind, number>> = {
  blocker: 2,
  timedGate: 4,
  patrol: 6
};

/**
 * Tier-unit price for upgrading a kind from tier j to j + 1: `base * (1 + j)^2`.
 * A tier unit leaves the menu once the last defined tier is reached, so every
 * unit bought below the capacity ceiling is a real requirement change.
 * Blockers have no tiers.
 */
export const HAZARD_TIER_BASE_PRICE = {
  timedGate: 6,
  patrol: 9
} as const;

export interface GateTierParams {
  readonly period: number;
  readonly openFor: number;
}

/**
 * Gate tiers, easiest first. Every entry keeps the open fraction at or above 50%
 * and the period within 3..6, so a gate is always passable by waiting at most
 * `period - openFor` turns. Tier 0 is the first-encounter configuration (wait at
 * most one turn).
 */
export const GATE_TIERS: readonly GateTierParams[] = [
  { period: 4, openFor: 3 },
  { period: 3, openFor: 2 },
  { period: 5, openFor: 3 },
  { period: 4, openFor: 2 },
  { period: 6, openFor: 3 }
];

/** Patrol route length by tier (a straight corridor segment of 3..7 cells). */
export const PATROL_ROUTE_LENGTHS: readonly number[] = [3, 4, 5, 6, 7];

export const MAX_GATE_TIER = GATE_TIERS.length - 1;
export const MAX_PATROL_TIER = PATROL_ROUTE_LENGTHS.length - 1;

export const resolveGateTierParams = (tier: number): GateTierParams => (
  GATE_TIERS[Math.max(0, Math.min(MAX_GATE_TIER, Math.trunc(tier)))]!
);

export const resolvePatrolRouteLength = (tier: number): number => (
  PATROL_ROUTE_LENGTHS[Math.max(0, Math.min(MAX_PATROL_TIER, Math.trunc(tier)))]!
);

export type HazardUnit =
  | 'blocker'
  | 'timedGate'
  | 'patrol'
  | 'gateTier'
  | 'patrolTier'
  /** Nothing is left to buy (capacity reached before any tier exists). */
  | 'none';

export interface HazardLoadout {
  readonly contract: typeof HAZARD_LOADOUT_CONTRACT;
  readonly level: number;
  /** `max(0, level - 5)`: the number of units on the tape; strictly +1 per level from level 6. */
  readonly points: number;
  readonly blockers: number;
  readonly timedGates: number;
  readonly patrols: number;
  /** Tier units bought (equals the effective tier: saturated tiers leave the menu). */
  readonly rawGateTier: number;
  readonly rawPatrolTier: number;
  /** Tier clamped to the defined tiers (what placement uses; always equal to the raw tier). */
  readonly gateTier: number;
  readonly patrolTier: number;
  readonly gate: GateTierParams | null;
  readonly patrolRouteLength: number | null;
  /** True exactly on the unlock level of that kind: place it alone, in a safe configuration. */
  readonly firstEncounter: {
    readonly blocker: boolean;
    readonly timedGate: boolean;
    readonly patrol: boolean;
  };
  /**
   * True when nothing was left to buy at this level (capacity reached and every
   * tier saturated): the level adds a hazard point but no requirement. This is the
   * feasibility ceiling; it can only happen when a `capacity` is given.
   */
  readonly idle: boolean;
  /** The unit added at this level, or null before level 6. */
  readonly unit: HazardUnit | null;
}

export interface ResolveHazardLoadoutOptions {
  /**
   * Total hazard cap (typically `maxHazardsForMaze`). Once the three counts sum
   * to this, count units leave the menu and any remaining tier units are bought;
   * when none remain the level is idle. Default: unbounded (never idle).
   */
  readonly capacity?: number;
}

/** Highest level accepted; the tape is replayed in O(level), so keep it bounded. */
export const HAZARD_MAX_LEVEL = 1_000_000;

interface TapeState {
  blockers: number;
  timedGates: number;
  patrols: number;
  rawGateTier: number;
  rawPatrolTier: number;
}

const countPrice = (kind: HazardLoadoutKind, count: number): number => (
  HAZARD_COUNT_BASE_PRICE[kind] * (1 + count * count)
);

const tierPrice = (kind: 'timedGate' | 'patrol', tier: number): number => (
  HAZARD_TIER_BASE_PRICE[kind] * (1 + tier) * (1 + tier)
);

const nextUnit = (state: TapeState, level: number, capacity: number): HazardUnit => {
  if (level === HAZARD_UNLOCK_LEVELS.blocker) {
    return 'blocker';
  }
  if (level === HAZARD_UNLOCK_LEVELS.timedGate) {
    return 'timedGate';
  }
  if (level === HAZARD_UNLOCK_LEVELS.patrol) {
    return 'patrol';
  }
  const hasRoom = state.blockers + state.timedGates + state.patrols < capacity;
  // Menu order is the tie-break: earlier entries win equal prices.
  const menu: Array<readonly [HazardUnit, number]> = [];
  if (hasRoom) {
    menu.push(['blocker', countPrice('blocker', state.blockers)]);
  }
  if (level > HAZARD_UNLOCK_LEVELS.timedGate) {
    if (hasRoom) {
      menu.push(['timedGate', countPrice('timedGate', state.timedGates)]);
    }
    if (state.rawGateTier < MAX_GATE_TIER) {
      menu.push(['gateTier', tierPrice('timedGate', state.rawGateTier)]);
    }
  }
  if (level > HAZARD_UNLOCK_LEVELS.patrol) {
    if (hasRoom) {
      menu.push(['patrol', countPrice('patrol', state.patrols)]);
    }
    if (state.rawPatrolTier < MAX_PATROL_TIER) {
      menu.push(['patrolTier', tierPrice('patrol', state.rawPatrolTier)]);
    }
  }
  let best: HazardUnit = 'none';
  let bestPrice = Number.POSITIVE_INFINITY;
  for (const [unit, price] of menu) {
    if (price < bestPrice) {
      best = unit;
      bestPrice = price;
    }
  }
  // 'none' only when the capacity is reached before any tier unit exists.
  return best;
};

export const resolveHazardLoadout = (
  level: number,
  options: ResolveHazardLoadoutOptions = {}
): HazardLoadout => {
  if (!Number.isInteger(level) || level < 1 || level > HAZARD_MAX_LEVEL) {
    throw new RangeError(`level must be an integer in 1..${HAZARD_MAX_LEVEL}, received ${String(level)}`);
  }
  const capacity = options.capacity ?? Number.POSITIVE_INFINITY;
  if (!(capacity >= 0)) {
    throw new RangeError('capacity must be a non-negative number');
  }
  const state: TapeState = { blockers: 0, timedGates: 0, patrols: 0, rawGateTier: 0, rawPatrolTier: 0 };
  let unit: HazardUnit | null = null;
  let idle = false;
  for (let at = HAZARD_FIRST_LEVEL; at <= level; at += 1) {
    unit = nextUnit(state, at, capacity);
    idle = false;
    switch (unit) {
      case 'blocker':
        state.blockers += 1;
        break;
      case 'timedGate':
        state.timedGates += 1;
        break;
      case 'patrol':
        state.patrols += 1;
        break;
      case 'gateTier':
        state.rawGateTier += 1;
        break;
      case 'patrolTier':
        state.rawPatrolTier += 1;
        break;
      case 'none':
        idle = true;
        break;
    }
  }
  const gateTier = Math.min(MAX_GATE_TIER, state.rawGateTier);
  const patrolTier = Math.min(MAX_PATROL_TIER, state.rawPatrolTier);
  return {
    contract: HAZARD_LOADOUT_CONTRACT,
    level,
    points: Math.max(0, level - (HAZARD_FIRST_LEVEL - 1)),
    blockers: state.blockers,
    timedGates: state.timedGates,
    patrols: state.patrols,
    rawGateTier: state.rawGateTier,
    rawPatrolTier: state.rawPatrolTier,
    gateTier,
    patrolTier,
    gate: state.timedGates > 0 ? resolveGateTierParams(gateTier) : null,
    patrolRouteLength: state.patrols > 0 ? resolvePatrolRouteLength(patrolTier) : null,
    firstEncounter: {
      blocker: level === HAZARD_UNLOCK_LEVELS.blocker,
      timedGate: level === HAZARD_UNLOCK_LEVELS.timedGate,
      patrol: level === HAZARD_UNLOCK_LEVELS.patrol
    },
    idle,
    unit
  };
};

/** Total hazards (all kinds) a loadout asks for. */
export const countLoadoutHazards = (loadout: Pick<HazardLoadout, 'blockers' | 'timedGates' | 'patrols'>): number => (
  loadout.blockers + loadout.timedGates + loadout.patrols
);

/**
 * First level (searching up to `maxLevel`) with nothing left to buy given `capacity`:
 * the feasibility ceiling of the loadout for a maze of that capacity. From it on a
 * level adds a hazard point but no new requirement. Returns null if none is found.
 */
export const findLoadoutCeilingLevel = (capacity: number, maxLevel = 2000): number | null => {
  const state: TapeState = { blockers: 0, timedGates: 0, patrols: 0, rawGateTier: 0, rawPatrolTier: 0 };
  for (let at = HAZARD_FIRST_LEVEL; at <= maxLevel; at += 1) {
    const unit = nextUnit(state, at, capacity);
    if (unit === 'blocker') {
      state.blockers += 1;
    } else if (unit === 'timedGate') {
      state.timedGates += 1;
    } else if (unit === 'patrol') {
      state.patrols += 1;
    } else if (unit === 'gateTier') {
      state.rawGateTier += 1;
    } else if (unit === 'patrolTier') {
      state.rawPatrolTier += 1;
    } else {
      return at;
    }
  }
  return null;
};
