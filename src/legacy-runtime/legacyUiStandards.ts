export const LEGACY_UI_COMPACT_BREAKPOINT = 420;

export type LegacyUiLabelRole = 'button' | 'overlay-title' | 'toggle-title';

const LABEL_LIFT_RATIOS: Record<LegacyUiLabelRole, number> = {
  button: 0.18,
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
    cardHeight: compact ? 250 : 260,
    cardWidthLimit: compact ? 350 : 540,
    horizontalMargin: compact ? 48 : 72,
    inset: compact ? 14 : 18,
    legendTopOffset: compact ? 50 : 56,
    rowHeight: 27,
    rowFontSize: compact ? 12 : 13,
    rowMinFontSize: compact ? 9 : 10,
    titleFontSize,
    titleOffset,
    titleRuleOffset: titleOffset + Math.ceil(titleFontSize * 0.72) + (compact ? 7 : 8)
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
  const showStateLabel = width >= 360;
  return {
    labelFontSize: hasDescription
      ? Math.max(13, Math.min(compact ? 16 : 18, Math.round(height * 0.25)))
      : Math.max(14, Math.min(compact ? 18 : 20, Math.round(height * 0.36))),
    rowPaddingX: Math.max(12, Math.min(compact ? 14 : 18, Math.round(width * 0.05))),
    showStateLabel,
    stateFontSize: Math.max(10, Math.min(12, Math.round(height * 0.24))),
    stateLaneWidth: showStateLabel ? Math.max(54, Math.min(82, Math.round(width * 0.22))) : 0,
    trackGap: compact ? 8 : 10,
    trackHeight: compact ? 22 : 24,
    trackWidth: compact ? 38 : 42
  };
};
