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

export const LEGACY_PLAYER_MESSAGE_COLORS: Record<LegacyPlayerMessageTone, string> = {
  error: '#ff7d7d',
  info: '#b7f2ff',
  success: '#72e0bf',
  warning: '#ffcf91'
};

export const LEGACY_AUTH_MESSAGE_COPY = {
  accountCreated: 'Your account is ready.',
  authUnavailable: 'Account access is unavailable right now. You can still play as a guest.',
  createReady: 'Details look good. Create your account when you are ready.',
  enterEmail: 'Enter an email.',
  loginNotConfigured: 'Account access is unavailable right now. You can still play as a guest.',
  loginReady: 'Details look good. Sign in when you are ready.',
  networkUnavailable: 'Account service is unreachable. Try again shortly.',
  passwordMinimum: 'Password needs 6+ characters.',
  passwordResetEmailRequired: 'Enter an email before reset.',
  passwordResetNotConfigured: 'Password reset is unavailable right now. You can still play as a guest.',
  passwordResetSent: 'Password reset email sent.',
  usernameInvalid: 'Use 2-15 letters, numbers, periods, underscores, or hyphens.',
  usernameRequired: 'Enter a username.',
  signupNotConfigured: 'Account creation is unavailable right now. You can still play as a guest.',
  signedIn: 'Signed in.',
  signedOut: 'Signed out. Guest progress is active.',
  verifyEmail: 'Check your email to finish account setup.'
} as const;

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

export const LEGACY_OVERLAY_MESSAGE_COPY = {
  fieldUpdated: 'Setting updated.',
  movementSpeedUpdated: 'Move speed updated.',
  settingsUpdated: 'Settings updated.'
} as const;

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

export const resolveLegacyAuthValidationMessage = (
  copy: string | null,
  canSubmit: boolean
): LegacyPlayerMessage | null => createLegacyPlayerMessage({
  copy,
  id: canSubmit ? 'auth.validation.ready' : 'auth.validation.blocked',
  source: 'auth',
  tone: canSubmit ? 'success' : 'warning'
});

export const resolveLegacyAuthFeedbackMessage = (
  error: string | null | undefined,
  info: string | null | undefined
): LegacyPlayerMessage | null => {
  if (error?.trim()) {
    const rawError = error.trim();
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
    const copy = isNetworkError
      ? LEGACY_AUTH_MESSAGE_COPY.networkUnavailable
      : normalizedError.includes('invalid login credentials') || normalizedError.includes('invalid credentials')
        ? 'That email and password do not match. Check them or use Forgot Password.'
        : normalizedError.includes('email not confirmed')
          ? 'Confirm your email, then sign in again.'
          : normalizedError.includes('rate limit')
            ? 'Too many attempts. Wait a moment, then try again.'
            : normalizedError.includes('already registered')
              ? 'That email already has an account. Sign in instead.'
              : 'Account sign-in did not finish. Check your details and try again.';
    return createLegacyPlayerMessage({
      copy,
      id: 'auth.feedback.error',
      source: 'auth',
      technicalDetail: rawError,
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
