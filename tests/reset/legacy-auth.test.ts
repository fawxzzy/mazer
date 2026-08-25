import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  LEGACY_AUTH_GUEST_SCOPE,
  LEGACY_AUTH_REMEMBERED_IDENTITY_KEY,
  buildLegacySignUpMetadata,
  buildLegacyRememberedIdentityState,
  captureLegacyPasswordRecoveryBootUrlState,
  clearLegacyPasswordRecoveryUrl,
  createEmptyLegacyAuthFormState,
  createLegacyAuthScopedStorage,
  deriveLegacyRememberedIdentityDisplayName,
  markLegacyRememberedIdentityReauthRequired,
  normalizeLegacyAuthEmail,
  readLegacyRememberedIdentityState,
  readLegacyRememberedIdentity,
  readLegacyPasswordRecoveryBootUrlState,
  resolveLegacyPasswordRecoveryCleanUrl,
  resolveLegacyPasswordRecoveryEnterAction,
  resolveLegacyPasswordRecoveryRedirectUrl,
  resolveLegacyPasswordRecoveryUrlState,
  resolveLegacyPasswordUpdateSubmitState,
  resolveLegacyAuthAccountLabel,
  resolveLegacyAuthConfig,
  resolveLegacyAuthInvalidFields,
  resolveLegacyAuthScopedStorageKey,
  resolveLegacyAuthStorageScope,
  resolveLegacyAuthSubmitState,
  resolveLegacySignUpInfo,
  syncLegacyRememberedIdentityFromAuthenticatedSession,
  updateLegacyPasswordWithClient,
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
      reason: 'Account access is unavailable right now. You can still play as a guest.'
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

    const signup = createEmptyLegacyAuthFormState('signup');
    expect(resolveLegacyAuthInvalidFields(signup)).toEqual(['username', 'email', 'password']);
    expect(resolveLegacyAuthSubmitState({
      ...signup,
      email: 'player@example.com',
      password: 'secret1'
    }, true).reason).toBe('Enter a username.');
    expect(resolveLegacyAuthSubmitState({
      ...signup,
      email: 'player@example.com',
      password: 'secret1',
      username: 'fawxzzy'
    }, true)).toEqual({ canSubmit: true, reason: null });
  });

  test('binds password reset email callbacks to the exact recovery route', () => {
    expect(resolveLegacyPasswordRecoveryRedirectUrl('https://mazer.fawxzzy.com')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryRedirectUrl('https://mazer.fawxzzy.com/')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryCleanUrl('https://mazer.fawxzzy.com', 'invalid')).toBe(
      'https://mazer.fawxzzy.com/update-password'
    );
    expect(resolveLegacyPasswordRecoveryCleanUrl('https://mazer.fawxzzy.com', 'continue')).toBe(
      'https://mazer.fawxzzy.com/'
    );
  });

  test('recognizes direct recovery paths and categorical provider failures without exposing details', () => {
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#access_token=secret',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#code=secret&type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#type=signup',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#',
      pathname: '/update-password',
      search: '?code=secret'
    })).toEqual({ hasProviderError: false, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '#error=access_denied&error_code=otp_expired&error_description=secret-detail',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: true, requested: true });
    expect(resolveLegacyPasswordRecoveryUrlState({
      hash: '',
      pathname: '/',
      search: '?error_code=otp_expired'
    })).toEqual({ hasProviderError: true, requested: false });
  });

  test('retains a real recovery callback through auth bootstrap URL cleanup', () => {
    expect(captureLegacyPasswordRecoveryBootUrlState({
      hash: '#access_token=secret&type=recovery',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });
    expect(readLegacyPasswordRecoveryBootUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: true });

    clearLegacyPasswordRecoveryUrl('continue');
    expect(readLegacyPasswordRecoveryBootUrlState({
      hash: '',
      pathname: '/update-password',
      search: ''
    })).toEqual({ hasProviderError: false, requested: false });
  });

  test('updates a password only when both policy-valid fields match', async () => {
    const updateUser = vi.fn(async () => ({ error: null }));
    const client = { auth: { updateUser } };

    expect(resolveLegacyPasswordUpdateSubmitState('short', 'short', true)).toEqual({
      canSubmit: false,
      invalidFields: ['password'],
      reason: 'Password needs 6+ characters.'
    });
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret2', true)).toEqual({
      canSubmit: false,
      invalidFields: ['confirmPassword'],
      reason: 'Passwords do not match.'
    });
    expect(await updateLegacyPasswordWithClient(client, 'short', 'short')).toEqual({
      error: 'Password needs 6+ characters.',
      ok: false
    });
    expect(await updateLegacyPasswordWithClient(client, 'secret1', 'secret2')).toEqual({
      error: 'Passwords do not match.',
      ok: false
    });
    expect(updateUser).not.toHaveBeenCalled();

    await expect(updateLegacyPasswordWithClient(client, 'secret1', 'secret1')).resolves.toEqual({
      error: null,
      ok: true
    });
    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret1' });
  });

  test('advances Enter from the first recovery field and reserves submission for valid confirmation', () => {
    expect(resolveLegacyPasswordRecoveryEnterAction('password')).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('password', true)).toBe('focus-confirmation');
    expect(resolveLegacyPasswordRecoveryEnterAction('confirmPassword', true)).toBe('submit');
    expect(resolveLegacyPasswordRecoveryEnterAction('email', true)).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('username', true)).toBeNull();
    expect(resolveLegacyPasswordRecoveryEnterAction('displayName', true)).toBeNull();

    expect(resolveLegacyPasswordUpdateSubmitState('secret1', '', true).canSubmit).toBe(false);
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret2', true).canSubmit).toBe(false);
    expect(resolveLegacyPasswordUpdateSubmitState('secret1', 'secret1', true).canSubmit).toBe(true);
  });

  test('bounds recovery-password updates and shares an unresolved mutation with manual retry', async () => {
    let settleUpdate: ((value: { error: null }) => void) | null = null;
    const timeoutClient = {
      auth: {
        updateUser: vi.fn(async () => new Promise<{ error: null }>((resolve) => {
          settleUpdate = resolve;
        }))
      }
    };
    const timeoutResult = await updateLegacyPasswordWithClient(timeoutClient, 'secret1', 'secret1', {
      timeoutMs: 1
    });
    expect(timeoutResult.ok).toBe(false);
    expect(timeoutResult.error).toBe('Password update timed out.');
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    const retry = updateLegacyPasswordWithClient(timeoutClient, 'secret1', 'secret1', { timeoutMs: 100 });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    await expect(updateLegacyPasswordWithClient(timeoutClient, 'secret2', 'secret2', {
      timeoutMs: 100
    })).resolves.toEqual({
      error: 'A previous password update is still pending. Please wait before trying a different password.',
      ok: false
    });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    settleUpdate?.({ error: null });
    await expect(retry).resolves.toEqual({ error: null, ok: true });
    expect(timeoutClient.auth.updateUser).toHaveBeenCalledOnce();

    const rejectClient = {
      auth: { updateUser: vi.fn(async () => Promise.reject(new Error('bad network'))) }
    };
    const rejectResult = await updateLegacyPasswordWithClient(rejectClient, 'secret1', 'secret1', {
      timeoutMs: 1
    });
    expect(rejectResult.ok).toBe(false);
    expect(rejectResult.error).toBe('bad network');
    expect(rejectClient.auth.updateUser).toHaveBeenCalledOnce();
  });

  test('builds canonical Mazer signup metadata without deriving a username from email', () => {
    expect(buildLegacySignUpMetadata(' Fawxzzy-1 ')).toEqual({
      app_namespace: 'mazer',
      display_name: 'Fawxzzy-1',
      username: 'Fawxzzy-1'
    });

    for (const invalid of ['', 'a', 'sixteen_chars____', 'space name', 'unicode-☃', 'mail@example.com']) {
      expect(buildLegacySignUpMetadata(invalid)).toBeNull();
    }
    for (const nonString of [null, undefined, 123, {}, { trim: () => { throw new Error('must not run'); } }]) {
      expect(() => buildLegacySignUpMetadata(nonString)).not.toThrow();
      expect(buildLegacySignUpMetadata(nonString)).toBeNull();
    }

    expect(resolveLegacySignUpInfo(false, true)).toBe('Your account is ready.');
    expect(resolveLegacySignUpInfo(false, false)).toBe('Check your email to finish account setup.');
    expect(resolveLegacySignUpInfo(true, true)).toBeNull();
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

  test('binds browser data queries to a schema resolved per-project, not a hardcoded constant', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const progressionSource = readFileSync(
      resolve(process.cwd(), 'src/legacy-runtime/legacyRemoteProgression.ts'),
      'utf8'
    );

    // A single project-wide `db: { schema: 'mazer' }` was correct only for
    // the shared consolidation-target project and silently wrong for the
    // legacy/rollback project (whose tables still live in `public`) --
    // see legacySupabaseSchemaBinding.ts. The schema is now resolved from
    // the configured project's URL instead of assumed.
    expect(authSource).not.toMatch(/db:\s*\{\s*schema:\s*'mazer'\s*\}/);
    expect(authSource).toContain(
      "import { resolveLegacySupabaseSchemaForUrl } from './legacySupabaseSchemaBinding';"
    );
    expect(authSource).toContain('const schema = resolveLegacySupabaseSchemaForUrl(config.url);');
    expect(progressionSource).toContain('.from(');
    expect(progressionSource).not.toContain('.schema(');
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
