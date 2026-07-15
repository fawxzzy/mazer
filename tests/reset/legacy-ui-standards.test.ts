import { describe, expect, test } from 'vitest';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyUiLabelCenterY
} from '../../src/legacy-runtime/legacyUiStandards';

describe('legacy UI standards', () => {
  test('lifts legacy glyph labels to optical center without changing horizontal geometry', () => {
    expect(resolveLegacyUiLabelCenterY(100, 40, 'button')).toBe(93);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'overlay-action')).toBe(98);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'toggle-title')).toBe(98);
  });

  test('keeps compact guide copy smaller and clears the title rule', () => {
    const compact = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT - 1);
    const wide = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT);

    expect(compact.cardHeight).toBe(232);
    expect(compact.rowFontSize).toBe(11);
    expect(compact.rowMinFontSize).toBe(9);
    expect(compact.titleRuleOffset).toBeGreaterThan(compact.titleOffset + compact.titleFontSize);
    expect(wide.rowFontSize).toBe(13);
    expect(wide.rowHeight).toBe(27);
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
      rowGap: 6,
      rowHeight: 42
    });
    expect(resolveLegacyFeatureControlLayout(360, true)).toEqual({
      rowGap: 7,
      rowHeight: 58
    });
    expect(resolveLegacyFeatureControlLayout(540, true)).toEqual({
      rowGap: 9,
      rowHeight: 64
    });
  });

  test('places guide, controls, and account action in one measured scroll flow', () => {
    expect(resolveLegacyOverlayContentFlowLayout({
      actionHeight: 44,
      contentTop: 100,
      controlsHeight: 300,
      guideHeight: 232,
      panelWidth: 360
    })).toEqual({
      actionCenterY: 678,
      contentHeight: 604,
      controlsTop: 346,
      guideTop: 104
    });
  });
});
