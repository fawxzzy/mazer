import { describe, expect, test } from 'vitest';
import {
  createLegacyPasswordRecoveryState,
  resolveLegacyAuthBottomFeedbackLabel,
  resolveLegacyAuthPresentation,
  resolveLegacyPasswordRecoveryEntry,
  resolveLegacyPasswordRecoveryPresentation
} from '../../src/legacy-runtime/legacyAuthPresentation';

describe('legacy auth presentation', () => {
  test('gives a first-time player clear login labels with no descriptive copy on a fresh load', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'guest' }
    })).toEqual(expect.objectContaining({
      alternateActionLabel: 'Create account',
      emailLabel: 'Email',
      helper: '',
      passwordLabel: 'Password',
      primaryActionLabel: 'Sign in',
      recoveryActionLabel: 'Reset password',
      title: 'Welcome'
    }));
  });

  test('uses the canonical login label when switching from account creation', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'signup',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'guest' }
    })).toEqual(expect.objectContaining({
      alternateActionLabel: 'Log in',
      primaryActionLabel: 'Create account'
    }));
  });

  test('keeps a remembered account on the same clean sign-in presentation', () => {
    const presentation = resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: {
        displayName: 'Maze Runner',
        email: 'runner@example.com',
        sessionState: 'active',
        updatedAt: '2026-08-16T00:00:00.000Z'
      },
      snapshot: { configured: true, status: 'guest' }
    });

    expect(presentation.title).toBe('Welcome');
    expect(presentation.helper).toBe('');
    expect(presentation.helper).not.toContain('runner@example.com');
    expect(presentation.helper).not.toContain('Maze Runner');
  });

  test('keeps reauthentication detail out of the visual subtitle slot', () => {
    const presentation = resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: {
        displayName: 'Maze Runner',
        email: 'runner@example.com',
        sessionState: 'reauth-required',
        updatedAt: '2026-08-16T00:00:00.000Z'
      },
      snapshot: { configured: true, status: 'guest' }
    });

    expect(presentation.title).toBe('Welcome');
    expect(presentation.helper).toBe('');
    expect(presentation.helper).not.toContain('runner@example.com');
    expect(presentation.helper).not.toContain('Maze Runner');
  });

  test('presents an authenticated session as an account surface instead of a second sign-in form', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'authenticated' }
    })).toEqual(expect.objectContaining({
      helper: '',
      title: 'Account'
    }));
  });

  test('keeps account configuration failures in categorical feedback instead of subtitle copy', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'signup',
      rememberedIdentity: null,
      snapshot: { configured: false, status: 'unavailable' }
    })).toEqual(expect.objectContaining({
      helper: '',
      title: 'Welcome'
    }));
  });

  test('uses the approved action copy and one email field label', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'guest' }
    })).toEqual(expect.objectContaining({
      emailLabel: 'Email',
      primaryActionLabel: 'Sign in'
    }));
  });

  test('compresses provider feedback into the temporary bottom action label', () => {
    expect(resolveLegacyAuthBottomFeedbackLabel(null, 'Password reset email sent.')).toBe('Reset email sent');
    expect(resolveLegacyAuthBottomFeedbackLabel('Invalid login credentials', null)).toBe('Email or password does not match');
    expect(resolveLegacyAuthBottomFeedbackLabel('Failed to fetch', null)).toBe('Account service unavailable');
    expect(resolveLegacyAuthBottomFeedbackLabel(
      'Account access is unavailable right now. You can still play as a guest.',
      null
    )).toBe('Account access unavailable');
    expect(resolveLegacyAuthBottomFeedbackLabel(
      'Account creation is unavailable right now. You can still play as a guest.',
      null
    )).toBe('Account creation unavailable');
    expect(resolveLegacyAuthBottomFeedbackLabel(
      'Password reset is unavailable right now. You can still play as a guest.',
      null
    )).toBe('Password reset unavailable');
    expect(resolveLegacyAuthBottomFeedbackLabel(null, null)).toBeNull();
  });

  test('enters password recovery exactly once from either event or authenticated path fallback', () => {
    const initial = createLegacyPasswordRecoveryState();
    const awaiting = resolveLegacyPasswordRecoveryEntry(initial, {
      authenticated: false,
      bootstrapComplete: false,
      event: 'BOOTSTRAP_PATH',
      hasProviderError: false,
      pathRequested: true
    });
    expect(awaiting.phase).toBe('awaiting-session');

    const eventReady = resolveLegacyPasswordRecoveryEntry(awaiting, {
      authenticated: true,
      bootstrapComplete: true,
      event: 'PASSWORD_RECOVERY',
      hasProviderError: false,
      pathRequested: true
    });
    expect(eventReady).toEqual({ error: null, phase: 'ready' });
    expect(resolveLegacyPasswordRecoveryEntry(eventReady, {
      authenticated: true,
      bootstrapComplete: true,
      event: 'BOOTSTRAP_PATH',
      hasProviderError: false,
      pathRequested: true
    })).toBe(eventReady);

    expect(resolveLegacyPasswordRecoveryEntry(initial, {
      authenticated: true,
      bootstrapComplete: true,
      event: 'BOOTSTRAP_PATH',
      hasProviderError: false,
      pathRequested: true
    })).toEqual({ error: null, phase: 'ready' });
  });

  test('keeps expired or reused callbacks categorical and recoverable', () => {
    const state = resolveLegacyPasswordRecoveryEntry(createLegacyPasswordRecoveryState(), {
      authenticated: false,
      bootstrapComplete: true,
      event: 'BOOTSTRAP_PATH',
      hasProviderError: true,
      pathRequested: true
    });
    expect(state).toEqual({
      error: 'This reset link is invalid or has expired. Request a new link.',
      phase: 'error'
    });
    expect(resolveLegacyPasswordRecoveryPresentation(state)).toEqual({
      helper: 'This reset link is invalid or has expired. Request a new link.',
      primaryActionLabel: 'Request new link',
      title: 'Reset password'
    });
    expect(resolveLegacyPasswordRecoveryPresentation({ error: null, phase: 'success' })).toEqual({
      helper: 'Password updated. You can continue to Mazer.',
      primaryActionLabel: 'Continue',
      title: 'Password updated'
    });
    expect(resolveLegacyPasswordRecoveryEntry(createLegacyPasswordRecoveryState(), {
      authenticated: false,
      bootstrapComplete: true,
      event: 'BOOTSTRAP_PATH',
      hasProviderError: true,
      pathRequested: false
    })).toEqual(createLegacyPasswordRecoveryState());
  });
});
