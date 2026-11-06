/**
 * Pure draw plan for the Leaderboard overlay.
 *
 * Takes the render-ready model from legacyLeaderboardView.ts plus the viewport
 * and returns every rectangle / anchor the scene needs to draw it: card,
 * title anchor, pinned own-rank card, column header, rows, loading skeleton,
 * the centered status block with its action buttons, and the pager. MenuScene
 * only paints this plan, so the structure of each state (loading, loaded,
 * empty, error, username gate) is testable without Phaser.
 *
 * Interactive rectangles (body actions, pager buttons) are never shorter than
 * LEGACY_UI_MIN_TOUCH_TARGET. Rows are display-only, so on a short viewport
 * their height may shrink (down to LEGACY_LEADERBOARD_OVERLAY_MIN_ROW_HEIGHT)
 * to keep all ten rows plus the pager inside the card; any remaining overflow
 * is reported, never hidden.
 */
import {
  LEGACY_LEADERBOARD_VISIBLE_ROWS,
  resolveLegacyLeaderboardLayout,
  type LegacyLeaderboardAction,
  type LegacyLeaderboardActionId,
  type LegacyLeaderboardBodyModel,
  type LegacyLeaderboardRowModel,
  type LegacyLeaderboardSelfCardModel,
  type LegacyLeaderboardViewModel
} from './legacyLeaderboardView';
import { LEGACY_UI_MIN_TOUCH_TARGET } from './legacyUiStandards';

/** Smallest row height the plan will shrink to before reporting overflow. */
export const LEGACY_LEADERBOARD_OVERLAY_MIN_ROW_HEIGHT = 30;

export interface LegacyLeaderboardPlanRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyLeaderboardPlanRow {
  centerY: number;
  chipCenterX: number;
  chipRadius: number;
  levelRight: number;
  model: LegacyLeaderboardRowModel;
  rect: LegacyLeaderboardPlanRect;
  usernameLeft: number;
  /** Max pixel width for the username (it is also ellipsized by code points). */
  usernameMaxWidth: number;
}

export interface LegacyLeaderboardPlanAction {
  action: LegacyLeaderboardAction;
  rect: LegacyLeaderboardPlanRect;
}

export interface LegacyLeaderboardOverlayPlan {
  bodyActions: readonly LegacyLeaderboardPlanAction[];
  body: {
    centerX: number;
    centerY: number;
    maxWidth: number;
    model: LegacyLeaderboardBodyModel;
  } | null;
  card: LegacyLeaderboardPlanRect;
  columnHeader: {
    centerY: number;
    levelRight: number;
    playerLeft: number;
    ruleLeft: number;
    ruleRight: number;
    ruleY: number;
  } | null;
  compact: boolean;
  fits: boolean;
  overflowPx: number;
  pager: {
    label: { centerX: number; centerY: number; text: string };
    next: LegacyLeaderboardPlanAction | null;
    previous: LegacyLeaderboardPlanAction | null;
  } | null;
  rowHeight: number;
  rows: readonly LegacyLeaderboardPlanRow[];
  selfCard: {
    model: LegacyLeaderboardSelfCardModel;
    rect: LegacyLeaderboardPlanRect;
  } | null;
  skeletonRows: readonly LegacyLeaderboardPlanRect[];
  /** `Loading...` line, drawn in the column-header slot while rows are skeletons. */
  statusLine: { centerX: number; centerY: number; text: string } | null;
  titleCenterY: number;
  titleText: string;
}

const PAGER_ACTION_IDS: readonly LegacyLeaderboardActionId[] = ['previous-page', 'next-page'];

export const isLegacyLeaderboardPagerActionId = (id: LegacyLeaderboardActionId): boolean => (
  PAGER_ACTION_IDS.includes(id)
);

export const buildLegacyLeaderboardOverlayPlan = (
  view: LegacyLeaderboardViewModel,
  width: number,
  height: number,
  safeArea: { bottom?: number; top?: number } = {}
): LegacyLeaderboardOverlayPlan => {
  const includeSelfCard = view.phase !== 'gate' && view.selfCard !== null;
  const layout = resolveLegacyLeaderboardLayout(width, height, safeArea, { includeSelfCard });
  const { compact, contentLeft, contentWidth, panel } = layout;
  const contentRight = contentLeft + contentWidth;

  const fitRowHeight = Math.floor(
    (layout.availableHeight - layout.chromeHeight) / LEGACY_LEADERBOARD_VISIBLE_ROWS
  );
  const rowHeight = Math.max(
    LEGACY_LEADERBOARD_OVERLAY_MIN_ROW_HEIGHT,
    Math.min(layout.rowHeight, fitRowHeight)
  );
  const listHeight = rowHeight * LEGACY_LEADERBOARD_VISIBLE_ROWS;
  const contentHeight = layout.chromeHeight + listHeight;
  const overflowPx = Math.max(0, contentHeight - layout.availableHeight);

  const columnHeaderTop = layout.tops.columnHeader;
  const listTop = columnHeaderTop + layout.columnHeaderHeight;
  const pagerTop = listTop + listHeight;
  const buttonHeight = LEGACY_UI_MIN_TOUCH_TARGET;
  const pagerButtonTop = pagerTop + (layout.pagerHeight - buttonHeight);

  const titleCenterY = panel.top + 30;

  const selfCard = includeSelfCard && view.selfCard !== null
    ? {
      model: view.selfCard,
      rect: {
        height: layout.selfCardHeight,
        left: contentLeft,
        top: layout.tops.selfCard,
        width: contentWidth
      }
    }
    : null;

  const columnHeader = view.columns !== null
    ? {
      centerY: columnHeaderTop + (layout.columnHeaderHeight / 2),
      levelRight: contentRight - (compact ? 4 : 6),
      playerLeft: 0,
      ruleLeft: contentLeft,
      ruleRight: contentRight,
      ruleY: listTop - 2
    }
    : null;

  const chipRadius = Math.min(compact ? 13 : 15, Math.floor((rowHeight - 6) / 2));
  const chipCenterX = contentLeft + chipRadius + 2;
  const usernameLeft = contentLeft + (chipRadius * 2) + (compact ? 14 : 18);
  const levelRight = contentRight - (compact ? 4 : 6);
  const usernameMaxWidth = Math.max(40, levelRight - usernameLeft - (compact ? 44 : 52));
  if (columnHeader !== null) {
    columnHeader.playerLeft = usernameLeft;
  }

  const rows: LegacyLeaderboardPlanRow[] = view.rows.map((model, index) => {
    const top = listTop + (index * rowHeight);
    return {
      centerY: top + (rowHeight / 2),
      chipCenterX,
      chipRadius,
      levelRight,
      model,
      rect: { height: rowHeight, left: contentLeft, top, width: contentWidth },
      usernameLeft,
      usernameMaxWidth
    };
  });

  const skeletonRows: LegacyLeaderboardPlanRect[] = Array.from({ length: view.skeletonRowCount }, (_, index) => ({
    height: Math.max(8, rowHeight - 12),
    left: contentLeft,
    top: listTop + (index * rowHeight) + 6,
    width: contentWidth
  }));

  const centerX = panel.centerX;
  let statusLine: LegacyLeaderboardOverlayPlan['statusLine'] = null;
  let body: LegacyLeaderboardOverlayPlan['body'] = null;
  const bodyActions: LegacyLeaderboardPlanAction[] = [];
  const bodyMaxWidth = Math.max(40, panel.width - 56);

  if (view.body !== null) {
    if (view.body.kind === 'loading') {
      statusLine = {
        centerX,
        centerY: columnHeaderTop + (layout.columnHeaderHeight / 2),
        text: view.body.text
      };
    } else {
      const bodyCenterY = listTop + (compact ? 34 : 38);
      body = { centerX, centerY: bodyCenterY, maxWidth: bodyMaxWidth, model: view.body };
      const bodyOnlyActions = view.actions.filter((action) => !isLegacyLeaderboardPagerActionId(action.id));
      const actionWidth = Math.min(contentWidth, compact ? 220 : 260);
      const actionHeight = Math.max(buttonHeight, compact ? 46 : 52);
      bodyOnlyActions.forEach((action, index) => {
        bodyActions.push({
          action,
          rect: {
            height: actionHeight,
            left: centerX - (actionWidth / 2),
            top: bodyCenterY + (compact ? 50 : 54) + (index * (actionHeight + 10)),
            width: actionWidth
          }
        });
      });
    }
  }

  let pager: LegacyLeaderboardOverlayPlan['pager'] = null;
  if (view.pager !== null) {
    const pagerButtonWidth = compact ? 96 : 112;
    const find = (id: LegacyLeaderboardActionId): LegacyLeaderboardAction | null => (
      view.actions.find((action) => action.id === id) ?? null
    );
    const previousAction = find('previous-page');
    const nextAction = find('next-page');
    pager = {
      label: { centerX, centerY: pagerButtonTop + (buttonHeight / 2), text: view.pager.pageLabel },
      next: nextAction === null
        ? null
        : {
          action: nextAction,
          rect: { height: buttonHeight, left: contentRight - pagerButtonWidth, top: pagerButtonTop, width: pagerButtonWidth }
        },
      previous: previousAction === null
        ? null
        : {
          action: previousAction,
          rect: { height: buttonHeight, left: contentLeft, top: pagerButtonTop, width: pagerButtonWidth }
        }
    };
  }

  return {
    body,
    bodyActions,
    card: { height: panel.height, left: panel.left, top: panel.top, width: panel.width },
    columnHeader,
    compact,
    fits: overflowPx === 0,
    overflowPx,
    pager,
    rowHeight,
    rows,
    selfCard,
    skeletonRows,
    statusLine,
    titleCenterY,
    titleText: view.header.title
  };
};
