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
 *  - Goal: a goal-red star, up to 0.70 of the half-tile (smaller where the fit below needs it).
 *  - Start: a gold play triangle that POINTS THE WAY THE PLAYER WILL FIRST MOVE (`direction`, resolved from the maze
 *    by startDirection.ts; right when there is no board, e.g. the Guide icon), so it reads as the player emerging
 *    from it.
 *
 * CENTRING AND FIT (2026-11-10, owner: "the star isn't centred in its tile, same with the start arrow, and its size
 * should not make it bleed over the tile edges"). The VISIBLE glyph is the fill plus its dark keyline, so that whole
 * bounding box is what is centred on the tile for the play triangle (its bounding box, not its centroid, sits on the
 * cell centre). The STAR is no longer centred by its bounding box (MAZER-VIS-034): that left its centre of mass up to
 * 1.9 device px low, and ignored that the chip's lit rim is painted on the closed sides only. Its circumcentre (=
 * centre of mass) goes on the tile's painted-interior centre, see endpointOpticalCentre.ts. The glyph is then scaled down, if needed, so that the farthest point of the
 * keyline stays an inset inside the tile's FILL (the area inside the lit rim: the closest of its four edges to the
 * cell centre) with at least 0.5 device px to spare: the keyline never reaches the rim or the tile edge, at any tile
 * size or DPR. Where the one-device-pixel keyline would take too much of that room it is thinned so the glyph keeps
 * its size.
 *
 * The functions return plain numbers and never touch a canvas; `drawBoardMarkers` (boardTileBake.ts) paints them.
 * No css-px floor: on a dense board the glyph is as small as the tile, and the goal is found through the beacon
 * (goalBeacon.ts), which has its own css-px sizing.
 */
import { DEFAULT_START_DIRECTION, type StartDirection } from './startDirection';
import { resolveGoalStarCentre, STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE } from './endpointOpticalCentre';
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

/** Share of the half-tile kept clear between the keyline's farthest point and the rim. */
const FIT_INSET_OF_RADIUS = 0.07;
/**
 * Farthest vertex of the unit star from the cell centre, in outer radii, as the fit has always measured it (the
 * bounding-box-centred star's bottom tip). The star is now centred by its circumcentre, so every tip is exactly one
 * outer radius from its centre: this stays as the (slightly conservative) bound, which keeps the star's size, and the
 * keyline's clearance from the rim, exactly as they were.
 */
const STAR_FAR_VERTEX = Math.hypot(Math.sin(Math.PI / 5), Math.cos(Math.PI / 5) + STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE);

/** Distance from the cell centre to the nearest edge of the tile's fill (the area inside the lit rim). */
const fillRoom = (tile: EndpointTileRect, cx: number, cy: number): number => Math.min(
  cx - tile.fill.left,
  (tile.fill.left + tile.fill.width) - cx,
  cy - tile.fill.top,
  (tile.fill.top + tile.fill.height) - cy
);

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
  // Room for the glyph: the fill's nearest edge, less the inset (at least 0.5 device px, so a tiny tile keeps a margin).
  const room = Math.max(0, fillRoom(tile, cx, cy) - Math.max(radius * FIT_INSET_OF_RADIUS, 0.5 / devicePixelRatio));
  let keyline = snapLineWidth(radius * k.keylineOfRadius, devicePixelRatio);
  if (kind === 'goal') {
    // Thin the keyline when it would take more than a fifth of the room (tiny tiles), then fit the star.
    keyline = Math.min(keyline, room / 5);
    const outer = Math.max(0, Math.min(radius * k.goalStarOuterOfRadius, (room - keyline) / STAR_FAR_VERTEX));
    // The star's circumcentre (its centre of mass) goes on the tile's painted-interior centre (endpointOpticalCentre.ts).
    const at = resolveGoalStarCentre(tile);
    return {
      kind,
      frame: { cx: at.x, cy: at.y, radius, keyline },
      star: { outer, inner: outer * (k.goalStarInnerOfRadius / k.goalStarOuterOfRadius) },
      play: null
    };
  }
  const direction = tile.direction ?? DEFAULT_START_DIRECTION;
  keyline = Math.min(keyline, room / 4);
  const stroke = Math.min(snapLineWidth(radius * k.startPlayStrokeOfRadius, devicePixelRatio), room / 3);
  // The triangle's bounding box is centred on the cell centre (u spans -length/2 .. +length/2 along travel, v spans
  // -halfHeight .. +halfHeight across it); its farthest vertex from the centre is a base corner.
  const nominalHalfHeight = radius * k.startPlayHalfHeightOfRadius;
  const nominalLength = radius * k.startPlayLengthOfRadius;
  const farVertex = Math.hypot(nominalLength / 2, nominalHalfHeight);
  const fit = Math.max(0, Math.min(1, (room - (stroke / 2) - keyline) / farVertex));
  const halfHeight = nominalHalfHeight * fit;
  const length = nominalLength * fit;
  const back = -(length / 2);
  const [ax, ay] = rotate(direction, back, -halfHeight);
  const [bx, by] = rotate(direction, back, halfHeight);
  const [px, py] = rotate(direction, back + length, 0);
  return {
    kind,
    frame: { cx, cy, radius, keyline },
    star: null,
    play: {
      ax: cx + ax,
      ay: cy + ay,
      bx: cx + bx,
      by: cy + by,
      cx: cx + px,
      cy: cy + py,
      stroke,
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
