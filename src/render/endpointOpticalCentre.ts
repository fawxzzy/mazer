/**
 * Where an end glyph's optical centre goes on its tile (the goal star: MAZER-VIS-034; the start arrow: MAZER-VIS-036):
 * pure geometry, no drawing.
 *
 * Owner report (2026-11-13): "the end tile star needs better centering in the tiles especially when its in a corner
 * tile too". Measured on the raster of the real bake + marker draw (and confirmed on a real Chromium screenshot at
 * 390x844, DPR 3), before this change:
 *  - on EVERY tile the painted star's centroid sat 1.1 to 1.9 device px BELOW the tile centre (it grows with the
 *    tile: 0.08 of the tile's own size). The star had been centred by its BOUNDING BOX, and a point-up five-point
 *    star's bounding box centre is 0.0955 of its outer radius ABOVE its circumcentre, which is also its centre of mass.
 *  - on corner / junction tiles the chip FILL (the painted interior, inside the lit rim) is not centred on the cell
 *    either: the rim is only painted on the CLOSED sides, so the fill's centre sits half a rim width toward the open
 *    sides (1.5 to 3 device px on a corner tile). The star, on the cell centre, sat toward the rim, and on a corner
 *    tile that error compounded with the one above (3.1 device px at DPR 3 on a corner open up and right).
 *
 * DECISION 1, centroid not bounding box: the optical centre of a star is its centre of mass, the circumcentre of the
 * five points. The painted glyph (fill plus the dark keyline, a uniform round-join stroke around the same path) has
 * five-fold symmetry about that point, so the centroid of its painted pixels IS the circumcentre exactly. The star is
 * drawn with its circumcentre on the target point; its bounding box then reads 0.0955 R low, which the eye does not
 * judge as off-centre (the tips are balanced about the point).
 *
 * DECISION 2, the target is the centre of the tile's painted interior, the chip FILL rect (inside the lit rim, which
 * is inset on the closed sides only): a straight tile and a cross are centred exactly on the cell, a corner or a
 * junction moves half a rim toward its open sides. A DEAD END (the round cap) is the exception: its closed end is one
 * round bulb, and the eye centres on the bulb's circle, which is the cell centre; the fill rect's centre (half a rim
 * toward the opening) or the interior's area centroid (dragged toward the opening by the straight stub behind the
 * half-disc) would push the star out of the bulb.
 *
 * START ARROW (MAZER-VIS-036). The play triangle (flat base behind, apex ahead, pointing the way the player first moves)
 * had the same two faults, and a bigger one of its own. It was centred by its BOUNDING BOX, but a triangle's mass is
 * not at its box centre: its centroid sits a third of the length from the flat base, a sixth of the length (0.16 of the
 * half-tile) BEHIND the box centre. Measured on the raster of the real bake + marker draw before this change (every open
 * direction, every tile shape, tiles 9.95 to 25.44 css px, DPR 1 / 2 / 2.625 / 3), the painted arrow's centroid was off the
 * tile's interior centre by 0.35 to 4.7 device px on a straight tile and by up to 8.9 device px on a corner tile (it grows
 * with the tile: the length is 0.95 of the half-tile), against at most 0.38 after. The weight sat behind the centre and
 * the point ahead of it, so the arrow read as sliding out of its tile.
 *
 * DECISION 3, same rule as the star, by CENTROID: the arrow is drawn so the centroid of its PAINTED pixels (the triangle
 * dilated by half its gold stroke plus the dark keyline, which is exactly the shape the marker pass paints) lands on the
 * same target point as the star (the painted interior's centre, the cell centre on a dead end's bulb). The alternative,
 * keeping the box centred and only fixing the corner offset, leaves the visible mass trailing behind the target, which is
 * the fault the owner sees on the star. The apex then reaches further toward the open side and the base sits nearer the
 * centre; the arrow points in the direction of travel, which is always an OPEN side, so the extra reach goes toward
 * clear chip, never toward a lit rim. The same shift never leaves the interior (see the pinned tests). Size is the
 * nominal triangle times the same fit as before, so nothing is bigger or smaller.
 *
 * Nothing about the star's SIZE changes: the fit in endpointTiles.ts is still taken from the cell centre, and the
 * target only ever moves AWAY from a lit rim (toward the open sides), so the keyline keeps at least its clearance.
 */
import type { EndpointTileRect } from './endpointTiles';

export interface OpticalCentre {
  x: number;
  y: number;
}

/** A five-point star's circumcentre sits this share of its outer radius below its bounding-box centre (cos 36 deg). */
export const STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE = (1 - Math.cos(Math.PI / 5)) / 2;

/** The tile's centre (the cell centre): the point the player, the trail and the beacon are centred on. */
export const tileCentre = (tile: EndpointTileRect): OpticalCentre => ({
  x: tile.left + (tile.width / 2),
  y: tile.top + (tile.height / 2)
});

/**
 * A dead end: two adjacent corners rounded far past the chip's ordinary corner (0.3 of the tile), up to the full half
 * tile, which makes the closed end one round bulb. Tolerant (0.4 of the tile) because the snapped tile can be a device
 * pixel narrower than its cap radius.
 */
const isDeadEnd = (tile: EndpointTileRect): boolean => (
  tile.radii.filter((r) => r >= 0.4 * Math.min(tile.width, tile.height)).length >= 2
  && tile.radii.some((r) => r === 0)
);

/**
 * The point the goal star's circumcentre is drawn on. Board-local css px, on the tile's own device-snapped geometry.
 * A dead end: the cell centre (the bulb's circle). Every other tile: the centre of the chip fill rect (the area inside
 * the lit rim; the rim is only painted on closed sides), which on a straight tile or a cross is the cell centre too.
 */
export const resolveEndpointCentre = (tile: EndpointTileRect): OpticalCentre => {
  if (isDeadEnd(tile)) {
    return tileCentre(tile);
  }
  return {
    x: tile.fill.left + (tile.fill.width / 2),
    y: tile.fill.top + (tile.fill.height / 2)
  };
};

/** The goal star's target (MAZER-VIS-034): the painted-interior centre of the tile. */
export const resolveGoalStarCentre = resolveEndpointCentre;

type Vec = readonly [number, number];

/**
 * The centroid of a triangle DILATED by `offset` (every point within `offset` of the triangle: what a round-join stroke
 * of width 2 * offset paints together with the fill). Exact: the triangle's own mass, plus one rectangular strip per edge
 * (centroid half an offset out from the edge midpoint), plus a circular sector at each vertex (exterior angle, centroid
 * on the outward bisector 4 d sin(theta/2) / (3 theta) from the vertex). With offset 0 it is the plain centroid.
 */
export const dilatedTriangleCentroid = (a: Vec, b: Vec, c: Vec, offset: number): OpticalCentre => {
  const pts: readonly Vec[] = [a, b, c];
  const cross = ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]));
  const centre: OpticalCentre = { x: (a[0] + b[0] + c[0]) / 3, y: (a[1] + b[1] + c[1]) / 3 };
  const d = Math.max(0, offset);
  if (d === 0 || cross === 0) {
    return centre;
  }
  const orient = cross > 0 ? 1 : -1;
  const normals: Vec[] = pts.map((p, i) => {
    const q = pts[(i + 1) % 3]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    return [(orient * dy) / len, (-orient * dx) / len] as const;
  });
  let area = Math.abs(cross) / 2;
  let mx = area * centre.x;
  let my = area * centre.y;
  for (let i = 0; i < 3; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % 3]!;
    const n = normals[i]!;
    const strip = Math.hypot(q[0] - p[0], q[1] - p[1]) * d;
    area += strip;
    mx += strip * (((p[0] + q[0]) / 2) + (n[0] * d / 2));
    my += strip * (((p[1] + q[1]) / 2) + (n[1] * d / 2));
  }
  for (let i = 0; i < 3; i += 1) {
    const p = pts[i]!;
    const nPrev = normals[(i + 2) % 3]!;
    const nNext = normals[i]!;
    const theta = Math.acos(Math.max(-1, Math.min(1, (nPrev[0] * nNext[0]) + (nPrev[1] * nNext[1]))));
    if (theta === 0) continue;
    const bx = nPrev[0] + nNext[0];
    const by = nPrev[1] + nNext[1];
    const bl = Math.hypot(bx, by);
    const reach = (4 * d * Math.sin(theta / 2)) / (3 * theta);
    const sector = (theta * d * d) / 2;
    area += sector;
    mx += sector * (p[0] + ((bx / bl) * reach));
    my += sector * (p[1] + ((by / bl) * reach));
  }
  return { x: mx / area, y: my / area };
};
