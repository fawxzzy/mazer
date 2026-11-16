/**
 * Recheck the signed-in account with the provider on load and when the page comes back.
 *
 * Why: after the account portal's "Sign out everywhere" (a provider-side global sign-out) Mazer kept looking signed in
 * until its access token expired (about an hour): nothing re-asked the provider, and the old token kept working for
 * its database calls. Mazer now asks the provider who owns the token (`GET /auth/v1/user`, the same server-validated
 * call as auth-js `getUser()`) once at boot when a stored session exists, and again when the page becomes visible or
 * focused, and drops the local session when the provider says the session or the account is gone.
 *
 * Rules, all pinned by tests/reset/legacy-auth-recheck.test.ts:
 *  - Only a provider answer that names a dead session/account signs the player out: a 401/403 whose error code is one
 *    of LEGACY_AUTH_RECHECK_REVOKED_CODES (`session_not_found` after a global sign-out). A network failure, offline, a
 *    timeout, a 5xx, a 429, an unreadable body or a 401/403 without such a code (a gateway "Invalid API key") keeps
 *    the session.
 *  - Throttled: at most one check per LEGACY_AUTH_RECHECK_THROTTLE_MS (a focus and a visibilitychange from the same
 *    return count once), one in flight at a time, and none while the browser reports offline.
 *  - Never mid-run: the safe point is the same as the deferred service-worker update (MAZER-PWA-006): the scene's run
 *    state is `menu`. A check that comes due during a run waits for the next safe point; a revocation that comes back
 *    while a run started in the meantime waits too before the session is dropped.
 *  - No redirect: a drop shows the existing signed-out status screen with the copy-matrix row `signin.session`
 *    ("Your session ended. Sign in again to continue."). It does not record an explicit sign-out and never navigates.
 *
 * The decision and the controller are pure (clock, network and run state injected); `installLegacyAuthRecheckInBrowser`
 * is the only part that touches `window`/`document`.
 */

export const LEGACY_AUTH_RECHECK_THROTTLE_MS = 60_000;

/**
 * Provider error codes that mean the session or the account no longer exists. `bad_jwt` is deliberately NOT here: an
 * expired or re-signed access token is refreshed by the client, it is not proof that the account is gone.
 */
export const LEGACY_AUTH_RECHECK_REVOKED_CODES: readonly string[] = Object.freeze([
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned'
]);

export type LegacyAuthRecheckTrigger = 'boot' | 'resume' | 'safe-point';

/** One answer of the provider's `GET /auth/v1/user`, reduced to what the decision needs (never the token). */
export interface LegacyAuthRecheckResponse {
  /** `code` (API 2024-01-01) or `error_code` (older) from a JSON error body; null when absent or unreadable. */
  code: string | null;
  /** HTTP status; 0 when the request failed before an answer (offline, DNS, CORS, timeout). */
  status: number;
  /** `id` from a 2xx JSON body; null otherwise. */
  userId: string | null;
}

export type LegacyAuthRecheckResponseClass = 'valid' | 'revoked' | 'transient';

export const LEGACY_AUTH_RECHECK_TIMEOUT_MS = 10_000;
const LEGACY_AUTH_RECHECK_MAX_BODY_CHARS = 16_384;

export interface LegacyAuthProviderUserRequest {
  accessToken: string;
  anonKey: string;
  fetch: (input: string, init: RequestInit) => Promise<Pick<Response, 'status' | 'text'>>;
  /** Supabase project URL, e.g. `https://<ref>.supabase.co`. */
  projectUrl: string;
  timeoutMs?: number;
}

/**
 * Asks the provider who owns this access token (`GET /auth/v1/user`, validated server-side against the live session).
 * Sent directly rather than through auth-js `getUser()`, because auth-js removes the stored session itself on
 * `session_not_found`, which would sign the player out mid-run; the caller decides when to drop. Never throws.
 */
export const requestLegacyAuthProviderUser = async (
  request: LegacyAuthProviderUserRequest
): Promise<LegacyAuthRecheckResponse> => {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeout = setTimeout(() => controller?.abort(), request.timeoutMs ?? LEGACY_AUTH_RECHECK_TIMEOUT_MS);
  try {
    const response = await request.fetch(`${request.projectUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        apikey: request.anonKey,
        Authorization: `Bearer ${request.accessToken}`,
        'X-Supabase-Api-Version': '2024-01-01'
      },
      method: 'GET',
      ...(controller === null ? {} : { signal: controller.signal })
    });
    let body: Record<string, unknown> | null = null;
    try {
      const text = await response.text();
      const parsed: unknown = text.length > 0 && text.length <= LEGACY_AUTH_RECHECK_MAX_BODY_CHARS
        ? JSON.parse(text)
        : null;
      body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      body = null;
    }
    const ok = response.status >= 200 && response.status < 300;
    const code = !ok && body !== null
      ? (typeof body.code === 'string' ? body.code : typeof body.error_code === 'string' ? body.error_code : null)
      : null;
    return {
      code,
      status: response.status,
      userId: ok && body !== null && typeof body.id === 'string' ? body.id : null
    };
  } catch {
    return { code: null, status: 0, userId: null };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Only a 2xx naming the same user is `valid`, and only a 401/403 carrying a code from LEGACY_AUTH_RECHECK_REVOKED_CODES
 * is `revoked`. Everything else (status 0, 5xx, 429, 400, a 401/403 without such a code such as a gateway
 * "Invalid API key", a 2xx for another user) is `transient` and keeps the session.
 */
export const classifyLegacyAuthRecheckResponse = (
  response: LegacyAuthRecheckResponse,
  expectedUserId: string
): LegacyAuthRecheckResponseClass => {
  if (response.status >= 200 && response.status < 300) {
    return response.userId !== null && response.userId === expectedUserId ? 'valid' : 'transient';
  }
  if (
    (response.status === 401 || response.status === 403)
    && response.code !== null
    && LEGACY_AUTH_RECHECK_REVOKED_CODES.includes(response.code)
  ) {
    return 'revoked';
  }
  return 'transient';
};

export interface LegacyAuthRecheckDecisionInput {
  /** A real (non-fixture, non-preview) signed-in session is showing. */
  authenticated: boolean;
  inFlight: boolean;
  lastCheckedAtMs: number | null;
  nowMs: number;
  /** `navigator.onLine`; false means the browser knows it is offline. */
  online: boolean;
  /** No run in progress (MenuScene `mode === 'menu'`, the MAZER-PWA-006 safe point). */
  safePoint: boolean;
  trigger: LegacyAuthRecheckTrigger;
}

export type LegacyAuthRecheckSkipReason = 'not-authenticated' | 'in-flight' | 'offline' | 'throttled';

export type LegacyAuthRecheckDecision =
  | { action: 'check' }
  | { action: 'defer'; reason: 'mid-run' }
  | { action: 'skip'; reason: LegacyAuthRecheckSkipReason };

/** First matching reason wins; the order is the contract. */
export const decideLegacyAuthRecheck = (input: LegacyAuthRecheckDecisionInput): LegacyAuthRecheckDecision => {
  if (!input.authenticated) {
    return { action: 'skip', reason: 'not-authenticated' };
  }
  if (input.inFlight) {
    return { action: 'skip', reason: 'in-flight' };
  }
  if (!input.online) {
    return { action: 'skip', reason: 'offline' };
  }
  if (
    input.lastCheckedAtMs !== null
    && input.nowMs >= input.lastCheckedAtMs
    && input.nowMs - input.lastCheckedAtMs < LEGACY_AUTH_RECHECK_THROTTLE_MS
  ) {
    return { action: 'skip', reason: 'throttled' };
  }
  if (!input.safePoint) {
    return { action: 'defer', reason: 'mid-run' };
  }
  return { action: 'check' };
};

/**
 * What one provider check found.
 *  - `valid`: the provider confirmed the same user.
 *  - `revoked`: the provider says the session/account is gone; the session is still stored (drop it).
 *  - `removed`: the stored session was already gone when the check finished (an auth-js refresh found it dead, or
 *    another tab dropped it) and the player did not choose Sign out: only the signed-out notice is applied.
 *  - `transient`: network, offline, server or unclear answer: keep everything.
 *  - `skipped`: nothing to check (no client, no stored session, quarantine, or the session changed meanwhile).
 */
export type LegacyAuthRecheckProbe =
  | { status: 'valid' }
  | { status: 'revoked'; userId: string }
  | { status: 'removed' }
  | { status: 'transient' }
  | { status: 'skipped' };

export interface LegacyAuthRecheckDeps<TSnapshot> {
  /** Drops the stored session without recording an explicit sign-out; null when the drop did not happen. */
  drop(userId: string): Promise<TSnapshot | null>;
  isAuthenticated(): boolean;
  isOnline(): boolean;
  isSafePoint(): boolean;
  now(): number;
  /** Applies the signed-out snapshot (with the session-ended notice) to the scene. */
  onSignedOut(snapshot: TSnapshot): void;
  probe(): Promise<LegacyAuthRecheckProbe>;
  /** The snapshot shown when the provider already removed the session. */
  signedOutSnapshot(): TSnapshot;
}

export interface LegacyAuthRecheckController {
  /** For tests and diagnostics: what the controller is holding. */
  readonly state: Readonly<{
    deferredCheck: boolean;
    deferredDropUserId: string | null;
    inFlight: boolean;
    lastCheckedAtMs: number | null;
  }>;
  dispose(): void;
  /** Called when the scene reaches a safe point (a run ended): runs a deferred check or drop. */
  notifySafePoint(): Promise<void>;
  request(trigger: LegacyAuthRecheckTrigger): Promise<LegacyAuthRecheckDecision>;
}

export const createLegacyAuthRecheckController = <TSnapshot>(
  deps: LegacyAuthRecheckDeps<TSnapshot>
): LegacyAuthRecheckController => {
  const state = {
    deferredCheck: false,
    deferredDropUserId: null as string | null,
    disposed: false,
    inFlight: false,
    lastCheckedAtMs: null as number | null
  };

  const finishSignedOut = (snapshot: TSnapshot | null): void => {
    if (snapshot !== null && !state.disposed) {
      deps.onSignedOut(snapshot);
    }
  };

  const runDrop = async (userId: string): Promise<void> => {
    state.deferredDropUserId = null;
    state.inFlight = true;
    try {
      finishSignedOut(await deps.drop(userId));
    } catch {
      // A failed drop keeps the session; the next check asks again.
    } finally {
      state.inFlight = false;
    }
  };

  const runCheck = async (): Promise<void> => {
    state.deferredCheck = false;
    state.inFlight = true;
    state.lastCheckedAtMs = deps.now();
    let probe: LegacyAuthRecheckProbe;
    try {
      probe = await deps.probe();
    } catch {
      probe = { status: 'transient' };
    } finally {
      state.inFlight = false;
    }
    if (state.disposed) {
      return;
    }
    if (probe.status === 'removed') {
      finishSignedOut(deps.signedOutSnapshot());
      return;
    }
    if (probe.status !== 'revoked') {
      return;
    }
    if (!deps.isSafePoint()) {
      // A run started while the provider answered: drop at the next safe point, never mid-run.
      state.deferredDropUserId = probe.userId;
      return;
    }
    await runDrop(probe.userId);
  };

  const request = async (trigger: LegacyAuthRecheckTrigger): Promise<LegacyAuthRecheckDecision> => {
    if (state.disposed) {
      return { action: 'skip', reason: 'not-authenticated' };
    }
    const decision = decideLegacyAuthRecheck({
      authenticated: deps.isAuthenticated(),
      inFlight: state.inFlight,
      lastCheckedAtMs: state.lastCheckedAtMs,
      nowMs: deps.now(),
      online: deps.isOnline(),
      safePoint: deps.isSafePoint(),
      trigger
    });
    if (decision.action === 'defer') {
      state.deferredCheck = true;
    } else if (decision.action === 'check') {
      await runCheck();
    }
    return decision;
  };

  const notifySafePoint = async (): Promise<void> => {
    if (state.disposed || state.inFlight || !deps.isSafePoint()) {
      return;
    }
    if (state.deferredDropUserId !== null) {
      if (deps.isAuthenticated()) {
        await runDrop(state.deferredDropUserId);
      } else {
        state.deferredDropUserId = null;
      }
      return;
    }
    if (state.deferredCheck) {
      await request('safe-point');
    }
  };

  return {
    get state() {
      return {
        deferredCheck: state.deferredCheck,
        deferredDropUserId: state.deferredDropUserId,
        inFlight: state.inFlight,
        lastCheckedAtMs: state.lastCheckedAtMs
      };
    },
    dispose: () => {
      state.disposed = true;
      state.deferredCheck = false;
      state.deferredDropUserId = null;
    },
    notifySafePoint,
    request
  };
};

export interface LegacyAuthRecheckBrowserBinding {
  dispose(): void;
  notifySafePoint(): void;
  request(trigger: LegacyAuthRecheckTrigger): void;
}

export interface LegacyAuthRecheckBrowserTarget {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  navigator: Pick<Navigator, 'onLine'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Browser binding: a `visibilitychange` to visible and a window `focus` each request a `resume` check (the throttle
 * folds the pair into one). Never throws; the returned handle is idempotent to dispose.
 */
export const installLegacyAuthRecheckInBrowser = <TSnapshot>(
  deps: Omit<LegacyAuthRecheckDeps<TSnapshot>, 'isOnline' | 'now'> & { now?: () => number },
  target: LegacyAuthRecheckBrowserTarget | null = typeof window === 'undefined' || typeof document === 'undefined'
    ? null
    : { document, navigator, window }
): LegacyAuthRecheckBrowserBinding | null => {
  if (target === null) {
    return null;
  }
  const controller = createLegacyAuthRecheckController<TSnapshot>({
    ...deps,
    isOnline: () => target.navigator.onLine !== false,
    now: deps.now ?? (() => Date.now())
  });
  const swallow = (promise: Promise<unknown>): void => {
    promise.catch(() => undefined);
  };
  const onVisibility = (): void => {
    if (target.document.visibilityState === 'visible') {
      swallow(controller.request('resume'));
    }
  };
  const onFocus = (): void => swallow(controller.request('resume'));
  target.document.addEventListener('visibilitychange', onVisibility);
  target.window.addEventListener('focus', onFocus);
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      controller.dispose();
      target.document.removeEventListener('visibilitychange', onVisibility);
      target.window.removeEventListener('focus', onFocus);
    },
    notifySafePoint: () => swallow(controller.notifySafePoint()),
    request: (trigger) => swallow(controller.request(trigger))
  };
};
