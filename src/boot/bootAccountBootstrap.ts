/**
 * Bounded wrapper for the pre-game remote account bootstrap. The bootstrap
 * (remote progression/settings fetch + completion-outbox replay) used to be
 * awaited with no deadline before Phaser was created, so a slow or hung
 * Supabase call left the player on a blank page. The game now starts on the
 * cached / guest account state when the bootstrap is slow or fails; a
 * bootstrap that finishes late keeps running and hydrates in the background
 * exactly as it already does for later auth transitions.
 */

export const MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS = 4000;

export type MazerAccountBootstrapOutcome = 'completed' | 'timed-out' | 'failed';

export interface BoundedAccountBootstrapOptions {
  bootstrap: () => Promise<unknown>;
  timeoutMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Receives the failure so boot can log it; boot itself continues. */
  onFailure?: (error: unknown) => void;
}

export const runBoundedAccountBootstrap = (
  options: BoundedAccountBootstrapOptions
): Promise<MazerAccountBootstrapOutcome> => {
  const timeoutMs = options.timeoutMs ?? MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return new Promise<MazerAccountBootstrapOutcome>((resolve) => {
    let settled = false;
    let timerHandle: unknown;

    const settle = (outcome: MazerAccountBootstrapOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimer(timerHandle);
      resolve(outcome);
    };

    timerHandle = setTimer(() => settle('timed-out'), timeoutMs);

    let pending: Promise<unknown>;
    try {
      pending = options.bootstrap();
    } catch (error) {
      options.onFailure?.(error);
      settle('failed');
      return;
    }

    pending.then(
      () => settle('completed'),
      (error: unknown) => {
        // After a timeout this is the late rejection of an abandoned
        // bootstrap: still consumed here so it is never an unhandled rejection.
        if (!settled) {
          options.onFailure?.(error);
        }
        settle('failed');
      }
    );
  });
};
