import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS,
  PROVIDER_PREFLIGHT_TIMEOUT_MS,
  createProviderPreflightCache,
  runProviderPreflight,
  type ProviderPreflightDeps
} from '../../src/legacy-runtime/legacyProviderPreflight';
import {
  PROVIDER_PREFLIGHT_WARMUP_MIN_INTERVAL_MS,
  createProviderPreflightWarmupState,
  warmProviderPreflight
} from '../../src/legacy-runtime/legacyProviderPreflightWarmup';

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
    setTimer: (handler: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: nowMs + ms, handler, id, live: true });
      return id as unknown as ReturnType<typeof setTimeout>;
    }
  };
};

const res = (status: number) => ({ ok: status >= 200 && status < 300, status, type: 'cors' }) as Response;

const deps = (fetchImpl: (url: string, init: RequestInit) => Promise<Response>) => {
  const clock = createClock();
  const fetchMock = vi.fn(fetchImpl);
  const value: ProviderPreflightDeps & { clock: typeof clock; fetchMock: typeof fetchMock } = {
    cache: createProviderPreflightCache(),
    clearTimer: clock.clearTimer,
    clock,
    fetch: fetchMock as unknown as typeof fetch,
    fetchMock,
    isOnline: () => true,
    now: clock.now,
    setTimer: clock.setTimer
  };
  return value;
};

describe('sign-in pre-flight warm-up (MAZER-ACCT-037)', () => {
  test('a warm-up with the service up fills the shared 30 s cache, so the first tap sends no request', async () => {
    const d = deps(async () => res(200));
    const state = createProviderPreflightWarmupState();
    const outcome = await warmProviderPreflight(d, state);
    expect(outcome).toMatchObject({ result: { proceed: true, reason: 'ok' }, started: true });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    expect(d.cache?.lastOkAtMs).not.toBeNull();

    d.clock.advance(5_000);
    const tap = await runProviderPreflight(d);
    expect(tap).toEqual({ proceed: true, reason: 'cached', status: null });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a failed warm-up shows nothing and caches nothing: the tap probes afresh and reports its own result', async () => {
    let up = false;
    const d = deps(async () => (up ? res(200) : res(503)));
    const state = createProviderPreflightWarmupState();
    const outcome = await warmProviderPreflight(d, state);
    expect(outcome).toMatchObject({ result: { proceed: false, reason: 'http_error', status: 503 }, started: true });
    expect(d.cache?.lastOkAtMs).toBeNull();

    // The service recovers; the tap is not told "down" from the earlier warm-up.
    up = true;
    const tap = await runProviderPreflight(d);
    expect(tap).toEqual({ proceed: true, reason: 'ok', status: 200 });
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a warm-up that throws is swallowed and clears the in-flight flag', async () => {
    const d = deps(async () => res(200));
    d.now = () => 1_000_000;
    d.fetch = (() => { throw new Error('sync boom'); }) as unknown as typeof fetch;
    const state = createProviderPreflightWarmupState();
    const outcome = await warmProviderPreflight(d, state);
    expect(outcome.started).toBe(true);
    expect(state.inFlight).toBe(false);
    expect(d.cache?.lastOkAtMs).toBeNull();
  });

  test('is skipped while a warm-up is already in flight', async () => {
    let release: (value: Response) => void = () => undefined;
    const d = deps(() => new Promise<Response>((resolveFetch) => { release = resolveFetch; }));
    const state = createProviderPreflightWarmupState();
    const first = warmProviderPreflight(d, state);
    await Promise.resolve();
    expect(state.inFlight).toBe(true);
    expect(await warmProviderPreflight(d, state)).toEqual({ reason: 'in-flight', started: false });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    release(res(200));
    expect((await first).started).toBe(true);
    expect(state.inFlight).toBe(false);
  });

  test('is skipped while the cache is fresh and while the previous attempt started less than one cache window ago', async () => {
    const d = deps(async () => res(200));
    const state = createProviderPreflightWarmupState();
    await warmProviderPreflight(d, state);
    d.clock.advance(PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS - 1);
    expect(await warmProviderPreflight(d, state)).toEqual({ reason: 'cache-fresh', started: false });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);

    // Cache expired and the window since the last attempt has passed: warm again.
    d.clock.advance(1);
    expect(await warmProviderPreflight(d, state)).toMatchObject({ started: true });
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });

  test('an outage does not re-probe on every Welcome rebuild: failures are throttled by attempt start, not cached', async () => {
    const d = deps(async () => res(503));
    const state = createProviderPreflightWarmupState();
    expect(await warmProviderPreflight(d, state)).toMatchObject({ started: true });
    for (let i = 0; i < 5; i += 1) {
      d.clock.advance(1_000);
      expect(await warmProviderPreflight(d, state)).toEqual({ reason: 'throttled', started: false });
    }
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    d.clock.advance(PROVIDER_PREFLIGHT_WARMUP_MIN_INTERVAL_MS);
    expect(await warmProviderPreflight(d, state)).toMatchObject({ started: true });
    expect(d.fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a slow-but-up service is not turned into a blocked Sign in: a tap during a warm-up runs its own full-budget probe', async () => {
    // The warm-up's fetch never answers; the tap's own probe answers 200 at its own pace.
    const answers: Array<(value: Response) => void> = [];
    const d = deps(() => new Promise<Response>((resolveFetch) => { answers.push(resolveFetch); }));
    const state = createProviderPreflightWarmupState();
    const warm = warmProviderPreflight(d, state);
    await Promise.resolve();
    d.clock.advance(PROVIDER_PREFLIGHT_TIMEOUT_MS - 1_000);

    const tap = runProviderPreflight(d);
    await Promise.resolve();
    expect(d.fetchMock).toHaveBeenCalledTimes(2); // the tap does not join the warm-up
    d.clock.advance(1_000); // the warm-up times out here; the tap still has 3 s
    expect((await warm)).toMatchObject({ result: { proceed: false, reason: 'timeout' } });
    answers[1]?.(res(200));
    expect(await tap).toEqual({ proceed: true, reason: 'ok', status: 200 });
  });

  test('wiring: Welcome calls the warm-up, the tap path still runs its own pre-flight and nothing awaits the warm-up', () => {
    const scene = readFileSync(resolve(__dirname, '../../src/scenes/MenuScene.ts'), 'utf8');
    const entry = scene.slice(scene.indexOf('private buildSharedAccountEntrySection('));
    const body = entry.slice(0, entry.indexOf('private runLegacyAuthScreenRoute('));
    expect(body).toContain('warmMazerProviderPreflight();');
    expect(body).not.toMatch(/await\s+warmMazerProviderPreflight/);

    const portal = readFileSync(resolve(__dirname, '../../src/legacy-runtime/legacyAccountPortal.ts'), 'utf8');
    expect(portal).toContain('preflightProvider: () => runProviderPreflight(createBrowserProviderPreflightDeps())');
    expect(portal).toContain('export const warmMazerProviderPreflight = (): void =>');
  });
});
