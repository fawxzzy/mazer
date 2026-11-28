/**
 * Help screen (MAZER-ONB-001 family): the one place the Help form talks to the database.
 *
 * The DB side is mazer.mazer_submit_help_request_v1(p_email text, p_message text, p_build_id text, p_player_level
 * integer, p_game_mode text) (docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql, live). It is SECURITY
 * DEFINER, callable by `anon` and `authenticated` alike: a signed-out player calls it through the same shared client
 * without a session (the anon key), a signed-in player's JWT gives the server auth.uid() (never a parameter). It answers
 * {"status":"saved"} or {"status":"rate_limited","retry_after_seconds":n}. Errors (bare codes, never the row):
 * MAZER_HELP_BAD_EMAIL (22023), MAZER_HELP_MESSAGE_EMPTY (22023), MAZER_HELP_MESSAGE_TOO_LONG (22001); 55P03 (lock
 * timeout) and 23503 (a deleted account whose JWT still works) are generic failures.
 *
 * Every outcome becomes one HelpSubmitResult (src/ui/help/helpState.ts); the popup turns that into ONE calm in-flow
 * notice. Nothing here logs: the typed email and message never reach a console, telemetry or storage.
 */
import type { HelpSubmitPayload, HelpSubmitResult } from '../ui/help/helpState';
import { getLegacyAuthClient } from './legacyAuth';

export const LEGACY_HELP_RPC = 'mazer_submit_help_request_v1';

const BAD_EMAIL = 'MAZER_HELP_BAD_EMAIL';
const MESSAGE_EMPTY = 'MAZER_HELP_MESSAGE_EMPTY';
const MESSAGE_TOO_LONG = 'MAZER_HELP_MESSAGE_TOO_LONG';
const STRING_TOO_LONG_CODE = '22001';

export interface LegacyHelpRpcResponse {
  data?: unknown;
  error?: { code?: string | null; message?: string | null } | null;
}

/** Pure: a Supabase RPC response (or a thrown error) into the Help form's result vocabulary. */
export const resolveLegacyHelpRpcResult = (response: LegacyHelpRpcResponse): HelpSubmitResult => {
  const { data, error } = response;
  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    // 22023 carries two different reasons, so the message text decides (it is a bare code name, never user data).
    if (message.includes(BAD_EMAIL)) return { status: 'bad_email' };
    if (message.includes(MESSAGE_EMPTY)) return { status: 'message_empty' };
    if (message.includes(MESSAGE_TOO_LONG) || error.code === STRING_TOO_LONG_CODE) return { status: 'message_too_long' };
    // The browser's own "no network" wording (Chromium, WebKit, Firefox): offline, keep the draft.
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return { status: 'offline' };
    return { status: 'failed' };
  }
  if (data !== null && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    if (row.status === 'saved') return { status: 'saved' };
    if (row.status === 'rate_limited') {
      const wait = Number(row.retry_after_seconds);
      return { retryAfterSeconds: Number.isFinite(wait) && wait > 0 ? wait : 60, status: 'rate_limited' };
    }
  }
  return { status: 'failed' };
};

/** The RPC's named parameters are exactly the payload's keys (no user id: the server reads auth.uid()). */
export const buildLegacyHelpRpcArgs = (payload: HelpSubmitPayload): Record<string, unknown> => ({
  p_build_id: payload.p_build_id,
  p_email: payload.p_email,
  p_game_mode: payload.p_game_mode,
  p_message: payload.p_message,
  p_player_level: payload.p_player_level
});

const FIXTURE_RESULTS: Readonly<Record<string, HelpSubmitResult>> = Object.freeze({
  bad_email: { status: 'bad_email' },
  failed: { status: 'failed' },
  limited: { retryAfterSeconds: 1500, status: 'rate_limited' },
  offline: { status: 'offline' },
  saved: { status: 'saved' },
  too_long: { status: 'message_too_long' }
});

/**
 * DEV / TEST-ONLY. With ?runtimeDiagnostics=1&helpFixture=saved|limited|failed|offline|bad_email|too_long the wrapper
 * never reaches the network and answers the named shape (unknown names answer saved). A plain URL carries neither flag,
 * so a real player never takes this branch.
 */
export const resolveLegacyHelpFixtureResult = (search: string | null | undefined): HelpSubmitResult | null => {
  if (typeof search !== 'string' || search.length === 0) return null;
  const params = new URLSearchParams(search);
  const diagnostics = params.get('runtimeDiagnostics')?.trim().toLowerCase();
  const requested = params.get('helpFixture')?.trim().toLowerCase();
  if ((diagnostics !== '1' && diagnostics !== 'true') || requested === undefined || requested.length === 0) return null;
  return FIXTURE_RESULTS[requested] ?? FIXTURE_RESULTS.saved;
};

export interface LegacyHelpRpcClient {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<LegacyHelpRpcResponse>;
}

export interface LegacyHelpSubmitDeps {
  getClient?: () => Promise<LegacyHelpRpcClient | null>;
  isOnline?: () => boolean;
  search?: string;
}

/** Signed in or not: the same call (anon key without a session, the player's JWT with one). */
export const submitLegacyHelpRequest = async (
  payload: HelpSubmitPayload,
  deps: LegacyHelpSubmitDeps = {}
): Promise<HelpSubmitResult> => {
  const search = deps.search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const fixture = resolveLegacyHelpFixtureResult(search);
  if (fixture !== null) return fixture;
  const online = deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online()) return { status: 'offline' };
  try {
    const client = (await (deps.getClient ?? getLegacyAuthClient)()) as unknown as LegacyHelpRpcClient | null;
    if (!client) return { status: 'failed' };
    return resolveLegacyHelpRpcResult(await client.rpc(LEGACY_HELP_RPC, buildLegacyHelpRpcArgs(payload)));
  } catch (error) {
    return resolveLegacyHelpRpcResult({ error: { message: error instanceof Error ? error.message : '' } });
  }
};
