import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS,
  isLegacyAuthTransientSessionReadError,
  raceLegacyAuthSessionRead,
  shouldUseStoredLegacyAuthSession
} from '../../src/legacy-runtime/legacyAuthBootResolution';
import { MAZER_OAUTH_AUTH_SESSION_KEY } from '../../src/legacy-runtime/legacyAccountPortal';

// L1: a stored session whose boot refresh stalls or fails on a flaky radio must not show the sign-in screen,
// and must not keep the "Signing you in" shield (which swallows every tap) up for ~30 s.

describe('raceLegacyAuthSessionRead', () => {
  afterEach(() => vi.useRealTimers());

  test('returns the read when it settles before the deadline', async () => {
    await expect(raceLegacyAuthSessionRead(Promise.resolve(7), 50)).resolves.toEqual({ status: 'read', value: 7 });
  });

  test('times out at the bound and swallows the late result', async () => {
    vi.useFakeTimers();
    let resolveRead: (value: number) => void = () => undefined;
    const raced = raceLegacyAuthSessionRead(new Promise<number>((resolve) => { resolveRead = resolve; }));
    await vi.advanceTimersByTimeAsync(LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS - 1);
    let settled = false;
    void raced.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(raced).resolves.toEqual({ status: 'timed-out' });
    resolveRead(1);
    await Promise.resolve();
  });

  test('a late rejection after the timeout is not an unhandled rejection', async () => {
    vi.useFakeTimers();
    let rejectRead: (error: unknown) => void = () => undefined;
    const raced = raceLegacyAuthSessionRead(new Promise<number>((_, reject) => { rejectRead = reject; }), 10);
    await vi.advanceTimersByTimeAsync(10);
    await expect(raced).resolves.toEqual({ status: 'timed-out' });
    rejectRead(new Error('late'));
    await Promise.resolve();
  });

  test('an early rejection propagates', async () => {
    await expect(raceLegacyAuthSessionRead(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });

  test('the bound is well under the ~30 s auth-js retry window and over the 4 s account bootstrap budget', () => {
    expect(LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS).toBeGreaterThan(4_000);
    expect(LEGACY_AUTH_BOOT_SESSION_READ_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('transient classification and stand-in decision', () => {
  test.each([
    [{ name: 'AuthRetryableFetchError', message: 'x', status: 0 }, true],
    [{ message: 'x', status: 503 }, true],
    [{ message: 'x', status: 429 }, true],
    [{ message: 'x', status: 400 }, false],
    [{ message: 'x', status: 401 }, false],
    [{ message: 'Failed to fetch' }, false],
    [null, false],
    ['text', false]
  ])('%j -> %s', (error, expected) => {
    expect(isLegacyAuthTransientSessionReadError(error)).toBe(expected);
  });

  test('timed out with a stored session stands in; without one it does not', () => {
    expect(shouldUseStoredLegacyAuthSession({ kind: 'timed-out' }, true)).toBe(true);
    expect(shouldUseStoredLegacyAuthSession({ kind: 'timed-out' }, false)).toBe(false);
  });

  test('no session plus a transient error with a stored session stands in', () => {
    expect(shouldUseStoredLegacyAuthSession({ kind: 'read', hasSession: false, error: { status: 503, message: 'x' } }, true)).toBe(true);
  });

  test('definitive answers are untouched: no error, hard error, a real session, or nothing stored', () => {
    expect(shouldUseStoredLegacyAuthSession({ kind: 'read', hasSession: false, error: null }, true)).toBe(false);
    expect(shouldUseStoredLegacyAuthSession({ kind: 'read', hasSession: false, error: { status: 400, message: 'x' } }, true)).toBe(false);
    expect(shouldUseStoredLegacyAuthSession({ kind: 'read', hasSession: true, error: { status: 503, message: 'x' } }, true)).toBe(false);
    expect(shouldUseStoredLegacyAuthSession({ kind: 'read', hasSession: false, error: { status: 503, message: 'x' } }, false)).toBe(false);
  });
});

describe('readLegacyAuthSessionSnapshot with a stored session (non-fixture path)', () => {
  const storedSession = {
    access_token: 'a.b.c',
    refresh_token: 'r',
    expires_at: 1,
    user: { id: '00000000-0000-4000-8000-000000000001', user_metadata: { username: 'zac' } }
  };

  const load = async (options: { getSession: () => Promise<unknown>; stored: boolean }) => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-fixture-key');
    const store = new Map<string, string>();
    if (options.stored) {
      store.set(MAZER_OAUTH_AUTH_SESSION_KEY, JSON.stringify(storedSession));
    }
    vi.stubGlobal('window', {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); }
      }
    });
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ auth: { getSession: vi.fn(options.getSession), onAuthStateChange: vi.fn() } }))
    }));
    vi.doMock('../../src/legacy-runtime/legacyAccountPortal', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../src/legacy-runtime/legacyAccountPortal')>()),
      isMazerOAuthSessionQuarantined: () => false,
      readMazerOAuthBootResult: () => ({ status: 'none' }),
      recoverMazerOAuthSessionQuarantine: vi.fn(async () => undefined)
    }));
    // Real timers with a short bound: the race itself is covered above with fake timers.
    vi.doMock('../../src/legacy-runtime/legacyAuthBootResolution', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuthBootResolution')>();
      return { ...original, raceLegacyAuthSessionRead: (read: Promise<unknown>) => original.raceLegacyAuthSessionRead(read, 25) };
    });
    const auth = await import('../../src/legacy-runtime/legacyAuth');
    return auth.readLegacyAuthSessionSnapshot();
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@supabase/supabase-js');
    vi.doUnmock('../../src/legacy-runtime/legacyAccountPortal');
    vi.doUnmock('../../src/legacy-runtime/legacyAuthBootResolution');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('a stalled getSession resolves to the stored authenticated identity at the bound', async () => {
    expect(await load({ stored: true, getSession: () => new Promise(() => undefined) })).toMatchObject({ status: 'authenticated', userId: storedSession.user.id });
  });

  test('a stalled getSession with nothing stored keeps waiting for the real read (no behaviour change)', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const pending = load({ stored: false, getSession: () => new Promise((resolve) => { finish = resolve; }) });
    let settled = false;
    void pending.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(settled).toBe(false);
    finish({ data: { session: null }, error: null });
    expect(await pending).toMatchObject({ status: 'guest' });
  });

  test('a retryable refresh failure with a stored session stays signed in', async () => {
    const snapshot = await load({
      stored: true,
      getSession: async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } })
    });
    expect(snapshot).toMatchObject({ status: 'authenticated', userId: storedSession.user.id, error: null });
  });

  test('a definitive rejection (400, session already removed) stays a guest snapshot', async () => {
    const snapshot = await load({
      stored: false,
      getSession: async () => ({ data: { session: null }, error: { name: 'AuthApiError', message: 'refresh unavailable', status: 400 } })
    });
    expect(snapshot).toMatchObject({ status: 'guest', errorCode: 'session_read_failed' });
  });

  test('a clean signed-out read (no error) stays a guest snapshot even if storage still has a stale key', async () => {
    const snapshot = await load({ stored: true, getSession: async () => ({ data: { session: null }, error: null }) });
    expect(snapshot).toMatchObject({ status: 'guest' });
  });
});
