import { describe, expect, test } from 'vitest';
import {
  LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY,
  LEGACY_AUTH_MESSAGE_COPY,
  resolveLegacyUsernameSaveFailureMessage,
  type LegacyUsernameSaveFailureKind
} from '../../src/legacy-runtime/legacyPlayerMessage';

// A username save that does not land must tell the player, in plain words,
// and never show provider text.
describe('username save failure message', () => {
  test('pins the four plain sentences', () => {
    expect(LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY).toEqual({
      failed: 'Your username could not be saved. Please try again later.',
      invalid: 'Use 2-15 letters, numbers, periods, underscores, or hyphens.',
      taken: 'That username is already taken.',
      tryAgain: 'Could not save your username. Check your connection and try again.'
    });
    expect(LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.taken).toBe(LEGACY_AUTH_MESSAGE_COPY.usernameTaken);
    expect(LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.invalid).toBe(LEGACY_AUTH_MESSAGE_COPY.usernameInvalid);
  });

  test.each<[LegacyUsernameSaveFailureKind, string, string]>([
    ['taken', LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.taken, 'error'],
    ['invalid', LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.invalid, 'error'],
    ['try-again', LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.tryAgain, 'warning'],
    ['failed', LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY.failed, 'warning']
  ])('maps %s to its sentence and keeps provider text as technical detail', (kind, copy, tone) => {
    const message = resolveLegacyUsernameSaveFailureMessage(kind, 'new row violates RLS (42501)');
    expect(message).toMatchObject({
      copy,
      id: 'account.username.save-failed',
      source: 'auth',
      technicalDetail: 'new row violates RLS (42501)',
      tone
    });
    expect(message.copy).not.toMatch(/rls|42501|violates|rpc|supabase/i);
  });

  test('technical detail is optional', () => {
    expect(resolveLegacyUsernameSaveFailureMessage('failed').technicalDetail).toBeNull();
  });
});
