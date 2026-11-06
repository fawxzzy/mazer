/**
 * Pure view-model and layout spec for the Mazer shared-account auth screen.
 *
 * Anatomy source: the shared auth-surface family contract (product marker,
 * `Welcome`, no subtitle, a compact secondary rail, a legal row and ONE
 * full-width bottom-dock action). Mazer authenticates through the account
 * host's OAuth flow, so this screen has no credential fields: it is the entry
 * card that starts that hand-off.
 *
 * Nothing here touches Phaser, storage, the network or the clock. A later
 * MenuScene packet feeds it scene state and draws what it returns; see
 * docs/ui/MAZER-AUTH-SCREEN-ANATOMY-2026-11-05.md for the wiring plan.
 */
import { designTokens } from '../theme/tokens';
import type { LegacyAuthStatus } from './legacyAuth';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE } from './legacyAccountPortal';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyOverlayPanelLayout
} from './legacyUiStandards';

export { MAZER_OAUTH_SAFE_ERROR_MESSAGE };

export const LEGACY_AUTH_SCREEN_COPY = Object.freeze({
  callbackPendingDockLabel: 'Signing in',
  continueInBrowserNotice: 'Still opening. Continue in your browser or try again.',
  createAccountLabel: 'Create Account',
  loading: 'Loading…',
  markerLabel: 'MAZER',
  openingDockLabel: 'Opening…',
  privacyLabel: 'Privacy Policy',
  resetPasswordLabel: 'Reset Password',
  signInDockLabel: 'Sign in',
  signingIn: 'Signing you in…',
  termsLabel: 'Terms of Service',
  title: 'Welcome'
} as const);

/**
 * How long the `Opening` dock label may stay on screen before the screen
 * stops claiming progress. After this the dock returns to `Sign in`
 * (enabled, so the player can retry) and a `Continue in your browser`
 * notice is shown. The family contract lets transient outcome labels replace
 * the dock label for five seconds; 10s (owner decision, 2026-11-05) adds
 * headroom for a slow redirect. Only the redirect is covered here, not the
 * bounded token exchange.
 */
export const LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Loading copy
// ---------------------------------------------------------------------------

export interface LegacyAuthLoadingCopyInput {
  awaitingResolution: boolean;
  callbackInProgress: boolean;
  hasSession: boolean;
}

export type LegacyAuthLoadingCopy =
  | typeof LEGACY_AUTH_SCREEN_COPY.loading
  | typeof LEGACY_AUTH_SCREEN_COPY.signingIn;

/**
 * `Signing you in…` is a claim about this specific visitor, so it is only
 * made when there is evidence for it: an OAuth callback is being consumed, or
 * the first auth resolution is pending AND a persisted session exists to
 * restore. Every other case (notably a first-time visitor with no session)
 * gets the neutral `Loading…`.
 */
export const resolveLegacyAuthLoadingCopy = ({
  awaitingResolution,
  callbackInProgress,
  hasSession
}: LegacyAuthLoadingCopyInput): LegacyAuthLoadingCopy => (
  callbackInProgress || (awaitingResolution && hasSession)
    ? LEGACY_AUTH_SCREEN_COPY.signingIn
    : LEGACY_AUTH_SCREEN_COPY.loading
);

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type LegacyAuthScreenPhase =
  | 'loading'
  | 'authenticated'
  | 'callback-pending'
  | 'opening'
  | 'opening-slow'
  | 'error'
  | 'entry';

export type LegacyAuthScreenElementId =
  | 'marker'
  | 'title'
  | 'status-banner'
  | 'secondary-rail'
  | 'legal-row'
  | 'primary-dock';

export type LegacyAuthScreenSecondaryAction = 'create-account' | 'reset-password';
export type LegacyAuthScreenLegalAction = 'privacy' | 'terms';

/**
 * Where a rail action leads. `oauth-authorize` starts the same OAuth hand-off
 * as the dock; `account-host-reset` is the account host's reset route. Create
 * Account stays on `oauth-authorize` because the account host exposes no
 * sign-up deep link today (UNKNOWN / not supported; see the doc).
 */
export type LegacyAuthScreenRoute = 'oauth-authorize' | 'account-host-reset' | 'legal-privacy' | 'legal-terms';

export interface LegacyAuthScreenLink<TAction extends string> {
  action: TAction;
  disabled: boolean;
  label: string;
  route: LegacyAuthScreenRoute;
}

export interface LegacyAuthScreenPrimaryDock {
  action: 'sign-in';
  disabled: boolean;
  label: string;
  pending: boolean;
}

export interface LegacyAuthScreenBanner {
  copy: string;
  tone: 'error' | 'info';
}

export interface LegacyAuthScreenViewModelInput {
  awaitingResolution: boolean;
  compact: boolean;
  errorMessage: string | null;
  hasCallbackInProgress: boolean;
  status: LegacyAuthStatus;
  submitting: boolean;
  /** Optional: a persisted session exists to restore (drives loading copy). */
  hasStoredSession?: boolean;
  /** Optional: ms since `submitting` began; enables the bounded Opening label. */
  submittingElapsedMs?: number;
}

export interface LegacyAuthScreenViewModel {
  /** Visible elements, top to bottom. Empty when this screen is not shown. */
  anatomy: readonly LegacyAuthScreenElementId[];
  banner: LegacyAuthScreenBanner | null;
  density: 'compact' | 'regular';
  legalRow: readonly LegacyAuthScreenLink<LegacyAuthScreenLegalAction>[];
  /** Set only while the first auth resolution gate is up. */
  loadingCopy: LegacyAuthLoadingCopy | null;
  marker: { label: string } | null;
  phase: LegacyAuthScreenPhase;
  primaryDock: LegacyAuthScreenPrimaryDock | null;
  secondaryRail: readonly LegacyAuthScreenLink<LegacyAuthScreenSecondaryAction>[];
  /** Always null: the family contract forbids a subtitle. */
  subtitle: null;
  title: string | null;
}

const normalizeMessage = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const buildLegacyAuthScreenViewModel = (
  input: LegacyAuthScreenViewModelInput
): LegacyAuthScreenViewModel => {
  const density = input.compact ? 'compact' : 'regular';

  if (input.awaitingResolution) {
    return {
      anatomy: [],
      banner: null,
      density,
      legalRow: [],
      loadingCopy: resolveLegacyAuthLoadingCopy({
        awaitingResolution: true,
        callbackInProgress: input.hasCallbackInProgress,
        hasSession: input.hasStoredSession === true
      }),
      marker: null,
      phase: 'loading',
      primaryDock: null,
      secondaryRail: [],
      subtitle: null,
      title: null
    };
  }

  if (input.status === 'authenticated') {
    return {
      anatomy: [],
      banner: null,
      density,
      legalRow: [],
      loadingCopy: null,
      marker: null,
      phase: 'authenticated',
      primaryDock: null,
      secondaryRail: [],
      subtitle: null,
      title: null
    };
  }

  const elapsedMs = Number.isFinite(input.submittingElapsedMs) ? (input.submittingElapsedMs as number) : 0;
  const openingSlow = input.submitting && !input.hasCallbackInProgress
    && elapsedMs >= LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS;
  const callbackPending = input.hasCallbackInProgress;
  const opening = input.submitting && !callbackPending && !openingSlow;
  const pending = callbackPending || opening;
  const errorMessage = normalizeMessage(input.errorMessage);

  let banner: LegacyAuthScreenBanner | null = null;
  if (errorMessage !== null) {
    banner = { copy: errorMessage, tone: 'error' };
  } else if (callbackPending) {
    banner = { copy: LEGACY_AUTH_SCREEN_COPY.signingIn, tone: 'info' };
  } else if (openingSlow) {
    banner = { copy: LEGACY_AUTH_SCREEN_COPY.continueInBrowserNotice, tone: 'info' };
  } else if (input.status === 'unavailable') {
    banner = { copy: MAZER_OAUTH_SAFE_ERROR_MESSAGE, tone: 'error' };
  }

  const phase: LegacyAuthScreenPhase = callbackPending
    ? 'callback-pending'
    : opening
      ? 'opening'
      : openingSlow
        ? 'opening-slow'
        : banner?.tone === 'error'
          ? 'error'
          : 'entry';

  const dockLabel = callbackPending
    ? LEGACY_AUTH_SCREEN_COPY.callbackPendingDockLabel
    : opening
      ? LEGACY_AUTH_SCREEN_COPY.openingDockLabel
      : LEGACY_AUTH_SCREEN_COPY.signInDockLabel;

  const anatomy: LegacyAuthScreenElementId[] = ['marker', 'title'];
  if (banner !== null) {
    anatomy.push('status-banner');
  }
  anatomy.push('secondary-rail', 'legal-row', 'primary-dock');

  return {
    anatomy,
    banner,
    density,
    legalRow: [
      { action: 'privacy', disabled: pending, label: LEGACY_AUTH_SCREEN_COPY.privacyLabel, route: 'legal-privacy' },
      { action: 'terms', disabled: pending, label: LEGACY_AUTH_SCREEN_COPY.termsLabel, route: 'legal-terms' }
    ],
    loadingCopy: null,
    marker: { label: LEGACY_AUTH_SCREEN_COPY.markerLabel },
    phase,
    primaryDock: { action: 'sign-in', disabled: pending, label: dockLabel, pending },
    secondaryRail: [
      {
        action: 'create-account',
        disabled: pending,
        label: LEGACY_AUTH_SCREEN_COPY.createAccountLabel,
        route: 'oauth-authorize'
      },
      {
        action: 'reset-password',
        disabled: pending,
        label: LEGACY_AUTH_SCREEN_COPY.resetPasswordLabel,
        route: 'account-host-reset'
      }
    ],
    subtitle: null,
    title: LEGACY_AUTH_SCREEN_COPY.title
  };
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface LegacyAuthScreenSafeArea {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

export interface LegacyAuthScreenRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyAuthScreenLinkRow {
  divider: LegacyAuthScreenRect;
  items: readonly [LegacyAuthScreenRect, LegacyAuthScreenRect];
  row: LegacyAuthScreenRect;
}

export interface LegacyAuthScreenLayout {
  body: LegacyAuthScreenRect;
  centerX: number;
  columnLeft: number;
  columnWidth: number;
  compact: boolean;
  dock: LegacyAuthScreenRect;
  legal: LegacyAuthScreenLinkRow;
  markerCenterY: number;
  /** True when the viewport is too short for a non-negative body zone. */
  overflow: boolean;
  rail: LegacyAuthScreenLinkRow;
  titleCenterY: number;
}

export const LEGACY_AUTH_SCREEN_COLUMN_MAX_WIDTH = 420;
export const LEGACY_AUTH_SCREEN_DOCK_HEIGHT = 52;
export const LEGACY_AUTH_SCREEN_LINK_ROW_HEIGHT = LEGACY_UI_MIN_TOUCH_TARGET;
export const LEGACY_AUTH_SCREEN_DOCK_RAIL_GAP = 16;
export const LEGACY_AUTH_SCREEN_DIVIDER_WIDTH = 8;
export const LEGACY_AUTH_SCREEN_DIVIDER_HEIGHT = 14;

const resolveInset = (value: number | undefined): number => (
  Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0
);

export const resolveLegacyAuthScreenLayout = (
  width: number,
  height: number,
  safeArea: LegacyAuthScreenSafeArea = {}
): LegacyAuthScreenLayout => {
  const viewportWidth = Math.max(1, Math.round(width));
  const viewportHeight = Math.max(1, Math.round(height));
  const safeLeft = resolveInset(safeArea.left);
  const safeRight = resolveInset(safeArea.right);
  const safeTop = resolveInset(safeArea.top);
  const safeBottom = resolveInset(safeArea.bottom);

  // Vertical extent reuses the shared overlay panel rules (8px compact / 16px
  // regular insets plus safe area); horizontal extent additionally honours
  // left/right insets, which the shared helper does not model.
  const panel = resolveLegacyOverlayPanelLayout(viewportWidth, viewportHeight, { bottom: safeBottom, top: safeTop });
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const sideInset = compact ? designTokens.spacingPx[3] : designTokens.spacingPx[5];
  const bottomInset = compact ? designTokens.spacingPx[3] : designTokens.spacingPx[5];

  const availableLeft = Math.min(viewportWidth - 1, panel.left + safeLeft);
  const availableRight = Math.max(availableLeft + 1, panel.left + panel.width - safeRight);
  const availableWidth = availableRight - availableLeft;
  const columnWidth = Math.max(1, Math.min(LEGACY_AUTH_SCREEN_COLUMN_MAX_WIDTH, availableWidth - (sideInset * 2)));
  const centerX = Math.round((availableLeft + availableRight) / 2);
  const columnLeft = centerX - Math.floor(columnWidth / 2);

  const panelBottom = panel.top + panel.height;
  const dockHeight = Math.max(LEGACY_UI_MIN_TOUCH_TARGET, LEGACY_AUTH_SCREEN_DOCK_HEIGHT);
  const dockBottom = panelBottom - bottomInset;
  const dock: LegacyAuthScreenRect = {
    height: dockHeight,
    left: columnLeft,
    top: dockBottom - dockHeight,
    width: columnWidth
  };

  const buildRow = (top: number): LegacyAuthScreenLinkRow => {
    const itemGap = LEGACY_AUTH_SCREEN_DIVIDER_WIDTH;
    const itemWidth = Math.max(1, Math.floor(columnWidth / 2) - itemGap);
    const rowHeight = LEGACY_AUTH_SCREEN_LINK_ROW_HEIGHT;
    return {
      divider: {
        height: LEGACY_AUTH_SCREEN_DIVIDER_HEIGHT,
        left: centerX - (LEGACY_AUTH_SCREEN_DIVIDER_WIDTH / 2),
        top: top + Math.round((rowHeight - LEGACY_AUTH_SCREEN_DIVIDER_HEIGHT) / 2),
        width: LEGACY_AUTH_SCREEN_DIVIDER_WIDTH
      },
      items: [
        { height: rowHeight, left: centerX - itemGap - itemWidth, top, width: itemWidth },
        { height: rowHeight, left: centerX + itemGap, top, width: itemWidth }
      ],
      row: { height: rowHeight, left: columnLeft, top, width: columnWidth }
    };
  };

  const legalTop = dock.top - LEGACY_AUTH_SCREEN_DOCK_RAIL_GAP - LEGACY_AUTH_SCREEN_LINK_ROW_HEIGHT;
  const railTop = legalTop - LEGACY_AUTH_SCREEN_LINK_ROW_HEIGHT;
  const legal = buildRow(legalTop);
  const rail = buildRow(railTop);

  const markerCenterY = panel.top + (compact ? 42 : 48);
  const titleCenterY = panel.top + (compact ? 103 : 110);
  const bodyTop = titleCenterY + 36;
  const bodyBottom = railTop - designTokens.spacingPx[3];
  const body: LegacyAuthScreenRect = {
    height: Math.max(0, bodyBottom - bodyTop),
    left: columnLeft,
    top: bodyTop,
    width: columnWidth
  };

  return {
    body,
    centerX,
    columnLeft,
    columnWidth,
    compact,
    dock,
    legal,
    markerCenterY,
    overflow: bodyBottom < bodyTop,
    rail,
    titleCenterY
  };
};
