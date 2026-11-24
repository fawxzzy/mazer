import { resolveRainbowUiColor } from '../../render/rainbowUiPalette';

/**
 * The picked stars of the feedback popup wear the app's ONE rainbow UI material (src/render/rainbowUiPalette.ts, the
 * same colour the title lettering and the backdrop stars use) and shift through it slowly. Real pointed stars only:
 * the colour is a flat fill, never a glow, halo, blur or shadow (owner rule, 2026-11-19, asked three times).
 * Pure: no DOM, no wall clock (the popup passes the time in).
 */

/** One full lap of the spectrum. The same slow lap as the backdrop stars (BACKDROP_RAINBOW_HUE_PERIOD_MS). */
export const FEEDBACK_STAR_HUE_PERIOD_MS = 24000;

/** Hue gap between neighbouring stars, so a row of five reads as a slice of the rainbow, not five copies of one colour. */
export const FEEDBACK_STAR_HUE_SPREAD = 0.09;

/** How often the popup repaints the colour. The lap is 24 s, so 150 ms moves a channel by under 8 of 255. */
export const FEEDBACK_STAR_COLOUR_INTERVAL_MS = 150;

/** `#rrggbb` for the star at `index` (0-based) at scene time `timeMs`. */
export const resolveFeedbackStarColour = (index: number, timeMs: number): string => {
  const hue = (timeMs / FEEDBACK_STAR_HUE_PERIOD_MS) + (index * FEEDBACK_STAR_HUE_SPREAD);
  return `#${resolveRainbowUiColor(hue).toString(16).padStart(6, '0')}`;
};
