import type { SupabaseClient } from '@supabase/supabase-js';
import type { LegacyUsernameSaveFailureKind } from './legacyPlayerMessage';

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

export interface LegacyUsernameRpcError {
  code?: string | null;
  message?: string | null;
}

export const isLegacyProfileMissingError = (
  error: LegacyUsernameRpcError | null | undefined
): boolean => Boolean(error) && (
  error?.code === 'P0002'
  || (error?.message ?? '').includes('MAZER_PROFILE_MISSING')
);

const NETWORK_FRAGMENTS: readonly string[] = [
  'failed to fetch',
  'load failed',
  'network',
  'timeout',
  'timed out',
  'internet connection',
  'could not be found',
  'cannot connect'
];

/**
 * Maps a mazer_set_username failure to the kind of toast the player gets.
 * 23505 is the unique index (name taken), 22023 the server's own format check,
 * 28000 a stale session (the sign-in changed under the call), anything that
 * looks like connectivity is "try again", the rest is the generic sentence.
 */
export const classifyLegacyUsernameSaveError = (
  error: LegacyUsernameRpcError | null | undefined
): LegacyUsernameSaveFailureKind => {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  if (code === '23505' || message.includes('duplicate key')) {
    return 'taken';
  }
  if (code === '22023' || message.includes('mazer_username_invalid')) {
    return 'invalid';
  }
  if (code === '28000' || NETWORK_FRAGMENTS.some((fragment) => message.includes(fragment))) {
    return 'try-again';
  }
  return 'failed';
};
