import type { LegacyAuthStatus } from './legacyAuth';

/**
 * Temporary product boundary while the authenticated entry flow is repaired.
 *
 * A guest is an existing local Mazer storage scope, not a shared Supabase
 * account. Keep this explicit and isolated so re-enabling account-required
 * play is one deliberate, reviewed change rather than another menu rewrite.
 */
export const LEGACY_GUEST_PLAY_ACCESS_ENABLED = true;

export const isLegacyPlayAccessAllowed = (status: LegacyAuthStatus): boolean => (
  LEGACY_GUEST_PLAY_ACCESS_ENABLED || status === 'authenticated'
);
