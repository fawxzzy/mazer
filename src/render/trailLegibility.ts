/**
 * Play-trail legibility on the Chip floor: width, underlay, core lift and fade floor, as pure functions so the
 * numbers are testable against the real chip colours (tests/render/trailLegibility.test.ts).
 *
 * Why: the trail width was `tile * 0.16`, which is ~1.5 css px on dense boards (tiles of 6..12 css px), and the
 * calm energy stops are mid-luminance on a mid-tone mint chip (1.3..2.2:1 on the bare chip). Fixes, each keeping
 * the Navigation Core trail identity (one continuous path, calm energy palette, shine, Trail Fade, AI = player):
 *  - a minimum core width in css px, capped so it never swallows a tiny tile;
 *  - the dark underlay (bg.canvas) widens with the core and is nearly opaque, and it does NOT fade with trail
 *    age, only with the lifecycle fade, so the core always sits on a dark ground;
 *  - the core colour is lifted toward white (same hues) so every energy stop clears 4.5:1 on that ground;
 *  - Trail Fade keeps an alpha floor at which every stop still clears 3:1 until the tail actually expires.
 */
import { boardMaterial } from './boardTileStyle';

export const TRAIL_WIDTH_RATIO = 0.16;
/** Minimum core width in css px; the dense-board floor. */
export const TRAIL_MIN_CORE_CSS = 4;
/** The core never exceeds this share of the tile (so a very small tile keeps visible chip around the trail). */
export const TRAIL_MAX_CORE_TILE_RATIO = 0.55;
/** Underlay pad per side: at least this many css px, or this share of the core width. */
export const TRAIL_UNDERLAY_PAD_MIN_CSS = 1.5;
export const TRAIL_UNDERLAY_PAD_CORE_RATIO = 0.35;
/** bg.canvas over the floor at this alpha: near-opaque, so the ground under the core is dark on chip, rim or gap. */
export const TRAIL_UNDERLAY_ALPHA = 0.94;
/** Energy stop mixed toward white by this share (hue preserved; lerps between lifted stops stay exact). */
export const TRAIL_CORE_LIFT = 0.15;
/** Trail Fade alpha floor: at this alpha every lifted stop still clears 3:1 against the dark ground. */
export const TRAIL_FADE_ALPHA_MIN = 0.7;
export const TRAIL_GLOW_TILE_RATIO = 0.3;
/** Glow (neon bloom) is at least this multiple of the core so it reads on dense boards too. */
export const TRAIL_GLOW_MIN_CORE_MULTIPLE = 2.2;
export const TRAIL_GLOW_ALPHA_RATIO = 0.2;

export interface TrailWidths {
  coreWidth: number;
  glowWidth: number;
  underlayPad: number;
  underlayWidth: number;
}

export const resolveTrailWidths = (tileSize: number): TrailWidths => {
  const tile = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 1;
  const coreWidth = Math.max(
    1,
    Math.min(Math.max(tile * TRAIL_WIDTH_RATIO, TRAIL_MIN_CORE_CSS), tile * TRAIL_MAX_CORE_TILE_RATIO)
  );
  const glowWidth = Math.max(tile * TRAIL_GLOW_TILE_RATIO, coreWidth * TRAIL_GLOW_MIN_CORE_MULTIPLE);
  const underlayPad = Math.max(TRAIL_UNDERLAY_PAD_MIN_CSS, coreWidth * TRAIL_UNDERLAY_PAD_CORE_RATIO);
  return { coreWidth, glowWidth, underlayPad, underlayWidth: coreWidth + (2 * underlayPad) };
};

const mixChannel = (a: number, b: number, t: number): number => Math.round((a * (1 - t)) + (b * t));

export const mixRgb = (a: number, b: number, t: number): number => (
  (mixChannel((a >> 16) & 255, (b >> 16) & 255, t) << 16)
  | (mixChannel((a >> 8) & 255, (b >> 8) & 255, t) << 8)
  | mixChannel(a & 255, b & 255, t)
);

/** The trail's drawn colour for a sampled energy colour: lifted toward white. */
export const liftTrailColor = (color: number): number => mixRgb(color, boardMaterial.white, TRAIL_CORE_LIFT);

/** Underlay colour as composited over a given floor colour. */
export const compositeTrailUnderlay = (floor: number): number => mixRgb(floor, boardMaterial.void, TRAIL_UNDERLAY_ALPHA);

/** The floor colours the bake actually paints under a trail: chip fill, lit rim, and the gap (void) between chips. */
export const TRAIL_FLOOR_COLORS = Object.freeze({
  chip: boardMaterial.chip,
  rim: boardMaterial.rim,
  gap: boardMaterial.void
});

const channelLuminance = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (color: number): number => (
  (0.2126 * channelLuminance((color >> 16) & 255))
  + (0.7152 * channelLuminance((color >> 8) & 255))
  + (0.0722 * channelLuminance(color & 255))
);

export const contrastRatio = (a: number, b: number): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Contrast of a trail core (already lifted) at `alpha` over its underlay, against that underlay, on a floor. */
export const trailCoreContrast = (liftedColor: number, floor: number, alpha = 1): number => {
  const ground = compositeTrailUnderlay(floor);
  return contrastRatio(mixRgb(ground, liftedColor, alpha), ground);
};
