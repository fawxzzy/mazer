import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';
import {
  MAZER_AUTH_RETURN_NOTICE_CATEGORY,
  MAZER_AUTH_RETURN_NOTICE_COPY,
  MAZER_AUTH_RETURN_NOTICE_PARAM,
  captureAndScrubMazerAuthReturnNotice,
  parseMazerAuthReturnNotice,
  type MazerAuthReturnNotice
} from '../../src/legacy-runtime/legacyAuthReturnNotice';
import {
  readMazerOAuthBootResult,
  recordMazerOAuthBootFailure
} from '../../src/legacy-runtime/legacyAccountPortal';
import {
  resolveLegacyAuthFeedbackMessage,
  resolveLegacyOAuthFailureCopy
} from '../../src/legacy-runtime/legacyPlayerMessage';
import { resolveLegacyAccountStatus } from '../../src/legacy-runtime/legacyAccountStatusState';
import { decideMazerAutoHandoff, runMazerSignedOutHandoff } from '../../src/legacy-runtime/legacySignedOutHandoff';

const NOTICES: readonly MazerAuthReturnNotice[] = ['expired', 'unavailable'];

const locationFor = (href: string) => {
  const url = new URL(href);
  return { hash: url.hash, pathname: url.pathname, search: url.search };
};

describe('parseMazerAuthReturnNotice (closed key)', () => {
  test('reads exactly the two values the account host sends', () => {
    expect(MAZER_AUTH_RETURN_NOTICE_PARAM).toBe('notice');
    expect(parseMazerAuthReturnNotice('?notice=expired')).toBe('expired');
    expect(parseMazerAuthReturnNotice('?notice=unavailable')).toBe('unavailable');
    expect(parseMazerAuthReturnNotice('?runtimeDiagnostics=1&notice=expired')).toBe('expired');
  });

  test('ignores unknown, empty, repeated, case-shifted and padded values', () => {
    for (const search of [
      '',
      '?notice=',
      '?notice=callback',
      '?notice=Expired',
      '?notice=expired%20',
      '?notice=expired&notice=expired',
      '?notice=expired&notice=unavailable',
      '?notices=expired',
      '?error=expired',
      '?notice=%3Cscript%3E'
    ]) {
      expect(parseMazerAuthReturnNotice(search), search).toBeNull();
    }
  });
});

describe('captureAndScrubMazerAuthReturnNotice (address bar)', () => {
  test('returns the notice and strips the key, keeping other query keys and the hash', () => {
    const history = { replaceState: vi.fn() };
    expect(captureAndScrubMazerAuthReturnNotice(
      locationFor('https://mazer.fawxzzy.com/?notice=expired'),
      history
    )).toBe('expired');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');

    const kept = { replaceState: vi.fn() };
    expect(captureAndScrubMazerAuthReturnNotice(
      locationFor('https://mazer.fawxzzy.com/?runtimeDiagnostics=1&notice=unavailable#top'),
      kept
    )).toBe('unavailable');
    expect(kept.replaceState).toHaveBeenCalledWith(null, '', '/?runtimeDiagnostics=1#top');
  });

  test('an unknown or repeated value shows nothing but is still stripped', () => {
    for (const href of [
      'https://mazer.fawxzzy.com/?notice=whatever',
      'https://mazer.fawxzzy.com/?notice=expired&notice=unavailable'
    ]) {
      const history = { replaceState: vi.fn() };
      expect(captureAndScrubMazerAuthReturnNotice(locationFor(href), history), href).toBeNull();
      expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
    }
  });

  test('a URL without the key is left alone', () => {
    const history = { replaceState: vi.fn() };
    expect(captureAndScrubMazerAuthReturnNotice(
      locationFor('https://mazer.fawxzzy.com/?runtimeDiagnostics=1'),
      history
    )).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  test('with a callback on the same URL the key is stripped and ignored', () => {
    const history = { replaceState: vi.fn() };
    expect(captureAndScrubMazerAuthReturnNotice(
      locationFor('https://mazer.fawxzzy.com/?notice=expired'),
      history,
      { ignore: true }
    )).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });
});

describe('notice copy (Auth Surface v2 matrix)', () => {
  test('expired shows the callback line, unavailable the outage line', () => {
    expect(MAZER_AUTH_RETURN_NOTICE_COPY.expired).toBe(AUTH_SURFACE_MESSAGES['signin.callback']);
    expect(MAZER_AUTH_RETURN_NOTICE_COPY.unavailable).toBe(AUTH_SURFACE_MESSAGES['signin.unavailable']);
  });

  test.each(NOTICES)('%s: the recorded boot category resolves to the same line in the status box', (notice) => {
    const category = MAZER_AUTH_RETURN_NOTICE_CATEGORY[notice];
    const copy = resolveLegacyOAuthFailureCopy(category);
    expect(copy).toBe(MAZER_AUTH_RETURN_NOTICE_COPY[notice]);

    // The boot result is what readLegacyAuthSessionSnapshot turns into the snapshot error.
    recordMazerOAuthBootFailure(category);
    expect(readMazerOAuthBootResult()).toEqual({ category, status: 'failed' });

    const feedback = resolveLegacyAuthFeedbackMessage(copy, null, category);
    expect(feedback?.copy).toBe(MAZER_AUTH_RETURN_NOTICE_COPY[notice]);

    const model = resolveLegacyAccountStatus({
      errorMessage: feedback?.copy ?? null,
      openingTimedOut: false,
      status: 'guest',
      submitting: false
    });
    expect(model).toMatchObject({ line: MAZER_AUTH_RETURN_NOTICE_COPY[notice], phase: 'failed', presentation: 'notice' });
  });
});

describe('a notice return never leaves for the account host again', () => {
  test('decision: return-notice stays, a signed-in launch still wins', () => {
    const base = {
      attemptInFlight: false,
      authFixtureRoute: false,
      explicitSignOut: false,
      hasStoredSession: false,
      isLocalhost: false,
      levelPreviewRequested: false,
      oauthCallbackRequested: false,
      optedOut: false,
      sessionQuarantined: false
    };
    expect(decideMazerAutoHandoff({ ...base, returnNoticeRequested: true }))
      .toEqual({ action: 'stay', reason: 'return-notice' });
    expect(decideMazerAutoHandoff({ ...base, hasStoredSession: true, returnNoticeRequested: true }))
      .toEqual({ action: 'stay', reason: 'signed-in' });
    expect(decideMazerAutoHandoff(base)).toEqual({ action: 'redirect' });
  });

  test('orchestration: begin is not called and the held failure is not overwritten', async () => {
    const begin = vi.fn(async () => ({ status: 'none' as const }));
    const recordFailure = vi.fn();
    await expect(runMazerSignedOutHandoff({
      authFixtureRoute: false,
      begin,
      hasStoredSession: false,
      isLocalhost: false,
      levelPreviewRequested: false,
      localStorage: null,
      now: () => 1_800_000_000_000,
      oauthCallbackRequested: false,
      optedOut: false,
      recordFailure,
      returnNoticeRequested: true,
      sessionQuarantined: false,
      sessionStorage: null
    })).resolves.toEqual({ status: 'stay', reason: 'return-notice' });
    expect(begin).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });
});

describe('boot wiring (src/boot/main.ts)', () => {
  const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8').replace(/\r\n/g, '\n');
  const bootBody = mainSource.slice(mainSource.indexOf('const boot = async'));

  test('the notice is read and scrubbed synchronously at boot start, after the callback scrub', () => {
    const callbackScrub = bootBody.indexOf('captureAndScrubMazerOAuthCallback(window.location, window.history)');
    const noticeScrub = bootBody.indexOf('captureAndScrubMazerAuthReturnNotice(window.location, window.history, { ignore: oauthCallbackRequested })');
    const firstAwait = bootBody.indexOf('await ');
    expect(callbackScrub).toBeGreaterThan(-1);
    expect(noticeScrub).toBeGreaterThan(callbackScrub);
    expect(noticeScrub).toBeLessThan(firstAwait);
    expect(bootBody).toContain('recordMazerOAuthBootFailure(MAZER_AUTH_RETURN_NOTICE_CATEGORY[authReturnNotice]);');
  });

  test('the automatic hand-off is told about the notice', () => {
    expect(bootBody).toContain('await runMazerSignedOutHandoffAtBoot(oauthCallbackRequested, authReturnNotice !== null);');
  });
});
