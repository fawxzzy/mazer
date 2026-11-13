/**
 * MAZER-ACCT-040: a signed-out launch goes straight to the account host's
 * sign-in page, with no Mazer sign-in screen in between.
 *
 * The hand-off itself is the one the Sign in button already runs
 * (`beginMazerOAuthAuthorization`: storage probe, provider pre-flight, PKCE
 * pending record, `location.assign` to the authorize URL). This module only
 * decides WHEN a boot may start it on its own, and records the two small
 * facts that keep that from becoming a loop or a trap:
 *
 *  - an in-flight attempt record (sessionStorage, one per tab/app session):
 *    after one automatic redirect, a return that is not a signed-in session
 *    (back button, cancelled login, host error page) lands on the Mazer
 *    fallback screen instead of redirecting again;
 *  - an explicit sign-out flag (localStorage): after the player chose
 *    Sign out in Mazer, launches stay on the Mazer screen with its Sign in
 *    button until the player signs in again. A launch must never silently
 *    sign the player straight back in after an explicit sign-out.
 *
 * Everything here is pure or storage-injected: no Phaser, no network, no
 * `window`. The browser wiring is src/boot/signedOutHandoffBoot.ts.
 */
import type {
  MazerOAuthBootResult,
  MazerOAuthFailureCategory
} from './legacyAccountPortal';

/** sessionStorage: `{ at: <epoch ms> }` written just before leaving for the host. */
export const MAZER_AUTO_HANDOFF_ATTEMPT_KEY = 'mazer.auth.auto-handoff-attempt.v1';
/** localStorage: `{ at: <epoch ms> }` written by an explicit Sign out in Mazer. */
export const MAZER_EXPLICIT_SIGN_OUT_KEY = 'mazer.auth.explicit-sign-out.v1';
/** `?autoSignIn=0` keeps the Mazer sign-in screen (QA of the fallback screen). */
export const MAZER_AUTO_HANDOFF_OPT_OUT_PARAM = 'autoSignIn';
/**
 * How long one automatic redirect counts as "still in flight". It matches the
 * PKCE pending record's lifetime (MAZER_OAUTH_PENDING_TTL_MS, 15 min): inside
 * that window a return without a session means the player backed out or the
 * host refused, so the fallback screen shows. That is deliberately stricter
 * than "one per 60 s": a player who cancels the host login and comes back two
 * minutes later is not bounced into it again.
 */
export const MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS = 900_000;
/**
 * If the navigation has not taken the page away after this long, the boot
 * continues to the Mazer fallback screen instead of sitting on the splash.
 */
export const MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS = 10_000;

export type MazerAutoHandoffStayReason =
  | 'opted-out'
  | 'localhost'
  | 'level-preview'
  | 'auth-fixture'
  | 'oauth-callback'
  | 'signed-in'
  | 'session-quarantined'
  | 'explicit-sign-out'
  | 'attempt-in-flight';

export interface MazerAutoHandoffDecisionInput {
  /** `?autoSignIn=0`. */
  optedOut: boolean;
  /** Local development: the canonical return URL would leave for production. */
  isLocalhost: boolean;
  /** `?previewLevel=N` (no account writes, no install gate). */
  levelPreviewRequested: boolean;
  /** QA `authFixture=authenticated` route. */
  authFixtureRoute: boolean;
  /** The URL carried an OAuth callback (success, denial or malformed). */
  oauthCallbackRequested: boolean;
  /** A persisted shared-auth session exists (presence only). */
  hasStoredSession: boolean;
  /** A session commit is held in quarantine; the scene recovers and reports it. */
  sessionQuarantined: boolean;
  /** The player chose Sign out in Mazer and has not signed in since. */
  explicitSignOut: boolean;
  /** An automatic redirect already left inside the attempt window. */
  attemptInFlight: boolean;
}

export type MazerAutoHandoffDecision =
  | { action: 'redirect' }
  | { action: 'stay'; reason: MazerAutoHandoffStayReason };

/**
 * First matching reason wins; the order is the contract (pinned by tests):
 * a signed-in launch never redirects, whatever else is true.
 */
export const decideMazerAutoHandoff = (input: MazerAutoHandoffDecisionInput): MazerAutoHandoffDecision => {
  if (input.hasStoredSession) {
    return { action: 'stay', reason: 'signed-in' };
  }
  if (input.oauthCallbackRequested) {
    return { action: 'stay', reason: 'oauth-callback' };
  }
  if (input.optedOut) {
    return { action: 'stay', reason: 'opted-out' };
  }
  if (input.isLocalhost) {
    return { action: 'stay', reason: 'localhost' };
  }
  if (input.levelPreviewRequested) {
    return { action: 'stay', reason: 'level-preview' };
  }
  if (input.authFixtureRoute) {
    return { action: 'stay', reason: 'auth-fixture' };
  }
  if (input.sessionQuarantined) {
    return { action: 'stay', reason: 'session-quarantined' };
  }
  if (input.explicitSignOut) {
    return { action: 'stay', reason: 'explicit-sign-out' };
  }
  if (input.attemptInFlight) {
    return { action: 'stay', reason: 'attempt-in-flight' };
  }
  return { action: 'redirect' };
};

export const isMazerAutoHandoffOptedOut = (search: string): boolean => (
  new URLSearchParams(search).get(MAZER_AUTO_HANDOFF_OPT_OUT_PARAM) === '0'
);

// ---------------------------------------------------------------------------
// Storage records (every access is guarded: blocked storage reads as "nothing")

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

const readRecordTime = (storage: ReadableStorage | null | undefined, key: string): number | null => {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(key);
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    const parsed = JSON.parse(raw) as { at?: unknown } | null;
    return typeof parsed?.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
  } catch {
    return null;
  }
};

const writeRecord = (storage: WritableStorage | null | undefined, key: string, nowMs: number): boolean => {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify({ at: nowMs }));
    return true;
  } catch {
    return false;
  }
};

const clearRecord = (storage: Pick<Storage, 'removeItem'> | null | undefined, key: string): void => {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Blocked storage: nothing to clear.
  }
};

/**
 * True while an automatic redirect left less than the window ago. A record
 * dated in the future (clock moved) counts as in flight: it fails closed
 * toward the fallback screen, never toward a loop.
 */
export const isMazerAutoHandoffAttemptInFlight = (
  sessionStorage: ReadableStorage | null | undefined,
  nowMs: number
): boolean => {
  const at = readRecordTime(sessionStorage, MAZER_AUTO_HANDOFF_ATTEMPT_KEY);
  return at !== null && !(nowMs - at >= MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS);
};

export const recordMazerAutoHandoffAttempt = (
  sessionStorage: WritableStorage | null | undefined,
  nowMs: number
): boolean => writeRecord(sessionStorage, MAZER_AUTO_HANDOFF_ATTEMPT_KEY, nowMs);

export const clearMazerAutoHandoffAttempt = (
  sessionStorage: Pick<Storage, 'removeItem'> | null | undefined
): void => clearRecord(sessionStorage, MAZER_AUTO_HANDOFF_ATTEMPT_KEY);

export const isMazerExplicitSignOutRecorded = (
  localStorage: ReadableStorage | null | undefined
): boolean => readRecordTime(localStorage, MAZER_EXPLICIT_SIGN_OUT_KEY) !== null;

export const recordMazerExplicitSignOut = (
  localStorage: WritableStorage | null | undefined,
  nowMs: number
): boolean => writeRecord(localStorage, MAZER_EXPLICIT_SIGN_OUT_KEY, nowMs);

export const clearMazerExplicitSignOut = (
  localStorage: Pick<Storage, 'removeItem'> | null | undefined
): void => clearRecord(localStorage, MAZER_EXPLICIT_SIGN_OUT_KEY);

// ---------------------------------------------------------------------------
// Orchestration (dependencies injected; the browser binding supplies them)

export interface MazerSignedOutHandoffDeps {
  authFixtureRoute: boolean;
  /** Starts the existing OAuth hand-off (beginMazerOAuthAuthorization). */
  begin(): Promise<MazerOAuthBootResult>;
  hasStoredSession: boolean;
  isLocalhost: boolean;
  levelPreviewRequested: boolean;
  localStorage: WritableStorage | null;
  now(): number;
  oauthCallbackRequested: boolean;
  optedOut: boolean;
  /** Hands a pre-navigation failure to the scene's held failure line. */
  recordFailure(category: MazerOAuthFailureCategory): void;
  sessionQuarantined: boolean;
  sessionStorage: WritableStorage | null;
}

export type MazerSignedOutHandoffResult =
  | { status: 'navigating' }
  | { status: 'stay'; reason: MazerAutoHandoffStayReason }
  | { status: 'failed'; category: MazerOAuthFailureCategory };

export const runMazerSignedOutHandoff = async (
  deps: MazerSignedOutHandoffDeps
): Promise<MazerSignedOutHandoffResult> => {
  if (deps.hasStoredSession) {
    // Signed in: any earlier sign-out intent or attempt is settled.
    clearMazerExplicitSignOut(deps.localStorage);
    clearMazerAutoHandoffAttempt(deps.sessionStorage);
  }
  const nowMs = deps.now();
  const decision = decideMazerAutoHandoff({
    attemptInFlight: isMazerAutoHandoffAttemptInFlight(deps.sessionStorage, nowMs),
    authFixtureRoute: deps.authFixtureRoute,
    explicitSignOut: isMazerExplicitSignOutRecorded(deps.localStorage),
    hasStoredSession: deps.hasStoredSession,
    isLocalhost: deps.isLocalhost,
    levelPreviewRequested: deps.levelPreviewRequested,
    oauthCallbackRequested: deps.oauthCallbackRequested,
    optedOut: deps.optedOut,
    sessionQuarantined: deps.sessionQuarantined
  });
  if (decision.action === 'stay') {
    return { status: 'stay', reason: decision.reason };
  }

  // Written BEFORE leaving: once the page is gone nothing else can write it.
  // When storage is blocked the redirect is not started at all: without the
  // record the guard could not stop a loop.
  if (!recordMazerAutoHandoffAttempt(deps.sessionStorage, nowMs)) {
    return { status: 'stay', reason: 'attempt-in-flight' };
  }
  let result: MazerOAuthBootResult;
  try {
    result = await deps.begin();
  } catch {
    result = { category: 'authorization_unavailable', status: 'failed' };
  }
  if (result.status === 'failed') {
    // Nothing left the page, so nothing is in flight: the next launch (offline,
    // service back up) tries again, and the fallback screen shows the failure.
    clearMazerAutoHandoffAttempt(deps.sessionStorage);
    deps.recordFailure(result.category);
    return { status: 'failed', category: result.category };
  }
  return { status: 'navigating' };
};
