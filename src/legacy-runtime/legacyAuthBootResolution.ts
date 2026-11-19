/**
 * Boot-time resolution of a STORED account session when the provider is slow or briefly unreachable.
 *
 * The defect (reproduced headless with a mocked stored session, no QA fixture): a phone that resumes with a stale
 * access token asks the provider for a refresh while the radio is still waking. auth-js retries that refresh for
 * about 30 s and `getSession()` does not return until it gives up. For all that time `authGateAwaitingResolution`
 * is true, so the full-screen "Signing you in" shield swallows every tap (tap-anywhere cannot start a run, the
 * profile icon is dead); when `getSession()` finally returns `{ session: null, error }` the snapshot becomes a
 * GUEST one, the gate locks and the player is shown the sign-in screen even though the stored session is intact
 * (it was never removed: auth-js keeps the session on a retryable refresh failure).
 *
 * Rules implemented here (pure; no Phaser, no network, no storage access of its own):
 *   1. The boot read of the session is bounded (LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS). Past it, the boot snapshot
 *      is the stored session's identity; the real read keeps running and auth-js announces the outcome through
 *      onAuthStateChange as before (TOKEN_REFRESHED confirms it, SIGNED_OUT drops it).
 *   2. A `getSession()` result that is "no session + a retryable transport error" while a stored session still
 *      exists is NOT a sign-out: the stored identity stands. A definitive answer (no error, a non-retryable error,
 *      or no stored session) keeps today's behaviour exactly.
 *
 * The stored identity is only what the browser already holds; it grants nothing the stored session did not
 * (every remote call still uses the provider token, and the provider re-check at boot / resume still drops a
 * session the provider has revoked).
 */

/** Longest the boot "Signing you in" shield may wait for `getSession()` (auth-js alone can take about 30 s). */
export const LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS = 6_000;

export type LegacyAuthSessionReadRace<T> =
  | { status: 'read'; value: T }
  | { status: 'timed-out' };

export interface LegacyAuthBootTimers {
  clear: (handle: unknown) => void;
  set: (callback: () => void, ms: number) => unknown;
}

const DEFAULT_TIMERS: LegacyAuthBootTimers = {
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  set: (callback, ms) => setTimeout(callback, ms)
};

/**
 * Resolves with the read, or `timed-out` once the deadline passes. The read is never cancelled (auth-js owns it);
 * its late result or rejection is consumed here so it can never be an unhandled rejection. A rejection BEFORE the
 * deadline propagates, so the caller's existing catch (session_read_failed) keeps working.
 */
export const raceLegacyAuthSessionRead = <T>(
  read: Promise<T>,
  timeoutMs: number = LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS,
  timers: LegacyAuthBootTimers = DEFAULT_TIMERS
): Promise<LegacyAuthSessionReadRace<T>> => new Promise((resolve, reject) => {
  let settled = false;
  const handle = timers.set(() => {
    if (settled) {
      return;
    }
    settled = true;
    resolve({ status: 'timed-out' });
  }, timeoutMs);
  read.then(
    (value) => {
      if (settled) {
        return;
      }
      settled = true;
      timers.clear(handle);
      resolve({ status: 'read', value });
    },
    (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      timers.clear(handle);
      reject(error);
    }
  );
});

/**
 * auth-js reports a network failure / 5xx / throttle on a token refresh as an `AuthRetryableFetchError` (status 0 or
 * 5xx; Mazer's own refresh adapter answers 503 for every retryable case) and keeps the stored session in that case.
 * Anything else (including a bare `{ message }`) is not treated as transient.
 */
export const isLegacyAuthTransientSessionReadError = (error: unknown): boolean => {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { name?: unknown; status?: unknown };
  if (candidate.name === 'AuthRetryableFetchError') {
    return true;
  }
  return typeof candidate.status === 'number'
    && (candidate.status === 0 || candidate.status === 408 || candidate.status === 429 || candidate.status >= 500);
};

export type LegacyAuthBootReadOutcome =
  | { kind: 'timed-out' }
  | { kind: 'read'; hasSession: boolean; error: unknown };

/**
 * True when the boot snapshot should be the stored session's identity instead of what `getSession()` produced.
 * `hasStoredSession` is whether a parseable stored session exists RIGHT NOW (checked after the read, because a
 * definitive removal by auth-js deletes it).
 */
export const shouldUseStoredLegacyAuthSession = (
  outcome: LegacyAuthBootReadOutcome,
  hasStoredSession: boolean
): boolean => {
  if (!hasStoredSession) {
    return false;
  }
  if (outcome.kind === 'timed-out') {
    return true;
  }
  return !outcome.hasSession && isLegacyAuthTransientSessionReadError(outcome.error);
};
