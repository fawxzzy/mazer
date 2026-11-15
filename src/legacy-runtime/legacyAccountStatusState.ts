/**
 * MAZER-ACCT-043: Mazer keeps no account screen. Sign-in, sign-up, account settings, credentials, sessions and
 * sign-out all live on account.fawxzzy.com; Mazer only hands the player over to it.
 *
 * The one thing Mazer still draws is the FAILURE FALLBACK of that hand-off. A refused hand-off, an offline start, a
 * denied or failed return and an explicit sign-out cannot redirect again without risking a loop (see
 * legacySignedOutHandoff.ts), so the scene shows a minimal status state in the loader's visual language.
 *
 * Auth Surface v2 (owner-approved design, 2026-11-15): a MAZER kicker, the real app icon where the loader puts it,
 * the title "Mazer", then ONE reserved message area that holds either the lead ("Sign in to play.") or the one
 * notice box (a failure, worded from the shared copy matrix), and ONE "Sign in" button that re-runs the hand-off.
 * The message area has a fixed height sized for three wrapped lines, so a notice never moves the button and is never
 * clipped. No fields, no username, no legal row, no sign-up wording, no Create Account. Copy: src/brand/authSurfaceCopy.ts.
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
import { AUTH_SURFACE_LABELS, AUTH_SURFACE_MESSAGES } from '../brand/authSurfaceCopy';
import { LEGACY_AUTH_MESSAGE_COPY, LEGACY_OAUTH_FAILURE_MESSAGE_COPY } from './legacyPlayerMessage';

export { MAZER_OAUTH_SAFE_ERROR_MESSAGE };

export const LEGACY_ACCOUNT_STATUS_COPY = Object.freeze({
  kicker: AUTH_SURFACE_LABELS.kicker,
  loading: AUTH_SURFACE_LABELS.opening,
  openingLabel: AUTH_SURFACE_LABELS.signingIn,
  retryLabel: AUTH_SURFACE_LABELS.signIn,
  signedOut: AUTH_SURFACE_LABELS.signInLead,
  signingIn: AUTH_SURFACE_LABELS.signingIn,
  stillOpening: AUTH_SURFACE_MESSAGES['mazer.timeout'],
  title: AUTH_SURFACE_LABELS.appName
} as const);

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

const mixHex = (from: string, to: string, amountOfTo: number): string => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${a.map((channel, index) => Math.round(channel + ((b[index] - channel) * amountOfTo))
    .toString(16).padStart(2, '0')).join('')}`;
};

/** Status screen colours, all from the shared design tokens (no literals). */
export const LEGACY_ACCOUNT_STATUS_COLORS = Object.freeze({
  kicker: designTokens.color['semantic.info'],
  lead: designTokens.color['text.primary'],
  /** The loader's label ("Opening Mazer…" / "Signing in…") under the spinning icon. */
  loaderLabel: designTokens.color['text.muted'],
  leadAlpha: 0.68,
  noticeBorder: designTokens.color['tone.error'],
  noticeBorderAlpha: 0.55,
  noticeFill: designTokens.color['tone.error'],
  noticeFillAlpha: 0.1,
  noticeText: mixHex(designTokens.color['text.primary'], designTokens.color['tone.error'], 0.22),
  title: designTokens.color['text.primary']
});

export const LEGACY_ACCOUNT_STATUS_NOTICE_RADIUS = designTokens.radiusPx.sheet;

/**
 * How long the busy `Signing in…` button label may stay up before the state stops claiming progress and the button
 * goes back to an enabled `Sign in` with the timeout notice (owner decision 2026-11-05, 10 s: headroom for a slow
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
 * `Signing in…` is a claim about this specific visitor, so it is only made when there is evidence for it: an
 * OAuth callback is being consumed, or the first auth resolution is pending AND a persisted session exists to
 * restore. Every other case (notably a first-time visitor with no session) gets the neutral `Opening Mazer…`.
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
  /** True once the busy-label timeout elapsed (the scene owns the clock). */
  openingTimedOut: boolean;
}

export interface LegacyAccountStatusModel {
  button: { disabled: boolean; label: string };
  kicker: string;
  line: string;
  phase: LegacyAccountStatusPhase;
  /** `lead`: plain centred text in the message area. `notice`: the one bordered notice box (a failure). */
  presentation: 'lead' | 'notice';
  title: string;
  tone: 'error' | 'info';
}

const normalizeMessage = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The player-safe failure rows live in legacyPlayerMessage.ts (integrator Wave 3B) and are copy-matrix lines since
 * Auth Surface v2 PR-A2. The status box still translates every row it may meet to its matrix line here: matrix lines
 * map to themselves, MAZER_OAUTH_SAFE_ERROR_MESSAGE (Wave 5C, not yet reworded) maps to the outage line, and anything
 * unrecognised falls back to the outage line rather than reaching the box verbatim. Earlier spellings from an older
 * snapshot are already resolved upstream (resolveLegacyAuthFeedbackMessage -> resolveLegacyOAuthCurrentFailureCopy).
 * contextLost has no matrix row of its own: it reads as the callback line.
 */
const AUTH_SURFACE_NOTICE_BY_COPY: ReadonlyMap<string, string> = new Map<string, string>([
  ...Object.values(AUTH_SURFACE_MESSAGES).map((line) => [line, line] as [string, string]),
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.cancelled, AUTH_SURFACE_MESSAGES['mazer.cancelled']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.timedOut, AUTH_SURFACE_MESSAGES['mazer.timeout']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.storage, AUTH_SURFACE_MESSAGES['mazer.storage']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.providerUnreachable, AUTH_SURFACE_MESSAGES['signin.unavailable']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic, AUTH_SURFACE_MESSAGES['signin.unavailable']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.connection, AUTH_SURFACE_MESSAGES['signin.callback']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost, AUTH_SURFACE_MESSAGES['signin.callback']],
  [LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session, AUTH_SURFACE_MESSAGES['signin.session']],
  [LEGACY_AUTH_MESSAGE_COPY.accountUnavailable, AUTH_SURFACE_MESSAGES['signin.unavailable']],
  [LEGACY_AUTH_MESSAGE_COPY.authUnavailable, AUTH_SURFACE_MESSAGES['signin.unavailable']],
  [LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured, AUTH_SURFACE_MESSAGES['signin.unavailable']],
  [LEGACY_AUTH_MESSAGE_COPY.networkUnavailable, AUTH_SURFACE_MESSAGES['signin.offline']],
  [MAZER_OAUTH_SAFE_ERROR_MESSAGE, AUTH_SURFACE_MESSAGES['signin.unavailable']]
]);

export const resolveLegacyAccountStatusNotice = (message: string | null): string | null => {
  const normalized = normalizeMessage(message);
  if (normalized === null) {
    return null;
  }
  return AUTH_SURFACE_NOTICE_BY_COPY.get(normalized) ?? AUTH_SURFACE_MESSAGES['signin.unavailable'];
};

export const resolveLegacyAccountStatus = (input: LegacyAccountStatusInput): LegacyAccountStatusModel => {
  const errorMessage = resolveLegacyAccountStatusNotice(input.errorMessage);
  const opening = input.submitting && !input.openingTimedOut;
  const heading = { kicker: LEGACY_ACCOUNT_STATUS_COPY.kicker, title: LEGACY_ACCOUNT_STATUS_COPY.title };
  const lead = { line: LEGACY_ACCOUNT_STATUS_COPY.signedOut, presentation: 'lead' as const, tone: 'info' as const };
  const notice = (line: string) => ({ line, presentation: 'notice' as const, tone: 'error' as const });

  if (opening) {
    return {
      ...heading,
      ...(errorMessage === null ? lead : notice(errorMessage)),
      button: { disabled: true, label: LEGACY_ACCOUNT_STATUS_COPY.openingLabel },
      phase: 'opening'
    };
  }
  const retry = { disabled: false, label: LEGACY_ACCOUNT_STATUS_COPY.retryLabel };
  if (errorMessage !== null) {
    return { ...heading, ...notice(errorMessage), button: retry, phase: 'failed' };
  }
  if (input.openingTimedOut) {
    return { ...heading, ...notice(LEGACY_ACCOUNT_STATUS_COPY.stillOpening), button: retry, phase: 'opening-slow' };
  }
  if (input.status === 'unavailable') {
    return { ...heading, ...notice(AUTH_SURFACE_MESSAGES['signin.unavailable']), button: retry, phase: 'failed' };
  }
  return { ...heading, ...lead, button: retry, phase: 'signed-out' };
};

/**
 * Auth Surface v2: a sign-in failure is shown ONCE, in the status screen's notice box. While the player is not
 * signed in that screen is what they see, so the failure is not also queued as a toast. A failure that arrives while
 * signed in (for example leaving for the account site threw) has no status screen behind it and keeps its toast.
 */
export const shouldToastLegacyAuthFeedback = (
  message: { tone: string } | null,
  authenticated: boolean
): boolean => message !== null && (message.tone !== 'error' || authenticated);

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

export interface LegacyAccountStatusTextLine {
  centreY: number;
  fontSizePx: number;
}

export interface LegacyAccountStatusMessageSlot extends LegacyAccountStatusRect {
  /** Notice text size and line height (the lead uses `leadFontSizePx`). */
  fontSizePx: number;
  leadFontSizePx: number;
  lineHeightPx: number;
  paddingX: number;
  paddingY: number;
}

export interface LegacyAccountStatusLayout {
  button: LegacyAccountStatusRect;
  centerX: number;
  columnWidth: number;
  compact: boolean;
  /** Null when the viewport is too short to keep the kicker clear of the icon. */
  kicker: LegacyAccountStatusTextLine | null;
  /**
   * The app icon placement. It is the shared loader's placement (same centre and size as the boot splash and the
   * gate cover, so nothing jumps) unless the viewport is too short for the stack, when the stack moves up as one.
   */
  loader: LoaderLayout;
  /** The reserved message area: always this size, whether it holds the lead or a notice. */
  slot: LegacyAccountStatusMessageSlot;
  title: LegacyAccountStatusTextLine;
}

export const LEGACY_ACCOUNT_STATUS_COLUMN_MAX_WIDTH = 420;
export const LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT = 58;
export const LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT_COMPACT = 50;
/** Lines of notice text the message area always reserves (every matrix line wraps to two at 320 px). */
export const LEGACY_ACCOUNT_STATUS_SLOT_LINES = 3;
/** Below either size the screen uses the compact metrics of the approved mock (320 x 568). */
export const LEGACY_ACCOUNT_STATUS_COMPACT_MAX_WIDTH = 360;
export const LEGACY_ACCOUNT_STATUS_COMPACT_MAX_HEIGHT = 640;

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
  const compact = viewportWidth < LEGACY_ACCOUNT_STATUS_COMPACT_MAX_WIDTH
    || viewportHeight < LEGACY_ACCOUNT_STATUS_COMPACT_MAX_HEIGHT;
  const buttonHeight = Math.max(
    LEGACY_UI_MIN_TOUCH_TARGET,
    compact ? LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT_COMPACT : LEGACY_ACCOUNT_STATUS_BUTTON_HEIGHT
  );
  const buttonBottom = panel.top + panel.height - bottomInset;
  const buttonTop = buttonBottom - buttonHeight;
  const columnLeft = centerX - Math.floor(columnWidth / 2);

  // Metrics of the approved mock (padding 11x14 / 9x12, lead 16 / 14 px), with the type sizes snapped to the repo type
  // scale (src/render/typeScale.ts; the mock's off-scale 34 px title and 14.5 px notice become 28 and 14).
  const titleFontSizePx = 28;
  const leadFontSizePx = compact ? 14 : 16;
  const noticeFontSizePx = 14;
  const lineHeightPx = Math.round(noticeFontSizePx * 1.38);
  const paddingY = compact ? 9 : 11;
  const paddingX = compact ? 12 : 14;
  const slotHeight = (LEGACY_ACCOUNT_STATUS_SLOT_LINES * lineHeightPx) + (paddingY * 2);
  const iconToTitle = compact ? 16 : 22;
  const titleToSlot = compact ? 14 : 22;
  const slotToButton = designTokens.spacingPx[2];
  const titleHeight = Math.round(titleFontSizePx * 1.1);

  const baseLoader = resolveLoaderLayout(viewportWidth, viewportHeight);
  const iconSize = Math.round(baseLoader.iconSizePx);
  const stackBottom = Math.round(baseLoader.centreY - (iconSize / 2)) + iconSize + iconToTitle + titleHeight
    + titleToSlot + slotHeight;
  // Too short for the stack: icon, title and message area move up together so the button never covers them.
  const overflow = Math.max(0, stackBottom - (buttonTop - slotToButton));
  const loader: LoaderLayout = overflow === 0
    ? baseLoader
    : {
      ...baseLoader,
      centreY: baseLoader.centreY - overflow,
      labelCentreY: baseLoader.labelCentreY - overflow
    };
  const iconTop = Math.round(loader.centreY - (iconSize / 2));
  const titleTop = iconTop + iconSize + iconToTitle;
  const slotTop = titleTop + titleHeight + titleToSlot;

  const kickerFontSizePx = 13;
  const kickerCentreY = panel.top + (compact ? 14 : 24) + Math.round(kickerFontSizePx / 2);
  const kickerFits = kickerCentreY + kickerFontSizePx + designTokens.spacingPx[1] <= iconTop;

  return {
    button: {
      height: buttonHeight,
      left: columnLeft,
      top: buttonTop,
      width: columnWidth
    },
    centerX,
    columnWidth,
    compact,
    kicker: kickerFits ? { centreY: kickerCentreY, fontSizePx: kickerFontSizePx } : null,
    loader,
    slot: {
      fontSizePx: noticeFontSizePx,
      height: slotHeight,
      leadFontSizePx,
      left: columnLeft,
      lineHeightPx,
      paddingX,
      paddingY,
      top: slotTop,
      width: columnWidth
    },
    title: { centreY: titleTop + Math.round(titleHeight / 2), fontSizePx: titleFontSizePx }
  };
};
