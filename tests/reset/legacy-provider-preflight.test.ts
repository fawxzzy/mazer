import { describe, expect, test, vi } from 'vitest';
import {
  PROVIDER_PREFLIGHT_FOLLOW_UP_TIMEOUT_MS,
  PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS,
  PROVIDER_PREFLIGHT_TIMEOUT_MS,
  PROVIDER_PREFLIGHT_URL,
  createProviderPreflightCache,
  decideProviderPreflight,
  runProviderPreflight,
  type ProviderPreflightDeps
} from '../../src/legacy-runtime/legacyProviderPreflight';
import { MAZER_OAUTH_ISSUER, type MazerOAuthFailureCategory } from '../../src/legacy-runtime/legacyAccountPortal';
import { LEGACY_AUTH_FAILURE_CODES } from '../../src/legacy-runtime/legacyAuthFailureCodes';

// A fake clock: timers fire only when advance() moves past them, so a
// "provider that never answers" test does not wait in real time.
const createClock = () => {
  let nowMs = 1_000_000;
  const timers: Array<{ at: number; handler: () => void; id: number; live: boolean }> = [];
  let nextId = 1;
  return {
    advance(ms: number) {
      nowMs += ms;
      for (const timer of timers) {
        if (timer.live && timer.at <= nowMs) {
          timer.live = false;
          timer.handler();
        }
      }
    },
    clearTimer: (handle: ReturnType<typeof setTimeout>) => {
      const timer = timers.find((entry) => entry.id === (handle as unknown as number));
      if (timer) timer.live = false;
    },
    now: () => nowMs,
    pending: () => timers.filter((timer) => timer.live).length,
    setTimer: (handler: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: nowMs + ms, handler, id, live: true });
      return id as unknown as ReturnType<typeof setTimeout>;
    }
  };
};

const res = (status: number, type: ResponseType = 'cors') => ({
  ok: status >= 200 && status < 300,
  status,
  type
}) as Response;

const deps = (
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  clock = createClock(),
  online: boolean | undefined = true
): ProviderPreflightDeps & { clock: ReturnType<typeof createClock>; fetchMock: ReturnType<typeof vi.fn> } => {
  const fetchMock = vi.fn(fetchImpl);
  return {
    cache: createProviderPreflightCache(),
    clearTimer: clock.clearTimer,
    clock,
    fetch: fetchMock as unknown as typeof fetch,
    fetchMock,
    isOnline: () => online,
    now: clock.now,
    setTimer: clock.setTimer
  };
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};

describe('provider pre-flight probe request', () => {
  test('asks the issuer well-known document: no credentials, no cache, no custom header', async () => {
    expect(PROVIDER_PREFLIGHT_URL).toBe(`${MAZER_OAUTH_ISSUER}/.well-known/openid-configuration`);
    const d = deps(async () => res(200));
    await runProviderPreflight(d);
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = d.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PROVIDER_PREFLIGHT_URL);
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', method: 'GET', mode: 'cors' });
    expect(init.headers).toBeUndefined();
  });

  test('budgets match the card: 4 s for the probe, 30 s success cache', () => {
    expect(PROVIDER_PREFLIGHT_TIMEOUT_MS).toBe(4_000);
    expect(PROVIDER_PREFLIGHT_FOLLOW_UP_TIMEOUT_MS).toBeLessThan(PROVIDER_PREFLIGHT_TIMEOUT_MS);
    expect(PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS).toBe(30_000);
  });
});

describe('provider pre-flight failure code', () => {
  test('the stable diagnostics code is provider_unreachable and is a valid sign-in failure category', () => {
    const category: MazerOAuthFailureCategory = LEGACY_AUTH_FAILURE_CODES.providerUnreachable;
    expect(category).toBe('provider_unreachable');
    // Diagnostics render it as oauth-failure:provider_unreachable
    // (mapping and copy are pinned in legacy-oauth-failure-message.test.ts).
  });
});

describe('provider pre-flight decision', () => {
  test('ok: a readable 200 proceeds', async () => {
    expect(await runProviderPreflight(deps(async () => res(200)))).toEqual({ proceed: true, reason: 'ok', status: 200 });
  });

  test.each([503, 521, 525, 500, 502, 504, 429, 404])('http %i does not navigate', async (status) => {
    expect(await runProviderPreflight(deps(async () => res(status)))).toEqual({
      proceed: false,
      reason: 'http_error',
      status
    });
  });

  test('timeout: a provider that never answers does not navigate and cleans up its timer', async () => {
    const d = deps(() => new Promise<Response>(() => undefined));
    const pending = runProviderPreflight(d);
    await flush();
    d.clock.advance(PROVIDER_PREFLIGHT_TIMEOUT_MS);
    expect(await pending).toEqual({ proceed: false, reason: 'timeout', status: null });
    expect(d.clock.pending()).toBe(0);
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  test('timeout: an aborted request also reads as a timeout, not as blocked', async () => {
    const d = deps((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = runProviderPreflight(d);
    await flush();
    d.clock.advance(PROVIDER_PREFLIGHT_TIMEOUT_MS);
    expect(await pending).toMatchObject({ proceed: false, reason: 'timeout' });
  });

  test('offline: a network error while offline does not navigate and makes no follow-up request', async () => {
    const d = deps(async () => { throw new TypeError('Failed to fetch'); }, createClock(), false);
    expect(await runProviderPreflight(d)).toEqual({ proceed: false, reason: 'offline', status: null });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  test('gateway error page with no CORS header (the 2026-11-12 outage shape) does not navigate', async () => {
    // Browsers report a 503 / 521 / 525 without Access-Control-Allow-Origin as a
    // TypeError in cors mode; the no-cors follow-up still gets an (opaque) answer.
    const d = deps(async (_url, init) => {
      if (init.mode === 'no-cors') return res(0, 'opaque');
      throw new TypeError('Failed to fetch');
    });
    expect(await runProviderPreflight(d)).toEqual({ proceed: false, reason: 'missing_cors', status: null });
    expect(d.fetchMock.mock.calls.map(([, init]) => (init as RequestInit).mode)).toEqual(['cors', 'no-cors']);
  });

  test('blocked: refused outright in both modes (extension, CSP) falls through and navigates', async () => {
    const d = deps(async () => { throw new TypeError('Failed to fetch'); });
    expect(await runProviderPreflight(d)).toEqual({ proceed: true, reason: 'blocked', status: null });
  });

  test('blocked is never cached as a success', async () => {
    const d = deps(async () => { throw new TypeError('Failed to fetch'); });
    await runProviderPreflight(d);
    expect(d.cache?.lastOkAtMs).toBeNull();
  });

  test('follow-up that hangs reads as a timeout, not as blocked', async () => {
    const d = deps(async (_url, init) => {
      if (init.mode === 'no-cors') return new Promise<Response>(() => undefined);
      throw new TypeError('Failed to fetch');
    });
    const pending = runProviderPreflight(d);
    await flush();
    d.clock.advance(PROVIDER_PREFLIGHT_FOLLOW_UP_TIMEOUT_MS);
    expect(await pending).toMatchObject({ proceed: false, reason: 'timeout' });
  });

  test('a platform that does not report online state still gets the follow-up check', async () => {
    const d = deps(async (_url, init) => {
      if (init.mode === 'no-cors') return res(0, 'opaque');
      throw new TypeError('Failed to fetch');
    }, createClock(), undefined);
    expect(await runProviderPreflight(d)).toMatchObject({ proceed: false, reason: 'missing_cors' });
  });

  test('decideProviderPreflight is a pure table', () => {
    expect(decideProviderPreflight({ kind: 'response', ok: true, status: 200 }, true, null).proceed).toBe(true);
    expect(decideProviderPreflight({ kind: 'response', ok: false, status: 503 }, true, null).reason).toBe('http_error');
    expect(decideProviderPreflight({ kind: 'timeout' }, true, null).reason).toBe('timeout');
    expect(decideProviderPreflight({ kind: 'network-error' }, false, null).reason).toBe('offline');
    expect(decideProviderPreflight({ kind: 'network-error' }, true, { kind: 'opaque' }).reason).toBe('missing_cors');
    expect(decideProviderPreflight({ kind: 'network-error' }, true, { kind: 'network-error' }).reason).toBe('blocked');
  });
});

describe('provider pre-flight success cache', () => {
  test('a success is reused for 30 s with no second request, then re-checked', async () => {
    const d = deps(async () => res(200));
    expect((await runProviderPreflight(d)).reason).toBe('ok');
    d.clock.advance(PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS - 1);
    expect(await runProviderPreflight(d)).toEqual({ proceed: true, reason: 'cached', status: null });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    d.clock.advance(1);
    expect((await runProviderPreflight(d)).reason).toBe('ok');
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a failure is never cached: the very next attempt asks again', async () => {
    let status = 503;
    const d = deps(async () => res(status));
    expect((await runProviderPreflight(d)).proceed).toBe(false);
    status = 200;
    expect((await runProviderPreflight(d)).proceed).toBe(true);
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a clock that moved backwards does not trust the cache', async () => {
    const d = deps(async () => res(200));
    await runProviderPreflight(d);
    d.clock.advance(-5);
    await runProviderPreflight(d);
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });
});
