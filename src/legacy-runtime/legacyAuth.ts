import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { LEGACY_AUTH_MESSAGE_COPY } from './legacyPlayerMessage';

export const LEGACY_AUTH_REMEMBERED_IDENTITY_KEY = 'mazer.auth.remembered-identity.v1';
export const LEGACY_AUTH_GUEST_SCOPE = 'guest';

export type LegacyAuthStatus = 'guest' | 'authenticated' | 'unavailable';
export type LegacyAuthFormMode = 'login' | 'signup';
export type LegacyAuthFieldId = 'email' | 'password' | 'displayName';
export type LegacyRememberedIdentitySessionState = 'ready' | 'reauth-required';

export interface LegacyAuthConfig {
  anonKey: string;
  url: string;
}

export interface LegacyAuthSessionSnapshot {
  configured: boolean;
  displayName: string | null;
  email: string | null;
  error: string | null;
  info: string | null;
  status: LegacyAuthStatus;
  userId: string | null;
}

export interface LegacyAuthFormState {
  displayName: string;
  email: string;
  mode: LegacyAuthFormMode;
  password: string;
}

export interface LegacyAuthSubmitState {
  canSubmit: boolean;
  reason: string | null;
}

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

const createGuestSnapshot = (
  configured: boolean,
  overrides: Partial<Omit<LegacyAuthSessionSnapshot, 'configured' | 'status' | 'userId'>> = {}
): LegacyAuthSessionSnapshot => ({
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
    typeof metadata.display_name === 'string' ? metadata.display_name : null,
    typeof metadata.full_name === 'string' ? metadata.full_name : null,
    user.email?.split('@')[0] ?? null
  ];

  return candidates.find((candidate) => candidate !== null && candidate.trim().length > 0)?.trim() ?? null;
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
    configured,
    displayName: resolveDisplayName(user),
    email: user.email ?? null,
    error: overrides.error ?? null,
    info: overrides.info ?? null,
    status: 'authenticated',
    userId: user.id
  };
};

let legacyAuthClient: SupabaseClient | null = null;
let legacyAuthPersistenceListenerInstalled = false;
let legacyAuthLastSessionSignature: string | null = null;

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
  event: AuthChangeEvent | 'BOOTSTRAP_SESSION'
): LegacyAuthSessionSnapshot => {
  const snapshot = createLegacyAuthSessionSnapshot(session);
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

const installLegacyAuthPersistenceListener = (client: SupabaseClient): void => {
  if (legacyAuthPersistenceListenerInstalled) {
    return;
  }

  legacyAuthPersistenceListenerInstalled = true;
  client.auth.onAuthStateChange((event, session) => {
    syncLegacyAuthPersistenceFromSession(session, event);
  });
  void client.auth.getSession()
    .then(({ data }) => {
      syncLegacyAuthPersistenceFromSession(data.session, 'BOOTSTRAP_SESSION');
    })
    .catch(() => {
      // Bootstrap session sync is best-effort; explicit auth reads still drive UI state.
    });
};

export const getLegacyAuthClient = async (): Promise<SupabaseClient | null> => {
  const config = resolveLegacyAuthConfig();
  if (!config) {
    return null;
  }

  if (legacyAuthClient === null) {
    const { createClient } = await import('@supabase/supabase-js');
    legacyAuthClient = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: typeof window === 'undefined' ? undefined : window.localStorage
      }
    });
    installLegacyAuthPersistenceListener(legacyAuthClient);
  }

  return legacyAuthClient;
};

export const readLegacyAuthSessionSnapshot = async (): Promise<LegacyAuthSessionSnapshot> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyGuestAuthSnapshot();
  }

  const { data, error } = await client.auth.getSession();
  const snapshot = createLegacyAuthSessionSnapshot(data.session, undefined, {
    error: error?.message ?? null
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

  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeLegacyAuthEmail(email),
    password
  });

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

  return {
    snapshot
  };
};

export const signUpLegacyAuth = async (
  email: string,
  password: string,
  displayName: string
): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: LEGACY_AUTH_MESSAGE_COPY.signupNotConfigured
      })
    };
  }

  const normalizedDisplayName = displayName.trim();
  const { data, error } = await client.auth.signUp({
    email: normalizeLegacyAuthEmail(email),
    password,
    options: normalizedDisplayName.length > 0
      ? { data: { display_name: normalizedDisplayName } }
      : undefined
  });

  const info = error
    ? null
    : data.session
      ? LEGACY_AUTH_MESSAGE_COPY.accountCreated
      : LEGACY_AUTH_MESSAGE_COPY.verifyEmail;
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

  return {
    snapshot
  };
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

  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin;
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

export const signOutLegacyAuth = async (): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false)
    };
  }

  const { error } = await client.auth.signOut({ scope: 'local' });
  if (!error) {
    legacyAuthLastSessionSignature = null;
    markLegacyRememberedIdentityReauthRequired(typeof window === 'undefined' ? undefined : window.localStorage);
  }

  return {
    snapshot: createGuestSnapshot(true, {
      error: error?.message ?? null,
      info: error ? null : LEGACY_AUTH_MESSAGE_COPY.signedOut
    })
  };
};

export const subscribeLegacyAuthState = (
  listener: LegacyAuthStateListener
): Promise<(() => void) | null> => getLegacyAuthClient().then((client) => {
  if (!client) {
    return null;
  }

  const { data } = client.auth.onAuthStateChange((event, session) => {
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
    data.subscription.unsubscribe();
  };
});

export const normalizeLegacyAuthEmail = (email: string): string => email.trim().toLowerCase();

export const createEmptyLegacyAuthFormState = (
  mode: LegacyAuthFormMode,
  rememberedEmail = ''
): LegacyAuthFormState => ({
  displayName: '',
  email: rememberedEmail,
  mode,
  password: ''
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
