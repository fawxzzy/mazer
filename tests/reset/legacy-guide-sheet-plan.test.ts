import { describe, expect, test } from 'vitest';
import {
  LEGACY_GUIDE_PLAN_VIEWPORTS,
  LEGACY_GUIDE_SHEET_SIZES,
  buildLegacyGuideSheetPlan,
  resolveLegacyGuideKeyboardLineHeight,
  resolveLegacyGuideRowHeight
} from '../../src/legacy-runtime/legacyGuideSheetPlan';
import { LEGACY_GUIDE_ROWS, LEGACY_GUIDE_TITLE } from '../../src/legacy-runtime/legacyGuideContent';
import { LEGACY_SETTINGS_SIZES, buildLegacySettingsSheetPlan } from '../../src/legacy-runtime/legacySettingsSheetPlan';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

// Row heights as the scene would measure them: 1-3 wrapped copy lines per row, plus a 2-line keyboard line.
const MEASURED_HEIGHTS = [
  resolveLegacyGuideRowHeight(1),
  resolveLegacyGuideRowHeight(1),
  resolveLegacyGuideRowHeight(3),
  resolveLegacyGuideRowHeight(3),
  resolveLegacyGuideRowHeight(3),
  resolveLegacyGuideRowHeight(2),
  resolveLegacyGuideKeyboardLineHeight(2)
];

const overlaps = (
  a: { height: number; left: number; top: number; width: number },
  b: { height: number; left: number; top: number; width: number }
): boolean => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe('guide sheet plan', () => {
  test('row heights wrap instead of shrinking and never drop under the 56 px row minimum', () => {
    expect(resolveLegacyGuideRowHeight(1)).toBeGreaterThanOrEqual(56);
    expect(resolveLegacyGuideRowHeight(3)).toBeGreaterThan(resolveLegacyGuideRowHeight(2));
    expect(LEGACY_GUIDE_SHEET_SIZES.copyFontSize).toBeGreaterThanOrEqual(14);
    expect(LEGACY_GUIDE_SHEET_SIZES.headingFontSize).toBeGreaterThanOrEqual(14);
    expect(LEGACY_GUIDE_SHEET_SIZES.footerHeight).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
  });

  test.each(LEGACY_GUIDE_PLAN_VIEWPORTS.map((v) => [`${v.width}x${v.height}`, v] as const))(
    '%s: same card/title/close family as the Settings sheet; Got it is fixed and tappable; body is inside the card',
    (_label, viewport) => {
      const plan = buildLegacyGuideSheetPlan({ ...viewport, itemHeights: MEASURED_HEIGHTS });
      const settings = buildLegacySettingsSheetPlan({ context: 'menu', ...viewport, signedIn: true });
      expect(plan.card.width).toBe(settings.card.width);
      expect(plan.title.fontSize).toBe(settings.title.fontSize);
      expect(plan.title.text).toBe(LEGACY_GUIDE_TITLE);
      expect(plan.close.rect.width).toBe(LEGACY_SETTINGS_SIZES.closeWidth);
      expect(plan.close.rect.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(plan.close.rect.left + plan.close.rect.width).toBe(plan.card.left + plan.card.width);
      expect(overlaps(plan.close.rect, plan.card)).toBe(false);
      expect(plan.footer.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(plan.footer.top + plan.footer.height).toBeLessThanOrEqual(plan.card.top + plan.card.height);
      expect(plan.bodyViewport.top + plan.bodyViewport.height).toBeLessThanOrEqual(plan.footer.top);
      expect(plan.itemWidth).toBe(plan.bodyViewport.width);
      expect(plan.card.top).toBeGreaterThanOrEqual(plan.panel.top);
      expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(plan.panel.top + plan.panel.height);
    }
  );

  test('a tall desktop shows the whole guide; 320x568 scrolls and keeps Got it pinned', () => {
    const wide = buildLegacyGuideSheetPlan({ height: 1000, itemHeights: MEASURED_HEIGHTS, width: 1280 });
    expect(wide.scrollable).toBe(false);
    expect(wide.maxScrollOffset).toBe(0);
    const narrow = buildLegacyGuideSheetPlan({ height: 568, itemHeights: MEASURED_HEIGHTS, width: 320 });
    expect(narrow.scrollable).toBe(true);
    expect(narrow.maxScrollOffset).toBeGreaterThan(0);
    expect(narrow.footer.top).toBeGreaterThanOrEqual(narrow.bodyViewport.top + narrow.bodyViewport.height);
    expect(narrow.scrollRailViewport.left + narrow.scrollRailViewport.width).toBeLessThanOrEqual(narrow.card.left + narrow.card.width);
  });

  test('items stack with the item gap and never overlap', () => {
    const plan = buildLegacyGuideSheetPlan({ height: 844, itemHeights: MEASURED_HEIGHTS, width: 390 });
    expect(plan.itemTops).toHaveLength(MEASURED_HEIGHTS.length);
    plan.itemTops.forEach((top, index) => {
      if (index > 0) {
        const previous = plan.itemTops[index - 1]! + MEASURED_HEIGHTS[index - 1]!;
        expect(top - previous).toBe(LEGACY_GUIDE_SHEET_SIZES.itemGap);
      }
    });
    expect(plan.contentHeight).toBe(plan.itemTops[plan.itemTops.length - 1]! + MEASURED_HEIGHTS[MEASURED_HEIGHTS.length - 1]!);
  });

  test('every guide row id has an item slot (rows first, optional keyboard line last)', () => {
    expect(MEASURED_HEIGHTS.length).toBe(LEGACY_GUIDE_ROWS.length + 1);
  });
});
