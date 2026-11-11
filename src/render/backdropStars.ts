/**
 * What the play/menu backdrop draws. Pure policy, no drawing (MenuScene.drawBackdrop paints).
 *
 * History:
 *  - It used to draw its nearest, biggest stars as coloured four-point sparkles (green, orange, purple, blue, red
 *    crosses) and every other star as a small round dot. Owner feedback, 2026-11-10: "no more stagnant stars in the
 *    background". The coloured crosses read as fixed decorations behind the maze, so they are retired for good.
 *  - PR #411 then went too far: it drew no star at all while the backdrop was not animating, and none of the bigger
 *    stars even while it was, so the space behind the board looked empty. Owner, same day: "why are there no more
 *    background stars? all i said was no more stagnant ones, not remove them all".
 *
 * Now:
 *  - EVERY star is drawn, as a round point of light (never a cross, never coloured by hue): the small far ones as
 *    dots, the nearest ones ("hero" stars) as a brighter dot with a soft round halo. While the backdrop animates they
 *    drift outward from the warp centre and twinkle (alpha and size breathe, each star on its own period). With
 *    motion off (Animated Background on "Still", or the OS reduced-motion preference) they hold one calm mid-twinkle
 *    level: the player's own setting asked for stillness, and a dark empty field is the wrong answer to it.
 *  - The star's little one-pixel "warp tail" is gone: at phone pixel density it was a separate stray mark beside every
 *    dot and read as a speck or a symbol, not as speed. Motion is carried by the drift itself.
 *  - The decorative glyphs in the backdrop (angular glass shards with notched rails, the drifting rune strokes and
 *    the four corner sigils) are not drawn any more. Owner, 2026-11-10: "there's weird symbols in the background that
 *    need removed". The pure generators stay in legacyMenuBackdrop.ts (they are tested and a future theme could use
 *    them); only the scene's drawing of them is switched off here, in one place.
 */

/** A star whose rounded core is at least this many px wide is a "hero" star (soft halo). */
export const BACKDROP_HERO_STAR_CORE_PX = 3;

export type BackdropStarDraw = 'dot' | 'hero';

/** The scene draws the shards, the drift runes and the corner sigils only when this is true. It is not. */
export const BACKDROP_DECORATIVE_GLYPHS_ENABLED = false;

/** The scene draws the one-pixel warp tail behind a star only when this is true. It is not. */
export const BACKDROP_STAR_TAILS_ENABLED = false;

/** Twinkle floor: a star at the dim end of its cycle keeps this share of its alpha, so none ever vanishes. */
export const BACKDROP_STAR_TWINKLE_FLOOR = 0.34;
/** Size breath: a star shrinks to this share of its size at the dim end of its cycle and grows to the max at the bright end. */
export const BACKDROP_STAR_SIZE_MIN = 0.72;
export const BACKDROP_STAR_SIZE_MAX = 1.18;

/**
 * The star field's initial layout is deterministic. Stars are now drawn even when the backdrop is still (reduced
 * motion, Animated Background off), so an unseeded layout would put different random specks behind the board on every
 * load, which is exactly what made the pixel gates (tests: verify-trail-corner-raster) flaky once before. The stars
 * still drift and respawn at random while animating; only where they START is fixed.
 */
export const BACKDROP_STAR_FIELD_SEED = 0x5eed1e55;

/** mulberry32: a tiny seeded generator returning floats in [0, 1). */
export const createBackdropStarRandom = (seed: number = BACKDROP_STAR_FIELD_SEED): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** What to draw for one backdrop star: `coreSize` is its rounded core width in px. Never 'none': no star is hidden. */
export const resolveBackdropStarDraw = (coreSize: number): BackdropStarDraw => (
  coreSize >= BACKDROP_HERO_STAR_CORE_PX ? 'hero' : 'dot'
);

/** Alpha multiplier for a twinkle phase 0..1 (0 = dim end, 1 = bright end). */
export const resolveBackdropTwinkleAlpha = (phase: number): number => {
  const p = Math.max(0, Math.min(1, phase));
  return BACKDROP_STAR_TWINKLE_FLOOR + ((1 - BACKDROP_STAR_TWINKLE_FLOOR) * p);
};

/** Size multiplier for a twinkle phase 0..1. */
export const resolveBackdropTwinkleSize = (phase: number): number => {
  const p = Math.max(0, Math.min(1, phase));
  return BACKDROP_STAR_SIZE_MIN + ((BACKDROP_STAR_SIZE_MAX - BACKDROP_STAR_SIZE_MIN) * p);
};
