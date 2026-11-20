import { describe, expect, it } from 'vitest';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import { LEGACY_MIN_HIT_TARGET_PX, resolveLegacyMinHitRect } from '../../src/legacy-runtime/legacyHitTarget';
import {
  CLOSED_LEGACY_MENU_DROPDOWN_STATE,
  LEGACY_MENU_DROPDOWN_CLOSE_MS,
  LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX,
  LEGACY_MENU_DROPDOWN_ITEMS,
  LEGACY_MENU_DROPDOWN_OPEN_MS,
  LEGACY_MENU_DROPDOWN_SLIDE_PX,
  resolveLegacyMenuBurgerMetrics,
  resolveLegacyMenuBurgerSegments,
  resolveLegacyMenuDropdownLayout,
  resolveLegacyMenuDropdownProgress,
  resolveLegacyMenuDropdownRowAlpha,
  resolveLegacyMenuDropdownSlideOffset,
  resolveLegacyMenuDropdownTap,
  setLegacyMenuDropdownOpen
} from '../../src/legacy-runtime/legacyMenuDropdown';
import { shouldFrontDoorTapAnywhereStartRun } from '../../src/legacy-runtime/legacyFrontDoorHitZone';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 390, width: 844 },
  { height: 720, width: 1280 }
] as const;

/** Mirrors MenuScene.buildLegacyMenuDropdownButtons. */
const layoutFor = (viewport: { height: number; width: number }, safeArea = { left: 0, right: 0 }) => {
  const menu = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
  const frame = resolveLegacyHeaderControlFrame({
    height: menu.height,
    hudHeight: menu.lanes.hud?.height ?? 64,
    hudTop: menu.lanes.hud?.top ?? 0,
    placement: 'trailing',
    safeArea,
    sizeScale: menu.headerIconScale,
    width: menu.width
  });
  const hit = resolveLegacyMinHitRect(frame, viewport);
  return { frame, hit, layout: resolveLegacyMenuDropdownLayout({ safeArea, toggleFrame: frame, toggleHit: hit, viewport }) };
};

const isWhole = (value: number): boolean => Number.isInteger(value);

describe('legacy menu dropdown layout (L6 Menu A)', () => {
  it('lists Settings, Guide, Sound, Profile and Leaderboard in that order (MAZER-UI-096 shared rows)', () => {
    expect(LEGACY_MENU_DROPDOWN_ITEMS.map((item) => item.label)).toEqual(['Settings', 'Guide', 'Sound', 'Profile', 'Leaderboard']);
    // QA harnesses find the destinations by the retired corner buttons' semantic names.
    expect(LEGACY_MENU_DROPDOWN_ITEMS.map((item) => item.semanticAction)).toEqual(['Settings', 'Guide', 'Sound', 'Account', 'Leaderboard']);
  });

  it.each(VIEWPORTS)('is whole px, 44 px rows, inside the viewport and under the toggle at %o', (viewport) => {
    for (const safeArea of [{ left: 0, right: 0 }, { left: 47, right: 47 }]) {
      const { frame, hit, layout } = layoutFor(viewport, safeArea);
      const { panel, rows } = layout;
      for (const value of [panel.left, panel.top, panel.width, panel.height]) {
        expect(isWhole(value)).toBe(true);
      }
      expect(panel.left).toBeGreaterThanOrEqual(safeArea.left + LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX);
      expect(panel.left + panel.width).toBeLessThanOrEqual(viewport.width - safeArea.right - LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX);
      expect(panel.top + panel.height).toBeLessThan(viewport.height);
      // Hangs below the toggle's touch target (so the X stays tappable) and lines up with its right edge.
      expect(panel.top).toBeGreaterThan(hit.top + hit.height);
      expect(panel.left + panel.width).toBe(Math.min(
        Math.round(frame.left + frame.width),
        viewport.width - safeArea.right - LEGACY_MENU_DROPDOWN_EDGE_MARGIN_PX
      ));
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.rect.height).toBeGreaterThanOrEqual(LEGACY_MIN_HIT_TARGET_PX);
        expect(row.rect.width).toBeGreaterThanOrEqual(LEGACY_MIN_HIT_TARGET_PX);
        for (const value of [row.rect.left, row.rect.top, row.iconCenterX, row.labelLeft, row.centerY]) {
          expect(isWhole(value)).toBe(true);
        }
        expect(row.rect.top).toBeGreaterThanOrEqual(panel.top);
        expect(row.rect.top + row.rect.height).toBeLessThanOrEqual(panel.top + panel.height);
      }
      // Rows stack without gaps or overlap.
      expect(rows[1]!.rect.top).toBe(rows[0]!.rect.top + rows[0]!.rect.height);
      expect(rows[2]!.rect.top).toBe(rows[1]!.rect.top + rows[1]!.rect.height);
    }
  });

  it('drops the Profile row cleanly when it is filtered out', () => {
    const viewport = { height: 844, width: 390 };
    const { frame, hit } = layoutFor(viewport);
    const items = LEGACY_MENU_DROPDOWN_ITEMS.filter((item) => item.id !== 'profile');
    const layout = resolveLegacyMenuDropdownLayout({ items, toggleFrame: frame, toggleHit: hit, viewport });
    expect(layout.rows.map((row) => row.item.id)).toEqual(['settings', 'guide', 'sound', 'leaderboard']);
    expect(layout.panel.height).toBe(layoutFor(viewport).layout.panel.height - layout.rows[0]!.rect.height);
  });
});

describe('legacy menu dropdown taps', () => {
  const viewport = { height: 844, width: 390 };
  const { layout } = layoutFor(viewport);

  it('maps rows, panel padding, the toggle and outside', () => {
    for (const row of layout.rows) {
      expect(resolveLegacyMenuDropdownTap(layout, { x: row.labelLeft + 4, y: row.centerY })).toEqual({ id: row.item.id, kind: 'row' });
    }
    // Top padding strip above the first row: on the panel, not a row.
    expect(resolveLegacyMenuDropdownTap(layout, { x: layout.panel.left + 20, y: layout.panel.top + 2 })).toEqual({ kind: 'panel' });
    expect(resolveLegacyMenuDropdownTap(layout, {
      x: layout.toggle.left + (layout.toggle.width / 2),
      y: layout.toggle.top + (layout.toggle.height / 2)
    })).toEqual({ kind: 'toggle' });
    expect(resolveLegacyMenuDropdownTap(layout, { x: 60, y: 600 })).toEqual({ kind: 'outside' });
  });

  it('never lets a tap on the panel start a run, while empty space still starts once it is closed', () => {
    const base = {
      hasStartButton: true,
      levelPreviewActive: false,
      mode: 'menu',
      objectsUnderPointer: 0,
      otherButtonBounds: [layout.toggle],
      overlay: 'none',
      playAccess: true,
      viewport
    };
    const panelPoints = [
      { x: layout.panel.left + 20, y: layout.panel.top + 2 },
      ...layout.rows.map((row) => ({ x: row.labelLeft + 40, y: row.centerY }))
    ];
    for (const point of panelPoints) {
      expect(shouldFrontDoorTapAnywhereStartRun({ ...base, menuOpen: true, point })).toBe(false);
    }
    expect(shouldFrontDoorTapAnywhereStartRun({ ...base, menuOpen: true, point: { x: 60, y: 600 } })).toBe(false);
    expect(shouldFrontDoorTapAnywhereStartRun({ ...base, menuOpen: false, point: { x: 60, y: 600 } })).toBe(true);
  });
});

describe('legacy menu dropdown motion', () => {
  it('opens over OPEN_MS and closes over CLOSE_MS with an ease-out', () => {
    const open = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 1000, false);
    expect(resolveLegacyMenuDropdownProgress(open, 1000, false)).toBe(0);
    const mid = resolveLegacyMenuDropdownProgress(open, 1000 + (LEGACY_MENU_DROPDOWN_OPEN_MS / 2), false);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    expect(resolveLegacyMenuDropdownProgress(open, 1000 + LEGACY_MENU_DROPDOWN_OPEN_MS, false)).toBe(1);
    const closed = setLegacyMenuDropdownOpen(open, false, 2000, false);
    expect(resolveLegacyMenuDropdownProgress(closed, 2000, false)).toBe(1);
    expect(resolveLegacyMenuDropdownProgress(closed, 2000 + LEGACY_MENU_DROPDOWN_CLOSE_MS, false)).toBe(0);
  });

  it('reverses smoothly from where it was', () => {
    const open = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 0, false);
    const reversed = setLegacyMenuDropdownOpen(open, false, LEGACY_MENU_DROPDOWN_OPEN_MS / 2, false);
    expect(reversed.fromProgress).toBeCloseTo(0.5, 5);
    expect(resolveLegacyMenuDropdownProgress(reversed, (LEGACY_MENU_DROPDOWN_OPEN_MS / 2) + (LEGACY_MENU_DROPDOWN_CLOSE_MS / 2), false)).toBe(0);
  });

  it('jumps straight to the end state under reduced motion or an instant close', () => {
    const open = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 1000, true);
    expect(resolveLegacyMenuDropdownProgress(open, 1000, true)).toBe(1);
    const instant = setLegacyMenuDropdownOpen(open, false, 1001, false, true);
    expect(resolveLegacyMenuDropdownProgress(instant, 1001, false)).toBe(0);
  });

  it('fades rows in one after another and slides the panel in whole px', () => {
    expect(resolveLegacyMenuDropdownRowAlpha(0, 0)).toBe(0);
    expect(resolveLegacyMenuDropdownRowAlpha(0.3, 0)).toBeGreaterThan(resolveLegacyMenuDropdownRowAlpha(0.3, 2));
    expect(resolveLegacyMenuDropdownRowAlpha(1, 2)).toBe(1);
    expect(resolveLegacyMenuDropdownSlideOffset(0)).toBe(-LEGACY_MENU_DROPDOWN_SLIDE_PX);
    expect(resolveLegacyMenuDropdownSlideOffset(1)).toBe(0);
    for (const progress of [0.1, 0.33, 0.5, 0.77]) {
      expect(isWhole(resolveLegacyMenuDropdownSlideOffset(progress))).toBe(true);
    }
  });
});

describe('legacy menu burger glyph', () => {
  it('draws three level lines closed and an X with no middle line open', () => {
    const { gap, halfWidth } = resolveLegacyMenuBurgerMetrics(38);
    const closed = resolveLegacyMenuBurgerSegments(100, 50, halfWidth, gap, 0);
    expect(closed.map((segment) => segment.alpha)).toEqual([1, 1, 1]);
    expect(closed.map((segment) => segment.y1)).toEqual([50 - gap, 50, 50 + gap]);
    for (const segment of closed) {
      expect(segment.y1).toBe(segment.y2);
    }
    const open = resolveLegacyMenuBurgerSegments(100, 50, halfWidth, gap, 1);
    expect(open[1]!.alpha).toBe(0);
    // Both remaining lines cross at the centre at +-45 degrees.
    for (const segment of [open[0]!, open[2]!]) {
      expect((segment.x1 + segment.x2) / 2).toBeCloseTo(100, 6);
      expect((segment.y1 + segment.y2) / 2).toBeCloseTo(50, 6);
      expect(Math.abs(segment.y2 - segment.y1)).toBeCloseTo(Math.abs(segment.x2 - segment.x1), 6);
    }
  });

  it('keeps lines readable on the smallest 32 px header slot', () => {
    const metrics = resolveLegacyMenuBurgerMetrics(32);
    expect(metrics.lineWidth).toBeGreaterThanOrEqual(2);
    expect(metrics.gap).toBeGreaterThanOrEqual(4);
    expect(metrics.halfWidth * 2).toBeLessThan(32);
  });
});
