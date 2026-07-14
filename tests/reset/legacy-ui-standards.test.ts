import { describe, expect, test } from 'vitest';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyToggleRowLayout,
  resolveLegacyUiLabelCenterY
} from '../../src/legacy-runtime/legacyUiStandards';

describe('legacy UI standards', () => {
  test('lifts legacy glyph labels to optical center without changing horizontal geometry', () => {
    expect(resolveLegacyUiLabelCenterY(100, 40, 'button')).toBe(93);
    expect(resolveLegacyUiLabelCenterY(100, 20, 'toggle-title')).toBe(98);
  });

  test('keeps compact guide copy smaller and clears the title rule', () => {
    const compact = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT - 1);
    const wide = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT);

    expect(compact.rowFontSize).toBe(12);
    expect(compact.rowMinFontSize).toBe(9);
    expect(compact.titleRuleOffset).toBeGreaterThan(compact.titleOffset + (compact.titleFontSize / 2));
    expect(wide.rowFontSize).toBe(13);
    expect(wide.rowHeight).toBe(27);
  });

  test('reserves the compact toggle switch lane before showing state copy', () => {
    const compact = resolveLegacyToggleRowLayout(300, 46, false);
    const wide = resolveLegacyToggleRowLayout(380, 70, true);

    expect(compact.showStateLabel).toBe(false);
    expect(compact.trackWidth).toBe(38);
    expect(compact.labelFontSize).toBeLessThanOrEqual(18);
    expect(wide.showStateLabel).toBe(true);
    expect(wide.stateLaneWidth).toBeGreaterThan(0);
  });
});
