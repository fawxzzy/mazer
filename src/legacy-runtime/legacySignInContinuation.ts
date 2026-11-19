/**
 * Which control started a sign-in, for the one case that changes where it ends:
 * a signed-out tap on the menu profile icon continues to the shared account
 * page after the callback (as a signed-in tap does), instead of the menu.
 *
 * The profile icon and the Login button both dispatch the same UI bridge
 * command (NAVIGATE account), whose shape is a frozen contract. Rather than
 * widen it, the profile icon runs its dispatch inside `withMazerSignInContinuation`
 * and the sign-in start reads `readMazerSignInContinuation()` synchronously in
 * the same call stack. The value is scoped to that call: nothing is stored, so a
 * later Login tap, leaderboard sign-in or boot hand-off can never inherit it.
 */
import type { MazerOAuthContinuation } from './legacyAccountPortal';

let scopedContinuation: MazerOAuthContinuation | null = null;

export const withMazerSignInContinuation = <T>(
  continuation: MazerOAuthContinuation,
  run: () => T
): T => {
  const previous = scopedContinuation;
  scopedContinuation = continuation;
  try {
    return run();
  } finally {
    scopedContinuation = previous;
  }
};

export const readMazerSignInContinuation = (): MazerOAuthContinuation | null => scopedContinuation;
