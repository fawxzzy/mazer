/**
 * MAZER-VIS-035: a small share of the background stars keep a rainbow-y hue that drifts slowly through the spectrum.
 * Pure policy and colour maths, no Phaser, DOM, randomness or wall clock (MenuScene.drawBackdrop paints; this decides).
 *
 * Owner request, 2026-11-13: "can we make some of the stars in the background still rainbow-y colour". The word
 * "still" points at the colour-shifting backdrop stars the owner remembers; the coloured four-point sparkles were
 * retired on 2026-11-10 (src/render/backdropStars.ts) and the stars have been white, pale blue and warm white since.
 *
 * What this does and does not change (decided direction kept):
 *  - Every star is still a round point of light drawn through resolveBackdropStarDraw. No glyphs, no crosses.
 *  - Only a fixed ~20 % subset is coloured. Which stars is a pure function of the star's persisted `seed`
 *    (legacyMenuBackdrop.ts), so it is stable for the star's whole life, identical on every load (the initial field is
 *    seeded, backdropStars.ts) and never re-rolled per frame. The old per-frame strobe bug came from deriving identity
 *    from the drifting position; nothing here reads a position.
 *  - Each rainbow star has its own hue phase offset (a second hash of the same seed) so they are never in lockstep,
 *    and the whole spectrum is one slow lap (BACKDROP_RAINBOW_HUE_PERIOD_MS), not a fast cycle, which is what the
 *    2026-11 owner note asked for ("stable per-star colour over rapid cycling through unrelated hues").
 *  - Stars stay dim so the maze, trail and diamonds remain the focus: saturation is capped (pastel, never neon),
 *    value is capped below full white, and the alpha a rainbow star can reach is capped below a white star's ceiling.
 *  - Reduced motion (and Animated Background "Still") stop the drift and twinkle, never colour (reducedMotion.ts):
 *    the hue reads the scene clock in every motion mode, and the redraw that carries it is the low-rate colour gate
 *    below instead of the per-frame star-drift redraw.
 *
 * Colours are computed from HSV with the named constants below. There are no colour literals here, so the
 * off-theme colour ratchet (tests/architecture/off-theme-color-ratchet.test.ts) has nothing to count.
 */

/** Share of the star field that carries the drifting rainbow hue (target about one in five). */
export const BACKDROP_RAINBOW_STAR_SHARE = 0.2;

/** One full lap of the spectrum. Slow: a star's colour changes by a visible step only over several seconds. */
export const BACKDROP_RAINBOW_HUE_PERIOD_MS = 24000;

/** HSV saturation of a rainbow star: pastel, so the colour is a tint on a point of light, not a neon dot. */
export const BACKDROP_RAINBOW_SATURATION = 0.5;

/** HSV value of a rainbow star: kept under full so it never outshines a white star. */
export const BACKDROP_RAINBOW_VALUE = 0.92;

/** The most opaque a rainbow star (or its halo) can be. White stars reach about 0.74 at the bright end of a twinkle. */
export const BACKDROP_RAINBOW_ALPHA_CAP = 0.6;

/**
 * Gap between colour-only backdrop redraws when the star drift redraw is not running (reduced motion or Animated
 * Background "Still"). A lap is 24 s and a colour channel sweeps about 0.5 of its 8-bit range per sixth of a lap, so
 * one redraw every 250 ms moves a channel by at most 8 units, the same bound the trail colour redraw keeps
 * (trailColourRedraw.ts TRAIL_COLOUR_MAX_CORE_STEP). At 4 redraws a second this is a fifth of the reduced-motion trail
 * redraw rate; the field is drawn only for the colour, which is far dimmer than the trail.
 */
export const BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS = 250;

const UINT32 = 4294967296;
const SUBSET_SALT = 0x9e3779b9;
const PHASE_SALT = 0x7f4a7c15;

/** murmur3-style finaliser over the seed's bits plus a salt: a stable, well mixed unit value in [0, 1). */
const hashSeedUnit = (seed: number, salt: number): number => {
  const bits = Number.isFinite(seed) ? Math.floor((seed - Math.floor(seed)) * UINT32) >>> 0 : 0;
  let h = (bits ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / UINT32;
};

/** Is the star with this persisted seed one of the rainbow stars? Stable for the star's whole life. */
export const isBackdropRainbowStar = (seed: number): boolean => (
  hashSeedUnit(seed, SUBSET_SALT) < BACKDROP_RAINBOW_STAR_SHARE
);

/** The star's own hue phase offset in [0, 1): different stars sit at different points of the spectrum. */
export const resolveBackdropRainbowPhase = (seed: number): number => hashSeedUnit(seed, PHASE_SALT);

/** Hue in [0, 1) for a star at a scene time: its phase offset plus one lap per BACKDROP_RAINBOW_HUE_PERIOD_MS. */
export const resolveBackdropRainbowHue = (seed: number, timeMs: number): number => {
  const lap = Number.isFinite(timeMs) ? timeMs / BACKDROP_RAINBOW_HUE_PERIOD_MS : 0;
  const hue = resolveBackdropRainbowPhase(seed) + lap;
  return hue - Math.floor(hue);
};

/** HSV to a packed 0xRRGGBB number. Numbers only, so a call allocates nothing. */
export const backdropHsvToRgb = (hue: number, saturation: number, value: number): number => {
  const h = (hue - Math.floor(hue)) * 6;
  const sector = Math.floor(h);
  const f = h - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - (saturation * f));
  const t = value * (1 - (saturation * (1 - f)));
  let r: number;
  let g: number;
  let b: number;
  switch (sector) {
    case 0: r = value; g = t; b = p; break;
    case 1: r = q; g = value; b = p; break;
    case 2: r = p; g = value; b = t; break;
    case 3: r = p; g = q; b = value; break;
    case 4: r = t; g = p; b = value; break;
    default: r = value; g = p; b = q; break;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
};

/** The packed colour of a rainbow star at a scene time. */
export const resolveBackdropRainbowColor = (seed: number, timeMs: number): number => (
  backdropHsvToRgb(resolveBackdropRainbowHue(seed, timeMs), BACKDROP_RAINBOW_SATURATION, BACKDROP_RAINBOW_VALUE)
);

/** A rainbow star's alpha is held under BACKDROP_RAINBOW_ALPHA_CAP; any other star's alpha is returned unchanged. */
export const capBackdropStarAlpha = (alpha: number, rainbow: boolean): number => (
  rainbow ? Math.min(alpha, BACKDROP_RAINBOW_ALPHA_CAP) : alpha
);

/**
 * The colour-only redraw gate for the backdrop (the same shape as stepTrailColourRedraw in trailColourRedraw.ts):
 * is a redraw due at `timeMs`, and when is the next one? `nextDueAtMs` 0 (or any past time) means "due now".
 * A non-finite time never redraws.
 */
export const stepBackdropColourRedraw = (
  timeMs: number,
  nextDueAtMs: number
): { due: boolean; nextDueAtMs: number } => {
  if (!Number.isFinite(timeMs) || timeMs < nextDueAtMs) {
    return { due: false, nextDueAtMs };
  }
  return { due: true, nextDueAtMs: timeMs + BACKDROP_RAINBOW_COLOUR_REDRAW_INTERVAL_MS };
};
