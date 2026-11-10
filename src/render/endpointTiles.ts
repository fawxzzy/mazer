/**
 * Start and goal END MARKERS on the Chip board: pure geometry, no drawing.
 *
 * History: 2026-11-10 (PR #402) drew each end tile as a tinted pad (the chip's own fill silhouette in a dark
 * endpoint colour) with a dark disc badge and a lit ring on top. On the live board the pad read as a visible
 * square / rounded-square box behind the star and the play marker, and the owner asked for it gone.
 *
 * Now there is no box. The star and the play arrow sit directly on the board tile (the baked Chip fill is the only
 * thing behind them), centred on the device-snapped tile. What keeps them legible without a backdrop is a thin
 * dark KEYLINE traced around the glyph itself (the board void colour, 1+ device px): the goal red (#FF405D) is only
 * about 1.8:1 against the mid-tone chip, but red on the keyline is far above 3:1, and the outline hugs the shape, so
 * it reads as a crisp edge, not a plate. The start's gold clears 3:1 on the chip on its own and gets the same keyline
 * for one consistent look.
 *
 *  - Goal: a goal-red star, outer radius 0.70 of the half-tile.
 *  - Start: a gold play triangle that POINTS THE WAY THE PLAYER WILL FIRST MOVE (`direction`, resolved from the maze
 *    by startDirection.ts; right when there is no board, e.g. the Guide icon), so it reads as the player emerging
 *    from it. The triangle is optically centred on its centroid: the flat side sits 0.42 of the glyph length behind
 *    the cell centre along the direction of travel.
 *
 * The functions return plain numbers and never touch a canvas; `drawBoardMarkers` (boardTileBake.ts) paints them.
 * No css-px floor: on a dense board the glyph is as small as the tile, and the goal is found through the beacon
 * (goalBeacon.ts), which has its own css-px sizing.
 */
import { DEFAULT_START_DIRECTION, type StartDirection } from './startDirection';
import {
  BOARD_TILE_GEOMETRY,
  snapLineWidth
} from './boardTileStyle';

export type EndpointKind = 'start' | 'goal';

export type EndpointRadii = readonly [number, number, number, number];

/** Board-local chip tile geometry (the subset of `ChipTileGeometry` the end markers use). */
export interface EndpointTileRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radii: EndpointRadii;
  /** The inner fill rect: inset by the rim on closed sides only. */
  fill: { left: number; top: number; width: number; height: number };
  fillRadii: EndpointRadii;
  /** Concave corners (both neighbours open, diagonal wall). Carried with the tile geometry; the marker ignores it. */
  concave?: { tl: boolean; tr: boolean; br: boolean; bl: boolean };
  /** Start only: the direction of the first step of the solution path (BoardTileLayer sets it). Default: right. */
  direction?: StartDirection;
}

export interface EndpointGlyphFrame {
  /** Board-local cell centre. */
  cx: number;
  cy: number;
  /** Half the (device-snapped) tile. */
  radius: number;
  /** Keyline width: the dark outline traced around the glyph, snapped to whole device pixels, never below one. */
  keyline: number;
}

export interface EndpointPlay {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  /** Round-join stroke width of the gold fill's own edge. */
  stroke: number;
  direction: StartDirection;
}

export interface EndpointTileSpec {
  kind: EndpointKind;
  frame: EndpointGlyphFrame;
  /** Goal only: star radii. */
  star: { outer: number; inner: number } | null;
  /** Start only: the play triangle (board-local vertices) pointing along `direction`. */
  play: EndpointPlay | null;
}

/**
 * The triangle in glyph space (u along the direction of travel, v across it) mapped to board-local x/y:
 * right = (u, v), down = (-v, u), left = (-u, -v), up = (v, -u). A rotation, so the triangle stays the same shape.
 */
const rotate = (direction: StartDirection, u: number, v: number): readonly [number, number] => {
  switch (direction) {
    case 'right': return [u, v];
    case 'down': return [-v, u];
    case 'left': return [-u, -v];
    case 'up': return [v, -u];
  }
};

/** Everything needed to paint one end marker, from the tile's own chip geometry. Pure. */
export const resolveEndpointTile = (
  kind: EndpointKind,
  tile: EndpointTileRect,
  devicePixelRatio: number
): EndpointTileSpec => {
  const k = BOARD_TILE_GEOMETRY.endpoint;
  const cx = tile.left + (tile.width / 2);
  const cy = tile.top + (tile.height / 2);
  const radius = Math.min(tile.width, tile.height) / 2;
  const frame: EndpointGlyphFrame = {
    cx,
    cy,
    radius,
    keyline: snapLineWidth(radius * k.keylineOfRadius, devicePixelRatio)
  };
  if (kind === 'goal') {
    return {
      kind,
      frame,
      star: { outer: radius * k.goalStarOuterOfRadius, inner: radius * k.goalStarInnerOfRadius },
      play: null
    };
  }
  const direction = tile.direction ?? DEFAULT_START_DIRECTION;
  const halfHeight = radius * k.startPlayHalfHeightOfRadius;
  const length = radius * k.startPlayLengthOfRadius;
  // Optical centring: the flat side sits 0.42 of the glyph length behind the cell centre (a triangle's visual centre
  // is its centroid, a third of the way from the flat side, not the middle of its box).
  const back = -(length * 0.42);
  const [ax, ay] = rotate(direction, back, -halfHeight);
  const [bx, by] = rotate(direction, back, halfHeight);
  const [px, py] = rotate(direction, back + length, 0);
  return {
    kind,
    frame,
    star: null,
    play: {
      ax: cx + ax,
      ay: cy + ay,
      bx: cx + bx,
      by: cy + by,
      cx: cx + px,
      cy: cy + py,
      stroke: snapLineWidth(radius * k.startPlayStrokeOfRadius, devicePixelRatio),
      direction
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
