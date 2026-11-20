/**
 * MAZER-UI-100 browser binding for `?accountAction=signed-out` (the account page's Sign out handed back to Mazer;
 * the parse, scrub and referrer check live in legacy-runtime/legacyAccountActionHandoff.ts).
 *
 * The account-host session is already gone, so this only ends Mazer's own session: the ordinary LOCAL sign-out
 * (signOutLegacyAuth, which also records the explicit sign-out) and never the host sign-out bounce. With no stored
 * Mazer session it still records the explicit sign-out, so the launch stays on the Mazer sign-in screen instead of
 * auto-sending the player straight back to the host sign-in they just left. Runs before the signed-out hand-off
 * decision (main.ts), never throws.
 */
import { signOutLegacyAuth } from '../legacy-runtime/legacyAuth';
import { hasLegacyStoredAuthSession } from '../legacy-runtime/legacyAuthGateResolution';
import { recordMazerExplicitSignOut } from '../legacy-runtime/legacySignedOutHandoff';

export interface MazerAccountSignedOutBootDeps {
  hasStoredSession: () => boolean;
  now: () => number;
  recordExplicitSignOut: (atMs: number) => void;
  signOutLocally: () => Promise<unknown>;
}

export const runMazerAccountSignedOutAtBoot = async (deps: MazerAccountSignedOutBootDeps): Promise<void> => {
  try {
    if (deps.hasStoredSession()) {
      await deps.signOutLocally();
    }
  } catch {
    // A failed local sign-out keeps the stored session; the player can still sign out from the account page again.
  }
  try {
    deps.recordExplicitSignOut(deps.now());
  } catch {
    // Storage blocked: the launch may hand off to the host sign-in once, which is harmless.
  }
};

const safeLocalStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const runMazerAccountSignedOutAtBootInBrowser = (): Promise<void> => runMazerAccountSignedOutAtBoot({
  hasStoredSession: () => hasLegacyStoredAuthSession(safeLocalStorage()),
  now: () => Date.now(),
  recordExplicitSignOut: (atMs) => recordMazerExplicitSignOut(safeLocalStorage() ?? undefined, atMs),
  signOutLocally: () => signOutLegacyAuth()
});
