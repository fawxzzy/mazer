import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS,
  LEGACY_AUTH_GUEST_SCOPE,
  LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS,
  LEGACY_AUTH_REMEMBERED_IDENTITY_KEY,
  LegacyAuthJsLockAcquireTimeoutError,
  LegacyAuthJsLockUnavailableError,
  buildLegacySignUpMetadata,
  buildLegacyRememberedIdentityState,
  captureLegacyPasswordRecoveryBootUrlState,
  clearLegacyPasswordRecoveryUrl,
  createEmptyLegacyAuthFormState,
  createLegacyAuthSessionSnapshot,
  createLegacyAuthScopedStorage,
  deriveLegacyRememberedIdentityDisplayName,
  isLegacyAuthStorageEventKey,
  isLegacyPasswordRecoveryRuntimeLocation,
  isLegacyPersistedAuthSessionRemoved,
  invokeLegacyLocalSignOutWithTimeout,
  markLegacyRememberedIdentityReauthRequired,
  normalizeLegacyAuthEmail,
  readLegacyRememberedIdentityState,
  readLegacyRememberedIdentity,
  readLegacyPersistedAuthSessionSnapshot,
  readLegacyAuthSessionSnapshot,
  readLegacyPasswordRecoveryBootUrlState,
  reconcileLegacyAuthStorageSession,
  resolveLegacyPasswordRecoveryCleanUrl,
  resolveLegacyPasswordRecoveryEnterAction,
  resolveLegacyPasswordRecoveryRedirectUrl,
  resolveLegacyPasswordRecoveryUrlState,
  resolveLegacyPasswordUpdateSubmitState,
  resolveLegacyAuthAccountLabel,
  resolveLegacyAuthConfig,
  resolveLegacyAuthInvalidFields,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthStorageScope,
  resolveLegacyAuthSubmitState,
  resolveLegacySignUpInfo,
  runLegacyAbortableCredentialRequest,
  runLegacyAuthJsLock,
  syncLegacyRememberedIdentityFromAuthenticatedSession,
  updateLegacyPasswordWithClient,
  writeLegacyRememberedIdentityState,
  writeLegacyRememberedIdentity,
  type LegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';
import {
  MAZER_OAUTH_AUTH_SESSION_KEY,
  MAZER_OAUTH_SESSION_LOCK_NAME,
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  consumeMazerOAuthCallback,
  runMazerExclusiveAuthMutation
} from '../../src/legacy-runtime/legacyAccountPortal';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }
}

class NamedLockHarness {
  private readonly held = new Set<string>();
  private readonly queues = new Map<string, Array<() => void>>();

  async request<T>(
    name: string,
    options: { ifAvailable?: true; mode: 'exclusive'; signal?: AbortSignal },
    callback: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T> {
    if (this.held.has(name)) {
      if (options.ifAvailable) {
        return callback(null);
      }
      await new Promise<void>((resolve, reject) => {
        const queued = this.queues.get(name) ?? [];
        const resume = () => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          const index = queued.indexOf(resume);
          if (index >= 0) {
            queued.splice(index, 1);
          }
          reject(new DOMException('The lock request was aborted.', 'AbortError'));
        };
        queued.push(resume);
        this.queues.set(name, queued);
        options.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }

    if (options.signal?.aborted) {
      throw new DOMException('The lock request was aborted.', 'AbortError');
    }

    this.held.add(name);
    try {
      return await callback({ mode: 'exclusive', name } as Lock);
    } finally {
      this.held.delete(name);
      this.queues.get(name)?.shift()?.();
    }
  }
}

const createSnapshot = (
  overrides: Partial<LegacyAuthSessionSnapshot> = {}
): LegacyAuthSessionSnapshot => ({
  configured: true,
  displayName: null,
  email: null,
  error: null,
  info: null,
  status: 'guest',
  userId: null,
  ...overrides
});

describe('legacy auth runtime', () => {
  test('queues same-name auth-js lock contention without treating it as unavailable', async () => {
    const lockManager = new NamedLockHarness();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = runLegacyAuthJsLock('supabase.auth.token', -1, async () => {
      events.push('first-start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      events.push('first-end');
      return 'first';
    }, lockManager);
    await vi.waitFor(() => expect(events).toEqual(['first-start']));

    const second = runLegacyAuthJsLock('supabase.auth.token', -1, async () => {
      events.push('second-start');
      return 'second';
    }, lockManager);
    await Promise.resolve();
    expect(events).toEqual(['first-start']);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
  });

  test('does not serialize independent auth-js lock names', async () => {
    const lockManager = new NamedLockHarness();
    const active = new Set<string>();
    let release!: () => void;
    const first = runLegacyAuthJsLock('supabase.auth.account-a', -1, async () => {
      active.add('a');
      await new Promise<void>((resolve) => { release = resolve; });
      return 'a';
    }, lockManager);
    await vi.waitFor(() => expect(active.has('a')).toBe(true));

    const second = runLegacyAuthJsLock('supabase.auth.account-b', -1, async () => {
      active.add('b');
      return 'b';
    }, lockManager);
    await vi.waitFor(() => expect(active).toEqual(new Set(['a', 'b'])));

    release();
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
  });

  test('queues auth-js session writes behind the shared OAuth session lock', async () => {
    const lockManager = new NamedLockHarness();
    const events: string[] = [];
    let releaseOAuth!: () => void;
    const oauth = runMazerExclusiveAuthMutation(async () => {
      events.push('oauth-start');
      await new Promise<void>((resolve) => { releaseOAuth = resolve; });
      events.push('oauth-end');
    }, lockManager);
    await vi.waitFor(() => expect(events).toEqual(['oauth-start']));

    expect(MAZER_OAUTH_SESSION_LOCK_NAME).toBe(`lock:${MAZER_OAUTH_AUTH_SESSION_KEY}`);
    const refresh = runLegacyAuthJsLock(MAZER_OAUTH_SESSION_LOCK_NAME, -1, async () => {
      events.push('refresh');
      return 'refreshed';
    }, lockManager);
    await Promise.resolve();
    expect(events).toEqual(['oauth-start']);

    releaseOAuth();
    await expect(oauth).resolves.toEqual({ status: 'completed', value: undefined });
    await expect(refresh).resolves.toBe('refreshed');
    expect(events).toEqual(['oauth-start', 'oauth-end', 'refresh']);
  });

  test('serializes public password sign-in and signup behind the shared OAuth session lock', async () => {
    const lockManager = new NamedLockHarness();
    const signInWithPassword = vi.fn(async () => ({
      data: { session: null },
      error: null
    }));
    const signUp = vi.fn(async () => ({
      data: { session: null },
      error: null
    }));
    const authClient = {
      auth: {
        fetch: vi.fn() as unknown as typeof fetch,
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } }
        })),
        signInWithPassword,
        signUp
      }
    };

    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
    vi.stubGlobal('navigator', { locks: lockManager });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      localStorage: new MemoryStorage(),
      location: { pathname: '/' },
      sessionStorage: new MemoryStorage()
    });
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => authClient)
    }));

    try {
      const freshAuth = await import('../../src/legacy-runtime/legacyAuth');
      const freshPortal = await import('../../src/legacy-runtime/legacyAccountPortal');
      expect(freshAuth.resolveLegacyAuthConfig()).toEqual({
        anonKey: 'anon-key',
        url: 'https://bxtcuhkotumitoqtrcej.supabase.co'
      });
      await expect(freshAuth.getLegacyAuthClient()).resolves.not.toBeNull();
      let releaseOAuth!: () => void;
      const oauth = freshPortal.runMazerExclusiveAuthMutation(async () => {
        await new Promise<void>((resolve) => { releaseOAuth = resolve; });
      }, lockManager);
      await vi.waitFor(() => expect(releaseOAuth).toBeTypeOf('function'));

      const signIn = freshAuth.signInLegacyAuth('player@example.test', 'secret1');
      const signup = freshAuth.signUpLegacyAuth('new@example.test', 'secret1', 'MazeNew');
      await expect(Promise.all([signIn, signup])).resolves.toEqual([
        { snapshot: expect.objectContaining({ status: 'unavailable' }) },
        { snapshot: expect.objectContaining({ status: 'unavailable' }) }
      ]);
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(signUp).not.toHaveBeenCalled();

      releaseOAuth();
      await expect(oauth).resolves.toMatchObject({ status: 'completed' });
      await expect(freshAuth.signInLegacyAuth(
        'player@example.test',
        'secret1'
      )).resolves.toHaveProperty('snapshot');
      await expect(freshAuth.signUpLegacyAuth(
        'new@example.test',
        'secret1',
        'MazeNew'
      )).resolves.toHaveProperty('snapshot');
      expect(signInWithPassword).toHaveBeenCalledOnce();
      expect(signUp).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('@supabase/supabase-js');
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  test('bounds queued auth-js acquisition and classifies the real timeout', async () => {
    const lockManager = new NamedLockHarness();
    let release!: () => void;
    const holder = runLegacyAuthJsLock('supabase.auth.timeout', -1, async () => {
      await new Promise<void>((resolve) => { release = resolve; });
    }, lockManager);
    await Promise.resolve();

    await expect(runLegacyAuthJsLock(
      'supabase.auth.timeout',
      5,
      async () => 'never',
      lockManager
    )).rejects.toMatchObject({
      isAcquireTimeout: true,
      name: 'LegacyAuthJsLockAcquireTimeoutError'
    });
    expect(LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS).toBe(LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS);
    release();
    await holder;
  });

  test('caps auth-js negative waits and keeps zero-time acquisition immediate', async () => {
    vi.useFakeTimers();
    try {
      const lockManager = new NamedLockHarness();
      let release!: () => void;
      const holder = runLegacyAuthJsLock('supabase.auth.bounded-default', -1, async () => {
        await new Promise<void>((resolve) => { release = resolve; });
      }, lockManager);

      const boundedWait = runLegacyAuthJsLock(
        'supabase.auth.bounded-default',
        -1,
        async () => 'never',
        lockManager
      );
      const boundedExpectation = expect(boundedWait).rejects.toBeInstanceOf(
        LegacyAuthJsLockAcquireTimeoutError
      );
      await vi.advanceTimersByTimeAsync(LEGACY_AUTH_JS_LOCK_MAX_WAIT_MS);
      await boundedExpectation;

      await expect(runLegacyAuthJsLock(
        'supabase.auth.bounded-default',
        0,
        async () => 'never',
        lockManager
      )).rejects.toMatchObject({ isAcquireTimeout: true });

      release();
      await holder;
    } finally {
      vi.useRealTimers();
    }
  });

  test('preserves lock cancellation and callback failures without misclassifying them', async () => {
    const cancellation = new DOMException('browser cancelled the request', 'AbortError');
    const cancellingManager = {
      request: vi.fn(async () => { throw cancellation; })
    };
    await expect(runLegacyAuthJsLock(
      'supabase.auth.cancelled',
      -1,
      async () => 'never',
      cancellingManager
    )).rejects.toBe(cancellation);

    const callbackFailure = new Error('session callback failed');
    const lockManager = new NamedLockHarness();
    await expect(runLegacyAuthJsLock(
      'supabase.auth.callback',
      -1,
      async () => { throw callbackFailure; },
      lockManager
    )).rejects.toBe(callbackFailure);
  });

  test('classifies unsupported Web Locks without running the protected callback', async () => {
    const callback = vi.fn(async () => 'unsafe');
    await expect(runLegacyAuthJsLock(
      'supabase.auth.unsupported',
      -1,
      callback,
      null
    )).rejects.toBeInstanceOf(LegacyAuthJsLockUnavailableError);
    expect(callback).not.toHaveBeenCalled();
    expect(new LegacyAuthJsLockAcquireTimeoutError('test').isAcquireTimeout).toBe(true);
  });

  test('aborts the underlying credential request before restoring its auth transport', async () => {
    let observedSignal: AbortSignal | undefined;
    const originalFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    }) as unknown as typeof fetch;
    const transport = { fetch: originalFetch };

    await expect(runLegacyAbortableCredentialRequest(
      transport,
      () => transport.fetch('https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/token'),
      5
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(observedSignal?.aborted).toBe(true);
    expect(transport.fetch).toBe(originalFetch);
    expect(LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS).toBeLessThan(12_000);
  });

  test('bounds local sign-out remote revocation and restores its auth transport', async () => {
    let observedSignal: AbortSignal | undefined;
    const originalFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    }) as unknown as typeof fetch;
    const clientFetch = vi.fn(() => {
      throw new Error('logout must not use the client transport');
    }) as unknown as typeof fetch;
    const auth = {
      fetch: clientFetch,
      admin: { fetch: originalFetch },
      storage: new MemoryStorage() as unknown as Storage,
      storageKey: MAZER_OAUTH_AUTH_SESSION_KEY,
      _signOut: async () => {
        await auth.admin.fetch('https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/logout');
        return { error: null };
      }
    };

    await expect(invokeLegacyLocalSignOutWithTimeout(auth, 5)).rejects.toMatchObject({ name: 'AbortError' });
    expect(observedSignal?.aborted).toBe(true);
    expect(auth.admin.fetch).toBe(originalFetch);
    expect(auth.fetch).toBe(clientFetch);
  });

  test('suppresses provisional sign-out events when persisted session removal is a no-op', async () => {
    const values = new Map([[MAZER_OAUTH_AUTH_SESSION_KEY, '{"retained":true}']]);
    const noOpStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: vi.fn(),
      setItem: (key: string, value: string) => values.set(key, value)
    } as unknown as Storage;
    const events: string[] = [];
    const auth = {
      admin: { fetch: vi.fn() as unknown as typeof fetch },
      storage: noOpStorage,
      storageKey: MAZER_OAUTH_AUTH_SESSION_KEY,
      _signOut: async () => {
        auth.storage.removeItem(MAZER_OAUTH_AUTH_SESSION_KEY);
        events.push('SIGNED_OUT');
        return { error: null };
      }
    };

    await expect(invokeLegacyLocalSignOutWithTimeout(auth, 50)).rejects.toThrow(
      'Authentication session removal could not be verified.'
    );
    expect(events).toEqual([]);
    expect(auth.storage).toBe(noOpStorage);
  });

  test('suppresses provisional sign-out events when persisted session removal throws', async () => {
    const throwingStorage = {
      getItem: () => '{"retained":true}',
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: vi.fn()
    } as unknown as Storage;
    const events: string[] = [];
    const auth = {
      admin: { fetch: vi.fn() as unknown as typeof fetch },
      storage: throwingStorage,
      storageKey: MAZER_OAUTH_AUTH_SESSION_KEY,
      _signOut: async () => {
        auth.storage.removeItem(MAZER_OAUTH_AUTH_SESSION_KEY);
        events.push('SIGNED_OUT');
        return { error: null };
      }
    };

    await expect(invokeLegacyLocalSignOutWithTimeout(auth, 50)).rejects.toMatchObject({ name: 'SecurityError' });
    expect(events).toEqual([]);
    expect(auth.storage).toBe(throwingStorage);
  });

  test('restores the exact authenticated snapshot when local sign-out fails', () => {
    const storage = new MemoryStorage();
    storage.setItem(MAZER_OAUTH_AUTH_SESSION_KEY, JSON.stringify({
      access_token: 'not-exposed',
      refresh_token: 'not-exposed',
      user: {
        email: 'runner@example.test',
        id: 'runner-id',
        user_metadata: { username: 'MazeRunner' }
      }
    }));

    expect(readLegacyPersistedAuthSessionSnapshot(storage, {
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co'
    })).toMatchObject({
      canonicalUsername: 'MazeRunner',
      email: 'runner@example.test',
      status: 'authenticated',
      userId: 'runner-id'
    });
  });

  test('rejects no-op and throwing local session removal postimages', () => {
    const noOpRemoval = new MemoryStorage();
    noOpRemoval.setItem(MAZER_OAUTH_AUTH_SESSION_KEY, '{"retained":true}');
    expect(isLegacyPersistedAuthSessionRemoved(noOpRemoval)).toBe(false);

    expect(isLegacyPersistedAuthSessionRemoved({
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      }
    })).toBe(false);
    expect(isLegacyPersistedAuthSessionRemoved(new MemoryStorage())).toBe(true);
  });

  test('verifies the session key derived from the configured auth client', async () => {
    const rollbackStorageKey = 'sb-geknvnrmktchljnyddwp-auth-token';
    const values = new Map([[rollbackStorageKey, '{"retained":true}']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: vi.fn(),
      setItem: (key: string, value: string) => values.set(key, value)
    } as unknown as Storage;
    const events: string[] = [];
    const auth = {
      admin: { fetch: vi.fn() as unknown as typeof fetch },
      storage,
      storageKey: rollbackStorageKey,
      _signOut: async () => {
        auth.storage.removeItem(rollbackStorageKey);
        events.push('SIGNED_OUT');
        return { error: null };
      }
    };

    await expect(invokeLegacyLocalSignOutWithTimeout(auth, 50)).rejects.toThrow(
      'Authentication session removal could not be verified.'
    );
    expect(events).toEqual([]);
    expect(isLegacyPersistedAuthSessionRemoved(storage, rollbackStorageKey)).toBe(false);
  });

  test('detects whether Supabase browser auth is configured', () => {
    expect(resolveLegacyAuthConfig({})).toBeNull();
    expect(resolveLegacyAuthConfig({
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co'
    })).toEqual({
      anonKey: 'anon-key',
      url: 'https://example.supabase.co'
    });
  });

  test('uses the canonical master username before profile display metadata', () => {
    const snapshot = createLegacyAuthSessionSnapshot({
      user: {
        email: 'shared-owner@example.test',
        id: 'master-user-without-mazer-profile',
        user_metadata: {
          display_name: 'Shared Display Name',
          full_name: 'Shared Full Name',
          username: 'canonical-owner'
        }
      }
    } as Parameters<typeof createLegacyAuthSessionSnapshot>[0], {
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co'
    });

    expect(snapshot).toMatchObject({
      canonicalUsername: 'canonical-owner',
      displayName: 'canonical-owner',
      status: 'authenticated',
      userId: 'master-user-without-mazer-profile'
    });
  });

  test('keeps a profile-backed user on the same Auth principal and fallback order', () => {
    const env = {
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co'
    };
    const createSnapshotForMetadata = (userMetadata: Record<string, unknown>) => (
      createLegacyAuthSessionSnapshot({
        user: {
          email: 'profile-owner@example.test',
          id: 'master-user-with-mazer-profile',
          user_metadata: userMetadata
        }
      } as Parameters<typeof createLegacyAuthSessionSnapshot>[0], env)
    );

    expect(createSnapshotForMetadata({
      display_name: 'Mazer Profile Name',
      full_name: 'Shared Full Name',
      username: 'profile-owner'
    })).toMatchObject({
      canonicalUsername: 'profile-owner',
      displayName: 'profile-owner',
      userId: 'master-user-with-mazer-profile'
    });
    expect(createSnapshotForMetadata({
      display_name: 'Mazer Profile Name',
      full_name: 'Shared Full Name',
      username: '   '
    })).toMatchObject({
      canonicalUsername: null,
      displayName: 'Mazer Profile Name',
      userId: 'master-user-with-mazer-profile'
    });
  });

  test('keeps local Vite auth env from being shadowed by inherited shell env during builds', () => {
    const buildScript = readFileSync(resolve(process.cwd(), 'scripts/build/run-build.mjs'), 'utf8');

    expect(buildScript).toContain("process.env.MAZER_PREFER_LOCAL_VITE_ENV === '0'");
    expect(buildScript).toContain("if (!key.startsWith('VITE_'))");
    expect(buildScript).toContain('process.env[key] = stripEnvQuotes(rawValue.trim());');
    expect(buildScript).toContain('loadLocalViteEnv();');
  });

  test('keeps form readiness strict enough for login and signup', () => {
    const form = createEmptyLegacyAuthFormState('login');

    expect(resolveLegacyAuthSubmitState(form, false)).toEqual({
      canSubmit: false,
      reason: 'Account access is unavailable right now. You can still play as a guest.'
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'secret1'
    }, true)).toEqual({
      canSubmit: true,
      reason: null
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player',
      password: 'secret1'
    }, true).reason).toBe('Enter an email.');
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'short'
    }, true).reason).toBe('Password needs 6+ characters.');

    const signup = createEmptyLegacyAuthFormState('signup');
    expect(resolveLegacyAuthInvalidFields(signup)).toEqual(['username', 'email', 'password']);
    expect(resolveLegacyAuthSubmitState({
      ...signup,
      email: 'player@example.com',
      password: 'secret1'
    }, true).reason).toBe('Enter a username.');
    expect(resolveLegacyAuthSubmitState({
      ...signup,
      email: 'player@example.com',
      password: 'secret1',
      username: 'fawxzzy'
    }, true)).toEqual({ canSubmit: true, reason: null });
  });

  test('binds password reset email callbacks to the exact recovery route', () => {
    expect(resolveLegacyPasswordRecoveryRedirectUrl('https://mazer.fawxzzy.com')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryRedirectUrl('https://mazer.fawxzzy.com/')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryCleanUrl('https://mazer.fawxzzy.com', 'invalid')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryCleanUrl('https://mazer.fawxzzy.com', 'continue')).toBe(
      'https://mazer.fawxzzy.com/'
    );
  });

  test('enables Supabase URL-session detection only on the legacy recovery route', () => {
    expect(isLegacyPasswordRecoveryRuntimeLocation({ pathname: '/update-password' })).toBe(true);
    expect(isLegacyPasswordRecoveryRuntimeLocation({ pathname: '/update-password/' })).toBe(true);
    expect(isLegacyPasswordRecoveryRuntimeLocation({ pathname: '/' })).toBe(false);
    expect(isLegacyPasswordRecoveryRuntimeLocation({ pathname: '/privacy' })).toBe(false);
    expect(isLegacyPasswordRecoveryRuntimeLocation(undefined)).toBe(false);
  });

  test('recognizes direct recovery paths and categorical provider failures without exposing details', () => {
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#access_token=secret',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#code=secret&type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#type=signup',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#',
      pathname: '/update-password',
      search: '?code=secret'
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#error=access_denied&error_code=otp_expired&error_description=secret-detail',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: true, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '',
      pathname: '/',
      search: '?error_code=otp_expired'
    })).toEqual({ hasProviderError: true, requested: false });
  });

  test('retains a real recovery callback through auth bootstrap URL cleanup', () => {
    expect(captureLegacyPasswordRecoveryBootUrlState({
      hash: '#access_token=secret&type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(readLegacyPasswordRecoveryBootUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });

    clearLegacyPasswordRecoveryUrl('continue');
    expect(readLegacyPasswordRecoveryBootUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
  });

  test('updates a password only when both policy-valid fields match', async () => {
    const updateUser = vi.fn(async () => ({ error: null }));
    const client = { auth: { updateUser } };

    expect(resolveLegacyPasswordUpdateSubmitState('short', 'short', true)).toEqual({
      canSubmit: false,
      invalidFields: ['password'],
      reason: 'Password needs 6+ characters.'
    });
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret2', true)).toEqual({
      canSubmit: false,
      invalidFields: ['confirmPassword'],
      reason: 'Passwords do not match.'
    });
    expect(await updateLegacyPasswordWithClient(client, 'short', 'short')).toEqual({
      error: 'Password needs 6+ characters.',
      ok: false
    });
    expect(await updateLegacyPasswordWithClient(client, 'secret1', 'secret2')).toEqual({
      error: 'Passwords do not match.',
      ok: false
    });
    expect(updateUser).not.toHaveBeenCalled();

    await expect(updateLegacyPasswordWithClient(client, 'secret1', 'secret1')).resolves.toEqual({
      error: null,
      ok: true
    });
    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret1' });
  });

  test('advances Enter from the first recovery field and reserves submission for valid confirmation', () => {
    expect(resolveLegacyPasswordRecoveryEnterAction('password')).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('password', true)).toBe('focus-confirmation');
    expect(resolveLegacyPasswordRecoveryEnterAction('confirmPassword', true)).toBe('submit');
    expect(resolveLegacyPasswordRecoveryEnterAction('email', true)).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('username', true)).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('displayName', true)).toBeNull();

    expect(resolveLegacyPasswordUpdateSubmitState('secret1', '', true).canSubmit).toBe(false);
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret2', true).canSubmit).toBe(false);
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret1', true).canSubmit).toBe(true);
  });

  test('bounds recovery-password updates and shares an unresolved mutation with manual retry', async () => {
    let settleUpdate: ((value: { error: null }) => void) | null = null;
    const timeoutClient = {
      auth: {
        updateUser: vi.fn(async () => new Promise<{ error: null }>((resolve) => {
          settleUpdate = resolve;
        }))
      }
    };
    const timeoutResult = await updateLegacyPasswordWithClient(timeoutClient, 'secret1', 'secret1', {
      timeoutMs: 1
    });
    expect(timeoutResult.ok).toBe(false);
    expect(timeoutResult.error).toBe('Password update timed out.');
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    const retry = updateLegacyPasswordWithClient(timeoutClient, 'secret1', 'secret1', { timeoutMs: 100 });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    await expect(updateLegacyPasswordWithClient(timeoutClient, 'secret2', 'secret2', {
      timeoutMs: 100
    })).resolves.toEqual({
      error: 'A previous password update is still pending. Please wait before trying a different password.',
      ok: false
    });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    settleUpdate?.({ error: null });
    await expect(retry).resolves.toEqual({ error: null, ok: true });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    const rejectClient = {
      auth: { updateUser: vi.fn(async () => Promise.reject(new Error('bad network'))) }
    };
    const rejectResult = await updateLegacyPasswordWithClient(rejectClient, 'secret1', 'secret1', {
      timeoutMs: 1
    });
    expect(rejectResult.ok).toBe(false);
    expect(rejectResult.error).toBe('bad network');
    expect(rejectClient.auth.updateUser).toHaveBeenCalledOnce();
  });

  test('builds canonical Mazer signup metadata without deriving a username from email', () => {
    expect(buildLegacySignUpMetadata(' Fawxzzy-1 ')).toEqual({
      app_namespace: 'mazer',
      display_name: 'Fawxzzy-1',
      username: 'Fawxzzy-1'
    });

    for (const invalid of ['', 'a', 'sixteen_chars____', 'space name', 'unicode-☃', 'mail@example.com']) {
      expect(buildLegacySignUpMetadata(invalid)).toBeNull();
    }
    for (const nonString of [null, undefined, 123, {}, { trim: () => { throw new Error('must not run'); } }]) {
      expect(() => buildLegacySignUpMetadata(nonString)).not.toThrow();
      expect(buildLegacySignUpMetadata(nonString)).toBeNull();
    }

    expect(resolveLegacySignUpInfo(false, true)).toBe('Your account is ready.');
    expect(resolveLegacySignUpInfo(false, false)).toBe('Check your email to finish account setup.');
    expect(resolveLegacySignUpInfo(true, true)).toBeNull();
  });

  test('normalizes remembered identity without making it required for guest play', () => {
    const storage = new MemoryStorage();

    expect(readLegacyRememberedIdentity(undefined)).toBe('');
    writeLegacyRememberedIdentity(storage, ' Player@Example.COM ');

    expect(JSON.parse(storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY) ?? '{}')).toMatchObject({
      displayName: 'Player',
      email: 'player@example.com',
      sessionState: 'reauth-required'
    });
    expect(readLegacyRememberedIdentity(storage)).toBe('player@example.com');
    expect(normalizeLegacyAuthEmail(' Player@Example.COM ')).toBe('player@example.com');
  });

  test('keeps fitness-style remembered login state for persistent re-entry', () => {
    const storage = new MemoryStorage();

    expect(deriveLegacyRememberedIdentityDisplayName('runner@example.test')).toBe('Runner');
    expect(buildLegacyRememberedIdentityState({
      email: ' Runner@Example.TEST ',
      updatedAt: '2026-07-09T12:00:00.000Z'
    })).toEqual({
      displayName: 'Runner',
      email: 'runner@example.test',
      sessionState: 'reauth-required',
      updatedAt: '2026-07-09T12:00:00.000Z'
    });

    writeLegacyRememberedIdentityState(storage, {
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'ready',
      updatedAt: '2026-07-09T12:01:00.000Z'
    });
    expect(readLegacyRememberedIdentityState(storage)).toEqual({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'ready',
      updatedAt: '2026-07-09T12:01:00.000Z'
    });

    const reauthState = markLegacyRememberedIdentityReauthRequired(storage);
    expect(reauthState).toMatchObject({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'reauth-required'
    });
    expect(readLegacyRememberedIdentity(storage)).toBe('runner@example.com');
  });

  test('syncs remembered identity from authenticated sessions without storing tokens', () => {
    const storage = new MemoryStorage();
    const state = syncLegacyRememberedIdentityFromAuthenticatedSession(storage, createSnapshot({
      displayName: 'Mazer Owner',
      email: 'runner@example.test',
      status: 'authenticated',
      userId: 'user-123'
    }));
    const raw = storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY) ?? '';

    expect(state).toMatchObject({
      displayName: 'Mazer Owner',
      email: 'runner@example.test',
      sessionState: 'ready'
    });
    expect(raw).toContain('runner@example.test');
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('refresh_token');
  });

  test('guards auth persistence against global sign-out and duplicate listeners', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');

    expect(authSource).toContain('await invokeLegacyLocalSignOutWithTimeout(directSignOut)');
    expect(authSource).toContain('const authStorage = directSignOut.storage ?? null;');
    expect(authSource).not.toContain("await client.auth.signOut({ scope: 'local' })");
    expect(authSource).toContain('return runLegacyAuthDirectSessionMutation(async () => {');
    expect(authSource).toContain('fail closed if the pinned seam ever changes');
    expect(authSource).toContain('legacyAuthPersistenceListenerInstalled');
    expect(authSource).toContain('legacyAuthStorageListenerInstalled');
    expect(authSource).toContain("window.addEventListener('storage'");
    expect(authSource).toContain('!isLegacyAuthStorageEventKey(event.key, authStorageKey)');
    expect(authSource).toContain('reconcileLegacyAuthStorageSession(');
    expect(authSource).toContain('legacyAuthLiveListeners');
    expect(authSource.match(/isMazerOAuthSessionQuarantined\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(authSource).toContain('syncLegacyAuthPersistenceFromSession(data.session,');
    expect(authSource).toContain('export const readLegacyAuthSessionSnapshot = async');
    expect(authSource).toContain('if (isMazerOAuthSessionQuarantined()) {');
    expect(authSource).toContain("listener({ ...createLegacyGuestAuthSnapshot(), error: MAZER_OAUTH_SAFE_ERROR_MESSAGE }, event);");
    expect(authSource).toContain("error: oauthBootResult.status === 'failed'");
    expect(authSource).toContain('? MAZER_OAUTH_SAFE_ERROR_MESSAGE');
    expect(authSource).toContain(': error?.message ?? null');
    expect(authSource).toContain('export const subscribeLegacyAuthState = (');
    expect(authSource).toContain("if (snapshot.status === 'authenticated')");
    expect(authSource).toContain('return `${session.user.id}:${session.expires_at ?? 0}`;');
    expect(authSource).not.toContain('session.refresh_token || !session.user?.id');
    expect(authSource).toContain("'BOOTSTRAP_SESSION'");
    expect(authSource).not.toContain("|| event === 'BOOTSTRAP_SESSION'");
    expect(authSource).not.toContain("|| event === 'INITIAL_SESSION'");
    expect(authSource).toContain("event === 'SIGNED_OUT'");
  });

  test('fans storage-event reconciliation out to every live auth subscriber', async () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const session = {
      access_token: 'access-token',
      expires_at: 2_100,
      expires_in: 100,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      user: {
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-09-13T00:00:00.000Z',
        email: 'player@example.test',
        id: '11111111-1111-4111-8111-111111111111',
        user_metadata: { username: 'Maze Player' }
      }
    };
    await expect(reconcileLegacyAuthStorageSession(
      async () => session as never,
      new Set([firstListener, secondListener]),
      () => false,
      { VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_SUPABASE_URL: 'https://example.supabase.co' }
    )).resolves.toBe(true);
    for (const listener of [firstListener, secondListener]) {
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        email: 'player@example.test',
        status: 'authenticated',
        userId: '11111111-1111-4111-8111-111111111111'
      }), 'SIGNED_IN');
    }

    firstListener.mockClear();
    secondListener.mockClear();
    await expect(reconcileLegacyAuthStorageSession(
      async () => session as never,
      new Set([firstListener, secondListener]),
      () => true
    )).resolves.toBe(false);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();
  });

  test('accepts storage events for either configured project key without accepting unrelated keys', () => {
    const rollbackStorageKey = 'sb-geknvnrmktchljnyddwp-auth-token';

    expect(isLegacyAuthStorageEventKey(MAZER_OAUTH_AUTH_SESSION_KEY, MAZER_OAUTH_AUTH_SESSION_KEY)).toBe(true);
    expect(isLegacyAuthStorageEventKey(rollbackStorageKey, rollbackStorageKey)).toBe(true);
    expect(isLegacyAuthStorageEventKey(MAZER_OAUTH_AUTH_SESSION_KEY, rollbackStorageKey)).toBe(false);
    expect(isLegacyAuthStorageEventKey(rollbackStorageKey, MAZER_OAUTH_AUTH_SESSION_KEY)).toBe(false);
    expect(isLegacyAuthStorageEventKey('unrelated', rollbackStorageKey)).toBe(false);
    expect(isLegacyAuthStorageEventKey(null, rollbackStorageKey)).toBe(false);
  });

  test('preserves fixed-safe callback failure feedback when no auth client can be constructed', async () => {
    await consumeMazerOAuthCallback({
      code: null,
      malformed: false,
      providerError: false,
      requested: true,
      state: null
    }, async () => null, null);

    await expect(readLegacyAuthSessionSnapshot()).resolves.toMatchObject({
      error: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      status: 'unavailable'
    });
  });

  test('binds browser data queries to a schema resolved per-project, not a hardcoded constant', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const progressionSource = readFileSync(
      resolve(process.cwd(), 'src/legacy-runtime/legacyRemoteProgression.ts'),
      'utf8'
    );

    // A single project-wide `db: { schema: 'mazer' }` was correct only for
    // the shared consolidation-target project and silently wrong for the
    // legacy/rollback project (whose tables still live in `public`) --
    // see legacySupabaseSchemaBinding.ts. The schema is now resolved from
    // the configured project's URL instead of assumed.
    expect(authSource).not.toMatch(/db:\s*\{\s*schema:\s*'mazer'\s*\}/);
    expect(authSource).toContain(
      "import { resolveLegacySupabaseSchemaForUrl } from './legacySupabaseSchemaBinding';"
    );
    expect(authSource).toContain('const schema = resolveLegacySupabaseSchemaForUrl(config.url);');
    expect(progressionSource).toContain('.from(');
    expect(progressionSource).not.toContain('.schema(');
  });

  test('scopes learning storage by guest versus signed-in account', () => {
    const storage = new MemoryStorage();
    const baseKey = 'mazer.progression.v1';
    const guestSnapshot = createSnapshot();
    const userSnapshot = createSnapshot({
      email: 'player@example.com',
      status: 'authenticated',
      userId: 'user-123'
    });

    const guestStorage = createLegacyAuthScopedStorage(storage, baseKey, guestSnapshot);
    const userStorage = createLegacyAuthScopedStorage(storage, baseKey, userSnapshot);

    guestStorage?.setItem(baseKey, 'guest-state');
    userStorage?.setItem(baseKey, 'user-state');

    expect(resolveLegacyAuthStorageScope(guestSnapshot)).toBe(LEGACY_AUTH_GUEST_SCOPE);
    expect(resolveLegacyAuthStorageScope(userSnapshot)).toBe('user:user-123');
    expect(resolveLegacyAuthScopedStorageKey(baseKey, guestSnapshot)).toBe(`${baseKey}:guest`);
    expect(resolveLegacyAuthScopedStorageKey(baseKey, userSnapshot)).toBe(`${baseKey}:user:user-123`);
    expect(guestStorage?.getItem(baseKey)).toBe('guest-state');
    expect(userStorage?.getItem(baseKey)).toBe('user-state');
    expect(storage.getItem(baseKey)).toBeNull();
  });

  test('keeps account labels player-facing and compact', () => {
    expect(resolveLegacyAuthAccountLabel(createSnapshot())).toBe('Guest');
    expect(resolveLegacyAuthAccountLabel(createSnapshot({
      configured: false,
      status: 'unavailable'
    }))).toBe('Guest');
    expect(resolveLegacyAuthAccountLabel(createSnapshot({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      status: 'authenticated',
      userId: 'user-123'
    }))).toBe('Maze Runner');
  });
});
