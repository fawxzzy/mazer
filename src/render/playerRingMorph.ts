/**
 * The cap / chip morph of the player ring (MAZER-VIS-028). Pure; no Phaser import and no allocation per frame when the
 * caller passes an `out` record.
 *
 * Background: on the start and goal tiles (dead-end caps) the ring follows the tile's round closed corners
 * (MAZER-VIS-023); on every other tile it keeps the chip corner. The marker glides between tile centres, and the ring
 * used to switch shape at the half-way point (`Math.round` of the cell), a visible pop on every move on or off an end
 * tile. This module turns that switch into a blend weight that follows the marker's own fractional cell position:
 *
 *   weight = how much of the end tile the marker is on = 1 - (Manhattan distance, in tiles, from the end cell),
 *            clamped to 0..1 (the glide moves along one axis at a time, so Manhattan is the straight-line distance).
 *
 * The weight is 1 when the marker rests on the end tile and 0 once a whole tile away, so the resting frames are the
 * unchanged cap ring (weight 1) and the unchanged chip ring (no radii). `resolveLocatorSquareRadii` turns the weight
 * into per-corner radii (closed corners only; open-side corners keep the chip proportion throughout).
 *
 * Reduced motion: movement stops, so the blend collapses to the rest state: the same nearest-cell decision as before
 * (1 on the end tile, none elsewhere), never an in-between shape. (Under reduced motion the glide snaps and the cell
 * is always whole anyway; this keeps the rule explicit and testable.)
 */
import type { LocatorTileRadii } from './playerLocator';
import type { PlayerMarkerEndpointTile } from './playerMarker';

export interface PlayerRingMorph {
  /** The end tile's corner radii the ring is morphing towards, or null when the ring is the plain chip ring. */
  radii: LocatorTileRadii | null;
  /** 0..1 share of the cap shape (1 = the full cap ring, the resting end-tile frame). */
  blend: number;
}

/**
 * Share (0..1) of the end tile at `endCell` the marker occupies at the (possibly fractional) cell position. Whole
 * cells give exactly 1 or 0. With `reducedMotion` it is the nearest-cell decision (1 or 0), never in between.
 */
export const resolveEndpointRingBlend = (
  cellX: number,
  cellY: number,
  endCell: { x: number; y: number },
  reducedMotion: boolean
): number => {
  if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) {
    return 0;
  }
  if (reducedMotion) {
    return Math.round(cellX) === endCell.x && Math.round(cellY) === endCell.y ? 1 : 0;
  }
  const distance = Math.abs(cellX - endCell.x) + Math.abs(cellY - endCell.y);
  return distance >= 1 ? 0 : 1 - distance;
};

/**
 * The radii and blend the ring should use at a (possibly fractional) cell position: the start or goal tile whose
 * weight is largest (a start tile is never next to the goal tile in practice, but if two share a neighbourhood the
 * nearer one wins). Fills and returns `out`.
 */
export const resolvePlayerMarkerEndpointMorph = (
  cellX: number,
  cellY: number,
  start: { x: number; y: number } | null | undefined,
  goal: { x: number; y: number } | null | undefined,
  tiles: { start: PlayerMarkerEndpointTile | null; goal: PlayerMarkerEndpointTile | null },
  reducedMotion: boolean,
  out: PlayerRingMorph
): PlayerRingMorph => {
  out.radii = null;
  out.blend = 0;
  const consider = (cell: { x: number; y: number } | null | undefined, tile: PlayerMarkerEndpointTile | null): void => {
    if (!cell || !tile) {
      return;
    }
    const weight = resolveEndpointRingBlend(cellX, cellY, cell, reducedMotion);
    if (weight > out.blend) {
      out.blend = weight;
      out.radii = tile.radii;
    }
  };
  consider(start, tiles.start);
  consider(goal, tiles.goal);
  return out;
};

export const createPlayerRingMorph = (): PlayerRingMorph => ({ radii: null, blend: 0 });
