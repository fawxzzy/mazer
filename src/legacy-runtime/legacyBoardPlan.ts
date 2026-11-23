// MAZER-PROG-020: the board a viewport would get for a given cell scale,
// computed with the REAL layout functions in the same order MenuScene uses
// (see MenuScene.resolveLegacyBoardAspectRatioForMode): seed aspect ratio,
// candidate grid, real layout, refined aspect ratio, final grid, final layout.
// Calibration scripts and the tile-floor test read this instead of copying the
// layout math, so they cannot drift from the shipped layout.
import {
  resolveLegacyBoardDimensions,
  resolveLegacyBoardSizeRuleSpec,
  type LegacyBoardSizeRule
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
  boardScaleSetting = 50,
  // MAZER-UI-098: the generator's grid-axis floor for this board (25, or 15 under size rule 2).
  minGridAxis?: number
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
  const dims = { width: normalizeGridDimension(requested.width, minGridAxis), height: normalizeGridDimension(requested.height, minGridAxis) };
  const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, boardScaleSetting, dims.width, dims.height, surface, layoutOptions);
  return { scale, aspectRatio, width: dims.width, height: dims.height, tileSize: layout.tileSize };
};

// The tile floor, enforced with the real layout. Returns `desiredScale`, or the largest scale below it
// that still draws tiles of at least the size rule's minTilePx (10 px rule 1, 5.5 px rule 2) on this viewport. The limit is a property
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
  minScale: number,
  rule: LegacyBoardSizeRule
): number => {
  const spec = resolveLegacyBoardSizeRuleSpec(rule);
  const key = [rule,
    viewport.width, viewport.height, viewport.safeArea?.top ?? 0, viewport.safeArea?.bottom ?? 0,
    viewport.safeArea?.left ?? 0, viewport.safeArea?.right ?? 0, viewport.browserMobileParity ? 1 : 0, surface, step, minScale
  ].join(':');
  const cached = floorCeilingCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const fits = (scale: number): boolean => planLegacyBoard(viewport, scale, surface, 50, spec.minGridAxis).tileSize >= spec.minTilePx;
  const at = (index: number): number => Math.round((spec.baseScale + (index * step)) * 10000) / 10000;
  let ceiling: number;
  if (fits(spec.baseScale)) {
    let index = 0;
    while (at(index + 1) <= spec.maxScale && fits(at(index + 1))) { index += 1; }
    ceiling = at(index + 1) <= spec.maxScale ? at(index) : Number.POSITIVE_INFINITY;
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
  minScale = 25,
  // MAZER-UI-098: the size rule picks the lattice anchor, the top of the curve and the tile floor.
  rule: LegacyBoardSizeRule = 1
): number => {
  const spec = resolveLegacyBoardSizeRuleSpec(rule);
  const ceiling = resolveFloorCeiling(viewport, surface, step, minScale, rule);
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
  let index = Math.floor(((desiredScale - spec.baseScale) / step) + 1e-9);
  const scaleAt = (i: number): number => Math.round((spec.baseScale + (i * step)) * 10000) / 10000;
  while (scaleAt(index) > minScale && planLegacyBoard(viewport, scaleAt(index), surface, 50, spec.minGridAxis).tileSize < spec.minTilePx) { index -= 1; }
  return Math.max(minScale, scaleAt(index));
};
