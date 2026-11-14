/**
 * MAZER-ACCT-042 (part 3): Mazer's explicit Sign out also ends the account-host session.
 *
 * Owner decision (2026-11-13, "mazer sign out ends session? idk u choose" -> YES): after Mazer's local sign-out has
 * completed, the app navigates ONCE to the account host's sign-out endpoint, which ends the shared host session and
 * redirects back to Mazer:
 *
 *   https://account.fawxzzy.com/signout?returnTo=https%3A%2F%2Fmazer.fawxzzy.com%2F
 *
 * (the FawxzzyWeb lane adds the endpoint; `returnTo` is allowlisted to the Mazer origin only). Mazer then boots
 * signed out with the explicit-sign-out flag still set, so it lands on the Mazer fallback screen with its Sign in
 * button (legacySignedOutHandoff.ts, unchanged).
 *
 * Guard rails, all pinned by tests/reset/legacy-host-sign-out.test.ts:
 *  - FEATURE CHECK, two layers. (1) `MAZER_HOST_SIGN_OUT_ENABLED` is the kill switch. (2) A capability ping before
 *    leaving, per the FawxzzyWeb contract: `HEAD https://account.fawxzzy.com/signout/ping` with `mode: 'cors'`,
 *    `credentials: 'omit'` (the host answers 204 with `Access-Control-Allow-Origin: https://mazer.fawxzzy.com`).
 *    204 = the endpoint is live, go. 404 (or any other status), a network failure, a CORS failure or the
 *    3 s timeout = fall back to the previous behaviour: local sign-out only, the player sits on the signed-out
 *    screen, nothing is stuck. The ping carries no cookies and ends nothing; only the navigation does.
 *  - LOOP GUARD: one navigation per 15 minutes (the PKCE pending TTL used by the sign-in loop guard). The record is
 *    written to sessionStorage BEFORE leaving and cleared when a launch sees a stored session, so sign in -> Sign out
 *    -> sign in -> Sign out works every time but a bounce-back can never loop. Blocked storage = no navigation.
 *  - Only a REAL local sign-out qualifies: the explicit-sign-out flag must be recorded (a failed Sign out and the QA
 *    auth fixture never write it), the snapshot must not be authenticated, and local development never leaves the
 *    dev server for production.
 *
 * Pure or dependency-injected: no Phaser, no `window` reads except in `runMazerHostSignOutInBrowser`.
 */
import {
  MAZER_ACCOUNT_PORTAL_ORIGIN,
  MAZER_CANONICAL_RETURN_URL
} from './legacyAccountPortal';
import {
  MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS,
  isMazerExplicitSignOutRecorded
} from './legacySignedOutHandoff';

/** Kill switch: set to false to ship Mazer without the host sign-out (local sign-out only, as before). */
export const MAZER_HOST_SIGN_OUT_ENABLED = true;
export const MAZER_HOST_SIGN_OUT_PATH = '/signout';
/** The capability ping (FawxzzyWeb): HEAD, CORS, credential-less; 204 means the sign-out endpoint is live. */
export const MAZER_HOST_SIGN_OUT_PING_PATH = '/signout/ping';
/** sessionStorage: `{ at: <epoch ms> }` written just before leaving for the host sign-out. */
export const MAZER_HOST_SIGN_OUT_ATTEMPT_KEY = 'mazer.auth.host-signout-attempt.v1';
export const MAZER_HOST_SIGN_OUT_ATTEMPT_WINDOW_MS = MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS;
/** How long the endpoint probe may take; a slow or dead host must not hold the sign-out screen. */
export const MAZER_HOST_SIGN_OUT_PROBE_TIMEOUT_MS = 3_000;
/** If the navigation has not taken the page away after this long, the screen is released (matches the sign-in hand-off). */
export const MAZER_HOST_SIGN_OUT_NAVIGATION_TIMEOUT_MS = 10_000;

export const buildMazerHostSignOutPingUrl = (): string => (
  new URL(MAZER_HOST_SIGN_OUT_PING_PATH, MAZER_ACCOUNT_PORTAL_ORIGIN).toString()
);

export const buildMazerHostSignOutUrl = (): string => {
  const url = new URL(MAZER_HOST_SIGN_OUT_PATH, MAZER_ACCOUNT_PORTAL_ORIGIN);
  url.searchParams.set('returnTo', MAZER_CANONICAL_RETURN_URL);
  return url.toString();
};

export type MazerHostSignOutSkipReason =
  | 'disabled'
  | 'still-authenticated'
  | 'no-explicit-sign-out'
  | 'localhost'
  | 'attempt-in-flight'
  | 'storage-unavailable'
  | 'endpoint-unreachable'
  | 'endpoint-missing'
  | 'navigation-failed';

export type MazerHostSignOutResult =
  | { status: 'navigating' }
  | { status: 'skipped'; reason: MazerHostSignOutSkipReason };

export type MazerHostSignOutProbeResult = 'live' | 'missing' | 'unreachable';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

const readAttemptAt = (storage: ReadableStorage | null | undefined): number | null => {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY);
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    const parsed = JSON.parse(raw) as { at?: unknown } | null;
    return typeof parsed?.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
  } catch {
    return null;
  }
};

/** True while a host sign-out navigation left less than the window ago (a future-dated record fails closed). */
export const isMazerHostSignOutAttemptInFlight = (
  sessionStorage: ReadableStorage | null | undefined,
  nowMs: number
): boolean => {
  const at = readAttemptAt(sessionStorage);
  return at !== null && !(nowMs - at >= MAZER_HOST_SIGN_OUT_ATTEMPT_WINDOW_MS);
};

const recordAttempt = (sessionStorage: WritableStorage | null | undefined, nowMs: number): boolean => {
  if (!sessionStorage) {
    return false;
  }
  try {
    sessionStorage.setItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY, JSON.stringify({ at: nowMs }));
    return true;
  } catch {
    return false;
  }
};

export const clearMazerHostSignOutAttempt = (
  sessionStorage: Pick<Storage, 'removeItem'> | null | undefined
): void => {
  if (!sessionStorage) {
    return;
  }
  try {
    sessionStorage.removeItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
};

export interface MazerHostSignOutProbeDeps {
  fetch(input: string, init: RequestInit): Promise<{ status: number }>;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * The capability ping. Never throws. 204 = `live`; any other status (404 = endpoint not deployed) = `missing`;
 * a rejected fetch (offline, DNS, CORS failure) or the timeout = `unreachable`.
 */
export const probeMazerHostSignOutEndpoint = async (
  deps: MazerHostSignOutProbeDeps,
  url: string = buildMazerHostSignOutPingUrl()
): Promise<MazerHostSignOutProbeResult> => {
  let timer: unknown = null;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = deps.setTimeout(() => resolve('timeout'), MAZER_HOST_SIGN_OUT_PROBE_TIMEOUT_MS);
  });
  try {
    const answer = await Promise.race([
      deps.fetch(url, { cache: 'no-store', credentials: 'omit', method: 'HEAD', mode: 'cors' }),
      timeout
    ]);
    if (answer === 'timeout') {
      return 'unreachable';
    }
    return answer.status === 204 ? 'live' : 'missing';
  } catch {
    return 'unreachable';
  } finally {
    deps.clearTimeout(timer);
  }
};

export interface MazerHostSignOutDeps {
  /** Status of the snapshot the local sign-out returned. */
  authStatus: string;
  enabled?: boolean;
  isLocalhost: boolean;
  localStorage: ReadableStorage | null;
  navigate(url: string): void;
  now(): number;
  probe(): Promise<MazerHostSignOutProbeResult>;
  sessionStorage: WritableStorage | null;
}

/**
 * Call right after a local Sign out finished. Resolves `navigating` when the page is on its way to the host
 * (the caller keeps the screen busy until it leaves), or `skipped` with the reason when the previous behaviour
 * (local sign-out only) stands.
 */
export const runMazerHostSignOut = async (deps: MazerHostSignOutDeps): Promise<MazerHostSignOutResult> => {
  if (deps.enabled === false) {
    return { status: 'skipped', reason: 'disabled' };
  }
  if (deps.authStatus === 'authenticated') {
    return { status: 'skipped', reason: 'still-authenticated' };
  }
  if (!isMazerExplicitSignOutRecorded(deps.localStorage)) {
    return { status: 'skipped', reason: 'no-explicit-sign-out' };
  }
  if (deps.isLocalhost) {
    return { status: 'skipped', reason: 'localhost' };
  }
  const nowMs = deps.now();
  if (isMazerHostSignOutAttemptInFlight(deps.sessionStorage, nowMs)) {
    return { status: 'skipped', reason: 'attempt-in-flight' };
  }
  const probed = await deps.probe();
  if (probed !== 'live') {
    return { status: 'skipped', reason: probed === 'missing' ? 'endpoint-missing' : 'endpoint-unreachable' };
  }
  // Written BEFORE leaving: once the page is gone nothing else can write it. Blocked storage = no navigation,
  // because without the record nothing could stop a loop.
  if (!recordAttempt(deps.sessionStorage, nowMs)) {
    return { status: 'skipped', reason: 'storage-unavailable' };
  }
  try {
    deps.navigate(buildMazerHostSignOutUrl());
  } catch {
    clearMazerHostSignOutAttempt(deps.sessionStorage);
    return { status: 'skipped', reason: 'navigation-failed' };
  }
  return { status: 'navigating' };
};

const LOCAL_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '::1', '[::1]'];

const safeStorage = (read: () => Storage): Storage | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

/** Browser binding used by the Options "Sign out" action. Never throws. */
export const runMazerHostSignOutInBrowser = async (authStatus: string): Promise<MazerHostSignOutResult> => {
  if (typeof window === 'undefined') {
    return { status: 'skipped', reason: 'localhost' };
  }
  try {
    return await runMazerHostSignOut({
      authStatus,
      enabled: MAZER_HOST_SIGN_OUT_ENABLED,
      isLocalhost: LOCAL_HOSTNAMES.includes(window.location.hostname),
      localStorage: safeStorage(() => window.localStorage),
      navigate: (url) => window.location.assign(url),
      now: () => Date.now(),
      probe: () => probeMazerHostSignOutEndpoint({
        clearTimeout: (handle) => window.clearTimeout(handle as number),
        fetch: (input, init) => window.fetch(input, init),
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs)
      }),
      sessionStorage: safeStorage(() => window.sessionStorage)
    });
  } catch {
    return { status: 'skipped', reason: 'endpoint-unreachable' };
  }
};
