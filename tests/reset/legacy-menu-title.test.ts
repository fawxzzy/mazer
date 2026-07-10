import { describe, expect, test } from 'vitest';
import {
  LEGACY_MENU_PATH_TITLE_CELLS,
  LEGACY_MENU_PATH_TITLE_COLUMNS,
  LEGACY_MENU_PATH_TITLE_GRID,
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuTitlePresentation
} from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu title presentation', () => {
  test('keeps the desktop wordmark large enough to overlap the board like the legacy screen', () => {
    const presentation = resolveLegacyMenuTitlePresentation(833, 17, false);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(184);
    expect(presentation.fontSize).toBeLessThanOrEqual(190);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(5);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(7);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.68);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.72);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.32);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('keeps the portrait wordmark readable while still overlapping the board more deeply', () => {
    const presentation = resolveLegacyMenuTitlePresentation(387, 7, true);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(79);
    expect(presentation.fontSize).toBeLessThanOrEqual(81);
    expect(presentation.shadowOffsetX).toBeGreaterThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeGreaterThanOrEqual(6);
    expect(presentation.titleAlpha).toBeGreaterThanOrEqual(0.74);
    expect(presentation.titleAlpha).toBeLessThanOrEqual(0.78);
    expect(presentation.shadowAlpha).toBeGreaterThanOrEqual(0.36);
    expect(presentation.shadowAlpha).toBeLessThanOrEqual(0.4);
    expect(presentation.shadowAlpha).toBeLessThan(presentation.titleAlpha);
  });

  test('uses a wide portrait wordmark for generated menu boards while layout owns border clearance', () => {
    const snapshotPresentation = resolveLegacyMenuTitlePresentation(387, 7, true, 430, 'snapshot');
    const proceduralPresentation = resolveLegacyMenuTitlePresentation(387, 7, true, 430, 'procedural');

    expect(proceduralPresentation.fontSize).toBeGreaterThan(snapshotPresentation.fontSize);
    expect(proceduralPresentation.fontSize).toBeGreaterThanOrEqual(102);
    expect(proceduralPresentation.fontSize).toBeLessThanOrEqual(104);
    expect(proceduralPresentation.titleAlpha).toBeGreaterThan(snapshotPresentation.titleAlpha);
    expect(proceduralPresentation.shadowAlpha).toBeLessThan(proceduralPresentation.titleAlpha);
  });

  test('caps the wordmark in ultra-narrow side panels without changing normal portrait scale', () => {
    const presentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172);

    expect(presentation.fontSize).toBeGreaterThanOrEqual(42);
    expect(presentation.fontSize).toBeLessThanOrEqual(52);
    expect(presentation.fontSize * 3.25).toBeLessThanOrEqual(172);
    expect(presentation.shadowOffsetX).toBeLessThanOrEqual(4);
    expect(presentation.shadowOffsetY).toBeLessThanOrEqual(5);
    expect(presentation.titleAlpha).toBeGreaterThan(presentation.shadowAlpha);
  });

  test('uses a tighter ultra-narrow wordmark for dense generated menu boards', () => {
    const snapshotPresentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172, 'snapshot');
    const proceduralPresentation = resolveLegacyMenuTitlePresentation(147, 3, true, 172, 'procedural');

    expect(proceduralPresentation.fontSize).toBeLessThan(snapshotPresentation.fontSize);
    expect(proceduralPresentation.fontSize).toBeGreaterThanOrEqual(46);
    expect(proceduralPresentation.fontSize).toBeLessThanOrEqual(48);
    expect(proceduralPresentation.fontSize * 3.25).toBeLessThanOrEqual(172);
    expect(proceduralPresentation.titleAlpha).toBeLessThan(snapshotPresentation.titleAlpha);
    expect(proceduralPresentation.titleAlpha).toBeGreaterThan(proceduralPresentation.shadowAlpha);
  });

  test('builds the menu title from reusable maze path cells', () => {
    const layout = resolveLegacyMenuPathTitleLayout(200, 72, 72);

    expect(LEGACY_MENU_PATH_TITLE_COLUMNS).toBe(29);
    expect(LEGACY_MENU_PATH_TITLE_CELLS).toHaveLength(87);
    expect(layout.cells).toBe(LEGACY_MENU_PATH_TITLE_CELLS);
    expect(layout.grid).toBe(LEGACY_MENU_PATH_TITLE_GRID);
    expect(layout.cellSize).toBe(8);
    expect(layout.coreInset).toBe(1);
    expect(layout.width).toBe(232);
    expect(layout.height).toBe(56);
    expect(layout.left).toBe(84);
    expect(layout.top).toBe(44);
    expect(layout.cells[0]).toEqual({ column: 0, row: 0, order: 0 });
    expect(layout.cells.at(-1)).toEqual({ column: 28, row: 6, order: 86 });
    expect(layout.grid[0]?.[0]).toBe(true);
    expect(layout.grid[0]?.[1]).toBe(false);
    expect(layout.grid[6]?.[28]).toBe(true);
  });
});
