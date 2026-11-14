import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MAZER_OAUTH_AUTH_SESSION_KEY } from '../../src/legacy-runtime/legacyAccountPortal';
import {
  hasLegacyStoredAuthSession,
  resolveLegacyAuthGateInitialState,
  shouldAwaitLegacyAuthResolution,
  type LegacyAuthGateResolutionInput
} from '../../src/legacy-runtime/legacyAuthGateResolution';
import { resolveLegacyAuthLoadingCopy } from '../../src/legacy-runtime/legacyAccountStatusState';

const input = (overrides: Partial<LegacyAuthGateResolutionInput> = {}): LegacyAuthGateResolutionInput => ({
  authFixtureRoute: false,
  bootstrappedAuthenticated: false,
  callbackInProgress: false,
  hasStoredSession: false,
  ...overrides
});

describe('auth gate resolution: when is a session actually being resolved?', () => {
  // [authFixtureRoute, bootstrappedAuthenticated, callbackInProgress, hasStoredSession] -> awaiting
  const TABLE: ReadonlyArray<readonly [boolean, boolean, boolean, boolean, boolean]> = [
    [false, false, false, false, false],
    [false, false, false, true, true],
    [false, false, true, false, true],
    [false, false, true, true, true],
    [false, true, false, false, true],
    [false, true, false, true, true],
    [false, true, true, false, true],
    [false, true, true, true, true],
    [true, false, false, false, true],
    [true, false, false, true, true],
    [true, false, true, false, true],
    [true, false, true, true, true],
    [true, true, false, false, true],
    [true, true, false, true, true],
    [true, true, true, false, true],
    [true, true, true, true, true]
  ];

  test.each(TABLE)(
    'fixture=%s bootstrapped=%s callback=%s stored=%s -> awaiting=%s',
    (authFixtureRoute, bootstrappedAuthenticated, callbackInProgress, hasStoredSession, expected) => {
      const result = input({ authFixtureRoute, bootstrappedAuthenticated, callbackInProgress, hasStoredSession });
      expect(shouldAwaitLegacyAuthResolution(result)).toBe(expected);
      expect(resolveLegacyAuthGateInitialState(result)).toEqual({ awaitingResolution: expected, locked: !expected });
    }
  );

  test('a first-time signed-out visitor goes straight to a locked gate with no cover', () => {
    expect(resolveLegacyAuthGateInitialState(input())).toEqual({ awaitingResolution: false, locked: true });
  });

  test('the cover copy follows the same evidence: Signing you in… only with a session, else Loading…', () => {
    for (const awaiting of [true, false]) {
      expect(resolveLegacyAuthLoadingCopy({ awaitingResolution: awaiting, callbackInProgress: false, hasSession: false })).toBe('Loading…');
    }
    const withSession = resolveLegacyAuthGateInitialState(input({ hasStoredSession: true }));
    expect(resolveLegacyAuthLoadingCopy({
      awaitingResolution: withSession.awaitingResolution, callbackInProgress: false, hasSession: withSession.awaitingResolution
    })).toBe('Signing you in…');
  });
});

describe('auth gate resolution: stored session probe', () => {
  const storage = (value: string | null, throws = false): Pick<Storage, 'getItem'> => ({
    getItem: (key: string) => {
      if (throws) {
        throw new Error('blocked');
      }
      return key === MAZER_OAUTH_AUTH_SESSION_KEY ? value : null;
    }
  });

  test('presence of the shared auth session key is the only signal', () => {
    expect(hasLegacyStoredAuthSession(storage('{"access_token":"x"}'))).toBe(true);
    expect(hasLegacyStoredAuthSession(storage(null))).toBe(false);
    expect(hasLegacyStoredAuthSession(storage(''))).toBe(false);
    expect(hasLegacyStoredAuthSession(null)).toBe(false);
    expect(hasLegacyStoredAuthSession(undefined)).toBe(false);
  });

  test('blocked storage reads as no session (first-time path), never throws', () => {
    expect(hasLegacyStoredAuthSession(storage('x', true))).toBe(false);
  });

  test('other keys do not count', () => {
    expect(hasLegacyStoredAuthSession({ getItem: () => 'x' }, 'some-other-key')).toBe(true);
    expect(hasLegacyStoredAuthSession(storage('x'), 'some-other-key')).toBe(false);
  });
});

describe('auth gate resolution: MenuScene wiring', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

  test('the initial gate state comes from the helper, before auth initialization starts', () => {
    const helperAt = scene.indexOf('const authGateInitialState = resolveLegacyAuthGateInitialState({');
    const initAt = scene.indexOf('void this.initializeLegacyAuth();');
    expect(helperAt).toBeGreaterThan(0);
    expect(helperAt).toBeLessThan(initAt);
    expect(scene).toContain('hasStoredSession: hasLegacyStoredAuthSession(this.resolveBrowserLocalStorage())');
    expect(scene).toContain("bootstrappedAuthenticated: readLegacyBootstrappedAuthSnapshot()?.status === 'authenticated'");
    expect(scene).toContain('this.authGateAwaitingResolution = authGateInitialState.awaitingResolution;');
    expect(scene).toContain('if (authGateInitialState.locked) {\n      this.authGateLocked = true;\n      this.pendingAuthGateTransition = true;');
  });

  test('the cover text is chosen by resolveLegacyAuthLoadingCopy, not a constant', () => {
    const start = scene.indexOf('  private syncLegacyAuthGateLoadingScreen(time: number): void {');
    const body = scene.slice(start, start + 3200);
    expect(body).toContain('this.authGateLoadingText.setText(resolveLegacyAuthLoadingCopy({');
    expect(body).toContain('hasSession: this.authGateHasSessionEvidence');
  });
});
