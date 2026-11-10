/**
 * Start and goal END TILES on the Chip board: pure geometry and colour, no drawing.
 *
 * Before: the end markers were drawn at a css-px floor (a 22 px goal badge on a 14.7 px tile) and the goal's
 * pad was the cell's inscribed circle, so the end tile spilled over its neighbours and did not meet the edges
 * of the chip it sits on.
 *
 * Now the end tile IS the tile:
 *  - the pad is the chip's own inner fill silhouette (`tile.fill` / `tile.fillRadii` from computeChipGeometry),
 *    in the endpoint colour. Those numbers are device-snapped by the bake's layout, and the markers are placed
 *    from the same snapped board origin, so the pad's edges are the baked tile's edges to the device pixel at
 *    every tile size and DPR (tests/render/endpointTilePixels.test.ts rasterises this to prove it);
 *  - the badge is a circle inscribed in the whole cell: its radius is half the snapped tile, so its ring is
 *    tangent to all four tile edges (the ring colour is the rim colour, so it joins the rim where they touch);
 *  - the goal keeps its shipped badge proportions (dark disc, lit ring, red star); the start is the same badge
 *    with a gold ring and a play glyph.
 *
 * The functions return plain numbers and never touch a canvas; `drawBoardMarkers` (boardTileBake.ts) paints
 * them. No css-px floor: on a dense board the glyph is as small as the tile, and the goal is found through
 * the beacon (goalBeacon.ts), which has its own css-px sizing.
 */
import {
  BOARD_TILE_GEOMETRY,
  boardMaterial,
  mixColor,
  snapLineWidth
} from './boardTileStyle';

export type EndpointKind = 'start' | 'goal';

export type EndpointRadii = readonly [number, number, number, number];

/** Board-local chip tile geometry (the subset of `ChipTileGeometry` the end tiles use). */
export interface EndpointTileRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radii: EndpointRadii;
  /** The inner fill rect: inset by the rim on closed sides only. */
  fill: { left: number; top: number; width: number; height: number };
  fillRadii: EndpointRadii;
  /**
   * Concave corners (both neighbours open, diagonal wall): the bake paints a rim-coloured patch there that
   * lies inside the fill rect. The pad must not overwrite it, so the patches are repainted over the pad.
   */
  concave?: { tl: boolean; tr: boolean; br: boolean; bl: boolean };
}

export interface EndpointPad {
  /** Board-local fill rect, identical to the baked chip fill of this tile. */
  left: number;
  top: number;
  width: number;
  height: number;
  radii: EndpointRadii;
  /** Opaque colour: the board void mixed toward the endpoint colour (a dark, tinted tile behind the badge). */
  color: number;
  /** Rim patches to repaint over the pad: board-local top-left corners of rim x rim squares (the bake's own). */
  patches: ReadonlyArray<readonly [number, number]>;
}

export interface EndpointBadge {
  /** Board-local cell centre. */
  cx: number;
  cy: number;
  /** Half the (device-snapped) tile: the circle is tangent to the four tile edges. */
  radius: number;
  /** Ring width, snapped to whole device pixels, never below one. */
  ringWidth: number;
}

export interface EndpointTileSpec {
  kind: EndpointKind;
  pad: EndpointPad;
  badge: EndpointBadge;
  /** Goal only: star radii. */
  star: { outer: number; inner: number } | null;
  /** Start only: the play triangle (board-local vertices) and its round-join stroke width. */
  play: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; stroke: number } | null;
}

export const resolveEndpointPadColor = (kind: EndpointKind): number => {
  const k = BOARD_TILE_GEOMETRY.endpoint;
  return kind === 'goal'
    ? mixColor(boardMaterial.void, boardMaterial.goal, k.goalPadMix)
    : mixColor(boardMaterial.void, boardMaterial.start, k.startPadMix);
};

/** Everything needed to paint one end tile, from the tile's own chip geometry. Pure. */
export const resolveEndpointTile = (
  kind: EndpointKind,
  tile: EndpointTileRect,
  devicePixelRatio: number,
  rimWidth = 0
): EndpointTileSpec => {
  const k = BOARD_TILE_GEOMETRY.endpoint;
  const cx = tile.left + (tile.width / 2);
  const cy = tile.top + (tile.height / 2);
  const radius = Math.min(tile.width, tile.height) / 2;
  const badge: EndpointBadge = {
    cx,
    cy,
    radius,
    ringWidth: snapLineWidth(radius * k.ringOfBadge, devicePixelRatio)
  };
  const patches: Array<readonly [number, number]> = [];
  if (tile.concave && rimWidth > 0) {
    // The same squares the bake paints (boardTileBake.ts, "concave rim patches").
    const right = tile.left + tile.width - rimWidth;
    const bottom = tile.top + tile.height - rimWidth;
    if (tile.concave.tl) patches.push([tile.left, tile.top]);
    if (tile.concave.tr) patches.push([right, tile.top]);
    if (tile.concave.br) patches.push([right, bottom]);
    if (tile.concave.bl) patches.push([tile.left, bottom]);
  }
  const pad: EndpointPad = {
    left: tile.fill.left,
    top: tile.fill.top,
    width: tile.fill.width,
    height: tile.fill.height,
    radii: tile.fillRadii,
    color: resolveEndpointPadColor(kind),
    patches
  };
  if (kind === 'goal') {
    return {
      kind,
      pad,
      badge,
      star: { outer: radius * k.goalStarOuterOfBadge, inner: radius * k.goalStarInnerOfBadge },
      play: null
    };
  }
  const halfHeight = radius * k.startPlayHalfHeightOfBadge;
  const width = radius * k.startPlayWidthOfBadge;
  // Optical centring: the flat side sits 0.42 of the glyph width left of the cell centre (a play triangle's
  // visual centre is its centroid, a third of the way from the flat side, not the middle of its box).
  const left = cx - (width * 0.42);
  return {
    kind,
    pad,
    badge,
    star: null,
    play: {
      ax: left,
      ay: cy - halfHeight,
      bx: left,
      by: cy + halfHeight,
      cx: left + width,
      cy,
      stroke: snapLineWidth(radius * k.startPlayStrokeOfBadge, devicePixelRatio)
    }
  };
};

/**
 * A standalone end tile for a cell with no board around it (Guide icons, tests): the cell as an isolated
 * chip, which is a disc, exactly what `computeChipGeometry` returns for a lone floor cell. `rim` is the
 * resolved style's rim width and `cap` its cap radius.
 */
export const resolveIsolatedEndpointRect = (
  left: number,
  top: number,
  width: number,
  height: number,
  rim: number,
  cap: number
): EndpointTileRect => ({
  left,
  top,
  width,
  height,
  radii: [cap, cap, cap, cap],
  fill: {
    left: left + rim,
    top: top + rim,
    width: Math.max(0, width - (2 * rim)),
    height: Math.max(0, height - (2 * rim))
  },
  fillRadii: [Math.max(0, cap - rim), Math.max(0, cap - rim), Math.max(0, cap - rim), Math.max(0, cap - rim)]
});
