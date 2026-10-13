import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { createMazerAuthFetch } from '../../src/legacy-runtime/legacyOAuthRefresh';
import {
  MAZER_OAUTH_AUTH_SESSION_KEY, MAZER_OAUTH_CLIENT_ID,
  MAZER_OAUTH_ISSUER, MAZER_OAUTH_TOKEN_URL
} from '../../src/legacy-runtime/legacyAccountPortal';

const NOW = 1_800_000_000_000;
const SUB = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const REFRESH = 'synthetic-refresh-only';
const URL = MAZER_OAUTH_ISSUER + '/token?grant_type=refresh_token';
const claims = (extra = {}) => ({
  iss: MAZER_OAUTH_ISSUER, aud: 'authenticated', role: 'authenticated',
  sub: SUB, session_id: SESSION, client_id: MAZER_OAUTH_CLIENT_ID,
  iat: NOW / 1000 - 60, exp: NOW / 1000 + 3600, ...extra
});
const jwt = (payload: object) => [
  Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(payload)).toString('base64url'), 'synthetic-signature'
].join('.');
const session = (extra = {}) => ({
  access_token: jwt(claims({ exp: NOW / 1000 - 1 })),
  refresh_token: REFRESH, token_type: 'bearer', expires_at: NOW / 1000 - 1,
  user: { id: SUB, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
  ...extra
});
const response = (extra = {}) => ({
  access_token: jwt(claims()), refresh_token: 'synthetic-rotated', token_type: 'bearer', expires_in: 3600, ...extra
});
const request = (refresh = REFRESH): RequestInit => ({
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-old', apikey: 'synthetic-key' },
  body: JSON.stringify({ refresh_token: refresh })
});
const setup = (provider: typeof fetch = vi.fn(async () => Response.json(response())), old: unknown = session()) => {
  let raw = JSON.stringify(old);
  const readSession = () => raw;
  const fetcher = createMazerAuthFetch({ fetch: provider, readSession, now: () => NOW });
  return { provider, fetcher, readSession, replace: (value: unknown) => { raw = JSON.stringify(value); } };
};

describe('Mazer OAuth refresh transport', () => {
  test('sends the public-client refresh grant only to the OAuth endpoint', async () => {
    const h = setup();
    const res = await h.fetcher(URL, request());
    expect(res.status).toBe(200);
    const [url, init] = vi.mocked(h.provider).mock.calls[0];
    expect(url).toBe(MAZER_OAUTH_TOKEN_URL);
    expect(Object.fromEntries((init!.body as URLSearchParams).entries())).toEqual({
      grant_type: 'refresh_token', client_id: MAZER_OAUTH_CLIENT_ID, refresh_token: REFRESH
    });
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    expect(init!.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(await res.json()).toMatchObject({ refresh_token: 'synthetic-rotated', user: { id: SUB }, expires_at: NOW / 1000 + 3600 });
    expect(JSON.parse(h.readSession()).refresh_token).toBe(REFRESH);
  });

  test('preserves the existing refresh token when rotation is omitted', async () => {
    const token = response(); delete (token as Partial<typeof token>).refresh_token;
    const h = setup(vi.fn(async () => Response.json(token)));
    expect((await (await h.fetcher(URL, request())).json()).refresh_token).toBe(REFRESH);
  });

  test('supports Request input without forwarding caller credentials', async () => {
    const h = setup(); expect((await h.fetcher(new Request(URL, request()))).status).toBe(200);
    expect(vi.mocked(h.provider).mock.calls[0][0]).toBe(MAZER_OAUTH_TOKEN_URL);
  });

  test('passes native password sessions through unchanged', async () => {
    const nativeClaims = claims(); delete (nativeClaims as Partial<typeof nativeClaims>).client_id;
    const h = setup(undefined, session({ access_token: jwt(nativeClaims) })); const init = request();
    await h.fetcher(URL, init); expect(h.provider).toHaveBeenCalledExactlyOnceWith(URL, init);
  });

  test.each([
    MAZER_OAUTH_ISSUER + '/token?grant_type=password',
    MAZER_OAUTH_ISSUER + '/user',
    'https://example.invalid/auth/v1/token?grant_type=refresh_token',
    'https://bxtcuhkotumitoqtrcej.supabase.co/rest/v1/mazer_profiles'
  ])('preserves unrelated transport: %s', async url => {
    const h = setup(); const init = request(); await h.fetcher(url, init);
    expect(h.provider).toHaveBeenCalledExactlyOnceWith(url, init);
  });

  test('defers stale refresh calls without a provider request or storage write', async () => {
    const h = setup(); expect((await h.fetcher(URL, request('older-token'))).status).toBe(503);
    expect(h.provider).not.toHaveBeenCalled(); expect(JSON.parse(h.readSession()).refresh_token).toBe(REFRESH);
  });

  test('defers storage errors without forwarding a credential to the wrong endpoint', async () => {
    const provider = vi.fn(); const f = createMazerAuthFetch({ fetch: provider, readSession: () => { throw new Error('private detail'); } });
    expect((await f(URL, request())).status).toBe(503); expect(provider).not.toHaveBeenCalled();
  });

  test.each([
    { sub: '33333333-3333-4333-8333-333333333333' }, { client_id: 'other-client' },
    { iss: 'https://example.invalid' }, { session_id: '44444444-4444-4444-8444-444444444444' },
    { role: 'service_role' }, { aud: 'other' }, { exp: NOW / 1000 - 1 }, { iat: NOW / 1000 + 61 }
  ])('rejects mismatched or expired response claims: %j', async extra => {
    const h = setup(vi.fn(async () => Response.json(response({ access_token: jwt(claims(extra)) }))));
    const res = await h.fetcher(URL, request()); expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('synthetic');
  });

  test.each([
    { refresh_token: '' }, { token_type: 'other' }, { expires_in: 0 }, { access_token: 'x'.repeat(4097) }
  ])('rejects malformed token responses: %j', async extra => {
    const h = setup(vi.fn(async () => Response.json(response(extra))));
    expect((await h.fetcher(URL, request())).status).toBe(400);
  });

  test('rejects oversized provider JSON without retaining its content', async () => {
    const h = setup(vi.fn(async () => Response.json({ ...response(), extra: 'x'.repeat(16384) })));
    const res = await h.fetcher(URL, request()); expect(res.status).toBe(400); expect((await res.text()).length).toBeLessThan(150);
  });

  test.each([400, 401, 408, 409, 429, 500, 501, 502, 503, 504])('sanitizes provider errors with SDK-compatible status for %i', async status => {
    const h = setup(vi.fn(async () => Response.json({ error_description: 'synthetic-secret' }, { status })));
    const res = await h.fetcher(URL, request());
    expect(res.status).toBe(status === 408 || status === 409 || status === 429 || status >= 500 ? 503 : status);
    expect(await res.text()).not.toContain('synthetic-secret');
  });

  test('does not commit over a newer session after provider response', async () => {
    const provider = vi.fn(async () => { h.replace(session({ refresh_token: 'newer' })); return Response.json(response()); });
    const h = setup(provider); expect((await h.fetcher(URL, request())).status).toBe(503);
    expect(JSON.parse(h.readSession()).refresh_token).toBe('newer');
  });

  test('normalizes network errors without logging their details', async () => {
    const h = setup(vi.fn(async () => { throw new Error('synthetic-token'); }));
    const res = await h.fetcher(URL, request()); expect(res.status).toBe(503); expect(await res.text()).not.toContain('synthetic-token');
  });

  test('wires the adapter into the same SDK client without disabling its lock', () => {
    const text = readFileSync('src/legacy-runtime/legacyAuth.ts', 'utf8');
    expect(text).toContain('global: { fetch: createMazerAuthFetch() }');
    expect(text).toContain('lock: runLegacyAuthJsLock');
    expect(text).toContain('autoRefreshToken: true');
  });

  test.each([409, 429, 500])('actual SDK retains the existing session after transient %i exhausts retries', async status => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const initial = JSON.stringify(session());
    const values = new Map([[MAZER_OAUTH_AUTH_SESSION_KEY, initial]]);
    const removeItem = vi.fn((key: string) => { values.delete(key); });
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem };
    const provider = vi.fn(async () => Response.json({ error_description: 'synthetic-private-detail' }, { status }));
    const client = createClient('https://bxtcuhkotumitoqtrcej.supabase.co', 'synthetic-public-key', {
      auth: { storage, autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
      global: { fetch: createMazerAuthFetch({ fetch: provider, readSession: () => storage.getItem(MAZER_OAUTH_AUTH_SESSION_KEY), now: Date.now }) }
    });
    try {
      const pending = client.auth.refreshSession();
      await vi.runAllTimersAsync();
      const { error } = await pending;
      expect(error?.name).toBe('AuthRetryableFetchError');
      expect(error?.status).toBe(503);
      expect(error?.message).not.toContain('synthetic-private-detail');
      expect(provider.mock.calls.length).toBeGreaterThan(1);
      expect(storage.getItem(MAZER_OAUTH_AUTH_SESSION_KEY)).toBe(initial);
      expect(removeItem).not.toHaveBeenCalledWith(MAZER_OAUTH_AUTH_SESSION_KEY);
    } finally { await client.auth.stopAutoRefresh(); vi.useRealTimers(); }
  });

  test.each(['success', 'terminal', 'network'] as const)('supports browsers without static Response.json on %s', async outcome => {
    const descriptor = Object.getOwnPropertyDescriptor(Response, 'json')!;
    const provider = vi.fn(async () => {
      if (outcome === 'network') throw new Error('synthetic-private-detail');
      return new Response(JSON.stringify(outcome === 'success' ? response() : { error: 'invalid_grant' }), {
        status: outcome === 'success' ? 200 : 400, headers: { 'content-type': 'application/json' }
      });
    });
    Object.defineProperty(Response, 'json', { configurable: true, writable: true, value: undefined });
    try {
      const res = await setup(provider).fetcher(URL, request());
      expect(res.status).toBe(outcome === 'success' ? 200 : outcome === 'terminal' ? 400 : 503);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const value = await res.json();
      if (outcome === 'success') expect(value).toMatchObject({ refresh_token: 'synthetic-rotated', user: { id: SUB } });
      else expect(value).toEqual({ msg: 'Account session refresh unavailable.', error_code: 'mazer_oauth_refresh_failed' });
    } finally { Object.defineProperty(Response, 'json', descriptor); }
  });

  test('actual supabase-js refresh persists a complete same-subject OAuth session', async () => {
    const values = new Map([[MAZER_OAUTH_AUTH_SESSION_KEY, JSON.stringify(session())]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const provider = vi.fn(async () => Response.json(response()));
    const client = createClient('https://bxtcuhkotumitoqtrcej.supabase.co', 'synthetic-public-key', {
      auth: { storage, autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
      global: { fetch: createMazerAuthFetch({ fetch: provider, readSession: () => storage.getItem(MAZER_OAUTH_AUTH_SESSION_KEY), now: () => NOW }) }
    });
    const { data, error } = await client.auth.refreshSession();
    expect(error).toBeNull(); expect(data.session?.user.id).toBe(SUB);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toBe(MAZER_OAUTH_TOKEN_URL);
    expect(JSON.parse(storage.getItem(MAZER_OAUTH_AUTH_SESSION_KEY)!)).toMatchObject({ refresh_token: 'synthetic-rotated', user: { id: SUB } });
    await client.auth.stopAutoRefresh();
  });
});
