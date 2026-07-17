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
  accountReady: 'Ready to save account changes.',
  accountUpdateFailed: 'Account changes could not be saved. Try again.',
  accountUpdated: 'Account details updated.',
  accountCreated: 'Account created.',
  authUnavailable: 'Account login needs Supabase env vars before it can be enabled.',
  callbackInvalid: 'This account link is invalid or expired. Request a new one.',
  createReady: 'Ready to create.',
  emailConfirmed: 'Email confirmed. You can log in.',
  enterEmail: 'Enter an email.',
  genericFailure: 'That account action could not be completed. Try again.',
  invalidCredentials: 'Email or password is incorrect.',
  loginNotConfigured: 'Account login is not configured for this build.',
  loginReady: 'Ready to login.',
  networkUnavailable: 'Account service is unreachable. Try again shortly.',
  passwordConfirmation: 'Passwords do not match.',
  passwordMinimum: 'Password needs at least 10 characters.',
  passwordUpdateReady: 'Ready to update password.',
  passwordUpdated: 'Password updated.',
  passwordResetEmailRequired: 'Enter an email before reset.',
  passwordResetNotConfigured: 'Password reset is not configured for this build.',
  passwordResetSent: 'If that email has an account, a reset link is on the way.',
  passwordResetWait: 'Please wait before requesting another reset link.',
  recoveryReady: 'Choose a new password.',
  signupNotConfigured: 'Account signup is not configured for this build.',
  signupUnavailable: 'Account could not be created. Check the details and try again.',
  signedIn: 'Signed in.',
  signedOut: 'Signed out. Guest progress is active.',
  verifyEmail: 'Check your email to finish account setup.'
} as const;

export type LegacyAuthErrorAction =
  | 'account-update'
  | 'callback'
  | 'login'
  | 'password-update'
  | 'reset-request'
  | 'session'
  | 'signup'
  | 'signout';

export const resolveLegacyAuthSafeErrorCopy = (
  error: string | null | undefined,
  action: LegacyAuthErrorAction = 'session'
): string | null => {
  const rawError = error?.trim() ?? '';
  if (!rawError) {
    return null;
  }

  const normalized = rawError.toLowerCase();
  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('offline')) {
    return LEGACY_AUTH_MESSAGE_COPY.networkUnavailable;
  }
  if (action === 'login') {
    return LEGACY_AUTH_MESSAGE_COPY.invalidCredentials;
  }
  if (action === 'signup') {
    return LEGACY_AUTH_MESSAGE_COPY.signupUnavailable;
  }
  if (action === 'callback') {
    return LEGACY_AUTH_MESSAGE_COPY.callbackInvalid;
  }
  if (action === 'reset-request') {
    return normalized.includes('rate') || normalized.includes('limit') || normalized.includes('too many')
      ? LEGACY_AUTH_MESSAGE_COPY.passwordResetWait
      : LEGACY_AUTH_MESSAGE_COPY.passwordResetSent;
  }
  if (action === 'account-update' || action === 'password-update') {
    return LEGACY_AUTH_MESSAGE_COPY.accountUpdateFailed;
  }

  return LEGACY_AUTH_MESSAGE_COPY.genericFailure;
};

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
    return createLegacyPlayerMessage({
      copy: resolveLegacyAuthSafeErrorCopy(rawError),
      id: 'auth.feedback.error',
      source: 'auth',
      technicalDetail: null,
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
