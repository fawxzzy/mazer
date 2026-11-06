/**
 * Pure decision for the auth gate's very first frame.
 *
 * `MenuScene` used to start every cold boot with `authGateAwaitingResolution`
 * set, so even a first-time signed-out visitor saw the full-screen
 * `Signing you in…` loading cover for a beat before the Welcome screen. That
 * copy is a claim about a specific visitor, so the cover is now only raised
 * when there is evidence a session is actually being resolved:
 *
 *   - an OAuth callback is being consumed (`callbackInProgress`), or
 *   - the boot step already restored an authenticated account snapshot
 *     (`bootstrappedAuthenticated`), or
 *   - a persisted auth session exists to restore (`hasStoredSession`), or
 *   - the QA authenticated fixture route (`authFixtureRoute`) is resolving.
 *
 * Everyone else is a signed-out first-time visitor: no cover, the gate is
 * locked immediately and the Welcome screen is the first thing drawn.
 *
 * No Phaser, no network, no clock. Storage is only probed for the PRESENCE of
 * the shared auth session key; the stored value is never parsed or exposed.
 */
import { MAZER_OAUTH_AUTH_SESSION_KEY } from './legacyAccountPortal';

export interface LegacyAuthGateResolutionInput {
  /** The QA `authFixture=authenticated` route resolves a session on the first frames. */
  authFixtureRoute: boolean;
  /** Boot already restored an authenticated account snapshot (readLegacyBootstrappedAuthSnapshot). */
  bootstrappedAuthenticated: boolean;
  /**
   * An OAuth callback is mid-exchange. `main.ts` consumes and scrubs the
   * callback before the scene exists, so the scene normally passes `false`;
   * the accepted-callback case is carried by `hasStoredSession` instead.
   */
  callbackInProgress: boolean;
  /** A persisted shared-auth session exists in storage. */
  hasStoredSession: boolean;
}

export interface LegacyAuthGateInitialState {
  /** Raise the full-screen resolution cover (and hold the gate open). */
  awaitingResolution: boolean;
  /** Lock the gate immediately (first-time signed-out visitors). */
  locked: boolean;
}

export const shouldAwaitLegacyAuthResolution = ({
  authFixtureRoute,
  bootstrappedAuthenticated,
  callbackInProgress,
  hasStoredSession
}: LegacyAuthGateResolutionInput): boolean => (
  callbackInProgress || bootstrappedAuthenticated || hasStoredSession || authFixtureRoute
);

export const resolveLegacyAuthGateInitialState = (
  input: LegacyAuthGateResolutionInput
): LegacyAuthGateInitialState => {
  const awaitingResolution = shouldAwaitLegacyAuthResolution(input);
  return { awaitingResolution, locked: !awaitingResolution };
};

/**
 * True when the shared auth session key holds a non-empty value. Presence
 * only: the value is not parsed, returned or logged. Storage access that
 * throws (blocked/private mode) reads as "no stored session".
 */
export const hasLegacyStoredAuthSession = (
  storage: Pick<Storage, 'getItem'> | null | undefined,
  key: string = MAZER_OAUTH_AUTH_SESSION_KEY
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    const raw = storage.getItem(key);
    return typeof raw === 'string' && raw.length > 0;
  } catch {
    return false;
  }
};
