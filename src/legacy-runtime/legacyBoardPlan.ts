// MAZER-PROG-020: the board a viewport would get for a given cell scale,
// computed with the REAL layout functions in the same order MenuScene uses
// (see MenuScene.resolveLegacyBoardAspectRatioForMode): seed aspect ratio,
// candidate grid, real layout, refined aspect ratio, final grid, final layout.
// Calibration scripts and the tile-floor test read this instead of copying the
// layout math, so they cannot drift from the shipped layout.
import { LEGACY_BOARD_MIN_TILE_PX, resolveLegacyBoardDimensions } from './legacyBoardScale';
import { normalizeGridDimension } from './legacyMaze';
import {
  resolveLegacyMenuBoardAspectRatio,
  resolveLegacyMenuLayout,
  type LegacyMenuLayoutSurface
} from './legacyMenuLayout';

export interface LegacyBoardPlanViewport {
  width: number;
  height: number;
  safeArea?: { top?: number; right?: number; bottom?: number; left?: number };
  browserMobileParity?: boolean;
}

export interface LegacyBoardPlan {
  scale: number;
  aspectRatio: number;
  width: number;
  height: number;
  // CSS px per tile after the layout's own bleed margin and flooring.
  tileSize: number;
}

const clampAspect = (value: number): number => Math.min(2.2, Math.max(0.45, value));

export const planLegacyBoard = (
  viewport: LegacyBoardPlanViewport,
  scale: number,
  surface: LegacyMenuLayoutSurface = 'menu',
  boardScaleSetting = 50
): LegacyBoardPlan => {
  const layoutOptions = {
    browserMobileParity: viewport.browserMobileParity ?? false,
    knownCellScale: scale,
    menuActionMode: 'guest',
    safeArea: viewport.safeArea,
    useFloatingTouchControls: true
  } as const;
  const seedAspect = resolveLegacyMenuBoardAspectRatio(viewport.width, viewport.height, boardScaleSetting, surface, layoutOptions);
  const seedDims = resolveLegacyBoardDimensions(scale, seedAspect);
  const seedLayout = resolveLegacyMenuLayout(viewport.width, viewport.height, boardScaleSetting, seedDims.width, seedDims.height, surface, layoutOptions);
  const aspectRatio = seedLayout.boardWidth > 0 && seedLayout.boardHeight > 0
    ? clampAspect(seedLayout.boardWidth / seedLayout.boardHeight)
    : seedAspect;
  const requested = resolveLegacyBoardDimensions(scale, aspectRatio);
  // The generator makes every axis odd (an even axis loses one cell), and the layout that draws the
  // board sees the GENERATED grid, so the tile size is read for the odd grid, not the requested one.
  const dims = { width: normalizeGridDimension(requested.width), height: normalizeGridDimension(requested.height) };
  const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, boardScaleSetting, dims.width, dims.height, surface, layoutOptions);
  return { scale, aspectRatio, width: dims.width, height: dims.height, tileSize: layout.tileSize };
};

// The tile floor, enforced with the real layout. Returns the largest scale <= `desiredScale`
// (stepping down by `step`) whose board draws tiles of at least LEGACY_BOARD_MIN_TILE_PX on this
// viewport. On every phone 320 px wide or more at the scales the ladder uses it returns
// `desiredScale` unchanged, so the board stays a function of the level; it only bites on a
// narrower box that physically cannot hold the board at 10 px. Never goes below `minScale`.
export const resolveLegacyBoardFloorScale = (
  viewport: LegacyBoardPlanViewport,
  desiredScale: number,
  surface: LegacyMenuLayoutSurface,
  step: number,
  minScale = 25
): number => {
  let scale = desiredScale;
  while (scale > minScale && planLegacyBoard(viewport, scale, surface).tileSize < LEGACY_BOARD_MIN_TILE_PX) {
    scale = Math.max(minScale, Math.round((scale - step) * 10000) / 10000);
  }
  return scale;
};
