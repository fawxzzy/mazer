import type {
  LegacyAuthFormMode,
  LegacyAuthSessionSnapshot,
  LegacyRememberedIdentityState
} from './legacyAuth';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  resolveLegacyAuthFeedbackMessage
} from './legacyPlayerMessage';

export interface LegacyAuthPresentation {
  alternateActionLabel: string;
  emailLabel: string;
  helper: string;
  passwordLabel: string;
  primaryActionLabel: string;
  recoveryActionLabel: string;
  title: string;
}

export interface LegacyAuthPresentationInput {
  mode: LegacyAuthFormMode;
  rememberedIdentity: LegacyRememberedIdentityState | null;
  snapshot: Pick<LegacyAuthSessionSnapshot, 'configured' | 'status'>;
}

export const resolveLegacyAuthBottomFeedbackLabel = (
  error: string | null | undefined,
  info: string | null | undefined
): string | null => {
  const normalizedError = error?.trim();
  if (normalizedError === LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured) {
    return 'Account access unavailable';
  }
  if (normalizedError === LEGACY_AUTH_MESSAGE_COPY.signupNotConfigured) {
    return 'Account creation unavailable';
  }
  if (normalizedError === LEGACY_AUTH_MESSAGE_COPY.passwordResetNotConfigured) {
    return 'Password reset unavailable';
  }

  const message = resolveLegacyAuthFeedbackMessage(error, info);
  if (!message) {
    return null;
  }

  if (message.copy === LEGACY_AUTH_MESSAGE_COPY.passwordResetSent) {
    return 'Reset email sent';
  }
  if (message.copy === LEGACY_AUTH_MESSAGE_COPY.networkUnavailable) {
    return 'Account service unavailable';
  }
  if (message.copy.includes('email and password do not match')) {
    return 'Email or password does not match';
  }
  if (message.copy.includes('Confirm your email')) {
    return 'Confirm your email first';
  }
  if (message.copy.includes('Too many attempts')) {
    return 'Wait a moment, then try again';
  }
  if (message.copy.includes('already has an account')) {
    return 'Account already exists';
  }
  if (message.tone === 'error') {
    return 'Could not finish — try again';
  }
  if (message.copy === LEGACY_AUTH_MESSAGE_COPY.verifyEmail) {
    return 'Check your email';
  }
  if (message.copy === LEGACY_AUTH_MESSAGE_COPY.accountCreated) {
    return 'Account created';
  }

  return message.copy.replace(/\.$/, '');
};

type LegacyAuthPresentationState =
  | 'account-unavailable'
  | 'authenticated'
  | 'fresh-sign-in'
  | 'reauth-required'
  | 'remembered-identity'
  | 'signup';

// One priority-ordered classification instead of two parallel 5-way ternary
// chains (title and helper used to re-derive the same branch order
// independently, which is easy to let drift apart on an edit).
const resolveLegacyAuthPresentationState = ({
  accountUnavailable,
  authenticated,
  hasRememberedIdentity,
  isSignup,
  requiresReauthentication
}: {
  accountUnavailable: boolean;
  authenticated: boolean;
  hasRememberedIdentity: boolean;
  isSignup: boolean;
  requiresReauthentication: boolean;
}): LegacyAuthPresentationState => {
  if (authenticated) {
    return 'authenticated';
  }
  if (accountUnavailable) {
    return 'account-unavailable';
  }
  if (isSignup) {
    return 'signup';
  }
  if (requiresReauthentication) {
    return 'reauth-required';
  }
  if (hasRememberedIdentity) {
    return 'remembered-identity';
  }
  return 'fresh-sign-in';
};

// Auth entry is intentionally presentation-only: one product label, one short
// title, then the form. Status and provider failures use the existing
// categorical feedback channel instead of changing the screen into explanatory
// prose or a different visual hierarchy.
const resolveLegacyAuthTitleAndHelper = (
  state: LegacyAuthPresentationState
): { helper: string; title: string } => {
  switch (state) {
    case 'authenticated':
      return { helper: '', title: 'Account' };
    case 'account-unavailable':
      return { helper: '', title: 'Welcome' };
    case 'signup':
      return { helper: '', title: 'Create Account' };
    case 'reauth-required':
      return { helper: '', title: 'Welcome' };
    case 'remembered-identity':
      return { helper: '', title: 'Welcome' };
    case 'fresh-sign-in':
      return { helper: '', title: 'Welcome' };
    default:
      return state satisfies never;
  }
};

/**
 * Keeps Mazer's canvas account surface as explicit and calm as the shared
 * Fitness account screens without coupling the game to provider details.
 */
export const resolveLegacyAuthPresentation = (
  input: LegacyAuthPresentationInput
): LegacyAuthPresentation => {
  const isSignup = input.mode === 'signup';
  const hasRememberedIdentity = input.rememberedIdentity !== null;
  const requiresReauthentication = input.rememberedIdentity?.sessionState === 'reauth-required';
  const authenticated = input.snapshot.status === 'authenticated';
  const accountUnavailable = !input.snapshot.configured || input.snapshot.status === 'unavailable';
  const state = resolveLegacyAuthPresentationState({
    accountUnavailable,
    authenticated,
    hasRememberedIdentity,
    isSignup,
    requiresReauthentication
  });
  const { helper, title } = resolveLegacyAuthTitleAndHelper(state);

  return {
    alternateActionLabel: isSignup ? 'Log in' : 'Create account',
    emailLabel: 'Email',
    helper,
    passwordLabel: 'Password',
    primaryActionLabel: isSignup ? 'Create account' : 'Sign in',
    recoveryActionLabel: 'Reset password',
    title
  };
};
