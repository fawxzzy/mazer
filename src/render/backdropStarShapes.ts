/**
 * MAZER-VIS-066: the backdrop stars are real star SHAPES with a rainbow colour shift (owner, 2026-11-19: "stars must
 * actually be stars, not faded circles, with rainbow shifting colour"; shape set d "Mixed" picked from the star-shapes
 * artifact, colour = star-field option 3 "Rainbow wave across the field"). Pure policy and maths: no Phaser, no DOM, no
 * randomness, no wall clock. MenuScene.drawBackdrop fills the list below; src/render/backdropStarSprites.ts bakes the
 * shapes once and paints the list.
 *
 * Shape set "Mixed" (by the star's depth, from its rounded core size):
 *  - the nearest stars (core >= 3 px) are classic five-point stars,
 *  - every other star is a four-point concave sparkle.
 * Every star is a POINTED shape: owner, repeated 2026-11-19, "actual stars, never glowy lights, soft discs or blurred
 * glow". The demo's tiny square points for the farthest stars are dropped for that reason, there is no halo or glow
 * sprite, and the painter never shrinks a glyph below the size where its points still show
 * (BACKDROP_STAR_MIN_RADIUS_DEV, backdropStarSprites.ts).
 *
 * Colour = the MAZER / TAP TO PLAY lettering sweep stretched across the screen:
 *   hue = sceneTime / 5200 ms + x / width, quantised to 24 steps; a step within +-22 deg of the gate cyan (hue 177 deg)
 *   is pushed to the edge of that band so a star never reads as a gate; colour = resolveRainbowUiColor (the shared
 *   rainbow UI material, S 0.8 / V 1). Every star is coloured; alpha is capped at 0.6 so the maze stays the focus.
 *
 * Reduce Motion (and Animated Background "Still") stop the MOVEMENT, never the colour (rule 2026-11-12, reducedMotion.ts):
 *  - no drift (MenuScene.updateStars does not advance the stars), no twinkle (alpha and size hold the mid-twinkle level),
 *  - the hue reads the scene clock in every motion mode, so the rainbow keeps sweeping through the low-rate colour
 *    redraw gate (backdropStarHue.ts stepBackdropColourRedraw).
 *
 * Each star keeps one identity for its whole life: the twinkle period, phase and the shape pick read the persisted
 * `seed` (legacyMenuBackdrop.ts), never a hash of the drifting position (the old strobe bug).
 *
 * Colours come from HSV through resolveRainbowUiColor: no colour literals here (off-theme colour ratchet).
 * Tests: tests/render/backdropStarShapes.test.ts.
 */
import { resolveRainbowUiColor } from './rainbowUiPalette';
import { resolveBackdropTwinkleSize } from './backdropStars';

/** Glyph ids. The sprite atlas bakes exactly these (backdropStarSprites.ts). */
export const BACKDROP_STAR_GLYPH_SPARKLE4 = 0;
export const BACKDROP_STAR_GLYPH_STAR5 = 1;
export const BACKDROP_STAR_GLYPHS = [BACKDROP_STAR_GLYPH_SPARKLE4, BACKDROP_STAR_GLYPH_STAR5] as const;
export type BackdropStarGlyph = typeof BACKDROP_STAR_GLYPHS[number];

/** Rounded core size (css px) from which a star is a five-point "hero" star. */
export const BACKDROP_STAR5_CORE_PX = 3;

// ---- colour (option 3: the lettering sweep) ------------------------------------------------------------------------
/** Hue steps in one lap; every sprite is pre-baked once per step. */
export const BACKDROP_STAR_HUE_STEPS = 24;
/** One lap of the sweep: the lettering's own period (LEGACY_GOAL_STAR_RING_SPIN_PERIOD_MS). */
export const BACKDROP_STAR_HUE_LAP_MS = 5200;
/** The most opaque a star can be: under a white star's old ceiling (~0.74), so the board stays the focus. */
export const BACKDROP_STAR_SHAPE_ALPHA_CAP = 0.6;
/** Gate cyan hue and the guard band around it: a star never takes the gate's colour. */
export const BACKDROP_STAR_GATE_HUE = 177 / 360;
export const BACKDROP_STAR_GATE_GUARD = 22 / 360;

/** Hue in [0, 1), pushed out of the gate-cyan guard band. */
export const guardBackdropStarHue = (hue: number): number => {
  const h = hue - Math.floor(hue);
  const distance = h - BACKDROP_STAR_GATE_HUE;
  if (Math.abs(distance) < BACKDROP_STAR_GATE_GUARD) {
    return distance < 0 ? BACKDROP_STAR_GATE_HUE - BACKDROP_STAR_GATE_GUARD : BACKDROP_STAR_GATE_HUE + BACKDROP_STAR_GATE_GUARD;
  }
  return h;
};

/** The packed 0xRRGGBB colour of each hue step. */
export const BACKDROP_STAR_PALETTE: readonly number[] = Array.from(
  { length: BACKDROP_STAR_HUE_STEPS },
  (_, step) => resolveRainbowUiColor(guardBackdropStarHue(step / BACKDROP_STAR_HUE_STEPS))
);

/**
 * Palette step of a star at css column `x` of a `width` wide field at scene time `sceneTimeMs`. Callers pass the scene
 * clock in every motion mode (colour is not motion). A non-finite time or empty width falls back to 0 for that term.
 */
export const resolveBackdropStarHueStep = (sceneTimeMs: number, x: number, width: number): number => {
  const hue = (Number.isFinite(sceneTimeMs) ? sceneTimeMs / BACKDROP_STAR_HUE_LAP_MS : 0)
    + (width > 0 && Number.isFinite(x) ? x / width : 0);
  const h = hue - Math.floor(hue);
  return Math.round(h * BACKDROP_STAR_HUE_STEPS) % BACKDROP_STAR_HUE_STEPS;
};

// ---- shape ---------------------------------------------------------------------------------------------------------
/** The glyph and its outer radius in css px (before the twinkle size breath) for a star. */
export const resolveBackdropStarShape = (radius: number): { glyph: BackdropStarGlyph; radiusCss: number } => {
  const core = Math.max(1, Math.round(radius));
  if (core >= BACKDROP_STAR5_CORE_PX) {
    return { glyph: BACKDROP_STAR_GLYPH_STAR5, radiusCss: 1.4 + (radius * 0.95) };
  }
  return { glyph: BACKDROP_STAR_GLYPH_SPARKLE4, radiusCss: 0.9 + (radius * 0.95) };
};

/** Twinkle floor of a shape star: a crisp shape covers fewer pixels than the old disc + halo, so it dims less. */
export const BACKDROP_STAR_SHAPE_TWINKLE_FLOOR = 0.42;
/** The dark field's star alpha scale (legacyMenuBackdrop.ts); light mode scales the lift by its own value over this. */
const DARK_STAR_ALPHA_SCALE = 0.74;

/**
 * A star's alpha at a twinkle phase (0 = dim end, 1 = bright end). The far (dim) stars get a lift: at their old alphas a
 * saturated blue or violet shape on the near-black field is almost invisible. The cap holds every star under 0.6.
 */
export const resolveBackdropStarShapeAlpha = (starAlpha: number, phase: number, alphaScale: number): number => {
  const p = Math.max(0, Math.min(1, phase));
  const lifted = (0.5 + (starAlpha * 0.7)) * (alphaScale / DARK_STAR_ALPHA_SCALE);
  return Math.min(
    BACKDROP_STAR_SHAPE_ALPHA_CAP,
    lifted * (BACKDROP_STAR_SHAPE_TWINKLE_FLOOR + ((1 - BACKDROP_STAR_SHAPE_TWINKLE_FLOOR) * p))
  );
};

/** Stars dimmer than this are not drawn at all. */
export const BACKDROP_STAR_MIN_ALPHA = 0.015;

// ---- draw list -----------------------------------------------------------------------------------------------------
/** Values per star: glyph, outer radius (css px, size breath applied), hue step, x, y (whole css px), alpha. */
const STRIDE = 6;
const INITIAL_STARS = 512;

/** One backdrop frame's stars. Reused frame to frame: `reset()` keeps the storage. */
export class BackdropStarShapeList {
  private data = new Float64Array(INITIAL_STARS * STRIDE);
  private starCount = 0;

  get count(): number {
    return this.starCount;
  }

  reset(): void {
    this.starCount = 0;
  }

  push(glyph: BackdropStarGlyph, radiusCss: number, hueStep: number, x: number, y: number, alpha: number): void {
    const offset = this.starCount * STRIDE;
    if (offset + STRIDE > this.data.length) {
      const grown = new Float64Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[offset] = glyph;
    this.data[offset + 1] = radiusCss;
    this.data[offset + 2] = hueStep;
    this.data[offset + 3] = x;
    this.data[offset + 4] = y;
    this.data[offset + 5] = alpha;
    this.starCount += 1;
  }

  /** Star `index` as plain values (tests and diagnostics; the painter reads the storage directly). */
  starAt(index: number): { glyph: number; radiusCss: number; hueStep: number; x: number; y: number; alpha: number } {
    const offset = index * STRIDE;
    return {
      glyph: this.data[offset],
      radiusCss: this.data[offset + 1],
      hueStep: this.data[offset + 2],
      x: this.data[offset + 3],
      y: this.data[offset + 4],
      alpha: this.data[offset + 5]
    };
  }

  view(): { data: Float64Array; count: number; stride: number } {
    return { data: this.data, count: this.starCount, stride: STRIDE };
  }
}

/** The part of a backdrop star (LegacyMenuBackdropStar) the shapes read. */
export interface BackdropStarShapeSource {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  seed: number;
}

/**
 * Fill `list` for one backdrop frame. `sceneTimeMs` is the scene clock (colour); with `motionEnabled` false the twinkle
 * holds its mid level (no alpha or size breath), so only the colour changes between frames.
 */
export const fillBackdropStarShapeList = (
  list: BackdropStarShapeList,
  stars: readonly BackdropStarShapeSource[],
  width: number,
  height: number,
  sceneTimeMs: number,
  motionEnabled: boolean,
  alphaScale: number
): void => {
  list.reset();
  if (!(width > 0) || !(height > 0)) {
    return;
  }
  const animationTime = motionEnabled ? sceneTimeMs : 0;
  for (let index = 0; index < stars.length; index += 1) {
    const star = stars[index];
    const pixelX = Math.round(star.x * width);
    const pixelY = Math.round(star.y * height);
    const starSeed = star.seed;
    // Each star has its own twinkle period (+-25 %, from the seed) eased through smoothstep (see backdropStars.ts).
    const twinklePeriodMs = 2200 * (0.75 + (starSeed * 0.5));
    const twinkleRaw = motionEnabled
      ? (Math.sin(((animationTime / twinklePeriodMs) + starSeed) * Math.PI * 2) + 1) / 2
      : 0.5;
    const twinklePhase = twinkleRaw * twinkleRaw * (3 - (2 * twinkleRaw));
    const alpha = resolveBackdropStarShapeAlpha(star.alpha, twinklePhase, alphaScale);
    if (!(alpha > BACKDROP_STAR_MIN_ALPHA)) {
      continue;
    }
    const shape = resolveBackdropStarShape(star.radius);
    list.push(
      shape.glyph,
      shape.radiusCss * resolveBackdropTwinkleSize(twinklePhase),
      resolveBackdropStarHueStep(sceneTimeMs, pixelX, width),
      pixelX,
      pixelY,
      alpha
    );
  }
};
