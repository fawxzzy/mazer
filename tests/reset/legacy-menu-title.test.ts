import { describe, expect, test } from 'vitest';
import {
  LEGACY_MENU_PATH_TITLE_CELLS,
  LEGACY_MENU_PATH_TITLE_COLUMNS,
  LEGACY_MENU_PATH_TITLE_GRID,
  resolveLegacyMenuPathTitleDiamondVertices,
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitPose,
  resolveLegacyMenuTitleFontSize,
  resolveLegacyMenuTitlePresentation
} from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  // The title is now deliberately a small, compact banner sized from its own
  // reserved layout lane height (see legacyMenuLayout.ts's menuTitleReserve),
  // not from board size -- board size and the title reserve are computed
  // independently so the title can stay compact regardless of how large the
  // board grows to fill available space. fontSize = max(13, round(reserve *
  // 0.68)); surface/isPortrait no longer change fontSize itself (only the
  // shadow offsets and alpha channels still branch on them).

  test('scales font size directly from the title reserve height, not board size', () => {
    const compact = resolveLegacyMenuTitlePresentation(40, 17, false);
    const roomier = resolveLegacyMenuTitlePresentation(56, 17, false);

    expect(compact.fontSize).toBe(27);
    expect(roomier.fontSize).toBe(38);
    expect(roomier.fontSize).toBeGreaterThan(compact.fontSize);
  });

  test('uses one shared compact floor for the renderer and header fit calculation', () => {
    const presentation = resolveLegacyMenuTitlePresentation(1, 3, true);

    expect(resolveLegacyMenuTitleFontSize(1)).toBe(13);
    expect(presentation.fontSize).toBe(13);
  });

  test('keeps the normal-phone inline fallback readable while allowing it to fit', () => {
    const fontSize = resolveLegacyMenuTitleFontSize(32);
    const layout = resolveLegacyMenuPathTitleLayout(160, 28, fontSize);

    expect(fontSize).toBe(22);
    expect(layout.cellSize).toBe(2);
    expect(layout.width).toBe(82);
  });

  test('surface and portrait no longer change font size for the same reserve height (only alpha/shadow do)', () => {
    const snapshotLandscape = resolveLegacyMenuTitlePresentation(44, 17, false, 800, 'snapshot');
    const proceduralPortrait = resolveLegacyMenuTitlePresentation(44, 7, true, 400, 'procedural');

    expect(snapshotLandscape.fontSize).toBe(proceduralPortrait.fontSize);
  });

  test('keeps the landscape wordmark shadow and alpha channels distinct and ordered', () => {
    const presentation = resolveLegacyMenuTitlePresentation(44, 17, false);

    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(5);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(7);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.68);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.72);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.32);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark shadow and alpha channels distinct and ordered', () => {
    const presentation = resolveLegacyMenuTitlePresentation(44, 7, true, 430);

    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(6);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.74);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.78);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.4);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('gives the procedural (generated-board) portrait wordmark a brighter alpha than the snapshot one', () => {
    const snapshotPresentation = resolveLegacyMenuTitlePresentation(44, 7, true, 430, 'snapshot');
    const proceduralPresentation = resolveLegacyMenuTitlePresentation(44, 7, true, 430, 'procedural');

    expect(proceduralPresentation.fontSize).toBe(snapshotPresentation.fontSize);
    expect(proceduralPresentation.titleAlpha).toBeGreaterThan(snapshotPresentation.titleAlpha);
    expect(proceduralPresentation.shadowAlpha).toBeLessThan(proceduralPresentation.titleAlpha);
  });

  test('tightens shadow offsets in ultra-narrow side panels without changing font size', () => {
    const normal = resolveLegacyMenuTitlePresentation(44, 3, true, 430);
    const ultraNarrow = resolveLegacyMenuTitlePresentation(44, 3, true, 172);

    expect(ultraNarrow.fontSize).toBe(normal.fontSize);
    expect(ultraNarrow.shadowOffsetX).toBeLessThanOrEqual(4);
    expect(ultraNarrow.shadowOffsetY).toBeLessThanOrEqual(5);
    expect(ultraNarrow.titleAlpha).toBeGreaterThan(ultraNarrow.shadowAlpha);
  });

  test('gives the procedural ultra-narrow wordmark a dimmer alpha than the snapshot one', () => {
    const snapshotPresentation = resolveLegacyMenuTitlePresentation(44, 3, true, 172, 'snapshot');
    const proceduralPresentation = resolveLegacyMenuTitlePresentation(44, 3, true, 172, 'procedural');

    expect(proceduralPresentation.titleAlpha).toBeLessThan(snapshotPresentation.titleAlpha);
    expect(proceduralPresentation.titleAlpha).toBeGreaterThan(proceduralPresentation.shadowAlpha);
  });

  test('builds the menu title from reusable maze path cells', () => {
    const layout = resolveLegacyMenuPathTitleLayout(200, 72, 72);

    expect(LEGACY_MENU_PATH_TITLE_COLUMNS).toBe(41);
    expect(LEGACY_MENU_PATH_TITLE_CELLS).toHaveLength(87);
    expect(layout.cells).toBe(LEGACY_MENU_PATH_TITLE_CELLS);
    expect(layout.grid).toBe(LEGACY_MENU_PATH_TITLE_GRID);
    expect(layout.cellSize).toBe(8);
    expect(layout.coreInset).toBe(1);
    expect(layout.width).toBe(328);
    expect(layout.height).toBe(56);
    expect(layout.left).toBe(36);
    expect(layout.top).toBe(44);
    expect(layout.cells[0]).toEqual({ column: 0, row: 0, order: 0 });
    expect(layout.cells.at(-1)).toEqual({ column: 40, row: 6, order: 86 });
    expect(layout.grid[0]?.[0]).toBe(true);
    expect(layout.grid[0]?.[1]).toBe(false);
    expect(layout.grid[6]?.[40]).toBe(true);
  });

  test('points all eight settled viewport-edge poses inward on phone and desktop geometry', () => {
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const geometry = {
        bottom: height - 2,
        centerX: width / 2,
        centerY: height / 2,
        crownBottom: height - 2,
        crownHalf: 0,
        crownTop: 2,
        left: 2,
        right: width - 2,
        top: 2
      };
      const poses = Array.from({ length: 8 }, (_, index) => (
        resolveLegacyMenuPathTitleOrbitPose(geometry, index / 8)
      ));

      expect(poses.map(({ x, y }) => [x, y])).toEqual([
        [2, 2],
        [width / 2, 2],
        [width - 2, 2],
        [width - 2, height / 2],
        [width - 2, height - 2],
        [width / 2, height - 2],
        [2, height - 2],
        [2, height / 2]
      ]);

      for (const pose of poses) {
        const centerDx = geometry.centerX - pose.x;
        const centerDy = geometry.centerY - pose.y;
        const centerLength = Math.hypot(centerDx, centerDy);
        const facingDot = ((Math.cos(pose.facing) * centerDx) + (Math.sin(pose.facing) * centerDy)) / centerLength;
        expect(facingDot).toBeGreaterThanOrEqual(0.999999);
      }
    }
  });

  test('shares exact diamond vertices between ambient and transfer renderers', () => {
    const centerX = 27;
    const centerY = 41;
    const radius = 7;
    const facing = Math.atan2(19, 13);
    const ambient = resolveLegacyMenuPathTitleDiamondVertices(centerX, centerY, radius, facing);
    const transfer = resolveLegacyMenuPathTitleDiamondVertices(centerX, centerY, radius, facing);
    const [leading] = ambient;
    const leadingDx = leading.x - centerX;
    const leadingDy = leading.y - centerY;

    expect(transfer).toEqual(ambient);
    expect(Math.hypot(leadingDx, leadingDy)).toBeCloseTo(radius, 12);
    expect(leadingDx / radius).toBeCloseTo(Math.cos(facing), 12);
    expect(leadingDy / radius).toBeCloseTo(Math.sin(facing), 12);
  });

  test('preserves clockwise, reversed, corner-bank, and settled orbit facing', () => {
    const geometry = {
      bottom: 98,
      centerX: 50,
      centerY: 50,
      crownBottom: 98,
      crownHalf: 0,
      crownTop: 2,
      left: 2,
      right: 98,
      top: 2
    };

    expect(resolveLegacyMenuPathTitleOrbitPose(geometry, 0.125, true, false).facing).toBeCloseTo(0, 12);
    expect(resolveLegacyMenuPathTitleOrbitPose(geometry, 0.125, true, true).facing).toBeCloseTo(Math.PI, 12);
    expect(resolveLegacyMenuPathTitleOrbitPose(geometry, 0.25, true, false).facing).toBeCloseTo(
      (Math.PI / 2) + ((Math.PI / 4) * 0.55),
      12
    );
    expect(resolveLegacyMenuPathTitleOrbitPose(geometry, 0).facing).toBeCloseTo(Math.PI / 4, 12);
  });
});
