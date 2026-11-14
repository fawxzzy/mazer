/**
 * MAZER-ACCT-020 / MAZER-ACCT-030 (client half): a username read back from stored account metadata is untrusted.
 *
 * The account site stored some usernames longer than the 15-character limit because its metadata write bypassed
 * validation. The rename flow and the database check constraint enforce `LEGACY_USERNAME_PATTERN`, but the sign-in
 * snapshot used to copy `user_metadata.username` straight into `canonicalUsername` (header label, leaderboard
 * identity). A stored value that fails the pattern is now treated as "no username": callers fall back to the
 * generated or email-derived display name, and the player can pick a valid one in the leaderboard editor.
 *
 * This module never rewrites or shortens a stored name (no data change); it only refuses to present an invalid one.
 */
export const LEGACY_STORED_USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,15}$/;

export const sanitizeStoredLegacyUsername = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return LEGACY_STORED_USERNAME_PATTERN.test(trimmed) ? trimmed : null;
};

/** True when a non-empty stored value exists but is not a valid username (over the limit, bad characters). */
export const isInvalidStoredLegacyUsername = (raw: unknown): boolean =>
  typeof raw === 'string' && raw.trim().length > 0 && sanitizeStoredLegacyUsername(raw) === null;
