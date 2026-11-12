import { describe, expect, test } from 'vitest';
import {
  LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
  isLegacyOAuthFailureCopy,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyOAuthFailureClass,
  resolveLegacyOAuthFailureCopy,
  resolveLegacyOAuthFailureMessage,
  resolveLegacyOAuthFailureTechnicalDetail,
  type LegacyOAuthFailureClass
} from '../../src/legacy-runtime/legacyPlayerMessage';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE } from '../../src/legacy-runtime/legacyAccountPortal';

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
  ['storage_unavailable', 'storage']
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

  test('the generic row equals the legacy one-size message', () => {
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic).toBe(MAZER_OAUTH_SAFE_ERROR_MESSAGE);
  });

  test('required player wording is present', () => {
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.timedOut).toMatch(/took too long/i);
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost).toMatch(/different screen/i);
    expect(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost).toMatch(/home screen icon/i);
  });

  test('rows are unique, sentence-shaped and free of provider or internal wording', () => {
    const rows = Object.entries(LEGACY_OAUTH_FAILURE_MESSAGE_COPY);
    expect(new Set(rows.map(([, copy]) => copy)).size).toBe(rows.length);
    const technical = /\b(supabase|oauth|pkce|jwt|rpc|http|https|token|code|state|verifier|exchange|callback|sessionstorage|exception|stack|undefined|null|nan)\b/i;
    for (const [key, copy] of rows) {
      expect(copy, `${key} must end as a sentence`).toMatch(/[.!?]$/);
      expect(technical.test(copy), `${key} leaks internal wording: ${copy}`).toBe(false);
      expect(copy, `${key} must not show an internal code`).not.toMatch(/[a-z]+_[a-z_]+/);
    }
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
});
