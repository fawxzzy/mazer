/**
 * Corner anchor for the four corner edge diamonds (edgeMarkers.ts stations 0, 2, 4, 6).
 *
 * Pure: no Phaser, no DOM. A corner diamond points along the corner diagonal and its OUTER tip is pinned to a fixed point on that
 * diagonal, `resolveEdgeCornerTipInset()` css px from BOTH screen edges, at every viewport size (phone portrait, small phone,
 * landscape, desktop). The diamond grows and shrinks about that outer tip (edgeMarkers.ts `anchorStationToOuterTip`), so it stays
 * snug in its corner at 50%, 100% and every size between; it never drifts inward along an edge.
 *
 * The pin is the point where the diagonal meets a rounded display corner of EDGE_CORNER_DISPLAY_RADIUS_PX: nearer to the corner the
 * tip would be cut off by the iPhone 12 to 15 Pro class screen (about 47 to 55 px), farther would leave it floating. On a square
 * screen (desktop window, most Android) that leaves a small, equal gap on both axes.
 */

/** Radius, in css px, of the rounded display corner a corner diamond must clear (covers the iPhone 12 to 15 Pro class). */
export const EDGE_CORNER_DISPLAY_RADIUS_PX = 56;

/**
 * Distance, per axis, from the screen corner to the corner diamond's painted outer tip: the point of a circle of radius
 * EDGE_CORNER_DISPLAY_RADIUS_PX (centred inward of the corner) that lies on the corner diagonal. R * (1 - 1/sqrt 2), about 16.4 px.
 */
export const resolveEdgeCornerTipInset = (radius: number = EDGE_CORNER_DISPLAY_RADIUS_PX): number => (
  Math.max(0, radius) * (1 - Math.SQRT1_2)
);

export interface EdgeCornerOffset {
  /** Gap from the painted bounding box to the left (or right) screen edge, css px. */
  readonly horizontal: number;
  /** Gap from the painted bounding box to the top (or bottom) screen edge, css px. */
  readonly vertical: number;
}

/** Gap between a set of painted points and the nearest screen corner, per axis (the test and QA measurement of "snug"). */
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
