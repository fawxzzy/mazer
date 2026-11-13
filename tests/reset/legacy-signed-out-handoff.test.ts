import { describe, expect, test, vi } from 'vitest';
import {
  MAZER_AUTO_HANDOFF_ATTEMPT_KEY,
  MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS,
  MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS,
  MAZER_EXPLICIT_SIGN_OUT_KEY,
  decideMazerAutoHandoff,
  isMazerAutoHandoffAttemptInFlight,
  isMazerAutoHandoffOptedOut,
  isMazerExplicitSignOutRecorded,
  recordMazerAutoHandoffAttempt,
  recordMazerExplicitSignOut,
  runMazerSignedOutHandoff,
  type MazerAutoHandoffDecisionInput,
  type MazerSignedOutHandoffDeps
} from '../../src/legacy-runtime/legacySignedOutHandoff';
import {
  beginMazerOAuthAuthorization,
  readMazerOAuthBootResult,
  recordMazerOAuthBootFailure,
  type MazerOAuthBootResult,
  type MazerOAuthRuntime
} from '../../src/legacy-runtime/legacyAccountPortal';
import { hasLegacyStoredAuthSession } from '../../src/legacy-runtime/legacyAuthGateResolution';
import { resolveLegacyOAuthFailureCopy } from '../../src/legacy-runtime/legacyPlayerMessage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class BlockedStorage extends MemoryStorage {
  override getItem(): string | null { throw new Error('blocked'); }
  override setItem(): void { throw new Error('blocked'); }
  override removeItem(): void { throw new Error('blocked'); }
}

const SESSION_KEY = 'sb-bxtcuhkotumitoqtrcej-auth-token';
const NOW = 1_800_000_000_000;

const baseDecision = (over: Partial<MazerAutoHandoffDecisionInput> = {}): MazerAutoHandoffDecisionInput => ({
  attemptInFlight: false,
  authFixtureRoute: false,
  explicitSignOut: false,
  hasStoredSession: false,
  isLocalhost: false,
  levelPreviewRequested: false,
  oauthCallbackRequested: false,
  optedOut: false,
  sessionQuarantined: false,
  ...over
});

interface Harness {
  begin: ReturnType<typeof vi.fn<() => Promise<MazerOAuthBootResult>>>;
  deps: MazerSignedOutHandoffDeps;
  failures: string[];
  local: MemoryStorage;
  session: MemoryStorage;
  setNow(value: number): void;
}

const createHarness = (
  over: Partial<MazerSignedOutHandoffDeps> = {},
  shared?: { local?: MemoryStorage; session?: MemoryStorage }
): Harness => {
  const local = shared?.local ?? new MemoryStorage();
  const session = shared?.session ?? new MemoryStorage();
  const failures: string[] = [];
  let nowMs = NOW;
  const begin = vi.fn<() => Promise<MazerOAuthBootResult>>(async () => ({ status: 'none' }));
  const deps: MazerSignedOutHandoffDeps = {
    authFixtureRoute: false,
    begin,
    hasStoredSession: hasLegacyStoredAuthSession(local, SESSION_KEY),
    isLocalhost: false,
    levelPreviewRequested: false,
    localStorage: local,
    now: () => nowMs,
    oauthCallbackRequested: false,
    optedOut: false,
    recordFailure: (category) => { failures.push(category); },
    sessionQuarantined: false,
    sessionStorage: session,
    ...over
  };
  return { begin, deps, failures, local, session, setNow: (value) => { nowMs = value; } };
};

describe('decideMazerAutoHandoff', () => {
  test('a plain signed-out launch redirects', () => {
    expect(decideMazerAutoHandoff(baseDecision())).toEqual({ action: 'redirect' });
  });

  test.each([
    ['signed-in', { hasStoredSession: true }],
    ['oauth-callback', { oauthCallbackRequested: true }],
    ['opted-out', { optedOut: true }],
    ['localhost', { isLocalhost: true }],
    ['level-preview', { levelPreviewRequested: true }],
    ['auth-fixture', { authFixtureRoute: true }],
    ['session-quarantined', { sessionQuarantined: true }],
    ['explicit-sign-out', { explicitSignOut: true }],
    ['attempt-in-flight', { attemptInFlight: true }]
  ] as const)('stays on the Mazer screen: %s', (reason, over) => {
    expect(decideMazerAutoHandoff(baseDecision(over))).toEqual({ action: 'stay', reason });
  });

  test('a signed-in launch never redirects, whatever else is true', () => {
    expect(decideMazerAutoHandoff(baseDecision({
      hasStoredSession: true,
      oauthCallbackRequested: true,
      optedOut: true
    }))).toEqual({ action: 'stay', reason: 'signed-in' });
  });

  test('autoSignIn=0 is the only opt-out value', () => {
    expect(isMazerAutoHandoffOptedOut('?autoSignIn=0')).toBe(true);
    expect(isMazerAutoHandoffOptedOut('?autoSignIn=1')).toBe(false);
    expect(isMazerAutoHandoffOptedOut('?runtimeDiagnostics=1')).toBe(false);
    expect(isMazerAutoHandoffOptedOut('')).toBe(false);
  });
});

describe('attempt record (loop guard storage)', () => {
  test('in flight inside the window, settled after it, fail-closed for a future record', () => {
    const session = new MemoryStorage();
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW)).toBe(false);
    expect(recordMazerAutoHandoffAttempt(session, NOW)).toBe(true);
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW + 1)).toBe(true);
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW + 60_000)).toBe(true);
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW + MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS - 1)).toBe(true);
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW + MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS)).toBe(false);
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW - 5_000)).toBe(true);
  });

  test('window is at least the 60 s the card asks for, and the splash timeout is bounded', () => {
    expect(MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
    expect(MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });

  test('garbage and blocked storage read as no record', () => {
    const session = new MemoryStorage();
    session.setItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY, 'not json');
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW)).toBe(false);
    session.setItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY, JSON.stringify({ at: 'x' }));
    expect(isMazerAutoHandoffAttemptInFlight(session, NOW)).toBe(false);
    expect(isMazerAutoHandoffAttemptInFlight(new BlockedStorage(), NOW)).toBe(false);
    expect(isMazerExplicitSignOutRecorded(new BlockedStorage())).toBe(false);
    expect(recordMazerAutoHandoffAttempt(new BlockedStorage(), NOW)).toBe(false);
    expect(recordMazerExplicitSignOut(null, NOW)).toBe(false);
  });
});

describe('runMazerSignedOutHandoff', () => {
  test('signed out: records the attempt BEFORE leaving, calls the hand-off once, keeps the page pending', async () => {
    const h = createHarness();
    let attemptSeenByBegin = false;
    h.begin.mockImplementation(async () => {
      attemptSeenByBegin = h.session.getItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY) !== null;
      return { status: 'none' };
    });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'navigating' });
    expect(h.begin).toHaveBeenCalledTimes(1);
    expect(attemptSeenByBegin).toBe(true);
    expect(h.failures).toEqual([]);
  });

  test('signed in: no redirect, no hand-off call, stale sign-out intent and attempt are settled', async () => {
    const local = new MemoryStorage();
    local.setItem(SESSION_KEY, '{"access_token":"x"}');
    recordMazerExplicitSignOut(local, NOW - 1);
    const session = new MemoryStorage();
    recordMazerAutoHandoffAttempt(session, NOW - 1);
    const h = createHarness({}, { local, session });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'stay', reason: 'signed-in' });
    expect(h.begin).not.toHaveBeenCalled();
    expect(local.getItem(MAZER_EXPLICIT_SIGN_OUT_KEY)).toBeNull();
    expect(session.getItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY)).toBeNull();
  });

  test('LOOP GUARD: the return from the host without a session (back, cancel, host error page) does not redirect again', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const first = createHarness({}, { local, session });
    await runMazerSignedOutHandoff(first.deps);
    expect(first.begin).toHaveBeenCalledTimes(1);

    // Same tab: the host sent the player back to Mazer, still no session.
    for (const later of [5_000, 60_000, 5 * 60_000]) {
      const again = createHarness({}, { local, session });
      again.setNow(NOW + later);
      await expect(runMazerSignedOutHandoff(again.deps)).resolves.toEqual({ status: 'stay', reason: 'attempt-in-flight' });
      expect(again.begin).not.toHaveBeenCalled();
    }
  });

  test('a genuinely new launch after the window redirects once more', async () => {
    const session = new MemoryStorage();
    await runMazerSignedOutHandoff(createHarness({}, { session }).deps);
    const later = createHarness({}, { session });
    later.setNow(NOW + MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS + 1);
    await expect(runMazerSignedOutHandoff(later.deps)).resolves.toEqual({ status: 'navigating' });
  });

  test('a new app session (sessionStorage gone) redirects again', async () => {
    const local = new MemoryStorage();
    await runMazerSignedOutHandoff(createHarness({}, { local }).deps);
    const relaunch = createHarness({}, { local, session: new MemoryStorage() });
    await expect(runMazerSignedOutHandoff(relaunch.deps)).resolves.toEqual({ status: 'navigating' });
  });

  test('a failed, denied, expired or malformed OAuth return never redirects: the callback outcome is shown by the fallback screen', async () => {
    // error=access_denied, state mismatch, expired code and malformed values all
    // arrive as an OAuth callback request; main.ts consumes them first.
    const h = createHarness({ oauthCallbackRequested: true });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'stay', reason: 'oauth-callback' });
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.session.getItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY)).toBeNull();
  });

  test.each(['provider_unreachable', 'storage_unavailable', 'authorization_unavailable'] as const)(
    'hand-off refused before leaving (%s): stays, hands the category to the fallback screen, and frees the guard',
    async (category) => {
      const h = createHarness();
      h.begin.mockResolvedValue({ category, status: 'failed' });
      await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ category, status: 'failed' });
      expect(h.failures).toEqual([category]);
      // Nothing left the page: no attempt is in flight, so the next launch (back online) tries again.
      expect(h.session.getItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY)).toBeNull();
      h.begin.mockResolvedValue({ status: 'none' });
      await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'navigating' });
    }
  );

  test('a throwing hand-off becomes authorization_unavailable, not an unhandled boot error', async () => {
    const h = createHarness();
    h.begin.mockRejectedValue(new Error('boom'));
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ category: 'authorization_unavailable', status: 'failed' });
    expect(h.failures).toEqual(['authorization_unavailable']);
  });

  test('blocked sessionStorage: the guard cannot work, so no redirect is started', async () => {
    const h = createHarness({ sessionStorage: new BlockedStorage() });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'stay', reason: 'attempt-in-flight' });
    expect(h.begin).not.toHaveBeenCalled();
  });

  test('explicit sign-out: launches stay on the Mazer screen until the player signs in again', async () => {
    const local = new MemoryStorage();
    recordMazerExplicitSignOut(local, NOW - 100_000);
    for (let launch = 0; launch < 3; launch += 1) {
      const h = createHarness({}, { local, session: new MemoryStorage() });
      h.setNow(NOW + launch * 3_600_000);
      await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'stay', reason: 'explicit-sign-out' });
      expect(h.begin).not.toHaveBeenCalled();
    }
    // The player taps Sign in on the fallback screen and completes it: a session exists on the next boot.
    local.setItem(SESSION_KEY, '{"access_token":"x"}');
    const signedIn = createHarness({}, { local });
    await expect(runMazerSignedOutHandoff(signedIn.deps)).resolves.toEqual({ status: 'stay', reason: 'signed-in' });
    expect(local.getItem(MAZER_EXPLICIT_SIGN_OUT_KEY)).toBeNull();
    // Later the session ends on its own (expiry): that is a plain signed-out launch again.
    local.removeItem(SESSION_KEY);
    const expired = createHarness({}, { local, session: new MemoryStorage() });
    await expect(runMazerSignedOutHandoff(expired.deps)).resolves.toEqual({ status: 'navigating' });
  });

  test.each([
    ['localhost', { isLocalhost: true }],
    ['previewLevel', { levelPreviewRequested: true }],
    ['auth fixture', { authFixtureRoute: true }],
    ['autoSignIn=0', { optedOut: true }],
    ['quarantined session', { sessionQuarantined: true }]
  ] as const)('QA / dev bypass keeps working: %s', async (_label, over) => {
    const h = createHarness(over);
    const result = await runMazerSignedOutHandoff(h.deps);
    expect(result.status).toBe('stay');
    expect(h.begin).not.toHaveBeenCalled();
  });

  test('full round trip: redirect, successful return clears the guard, later expiry redirects again', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    await expect(runMazerSignedOutHandoff(createHarness({}, { local, session }).deps)).resolves.toEqual({ status: 'navigating' });
    // Host returned with ?code=... : main.ts exchanged it and a session is stored.
    local.setItem(SESSION_KEY, '{"access_token":"x"}');
    const returned = createHarness({ oauthCallbackRequested: true }, { local, session });
    await expect(runMazerSignedOutHandoff(returned.deps)).resolves.toEqual({ status: 'stay', reason: 'signed-in' });
    expect(session.getItem(MAZER_AUTO_HANDOFF_ATTEMPT_KEY)).toBeNull();
    local.removeItem(SESSION_KEY);
    await expect(runMazerSignedOutHandoff(createHarness({}, { local, session }).deps)).resolves.toEqual({ status: 'navigating' });
  });
});

describe('the real hand-off, offline and provider down', () => {
  const createRuntime = (proceed: boolean): { assign: ReturnType<typeof vi.fn>; runtime: MazerOAuthRuntime } => {
    const assign = vi.fn();
    const runtime = {
      authStorage: new MemoryStorage(),
      clearTimer: vi.fn(),
      crypto: globalThis.crypto,
      fetch: vi.fn(),
      history: { replaceState: vi.fn() },
      location: { assign, hash: '', pathname: '/', search: '' },
      notifyAcceptedSession: () => true,
      now: () => NOW,
      preflightProvider: async () => ({ proceed, reason: proceed ? 'ok' : 'offline', status: null }),
      runExclusiveSessionTransaction: async (operation: () => unknown) => operation(),
      runQueuedSessionTransaction: async (operation: () => unknown) => operation(),
      sessionStorage: new MemoryStorage(),
      setTimer: vi.fn()
    } as unknown as MazerOAuthRuntime;
    return { assign, runtime };
  };

  test('provider up: navigates to the authorize URL exactly once', async () => {
    const up = createRuntime(true);
    const h = createHarness({ begin: () => beginMazerOAuthAuthorization(up.runtime) });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ status: 'navigating' });
    expect(up.assign).toHaveBeenCalledTimes(1);
    expect(String(up.assign.mock.calls[0]?.[0])).toContain('/auth/v1/oauth/authorize?');
  });

  test('offline / provider down: no navigation, provider_unreachable reaches the boot result and its player copy', async () => {
    const down = createRuntime(false);
    const h = createHarness({ begin: () => beginMazerOAuthAuthorization(down.runtime), recordFailure: recordMazerOAuthBootFailure });
    await expect(runMazerSignedOutHandoff(h.deps)).resolves.toEqual({ category: 'provider_unreachable', status: 'failed' });
    expect(down.assign).not.toHaveBeenCalled();
    expect(readMazerOAuthBootResult()).toEqual({ category: 'provider_unreachable', status: 'failed' });
    expect(resolveLegacyOAuthFailureCopy('provider_unreachable')).toBe('Sign-in is unavailable right now. Try again in a few minutes.');
  });
});
