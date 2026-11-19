/**
 * Fade envelope of the mid-screen level announcer (the big level numeral shown between mazes).
 *
 * Pure functions of elapsed time, no Phaser, so the curve and its durations are unit-testable. introTimeline.ts
 * (the single clock) applies these durations with the same smootherstep, and its tests pin that they agree. Owner, 2026-11-18: the fade in and fade out
 * read as abrupt (300 ms in, 500 ms out); both are lengthened and eased with a quintic smootherstep (zero speed
 * AND zero acceleration at both ends, so there is no visible start/stop kick).
 *
 * Reduced motion does not use this module: introTimeline.ts keeps its short crossfade for that case.
 */

import { MOTION_EASING } from './motionScale';

/** Fade in: the numeral rises over this long (deconstruct start, or the build start on a cold start). */
export const LEVEL_ANNOUNCER_FADE_IN_MS = 900;
/** Fade out: the numeral falls over the last this-long of the intro reveal (reveal is never shorter than 2000 ms). */
export const LEVEL_ANNOUNCER_FADE_OUT_MS = 1200;

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Quintic smootherstep (6t^5 - 15t^4 + 10t^3), clamped to 0..1: the same easing introTimeline.ts applies. */
export const easeLevelAnnouncer = (t: number): number => MOTION_EASING.smootherstep(clamp01(t));

/** Opacity 0..1 of the announcer `elapsedMs` after its fade in started. */
export const resolveLevelAnnouncerFadeIn = (elapsedMs: number): number => (
  easeLevelAnnouncer(elapsedMs / LEVEL_ANNOUNCER_FADE_IN_MS)
);

/** Opacity 1..0 of the announcer `elapsedMs` after its fade out started. */
export const resolveLevelAnnouncerFadeOut = (elapsedMs: number): number => (
  1 - easeLevelAnnouncer(elapsedMs / LEVEL_ANNOUNCER_FADE_OUT_MS)
);
