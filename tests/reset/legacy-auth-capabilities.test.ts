import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  LEGACY_AUTH_FUTURE_PLATFORM_ORIGIN,
  LEGACY_AUTH_LEGACY_LOGIN_PASSWORD_MIN_LENGTH,
  LEGACY_AUTH_PASSWORD_MIN_LENGTH,
  LEGACY_AUTH_RESET_COOLDOWN_MS,
  createEmptyLegacyAuthFormState,
  createLegacyGuestAuthSnapshot,
  readLegacyAuthSessionSnapshot,
  requestLegacyPasswordReset,
  resolveLegacyAuthCallbackPresentation,
  resolveLegacyAuthCallbackState,
  resolveLegacyAuthPlatformCapabilities,
  resolveLegacyAuthRedirectContract,
  resolveLegacyAuthResetCooldown,
  resolveLegacyAuthSubmitState,
  resolveSanitizedLegacyAuthCallbackPath,
  signInLegacyAuth,
  signOutLegacyAuth,
  signUpLegacyAuth,
  startLegacyAuthResetCooldown,
  updateLegacyAccount,
  updateLegacyPassword
} from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  resolveLegacyAuthSafeErrorCopy
} from '../../src/legacy-runtime/legacyPlayerMessage';

const mockAuth = vi.hoisted(() => {
  const session = {
    access_token: 'test-only-access',
    expires_at: 1_900_000_000,
    refresh_token: 'test-only-refresh',
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-07-17T00:00:00.000Z',
      email: 'player@example.com',
      id: 'user-1',
      user_metadata: { display_name: 'Player' }
    }
  };
  return {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    session,
    signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: session.user }, error: null }))
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth })
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const capabilityIds = [
  'auth.email-password-login',
  'auth.signup-confirmation-redirect',
  'auth.reset-request',
  'auth.recovery-callback',
  'auth.password-submission',
  'auth.safe-errors',
  'auth.password-visibility',
  'auth.password-contract',
  'auth.redirect-ownership',
  'auth.reset-cooldown',
  'auth.session-restoration',
  'auth.local-signout',
  'auth.account-reachability',
  'auth.account-information-update',
  'auth.account-password-change',
  'auth.global-username-slot',
  'auth.deferred-methods',
  'auth.leaked-password-protection'
] as const;

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'browser-safe-test-key');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
});

describe('versioned Fitness-to-Mazer auth capability parity', () => {
  test('[auth.email-password-login] uses email/password and safe credential failures', async () => {
    await signInLegacyAuth(' Player@Example.COM ', 'a-secure-password');
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'a-secure-password'
    });
    expect(resolveLegacyAuthSafeErrorCopy('Invalid login credentials', 'login')).toBe(LEGACY_AUTH_MESSAGE_COPY.invalidCredentials);
  });

  test('[auth.signup-confirmation-redirect] sends an exact confirmation route', async () => {
    await signUpLegacyAuth('player@example.com', 'a-secure-password', 'Player');
    expect(mockAuth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: 'http://localhost:5173/?auth=confirmed' })
    }));
  });

  test('[auth.reset-request] keeps reset responses neutral for account enumeration', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: { message: 'User not found' } });
    const result = await requestLegacyPasswordReset('unknown@example.com');
    expect(result.snapshot.error).toBeNull();
    expect(result.snapshot.info).toBe(LEGACY_AUTH_MESSAGE_COPY.passwordResetSent);
  });

  test('[auth.recovery-callback] classifies callbacks without exposing provider detail', () => {
    const recoveryState = resolveLegacyAuthCallbackState({ hash: '', search: '?auth=recovery' });
    expect(recoveryState).toEqual({
      kind: 'recovery',
      message: LEGACY_AUTH_MESSAGE_COPY.recoveryReady
    });
    const successState = resolveLegacyAuthCallbackState({ hash: '', search: '?auth=confirmed' });
    expect(successState).toEqual({
      kind: 'success',
      message: LEGACY_AUTH_MESSAGE_COPY.emailConfirmed
    });
    const errorState = resolveLegacyAuthCallbackState({
      hash: '#error=unknown_provider_failure&error_description=raw-secret-detail',
      search: ''
    });
    expect(errorState).toEqual({
      kind: 'error',
      message: LEGACY_AUTH_MESSAGE_COPY.callbackInvalid
    });
    const guestSnapshot = createLegacyGuestAuthSnapshot(true);
    expect(resolveLegacyAuthCallbackPresentation(errorState, guestSnapshot)).toEqual({
      formMode: 'login',
      snapshot: {
        ...guestSnapshot,
        error: LEGACY_AUTH_MESSAGE_COPY.callbackInvalid,
        info: null
      }
    });
    expect(resolveLegacyAuthCallbackPresentation(successState, guestSnapshot)).toEqual({
      formMode: 'login',
      snapshot: {
        ...guestSnapshot,
        error: null,
        info: LEGACY_AUTH_MESSAGE_COPY.emailConfirmed
      }
    });
    const sanitizedPath = resolveSanitizedLegacyAuthCallbackPath({
      hash: '#access_token=secret',
      pathname: '/',
      search: '?auth=recovery&code=one-time-code&content=core-only'
    });
    expect(sanitizedPath).toBe('/?content=core-only');
    const repeatedLocation = new URL(sanitizedPath, 'https://mazer.local');
    expect(resolveLegacyAuthCallbackState(repeatedLocation)).toEqual({ kind: 'none', message: null });
  });

  test('[auth.password-submission] submits the validated password through updateUser', async () => {
    const result = await updateLegacyPassword('a-secure-password');
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'a-secure-password' });
    expect(result.snapshot.info).toBe(LEGACY_AUTH_MESSAGE_COPY.passwordUpdated);
  });

  test('[auth.safe-errors] maps every provider action into allowlisted copy', () => {
    expect(resolveLegacyAuthSafeErrorCopy('User already registered', 'signup')).toBe(LEGACY_AUTH_MESSAGE_COPY.signupUnavailable);
    expect(resolveLegacyAuthSafeErrorCopy('Failed to fetch', 'account-update')).toBe(LEGACY_AUTH_MESSAGE_COPY.networkUnavailable);
    expect(resolveLegacyAuthSafeErrorCopy('raw internal provider text', 'session')).toBe(LEGACY_AUTH_MESSAGE_COPY.genericFailure);
  });

  test('[auth.password-visibility] exposes explicit visible/hidden labels and native state', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(source).toContain("this.authPasswordVisible ? 'Hide' : 'Show'");
    expect(source).toContain("this.authPasswordVisible ? 'visible' : 'hidden'");
    expect(source).toContain("this.authPasswordVisible ? 'text' : 'password'");
    const captureSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/capture-auth-capability-surfaces.mjs'), 'utf8');
    expect(captureSource).toContain("engine: 'webkit'");
    expect(captureSource).toContain("fixture: 'recovery'");
    expect(captureSource).toContain("id: 'confirmation'");
    expect(captureSource).toContain("id: 'invalid-confirmation'");
    expect(captureSource).toContain("auth=confirmed");
    expect(captureSource).toContain('error=access_denied');
    expect(captureSource).toContain('auth-stack-dead-zone=');
  });

  test('[auth.password-contract] preserves legacy login access while requiring 10 for new passwords', () => {
    const loginForm = createEmptyLegacyAuthFormState('login', 'player@example.com');
    const signupForm = createEmptyLegacyAuthFormState('signup', 'player@example.com');
    const recoveryForm = createEmptyLegacyAuthFormState('recovery');
    expect(LEGACY_AUTH_LEGACY_LOGIN_PASSWORD_MIN_LENGTH).toBe(6);
    expect(LEGACY_AUTH_PASSWORD_MIN_LENGTH).toBe(10);
    expect(resolveLegacyAuthSubmitState({ ...loginForm, password: '12345' }, true).canSubmit).toBe(false);
    expect(resolveLegacyAuthSubmitState({ ...loginForm, password: '123456' }, true).canSubmit).toBe(true);
    expect(resolveLegacyAuthSubmitState({ ...signupForm, password: '123456789' }, true).canSubmit).toBe(false);
    expect(resolveLegacyAuthSubmitState({ ...signupForm, password: '1234567890' }, true).canSubmit).toBe(true);
    expect(resolveLegacyAuthSubmitState({
      ...recoveryForm,
      confirmPassword: 'x'.repeat(128),
      password: 'x'.repeat(128)
    }, true).canSubmit).toBe(true);
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(source).toContain('password: null');
    expect(source).toContain('confirmPassword: null');
    expect(source).not.toContain('password: 72');
  });

  test('[auth.redirect-ownership] rejects broad/unsafe values and preserves explicit future ownership', () => {
    expect(resolveLegacyAuthRedirectContract({
      VITE_MAZER_AUTH_CONFIRMATION_REDIRECT_URL: 'https://*.vercel.app/auth',
      VITE_MAZER_AUTH_RECOVERY_REDIRECT_URL: 'javascript:alert(1)'
    }, 'https://fawxzzy-mazer.vercel.app')).toMatchObject({
      confirmationRedirectTo: 'https://fawxzzy-mazer.vercel.app/?auth=confirmed',
      futurePlatformOrigin: LEGACY_AUTH_FUTURE_PLATFORM_ORIGIN,
      owner: 'mazer-compatible',
      recoveryRedirectTo: 'https://fawxzzy-mazer.vercel.app/?auth=recovery'
    });
    expect(resolveLegacyAuthRedirectContract({
      VITE_MAZER_AUTH_CONFIRMATION_REDIRECT_URL: 'https://account.fawxzzy.com/confirmed',
      VITE_MAZER_AUTH_RECOVERY_REDIRECT_URL: 'https://account.fawxzzy.com/recovery'
    })).toMatchObject({ owner: 'platform-configured' });
  });

  test('[auth.reset-cooldown] is deterministic across the exact 60-second boundary', () => {
    const storage = new MemoryStorage();
    expect(resolveLegacyAuthResetCooldown(storage, 100_000).allowed).toBe(true);
    expect(startLegacyAuthResetCooldown(storage, 100_000)).toEqual({ allowed: false, remainingSeconds: 60 });
    expect(resolveLegacyAuthResetCooldown(storage, 100_000 + LEGACY_AUTH_RESET_COOLDOWN_MS - 1)).toEqual({
      allowed: false,
      remainingSeconds: 1
    });
    expect(resolveLegacyAuthResetCooldown(storage, 100_000 + LEGACY_AUTH_RESET_COOLDOWN_MS)).toEqual({
      allowed: true,
      remainingSeconds: 0
    });
  });

  test('[auth.session-restoration] reads the persisted Supabase browser session', async () => {
    const snapshot = await readLegacyAuthSessionSnapshot();
    expect(snapshot).toMatchObject({ email: 'player@example.com', status: 'authenticated', userId: 'user-1' });
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    expect(source).toContain('autoRefreshToken: true');
    expect(source).toContain('detectSessionInUrl: true');
    expect(source).toContain('persistSession: true');
  });

  test('[auth.local-signout] never signs out other sessions globally', async () => {
    await signOutLegacyAuth();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('[auth.account-reachability] authenticated Options opens Account instead of signing out', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(source).toContain("const label = 'Account';");
    expect(source).toContain("this.openOverlay('auth');");
    expect(source).toContain("this.authSnapshot.status === 'authenticated' ? 'account'");
    expect(source).toContain("fixture === 'recovery' || fixture === 'account'");
  });

  test('[auth.account-information-update] updates email and display name through Supabase Auth', async () => {
    const form = createEmptyLegacyAuthFormState('account', 'owner@example.com');
    expect(resolveLegacyAuthSubmitState(form, true)).toEqual({ canSubmit: true, reason: null });
    await updateLegacyAccount({ displayName: 'Maze Owner', email: 'owner@example.com', username: 'ignored' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      data: { display_name: 'Maze Owner' },
      email: 'owner@example.com'
    });
  });

  test('[auth.account-password-change] authenticated Account reaches the recovery form', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(source).toContain("'Change Password'");
    expect(source).toContain("this.setLegacyAuthFormMode('recovery');");
    expect(source).toContain("'Save Password'");
  });

  test('[auth.global-username-slot] is disabled by default and never becomes a login identifier', async () => {
    expect(resolveLegacyAuthPlatformCapabilities({})).toEqual({ usernameProfile: 'disabled' });
    expect(resolveLegacyAuthPlatformCapabilities({ VITE_MAZER_PLATFORM_USERNAME_CAPABILITY: 'read-write' })).toEqual({
      usernameProfile: 'read-write'
    });
    await updateLegacyAccount(
      { displayName: 'Maze Owner', email: 'owner@example.com', username: 'global-owner' },
      { usernameProfile: 'read-write' }
    );
    expect(mockAuth.updateUser).toHaveBeenLastCalledWith({
      data: { display_name: 'Maze Owner', username: 'global-owner' },
      email: 'owner@example.com'
    });
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    expect(source).not.toContain('signInWithPassword({ username');
  });

  test('[auth.deferred-methods] records non-phase-one methods as deferred', () => {
    const doc = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-AUTH-CAPABILITY-PARITY-V1.md'), 'utf8');
    expect(doc).toContain('TOTP, social login, phone login, anonymous login, magic-link-only login, and enforced MFA remain deferred.');
  });

  test('[auth.leaked-password-protection] records provider ownership without a client claim', () => {
    const doc = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-AUTH-CAPABILITY-PARITY-V1.md'), 'utf8');
    expect(doc).toContain('Leaked-password protection is a future Supabase provider setting');
  });

  test('keeps the versioned matrix denominator exact and every row covered', () => {
    const matrixPath = resolve(process.cwd(), 'docs/contracts/fitness-mazer-auth-capability-matrix.v1.json');
    expect(existsSync(matrixPath)).toBe(true);
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8')) as {
      capabilities: Array<{ evidence: string; id: string }>;
      denominator: number;
      version: string;
    };
    expect(matrix.version).toBe('1.0.0');
    expect(matrix.denominator).toBe(18);
    expect(matrix.capabilities).toHaveLength(matrix.denominator);
    expect(matrix.capabilities.map((row) => row.id)).toEqual(capabilityIds);
    expect(new Set(matrix.capabilities.map((row) => row.id)).size).toBe(matrix.denominator);
    for (const row of matrix.capabilities) {
      expect(row.evidence).toBe('tests/reset/legacy-auth-capabilities.test.ts');
      expect(readFileSync(resolve(process.cwd(), row.evidence), 'utf8')).toContain(`[${row.id}]`);
    }
  });
});
