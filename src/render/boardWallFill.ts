/**
 * One rect for the whole play-board wall glass (MAZER-PERF, 2026-11-19).
 *
 * drawStaticBoard used to issue one translucent `fillRect` per grid cell (~2750 on a 25x55 board) and Phaser's canvas
 * Graphics replays every one of them on every render (~3 ms per frame under 4x CPU throttle). The cells are built by
 * `resolveLegacyPixelTileRect`: every edge is `Math.round(origin + index * tileSize)`, so neighbours share the exact
 * same integer edge (no gap, no overlap) and the union of all cells is one rectangle. Filling that rectangle once
 * composites the same colour and alpha onto exactly the same device pixels, so the picture is identical.
 *
 * Valid only while every cell is at least one pixel wide and tall (tileSize >= 1): below that, the per-cell
 * `Math.max(1, ...)` clamp makes cells overlap and the union is no longer the plain rounded bounds. Callers fall back
 * to the per-cell loop (returns null) in that case.
 */
export interface BoardFillRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const resolveBoardWallFillRect = (
  originX: number,
  originY: number,
  tileSize: number,
  columns: number,
  rows: number
): BoardFillRect | null => {
  if (
    !Number.isFinite(originX) || !Number.isFinite(originY) || !Number.isFinite(tileSize)
    || !Number.isInteger(columns) || !Number.isInteger(rows)
    || columns < 1 || rows < 1 || tileSize < 1
  ) {
    return null;
  }

  const left = Math.round(originX);
  const top = Math.round(originY);
  return {
    left,
    top,
    width: Math.round(originX + (columns * tileSize)) - left,
    height: Math.round(originY + (rows * tileSize)) - top
  };
};
