export const MAZER_ACCOUNT_APP = 'mazer';
export const MAZER_ACCOUNT_PORTAL_ORIGIN = 'https://account.fawxzzy.com';
export const MAZER_CANONICAL_RETURN_URL = 'https://mazer.fawxzzy.com/';
export const MAZER_OAUTH_AUTHORIZATION_URL = 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/oauth/authorize';
export const MAZER_OAUTH_TOKEN_URL = 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/oauth/token';
export const MAZER_OAUTH_ISSUER = 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1';
export const MAZER_OAUTH_CLIENT_ID = 'da286bbf-2a57-43b1-a5ea-364f72cf461d';
export const MAZER_OAUTH_SCOPE = 'email';
export const MAZER_OAUTH_PENDING_KEY = 'mazer.auth.oauth-pending.v1';
export const MAZER_AUTH_MUTATION_EPOCH_KEY = 'mazer.auth.mutation-epoch.v1';
export const MAZER_OAUTH_SESSION_QUARANTINE_KEY = 'mazer.auth.oauth-session-quarantine.v1';
export const MAZER_OAUTH_PENDING_TTL_MS = 300_000;
export const MAZER_OAUTH_TOKEN_TIMEOUT_MS = 10_000;
export const MAZER_OAUTH_SAFE_ERROR_MESSAGE = 'Account connection unavailable. Return to Mazer and try again.';

const MAZER_OAUTH_CALLBACK_KEYS = ['code', 'state', 'error', 'error_description'] as const;
const MAZER_OAUTH_TOKEN_RESPONSE_MAX_BYTES = 16_384;
const MAZER_OAUTH_TOKEN_VALUE_MAX_LENGTH = 4_096;
const MAZER_OAUTH_STATE_LENGTH = 43;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MazerAccountPortalRoute = 'account' | 'reset-password';
export type MazerLegalRoute = 'privacy' | 'terms';
export type MazerOAuthFailureCategory =
  | 'cancelled'
  | 'expired_or_missing_state'
  | 'invalid_state'
  | 'authorization_unavailable'
  | 'exchange_unavailable'
  | 'session_invalid'
  | 'storage_unavailable';

export type MazerOAuthBootResult =
  | { status: 'none' }
  | { status: 'connected' }
  | { category: MazerOAuthFailureCategory; status: 'failed' };

export interface MazerOAuthCapturedCallback {
  code: string | null;
  malformed: boolean;
  providerError: boolean;
  requested: boolean;
  state: string | null;
}

interface MazerOAuthPendingRecord {
  authMutationEpoch: number;
  codeVerifier: string;
  createdAtEpochMs: number;
  returnPath: '/';
  state: string;
  version: 1;
}

export interface MazerOAuthStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface MazerOAuthLocation {
  assign(url: string): void;
  hash: string;
  href: string;
  origin: string;
  pathname: string;
  search: string;
}

export interface MazerOAuthHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface MazerOAuthRuntime {
  authStorage?: MazerOAuthStorage | null;
  clearTimer(handle: ReturnType<typeof setTimeout>): void;
  crypto: Pick<Crypto, 'getRandomValues' | 'subtle'>;
  fetch: typeof fetch;
  history: MazerOAuthHistory;
  location: MazerOAuthLocation;
  now(): number;
  sessionStorage: MazerOAuthStorage;
  setTimer(handler: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
}

export interface MazerOAuthPageLifecycle {
  addEventListener(type: 'pageshow', listener: (event: PageTransitionEvent) => void): void;
  removeEventListener(type: 'pageshow', listener: (event: PageTransitionEvent) => void): void;
}

export interface MazerOAuthClient {
  auth: {
    getClaims(jwt?: string): Promise<{ data: { claims?: Record<string, unknown> } | null; error: unknown }>;
    getSession(): Promise<{ data: { session: { user?: { id?: string } } | null }; error: unknown }>;
    getUser(jwt?: string): Promise<{ data: { user: { id?: string } | null }; error: unknown }>;
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>;
    signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
  };
}

let mazerOAuthBootResult: MazerOAuthBootResult = { status: 'none' };

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const value: unknown = JSON.parse(atob(padded));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

type MazerOAuthRuntimeResolution =
  | { result: MazerOAuthBootResult; runtime: null }
  | { result: null; runtime: MazerOAuthRuntime };

export const resolveMazerOAuthSessionStorage = (
  browserWindow: Pick<Window, 'sessionStorage'> | null = typeof window === 'undefined' ? null : window
): MazerOAuthStorage | null => {
  if (browserWindow === null) {
    return null;
  }
  try {
    return browserWindow.sessionStorage;
  } catch {
    return null;
  }
};

const resolveBrowserRuntime = (): MazerOAuthRuntimeResolution => {
  if (typeof window === 'undefined' || typeof crypto === 'undefined') {
    return { result: { category: 'authorization_unavailable', status: 'failed' }, runtime: null };
  }

  const sessionStorage = resolveMazerOAuthSessionStorage(window);
  if (sessionStorage === null) {
    return { result: { category: 'storage_unavailable', status: 'failed' }, runtime: null };
  }

  try {
    let authStorage: MazerOAuthStorage | null = null;
    try {
      authStorage = window.localStorage;
    } catch {
      // A denied local store is handled by the callback quarantine below.
    }
    return {
      result: null,
      runtime: {
        authStorage,
        clearTimer: (handle) => clearTimeout(handle),
        crypto,
        fetch: window.fetch.bind(window),
        history: window.history,
        location: window.location,
        now: () => Date.now(),
        sessionStorage,
        setTimer: (handler, timeoutMs) => setTimeout(handler, timeoutMs)
      }
    };
  } catch {
    return { result: { category: 'authorization_unavailable', status: 'failed' }, runtime: null };
  }
};

const readAuthMutationEpoch = (storage: MazerOAuthStorage): number => {
  const raw = storage.getItem(MAZER_AUTH_MUTATION_EPOCH_KEY);
  if (raw === null) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export const advanceMazerAuthMutationEpoch = (
  storage?: MazerOAuthStorage | null
): number | null => {
  const resolvedStorage = storage === undefined ? resolveMazerOAuthSessionStorage() : storage;
  if (resolvedStorage === null) {
    return null;
  }
  try {
    const next = readAuthMutationEpoch(resolvedStorage) + 1;
    resolvedStorage.setItem(MAZER_AUTH_MUTATION_EPOCH_KEY, String(next));
    resolvedStorage.removeItem(MAZER_OAUTH_PENDING_KEY);
    return next;
  } catch {
    return null;
  }
};

export const buildMazerAccountPortalUrl = (route: MazerAccountPortalRoute): string => {
  const url = new URL(`/${route}`, MAZER_ACCOUNT_PORTAL_ORIGIN);
  if (route === 'reset-password') {
    url.searchParams.set('recovery', '1');
  }
  url.searchParams.set('app', MAZER_ACCOUNT_APP);
  url.searchParams.set('returnTo', MAZER_CANONICAL_RETURN_URL);
  return url.toString();
};

export const buildMazerLegalUrl = (route: MazerLegalRoute): string => {
  const url = new URL(`/${route}`, MAZER_ACCOUNT_PORTAL_ORIGIN);
  url.searchParams.set('app', MAZER_ACCOUNT_APP);
  url.searchParams.set('returnTo', MAZER_CANONICAL_RETURN_URL);
  return url.toString();
};

export const resolveMazerLegalRoute = (pathname: string): MazerLegalRoute | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/privacy') {
    return 'privacy';
  }
  if (normalized === '/terms') {
    return 'terms';
  }
  return null;
};

export const buildMazerOAuthAuthorizationUrl = (codeChallenge: string, state: string): string => {
  const url = new URL(MAZER_OAUTH_AUTHORIZATION_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', MAZER_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', MAZER_CANONICAL_RETURN_URL);
  url.searchParams.set('scope', MAZER_OAUTH_SCOPE);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
};

const createRandomBase64Url = (runtime: MazerOAuthRuntime): string => {
  const bytes = new Uint8Array(32);
  runtime.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

export const beginMazerOAuthAuthorization = async (
  runtime?: MazerOAuthRuntime | null
): Promise<MazerOAuthBootResult> => {
  const resolution: MazerOAuthRuntimeResolution = runtime === undefined
    ? resolveBrowserRuntime()
    : runtime === null
      ? { result: failed('authorization_unavailable'), runtime: null }
      : { result: null, runtime };
  if (resolution.runtime === null) {
    return resolution.result;
  }
  const resolvedRuntime = resolution.runtime;

  let pendingWritten = false;
  try {
    const authMutationEpoch = readAuthMutationEpoch(resolvedRuntime.sessionStorage) + 1;
    resolvedRuntime.sessionStorage.setItem(MAZER_AUTH_MUTATION_EPOCH_KEY, String(authMutationEpoch));
    resolvedRuntime.sessionStorage.removeItem(MAZER_OAUTH_PENDING_KEY);
    const codeVerifier = createRandomBase64Url(resolvedRuntime);
    const state = createRandomBase64Url(resolvedRuntime);
    const challengeBytes = new Uint8Array(await resolvedRuntime.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier)
    ));
    const codeChallenge = base64UrlEncode(challengeBytes);
    const pending: MazerOAuthPendingRecord = {
      authMutationEpoch,
      codeVerifier,
      createdAtEpochMs: resolvedRuntime.now(),
      returnPath: '/',
      state,
      version: 1
    };
    resolvedRuntime.sessionStorage.setItem(MAZER_OAUTH_PENDING_KEY, JSON.stringify(pending));
    pendingWritten = true;
    resolvedRuntime.location.assign(buildMazerOAuthAuthorizationUrl(codeChallenge, state));
    return { status: 'none' };
  } catch {
    if (pendingWritten) {
      try {
        resolvedRuntime.sessionStorage.removeItem(MAZER_OAUTH_PENDING_KEY);
      } catch {
        return { category: 'storage_unavailable', status: 'failed' };
      }
    }
    return { category: 'authorization_unavailable', status: 'failed' };
  }
};

const collectCallbackValues = (params: URLSearchParams): string[] => (
  MAZER_OAUTH_CALLBACK_KEYS.flatMap((key) => params.getAll(key))
);

export const isMazerOAuthCallbackRequest = (
  location: Pick<MazerOAuthLocation, 'hash' | 'search'>
): boolean => {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  return collectCallbackValues(query).length > 0 || collectCallbackValues(fragment).length > 0;
};

export const captureAndScrubMazerOAuthCallback = (
  location: Pick<MazerOAuthLocation, 'hash' | 'origin' | 'pathname' | 'search'>,
  history: MazerOAuthHistory
): MazerOAuthCapturedCallback => {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const requested = isMazerOAuthCallbackRequest(location);
  const queryCode = query.getAll('code');
  const queryState = query.getAll('state');
  const queryError = query.getAll('error');
  const queryErrorDescription = query.getAll('error_description');
  const fragmentSensitiveValues = collectCallbackValues(fragment);
  const malformed = requested && (
    location.origin !== new URL(MAZER_CANONICAL_RETURN_URL).origin
    || location.pathname !== '/'
    || fragmentSensitiveValues.length > 0
    || queryCode.length > 1
    || queryState.length !== 1
    || queryError.length > 1
    || queryErrorDescription.length > 1
    || (queryCode.length === 1 && queryError.length === 1)
    || (queryCode.length === 0 && queryError.length === 0)
  );

  if (requested) {
    for (const key of MAZER_OAUTH_CALLBACK_KEYS) {
      query.delete(key);
      fragment.delete(key);
    }
    const search = query.toString();
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}`);
  }

  return {
    code: queryCode.length === 1 ? queryCode[0] : null,
    malformed,
    providerError: queryError.length === 1,
    requested,
    state: queryState.length === 1 ? queryState[0] : null
  };
};

const parsePendingRecord = (raw: string | null): MazerOAuthPendingRecord | null => {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Partial<MazerOAuthPendingRecord>;
    if (
      record.version !== 1
      || record.returnPath !== '/'
      || !Number.isSafeInteger(record.createdAtEpochMs)
      || !Number.isSafeInteger(record.authMutationEpoch)
      || typeof record.codeVerifier !== 'string'
      || record.codeVerifier.length < 43
      || record.codeVerifier.length > 128
      || typeof record.state !== 'string'
      || record.state.length !== MAZER_OAUTH_STATE_LENGTH
    ) {
      return null;
    }
    return record as MazerOAuthPendingRecord;
  } catch {
    return null;
  }
};

export const isMazerOAuthCallbackReadyForBoot = (
  location: Pick<MazerOAuthLocation, 'hash' | 'origin' | 'pathname' | 'search'>,
  storage: MazerOAuthStorage,
  nowEpochMs = Date.now()
): boolean => {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const queryCode = query.getAll('code');
  const queryState = query.getAll('state');
  const queryError = query.getAll('error');
  const queryErrorDescription = query.getAll('error_description');
  const requested = collectCallbackValues(query).length > 0 || collectCallbackValues(fragment).length > 0;
  const structurallyValid = requested
    && location.origin === new URL(MAZER_CANONICAL_RETURN_URL).origin
    && location.pathname === '/'
    && collectCallbackValues(fragment).length === 0
    && queryCode.length <= 1
    && queryState.length === 1
    && queryError.length <= 1
    && queryErrorDescription.length <= 1
    && ((queryCode.length === 1) !== (queryError.length === 1));
  if (!structurallyValid) {
    return false;
  }

  try {
    const pending = parsePendingRecord(storage.getItem(MAZER_OAUTH_PENDING_KEY));
    if (
      pending === null
      || queryState[0] !== pending.state
      || pending.authMutationEpoch !== readAuthMutationEpoch(storage)
    ) {
      return false;
    }
    const ageMs = nowEpochMs - pending.createdAtEpochMs;
    return ageMs >= 0 && ageMs <= MAZER_OAUTH_PENDING_TTL_MS;
  } catch {
    return false;
  }
};

type ExactPendingRemovalResult = 'absent' | 'changed' | 'failed' | 'removed';

const removeExactPendingRecord = (
  storage: MazerOAuthStorage,
  expectedRaw: string | null
): ExactPendingRemovalResult => {
  if (expectedRaw === null) {
    return 'absent';
  }
  try {
    if (storage.getItem(MAZER_OAUTH_PENDING_KEY) !== expectedRaw) {
      return 'changed';
    }
    storage.removeItem(MAZER_OAUTH_PENDING_KEY);
    const postimage = storage.getItem(MAZER_OAUTH_PENDING_KEY);
    if (postimage === null) {
      return 'removed';
    }
    return postimage === expectedRaw ? 'failed' : 'changed';
  } catch {
    return 'failed';
  }
};

const failed = (category: MazerOAuthFailureCategory): MazerOAuthBootResult => ({ category, status: 'failed' });

const isExpectedAudience = (value: unknown): boolean => (
  value === 'authenticated'
  || (Array.isArray(value) && value.includes('authenticated'))
);

const validateClaims = (
  accessToken: string,
  claims: Record<string, unknown>,
  nowEpochMs: number
): string | null => {
  const decoded = decodeJwtPayload(accessToken);
  const sub = claims.sub;
  const sessionId = claims.session_id;
  const exp = claims.exp;
  const iat = claims.iat;
  if (
    decoded === null
    || typeof sub !== 'string'
    || decoded.sub !== sub
    || !UUID_PATTERN.test(sub)
    || typeof sessionId !== 'string'
    || !UUID_PATTERN.test(sessionId)
    || claims.iss !== MAZER_OAUTH_ISSUER
    || !isExpectedAudience(claims.aud)
    || claims.role !== 'authenticated'
    || claims.client_id !== MAZER_OAUTH_CLIENT_ID
    || typeof exp !== 'number'
    || !Number.isFinite(exp)
    || exp <= Math.floor(nowEpochMs / 1000)
    || typeof iat !== 'number'
    || !Number.isFinite(iat)
    || iat > Math.floor(nowEpochMs / 1000) + 60
  ) {
    return null;
  }
  return sub;
};

interface ParsedTokenResponse {
  accessToken: string;
  refreshToken: string;
}

const readBoundedResponseText = async (response: Response): Promise<string | null> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (
      !Number.isSafeInteger(parsedLength)
      || parsedLength < 0
      || parsedLength > MAZER_OAUTH_TOKEN_RESPONSE_MAX_BYTES
    ) {
      try {
        await response.body?.cancel();
      } catch {
        // The response is rejected regardless; cancellation is best-effort cleanup.
      }
      return null;
    }
  }
  if (response.body === null) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAZER_OAUTH_TOKEN_RESPONSE_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const exchangeAuthorizationCode = async (
  code: string,
  verifier: string,
  runtime: MazerOAuthRuntime
): Promise<ParsedTokenResponse | null> => {
  const controller = new AbortController();
  const timeout = runtime.setTimer(() => controller.abort(), MAZER_OAUTH_TOKEN_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      client_id: MAZER_OAUTH_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: MAZER_CANONICAL_RETURN_URL
    });
    const response = await runtime.fetch(MAZER_OAUTH_TOKEN_URL, {
      body,
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!response.ok || !contentType.includes('application/json')) {
      return null;
    }
    const raw = await readBoundedResponseText(response);
    if (raw === null) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const token = value as Record<string, unknown>;
    if (
      typeof token.access_token !== 'string'
      || token.access_token.length === 0
      || token.access_token.length > MAZER_OAUTH_TOKEN_VALUE_MAX_LENGTH
      || typeof token.refresh_token !== 'string'
      || token.refresh_token.length === 0
      || token.refresh_token.length > MAZER_OAUTH_TOKEN_VALUE_MAX_LENGTH
      || typeof token.token_type !== 'string'
      || token.token_type.toLowerCase() !== 'bearer'
      || !Number.isSafeInteger(token.expires_in)
      || Number(token.expires_in) <= 0
    ) {
      return null;
    }
    return { accessToken: token.access_token, refreshToken: token.refresh_token };
  } catch {
    return null;
  } finally {
    runtime.clearTimer(timeout);
  }
};

type MazerOAuthDeadlineResult<T> =
  | { status: 'resolved'; value: T }
  | { status: 'rejected' | 'timed_out' };

const awaitMazerOAuthRemoteOperation = async <T>(
  operation: () => Promise<T>,
  runtime: MazerOAuthRuntime
): Promise<MazerOAuthDeadlineResult<T>> => new Promise((resolve) => {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const finish = (result: MazerOAuthDeadlineResult<T>): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      runtime.clearTimer(timeout);
    }
    resolve(result);
  };

  const pending = Promise.resolve().then(operation);
  timeout = runtime.setTimer(() => finish({ status: 'timed_out' }), MAZER_OAUTH_TOKEN_TIMEOUT_MS);
  if (settled && timeout !== null) {
    runtime.clearTimer(timeout);
  }
  void pending.then(
    (value) => finish({ status: 'resolved', value }),
    () => finish({ status: 'rejected' })
  );
});

const bestEffortMazerOAuthLocalSignOut = async (
  client: MazerOAuthClient,
  runtime: MazerOAuthRuntime
): Promise<boolean> => {
  const storageCleared = clearMazerOAuthPersistedSession(runtime);
  const signOutResult = await awaitMazerOAuthRemoteOperation(
    () => client.auth.signOut({ scope: 'local' }),
    runtime
  );
  return storageCleared
    && signOutResult.status === 'resolved'
    && !signOutResult.value.error
    && clearMazerOAuthPersistedSession(runtime);
};

const MAZER_OAUTH_AUTH_STORAGE_KEYS = [
  'sb-bxtcuhkotumitoqtrcej-auth-token',
  'sb-bxtcuhkotumitoqtrcej-auth-token-code-verifier',
  'sb-bxtcuhkotumitoqtrcej-auth-token-user'
] as const;

const clearMazerOAuthPersistedSession = (runtime: MazerOAuthRuntime): boolean => {
  if (!runtime.authStorage) {
    return false;
  }
  try {
    for (const key of MAZER_OAUTH_AUTH_STORAGE_KEYS) {
      runtime.authStorage.removeItem(key);
    }
    return MAZER_OAUTH_AUTH_STORAGE_KEYS.every((key) => runtime.authStorage?.getItem(key) === null);
  } catch {
    return false;
  }
};

const writeMazerOAuthSessionQuarantine = (runtime: MazerOAuthRuntime, active: boolean): boolean => {
  try {
    if (active) {
      runtime.sessionStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, '1');
    } else {
      runtime.sessionStorage.removeItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY);
    }
    return runtime.sessionStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY) === (active ? '1' : null);
  } catch {
    return false;
  }
};

export const isMazerOAuthSessionQuarantined = (
  storage: MazerOAuthStorage | null = resolveMazerOAuthSessionStorage()
): boolean => {
  try {
    return storage?.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY) === '1';
  } catch {
    return true;
  }
};

const consumeMazerOAuthCallbackInner = async (
  callback: MazerOAuthCapturedCallback,
  runtime: MazerOAuthRuntime,
  getClient: () => Promise<MazerOAuthClient | null>
): Promise<MazerOAuthBootResult> => {
  if (!callback.requested) {
    return { status: 'none' };
  }

  let pending: MazerOAuthPendingRecord | null;
  let pendingRaw: string | null;
  let currentEpoch: number;
  try {
    pendingRaw = runtime.sessionStorage.getItem(MAZER_OAUTH_PENDING_KEY);
    pending = parsePendingRecord(pendingRaw);
    currentEpoch = readAuthMutationEpoch(runtime.sessionStorage);
  } catch {
    return failed('storage_unavailable');
  }
  if (pending === null) {
    const removal = removeExactPendingRecord(runtime.sessionStorage, pendingRaw);
    return failed(removal === 'failed' ? 'storage_unavailable' : 'expired_or_missing_state');
  }
  if (
    runtime.now() - pending.createdAtEpochMs < 0
    || runtime.now() - pending.createdAtEpochMs > MAZER_OAUTH_PENDING_TTL_MS
    || pending.authMutationEpoch !== currentEpoch
  ) {
    if (callback.state === pending.state) {
      const removal = removeExactPendingRecord(runtime.sessionStorage, pendingRaw);
      if (removal === 'failed') {
        return failed('storage_unavailable');
      }
    }
    return failed('expired_or_missing_state');
  }
  if (callback.state !== pending.state) {
    return failed('invalid_state');
  }

  const claimResult = removeExactPendingRecord(runtime.sessionStorage, pendingRaw);
  if (claimResult === 'changed' || claimResult === 'absent') {
    return failed('expired_or_missing_state');
  }
  if (claimResult === 'failed') {
    return failed('storage_unavailable');
  }

  if (callback.malformed) {
    return failed('invalid_state');
  }
  if (callback.providerError) {
    return failed('cancelled');
  }
  if (callback.code === null || callback.code.length === 0 || callback.code.length > 2_048) {
    return failed('authorization_unavailable');
  }

  const stillCurrent = (): boolean => {
    try {
      return readAuthMutationEpoch(runtime.sessionStorage) === pending?.authMutationEpoch;
    } catch {
      return false;
    }
  };
  if (!stillCurrent()) {
    return failed('expired_or_missing_state');
  }
  const tokens = await exchangeAuthorizationCode(callback.code, pending.codeVerifier, runtime);
  if (tokens === null || !stillCurrent()) {
    return failed(tokens === null ? 'exchange_unavailable' : 'expired_or_missing_state');
  }
  const clientResult = await awaitMazerOAuthRemoteOperation(getClient, runtime);
  if (clientResult.status !== 'resolved' || clientResult.value === null || !stillCurrent()) {
    return failed(clientResult.status === 'resolved' && !stillCurrent()
      ? 'expired_or_missing_state'
      : 'session_invalid');
  }
  const client = clientResult.value;
  const claimsOperation = await awaitMazerOAuthRemoteOperation(
    () => client.auth.getClaims(tokens.accessToken),
    runtime
  );
  if (claimsOperation.status !== 'resolved') {
    return failed('session_invalid');
  }
  const claimsResult = claimsOperation.value;
  const claims = claimsResult.data?.claims;
  if (claimsResult.error || claims === undefined || !stillCurrent()) {
    return failed('session_invalid');
  }
  const subject = validateClaims(tokens.accessToken, claims, runtime.now());
  if (subject === null) {
    return failed('session_invalid');
  }
  const remoteUserOperation = await awaitMazerOAuthRemoteOperation(
    () => client.auth.getUser(tokens.accessToken),
    runtime
  );
  if (remoteUserOperation.status !== 'resolved') {
    return failed('session_invalid');
  }
  const remoteUser = remoteUserOperation.value;
  if (remoteUser.error || remoteUser.data.user?.id !== subject || !stillCurrent()) {
    return failed('session_invalid');
  }
  if (!stillCurrent()) {
    return failed('expired_or_missing_state');
  }
  if (!writeMazerOAuthSessionQuarantine(runtime, true)) {
    return failed('storage_unavailable');
  }
  let setSessionPromise: ReturnType<MazerOAuthClient['auth']['setSession']>;
  try {
    setSessionPromise = client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    });
  } catch {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('storage_unavailable');
  }
  const setOperation = await awaitMazerOAuthRemoteOperation(() => setSessionPromise, runtime);
  if (setOperation.status !== 'resolved') {
    void setSessionPromise.then(
      () => bestEffortMazerOAuthLocalSignOut(client, runtime),
      () => bestEffortMazerOAuthLocalSignOut(client, runtime)
    );
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('storage_unavailable');
  }
  if (setOperation.value.error) {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('storage_unavailable');
  }
  if (!stillCurrent()) {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('expired_or_missing_state');
  }
  const postCommitOperation = await awaitMazerOAuthRemoteOperation(
    () => Promise.all([
      client.auth.getSession(),
      client.auth.getUser()
    ]),
    runtime
  );
  if (postCommitOperation.status !== 'resolved') {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('session_invalid');
  }
  const [sessionResult, sessionUser] = postCommitOperation.value;
  if (
    sessionResult.error
    || sessionUser.error
    || sessionResult.data.session?.user?.id !== subject
    || sessionUser.data.user?.id !== subject
    || !stillCurrent()
  ) {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('session_invalid');
  }
  if (!writeMazerOAuthSessionQuarantine(runtime, false)) {
    await bestEffortMazerOAuthLocalSignOut(client, runtime);
    return failed('storage_unavailable');
  }
  return { status: 'connected' };
};

export const consumeMazerOAuthCallback = async (
  callback: MazerOAuthCapturedCallback,
  getClient: () => Promise<MazerOAuthClient | null>,
  runtime?: MazerOAuthRuntime | null
): Promise<MazerOAuthBootResult> => {
  const resolution: MazerOAuthRuntimeResolution = runtime === undefined
    ? resolveBrowserRuntime()
    : runtime === null
      ? { result: failed('authorization_unavailable'), runtime: null }
      : { result: null, runtime };
  if (resolution.runtime === null) {
    mazerOAuthBootResult = resolution.result;
    return resolution.result;
  }

  let result: MazerOAuthBootResult;
  try {
    result = await consumeMazerOAuthCallbackInner(callback, resolution.runtime, getClient);
  } catch {
    result = failed('session_invalid');
  }
  mazerOAuthBootResult = result;
  return result;
};

export const readMazerOAuthBootResult = (): MazerOAuthBootResult => mazerOAuthBootResult;

export const installMazerOAuthPageShowRecovery = (
  lifecycle: MazerOAuthPageLifecycle,
  recover: () => void
): (() => void) => {
  const listener = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      recover();
    }
  };
  lifecycle.addEventListener('pageshow', listener);
  return () => lifecycle.removeEventListener('pageshow', listener);
};

export const navigateToMazerAccountPortal = (
  route: MazerAccountPortalRoute,
  location: Pick<MazerOAuthLocation, 'assign'> = window.location
): void => {
  location.assign(buildMazerAccountPortalUrl(route));
};

export const navigateToMazerLegalPortal = (
  route: MazerLegalRoute,
  location: Pick<MazerOAuthLocation, 'assign'> = window.location
): void => {
  location.assign(buildMazerLegalUrl(route));
};
