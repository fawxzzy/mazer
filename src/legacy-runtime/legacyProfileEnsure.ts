import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Accounts created on the shared account host (Mazer's Create Account is an
 * OAuth hand-off) never fire the Mazer sign-up trigger, so they have no
 * mazer_profiles row. mazer_ensure_profile (SECURITY DEFINER, EXECUTE for
 * authenticated only, idempotent) creates the caller's own row with a
 * generated Mazer-###### handle, or returns the existing username. Direct
 * inserts into mazer_profiles do not work (username and username_origin are
 * NOT NULL and direct writes are revoked), which is why this exists.
 *
 * Pure of Phaser and the DOM. Never throws: every outcome is a result object
 * so a failure can only ever land in diagnostics, never break sign-in.
 */
export const LEGACY_ENSURE_PROFILE_RPC = 'mazer_ensure_profile';

const ENSURE_FAILED_DETAIL = 'mazer_ensure_profile_failed';

export interface LegacyProfileEnsureResult {
  error: string | null;
  ok: boolean;
  username: string | null;
}

export type LegacyProfileEnsureClient = Pick<SupabaseClient, 'rpc'>;

export const ensureLegacyRemoteProfile = async (
  client: LegacyProfileEnsureClient,
  userId: string,
  displayName: string | null | undefined
): Promise<LegacyProfileEnsureResult> => {
  try {
    const trimmedName = typeof displayName === 'string' ? displayName.trim() : '';
    const { data, error } = await client.rpc(LEGACY_ENSURE_PROFILE_RPC, {
      p_display_name: trimmedName.length > 0 ? trimmedName : null,
      p_expected_user_id: userId
    });
    if (error) {
      return { error: error.message || ENSURE_FAILED_DETAIL, ok: false, username: null };
    }
    return { error: null, ok: true, username: typeof data === 'string' ? data : null };
  } catch (thrown) {
    return {
      error: thrown instanceof Error && thrown.message ? thrown.message : ENSURE_FAILED_DETAIL,
      ok: false,
      username: null
    };
  }
};

/**
 * One ensure attempt per user per scope (the settings write path keeps its own
 * scope), so a persistent server failure can never turn into a request loop.
 * Memory only: a page reload is a fresh attempt, which is the retry.
 */
const attemptedScopes = new Map<string, Set<string>>();

export const claimLegacyProfileEnsureAttempt = (scope: string, userId: string): boolean => {
  let users = attemptedScopes.get(scope);
  if (!users) {
    users = new Set<string>();
    attemptedScopes.set(scope, users);
  }
  if (users.has(userId)) {
    return false;
  }
  users.add(userId);
  return true;
};

export const resetLegacyProfileEnsureAttemptsForTests = (): void => {
  attemptedScopes.clear();
};

