import { designTokens } from '../theme/tokens';

export const LEGACY_UI_COMPACT_BREAKPOINT = 420;
export const LEGACY_UI_MIN_TOUCH_TARGET = designTokens.touchTargetMinPx;

export interface LegacyOverlayPanelLayout {
  centerX: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

export const resolveLegacyOverlayPanelLayout = (
  viewportWidth: number,
  viewportHeight: number,
  safeArea: { top?: number; bottom?: number } = {}
): LegacyOverlayPanelLayout => {
  const safeAreaTop = Math.max(0, Math.round(safeArea.top ?? 0));
  const safeAreaBottom = Math.max(0, Math.round(safeArea.bottom ?? 0));
  const compact = viewportWidth < 480;
  const horizontalInset = compact ? 8 : 16;
  const verticalInset = compact ? 8 : 16;
  const availableWidth = Math.max(1, viewportWidth - (horizontalInset * 2));
  const width = Math.min(720, availableWidth);
  const top = verticalInset + safeAreaTop;
  const height = Math.max(1, viewportHeight - top - verticalInset - safeAreaBottom);
  const left = Math.round((viewportWidth - width) / 2);

  return {
    centerX: left + Math.round(width / 2),
    height,
    left,
    top,
    width
  };
};

export interface LegacyOverlayShellLayout {
  actionCenterY: number;
  contentHeight: number;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
}

// Header chrome for Settings/Pause is now just the corner back button --
// no title text -- so this is the button's own footprint (fixed top
// margin + diameter), not a band sized to fit a heading.
export const LEGACY_OVERLAY_HEADER_RESERVE = 46;

export const resolveLegacyOverlayShellLayout = ({
  actionHeight,
  actionRows,
  panel
}: {
  actionHeight: number;
  actionRows: number;
  panel: LegacyOverlayPanelLayout;
}): LegacyOverlayShellLayout => {
  const resolvedActionHeight = Math.max(LEGACY_UI_MIN_TOUCH_TARGET, Math.round(actionHeight));
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const contentHorizontalInset = compact ? 16 : 24;
  const actionBottomInset = compact ? 20 : 24;
  const actionRowGap = compact ? 10 : 14;
  const actionContentGap = compact ? 12 : 16;
  const contentTop = panel.top + LEGACY_OVERLAY_HEADER_RESERVE + (compact ? 6 : 8);
  const panelBottom = panel.top + panel.height;
  const actionCenterY = panelBottom - actionBottomInset - (resolvedActionHeight / 2);
  const actionStackTop = actionCenterY
    - ((Math.max(1, actionRows) - 1) * (resolvedActionHeight + actionRowGap))
    - (resolvedActionHeight / 2);
  const contentBottom = Math.max(contentTop, actionStackTop - actionContentGap);

  return {
    actionCenterY,
    contentHeight: Math.max(0, contentBottom - contentTop),
    contentLeft: panel.left + contentHorizontalInset,
    contentTop,
    contentWidth: Math.max(1, panel.width - (contentHorizontalInset * 2))
  };
};

export interface LegacyRunStatusPanelLayout {
  fontSize: number;
  height: number;
  horizontalPadding: number;
  lineSpacing: number;
  textWidthSafetyRatio: number;
  width: number;
}

export const resolveLegacyRunStatusPanelLayout = (
  viewportWidth: number,
  availableWidth = viewportWidth
): LegacyRunStatusPanelLayout => {
  const compact = viewportWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const maximumWidth = Math.max(160, Math.min(viewportWidth - 18, availableWidth));
  const preferredWidth = compact ? 260 : 292;

  return {
    fontSize: compact ? 14 : 15,
    height: compact ? 62 : 66,
    horizontalPadding: compact ? 18 : 22,
    lineSpacing: compact ? 3 : 2,
    textWidthSafetyRatio: 0.96,
    width: Math.min(preferredWidth, maximumWidth)
  };
};

export type LegacyUiLabelRole = 'button' | 'overlay-action' | 'overlay-title' | 'toggle-title';

export const resolveLegacyUiLabelCenterY = (
  centerY: number,
  _fontSize: number,
  _role: LegacyUiLabelRole
): number => Math.round(centerY);

export interface LegacyOptionsGuideLayout {
  cardHeight: number;
  cardWidthLimit: number;
  collapsedHeight: number;
  horizontalMargin: number;
  inset: number;
  legendTopOffset: number;
  rowHeight: number;
  rowCount: number;
  rowFontSize: number;
  rowMinFontSize: number;
  textWidthSafetyRatio: number;
  titleFontSize: number;
  titleOffset: number;
  titleRuleOffset: number;
}

// The Guide card collapses to a single tappable header row by default (a
// "compass/start/exit + move" legend doesn't need to stay pinned open the
// whole time a player is in Settings) and expands to the full legend on
// tap. The compass row only makes sense where the compass itself is on
// screen (Play mode's pause menu) -- the menu-context Guide passes
// rowCount 3 to omit it, since the main menu never shows a compass.
export const resolveLegacyOptionsGuideLayout = (panelWidth: number, rowCount = 4): LegacyOptionsGuideLayout => {
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const titleFontSize = compact ? 15 : 17;
  const titleOffset = compact ? 16 : 18;
  // Each row's icon badge is a filled circle of radius 11 (compact) / 13
  // (regular) -- a 22-26px diameter -- so the row height has to clear that
  // plus real padding or adjacent rows' badges overlap vertically. The
  // previous 18/20px rows were shorter than the badge itself.
  const rowHeight = compact ? 30 : 32;
  const legendTopOffset = compact ? 43 : 47;
  const legendBottomPadding = 15;

  return {
    cardHeight: legendTopOffset + (rowCount * rowHeight) + legendBottomPadding,
    cardWidthLimit: compact ? 350 : 540,
    collapsedHeight: compact ? 40 : 46,
    horizontalMargin: compact ? 48 : 64,
    inset: compact ? 18 : 22,
    legendTopOffset,
    rowHeight,
    rowCount,
    rowFontSize: compact ? 11 : 12,
    rowMinFontSize: compact ? 10 : 10,
    textWidthSafetyRatio: compact ? 0.9 : 0.92,
    titleFontSize,
    titleOffset,
    titleRuleOffset: titleOffset + Math.ceil(titleFontSize * 0.72) + (compact ? 9 : 8)
  };
};

export interface LegacyFeatureControlLayout {
  rowGap: number;
  rowHeight: number;
}

export const resolveLegacyFeatureControlLayout = (
  panelWidth: number,
  showDescriptions: boolean
): LegacyFeatureControlLayout => {
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  if (showDescriptions) {
    return {
      rowGap: compact ? 10 : 11,
      rowHeight: compact ? 76 : 80
    };
  }

  return {
      rowGap: compact ? 9 : 10,
      rowHeight: compact ? 52 : 54
  };
};

export interface LegacyOverlayContentFlowLayout {
  actionCenterY: number | null;
  contentHeight: number;
  controlsTop: number;
  guideTop: number;
}

export const resolveLegacyOverlayContentFlowLayout = ({
  actionHeight = 0,
  contentTop,
  controlsHeight,
  guideHeight,
  panelWidth
}: {
  actionHeight?: number;
  contentTop: number;
  controlsHeight: number;
  guideHeight: number;
  panelWidth: number;
}): LegacyOverlayContentFlowLayout => {
  const resolvedActionHeight = actionHeight > 0
    ? Math.max(LEGACY_UI_MIN_TOUCH_TARGET, Math.round(actionHeight))
    : 0;
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const edgeInset = compact ? 4 : 6;
  const sectionGap = compact ? 10 : 12;
  const guideTop = contentTop + edgeInset;
  const controlsTop = guideTop + guideHeight + sectionGap;
  const actionCenterY = resolvedActionHeight > 0
    ? controlsTop + controlsHeight + sectionGap + (resolvedActionHeight / 2)
    : null;
  const contentBottom = actionCenterY === null
    ? controlsTop + controlsHeight + edgeInset
    : actionCenterY + (resolvedActionHeight / 2) + edgeInset;

  return {
    actionCenterY,
    contentHeight: Math.max(0, contentBottom - contentTop),
    controlsTop,
    guideTop
  };
};

export interface LegacyToggleRowLayout {
  labelFontSize: number;
  rowPaddingX: number;
  showStateLabel: boolean;
  stateFontSize: number;
  stateLaneWidth: number;
  trackGap: number;
  trackHeight: number;
  trackWidth: number;
}

export const resolveLegacyToggleRowLayout = (
  width: number,
  height: number,
  hasDescription: boolean,
  compact: boolean
): LegacyToggleRowLayout => {
  const showStateLabel = width >= 286;
  return {
    labelFontSize: hasDescription
      ? Math.max(13, Math.min(compact ? 16 : 18, Math.round(height * 0.25)))
      : Math.max(14, Math.min(compact ? 17 : 19, Math.round(height * 0.33))),
    rowPaddingX: Math.max(12, Math.min(compact ? 14 : 18, Math.round(width * 0.05))),
    showStateLabel,
    stateFontSize: Math.max(10, Math.min(12, Math.round(height * 0.24))),
    stateLaneWidth: showStateLabel
      ? compact
        ? Math.max(44, Math.min(58, Math.round(width * 0.17)))
        : Math.max(54, Math.min(82, Math.round(width * 0.22)))
      : 0,
    trackGap: compact ? 8 : 10,
    trackHeight: compact ? 20 : 23,
    trackWidth: compact ? 36 : 40
  };
};

export interface LegacyTwoUpButtonLayout {
  buttonWidth: number;
  leftX: number;
  rightX: number;
}

// Two side-by-side buttons, each capped to maxButtonWidth, filling the
// panel width minus horizontalMargin and centered on centerX with gap
// between them. Shared by every overlay that lays out an even pair of
// buttons this way (e.g. Pause's Reset/Menu row) -- callers with a
// genuinely different sizing rule (like a pair split from one pre-capped
// total width) should keep their own formula rather than force-fit this one.
export const resolveLegacyTwoUpButtonLayout = (
  centerX: number,
  panelWidth: number,
  maxButtonWidth: number,
  horizontalMargin: number,
  gap: number
): LegacyTwoUpButtonLayout => {
  const buttonWidth = Math.min(maxButtonWidth, Math.floor((panelWidth - horizontalMargin) / 2));
  const offset = (buttonWidth + gap) / 2;

  return {
    buttonWidth,
    leftX: centerX - offset,
    rightX: centerX + offset
  };
};
