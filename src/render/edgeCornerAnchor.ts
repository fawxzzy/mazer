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
 *
 * MAZER-VIS-056 (owner: the bottom-left and bottom-right stars are off the screen): the BOTTOM corners now have their own rule,
 * resolveEdgeCornerBottomTipInset. It detects rounded bottom corners from the measured bottom safe area (the size band missed the home-
 * screen app on 375 x 812 class phones, whose canvas is about 762 tall once the status bar is taken off) and clears a continuous R66
 * display corner (displayCornerMask.ts) instead of a R55 circle (the tip sat 2.9 to 4.6 px inside a R62 to R66 corner).
 */

import { resolveContinuousCornerDiagonalInset } from './displayCornerMask';

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
  /**
   * env(safe-area-inset-bottom) in css px, when the caller knows it (viewportGeometry.ts `safeArea.bottom`). Greater than 0 means the
   * view runs down to a home-indicator display edge, so its BOTTOM corners are the phone's physical rounded corners (MAZER-VIS-056).
   */
  readonly safeAreaBottom?: number;
}

/**
 * MAZER-VIS-056: the display corner the BOTTOM corner stars are built to clear: a continuous (iOS) corner of this radius, css px.
 * iPhone 14 Pro to 16 report 55, the 16 Pro / Pro Max class about 62 (UIKit's display corner radius, not measured here); 66 leaves
 * headroom for larger corners. The continuous curve crosses the diagonal 0.2915 R in from both edges (displayCornerMask.ts).
 */
export const EDGE_CORNER_DISPLAY_RADIUS_PX = 66;
/** Clearance between the painted outer tip and the display edge on the diagonal, so the antialiased tip pixel is not trimmed. */
export const EDGE_CORNER_DISPLAY_CLEARANCE_PX = 0.5;
/**
 * MAZER-VIS-056: tip inset, per axis, of a BOTTOM corner star on a rounded display: the continuous R66 corner's diagonal crossing
 * (19.24 px) plus the clearance, rounded up to a whole css px: 20. Derived from the model, not picked: change the radius, not this.
 */
export const EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX = Math.ceil(
  resolveContinuousCornerDiagonalInset(EDGE_CORNER_DISPLAY_RADIUS_PX) + EDGE_CORNER_DISPLAY_CLEARANCE_PX
);

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

/**
 * MAZER-VIS-056: true when the view's BOTTOM corners are a phone's rounded display corners. The measured signal first: a bottom safe
 * area (> 0) only exists when the page reaches a home-indicator edge, at any viewport size, so it catches the home-screen app on the
 * 375 x 812 class (status bar taken off: about 762 tall, below the size band). The size band (isRoundedDisplayViewport) stays as the
 * fallback for runtimes that report no safe area (Android, browser tabs, tests).
 */
export const hasRoundedBottomCorners = (viewport?: EdgeCornerViewport): boolean => (
  (viewport?.safeAreaBottom !== undefined && Number.isFinite(viewport.safeAreaBottom) && viewport.safeAreaBottom > 0)
  || isRoundedDisplayViewport(viewport)
);

/**
 * Per-axis distance from a BOTTOM screen corner to a bottom corner star's painted outer tip: EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX
 * (20) when the bottom corners are rounded (hasRoundedBottomCorners), else 0 (desktop, square-cornered phones). The top corners keep
 * resolveEdgeCornerTipInset: in the home-screen app the status bar sits above the canvas, so the canvas's top corners are not the
 * display's corners (owner: only the bottom stars were cut off), and the header layout is derived from the top value.
 */
export const resolveEdgeCornerBottomTipInset = (viewport?: EdgeCornerViewport): number => (
  hasRoundedBottomCorners(viewport) ? EDGE_CORNER_ROUNDED_BOTTOM_TIP_INSET_PX : EDGE_CORNER_TIP_INSET_PX
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
