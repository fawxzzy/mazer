/**
 * The ONE source of truth for the player's colour and the live iridescent trail palette.
 *
 * Everything that must "match the trail" or "match the player" reads it from here, so the pieces cannot drift:
 *  - the play trail (`sampleIridescentTrail`, via trailIridescence.ts and MenuScene);
 *  - the edge diamonds' border (`resolveTrailPaletteBorderColor`, edgeMarkers.ts): the trail's own colour at the
 *    trail head, at the same animation time and with the same reduced-motion rule;
 *  - the colour inside the diamonds and the spawn/wrap beams when the player "shoots out" (`PLAYER_COLOR`), and the
 *    player marker itself (boardTileStyle.ts `boardMaterial.player`).
 *
 * Look: an oil-slick / aurora sweep, not a rainbow. The hue travels back and forth through one band (cyan, sky blue,
 * violet, orchid-magenta, apricot), so it never visits the player's green, the goal's red or the start's gold and never
 * wraps through a muddy RGB lerp. The crisp core is a pearly pastel; the soft bloom carries the deep saturated version
 * of the same hue. Pastel is not a taste choice: the core must clear 3:1 on the mid-tone Chip fill, which caps how
 * saturated it can be (tests/reset/trail-iridescence.test.ts pins the worst hue).
 *
 * Making the shift SEEABLE (owner feedback: the 2026-11-10 sweep, one hue loop per 14 tiles and 9.6 s, was too slow to
 * read as movement):
 *  - the hue gradient is short and quick: a full out-and-back sweep spans 8 tiles and drifts past a fixed point in
 *    3.6 s, so on a phone a full cyan-to-apricot gradient is about 120 px long and visibly flows along the trail;
 *  - a SHEEN band travels toward the player (a narrow, sharp bright band, 9 tiles apart, about 3 tiles a second). Where
 *    it passes, the core eases toward white AND the hue is refracted a fraction of a sweep ahead, like light on an oil
 *    film, so the highlight is also a visible colour change rather than just a brighter patch;
 *  - MAZER-VIS-037: the band is bounded so no core channel moves more than TRAIL_COLOUR_MAX_CORE_STEP (8 of 255) between
 *    two redraws at the 33 ms full-motion cadence. It used to step up to 20 (peak lift 0.55, ridge = cosine^5, 6 tiles a
 *    second, hue refraction 0.2); it is now softer and slower (peak lift 0.35, ridge = cosine^3, 3 tiles a second,
 *    refraction 0.05). Pinned in tests/render/trail-sheen-colour-step.test.ts.
 *  - the broad slow swell of the old pulse stays, gentler, under the sheen.
 * Nothing in the lift terms darkens the core: lifts only mix toward white, so the resting colour at the (shifted) hue
 * position is the contrast floor.
 *
 * Reduced motion (and Trail Shine off): no time term, no sheen, a constant swell level: a still gradient along the trail.
 *
 * Cost: no allocation per call (one module-level scratch record), no gradients, two cosines per sample.
 */
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { MOTION_LOOP_MS } from './motionScale';

/** The player's colour: token semantic.energy. The player marker, and everything that "shoots out" of it, uses this. */
/** Neutral and accent literals shared by render modules (values unchanged from their former call sites). */
export const PALETTE_WHITE = 0xffffff;
export const PALETTE_WHITE_CSS = '#ffffff';
export const PALETTE_MASK_BLACK_CSS = '#000';
export const PALETTE_PLAYER_ACCENT = 0x2bb868;

/** Internal visual-proof tool CSS colours (values unchanged from their former call sites in src/visual-proof/*). */
export const PROOF_TRAIL_ACTIVE_CSS = '#1BCFEA';
export const PROOF_CUE_OUTLINE_CSS = '#03141A';
export const PROOF_HEAD_FILL_CSS = '#f8fbff';
export const PROOF_PLAYER_CORE_CSS = '#FFFFFF';
export const PROOF_CUE_CYAN_CSS = '#53E6FF';
export const PROOF_OBJECTIVE_CSS = '#FFD166';
export const PROOF_ENEMY_CSS = '#FF5C8A';
export const PROOF_SHELL_OUTER_ACCENT_CSS = '#5fe3ff';
export const PROOF_SHELL_MIDDLE_ACCENT_CSS = '#84ffbe';
export const PROOF_SHELL_CORE_ACCENT_CSS = '#ffd678';

export const PLAYER_COLOR: number = cyberArcadeMaterial.signal.player;

/** The crest colour the lifts ease the core toward (pure white, so a lift can only brighten). */
const PEARL = 0xffffff;

/**
 * Resting core colours, in sweep order: saturated neon cabinet colours (MAZER-VIS-051 round 2). The core is read against
 * its own near-opaque dark underlay (trailLegibility.ts), not the mid-tone chip, so the contract is core-vs-underlay.
 * Neighbouring stops stay within ~80 on every channel so the per-redraw colour step bounds hold.
 */
export const IRIDESCENT_TRAIL_CORE_STOPS = Object.freeze([
  0x10dcff, // neon cyan
  0x38b0ff, // electric azure
  0x5c96ff, // laser blue
  0x8678ff, // electric indigo
  0xb85cff, // neon violet
  0xdc46f0 // hot magenta
] as const);

/** The same hues, deep and saturated: the bloom colour. Sampled with the same phase as the core. */
export const IRIDESCENT_TRAIL_GLOW_STOPS = Object.freeze([
  0x00b2d8,
  0x1c82e0,
  0x2f66e0,
  0x4a3cd8,
  0x7a1fd8,
  0xb01cb8
] as const);

// Navigation Core v1's own ENERGY palette (read directly out of the frozen
// reference's embedded generator, docs/assets/reference/navigation-core-v1/
// mazer-navigation-core-v1-approved.html: `ENERGY = [...]`) -- cyan, blue,
// violet, magenta dominant; red, orange, yellow brief accents; green a
// transition tone, exactly as the visual contract describes, and in this
// exact cyclic order. Never the old LEGACY_IRIDESCENT_MIDNIGHT_STOPS
// palette, which doesn't match this contract (different hues, no true
// cool/warm weighting).
export const NAVIGATION_CORE_TRAIL_ENERGY_STOPS = [
  0x00d4ff,
  0x2f8bff,
  0x8b3ff0,
  0xe030c0,
  0xff3d5c,
  0xff8a2f,
  0xffd23d,
  0x3de07a
] as const;

/** One full sweep (stop 0 out to the last stop and back) spans this many tiles of trail. */
export const IRIDESCENT_TRAIL_TILES_PER_SWEEP = 8;
/** ...and one full sweep drifts past a fixed point on the trail in this many ms. */
export const IRIDESCENT_TRAIL_SWEEP_PERIOD_MS = MOTION_LOOP_MS.drift;

/** Slow swell: crest-to-crest length in tiles, and the time one crest takes to travel one wavelength. */
export const TRAIL_PULSE_WAVELENGTH_TILES = 8;
export const TRAIL_PULSE_PERIOD_MS = 2200;
/** At the swell's crest the core is eased this far toward white (the trough is the resting colour). */
export const TRAIL_PULSE_CORE_LIFT_MAX = 0.08;
/** At the swell's crest the bloom colour is eased this far toward the core colour (a brighter, paler bloom). */
export const TRAIL_PULSE_GLOW_LIFT_MAX = 0.12;
/** Reduced motion holds the swell at this level (0 = trough, 1 = crest): a constant, so there is no banding. */
export const TRAIL_PULSE_REDUCED_LEVEL = 0.35;

/** Sheen band: distance between bands in tiles, and the time one band takes to travel one spacing (toward the player). */
export const TRAIL_SHEEN_SPACING_TILES = 9;
export const TRAIL_SHEEN_PERIOD_MS = 6000;
/** At the band's peak the core is eased this far toward white, and the bloom this far toward the core. */
export const TRAIL_SHEEN_CORE_LIFT_MAX = 0.3;
export const TRAIL_SHEEN_GLOW_LIFT_MAX = 0.35;
/** At the band's peak the hue is read this much of a sweep AHEAD (refraction): the band carries its own colour. */
export const TRAIL_SHEEN_HUE_SHIFT = 0.02;

export interface IridescentTrailSample {
  /** Crisp core colour at this point (resting colour plus the swell and sheen lifts). */
  core: number;
  /** Bloom colour at this point. */
  glow: number;
  /** Slow swell level at this point, 0 (trough) .. 1 (crest). */
  wave: number;
  /** Sheen band level at this point, 0 (none) .. 1 (band peak). Always 0 in reduced motion. */
  sheen: number;
}

const SCRATCH: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };

const mixChannel = (a: number, b: number, t: number): number => Math.round(a + ((b - a) * t));

export const mixPaletteRgb = (a: number, b: number, t: number): number => (
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
  return mixPaletteRgb(stops[index]!, stops[index + 1]!, scaled - index);
};

/** Resting (no lift, no sheen refraction) core colour at a trail distance (in tiles) and time. Pure. */
export const resolveIridescentRestingCore = (distanceTiles: number, timeMs: number): number => (
  sampleStops(
    IRIDESCENT_TRAIL_CORE_STOPS,
    sweepPosition((distanceTiles / IRIDESCENT_TRAIL_TILES_PER_SWEEP) + (timeMs / IRIDESCENT_TRAIL_SWEEP_PERIOD_MS))
  )
);

/** Slow swell level 0..1 at a trail distance (tiles) and time. The crest travels toward the player (+distance). */
export const resolveTrailPulseWave = (distanceTiles: number, timeMs: number): number => (
  0.5 + (0.5 * Math.cos(2 * Math.PI * ((distanceTiles / TRAIL_PULSE_WAVELENGTH_TILES) - (timeMs / TRAIL_PULSE_PERIOD_MS))))
);

/**
 * Sheen band level 0..1 at a trail distance (tiles) and time: a narrow ridge (the raised cosine cubed)
 * travelling toward the player (+distance).
 */
export const resolveTrailSheen = (distanceTiles: number, timeMs: number): number => {
  const base = 0.5 + (0.5 * Math.cos(2 * Math.PI * ((distanceTiles / TRAIL_SHEEN_SPACING_TILES) - (timeMs / TRAIL_SHEEN_PERIOD_MS))));
  const squared = base * base;
  return squared * base;
};

/**
 * The sweep position 0..1 the core and bloom are read at, including the sheen's hue refraction.
 *
 * `motionStopped` stops MOVEMENT only (the travelling sheen band and, in `sampleIridescentTrail`, the swell). The hue
 * sweep is COLOUR and always follows `timeMs` (MAZER-MOTION-004: reduced motion never freezes colour); a caller that
 * wants a fully static trail passes `timeMs` 0 as well.
 */
export const resolveIridescentPosition = (distanceTiles: number, timeMs: number, motionStopped: boolean): number => {
  const sheen = motionStopped ? 0 : resolveTrailSheen(distanceTiles, timeMs);
  return sweepPosition(
    (distanceTiles / IRIDESCENT_TRAIL_TILES_PER_SWEEP)
    + (timeMs / IRIDESCENT_TRAIL_SWEEP_PERIOD_MS)
    + (TRAIL_SHEEN_HUE_SHIFT * sheen)
  );
};

/** The palette at the sample's own hue position, with no lifts: the contrast floor the lifts only brighten from. */
export const resolveIridescentBaseCore = (distanceTiles: number, timeMs: number, motionStopped: boolean): number => (
  sampleStops(IRIDESCENT_TRAIL_CORE_STOPS, resolveIridescentPosition(distanceTiles, timeMs, motionStopped))
);

/**
 * Core, bloom, swell and sheen at a point of the trail. `distanceTiles` is the physical distance along the trail in
 * tiles (stable on a cell, see the scene's origin-advance accounting). Fills and returns a shared scratch record:
 * read it before the next call. `motionStopped` holds the sheen band and the swell still; the hue sweep still follows
 * `timeMs` (see resolveIridescentPosition).
 */
export const sampleIridescentTrail = (
  distanceTiles: number,
  timeMs: number,
  motionStopped: boolean,
  out: IridescentTrailSample = SCRATCH
): IridescentTrailSample => {
  const sheen = motionStopped ? 0 : resolveTrailSheen(distanceTiles, timeMs);
  const position = resolveIridescentPosition(distanceTiles, timeMs, motionStopped);
  const wave = motionStopped ? TRAIL_PULSE_REDUCED_LEVEL : resolveTrailPulseWave(distanceTiles, timeMs);
  const restingCore = sampleStops(IRIDESCENT_TRAIL_CORE_STOPS, position);
  const restingGlow = sampleStops(IRIDESCENT_TRAIL_GLOW_STOPS, position);
  const coreLift = Math.min(1, (TRAIL_PULSE_CORE_LIFT_MAX * wave) + (TRAIL_SHEEN_CORE_LIFT_MAX * sheen));
  const glowLift = Math.min(1, (TRAIL_PULSE_GLOW_LIFT_MAX * wave) + (TRAIL_SHEEN_GLOW_LIFT_MAX * sheen));
  out.core = mixPaletteRgb(restingCore, PEARL, coreLift);
  out.glow = mixPaletteRgb(restingGlow, restingCore, glowLift);
  out.wave = wave;
  out.sheen = sheen;
  return out;
};

/**
 * The edge diamonds' border colour: the trail's own core colour at the trail head (`headDistanceTiles`, the physical
 * distance of the player's end of the trail; 0 when there is no trail), at the same animation time and reduced-motion
 * state. It is literally `sampleIridescentTrail(...).core`, so a diamond and the trail beside the player are one colour.
 */
export const resolveTrailPaletteBorderColor = (
  headDistanceTiles: number,
  timeMs: number,
  motionStopped: boolean
): number => sampleIridescentTrail(headDistanceTiles, timeMs, motionStopped, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;

/** The trail head the scene records on every trail draw (MenuScene `trailPaletteHead`); null when there is no trail (menu). */
export interface TrailPaletteHeadSample {
  readonly distanceTiles?: number;
  readonly timeMs?: number;
  readonly animated?: boolean;
}

/**
 * THE shared border colour (MAZER-VIS-053): the colour of the edge markers' border AND of the end star's border. Both call
 * this one function with the same inputs, so the star and the corner diamonds can never show two different colours.
 * `timeMs` is the scene clock (used when the trail has no clock of its own, e.g. the menu); `head` is the trail head sample
 * (null = no trail: distance 0). Reduced motion and an un-animated trail (Trail Shine off) stop the sheen and swell.
 */
export const resolveSharedBorderColor = (
  head: TrailPaletteHeadSample | null | undefined,
  timeMs: number,
  reducedMotion: boolean
): number => resolveTrailPaletteBorderColor(
  Number.isFinite(head?.distanceTiles) ? (head?.distanceTiles ?? 0) : 0,
  Number.isFinite(head?.timeMs) ? (head?.timeMs ?? timeMs) : timeMs,
  reducedMotion || head?.animated === false
);

// MAZER-UI-031 slice 2: legacy iridescent material colours (moved verbatim from legacyIridescentMaterial.ts).
export const LEGACY_IRIDESCENT_MIDNIGHT_STOPS_VALUE = [
  0x8b2fe0,
  0x4a2fe0,
  0x2f7fe0,
  0x2fe0c0,
  0x2fe06a,
  0xe02f9c
] as const;
export const LEGACY_IRIDESCENT_PATH_FALLBACK_PINK = 0xff61c7;
export const LEGACY_IRIDESCENT_BLACK = 0x000000;
