// MAZER-PROG-020: the board a viewport would get for a given cell scale,
// computed with the REAL layout functions in the same order MenuScene uses
// (see MenuScene.resolveLegacyBoardAspectRatioForMode): seed aspect ratio,
// candidate grid, real layout, refined aspect ratio, final grid, final layout.
// Calibration scripts and the tile-floor test read this instead of copying the
// layout math, so they cannot drift from the shipped layout.
import {
  LEGACY_BOARD_BASE_SCALE,
  LEGACY_BOARD_MAX_SCALE,
  LEGACY_BOARD_MIN_TILE_PX,
  resolveLegacyBoardDimensions
} from './legacyBoardScale';
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

// The tile floor, enforced with the real layout. Returns `desiredScale`, or the largest scale below it
// that still draws tiles of at least LEGACY_BOARD_MIN_TILE_PX on this viewport. The limit is a property
// of the DEVICE (a ceiling), found by walking a fixed lattice (`step` apart, anchored at the base scale)
// up from the base scale until the first scale that cannot hold 10 px, or down from it when even the
// base scale cannot. The result is min(desired, ceiling), so it never falls as the level (and the desired
// scale) rises and never depends on which level asked first. A box that holds 10 px up to the top of the
// curve (every phone 360 px wide or more) always gets `desiredScale` back untouched. Never below `minScale`.
const floorCeilingCache = new Map<string, number>();

const resolveFloorCeiling = (
  viewport: LegacyBoardPlanViewport,
  surface: LegacyMenuLayoutSurface,
  step: number,
  minScale: number
): number => {
  const key = [
    viewport.width, viewport.height, viewport.safeArea?.top ?? 0, viewport.safeArea?.bottom ?? 0,
    viewport.safeArea?.left ?? 0, viewport.safeArea?.right ?? 0, viewport.browserMobileParity ? 1 : 0, surface, step, minScale
  ].join(':');
  const cached = floorCeilingCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const fits = (scale: number): boolean => planLegacyBoard(viewport, scale, surface).tileSize >= LEGACY_BOARD_MIN_TILE_PX;
  const at = (index: number): number => Math.round((LEGACY_BOARD_BASE_SCALE + (index * step)) * 10000) / 10000;
  let ceiling: number;
  if (fits(LEGACY_BOARD_BASE_SCALE)) {
    let index = 0;
    while (at(index + 1) <= LEGACY_BOARD_MAX_SCALE && fits(at(index + 1))) { index += 1; }
    ceiling = at(index + 1) <= LEGACY_BOARD_MAX_SCALE ? at(index) : Number.POSITIVE_INFINITY;
  } else {
    let index = 0;
    while (at(index) > minScale && !fits(at(index))) { index -= 1; }
    ceiling = Math.max(minScale, at(index));
  }
  if (floorCeilingCache.size >= 256) { floorCeilingCache.clear(); }
  floorCeilingCache.set(key, ceiling);
  return ceiling;
};

export const resolveLegacyBoardFloorScale = (
  viewport: LegacyBoardPlanViewport,
  desiredScale: number,
  surface: LegacyMenuLayoutSurface,
  step: number,
  minScale = 25
): number => {
  const ceiling = resolveFloorCeiling(viewport, surface, step, minScale);
  if (desiredScale >= ceiling) {
    return Math.max(minScale, ceiling);
  }
  if (!Number.isFinite(ceiling)) {
    return Math.max(minScale, desiredScale);
  }
  // Below a finite ceiling the desired scale is not guaranteed to hold 10 px: whether a tile fits is not smooth in the
  // scale (an odd-grid rounding can flip it between two lattice points, a 350x568 menu-demo at levels 214-219 drew
  // 9.87 px). So it is snapped DOWN onto the same fixed lattice the ceiling is found on and walked down to the first
  // lattice scale that fits. That is monotone in the desired scale (the largest fitting lattice point at or below it),
  // never above the ceiling, and does not depend on which level asked first.
  let index = Math.floor(((desiredScale - LEGACY_BOARD_BASE_SCALE) / step) + 1e-9);
  const scaleAt = (i: number): number => Math.round((LEGACY_BOARD_BASE_SCALE + (i * step)) * 10000) / 10000;
  while (scaleAt(index) > minScale && planLegacyBoard(viewport, scaleAt(index), surface).tileSize < LEGACY_BOARD_MIN_TILE_PX) { index -= 1; }
  return Math.max(minScale, scaleAt(index));
};
