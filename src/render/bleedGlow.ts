/**
 * The travelling pulse on a wrap / bleed-off dock: pure geometry and colour, no drawing (MenuScene paints it).
 *
 * A bleed-off corridor ends in a short Chip dock past the board edge. A soft band of light runs along it from the
 * inner end (where it meets the grid) out to the screen edge, on a loop, to draw the eye to "this is a way off the
 * board". Two things were wrong with it (owner, 2026-11-10, looking at the live phone board: "the bleed off path
 * pulse glow is not centred with the tiles, it is offset to the side a little ... it is green, I want it to match
 * the player trail colour like the diamonds do"):
 *
 *  - COLOUR. It was the progression palette's fixed green. It is now the trail's own colour at the trail head, from
 *    the same function the edge diamonds' border uses (`resolveTrailPaletteBorderColor`, trailPalette.ts), at the
 *    same animation time and with the same reduced-motion rule, so a diamond, the trail beside the player and the
 *    pulse in a dock are one colour.
 *  - CENTRING. Its cross-axis extent came from the legacy path band (integer-rounded insets of an older tile model),
 *    which is not the baked Chip tile's own geometry, so the strip sat up to a device pixel or two off the chip's
 *    centre line, which is what made it read as "to the side". The lane is now centred on `centerOfCell`, the same
 *    device-snapped cell centre the end markers use (boardTileBake.ts), as a fixed fraction of the tile, with
 *    fractional (anti-aliased) edges across the dock and whole-pixel steps only ALONG it, so neighbouring steps share
 *    their boundaries exactly and never overlap or leave a seam.
 *
 * The band is a smooth bump (a raised cosine) rather than eight flat-alpha slabs, so it reads as light moving, not as
 * a stack of rectangles.
 */
import { resolveTrailPaletteBorderColor } from './trailPalette';

export const BLEED_GLOW = Object.freeze({
  periodMs: 1900,
  /** Half-width of the travelling band as a share of the dock's length. */
  bandHalfWidth: 0.3,
  maxAlpha: 0.55,
  /** Steps along the dock: enough that the raised cosine looks continuous, few enough to stay cheap per frame. */
  steps: 16,
  /** Width of the lane across the dock, as a share of the tile: the chip's fill, a little inside its rim. */
  laneOfTile: 0.62
});

export type BleedGlowDirection = 'top' | 'bottom' | 'left' | 'right';

/** The trail's own palette state (MenuScene.trailPaletteHead), or null when there is no trail yet. */
export interface BleedGlowTrailHead {
  readonly distanceTiles: number;
  readonly timeMs: number;
  readonly animated: boolean;
}

/**
 * The glow colour: the trail colour at the trail head, exactly as the edge diamonds' border takes it. With no trail
 * yet (the menu, or the first frame of play) the diamonds use head distance 0 on the scene clock, so this does too.
 */
export const resolveBleedGlowColor = (
  head: BleedGlowTrailHead | null,
  sceneTimeMs: number,
  reducedMotion: boolean
): number => resolveTrailPaletteBorderColor(
  head !== null && Number.isFinite(head.distanceTiles) ? head.distanceTiles : 0,
  head !== null && Number.isFinite(head.timeMs) ? head.timeMs : sceneTimeMs,
  reducedMotion || (head !== null && head.animated === false)
);

/** 0..1 loop position of the pulse for a scene time. */
export const resolveBleedGlowProgress = (timeMs: number): number => (
  (((timeMs % BLEED_GLOW.periodMs) + BLEED_GLOW.periodMs) % BLEED_GLOW.periodMs) / BLEED_GLOW.periodMs
);

/** Fade in at the inner end and out at the screen edge: 0 at both ends of the loop, 1 in the middle. */
export const resolveBleedGlowEnvelope = (progress: number): number => Math.sin(Math.PI * progress);

export interface BleedGlowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

export interface BleedGlowInput {
  readonly direction: BleedGlowDirection;
  /** The dock's off-grid area in screen px (from resolveLegacyMenuBorderDockRenderAreas). Only its LENGTH is used. */
  readonly area: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** The device-snapped centre of the border cell the dock belongs to (`centerOfCell`). */
  readonly cellCentre: { readonly x: number; readonly y: number };
  readonly tileSize: number;
  readonly progress: number;
}

/** The rectangles to paint, in order, each with its own alpha, for the band at `progress` along one dock. */
export const resolveBleedGlowRects = (input: BleedGlowInput): BleedGlowRect[] => {
  const k = BLEED_GLOW;
  const envelope = resolveBleedGlowEnvelope(input.progress);
  if (envelope <= 0.01 || !(input.tileSize > 0)) {
    return [];
  }
  const vertical = input.direction === 'top' || input.direction === 'bottom';
  // Span along the dock, from its inner end (at the grid) outward to the screen edge.
  const spanStart = vertical
    ? (input.direction === 'top' ? input.area.bottom : input.area.top)
    : (input.direction === 'left' ? input.area.right : input.area.left);
  const spanEnd = vertical
    ? (input.direction === 'top' ? input.area.top : input.area.bottom)
    : (input.direction === 'left' ? input.area.left : input.area.right);
  const span = spanEnd - spanStart;
  if (Math.abs(span) < 1) {
    return [];
  }
  const lane = input.tileSize * k.laneOfTile;
  const crossStart = (vertical ? input.cellCentre.x : input.cellCentre.y) - (lane / 2);
  const rects: BleedGlowRect[] = [];
  for (let step = 0; step < k.steps; step += 1) {
    const t0 = step / k.steps;
    const t1 = (step + 1) / k.steps;
    const dist = Math.abs(((t0 + t1) / 2) - input.progress);
    const x = Math.min(1, dist / k.bandHalfWidth);
    // Raised cosine: 1 at the band's centre, 0 at its edge, no kink.
    const intensity = x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x));
    if (intensity <= 0.02) {
      continue;
    }
    // Whole pixels ALONG the dock with shared boundaries (round the boundary once, not each rect's own ends).
    const p0 = Math.round(spanStart + (span * t0));
    const p1 = Math.round(spanStart + (span * t1));
    const lo = Math.min(p0, p1);
    const hi = Math.max(p0, p1);
    if (hi <= lo) {
      continue;
    }
    const alpha = k.maxAlpha * envelope * intensity;
    rects.push(vertical
      ? { x: crossStart, y: lo, width: lane, height: hi - lo, alpha }
      : { x: lo, y: crossStart, width: hi - lo, height: lane, alpha });
  }
  return rects;
};
