/**
 * A sign-in started from the menu profile icon continues to the shared account
 * page once the callback is consumed, before Phaser exists, so the menu is never
 * drawn in between. The decision (and the fixed destination) lives in
 * legacy-runtime/legacyAccountPortal.ts `resolveMazerOAuthContinuationUrl`.
 *
 * Same leave-or-continue rule as the signed-out hand-off: if the browser never
 * navigates, boot goes on after a bound and the player lands on the signed-in
 * menu. Coming back from the account page through the back/forward cache
 * (pageshow persisted) also goes on at once instead of waiting out the bound.
 */
import {
  installMazerOAuthPageShowRecovery,
  resolveMazerOAuthContinuationUrl,
  type MazerOAuthBootResult,
  type MazerOAuthPageLifecycle
} from '../legacy-runtime/legacyAccountPortal';
import { MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS } from '../legacy-runtime/legacySignedOutHandoff';

export interface MazerOAuthContinuationBootDeps {
  assign(url: string): void;
  clearTimer(handle: ReturnType<typeof setTimeout>): void;
  lifecycle: MazerOAuthPageLifecycle;
  markRedirecting(): void;
  setTimer(handler: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
}

export type MazerOAuthContinuationBootOutcome = 'stayed' | 'left';

/**
 * Resolves 'stayed' at once when there is nowhere to continue (or the
 * navigation threw), and 'left' once the bound passes or the page is restored
 * from the back/forward cache; boot continues either way.
 */
export const runMazerOAuthContinuationAtBoot = async (
  result: MazerOAuthBootResult,
  deps: MazerOAuthContinuationBootDeps
): Promise<MazerOAuthContinuationBootOutcome> => {
  const destination = resolveMazerOAuthContinuationUrl(result);
  if (destination === null) {
    return 'stayed';
  }
  deps.markRedirecting();
  try {
    deps.assign(destination);
  } catch {
    return 'stayed';
  }
  await new Promise<void>((resolve) => {
    let removePageShow: (() => void) | null = null;
    const finish = (): void => {
      deps.clearTimer(timer);
      removePageShow?.();
      resolve();
    };
    const timer = deps.setTimer(finish, MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS);
    removePageShow = installMazerOAuthPageShowRecovery(deps.lifecycle, finish);
  });
  return 'left';
};
