import { describe, expect, test } from 'vitest';
import { resolveLegacyAuthPresentation } from '../../src/legacy-runtime/legacyAuthPresentation';

describe('legacy auth presentation', () => {
  test('gives a first-time player clear login labels with no descriptive copy on a fresh load', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'guest' }
    })).toEqual(expect.objectContaining({
      alternateActionLabel: 'Create Account',
      emailLabel: 'Email',
      helper: '',
      passwordLabel: 'Password',
      primaryActionLabel: 'Sign In',
      recoveryActionLabel: 'Forgot Password?',
      title: 'Welcome'
    }));
  });

  test('makes a remembered account explicit without echoing its email address or name into supporting copy', () => {
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

    expect(presentation.title).toBe('Welcome Back');
    expect(presentation.helper).toBe('Continue with this account to log in.');
    expect(presentation.helper).not.toContain('runner@example.com');
    expect(presentation.helper).not.toContain('Maze Runner');
  });

  test('explains a required reauthentication without implying that saved progress was lost', () => {
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
    expect(presentation.helper).toBe('Your session ended. Enter your password to continue.');
    expect(presentation.helper).not.toContain('runner@example.com');
    expect(presentation.helper).not.toContain('Maze Runner');
  });

  test('presents an authenticated session as an account surface instead of a second sign-in form', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'authenticated' }
    })).toEqual(expect.objectContaining({
      helper: 'Review your saved Mazer account or sign out on this device.',
      title: 'Account'
    }));
  });

  test('uses plain language when the client cannot reach an account configuration', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'signup',
      rememberedIdentity: null,
      snapshot: { configured: false, status: 'unavailable' }
    })).toEqual(expect.objectContaining({
      helper: 'Account access is unavailable right now. You can still play as a guest.',
      title: 'Account Unavailable'
    }));
  });
});
