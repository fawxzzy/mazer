import { webcrypto } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import {
  MAZER_ACCOUNT_PORTAL_ORIGIN,
  MAZER_AUTH_MUTATION_EPOCH_KEY,
  MAZER_CANONICAL_RETURN_URL,
  MAZER_OAUTH_AUTHORIZATION_URL,
  MAZER_OAUTH_AUTH_STORAGE_PROBE_BYTES,
  MAZER_OAUTH_AUTH_STORAGE_PROBE_KEY,
  MAZER_OAUTH_CLIENT_ID,
  MAZER_OAUTH_PENDING_KEY,
  MAZER_OAUTH_SESSION_QUARANTINE_KEY,
  MAZER_OAUTH_TOKEN_URL,
  advanceMazerAuthMutationEpoch,
  advanceMazerSharedAuthMutationEpoch,
  beginMazerOAuthAuthorization,
  buildMazerAccountPortalUrl,
  buildMazerLegalUrl,
  captureAndScrubMazerOAuthCallback,
  consumeMazerOAuthCallback,
  isMazerOAuthCallbackReadyForBoot,
  isMazerOAuthCallbackRequest,
  installMazerOAuthPageShowRecovery,
  isMazerOAuthSessionQuarantined,
  recoverMazerOAuthSessionQuarantine,
  resolveMazerOAuthAuthStorage,
  resolveMazerOAuthSessionStorage,
  resolveMazerLegalRoute,
  runMazerExclusiveAuthMutation,
  type MazerAuthMutationLockManager,
  type MazerOAuthClient,
  type MazerOAuthLocation,
  type MazerOAuthRuntime,
  type MazerOAuthStorage
} from '../../src/legacy-runtime/legacyAccountPortal';

class MemoryStorage implements MazerOAuthStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class ExclusiveLockHarness implements MazerAuthMutationLockManager {
  private held = false;

  async request<T>(
    _name: string,
    _options: { ifAvailable: true; mode: 'exclusive' },
    callback: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T> {
    if (this.held) {
      return callback(null);
    }
    this.held = true;
    try {
      return await callback({ mode: 'exclusive', name: 'mazer.auth.oauth-session-transaction.v1' } as Lock);
    } finally {
      this.held = false;
    }
  }
}

const createLocation = (href = 'https://mazer.fawxzzy.com/'): MazerOAuthLocation & { assigned: string[] } => {
  const url = new URL(href);
  const assigned: string[] = [];
  return {
    assigned,
    assign: (next) => { assigned.push(next); },
    hash: url.hash,
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search
  };
};

const createRuntime = (
  storage: MemoryStorage,
  location = createLocation(),
  fetchImpl: typeof fetch = vi.fn()
): MazerOAuthRuntime => ({
  clearTimer: (handle) => clearTimeout(handle),
  crypto: webcrypto as unknown as Crypto,
  fetch: fetchImpl,
  history: { replaceState: vi.fn() },
  location,
  notifyAcceptedSession: vi.fn(() => true),
  now: () => 2_000_000,
  runExclusiveSessionTransaction: async (operation) => operation(),
  sessionStorage: storage,
  setTimer: (handler, timeoutMs) => setTimeout(handler, timeoutMs)
});

const base64Url = (value: string): string => Buffer.from(value).toString('base64url');

const createAccessToken = (): { claims: Record<string, unknown>; token: string } => {
  const claims = {
    aud: 'authenticated',
    client_id: MAZER_OAUTH_CLIENT_ID,
    exp: 2_100,
    iat: 1_900,
    iss: 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1',
    role: 'authenticated',
    session_id: '22222222-2222-4222-8222-222222222222',
    sub: '11111111-1111-4111-8111-111111111111'
  };
  return {
    claims,
    token: `${base64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))}.${base64Url(JSON.stringify(claims))}.signature`
  };
};

const createClient = (claims: Record<string, unknown>): MazerOAuthClient => ({
  auth: {
    getClaims: vi.fn(async () => ({ data: { claims }, error: null })),
    getSession: vi.fn(async () => ({
      data: { session: { user: { id: claims.sub as string } } },
      error: null
    })),
    getUser: vi.fn(async () => ({ data: { user: { id: claims.sub as string } }, error: null })),
    setSession: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null }))
  }
});

describe('Mazer shared account contract', () => {
  test('makes every shared auth mutation mutually exclusive and fail closed on lock contention', async () => {
    const lock = new ExclusiveLockHarness();
    let releaseFirst: (() => void) | null = null;
    const first = runMazerExclusiveAuthMutation(async () => {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return 'first-complete';
    }, lock);
    await vi.waitFor(() => expect(releaseFirst).not.toBeNull());

    let secondRan = false;
    await expect(runMazerExclusiveAuthMutation(() => {
      secondRan = true;
      return 'second-complete';
    }, lock)).resolves.toEqual({ status: 'unavailable' });
    expect(secondRan).toBe(false);

    releaseFirst?.();
    await expect(first).resolves.toEqual({ status: 'completed', value: 'first-complete' });
    await expect(runMazerExclusiveAuthMutation(
      () => 'after-release',
      lock
    )).resolves.toEqual({ status: 'completed', value: 'after-release' });
  });

  test('releases the shared auth lock and reports unavailable when a mutation throws', async () => {
    const lock = new ExclusiveLockHarness();
    await expect(runMazerExclusiveAuthMutation(() => {
      throw new Error('mutation failed');
    }, lock)).resolves.toEqual({ status: 'unavailable' });
    await expect(runMazerExclusiveAuthMutation(
      () => 'recovered',
      lock
    )).resolves.toEqual({ status: 'completed', value: 'recovered' });
  });

  test('contains denied browser storage and recovers OAuth submission only after a persisted page restore', async () => {
    const deniedStorage = {} as Pick<Window, 'sessionStorage'>;
    Object.defineProperty(deniedStorage, 'sessionStorage', {
      get: () => { throw new DOMException('denied', 'SecurityError'); }
    });
    expect(resolveMazerOAuthSessionStorage(deniedStorage)).toBeNull();
    const deniedAuthStorage = {} as Pick<Window, 'localStorage'>;
    Object.defineProperty(deniedAuthStorage, 'localStorage', {
      get: () => { throw new DOMException('denied', 'SecurityError'); }
    });
    expect(resolveMazerOAuthAuthStorage(deniedAuthStorage)).toBeNull();
    const deniedRuntime = createRuntime(new MemoryStorage());
    deniedRuntime.authStorage = null;
    await expect(beginMazerOAuthAuthorization(deniedRuntime)).resolves.toEqual({
      category: 'storage_unavailable',
      status: 'failed'
    });
    expect(deniedRuntime.location.assigned).toEqual([]);
    const writeDeniedRuntime = createRuntime(new MemoryStorage());
    const writeDeniedStorage = new MemoryStorage();
    writeDeniedStorage.setItem = () => { throw new DOMException('denied', 'SecurityError'); };
    writeDeniedRuntime.authStorage = writeDeniedStorage;
    await expect(beginMazerOAuthAuthorization(writeDeniedRuntime)).resolves.toEqual({
      category: 'storage_unavailable',
      status: 'failed'
    });
    expect(writeDeniedRuntime.location.assigned).toEqual([]);
    expect(writeDeniedRuntime.sessionStorage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();

    const noLockRuntime = createRuntime(new MemoryStorage());
    noLockRuntime.runExclusiveSessionTransaction = vi.fn(async () => null);
    await expect(beginMazerOAuthAuthorization(noLockRuntime)).resolves.toEqual({
      category: 'authorization_unavailable',
      status: 'failed'
    });
    expect(noLockRuntime.location.assigned).toEqual([]);
    expect(noLockRuntime.sessionStorage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();

    const sizedProbeStorage = new MemoryStorage();
    let observedProbeBytes = 0;
    sizedProbeStorage.setItem = (key, value) => {
      if (key === MAZER_OAUTH_AUTH_STORAGE_PROBE_KEY) {
        observedProbeBytes = value.length;
      }
      sizedProbeStorage.values.set(key, value);
    };
    const sizedProbeRuntime = createRuntime(new MemoryStorage());
    sizedProbeRuntime.authStorage = sizedProbeStorage;
    await expect(beginMazerOAuthAuthorization(sizedProbeRuntime)).resolves.toEqual({ status: 'none' });
    expect(observedProbeBytes).toBe(MAZER_OAUTH_AUTH_STORAGE_PROBE_BYTES);
    expect(sizedProbeStorage.getItem(MAZER_OAUTH_AUTH_STORAGE_PROBE_KEY)).toBeNull();

    const listeners = new Set<(event: PageTransitionEvent) => void>();
    const lifecycle = {
      addEventListener: (_type: 'pageshow', listener: (event: PageTransitionEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: 'pageshow', listener: (event: PageTransitionEvent) => void) => listeners.delete(listener)
    };
    const recover = vi.fn();
    const cleanup = installMazerOAuthPageShowRecovery(lifecycle, recover);
    for (const listener of listeners) listener({ persisted: false } as PageTransitionEvent);
    expect(recover).not.toHaveBeenCalled();
    for (const listener of listeners) listener({ persisted: true } as PageTransitionEvent);
    expect(recover).toHaveBeenCalledTimes(1);
    cleanup();
    expect(listeners.size).toBe(0);
  });

  test('uses exact closed portal and legal URLs without accepting caller return targets', () => {
    expect(buildMazerAccountPortalUrl('account')).toBe(
      `${MAZER_ACCOUNT_PORTAL_ORIGIN}/account?app=mazer&returnTo=${encodeURIComponent(MAZER_CANONICAL_RETURN_URL)}`
    );
    expect(buildMazerAccountPortalUrl('reset-password')).toBe(
      `${MAZER_ACCOUNT_PORTAL_ORIGIN}/reset-password?recovery=1&app=mazer&returnTo=${encodeURIComponent(MAZER_CANONICAL_RETURN_URL)}`
    );
    expect(buildMazerLegalUrl('privacy')).toBe(
      `${MAZER_ACCOUNT_PORTAL_ORIGIN}/privacy?app=mazer&returnTo=${encodeURIComponent(MAZER_CANONICAL_RETURN_URL)}`
    );
    expect(buildMazerLegalUrl('terms')).toBe(
      `${MAZER_ACCOUNT_PORTAL_ORIGIN}/terms?app=mazer&returnTo=${encodeURIComponent(MAZER_CANONICAL_RETURN_URL)}`
    );
    expect(resolveMazerLegalRoute('/privacy/')).toBe('privacy');
    expect(resolveMazerLegalRoute('/terms')).toBe('terms');
    expect(resolveMazerLegalRoute('/privacy.evil')).toBeNull();
  });

  test('creates a 32-byte state and PKCE S256 verifier before exact top-level navigation', async () => {
    const storage = new MemoryStorage();
    const runtime = createRuntime(storage);
    expect(await beginMazerOAuthAuthorization(runtime)).toEqual({ status: 'none' });
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const target = new URL(runtime.location.assigned[0]);
    expect(target.origin + target.pathname).toBe(MAZER_OAUTH_AUTHORIZATION_URL);
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('client_id')).toBe(MAZER_OAUTH_CLIENT_ID);
    expect(target.searchParams.get('redirect_uri')).toBe(MAZER_CANONICAL_RETURN_URL);
    expect(target.searchParams.get('scope')).toBe('email');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('state')).toBe(pending.state);
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending.returnPath).toBe('/');
    expect(storage.getItem(MAZER_AUTH_MUTATION_EPOCH_KEY)).toBe('1');
  });

  test('restores only the validated direct-play launch intent after OAuth succeeds', async () => {
    const storage = new MemoryStorage();
    const startRuntime = createRuntime(storage, createLocation('https://mazer.fawxzzy.com/?mode=play'));
    await expect(beginMazerOAuthAuthorization(startRuntime)).resolves.toEqual({ status: 'none' });
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    expect(pending.returnPath).toBe('/?mode=play');
    const { claims, token } = createAccessToken();
    const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 100,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);

    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => createClient(claims), runtime)).resolves.toEqual({ status: 'connected' });
    expect(runtime.history.replaceState).toHaveBeenCalledWith(null, '', '/?mode=play');

    const unrelatedStorage = new MemoryStorage();
    const unrelatedRuntime = createRuntime(
      unrelatedStorage,
      createLocation('https://mazer.fawxzzy.com/?mode=playback&next=https://attacker.example')
    );
    await beginMazerOAuthAuthorization(unrelatedRuntime);
    expect(JSON.parse(unrelatedStorage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}').returnPath).toBe('/');
  });

  test('allows install-gate bypass only for a canonical callback matching the live pending attempt', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage));
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    expect(isMazerOAuthCallbackReadyForBoot(createLocation(
      `https://mazer.fawxzzy.com/?code=one-time-code&state=${pending.state}`
    ), storage, 2_000_000)).toBe(true);
    expect(isMazerOAuthCallbackReadyForBoot(createLocation(
      `https://mazer.fawxzzy.com/?error=access_denied&state=${pending.state}`
    ), storage, 2_000_000)).toBe(true);

    expect(isMazerOAuthCallbackReadyForBoot(
      createLocation('https://mazer.fawxzzy.com/?state=arbitrary'),
      storage,
      2_000_000
    )).toBe(false);
    expect(isMazerOAuthCallbackReadyForBoot(createLocation(
      'https://mazer.fawxzzy.com/?error=arbitrary&state=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789'
    ), storage, 2_000_000)).toBe(false);
    expect(isMazerOAuthCallbackReadyForBoot(createLocation(
      `https://preview.example.test/?code=one-time-code&state=${pending.state}`
    ), storage, 2_000_000)).toBe(false);
    expect(isMazerOAuthCallbackReadyForBoot(createLocation(
      `https://mazer.fawxzzy.com/?code=one-time-code&state=${pending.state}`
    ), storage, 2_400_001)).toBe(false);
  });

  test('scrubs callback material before returning the captured in-memory result', () => {
    const location = createLocation('https://mazer.fawxzzy.com/?runtimeDiagnostics=1&code=secret&state=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789#error_description=raw');
    const history = { replaceState: vi.fn() };
    expect(isMazerOAuthCallbackRequest(location)).toBe(true);
    const captured = captureAndScrubMazerOAuthCallback(location, history);
    expect(captured.requested).toBe(true);
    expect(captured.malformed).toBe(true);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?runtimeDiagnostics=1');
    expect(JSON.stringify(captured)).not.toContain('raw');
  });

  test('scrubs and rejects callback material delivered to a noncanonical host or path', () => {
    for (const href of [
      'https://preview.example.test/?code=secret&state=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
      'https://mazer.fawxzzy.com/privacy?code=secret&state=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789'
    ]) {
      const location = createLocation(href);
      const history = { replaceState: vi.fn() };
      const captured = captureAndScrubMazerOAuthCallback(location, history);
      expect(captured).toMatchObject({ malformed: true, requested: true });
      expect(history.replaceState).toHaveBeenCalledWith(null, '', location.pathname);
    }
  });

  test('exchanges exactly once, validates claims and subject, commits the session, and rejects replay', async () => {
    const storage = new MemoryStorage();
    const startRuntime = createRuntime(storage);
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(MAZER_OAUTH_TOKEN_URL);
      expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', method: 'POST', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer' });
      expect(String(init?.body)).toContain('grant_type=authorization_code');
      return new Response(JSON.stringify({
        access_token: token,
        expires_in: 3600,
        refresh_token: 'refresh-token',
        token_type: 'bearer'
      }), { headers: { 'content-type': 'application/json' }, status: 200 });
    }) as typeof fetch;
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    const client = createClient(claims);
    const callback = {
      code: 'one-time-code',
      malformed: false,
      providerError: false,
      requested: true,
      state: pending.state
    };
    expect(await consumeMazerOAuthCallback(callback, async () => client, runtime)).toEqual({ status: 'connected' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(storage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token') ?? '{}');
    expect(persisted).toMatchObject({
      access_token: token,
      expires_at: 2_100,
      expires_in: 100,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      user: { id: claims.sub }
    });
    expect(storage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
    expect(runtime.notifyAcceptedSession).toHaveBeenCalledWith(expect.objectContaining({
      access_token: token,
      user: expect.objectContaining({ id: claims.sub })
    }));
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(storage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();
    expect(await consumeMazerOAuthCallback(callback, async () => client, runtime)).toEqual({
      category: 'expired_or_missing_state',
      status: 'failed'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('claims pending PKCE state before awaiting exchange so concurrent consumption cannot race', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage));
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    let releaseResponse: ((response: Response) => void) | null = null;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      releaseResponse = resolve;
    })) as unknown as typeof fetch;
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    const client = createClient(claims);
    const callback = {
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    };

    const first = consumeMazerOAuthCallback(callback, async () => client, runtime);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(storage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();
    await expect(consumeMazerOAuthCallback(callback, async () => client, runtime)).resolves.toEqual({
      category: 'expired_or_missing_state', status: 'failed'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    releaseResponse?.(new Response(JSON.stringify({
      access_token: token,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 }));
    await expect(first).resolves.toEqual({ status: 'connected' });
    expect(storage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).not.toBeNull();
  });

  test('does not let an older in-flight callback delete or commit across a newer authorization attempt', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage));
    const firstPending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    let releaseResponse: ((response: Response) => void) | null = null;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      releaseResponse = resolve;
    })) as unknown as typeof fetch;
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    const client = createClient(claims);
    const first = consumeMazerOAuthCallback({
      code: 'old-code', malformed: false, providerError: false, requested: true, state: firstPending.state
    }, async () => client, runtime);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await beginMazerOAuthAuthorization(runtime);
    const newerPendingRaw = storage.getItem(MAZER_OAUTH_PENDING_KEY);
    expect(newerPendingRaw).not.toBeNull();
    expect(JSON.parse(newerPendingRaw ?? '{}').state).not.toBe(firstPending.state);
    releaseResponse?.(new Response(JSON.stringify({
      access_token: token,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 }));

    await expect(first).resolves.toEqual({ category: 'expired_or_missing_state', status: 'failed' });
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(storage.getItem(MAZER_OAUTH_PENDING_KEY)).toBe(newerPendingRaw);
  });

  test('rejects an older tab callback after a newer tab signs in or signs out', async () => {
    const runCase = async (newerAction: (sharedStorage: MemoryStorage) => Promise<void> | void): Promise<void> => {
      const tabAStorage = new MemoryStorage();
      const sharedStorage = new MemoryStorage();
      const tabAStartRuntime = createRuntime(tabAStorage);
      tabAStartRuntime.authStorage = sharedStorage;
      await beginMazerOAuthAuthorization(tabAStartRuntime);
      const tabAPending = JSON.parse(tabAStorage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
      let releaseTabA: ((response: Response) => void) | null = null;
      const tabAFetch = vi.fn(() => new Promise<Response>((resolve) => {
        releaseTabA = resolve;
      })) as unknown as typeof fetch;
      const tabARuntime = createRuntime(tabAStorage, createLocation(), tabAFetch);
      tabARuntime.authStorage = sharedStorage;
      const tabAClient = createClient(createAccessToken().claims);
      const tabAResult = consumeMazerOAuthCallback({
        code: 'older-code', malformed: false, providerError: false, requested: true, state: tabAPending.state
      }, async () => tabAClient, tabARuntime);
      await vi.waitFor(() => expect(tabAFetch).toHaveBeenCalledTimes(1));

      await newerAction(sharedStorage);
      const sharedSessionPostimage = sharedStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token');
      releaseTabA?.(new Response(JSON.stringify({
        access_token: createAccessToken().token,
        expires_in: 3600,
        refresh_token: 'older-refresh-token',
        token_type: 'bearer'
      }), { headers: { 'content-type': 'application/json' }, status: 200 }));

      await expect(tabAResult).resolves.toEqual({ category: 'expired_or_missing_state', status: 'failed' });
      expect(tabAClient.auth.setSession).not.toHaveBeenCalled();
      expect(sharedStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(sharedSessionPostimage);
    };

    await runCase(async (sharedStorage) => {
      const tabBStorage = new MemoryStorage();
      const tabBRuntime = createRuntime(tabBStorage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
        access_token: createAccessToken().token,
        expires_in: 3600,
        refresh_token: 'newer-refresh-token',
        token_type: 'bearer'
      }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
      tabBRuntime.authStorage = sharedStorage;
      await beginMazerOAuthAuthorization(tabBRuntime);
      const tabBPending = JSON.parse(tabBStorage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
      await expect(consumeMazerOAuthCallback({
        code: 'newer-code', malformed: false, providerError: false, requested: true, state: tabBPending.state
      }, async () => createClient(createAccessToken().claims), tabBRuntime)).resolves.toEqual({ status: 'connected' });
    });

    await runCase((sharedStorage) => {
      expect(advanceMazerSharedAuthMutationEpoch(sharedStorage)).not.toBeNull();
      sharedStorage.removeItem('sb-bxtcuhkotumitoqtrcej-auth-token');
    });
  });

  test('rejects declared and streamed oversized token responses before unbounded buffering', async () => {
    const runCase = async (response: Response): Promise<void> => {
      const storage = new MemoryStorage();
      await beginMazerOAuthAuthorization(createRuntime(storage));
      const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
      const fetchImpl = vi.fn(async () => response) as typeof fetch;
      const client = createClient(createAccessToken().claims);
      await expect(consumeMazerOAuthCallback({
        code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
      }, async () => client, createRuntime(storage, createLocation(), fetchImpl))).resolves.toEqual({
        category: 'exchange_unavailable', status: 'failed'
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(client.auth.setSession).not.toHaveBeenCalled();
    };

    await runCase(new Response('{}', {
      headers: { 'content-length': '16385', 'content-type': 'application/json' },
      status: 200
    }));

    let streamCancelled = false;
    await runCase(new Response(new ReadableStream<Uint8Array>({
      cancel: () => { streamCancelled = true; },
      start: (controller) => {
        controller.enqueue(new Uint8Array(10_000));
        controller.enqueue(new Uint8Array(10_000));
      }
    }), { headers: { 'content-type': 'application/json' }, status: 200 }));
    expect(streamCancelled).toBe(true);
  });

  test('rejects wrong state and auth-epoch drift before session mutation', async () => {
    const storage = new MemoryStorage();
    const runtime = createRuntime(storage);
    await beginMazerOAuthAuthorization(runtime);
    const client = createClient(createAccessToken().claims);
    expect(await consumeMazerOAuthCallback({
      code: 'code', malformed: false, providerError: false, requested: true, state: 'x'.repeat(43)
    }, async () => client, runtime)).toEqual({ category: 'invalid_state', status: 'failed' });
    expect(client.auth.setSession).not.toHaveBeenCalled();

    await beginMazerOAuthAuthorization(runtime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    advanceMazerAuthMutationEpoch(storage);
    expect(await consumeMazerOAuthCallback({
      code: 'code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, runtime)).toEqual({ category: 'expired_or_missing_state', status: 'failed' });
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  test('clears only the exact malformed or expired pending attempt on terminal failure', async () => {
    const malformedStorage = new MemoryStorage();
    malformedStorage.setItem(MAZER_OAUTH_PENDING_KEY, '{malformed');
    const malformedFetch = vi.fn() as typeof fetch;
    await expect(consumeMazerOAuthCallback({
      code: 'code', malformed: false, providerError: false, requested: true, state: 'x'.repeat(43)
    }, async () => createClient(createAccessToken().claims), createRuntime(
      malformedStorage,
      createLocation(),
      malformedFetch
    ))).resolves.toEqual({ category: 'expired_or_missing_state', status: 'failed' });
    expect(malformedStorage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();
    expect(malformedFetch).not.toHaveBeenCalled();

    const expiredStorage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(expiredStorage));
    const expiredRaw = expiredStorage.getItem(MAZER_OAUTH_PENDING_KEY);
    const expired = JSON.parse(expiredRaw ?? '{}');
    const expiredRuntime = createRuntime(expiredStorage);
    expiredRuntime.now = () => 2_300_001;
    await expect(consumeMazerOAuthCallback({
      code: 'code', malformed: false, providerError: false, requested: true, state: expired.state
    }, async () => createClient(createAccessToken().claims), expiredRuntime)).resolves.toEqual({
      category: 'expired_or_missing_state', status: 'failed'
    });
    expect(expiredStorage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();

    const newerStorage = new MemoryStorage();
    newerStorage.setItem(MAZER_OAUTH_PENDING_KEY, expiredRaw ?? '');
    const mismatchedRuntime = createRuntime(newerStorage);
    mismatchedRuntime.now = () => 2_300_001;
    await expect(consumeMazerOAuthCallback({
      code: 'code', malformed: false, providerError: false, requested: true, state: 'y'.repeat(43)
    }, async () => createClient(createAccessToken().claims), mismatchedRuntime)).resolves.toEqual({
      category: 'expired_or_missing_state', status: 'failed'
    });
    expect(newerStorage.getItem(MAZER_OAUTH_PENDING_KEY)).toBe(expiredRaw);
  });

  test('treats provider cancellation as terminal, consumes pending state, and never exchanges', async () => {
    const storage = new MemoryStorage();
    const fetchImpl = vi.fn() as typeof fetch;
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    await beginMazerOAuthAuthorization(runtime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const client = createClient(createAccessToken().claims);
    expect(await consumeMazerOAuthCallback({
      code: null, malformed: false, providerError: true, requested: true, state: pending.state
    }, async () => client, runtime)).toEqual({ category: 'cancelled', status: 'failed' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(storage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();
  });

  test.each([
    ['issuer', { iss: 'https://attacker.example/auth/v1' }],
    ['audience', { aud: 'anon' }],
    ['role', { role: 'service_role' }],
    ['client', { client_id: 'different-client' }],
    ['subject', { sub: 'not-a-uuid' }],
    ['session', { session_id: 'not-a-uuid' }],
    ['expiry', { exp: 2_000 }],
    ['issued-at', { iat: 2_061 }]
  ])('rejects an invalid %s claim before committing a session', async (_label, override) => {
    const storage = new MemoryStorage();
    const startRuntime = createRuntime(storage);
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims: tokenClaims, token } = createAccessToken();
    const claims = { ...tokenClaims, ...override };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch;
    const client = createClient(claims);
    expect(await consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, createRuntime(storage, createLocation(), fetchImpl))).toEqual({
      category: 'session_invalid', status: 'failed'
    });
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  test('aborts a timed-out exchange once and never creates a client session', async () => {
    const storage = new MemoryStorage();
    const runtime = createRuntime(storage);
    await beginMazerOAuthAuthorization(runtime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException('aborted', 'AbortError');
    }) as typeof fetch;
    const timeoutRuntime = createRuntime(storage, createLocation(), fetchImpl);
    timeoutRuntime.setTimer = (handler) => {
      handler();
      return setTimeout(() => undefined, 0);
    };
    const client = createClient(createAccessToken().claims);
    expect(await consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, timeoutRuntime)).toEqual({ category: 'exchange_unavailable', status: 'failed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  test('bounds a stalled remote identity verification and never commits a client session', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage));
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch;
    const client = createClient(claims);
    vi.mocked(client.auth.getUser).mockImplementation(() => new Promise(() => undefined));
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    let timerCount = 0;
    runtime.setTimer = (handler) => {
      timerCount += 1;
      if (timerCount === 4) {
        handler();
      }
      return setTimeout(() => undefined, 60_000);
    };

    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, runtime)).resolves.toEqual({ category: 'session_invalid', status: 'failed' });
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  test('rejects a second callback while another tab owns a live session transaction', async () => {
    const storage = new MemoryStorage();
    const authStorage = new MemoryStorage();
    const { claims, token } = createAccessToken();
    const owner = 'a'.repeat(43);
    const firstSession = JSON.stringify({ access_token: token, refresh_token: 'first-refresh-token' });
    const transaction = JSON.stringify({
      committedAccessToken: token,
      createdAtEpochMs: 2_000_000,
      owner,
      preimageRaw: null,
      version: 2
    });
    authStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, transaction);
    authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', firstSession);
    const startRuntime = createRuntime(storage);
    startRuntime.authStorage = authStorage;
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const secondToken = `${token.slice(0, token.lastIndexOf('.') + 1)}second-signature`;
    const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
      access_token: secondToken,
      expires_in: 100,
      refresh_token: 'second-refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
    runtime.authStorage = authStorage;
    const client = createClient(claims);
    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, runtime)).resolves.toEqual({ category: 'storage_unavailable', status: 'failed' });
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBe(transaction);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(firstSession);
    expect(isMazerOAuthSessionQuarantined(authStorage, 2_000_001)).toBe(true);
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  test('fails without mutating shared storage when the exclusive session lock is busy', async () => {
    const storage = new MemoryStorage();
    const authStorage = new MemoryStorage();
    const previousSession = JSON.stringify({ access_token: 'previous-token', refresh_token: 'previous-refresh' });
    authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', previousSession);
    const startRuntime = createRuntime(storage);
    startRuntime.authStorage = authStorage;
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 100,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
    runtime.authStorage = authStorage;
    runtime.runExclusiveSessionTransaction = vi.fn(async () => null);

    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => createClient(claims), runtime)).resolves.toEqual({
      category: 'storage_unavailable',
      status: 'failed'
    });
    expect(runtime.runExclusiveSessionTransaction).toHaveBeenCalledTimes(1);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(previousSession);
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
  });

  test('rejects external ownership acquired during its final shared-session preimage check', async () => {
    const storage = new MemoryStorage();
    const authStorage = new MemoryStorage();
    const { claims, token } = createAccessToken();
    const firstSession = JSON.stringify({ access_token: token, refresh_token: 'first-refresh-token' });
    const firstTransaction = JSON.stringify({
      committedAccessToken: token,
      createdAtEpochMs: 2_000_000,
      owner: 'a'.repeat(43),
      preimageRaw: null,
      version: 2
    });
    const startRuntime = createRuntime(storage);
    startRuntime.authStorage = authStorage;
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const readAuthStorage = authStorage.getItem.bind(authStorage);
    let injected = false;
    authStorage.getItem = (key) => {
      const value = readAuthStorage(key);
      if (!injected && key === 'sb-bxtcuhkotumitoqtrcej-auth-token') {
        injected = true;
        authStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, firstTransaction);
        authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', firstSession);
      }
      return value;
    };
    const secondToken = `${token.slice(0, token.lastIndexOf('.') + 1)}second-signature`;
    const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
      access_token: secondToken,
      expires_in: 100,
      refresh_token: 'second-refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
    runtime.authStorage = authStorage;

    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => createClient(claims), runtime)).resolves.toEqual({
      category: 'expired_or_missing_state',
      status: 'failed'
    });
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBe(firstTransaction);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(firstSession);
  });

  test('recovers an orphaned transaction after its bounded lifetime only inside the shared lock', async () => {
    const lock = new ExclusiveLockHarness();
    const authStorage = new MemoryStorage();
    const previousSession = JSON.stringify({ access_token: 'previous-token', refresh_token: 'previous-refresh' });
    const provisionalSession = JSON.stringify({ access_token: 'provisional-token', refresh_token: 'provisional-refresh' });
    authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', provisionalSession);
    authStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, JSON.stringify({
      committedAccessToken: 'provisional-token',
      createdAtEpochMs: 1_900_000,
      owner: 'a'.repeat(43),
      preimageRaw: previousSession,
      version: 2
    }));

    expect(isMazerOAuthSessionQuarantined(authStorage, 2_000_001)).toBe(true);
    await expect(recoverMazerOAuthSessionQuarantine(
      authStorage,
      2_000_001,
      lock
    )).resolves.toBe(true);
    expect(isMazerOAuthSessionQuarantined(authStorage, 2_000_001)).toBe(false);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(previousSession);
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
    authStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, '{malformed');
    expect(isMazerOAuthSessionQuarantined(authStorage, 2_000_001)).toBe(true);
    await expect(recoverMazerOAuthSessionQuarantine(
      authStorage,
      2_000_001,
      lock
    )).resolves.toBe(false);

    const ambiguousStorage = new MemoryStorage();
    ambiguousStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', provisionalSession);
    const ambiguousTransaction = JSON.stringify({
      committedAccessToken: null,
      createdAtEpochMs: 1_900_000,
      owner: 'b'.repeat(43),
      preimageRaw: previousSession,
      version: 2
    });
    ambiguousStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, ambiguousTransaction);
    await expect(recoverMazerOAuthSessionQuarantine(
      ambiguousStorage,
      2_000_001,
      lock
    )).resolves.toBe(true);
    expect(isMazerOAuthSessionQuarantined(ambiguousStorage, 2_000_001)).toBe(false);
    expect(ambiguousStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(provisionalSession);
    expect(ambiguousStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();

    const emptyPreimageStorage = new MemoryStorage();
    emptyPreimageStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', provisionalSession);
    emptyPreimageStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, JSON.stringify({
      committedAccessToken: null,
      createdAtEpochMs: 1_900_000,
      owner: 'c'.repeat(43),
      preimageRaw: null,
      version: 2
    }));
    await expect(recoverMazerOAuthSessionQuarantine(
      emptyPreimageStorage,
      2_000_001,
      lock
    )).resolves.toBe(true);
    expect(isMazerOAuthSessionQuarantined(emptyPreimageStorage, 2_000_001)).toBe(false);
    expect(emptyPreimageStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(provisionalSession);
    expect(emptyPreimageStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();

    const signedOutStorage = new MemoryStorage();
    signedOutStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, JSON.stringify({
      committedAccessToken: null,
      createdAtEpochMs: 1_900_000,
      owner: 'd'.repeat(43),
      preimageRaw: previousSession,
      version: 2
    }));
    await expect(recoverMazerOAuthSessionQuarantine(
      signedOutStorage,
      2_000_001,
      lock
    )).resolves.toBe(true);
    expect(isMazerOAuthSessionQuarantined(signedOutStorage, 2_000_001)).toBe(false);
    expect(signedOutStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBeNull();
    expect(signedOutStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
  });

  test('does not let stale rollback interleave a newer shared auth mutation', async () => {
    const lock = new ExclusiveLockHarness();
    const authStorage = new MemoryStorage();
    const previousSession = JSON.stringify({ access_token: 'previous-token' });
    const provisionalSession = JSON.stringify({ access_token: 'provisional-token' });
    const newerSession = JSON.stringify({ access_token: 'newer-token' });
    authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', provisionalSession);
    authStorage.setItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY, JSON.stringify({
      committedAccessToken: 'provisional-token',
      createdAtEpochMs: 1_900_000,
      owner: 'e'.repeat(43),
      preimageRaw: previousSession,
      version: 2
    }));

    let finishNewerMutation: (() => void) | null = null;
    const newerMutation = runMazerExclusiveAuthMutation(async () => {
      authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', newerSession);
      await new Promise<void>((resolve) => { finishNewerMutation = resolve; });
    }, lock);
    await vi.waitFor(() => expect(finishNewerMutation).not.toBeNull());

    await expect(recoverMazerOAuthSessionQuarantine(
      authStorage,
      2_000_001,
      lock
    )).resolves.toBe(false);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(newerSession);

    finishNewerMutation?.();
    await expect(newerMutation).resolves.toEqual({ status: 'completed', value: undefined });
    await expect(recoverMazerOAuthSessionQuarantine(
      authStorage,
      2_000_001,
      lock
    )).resolves.toBe(true);
    expect(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token')).toBe(newerSession);
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
  });

  test('keeps the accepted session when optional broadcast notification is unavailable', async () => {
    const storage = new MemoryStorage();
    const authStorage = new MemoryStorage();
    const previousSession = JSON.stringify({ access_token: 'previous-token', refresh_token: 'previous-refresh' });
    authStorage.setItem('sb-bxtcuhkotumitoqtrcej-auth-token', previousSession);
    const startRuntime = createRuntime(storage);
    startRuntime.authStorage = authStorage;
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 100,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
    runtime.authStorage = authStorage;
    runtime.notifyAcceptedSession = vi.fn(() => false);
    const client = createClient(claims);

    await expect(consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, runtime)).resolves.toEqual({ status: 'connected' });
    expect(JSON.parse(authStorage.getItem('sb-bxtcuhkotumitoqtrcej-auth-token') ?? '{}').access_token).toBe(token);
    expect(authStorage.getItem(MAZER_OAUTH_SESSION_QUARANTINE_KEY)).toBeNull();
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  test('fails closed when shared auth storage rejects the session write', async () => {
    const storage = new MemoryStorage();
    const authStorage = new MemoryStorage();
    const startRuntime = createRuntime(storage);
    startRuntime.authStorage = authStorage;
    await beginMazerOAuthAuthorization(startRuntime);
    const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    const { claims, token } = createAccessToken();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: token,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer'
    }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch;
    const client = createClient(claims);
    authStorage.setItem = () => { throw new DOMException('denied', 'SecurityError'); };
    const runtime = createRuntime(storage, createLocation(), fetchImpl);
    runtime.authStorage = authStorage;
    const result = await consumeMazerOAuthCallback({
      code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
    }, async () => client, runtime);
    expect(result).toEqual({ category: 'storage_unavailable', status: 'failed' });
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(storage.getItem(MAZER_OAUTH_PENDING_KEY)).toBeNull();
  });
});
