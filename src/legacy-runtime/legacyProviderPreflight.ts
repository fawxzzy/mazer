/**
 * Sign-in pre-flight (MAZER-ACCT-036).
 *
 * Why: on 2026-11-12 the account provider was down and Sign in did a top-level
 * navigation to its authorize URL. The player landed on a bare provider error
 * page inside the installed app, with no back button and no explanation. Mazer
 * now asks the provider one cheap question BEFORE leaving, and stays put with
 * its own plain failure line when the answer is "down".
 *
 * Probe: GET <issuer>/.well-known/openid-configuration. It needs no session, no
 * credentials and no custom header (a CORS "simple request", so no OPTIONS
 * round trip), and a healthy provider answers it with the page origin echoed in
 * Access-Control-Allow-Origin (checked live 2026-11-12 for the production, a
 * localhost and an arbitrary https origin). `cache: 'no-store'` is required: the
 * document is `Cache-Control: public, max-age=600`, and a cached copy would say
 * "up" while the provider is down.
 *
 * Decision table (see decideProviderPreflight):
 *   2xx readable                     -> proceed          (ok)
 *   non-2xx readable (5xx, 4xx)      -> do not navigate  (http_error)
 *   no answer within the timeout     -> do not navigate  (timeout)
 *   network error while offline      -> do not navigate  (offline)
 *   network error while online, and a follow-up no-cors request still
 *     gets an answer                 -> do not navigate  (missing_cors)
 *   network error while online, and the follow-up no-cors request also
 *     fails outright                 -> PROCEED anyway   (blocked)
 *
 * Why the follow-up: a browser reports a gateway error page with no CORS header
 * (an Envoy 503 "upstream connect error", a Cloudflare 521/525 page) as the SAME
 * TypeError as a request an extension blocked, so a CORS-mode fetch alone cannot
 * tell "provider down" from "pre-flight blocked". The healthy provider always
 * sends the CORS header, so an answer WITHOUT one (the no-cors request resolves,
 * opaque) is an error page, not a healthy provider. Only a request that is
 * refused outright in both modes (extension, content blocker, CSP) is treated as
 * "the probe itself is blocked": navigate anyway, because the provider may be fine.
 *
 * A success is cached for 30 s so a second tap, or a retry right after a
 * password-manager detour, adds no latency.
 */
export const PROVIDER_PREFLIGHT_URL = 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/.well-known/openid-configuration';
export const PROVIDER_PREFLIGHT_TIMEOUT_MS = 4_000;
// The follow-up only asks "did anything answer": it gets a shorter budget.
export const PROVIDER_PREFLIGHT_FOLLOW_UP_TIMEOUT_MS = 2_000;
export const PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS = 30_000;

export type ProviderPreflightReason =
  | 'blocked'
  | 'cached'
  | 'http_error'
  | 'missing_cors'
  | 'offline'
  | 'ok'
  | 'timeout';

export interface ProviderPreflightResult {
  /** False means: do NOT navigate, show the unavailable line instead. */
  proceed: boolean;
  reason: ProviderPreflightReason;
  /** HTTP status when one was readable (http_error / ok), else null. */
  status: number | null;
}

export interface ProviderPreflightCache {
  lastOkAtMs: number | null;
}

export const createProviderPreflightCache = (): ProviderPreflightCache => ({ lastOkAtMs: null });

export interface ProviderPreflightDeps {
  cache?: ProviderPreflightCache;
  clearTimer(handle: ReturnType<typeof setTimeout>): void;
  fetch: typeof fetch;
  /** navigator.onLine; undefined when the platform does not say. */
  isOnline?(): boolean | undefined;
  now(): number;
  setTimer(handler: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
}

export type ProviderPreflightAttempt =
  | { kind: 'response'; ok: boolean; status: number }
  | { kind: 'opaque' }
  | { kind: 'timeout' }
  | { kind: 'network-error' };

const attempt = async (
  deps: ProviderPreflightDeps,
  mode: 'cors' | 'no-cors',
  timeoutMs: number
): Promise<ProviderPreflightAttempt> => {
  let controller: AbortController | null = null;
  try {
    controller = typeof AbortController === 'undefined' ? null : new AbortController();
  } catch {
    controller = null;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timedOut = new Promise<ProviderPreflightAttempt>((resolve) => {
    timer = deps.setTimer(() => {
      try {
        controller?.abort();
      } catch {
        // The race below already reports the timeout.
      }
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  const request = (async (): Promise<ProviderPreflightAttempt> => {
    try {
      const response = await deps.fetch(PROVIDER_PREFLIGHT_URL, {
        cache: 'no-store',
        credentials: 'omit',
        method: 'GET',
        mode,
        ...(controller === null ? {} : { signal: controller.signal })
      });
      if (response.type === 'opaque') {
        return { kind: 'opaque' };
      }
      return { kind: 'response', ok: response.ok === true, status: response.status };
    } catch {
      return { kind: 'network-error' };
    }
  })();
  try {
    return await Promise.race([request, timedOut]);
  } finally {
    if (timer !== null) {
      deps.clearTimer(timer);
    }
  }
};

/**
 * Pure decision from an observed outcome. Kept separate so the table above is
 * unit-testable without any fetch.
 */
export const decideProviderPreflight = (
  first: ProviderPreflightAttempt,
  online: boolean | undefined,
  followUp: ProviderPreflightAttempt | null
): ProviderPreflightResult => {
  if (first.kind === 'response') {
    return first.ok
      ? { proceed: true, reason: 'ok', status: first.status }
      : { proceed: false, reason: 'http_error', status: first.status };
  }
  if (first.kind === 'timeout') {
    return { proceed: false, reason: 'timeout', status: null };
  }
  if (first.kind === 'opaque') {
    // Only a no-cors request resolves opaque; the first attempt is always cors.
    return { proceed: true, reason: 'ok', status: null };
  }
  if (online === false) {
    return { proceed: false, reason: 'offline', status: null };
  }
  if (followUp === null || followUp.kind === 'network-error') {
    return { proceed: true, reason: 'blocked', status: null };
  }
  if (followUp.kind === 'timeout') {
    return { proceed: false, reason: 'timeout', status: null };
  }
  return { proceed: false, reason: 'missing_cors', status: null };
};

export const runProviderPreflight = async (
  deps: ProviderPreflightDeps
): Promise<ProviderPreflightResult> => {
  const nowMs = deps.now();
  const cache = deps.cache;
  if (
    cache !== undefined
    && cache.lastOkAtMs !== null
    && nowMs >= cache.lastOkAtMs
    && nowMs - cache.lastOkAtMs < PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS
  ) {
    return { proceed: true, reason: 'cached', status: null };
  }
  const first = await attempt(deps, 'cors', PROVIDER_PREFLIGHT_TIMEOUT_MS);
  let online: boolean | undefined;
  try {
    online = deps.isOnline?.();
  } catch {
    online = undefined;
  }
  const followUp = first.kind === 'network-error' && online !== false
    ? await attempt(deps, 'no-cors', PROVIDER_PREFLIGHT_FOLLOW_UP_TIMEOUT_MS)
    : null;
  const result = decideProviderPreflight(first, online, followUp);
  if (cache !== undefined && result.proceed && result.reason === 'ok') {
    cache.lastOkAtMs = deps.now();
  }
  return result;
};
