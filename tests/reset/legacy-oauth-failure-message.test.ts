import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS,
  LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
  isLegacyOAuthFailureCopy,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyOAuthCurrentFailureCopy,
  resolveLegacyOAuthFailureClass,
  resolveLegacyOAuthFailureCopy,
  resolveLegacyOAuthFailureMessage,
  resolveLegacyOAuthFailureTechnicalDetail,
  type LegacyOAuthFailureClass
} from '../../src/legacy-runtime/legacyPlayerMessage';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE } from '../../src/legacy-runtime/legacyAccountPortal';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';

// Every internal failure code the shared-account callback can report
// (MazerOAuthFailureCategory plus `pending_expired`, the TTL case split out so
// "took too long" is distinguishable from "came back somewhere else").
const EXPECTED_CLASS_BY_CODE: ReadonlyArray<readonly [string, LegacyOAuthFailureClass]> = [
  ['pending_expired', 'timedOut'],
  ['expired_or_missing_state', 'contextLost'],
  ['invalid_state', 'contextLost'],
  ['cancelled', 'cancelled'],
  ['authorization_unavailable', 'connection'],
  ['exchange_unavailable', 'connection'],
  ['session_invalid', 'session'],
  ['storage_unavailable', 'storage'],
  // MAZER-ACCT-036: the sign-in pre-flight found the account service down.
  ['provider_unreachable', 'providerUnreachable']
];

describe('shared-account sign-in failure copy', () => {
  test.each(EXPECTED_CLASS_BY_CODE)('maps %s to the %s class with its own copy', (code, expectedClass) => {
    expect(resolveLegacyOAuthFailureClass(code)).toBe(expectedClass);
    expect(resolveLegacyOAuthFailureCopy(code)).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass]);
    expect(resolveLegacyOAuthFailureMessage(code)).toMatchObject({
      copy: LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass],
      id: `auth.oauth-failure.${expectedClass}`,
      source: 'auth',
      technicalDetail: `oauth-failure:${code}`,
      tone: 'error'
    });
  });

  test.each([null, undefined, '', 'something_new', 'constructor', '__proto__', 'toString'])(
    'falls back to the generic copy for %j and never echoes it to the player',
    (code) => {
      expect(resolveLegacyOAuthFailureClass(code)).toBe('generic');
      expect(resolveLegacyOAuthFailureCopy(code)).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic);
      const message = resolveLegacyOAuthFailureMessage(code);
      expect(message.copy).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic);
      expect(message.technicalDetail ?? '').not.toContain('constructor');
      expect(message.technicalDetail ?? '').not.toContain('__proto__');
      expect(message.technicalDetail ?? '').not.toContain('toString');
    }
  );

  // Auth Surface v2 transition: the generic row is the matrix line (Wave 3B) while the one-size constant in
  // legacyAccountPortal.ts (Wave 5C) follows in its own PR. Either the two are equal, or the constant is a known
  // earlier spelling that is shown as the generic row.
  test('the legacy one-size message is shown as the generic row', () => {
    expect(resolveLegacyOAuthCurrentFailureCopy(MAZER_OAUTH_SAFE_ERROR_MESSAGE)).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic);
    expect(isLegacyOAuthFailureCopy(MAZER_OAUTH_SAFE_ERROR_MESSAGE)).toBe(true);
  });

  test('every row is a shared copy-matrix line, worded for the one Sign in button', () => {
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY).toEqual({
      cancelled: AUTH_SURFACE_MESSAGES['mazer.cancelled'],
      connection: AUTH_SURFACE_MESSAGES['signin.callback'],
      contextLost: AUTH_SURFACE_MESSAGES['signin.callback'],
      generic: AUTH_SURFACE_MESSAGES['signin.unavailable'],
      providerUnreachable: AUTH_SURFACE_MESSAGES['signin.unavailable'],
      session: AUTH_SURFACE_MESSAGES['signin.session'],
      storage: AUTH_SURFACE_MESSAGES['mazer.storage'],
      timedOut: AUTH_SURFACE_MESSAGES['mazer.timeout']
    });
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.timedOut).toMatch(/took too long/i);
    for (const copy of Object.values(LEGACY_OAUTH_FAILURE_MESSAGE_COPY)) {
      expect(copy).not.toMatch(/Choose Sign in/);
    }
  });

  test('every earlier spelling of a row is shown as the row that replaced it', () => {
    const earlier: ReadonlyArray<readonly [string, LegacyOAuthFailureClass]> = [
      ['Account connection unavailable. Return to Mazer and try again.', 'generic'],
      ['Could not reach your account. Try again.', 'generic'],
      ['Sign-in did not finish. Choose Sign in to try again.', 'cancelled'],
      ['Mazer could not finish connecting to your account. Try again in a moment.', 'connection'],
      ['Sign-in came back to a different screen than where you started. Open Mazer from your home screen icon and try again.', 'contextLost'],
      ['Sign-in is unavailable right now. Try again in a few minutes.', 'providerUnreachable'],
      ['Your account could not be confirmed. Try signing in again.', 'session'],
      ['This browser is blocking what Mazer needs to sign in. Turn off private browsing or allow site data, then try again.', 'storage'],
      ['Sign-in took too long. Choose Sign in to start again.', 'timedOut']
    ];
    for (const [copy, expectedClass] of earlier) {
      expect(isLegacyOAuthFailureCopy(copy), copy).toBe(true);
      expect(resolveLegacyOAuthCurrentFailureCopy(copy), copy).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass]);
      expect(resolveLegacyAuthFeedbackMessage(copy, null, null)?.copy, copy).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass]);
    }
    // Current rows and unrelated text map to themselves.
    expect(resolveLegacyOAuthCurrentFailureCopy(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session)).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session);
    expect(resolveLegacyOAuthCurrentFailureCopy('constructor')).toBe('constructor');
    expect(isLegacyOAuthFailureCopy('toString')).toBe(false);
  });

  test('rows are sentence-shaped and free of provider or internal wording; only same-action classes share a line', () => {
    const rows = Object.entries(LEGACY_OAUTH_FAILURE_MESSAGE_COPY);
    // connection + contextLost (sign in again) and generic + providerUnreachable (outage) share a line on purpose.
    expect(new Set(rows.map(([, copy]) => copy)).size).toBe(rows.length - 2);
    const technical = /\b(supabase|oauth|pkce|jwt|rpc|http|https|token|code|state|verifier|exchange|callback|sessionstorage|exception|stack|undefined|null|nan)\b/i;
    for (const [key, copy] of rows) {
      expect(copy, `${key} must end as a sentence`).toMatch(/[.!?]$/);
      expect(technical.test(copy), `${key} leaks internal wording: ${copy}`).toBe(false);
      expect(copy, `${key} must not show an internal code`).not.toMatch(/[a-z]+_[a-z_]+/);
    }
  });

  test('the outage row tells the player what happened and what to do, in plain words', () => {
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.providerUnreachable).toBe(
      'Sign-in is unavailable right now. Try again in a minute.'
    );
    expect(resolveLegacyOAuthFailureMessage('provider_unreachable')).toMatchObject({
      durationMs: LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS,
      technicalDetail: 'oauth-failure:provider_unreachable',
      tone: 'error'
    });
  });

  test('every class except generic is reachable from an internal code', () => {
    const reached = new Set(EXPECTED_CLASS_BY_CODE.map(([code]) => resolveLegacyOAuthFailureClass(code)));
    const classes = Object.keys(LEGACY_OAUTH_FAILURE_MESSAGE_COPY).filter((key) => key !== 'generic');
    expect([...reached].sort()).toEqual([...classes].sort());
  });

  test('technical detail carries the internal code for diagnostics only', () => {
    expect(resolveLegacyOAuthFailureTechnicalDetail('invalid_state')).toBe('oauth-failure:invalid_state');
    expect(resolveLegacyOAuthFailureTechnicalDetail('brand_new')).toBe('oauth-failure:unmapped');
    expect(resolveLegacyOAuthFailureTechnicalDetail(null)).toBeNull();
    expect(resolveLegacyOAuthFailureTechnicalDetail('')).toBeNull();
    for (const [code] of EXPECTED_CLASS_BY_CODE) {
      expect(resolveLegacyOAuthFailureCopy(code)).not.toContain(code);
    }
  });

  test('isLegacyOAuthFailureCopy recognises only the class copy', () => {
    for (const copy of Object.values(LEGACY_OAUTH_FAILURE_MESSAGE_COPY)) {
      expect(isLegacyOAuthFailureCopy(copy)).toBe(true);
      expect(isLegacyOAuthFailureCopy(`  ${copy}\n`)).toBe(true);
    }
    expect(isLegacyOAuthFailureCopy('Failed to fetch')).toBe(false);
    expect(isLegacyOAuthFailureCopy('')).toBe(false);
    expect(isLegacyOAuthFailureCopy(null)).toBe(false);
  });

  test('auth feedback passes class copy through and attaches the code as technical detail', () => {
    for (const [code, expectedClass] of EXPECTED_CLASS_BY_CODE) {
      expect(resolveLegacyAuthFeedbackMessage(LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass], null, code))
        .toMatchObject({
          copy: LEGACY_OAUTH_FAILURE_MESSAGE_COPY[expectedClass],
          id: 'auth.feedback.error',
          technicalDetail: `oauth-failure:${code}`,
          tone: 'error'
        });
    }
    expect(resolveLegacyAuthFeedbackMessage(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic, null))
      .toMatchObject({ copy: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic, technicalDetail: null });
  });

  test('provider-shaped auth errors still resolve exactly as before', () => {
    expect(resolveLegacyAuthFeedbackMessage('Failed to fetch', null, 'invalid_state')).toMatchObject({
      technicalDetail: 'Failed to fetch'
    });
  });

  // MAZER-ACCT-014: boot paths that are not a callback failure. They keep the
  // plain generic copy and carry their own code in diagnostics only.
  test.each(['session_quarantined', 'session_read_failed', 'portal_navigation_failed'])(
    'boot failure code %s keeps generic copy and records its own code',
    (code) => {
      expect(resolveLegacyOAuthFailureClass(code)).toBe('generic');
      expect(resolveLegacyOAuthFailureCopy(code)).toBe(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic);
      expect(resolveLegacyOAuthFailureCopy(code)).not.toContain(code);
      expect(resolveLegacyOAuthFailureTechnicalDetail(code)).toBe(`oauth-failure:${code}`);
      expect(resolveLegacyOAuthFailureMessage(code)).toMatchObject({
        copy: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic,
        technicalDetail: `oauth-failure:${code}`
      });
      // The boot snapshot carries MAZER_OAUTH_SAFE_ERROR_MESSAGE (the generic row).
      const feedback = resolveLegacyAuthFeedbackMessage(MAZER_OAUTH_SAFE_ERROR_MESSAGE, null, code);
      expect(feedback).toMatchObject({
        copy: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic,
        id: 'auth.feedback.error',
        technicalDetail: `oauth-failure:${code}`
      });
      expect(feedback?.copy).not.toContain(code);
    }
  );

  test('quarantine and session-read failures are told apart in diagnostics', () => {
    const quarantined = resolveLegacyAuthFeedbackMessage(MAZER_OAUTH_SAFE_ERROR_MESSAGE, null, 'session_quarantined');
    const readFailed = resolveLegacyAuthFeedbackMessage(MAZER_OAUTH_SAFE_ERROR_MESSAGE, null, 'session_read_failed');
    expect(quarantined?.copy).toBe(readFailed?.copy);
    expect(quarantined?.technicalDetail).not.toBe(readFailed?.technicalDetail);
  });

  test('a provider-shaped session read error keeps its player copy and gains the code first', () => {
    const message = resolveLegacyAuthFeedbackMessage('Failed to fetch', null, 'session_read_failed');
    expect(message).toMatchObject({
      copy: AUTH_SURFACE_MESSAGES['signin.offline'],
      technicalDetail: 'oauth-failure:session_read_failed; Failed to fetch'
    });
    // No boot code: exactly as before.
    expect(resolveLegacyAuthFeedbackMessage('Failed to fetch', null)).toMatchObject({ technicalDetail: 'Failed to fetch' });
  });

  test('an unknown code is still recorded as unmapped, never echoed', () => {
    expect(resolveLegacyAuthFeedbackMessage(MAZER_OAUTH_SAFE_ERROR_MESSAGE, null, 'user@example.com'))
      .toMatchObject({ technicalDetail: 'oauth-failure:unmapped' });
  });

  // MAZER-ACCT-015: how long a sign-in failure stays readable.
  describe('sign-in failure message duration', () => {
    const wordCount = (copy: string): number => copy.trim().split(/\s+/).length;

    test('the floor is at least 6 s and a documented number', () => {
      expect(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS).toBe(8000);
      expect(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS).toBeGreaterThanOrEqual(6000);
    });

    test('every failure row can be read at 300 ms a word inside that floor', () => {
      for (const [key, copy] of Object.entries(LEGACY_OAUTH_FAILURE_MESSAGE_COPY)) {
        expect(wordCount(copy) * 300, `${key} is too long for the floor`).toBeLessThanOrEqual(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS);
      }
    });

    test('class messages, passed-through class copy and provider errors all use it', () => {
      for (const [code] of EXPECTED_CLASS_BY_CODE) {
        expect(resolveLegacyOAuthFailureMessage(code).durationMs).toBe(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS);
      }
      expect(resolveLegacyAuthFeedbackMessage(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost, null, 'invalid_state')?.durationMs)
        .toBe(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS);
      expect(resolveLegacyAuthFeedbackMessage('Failed to fetch', null)?.durationMs)
        .toBe(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS);
      expect(resolveLegacyAuthFeedbackMessage('Invalid login credentials', null)?.durationMs)
        .toBe(LEGACY_AUTH_FAILURE_MESSAGE_MIN_DURATION_MS);
    });

    test('success and info feedback keep the short default', () => {
      expect(resolveLegacyAuthFeedbackMessage(null, 'Account connected.')?.durationMs).toBe(2400);
    });
  });
});
