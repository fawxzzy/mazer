/**
 * Eased UI transitions for overlays, the Start hand-off and the HTML boot splash (MAZER-MOTION-002).
 *
 * Before this module a tap on Start removed the title, icons and corridor in one frame, every overlay opened and
 * closed in one frame, and the static HTML splash hard-cut to the game. Each of those is now a short crossfade
 * from a snapshot of what was on screen to the live scene, so the live scene (and the input handlers on it) is
 * already in its final state on the first frame: the snapshot is only a fading cover, it never delays a tap, never
 * moves a hit target and never triggers a board redraw.
 *
 * Every length reads the shared motion scale (motionScale.ts); no new number is registered. Reduced motion follows
 * the owner rule of 2026-11-12 (reducedMotion.ts): movement and pulsing stop, so the transition becomes the ONE
 * 200 ms crossfade (MOTION_REDUCED_MS.crossfade) with no scale; colours keep shifting because nothing here touches
 * them.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */
import {
  MOTION_DURATION_MS,
  MOTION_EASING,
  MOTION_LOOP_MS,
  MOTION_REDUCED_MS
} from './motionScale';

export type UiTransitionKind = 'start' | 'overlay-open' | 'overlay-close';

export interface UiTransitionPlan {
  readonly kind: UiTransitionKind;
  readonly durationMs: number;
  /** The snapshot's scale at the end of the transition (1 = does not move). Always 1 under reduced motion. */
  readonly endScale: number;
  readonly reducedMotion: boolean;
}

export interface UiTransitionFrame {
  /** Opacity of the snapshot of the OUTGOING screen: 1 at the first frame, 0 at the last. */
  readonly alpha: number;
  /** Scale of the snapshot around the screen centre. */
  readonly scale: number;
  readonly done: boolean;
}

/**
 * How far the outgoing menu drifts outward while it fades when Start is pressed (3%). A distance, not a duration;
 * it is the only movement here and it is dropped under reduced motion.
 */
export const UI_TRANSITION_START_END_SCALE = 1.03;

/** Full-motion lengths per kind, all steps of the shared duration ladder: panel in = base, exit = fast, Start = slow. */
export const UI_TRANSITION_DURATION_MS: Readonly<Record<UiTransitionKind, number>> = Object.freeze({
  'overlay-open': MOTION_DURATION_MS.base,
  'overlay-close': MOTION_DURATION_MS.fast,
  start: MOTION_DURATION_MS.slow
});

export const resolveUiTransitionPlan = (kind: UiTransitionKind, reducedMotion: boolean): UiTransitionPlan => ({
  kind,
  durationMs: reducedMotion ? MOTION_REDUCED_MS.crossfade : UI_TRANSITION_DURATION_MS[kind],
  endScale: !reducedMotion && kind === 'start' ? UI_TRANSITION_START_END_SCALE : 1,
  reducedMotion
});

const clamp01 = (value: number): number => (value <= 0 ? 0 : value >= 1 ? 1 : value);

/** Pure function of elapsed ms: a slow frame only changes how many frames are sampled, never how long it lasts. */
export const resolveUiTransitionFrame = (plan: UiTransitionPlan, elapsedMs: number): UiTransitionFrame => {
  const progress = Number.isFinite(elapsedMs) && plan.durationMs > 0 ? clamp01(elapsedMs / plan.durationMs) : 1;
  const faded = MOTION_EASING.smoothstep(progress);
  const moved = MOTION_EASING.easeOutCubic(progress);
  return {
    alpha: 1 - faded,
    scale: 1 + ((plan.endScale - 1) * moved),
    done: progress >= 1
  };
};

/**
 * Pixel budget for the snapshot copy. A DPR 3 phone canvas is about 3 million pixels; copying and compositing that
 * every transition showed up as a frame spike (about 100 ms in the headless A/B at 390x844 DPR 3), so a bigger canvas
 * is copied at a reduced scale (a fading snapshot does not need native sharpness) and a canvas under the budget is
 * copied 1:1. A pixel count, not a duration.
 */
export const UI_TRANSITION_SNAPSHOT_MAX_PIXELS = 1_000_000;

export interface UiTransitionSnapshotSize {
  readonly width: number;
  readonly height: number;
}

export const resolveUiTransitionSnapshotSize = (
  sourceWidth: number,
  sourceHeight: number,
  maxPixels: number = UI_TRANSITION_SNAPSHOT_MAX_PIXELS
): UiTransitionSnapshotSize => {
  const width = Number.isFinite(sourceWidth) ? Math.max(0, Math.floor(sourceWidth)) : 0;
  const height = Number.isFinite(sourceHeight) ? Math.max(0, Math.floor(sourceHeight)) : 0;
  if (width === 0 || height === 0 || width * height <= maxPixels) {
    return { width, height };
  }
  const factor = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)) };
};

/**
 * Frame budget gate. The cover costs one extra full-screen composite per frame, so a device that is already below
 * 30 fps (average frame over 33.4 ms) gets the old instant change instead: never a slower, hitchier transition than
 * no transition. The average is an exponential moving average of the scene's frame delta, each sample clamped so one
 * long pause (a tab switch, a level generation) does not poison it.
 */
export const UI_TRANSITION_MAX_AVERAGE_FRAME_MS = 33.4;
export const UI_TRANSITION_FRAME_SAMPLE_MAX_MS = 100;
export const UI_TRANSITION_FRAME_EMA_WEIGHT = 0.1;
/** Where the average starts: a healthy 60 fps frame, so the first transition after boot is not gated by no data. */
export const UI_TRANSITION_FRAME_EMA_INITIAL_MS = 16.7;

export const advanceUiTransitionFrameAverageMs = (averageMs: number, frameDeltaMs: number): number => {
  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) {
    return averageMs;
  }
  const sample = Math.min(frameDeltaMs, UI_TRANSITION_FRAME_SAMPLE_MAX_MS);
  return averageMs + ((sample - averageMs) * UI_TRANSITION_FRAME_EMA_WEIGHT);
};

export const shouldSkipUiTransitionForFrameBudget = (averageFrameMs: number): boolean => (
  Number.isFinite(averageFrameMs) && averageFrameMs > UI_TRANSITION_MAX_AVERAGE_FRAME_MS
);

/** The shared loader period: the HTML boot splash dot and the in-game "Signing you in" diamond both pulse on the beat. */
export const UI_LOADER_PULSE_PERIOD_MS = MOTION_LOOP_MS.beat;

/** 0..1 loader pulse (a sine over the shared period); reduced motion holds it at the middle, still lit. */
export const resolveUiLoaderPulse = (timeMs: number, reducedMotion: boolean): number => (
  reducedMotion || !Number.isFinite(timeMs)
    ? 0.5
    : 0.5 + (0.5 * Math.sin((timeMs / UI_LOADER_PULSE_PERIOD_MS) * Math.PI * 2))
);

/** How long the static HTML boot splash takes to fade out: the slow step, or the 200 ms crossfade under reduced motion. */
export const resolveBootSplashFadeMs = (reducedMotion: boolean): number => (
  reducedMotion ? MOTION_REDUCED_MS.crossfade : MOTION_DURATION_MS.slow
);
