import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  LEGACY_AUTH_RECHECK_REVOKED_CODES,
  LEGACY_AUTH_RECHECK_THROTTLE_MS,
  classifyLegacyAuthRecheckResponse,
  createLegacyAuthRecheckController,
  decideLegacyAuthRecheck,
  deriveLegacyAuthSessionKey,
  installLegacyAuthRecheckInBrowser,
  isSameLegacyAuthSession,
  readLegacyAuthStoredSessionIdentity,
  requestLegacyAuthProviderUser,
  type LegacyAuthRecheckBrowserTarget,
  type LegacyAuthRecheckDecisionInput,
  type LegacyAuthRecheckDeps,
  type LegacyAuthRecheckDropResult,
  type LegacyAuthRecheckDropTarget,
  type LegacyAuthRecheckProbe
} from '../../src/legacy-runtime/legacyAuthRecheck';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';
import { resolveLegacyAccountStatusNotice } from '../../src/legacy-runtime/legacyAccountStatusState';
import { resolveLegacyOAuthFailureCopy } from '../../src/legacy-runtime/legacyPlayerMessage';

const USER = '11111111-2222-4333-8444-555555555555';
const TARGET: LegacyAuthRecheckDropTarget = { sessionKey: 'sid:session-1', userId: USER };
const AUTH_KEY = 'sb-bxtcuhkotumitoqtrcej-auth-token';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const response = (status: number, code: string | null = null, userId: string | null = null) => ({ code, status, userId });

describe('classifyLegacyAuthRecheckResponse: only a named dead session signs out', () => {
  test('a global sign-out (403 session_not_found) and a deleted or banned account are revoked', () => {
    expect(classifyLegacyAuthRecheckResponse(response(403, 'session_not_found'), USER)).toBe('revoked');
    expect(classifyLegacyAuthRecheckResponse(response(401, 'session_not_found'), USER)).toBe('revoked');
    expect(classifyLegacyAuthRecheckResponse(response(403, 'user_not_found'), USER)).toBe('revoked');
    expect(classifyLegacyAuthRecheckResponse(response(403, 'user_banned'), USER)).toBe('revoked');
    expect(classifyLegacyAuthRecheckResponse(response(403, 'session_expired'), USER)).toBe('revoked');
  });

  test('offline, timeouts, server errors, rate limits and code-less 401/403 keep the session', () => {
    expect(classifyLegacyAuthRecheckResponse(response(0), USER)).toBe('transient');
    for (const status of [400, 404, 408, 429, 500, 502, 503, 504]) {
      expect(classifyLegacyAuthRecheckResponse(response(status, 'session_not_found'), USER)).toBe('transient');
    }
    // A gateway "Invalid API key" (no code), a captive portal page (no JSON) and an expired token (bad_jwt).
    expect(classifyLegacyAuthRecheckResponse(response(401), USER)).toBe('transient');
    expect(classifyLegacyAuthRecheckResponse(response(403), USER)).toBe('transient');
    expect(classifyLegacyAuthRecheckResponse(response(401, 'bad_jwt'), USER)).toBe('transient');
    expect(classifyLegacyAuthRecheckResponse(response(403, 'no_authorization'), USER)).toBe('transient');
    expect(LEGACY_AUTH_RECHECK_REVOKED_CODES).not.toContain('bad_jwt');
  });

  test('a 2xx is valid only for the same user', () => {
    expect(classifyLegacyAuthRecheckResponse(response(200, null, USER), USER)).toBe('valid');
    expect(classifyLegacyAuthRecheckResponse(response(200, null, 'someone-else'), USER)).toBe('transient');
    expect(classifyLegacyAuthRecheckResponse(response(200), USER)).toBe('transient');
  });
});

describe('requestLegacyAuthProviderUser', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const textResponse = (status: number, body: string) => ({ status, text: async () => body });

  test('asks GET /auth/v1/user with the anon key and the bearer token, credential-less and uncached', async () => {
    const fetch = vi.fn(async () => textResponse(200, JSON.stringify({ id: USER, email: 'x@y.z' })));
    const result = await requestLegacyAuthProviderUser({
      accessToken: 'access-token',
      anonKey: 'anon-key',
      fetch,
      projectUrl: 'https://example.supabase.co/'
    });
    expect(result).toEqual({ code: null, status: 200, userId: USER });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/auth/v1/user');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer access-token' });
  });

  test('reads code (new API) and error_code (older API) from an error body', async () => {
    const newShape = await requestLegacyAuthProviderUser({
      accessToken: 't', anonKey: 'k', projectUrl: 'https://e.supabase.co',
      fetch: async () => textResponse(403, JSON.stringify({ code: 'session_not_found', msg: 'Session not found' }))
    });
    expect(newShape).toEqual({ code: 'session_not_found', status: 403, userId: null });
    const oldShape = await requestLegacyAuthProviderUser({
      accessToken: 't', anonKey: 'k', projectUrl: 'https://e.supabase.co',
      fetch: async () => textResponse(403, JSON.stringify({ error_code: 'user_not_found' }))
    });
    expect(oldShape.code).toBe('user_not_found');
  });

  test('a rejected fetch (offline) is status 0 and an unreadable body has no code', async () => {
    const offline = await requestLegacyAuthProviderUser({
      accessToken: 't', anonKey: 'k', projectUrl: 'https://e.supabase.co',
      fetch: async () => { throw new TypeError('Failed to fetch'); }
    });
    expect(offline).toEqual({ code: null, status: 0, userId: null });
    const html = await requestLegacyAuthProviderUser({
      accessToken: 't', anonKey: 'k', projectUrl: 'https://e.supabase.co',
      fetch: async () => textResponse(403, '<html>captive portal</html>')
    });
    expect(html).toEqual({ code: null, status: 403, userId: null });
    expect(classifyLegacyAuthRecheckResponse(html, USER)).toBe('transient');
  });

  test('a hung request is aborted after the timeout and reads as status 0', async () => {
    vi.useFakeTimers();
    const pending = requestLegacyAuthProviderUser({
      accessToken: 't', anonKey: 'k', projectUrl: 'https://e.supabase.co', timeoutMs: 1_000,
      fetch: (_url, init) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ code: null, status: 0, userId: null });
  });
});

describe('decideLegacyAuthRecheck', () => {
  const base: LegacyAuthRecheckDecisionInput = {
    authenticated: true,
    inFlight: false,
    lastCheckedAtMs: null,
    nowMs: 1_000_000,
    online: true,
    safePoint: true,
    trigger: 'boot'
  };

  test('boot with a stored session and no run checks at once', () => {
    expect(decideLegacyAuthRecheck(base)).toEqual({ action: 'check' });
  });

  test('signed out, fixture or preview sessions are never checked', () => {
    expect(decideLegacyAuthRecheck({ ...base, authenticated: false })).toEqual({ action: 'skip', reason: 'not-authenticated' });
  });

  test('offline never checks (and so never signs out)', () => {
    expect(decideLegacyAuthRecheck({ ...base, online: false })).toEqual({ action: 'skip', reason: 'offline' });
  });

  test('one check in flight at a time', () => {
    expect(decideLegacyAuthRecheck({ ...base, inFlight: true })).toEqual({ action: 'skip', reason: 'in-flight' });
  });

  test('throttled to one check per 60 s', () => {
    const resume = { ...base, trigger: 'resume' as const, lastCheckedAtMs: base.nowMs };
    expect(decideLegacyAuthRecheck({ ...resume, nowMs: base.nowMs + LEGACY_AUTH_RECHECK_THROTTLE_MS - 1 }))
      .toEqual({ action: 'skip', reason: 'throttled' });
    expect(decideLegacyAuthRecheck({ ...resume, nowMs: base.nowMs + LEGACY_AUTH_RECHECK_THROTTLE_MS }))
      .toEqual({ action: 'check' });
    expect(LEGACY_AUTH_RECHECK_THROTTLE_MS).toBe(60_000);
  });

  test('a clock that moved backwards does not block checks forever', () => {
    expect(decideLegacyAuthRecheck({ ...base, lastCheckedAtMs: base.nowMs + 10_000_000 })).toEqual({ action: 'check' });
  });

  test('mid-run defers to the next safe point', () => {
    expect(decideLegacyAuthRecheck({ ...base, safePoint: false, trigger: 'resume' }))
      .toEqual({ action: 'defer', reason: 'mid-run' });
  });
});

interface Harness {
  deps: LegacyAuthRecheckDeps<string>;
  drop: ReturnType<typeof vi.fn>;
  onSignedOut: ReturnType<typeof vi.fn>;
  probe: ReturnType<typeof vi.fn>;
  world: { authenticated: boolean; nowMs: number; online: boolean; safePoint: boolean };
}

const createHarness = (probeResult: LegacyAuthRecheckProbe | (() => Promise<LegacyAuthRecheckProbe>)): Harness => {
  const world = { authenticated: true, nowMs: 5_000_000, online: true, safePoint: true };
  const probe = vi.fn(typeof probeResult === 'function' ? probeResult : async () => probeResult);
  const drop = vi.fn(async (
    _target: LegacyAuthRecheckDropTarget,
    _stillSafe: () => boolean
  ): Promise<LegacyAuthRecheckDropResult<string>> => ({ snapshot: 'revoked-snapshot', status: 'dropped' }));
  const onSignedOut = vi.fn();
  return {
    deps: {
      drop,
      isAuthenticated: () => world.authenticated,
      isOnline: () => world.online,
      isSafePoint: () => world.safePoint,
      now: () => world.nowMs,
      onSignedOut,
      probe,
      signedOutSnapshot: () => 'removed-snapshot'
    },
    drop,
    onSignedOut,
    probe,
    world
  };
};

describe('createLegacyAuthRecheckController', () => {
  test('revoked: the session is dropped and the signed-out snapshot applied', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.drop).toHaveBeenCalledWith(TARGET, expect.any(Function));
    expect(harness.onSignedOut).toHaveBeenCalledWith('revoked-snapshot');
  });

  test('network failure / unclear answer: nothing is dropped and the player stays signed in', async () => {
    const harness = createHarness({ status: 'transient' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.probe).toHaveBeenCalledTimes(1);
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });

  test('a probe that throws counts as transient', async () => {
    const harness = createHarness(async () => { throw new Error('boom'); });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });

  test('offline: the provider is not asked at all', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.world.online = false;
    const controller = createLegacyAuthRecheckController(harness.deps);
    expect(await controller.request('resume')).toEqual({ action: 'skip', reason: 'offline' });
    expect(harness.probe).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });

  test('valid: nothing happens', async () => {
    const harness = createHarness({ status: 'valid' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });

  test('throttled: focus + visibilitychange and quick returns ask once per 60 s', async () => {
    const harness = createHarness({ status: 'valid' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    await controller.request('resume');
    harness.world.nowMs += 30_000;
    expect(await controller.request('resume')).toEqual({ action: 'skip', reason: 'throttled' });
    harness.world.nowMs += 30_000;
    expect(await controller.request('resume')).toEqual({ action: 'check' });
    expect(harness.probe).toHaveBeenCalledTimes(2);
  });

  test('mid-run: the check waits for the next safe point, then runs once', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.world.safePoint = false;
    const controller = createLegacyAuthRecheckController(harness.deps);
    expect(await controller.request('resume')).toEqual({ action: 'defer', reason: 'mid-run' });
    expect(harness.probe).not.toHaveBeenCalled();
    expect(controller.state.deferredCheck).toBe(true);
    await controller.notifySafePoint();
    expect(harness.probe).not.toHaveBeenCalled();
    harness.world.safePoint = true;
    await controller.notifySafePoint();
    expect(harness.probe).toHaveBeenCalledTimes(1);
    expect(harness.onSignedOut).toHaveBeenCalledWith('revoked-snapshot');
    await controller.notifySafePoint();
    expect(harness.probe).toHaveBeenCalledTimes(1);
  });

  test('a revocation that lands after a run started is dropped only at the next safe point', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.probe.mockImplementation(async () => {
      harness.world.safePoint = false; // the boot run started while the provider answered
      return { status: 'revoked', target: TARGET };
    });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    expect(controller.state.deferredDrop).toEqual(TARGET);
    harness.world.safePoint = true;
    await controller.notifySafePoint();
    expect(harness.drop).toHaveBeenCalledWith(TARGET, expect.any(Function));
    expect(harness.onSignedOut).toHaveBeenCalledWith('revoked-snapshot');
  });

  test('a deferred drop is forgotten when the player is already signed out by then', async () => {
    const harness = createHarness(async () => {
      harness.world.safePoint = false;
      return { status: 'revoked', target: TARGET };
    });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    harness.world.safePoint = true;
    harness.world.authenticated = false;
    await controller.notifySafePoint();
    expect(harness.drop).not.toHaveBeenCalled();
    expect(controller.state.deferredDrop).toBeNull();
  });

  test('removed (already gone after the check): only the signed-out notice is applied', async () => {
    const harness = createHarness({ status: 'removed' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).toHaveBeenCalledWith('removed-snapshot');
  });

  test('removed while a run started: the notice waits for the next safe point (never mid-run)', async () => {
    const harness = createHarness(async () => {
      harness.world.safePoint = false;
      harness.world.authenticated = false;
      return { status: 'removed' };
    });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    expect(controller.state.deferredSignedOutNotice).toBe(true);
    await controller.notifySafePoint();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    harness.world.safePoint = true;
    await controller.notifySafePoint();
    expect(harness.onSignedOut).toHaveBeenCalledWith('removed-snapshot');
    expect(controller.state.deferredSignedOutNotice).toBe(false);
  });

  test('a deferred removed notice is dropped when the player signed in again meanwhile', async () => {
    const harness = createHarness(async () => {
      harness.world.safePoint = false;
      return { status: 'removed' };
    });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    harness.world.safePoint = true;
    harness.world.authenticated = true;
    await controller.notifySafePoint();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });

  test('a run that starts while the drop waits for the auth lock defers the drop (stillSafe re-checked inside)', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.drop.mockImplementationOnce(async (_target, stillSafe) => {
      harness.world.safePoint = false; // the player started a run during the lock wait
      return stillSafe() ? { snapshot: 'revoked-snapshot', status: 'dropped' } : { status: 'deferred' };
    });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    expect(controller.state.deferredDrop).toEqual(TARGET);
    harness.world.safePoint = true;
    await controller.notifySafePoint();
    expect(harness.drop).toHaveBeenCalledTimes(2);
    expect(harness.onSignedOut).toHaveBeenCalledWith('revoked-snapshot');
    expect(controller.state.deferredDrop).toBeNull();
  });

  test('a drop that keeps the session (another sign-in is stored) shows nothing and is not retried', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.drop.mockResolvedValue({ status: 'kept' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    await controller.notifySafePoint();
    expect(harness.drop).toHaveBeenCalledTimes(1);
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    expect(controller.state.deferredDrop).toBeNull();
  });

  test('a drop that could not be verified shows nothing and keeps asking later', async () => {
    const harness = createHarness({ status: 'revoked', target: TARGET });
    harness.drop.mockResolvedValue({ status: 'kept' });
    const controller = createLegacyAuthRecheckController(harness.deps);
    await controller.request('boot');
    expect(harness.onSignedOut).not.toHaveBeenCalled();
    harness.world.nowMs += LEGACY_AUTH_RECHECK_THROTTLE_MS;
    expect(await controller.request('resume')).toEqual({ action: 'check' });
  });

  test('disposed (scene shut down): an answer in flight applies nothing', async () => {
    let release: (value: LegacyAuthRecheckProbe) => void = () => undefined;
    const harness = createHarness(() => new Promise<LegacyAuthRecheckProbe>((resolveProbe) => { release = resolveProbe; }));
    const controller = createLegacyAuthRecheckController(harness.deps);
    const pending = controller.request('boot');
    controller.dispose();
    release({ status: 'revoked', target: TARGET });
    await pending;
    expect(harness.drop).not.toHaveBeenCalled();
    expect(harness.onSignedOut).not.toHaveBeenCalled();
  });
});

describe('installLegacyAuthRecheckInBrowser', () => {
  const createTarget = () => {
    const listeners = new Map<string, Set<() => void>>();
    const add = (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    };
    const remove = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
    const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: add, removeEventListener: remove };
    const target = {
      document: doc,
      navigator: { onLine: true },
      window: { addEventListener: add, removeEventListener: remove }
    } as unknown as LegacyAuthRecheckBrowserTarget;
    const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
    return { doc, fire, listeners, target };
  };

  const flush = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };

  test('returning to the page asks once even when focus and visibilitychange both fire', async () => {
    const { fire, target } = createTarget();
    let nowMs = 1_000_000;
    const probe = vi.fn(async (): Promise<LegacyAuthRecheckProbe> => ({ status: 'valid' }));
    const binding = installLegacyAuthRecheckInBrowser<string>({
      drop: async () => ({ status: 'kept' }),
      isAuthenticated: () => true,
      isSafePoint: () => true,
      now: () => nowMs,
      onSignedOut: () => undefined,
      probe,
      signedOutSnapshot: () => 'x'
    }, target)!;
    fire('visibilitychange');
    fire('focus');
    await flush();
    expect(probe).toHaveBeenCalledTimes(1);
    nowMs += LEGACY_AUTH_RECHECK_THROTTLE_MS;
    fire('focus');
    await flush();
    expect(probe).toHaveBeenCalledTimes(2);
    binding.dispose();
  });

  test('hiding the page does not ask; dispose removes both listeners', async () => {
    const { doc, fire, listeners, target } = createTarget();
    const probe = vi.fn(async (): Promise<LegacyAuthRecheckProbe> => ({ status: 'valid' }));
    const binding = installLegacyAuthRecheckInBrowser<string>({
      drop: async () => ({ status: 'kept' }),
      isAuthenticated: () => true,
      isSafePoint: () => true,
      onSignedOut: () => undefined,
      probe,
      signedOutSnapshot: () => 'x'
    }, target)!;
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    await flush();
    expect(probe).not.toHaveBeenCalled();
    binding.dispose();
    binding.dispose();
    expect(listeners.get('visibilitychange')?.size).toBe(0);
    expect(listeners.get('focus')?.size).toBe(0);
  });

  test('offline in the browser: no provider call', async () => {
    const { fire, target } = createTarget();
    (target.navigator as { onLine: boolean }).onLine = false;
    const probe = vi.fn(async (): Promise<LegacyAuthRecheckProbe> => ({ status: 'revoked', target: TARGET }));
    installLegacyAuthRecheckInBrowser<string>({
      drop: async () => ({ status: 'dropped', snapshot: 'x' }),
      isAuthenticated: () => true,
      isSafePoint: () => true,
      onSignedOut: () => undefined,
      probe,
      signedOutSnapshot: () => 'x'
    }, target);
    fire('focus');
    await flush();
    expect(probe).not.toHaveBeenCalled();
  });

  test('no browser: nothing is installed', () => {
    expect(installLegacyAuthRecheckInBrowser<string>({
      drop: async () => ({ status: 'kept' }),
      isAuthenticated: () => true,
      isSafePoint: () => true,
      onSignedOut: () => undefined,
      probe: async () => ({ status: 'valid' }),
      signedOutSnapshot: () => 'x'
    }, null)).toBeNull();
  });
});

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeJwt = (sessionId: string | null, userId = USER) => [
  base64Url({ alg: 'HS256', typ: 'JWT' }),
  base64Url({ sub: userId, ...(sessionId === null ? {} : { session_id: sessionId }) }),
  'signature'
].join('.');
const storedSession = (sessionId: string, userId = USER) => JSON.stringify({
  access_token: fakeJwt(sessionId, userId),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `refresh-${sessionId}`,
  user: { email: 'player@example.test', id: userId, user_metadata: { username: 'player' } }
});

describe('session identity (which session an answer is about)', () => {
  test('the key is the session_id claim, stable across refreshed tokens of one session', () => {
    expect(deriveLegacyAuthSessionKey(fakeJwt('s-1'))).toBe('sid:s-1');
    expect(deriveLegacyAuthSessionKey(`${fakeJwt('s-1')}`.replace('signature', 'other'))).toBe('sid:s-1');
    expect(deriveLegacyAuthSessionKey(fakeJwt('s-2'))).toBe('sid:s-2');
  });

  test('a token without a session_id falls back to a fingerprint that never contains the token', () => {
    const token = fakeJwt(null);
    const key = deriveLegacyAuthSessionKey(token)!;
    expect(key).toMatch(/^tok:[0-9a-f]+:\d+$/);
    expect(key).not.toContain(token.split('.')[1]);
    expect(deriveLegacyAuthSessionKey('opaque-token')).toBe(deriveLegacyAuthSessionKey('opaque-token'));
    expect(deriveLegacyAuthSessionKey('opaque-token')).not.toBe(deriveLegacyAuthSessionKey('opaque-token2'));
    expect(deriveLegacyAuthSessionKey('')).toBeNull();
    expect(deriveLegacyAuthSessionKey(undefined)).toBeNull();
  });

  test('the stored identity is read from the raw session; same user with a new session is a different session', () => {
    const storage = new MemoryStorage();
    expect(readLegacyAuthStoredSessionIdentity(storage, AUTH_KEY)).toBeNull();
    storage.setItem(AUTH_KEY, storedSession('s-1'));
    const first = readLegacyAuthStoredSessionIdentity(storage, AUTH_KEY);
    expect(first).toEqual({ sessionKey: 'sid:s-1', userId: USER });
    storage.setItem(AUTH_KEY, storedSession('s-2'));
    const second = readLegacyAuthStoredSessionIdentity(storage, AUTH_KEY);
    expect(isSameLegacyAuthSession(first, second)).toBe(false);
    expect(isSameLegacyAuthSession(first, { sessionKey: 'sid:s-1', userId: USER })).toBe(true);
    expect(isSameLegacyAuthSession(first, null)).toBe(false);
    storage.setItem(AUTH_KEY, 'not json');
    expect(readLegacyAuthStoredSessionIdentity(storage, AUTH_KEY)).toBeNull();
  });
});

describe('dropRevokedLegacyAuthSession / probeLegacyAuthSessionWithProvider (real module, mocked auth-js)', () => {
  const loadAuth = async (initialSessionId: string) => {
    const storage = new MemoryStorage();
    storage.setItem(AUTH_KEY, storedSession(initialSessionId));
    const removeSession = vi.fn(async () => { storage.removeItem(AUTH_KEY); });
    const signOut = vi.fn(async () => { storage.removeItem(AUTH_KEY); return { error: null }; });
    const adminFetch = vi.fn();
    const auth = {
      admin: { fetch: adminFetch },
      getSession: vi.fn(async () => {
        const raw = storage.getItem(AUTH_KEY);
        return { data: { session: raw === null ? null : JSON.parse(raw) }, error: null };
      }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      storage,
      storageKey: AUTH_KEY,
      _removeSession: removeSession,
      _signOut: signOut
    };
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) },
      onLine: true
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      localStorage: storage,
      location: { pathname: '/' },
      sessionStorage: new MemoryStorage()
    });
    vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth })) }));
    const legacyAuth = await import('../../src/legacy-runtime/legacyAuth');
    return { adminFetch, legacyAuth, removeSession, signOut, storage };
  };

  afterEach(() => {
    vi.doUnmock('@supabase/supabase-js');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const S1: LegacyAuthRecheckDropTarget = { sessionKey: 'sid:s-1', userId: USER };

  test('the same user signed in again (new session in another tab) before the drop: no sign-out, no /logout', async () => {
    const { adminFetch, legacyAuth, removeSession, signOut, storage } = await loadAuth('s-2');
    const before = storage.getItem(AUTH_KEY);
    const result = await legacyAuth.dropRevokedLegacyAuthSession(S1, () => true);
    expect(result).toEqual({ status: 'kept' });
    expect(storage.getItem(AUTH_KEY)).toBe(before);
    expect(removeSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(adminFetch).not.toHaveBeenCalled();
  });

  test('the rejected session still stored: removed locally only (no /logout), session-ended notice', async () => {
    const { adminFetch, legacyAuth, removeSession, signOut, storage } = await loadAuth('s-1');
    const result = await legacyAuth.dropRevokedLegacyAuthSession(S1, () => true);
    expect(result.status).toBe('dropped');
    expect(result.status === 'dropped' ? result.snapshot.errorCode : null).toBe('session_invalid');
    expect(storage.getItem(AUTH_KEY)).toBeNull();
    expect(removeSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(adminFetch).not.toHaveBeenCalled();
  });

  test('a run started before the removal (stillSafe false inside the lock): deferred, session kept', async () => {
    const { legacyAuth, removeSession, storage } = await loadAuth('s-1');
    const result = await legacyAuth.dropRevokedLegacyAuthSession(S1, () => false);
    expect(result).toEqual({ status: 'deferred' });
    expect(storage.getItem(AUTH_KEY)).not.toBeNull();
    expect(removeSession).not.toHaveBeenCalled();
  });

  test('the probe skips an answer when the same user signed in again with a new session while it was asked', async () => {
    const { legacyAuth, storage } = await loadAuth('s-1');
    vi.stubGlobal('fetch', vi.fn(async () => {
      storage.setItem(AUTH_KEY, storedSession('s-2')); // another tab signed in again meanwhile
      return new Response(JSON.stringify({ code: 403, error_code: 'session_not_found' }), { status: 403 });
    }));
    expect(await legacyAuth.probeLegacyAuthSessionWithProvider()).toEqual({ status: 'skipped' });
  });

  test('the probe names the exact session it asked about when the provider rejects it', async () => {
    const { legacyAuth } = await loadAuth('s-1');
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(JSON.stringify({ code: 403, error_code: 'session_not_found' }), { status: 403 })
    )));
    expect(await legacyAuth.probeLegacyAuthSessionWithProvider()).toEqual({ status: 'revoked', target: S1 });
  });
});

describe('copy and wiring pins', () => {
  test('the signed-out notice is the existing copy-matrix row signin.session (no new row)', () => {
    const line = resolveLegacyOAuthFailureCopy('session_invalid');
    expect(line).toBe(AUTH_SURFACE_MESSAGES['signin.session']);
    expect(resolveLegacyAccountStatusNotice(line)).toBe(AUTH_SURFACE_MESSAGES['signin.session']);
  });

  const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

  test('the drop never records an explicit sign-out, never leaves for the host and never calls auth-js getUser', () => {
    const source = read('src/legacy-runtime/legacyAuth.ts');
    const dropStart = source.indexOf('export const dropRevokedLegacyAuthSession');
    const dropBody = source.slice(dropStart, source.indexOf('export const subscribeLegacyAuthState', dropStart));
    expect(dropStart).toBeGreaterThan(0);
    expect(dropBody).not.toContain('recordMazerExplicitSignOut');
    expect(dropBody).not.toContain('runMazerHostSignOut');
    expect(dropBody).not.toContain('location');
    // Local removal only: the provider already ended the session, so no /logout (and no refresh) is sent.
    expect(dropBody).not.toContain('_signOut');
    expect(dropBody).not.toContain('invokeLegacyLocalSignOutWithTimeout');
    expect(dropBody).toContain('_removeSession()');
    expect(dropBody.indexOf('isSameLegacyAuthSession(')).toBeLessThan(dropBody.indexOf('stillSafe()'));
    expect(dropBody.indexOf('stillSafe()')).toBeLessThan(dropBody.indexOf('_removeSession()'));
    const probeStart = source.indexOf('export const probeLegacyAuthSessionWithProvider');
    const probeBody = source.slice(probeStart, dropStart);
    // auth-js getUser() removes the session itself on session_not_found (mid-run); the probe must not use it.
    expect(probeBody).not.toContain('auth.getUser(');
    expect(probeBody).not.toContain('.signOut(');
    expect(probeBody).not.toContain('removeItem');
  });

  test('MenuScene installs the recheck after the boot read, defers to enterMenuMode and disposes on shutdown', () => {
    const scene = read('src/scenes/MenuScene.ts');
    expect(scene).toMatch(/applyLegacyAuthSnapshot\(snapshot\);\s*this\.installLegacyAuthRecheck\(\);/);
    expect(scene).toContain("isSafePoint: () => this.mode === 'menu'");
    expect(scene).toMatch(/this\.mode = 'menu';\s*\/\/[^\n]*\n\s*this\.authRecheck\?\.notifySafePoint\(\);/);
    expect(scene).toContain('this.authRecheck?.dispose();');
  });
});
