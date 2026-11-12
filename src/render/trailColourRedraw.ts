/**
 * How often a COLOUR-ONLY trail redraw runs (MAZER-PERF-003).
 *
 * Owner rule (2026-11-12): reduced motion stops movement and pulsing, never colour (reducedMotion.ts). With the
 * movement gone, the only thing that still changes the trail every frame is the hue sweep on the colour clock, so the
 * redraw that carries it is a pure battery cost. This module lowers that cadence under reduced motion without the hue
 * visibly stopping or stepping.
 *
 * The numbers (all pinned and measured by tests/render/trail-colour-redraw.test.ts):
 *  - full motion: one redraw every 33 ms (about 30 a second), exactly as before. UNCHANGED.
 *  - reduced motion: one redraw every 45 ms. On a 60 Hz or 120 Hz display that lands on every 3rd / 6th frame, so about
 *    20 redraws a second (one third fewer than 30). A rate of 20 Hz or more reads as continuous colour drift.
 *  - The hue sweep is a triangle wave over 3600 ms (trailPalette.ts), so the fastest a trail channel moves is a fixed
 *    number of 8-bit units a second. At the nominal 50 ms redraw gap the crisp core moves at most 8 units per channel
 *    between redraws (the full-motion 33 ms cadence is 5) and the soft bloom at most 17 (full motion: 12; bound pinned at 18).
 *    A 15 Hz cadence (66 ms) was rejected: it would put the core at 10 and the bloom at 22 units a step.
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency.
 */

/** Redraw gap while the colour drifts at full motion (the long-standing value). */
export const TRAIL_COLOUR_REDRAW_INTERVAL_MS = 33;

/** Redraw gap while the colour drifts under reduced motion. */
export const TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS = 45;

/** Largest per-channel (0..255) change of the crisp core colour allowed between two redraws at the nominal reduced cadence. */
export const TRAIL_COLOUR_MAX_CORE_STEP = 8;

/** Same bound for the soft bloom colour (it spans a wider colour range but is drawn at low alpha). */
export const TRAIL_COLOUR_MAX_GLOW_STEP = 18;

/** The redraw gap for the current motion setting. */
export const resolveTrailColourRedrawIntervalMs = (reducedMotion: boolean): number => (
  reducedMotion ? TRAIL_COLOUR_REDRAW_INTERVAL_REDUCED_MS : TRAIL_COLOUR_REDRAW_INTERVAL_MS
);

/** Redraws a second at a steady frame rate, for display and tests. */
export const resolveTrailColourRedrawRateHz = (reducedMotion: boolean): number => (
  1000 / resolveTrailColourRedrawIntervalMs(reducedMotion)
);

/**
 * The scheduler step: is a colour redraw due at `timeMs`, and when is the next one?
 * `nextDueAtMs` 0 (or any past time) means "due now". A non-finite time never redraws.
 */
export const stepTrailColourRedraw = (
  timeMs: number,
  nextDueAtMs: number,
  reducedMotion: boolean
): { due: boolean; nextDueAtMs: number } => {
  if (!Number.isFinite(timeMs) || timeMs < nextDueAtMs) {
    return { due: false, nextDueAtMs };
  }
  return { due: true, nextDueAtMs: timeMs + resolveTrailColourRedrawIntervalMs(reducedMotion) };
};
