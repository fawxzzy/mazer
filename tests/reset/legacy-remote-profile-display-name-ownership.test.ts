import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import { LEGACY_DEFAULTS } from '../../src/legacy-runtime/legacyDefaults';
import {
  createRemoteProfilePayload,
  LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY,
  LEGACY_REMOTE_PROFILE_TABLE,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  writeLegacyRemoteSettings
} from '../../src/legacy-runtime/legacyRemoteProgression';

/**
 * MAZER-ACCT-025: mazer.mazer_profiles.display_name equals the public username
 * and the server is its only writer. The client settings sync is an UPDATE of
 * the existing row and must never send display_name, otherwise the next
 * settings change overwrites a renamed profile with the stale auth name.
 */
vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null)
  };
});

const USER_ID = '25252525-2525-4252-8252-252525252525';
const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };

interface MockProfileRow {
  display_name: string | null;
  revision: number;
  selected_control_mode: string | null;
  settings: Record<string, unknown>;
  username: string;
}

// Minimal stateful mock of the server: a row, the patched mazer_set_username
// RPC (writes username AND display_name) and a direct UPDATE that applies
// exactly the keys the client sends, like PostgREST would.
const createMockServer = (initial: MockProfileRow) => {
  const row = { ...initial };
  const updatePayloads: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe(LEGACY_REMOTE_PROFILE_TABLE);
    return {
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({
            data: {
              revision: row.revision,
              selected_control_mode: row.selected_control_mode,
              settings: row.settings
            },
            error: null
          })
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        const chain = {
          eq: (column: string, value: unknown) => {
            if (column === 'revision' && value !== row.revision) {
              matched = false;
            }
            return chain;
          },
          select: () => chain,
          maybeSingle: async () => {
            if (!matched) {
              return { data: null, error: null };
            }
            Object.assign(row, payload);
            return { data: { revision: row.revision }, error: null };
          }
        };
        let matched = true;
        return chain;
      }
    };
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe('mazer_set_username');
    row.username = String(args.candidate ?? args.p_username);
    row.display_name = row.username;
    return { data: row.username, error: null };
  });
  return { from, row, rpc, updatePayloads };
};

// writeLegacyRemoteSettings reads the known settings revision from the
// per-user sync metadata in window.localStorage, so the tests stub both.
const stubSyncedDevice = (settingsRevision: number) => {
  const values = new Map<string, string>([[
    `${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:${USER_ID}`,
    JSON.stringify({
      progressionRevision: null,
      progressionUpdatedAt: null,
      settingsFingerprint: null,
      settingsRevision
    })
  ]]);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    }
  });
};

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset().mockResolvedValue(null);
  vi.unstubAllGlobals();
});

describe('profile display name is server-owned (MAZER-ACCT-025)', () => {
  test('the update payload carries settings and revision but no display_name key', () => {
    const payload = createRemoteProfilePayload({ userId: USER_ID }, LEGACY_DEFAULTS, 4);

    expect(Object.keys(payload)).not.toContain('display_name');
    expect(payload).toMatchObject({
      revision: 4,
      selected_control_mode: LEGACY_DEFAULTS.controlMode,
      user_id: USER_ID
    });
    expect(payload.settings).toBeTypeOf('object');
    expect(payload.updated_at).toBeTypeOf('string');
  });

  test('ignores a stale snapshot display name even if one is passed at runtime', () => {
    const payload = createRemoteProfilePayload(
      { displayName: 'Old Auth Name', userId: USER_ID } as { userId: string },
      LEGACY_DEFAULTS,
      1
    );

    expect(JSON.stringify(payload)).not.toContain('Old Auth Name');
    expect('display_name' in payload).toBe(false);
  });

  test('a rename followed by a settings sync leaves display_name alone', async () => {
    const server = createMockServer({
      display_name: 'OldName',
      revision: 3,
      selected_control_mode: 'arrows',
      settings: {},
      username: 'OldName'
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValue(
      { from: server.from, rpc: server.rpc } as never
    );
    stubSyncedDevice(3);
    // Auth user_metadata still holds the pre-rename name, as in production.
    const staleSnapshot = {
      displayName: 'OldName',
      status: 'authenticated' as const,
      userId: USER_ID
    };

    await server.rpc('mazer_set_username', { candidate: 'NewName' });
    expect(server.row.display_name).toBe('NewName');

    const result = await writeLegacyRemoteSettings(staleSnapshot, LEGACY_DEFAULTS, env);

    expect(result.error).toBeNull();
    expect(result.synced).toBe(true);
    expect(server.updatePayloads).toHaveLength(1);
    expect(Object.keys(server.updatePayloads[0]!)).not.toContain('display_name');
    expect(server.row.display_name).toBe('NewName');
    expect(server.row.username).toBe('NewName');
    expect(server.row.revision).toBe(4);
  });

  test('every settings sync keeps the optimistic revision check', async () => {
    const server = createMockServer({
      display_name: 'Kept',
      revision: 7,
      selected_control_mode: 'arrows',
      settings: {},
      username: 'Kept'
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValue(
      { from: server.from, rpc: server.rpc } as never
    );
    stubSyncedDevice(7);

    await writeLegacyRemoteSettings(
      { displayName: 'Anything', status: 'authenticated', userId: USER_ID },
      { ...LEGACY_DEFAULTS, controlMode: 'swipe' as typeof LEGACY_DEFAULTS.controlMode },
      env
    );

    expect(server.updatePayloads[0]).toMatchObject({ revision: 8 });
    expect(server.row.display_name).toBe('Kept');
  });
});
