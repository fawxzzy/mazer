import { describe, expect, test } from 'vitest';
import {
  createLegacyPasswordRecoveryState,
  resolveLegacyPasswordRecoveryEntry,
  resolveLegacyPasswordRecoveryPresentation
} from '../../src/legacy-runtime/legacyAuthPresentation';

describe('legacy auth presentation', () => {
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
