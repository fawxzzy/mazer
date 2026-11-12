import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getLegacyAuthClient,
  readLegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';
import {
  bootstrapLegacyRemoteAccountState,
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_PROFILE_TABLE,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  writeLegacyRemoteSettings
} from '../../src/legacy-runtime/legacyRemoteProgression';
import {
  claimLegacyProfileEnsureAttempt,
  classifyLegacyUsernameSaveError,
  ensureLegacyRemoteProfile,
  isLegacyProfileMissingError,
  resetLegacyProfileEnsureAttemptsForTests
} from '../../src/legacy-runtime/legacyProfileEnsure';
import { LEGACY_DEFAULTS } from '../../src/legacy-runtime/legacyDefaults';
import { createEmptyLegacyProgressionState } from '../../src/legacy-runtime/legacyProgression';

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null),
    readLegacyAuthSessionSnapshot: vi.fn(async () => actual.createLegacyGuestAuthSnapshot())
  };
});

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ENV = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };
const SNAPSHOT = {
  configured: true,
  displayName: 'Host Player',
  email: 'host@example.test',
  error: null,
  info: null,
  status: 'authenticated' as const,
  userId: USER_ID
};

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values
  };
};

const maybeSingleChain = (result: unknown) => {
  const chain = { eq: () => chain, maybeSingle: async () => result };
  return chain;
};

interface FakeServer {
  client: { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
  insert: ReturnType<typeof vi.fn>;
  profileUpdates: unknown[];
  rpcNames: () => string[];
}

// A mocked account with NO mazer_profiles row until mazer_ensure_profile
// succeeds. progressionRow is the account's progression row.
const createFakeServer = (options: {
  ensure?: { data?: unknown; error?: { code?: string; message: string } | null; throws?: boolean };
  progressionRow?: unknown;
} = {}): FakeServer => {
  let profileExists = false;
  const profileUpdates: unknown[] = [];
  const insert = vi.fn(() => {
    throw new Error('direct mazer_profiles insert must not be used');
  });
  const progression = options.progressionRow === undefined
    ? { revision: 1, state: createEmptyLegacyProgressionState() }
    : options.progressionRow;
  const rpc = vi.fn(async (name: string) => {
    if (name === 'mazer_ensure_profile') {
      if (options.ensure?.throws) {
        throw new Error('socket hang up');
      }
      if (options.ensure?.error) {
        return { data: null, error: options.ensure.error };
      }
      profileExists = true;
      return { data: options.ensure?.data ?? 'Mazer-123456', error: null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => ({
    insert,
    select: () => maybeSingleChain(
      table === LEGACY_REMOTE_PROFILE_TABLE
        ? { data: profileExists ? { revision: 0, selected_control_mode: 'stick', settings: {} } : null, error: null }
        : table === LEGACY_REMOTE_PROGRESSION_TABLE
          ? { data: progression, error: null }
          : table === LEGACY_REMOTE_AI_PROGRESSION_TABLE
            ? { data: { state: createEmptyLegacyProgressionState().tracks['ai-runner'] }, error: null }
            : { data: null, error: null }
    ),
    update: (payload: unknown) => {
      profileUpdates.push(payload);
      return { eq: () => ({ eq: () => ({ select: () => maybeSingleChain({ data: { revision: 1 }, error: null }) }) }) };
    }
  }));
  return {
    client: { from, rpc },
    insert,
    profileUpdates,
    rpcNames: () => rpc.mock.calls.map((call) => String(call[0]))
  };
};

beforeEach(() => {
  resetLegacyProfileEnsureAttemptsForTests();
  vi.mocked(getLegacyAuthClient).mockReset().mockResolvedValue(null);
  vi.mocked(readLegacyAuthSessionSnapshot).mockReset();
});

describe('ensureLegacyRemoteProfile', () => {
  test('calls mazer_ensure_profile with the expected user id and display name', async () => {
    const rpc = vi.fn(async () => ({ data: 'Mazer-424242', error: null }));
    await expect(ensureLegacyRemoteProfile({ rpc } as never, USER_ID, '  Host Player ')).resolves.toEqual({
      error: null, ok: true, username: 'Mazer-424242'
    });
    expect(rpc).toHaveBeenCalledWith('mazer_ensure_profile', {
      p_display_name: 'Host Player',
      p_expected_user_id: USER_ID
    });
  });

  test('sends a null display name when there is none', async () => {
    const rpc = vi.fn(async () => ({ data: 'Mazer-1', error: null }));
    await ensureLegacyRemoteProfile({ rpc } as never, USER_ID, null);
    expect(rpc).toHaveBeenCalledWith('mazer_ensure_profile', { p_display_name: null, p_expected_user_id: USER_ID });
  });

  test('turns an RPC error and a thrown error into a result, never a throw', async () => {
    const failing = { rpc: vi.fn(async () => ({ data: null, error: { code: '28000', message: 'account mismatch' } })) };
    await expect(ensureLegacyRemoteProfile(failing as never, USER_ID, null))
      .resolves.toEqual({ error: 'account mismatch', ok: false, username: null });
    const throwing = { rpc: vi.fn(async () => { throw new Error('socket hang up'); }) };
    await expect(ensureLegacyRemoteProfile(throwing as never, USER_ID, null))
      .resolves.toEqual({ error: 'socket hang up', ok: false, username: null });
  });

  test('allows one attempt per scope and user, then refuses', () => {
    expect(claimLegacyProfileEnsureAttempt('settings-write', USER_ID)).toBe(true);
    expect(claimLegacyProfileEnsureAttempt('settings-write', USER_ID)).toBe(false);
    expect(claimLegacyProfileEnsureAttempt('settings-write', 'someone-else')).toBe(true);
    expect(claimLegacyProfileEnsureAttempt('other-scope', USER_ID)).toBe(true);
  });
});

describe('username save error mapping', () => {
  test.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'taken'],
    [{ message: 'duplicate key value' }, 'taken'],
    [{ code: '22023', message: 'MAZER_USERNAME_INVALID' }, 'invalid'],
    [{ code: '28000', message: 'mazer_set_username account mismatch' }, 'try-again'],
    [{ message: 'Failed to fetch' }, 'try-again'],
    [{ message: 'Load failed' }, 'try-again'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'failed'],
    [{ code: '42501', message: 'permission denied' }, 'failed'],
    [null, 'failed']
  ] as const)('%j maps to %s', (error, kind) => {
    expect(classifyLegacyUsernameSaveError(error)).toBe(kind);
  });

  test('recognises the missing-profile error by code or sentinel', () => {
    expect(isLegacyProfileMissingError({ code: 'P0002', message: 'x' })).toBe(true);
    expect(isLegacyProfileMissingError({ message: 'MAZER_PROFILE_MISSING' })).toBe(true);
    expect(isLegacyProfileMissingError({ code: '23505', message: 'taken' })).toBe(false);
    expect(isLegacyProfileMissingError(null)).toBe(false);
  });
});

describe('bootstrap for an account with no Mazer profile', () => {
  test('calls the ensure RPC once, never inserts, and pushes this device settings', async () => {
    const server = createFakeServer();
    vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValueOnce(SNAPSHOT);
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce(server.client as never);
    const storage = memoryStorage();

    const result = await bootstrapLegacyRemoteAccountState(storage, ENV);

    expect(server.rpcNames().filter((name) => name === 'mazer_ensure_profile')).toHaveLength(1);
    expect(server.client.rpc).toHaveBeenCalledWith('mazer_ensure_profile', {
      p_display_name: 'Host Player',
      p_expected_user_id: USER_ID
    });
    expect(server.insert).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.progressionState).not.toBeNull();
    // The new row only holds server defaults, so this device settings are pushed once.
    expect(server.profileUpdates).toHaveLength(1);
    expect(server.profileUpdates[0]).toMatchObject({ revision: 1, user_id: USER_ID });
    expect(JSON.parse(storage.values.get(`mazer.remote-account-sync.v1:user:${USER_ID}`)!)).toMatchObject({ settingsRevision: 1 });
  });

  test.each([
    ['an RPC error', { error: { code: '28000', message: 'mazer_ensure_profile account mismatch' } }],
    ['a thrown network error', { throws: true }]
  ])('%s does not throw, does not retry, and still hydrates progression', async (_label, ensure) => {
    const remote = createEmptyLegacyProgressionState();
    remote.tracks.player.completedCycles = '11';
    const server = createFakeServer({ ensure, progressionRow: { revision: 3, state: remote } });
    vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValueOnce(SNAPSHOT);
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce(server.client as never);
    const storage = memoryStorage();

    const result = await bootstrapLegacyRemoteAccountState(storage, ENV);

    expect(server.rpcNames().filter((name) => name === 'mazer_ensure_profile')).toHaveLength(1);
    expect(server.insert).not.toHaveBeenCalled();
    expect(result.error).toMatch(/account mismatch|socket hang up/);
    expect(result.progressionState?.tracks.player.completedCycles).toBe('11');
    expect(storage.values.has(`mazer.progression.v1:user:${USER_ID}`)).toBe(true);
    expect(server.profileUpdates).toHaveLength(0);
  });

  test('does not call the ensure RPC when the profile row already exists', async () => {
    const server = createFakeServer();
    await server.client.rpc('mazer_ensure_profile');
    server.client.rpc.mockClear();
    vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValueOnce(SNAPSHOT);
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce(server.client as never);

    await bootstrapLegacyRemoteAccountState(memoryStorage(), ENV);

    expect(server.rpcNames()).not.toContain('mazer_ensure_profile');
  });
});

describe('settings write path for an account with no Mazer profile', () => {
  test('ensures once, never inserts, then writes the settings', async () => {
    const server = createFakeServer();
    vi.mocked(getLegacyAuthClient).mockResolvedValue(server.client as never);

    const result = await writeLegacyRemoteSettings(SNAPSHOT, LEGACY_DEFAULTS, ENV);

    expect(result).toMatchObject({ error: null, synced: true });
    expect(server.rpcNames()).toEqual(['mazer_ensure_profile']);
    expect(server.insert).not.toHaveBeenCalled();
    expect(server.profileUpdates).toHaveLength(1);
  });

  test('a failed ensure is reported once and later writes do not retry in a loop', async () => {
    const server = createFakeServer({ ensure: { error: { message: 'server unavailable' } } });
    vi.mocked(getLegacyAuthClient).mockResolvedValue(server.client as never);

    const first = await writeLegacyRemoteSettings(SNAPSHOT, LEGACY_DEFAULTS, ENV);
    const second = await writeLegacyRemoteSettings(SNAPSHOT, LEGACY_DEFAULTS, ENV);
    const third = await writeLegacyRemoteSettings(SNAPSHOT, LEGACY_DEFAULTS, ENV);

    expect(first).toMatchObject({ error: 'server unavailable', synced: false });
    expect(second).toMatchObject({ synced: false });
    expect(third).toMatchObject({ synced: false });
    expect(server.rpcNames().filter((name) => name === 'mazer_ensure_profile')).toHaveLength(1);
    expect(server.insert).not.toHaveBeenCalled();
  });
});
