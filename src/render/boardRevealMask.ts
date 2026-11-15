/**
 * The build / tear-down cell extents of the baked board (MAZER-VIS-040, reworked by MAZER-MOTION-020).
 *
 * One extent value (0..255 = 0..100 % of the cell shown) per grid cell, on a grid padded by one cell on every side.
 * The board layer (`composeBoardTileRevealSoft`, boardTileLayer.ts) draws the baked board ONCE through a clip made of
 * the shown part of every cell, so the cost is one canvas draw whatever the maze size: no per-tile draw call, no
 * per-frame redraw of the board art, no full-frame compositing pass, and no alpha (nothing is ever half-transparent,
 * so the pale rim of a tile can never show ahead of its dark fill).
 *
 *   floor cell  extent = its own reveal extent (mazeRevealTimeline.ts); a border cell that owns a bleed-off dock
 *               follows its rank like every other cell (the dock itself grows out of it, see boardTileLayer.ts)
 *   wall / pad  extent = how far the LEAST built floor cell around it (of up to eight) is past 60 %, rescaled to
 *               0..100 %. The baked wall cell holds the outer glow of EVERY corridor beside it, so it opens only
 *               when the last of them is mostly there: the faint halo of a corridor that has not been drawn yet can
 *               never show ahead of that corridor (the "thin line before the fill"), and in the tear-down the wall
 *               closes as soon as the first corridor beside it starts to go
 *
 * Pure: typed arrays in, typed arrays out; no Phaser, DOM or canvas.
 */
import {
  fillMazeRevealCellExtent,
  type MazeRevealFrame
} from './mazeRevealTimeline';

/** Cells of the padded mask grid: (cols + 2) x (rows + 2). */
export const resolveRevealMaskLength = (cols: number, rows: number): number => (
  Math.max(0, cols + 2) * Math.max(0, rows + 2)
);

/** Extent every floor cell around a wall must be past before the wall starts to open (see the file header). */
export const WALL_OPEN_FROM = 0.6;

/**
 * Writes the padded extent grid (0..255) for per-cell floor extents.
 * `floorExtent` and `isFloor` are cols * rows, row-major; `out` is (cols + 2) * (rows + 2).
 */
export const computeRevealMaskExtent = (
  out: Uint8ClampedArray,
  cols: number,
  rows: number,
  floorExtent: Float32Array,
  isFloor: Uint8Array
): void => {
  const stride = cols + 2;
  out.fill(0);
  // Floors first (their own extent), walls and the pad ring after (gated min of the floor neighbours).
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = (y * cols) + x;
      if (isFloor[cell] === 1) {
        out[((y + 1) * stride) + x + 1] = Math.round(Math.max(0, Math.min(1, floorExtent[cell]!)) * 255);
      }
    }
  }
  for (let py = 0; py < rows + 2; py += 1) {
    for (let px = 0; px < stride; px += 1) {
      const x = px - 1;
      const y = py - 1;
      if (x >= 0 && x < cols && y >= 0 && y < rows && isFloor[(y * cols) + x] === 1) {
        continue;
      }
      let least = 255;
      let seen = false;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= cols || isFloor[(ny * cols) + nx] !== 1) {
            continue;
          }
          const value = out[((ny + 1) * stride) + nx + 1]!;
          seen = true;
          if (value < least) {
            least = value;
          }
        }
      }
      out[(py * stride) + px] = !seen || least <= 255 * WALL_OPEN_FROM
        ? 0
        : Math.round(Math.min(1, ((least / 255) - WALL_OPEN_FROM) / (1 - WALL_OPEN_FROM)) * 255);
    }
  }
};

/**
 * For every floor cell, which side its BFS parent is on (the adjacent floor cell with the lowest rank below its own),
 * on the same padded grid as the extent mask: 0 none (the spawn tile, walls, the pad ring), 1 parent on the left,
 * 2 on the right, 3 above, 4 below. The build grows a cell from that side, so a corridor extrudes along its path.
 */
export const computeParentDirections = (ranks: Int32Array, cols: number, rows: number): Uint8Array => {
  const stride = cols + 2;
  const out = new Uint8Array(stride * (rows + 2));
  const offsets: Array<[number, number, number]> = [[-1, 0, 1], [1, 0, 2], [0, -1, 3], [0, 1, 4]];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const rank = ranks[(y * cols) + x]!;
      if (rank <= 0) {
        continue;
      }
      let best = rank;
      let direction = 0;
      for (const [dx, dy, code] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          continue;
        }
        const other = ranks[(ny * cols) + nx]!;
        if (other >= 0 && other < best) {
          best = other;
          direction = code;
        }
      }
      out[((y + 1) * stride) + x + 1] = direction;
    }
  }
  return out;
};

/** Cached per-maze inputs plus scratch buffers; one instance lives next to the board layer in the scene. */
export class MazeRevealMaskBuilder {
  private floorExtent = new Float32Array(0);
  private isFloor = new Uint8Array(0);
  private isFloorFor: Int32Array | null = null;
  private directionsFor: Int32Array | null = null;
  private directionGrid: Uint8Array = new Uint8Array(0);

  /** The parent-side grid of this maze (cached per rank grid). */
  directions(ranks: Int32Array, cols: number, rows: number): Uint8Array {
    if (this.directionsFor !== ranks) {
      this.directionGrid = computeParentDirections(ranks, cols, rows);
      this.directionsFor = ranks;
    }
    return this.directionGrid;
  }

  /**
   * Fills `out` ((cols + 2) * (rows + 2), extent 0..255) for `frame` and returns nothing.
   * `ranks` is the BFS rank grid (-1 for walls).
   */
  fill(
    out: Uint8ClampedArray,
    frame: MazeRevealFrame,
    ranks: Int32Array,
    cols: number,
    rows: number
  ): void {
    const cells = cols * rows;
    if (this.floorExtent.length !== cells) {
      this.floorExtent = new Float32Array(cells);
      this.isFloorFor = null;
    }
    if (this.isFloorFor !== ranks || this.isFloor.length !== cells) {
      this.isFloor = new Uint8Array(cells);
      for (let index = 0; index < cells; index += 1) {
        this.isFloor[index] = ranks[index]! >= 0 ? 1 : 0;
      }
      this.isFloorFor = ranks;
    }
    fillMazeRevealCellExtent(this.floorExtent, ranks, frame.tileCount, frame.direction, frame.window, frame.elapsedMs);
    computeRevealMaskExtent(out, cols, rows, this.floorExtent, this.isFloor);
  }
}
