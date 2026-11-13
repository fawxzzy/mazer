/**
 * Bounded colour step for the wrap-dock glow (MAZER-PERF-007 follow-up, owner 2026-11-13: "there's a possible
 * colour-step risk at the sheen crossing. fix it").
 *
 * Cause. The dock glow is painted in the trail's own colour at the trail head (`resolveBleedGlowColor`). That colour
 * includes the travelling SHEEN: a narrow ridge (about 6 tiles a second) that lifts the core toward pearl and refracts
 * the hue as it passes the head. Before MAZER-PERF-007 the glow redrew every frame (60 Hz: up to 11 units of a channel
 * per redraw as the ridge crossed). On the shared 33 ms colour-redraw schedule the same ridge is sampled at about
 * 30 Hz, so the colour the glow shows jumps up to 20 units per redraw (up to 44 for the bloom, which the dock does not
 * use). A moving player makes it worse, because the head distance changes under the ridge as well as the time.
 * Interpolating between redraws would mean redrawing more often, which is the cost this card removes, so the step is
 * bounded at the source instead.
 *
 * Bound. The glow colour follows the trail-head colour but never moves more than `BLEED_GLOW_MAX_COLOUR_STEP`
 * (= TRAIL_COLOUR_MAX_CORE_STEP, 8 of 255 on the worst channel) between two consecutive redraws, scaled down in
 * proportion to a shorter gap so the SLEW RATE (8 units per 33 ms, about 240 a second) is the same at any redraw rate.
 * The move goes along the straight line toward the target (every channel scaled by one factor), so the hue is never
 * skewed by one channel hitting its limit before another. Where the target moves slower than that, which is the
 * whole hue sweep at both motion settings (5 units per 33 ms at full motion, 7 per 45 ms under reduced motion), the
 * glow equals the trail-head colour exactly: reduced motion keeps its colour drift and is not slowed. Only the
 * sheen ridge, the one thing that moves faster, is softened: the dock's flash rises over about three redraws
 * instead of one, and its peak is shaved a little. The trail itself is not changed here.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */
import { TRAIL_COLOUR_MAX_CORE_STEP, TRAIL_COLOUR_REDRAW_INTERVAL_MS } from './trailColourRedraw';

/** Largest per-channel (0..255) change of the glow colour between two consecutive redraws. */
export const BLEED_GLOW_MAX_COLOUR_STEP = TRAIL_COLOUR_MAX_CORE_STEP;

/** After a longer gap than this since the last redraw the glow was not on screen or the clock was paused: resync, no ramp. */
export const BLEED_GLOW_COLOUR_RESYNC_GAP_MS = 250;

/** The step allowed over a redraw gap of `gapMs`: the same slew rate at every redraw cadence, never above the bound. */
export const resolveBleedGlowStepLimit = (gapMs: number): number => (
  Math.max(1, Math.min(
    BLEED_GLOW_MAX_COLOUR_STEP,
    Math.ceil((BLEED_GLOW_MAX_COLOUR_STEP / TRAIL_COLOUR_REDRAW_INTERVAL_MS) * gapMs)
  ))
);

const channels = (colour: number): [number, number, number] => [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

/** Move `previous` toward `target` along the straight line by at most `maxStep` on the worst channel. */
export const limitColourStep = (previous: number, target: number, maxStep: number): number => {
  const [pr, pg, pb] = channels(previous);
  const [tr, tg, tb] = channels(target);
  const dr = tr - pr;
  const dg = tg - pg;
  const db = tb - pb;
  const worst = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
  if (worst <= maxStep) {
    return target;
  }
  const scale = maxStep / worst;
  return pack(pr + Math.round(dr * scale), pg + Math.round(dg * scale), pb + Math.round(db * scale));
};

/** Per-scene state: the colour the glow last painted and when. */
export class BleedGlowColourSmoother {
  private lastColour: number | null = null;
  private lastTimeMs = Number.NEGATIVE_INFINITY;

  /** The colour to paint for the trail-head colour `target` at scene time `timeMs`. A repeat call at the same time is stable. */
  next(target: number, timeMs: number): number {
    if (!Number.isFinite(timeMs)) {
      return target;
    }
    const gap = timeMs - this.lastTimeMs;
    if (this.lastColour === null || gap > BLEED_GLOW_COLOUR_RESYNC_GAP_MS || gap < 0) {
      this.lastColour = target;
    } else if (gap > 0) {
      this.lastColour = limitColourStep(this.lastColour, target, resolveBleedGlowStepLimit(gap));
    } else {
      return this.lastColour;
    }
    this.lastTimeMs = timeMs;
    return this.lastColour;
  }

  reset(): void {
    this.lastColour = null;
    this.lastTimeMs = Number.NEGATIVE_INFINITY;
  }
}
