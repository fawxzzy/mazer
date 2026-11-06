/**
 * Pure geometry for the "How to play" sheet (the Guide), shared by the main
 * menu Settings and the in-game Pause Settings. Same card width, title and
 * scroll rail as legacySettingsSheetPlan.ts so the two sheets read as
 * one family; the content is legacyGuideContent.ts.
 *
 * The scene owns text measurement (Phaser), so this plan takes the measured
 * height of every body item and returns where each one sits, whether the body
 * must scroll, and the fixed footer (`Got it`, 48 high, never scrolls away).
 * `Got it` is the Guide's only exit control: there is no Close pill, X or back
 * arrow, so the card gets the whole panel height and is centred in it.
 *
 * Sizes are token terms: hit targets from touchTargetMinPx, gaps from the
 * spacing scale, copy at legacy.fontSizePx.body (14). Copy wraps; it never
 * shrinks below 14.
 */
import { designTokens } from '../theme/tokens';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyOverlayPanelLayout,
  type LegacyOverlayPanelLayout
} from './legacyUiStandards';
import { LEGACY_GUIDE_TITLE } from './legacyGuideContent';
import { LEGACY_SETTINGS_SIZES, type LegacySettingsRect } from './legacySettingsSheetPlan';

const SPACING = designTokens.spacingPx;
const FONT = designTokens.legacy.fontSizePx;

export const LEGACY_GUIDE_SHEET_SIZES = Object.freeze({
  /** Icon badge box (the badge shape is drawn inside it). */
  badgeSize: 36,
  badgeTextGap: SPACING[3] ?? 16,
  copyFontSize: FONT.body,
  copyLineHeight: 20,
  headingFontSize: FONT.body,
  headingLineHeight: 18,
  /** Primary `Got it` footer button. >= touchTargetMinPx. */
  footerHeight: 48,
  footerGap: SPACING[3] ?? 16,
  itemGap: SPACING[1] ?? 8,
  rowMinHeight: 56,
  rowPaddingY: 10,
  scrollRailOverhang: LEGACY_SETTINGS_SIZES.scrollRailOverhang
});

/** Row height for a guide row whose copy wraps onto `copyLineCount` lines. */
export const resolveLegacyGuideRowHeight = (copyLineCount: number): number => {
  const s = LEGACY_GUIDE_SHEET_SIZES;
  const lines = Math.max(1, Math.floor(copyLineCount));
  return Math.max(
    s.rowMinHeight,
    (s.rowPaddingY * 2) + s.headingLineHeight + (lines * s.copyLineHeight)
  );
};

/** Height of the keyboard line (plain wrapped text, no icon) for `lineCount` lines. */
export const resolveLegacyGuideKeyboardLineHeight = (lineCount: number): number => {
  const s = LEGACY_GUIDE_SHEET_SIZES;
  return (s.rowPaddingY * 2) + (Math.max(1, Math.floor(lineCount)) * s.copyLineHeight);
};

export interface LegacyGuideSheetPlanInput {
  /** Measured height of each body item, top to bottom (rows, then the optional keyboard line). */
  itemHeights: readonly number[];
  height: number;
  safeArea?: { bottom?: number; top?: number };
  width: number;
}

export interface LegacyGuideSheetPlan {
  availableHeight: number;
  /** Visible scrollable window inside the card (screen space). */
  bodyViewport: LegacySettingsRect;
  card: LegacySettingsRect;
  cardPadding: number;
  compact: boolean;
  contentHeight: number;
  /** Fixed `Got it` button, inside the card below the body. */
  footer: LegacySettingsRect;
  /** Item tops in body-content space: screen y = bodyViewport.top + itemTops[i] - scrollOffset. */
  itemTops: readonly number[];
  /** Width available to each item (the full inner width: the rail sits in the card padding). */
  itemWidth: number;
  /** Viewport handed to the scroll-rail metrics (body window widened into the card padding). */
  scrollRailViewport: LegacySettingsRect;
  maxScrollOffset: number;
  panel: LegacyOverlayPanelLayout;
  scrollable: boolean;
  title: { centerX: number; centerY: number; fontSize: number; text: typeof LEGACY_GUIDE_TITLE };
}

const rectOf = (left: number, top: number, width: number, height: number): LegacySettingsRect => ({
  height,
  left,
  top,
  width
});

export const buildLegacyGuideSheetPlan = (input: LegacyGuideSheetPlanInput): LegacyGuideSheetPlan => {
  const g = LEGACY_GUIDE_SHEET_SIZES;
  const s = LEGACY_SETTINGS_SIZES;
  const panel = resolveLegacyOverlayPanelLayout(input.width, input.height, input.safeArea ?? {});
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const cardPadding = compact ? s.cardPaddingCompact : s.cardPaddingRegular;
  const titleHeight = compact ? s.titleHeightCompact : s.titleHeightRegular;
  const titleGap = compact ? s.titleGapCompact : s.titleGapRegular;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const innerWidth = Math.max(1, cardWidth - (cardPadding * 2));

  let cursor = 0;
  const rawTops = input.itemHeights.map((height, index) => {
    cursor += index === 0 ? 0 : g.itemGap;
    const top = cursor;
    cursor += height;
    return top;
  });
  const contentHeight = cursor;

  const availableHeight = Math.max(1, panel.height);
  const chrome = (cardPadding * 2) + titleHeight + titleGap + g.footerGap + g.footerHeight;
  const naturalCardHeight = chrome + contentHeight;
  const cardHeight = Math.min(naturalCardHeight, availableHeight);
  const cardTop = Math.round(panel.top + ((availableHeight - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));
  const bodyTop = cardTop + cardPadding + titleHeight + titleGap;
  const bodyHeight = Math.max(0, cardHeight - chrome);
  const scrollable = contentHeight > bodyHeight;

  return {
    availableHeight,
    bodyViewport: rectOf(cardLeft + cardPadding, bodyTop, innerWidth, bodyHeight),
    card: rectOf(cardLeft, cardTop, cardWidth, cardHeight),
    cardPadding,
    compact,
    contentHeight,
    footer: rectOf(cardLeft + cardPadding, bodyTop + bodyHeight + g.footerGap, innerWidth, g.footerHeight),
    itemTops: rawTops,
    itemWidth: innerWidth,
    scrollRailViewport: rectOf(cardLeft + cardPadding, bodyTop, innerWidth + g.scrollRailOverhang, bodyHeight),
    maxScrollOffset: Math.max(0, contentHeight - bodyHeight),
    panel,
    scrollable,
    title: {
      centerX: panel.centerX,
      centerY: cardTop + cardPadding + Math.round(titleHeight / 2),
      fontSize: compact ? s.titleFontSizeCompact : s.titleFontSizeRegular,
      text: LEGACY_GUIDE_TITLE
    }
  };
};

/** Viewports every guide plan must hold at (the audit set). */
export const LEGACY_GUIDE_PLAN_VIEWPORTS: ReadonlyArray<{ height: number; width: number }> = Object.freeze([
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 720, width: 1280 }
]);
