import type {
  LegacyAuthFormMode,
  LegacyAuthSessionSnapshot,
  LegacyRememberedIdentityState
} from './legacyAuth';
import { LEGACY_AUTH_MESSAGE_COPY } from './legacyPlayerMessage';

export interface LegacyAuthPresentation {
  alternateActionLabel: string;
  displayNameLabel: string;
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

const resolveLegacyAuthTitleAndHelper = (
  state: LegacyAuthPresentationState,
  rememberedName: string
): { helper: string; title: string } => {
  switch (state) {
    case 'authenticated':
      return { helper: 'Review your saved Mazer account or sign out on this device.', title: 'Account' };
    case 'account-unavailable':
      return { helper: LEGACY_AUTH_MESSAGE_COPY.authUnavailable, title: 'Account Unavailable' };
    case 'signup':
      return { helper: 'Create a Mazer profile with your email and password.', title: 'Create Account' };
    case 'reauth-required':
      return {
        helper: `Welcome back, ${rememberedName}. Enter your password to restore your saved progress. If you need it, use Forgot Password.`,
        title: 'Sign In Again'
      };
    case 'remembered-identity':
      return {
        helper: `Welcome back, ${rememberedName}. Enter your password to continue.`,
        title: 'Welcome Back'
      };
    case 'fresh-sign-in':
      return {
        helper: 'Sign in with the account you use for Mazer. Guest play is always available.',
        title: 'Sign In'
      };
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
  const { helper, title } = resolveLegacyAuthTitleAndHelper(state, input.rememberedIdentity?.displayName ?? 'Player');

  return {
    alternateActionLabel: isSignup ? 'Use Sign In' : 'Create Account',
    displayNameLabel: 'Display name',
    emailLabel: 'Email',
    helper,
    passwordLabel: 'Password',
    primaryActionLabel: isSignup ? 'Create Account' : 'Sign In',
    recoveryActionLabel: 'Forgot Password?',
    title
  };
};
