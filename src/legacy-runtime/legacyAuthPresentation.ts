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

/**
 * Keeps Mazer's canvas account surface as explicit and calm as the shared
 * Fitness account screens without coupling the game to provider details.
 */
export const resolveLegacyAuthPresentation = (
  input: LegacyAuthPresentationInput
): LegacyAuthPresentation => {
  const isSignup = input.mode === 'signup';
  const hasRememberedIdentity = input.rememberedIdentity !== null;
  const accountUnavailable = !input.snapshot.configured || input.snapshot.status === 'unavailable';

  return {
    alternateActionLabel: isSignup ? 'Use Sign In' : 'Create Account',
    displayNameLabel: 'Display name',
    emailLabel: 'Email',
    helper: accountUnavailable
      ? LEGACY_AUTH_MESSAGE_COPY.authUnavailable
      : isSignup
        ? 'Create a Mazer profile with your email and password.'
        : hasRememberedIdentity
          ? `Welcome back, ${input.rememberedIdentity?.displayName ?? 'Player'}. Enter your password to continue.`
          : 'Sign in with the account you use for Mazer. Guest play is always available.',
    passwordLabel: 'Password',
    primaryActionLabel: isSignup ? 'Create Account' : 'Sign In',
    recoveryActionLabel: 'Forgot Password?',
    title: accountUnavailable
      ? 'Account Unavailable'
      : isSignup
        ? 'Create Account'
        : hasRememberedIdentity
          ? 'Welcome Back'
          : 'Sign In'
  };
};
