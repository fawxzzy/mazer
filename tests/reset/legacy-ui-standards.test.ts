import { describe, expect, test } from 'vitest';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOverlayPanelLayout,
  resolveLegacyOverlayShellLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyRunStatusPanelLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyUiLabelCenterY
} from '../../src/legacy-runtime/legacyUiStandards';

describe('legacy UI standards', () => {
  test('fills the safe phone viewport instead of preserving the hidden play HUD lane', () => {
    expect(resolveLegacyOverlayPanelLayout(390, 844)).toEqual({
      centerX: 195,
      height: 828,
      left: 8,
      top: 8,
      width: 374
    });

    expect(resolveLegacyOverlayPanelLayout(1440, 900)).toEqual({
      centerX: 720,
      height: 868,
      left: 360,
      top: 16,
      width: 720
    });
  });

  test('uses one header, scroll, and action rhythm for phone overlays', () => {
    const panel = resolveLegacyOverlayPanelLayout(390, 844);

    expect(resolveLegacyOverlayShellLayout({
      actionHeight: 42,
      actionRows: 2,
      hasMessage: false,
      panel
    })).toEqual({
      actionCenterY: 795,
      contentHeight: 626,
      contentLeft: 24,
      contentTop: 84,
      contentWidth: 342,
      messageCenterY: 90,
      titleCenterY: 60
    });
  });

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

  test('centers every text role on the same vertical box midpoint', () => {
    expect(resolveLegacyUiLabelCenterY(100, 40, 'button')).toBe(100);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'overlay-action')).toBe(100);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'overlay-title')).toBe(100);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'toggle-title')).toBe(100);
  });

  test('keeps compact guide copy smaller and clears the title rule', () => {
    const compact = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT - 1);
    const wide = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT);

    expect(compact.cardHeight).toBe(196);
    expect(compact.rowFontSize).toBe(11);
    expect(compact.rowMinFontSize).toBe(10);
    expect(compact.horizontalMargin).toBe(48);
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
