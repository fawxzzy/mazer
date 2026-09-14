import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_SIGNUP_USERNAME_INVALID_SENTINEL
} from './legacyPlayerMessage';
import {
  MAZER_OAUTH_AUTH_SESSION_KEY,
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  MAZER_OAUTH_SESSION_QUARANTINE_KEY,
  advanceMazerAuthMutationEpoch,
  advanceMazerSharedAuthMutationEpoch,
  isMazerOAuthSessionQuarantined,
  readMazerOAuthBootResult,
  recoverMazerOAuthSessionQuarantine,
  runMazerExclusiveAuthMutation
} from './legacyAccountPortal';
import { resolveLegacySupabaseSchemaForUrl } from './legacySupabaseSchemaBinding';

export const LEGACY_AUTH_REMEMBERED_IDENTITY_KEY = 'mazer.auth.remembered-identity.v1';
export const LEGACY_AUTH_GUEST_SCOPE = 'guest';
export const LEGACY_PASSWORD_RECOVERY_PATH = '/update-password';
export const LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS = 10_000;
export const LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS = LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS;

export type LegacyAuthStatus = 'guest' | 'authenticated' | 'unavailable';
export type LegacyAuthFormMode = 'login' | 'signup';
export type LegacyAuthFieldId = 'email' | 'password' | 'confirmPassword' | 'displayName' | 'username';
export type LegacyRememberedIdentitySessionState = 'ready' | 'reauth-required';

export interface LegacyAuthConfig {
  anonKey: string;
  url: string;
}

export interface LegacyAuthSessionSnapshot {
  canonicalUsername?: string | null;
  configured: boolean;
  displayName: string | null;
  email: string | null;
  error: string | null;
  info: string | null;
  status: LegacyAuthStatus;
  userId: string | null;
}

export interface LegacyAuthFormState {
  confirmPassword: string;
  displayName: string;
  email: string;
  mode: LegacyAuthFormMode;
  password: string;
  username: string;
}

export interface LegacyPasswordRecoveryUrlState {
  hasProviderError: boolean;
  requested: boolean;
}

let legacyPasswordRecoveryBootUrlState: LegacyPasswordRecoveryUrlState | null = null;
interface LegacyPasswordUpdateInFlight {
  password: string;
  promise: Promise<{ error: { message?: string | null } | null }>;
}

const legacyPasswordUpdatesInFlight = new WeakMap<LegacyPasswordUpdateClient, LegacyPasswordUpdateInFlight>();

export interface LegacyPasswordUpdateSubmitState extends LegacyAuthSubmitState {
  invalidFields: LegacyAuthFieldId[];
}

interface LegacyPasswordUpdateClient {
  auth: {
    updateUser: (attributes: { password: string }) => Promise<{
      error: { message?: string | null } | null;
    }>;
  };
}

export interface LegacyAuthSubmitState {
  canSubmit: boolean;
  reason: string | null;
}

export interface LegacySignUpMetadata {
  app_namespace: 'mazer';
  display_name: string;
  username: string;
}

export const resolveLegacyAuthInvalidFields = (
  form: LegacyAuthFormState
): LegacyAuthFieldId[] => {
  const invalidFields: LegacyAuthFieldId[] = [];

  if (form.mode === 'signup' && !LEGACY_USERNAME_PATTERN.test(form.username.trim())) {
    invalidFields.push('username');
  }
  if (!normalizeLegacyAuthEmail(form.email).includes('@')) {
    invalidFields.push('email');
  }
  if (form.password.length < 6) {
    invalidFields.push('password');
  }

  return invalidFields;
};

export interface LegacyAuthActionResult {
  snapshot: LegacyAuthSessionSnapshot;
}

export interface LegacyRememberedIdentityState {
  displayName: string;
  email: string;
  sessionState: LegacyRememberedIdentitySessionState;
  updatedAt: string;
}

export interface LegacyRememberedIdentityInput {
  displayName?: string | null;
  email: string;
  sessionState?: LegacyRememberedIdentitySessionState;
  updatedAt?: string;
}

export type LegacyAuthStateListener = (
  snapshot: LegacyAuthSessionSnapshot,
  event: AuthChangeEvent
) => void;

type LegacyAuthStorage = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;
type LegacyAuthClient = SupabaseClient<any, any, any>;
interface LegacyAuthDirectSignOutClient {
  admin: LegacyAuthAbortableTransport;
  storage: Storage;
  storageKey: string;
  _signOut: (options: { scope: 'local' }) => Promise<{
    error: { message?: string | null } | null;
  }>;
}
export interface LegacyAuthAbortableTransport {
  fetch: typeof fetch;
}

export interface LegacyAuthJsLockManager {
  request<T>(
    name: string,
    options: { ifAvailable?: true; mode: 'exclusive'; signal?: AbortSignal },
    callback: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T>;
}

export class LegacyAuthJsLockAcquireTimeoutError extends Error {
  public readonly isAcquireTimeout = true;

  public constructor(lockName: string) {
    super(`Timed out waiting for authentication lock "${lockName}".`);
    this.name = 'LegacyAuthJsLockAcquireTimeoutError';
  }
}

export class LegacyAuthJsLockUnavailableError extends Error {
  public constructor() {
    super('Browser authentication locking is unavailable.');
    this.name = 'LegacyAuthJsLockUnavailableError';
  }
}

const resolveLegacyAuthJsLockWaitMs = (acquireTimeout: number): number => {
  if (acquireTimeout === 0) {
    return 0;
  }
  return acquireTimeout < 0
    ? LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS
    : Math.min(acquireTimeout, LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS);
};

export const runLegacyAuthJsLock = async <T>(
  name: string,
  acquireTimeout: number,
  operation: () => T | Promise<T>,
  lockManager: LegacyAuthJsLockManager | null = (
    typeof navigator === 'undefined' || navigator.locks === undefined
      ? null
      : navigator.locks as LegacyAuthJsLockManager
  )
): Promise<T> => {
  if (lockManager === null) {
    throw new LegacyAuthJsLockUnavailableError();
  }

  const waitMs = resolveLegacyAuthJsLockWaitMs(acquireTimeout);
  if (waitMs === 0) {
    return lockManager.request(name, { ifAvailable: true, mode: 'exclusive' }, async (lock) => {
      if (lock === null) {
        throw new LegacyAuthJsLockAcquireTimeoutError(name);
      }
      return operation();
    });
  }

  const controller = new AbortController();
  let acquired = false;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, waitMs);

  try {
    return await lockManager.request(
      name,
      { mode: 'exclusive', signal: controller.signal },
      async (lock) => {
        acquired = true;
        clearTimeout(timeout);
        if (lock === null) {
          throw new LegacyAuthJsLockUnavailableError();
        }
        return operation();
      }
    );
  } catch (error) {
    if (timedOut && !acquired && error instanceof Error && error.name === 'AbortError') {
      throw new LegacyAuthJsLockAcquireTimeoutError(name);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const runLegacyAbortableCredentialRequest = async <T>(
  transport: LegacyAuthAbortableTransport,
  operation: () => Promise<T>,
  timeoutMs = LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS
): Promise<T> => {
  const originalFetch = transport.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  transport.fetch = (input, init) => originalFetch(input, {
    ...init,
    signal: controller.signal
  });
  try {
    return await operation();
  } finally {
    clearTimeout(timeout);
    transport.fetch = originalFetch;
  }
};

export const invokeLegacyLocalSignOutWithTimeout = async (
  auth: Partial<LegacyAuthDirectSignOutClient>,
  timeoutMs = LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS
): Promise<{ error: { message?: string | null } | null } | null> => {
  if (
    typeof auth._signOut !== 'function'
    || typeof auth.admin?.fetch !== 'function'
    || typeof auth.storage?.getItem !== 'function'
    || typeof auth.storage?.removeItem !== 'function'
    || typeof auth.storage?.setItem !== 'function'
    || typeof auth.storageKey !== 'string'
    || auth.storageKey.length === 0
  ) {
    return null;
  }
  const originalStorage = auth.storage;
  const verifyingStorage = {
    getItem: (key: string) => originalStorage.getItem(key),
    removeItem: (key: string) => {
      originalStorage.removeItem(key);
      if (key === auth.storageKey && originalStorage.getItem(key) !== null) {
        throw new Error('Authentication session removal could not be verified.');
      }
    },
    setItem: (key: string, value: string) => originalStorage.setItem(key, value)
  } as Storage;
  auth.storage = verifyingStorage;
  try {
    return await runLegacyAbortableCredentialRequest(
      auth.admin,
      () => auth._signOut!({ scope: 'local' }),
      timeoutMs
    );
  } finally {
    auth.storage = originalStorage;
  }
};

export const readLegacyPersistedAuthSessionSnapshot = (
  storage: Pick<Storage, 'getItem'> | null | undefined,
  env: Record<string, string | undefined> = readRuntimeEnv(),
  storageKey = MAZER_OAUTH_AUTH_SESSION_KEY
): LegacyAuthSessionSnapshot | null => {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(storageKey);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      parsed === null
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || typeof (parsed as Partial<Session>).user?.id !== 'string'
    ) {
      return null;
    }
    return createLegacyAuthSessionSnapshot(parsed as Session, env);
  } catch {
    return null;
  }
};

export const isLegacyPersistedAuthSessionRemoved = (
  storage: Pick<Storage, 'getItem'> | null | undefined,
  storageKey = MAZER_OAUTH_AUTH_SESSION_KEY
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(storageKey) === null;
  } catch {
    return false;
  }
};

const createGuestSnapshot = (
  configured: boolean,
  overrides: Partial<Omit<LegacyAuthSessionSnapshot, 'configured' | 'status' | 'userId'>> = {}
): LegacyAuthSessionSnapshot => ({
  canonicalUsername: null,
  configured,
  displayName: null,
  email: null,
  error: null,
  info: null,
  status: configured ? 'guest' : 'unavailable',
  userId: null,
  ...overrides
});

const readRuntimeEnv = (): Record<string, string | undefined> => {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env ?? {};

  return {
    ...env,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL
  };
};

export const resolveLegacyAuthConfig = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): LegacyAuthConfig | null => {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (url.length === 0 || anonKey.length === 0) {
    return null;
  }

  return { anonKey, url };
};

export const isLegacyAuthConfigured = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): boolean => resolveLegacyAuthConfig(env) !== null;

export const createLegacyGuestAuthSnapshot = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): LegacyAuthSessionSnapshot => createGuestSnapshot(isLegacyAuthConfigured(env));

const resolveDisplayName = (user: User): string | null => {
  const metadata = user.user_metadata;
  const candidates = [
    typeof metadata.username === 'string' ? metadata.username : null,
    typeof metadata.display_name === 'string' ? metadata.display_name : null,
    typeof metadata.full_name === 'string' ? metadata.full_name : null,
    user.email?.split('@')[0] ?? null
  ];

  return candidates.find((candidate) => candidate !== null && candidate.trim().length > 0)?.trim() ?? null;
};

const resolveCanonicalUsername = (user: User): string | null => {
  const username = user.user_metadata.username;
  return typeof username === 'string' && username.trim().length > 0
    ? username.trim()
    : null;
};

export const createLegacyAuthSessionSnapshot = (
  session: Session | null,
  env: Record<string, string | undefined> = readRuntimeEnv(),
  overrides: Partial<Pick<LegacyAuthSessionSnapshot, 'error' | 'info'>> = {}
): LegacyAuthSessionSnapshot => {
  const configured = isLegacyAuthConfigured(env);
  const user = session?.user ?? null;

  if (!configured) {
    return createGuestSnapshot(false, {
      info: LEGACY_AUTH_MESSAGE_COPY.authUnavailable,
      ...overrides
    });
  }

  if (!user) {
    return createGuestSnapshot(true, overrides);
  }

  return {
    canonicalUsername: resolveCanonicalUsername(user),
    configured,
    displayName: resolveDisplayName(user),
    email: user.email ?? null,
    error: overrides.error ?? null,
    info: overrides.info ?? null,
    status: 'authenticated',
    userId: user.id
  };
};

let legacyAuthClient: LegacyAuthClient | null = null;
let legacyAuthPersistenceListenerInstalled = false;
let legacyAuthStorageListenerInstalled = false;
let legacyAuthLastSessionSignature: string | null = null;
const legacyAuthLiveListeners = new Set<LegacyAuthStateListener>();

export const deriveLegacyRememberedIdentityDisplayName = (email: string): string => {
  const localPart = normalizeLegacyAuthEmail(email).split('@')[0] ?? '';
  const segments = localPart.split(/[._-]+/).filter(Boolean);
  const primarySegment = segments[0] ?? localPart;
  const normalized = primarySegment.trim().toLowerCase();
  return normalized.length > 0
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : 'Player';
};

export const buildLegacyRememberedIdentityState = (
  input: LegacyRememberedIdentityInput
): LegacyRememberedIdentityState => {
  const email = normalizeLegacyAuthEmail(input.email);
  return {
    displayName: input.displayName?.trim() || deriveLegacyRememberedIdentityDisplayName(email),
    email,
    sessionState: input.sessionState ?? 'reauth-required',
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
};

const readLegacyRememberedIdentityStorage = (
  storage: Pick<Storage, 'getItem'> | undefined
): string | null => {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY);
  } catch {
    return null;
  }
};

export const readLegacyRememberedIdentityState = (
  storage: Pick<Storage, 'getItem'> | undefined
): LegacyRememberedIdentityState | null => {
  const raw = readLegacyRememberedIdentityStorage(storage);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') {
      const email = normalizeLegacyAuthEmail(parsed);
      return email ? buildLegacyRememberedIdentityState({ email }) : null;
    }
    if (parsed !== null && typeof parsed === 'object') {
      const value = parsed as Partial<LegacyRememberedIdentityState>;
      const email = typeof value.email === 'string' ? normalizeLegacyAuthEmail(value.email) : '';
      if (!email) {
        return null;
      }
      return buildLegacyRememberedIdentityState({
        displayName: typeof value.displayName === 'string' ? value.displayName : null,
        email,
        sessionState: value.sessionState === 'ready' ? 'ready' : 'reauth-required',
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined
      });
    }
  } catch {
    const email = normalizeLegacyAuthEmail(raw);
    return email ? buildLegacyRememberedIdentityState({ email }) : null;
  }

  return null;
};

export const writeLegacyRememberedIdentityState = (
  storage: LegacyAuthStorage | undefined,
  input: LegacyRememberedIdentityInput
): LegacyRememberedIdentityState | null => {
  if (!storage) {
    return null;
  }

  const state = buildLegacyRememberedIdentityState(input);
  if (!state.email) {
    return null;
  }

  try {
    storage.setItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY, JSON.stringify(state));
  } catch {
    // Remembered identity is a convenience only; auth depends on Supabase session storage.
  }

  return state;
};

export const syncLegacyRememberedIdentityFromAuthenticatedSession = (
  storage: LegacyAuthStorage | undefined,
  snapshot: Pick<LegacyAuthSessionSnapshot, 'displayName' | 'email' | 'status'>
): LegacyRememberedIdentityState | null => {
  if (snapshot.status !== 'authenticated' || !snapshot.email) {
    return null;
  }

  return writeLegacyRememberedIdentityState(storage, {
    displayName: snapshot.displayName,
    email: snapshot.email,
    sessionState: 'ready'
  });
};

export const markLegacyRememberedIdentityReauthRequired = (
  storage: LegacyAuthStorage | undefined
): LegacyRememberedIdentityState | null => {
  const remembered = readLegacyRememberedIdentityState(storage);
  if (!remembered) {
    return null;
  }

  return writeLegacyRememberedIdentityState(storage, {
    displayName: remembered.displayName,
    email: remembered.email,
    sessionState: 'reauth-required'
  });
};

const resolveLegacyAuthSessionSignature = (session: Session | null): string | null => {
  if (!session?.user?.id) {
    return null;
  }

  return `${session.user.id}:${session.expires_at ?? 0}`;
};

const syncLegacyAuthPersistenceFromSession = (
  session: Session | null,
  event: AuthChangeEvent | 'BOOTSTRAP_SESSION' | 'CROSS_TAB_SESSION',
  env: Record<string, string | undefined> = readRuntimeEnv()
): LegacyAuthSessionSnapshot => {
  const snapshot = createLegacyAuthSessionSnapshot(session, env);
  const storage = typeof window === 'undefined' ? undefined : window.localStorage;
  const signature = resolveLegacyAuthSessionSignature(session);

  if (signature && signature !== legacyAuthLastSessionSignature) {
    legacyAuthLastSessionSignature = signature;
    syncLegacyRememberedIdentityFromAuthenticatedSession(storage, snapshot);
  }

  if (!signature && legacyAuthLastSessionSignature) {
    legacyAuthLastSessionSignature = null;
    markLegacyRememberedIdentityReauthRequired(storage);
  }

  if (event === 'SIGNED_OUT') {
    legacyAuthLastSessionSignature = null;
    markLegacyRememberedIdentityReauthRequired(storage);
  }

  return snapshot;
};

export const reconcileLegacyAuthStorageSession = async (
  loadSession: () => Promise<Session | null>,
  listeners: Iterable<LegacyAuthStateListener>,
  isQuarantined: () => boolean = isMazerOAuthSessionQuarantined,
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<boolean> => {
  if (isQuarantined()) {
    return false;
  }
  const session = await loadSession();
  if (isQuarantined()) {
    return false;
  }
  const snapshot = syncLegacyAuthPersistenceFromSession(session, 'CROSS_TAB_SESSION', env);
  const event: AuthChangeEvent = session === null ? 'SIGNED_OUT' : 'SIGNED_IN';
  for (const listener of listeners) {
    try {
      listener(snapshot, event);
    } catch {
      // One consumer cannot block the remaining open tabs from reconciling.
    }
  }
  return true;
};

export const isLegacyAuthStorageEventKey = (
  eventKey: string | null,
  authStorageKey: unknown
): boolean => (
  (
    typeof authStorageKey === 'string'
    && authStorageKey.length > 0
    && eventKey === authStorageKey
  )
  || eventKey === MAZER_OAUTH_SESSION_QUARANTINE_KEY
);

const installLegacyAuthPersistenceListener = (client: LegacyAuthClient): void => {
  if (legacyAuthPersistenceListenerInstalled) {
    return;
  }

  legacyAuthPersistenceListenerInstalled = true;
  client.auth.onAuthStateChange((event, session) => {
    if (isMazerOAuthSessionQuarantined()) {
      return;
    }
    syncLegacyAuthPersistenceFromSession(session, event);
  });
  void client.auth.getSession()
    .then(({ data }) => {
      if (isMazerOAuthSessionQuarantined()) {
        return;
      }
      syncLegacyAuthPersistenceFromSession(data.session, 'BOOTSTRAP_SESSION');
    })
    .catch(() => {
      // Bootstrap session sync is best-effort; explicit auth reads still drive UI state.
    });
  if (typeof window !== 'undefined' && !legacyAuthStorageListenerInstalled) {
    legacyAuthStorageListenerInstalled = true;
    const authStorageKey = (client.auth as unknown as Partial<LegacyAuthDirectSignOutClient>).storageKey;
    window.addEventListener('storage', (event) => {
      if (
        !isLegacyAuthStorageEventKey(event.key, authStorageKey)
        || isMazerOAuthSessionQuarantined()
      ) {
        return;
      }
      void reconcileLegacyAuthStorageSession(
        async () => (await client.auth.getSession()).data.session,
        legacyAuthLiveListeners
      )
        .catch(() => {
          // The next explicit auth read retries reconciliation.
        });
    });
  }
};

export const getLegacyAuthClient = async (): Promise<LegacyAuthClient | null> => {
  const config = resolveLegacyAuthConfig();
  if (!config) {
    return null;
  }

  if (legacyAuthClient === null) {
    // Fail closed: which schema holds Mazer's tables is project-specific
    // (see legacySupabaseSchemaBinding.ts) and must never be assumed. An
    // unrecognized project ref -- e.g. VITE_SUPABASE_URL pointing at a
    // project this table doesn't know about -- means "cannot safely
    // construct a client", treated identically to "not configured" rather
    // than guessing a schema and silently reading/writing the wrong data
    // (or, as happened in production, asking a project for a schema it was
    // never configured to expose and getting a blanket 406 on every call).
    const schema = resolveLegacySupabaseSchemaForUrl(config.url);
    if (schema === null) {
      return null;
    }

    const { createClient } = await import('@supabase/supabase-js');
    legacyAuthClient = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: isLegacyPasswordRecoveryRuntimeLocation(),
        persistSession: true,
        storage: typeof window === 'undefined' ? undefined : window.localStorage,
        // Preserve auth-js's caller-supplied lock identity and queue normal
        // same-session contention. Its negative "wait forever" request is
        // capped so a stale browser holder cannot freeze account hydration;
        // true acquisition timeouts retain auth-js's isAcquireTimeout contract.
        // OAuth commit/rollback uses the same storage-derived lock name, but
        // keeps its fail-fast acquisition policy while auth-js queues.
        lock: runLegacyAuthJsLock
      },
      db: {
        schema
      }
    });
    installLegacyAuthPersistenceListener(legacyAuthClient);
  }

  return legacyAuthClient;
};

export const isLegacyPasswordRecoveryRuntimeLocation = (
  location: Pick<Location, 'pathname'> | undefined = typeof window === 'undefined' ? undefined : window.location
): boolean => (
  location?.pathname.replace(/\/+$/, '') === LEGACY_PASSWORD_RECOVERY_PATH
);

export const readLegacyAuthSessionSnapshot = async (): Promise<LegacyAuthSessionSnapshot> => {
  const oauthBootResult = readMazerOAuthBootResult();
  if (isMazerOAuthSessionQuarantined()) {
    await recoverMazerOAuthSessionQuarantine();
    if (isMazerOAuthSessionQuarantined()) {
      return { ...createLegacyGuestAuthSnapshot(), error: MAZER_OAUTH_SAFE_ERROR_MESSAGE };
    }
  }
  const client = await getLegacyAuthClient();
  if (!client) {
    const guestSnapshot = createLegacyGuestAuthSnapshot();
    return oauthBootResult.status === 'failed'
      ? { ...guestSnapshot, error: MAZER_OAUTH_SAFE_ERROR_MESSAGE }
      : guestSnapshot;
  }

  let sessionResult: Awaited<ReturnType<LegacyAuthClient['auth']['getSession']>>;
  try {
    sessionResult = await client.auth.getSession();
  } catch {
    return { ...createLegacyGuestAuthSnapshot(), error: MAZER_OAUTH_SAFE_ERROR_MESSAGE };
  }
  const { data, error } = sessionResult;
  if (isMazerOAuthSessionQuarantined()) {
    return { ...createLegacyGuestAuthSnapshot(), error: MAZER_OAUTH_SAFE_ERROR_MESSAGE };
  }
  const snapshot = createLegacyAuthSessionSnapshot(data.session, undefined, {
    error: oauthBootResult.status === 'failed'
      ? MAZER_OAUTH_SAFE_ERROR_MESSAGE
      : error?.message ?? null,
    info: oauthBootResult.status === 'connected' ? 'Account connected.' : null
  });
  if (snapshot.status === 'authenticated') {
    syncLegacyRememberedIdentityFromAuthenticatedSession(
      typeof window === 'undefined' ? undefined : window.localStorage,
      snapshot
    );
  } else {
    markLegacyRememberedIdentityReauthRequired(
      typeof window === 'undefined' ? undefined : window.localStorage
    );
  }
  return snapshot;
};

const createLegacyAuthMutationUnavailableResult = (): LegacyAuthActionResult => ({
  snapshot: createGuestSnapshot(false, {
    error: LEGACY_AUTH_MESSAGE_COPY.authUnavailable
  })
});

const prepareLegacyAuthDirectSessionMutation = (): LegacyAuthActionResult | null => {
  if (advanceMazerSharedAuthMutationEpoch() === null) {
    return createLegacyAuthMutationUnavailableResult();
  }
  if (advanceMazerAuthMutationEpoch() === null) {
    return createLegacyAuthMutationUnavailableResult();
  }
  return null;
};

const runLegacyAuthJsSessionMutation = async (
  operation: () => Promise<LegacyAuthActionResult>
): Promise<LegacyAuthActionResult> => {
  try {
    const unavailable = prepareLegacyAuthDirectSessionMutation();
    return unavailable ?? await operation();
  } catch {
    return createLegacyAuthMutationUnavailableResult();
  }
};

const runLegacyAuthDirectSessionMutation = async (
  operation: () => Promise<LegacyAuthActionResult>
): Promise<LegacyAuthActionResult> => {
  const result = await runMazerExclusiveAuthMutation(async () => {
    // Direct internal auth operations bypass auth-js's public lock hook, so
    // they retain an explicit outer acquisition of the shared session lock.
    try {
      const unavailable = prepareLegacyAuthDirectSessionMutation();
      if (unavailable !== null) {
        return unavailable;
      }
      return await operation();
    } catch {
      return createLegacyAuthMutationUnavailableResult();
    }
  });
  return result.status === 'completed'
    ? result.value
    : createLegacyAuthMutationUnavailableResult();
};

export const signInLegacyAuth = async (
  email: string,
  password: string
): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured
      })
    };
  }

  return runLegacyAuthJsSessionMutation(async () => {
    const transport = client.auth as unknown as Partial<LegacyAuthAbortableTransport>;
    if (typeof transport.fetch !== 'function') {
      return createLegacyAuthMutationUnavailableResult();
    }
    const { data, error } = await runLegacyAbortableCredentialRequest(
      transport as LegacyAuthAbortableTransport,
      () => client.auth.signInWithPassword({
        email: normalizeLegacyAuthEmail(email),
        password
      })
    );

    const snapshot = createLegacyAuthSessionSnapshot(data.session, undefined, {
      error: error?.message ?? null,
      info: error ? null : LEGACY_AUTH_MESSAGE_COPY.signedIn
    });
    if (snapshot.status === 'authenticated') {
      syncLegacyRememberedIdentityFromAuthenticatedSession(
        typeof window === 'undefined' ? undefined : window.localStorage,
        snapshot
      );
    }

    return { snapshot };
  });
};

export const signUpLegacyAuth = async (
  email: string,
  password: string,
  username: string
): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: LEGACY_AUTH_MESSAGE_COPY.signupNotConfigured
      })
    };
  }

  const metadata = buildLegacySignUpMetadata(username);
  if (!metadata) {
    return {
      snapshot: createGuestSnapshot(true, {
        error: LEGACY_SIGNUP_USERNAME_INVALID_SENTINEL
      })
    };
  }

  return runLegacyAuthJsSessionMutation(async () => {
    const transport = client.auth as unknown as Partial<LegacyAuthAbortableTransport>;
    if (typeof transport.fetch !== 'function') {
      return createLegacyAuthMutationUnavailableResult();
    }
    const { data, error } = await runLegacyAbortableCredentialRequest(
      transport as LegacyAuthAbortableTransport,
      () => client.auth.signUp({
        email: normalizeLegacyAuthEmail(email),
        password,
        options: { data: metadata }
      })
    );

    const info = resolveLegacySignUpInfo(Boolean(error), Boolean(data.session));
    const snapshot = createLegacyAuthSessionSnapshot(data.session, undefined, {
      error: error?.message ?? null,
      info
    });
    if (snapshot.status === 'authenticated') {
      syncLegacyRememberedIdentityFromAuthenticatedSession(
        typeof window === 'undefined' ? undefined : window.localStorage,
        snapshot
      );
    }

    return { snapshot };
  });
};

export const requestLegacyPasswordReset = async (email: string): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: LEGACY_AUTH_MESSAGE_COPY.passwordResetNotConfigured
      })
    };
  }

  const redirectTo = typeof window === 'undefined'
    ? undefined
    : resolveLegacyPasswordRecoveryRedirectUrl(window.location.origin);
  const { error } = await client.auth.resetPasswordForEmail(normalizeLegacyAuthEmail(email), {
    redirectTo
  });

  return {
    snapshot: createGuestSnapshot(true, {
      error: error?.message ?? null,
      info: error ? null : LEGACY_AUTH_MESSAGE_COPY.passwordResetSent
    })
  };
};

export const resolveLegacyPasswordRecoveryRedirectUrl = (origin: string): string => (
  `${origin.replace(/\/$/, '')}${LEGACY_PASSWORD_RECOVERY_PATH}`
);

export const resolveLegacyPasswordRecoveryUrlState = (
  location: Pick<Location, 'hash' | 'pathname' | 'search'> | undefined = (
    typeof window === 'undefined' ? undefined : window.location
  )
): LegacyPasswordRecoveryUrlState => {
  if (!location) {
    return { hasProviderError: false, requested: false };
  }

  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const isRecoveryPath = location.pathname.replace(/\/+$/, '') === LEGACY_PASSWORD_RECOVERY_PATH;
  const hasProviderError = [query, fragment].some((params) => (
    params.has('error') || params.has('error_code') || params.has('error_description')
  ));
  const hasRecoveryCredential = [query, fragment].some((params) => (
    params.has('code')
    || params.has('access_token')
    || params.has('refresh_token')
  ));

  return {
    hasProviderError,
    requested: isRecoveryPath && (hasRecoveryCredential || hasProviderError)
  };
};

export const captureLegacyPasswordRecoveryBootUrlState = (
  location: Pick<Location, 'hash' | 'pathname' | 'search'> | undefined = (
    typeof window === 'undefined' ? undefined : window.location
  )
): LegacyPasswordRecoveryUrlState => {
  const state = resolveLegacyPasswordRecoveryUrlState(location);
  legacyPasswordRecoveryBootUrlState = state.requested ? state : null;
  return state;
};

export const readLegacyPasswordRecoveryBootUrlState = (
  location: Pick<Location, 'hash' | 'pathname' | 'search'> | undefined = (
    typeof window === 'undefined' ? undefined : window.location
  )
): LegacyPasswordRecoveryUrlState => {
  const liveState = resolveLegacyPasswordRecoveryUrlState(location);
  return liveState.requested ? liveState : legacyPasswordRecoveryBootUrlState ?? liveState;
};

export const resolveLegacyPasswordRecoveryCleanUrl = (
  origin: string,
  outcome: 'continue' | 'invalid'
): string => outcome === 'continue'
  ? `${origin.replace(/\/$/, '')}/`
  : resolveLegacyPasswordRecoveryRedirectUrl(origin);

export const resolveLegacyPasswordRecoveryEnterAction = (
  fieldId: LegacyAuthFieldId,
  requested = false
): 'focus-confirmation' | 'submit' | null => {
  if (!requested) {
    return null;
  }

  return fieldId === 'password'
    ? 'focus-confirmation'
    : fieldId === 'confirmPassword'
      ? 'submit'
      : null;
};

interface LegacyPasswordUpdateOptions {
  timeoutMs?: number;
}

const invokeLegacyPasswordUpdateWithTimeout = async (
  client: LegacyPasswordUpdateClient,
  password: string,
  timeoutMs: number
): Promise<{ error: { message?: string | null } | null }> => new Promise((resolve) => {
  let inFlight = legacyPasswordUpdatesInFlight.get(client);
  if (inFlight && inFlight.password !== password) {
    resolve({ error: { message: 'A previous password update is still pending. Please wait before trying a different password.' } });
    return;
  }

  if (!inFlight) {
    const update = Promise.resolve().then(() => client.auth.updateUser({ password })).catch((caught: unknown) => ({
      error: {
        message: caught instanceof Error
          ? caught.message
          : 'Failed to update password. Please try again.'
      }
    }));
    inFlight = { password, promise: update };
    legacyPasswordUpdatesInFlight.set(client, inFlight);
    void update.then(() => {
      if (legacyPasswordUpdatesInFlight.get(client)?.promise === update) {
        legacyPasswordUpdatesInFlight.delete(client);
      }
    });
  }

  const update = inFlight.promise;

  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    resolve({ error: { message: 'Password update timed out.' } });
  }, timeoutMs);

  void update.then((result) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    resolve(result);
  });
});

export const clearLegacyPasswordRecoveryUrl = (outcome: 'continue' | 'invalid'): void => {
  legacyPasswordRecoveryBootUrlState = null;
  if (typeof window === 'undefined') {
    return;
  }

  window.history.replaceState(
    window.history.state,
    '',
    resolveLegacyPasswordRecoveryCleanUrl(window.location.origin, outcome)
  );
};

export const resolveLegacyPasswordUpdateSubmitState = (
  password: string,
  confirmPassword: string,
  configured: boolean
): LegacyPasswordUpdateSubmitState => {
  if (!configured) {
    return {
      canSubmit: false,
      invalidFields: [],
      reason: LEGACY_AUTH_MESSAGE_COPY.passwordResetNotConfigured
    };
  }

  const invalidFields: LegacyAuthFieldId[] = [];
  if (password.length < 6) {
    invalidFields.push('password');
  }
  if (confirmPassword !== password) {
    invalidFields.push('confirmPassword');
  }

  return {
    canSubmit: invalidFields.length === 0,
    invalidFields,
    reason: password.length < 6
      ? LEGACY_AUTH_MESSAGE_COPY.passwordMinimum
      : confirmPassword !== password
        ? LEGACY_AUTH_MESSAGE_COPY.passwordMismatch
        : null
  };
};

export const updateLegacyPasswordWithClient = async (
  client: LegacyPasswordUpdateClient,
  password: string,
  confirmPassword = password,
  options: LegacyPasswordUpdateOptions = {}
): Promise<{ error: string | null; ok: boolean }> => {
  const submitState = resolveLegacyPasswordUpdateSubmitState(password, confirmPassword, true);
  if (!submitState.canSubmit) {
    return { error: submitState.reason, ok: false };
  }

  const { timeoutMs = 3000 } = options;
  const { error } = await invokeLegacyPasswordUpdateWithTimeout(client, password, timeoutMs);

  return {
    error: error?.message ?? null,
    ok: error === null
  };
};

export const updateLegacyPassword = async (
  password: string
): Promise<{ error: string | null; ok: boolean }> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      error: LEGACY_AUTH_MESSAGE_COPY.passwordResetNotConfigured,
      ok: false
    };
  }

  return updateLegacyPasswordWithClient(client, password);
};

export const signOutLegacyAuth = async (
  authenticatedFallback?: LegacyAuthSessionSnapshot
): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false)
    };
  }

  return runLegacyAuthDirectSessionMutation(async () => {
    // Supabase auth-js's public signOut() reacquires its configured lock. That
    // would force this transaction to release between generation invalidation
    // and session removal. The pinned client exposes the same protected
    // implementation used by signOut(); invoke it only while our exact common
    // lock is already held, and fail closed if the pinned seam ever changes.
    const directSignOut = client.auth as unknown as Partial<LegacyAuthDirectSignOutClient>;
    const authStorage = directSignOut.storage ?? null;
    const authStorageKey = directSignOut.storageKey;
    const authenticatedPreimage = readLegacyPersistedAuthSessionSnapshot(authStorage, undefined, authStorageKey)
      ?? (authenticatedFallback?.status === 'authenticated' ? authenticatedFallback : null);
    const preserveAuthenticatedPreimage = (message?: string | null): LegacyAuthActionResult => ({
      snapshot: authenticatedPreimage === null
        ? createLegacyAuthMutationUnavailableResult().snapshot
        : { ...authenticatedPreimage, error: message ?? LEGACY_AUTH_MESSAGE_COPY.authUnavailable, info: null }
    });
    let result: Awaited<ReturnType<typeof invokeLegacyLocalSignOutWithTimeout>>;
    try {
      result = await invokeLegacyLocalSignOutWithTimeout(directSignOut);
    } catch {
      if (!isLegacyPersistedAuthSessionRemoved(authStorage, authStorageKey)) {
        return preserveAuthenticatedPreimage();
      }
      result = { error: null };
    }
    if (result === null) {
      return preserveAuthenticatedPreimage();
    }
    const { error } = result;
    if (error) {
      return preserveAuthenticatedPreimage(error.message);
    }
    if (!isLegacyPersistedAuthSessionRemoved(authStorage, authStorageKey)) {
      return preserveAuthenticatedPreimage();
    }

    legacyAuthLastSessionSignature = null;
    markLegacyRememberedIdentityReauthRequired(authStorage ?? undefined);

    return {
      snapshot: createGuestSnapshot(true, {
        info: LEGACY_AUTH_MESSAGE_COPY.signedOut
      })
    };
  });
};

export const subscribeLegacyAuthState = (
  listener: LegacyAuthStateListener
): Promise<(() => void) | null> => getLegacyAuthClient().then((client) => {
  if (!client) {
    return null;
  }

  legacyAuthLiveListeners.add(listener);
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (isMazerOAuthSessionQuarantined()) {
      listener({ ...createLegacyGuestAuthSnapshot(), error: MAZER_OAUTH_SAFE_ERROR_MESSAGE }, event);
      return;
    }
    const snapshot = createLegacyAuthSessionSnapshot(session);
    if (snapshot.status === 'authenticated') {
      syncLegacyRememberedIdentityFromAuthenticatedSession(
        typeof window === 'undefined' ? undefined : window.localStorage,
        snapshot
      );
    }
    listener(snapshot, event);
  });

  return () => {
    legacyAuthLiveListeners.delete(listener);
    data.subscription.unsubscribe();
  };
});

export const normalizeLegacyAuthEmail = (email: string): string => email.trim().toLowerCase();

export const createEmptyLegacyAuthFormState = (
  mode: LegacyAuthFormMode,
  rememberedEmail = ''
): LegacyAuthFormState => ({
  confirmPassword: '',
  displayName: '',
  email: rememberedEmail,
  mode,
  password: '',
  username: ''
});

export const resolveLegacyAuthSubmitState = (
  form: LegacyAuthFormState,
  configured: boolean
): LegacyAuthSubmitState => {
  if (!configured) {
    return {
      canSubmit: false,
      reason: LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured
    };
  }

  if (form.mode === 'signup' && form.username.trim().length === 0) {
    return {
      canSubmit: false,
      reason: LEGACY_AUTH_MESSAGE_COPY.usernameRequired
    };
  }

  if (form.mode === 'signup' && !LEGACY_USERNAME_PATTERN.test(form.username.trim())) {
    return {
      canSubmit: false,
      reason: LEGACY_AUTH_MESSAGE_COPY.usernameInvalid
    };
  }

  if (!normalizeLegacyAuthEmail(form.email).includes('@')) {
    return {
      canSubmit: false,
      reason: LEGACY_AUTH_MESSAGE_COPY.enterEmail
    };
  }

  if (form.password.length < 6) {
    return {
      canSubmit: false,
      reason: LEGACY_AUTH_MESSAGE_COPY.passwordMinimum
    };
  }

  return {
    canSubmit: true,
    reason: null
  };
};

export const readLegacyRememberedIdentity = (
  storage: Pick<Storage, 'getItem'> | undefined
): string => {
  return readLegacyRememberedIdentityState(storage)?.email ?? '';
};

export const writeLegacyRememberedIdentity = (
  storage: LegacyAuthStorage | undefined,
  email: string
): void => {
  writeLegacyRememberedIdentityState(storage, { email });
};

export const resolveLegacyAuthAccountLabel = (
  snapshot: LegacyAuthSessionSnapshot
): string => {
  if (snapshot.status === 'authenticated') {
    return snapshot.displayName ?? snapshot.email ?? 'Account';
  }

  if (snapshot.configured) {
    return 'Guest';
  }

  return 'Guest';
};

const sanitizeStorageScopePart = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');

export const resolveLegacyAuthStorageScope = (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'userId'>
): string => (
  snapshot.userId ? `user:${sanitizeStorageScopePart(snapshot.userId)}` : LEGACY_AUTH_GUEST_SCOPE
);

export const resolveLegacyAuthScopedStorageKey = (
  baseKey: string,
  snapshot: Pick<LegacyAuthSessionSnapshot, 'userId'>
): string => `${baseKey}:${resolveLegacyAuthStorageScope(snapshot)}`;

export const createLegacyAuthScopedStorage = (
  storage: LegacyAuthStorage | undefined,
  baseKey: string,
  snapshot: Pick<LegacyAuthSessionSnapshot, 'userId'>
): LegacyAuthStorage | undefined => {
  if (!storage) {
    return undefined;
  }

  const scopedKey = resolveLegacyAuthScopedStorageKey(baseKey, snapshot);
  return {
    getItem: (key: string) => storage.getItem(key === baseKey ? scopedKey : key),
    setItem: (key: string, value: string) => storage.setItem(key === baseKey ? scopedKey : key, value)
  };
};

// Matches the mazer_profiles.username check constraint exactly (2-15
// chars, alphanumeric plus ._- ) -- same shape as Fitness's own username
// pattern, for instant client-side feedback before ever calling the
// availability RPC.
export const LEGACY_USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,15}$/;

export const buildLegacySignUpMetadata = (
  username: unknown
): LegacySignUpMetadata | null => {
  if (typeof username !== 'string') {
    return null;
  }
  const candidate = username.trim();
  if (!LEGACY_USERNAME_PATTERN.test(candidate)) {
    return null;
  }

  return {
    app_namespace: 'mazer',
    display_name: candidate,
    username: candidate
  };
};

export const resolveLegacySignUpInfo = (
  hasError: boolean,
  hasSession: boolean
): string | null => hasError
  ? null
  : hasSession
    ? LEGACY_AUTH_MESSAGE_COPY.accountCreated
    : LEGACY_AUTH_MESSAGE_COPY.verifyEmail;

export const readLegacyAccountUsername = async (
  userId: string
): Promise<{ error: string | null; username: string | null }> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return { error: LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured, username: null };
  }

  const { data, error } = await client
    .from('mazer_profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    error: error?.message ?? null,
    username: typeof data?.username === 'string' ? data.username : null
  };
};

// Best-effort UX only -- mazer_is_username_available is a SECURITY DEFINER
// RPC that bypasses RLS just enough to answer "is this taken" without
// exposing any other user's actual profile row. The unique index on
// mazer_profiles(lower(username)) is the real source of truth; a race
// between two clients checking the same name still resolves correctly at
// save time below (whichever save lands second gets error code 23505).
export const checkLegacyUsernameAvailable = async (
  candidate: string
): Promise<{ available: boolean | null; error: string | null }> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return { available: null, error: LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured };
  }

  const { data, error } = await client.rpc('mazer_is_username_available', { candidate });
  if (error) {
    return { available: null, error: error.message };
  }

  return { available: data === true, error: null };
};

export const saveLegacyAccountUsername = async (
  userId: string,
  username: string
): Promise<{ error: string | null; ok: boolean }> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return { error: LEGACY_AUTH_MESSAGE_COPY.loginNotConfigured, ok: false };
  }

  // Direct authenticated writes to mazer_profiles are intentionally revoked.
  // Route the rename through the auth-bound definer so it can update only the
  // caller's row, preserve every unrelated profile field, and let the unique
  // index remain the final collision authority.
  const { error } = await client.rpc('mazer_set_username', {
    p_expected_user_id: userId,
    p_username: username
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'That username is already taken.', ok: false };
    }
    return { error: error.message, ok: false };
  }

  return { error: null, ok: true };
};
