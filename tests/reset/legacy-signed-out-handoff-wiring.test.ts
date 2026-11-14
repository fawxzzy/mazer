import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  MAZER_EXPLICIT_SIGN_OUT_KEY,
  isMazerExplicitSignOutRecorded
} from '../../src/legacy-runtime/legacySignedOutHandoff';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const STORAGE_KEY = 'sb-bxtcuhkotumitoqtrcej-auth-token';

const loadAuthWithClient = async (signOutError: string | null) => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, '{"access_token":"x"}');
  const auth = {
    admin: { fetch: vi.fn() as unknown as typeof fetch },
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    storage,
    storageKey: STORAGE_KEY,
    _signOut: vi.fn(async () => {
      if (signOutError !== null) {
        return { error: { message: signOutError } };
      }
      storage.removeItem(STORAGE_KEY);
      return { error: null };
    })
  };
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) }
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    localStorage: storage,
    location: { pathname: '/' },
    sessionStorage: new MemoryStorage()
  });
  vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth })) }));
  const legacyAuth = await import('../../src/legacy-runtime/legacyAuth');
  return { legacyAuth, storage };
};

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('MAZER-ACCT-040 explicit sign-out intent', () => {
  test('a completed Sign out records the intent so the next launch does not bounce back to the host', async () => {
    const { legacyAuth, storage } = await loadAuthWithClient(null);
    const result = await legacyAuth.signOutLegacyAuth();
    expect(result.snapshot.status).toBe('guest');
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(MAZER_EXPLICIT_SIGN_OUT_KEY)).not.toBeNull();
    expect(isMazerExplicitSignOutRecorded(storage)).toBe(true);
  });

  test('a Sign out that failed (session still stored) records nothing: the player is still signed in', async () => {
    const { legacyAuth, storage } = await loadAuthWithClient('network down');
    const result = await legacyAuth.signOutLegacyAuth();
    expect(result.snapshot.status).not.toBe('guest');
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(isMazerExplicitSignOutRecorded(storage)).toBe(false);
  });
});

describe('MAZER-ACCT-040 boot wiring (source contract)', () => {
  const main = readFileSync(resolve(__dirname, '../../src/boot/main.ts'), 'utf8');

  test('the hand-off runs after the install gate and the OAuth callback (MAZER-PWA-007: gate first), before the account bootstrap and the Phaser game', () => {
    const callback = main.indexOf('await consumeMazerOAuthCallback(');
    const gate = main.indexOf('await runMazerInstallGate(');
    const handoff = main.indexOf('await runMazerSignedOutHandoffAtBoot(oauthCallbackRequested)');
    const bootstrap = main.indexOf('await runBoundedAccountBootstrap(');
    const game = main.indexOf('new Phaser.Game(');
    expect(callback).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(callback).toBeGreaterThan(gate);
    expect(handoff).toBeGreaterThan(callback);
    expect(bootstrap).toBeGreaterThan(handoff);
    expect(game).toBeGreaterThan(bootstrap);
  });
});
