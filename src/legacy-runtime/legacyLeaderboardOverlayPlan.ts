/**
 * Pure layout plan for the Leaderboard sheet (redesign 2026-11-06).
 *
 * Same card, padding, title slot, exit row and scroll rail as the shared
 * Settings sheet (legacySettingsSheetPlan.ts): this module reuses
 * LEGACY_SETTINGS_SIZES so the two sheets cannot drift apart.
 *
 *   card (centred, shrinks to its content, never taller than the panel)
 *     title
 *     exit row            primary `Back to Menu`, pinned (>= 48 px)
 *     column header       RANK | PLAYER | LEVEL, pinned
 *     list viewport       the top N rows, the only part that scrolls
 *     You row             pinned under the list, always visible
 *   or, for a state (loading failure, empty, signed out, gate): the exit row
 *   and one centred state block with at most one action (>= 48 px).
 *
 * Rows are display-only, 48 px tall at every viewport. The scene only paints
 * this plan, so every state is testable without Phaser. Rows live in
 * list-content space (screen y = list.viewport.top + row.rect.top - scrollOffset).
 */
import {
  LEGACY_SETTINGS_SIZES,
  type LegacySettingsRect
} from './legacySettingsSheetPlan';
import type {
  LegacyLeaderboardRowModel,
  LegacyLeaderboardSelfRowModel,
  LegacyLeaderboardStateModel,
  LegacyLeaderboardViewModel
} from './legacyLeaderboardView';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyOverlayPanelLayout,
  type LegacyOverlayPanelLayout
} from './legacyUiStandards';

export type LegacyLeaderboardPlanRect = LegacySettingsRect;

export const LEGACY_LEADERBOARD_SHEET_SIZES = Object.freeze({
  /** Display rows; >= the 44 px touch-target floor at every viewport. */
  rowHeight: 48,
  /** Pinned You row (two lines: label + username). */
  selfRowHeight: 56,
  selfRowGap: 8,
  columnHeaderHeight: 24,
  /** Gap between the exit row and what follows (spacing token 12). */
  sectionGap: LEGACY_SETTINGS_SIZES.sectionGap,
  /** Row inner padding. */
  rowPadX: 8,
  rankColumnWidth: 48,
  levelColumnWidth: 56,
  columnGap: 8,
  levelRightInset: 12,
  /** Top-3 accent bar. */
  accentBarWidth: 3,
  stateHeadingFontSize: 18,
  stateHeadingHeight: 26,
  stateBodyFontSize: 15,
  stateBodyLineHeight: 21,
  stateIconSize: 48,
  stateGap: 12,
  /** Estimated glyph width used to size the state body (the painter wraps for real). */
  stateBodyCharWidth: 8
});

export interface LegacyLeaderboardPlanRow {
  model: LegacyLeaderboardRowModel;
  /** Row rect in list-content space (left is the list's own left, 0). */
  rect: LegacyLeaderboardPlanRect;
  /** Row-local x anchors. */
  rankCenterX: number;
  nameLeft: number;
  nameMaxWidth: number;
  levelRight: number;
  levelMaxWidth: number;
}

export interface LegacyLeaderboardPlanSelfRow {
  model: LegacyLeaderboardSelfRowModel;
  /** Screen-space rect. */
  rect: LegacyLeaderboardPlanRect;
  /** Hit target of the `Edit name` control: the whole pinned row (>= 44 px tall and wide). */
  editHit: LegacyLeaderboardPlanRect;
  rankCenterX: number;
  nameLeft: number;
  nameMaxWidth: number;
  levelRight: number;
  levelMaxWidth: number;
}

export interface LegacyLeaderboardPlanStateBlock {
  model: LegacyLeaderboardStateModel;
  rect: LegacyLeaderboardPlanRect;
  centerX: number;
  iconCenterY: number;
  headingCenterY: number | null;
  bodyTop: number;
  bodyHeight: number;
  bodyMaxWidth: number;
  action: LegacyLeaderboardPlanRect | null;
}

export interface LegacyLeaderboardOverlayPlan {
  panel: LegacyOverlayPanelLayout;
  compact: boolean;
  card: LegacyLeaderboardPlanRect;
  cardPadding: number;
  title: { centerX: number; centerY: number; text: string };
  exit: LegacyLeaderboardPlanRect;
  exitLabel: string;
  columnHeader: {
    centerY: number;
    levelRight: number;
    playerLeft: number;
    rankCenterX: number;
    rect: LegacyLeaderboardPlanRect;
    ruleY: number;
  } | null;
  list: {
    contentHeight: number;
    maxScrollOffset: number;
    railViewport: LegacyLeaderboardPlanRect;
    rows: readonly LegacyLeaderboardPlanRow[];
    scrollable: boolean;
    skeletonRows: readonly LegacyLeaderboardPlanRect[];
    viewport: LegacyLeaderboardPlanRect;
  } | null;
  selfRow: LegacyLeaderboardPlanSelfRow | null;
  stateBlock: LegacyLeaderboardPlanStateBlock | null;
  /** Natural (unclipped) card height. */
  naturalCardHeight: number;
  availableHeight: number;
}

const rectOf = (left: number, top: number, width: number, height: number): LegacyLeaderboardPlanRect => ({
  height,
  left,
  top,
  width
});

const resolveColumns = (
  width: number
): { levelMaxWidth: number; levelRight: number; nameLeft: number; nameMaxWidth: number; rankCenterX: number } => {
  const z = LEGACY_LEADERBOARD_SHEET_SIZES;
  const rankLeft = z.rowPadX;
  const nameLeft = rankLeft + z.rankColumnWidth + z.columnGap;
  const levelRight = width - z.levelRightInset;
  const levelMaxWidth = z.levelColumnWidth;
  return {
    levelMaxWidth,
    levelRight,
    nameLeft,
    nameMaxWidth: Math.max(40, levelRight - levelMaxWidth - z.columnGap - nameLeft),
    rankCenterX: rankLeft + (z.rankColumnWidth / 2)
  };
};

const estimateBodyLines = (text: string, maxWidth: number): number => {
  const perLine = Math.max(12, Math.floor(maxWidth / LEGACY_LEADERBOARD_SHEET_SIZES.stateBodyCharWidth));
  return Math.max(1, Math.ceil(text.length / perLine));
};

export const buildLegacyLeaderboardOverlayPlan = (
  view: LegacyLeaderboardViewModel,
  width: number,
  height: number,
  safeArea: { bottom?: number; top?: number } = {},
  options: { measureBodyLines?: (text: string, maxWidth: number, fontSize: number) => number } = {}
): LegacyLeaderboardOverlayPlan => {
  const s = LEGACY_SETTINGS_SIZES;
  const z = LEGACY_LEADERBOARD_SHEET_SIZES;
  const panel = resolveLegacyOverlayPanelLayout(width, height, safeArea);
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;

  const cardPadding = compact ? s.cardPaddingCompact : s.cardPaddingRegular;
  const titleHeight = compact ? s.titleHeightCompact : s.titleHeightRegular;
  const titleGap = compact ? s.titleGapCompact : s.titleGapRegular;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const innerWidth = Math.max(1, cardWidth - (cardPadding * 2));
  const availableHeight = Math.max(1, panel.height);

  const showList = view.rows.length > 0 || view.skeletonRowCount > 0;
  // The header slot is kept while loading (a status line takes the captions' place) so the layout does not jump.
  const hasColumns = showList;
  const hasSelf = view.selfRow !== null && view.rows.length > 0;

  const exitHeight = s.actionHeight;
  const headBlock = (cardPadding * 2) + titleHeight + titleGap + exitHeight;
  const colBlock = hasColumns ? z.sectionGap + z.columnHeaderHeight : 0;
  const selfBlock = hasSelf ? z.selfRowGap + z.selfRowHeight : 0;

  let stateHeight = 0;
  let stateBodyLines = 0;
  const bodyMaxWidth = Math.max(40, innerWidth - 8);
  if (view.state !== null) {
    stateBodyLines = Math.max(1, options.measureBodyLines !== undefined
      ? Math.round(options.measureBodyLines(view.state.text, bodyMaxWidth, z.stateBodyFontSize))
      : estimateBodyLines(view.state.text, bodyMaxWidth));
    stateHeight = z.sectionGap
      + z.stateIconSize + z.stateGap
      + (view.state.heading === null ? 0 : z.stateHeadingHeight + 6)
      + (stateBodyLines * z.stateBodyLineHeight)
      + (view.state.action === null ? 0 : z.stateGap + 4 + s.actionHeight)
      + z.sectionGap;
  }

  const listCount = view.rows.length > 0 ? view.rows.length : view.skeletonRowCount;
  const listContentHeight = listCount * z.rowHeight;
  const fixedHeight = headBlock + colBlock + selfBlock;
  const naturalCardHeight = showList
    ? fixedHeight + listContentHeight
    : headBlock + stateHeight;
  const cardHeight = Math.min(naturalCardHeight, availableHeight);
  const cardTop = Math.round(panel.top + ((availableHeight - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));
  const innerLeft = cardLeft + cardPadding;

  const exitTop = cardTop + cardPadding + titleHeight + titleGap;
  const exit = rectOf(innerLeft, exitTop, innerWidth, exitHeight);
  const afterExit = exitTop + exitHeight;

  let columnHeader: LegacyLeaderboardOverlayPlan['columnHeader'] = null;
  if (hasColumns) {
    const cols = resolveColumns(innerWidth);
    const top = afterExit + z.sectionGap;
    columnHeader = {
      centerY: top + Math.round(z.columnHeaderHeight / 2) - 1,
      levelRight: innerLeft + cols.levelRight,
      playerLeft: innerLeft + cols.nameLeft,
      rankCenterX: innerLeft + cols.rankCenterX,
      rect: rectOf(innerLeft, top, innerWidth, z.columnHeaderHeight),
      ruleY: top + z.columnHeaderHeight - 1
    };
  }

  let list: LegacyLeaderboardOverlayPlan['list'] = null;
  if (showList) {
    const listTop = afterExit + colBlock;
    const viewportHeight = Math.max(0, cardHeight - fixedHeight);
    const cols = resolveColumns(innerWidth);
    const rows = view.rows.map((model, index): LegacyLeaderboardPlanRow => ({
      ...cols,
      model,
      rect: rectOf(0, index * z.rowHeight, innerWidth, z.rowHeight)
    }));
    const skeletonRows = rows.length > 0
      ? []
      : Array.from({ length: view.skeletonRowCount }, (_, index) => rectOf(
        0,
        (index * z.rowHeight) + 10,
        innerWidth,
        z.rowHeight - 20
      ));
    list = {
      contentHeight: listContentHeight,
      maxScrollOffset: Math.max(0, listContentHeight - viewportHeight),
      railViewport: rectOf(innerLeft, listTop, innerWidth + s.scrollRailOverhang, viewportHeight),
      rows,
      scrollable: listContentHeight > viewportHeight,
      skeletonRows,
      viewport: rectOf(innerLeft, listTop, innerWidth, viewportHeight)
    };
  }

  let selfRow: LegacyLeaderboardOverlayPlan['selfRow'] = null;
  if (hasSelf && view.selfRow !== null && list !== null) {
    const cols = resolveColumns(innerWidth);
    const top = list.viewport.top + list.viewport.height + z.selfRowGap;
    selfRow = {
      ...cols,
      model: view.selfRow,
      rect: rectOf(innerLeft, top, innerWidth, z.selfRowHeight),
      editHit: rectOf(innerLeft, top, innerWidth, z.selfRowHeight)
    };
  }

  let stateBlock: LegacyLeaderboardOverlayPlan['stateBlock'] = null;
  if (view.state !== null) {
    const top = afterExit + z.sectionGap;
    const centerX = innerLeft + (innerWidth / 2);
    const iconCenterY = top + (z.stateIconSize / 2);
    let cursor = top + z.stateIconSize + z.stateGap;
    const headingCenterY = view.state.heading === null ? null : cursor + (z.stateHeadingHeight / 2);
    if (view.state.heading !== null) {
      cursor += z.stateHeadingHeight + 6;
    }
    const bodyTop = cursor;
    const bodyHeight = stateBodyLines * z.stateBodyLineHeight;
    cursor += bodyHeight;
    const actionWidth = Math.min(innerWidth, 260);
    const action = view.state.action === null
      ? null
      : rectOf(centerX - (actionWidth / 2), cursor + z.stateGap + 4, actionWidth, s.actionHeight);
    stateBlock = {
      action,
      bodyHeight,
      bodyMaxWidth,
      bodyTop,
      centerX,
      headingCenterY,
      iconCenterY,
      model: view.state,
      rect: rectOf(innerLeft, top, innerWidth, stateHeight - (z.sectionGap * 2))
    };
  }

  return {
    availableHeight,
    card: rectOf(cardLeft, cardTop, cardWidth, cardHeight),
    cardPadding,
    columnHeader,
    compact,
    exit,
    exitLabel: view.exit.label,
    list,
    naturalCardHeight,
    panel,
    selfRow,
    stateBlock,
    title: {
      centerX: panel.centerX,
      centerY: cardTop + cardPadding + Math.round(titleHeight / 2),
      text: view.header.title
    }
  };
};

/** Screen-space rect of a list row for a scroll offset (clamped by the caller). */
export const resolveLegacyLeaderboardRowScreenRect = (
  plan: LegacyLeaderboardOverlayPlan,
  row: Pick<LegacyLeaderboardPlanRow, 'rect'>,
  scrollOffset = 0
): LegacyLeaderboardPlanRect => {
  const list = plan.list;
  if (list === null) {
    return row.rect;
  }
  const offset = Math.min(list.maxScrollOffset, Math.max(0, scrollOffset));
  return rectOf(
    list.viewport.left + row.rect.left,
    list.viewport.top + row.rect.top - offset,
    row.rect.width,
    row.rect.height
  );
};

/** The viewports every leaderboard plan must hold at (the audit set). */
export const LEGACY_LEADERBOARD_PLAN_VIEWPORTS: ReadonlyArray<{ height: number; width: number }> = Object.freeze([
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 720, width: 1280 }
]);
