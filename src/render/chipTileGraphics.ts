/**
 * Chip tiles on Phaser Graphics, for the small grids that are not the board: the dot-matrix wordmarks
 * (title, Start/Login, level numeral) and the Guide's tile swatch.
 *
 * The geometry is the board's own: `computeChipGeometry` from boardTileBake.ts (rounded convex corners,
 * dead ends fully round, joins merged with no inset, one thin lit rim on the exposed sides). Only the
 * colours differ per caller (a wordmark colours each cell, the board uses `boardMaterial.chip` + rim).
 * Geometry is computed once per (grid content, tile size) and cached; drawing is one rim rect and one fill rect
 * per visible cell.
 */
import type Phaser from 'phaser';
import { computeChipGeometry, type ChipTileGeometry } from './boardTileBake';

export interface ChipGridInput {
  /** grid[row][column] === true is a tile. */
  grid: ReadonlyArray<ReadonlyArray<boolean>>;
  columns: number;
  rows: number;
  /** Layout-px top-left of cell (0,0). */
  left: number;
  top: number;
  cellSize: number;
}

export interface ChipCellColors {
  rim: number;
  fill: number;
}

export type ChipGridGeometry = ReadonlyMap<string, ChipTileGeometry>;

const geometryCache = new Map<string, ChipGridGeometry>();
const GEOMETRY_CACHE_LIMIT = 24;

const gridSignature = (grid: ReadonlyArray<ReadonlyArray<boolean>>): string => grid
  .map((row) => row.map((on) => (on ? '1' : '0')).join(''))
  .join('/');

/**
 * Chip geometry for a small grid, cached by content (grid bits, size, DPR): a wordmark rebuilds its
 * layout object every frame, but the geometry is computed once.
 */
export const resolveChipGridGeometry = (input: ChipGridInput, devicePixelRatio = 1): ChipGridGeometry => {
  const key = `${input.columns}x${input.rows}|${input.cellSize}|${devicePixelRatio}|${gridSignature(input.grid)}`;
  let tiles = geometryCache.get(key);
  if (!tiles) {
    const built = new Map<string, ChipTileGeometry>();
    for (const tile of computeChipGeometry({
      grid: input.grid,
      width: input.columns,
      height: input.rows,
      tileSize: input.cellSize,
      devicePixelRatio,
      style: 'chip'
    })) {
      built.set(`${tile.x},${tile.y}`, tile);
    }
    if (geometryCache.size >= GEOMETRY_CACHE_LIMIT) {
      geometryCache.clear();
    }
    geometryCache.set(key, built);
    tiles = built;
  }
  return tiles;
};

const radiiObject = (radii: readonly [number, number, number, number]): { tl: number; tr: number; br: number; bl: number } => ({
  tl: radii[0],
  tr: radii[1],
  br: radii[2],
  bl: radii[3]
});

/** Draws one chip cell (rim rect, then the inset fill) onto `graphics`. No-op when the cell is not a tile. */
export const drawChipCell = (
  graphics: Phaser.GameObjects.Graphics,
  geometry: ChipGridGeometry,
  left: number,
  top: number,
  column: number,
  row: number,
  colors: ChipCellColors,
  alpha: number
): void => {
  const tile = geometry.get(`${column},${row}`);
  if (!tile || alpha <= 0) {
    return;
  }
  graphics.fillStyle(colors.rim, alpha);
  graphics.fillRoundedRect(left + tile.left, top + tile.top, tile.width, tile.height, radiiObject(tile.radii));
  if (tile.fill.width > 0 && tile.fill.height > 0) {
    graphics.fillStyle(colors.fill, alpha);
    graphics.fillRoundedRect(
      left + tile.fill.left,
      top + tile.fill.top,
      tile.fill.width,
      tile.fill.height,
      radiiObject(tile.fillRadii)
    );
  }
};
