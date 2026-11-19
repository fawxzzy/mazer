/**
 * The ONE source of truth for the player's colour (lane "edge stars smooth + rainbow + shared player colour").
 *
 * Everything that is "the player's colour" reads it from here, so changing it once recolours all of them:
 *  - the player (the Spark kite, sparkPlayerSkin.ts `resolveSparkMaterial`);
 *  - the trail (trailIridescence.ts re-exports `samplePlayerColour` as `sampleIridescentTrail`, which the scene's trail
 *    draw and the Star dust sparkles read);
 *  - the edge beams (the player-energy lasers) and the colour inside the edge stars (edgeBeamArt.ts, edgeMarkers.ts),
 *    which take `resolvePlayerColour` / `resolvePlayerBorderColour`;
 *  - the edge star borders, the end star border and the bleed glow, which take `resolveSharedBorderColor` (this module's
 *    setting-aware version of the trailPalette.ts function of the same name).
 * tests/render/playerColour.test.ts pins every one of these, and scans the source so a new consumer cannot bypass it.
 *
 * Today the colour is the SHIFTING RAINBOW: the iridescent trail palette (trailPalette.ts), sampled at the trail head at
 * the trail's own clock, so the player, the lasers and the star fills are the same colour at the same instant as the
 * trail beside the player. `setPlayerColour(0xRRGGBB)` swaps it for one flat colour everywhere (the hook for a future
 * user-editable colour; nothing calls it yet and nothing persists it), `setPlayerColour(null)` returns to the rainbow.
 *
 * Reading is allocation-free: `samplePlayerColour` fills a caller-owned (or shared scratch) record, the rest return numbers.
 * No Phaser, no DOM, no storage.
 */
import {
  LEGACY_IRIDESCENT_BLACK,
  mixPaletteRgb,
  sampleIridescentTrail,
  type IridescentTrailSample,
  type TrailPaletteHeadSample
} from './trailPalette';

/** A flat colour's bloom is its core mixed this far toward black (the rainbow's own bloom is the deep version of its hue). */
export const PLAYER_COLOUR_FIXED_GLOW_DARKEN = 0.35;

const BLACK = LEGACY_IRIDESCENT_BLACK;
/** Largest 0xRRGGBB value (24 bits), computed so the file holds no colour literal. */
const MAX_COLOUR = (1 << 24) - 1;

/** null = the shifting rainbow (default); a number = that one flat 0xRRGGBB colour. */
let setting: number | null = null;
/** Bumped on every change, so a cache keyed on the player colour (a baked or redraw-gated canvas) can invalidate. */
let revision = 0;
let fixedGlow = 0;

const normalise = (colour: number): number => Math.max(0, Math.min(MAX_COLOUR, Math.round(colour))) >>> 0;

/**
 * The single setter. `null` (or a non-finite number) = the shifting rainbow; a finite number = one flat colour. Everything
 * that reads the player colour follows on its next frame.
 */
export const setPlayerColour = (colour: number | null): void => {
  const next = colour === null || !Number.isFinite(colour) ? null : normalise(colour);
  if (next === setting) {
    return;
  }
  setting = next;
  fixedGlow = next === null ? 0 : mixPaletteRgb(next, BLACK, PLAYER_COLOUR_FIXED_GLOW_DARKEN);
  revision += 1;
};

/** The flat colour in force, or null when the player colour is the shifting rainbow. */
export const getPlayerColourSetting = (): number | null => setting;

/** True while the player colour is the shifting rainbow (today, always, until something calls `setPlayerColour`). */
export const isPlayerColourRainbow = (): boolean => setting === null;

/** Changes whenever `setPlayerColour` changes the colour. */
export const getPlayerColourRevision = (): number => revision;

const SCRATCH: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };

/**
 * The player colour at a point of the trail: the rainbow palette sample (core, bloom, swell, sheen), or, with a flat colour
 * set, that colour as the core and its darker bloom (`wave` / `sheen` stay the rainbow's, they are motion levels the trail
 * art reads). Same arguments and scratch-record rules as `sampleIridescentTrail`.
 */
export const samplePlayerColour = (
  distanceTiles: number,
  timeMs: number,
  motionStopped: boolean,
  out: IridescentTrailSample = SCRATCH
): IridescentTrailSample => {
  sampleIridescentTrail(distanceTiles, timeMs, motionStopped, out);
  if (setting !== null) {
    out.core = setting;
    out.glow = fixedGlow;
  }
  return out;
};

const SCRATCH_HEAD: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };

/**
 * The player's colour right now, as one packed colour: the core colour at the trail head (the Spark's front facet colour).
 * `head` is the trail head the scene records on every trail draw (null: no trail, distance 0 on the scene clock);
 * reduced motion and an un-animated trail stop the sheen and swell, the hue sweep always follows the clock.
 */
export const resolvePlayerColour = (
  head: TrailPaletteHeadSample | null | undefined,
  timeMs: number,
  reducedMotion: boolean
): number => {
  const distance = Number.isFinite(head?.distanceTiles) ? (head?.distanceTiles ?? 0) : 0;
  const time = Number.isFinite(head?.timeMs) ? (head?.timeMs ?? timeMs) : timeMs;
  return samplePlayerColour(distance, time, reducedMotion || head?.animated === false, SCRATCH_HEAD).core;
};

/** Core colour at a trail distance and time (the edge star border's inputs). */
export const resolveTrailPaletteBorderColor = (
  headDistanceTiles: number,
  timeMs: number,
  motionStopped: boolean
): number => samplePlayerColour(headDistanceTiles, timeMs, motionStopped, SCRATCH_HEAD).core;

/**
 * THE shared border colour (MAZER-VIS-053), now through the player colour: the colour of the edge markers' border AND of the
 * end star's border. Identical to `resolvePlayerColour` (the border, the player, the lasers and the star fills are one colour).
 */
export const resolveSharedBorderColor = resolvePlayerColour;

/** The edge star's border colour (alias of `resolvePlayerColour`, named for what the star draws). */
export const resolvePlayerBorderColour = resolvePlayerColour;
