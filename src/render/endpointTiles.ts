/**
 * Start and goal END MARKERS on the Chip board: pure geometry, no drawing.
 *
 * History: 2026-11-10 (PR #402) drew each end tile as a tinted pad (the chip's own fill silhouette in a dark
 * endpoint colour) with a dark disc badge and a lit ring on top. On the live board the pad read as a visible
 * square / rounded-square box behind the star and the play marker, and the owner asked for it gone.
 *
 * Now there is no box. The star and the spiral sit directly on the board tile (the baked Chip fill is the only
 * thing behind them), centred on the device-snapped tile. What keeps them legible without a backdrop is a thin
 * dark KEYLINE traced around the glyph itself (the board void colour, 1+ device px): the goal red (#FF405D) is only
 * about 1.8:1 against the mid-tone chip, but red on the keyline is far above 3:1, and the outline hugs the shape, so
 * it reads as a crisp edge, not a plate. The start's gold clears 3:1 on the chip on its own and gets the same keyline
 * for one consistent look.
 *
 *  - Goal: a goal-red star, up to 0.70 of the half-tile (smaller where the fit below needs it).
 *  - Start (MAZER-VIS-053): a gold two-arm SPIRAL of the old triangle's footprint, turning slowly in phase with the star
 *    (endpointSpiral.ts). It replaced the play triangle, so it no longer points anywhere: `direction` (startDirection.ts)
 *    is still carried by the tile geometry but nothing draws it.
 *
 * CENTRING AND FIT (2026-11-10, owner: "the star isn't centred in its tile, same with the start arrow, and its size
 * should not make it bleed over the tile edges"). The VISIBLE glyph is the fill plus its dark keyline. Both glyphs are
 * centred OPTICALLY, by the centroid of what is painted, on the tile's painted-interior centre (the chip fill, inside the
 * lit rim, which is inset on the closed sides only; see endpointOpticalCentre.ts): the STAR by its circumcentre
 * (MAZER-VIS-034) and the start SPIRAL by its spin axis (two arms half a turn apart are 2-fold symmetric, so the axis IS
 * the centroid of what is painted, at every angle; MAZER-VIS-053; it replaced the play triangle, MAZER-VIS-036). The glyph
 * is scaled down, if needed, so that the farthest point of the
 * keyline stays an inset inside the tile's FILL (the area inside the lit rim: the closest of its four edges to the
 * cell centre) with at least 0.5 device px to spare: the keyline never reaches the rim or the tile edge, at any tile
 * size or DPR. Where the one-device-pixel keyline would take too much of that room it is thinned so the glyph keeps
 * its size.
 *
 * The functions return plain numbers and never touch a canvas; `drawBoardMarkers` (boardTileBake.ts) paints them.
 * No css-px floor: on a dense board the glyph is as small as the tile, and the goal is found through the beacon
 * (goalBeacon.ts), which has its own css-px sizing.
 */
import { type StartDirection } from './startDirection';
import { resolveEndpointCentre, STAR_CIRCUMCENTRE_BELOW_BOX_CENTRE } from './endpointOpticalCentre';
import { START_SPIRAL } from './endpointSpiral';
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
  /** Start only: the direction of the first step of the solution path (BoardTileLayer sets it). Carried, not drawn since VIS-053. */
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
  /**
   * Goal only (MAZER-VIS-053): width of the star's BORDER in the shared border colour, between the red fill and the
   * (then thin, one device pixel) dark keyline. 0 for the start spiral, which has the full keyline and no border.
   */
  border: number;
}

export interface EndpointSpiral {
  /** The spin axis: the tile's optical centre (board-local css px). */
  cx: number;
  cy: number;
  /** Radius of an arm's centre line at its outer end, and where it starts. */
  outer: number;
  inner: number;
  /** Round-cap stroke width of the gold arm (the dark keyline adds `frame.keyline` on each side). */
  stroke: number;
}

export interface EndpointTileSpec {
  kind: EndpointKind;
  frame: EndpointGlyphFrame;
  /** Goal only: star radii. */
  star: { outer: number; inner: number } | null;
  /** Start only: the spiral (axis, radii, stroke). */
  spiral: EndpointSpiral | null;
}

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
    // Thin the keyline when it would take more than a fifth of the room (tiny tiles). MAZER-VIS-053: that edge is split into
    // the star's BORDER (the shared border colour, the edge diamonds' colour) and a dark keyline one device pixel wide
    // outside it. The border takes what the old keyline had beyond that one device pixel and is at least one device pixel.
    // The fit counts both, so the star never reaches the rim.
    const edge = Math.min(keyline, room / 5);
    keyline = Math.min(edge, 1 / devicePixelRatio);
    const fit = (edgeBorder: number): number => Math.max(0, Math.min(radius * k.goalStarOuterOfRadius, (room - keyline - edgeBorder) / STAR_FAR_VERTEX));
    let border = Math.max(edge - keyline, Math.min(1 / devicePixelRatio, room / 5));
    let outer = fit(border);
    // On a tile at the physical floor (a handful of device pixels) the border would leave the red under two device pixels
    // across: drop the border there so the star stays a readable red star (the keyline still carries it).
    if (outer * devicePixelRatio < 2) {
      border = 0;
      outer = fit(0);
    }
    // The star's circumcentre (its centre of mass) goes on the tile's painted-interior centre (endpointOpticalCentre.ts).
    const at = resolveEndpointCentre(tile);
    return {
      kind,
      frame: { cx: at.x, cy: at.y, radius, keyline, border },
      star: { outer, inner: outer * (k.goalStarInnerOfRadius / k.goalStarOuterOfRadius) },
      spiral: null
    };
  }
  keyline = Math.min(keyline, room / 4);
  const stroke = Math.min(snapLineWidth(radius * k.startSpiralStrokeOfRadius, devicePixelRatio), room / 3);
  // The arm's centre line reaches at most `outer`; its painted edge (half the gold stroke, then the keyline) must stay inside
  // the room, so the outer radius is the nominal one (the circle round the old triangle) or what the room allows.
  const outer = Math.max(0, Math.min(radius * k.startSpiralOuterOfRadius, room - (stroke / 2) - keyline));
  // The spin axis is the tile's painted-interior centre, the same target as the goal star. Two arms half a turn apart are
  // 2-fold symmetric, so the painted mass is centred on that axis at every angle: the spin cannot wobble.
  const at = resolveEndpointCentre(tile);
  return {
    kind,
    frame: { cx: at.x, cy: at.y, radius, keyline, border: 0 },
    star: null,
    spiral: { cx: at.x, cy: at.y, outer, inner: outer * START_SPIRAL.innerShare, stroke }
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
