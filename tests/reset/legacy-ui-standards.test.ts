import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_OPTIONS_GUIDE_MIN_COPY_FONT_SIZE,
  LEGACY_UI_COMPACT_BREAKPOINT,
  LEGACY_UI_MIN_BODY_FONT_SIZE,
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyFeatureControlLayout,
  resolveLegacyOverlayContentFlowLayout,
  resolveLegacyOverlayPanelLayout,
  resolveLegacyOverlayShellLayout,
  resolveLegacyOptionsGuideLayout,
  resolveLegacyRunStatusPanelLayout,
  resolveLegacyToggleLabelCandidates,
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

  test('uses one header, scroll, and minimum-touch action rhythm for phone overlays', () => {
    const panel = resolveLegacyOverlayPanelLayout(390, 844);

    expect(resolveLegacyOverlayShellLayout({
      actionHeight: 42,
      actionRows: 2,
      panel
    })).toEqual({
      actionCenterY: 794,
      contentHeight: 646,
      contentLeft: 24,
      contentTop: 60,
      contentWidth: 342
    });
    expect(LEGACY_UI_MIN_TOUCH_TARGET).toBe(44);
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

  test('keeps the compact Guide card concise and clear of the title rule', () => {
    const compact = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT - 1);
    const wide = resolveLegacyOptionsGuideLayout(LEGACY_UI_COMPACT_BREAKPOINT);

    expect(compact.cardHeight).toBe(178);
    expect(compact.collapsedHeight).toBe(40);
    expect(compact.rowCount).toBe(4);
    expect(compact.rowFontSize).toBe(11);
    expect(compact.rowMinFontSize).toBe(10);
    expect(compact.horizontalMargin).toBe(48);
    expect(compact.textWidthSafetyRatio).toBe(0.9);
    expect(compact.titleRuleOffset).toBeGreaterThan(compact.titleOffset + compact.titleFontSize);
    expect(wide.rowFontSize).toBe(12);
    expect(wide.rowHeight).toBe(32);
    expect(wide.collapsedHeight).toBe(46);
  });

  test('shows state copy on normal phone rows and keeps an inline fallback for narrower rows', () => {
    const narrow = resolveLegacyToggleRowLayout(283, 46, false, true);
    const compact = resolveLegacyToggleRowLayout(300, 46, false, true);
    const wide = resolveLegacyToggleRowLayout(380, 70, true, false);

    expect(narrow.showStateLabel).toBe(false);
    expect(narrow.stateLaneWidth).toBe(0);
    expect(compact.showStateLabel).toBe(true);
    expect(compact.stateLaneWidth).toBe(51);
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

  test('does not allow a positive overlay action request below the mobile touch target', () => {
    expect(resolveLegacyOverlayContentFlowLayout({
      actionHeight: 42,
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

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

describe('320 px clipping guards (Wave 5C)', () => {
  test('toggle labels fall back from "label: state" to the bare label instead of running under the switch', () => {
    expect(resolveLegacyToggleLabelCandidates('Animated Background', 'Animated', false)).toEqual([
      'Animated Background: Animated',
      'Animated Background'
    ]);
    expect(resolveLegacyToggleLabelCandidates('Trail Fade', 'Off', true)).toEqual(['Trail Fade']);
    expect(resolveLegacyToggleLabelCandidates('Trail Fade', '', false)).toEqual(['Trail Fade']);
    // 320 px phones get a 228 px card: below the state-lane threshold, so the fallback is live there.
    expect(resolveLegacyToggleRowLayout(228, 52, false, true).showStateLabel).toBe(false);
    expect(resolveLegacyToggleRowLayout(338, 52, false, true).showStateLabel).toBe(true);
  });

  test('body and legend copy never shrink below the minimum readable sizes', () => {
    expect(LEGACY_UI_MIN_BODY_FONT_SIZE).toBe(11);
    expect(LEGACY_OPTIONS_GUIDE_MIN_COPY_FONT_SIZE).toBe(10);
    for (const width of [304, 344, 374]) {
      const guide = resolveLegacyOptionsGuideLayout(width, 5);
      expect(guide.rowMinFontSize).toBeGreaterThanOrEqual(LEGACY_OPTIONS_GUIDE_MIN_COPY_FONT_SIZE);
      // A wrapped legend row has to hold two lines at the minimum size inside the row.
      expect(guide.rowHeight).toBeGreaterThanOrEqual(Math.ceil(LEGACY_OPTIONS_GUIDE_MIN_COPY_FONT_SIZE * 2 * 1.25));
    }
  });

  test('MenuScene wires the clipping guards instead of the old 8 px legend floor and unbounded toggle label', () => {
    const source = normalizeSourceLineEndings(readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8'));
    expect(source).not.toContain('compact ? 8 : guideRowMinFontSize');
    expect(source).toContain('LEGACY_OPTIONS_GUIDE_MIN_COPY_FONT_SIZE');
    expect(source).toContain('label.setWordWrapWidth(wrapWidth, true);');
    expect(source).toContain('resolveLegacyToggleLabelCandidates(input.label, displayStateText, showStateLabel)');
    expect(source).toContain('LEGACY_UI_MIN_BODY_FONT_SIZE).setOrigin(0, 0.5).setAlpha(0.96);');
  });
});
