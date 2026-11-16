/**
 * Model of a phone's ROUNDED display corner (MAZER-VIS-056). Pure: no Phaser, no DOM.
 *
 * iPhone displays are not cut by a circle. Their corners follow Apple's "continuous" corner curve (the shape UIKit draws for
 * `cornerCurve = .continuous`, which is what the private display corner radius is meant for): it starts bending 1.528 R from the
 * corner along each edge (a circle starts at R) and crosses the corner diagonal 0.2915 R in from both edges (a circle: 0.2929 R).
 * The curve below is the published three-cubic approximation of that shape (the same coefficients every "iOS squircle" port uses).
 *
 * Coordinates are corner-local css px: `along` = distance from the side edge (x for a bottom/top corner), `across` = distance from the
 * bottom (or top) edge. Everything between the corner point and the curve is hidden by the display; everything past it is visible.
 */

export interface CornerPoint {
  readonly along: number;
  readonly across: number;
}

/** Where the continuous corner starts bending, as a multiple of its radius (a circle: 1). */
export const CONTINUOUS_CORNER_EXTENT = 1.52866483;

/** The three cubic segments of the continuous corner for R = 1, from the side edge (along 1.53, across 0) to the other edge. */
const CONTINUOUS_CORNER_SEGMENTS: ReadonlyArray<readonly [CornerPoint, CornerPoint, CornerPoint, CornerPoint]> = [
  [
    { along: 1.52866483, across: 0 },
    { along: 1.08849323, across: 0 },
    { along: 0.86840689, across: 0 },
    { along: 0.63149399, across: 0.074911 }
  ],
  [
    { along: 0.63149399, across: 0.074911 },
    { along: 0.37282392, across: 0.16905899 },
    { along: 0.16905899, across: 0.37282392 },
    { along: 0.074911, across: 0.63149399 }
  ],
  [
    { along: 0.074911, across: 0.63149399 },
    { along: 0, across: 0.86840689 },
    { along: 0, across: 1.08849323 },
    { along: 0, across: 1.52866483 }
  ]
];

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const u = 1 - t;
  return (u * u * u * p0) + (3 * u * u * t * p1) + (3 * u * t * t * p2) + (t * t * t * p3);
};

/** The display edge of a continuous corner of `radius` as a polyline (corner-local px), `stepsPerSegment` points per cubic. */
export const resolveContinuousCornerOutline = (radius: number, stepsPerSegment = 48): ReadonlyArray<CornerPoint> => {
  const points: CornerPoint[] = [];
  CONTINUOUS_CORNER_SEGMENTS.forEach(([p0, p1, p2, p3], index) => {
    for (let step = index === 0 ? 0 : 1; step <= stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      points.push({
        along: cubic(p0.along, p1.along, p2.along, p3.along, t) * radius,
        across: cubic(p0.across, p1.across, p2.across, p3.across, t) * radius
      });
    }
  });
  return points;
};

/** Distance from both edges at which the continuous corner of `radius` crosses the corner diagonal: 0.2915 R. */
export const resolveContinuousCornerDiagonalInset = (radius: number): number => {
  // The middle cubic is symmetric about the diagonal, so its midpoint is the crossing.
  const [p0, p1, p2, p3] = CONTINUOUS_CORNER_SEGMENTS[1]!;
  return cubic(p0.along, p1.along, p2.along, p3.along, 0.5) * radius;
};

const outlineCache = new Map<number, ReadonlyArray<CornerPoint>>();
const outlineFor = (radius: number): ReadonlyArray<CornerPoint> => {
  let outline = outlineCache.get(radius);
  if (!outline) {
    outline = resolveContinuousCornerOutline(radius);
    outlineCache.set(radius, outline);
  }
  return outline;
};

/**
 * How deep (css px) a corner-local point lies inside the part a continuous display corner of `radius` hides: > 0 hidden (the distance
 * to the display edge), <= 0 visible (minus the distance to the edge inside the corner box), -Infinity outside the corner box.
 * A point past either screen edge (negative along/across) is hidden by at least that overshoot.
 */
export const resolveContinuousCornerHiddenDepth = (point: CornerPoint, radius: number): number => {
  const overshoot = Math.max(-point.along, -point.across);
  if (radius <= 0) {
    return overshoot > 0 ? overshoot : Number.NEGATIVE_INFINITY;
  }
  const extent = CONTINUOUS_CORNER_EXTENT * radius;
  if (point.along >= extent || point.across >= extent) {
    // Beside the corner box: only the straight screen edge matters.
    return overshoot > 0 ? overshoot : Number.NEGATIVE_INFINITY;
  }
  const outline = outlineFor(radius);
  let nearest = Number.POSITIVE_INFINITY;
  // Hidden iff the point is on the corner side of the curve: the curve is monotone (along falls while across rises), so compare
  // the point's `across` with the curve's `across` at the same `along`.
  let curveAcross = 0;
  for (let index = 0; index < outline.length - 1; index += 1) {
    const a = outline[index]!;
    const b = outline[index + 1]!;
    const dAlong = b.along - a.along;
    const dAcross = b.across - a.across;
    const lengthSq = (dAlong * dAlong) + (dAcross * dAcross);
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, (((point.along - a.along) * dAlong) + ((point.across - a.across) * dAcross)) / lengthSq))
      : 0;
    nearest = Math.min(nearest, Math.hypot(point.along - (a.along + (dAlong * t)), point.across - (a.across + (dAcross * t))));
    if (point.along <= a.along && point.along >= b.along && dAlong !== 0) {
      curveAcross = a.across + (dAcross * ((point.along - a.along) / dAlong));
    }
  }
  if (point.along <= 0) {
    curveAcross = extent;
  }
  if (overshoot > 0) {
    return Math.max(overshoot, nearest);
  }
  return point.across < curveAcross ? nearest : -nearest;
};

/** Same question for a circular corner of `radius` (the old model; kept so tests can show the two differ). */
export const resolveCircularCornerHiddenDepth = (point: CornerPoint, radius: number): number => {
  const overshoot = Math.max(-point.along, -point.across);
  if (overshoot > 0) {
    return overshoot;
  }
  if (radius <= 0 || point.along >= radius || point.across >= radius) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.hypot(radius - point.along, radius - point.across) - radius;
};

export type ScreenCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

/** Converts a canvas point to the local coordinates of `corner` of a `width` x `height` view. */
export const toCornerLocal = (
  point: { readonly x: number; readonly y: number },
  corner: ScreenCorner,
  width: number,
  height: number
): CornerPoint => ({
  along: corner.endsWith('left') ? point.x : width - point.x,
  across: corner.startsWith('top') ? point.y : height - point.y
});
