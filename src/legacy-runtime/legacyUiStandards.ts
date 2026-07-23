export const LEGACY_UI_COMPACT_BREAKPOINT = 420;

export interface LegacyOverlayPanelLayout {
  centerX: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

export const resolveLegacyOverlayPanelLayout = (
  viewportWidth: number,
  viewportHeight: number
): LegacyOverlayPanelLayout => {
  const compact = viewportWidth < 480;
  const horizontalInset = compact ? 8 : 16;
  const verticalInset = compact ? 8 : 16;
  const availableWidth = Math.max(1, viewportWidth - (horizontalInset * 2));
  const width = Math.min(720, availableWidth);
  const height = Math.max(1, viewportHeight - (verticalInset * 2));
  const left = Math.round((viewportWidth - width) / 2);

  return {
    centerX: left + Math.round(width / 2),
    height,
    left,
    top: verticalInset,
    width
  };
};

export interface LegacyOverlayShellLayout {
  actionCenterY: number;
  contentHeight: number;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  messageCenterY: number;
  titleCenterY: number;
}

export const resolveLegacyOverlayShellLayout = ({
  actionHeight,
  actionRows,
  hasMessage,
  panel
}: {
  actionHeight: number;
  actionRows: number;
  hasMessage: boolean;
  panel: LegacyOverlayPanelLayout;
}): LegacyOverlayShellLayout => {
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const contentHorizontalInset = compact ? 16 : 24;
  const actionBottomInset = compact ? 20 : 24;
  const actionRowGap = compact ? 10 : 14;
  const actionContentGap = compact ? 12 : 16;
  const titleCenterY = panel.top + (compact ? 52 : 56);
  const messageCenterY = panel.top + (compact ? 82 : 88);
  const contentTop = panel.top + (compact ? 76 : 84) + (hasMessage ? 22 : 0);
  const panelBottom = panel.top + panel.height;
  const actionCenterY = panelBottom - actionBottomInset - (actionHeight / 2);
  const actionStackTop = actionCenterY
    - ((Math.max(1, actionRows) - 1) * (actionHeight + actionRowGap))
    - (actionHeight / 2);
  const contentBottom = Math.max(contentTop, actionStackTop - actionContentGap);

  return {
    actionCenterY,
    contentHeight: Math.max(0, contentBottom - contentTop),
    contentLeft: panel.left + contentHorizontalInset,
    contentTop,
    contentWidth: Math.max(1, panel.width - (contentHorizontalInset * 2)),
    messageCenterY,
    titleCenterY
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
  horizontalMargin: number;
  inset: number;
  legendTopOffset: number;
  rowHeight: number;
  rowFontSize: number;
  rowMinFontSize: number;
  textWidthSafetyRatio: number;
  titleFontSize: number;
  titleOffset: number;
  titleRuleOffset: number;
}

export const resolveLegacyOptionsGuideLayout = (panelWidth: number): LegacyOptionsGuideLayout => {
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const titleFontSize = compact ? 17 : 19;
  const titleOffset = compact ? 18 : 20;

  return {
    cardHeight: compact ? 196 : 216,
    cardWidthLimit: compact ? 350 : 540,
    horizontalMargin: compact ? 48 : 64,
    inset: compact ? 18 : 22,
    legendTopOffset: compact ? 48 : 52,
    rowHeight: compact ? 19 : 22,
    rowFontSize: compact ? 11 : 12,
    rowMinFontSize: compact ? 10 : 10,
    textWidthSafetyRatio: compact ? 0.86 : 0.88,
    titleFontSize,
    titleOffset,
    titleRuleOffset: titleOffset + Math.ceil(titleFontSize * 0.72) + (compact ? 12 : 8)
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
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const edgeInset = compact ? 4 : 6;
  const sectionGap = compact ? 10 : 12;
  const guideTop = contentTop + edgeInset;
  const controlsTop = guideTop + guideHeight + sectionGap;
  const actionCenterY = actionHeight > 0
    ? controlsTop + controlsHeight + sectionGap + (actionHeight / 2)
    : null;
  const contentBottom = actionCenterY === null
    ? controlsTop + controlsHeight + edgeInset
    : actionCenterY + (actionHeight / 2) + edgeInset;

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
  hasDescription: boolean
): LegacyToggleRowLayout => {
  const compact = width < 340;
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
