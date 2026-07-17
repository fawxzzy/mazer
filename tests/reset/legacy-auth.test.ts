import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_GUEST_SCOPE,
  LEGACY_AUTH_REMEMBERED_IDENTITY_KEY,
  buildLegacyRememberedIdentityState,
  createEmptyLegacyAuthFormState,
  createLegacyAuthScopedStorage,
  deriveLegacyRememberedIdentityDisplayName,
  markLegacyRememberedIdentityReauthRequired,
  normalizeLegacyAuthEmail,
  readLegacyRememberedIdentityState,
  readLegacyRememberedIdentity,
  resolveLegacyAuthAccountLabel,
  resolveLegacyAuthConfig,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthStorageScope,
  resolveLegacyAuthSubmitState,
  syncLegacyRememberedIdentityFromAuthenticatedSession,
  writeLegacyRememberedIdentityState,
  writeLegacyRememberedIdentity,
  type LegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }
}

const createSnapshot = (
  overrides: Partial<LegacyAuthSessionSnapshot> = {}
): LegacyAuthSessionSnapshot => ({
  configured: true,
  displayName: null,
  email: null,
  error: null,
  info: null,
  status: 'guest',
  userId: null,
  ...overrides
});

describe('legacy auth runtime', () => {
  test('detects whether Supabase browser auth is configured', () => {
    expect(resolveLegacyAuthConfig({})).toBeNull();
    expect(resolveLegacyAuthConfig({
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_URL: 'https://example.supabase.co'
    })).toEqual({
      anonKey: 'anon-key',
      url: 'https://example.supabase.co'
    });
  });

  test('keeps local Vite auth env from being shadowed by inherited shell env during builds', () => {
    const buildScript = readFileSync(resolve(process.cwd(), 'scripts/build/run-build.mjs'), 'utf8');

    expect(buildScript).toContain("process.env.MAZER_PREFER_LOCAL_VITE_ENV === '0'");
    expect(buildScript).toContain("if (!key.startsWith('VITE_'))");
    expect(buildScript).toContain('process.env[key] = stripEnvQuotes(rawValue.trim());');
    expect(buildScript).toContain('loadLocalViteEnv();');
  });

  test('keeps form readiness strict enough for login and signup', () => {
    const form = createEmptyLegacyAuthFormState('login');

    expect(resolveLegacyAuthSubmitState(form, false)).toEqual({
      canSubmit: false,
      reason: 'Account login is not configured for this build.'
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'secure-pass'
    }, true)).toEqual({
      canSubmit: true,
      reason: null
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player',
      password: 'secure-pass'
    }, true).reason).toBe('Enter an email.');
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'short'
    }, true).reason).toBe('Password needs at least 10 characters.');
  });

  test('normalizes remembered identity without making it required for guest play', () => {
    const storage = new MemoryStorage();

    expect(readLegacyRememberedIdentity(undefined)).toBe('');
    writeLegacyRememberedIdentity(storage, ' Player@Example.COM ');

    expect(JSON.parse(storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY) ?? '{}')).toMatchObject({
      displayName: 'Player',
      email: 'player@example.com',
      sessionState: 'reauth-required'
    });
    expect(readLegacyRememberedIdentity(storage)).toBe('player@example.com');
    expect(normalizeLegacyAuthEmail(' Player@Example.COM ')).toBe('player@example.com');
  });

  test('keeps fitness-style remembered login state for persistent re-entry', () => {
    const storage = new MemoryStorage();

    expect(deriveLegacyRememberedIdentityDisplayName('runner@example.test')).toBe('Runner');
    expect(buildLegacyRememberedIdentityState({
      email: ' Runner@Example.TEST ',
      updatedAt: '2026-07-09T12:00:00.000Z'
    })).toEqual({
      displayName: 'Runner',
      email: 'runner@example.test',
      sessionState: 'reauth-required',
      updatedAt: '2026-07-09T12:00:00.000Z'
    });

    writeLegacyRememberedIdentityState(storage, {
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'ready',
      updatedAt: '2026-07-09T12:01:00.000Z'
    });
    expect(readLegacyRememberedIdentityState(storage)).toEqual({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'ready',
      updatedAt: '2026-07-09T12:01:00.000Z'
    });

    const reauthState = markLegacyRememberedIdentityReauthRequired(storage);
    expect(reauthState).toMatchObject({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      sessionState: 'reauth-required'
    });
    expect(readLegacyRememberedIdentity(storage)).toBe('runner@example.com');
  });

  test('syncs remembered identity from authenticated sessions without storing tokens', () => {
    const storage = new MemoryStorage();
    const state = syncLegacyRememberedIdentityFromAuthenticatedSession(storage, createSnapshot({
      displayName: 'Mazer Owner',
      email: 'runner@example.test',
      status: 'authenticated',
      userId: 'user-123'
    }));
    const raw = storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY) ?? '';

    expect(state).toMatchObject({
      displayName: 'Mazer Owner',
      email: 'runner@example.test',
      sessionState: 'ready'
    });
    expect(raw).toContain('runner@example.test');
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('refresh_token');
  });

  test('guards auth persistence against global sign-out and duplicate listeners', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');

    expect(authSource).toContain("client.auth.signOut({ scope: 'local' })");
    expect(authSource).toContain('legacyAuthPersistenceListenerInstalled');
    expect(authSource).toContain('syncLegacyAuthPersistenceFromSession(data.session,');
    expect(authSource).toContain('export const readLegacyAuthSessionSnapshot = async');
    expect(authSource).toContain('export const subscribeLegacyAuthState = (');
    expect(authSource).toContain("if (snapshot.status === 'authenticated')");
    expect(authSource).toContain('return `${session.user.id}:${session.expires_at ?? 0}`;');
    expect(authSource).not.toContain('session.refresh_token || !session.user?.id');
    expect(authSource).toContain("'BOOTSTRAP_SESSION'");
    expect(authSource).not.toContain("|| event === 'BOOTSTRAP_SESSION'");
    expect(authSource).not.toContain("|| event === 'INITIAL_SESSION'");
    expect(authSource).toContain("event === 'SIGNED_OUT'");
  });

  test('scopes learning storage by guest versus signed-in account', () => {
    const storage = new MemoryStorage();
    const baseKey = 'mazer.progression.v1';
    const guestSnapshot = createSnapshot();
    const userSnapshot = createSnapshot({
      email: 'player@example.com',
      status: 'authenticated',
      userId: 'user-123'
    });

    const guestStorage = createLegacyAuthScopedStorage(storage, baseKey, guestSnapshot);
    const userStorage = createLegacyAuthScopedStorage(storage, baseKey, userSnapshot);

    guestStorage?.setItem(baseKey, 'guest-state');
    userStorage?.setItem(baseKey, 'user-state');

    expect(resolveLegacyAuthStorageScope(guestSnapshot)).toBe(LEGACY_AUTH_GUEST_SCOPE);
    expect(resolveLegacyAuthStorageScope(userSnapshot)).toBe('user:user-123');
    expect(resolveLegacyAuthScopedStorageKey(baseKey, guestSnapshot)).toBe(`${baseKey}:guest`);
    expect(resolveLegacyAuthScopedStorageKey(baseKey, userSnapshot)).toBe(`${baseKey}:user:user-123`);
    expect(guestStorage?.getItem(baseKey)).toBe('guest-state');
    expect(userStorage?.getItem(baseKey)).toBe('user-state');
    expect(storage.getItem(baseKey)).toBeNull();
  });

  test('keeps account labels player-facing and compact', () => {
    expect(resolveLegacyAuthAccountLabel(createSnapshot())).toBe('Guest');
    expect(resolveLegacyAuthAccountLabel(createSnapshot({
      configured: false,
      status: 'unavailable'
    }))).toBe('Guest');
    expect(resolveLegacyAuthAccountLabel(createSnapshot({
      displayName: 'Maze Runner',
      email: 'runner@example.com',
      status: 'authenticated',
      userId: 'user-123'
    }))).toBe('Maze Runner');
  });
});
