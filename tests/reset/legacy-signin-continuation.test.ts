import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  MAZER_OAUTH_CLIENT_ID,
  MAZER_OAUTH_PENDING_KEY,
  beginMazerOAuthAuthorization,
  buildMazerAccountPortalUrl,
  consumeMazerOAuthCallback,
  resolveMazerOAuthContinuationUrl,
  type MazerOAuthClient,
  type MazerOAuthLocation,
  type MazerOAuthPageLifecycle,
  type MazerOAuthRuntime,
  type MazerOAuthStorage
} from '../../src/legacy-runtime/legacyAccountPortal';
import {
  readMazerSignInContinuation,
  withMazerSignInContinuation
} from '../../src/legacy-runtime/legacySignInContinuation';
import { runMazerOAuthContinuationAtBoot } from '../../src/boot/oauthContinuationBoot';
import { MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS } from '../../src/legacy-runtime/legacySignedOutHandoff';

class MemoryStorage implements MazerOAuthStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
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
  runQueuedSessionTransaction: async (operation) => operation(),
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
    getSession: vi.fn(async () => ({ data: { session: { user: { id: claims.sub as string } } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: claims.sub as string } }, error: null })),
    setSession: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null }))
  }
});

const completeCallback = async (storage: MemoryStorage) => {
  const pending = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
  const { claims, token } = createAccessToken();
  const runtime = createRuntime(storage, createLocation(), vi.fn(async () => new Response(JSON.stringify({
    access_token: token,
    expires_in: 100,
    refresh_token: 'refresh-token',
    token_type: 'bearer'
  }), { headers: { 'content-type': 'application/json' }, status: 200 })) as typeof fetch);
  return consumeMazerOAuthCallback({
    code: 'one-time-code', malformed: false, providerError: false, requested: true, state: pending.state
  }, async () => createClient(claims), runtime);
};

const ACCOUNT_URL = 'https://account.fawxzzy.com/account?app=mazer&returnTo=https%3A%2F%2Fmazer.fawxzzy.com%2F';

describe('profile-icon sign-in continues to the shared account page', () => {
  test('the continuation is scoped to the tap call stack and never leaks to later sign-ins', () => {
    expect(readMazerSignInContinuation()).toBeNull();
    const seen = withMazerSignInContinuation('account', () => readMazerSignInContinuation());
    expect(seen).toBe('account');
    expect(readMazerSignInContinuation()).toBeNull();
    expect(() => withMazerSignInContinuation('account', () => { throw new Error('tap failed'); })).toThrow('tap failed');
    expect(readMazerSignInContinuation()).toBeNull();
  });

  test('a profile-icon sign-in records the intent and the callback reports it', async () => {
    const storage = new MemoryStorage();
    await expect(beginMazerOAuthAuthorization(createRuntime(storage), { continueTo: 'account' }))
      .resolves.toEqual({ status: 'none' });
    expect(JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}').continueTo).toBe('account');
    const result = await completeCallback(storage);
    expect(result).toEqual({ continueTo: 'account', status: 'connected' });
    expect(resolveMazerOAuthContinuationUrl(result)).toBe(ACCOUNT_URL);
    expect(resolveMazerOAuthContinuationUrl(result)).toBe(buildMazerAccountPortalUrl('account'));
  });

  test('Login, leaderboard and boot hand-off sign-ins keep landing on the menu', async () => {
    for (const options of [undefined, {}, { continueTo: null }]) {
      const storage = new MemoryStorage();
      await beginMazerOAuthAuthorization(createRuntime(storage), options);
      expect('continueTo' in JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}')).toBe(false);
      const result = await completeCallback(storage);
      expect(result).toEqual({ status: 'connected' });
      expect('continueTo' in result).toBe(false);
      expect(resolveMazerOAuthContinuationUrl(result)).toBeNull();
    }
  });

  test('an unknown intent is never written, and a tampered pending record fails closed', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage), {
      continueTo: 'https://attacker.example/' as unknown as 'account'
    });
    expect('continueTo' in JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}')).toBe(false);

    const tampered = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(tampered), { continueTo: 'account' });
    const record = JSON.parse(tampered.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    tampered.setItem(MAZER_OAUTH_PENDING_KEY, JSON.stringify({ ...record, continueTo: 'https://attacker.example/' }));
    await expect(completeCallback(tampered)).resolves.toMatchObject({ status: 'failed' });
  });

  test('a failed sign-in never continues, even when the profile icon started it', async () => {
    expect(resolveMazerOAuthContinuationUrl({ category: 'cancelled', status: 'failed' })).toBeNull();
    expect(resolveMazerOAuthContinuationUrl({ status: 'none' })).toBeNull();
  });

  test('a pending record written before this field (older build) still completes to the menu', async () => {
    const storage = new MemoryStorage();
    await beginMazerOAuthAuthorization(createRuntime(storage));
    const record = JSON.parse(storage.getItem(MAZER_OAUTH_PENDING_KEY) ?? '{}');
    expect(record.version).toBe(2);
    await expect(completeCallback(storage)).resolves.toEqual({ status: 'connected' });
  });
});

describe('boot continuation', () => {
  const createDeps = () => {
    const listeners = new Set<(event: PageTransitionEvent) => void>();
    const lifecycle: MazerOAuthPageLifecycle = {
      addEventListener: (_type, listener) => { listeners.add(listener); },
      removeEventListener: (_type, listener) => { listeners.delete(listener); }
    };
    const assigned: string[] = [];
    const markRedirecting = vi.fn();
    return {
      assigned,
      deps: {
        assign: (url: string) => { assigned.push(url); },
        clearTimer: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
        lifecycle,
        markRedirecting,
        setTimer: (handler: () => void, timeoutMs: number) => setTimeout(handler, timeoutMs)
      },
      firePageShow: (persisted: boolean) => {
        for (const listener of [...listeners]) {
          listener({ persisted } as PageTransitionEvent);
        }
      },
      listeners,
      markRedirecting
    };
  };

  test('stays (and never navigates) when the sign-in did not ask to continue', async () => {
    const { assigned, deps, markRedirecting } = createDeps();
    await expect(runMazerOAuthContinuationAtBoot({ status: 'connected' }, deps)).resolves.toBe('stayed');
    await expect(runMazerOAuthContinuationAtBoot({ category: 'cancelled', status: 'failed' }, deps)).resolves.toBe('stayed');
    expect(assigned).toEqual([]);
    expect(markRedirecting).not.toHaveBeenCalled();
  });

  test('leaves for the account page and goes on after the bound if the browser never navigates', async () => {
    vi.useFakeTimers();
    try {
      const { assigned, deps, listeners, markRedirecting } = createDeps();
      let settled = false;
      const run = runMazerOAuthContinuationAtBoot({ continueTo: 'account', status: 'connected' }, deps)
        .then((outcome) => { settled = true; return outcome; });
      await vi.advanceTimersByTimeAsync(MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      expect(assigned).toEqual([ACCOUNT_URL]);
      expect(markRedirecting).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(run).resolves.toBe('left');
      expect(listeners.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('goes on at once when the page comes back from the back/forward cache', async () => {
    vi.useFakeTimers();
    try {
      const { deps, firePageShow, listeners } = createDeps();
      let settled = false;
      const run = runMazerOAuthContinuationAtBoot({ continueTo: 'account', status: 'connected' }, deps)
        .then((outcome) => { settled = true; return outcome; });
      await vi.advanceTimersByTimeAsync(0);
      firePageShow(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      firePageShow(true);
      await expect(run).resolves.toBe('left');
      expect(listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('stays when the navigation throws', async () => {
    const { deps } = createDeps();
    await expect(runMazerOAuthContinuationAtBoot({ continueTo: 'account', status: 'connected' }, {
      ...deps,
      assign: () => { throw new Error('blocked'); }
    })).resolves.toBe('stayed');
  });
});

describe('wiring', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

  test('only the menu profile icon asks to continue to the account page', () => {
    const menu = read('src/scenes/MenuScene.ts');
    expect(menu.match(/withMazerSignInContinuation\(/g)).toHaveLength(1);
    expect(menu).toMatch(/createLegacyMenuProfileButton\(\s*\(\) => withMazerSignInContinuation\('account'/);
    expect(menu).toContain('beginMazerOAuthAuthorization(undefined, { continueTo: readMazerSignInContinuation() })');
  });

  test('boot continues after the callback is consumed, before the signed-out hand-off and Phaser', () => {
    const main = read('src/boot/main.ts');
    const consume = main.indexOf('const oauthResult = await consumeMazerOAuthCallback(');
    const continuation = main.indexOf('await runMazerOAuthContinuationAtBoot(oauthResult');
    const handoff = main.indexOf('await runMazerSignedOutHandoffAtBoot(');
    const phaser = main.indexOf('new Phaser.Game(');
    expect(consume).toBeGreaterThan(-1);
    expect(continuation).toBeGreaterThan(consume);
    expect(handoff).toBeGreaterThan(continuation);
    expect(phaser).toBeGreaterThan(handoff);
  });
});
