import { describe, expect, test } from 'vitest';
import { resolveLegacyAuthPresentation } from '../../src/legacy-runtime/legacyAuthPresentation';

describe('legacy auth presentation', () => {
  test('gives a first-time player clear login labels without implying that guest play is blocked', () => {
    expect(resolveLegacyAuthPresentation({
      mode: 'login',
      rememberedIdentity: null,
      snapshot: { configured: true, status: 'guest' }
    })).toEqual(expect.objectContaining({
      alternateActionLabel: 'Create Account',
      emailLabel: 'Email',
      helper: 'Sign in with the account you use for Mazer. Guest play is always available.',
      passwordLabel: 'Password',
      primaryActionLabel: 'Sign In',
      recoveryActionLabel: 'Forgot Password?',
      title: 'Sign In'
    }));
  });

  test('makes a remembered account explicit without echoing its email address into supporting copy', () => {
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
    expect(presentation.helper).toBe('Welcome back, Maze Runner. Enter your password to continue.');
    expect(presentation.helper).not.toContain('runner@example.com');
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

    expect(presentation.title).toBe('Sign In Again');
    expect(presentation.helper).toContain('restore your saved progress');
    expect(presentation.helper).toContain('Forgot Password');
    expect(presentation.helper).not.toContain('runner@example.com');
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
