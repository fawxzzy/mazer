/**
 * MAZER-ACCT-040 browser binding: a signed-out launch leaves for the account
 * host's sign-in page during the HTML splash, before Phaser exists, so the
 * Mazer sign-in screen is never drawn. The decision logic and storage records
 * live in legacy-runtime/legacySignedOutHandoff.ts.
 *
 * Called from main.ts after the OAuth callback was consumed and the install
 * gate resolved (an uninstalled browser tab never gets here), before the
 * account bootstrap. The signed-in check is one synchronous storage read, so a
 * signed-in launch pays nothing and never redirects.
 */
import {
  beginMazerOAuthAuthorization,
  isMazerOAuthSessionQuarantined,
  recordMazerOAuthBootFailure
} from '../legacy-runtime/legacyAccountPortal';
import { hasLegacyStoredAuthSession } from '../legacy-runtime/legacyAuthGateResolution';
import { isLegacyLevelPreviewRoute } from '../legacy-runtime/legacyLevelPreview';
import { isLegacyRuntimeDiagnosticsAuthFixtureRoute } from '../legacy-runtime/legacyRemoteProgression';
import { clearMazerHostSignOutAttempt } from '../legacy-runtime/legacyHostSignOut';
import {
  MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS,
  isMazerAutoHandoffOptedOut,
  runMazerSignedOutHandoff
} from '../legacy-runtime/legacySignedOutHandoff';
import { markMazerBootStatus } from './bootStatus';

const LOCAL_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '::1'];

const safeStorage = (read: () => Storage): Storage | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

/**
 * Resolves `continue` when boot should go on to build the game (signed in,
 * bypassed, failed before leaving, or the navigation never took the page
 * away); it stays pending while the page is leaving.
 */
export const runMazerSignedOutHandoffAtBoot = async (
  oauthCallbackRequested: boolean
): Promise<'continue'> => {
  const localStorage = safeStorage(() => window.localStorage);
  const hasStoredSession = hasLegacyStoredAuthSession(localStorage);
  if (hasStoredSession) {
    // MAZER-ACCT-042: signed in again, so the next explicit Sign out may leave for the host once more.
    clearMazerHostSignOutAttempt(safeStorage(() => window.sessionStorage));
  }
  const result = await runMazerSignedOutHandoff({
    authFixtureRoute: isLegacyRuntimeDiagnosticsAuthFixtureRoute(window.location.search),
    begin: async () => {
      markMazerBootStatus('shared-account-redirect');
      return beginMazerOAuthAuthorization();
    },
    hasStoredSession,
    isLocalhost: LOCAL_HOSTNAMES.includes(window.location.hostname),
    levelPreviewRequested: isLegacyLevelPreviewRoute(window.location.search),
    localStorage,
    now: () => Date.now(),
    oauthCallbackRequested,
    optedOut: isMazerAutoHandoffOptedOut(window.location.search),
    recordFailure: recordMazerOAuthBootFailure,
    sessionQuarantined: isMazerOAuthSessionQuarantined(),
    sessionStorage: safeStorage(() => window.sessionStorage)
  });
  if (result.status === 'navigating') {
    // The page is on its way out: keep the splash up (no Mazer screen flash).
    // A browser that never navigates must not strand the player there.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS);
    });
  }
  return 'continue';
};
