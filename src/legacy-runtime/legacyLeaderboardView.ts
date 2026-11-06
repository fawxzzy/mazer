/**
 * Pure view-model for the redesigned Leaderboard overlay.
 *
 * Maps the scene's leaderboard state to a render-ready model. No Phaser, no
 * network, no DOM. Ranks and levels are DECIMAL STRINGS (bigint-safe) and are
 * never converted to JS numbers. Only type imports are taken from
 * legacyLeaderboard.ts so this module never pulls in the auth client.
 *
 * Keeps the strings pinned by tests/scenes/menu-render-frame.test.ts and the
 * exact error copy from legacyLeaderboard.ts. See
 * docs/ui/MAZER-LEADERBOARD-PAUSE-IDENTITY-REDESIGN-2026-11-05.md.
 */
import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';
import type {
  LegacyLeaderboardEntry,
  LegacyLeaderboardSelfRank
} from './legacyLeaderboard';
import {
  formatLegacyProgressionOrdinal,
  normalizeLegacyProgressionOrdinal
} from './legacyProgression';
import {
  LEGACY_OVERLAY_HEADER_RESERVE,
  LEGACY_UI_COMPACT_BREAKPOINT,
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyOverlayPanelLayout,
  type LegacyOverlayPanelLayout
} from './legacyUiStandards';

/** The overlay id the scene routes on (LegacyOverlayKind). Kept. */
export const LEGACY_LEADERBOARD_OVERLAY_ID = 'leaderboard' as const;
/** Header icon asset that is KEPT by the redesign (served from public/). */
export const LEGACY_LEADERBOARD_ICON_ASSET_PATH = 'assets/hud/hud-leaderboard.png';

/** Rows shown per page; matches MenuScene.LEADERBOARD_VISIBLE_ROWS. */
export const LEGACY_LEADERBOARD_VISIBLE_ROWS = 10;
/** Rows requested per fetch: one extra row proves a next page exists. */
export const LEGACY_LEADERBOARD_FETCH_LIMIT = LEGACY_LEADERBOARD_VISIBLE_ROWS + 1;
/** Longest username (code points, ellipsis included) shown in a row. */
export const LEGACY_LEADERBOARD_USERNAME_MAX_CHARS = 15;

export const LEGACY_LEADERBOARD_TITLE = 'Leaderboard';
export const LEGACY_LEADERBOARD_SELF_CARD_LABEL = 'YOU';

/** Copy pinned by existing tests / mirrored from legacyLeaderboard.ts. */
export const LEGACY_LEADERBOARD_COPY = Object.freeze({
  columnLevel: 'LEVEL',
  columnPlayer: 'PLAYER',
  emptyBoard: 'No one has a public rank yet.',
  emptyPage: 'No more players on this page.',
  errorFallback: 'The leaderboard is not available right now.',
  errorNetwork: 'Could not reach the leaderboard. Check your connection and try again.',
  errorNotSetUp: 'The leaderboard is not set up yet.',
  goToAccount: 'Go to Account',
  loading: 'Loading...',
  loadingUsername: 'Loading username...',
  needsUsername: 'You need a username to access the leaderboard.',
  next: 'Next',
  previous: 'Previous',
  retry: 'Retry',
  selfNeedsUsername: 'Set a username on the account screen to appear here.',
  usernameUnavailable: 'Username unavailable. Try again.'
});

export type LegacyLeaderboardStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'unavailable';
export type LegacyLeaderboardUsernameGate = 'loading' | 'unavailable' | 'needs-username' | 'ok';

/* ------------------------------------------------------------------ */
/* Paging: limit + 1 strategy                                          */
/* ------------------------------------------------------------------ */

export interface LegacyLeaderboardPageRequest {
  limit: number;
  offset: number;
}

const sanitizeOffset = (offset: number): number => (
  Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
);

/** Request one row more than is shown so hasNext is exact (no false "Next" on a full last page). */
export const resolveLegacyLeaderboardPageRequest = (offset: number): LegacyLeaderboardPageRequest => ({
  limit: LEGACY_LEADERBOARD_FETCH_LIMIT,
  offset: sanitizeOffset(offset)
});

export const splitLegacyLeaderboardPage = <T>(
  entries: readonly T[]
): { hasNext: boolean; visible: readonly T[] } => ({
  hasNext: entries.length > LEGACY_LEADERBOARD_VISIBLE_ROWS,
  visible: entries.slice(0, LEGACY_LEADERBOARD_VISIBLE_ROWS)
});

/* ------------------------------------------------------------------ */
/* Row helpers                                                         */
/* ------------------------------------------------------------------ */

export type LegacyLeaderboardRankTier = 'gold' | 'cyan' | 'mint' | 'standard';

/** Accent tier by GLOBAL rank only (#1 gold, #2 cyan, #3 mint); never page-relative. */
export const resolveLegacyLeaderboardRankTier = (rank: string): LegacyLeaderboardRankTier => {
  switch (normalizeLegacyProgressionOrdinal(rank)) {
    case '1': return 'gold';
    case '2': return 'cyan';
    case '3': return 'mint';
    default: return 'standard';
  }
};

/** Phaser color for a tier, from the shared cyber-arcade material (same colors as the old rows). */
export const resolveLegacyLeaderboardTierColor = (tier: LegacyLeaderboardRankTier): number => {
  switch (tier) {
    case 'gold': return cyberArcadeMaterial.signal.start;
    case 'cyan': return cyberArcadeMaterial.rail.cyan;
    case 'mint': return cyberArcadeMaterial.rail.mint;
    default: return cyberArcadeMaterial.rail.white;
  }
};

/**
 * Ellipsis-safe username for a row: at most `maxChars` code points INCLUDING
 * the ellipsis; never splits a surrogate pair.
 */
export const resolveLegacyLeaderboardUsernameDisplay = (
  username: string,
  maxChars: number = LEGACY_LEADERBOARD_USERNAME_MAX_CHARS
): string => {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : LEGACY_LEADERBOARD_USERNAME_MAX_CHARS;
  const points = Array.from(username.trim());
  if (points.length <= limit) {
    return points.join('');
  }
  if (limit === 1) {
    return '…';
  }
  return `${points.slice(0, limit - 1).join('').trimEnd()}…`;
};

export interface LegacyLeaderboardRowModel {
  /** Stable key: the global rank string. */
  key: string;
  /** Rank chip text (grouped decimal, no '#'). */
  rankChipText: string;
  tier: LegacyLeaderboardRankTier;
  /** Ellipsis-safe username text, at most usernameMaxChars code points. */
  usernameText: string;
  /** Right-aligned level text. */
  levelText: string;
  isOwn: boolean;
  accessibilityLabel: string;
}

const buildRow = (entry: LegacyLeaderboardEntry, usernameMaxChars: number): LegacyLeaderboardRowModel => {
  const rankChipText = formatLegacyProgressionOrdinal(entry.rank);
  const levelText = formatLegacyProgressionOrdinal(entry.playerLevel);
  const usernameText = resolveLegacyLeaderboardUsernameDisplay(entry.username, usernameMaxChars);
  return {
    accessibilityLabel: `Rank ${rankChipText}, ${entry.username.trim()}, level ${levelText}${entry.isRequestingUser ? ', you' : ''}`,
    isOwn: entry.isRequestingUser,
    key: normalizeLegacyProgressionOrdinal(entry.rank),
    levelText,
    rankChipText,
    tier: resolveLegacyLeaderboardRankTier(entry.rank),
    usernameText
  };
};

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface LegacyLeaderboardViewState {
  status: LegacyLeaderboardStatus;
  errorMessage: string | null;
  /**
   * RAW fetched entries for the page (request limit LEGACY_LEADERBOARD_FETCH_LIMIT).
   * The view splits visible/hasNext itself.
   */
  entries: readonly LegacyLeaderboardEntry[];
  offset: number;
  selfRank: LegacyLeaderboardSelfRank | null;
  usernameGate: LegacyLeaderboardUsernameGate;
}

export interface LegacyLeaderboardViewOptions {
  usernameMaxChars?: number;
}

export type LegacyLeaderboardActionId =
  | 'retry-username'
  | 'retry-page'
  | 'go-to-account'
  | 'previous-page'
  | 'next-page';

export interface LegacyLeaderboardAction {
  id: LegacyLeaderboardActionId;
  label: string;
  emphasis: 'primary' | 'secondary';
}

export type LegacyLeaderboardBodyKind =
  | 'gate-loading'
  | 'gate-unavailable'
  | 'gate-needs-username'
  | 'loading'
  | 'empty'
  | 'empty-page'
  | 'error';

export interface LegacyLeaderboardBodyModel {
  kind: LegacyLeaderboardBodyKind;
  text: string;
  tone: 'info' | 'muted' | 'error';
}

export interface LegacyLeaderboardSelfCardModel {
  label: string;
  variant: 'ranked' | 'needs-username';
  /** '#N' (grouped) or null when the player has no rank yet. */
  rankText: string | null;
  /** 'Level N' or null. */
  levelText: string | null;
  /** '#N · Level N' or the needs-username sentence. */
  summaryText: string;
}

export interface LegacyLeaderboardPagerModel {
  pageNumber: number;
  pageLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  previousOffset: number;
  nextOffset: number;
}

export type LegacyLeaderboardPhase = 'gate' | 'loading' | 'ready' | 'empty' | 'error';

export interface LegacyLeaderboardViewModel {
  overlayId: typeof LEGACY_LEADERBOARD_OVERLAY_ID;
  phase: LegacyLeaderboardPhase;
  header: { title: string };
  selfCard: LegacyLeaderboardSelfCardModel | null;
  /** Column captions, only while rows are shown. */
  columns: { level: string; player: string } | null;
  /** At most LEGACY_LEADERBOARD_VISIBLE_ROWS. */
  rows: readonly LegacyLeaderboardRowModel[];
  skeletonRowCount: number;
  body: LegacyLeaderboardBodyModel | null;
  /** Body actions (Retry / Go to Account). Pager actions live in `pager`. */
  actions: readonly LegacyLeaderboardAction[];
  pager: LegacyLeaderboardPagerModel | null;
}

const PRIMARY_RETRY_USERNAME: LegacyLeaderboardAction = Object.freeze({
  emphasis: 'primary', id: 'retry-username', label: LEGACY_LEADERBOARD_COPY.retry
});
const PRIMARY_RETRY_PAGE: LegacyLeaderboardAction = Object.freeze({
  emphasis: 'primary', id: 'retry-page', label: LEGACY_LEADERBOARD_COPY.retry
});
const PRIMARY_GO_TO_ACCOUNT: LegacyLeaderboardAction = Object.freeze({
  emphasis: 'primary', id: 'go-to-account', label: LEGACY_LEADERBOARD_COPY.goToAccount
});

const buildSelfCard = (
  selfRank: LegacyLeaderboardSelfRank | null
): LegacyLeaderboardSelfCardModel | null => {
  if (selfRank === null) {
    return null;
  }
  if (!selfRank.hasUsername) {
    return {
      label: LEGACY_LEADERBOARD_SELF_CARD_LABEL,
      levelText: null,
      rankText: null,
      summaryText: LEGACY_LEADERBOARD_COPY.selfNeedsUsername,
      variant: 'needs-username'
    };
  }
  if (selfRank.rank === null) {
    // A named caller always has a rank server-side; treat the contradiction
    // as "no usable self-rank" (same stance as fetchLegacyLeaderboardSelfRank).
    return null;
  }
  const rankText = `#${formatLegacyProgressionOrdinal(selfRank.rank)}`;
  const levelText = `Level ${formatLegacyProgressionOrdinal(selfRank.playerLevel)}`;
  return {
    label: LEGACY_LEADERBOARD_SELF_CARD_LABEL,
    levelText,
    rankText,
    summaryText: `${rankText} · ${levelText}`,
    variant: 'ranked'
  };
};

const buildPager = (offset: number, hasNext: boolean): LegacyLeaderboardPagerModel => {
  const safeOffset = sanitizeOffset(offset);
  const pageNumber = Math.floor(safeOffset / LEGACY_LEADERBOARD_VISIBLE_ROWS) + 1;
  return {
    hasNext,
    hasPrevious: safeOffset > 0,
    nextOffset: safeOffset + LEGACY_LEADERBOARD_VISIBLE_ROWS,
    pageLabel: `Page ${pageNumber}`,
    pageNumber,
    previousOffset: Math.max(0, safeOffset - LEGACY_LEADERBOARD_VISIBLE_ROWS)
  };
};

/** Pager actions in render order, derived from a pager model. */
export const resolveLegacyLeaderboardPagerActions = (
  pager: LegacyLeaderboardPagerModel
): readonly LegacyLeaderboardAction[] => {
  const actions: LegacyLeaderboardAction[] = [];
  if (pager.hasPrevious) {
    actions.push({ emphasis: 'secondary', id: 'previous-page', label: LEGACY_LEADERBOARD_COPY.previous });
  }
  if (pager.hasNext) {
    actions.push({ emphasis: 'secondary', id: 'next-page', label: LEGACY_LEADERBOARD_COPY.next });
  }
  return actions;
};

const base = (
  phase: LegacyLeaderboardPhase,
  patch: Partial<LegacyLeaderboardViewModel>
): LegacyLeaderboardViewModel => ({
  actions: [],
  body: null,
  columns: null,
  header: { title: LEGACY_LEADERBOARD_TITLE },
  overlayId: LEGACY_LEADERBOARD_OVERLAY_ID,
  pager: null,
  phase,
  rows: [],
  selfCard: null,
  skeletonRowCount: 0,
  ...patch
});

/**
 * Order of precedence mirrors the current overlay: username gate first (the
 * whole body is replaced), then the self card, then the page status.
 * 'idle' is treated as 'loading' (a load is about to start).
 */
export const buildLegacyLeaderboardViewModel = (
  state: LegacyLeaderboardViewState,
  options: LegacyLeaderboardViewOptions = {}
): LegacyLeaderboardViewModel => {
  switch (state.usernameGate) {
    case 'loading':
      return base('gate', {
        body: { kind: 'gate-loading', text: LEGACY_LEADERBOARD_COPY.loadingUsername, tone: 'info' }
      });
    case 'unavailable':
      return base('gate', {
        actions: [PRIMARY_RETRY_USERNAME],
        body: { kind: 'gate-unavailable', text: LEGACY_LEADERBOARD_COPY.usernameUnavailable, tone: 'error' }
      });
    case 'needs-username':
      return base('gate', {
        actions: [PRIMARY_GO_TO_ACCOUNT],
        body: { kind: 'gate-needs-username', text: LEGACY_LEADERBOARD_COPY.needsUsername, tone: 'muted' }
      });
    case 'ok':
      break;
    default:
      return state.usernameGate satisfies never;
  }

  const selfCard = buildSelfCard(state.selfRank);
  const usernameMaxChars = options.usernameMaxChars ?? LEGACY_LEADERBOARD_USERNAME_MAX_CHARS;

  if (state.status === 'idle' || state.status === 'loading') {
    return base('loading', {
      body: { kind: 'loading', text: LEGACY_LEADERBOARD_COPY.loading, tone: 'info' },
      selfCard,
      skeletonRowCount: LEGACY_LEADERBOARD_VISIBLE_ROWS
    });
  }

  if (state.status === 'error' || state.status === 'unavailable') {
    const message = state.errorMessage?.trim() ?? '';
    return base('error', {
      actions: [PRIMARY_RETRY_PAGE],
      body: {
        kind: 'error',
        text: message.length > 0 ? message : LEGACY_LEADERBOARD_COPY.errorFallback,
        tone: 'error'
      },
      selfCard
    });
  }

  const { hasNext, visible } = splitLegacyLeaderboardPage(state.entries);
  const offset = sanitizeOffset(state.offset);

  if (visible.length === 0) {
    if (offset === 0) {
      return base('empty', {
        body: { kind: 'empty', text: LEGACY_LEADERBOARD_COPY.emptyBoard, tone: 'muted' },
        selfCard
      });
    }
    const pager = buildPager(offset, false);
    return base('empty', {
      actions: resolveLegacyLeaderboardPagerActions(pager),
      body: { kind: 'empty-page', text: LEGACY_LEADERBOARD_COPY.emptyPage, tone: 'muted' },
      pager,
      selfCard
    });
  }

  const pager = buildPager(offset, hasNext);
  return base('ready', {
    actions: resolveLegacyLeaderboardPagerActions(pager),
    columns: { level: LEGACY_LEADERBOARD_COPY.columnLevel, player: LEGACY_LEADERBOARD_COPY.columnPlayer },
    pager,
    rows: visible.map((entry) => buildRow(entry, usernameMaxChars)),
    selfCard
  });
};

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export const LEGACY_LEADERBOARD_ROW_HEIGHT = 44;
export const LEGACY_LEADERBOARD_SHORT_ROW_HEIGHT = 40;
/** Viewports shorter than this use the short row height. */
export const LEGACY_LEADERBOARD_SHORT_VIEWPORT_HEIGHT = 760;

export interface LegacyLeaderboardLayout {
  panel: LegacyOverlayPanelLayout;
  compact: boolean;
  rowHeight: number;
  visibleRows: number;
  /** Header row (back chevron + title + icon) incl. the shell's content gap. */
  headerHeight: number;
  selfCardHeight: number;
  selfCardGap: number;
  columnHeaderHeight: number;
  listHeight: number;
  pagerHeight: number;
  bottomInset: number;
  /** Everything except the rows. */
  chromeHeight: number;
  /** headerHeight .. bottomInset, i.e. what must fit inside panel.height. */
  contentHeight: number;
  availableHeight: number;
  fits: boolean;
  overflowPx: number;
  /** Rows that would fit if the panel cannot show all ten (never above 10). */
  maxRowsThatFit: number;
  contentLeft: number;
  contentWidth: number;
  tops: { columnHeader: number; list: number; pager: number; selfCard: number };
}

export const resolveLegacyLeaderboardLayout = (
  width: number,
  height: number,
  safeArea: { top?: number; bottom?: number } = {},
  options: { includeSelfCard?: boolean } = {}
): LegacyLeaderboardLayout => {
  const panel = resolveLegacyOverlayPanelLayout(width, height, safeArea);
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const rowHeight = height < LEGACY_LEADERBOARD_SHORT_VIEWPORT_HEIGHT
    ? LEGACY_LEADERBOARD_SHORT_ROW_HEIGHT
    : LEGACY_LEADERBOARD_ROW_HEIGHT;
  const includeSelfCard = options.includeSelfCard ?? true;

  const headerHeight = LEGACY_OVERLAY_HEADER_RESERVE + (compact ? 6 : 8);
  const selfCardHeight = includeSelfCard ? (compact ? 56 : 60) : 0;
  const selfCardGap = includeSelfCard ? 10 : 0;
  const columnHeaderHeight = compact ? 24 : 28;
  const pagerGap = compact ? 8 : 10;
  const pagerHeight = pagerGap + LEGACY_UI_MIN_TOUCH_TARGET;
  const bottomInset = compact ? 12 : 16;
  const visibleRows = LEGACY_LEADERBOARD_VISIBLE_ROWS;
  const listHeight = visibleRows * rowHeight;

  const chromeHeight = headerHeight + selfCardHeight + selfCardGap + columnHeaderHeight + pagerHeight + bottomInset;
  const contentHeight = chromeHeight + listHeight;
  const availableHeight = panel.height;
  const overflowPx = Math.max(0, contentHeight - availableHeight);
  const contentInset = compact ? 20 : 28;

  const selfCardTop = panel.top + headerHeight;
  const columnHeaderTop = selfCardTop + selfCardHeight + selfCardGap;
  const listTop = columnHeaderTop + columnHeaderHeight;
  const pagerTop = listTop + listHeight;

  return {
    availableHeight,
    bottomInset,
    chromeHeight,
    columnHeaderHeight,
    compact,
    contentHeight,
    contentLeft: panel.left + contentInset,
    contentWidth: Math.max(1, panel.width - (contentInset * 2)),
    fits: overflowPx === 0,
    headerHeight,
    listHeight,
    maxRowsThatFit: Math.max(0, Math.min(visibleRows, Math.floor((availableHeight - chromeHeight) / rowHeight))),
    overflowPx,
    pagerHeight,
    panel,
    rowHeight,
    selfCardGap,
    selfCardHeight,
    tops: { columnHeader: columnHeaderTop, list: listTop, pager: pagerTop, selfCard: selfCardTop },
    visibleRows
  };
};
