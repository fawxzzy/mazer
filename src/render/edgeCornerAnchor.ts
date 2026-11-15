/**
 * Corner anchor for the four corner edge diamonds (edgeMarkers.ts stations 0, 2, 4, 6).
 *
 * Pure: no Phaser, no DOM. A corner diamond points along the corner diagonal and its OUTER tip sits on the corner of the visible
 * view: 0 css px from BOTH screen edges on square-cornered viewports (desktop, small phones, landscape; VIS-044, owner request
 * "diamonds always in the actual corners"), and EDGE_CORNER_ROUNDED_TIP_INSET_PX (16) from both edges on a tall rounded-display
 * phone (MAZER-VIS-054: the owner saw the corner diamonds "half off screen" because the rounded display hides the corner). The
 * diamond grows and shrinks about that outer tip (edgeMarkers.ts `anchorStationToOuterTip`), so it stays in its corner at 50%,
 * 100% and every size between and never drifts inward. The visible edge is the canvas edge (the canvas is the full viewport; the
 * game adds no safe-area inset to the diamonds).
 */

/** Distance, per axis, from the visible screen corner to the corner diamond's painted outer tip on a square-cornered view: 0 (touching the corner). */
export const EDGE_CORNER_TIP_INSET_PX = 0;

/**
 * MAZER-VIS-054: tip inset, per axis, on a tall phone with a ROUNDED display. A display corner of radius R hides everything within
 * R(1 - 1/sqrt2) = 0.293 R of the corner per axis (14 px at R48, 16 px at R55), so a diamond whose tip sits exactly ON the corner
 * (VIS-044) is half or fully cut off. 16 css px lands the tip on the arc of a R<=55 corner (R55: 16.1 px), and the diamond, which
 * scales about that tip, then stays fully visible at 50/75/100%. Phones with a larger radius still trim a sliver (residual risk).
 */
export const EDGE_CORNER_ROUNDED_TIP_INSET_PX = 16;
/** Viewport band (css px, portrait) treated as a notch-class phone with a rounded display: 375 <= width < 500 and height >= 780. */
export const EDGE_CORNER_ROUNDED_MIN_WIDTH_PX = 375;
export const EDGE_CORNER_ROUNDED_MAX_WIDTH_EXCLUSIVE_PX = 500;
export const EDGE_CORNER_ROUNDED_MIN_HEIGHT_PX = 780;

export interface EdgeCornerViewport {
  readonly width: number;
  readonly height: number;
}

/** True for a tall portrait phone viewport assumed to have rounded display corners (iPhone 13+ / Pixel / Galaxy class). */
export const isRoundedDisplayViewport = (viewport?: EdgeCornerViewport): boolean => (
  viewport !== undefined
  && Number.isFinite(viewport.width)
  && Number.isFinite(viewport.height)
  && viewport.width >= EDGE_CORNER_ROUNDED_MIN_WIDTH_PX
  && viewport.width < EDGE_CORNER_ROUNDED_MAX_WIDTH_EXCLUSIVE_PX
  && viewport.height >= EDGE_CORNER_ROUNDED_MIN_HEIGHT_PX
);

/**
 * Per-axis distance from the screen corner to a corner diamond's outer tip: EDGE_CORNER_ROUNDED_TIP_INSET_PX (16) on a tall
 * rounded-display phone, 0 for everything else (desktop, 360 wide and under, 375x667 square-cornered phones, landscape) and for
 * callers that pass no viewport.
 */
export const resolveEdgeCornerTipInset = (viewport?: EdgeCornerViewport): number => (
  isRoundedDisplayViewport(viewport) ? EDGE_CORNER_ROUNDED_TIP_INSET_PX : EDGE_CORNER_TIP_INSET_PX
);

/** Viewports narrower than this (css px) cap how large a corner diamond may grow (MAZER-UI-035 follow-up). 375 and up are unchanged. */
export const EDGE_CORNER_NARROW_WIDTH_PX = 375;
/**
 * Largest size (fraction of full) a corner diamond reaches on a phone under EDGE_CORNER_NARROW_WIDTH_PX wide. The header cannot
 * make room for the full-size top-right diamond there (a wider gear inset shrinks the title), so the diamond is the part that
 * gives: it stays pinned on the corner, scaled about its outer tip, but peaks at 60% (70% for the old kite; the star tips paint further) instead of 100%. The 50% rest size is below
 * the cap, so the settled menu and the maze are untouched. 0.7 leaves the settings glyph >= 4 css px clear at 320..374 wide.
 */
export const EDGE_CORNER_NARROW_MAX_SCALE = 0.6;

/** Cap on a corner diamond's size for a viewport width: 1 (no cap) from 375 css px up. */
export const resolveEdgeCornerMaxScale = (viewportWidth: number): number => (
  Number.isFinite(viewportWidth) && viewportWidth < EDGE_CORNER_NARROW_WIDTH_PX ? EDGE_CORNER_NARROW_MAX_SCALE : 1
);

export interface EdgeCornerOffset {
  /** Gap from the painted bounding box to the left (or right) screen edge, css px. */
  readonly horizontal: number;
  /** Gap from the painted bounding box to the top (or bottom) screen edge, css px. */
  readonly vertical: number;
}

/** Gap between a set of painted points and the nearest screen corner, per axis (the test and QA measurement of "in the corner"). */
export const measureEdgeCornerOffset = (
  paintedPoints: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  viewport: { readonly width: number; readonly height: number }
): EdgeCornerOffset => {
  const minX = Math.min(...paintedPoints.map((point) => point.x));
  const maxX = Math.max(...paintedPoints.map((point) => point.x));
  const minY = Math.min(...paintedPoints.map((point) => point.y));
  const maxY = Math.max(...paintedPoints.map((point) => point.y));
  return {
    horizontal: corner.endsWith('left') ? minX : viewport.width - maxX,
    vertical: corner.startsWith('top') ? minY : viewport.height - maxY
  };
};
