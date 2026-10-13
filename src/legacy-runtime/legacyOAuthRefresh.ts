import {
  MAZER_OAUTH_AUTH_SESSION_KEY,
  MAZER_OAUTH_CLIENT_ID,
  MAZER_OAUTH_ISSUER,
  MAZER_OAUTH_TOKEN_TIMEOUT_MS,
  MAZER_OAUTH_TOKEN_URL
} from './legacyAccountPortal';

const MAX_BODY_BYTES = 16_384;
const MAX_TOKEN_LENGTH = 4_096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const tokenString = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH
);
const claimsFrom = (token: unknown): RecordValue | null => {
  if (!tokenString(token)) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const value: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return record(value) ? value : null;
  } catch { return null; }
};
const validBinding = (claims: RecordValue): boolean => (
  claims.iss === MAZER_OAUTH_ISSUER
  && claims.client_id === MAZER_OAUTH_CLIENT_ID
  && claims.role === 'authenticated'
  && (claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated')))
  && typeof claims.sub === 'string' && UUID.test(claims.sub)
  && typeof claims.session_id === 'string' && UUID.test(claims.session_id)
);

// Response.json is newer than our supported browser baseline.
const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

// Never echo provider bodies: they can contain credentials or request details.
const failure = (status = 400): Response => jsonResponse({
  msg: 'Account session refresh unavailable.', error_code: 'mazer_oauth_refresh_failed'
}, status);

const readBoundedJson = async (response: Response): Promise<RecordValue | null> => {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return record(result) ? result : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
};

interface RefreshTransportOptions {
  fetch?: typeof fetch;
  readSession?: () => string | null;
  now?: () => number;
}

/** Adapt the SDK's refresh transport, keeping its existing lock and session owner. */
export const createMazerAuthFetch = ({
  fetch: transport = globalThis.fetch.bind(globalThis),
  readSession = () => typeof window === 'undefined' ? null : window.localStorage.getItem(MAZER_OAUTH_AUTH_SESSION_KEY),
  now = Date.now
}: RefreshTransportOptions = {}): typeof fetch => async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.origin + url.pathname !== MAZER_OAUTH_ISSUER + '/token'
    || url.search !== '?grant_type=refresh_token' || method !== 'POST') return transport(input, init);

  let raw: string | null;
  let session: unknown;
  try { raw = readSession(); session = raw === null ? null : JSON.parse(raw); }
  catch { return failure(503); }
  if (!record(session)) return transport(input, init);
  const oldClaims = claimsFrom(session.access_token);
  // Password/recovery sessions keep the SDK's native endpoint unchanged.
  if (!oldClaims || !('client_id' in oldClaims)) return transport(input, init);
  if (!validBinding(oldClaims) || !record(session.user) || session.user.id !== oldClaims.sub) return failure();

  let request: Request;
  let body: unknown;
  try {
    request = new Request(input, init);
    const text = await request.clone().text();
    if (text.length > MAX_BODY_BYTES) return failure();
    body = JSON.parse(text);
  } catch { return failure(); }
  // A stale caller must neither consume the new token nor cause auth-js to
  // remove a newer session. A retryable response keeps that session intact.
  if (!record(body) || !tokenString(body.refresh_token) || body.refresh_token !== session.refresh_token) return failure(503);

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, MAZER_OAUTH_TOKEN_TIMEOUT_MS);
  try {
    const response = await transport(MAZER_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: MAZER_OAUTH_CLIENT_ID, refresh_token: body.refresh_token }),
      cache: 'no-store', credentials: 'omit', mode: 'cors', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: controller.signal
    });
    if (readSession() !== raw) return failure(503);
    if (!response.ok) {
      // auth-js 2.75 only preserves sessions for retryable 502/503/504.
      // OAuth throttling/timeouts/server faults must not become a sign-out.
      const transient = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      return failure(transient ? 503 : response.status >= 400 ? response.status : 400);
    }
    const token = await readBoundedJson(response);
    if (readSession() !== raw) return failure(503);
    const claims = claimsFrom(token?.access_token);
    const seconds = Math.floor(now() / 1_000);
    if (!token || !claims || !validBinding(claims)
      || claims.sub !== oldClaims.sub || claims.session_id !== oldClaims.session_id
      || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= seconds
      || typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat > seconds + 60
      || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer'
      || !Number.isSafeInteger(token.expires_in) || Number(token.expires_in) <= 0
      || ('refresh_token' in token && !tokenString(token.refresh_token))) return failure();
    // The fixed TLS endpoint supplied these claims. Decoding binds the response
    // to the existing session; it does not replace server-side JWT validation.
    return jsonResponse({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? body.refresh_token,
      token_type: 'bearer', expires_at: claims.exp, expires_in: claims.exp - seconds,
      user: session.user
    });
  } catch { return failure(503); }
  finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
};
