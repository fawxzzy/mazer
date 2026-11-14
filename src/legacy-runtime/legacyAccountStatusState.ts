/**
 * MAZER-ACCT-043: Mazer keeps no account screen. Sign-in, sign-up, account settings, credentials, sessions and
 * sign-out all live on account.fawxzzy.com; Mazer only hands the player over to it.
 *
 * The one thing Mazer still draws is the FAILURE FALLBACK of that hand-off. A refused hand-off, an offline start, a
 * denied or failed return and an explicit sign-out cannot redirect again without risking a loop (see
 * legacySignedOutHandoff.ts), so the scene shows a minimal status state in the loader's visual language: the app
 * icon and halo, ONE status line under them, and ONE `Try again` button that re-runs the hand-off. No fields, no
 * marker, no title, no rail, no legal row, no sign-in / sign-up wording, no Create Account.
 *
 * This module is the pure part: the loading copy for the gate cover, the status view-model and the layout. Nothing
 * here touches Phaser, storage, the network or the clock.
 */
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE } from './legacyAccountPortal';
import type { LegacyAuthStatus } from './legacyAuth';
import { resolveLoaderLayout, type LoaderLayout } from '../render/appLoader';
import {
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyOverlayPanelLayout
} from './legacyUiStandards';
import { designTokens } from '../theme/tokens';

export { MAZER_OAUTH_SAFE_ERROR_MESSAGE };

export const LEGACY_ACCOUNT_STATUS_COPY = Object.freeze({
  loading: 'Loading…',
  openingLabel: 'Opening…',
  retryLabel: 'Try again',
  signedOut: 'You are signed out.',
  signingIn: 'Signing you in…',
  stillOpening: 'Still opening. Try again.'
} as const);

/**
 * How long the `Opening…` button label may stay up before the state stops claiming progress and the button goes back
 * to an enabled `Try again` with the `Still opening` line (owner decision 2026-11-05, 10 s: headroom for a slow
 * redirect; only the redirect is covered, not the bounded token exchange).
 */
export const LEGACY_ACCOUNT_STATUS_OPENING_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Loading copy (the gate cover)
// ---------------------------------------------------------------------------

export interface LegacyAuthLoadingCopyInput {
  awaitingResolution: boolean;
  callbackInProgress: boolean;
  hasSession: boolean;
}

export type LegacyAuthLoadingCopy =
  | typeof LEGACY_ACCOUNT_STATUS_COPY.loading
  | typeof LEGACY_ACCOUNT_STATUS_COPY.signingIn;

/**
 * `Signing you in…` is a claim about this specific visitor, so it is only made when there is evidence for it: an
 * OAuth callback is being consumed, or the first auth resolution is pending AND a persisted session exists to
 * restore. Every other case (notably a first-time visitor with no session) gets the neutral `Loading…`.
 */
export const resolveLegacyAuthLoadingCopy = ({
  awaitingResolution,
  callbackInProgress,
  hasSession
}: LegacyAuthLoadingCopyInput): LegacyAuthLoadingCopy => (
  callbackInProgress || (awaitingResolution && hasSession)
    ? LEGACY_ACCOUNT_STATUS_COPY.signingIn
    : LEGACY_ACCOUNT_STATUS_COPY.loading
);

// ---------------------------------------------------------------------------
// Status view model
// ---------------------------------------------------------------------------

export type LegacyAccountStatusPhase = 'failed' | 'signed-out' | 'opening' | 'opening-slow';

export interface LegacyAccountStatusInput {
  errorMessage: string | null;
  status: LegacyAuthStatus;
  submitting: boolean;
  /** True once the `Opening…` timeout elapsed (the scene owns the clock). */
  openingTimedOut: boolean;
}

export interface LegacyAccountStatusModel {
  button: { disabled: boolean; label: string };
  line: string;
  phase: LegacyAccountStatusPhase;
  tone: 'error' | 'info';
}

const normalizeMessage = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const resolveLegacyAccountStatus = (input: LegacyAccountStatusInput): LegacyAccountStatusModel => {
  const errorMessage = normalizeMessage(input.errorMessage);
  const opening = input.submitting && !input.openingTimedOut;

  if (opening) {
    return {
      button: { disabled: true, label: LEGACY_ACCOUNT_STATUS_COPY.openingLabel },
      line: errorMessage ?? '',
      phase: 'opening',
      tone: 'info'
    };
  }
  const retry = { disabled: false, label: LEGACY_ACCOUNT_STATUS_COPY.retryLabel };
  if (errorMessage !== null) {
    return { button: retry, line: errorMessage, phase: 'failed', tone: 'error' };
  }
  if (input.openingTimedOut) {
    return { button: retry, line: LEGACY_ACCOUNT_STATUS_COPY.stillOpening, phase: 'opening-slow', tone: 'info' };
  }
  if (input.status === 'unavailable') {
    return { button: retry, line: MAZER_OAUTH_SAFE_ERROR_MESSAGE, phase: 'failed', tone: 'error' };
  }
  return { button: retry, line: LEGACY_ACCOUNT_STATUS_COPY.signedOut, phase: 'signed-out', tone: 'info' };
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface LegacyAccountStatusSafeArea {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

export interface LegacyAccountStatusRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyAccountStatusLayout {
  button: LegacyAccountStatusRect;
  centerX: number;
  columnWidth: number;
  /** The shared loader's icon placement (same centre and size as the boot splash and the gate cover). */
  loader: LoaderLayout;
}

export const LEGACY_ACCOUNT_STATUS_COLUMN_MAX_WIDTH = 420;
export const LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT = 52;

const resolveInset = (value: number | undefined): number => (
  Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0
);

export const resolveLegacyAccountStatusLayout = (
  width: number,
  height: number,
  safeArea: LegacyAccountStatusSafeArea = {}
): LegacyAccountStatusLayout => {
  const viewportWidth = Math.max(1, Math.round(width));
  const viewportHeight = Math.max(1, Math.round(height));
  const safeLeft = resolveInset(safeArea.left);
  const safeRight = resolveInset(safeArea.right);
  const safeTop = resolveInset(safeArea.top);
  const safeBottom = resolveInset(safeArea.bottom);

  const panel = resolveLegacyOverlayPanelLayout(viewportWidth, viewportHeight, { bottom: safeBottom, top: safeTop });
  const sideInset = designTokens.spacingPx[3];
  const bottomInset = designTokens.spacingPx[3];
  const availableLeft = Math.min(viewportWidth - 1, panel.left + safeLeft);
  const availableRight = Math.max(availableLeft + 1, panel.left + panel.width - safeRight);
  const columnWidth = Math.max(
    1,
    Math.min(LEGACY_ACCOUNT_STATUS_COLUMN_MAX_WIDTH, (availableRight - availableLeft) - (sideInset * 2))
  );
  const centerX = Math.round((availableLeft + availableRight) / 2);
  const buttonHeight = Math.max(LEGACY_UI_MIN_TOUCH_TARGET, LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT);
  const buttonBottom = panel.top + panel.height - bottomInset;

  return {
    button: {
      height: buttonHeight,
      left: centerX - Math.floor(columnWidth / 2),
      top: buttonBottom - buttonHeight,
      width: columnWidth
    },
    centerX,
    columnWidth,
    loader: resolveLoaderLayout(viewportWidth, viewportHeight)
  };
};
