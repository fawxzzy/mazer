import { LEGACY_AUTH_MESSAGE_COPY } from './legacyPlayerMessage';

export type LegacyPasswordRecoveryPhase =
  | 'inactive'
  | 'awaiting-session'
  | 'ready'
  | 'submitting'
  | 'error'
  | 'success';

export interface LegacyPasswordRecoveryState {
  error: string | null;
  phase: LegacyPasswordRecoveryPhase;
}

export interface LegacyPasswordRecoveryEntryInput {
  authenticated: boolean;
  bootstrapComplete: boolean;
  event: 'BOOTSTRAP_PATH' | 'PASSWORD_RECOVERY';
  hasProviderError: boolean;
  pathRequested: boolean;
}

export interface LegacyPasswordRecoveryPresentation {
  helper: string;
  primaryActionLabel: string | null;
  title: string;
}

export const createLegacyPasswordRecoveryState = (): LegacyPasswordRecoveryState => ({
  error: null,
  phase: 'inactive'
});

export const resolveLegacyPasswordRecoveryEntry = (
  state: LegacyPasswordRecoveryState,
  input: LegacyPasswordRecoveryEntryInput
): LegacyPasswordRecoveryState => {
  if (state.phase !== 'inactive' && state.phase !== 'awaiting-session') {
    return state;
  }

  if (input.hasProviderError && (input.pathRequested || input.event === 'PASSWORD_RECOVERY')) {
    return {
      error: LEGACY_AUTH_MESSAGE_COPY.passwordRecoveryInvalid,
      phase: 'error'
    };
  }

  if (input.event === 'PASSWORD_RECOVERY') {
    return input.authenticated
      ? { error: null, phase: 'ready' }
      : { error: LEGACY_AUTH_MESSAGE_COPY.passwordRecoveryInvalid, phase: 'error' };
  }

  if (!input.pathRequested) {
    return state;
  }

  if (!input.bootstrapComplete) {
    return { error: null, phase: 'awaiting-session' };
  }

  return input.authenticated
    ? { error: null, phase: 'ready' }
    : { error: LEGACY_AUTH_MESSAGE_COPY.passwordRecoveryInvalid, phase: 'error' };
};

export const resolveLegacyPasswordRecoveryPresentation = (
  state: LegacyPasswordRecoveryState
): LegacyPasswordRecoveryPresentation => {
  switch (state.phase) {
    case 'awaiting-session':
      return { helper: 'Checking your reset link…', primaryActionLabel: null, title: 'Reset password' };
    case 'ready':
      return { helper: 'Choose a new password.', primaryActionLabel: 'Update password', title: 'Reset password' };
    case 'submitting':
      return { helper: 'Updating your password…', primaryActionLabel: 'Working', title: 'Reset password' };
    case 'error':
      return {
        helper: state.error ?? LEGACY_AUTH_MESSAGE_COPY.passwordRecoveryInvalid,
        primaryActionLabel: 'Request new link',
        title: 'Reset password'
      };
    case 'success':
      return {
        helper: LEGACY_AUTH_MESSAGE_COPY.passwordRecoveryUpdated,
        primaryActionLabel: 'Continue',
        title: 'Password updated'
      };
    case 'inactive':
      return { helper: '', primaryActionLabel: null, title: 'Reset password' };
    default:
      return state.phase satisfies never;
  }
};
