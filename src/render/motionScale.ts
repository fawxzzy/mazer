/**
 * The one motion scale (MAZER-MOTION-001): durations, loop periods, reduced-motion crossfade lengths and
 * easing functions for every time-driven visual.
 *
 * This module adds no new numbers. It re-exports the shipped values registered in the design tokens
 * (docs/contracts/mazer-ui-rework-design-tokens.v1.json, `motion.*`) under named constants, so a call site
 * can say "a base-length fade" or "a drift-length loop" and the token sync test, the evidence contract and
 * the call site all agree on one source. Call sites migrate here only where the value is identical.
 *
 * The 2026-11-06 audit proposed a retuned ladder (120/200/320/480/720 ms); it is NOT shipped here because
 * each step that differs from today's value is a visible retune and an owner decision.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */
import { designTokens, motionEasing } from '../theme/tokens';

const motion = designTokens.motion;

/** Duration ladder, shortest to longest: fast 120, base 200, slow 300, long 400, reveal 700 ms. */
export const MOTION_DURATION_MS = Object.freeze({ ...motion.durationMs });

/** Short state changes that are not on the ladder (press 90..emphasis 420), straight from `motionMs`. */
export const MOTION_UI_MS = Object.freeze({ ...designTokens.motionMs });

/** Loop periods, all harmonics of the 1200 ms beat: beat 1200, blink 2400 (2x), drift 3600 (3x). */
export const MOTION_LOOP_MS = Object.freeze({ ...motion.loopMs });

/** Total stagger budget across the eight edge diamonds. */
export const MOTION_STAGGER_BEAM_TOTAL_MS = motion.staggerMs.beamTotal;

/**
 * Reduced-motion crossfade lengths. Four distinct values ship today (intro 250, outro 150, teleport 140,
 * teleport fade edge 45) and the tokens contract pins them as deliberately distinct. See MAZER-MOTION-005.
 */
export const MOTION_REDUCED_MS = Object.freeze({ ...motion.reducedMotionMs });

/** Easing functions (smoothstep, smootherstep, easeOutCubic, sineInOut). */
export const MOTION_EASING = motionEasing;

/** The Phaser tween ease string that equals `MOTION_EASING.sineInOut`. */
export const MOTION_PHASER_EASE_SINE_IN_OUT = 'Sine.easeInOut';

/** Every step of the shipped duration ladder, ascending. */
export const MOTION_DURATION_STEPS_MS: readonly number[] = Object.freeze(
  Object.values(MOTION_DURATION_MS).sort((a, b) => a - b)
);

/** The ladder step nearest to `ms` (ties go to the shorter step). Use it to size a proposed retune. */
export const nearestMotionDurationStepMs = (ms: number): number => {
  const target = Number.isFinite(ms) ? ms : 0;
  let best = MOTION_DURATION_STEPS_MS[0];
  for (const step of MOTION_DURATION_STEPS_MS) {
    if (Math.abs(step - target) < Math.abs(best - target)) best = step;
  }
  return best;
};

/** 0..1 phase of a repeating loop at `timeMs`; a non-finite or non-positive period yields 0. */
export const motionLoopPhase = (timeMs: number, periodMs: number): number => {
  if (!Number.isFinite(timeMs) || !Number.isFinite(periodMs) || periodMs <= 0) return 0;
  const phase = (timeMs / periodMs) % 1;
  return phase < 0 ? phase + 1 : phase;
};

/** True when `periodMs` is a whole multiple of the beat (1200 ms), so loops re-align every beat. */
export const isMotionBeatHarmonic = (periodMs: number): boolean => (
  Number.isFinite(periodMs) && periodMs > 0 && periodMs % MOTION_LOOP_MS.beat === 0
);
