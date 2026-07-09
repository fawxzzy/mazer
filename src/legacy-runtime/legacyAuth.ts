import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';

export const LEGACY_AUTH_REMEMBERED_IDENTITY_KEY = 'mazer.auth.remembered-identity.v1';
export const LEGACY_AUTH_GUEST_SCOPE = 'guest';

export type LegacyAuthStatus = 'guest' | 'authenticated' | 'unavailable';
export type LegacyAuthFormMode = 'login' | 'signup';
export type LegacyAuthFieldId = 'email' | 'password' | 'displayName';

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

export type LegacyAuthStateListener = (
  snapshot: LegacyAuthSessionSnapshot,
  event: AuthChangeEvent
) => void;

type LegacyAuthStorage = Pick<Storage, 'getItem' | 'setItem'>;

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
  return meta.env ?? {};
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
      info: 'Account login needs Supabase env vars before it can be enabled.',
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
  }

  return legacyAuthClient;
};

export const readLegacyAuthSessionSnapshot = async (): Promise<LegacyAuthSessionSnapshot> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyGuestAuthSnapshot();
  }

  const { data, error } = await client.auth.getSession();
  return createLegacyAuthSessionSnapshot(data.session, undefined, {
    error: error?.message ?? null
  });
};

export const signInLegacyAuth = async (
  email: string,
  password: string
): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: 'Account login is not configured for this build.'
      })
    };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeLegacyAuthEmail(email),
    password
  });

  return {
    snapshot: createLegacyAuthSessionSnapshot(data.session, undefined, {
      error: error?.message ?? null,
      info: error ? null : 'Signed in.'
    })
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
        error: 'Account signup is not configured for this build.'
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
      ? 'Account created.'
      : 'Check your email to finish account setup.';

  return {
    snapshot: createLegacyAuthSessionSnapshot(data.session, undefined, {
      error: error?.message ?? null,
      info
    })
  };
};

export const requestLegacyPasswordReset = async (email: string): Promise<LegacyAuthActionResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return {
      snapshot: createGuestSnapshot(false, {
        error: 'Password reset is not configured for this build.'
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
      info: error ? null : 'Password reset email sent.'
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

  const { error } = await client.auth.signOut();
  return {
    snapshot: createGuestSnapshot(true, {
      error: error?.message ?? null,
      info: error ? null : 'Signed out. Guest progress is active.'
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
    listener(createLegacyAuthSessionSnapshot(session), event);
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
      reason: 'Login is not configured.'
    };
  }

  if (!normalizeLegacyAuthEmail(form.email).includes('@')) {
    return {
      canSubmit: false,
      reason: 'Enter an email.'
    };
  }

  if (form.password.length < 6) {
    return {
      canSubmit: false,
      reason: 'Password needs 6+ characters.'
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
  if (!storage) {
    return '';
  }

  try {
    return storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY) ?? '';
  } catch {
    return '';
  }
};

export const writeLegacyRememberedIdentity = (
  storage: LegacyAuthStorage | undefined,
  email: string
): void => {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY, normalizeLegacyAuthEmail(email));
  } catch {
    // Remembered identity is a convenience only; login should not depend on it.
  }
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
