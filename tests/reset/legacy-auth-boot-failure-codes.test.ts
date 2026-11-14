import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGACY_AUTH_FAILURE_CODES } from '../../src/legacy-runtime/legacyAuthFailureCodes';
import { LEGACY_OAUTH_FAILURE_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE, type MazerOAuthBootResult } from '../../src/legacy-runtime/legacyAccountPortal';

// MAZER-ACCT-014: the quarantine and session-read failures at boot used to show
// the generic sentence with no code, so a report could not tell them apart.

interface Harness {
  getSession: ReturnType<typeof vi.fn>;
  readSnapshot: () => Promise<Record<string, unknown>>;
}

const loadHarness = async (options: {
  bootResult?: MazerOAuthBootResult;
  getSession: () => Promise<unknown>;
  quarantinedAfterRead?: boolean;
  quarantinedFromStart?: boolean;
}): Promise<Harness> => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-fixture-key');
  let quarantined = options.quarantinedFromStart === true;
  const getSession = vi.fn(async () => {
    if (options.quarantinedAfterRead === true) {
      quarantined = true;
    }
    return options.getSession();
  });
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ auth: { getSession, onAuthStateChange: vi.fn() } }))
  }));
  vi.doMock('../../src/legacy-runtime/legacyAccountPortal', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../src/legacy-runtime/legacyAccountPortal')>()),
    isMazerOAuthSessionQuarantined: () => quarantined,
    readMazerOAuthBootResult: () => options.bootResult ?? { status: 'none' },
    // A quarantine that recovery cannot clear.
    recoverMazerOAuthSessionQuarantine: vi.fn(async () => undefined)
  }));
  const auth = await import('../../src/legacy-runtime/legacyAuth');
  return {
    getSession,
    readSnapshot: async () => ({ ...(await auth.readLegacyAuthSessionSnapshot()) })
  };
};

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js');
  vi.doUnmock('../../src/legacy-runtime/legacyAccountPortal');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('boot sign-in failure codes', () => {
  test('the codes are plain snake_case tokens with no player wording', () => {
    for (const code of Object.values(LEGACY_AUTH_FAILURE_CODES)) {
      expect(code).toMatch(/^[a-z]+(_[a-z]+)+$/);
    }
    expect(new Set(Object.values(LEGACY_AUTH_FAILURE_CODES)).size).toBe(Object.keys(LEGACY_AUTH_FAILURE_CODES).length);
  });

  test('a quarantine that recovery cannot clear records session_quarantined', async () => {
    const harness = await loadHarness({
      getSession: async () => ({ data: { session: null }, error: null }),
      quarantinedFromStart: true
    });
    const snapshot = await harness.readSnapshot();
    expect(snapshot).toMatchObject({
      error: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      errorCode: 'session_quarantined',
      status: 'guest'
    });
    expect(snapshot.error).not.toContain('session_quarantined');
    expect(harness.getSession).not.toHaveBeenCalled();
  });

  test('a quarantine that starts during the session read records the same code', async () => {
    const harness = await loadHarness({
      getSession: async () => ({ data: { session: null }, error: null }),
      quarantinedAfterRead: true
    });
    expect(await harness.readSnapshot()).toMatchObject({
      error: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      errorCode: 'session_quarantined'
    });
  });

  test('a session read that throws records session_read_failed', async () => {
    const harness = await loadHarness({
      getSession: async () => { throw new Error('lock stolen for user@example.test'); }
    });
    const snapshot = await harness.readSnapshot();
    expect(snapshot).toMatchObject({
      error: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      errorCode: 'session_read_failed',
      status: 'guest'
    });
    // No exception text, address or id reaches the snapshot.
    expect(JSON.stringify(snapshot)).not.toContain('user@example.test');
  });

  test('a session read that returns an error records session_read_failed and keeps the provider copy path', async () => {
    const harness = await loadHarness({
      getSession: async () => ({ data: { session: null }, error: { message: 'Failed to fetch' } })
    });
    expect(await harness.readSnapshot()).toMatchObject({
      error: 'Failed to fetch',
      errorCode: 'session_read_failed'
    });
  });

  test('the two paths are told apart by code and share the same plain copy', async () => {
    const quarantined = await (await loadHarness({
      getSession: async () => ({ data: { session: null }, error: null }),
      quarantinedFromStart: true
    })).readSnapshot();
    const readFailed = await (await loadHarness({
      getSession: async () => { throw new Error('x'); }
    })).readSnapshot();
    expect(quarantined.errorCode).not.toBe(readFailed.errorCode);
    expect(quarantined.error).toBe(readFailed.error);
    // MAZER-ACCT-044 transition: the snapshot constant may still carry the previous generic spelling
    // until the Wave 5C PR lands; both spellings render as the generic row.
    expect([
      LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic,
      'Account connection unavailable. Return to Mazer and try again.'
    ]).toContain(quarantined.error);
  });

  test('a callback failure from the same boot keeps its own copy and code over the generic ones', async () => {
    const bootResult: MazerOAuthBootResult = { category: 'invalid_state', status: 'failed' };
    const quarantined = await (await loadHarness({
      bootResult,
      getSession: async () => ({ data: { session: null }, error: null }),
      quarantinedFromStart: true
    })).readSnapshot();
    expect(quarantined).toMatchObject({
      error: LEGACY_OAUTH_FAILURE_MESSAGE_COPY.contextLost,
      errorCode: 'invalid_state'
    });
    const readFailed = await (await loadHarness({
      bootResult,
      getSession: async () => { throw new Error('x'); }
    })).readSnapshot();
    expect(readFailed).toMatchObject({ errorCode: 'invalid_state' });
  });

  test('a clean boot records no failure code', async () => {
    const snapshot = await (await loadHarness({
      getSession: async () => ({ data: { session: null }, error: null })
    })).readSnapshot();
    expect(snapshot.error).toBeNull();
    expect(snapshot.errorCode).toBeUndefined();
  });

  test('the scene records a code when leaving for the account portal throws, and arms the failure line', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const start = scene.indexOf('private navigateToSharedAccountRoute');
    const body = scene.slice(start, scene.indexOf('private async handleSharedAccountAuthorization'));
    expect(body).toContain('errorCode: LEGACY_AUTH_FAILURE_CODES.portalNavigationFailed');
    expect(body).toContain('this.armLegacyAuthFeedbackMessage();');
  });
});
