import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_GUEST_SCOPE,
  LEGACY_AUTH_REMEMBERED_IDENTITY_KEY,
  createEmptyLegacyAuthFormState,
  createLegacyAuthScopedStorage,
  normalizeLegacyAuthEmail,
  readLegacyRememberedIdentity,
  resolveLegacyAuthAccountLabel,
  resolveLegacyAuthConfig,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthStorageScope,
  resolveLegacyAuthSubmitState,
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

  test('keeps form readiness strict enough for login and signup', () => {
    const form = createEmptyLegacyAuthFormState('login');

    expect(resolveLegacyAuthSubmitState(form, false)).toEqual({
      canSubmit: false,
      reason: 'Login is not configured.'
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'secret1'
    }, true)).toEqual({
      canSubmit: true,
      reason: null
    });
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player',
      password: 'secret1'
    }, true).reason).toBe('Enter an email.');
    expect(resolveLegacyAuthSubmitState({
      ...form,
      email: 'player@example.com',
      password: 'short'
    }, true).reason).toBe('Password needs 6+ characters.');
  });

  test('normalizes remembered identity without making it required for guest play', () => {
    const storage = new MemoryStorage();

    expect(readLegacyRememberedIdentity(undefined)).toBe('');
    writeLegacyRememberedIdentity(storage, ' Player@Example.COM ');

    expect(storage.getItem(LEGACY_AUTH_REMEMBERED_IDENTITY_KEY)).toBe('player@example.com');
    expect(readLegacyRememberedIdentity(storage)).toBe('player@example.com');
    expect(normalizeLegacyAuthEmail(' Player@Example.COM ')).toBe('player@example.com');
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
