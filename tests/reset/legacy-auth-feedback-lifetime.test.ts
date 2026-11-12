import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS,
  isLegacyAuthSignInFailure,
  resolveLegacyAuthFeedbackExpiresAtMs
} from '../../src/legacy-runtime/legacyAuthFeedbackLifetime';
import { LEGACY_OAUTH_FAILURE_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE } from '../../src/legacy-runtime/legacyAccountPortal';

// MAZER-ACCT-015. Measured 2026-11-12 (headless Chromium, 390x844, unmodified
// scene): a boot-time failure stayed 5015 ms (fixed 5000 ms timer) and a failure
// from tapping Login stayed 17 ms (one frame: the path never armed the timer).
// Chosen behaviour: a sign-in failure stays until the next attempt.

const NOW = 12_345;

describe('sign-in failure line lifetime', () => {
  test('every class sentence, with or without a code, stays until the next attempt', () => {
    for (const copy of Object.values(LEGACY_OAUTH_FAILURE_MESSAGE_COPY)) {
      expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: copy, info: null })).toBe(Number.POSITIVE_INFINITY);
      expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: copy, errorCode: 'invalid_state', info: null }))
        .toBe(Number.POSITIVE_INFINITY);
    }
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: MAZER_OAUTH_SAFE_ERROR_MESSAGE, info: null }))
      .toBe(Number.POSITIVE_INFINITY);
  });

  test('a boot path failure with provider text and a code stays until the next attempt', () => {
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, {
      error: 'Failed to fetch',
      errorCode: 'session_read_failed',
      info: null
    })).toBe(Number.POSITIVE_INFINITY);
  });

  test('other feedback keeps the short timer, and nothing to show returns -Infinity', () => {
    expect(LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS).toBe(5000);
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: null, info: 'Account connected.' }))
      .toBe(NOW + LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS);
    // Form validation text has no code and is not a class sentence.
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: 'Enter an email.', info: null }))
      .toBe(NOW + LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS);
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: null, info: null })).toBe(Number.NEGATIVE_INFINITY);
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, { error: '  ', info: '' })).toBe(Number.NEGATIVE_INFINITY);
  });

  test('a signed-in player never gets a held failure', () => {
    expect(isLegacyAuthSignInFailure({
      authenticated: true,
      error: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session,
      errorCode: 'session_invalid',
      info: null
    })).toBe(false);
    expect(resolveLegacyAuthFeedbackExpiresAtMs(NOW, {
      authenticated: true,
      error: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session,
      errorCode: 'session_invalid',
      info: null
    })).toBe(NOW + LEGACY_AUTH_INFO_FEEDBACK_DURATION_MS);
  });

  test('a held failure is not expired by the scene check at any later time', () => {
    const expiresAt = resolveLegacyAuthFeedbackExpiresAtMs(NOW, {
      error: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost,
      errorCode: 'invalid_state',
      info: null
    });
    // MenuScene.expireLegacyPlayerMessages clears when `time >= expiresAt`.
    for (const later of [NOW, NOW + 5_001, NOW + 60_000, NOW + 3_600_000]) {
      expect(later >= expiresAt).toBe(false);
    }
  });
});

describe('scene wiring', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

  test('the fixed 5000 ms constant is gone and the arm path uses the lifetime resolver', () => {
    expect(scene).not.toContain('LEGACY_AUTH_BOTTOM_FEEDBACK_DURATION_MS');
    const start = scene.indexOf('private armLegacyAuthFeedbackMessage');
    const body = scene.slice(start, scene.indexOf('private clearLegacyAuthFeedbackMessage'));
    expect(body).toContain('resolveLegacyAuthFeedbackExpiresAtMs(this.time.now');
  });

  test('a failed Login tap arms the failure line (it used to clear on the next frame) and a new attempt clears the old one', () => {
    const start = scene.indexOf('private async handleSharedAccountAuthorization');
    const body = scene.slice(start, scene.indexOf('private openOverlay'));
    const failure = body.slice(body.indexOf("if (result.status === 'failed')"));
    expect(failure).toContain('errorCode: result.category');
    expect(failure).toContain('this.armLegacyAuthFeedbackMessage();');
    expect(body.slice(0, body.indexOf('beginMazerOAuthAuthorization()'))).toContain('this.clearLegacyAuthFeedbackMessage();');
  });
});
