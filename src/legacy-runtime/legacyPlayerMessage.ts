export type LegacyPlayerMessageTone = 'error' | 'info' | 'success' | 'warning';

export type LegacyPlayerMessageSource =
  | 'auth'
  | 'boot'
  | 'diagnostics'
  | 'overlay'
  | 'progression'
  | 'system';

export interface LegacyPlayerMessage {
  copy: string;
  durationMs: number;
  id: string;
  source: LegacyPlayerMessageSource;
  technicalDetail: string | null;
  tone: LegacyPlayerMessageTone;
}

export interface LegacyPlayerMessageInput {
  copy: string | null | undefined;
  durationMs?: number;
  id: string;
  source: LegacyPlayerMessageSource;
  technicalDetail?: string | null;
  tone: LegacyPlayerMessageTone;
}

export interface LegacyQueuedPlayerMessage {
  expiresAtMs: number;
  message: LegacyPlayerMessage;
  sequence: number;
}

export const LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS = 2400;
export const LEGACY_PLAYER_MESSAGE_MAX_VISIBLE = 3;

// A sign-in failure is the one message a player has to read to recover, and its
// longest sentence (LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost) is about 21
// words. Measured 2026-11-12 in headless Chromium, the toast for it lasted the
// 2400 ms default: well under the time it takes to read. 8000 ms covers the
// longest row at 300 ms a word with margin and is never below 6000 ms. The
// bottom-of-screen banner is held until the next attempt by the scene (see
// legacyAuthFeedbackLifetime.ts); this is the floor for the toast copy of it.
export const LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS = 8000;

export const LEGACY_PLAYER_MESSAGE_COLORS: Record<LegacyPlayerMessageTone, string> = {
  error: '#ff7d7d',
  info: '#b7f2ff',
  success: '#72e0bf',
  warning: '#ffcf91'
};

export const LEGACY_AUTH_MESSAGE_COPY = {
  accountUnavailable: 'Account service is unavailable right now. Try again shortly.',
  authUnavailable: 'Account access is unavailable right now. Try again shortly.',
  emailInvalid: 'Enter a valid email address.',
  loginNotConfigured: 'Account access is unavailable right now. Try again shortly.',
  networkUnavailable: 'Account service is unreachable. Try again shortly.',
  passwordPolicy: 'Choose a different, stronger password that meets the account security requirements.',
  usernameInvalid: 'Use 2-15 letters, numbers, periods, underscores, or hyphens.',
  usernameTaken: 'That username is already taken.',
  signedIn: 'Signed in.',
  signedOut: 'Signed out.'
} as const;

// Shared-account sign-in failures, one row per failure CLASS the player can act
// on (not per internal code). The generic row is the original one-size message
// and stays the fallback for anything unmapped; it equals
// MAZER_OAUTH_SAFE_ERROR_MESSAGE in legacyAccountPortal.ts (a test pins both).
export const LEGACY_OAUTH_FAILURE_MESSAGE_COPY = {
  cancelled: 'Sign-in did not finish. Choose Sign in to try again.',
  connection: 'Mazer could not finish connecting to your account. Try again in a moment.',
  contextLost: 'Sign-in came back to a different screen than where you started. Open Mazer from your home screen icon and try again.',
  generic: 'Could not reach your account. Try again.',
  providerUnreachable: 'Sign-in is unavailable right now. Try again in a few minutes.',
  session: 'Your account could not be confirmed. Try signing in again.',
  storage: 'This browser is blocking what Mazer needs to sign in. Turn off private browsing or allow site data, then try again.',
  timedOut: 'Sign-in took too long. Choose Sign in to start again.'
} as const;

// MAZER-ACCT-044 transition: the generic row was reworded here (integrator Wave 3B) while the one-size
// constant MAZER_OAUTH_SAFE_ERROR_MESSAGE lives in legacyAccountPortal.ts (Wave 5C), so the two edits ship
// as separate PRs. Until the constant follows, a snapshot can still carry the previous spelling; it is
// player-safe and is shown as the generic row. Delete this once legacyAccountPortal.ts has the new line.
const LEGACY_OAUTH_PREVIOUS_COPY = {
  generic: 'Account connection unavailable. Return to Mazer and try again.'
} as const;

export type LegacyOAuthFailureClass = keyof typeof LEGACY_OAUTH_FAILURE_MESSAGE_COPY;

// Internal failure code (MazerOAuthFailureCategory) -> player-facing class.
// Several codes share a class on purpose: the player acts the same way.
// `expired_or_missing_state` and `invalid_state` both mean the callback did not
// find (or match) the attempt this browser context started, which is what
// happens when sign-in finishes in a different window than it began in.
const LEGACY_OAUTH_FAILURE_CLASS_BY_CODE: Readonly<Record<string, LegacyOAuthFailureClass>> = {
  authorization_unavailable: 'connection',
  cancelled: 'cancelled',
  exchange_unavailable: 'connection',
  expired_or_missing_state: 'contextLost',
  invalid_state: 'contextLost',
  pending_expired: 'timedOut',
  // MAZER-ACCT-036: the pre-flight before leaving for the sign-in page found the
  // account service down, so Mazer stayed put instead of stranding the player
  // on a provider error page.
  provider_unreachable: 'providerUnreachable',
  session_invalid: 'session',
  storage_unavailable: 'storage',
  // Boot and sign-in paths that are not a callback failure. They keep the
  // generic player copy on purpose (the player acts the same way) but each now
  // carries its own stable code so a report can tell them apart:
  //   session_quarantined      a shared-account session commit is held in quarantine
  //   session_read_failed      reading the saved session threw or returned an error
  //   portal_navigation_failed leaving for the account portal threw
  portal_navigation_failed: 'generic',
  session_quarantined: 'generic',
  session_read_failed: 'generic'
};

// Codes that describe a boot/session read, not an OAuth callback. When one of
// these arrives together with provider-shaped text, the code is recorded first
// so the technical detail stays searchable by code.
const LEGACY_AUTH_BOOT_FAILURE_CODES: ReadonlySet<string> = new Set([
  'portal_navigation_failed',
  'session_quarantined',
  'session_read_failed'
]);

export const LEGACY_BOOT_MESSAGE_COPY = {
  bootError: 'The maze did not finish loading. Try refreshing once.',
  serviceWorkerError: 'The offline cache could not update. The game can still run online.'
} as const;

export const LEGACY_REMOTE_MESSAGE_COPY = {
  cycleReceiptFailed: 'Run history saved locally. Cloud sync will retry later.',
  guest: 'Sign in to sync progress across devices.',
  missingClient: 'Cloud sync is not ready in this build.',
  progressionFailed: 'Progress saved locally. Cloud sync will retry later.',
  settingsFailed: 'Settings saved locally. Cloud sync will retry later.'
} as const;

export const LEGACY_OFFLINE_MESSAGE_COPY = {
  saved: 'You are offline. Progress is saved on this device and will sync when you reconnect.',
  synced: 'Back online. Saved progress synced.'
} as const;

export const LEGACY_OVERLAY_MESSAGE_COPY = {
  fieldUpdated: 'Setting updated.',
  movementSpeedUpdated: 'Move speed updated.',
  settingsUpdated: 'Settings updated.'
} as const;

// Saving the leaderboard username (mazer_set_username). The taken and invalid
// rows reuse the auth copy so the same sentence reads the same everywhere.
export const LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY = {
  failed: 'Your username could not be saved. Please try again later.',
  invalid: LEGACY_AUTH_MESSAGE_COPY.usernameInvalid,
  taken: LEGACY_AUTH_MESSAGE_COPY.usernameTaken,
  tryAgain: 'Could not save your username. Check your connection and try again.'
} as const;

export type LegacyUsernameSaveFailureKind = 'failed' | 'invalid' | 'taken' | 'try-again';

export type LegacyRemoteMessageContext = 'cycle-receipt' | 'progression' | 'settings';
export type LegacyRemoteSkippedReason = 'disabled' | 'guest' | 'missing-client' | null;

export const createLegacyPlayerMessage = (
  input: LegacyPlayerMessageInput
): LegacyPlayerMessage | null => {
  const copy = input.copy?.trim() ?? '';
  if (copy.length === 0) {
    return null;
  }

  return {
    copy,
    durationMs: input.durationMs ?? LEGACY_PLAYER_MESSAGE_DEFAULT_DURATION_MS,
    id: input.id,
    source: input.source,
    technicalDetail: input.technicalDetail?.trim() || null,
    tone: input.tone
  };
};

export const resolveLegacyOfflineSavedMessage = (): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: LEGACY_OFFLINE_MESSAGE_COPY.saved,
  id: 'remote.outbox.offline-saved',
  source: 'progression',
  tone: 'info'
})!;

export const resolveLegacyOfflineSyncedMessage = (): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: LEGACY_OFFLINE_MESSAGE_COPY.synced,
  id: 'remote.outbox.synced',
  source: 'progression',
  tone: 'success'
})!;

export const resolveLegacyOAuthFailureClass = (
  code: string | null | undefined
): LegacyOAuthFailureClass => (
  typeof code === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_OAUTH_FAILURE_CLASS_BY_CODE, code)
    ? LEGACY_OAUTH_FAILURE_CLASS_BY_CODE[code]
    : 'generic'
);

export const resolveLegacyOAuthFailureCopy = (code: string | null | undefined): string => (
  LEGACY_OAUTH_FAILURE_MESSAGE_COPY[resolveLegacyOAuthFailureClass(code)]
);

// Diagnostics-only: the internal code goes into technicalDetail so a screenshot
// of runtime diagnostics identifies the failure. Players never see it. Only a
// known code is echoed; anything else is recorded as `unmapped`.
export const resolveLegacyOAuthFailureTechnicalDetail = (
  code: string | null | undefined
): string | null => {
  if (typeof code !== 'string' || code.length === 0) {
    return null;
  }
  return `oauth-failure:${Object.prototype.hasOwnProperty.call(LEGACY_OAUTH_FAILURE_CLASS_BY_CODE, code) ? code : 'unmapped'}`;
};

export const isLegacyOAuthFailureCopy = (copy: string | null | undefined): boolean => {
  const trimmed = copy?.trim();
  return trimmed !== undefined
    && trimmed.length > 0
    && ((Object.values(LEGACY_OAUTH_FAILURE_MESSAGE_COPY) as string[]).includes(trimmed)
      || trimmed === LEGACY_OAUTH_PREVIOUS_COPY.generic);
};

export const resolveLegacyOAuthFailureMessage = (
  code: string | null | undefined
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: resolveLegacyOAuthFailureCopy(code),
  durationMs: LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS,
  id: `auth.oauth-failure.${resolveLegacyOAuthFailureClass(code)}`,
  source: 'auth',
  technicalDetail: resolveLegacyOAuthFailureTechnicalDetail(code),
  tone: 'error'
})!;

export const enqueueLegacyPlayerMessage = (
  queue: readonly LegacyQueuedPlayerMessage[],
  message: LegacyPlayerMessage | null,
  nowMs: number,
  sequence: number
): LegacyQueuedPlayerMessage[] => {
  if (!message) {
    return [...queue];
  }

  const nextEntry: LegacyQueuedPlayerMessage = {
    expiresAtMs: nowMs + message.durationMs,
    message,
    sequence
  };

  return [
    ...queue.filter((entry) => entry.message.id !== message.id),
    nextEntry
  ]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-LEGACY_PLAYER_MESSAGE_MAX_VISIBLE);
};

export const expireLegacyPlayerMessageQueue = (
  queue: readonly LegacyQueuedPlayerMessage[],
  nowMs: number
): LegacyQueuedPlayerMessage[] => queue.filter((entry) => nowMs < entry.expiresAtMs);

export const resolveLegacyPlayerMessageColor = (
  message: Pick<LegacyPlayerMessage, 'tone'>
): string => LEGACY_PLAYER_MESSAGE_COLORS[message.tone];

export const resolveLegacyAuthFeedbackMessage = (
  error: string | null | undefined,
  info: string | null | undefined,
  errorCode?: string | null
): LegacyPlayerMessage | null => {
  if (error?.trim()) {
    const rawError = error.trim();
    // Shared-account sign-in failure copy is already player-safe and class
    // specific; pass it through instead of re-matching it as provider text.
    if (isLegacyOAuthFailureCopy(rawError)) {
      return createLegacyPlayerMessage({
        copy: rawError === LEGACY_OAUTH_PREVIOUS_COPY.generic ? LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic : rawError,
        durationMs: LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS,
        id: 'auth.feedback.error',
        source: 'auth',
        technicalDetail: resolveLegacyOAuthFailureTechnicalDetail(errorCode),
        tone: 'error'
      });
    }
    const normalizedError = rawError.toLowerCase();
    const isNetworkError = normalizedError === 'failed to fetch'
      || normalizedError.includes('network')
      || normalizedError.includes('fetch')
      // Chrome throws "Failed to fetch" for a connectivity failure, but
      // Safari throws "Load failed" and "A server with the specified
      // hostname could not be found" for the same underlying condition --
      // neither contains "network" or "fetch", so they fell through to the
      // generic "did not finish" copy instead of the network-specific one.
      || normalizedError.includes('load failed')
      || normalizedError.includes('could not be found')
      || normalizedError.includes('internet connection')
      || normalizedError.includes('cannot connect to the server');
    const isInvalidEmail = normalizedError.includes('email_address_invalid')
      || normalizedError.includes('invalid email')
      || normalizedError.includes('email address is invalid')
      || normalizedError.includes('unable to validate email address')
      // Hosted Auth may include the submitted value between the category
      // and verdict: `Email address <value> is invalid`. Match the stable
      // category + verdict instead of the dynamic value, and keep the raw
      // provider text confined to technicalDetail below.
      || (normalizedError.includes('email address') && normalizedError.includes('invalid'));
    const isPasswordPolicyError = normalizedError.includes('weak_password')
      || normalizedError.includes('weak password')
      || normalizedError.includes('password should be at least')
      || normalizedError.includes('password should contain')
      || normalizedError.includes('password must be at least')
      || normalizedError.includes('password does not meet')
      || normalizedError.includes('password is too weak')
      || normalizedError.includes('password is known to be weak')
      || normalizedError.includes('password strength')
      || normalizedError.includes('password cannot be longer')
      || normalizedError.includes('password must contain');
    const copy = isNetworkError
      ? LEGACY_AUTH_MESSAGE_COPY.networkUnavailable
      : isInvalidEmail
        ? LEGACY_AUTH_MESSAGE_COPY.emailInvalid
        : isPasswordPolicyError
          ? LEGACY_AUTH_MESSAGE_COPY.passwordPolicy
          : normalizedError.includes('invalid login credentials') || normalizedError.includes('invalid credentials')
            ? 'That email and password do not match. Check them or use Forgot Password.'
            : normalizedError.includes('email not confirmed')
              ? 'Confirm your email, then sign in again.'
              : normalizedError.includes('rate limit')
                ? 'Too many attempts. Wait a moment, then try again.'
                : LEGACY_AUTH_MESSAGE_COPY.accountUnavailable;
    const bootCodeDetail = typeof errorCode === 'string' && LEGACY_AUTH_BOOT_FAILURE_CODES.has(errorCode)
      ? resolveLegacyOAuthFailureTechnicalDetail(errorCode)
      : null;
    return createLegacyPlayerMessage({
      copy,
      durationMs: LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS,
      id: 'auth.feedback.error',
      source: 'auth',
      technicalDetail: bootCodeDetail !== null ? `${bootCodeDetail}; ${rawError}` : rawError,
      tone: 'error'
    });
  }

  return createLegacyPlayerMessage({
    copy: info,
    id: 'auth.feedback.info',
    source: 'auth',
    tone: 'success'
  });
};

export const resolveLegacyBootMessage = (
  stage: 'error' | 'service-worker-error',
  technicalDetail?: string
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: stage === 'service-worker-error'
    ? LEGACY_BOOT_MESSAGE_COPY.serviceWorkerError
    : LEGACY_BOOT_MESSAGE_COPY.bootError,
  id: `boot.${stage}`,
  source: 'boot',
  technicalDetail: technicalDetail ?? null,
  tone: stage === 'service-worker-error' ? 'warning' : 'error'
})!;

export const resolveLegacyRemoteSyncMessage = (
  context: LegacyRemoteMessageContext,
  result: {
    error: string | null;
    skippedReason: LegacyRemoteSkippedReason;
    synced: boolean;
  }
): LegacyPlayerMessage | null => {
  if (result.synced || result.skippedReason === 'disabled') {
    return null;
  }

  if (result.error?.trim()) {
    return createLegacyPlayerMessage({
      copy: context === 'cycle-receipt'
        ? LEGACY_REMOTE_MESSAGE_COPY.cycleReceiptFailed
        : context === 'settings'
          ? LEGACY_REMOTE_MESSAGE_COPY.settingsFailed
          : LEGACY_REMOTE_MESSAGE_COPY.progressionFailed,
      id: `remote.${context}.failed`,
      source: 'progression',
      technicalDetail: result.error,
      tone: 'warning'
    });
  }

  if (result.skippedReason === 'guest') {
    return createLegacyPlayerMessage({
      copy: LEGACY_REMOTE_MESSAGE_COPY.guest,
      id: `remote.${context}.guest`,
      source: 'progression',
      tone: 'info'
    });
  }

  if (result.skippedReason === 'missing-client') {
    return createLegacyPlayerMessage({
      copy: LEGACY_REMOTE_MESSAGE_COPY.missingClient,
      id: `remote.${context}.missing-client`,
      source: 'progression',
      tone: 'warning'
    });
  }

  return null;
};

const normalizeLegacyPlayerMessageIdPart = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'setting'
);

export const resolveLegacyOverlayToggleMessage = (
  label: string,
  stateText: string
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: `${label}: ${stateText}.`,
  id: `overlay.toggle.${normalizeLegacyPlayerMessageIdPart(label)}`,
  source: 'overlay',
  tone: 'success'
})!;

export const resolveLegacyOverlayMovementSpeedMessage = (
  stateText: string
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: `${LEGACY_OVERLAY_MESSAGE_COPY.movementSpeedUpdated} ${stateText}.`,
  id: 'overlay.movement-speed.updated',
  source: 'overlay',
  tone: 'success'
})!;

export const resolveLegacyOverlayFieldCommitMessage = (
  label: string,
  stateText: string,
  outcome: 'camera' | 'material' | 'maze' | 'unchanged'
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: outcome === 'unchanged'
    ? `${label}: ${stateText}.`
    : `${LEGACY_OVERLAY_MESSAGE_COPY.fieldUpdated} ${label}: ${stateText}.`,
  id: `overlay.field.${normalizeLegacyPlayerMessageIdPart(label)}`,
  source: 'overlay',
  tone: outcome === 'unchanged' ? 'info' : 'success'
})!;

const LEGACY_USERNAME_SAVE_FAILURE_COPY: Record<LegacyUsernameSaveFailureKind, string> = {
  failed: LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.failed,
  invalid: LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.invalid,
  taken: LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.taken,
  'try-again': LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.tryAgain
};

/**
 * The toast for a username save that did not land. Provider text stays in
 * technicalDetail; the player only ever sees one of the four plain sentences.
 */
export const resolveLegacyUsernameSaveFailureMessage = (
  kind: LegacyUsernameSaveFailureKind,
  technicalDetail?: string | null
): LegacyPlayerMessage => createLegacyPlayerMessage({
  copy: LEGACY_USERNAME_SAVE_FAILURE_COPY[kind],
  id: 'account.username.save-failed',
  source: 'auth',
  technicalDetail: technicalDetail ?? null,
  tone: kind === 'try-again' || kind === 'failed' ? 'warning' : 'error'
})!;
