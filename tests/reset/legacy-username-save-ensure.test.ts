import { afterEach, describe, expect, test, vi } from 'vitest';

// saveLegacyAccountUsername against a mocked master client: a host-created
// account has no profile row, so mazer_set_username raises P0002 until
// mazer_ensure_profile has created it.

const USER_ID = '33333333-3333-4333-8333-333333333333';

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

const loadSave = async (handler: (name: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>) => {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => handler(name, args));
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn()
    },
    from: vi.fn(() => {
      throw new Error('direct mazer_profiles access must not be used');
    }),
    rpc
  };
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://bxtcuhkotumitoqtrcej.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-fixture-key');
  vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => client) }));
  const { saveLegacyAccountUsername } = await import('../../src/legacy-runtime/legacyAuth');
  return { client, rpc, saveLegacyAccountUsername };
};

const missing = { code: 'P0002', message: 'MAZER_PROFILE_MISSING' };

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('saveLegacyAccountUsername with a missing profile row', () => {
  test('ensures the profile first, then saves the name', async () => {
    let profileExists = false;
    const { rpc, client, saveLegacyAccountUsername } = await loadSave((name) => {
      if (name === 'mazer_ensure_profile') {
        profileExists = true;
        return { data: 'Mazer-654321', error: null };
      }
      return profileExists
        ? { data: 'Fresh_Name', error: null }
        : { data: null, error: missing };
    });

    await expect(saveLegacyAccountUsername(USER_ID, 'Fresh_Name'))
      .resolves.toEqual({ error: null, failure: null, ok: true });

    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'mazer_set_username',
      'mazer_ensure_profile',
      'mazer_set_username'
    ]);
    expect(rpc).toHaveBeenNthCalledWith(2, 'mazer_ensure_profile', { p_display_name: null, p_expected_user_id: USER_ID });
    expect(rpc).toHaveBeenNthCalledWith(3, 'mazer_set_username', { p_expected_user_id: USER_ID, p_username: 'Fresh_Name' });
    expect(client.from).not.toHaveBeenCalled();
  });

  test('does not ensure when the profile already exists', async () => {
    const { rpc, saveLegacyAccountUsername } = await loadSave(() => ({ data: 'Name', error: null }));
    await expect(saveLegacyAccountUsername(USER_ID, 'Name')).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test('stops after one ensure and one retry (no loop) and reports a failure kind', async () => {
    const { rpc, saveLegacyAccountUsername } = await loadSave((name) => (
      name === 'mazer_ensure_profile' ? { data: 'Mazer-1', error: null } : { data: null, error: missing }
    ));
    await expect(saveLegacyAccountUsername(USER_ID, 'Name')).resolves.toMatchObject({
      failure: 'failed',
      ok: false
    });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'mazer_set_username',
      'mazer_ensure_profile',
      'mazer_set_username'
    ]);
  });

  test('an ensure failure ends the save with a generic failure and no second rename', async () => {
    const { rpc, saveLegacyAccountUsername } = await loadSave((name) => (
      name === 'mazer_ensure_profile'
        ? { data: null, error: { code: '28000', message: 'mazer_ensure_profile account mismatch' } }
        : { data: null, error: missing }
    ));
    await expect(saveLegacyAccountUsername(USER_ID, 'Name')).resolves.toEqual({
      error: 'mazer_ensure_profile account mismatch',
      failure: 'failed',
      ok: false
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test('classifies a taken name and a connectivity failure for the player toast', async () => {
    const taken = await loadSave(() => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    }));
    await expect(taken.saveLegacyAccountUsername(USER_ID, 'Taken')).resolves.toEqual({
      error: 'That username is already taken.',
      failure: 'taken',
      ok: false
    });
    expect(taken.rpc).toHaveBeenCalledTimes(1);

    const offline = await loadSave(() => ({ data: null, error: { message: 'Failed to fetch' } }));
    await expect(offline.saveLegacyAccountUsername(USER_ID, 'Name')).resolves.toMatchObject({
      failure: 'try-again',
      ok: false
    });
  });
});

describe('MenuScene no longer discards a failed username save', () => {
  test('every saveLegacyAccountUsername use reports a failure to the player', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8').replace(/\r\n?/g, '\n');
    // The in-app sign-up branch that called it directly is gone (MAZER-ACCT-012); the leaderboard
    // username editor hands it to submitLegacyUsernameEdit as the `save` service (taken / try-again
    // are decided there, tests/reset/legacy-leaderboard-username-editor.test.ts) and toasts the outcome.
    expect(source.match(/await saveLegacyAccountUsername\(|void saveLegacyAccountUsername\(/g) ?? []).toHaveLength(0);
    expect(source).toContain('save: saveLegacyAccountUsername');
    expect(source).toContain('this.reportAccountUsernameSaveFailure(outcome.failure, outcome.technicalDetail)');
    expect(source).toContain("this.reportAccountUsernameSaveFailure('invalid', null)");
    expect(source).toContain('this.pushLegacyPlayerMessage(resolveLegacyUsernameSaveFailureMessage(kind, technicalDetail))');
  });
});
