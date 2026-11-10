/**
 * Iridescent "midnight sun" colour and pulse for the play trail, as pure numeric functions.
 *
 * Look: an oil-slick / aurora sweep, not a rainbow. The hue travels back and forth through one band (cyan,
 * sky blue, violet, orchid-magenta, apricot) so it never visits the player's green, the goal's red or the
 * start's gold, and never wraps through a muddy RGB lerp. The crisp core is a pearly pastel; the soft bloom
 * around it carries the deep saturated version of the same hue (the "midnight" in midnight sun). Colour
 * shifts along the trail's length and, slowly, over time, so it reads as a sheen flowing along the route.
 *
 * Pulse: a slow brightness wave travels along the trail toward the player (the core eases toward white at the
 * crest and the bloom swells with it), and the whole trail breathes in width by a few percent. It only ever
 * BRIGHTENS the core from its resting colour, so the resting colour is the contrast floor: every resting
 * core stays at least 3:1 against the bare Chip fill (and far more against the dark underlay it sits on), at
 * every hue between the stops (tests/reset/trail-iridescence.test.ts pins the worst hue).
 *
 * Reduced motion: no time term and no wave; the colour is the static gradient along the trail's length and
 * the pulse level is a constant mid value (no banding), so the trail freezes to a still iridescent gradient.
 *
 * Cost: no allocation per call (one module-level scratch record), no gradients, no trig beyond one cos per
 * segment for the wave. The caller samples once per resampled trail segment, as it already did.
 */
/** The crest colour the pulse eases the core toward (pure white, so the pulse can only brighten). */
const PEARL = 0xffffff;

/** Resting core colours, in sweep order. Pastel by design: each is at least 3:1 on the chip (see header). */
export const IRIDESCENT_TRAIL_CORE_STOPS = Object.freeze([
  0x72e6ff, // cyan
  0x92c8ff, // sky blue
  0xc9b8ff, // violet
  0xff9fe2, // orchid magenta
  0xffc4a0 // apricot (the midnight-sun horizon)
] as const);

/** The same hues, deep and saturated: the bloom colour. Sampled with the same phase as the core. */
export const IRIDESCENT_TRAIL_GLOW_STOPS = Object.freeze([
  0x13b4e6,
  0x2f6bff,
  0x7b3dff,
  0xc936d8,
  0xff8a3d
] as const);

/** One full sweep (stop 0 out to the last stop and back) spans this many tiles of trail. */
export const IRIDESCENT_TRAIL_TILES_PER_SWEEP = 14;
/** ...and one full sweep drifts past a fixed point on the trail in this many ms. */
export const IRIDESCENT_TRAIL_SWEEP_PERIOD_MS = 9600;

/** Pulse wave: crest-to-crest length in tiles, and the time one crest takes to travel one wavelength. */
export const TRAIL_PULSE_WAVELENGTH_TILES = 8;
export const TRAIL_PULSE_PERIOD_MS = 2200;
/** At the crest the core is eased this far toward white (the trough is the resting colour). */
export const TRAIL_PULSE_CORE_LIFT_MAX = 0.3;
/** At the crest the bloom colour is eased this far toward the core colour (a brighter, paler bloom). */
export const TRAIL_PULSE_GLOW_LIFT_MAX = 0.35;
/** The whole trail breathes: widths scale between 1 and 1 + this, once per breath period. */
export const TRAIL_PULSE_WIDTH_SWING = 0.1;
export const TRAIL_PULSE_BREATH_PERIOD_MS = 3000;
/** The bloom's alpha ratio scales between (1 - this) and 1 with the breath. */
export const TRAIL_PULSE_GLOW_ALPHA_SWING = 0.3;
/** Reduced motion holds the wave at this level (0 = trough, 1 = crest): a constant, so there is no banding. */
export const TRAIL_PULSE_REDUCED_LEVEL = 0.35;

export interface IridescentTrailSample {
  /** Crisp core colour at this point (resting colour plus the pulse lift). */
  core: number;
  /** Bloom colour at this point. */
  glow: number;
  /** Wave level at this point, 0 (trough) .. 1 (crest). */
  wave: number;
}

const SCRATCH: IridescentTrailSample = { core: 0, glow: 0, wave: 0 };

const mixChannel = (a: number, b: number, t: number): number => Math.round(a + ((b - a) * t));

const mixRgb = (a: number, b: number, t: number): number => (
  (mixChannel((a >> 16) & 255, (b >> 16) & 255, t) << 16)
  | (mixChannel((a >> 8) & 255, (b >> 8) & 255, t) << 8)
  | mixChannel(a & 255, b & 255, t)
);

const fract = (v: number): number => v - Math.floor(v);

/** Position 0 .. 1 across the stops for a sweep phase: a triangle wave, so the hue goes out and back. */
const sweepPosition = (phase: number): number => 1 - Math.abs((2 * fract(phase)) - 1);

/** Resting colour from a sweep position 0..1 across `stops` (RGB lerp between neighbours). */
const sampleStops = (stops: readonly number[], position: number): number => {
  const scaled = Math.max(0, Math.min(1, position)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixRgb(stops[index]!, stops[index + 1]!, scaled - index);
};

/** Resting (no pulse) core colour at a trail distance (in tiles) and time. Pure. */
export const resolveIridescentRestingCore = (distanceTiles: number, timeMs: number): number => (
  sampleStops(
    IRIDESCENT_TRAIL_CORE_STOPS,
    sweepPosition((distanceTiles / IRIDESCENT_TRAIL_TILES_PER_SWEEP) + (timeMs / IRIDESCENT_TRAIL_SWEEP_PERIOD_MS))
  )
);

/** Pulse wave level 0..1 at a trail distance (tiles) and time. The crest travels toward the player (+distance). */
export const resolveTrailPulseWave = (distanceTiles: number, timeMs: number): number => (
  0.5 + (0.5 * Math.cos(2 * Math.PI * ((distanceTiles / TRAIL_PULSE_WAVELENGTH_TILES) - (timeMs / TRAIL_PULSE_PERIOD_MS))))
);

/**
 * Core, bloom and wave level at a point of the trail. `distanceTiles` is the physical distance along the
 * trail in tiles (stable on a cell, see the scene's origin-advance accounting). Fills and returns a shared
 * scratch record: read it before the next call.
 */
export const sampleIridescentTrail = (
  distanceTiles: number,
  timeMs: number,
  reducedMotion: boolean,
  out: IridescentTrailSample = SCRATCH
): IridescentTrailSample => {
  const t = reducedMotion ? 0 : timeMs;
  const phase = (distanceTiles / IRIDESCENT_TRAIL_TILES_PER_SWEEP) + (t / IRIDESCENT_TRAIL_SWEEP_PERIOD_MS);
  const position = sweepPosition(phase);
  const wave = reducedMotion ? TRAIL_PULSE_REDUCED_LEVEL : resolveTrailPulseWave(distanceTiles, timeMs);
  const restingCore = sampleStops(IRIDESCENT_TRAIL_CORE_STOPS, position);
  const restingGlow = sampleStops(IRIDESCENT_TRAIL_GLOW_STOPS, position);
  out.core = mixRgb(restingCore, PEARL, TRAIL_PULSE_CORE_LIFT_MAX * wave);
  out.glow = mixRgb(restingGlow, restingCore, TRAIL_PULSE_GLOW_LIFT_MAX * wave);
  out.wave = wave;
  return out;
};

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
