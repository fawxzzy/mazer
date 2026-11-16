/**
 * Persisted hazard exposure record (slice H6). Pure: no storage, no scene, no clock.
 *
 * Contract 2.5 ("existing high-level players"): a local `exposureStage` (0-4) introduces any
 * kind a player skipped, one per level and in schedule order. The allocator
 * (`allocateHazardUnits`, schedule.ts) already clamps whatever stage it is given; this module
 * owns the RECORD that stage lives in, and every rule about reading, advancing, merging and
 * fingerprinting it:
 *
 *   - Missing, unreadable or tampered record = stage 0 ("met nothing"). That is right for both
 *     cases the game can see: a brand-new player at L1..9 (stage 0 IS the schedule there), and
 *     an existing player at L100 who played every level with the layer off (met nothing, so the
 *     Pulse Gate comes first). A new player's stage then rises with the schedule on each clear,
 *     so their mazes stay a pure function of (seed, level).
 *   - The stage can never exceed what a level allows. `resolveHazardExposureStage` clamps the stored
 *     stage to the scheduled stage of the level being built (and the allocator clamps again), and
 *     `advanceHazardExposureOnClear` never writes a stage above the cleared level's schedule. A
 *     tampered stage of 4 on a level-3 save builds a plain level-3 maze; a migrated level-99 save
 *     with no record starts at stage 0 (Pulse Gate first).
 *   - Progress never regresses. The stored stage only rises (advance and merge are max-wins), and
 *     reading never rewrites it against the current level: a progression reset lowers the level,
 *     the read-time clamp keeps that player's mazes on the schedule, and no met kind or shown card
 *     is erased. Nothing here ever writes a level.
 *   - Account-sync safe. The record is local and never part of the account settings JSON, so the
 *     game-toggle sync fingerprint (legacyGameTogglePreferences.ts) is untouched. Serialisation is
 *     canonical (fixed key order, intros in schedule order, unknown keys dropped), and
 *     `canonicalizeHazardExposureFingerprint` rewrites any parseable older or reordered copy the
 *     same way, so a future sync that compares fingerprints cannot see a phantom local edit.
 */

import {
  HAZARD_EXPOSURE_STAGE_MAX,
  HAZARD_EXPOSURE_STAGE_MIN,
  HAZARD_INTRO_SCHEDULE,
  HAZARD_SCHEDULE_MAX_LEVEL,
  allocateHazardUnits,
  resolveScheduledStage,
  type HazardAllocation,
  type HazardUnitKind
} from './schedule';

export const HAZARD_EXPOSURE_RECORD_VERSION = 1 as const;

/** Schedule order of the kinds; the index + 1 of a kind is the stage reached by meeting it. */
export const HAZARD_EXPOSURE_KIND_ORDER: readonly HazardUnitKind[] = Object.freeze(
  HAZARD_INTRO_SCHEDULE.map((entry) => entry.unit)
);

export interface HazardExposureRecord {
  readonly v: typeof HAZARD_EXPOSURE_RECORD_VERSION;
  /** Kinds met, 0..4: rises by one per first-encounter level cleared. */
  readonly stage: number;
  /** Kinds whose intro card has been shown (show-once), always in schedule order. */
  readonly introsShown: readonly HazardUnitKind[];
  /** Highest tail-step level whose tier pip has been shown (0 = none). */
  readonly tierPipThrough: number;
}

export const createEmptyHazardExposureRecord = (): HazardExposureRecord => ({
  v: HAZARD_EXPOSURE_RECORD_VERSION,
  stage: HAZARD_EXPOSURE_STAGE_MIN,
  introsShown: [],
  tierPipThrough: 0
});

const isKind = (value: unknown): value is HazardUnitKind => (
  typeof value === 'string' && (HAZARD_EXPOSURE_KIND_ORDER as readonly string[]).includes(value)
);

/**
 * A level as a safe integer in 1..HAZARD_SCHEDULE_MAX_LEVEL. Accepts the progression ordinal
 * (a digit string that can be longer than a double holds) or a number. Anything else is 1, the
 * level that allows nothing, so a garbage level can never unlock a stage.
 */
export const toHazardScheduleLevel = (value: unknown): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }
    return Math.min(HAZARD_SCHEDULE_MAX_LEVEL, Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return 1;
    }
    const digits = trimmed.replace(/^0+/, '');
    if (digits.length === 0) {
      return 1;
    }
    if (digits.length > String(HAZARD_SCHEDULE_MAX_LEVEL).length) {
      return HAZARD_SCHEDULE_MAX_LEVEL;
    }
    return Math.min(HAZARD_SCHEDULE_MAX_LEVEL, Number(digits));
  }
  return 1;
};

const toStage = (value: unknown): number => {
  const numeric = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return HAZARD_EXPOSURE_STAGE_MIN;
  }
  return Math.max(HAZARD_EXPOSURE_STAGE_MIN, Math.min(HAZARD_EXPOSURE_STAGE_MAX, Math.trunc(numeric)));
};

const toIntros = (value: unknown): HazardUnitKind[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const present = new Set(value.filter(isKind));
  return HAZARD_EXPOSURE_KIND_ORDER.filter((kind) => present.has(kind));
};

const toPipLevel = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(HAZARD_SCHEDULE_MAX_LEVEL, Math.trunc(value)))
    : 0
);

/**
 * Turns anything (a parsed blob, a tampered object, null) into a valid record. Never throws.
 * Out-of-range or non-numeric stages, unknown kinds and garbage pip marks are cleaned here; the
 * level clamp is applied where the stage is USED (`resolveHazardExposureStage`), not by rewriting
 * the stored value, so a progression reset cannot erase a met kind or re-show a card.
 */
export const normalizeHazardExposureRecord = (value: unknown): HazardExposureRecord => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyHazardExposureRecord();
  }
  const record = value as Record<string, unknown>;
  return {
    v: HAZARD_EXPOSURE_RECORD_VERSION,
    stage: toStage(record.stage),
    introsShown: toIntros(record.introsShown),
    tierPipThrough: toPipLevel(record.tierPipThrough)
  };
};

/** Parses a stored string. Unparseable = empty record. */
export const parseHazardExposureRecord = (raw: string | null | undefined): HazardExposureRecord => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return createEmptyHazardExposureRecord();
  }
  try {
    return normalizeHazardExposureRecord(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyHazardExposureRecord();
  }
};

/** Canonical JSON: fixed key order, intros in schedule order. Equal records give equal strings. */
export const serializeHazardExposureRecord = (record: HazardExposureRecord): string => JSON.stringify({
  v: HAZARD_EXPOSURE_RECORD_VERSION,
  stage: toStage(record.stage),
  introsShown: toIntros(record.introsShown),
  tierPipThrough: toPipLevel(record.tierPipThrough)
});

/**
 * The game-toggle fingerprint pattern (canonicalizeGameToggleFingerprint): a stored fingerprint
 * from another build (keys reordered, unknown keys, intros out of order, a numeric string stage)
 * is rewritten to the canonical form so comparing it with a fresh serialisation is not a phantom
 * edit. Anything that does not parse to an object is returned unchanged.
 */
export const canonicalizeHazardExposureFingerprint = (fingerprint: string): string => {
  try {
    const parsed = JSON.parse(fingerprint) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fingerprint;
    }
    return serializeHazardExposureRecord(normalizeHazardExposureRecord(parsed));
  } catch {
    return fingerprint;
  }
};

/** The stage to build `level` with: the stored stage, clamped to what that level allows. */
export const resolveHazardExposureStage = (record: HazardExposureRecord, level: unknown): number => (
  Math.min(resolveScheduledStage(toHazardScheduleLevel(level)), toStage(record.stage))
);

/** The allocation a level gets for this record (a thin, pure convenience over the allocator). */
export const allocateHazardUnitsForRecord = (
  record: HazardExposureRecord,
  level: unknown,
  saturationLevel: number
): HazardAllocation => {
  const at = toHazardScheduleLevel(level);
  return allocateHazardUnits(at, { saturationLevel, exposureStage: resolveHazardExposureStage(record, at) });
};

export interface AdvanceHazardExposureOptions {
  /** The level just cleared. */
  readonly clearedLevel: unknown;
  readonly saturationLevel: number;
}

/**
 * Called once per clear. If the cleared level was a first encounter (for this record), the stage
 * rises to that kind's index + 1; otherwise the record is returned unchanged (same object). Never
 * lowers the stage, never raises it past what the cleared level allows.
 */
export const advanceHazardExposureOnClear = (
  record: HazardExposureRecord,
  options: AdvanceHazardExposureOptions
): HazardExposureRecord => {
  const level = toHazardScheduleLevel(options.clearedLevel);
  const allocation = allocateHazardUnitsForRecord(record, level, options.saturationLevel);
  if (allocation.firstEncounter === null) {
    return record;
  }
  const reached = Math.min(
    resolveScheduledStage(level),
    HAZARD_EXPOSURE_KIND_ORDER.indexOf(allocation.firstEncounter) + 1
  );
  if (reached <= toStage(record.stage)) {
    return record;
  }
  return { ...record, stage: reached };
};

/**
 * Two copies of the same player's record (two tabs, a future account sync): max-wins on every
 * field and a union of shown cards, so merging can never undo a met kind or re-show a card.
 */
export const mergeHazardExposureRecords = (
  a: HazardExposureRecord,
  b: HazardExposureRecord
): HazardExposureRecord => normalizeHazardExposureRecord({
  v: HAZARD_EXPOSURE_RECORD_VERSION,
  stage: Math.max(toStage(a.stage), toStage(b.stage)),
  introsShown: [...a.introsShown, ...b.introsShown],
  tierPipThrough: Math.max(toPipLevel(a.tierPipThrough), toPipLevel(b.tierPipThrough))
});
