/**
 * MAZER-FB-001: the one place the in-game feedback popup talks to the database.
 *
 * The DB side is mazer.mazer_submit_feedback_v1(p_rating integer, p_comment text, p_build_id text, p_player_level
 * integer, p_game_mode text, p_source text) (docs/ops/sql-proposals/mazer-feedback-20261124-v2/apply.sql). It is
 * SECURITY DEFINER, signed-in only (EXECUTE is granted to `authenticated`), takes the user id from auth.uid() (never a
 * parameter) and answers either {"status":"saved"} or {"status":"rate_limited","retry_after_seconds":n}. Errors:
 * MAZER_FEEDBACK_NOT_SIGNED_IN (28000), MAZER_FEEDBACK_BAD_RATING (22023), MAZER_FEEDBACK_COMMENT_TOO_LONG (22001).
 * The client is the shared auth client (getLegacyAuthClient), already bound to the `mazer` schema, the same as every
 * other Mazer RPC (legacyLeaderboard.ts).
 *
 * Every outcome becomes one FeedbackSubmitResult; the popup turns that into ONE calm in-flow notice (never red text).
 * A rate limit is never an error to the player. A generic failure never loses the draft.
 */
import type { FeedbackSubmitPayload, FeedbackSubmitResult } from '../ui/feedback/feedbackState';
import {
  getLegacyAuthClient,
  isLegacyRuntimeDiagnosticsAuthFixtureSnapshot,
  type LegacyAuthSessionSnapshot
} from './legacyAuth';

export const LEGACY_FEEDBACK_RPC = 'mazer_submit_feedback_v1';

const NOT_SIGNED_IN_CODE = '28000';
const NOT_SIGNED_IN_MESSAGE = 'MAZER_FEEDBACK_NOT_SIGNED_IN';

export interface LegacyFeedbackRpcResponse {
  data?: unknown;
  error?: { code?: string | null; message?: string | null } | null;
}

/** Pure: a Supabase RPC response (or a thrown error) into the popup's result vocabulary. */
export const resolveLegacyFeedbackRpcResult = (response: LegacyFeedbackRpcResponse): FeedbackSubmitResult => {
  const { data, error } = response;
  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    if (error.code === NOT_SIGNED_IN_CODE || message.includes(NOT_SIGNED_IN_MESSAGE)) {
      return { status: 'signed_out' };
    }
    // The browser's own "no network" wording (Chromium, WebKit, Firefox): treat as offline, keep the draft.
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
      return { status: 'offline' };
    }
    return { status: 'failed' };
  }
  if (data !== null && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    if (row.status === 'saved') {
      return { status: 'saved' };
    }
    if (row.status === 'rate_limited') {
      const wait = Number(row.retry_after_seconds);
      return { retryAfterSeconds: Number.isFinite(wait) && wait > 0 ? wait : 60, status: 'rate_limited' };
    }
  }
  return { status: 'failed' };
};

/** The RPC's named parameters are exactly the payload's keys. */
export const buildLegacyFeedbackRpcArgs = (payload: FeedbackSubmitPayload): Record<string, unknown> => ({
  p_build_id: payload.p_build_id,
  p_comment: payload.p_comment,
  p_game_mode: payload.p_game_mode,
  p_player_level: payload.p_player_level,
  p_rating: payload.p_rating,
  p_source: payload.p_source
});

const FIXTURE_RESULTS: Readonly<Record<string, FeedbackSubmitResult>> = Object.freeze({
  failed: { status: 'failed' },
  limited: { retryAfterSeconds: 1500, status: 'rate_limited' },
  offline: { status: 'offline' },
  saved: { status: 'saved' },
  signed_out: { status: 'signed_out' }
});

/**
 * DEV / TEST-ONLY. With the provider-inert authenticated diagnostics fixture
 * (?runtimeDiagnostics=1&authFixture=authenticated) there is no real session, so the wrapper never reaches the
 * network: it answers `saved`, or the shape named by &feedbackFixture=saved|failed|limited|offline|signed_out. A real
 * account never takes this branch (the snapshot check) and a plain URL carries none of the flags.
 */
export const resolveLegacyFeedbackFixtureResult = (search: string | null | undefined): FeedbackSubmitResult | null => {
  if (typeof search !== 'string' || search.length === 0) {
    return null;
  }
  const params = new URLSearchParams(search);
  const diagnostics = params.get('runtimeDiagnostics')?.trim().toLowerCase();
  if ((diagnostics !== '1' && diagnostics !== 'true') || params.get('authFixture')?.trim().toLowerCase() !== 'authenticated') {
    return null;
  }
  const requested = params.get('feedbackFixture')?.trim().toLowerCase() ?? 'saved';
  return FIXTURE_RESULTS[requested] ?? FIXTURE_RESULTS.saved;
};

export interface LegacyFeedbackRpcClient {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<LegacyFeedbackRpcResponse>;
}

export interface LegacyFeedbackSubmitDeps {
  getClient?: () => Promise<LegacyFeedbackRpcClient | null>;
  isOnline?: () => boolean;
  search?: string;
}

export const submitLegacyFeedback = async (
  payload: FeedbackSubmitPayload,
  authSnapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  deps: LegacyFeedbackSubmitDeps = {}
): Promise<FeedbackSubmitResult> => {
  if (authSnapshot.status !== 'authenticated') {
    return { status: 'signed_out' };
  }
  if (isLegacyRuntimeDiagnosticsAuthFixtureSnapshot(authSnapshot)) {
    const search = deps.search ?? (typeof window === 'undefined' ? '' : window.location.search);
    return resolveLegacyFeedbackFixtureResult(search) ?? { status: 'failed' };
  }
  const online = deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online()) {
    return { status: 'offline' };
  }
  try {
    const client = (await (deps.getClient ?? getLegacyAuthClient)()) as unknown as LegacyFeedbackRpcClient | null;
    if (!client) {
      return { status: 'failed' };
    }
    return resolveLegacyFeedbackRpcResult(await client.rpc(LEGACY_FEEDBACK_RPC, buildLegacyFeedbackRpcArgs(payload)));
  } catch (error) {
    return resolveLegacyFeedbackRpcResult({ error: { message: error instanceof Error ? error.message : '' } });
  }
};
