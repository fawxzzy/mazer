import { describe, expect, test } from 'vitest';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyRunStatusPanelLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyUiLabelCenterY
} from '../../src/legacy-runtime/legacyUiStandards';

describe('legacy UI standards', () => {
  test('uses one two-row run-status component in menu and play lanes', () => {
    expect(resolveLegacyRunStatusPanelLayout(390)).toEqual({
      fontSize: 14,
      height: 62,
      horizontalPadding: 18,
      lineSpacing: 3,
      textWidthSafetyRatio: 0.96,
      width: 260
    });
    expect(resolveLegacyRunStatusPanelLayout(390, 208).width).toBe(208);
    expect(resolveLegacyRunStatusPanelLayout(900).width).toBe(292);
  });

  test('lifts legacy glyph labels to optical center without changing horizontal geometry', () => {
    expect(resolveLegacyUiLabelCenterY(100, 40, 'button')).toBe(93);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'overlay-action')).toBe(98);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'toggle-title')).toBe(98);
  });

  test('keeps compact guide copy smaller and clears the title rule', () => {
    const compact = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT - 1);
    const wide = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT);

    expect(compact.cardHeight).toBe(196);
    expect(compact.rowFontSize).toBe(11);
    expect(compact.rowMinFontSize).toBe(10);
    expect(compact.textWidthSafetyRatio).toBe(0.86);
    expect(compact.titleRuleOffset).toBeGreaterThan(compact.titleOffset + compact.titleFontSize);
    expect(wide.rowFontSize).toBe(12);
    expect(wide.rowHeight).toBe(22);
  });

  test('reserves the compact toggle switch lane before showing state copy', () => {
    const compact = resolveLegacyToggleRowLayout(300, 46, false);
    const wide = resolveLegacyToggleRowLayout(380, 70, true);

    expect(compact.showStateLabel).toBe(false);
    expect(compact.trackWidth).toBe(36);
    expect(compact.labelFontSize).toBeLessThanOrEqual(17);
    expect(wide.showStateLabel).toBe(true);
    expect(wide.stateLaneWidth).toBeGreaterThan(0);
  });

  test('uses one compact control rhythm for measurement and rendering', () => {
    expect(resolveLegacyFeatureControlLayout(360, false)).toEqual({
      rowGap: 9,
      rowHeight: 52
    });
    expect(resolveLegacyFeatureControlLayout(360, true)).toEqual({
      rowGap: 10,
      rowHeight: 76
    });
    expect(resolveLegacyFeatureControlLayout(540, true)).toEqual({
      rowGap: 11,
      rowHeight: 80
    });
  });

  test('places guide, controls, and account action in one measured scroll flow', () => {
    expect(resolveLegacyOverlayContentFlowLayout({
      actionHeight: 44,
      contentTop: 100,
      controlsHeight: 300,
      guideHeight: 220,
      panelWidth: 360
    })).toEqual({
      actionCenterY: 666,
      contentHeight: 592,
      controlsTop: 334,
      guideTop: 104
    });
  });
});
