/**
 * Pure view-model for the Leaderboard sheet (redesign 2026-11-06).
 *
 * The Leaderboard is a sheet in the same language as Settings and the Guide:
 * one card, the shared title, the primary `Back to Menu` row as the exit (no X,
 * no back arrow), a masked scrolling body with the shared rail, and designed
 * states. This module maps the scene's leaderboard state to a render-ready
 * model. No Phaser, no network, no DOM. Ranks and levels are DECIMAL STRINGS
 * (bigint-safe) and are never converted to JS numbers. Only type imports are
 * taken from legacyLeaderboard.ts so this module never pulls in the auth client.
 *
 * Content: RANK | PLAYER | LEVEL columns, the top N players (one request, no
 * pager), a pinned You row that is always visible once the player has a rank
 * (even when they are outside the loaded top N), top-3 emphasis by theme
 * colour. Raw error text is never shown: every failure maps to designed copy.
 * The name is never edited here (MAZER-ACCT-047, owner decision): the gate and
 * the line under the You row point to Profile on the account site instead.
 * See docs/ui/MAZER-LEADERBOARD-SHEET-2026-11-06.md.
 */
import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';
import type {
  LegacyLeaderboardEntry,
  LegacyLeaderboardSelfRank
} from './legacyLeaderboard';
import {
  buildLegacyLeaderboardModeTabs,
  type LegacyLeaderboardModeTabsModel
} from './legacyLeaderboardModeTabs';
import {
  formatLegacyProgressionOrdinal,
  normalizeLegacyProgressionOrdinal
} from './legacyProgression';

/** The overlay id the scene routes on (LegacyOverlayKind). Kept. */
export const LEGACY_LEADERBOARD_OVERLAY_ID = 'leaderboard' as const;
/** Header icon asset (the leaderboard glyph of the shared HUD icon atlas, served from public/). */
export const LEGACY_LEADERBOARD_ICON_ASSET_PATH = 'assets/hud/hud-icons.webp';

/** Players loaded and shown: the top N, one request, scrolled (no pager). Must stay <= LEGACY_LEADERBOARD_MAX_PAGE_SIZE (100). */
export const LEGACY_LEADERBOARD_TOP_N = 50;
/** Longest username (code points, ellipsis included) shown in a row. */
export const LEGACY_LEADERBOARD_USERNAME_MAX_CHARS = 15;
/** Skeleton rows painted while the first load is in flight. */
export const LEGACY_LEADERBOARD_SKELETON_ROWS = 8;

export const LEGACY_LEADERBOARD_TITLE = 'Leaderboard';

/**
 * Player-facing copy. The first block is the vocabulary (columns, You, exit);
 * the rest is one heading + one line per designed state. The three strings
 * that legacyLeaderboard.ts produces for a failed request are matched here
 * (never displayed) so the state can pick designed copy.
 */
export const LEGACY_LEADERBOARD_COPY = Object.freeze({
  columnLevel: 'LEVEL',
  columnPlayer: 'PLAYER',
  columnRank: 'RANK',
  emptyBody: 'Clear a maze to put your name on the board.',
  emptyHeading: 'No ranks yet',
  errorBody: 'Something went wrong on our side. Try again in a moment.',
  errorHeading: 'Leaderboard unavailable',
  exit: 'Back to Menu',
  loading: 'Loading the leaderboard…',
  needsUsernameBody: 'Choose it on the account site: open the menu and tap Profile.',
  needsUsernameHeading: 'Choose a username',
  notSetUpBody: 'It isn’t available yet. Check back soon.',
  notSetUpHeading: 'Leaderboard not ready',
  offlineBody: 'Reconnect to see the leaderboard. Your progress is saved on this device.',
  offlineHeading: 'You’re offline',
  profileLoading: 'Loading your profile…',
  profileUnavailableBody: 'Check your connection and try again.',
  profileUnavailableHeading: 'Couldn’t load your profile',
  retry: 'Retry',
  /** One line under the pinned You row: where a rename happens (never on this sheet). */
  selfNameHint: 'To change your name, open the menu and tap Profile.',
  signIn: 'Sign in',
  signedOutBody: 'Sign in to see where you stand among other players.',
  signedOutHeading: 'Sign in to see the board',
  unreachableBody: 'Check your connection and try again.',
  unreachableHeading: 'Can’t reach the leaderboard'
});

/** The failure strings legacyLeaderboard.ts emits, matched (not shown) to choose a designed state. */
const SOURCE_NETWORK_ERROR = 'Could not reach the leaderboard. Check your connection and try again.';
const SOURCE_NOT_SET_UP_ERROR = 'The leaderboard is not set up yet.';

export type LegacyLeaderboardStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'unavailable';
export type LegacyLeaderboardUsernameGate = 'loading' | 'unavailable' | 'needs-username' | 'ok';

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export interface LegacyLeaderboardPageRequest {
  limit: number;
  offset: number;
}

/** The single request the sheet makes: rows 1..N. */
export const resolveLegacyLeaderboardRequest = (): LegacyLeaderboardPageRequest => ({
  limit: LEGACY_LEADERBOARD_TOP_N,
  offset: 0
});

/* ------------------------------------------------------------------ */
/* Row helpers                                                         */
/* ------------------------------------------------------------------ */

export type LegacyLeaderboardRankTier = 'gold' | 'cyan' | 'mint' | 'standard';

/** Accent tier by GLOBAL rank only (#1 gold, #2 cyan, #3 mint). */
export const resolveLegacyLeaderboardRankTier = (rank: string): LegacyLeaderboardRankTier => {
  switch (normalizeLegacyProgressionOrdinal(rank)) {
    case '1': return 'gold';
    case '2': return 'cyan';
    case '3': return 'mint';
    default: return 'standard';
  }
};

/** Phaser color for a tier, from the shared cyber-arcade material (the theme, no medal art). */
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
  /** Rank column text (grouped decimal, no '#'). */
  rankText: string;
  tier: LegacyLeaderboardRankTier;
  /** True for the top 3: gets the themed accent bar, tint and bold name. */
  emphasized: boolean;
  usernameText: string;
  levelText: string;
  isOwn: boolean;
  accessibilityLabel: string;
}

const buildRow = (entry: LegacyLeaderboardEntry, usernameMaxChars: number): LegacyLeaderboardRowModel => {
  const rankText = formatLegacyProgressionOrdinal(entry.rank);
  const levelText = formatLegacyProgressionOrdinal(entry.playerLevel);
  const tier = resolveLegacyLeaderboardRankTier(entry.rank);
  return {
    accessibilityLabel: `Rank ${rankText}, ${entry.username.trim()}, level ${levelText}${entry.isRequestingUser ? ', you' : ''}`,
    emphasized: tier !== 'standard',
    isOwn: entry.isRequestingUser,
    key: normalizeLegacyProgressionOrdinal(entry.rank),
    levelText,
    rankText,
    tier,
    usernameText: resolveLegacyLeaderboardUsernameDisplay(entry.username, usernameMaxChars)
  };
};

export interface LegacyLeaderboardSelfRowModel {
  rankText: string;
  tier: LegacyLeaderboardRankTier;
  /** The player's saved username (ellipsis-safe), or null when it is not known. */
  usernameText: string | null;
  levelText: string;
  /** True when the You row repeats a row that is in the loaded list. */
  inList: boolean;
  /** False for a named player who has no leaderboard rank yet (rank and level show a dash). */
  ranked: boolean;
  accessibilityLabel: string;
}

/** Rank and level text of a named player who has no rank yet (a dash, not a sentence). */
export const LEGACY_LEADERBOARD_UNRANKED_TEXT = '–';

const buildSelfRow = (
  selfRank: LegacyLeaderboardSelfRank | null,
  selfUsername: string,
  loadedRankKeys: ReadonlySet<string>,
  usernameMaxChars: number
): LegacyLeaderboardSelfRowModel | null => {
  const name = selfUsername.trim();
  // No usable self-rank: a caller without a username has none (the gate handles that), and a
  // named caller may not be ranked yet (MAZER-ACCT-022). A named player still gets the pinned
  // You row, with a dash for rank and level, so they see their own name. An unnamed one gets none.
  if (selfRank === null || !selfRank.hasUsername || selfRank.rank === null) {
    if (name.length === 0) {
      return null;
    }
    return {
      accessibilityLabel: 'You have no rank yet.',
      inList: false,
      levelText: LEGACY_LEADERBOARD_UNRANKED_TEXT,
      ranked: false,
      rankText: LEGACY_LEADERBOARD_UNRANKED_TEXT,
      tier: 'standard',
      usernameText: resolveLegacyLeaderboardUsernameDisplay(name, usernameMaxChars)
    };
  }
  const rankText = formatLegacyProgressionOrdinal(selfRank.rank);
  const levelText = formatLegacyProgressionOrdinal(selfRank.playerLevel);
  return {
    accessibilityLabel: `You are rank ${rankText}, level ${levelText}.`,
    inList: loadedRankKeys.has(normalizeLegacyProgressionOrdinal(selfRank.rank)),
    levelText,
    ranked: true,
    rankText,
    tier: resolveLegacyLeaderboardRankTier(selfRank.rank),
    usernameText: name.length > 0 ? resolveLegacyLeaderboardUsernameDisplay(name, usernameMaxChars) : null
  };
};

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface LegacyLeaderboardViewState {
  status: LegacyLeaderboardStatus;
  /** Source error string. Matched to pick a designed state; NEVER displayed. */
  errorMessage: string | null;
  /** The loaded top N (RAW rows; the view caps at LEGACY_LEADERBOARD_TOP_N). */
  entries: readonly LegacyLeaderboardEntry[];
  selfRank: LegacyLeaderboardSelfRank | null;
  /** The saved username of the signed-in player ('' when none). */
  selfUsername: string;
  usernameGate: LegacyLeaderboardUsernameGate;
  signedIn: boolean;
  online: boolean;
}

export interface LegacyLeaderboardViewOptions {
  usernameMaxChars?: number;
}

export type LegacyLeaderboardActionId =
  | 'retry-username'
  | 'retry-page'
  | 'sign-in';

export interface LegacyLeaderboardAction {
  id: LegacyLeaderboardActionId;
  label: string;
}

export type LegacyLeaderboardStateKind =
  | 'profile-loading'
  | 'profile-unavailable'
  | 'needs-username'
  | 'signed-out'
  | 'offline'
  | 'unreachable'
  | 'not-set-up'
  | 'error'
  | 'empty';

export interface LegacyLeaderboardStateModel {
  kind: LegacyLeaderboardStateKind;
  /** Null for the one transient state that is only a status line. */
  heading: string | null;
  text: string;
  tone: 'info' | 'muted' | 'error';
  /** At most one action (Retry / Sign in). */
  action: LegacyLeaderboardAction | null;
}

export type LegacyLeaderboardPhase =
  | 'gate'
  | 'signed-out'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'error';

export interface LegacyLeaderboardViewModel {
  overlayId: typeof LEGACY_LEADERBOARD_OVERLAY_ID;
  phase: LegacyLeaderboardPhase;
  header: { title: string };
  /** The exit row: the primary `Back to Menu` (same row as Settings). */
  exit: { label: string };
  /** Column captions, only while rows are shown (the loading state shows a status line in the same slot). */
  columns: { level: string; player: string; rank: string } | null;
  /** At most LEGACY_LEADERBOARD_TOP_N. */
  rows: readonly LegacyLeaderboardRowModel[];
  /** The pinned You row; null until the player has a rank. */
  selfRow: LegacyLeaderboardSelfRowModel | null;
  /** The plain line under the You row pointing to Profile (MAZER-ACCT-047); null without a You row. */
  selfNameHint: string | null;
  skeletonRowCount: number;
  /** The designed state block (replaces the list), or null while rows are shown. */
  state: LegacyLeaderboardStateModel | null;
  /** Per-mode tab strip (lane L11): one Endless tab today; null for the signed-out and username-gate bodies. */
  modeTabs: LegacyLeaderboardModeTabsModel | null;
}

const RETRY_USERNAME: LegacyLeaderboardAction = Object.freeze({ id: 'retry-username', label: LEGACY_LEADERBOARD_COPY.retry });
const RETRY_PAGE: LegacyLeaderboardAction = Object.freeze({ id: 'retry-page', label: LEGACY_LEADERBOARD_COPY.retry });
const SIGN_IN: LegacyLeaderboardAction = Object.freeze({ id: 'sign-in', label: LEGACY_LEADERBOARD_COPY.signIn });

const base = (
  phase: LegacyLeaderboardPhase,
  patch: Partial<LegacyLeaderboardViewModel>
): LegacyLeaderboardViewModel => ({
  columns: null,
  exit: { label: LEGACY_LEADERBOARD_COPY.exit },
  header: { title: LEGACY_LEADERBOARD_TITLE },
  modeTabs: null,
  overlayId: LEGACY_LEADERBOARD_OVERLAY_ID,
  phase,
  rows: [],
  selfRow: null,
  selfNameHint: null,
  skeletonRowCount: 0,
  state: null,
  ...patch
});

const COPY = LEGACY_LEADERBOARD_COPY;

const STATES = Object.freeze({
  empty: { action: null, heading: COPY.emptyHeading, kind: 'empty', text: COPY.emptyBody, tone: 'muted' },
  error: { action: RETRY_PAGE, heading: COPY.errorHeading, kind: 'error', text: COPY.errorBody, tone: 'error' },
  needsUsername: { action: null, heading: COPY.needsUsernameHeading, kind: 'needs-username', text: COPY.needsUsernameBody, tone: 'muted' },
  notSetUp: { action: RETRY_PAGE, heading: COPY.notSetUpHeading, kind: 'not-set-up', text: COPY.notSetUpBody, tone: 'muted' },
  offline: { action: RETRY_PAGE, heading: COPY.offlineHeading, kind: 'offline', text: COPY.offlineBody, tone: 'info' },
  profileLoading: { action: null, heading: null, kind: 'profile-loading', text: COPY.profileLoading, tone: 'info' },
  profileUnavailable: { action: RETRY_USERNAME, heading: COPY.profileUnavailableHeading, kind: 'profile-unavailable', text: COPY.profileUnavailableBody, tone: 'error' },
  signedOut: { action: SIGN_IN, heading: COPY.signedOutHeading, kind: 'signed-out', text: COPY.signedOutBody, tone: 'muted' },
  unreachable: { action: RETRY_PAGE, heading: COPY.unreachableHeading, kind: 'unreachable', text: COPY.unreachableBody, tone: 'error' }
} satisfies Record<string, LegacyLeaderboardStateModel>);

/**
 * Precedence: signed out, then the username gate (the whole body is replaced),
 * then the page status (loading / failure / empty / ready). 'idle' is treated
 * as 'loading' (a load is about to start). An offline device only replaces the
 * list when there is nothing loaded to show.
 */
export const buildLegacyLeaderboardViewModel = (
  state: LegacyLeaderboardViewState,
  options: LegacyLeaderboardViewOptions = {}
): LegacyLeaderboardViewModel => {
  if (!state.signedIn) {
    return base('signed-out', { state: STATES.signedOut });
  }

  switch (state.usernameGate) {
    case 'loading':
      return base('gate', { state: STATES.profileLoading });
    case 'unavailable':
      return base('gate', { state: STATES.profileUnavailable });
    case 'needs-username':
      return base('gate', { state: STATES.needsUsername });
    case 'ok':
      break;
    default:
      return state.usernameGate satisfies never;
  }

  const usernameMaxChars = options.usernameMaxChars ?? LEGACY_LEADERBOARD_USERNAME_MAX_CHARS;
  const modeTabs = buildLegacyLeaderboardModeTabs();
  const boardBase = (
    phase: LegacyLeaderboardPhase,
    patch: Partial<LegacyLeaderboardViewModel>
  ): LegacyLeaderboardViewModel => base(phase, { modeTabs, ...patch });
  const loaded = state.entries.slice(0, LEGACY_LEADERBOARD_TOP_N);
  const loadedKeys = new Set(loaded.map((entry) => normalizeLegacyProgressionOrdinal(entry.rank)));
  const selfRow = buildSelfRow(state.selfRank, state.selfUsername, loadedKeys, usernameMaxChars);

  if (state.status === 'idle' || state.status === 'loading') {
    return boardBase('loading', { skeletonRowCount: LEGACY_LEADERBOARD_SKELETON_ROWS });
  }

  if (state.status === 'error' || state.status === 'unavailable') {
    if (!state.online) {
      return boardBase('offline', { state: STATES.offline });
    }
    const message = state.errorMessage?.trim() ?? '';
    if (message === SOURCE_NETWORK_ERROR) {
      return boardBase('error', { state: STATES.unreachable });
    }
    if (message === SOURCE_NOT_SET_UP_ERROR) {
      return boardBase('error', { state: STATES.notSetUp });
    }
    return boardBase('error', { state: STATES.error });
  }

  if (loaded.length === 0) {
    return boardBase('empty', { state: STATES.empty });
  }

  return boardBase('ready', {
    columns: { level: COPY.columnLevel, player: COPY.columnPlayer, rank: COPY.columnRank },
    rows: loaded.map((entry) => buildRow(entry, usernameMaxChars)),
    selfNameHint: selfRow === null ? null : COPY.selfNameHint,
    selfRow
  });
};
