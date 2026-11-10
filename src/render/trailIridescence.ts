/**
 * Iridescent "midnight sun" trail: the whole-trail breath (width and bloom alpha) and the re-export of the palette.
 *
 * The colour itself (the hue sweep, the slow swell, the travelling sheen band, the 3:1-on-the-chip floor, the reduced
 * motion rule) lives in trailPalette.ts, the single source of truth that the trail and the edge diamonds' border both
 * read, so they cannot drift. This module keeps its historical import surface (`sampleIridescentTrail`, the stops and
 * the timing constants) by re-exporting it, and adds the breath.
 *
 * Breath: the whole trail breathes in width by a few percent and the bloom alpha swells with it. It only ever WIDENS
 * the trail from its resting width, so the width and contrast floors hold at every breath level. Reduced motion holds
 * a constant mid level.
 */
export {
  IRIDESCENT_TRAIL_CORE_STOPS,
  IRIDESCENT_TRAIL_GLOW_STOPS,
  IRIDESCENT_TRAIL_SWEEP_PERIOD_MS,
  IRIDESCENT_TRAIL_TILES_PER_SWEEP,
  TRAIL_PULSE_CORE_LIFT_MAX,
  TRAIL_PULSE_GLOW_LIFT_MAX,
  TRAIL_PULSE_PERIOD_MS,
  TRAIL_PULSE_REDUCED_LEVEL,
  TRAIL_PULSE_WAVELENGTH_TILES,
  TRAIL_SHEEN_CORE_LIFT_MAX,
  TRAIL_SHEEN_GLOW_LIFT_MAX,
  TRAIL_SHEEN_HUE_SHIFT,
  TRAIL_SHEEN_PERIOD_MS,
  TRAIL_SHEEN_SPACING_TILES,
  resolveIridescentBaseCore,
  resolveIridescentPosition,
  resolveIridescentRestingCore,
  resolveTrailPulseWave,
  resolveTrailSheen,
  sampleIridescentTrail,
  type IridescentTrailSample
} from './trailPalette';

/** The whole trail breathes: widths scale between 1 and 1 + this, once per breath period. */
export const TRAIL_PULSE_WIDTH_SWING = 0.1;
export const TRAIL_PULSE_BREATH_PERIOD_MS = 3000;
/** The bloom's alpha ratio scales between (1 - this) and 1 with the breath. */
export const TRAIL_PULSE_GLOW_ALPHA_SWING = 0.3;

/** Whole-trail breath 0..1 (constant mid level in reduced motion, so widths and bloom hold still). */
export const resolveTrailBreath = (timeMs: number, reducedMotion: boolean): number => (
  reducedMotion ? 0.5 : 0.5 + (0.5 * Math.sin((2 * Math.PI * timeMs) / TRAIL_PULSE_BREATH_PERIOD_MS))
);

/** Width multiplier for a breath level: 1 .. 1 + TRAIL_PULSE_WIDTH_SWING (never narrower than the resting width). */
export const resolveTrailWidthScale = (breath: number): number => 1 + (TRAIL_PULSE_WIDTH_SWING * breath);

/** Bloom alpha-ratio multiplier for a breath level: (1 - swing) .. 1. */
export const resolveTrailGlowAlphaScale = (breath: number): number => (
  (1 - TRAIL_PULSE_GLOW_ALPHA_SWING) + (TRAIL_PULSE_GLOW_ALPHA_SWING * breath)
);
