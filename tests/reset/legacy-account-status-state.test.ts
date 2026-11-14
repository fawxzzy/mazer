import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_ACCOUNT_STATUS_COPY,
  LEGACY_ACCOUNT_STATUS_OPENING_TIMEOUT_MS,
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  resolveLegacyAccountStatus,
  resolveLegacyAccountStatusLayout,
  resolveLegacyAuthLoadingCopy
} from '../../src/legacy-runtime/legacyAccountStatusState';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const base = { errorMessage: null, openingTimedOut: false, status: 'guest', submitting: false } as const;

describe('account failure fallback (MAZER-ACCT-043): the only account state Mazer draws', () => {
  test('a failure shows the failure line and one enabled Try again button', () => {
    expect(resolveLegacyAccountStatus({ ...base, errorMessage: 'Sign-in did not finish. Choose Sign in to try again.' })).toEqual({
      button: { disabled: false, label: 'Try again' },
      line: 'Sign-in did not finish. Choose Sign in to try again.',
      phase: 'failed',
      tone: 'error'
    });
  });

  test('an unavailable provider with no specific error shows the generic connection line', () => {
    const model = resolveLegacyAccountStatus({ ...base, status: 'unavailable' });
    expect(model.line).toBe(MAZER_OAUTH_SAFE_ERROR_MESSAGE);
    expect(model.phase).toBe('failed');
    expect(model.button).toEqual({ disabled: false, label: 'Try again' });
  });

  test('an explicit sign-out (signed out, no error) is a quiet info line with the same single button', () => {
    expect(resolveLegacyAccountStatus(base)).toEqual({
      button: { disabled: false, label: 'Try again' },
      line: 'You are signed out.',
      phase: 'signed-out',
      tone: 'info'
    });
  });

  test('while the hand-off opens the button is disabled and says Opening; after the timeout it recovers', () => {
    expect(resolveLegacyAccountStatus({ ...base, submitting: true }).button).toEqual({ disabled: true, label: 'Opening…' });
    const slow = resolveLegacyAccountStatus({ ...base, submitting: true, openingTimedOut: true });
    expect(slow.phase).toBe('opening-slow');
    expect(slow.button).toEqual({ disabled: false, label: 'Try again' });
    expect(slow.line).toBe(LEGACY_ACCOUNT_STATUS_COPY.stillOpening);
    expect(LEGACY_ACCOUNT_STATUS_OPENING_TIMEOUT_MS).toBe(10000);
  });

  test('no sign-in, sign-up, create-account, password or privacy wording, and no guest or skip action', () => {
    const all = [
      resolveLegacyAccountStatus(base),
      resolveLegacyAccountStatus({ ...base, status: 'unavailable' }),
      resolveLegacyAccountStatus({ ...base, submitting: true }),
      resolveLegacyAccountStatus({ ...base, submitting: true, openingTimedOut: true })
    ].flatMap((model) => [model.line, model.button.label]).join('|').toLowerCase();
    for (const forbidden of ['create account', 'sign up', 'sign-up', 'password', 'email', 'guest', 'skip', 'privacy', 'terms']) {
      expect(all).not.toContain(forbidden);
    }
  });

  test('the button is one full-width bottom control at least 44px tall, below the loader icon and line', () => {
    for (const [width, height] of [[390, 844], [320, 568], [1280, 720]] as const) {
      const layout = resolveLegacyAccountStatusLayout(width, height);
      expect(layout.button.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(layout.button.width).toBe(layout.columnWidth);
      expect(layout.button.top).toBeGreaterThan(layout.loader.labelCentreY + 8);
      expect(layout.loader.centreX).toBe(width / 2);
      expect(layout.loader.centreY).toBe(height / 2);
    }
  });

  test('the button respects the bottom safe area', () => {
    const plain = resolveLegacyAccountStatusLayout(390, 844);
    const inset = resolveLegacyAccountStatusLayout(390, 844, { bottom: 34 });
    expect(inset.button.top + inset.button.height).toBeLessThan(plain.button.top + plain.button.height);
  });
});

describe('gate loading copy', () => {
  test('claims Signing you in only with evidence for it', () => {
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: false, hasSession: true })).toBe('Signing you in…');
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: true, hasSession: false })).toBe('Signing you in…');
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: false, hasSession: false })).toBe('Loading…');
  });
});

describe('the scene draws no account screen', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

  test('no credential form, recovery form, create-account or reset rail remains in MenuScene', () => {
    for (const gone of [
      'createAuthFieldBox',
      'createLegacyAuthNativeInput',
      'handleLegacyAuthSubmit',
      'buildPasswordRecoveryOverlay',
      'buildAuthenticatedAccountSection',
      'buildSharedAccountEntrySection',
      'signInLegacyAuth',
      'updateLegacyPassword',
      "'Create Account'",
      "'Reset Password'",
      'Privacy Policy',
      "'Welcome'"
    ]) {
      expect(scene, gone).not.toContain(gone);
    }
  });

  test('the fallback draws the loader icon, one status line and one retry button', () => {
    expect(scene).toContain('resolveLegacyAccountStatus({');
    expect(scene).toContain('drawLegacyAccountStatusIcon(layout.loader)');
    expect(scene).toContain('void this.handleSharedAccountAuthorization()');
  });
});
