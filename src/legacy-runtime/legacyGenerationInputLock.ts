/**
 * MAZER-CTRL-007: player input is locked while a Play maze generates (the build reveal of the intro clock).
 *
 * Before this module, any tap, drag or key during the build fast-forwarded the intro clock to its final state
 * (MenuScene.skipLegacyIntroIfBuilding, removed), so a player touching the screen while the maze drew watched it jump
 * straight to finished. Now the build always plays to its end; every control path (touch stick and anchor, taps,
 * keyboard) is dropped until the first frame the build has settled, and the run timer starts on that frame
 * (resolveLegacyStaticDrawPlayTimerStartAtMs). Menu and pause stay usable: the scene checks this lock only after
 * its pause / back / menu branches.
 *
 * Safety release: the lock can never hold forever. When the build has no clock (it can never end by itself) or the
 * clock has overrun its own unlock instant by LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS, the lock reports a
 * release reason and the scene force-settles the build. A pause or a hidden tab shifts the intro clock forward
 * (legacyLifecycleHold.ts), so a paused build never overruns.
 *
 * Pure: no Phaser, DOM or wall clock.
 */
import { resolveIntroInputUnlockMs } from '../render/introTimeline';
import type { LegacyPlayDrawLifecyclePhase, LegacyPlayMode } from './legacyPlayLifecycle';

/** Grace past the build's own unlock instant before the safety release fires (a few frames of a slow device). */
export const LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS = 1500;

export type LegacyGenerationInputLockRelease = 'none' | 'no-intro-clock' | 'intro-clock-overrun';

export interface LegacyGenerationInputLockInput {
  readonly mode: LegacyPlayMode;
  readonly drawPhase: LegacyPlayDrawLifecyclePhase;
  /** The staged-build counters (rows / tiles visible) are still non-null. */
  readonly stagedBuildVisible: boolean;
  readonly introStartedAtMs: number | null;
  readonly nowMs: number;
  readonly reducedMotion: boolean;
  readonly tileCount: number;
}

export interface LegacyGenerationInputLock {
  /** True while player movement input must be dropped. */
  readonly locked: boolean;
  /** Why the scene must force-settle a stuck build now; 'none' in every healthy frame. */
  readonly release: LegacyGenerationInputLockRelease;
  /** Intro-clock instant the build unlocks by itself, or null when there is no build or no clock. */
  readonly unlockAtMs: number | null;
}

const UNLOCKED: LegacyGenerationInputLock = { locked: false, release: 'none', unlockAtMs: null };

/** The same "building" rule resolveLegacyPlayLifecycleSnapshot uses for its phase. */
export const isLegacyPlayGenerationBuilding = (
  { mode, drawPhase, stagedBuildVisible }: Pick<LegacyGenerationInputLockInput, 'mode' | 'drawPhase' | 'stagedBuildVisible'>
): boolean => (
  mode === 'play'
  && (drawPhase === 'building' || (drawPhase !== 'deconstructing' && stagedBuildVisible))
);

export const resolveLegacyGenerationInputLock = (input: LegacyGenerationInputLockInput): LegacyGenerationInputLock => {
  if (!isLegacyPlayGenerationBuilding(input)) {
    return UNLOCKED;
  }
  if (input.introStartedAtMs === null || !Number.isFinite(input.introStartedAtMs) || input.drawPhase !== 'building') {
    // A staged build with no running intro clock can never reach its unlock instant by itself.
    return { locked: false, release: 'no-intro-clock', unlockAtMs: null };
  }
  const unlockAtMs = input.introStartedAtMs + resolveIntroInputUnlockMs(input.reducedMotion, input.tileCount);
  if (input.nowMs >= unlockAtMs + LEGACY_GENERATION_INPUT_LOCK_SAFETY_MARGIN_MS) {
    return { locked: false, release: 'intro-clock-overrun', unlockAtMs };
  }
  return { locked: true, release: 'none', unlockAtMs };
};
