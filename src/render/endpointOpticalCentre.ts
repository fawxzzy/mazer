/**
 * Where the goal STAR's optical centre goes on its tile (MAZER-VIS-034): pure geometry, no drawing.
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
export const resolveGoalStarCentre = (tile: EndpointTileRect): OpticalCentre => {
  if (isDeadEnd(tile)) {
    return tileCentre(tile);
  }
  return {
    x: tile.fill.left + (tile.fill.width / 2),
    y: tile.fill.top + (tile.fill.height / 2)
  };
};
