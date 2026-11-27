/**
 * Hazard onboarding and moments (roadmap slice H6: HAZ-008 intro cards, PROG-007 tier pips, the
 * hazard Guide rows and the hazard audio events). Behind the hazard layer flag, default OFF.
 *
 * Everything that decides is pure and lives here: which card or pip a level start shows, what is
 * marked shown, which hazard rows the Guide lists, and the guarded read/write of the local exposure
 * record. The scene only asks at level start / clear and draws what it gets
 * (src/render/hazardMomentRenderer.ts). With the layer off `createHazardOnboarding` returns null, so
 * the scene holds nothing, reads no storage and draws nothing: flag-off play is unchanged.
 *
 * Live kinds: a kind's card, pip and Guide row appear only once that kind is actually drawn in play
 * (H3 Pulse Gate, H4 Sentry, H5 Hunter, H8 Shard each add theirs to HAZARD_ONBOARDING_LIVE_KINDS).
 * The exposure STAGE still advances on schedule for every kind, so mazes stay a pure function of
 * (seed, level, stage) whatever is live.
 */

import {
  HAZARD_EXPOSURE_KIND_ORDER,
  HAZARD_TAIL,
  advanceHazardExposureOnClear,
  allocateHazardUnitsForRecord,
  mergeHazardExposureRecords,
  parseHazardExposureRecord,
  resolveHazardExposureStage,
  serializeHazardExposureRecord,
  toHazardScheduleLevel,
  type HazardAllocation,
  type HazardExposureRecord,
  type HazardTailUnit,
  type HazardUnitKind
} from '../mazer-core/hazards';
import {
  resolveLegacyGuideHazardRow,
  type LegacyGuideHazardKind,
  type LegacyGuideHazardRowId
} from './legacyGuideContent';

/** Local storage key (auth-scoped by the scene like the game toggles). Never part of the account settings JSON. */
export const HAZARD_EXPOSURE_STORAGE_KEY = 'mazer.hazard-exposure.v1';

/**
 * Kinds drawn in play today. H3 wires the Pulse Gate; H4/H5/H8 append theirs. Order does not matter
 * (everything below re-sorts by the schedule).
 */
export const HAZARD_ONBOARDING_LIVE_KINDS: readonly HazardUnitKind[] = Object.freeze(['pulseGate', 'shard']);

/** How long a card / pip stays up if the player does not move first (the first move dismisses the card). */
export const HAZARD_INTRO_CARD_SHOW_MS = 4500;
export const HAZARD_TIER_PIP_SHOW_MS = 2600;

export interface HazardIntroCardModel {
  readonly kind: HazardUnitKind;
  /** The Guide glyph (same id as the kind's Guide row). */
  readonly glyph: LegacyGuideHazardRowId;
  /** The kind's Guide row heading and text: one source for the card and the Guide. */
  readonly heading: string;
  readonly text: string;
}

export interface HazardTierPipModel {
  /** The tail-step level the unit landed on. */
  readonly level: number;
  /** Tail units landed so far, live kinds only (1-based; the pip row length). */
  readonly tier: number;
  readonly unit: Exclude<HazardTailUnit, 'none'>;
  readonly label: string;
  /** The glyph of the kind the unit belongs to. */
  readonly glyph: LegacyGuideHazardRowId;
}

export interface HazardLevelMoments {
  readonly level: number;
  readonly allocation: HazardAllocation | null;
  readonly introCard: HazardIntroCardModel | null;
  readonly tierPip: HazardTierPipModel | null;
}

const TAIL_UNIT_KIND: Readonly<Record<Exclude<HazardTailUnit, 'none'>, HazardUnitKind>> = Object.freeze({
  gate: 'pulseGate',
  gateTier: 'pulseGate',
  sentry: 'sentry',
  sentryTier: 'sentry',
  hunter: 'hunter',
  hunterTier: 'hunter'
});

export const HAZARD_TIER_PIP_LABELS: Readonly<Record<Exclude<HazardTailUnit, 'none'>, string>> = Object.freeze({
  gate: 'Gate +1',
  gateTier: 'Gate tier up',
  sentry: 'Sentry +1',
  sentryTier: 'Sentry tier up',
  hunter: 'Hunter +1',
  hunterTier: 'Hunter tier up'
});

const NO_MOMENTS = (level: number): HazardLevelMoments => ({ level, allocation: null, introCard: null, tierPip: null });

const isLive = (kind: HazardUnitKind, liveKinds: readonly HazardUnitKind[]): boolean => liveKinds.includes(kind);

/** True on a level where the tail buys a unit (36, 51, 66, ... up to saturation). */
export const isHazardTailStepLevel = (level: number, saturationLevel: number): boolean => (
  level >= HAZARD_TAIL.fromLevel
  && level <= saturationLevel
  && (level - HAZARD_TAIL.fromLevel) % HAZARD_TAIL.everyLevels === 0
);

export const buildHazardIntroCard = (kind: HazardUnitKind): HazardIntroCardModel => {
  const row = resolveLegacyGuideHazardRow(kind as LegacyGuideHazardKind);
  return { kind, glyph: row.id, heading: row.heading, text: row.text };
};

export interface ResolveHazardLevelMomentsOptions {
  readonly enabled: boolean;
  readonly level: unknown;
  readonly record: HazardExposureRecord;
  readonly saturationLevel: number;
  readonly liveKinds?: readonly HazardUnitKind[];
}

/**
 * What a level start shows. Show-once: a card only for a first encounter whose card was never shown,
 * a pip only for a tail step above the last pip shown. Flag off = nothing. Pure and allocation-light
 * (one allocator call), so the card model is ready in the same frame the level starts.
 */
export const resolveHazardLevelMoments = (options: ResolveHazardLevelMomentsOptions): HazardLevelMoments => {
  const level = toHazardScheduleLevel(options.level);
  if (!options.enabled) {
    return NO_MOMENTS(level);
  }
  const liveKinds = options.liveKinds ?? HAZARD_ONBOARDING_LIVE_KINDS;
  const allocation = allocateHazardUnitsForRecord(options.record, level, options.saturationLevel);
  const intro = allocation.firstEncounter;
  const introCard = intro !== null && isLive(intro, liveKinds) && !options.record.introsShown.includes(intro)
    ? buildHazardIntroCard(intro)
    : null;
  let tierPip: HazardTierPipModel | null = null;
  const landed = allocation.tailUnits[allocation.tailUnits.length - 1];
  if (
    intro === null
    && allocation.allocationLevel === level
    && isHazardTailStepLevel(level, options.saturationLevel)
    && level > options.record.tierPipThrough
    && landed !== undefined
    && landed !== 'none'
    && isLive(TAIL_UNIT_KIND[landed], liveKinds)
  ) {
    const tier = allocation.tailUnits.filter((unit) => unit !== 'none' && isLive(TAIL_UNIT_KIND[unit], liveKinds)).length;
    tierPip = {
      level,
      tier,
      unit: landed,
      label: HAZARD_TIER_PIP_LABELS[landed],
      glyph: resolveLegacyGuideHazardRow(TAIL_UNIT_KIND[landed] as LegacyGuideHazardKind).id
    };
  }
  return { level, allocation, introCard, tierPip };
};

/** The record after a level start showed `moments` (same object when nothing was shown). */
export const markHazardMomentsShown = (
  record: HazardExposureRecord,
  moments: HazardLevelMoments
): HazardExposureRecord => {
  if (moments.introCard === null && moments.tierPip === null) {
    return record;
  }
  return mergeHazardExposureRecords(record, {
    v: record.v,
    stage: record.stage,
    introsShown: moments.introCard === null ? [] : [moments.introCard.kind],
    tierPipThrough: moments.tierPip === null ? 0 : moments.tierPip.level
  });
};

/**
 * Kinds the Guide lists: met (stage reached or card shown) AND live, in schedule order. Empty while
 * the layer is off, so the Guide sheet keeps LEGACY_GUIDE_ROWS exactly.
 */
export const resolveHazardGuideKinds = (
  record: HazardExposureRecord,
  options: { enabled: boolean; liveKinds?: readonly HazardUnitKind[] }
): LegacyGuideHazardKind[] => {
  if (!options.enabled) {
    return [];
  }
  const liveKinds = options.liveKinds ?? HAZARD_ONBOARDING_LIVE_KINDS;
  return HAZARD_EXPOSURE_KIND_ORDER.filter((kind, index) => (
    isLive(kind, liveKinds) && (index < record.stage || record.introsShown.includes(kind))
  ));
};

export type HazardExposureStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Guarded read: no storage, a throwing storage or a bad value all give the empty record. */
export const readHazardExposureRecord = (storage: HazardExposureStorage | null | undefined): HazardExposureRecord => {
  if (!storage) {
    return parseHazardExposureRecord(null);
  }
  try {
    return parseHazardExposureRecord(storage.getItem(HAZARD_EXPOSURE_STORAGE_KEY));
  } catch {
    return parseHazardExposureRecord(null);
  }
};

/** Guarded write of the canonical form. Returns false when nothing could be written. */
export const writeHazardExposureRecord = (
  storage: HazardExposureStorage | null | undefined,
  record: HazardExposureRecord
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(HAZARD_EXPOSURE_STORAGE_KEY, serializeHazardExposureRecord(record));
    return true;
  } catch {
    return false;
  }
};

export interface HazardOnboardingOptions {
  readonly enabled: boolean;
  /** Called on every read/write so a sign-in or Level Preview switch picks the right scope. */
  readonly resolveStorage: () => HazardExposureStorage | null | undefined;
  readonly saturationLevel: number;
  readonly liveKinds?: readonly HazardUnitKind[];
}

export interface HazardOnboarding {
  /**
   * Resolves and marks the level-start moments (writes the record only when something shows). An intro whose kind is
   * in `withheldKinds` is neither shown nor marked (e.g. the shard hint on a level whose shards did not place), so it
   * still shows the first time that kind really appears.
   */
  levelStart(level: unknown, options?: { readonly withheldKinds?: readonly HazardUnitKind[] }): HazardLevelMoments;
  /** Advances the stage on a first-encounter clear; never lowers it. */
  levelCleared(level: unknown): void;
  /** The stage to build `level` with (for the overlay's `exposureStage`). */
  exposureStageFor(level: unknown): number;
  guideKinds(): LegacyGuideHazardKind[];
  record(): HazardExposureRecord;
}

/** Null while the layer is off: the scene then has no onboarding object at all. */
export const createHazardOnboarding = (options: HazardOnboardingOptions): HazardOnboarding | null => {
  if (!options.enabled) {
    return null;
  }
  const liveKinds = options.liveKinds ?? HAZARD_ONBOARDING_LIVE_KINDS;
  const read = (): HazardExposureRecord => readHazardExposureRecord(options.resolveStorage());
  const write = (next: HazardExposureRecord): void => {
    writeHazardExposureRecord(options.resolveStorage(), next);
  };
  return {
    levelStart(level, startOptions) {
      const record = read();
      const resolved = resolveHazardLevelMoments({
        enabled: true,
        level,
        record,
        saturationLevel: options.saturationLevel,
        liveKinds
      });
      const withheld = resolved.introCard !== null && startOptions?.withheldKinds?.includes(resolved.introCard.kind) === true;
      const moments = withheld ? { ...resolved, introCard: null } : resolved;
      const next = markHazardMomentsShown(record, moments);
      if (next !== record) {
        write(next);
      }
      return moments;
    },
    levelCleared(level) {
      const record = read();
      const next = advanceHazardExposureOnClear(record, { clearedLevel: level, saturationLevel: options.saturationLevel });
      if (next !== record) {
        write(next);
      }
    },
    exposureStageFor(level) {
      return resolveHazardExposureStage(read(), level);
    },
    guideKinds() {
      return resolveHazardGuideKinds(read(), { enabled: true, liveKinds });
    },
    record() {
      return read();
    }
  };
};
