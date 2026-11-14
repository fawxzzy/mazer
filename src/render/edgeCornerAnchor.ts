/**
 * Corner anchor for the four corner edge diamonds (edgeMarkers.ts stations 0, 2, 4, 6).
 *
 * Pure: no Phaser, no DOM. A corner diamond points along the corner diagonal and its OUTER tip sits ON the corner of the visible
 * view: 0 css px from BOTH screen edges, at every viewport size (phone portrait, small phone, landscape, desktop). The diamond
 * grows and shrinks about that outer tip (edgeMarkers.ts `anchorStationToOuterTip`), so it stays in its corner at 50%, 100% and
 * every size between and never drifts inward. The visible edge is the canvas edge (the canvas is the full viewport; the game adds
 * no safe-area inset to the diamonds). A physically rounded display corner may trim the very tip: that is the owner's accepted trade
 * (2026-11-14: diamonds always in the actual corners).
 */

/** Distance, per axis, from the visible screen corner to the corner diamond's painted outer tip: 0 (touching the corner). */
export const EDGE_CORNER_TIP_INSET_PX = 0;

export const resolveEdgeCornerTipInset = (): number => EDGE_CORNER_TIP_INSET_PX;

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
