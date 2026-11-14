/**
 * The soft reveal cell alphas of the baked board (MAZER-VIS-040).
 *
 * One alpha value (0..255) per grid cell, on a grid padded by one cell on every side. The board layer
 * (`composeBoardTileRevealSoft`, boardTileLayer.ts) buckets the cells by that alpha (16 levels) and draws the baked
 * board once per bucket through a clip of the cells in it, so the cost is a handful of canvas draws whatever the
 * maze size: no per-tile draw call, no per-frame redraw of the board art, no full-frame compositing pass.
 *
 *   floor cell  alpha = its own reveal alpha (mazeRevealTimeline.ts); a border cell that owns a wrap dock is
 *               also multiplied by the dock alpha (it used to appear / vanish with the dock strips)
 *   wall / pad  alpha = the largest alpha among the (up to eight) floor cells around it, so a wall socket and the
 *               rim glow belong to the corridor that is fading in, exactly like the old "grow the clip by one tile"
 *
 * Pure: typed arrays in, typed arrays out; no Phaser, DOM or canvas.
 */
import {
  fillMazeRevealCellAlpha,
  type MazeRevealFrame
} from './mazeRevealTimeline';

/** Cells of the padded mask grid: (cols + 2) x (rows + 2). */
export const resolveRevealMaskLength = (cols: number, rows: number): number => (
  Math.max(0, cols + 2) * Math.max(0, rows + 2)
);

/**
 * Writes the padded alpha grid (0..255) for per-cell floor alphas.
 * `floorAlpha` and `isFloor` are cols * rows, row-major; `out` is (cols + 2) * (rows + 2).
 */
export const computeRevealMaskAlpha = (
  out: Uint8ClampedArray,
  cols: number,
  rows: number,
  floorAlpha: Float32Array,
  isFloor: Uint8Array
): void => {
  const stride = cols + 2;
  out.fill(0);
  // Floors first (their own alpha), walls and the pad ring after (max of the floor neighbours).
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = (y * cols) + x;
      if (isFloor[cell] === 1) {
        out[((y + 1) * stride) + x + 1] = Math.round(Math.max(0, Math.min(1, floorAlpha[cell]!)) * 255);
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
      let best = 0;
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
          if (value > best) {
            best = value;
          }
        }
      }
      out[(py * stride) + px] = best;
    }
  }
};

/** Cached per-maze inputs plus scratch buffers; one instance lives next to the board layer in the scene. */
export class MazeRevealMaskBuilder {
  private floorAlpha = new Float32Array(0);
  private isFloor = new Uint8Array(0);
  private isFloorFor: Int32Array | null = null;

  /**
   * Fills `out` ((cols + 2) * (rows + 2), alpha 0..255) for `frame` and returns nothing.
   * `ranks` is the BFS rank grid (-1 for walls), `owners` marks the border cells that own a wrap dock.
   */
  fill(
    out: Uint8ClampedArray,
    frame: MazeRevealFrame,
    ranks: Int32Array,
    owners: Uint8Array | null,
    cols: number,
    rows: number
  ): void {
    const cells = cols * rows;
    if (this.floorAlpha.length !== cells) {
      this.floorAlpha = new Float32Array(cells);
      this.isFloorFor = null;
    }
    if (this.isFloorFor !== ranks || this.isFloor.length !== cells) {
      this.isFloor = new Uint8Array(cells);
      for (let index = 0; index < cells; index += 1) {
        this.isFloor[index] = ranks[index]! >= 0 ? 1 : 0;
      }
      this.isFloorFor = ranks;
    }
    fillMazeRevealCellAlpha(this.floorAlpha, ranks, frame.tileCount, frame.direction, frame.window, frame.elapsedMs);
    if (owners !== null) {
      for (let index = 0; index < cells; index += 1) {
        if (owners[index] === 1) {
          this.floorAlpha[index] = this.floorAlpha[index]! * frame.dockAlpha;
        }
      }
    }
    computeRevealMaskAlpha(out, cols, rows, this.floorAlpha, this.isFloor);
  }
}
