import { describe, expect, test } from 'vitest';
import {
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyOAuthFailureMessage,
  resolveLegacyOAuthFailureCopy
} from '../../src/legacy-runtime/legacyPlayerMessage';
import { LEGACY_AUTH_FAILURE_CODES } from '../../src/legacy-runtime/legacyAuthFailureCodes';
import { resolveLegacyAuthFailureCodeLine } from '../../src/legacy-runtime/legacyAuthFailureCodeLine';
import { resolveLegacyPlayerMessageToastFrame } from '../../src/legacy-runtime/legacyPlayerMessageToast';

// Every failure kind the auth snapshot can carry (legacyPlayerMessage.ts map).
const ALL_CODES = [
  'authorization_unavailable', 'cancelled', 'exchange_unavailable', 'expired_or_missing_state',
  'invalid_state', 'pending_expired', 'provider_unreachable', 'session_invalid',
  'storage_unavailable', 'portal_navigation_failed', 'session_quarantined', 'session_read_failed',
  'some_future_code'
];
const PERSONAL = 'Email address zac.private@example.com is invalid user 123e4567-e89b-12d3-a456-426614174000';

describe('auth failure code line', () => {
  test('known codes and the code constants are covered', () => {
    for (const code of Object.values(LEGACY_AUTH_FAILURE_CODES)) {
      expect(ALL_CODES).toContain(code);
    }
  });

  test.each(ALL_CODES)('code %s shows exactly one short code line and no personal data', (code) => {
    const shown = code === 'some_future_code' ? 'unmapped' : code;
    const viaOAuth = resolveLegacyOAuthFailureMessage(code);
    const viaFeedback = resolveLegacyAuthFeedbackMessage(resolveLegacyOAuthFailureCopy(code), null, code);
    const viaBootWithProviderText = resolveLegacyAuthFeedbackMessage(PERSONAL, null, code);
    for (const message of [viaOAuth, viaFeedback]) {
      expect(resolveLegacyAuthFailureCodeLine(message!)).toBe(`Code: ${shown}`);
    }
    const poisoned = resolveLegacyAuthFailureCodeLine(viaBootWithProviderText!);
    expect(poisoned === null || poisoned === `Code: ${shown}`).toBe(true);
    for (const line of [resolveLegacyAuthFailureCodeLine(viaOAuth!), poisoned]) {
      expect(line === null || /^Code: [a-z][a-z0-9_]*$/.test(line)).toBe(true);
      expect(line ?? '').not.toMatch(/@|example|123e4567|zac/i);
    }
  });

  test('credential and other failures without a code get no line', () => {
    const message = resolveLegacyAuthFeedbackMessage('Invalid login credentials for zac@example.com', null, null);
    expect(resolveLegacyAuthFailureCodeLine(message!)).toBeNull();
  });

  test('non-auth and non-error messages never get a line', () => {
    const detail = 'oauth-failure:cancelled';
    expect(resolveLegacyAuthFailureCodeLine({ source: 'system', technicalDetail: detail, tone: 'error' })).toBeNull();
    expect(resolveLegacyAuthFailureCodeLine({ source: 'auth', technicalDetail: detail, tone: 'success' })).toBeNull();
    expect(resolveLegacyAuthFailureCodeLine({ source: 'auth', technicalDetail: 'Code: x@y', tone: 'error' })).toBeNull();
  });

  test('toast row appends the line on its own row and stays narrow-viewport safe', () => {
    const queue = enqueueLegacyPlayerMessage([], resolveLegacyOAuthFailureMessage('cancelled'), 0, 1);
    const frame = resolveLegacyPlayerMessageToastFrame(queue, 1000, 320);
    expect(frame.rows[0]?.copy.endsWith('\nCode: cancelled')).toBe(true);
    expect(frame.rows[0]?.codeLine).toBe('Code: cancelled');
    expect(frame.maxWidth).toBeLessThanOrEqual(320 - 32);
    const plain = enqueueLegacyPlayerMessage([], createLegacyPlayerMessage({ copy: 'hi', id: 'x', source: 'system', tone: 'info' }), 0, 1);
    expect(resolveLegacyPlayerMessageToastFrame(plain, 1000, 320).rows[0]?.copy).toBe('hi');
  });
});
