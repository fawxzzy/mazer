import { describe, expect, test } from 'vitest';
import {
  applyLegacyGridGrowth,
  resolveLegacyFullHeightGrowth
} from '../../src/legacy-runtime/legacyBoardFullHeight';
import {
  LEGACY_BOARD_SIZE_RULE2_CAP_SCALE,
  LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX,
  resolveLegacyBoardScaleForLevelRule2,
  resolveLegacyBoardSizeRuleSpec
} from '../../src/legacy-runtime/legacyBoardScale';
import { planLegacyBoard, resolveLegacyBoardFloorScale, type LegacyBoardPlanViewport } from '../../src/legacy-runtime/legacyBoardPlan';
import {
  LEGACY_MIN_GRID_AXIS,
  createLegacyMaze,
  normalizeGridDimension,
  normalizeLegacyMazeGenerationProfile
} from '../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

// MAZER-UI-101 "Full height": the played board uses the whole height the screen gives it. The grid grows by
// whole rows (then columns) while the real layout keeps the tile at least as large as before, and the layout
// centres what is left, so no side of the board has a strip the other sides lack.

const PHONES: ReadonlyArray<LegacyBoardPlanViewport & { name: string }> = [
  { name: '360x640', width: 360, height: 640 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '390x844 safe', width: 390, height: 844, safeArea: { top: 47, bottom: 34 } },
  { name: '412x915', width: 412, height: 915 },
  { name: '430x932', width: 430, height: 932 }
];
const SAMPLE_LEVELS = [1, 2, 5, 10, 20, 30, 60, 90, 120, 180, 250, 300];
const LAYOUT_OPTIONS = (viewport: LegacyBoardPlanViewport, scale: number) => ({
  browserMobileParity: viewport.browserMobileParity ?? false,
  knownCellScale: scale,
  menuActionMode: 'guest' as const,
  safeArea: viewport.safeArea,
  useFloatingTouchControls: true
});

const growthFor = (viewport: LegacyBoardPlanViewport, level: number) => {
  // The scale the game really builds: the curve, held to this screen's tile floor.
  const spec = resolveLegacyBoardSizeRuleSpec(2);
  const scale = resolveLegacyBoardFloorScale(viewport, resolveLegacyBoardScaleForLevelRule2(level), 'play', spec.floorStep, spec.minScale, 2);
  const plan = planLegacyBoard(viewport, scale, 'play', 50, LEGACY_MIN_GRID_AXIS);
  const growth = resolveLegacyFullHeightGrowth({
    viewport,
    scale,
    aspectRatio: plan.aspectRatio,
    minGridAxis: LEGACY_MIN_GRID_AXIS
  });
  return { scale, plan, growth };
};

describe('MAZER-UI-101 full height: the grid growth', () => {
  test('is two even counts, deterministic, and never grows a landscape board', () => {
    for (const viewport of PHONES) {
      for (const level of SAMPLE_LEVELS) {
        const first = growthFor(viewport, level).growth;
        expect(growthFor(viewport, level).growth).toEqual(first);
        expect(first.rows % 2).toBe(0);
        expect(first.cols % 2).toBe(0);
      }
    }
    const desktop = { width: 1280, height: 720 };
    expect(resolveLegacyFullHeightGrowth({ viewport: desktop, scale: 40, aspectRatio: 1.6, minGridAxis: LEGACY_MIN_GRID_AXIS }))
      .toEqual({ rows: 0, cols: 0 });
  });

  test('the tile never shrinks, stays above the 5.5 px floor, and the board sits inside the safe area', () => {
    let grew = 0;
    for (const viewport of PHONES) {
      const bottomSafe = viewport.safeArea?.bottom ?? 0;
      const topSafe = viewport.safeArea?.top ?? 0;
      for (const level of SAMPLE_LEVELS) {
        const { scale, plan, growth } = growthFor(viewport, level);
        const grown = applyLegacyGridGrowth({ width: plan.width, height: plan.height }, growth, LEGACY_MIN_GRID_AXIS);
        const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, grown.width, grown.height, 'play', LAYOUT_OPTIONS(viewport, scale));
        expect(layout.tileSize).toBeGreaterThanOrEqual(plan.tileSize - 1e-6);
        expect(layout.tileSize).toBeGreaterThanOrEqual(LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX);
        expect(scale).toBeLessThanOrEqual(LEGACY_BOARD_SIZE_RULE2_CAP_SCALE);
        // Inside the viewport with the safe areas kept clear (a hair of margin is the layout's own 4 px).
        expect(layout.boardTop).toBeGreaterThanOrEqual(topSafe + 4);
        expect(layout.boardTop + layout.boardHeight).toBeLessThanOrEqual(viewport.height - bottomSafe - 4 + 1);
        expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
        expect(layout.boardLeft + layout.boardWidth).toBeLessThanOrEqual(viewport.width);
        if (growth.rows > 0 || growth.cols > 0) {
          grew += 1;
        }
      }
    }
    // The change is not a no-op: at least one device and level really got a bigger grid.
    expect(grew).toBeGreaterThan(0);
  }, 60_000);

  test('no side keeps a strip the others lack: top and bottom room match, and one more row would not fit', () => {
    for (const viewport of PHONES) {
      const bottomSafe = viewport.safeArea?.bottom ?? 0;
      const topSafe = viewport.safeArea?.top ?? 0;
      for (const level of SAMPLE_LEVELS) {
        const { scale, plan, growth } = growthFor(viewport, level);
        const grown = applyLegacyGridGrowth({ width: plan.width, height: plan.height }, growth, LEGACY_MIN_GRID_AXIS);
        const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, grown.width, grown.height, 'play', LAYOUT_OPTIONS(viewport, scale));
        const topRoom = layout.boardTop - topSafe;
        const bottomRoom = viewport.height - bottomSafe - (layout.boardTop + layout.boardHeight);
        expect(Math.abs(topRoom - bottomRoom)).toBeLessThanOrEqual(1);
        // The leftover is smaller than the two rows the growth could not add without shrinking the tile.
        const taller = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, grown.width, grown.height + 2, 'play', LAYOUT_OPTIONS(viewport, scale));
        expect(taller.tileSize < plan.tileSize - 1e-6 || growth.rows >= 60).toBe(true);
      }
    }
  }, 60_000);
});

describe('MAZER-UI-101 full height: layout and generation plumbing', () => {
  test('a height-bound clean-phone play board counts its inset pad inside the height bound', () => {
    // 390x844, 17 x 39 cells at level 30: the board used to run one 14 px pad past the lane limit.
    const layout = resolveLegacyMenuLayout(390, 844, 50, 17, 39, 'play', LAYOUT_OPTIONS({ width: 390, height: 844 }, 30));
    expect(layout.boardTop + layout.boardHeight).toBeLessThanOrEqual(844 - 4);
  });

  test('the non-floating play lane keeps its pinned top (only the floating-controls board is centred)', () => {
    const options = { ...LAYOUT_OPTIONS({ width: 390, height: 844 }, 30), useFloatingTouchControls: false };
    const layout = resolveLegacyMenuLayout(390, 844, 50, 17, 25, 'play', options);
    const topMargin = layout.boardTop;
    const taller = resolveLegacyMenuLayout(390, 844, 50, 17, 27, 'play', options);
    expect(taller.boardTop).toBe(topMargin);
  });

  test('applyLegacyGridGrowth keeps odd axes, passes an absent growth through and respects the generator ceiling', () => {
    expect(applyLegacyGridGrowth({ width: 15, height: 33 }, undefined, LEGACY_MIN_GRID_AXIS)).toEqual({ width: 15, height: 33 });
    expect(applyLegacyGridGrowth({ width: 15, height: 33 }, { rows: 2, cols: 0 }, LEGACY_MIN_GRID_AXIS)).toEqual({ width: 15, height: 35 });
    expect(applyLegacyGridGrowth({ width: 16, height: 34 }, { rows: 4, cols: 2 }, LEGACY_MIN_GRID_AXIS)).toEqual({ width: 17, height: 37 });
    expect(applyLegacyGridGrowth({ width: 15, height: 149 }, { rows: 20, cols: 0 }, LEGACY_MIN_GRID_AXIS).height)
      .toBe(normalizeGridDimension(150, LEGACY_MIN_GRID_AXIS));
  });

  test('the profile carries gridGrowth only when it grows the grid, as whole even counts', () => {
    expect(normalizeLegacyMazeGenerationProfile({}).gridGrowth).toBeUndefined();
    expect(normalizeLegacyMazeGenerationProfile({ gridGrowth: { rows: 0, cols: 0 } }).gridGrowth).toBeUndefined();
    expect(normalizeLegacyMazeGenerationProfile({ gridGrowth: { rows: 1, cols: 1 } }).gridGrowth).toBeUndefined();
    expect(normalizeLegacyMazeGenerationProfile({ gridGrowth: { rows: 5, cols: 2 } }).gridGrowth).toEqual({ rows: 4, cols: 2 });
    expect(normalizeLegacyMazeGenerationProfile({ gridGrowth: { rows: 999, cols: -4 } }).gridGrowth).toEqual({ rows: 60, cols: 0 });
  });

  test('the generator builds the grown grid, and a given seed builds the same maze twice', () => {
    const profile = { minGridAxis: LEGACY_MIN_GRID_AXIS, gridGrowth: { rows: 4, cols: 2 } };
    const base = createLegacyMaze(15, 31, 123, undefined, { minGridAxis: LEGACY_MIN_GRID_AXIS });
    expect(base.width).toBe(15);
    expect(base.height).toBe(31);
    const grown = applyLegacyGridGrowth({ width: 15, height: 31 }, profile.gridGrowth, LEGACY_MIN_GRID_AXIS);
    const first = createLegacyMaze(grown.width, grown.height, 123, undefined, profile);
    const second = createLegacyMaze(grown.width, grown.height, 123, undefined, profile);
    expect([first.width, first.height]).toEqual([17, 35]);
    expect(first.grid).toEqual(second.grid);
  });
});
