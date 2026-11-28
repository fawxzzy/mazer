/**
 * Shard first-time hint and unlock notice (H8 UI v1): the copy and the decisions, no drawing. The scene feeds the copy
 * into the reusable in-flow notice (src/ui/notice/inFlowNotice.ts) and coach mark (src/render/coachMarkView.ts); those
 * components hold no shard text.
 *
 * Show-once rides the existing hazard exposure record: the shard's intro card IS the hint (`introsShown` marks it), so
 * it shows the first time the player meets shards and never again, and the Guide's Shard row appears from then on.
 *
 * With first-time cards on too (`?lab=firsttime`, spec docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md R5), this
 * hint is absorbed by the registry's `mechanic.locked-gate` card (legacyFirstTimeHost.ts): hazard onboarding returns no
 * shard intro card, so this notice and its coach mark never show; the card fires on the first shard pickup or locked-star
 * step instead, and `introsShown: ['shard']` (a player who already had this hint) counts that card as seen.
 * The level shards start at is never written here: it comes from the hazard schedule (HAZARD_INTRO_SCHEDULE entry plus
 * the curve-A lock roll, manifest v2: the first lock level, 102).
 *
 * Level Preview (`?lab=hazards&level=N`) runs on in-memory storage with no history, so a preview at the shard level
 * would build as a brand-new player (stage 0: no shards). `seedHazardPreviewStorage` reads a never-written record as
 * the one a player who reached `level` by the schedule would have, so the preview shows what that level ships.
 */
import {
  HAZARD_EXPOSURE_KIND_ORDER,
  HAZARD_EXPOSURE_RECORD_VERSION,
  HAZARD_INTRO_SCHEDULE,
  resolveHazardKindFirstLevel,
  resolveScheduledStage,
  toHazardScheduleLevel,
  type HazardExposureRecord,
  type HazardUnitKind
} from '../mazer-core/hazards';
import { MOTION_LOOP_MS } from '../render/motionScale';
import type { HazardExposureStorage } from './legacyHazardOnboarding';

const SHARD_KIND: HazardUnitKind = 'shard';

/**
 * The first level shards appear on, read from the hazard schedule (one place to change the cadence): the first lock
 * level at or after the shard entry (manifest v2: entry 100, first lock 102).
 */
export const resolveShardFirstLevel = (): number | null => (
  HAZARD_INTRO_SCHEDULE.some((entry) => entry.unit === SHARD_KIND) ? resolveHazardKindFirstLevel(SHARD_KIND) : null
);

export const SHARD_HINT_KEYS = Object.freeze({ first: 'shard.first', unlocked: 'shard.unlocked' });

export interface ShardNoticeCopy {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly autoDismissMs?: number;
  readonly tone: 'info' | 'success';
}

/**
 * First-time notice: what to do, in the Guide's words (the Shard row in legacyGuideContent.ts says "Take the shards in
 * order. The star stays locked until you do."; this names the count, and one shard needs no order).
 */
export const resolveShardFirstNotice = (count: number): ShardNoticeCopy => ({
  title: 'New',
  body: count > 1
    ? `Take the ${count} shards in order. The star stays locked until you do.`
    : 'Take the shard first. The star stays locked until you do.',
  actionLabel: 'Got it',
  tone: 'info'
});

/** Coach-mark label beside the first shard. */
export const SHARD_COACH_LABEL = 'Take this first';

/** After the gather and burst: the star is open. */
export const SHARD_UNLOCKED_NOTICE: ShardNoticeCopy = Object.freeze({
  title: 'Open',
  body: 'Star unlocked. Head for the end.',
  autoDismissMs: MOTION_LOOP_MS.blink,
  tone: 'success'
});

/** True when the level-start intro card is the shard's (the scene shows the notice + coach mark instead). */
export const isShardIntroCard = (card: { readonly kind: HazardUnitKind } | null | undefined): boolean => (
  card?.kind === SHARD_KIND
);

/**
 * The record a player who reached `level` by the schedule would carry (every earlier kind met and introduced). The
 * shard counts as met only once a lock level lies before `level` (`resolveScheduledStage` counts it from 102).
 */
export const resolveHazardPreviewSeedRecord = (level: unknown): HazardExposureRecord => {
  const at = toHazardScheduleLevel(level);
  const stage = resolveScheduledStage(Math.max(0, at - 1));
  return {
    v: HAZARD_EXPOSURE_RECORD_VERSION,
    stage,
    introsShown: HAZARD_EXPOSURE_KIND_ORDER.slice(0, stage),
    tierPipThrough: 0
  };
};

/**
 * Wraps the preview's exposure storage: a key never written reads as the seeded record; once the game writes it, the
 * real value wins (so the hint still shows once per preview session).
 */
export const seedHazardPreviewStorage = (
  storage: HazardExposureStorage | null | undefined,
  key: string,
  level: unknown
): HazardExposureStorage | null => {
  if (storage === null || storage === undefined) return null;
  return {
    getItem: (name) => {
      const value = storage.getItem(name);
      if (value !== null || name !== key) return value;
      return JSON.stringify(resolveHazardPreviewSeedRecord(level));
    },
    setItem: (name, value) => storage.setItem(name, value)
  };
};
