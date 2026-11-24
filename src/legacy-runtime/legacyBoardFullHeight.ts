// MAZER-UI-101 "Full height": a played-game board should use the whole height the screen gives it.
//
// The board is width-bound on a phone: the tile size is set by the number of columns across the width, and the
// generated grid (about scale x scale cells, spread by the aspect ratio) rarely lands on exactly the height that
// is left. The remainder used to sit as a strip under the board, so the bottom bleed paths had more room than the
// other three sides. The fix grows the GRID, not the tile: starting from the grid the scale and aspect ratio give,
// add two rows at a time while the real layout still draws tiles at least as large as before, then two columns the
// same way, and let the layout centre what is left over (legacyMenuLayout.ts). The tile never shrinks, so the
// size curve (scale 88 cap, minTilePx) and the device tile floor keep holding.
//
// Everything here runs the REAL layout functions (the same ones MenuScene draws with), so it cannot drift from the
// shipped layout. The result is two even counts carried on the generation profile (profile.gridGrowth), which the
// generator adds to the grid; they are pure functions of (viewport, scale, aspect ratio), so a given device and
// level always get the same grid and a given seed the same maze.
import { resolveLegacyBoardDimensions } from './legacyBoardScale';
import { LEGACY_GRID_GROWTH_MAX, normalizeGridDimension } from './legacyMaze';
import type { LegacyBoardPlanViewport } from './legacyBoardPlan';
import { resolveLegacyMenuLayout } from './legacyMenuLayout';

export interface LegacyGridGrowth {
  rows: number;
  cols: number;
}

export interface LegacyFullHeightInput {
  viewport: LegacyBoardPlanViewport;
  // The cell scale and the aspect ratio the generator turns into the base grid (resolveLegacyBoardDimensions).
  scale: number;
  aspectRatio: number;
  // The generator's grid-axis floor for this board (profile.minGridAxis); 25 when absent.
  minGridAxis?: number;
  // The board-scale setting the layout reads (the options slider); 50 is the neutral value MenuScene plans with.
  boardScaleSetting?: number;
}

const TILE_EPSILON = 1e-6;
const MAX_STEPS = LEGACY_GRID_GROWTH_MAX / 2;

// Portrait phones only. A landscape desktop board is height-bound already (the tile is set by the rows), so
// adding columns would just widen the maze to the screen; the owner approved the phone fix, not a new desktop board.
const isPortraitViewport = (viewport: LegacyBoardPlanViewport): boolean => viewport.height > viewport.width;

export const resolveLegacyFullHeightGrowth = (input: LegacyFullHeightInput): LegacyGridGrowth => {
  const { viewport, scale, aspectRatio, minGridAxis, boardScaleSetting = 50 } = input;
  if (!isPortraitViewport(viewport) || !(viewport.width > 0) || !(viewport.height > 0)) {
    return { rows: 0, cols: 0 };
  }
  const requested = resolveLegacyBoardDimensions(scale, aspectRatio);
  const base = {
    width: normalizeGridDimension(requested.width, minGridAxis),
    height: normalizeGridDimension(requested.height, minGridAxis)
  };
  const layoutOptions = {
    browserMobileParity: viewport.browserMobileParity ?? false,
    knownCellScale: scale,
    menuActionMode: 'guest',
    safeArea: viewport.safeArea,
    useFloatingTouchControls: true
  } as const;
  const tileFor = (width: number, height: number): number => (
    resolveLegacyMenuLayout(viewport.width, viewport.height, boardScaleSetting, width, height, 'play', layoutOptions).tileSize
  );
  const baseTile = tileFor(base.width, base.height);
  let rows = 0;
  let cols = 0;
  for (let step = 0; step < MAX_STEPS && tileFor(base.width, base.height + rows + 2) >= baseTile - TILE_EPSILON; step += 1) {
    rows += 2;
  }
  for (let step = 0; step < MAX_STEPS && tileFor(base.width + cols + 2, base.height + rows) >= baseTile - TILE_EPSILON; step += 1) {
    cols += 2;
  }
  return { rows, cols };
};

// The grid the generator builds: the base grid (odd per axis, floored at minGridAxis) plus the growth, never past
// the generator's own ceiling.
export const applyLegacyGridGrowth = (
  dims: { width: number; height: number },
  growth: LegacyGridGrowth | undefined,
  minGridAxis?: number
): { width: number; height: number } => {
  const width = normalizeGridDimension(dims.width, minGridAxis);
  const height = normalizeGridDimension(dims.height, minGridAxis);
  if (growth === undefined) {
    return { width: dims.width, height: dims.height };
  }
  return {
    width: normalizeGridDimension(width + growth.cols, minGridAxis),
    height: normalizeGridDimension(height + growth.rows, minGridAxis)
  };
};
