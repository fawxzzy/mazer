import type { LegacyAuthStatus } from './legacyAuth';

/**
 * Temporary product boundary while the authenticated entry flow is repaired.
 *
 * A guest is an existing local Mazer storage scope, not a shared Supabase
 * account. Keep this explicit and isolated so re-enabling account-required
 * play is one deliberate, reviewed change rather than another menu rewrite.
 */
export const LEGACY_GUEST_PLAY_ACCESS_ENABLED = false;

export interface LegacyPlayAccessState {
  authResolved: boolean;
  guestPlayGranted: boolean;
}

/**
 * Play must never be inferred merely because guest play is enabled. The feature
 * flag makes the local guest action available; it does not grant entry until a
 * player chooses that action after the auth snapshot has resolved.
 */
export const isLegacyPlayAccessAllowed = (
  status: LegacyAuthStatus,
  { authResolved }: LegacyPlayAccessState
): boolean => (
  authResolved
  && status === 'authenticated'
);
