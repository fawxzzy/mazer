export const LEGACY_UI_COMPACT_BREAKPOINT = 420;

export interface LegacyRunStatusPanelLayout {
  fontSize: number;
  height: number;
  horizontalPadding: number;
  lineSpacing: number;
  width: number;
}

export const resolveLegacyRunStatusPanelLayout = (
  viewportWidth: number,
  availableWidth = viewportWidth
): LegacyRunStatusPanelLayout => {
  const compact = viewportWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const maximumWidth = Math.max(160, Math.min(viewportWidth - 18, availableWidth));
  const preferredWidth = compact ? 236 : 252;

  return {
    fontSize: compact ? 11 : 12,
    height: compact ? 58 : 62,
    horizontalPadding: compact ? 20 : 24,
    lineSpacing: 2,
    width: Math.min(preferredWidth, maximumWidth)
  };
};

export type LegacyUiLabelRole = 'button' | 'overlay-action' | 'overlay-title' | 'toggle-title';

const LABEL_LIFT_RATIOS: Record<LegacyUiLabelRole, number> = {
  button: 0.18,
  'overlay-action': 0.08,
  'overlay-title': 0.08,
  'toggle-title': 0.08
};

export const resolveLegacyUiLabelCenterY = (
  centerY: number,
  fontSize: number,
  role: LegacyUiLabelRole
): number => {
  const lift = Math.max(1, Math.round(Math.max(1, fontSize) * LABEL_LIFT_RATIOS[role]));
  return Math.round(centerY - lift);
};

export interface LegacyOptionsGuideLayout {
  cardHeight: number;
  cardWidthLimit: number;
  horizontalMargin: number;
  inset: number;
  legendTopOffset: number;
  rowHeight: number;
  rowFontSize: number;
  rowMinFontSize: number;
  titleFontSize: number;
  titleOffset: number;
  titleRuleOffset: number;
}

export const resolveLegacyOptionsGuideLayout = (panelWidth: number): LegacyOptionsGuideLayout => {
  const compact = panelWidth < LEGACY_UI_COMPACT_BREAKPOINT;
  const titleFontSize = compact ? 18 : 21;
  const titleOffset = compact ? 18 : 21;

  return {
    cardHeight: compact ? 232 : 260,
    cardWidthLimit: compact ? 350 : 540,
    horizontalMargin: compact ? 40 : 72,
    inset: compact ? 12 : 18,
    legendTopOffset: compact ? 54 : 56,
    rowHeight: compact ? 24 : 27,
    rowFontSize: compact ? 11 : 13,
    rowMinFontSize: compact ? 9 : 10,
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
      rowGap: compact ? 7 : 9,
      rowHeight: compact ? 66 : 68
    };
  }

  return {
    rowGap: compact ? 6 : 8,
    rowHeight: compact ? 42 : 46
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
  const showStateLabel = width >= 380;
  return {
    labelFontSize: hasDescription
      ? Math.max(12, Math.min(compact ? 15 : 17, Math.round(height * 0.25)))
      : Math.max(13, Math.min(compact ? 17 : 19, Math.round(height * 0.36))),
    rowPaddingX: Math.max(12, Math.min(compact ? 14 : 18, Math.round(width * 0.05))),
    showStateLabel,
    stateFontSize: Math.max(10, Math.min(12, Math.round(height * 0.24))),
    stateLaneWidth: showStateLabel ? Math.max(54, Math.min(82, Math.round(width * 0.22))) : 0,
    trackGap: compact ? 8 : 10,
    trackHeight: compact ? 20 : 23,
    trackWidth: compact ? 36 : 40
  };
};
