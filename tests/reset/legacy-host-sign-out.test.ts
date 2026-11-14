import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  MAZER_HOST_SIGN_OUT_ATTEMPT_KEY,
  MAZER_HOST_SIGN_OUT_ATTEMPT_WINDOW_MS,
  MAZER_HOST_SIGN_OUT_PROBE_TIMEOUT_MS,
  buildMazerHostSignOutPingUrl,
  buildMazerHostSignOutUrl,
  clearMazerHostSignOutAttempt,
  isMazerHostSignOutAttemptInFlight,
  probeMazerHostSignOutEndpoint,
  runMazerHostSignOut,
  type MazerHostSignOutDeps,
  type MazerHostSignOutProbeResult
} from '../../src/legacy-runtime/legacyHostSignOut';
import { MAZER_EXPLICIT_SIGN_OUT_KEY } from '../../src/legacy-runtime/legacySignedOutHandoff';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  public failWrites = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('blocked');
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const NOW = 1_800_000_000_000;

const makeDeps = (overrides: Partial<MazerHostSignOutDeps> & { probeResult?: MazerHostSignOutProbeResult } = {}) => {
  const localStorage = new MemoryStorage();
  localStorage.setItem(MAZER_EXPLICIT_SIGN_OUT_KEY, JSON.stringify({ at: NOW - 100 }));
  const sessionStorage = new MemoryStorage();
  const navigate = vi.fn<(url: string) => void>();
  const probe = vi.fn(async () => overrides.probeResult ?? 'live');
  const deps: MazerHostSignOutDeps = {
    authStatus: 'guest',
    isLocalhost: false,
    localStorage,
    navigate,
    now: () => NOW,
    probe,
    sessionStorage,
    ...overrides
  };
  return { deps, localStorage, navigate, probe, sessionStorage };
};

describe('host sign-out URL (the contract with the FawxzzyWeb endpoint)', () => {
  test('is exactly the documented navigation URL', () => {
    expect(buildMazerHostSignOutUrl()).toBe('https://account.fawxzzy.com/signout?returnTo=https%3A%2F%2Fmazer.fawxzzy.com%2F');
  });
});

describe('runMazerHostSignOut', () => {
  test('after a real local sign-out it navigates once to the host endpoint and records the loop guard first', async () => {
    const { deps, navigate, sessionStorage } = makeDeps();
    const calls: string[] = [];
    navigate.mockImplementation(() => {
      // The guard record exists BEFORE the page leaves.
      calls.push(sessionStorage.getItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY) === null ? 'navigated-without-guard' : 'navigated-with-guard');
    });
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'navigating' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://account.fawxzzy.com/signout?returnTo=https%3A%2F%2Fmazer.fawxzzy.com%2F');
    expect(calls).toEqual(['navigated-with-guard']);
    expect(isMazerHostSignOutAttemptInFlight(sessionStorage, NOW + 1_000)).toBe(true);
  });

  test('loop guard: a second sign-out inside 15 minutes does not navigate again, after the window it does', async () => {
    const first = makeDeps();
    await runMazerHostSignOut(first.deps);
    first.navigate.mockClear();
    await expect(runMazerHostSignOut({ ...first.deps, now: () => NOW + 60_000 })).resolves.toEqual({ status: 'skipped', reason: 'attempt-in-flight' });
    expect(first.navigate).not.toHaveBeenCalled();
    expect(first.probe).toHaveBeenCalledTimes(1);
    await expect(runMazerHostSignOut({ ...first.deps, now: () => NOW + MAZER_HOST_SIGN_OUT_ATTEMPT_WINDOW_MS + 1 })).resolves.toEqual({ status: 'navigating' });
  });

  test('signing in clears the guard so the next Sign out can end the host session again', async () => {
    const { deps, navigate, sessionStorage } = makeDeps();
    await runMazerHostSignOut(deps);
    clearMazerHostSignOutAttempt(sessionStorage);
    expect(isMazerHostSignOutAttemptInFlight(sessionStorage, NOW + 1)).toBe(false);
    navigate.mockClear();
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'navigating' });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test('a future-dated guard record fails closed (counts as in flight)', async () => {
    const { deps, sessionStorage, navigate } = makeDeps();
    sessionStorage.setItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY, JSON.stringify({ at: NOW + 3_600_000 }));
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'skipped', reason: 'attempt-in-flight' });
    expect(navigate).not.toHaveBeenCalled();
  });

  test.each([
    ['unreachable host / network failure / timeout', 'unreachable', 'endpoint-unreachable'],
    ['ping 404 (endpoint not deployed)', 'missing', 'endpoint-missing']
  ] as const)('%s: falls back to local-only sign-out, nothing navigates, no guard is left behind', async (_label, probeResult, reason) => {
    const { deps, navigate, sessionStorage } = makeDeps({ probeResult });
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'skipped', reason });
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY)).toBeNull();
  });

  test('blocked sessionStorage: no navigation (without the record nothing could stop a loop)', async () => {
    const { deps, navigate, sessionStorage } = makeDeps();
    sessionStorage.failWrites = true;
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'skipped', reason: 'storage-unavailable' });
    expect(navigate).not.toHaveBeenCalled();
    await expect(runMazerHostSignOut({ ...deps, sessionStorage: null })).resolves.toEqual({ status: 'skipped', reason: 'storage-unavailable' });
  });

  test('a throwing navigation clears the guard and leaves the player on the signed-out screen', async () => {
    const { deps, navigate, sessionStorage } = makeDeps();
    navigate.mockImplementation(() => { throw new Error('assign blocked'); });
    await expect(runMazerHostSignOut(deps)).resolves.toEqual({ status: 'skipped', reason: 'navigation-failed' });
    expect(sessionStorage.getItem(MAZER_HOST_SIGN_OUT_ATTEMPT_KEY)).toBeNull();
  });

  test('only a real local sign-out qualifies', async () => {
    const authenticated = makeDeps({ authStatus: 'authenticated' });
    await expect(runMazerHostSignOut(authenticated.deps)).resolves.toEqual({ status: 'skipped', reason: 'still-authenticated' });

    const noFlag = makeDeps();
    noFlag.localStorage.removeItem(MAZER_EXPLICIT_SIGN_OUT_KEY);
    await expect(runMazerHostSignOut(noFlag.deps)).resolves.toEqual({ status: 'skipped', reason: 'no-explicit-sign-out' });

    const local = makeDeps({ isLocalhost: true });
    await expect(runMazerHostSignOut(local.deps)).resolves.toEqual({ status: 'skipped', reason: 'localhost' });

    const disabled = makeDeps({ enabled: false });
    await expect(runMazerHostSignOut(disabled.deps)).resolves.toEqual({ status: 'skipped', reason: 'disabled' });

    for (const run of [authenticated, noFlag, local, disabled]) {
      expect(run.navigate).not.toHaveBeenCalled();
      expect(run.probe).not.toHaveBeenCalled();
    }
  });
});

describe('probeMazerHostSignOutEndpoint (the capability ping)', () => {
  const makeProbeDeps = (fetchImpl: (input: string, init: RequestInit) => Promise<{ status: number }>) => {
    const timers = new Map<number, () => void>();
    let nextId = 1;
    return {
      deps: {
        clearTimeout: (handle: unknown) => { timers.delete(handle as number); },
        fetch: fetchImpl,
        setTimeout: (callback: () => void) => { const id = nextId++; timers.set(id, callback); return id; }
      },
      fireTimeouts: () => { for (const callback of [...timers.values()]) { callback(); } },
      pendingTimers: () => timers.size
    };
  };

  test('the ping URL and request match the FawxzzyWeb contract: HEAD, CORS, no credentials', async () => {
    expect(buildMazerHostSignOutPingUrl()).toBe('https://account.fawxzzy.com/signout/ping');
    const fetchSpy = vi.fn(async (_input: string, _init: RequestInit) => ({ status: 204 }));
    const { deps, pendingTimers } = makeProbeDeps(fetchSpy);
    await expect(probeMazerHostSignOutEndpoint(deps)).resolves.toBe('live');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://account.fawxzzy.com/signout/ping',
      { cache: 'no-store', credentials: 'omit', method: 'HEAD', mode: 'cors' }
    );
    expect(pendingTimers()).toBe(0);
  });

  test('only 204 means live: 404 and every other status mean the endpoint is missing', async () => {
    for (const status of [200, 301, 401, 404, 405, 500, 503]) {
      const { deps } = makeProbeDeps(async () => ({ status }));
      await expect(probeMazerHostSignOutEndpoint(deps), String(status)).resolves.toBe('missing');
    }
  });

  test('a rejected fetch (offline, DNS, CORS failure) is unreachable', async () => {
    const { deps } = makeProbeDeps(async () => { throw new TypeError('Failed to fetch'); });
    await expect(probeMazerHostSignOutEndpoint(deps)).resolves.toBe('unreachable');
  });

  test(`a ping that never answers is unreachable after ${MAZER_HOST_SIGN_OUT_PROBE_TIMEOUT_MS} ms`, async () => {
    const { deps, fireTimeouts } = makeProbeDeps(() => new Promise(() => undefined));
    const result = probeMazerHostSignOutEndpoint(deps);
    fireTimeouts();
    await expect(result).resolves.toBe('unreachable');
  });

  test('the browser binding sends the ping through window.fetch with the same flags', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyHostSignOut.ts'), 'utf8');
    expect(source).toContain("method: 'HEAD', mode: 'cors'");
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/no-cors|redirect:/);
  });
});

describe('wiring', () => {
  const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');

  test('the Sign out action runs the host sign-out only after the local sign-out finished, and holds the screen while leaving', () => {
    const menu = read('src/scenes/MenuScene.ts');
    const start = menu.indexOf('private async handleLegacyAuthSignOut');
    const end = menu.indexOf('private commitOverlayField');
    const handler = menu.slice(start, end);
    expect(handler.indexOf('await signOutLegacyAuth(')).toBeGreaterThan(-1);
    expect(handler.indexOf('await signOutLegacyAuth(')).toBeLessThan(handler.indexOf('runMazerHostSignOutInBrowser('));
    expect(handler).toContain("hostSignOut.status === 'navigating'");
    expect(handler).toContain('MAZER_HOST_SIGN_OUT_NAVIGATION_TIMEOUT_MS');
  });

  test('a launch that sees a stored session clears the host sign-out guard', () => {
    const boot = read('src/boot/signedOutHandoffBoot.ts');
    expect(boot).toContain('clearMazerHostSignOutAttempt(');
  });

  test('the feature switch exists and is on', () => {
    expect(read('src/legacy-runtime/legacyHostSignOut.ts')).toContain('export const MAZER_HOST_SIGN_OUT_ENABLED = true;');
  });
});
