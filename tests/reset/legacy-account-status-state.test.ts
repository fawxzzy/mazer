import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_ACCOUNT_STATUS_COPY,
  LEGACY_ACCOUNT_STATUS_OPENING_TIMEOUT_MS,
  LEGACY_ACCOUNT_STATUS_SLOT_LINES,
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  resolveLegacyAccountStatus,
  resolveLegacyAccountStatusLayout,
  resolveLegacyAccountStatusNotice,
  resolveLegacyAuthLoadingCopy,
  shouldToastLegacyAuthFeedback
} from '../../src/legacy-runtime/legacyAccountStatusState';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';
import { LEGACY_AUTH_MESSAGE_COPY, LEGACY_OAUTH_FAILURE_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const base = { errorMessage: null, openingTimedOut: false, status: 'guest', submitting: false } as const;

describe('account failure fallback (MAZER-ACCT-043): the only account state Mazer draws', () => {
  // Auth Surface v2 (2026-11-15): kicker + title on every state, the lead or ONE notice in the reserved area, and the
  // single button reads "Sign in" (busy: "Signing in…"). Failure wording comes from the copy matrix.
  test('a failure shows the matrix line in the notice box and one enabled Sign in button', () => {
    expect(resolveLegacyAccountStatus({ ...base, errorMessage: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.cancelled })).toEqual({
      button: { disabled: false, label: 'Sign in' },
      kicker: 'MAZER',
      line: AUTH_SURFACE_MESSAGES['mazer.cancelled'],
      phase: 'failed',
      presentation: 'notice',
      title: 'Mazer',
      tone: 'error'
    });
  });

  test('every legacy failure row reaches the box as a matrix line, and unknown text never reaches it verbatim', () => {
    const matrix = new Set<string>(Object.values(AUTH_SURFACE_MESSAGES));
    const rows = [
      ...Object.values(LEGACY_OAUTH_FAILURE_MESSAGE_COPY),
      LEGACY_AUTH_MESSAGE_COPY.accountUnavailable,
      LEGACY_AUTH_MESSAGE_COPY.authUnavailable,
      LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured,
      LEGACY_AUTH_MESSAGE_COPY.networkUnavailable,
      MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      'provider said: invalid_grant (raw)'
    ];
    for (const row of rows) {
      const notice = resolveLegacyAccountStatusNotice(row);
      expect(notice !== null && matrix.has(notice), row).toBe(true);
    }
    expect(resolveLegacyAccountStatusNotice(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.timedOut)).toBe(AUTH_SURFACE_MESSAGES['mazer.timeout']);
    expect(resolveLegacyAccountStatusNotice(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.storage)).toBe(AUTH_SURFACE_MESSAGES['mazer.storage']);
    expect(resolveLegacyAccountStatusNotice(LEGACY_OAUTH_FAILURE_MESSAGE_COPY.session)).toBe(AUTH_SURFACE_MESSAGES['signin.session']);
    expect(resolveLegacyAccountStatusNotice(LEGACY_AUTH_MESSAGE_COPY.networkUnavailable)).toBe(AUTH_SURFACE_MESSAGES['signin.offline']);
    expect(resolveLegacyAccountStatusNotice('provider said: invalid_grant (raw)')).toBe(AUTH_SURFACE_MESSAGES['signin.unavailable']);
    expect(resolveLegacyAccountStatusNotice(AUTH_SURFACE_MESSAGES['signin.callback'])).toBe(AUTH_SURFACE_MESSAGES['signin.callback']);
    expect(resolveLegacyAccountStatusNotice('  ')).toBeNull();
  });

  test('an unavailable provider with no specific error shows the matrix outage line', () => {
    const model = resolveLegacyAccountStatus({ ...base, status: 'unavailable' });
    expect(model.line).toBe(AUTH_SURFACE_MESSAGES['signin.unavailable']);
    expect(model.phase).toBe('failed');
    expect(model.presentation).toBe('notice');
    expect(model.button).toEqual({ disabled: false, label: 'Sign in' });
  });

  test('signed out with no error shows the quiet lead (no notice box) and the same single button', () => {
    expect(resolveLegacyAccountStatus(base)).toEqual({
      button: { disabled: false, label: 'Sign in' },
      kicker: 'MAZER',
      line: 'Sign in to play.',
      phase: 'signed-out',
      presentation: 'lead',
      title: 'Mazer',
      tone: 'info'
    });
  });

  test('while the hand-off opens the button is disabled and says Signing in…; after the timeout it recovers', () => {
    expect(resolveLegacyAccountStatus({ ...base, submitting: true }).button).toEqual({ disabled: true, label: 'Signing in…' });
    const slow = resolveLegacyAccountStatus({ ...base, submitting: true, openingTimedOut: true });
    expect(slow.phase).toBe('opening-slow');
    expect(slow.button).toEqual({ disabled: false, label: 'Sign in' });
    expect(slow.line).toBe(LEGACY_ACCOUNT_STATUS_COPY.stillOpening);
    expect(slow.line).toBe(AUTH_SURFACE_MESSAGES['mazer.timeout']);
    expect(LEGACY_ACCOUNT_STATUS_OPENING_TIMEOUT_MS).toBe(10000);
  });

  test('a sign-in failure is not also toasted while signed out; info toasts and signed-in failures still are', () => {
    expect(shouldToastLegacyAuthFeedback({ tone: 'error' }, false)).toBe(false);
    expect(shouldToastLegacyAuthFeedback({ tone: 'error' }, true)).toBe(true);
    expect(shouldToastLegacyAuthFeedback({ tone: 'info' }, false)).toBe(true);
    expect(shouldToastLegacyAuthFeedback(null, true)).toBe(false);
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

  test('the stack never overlaps and the message area reserves three wrapped lines at every size', () => {
    for (const [width, height] of [[390, 844], [320, 568], [844, 390], [568, 320], [1280, 720]] as const) {
      for (const safeArea of [{}, { top: 47, bottom: 34 }]) {
        const layout = resolveLegacyAccountStatusLayout(width, height, safeArea);
        const where = `${width}x${height} ${JSON.stringify(safeArea)}`;
        const iconTop = layout.loader.centreY - (layout.loader.iconSizePx / 2);
        const iconBottom = layout.loader.centreY + (layout.loader.iconSizePx / 2);
        if (layout.kicker) {
          expect(layout.kicker.centreY + (layout.kicker.fontSizePx / 2), where).toBeLessThanOrEqual(iconTop);
        }
        expect(iconBottom, where).toBeLessThanOrEqual(layout.title.centreY - (layout.title.fontSizePx / 2));
        expect(layout.title.centreY + (layout.title.fontSizePx / 2), where).toBeLessThanOrEqual(layout.slot.top);
        expect(layout.slot.top + layout.slot.height, where).toBeLessThanOrEqual(layout.button.top);
        expect(layout.button.top + layout.button.height, where).toBeLessThanOrEqual(height - ((safeArea as { bottom?: number }).bottom ?? 0));
        expect(layout.slot.height, where).toBeGreaterThanOrEqual((LEGACY_ACCOUNT_STATUS_SLOT_LINES * layout.slot.lineHeightPx) + (2 * layout.slot.paddingY));
        expect(layout.slot.width, where).toBe(layout.columnWidth);
        expect(layout.slot.left, where).toBeGreaterThanOrEqual(0);
        expect(layout.slot.left + layout.slot.width, where).toBeLessThanOrEqual(width);
      }
    }
  });

  test('the button respects the bottom safe area', () => {
    const plain = resolveLegacyAccountStatusLayout(390, 844);
    const inset = resolveLegacyAccountStatusLayout(390, 844, { bottom: 34 });
    expect(inset.button.top + inset.button.height).toBeLessThan(plain.button.top + plain.button.height);
  });
});

describe('gate loading copy', () => {
  test('claims Signing in… only with evidence for it, else the neutral Opening Mazer…', () => {
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: false, hasSession: true })).toBe('Signing in…');
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: true, hasSession: false })).toBe('Signing in…');
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: true, callbackInProgress: false, hasSession: false })).toBe('Opening Mazer…');
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
