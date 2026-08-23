import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_LEADERBOARD_MAX_PAGE_SIZE,
  fetchLegacyLeaderboardPage,
  fetchLegacyLeaderboardSelfRank
} from '../../src/legacy-runtime/legacyLeaderboard';

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null)
  };
});

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset();
});

describe('fetchLegacyLeaderboardPage', () => {
  test('keeps database ordering numeric while transporting unbounded ranks and levels as text', () => {
    const leaderboardRpc = readFileSync(
      new URL('../../supabase/migrations/20260822000200_mazer_leaderboard_rpc.sql', import.meta.url),
      'utf8'
    );

    expect(leaderboardRpc).toContain('player_level text');
    expect(leaderboardRpc).toContain('ranked.rank_value::text');
    expect(leaderboardRpc).toContain('ranked.player_level::text');
    expect(leaderboardRpc).toContain('base.player_level::text');
    expect(leaderboardRpc).toContain('order by s.player_level desc');
    expect(leaderboardRpc).not.toContain('player_level integer');
  });

  test('reports unavailable when there is no client (feature flag off, misconfigured, or unreachable)', async () => {
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce(null);
    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.entries).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  test('parses a successful page response into typed entries', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { rank: 1, username: 'maze_runner', player_level: 184, is_requesting_user: false },
        { rank: 2, username: 'fawxzzy', player_level: 141, is_requesting_user: true }
      ],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.error).toBeNull();
    expect(result.entries).toEqual([
      { rank: '1', username: 'maze_runner', playerLevel: '184', isRequestingUser: false },
      { rank: '2', username: 'fawxzzy', playerLevel: '141', isRequestingUser: true }
    ]);
  });

  test('preserves leaderboard levels beyond Number.MAX_SAFE_INTEGER as decimal text', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        rank: '9007199254740992',
        username: 'endless_runner',
        player_level: '9007199254740993',
        is_requesting_user: true
      }],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.entries).toEqual([{
      rank: '9007199254740992',
      username: 'endless_runner',
      playerLevel: '9007199254740993',
      isRequestingUser: true
    }]);
  });

  test('maps an RPC-not-deployed-yet error to friendly copy and an empty page', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'function public.mazer_leaderboard_page(integer, integer) does not exist' }
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.error).toBe('The leaderboard is not set up yet.');
    expect(result.entries).toEqual([]);
  });

  test('maps cross-browser network-failure wording to one friendly message', async () => {
    for (const rawMessage of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource']) {
      const rpc = vi.fn(async () => ({ data: null, error: { message: rawMessage } }));
      vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

      const result = await fetchLegacyLeaderboardPage(0);
      expect(result.error).toBe('Could not reach the leaderboard. Check your connection and try again.');
    }
  });

  test('falls back to a generic message for an unrecognized error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'unexpected 500' } }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.error).toBe('The leaderboard is not available right now.');
  });

  test('drops malformed rows instead of throwing', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { rank: 1, username: 'ok', player_level: 5, is_requesting_user: false },
        { rank: 'not-a-number', username: 'broken', player_level: 5, is_requesting_user: false },
        { rank: 2, username: null, player_level: 5, is_requesting_user: false }
      ],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardPage(0);
    expect(result.error).toBeNull();
    expect(result.entries).toEqual([
      { rank: '1', username: 'ok', playerLevel: '5', isRequestingUser: false }
    ]);
  });

  test('clamps the requested page size to the server-enforced maximum', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    await fetchLegacyLeaderboardPage(0, 10_000);
    expect(rpc).toHaveBeenCalledWith('mazer_leaderboard_page', {
      p_limit: LEGACY_LEADERBOARD_MAX_PAGE_SIZE,
      p_offset: 0
    });
  });

  test('never sends a negative offset', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    await fetchLegacyLeaderboardPage(-50);
    expect(rpc).toHaveBeenCalledWith('mazer_leaderboard_page', expect.objectContaining({ p_offset: 0 }));
  });
});

describe('fetchLegacyLeaderboardSelfRank', () => {
  test('reports unavailable when there is no client', async () => {
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce(null);
    const result = await fetchLegacyLeaderboardSelfRank();
    expect(result.selfRank).toBeNull();
    expect(result.error).toBeTruthy();
  });

  test('parses a successful self-rank response for a named user', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ rank: 4213, player_level: 12, has_username: true }],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardSelfRank();
    expect(result.error).toBeNull();
    expect(result.selfRank).toEqual({ rank: '4213', playerLevel: '12', hasUsername: true });
  });

  test('a user with no username yet gets a null-rank response, not a fabricated number', async () => {
    // mazer_leaderboard_self_rank only ranks over the same named-only
    // population mazer_leaderboard_page shows -- a caller without a
    // username genuinely has no rank to report, not "rank 0" (Number(null)
    // would otherwise silently produce that).
    const rpc = vi.fn(async () => ({
      data: [{ rank: null, player_level: 12, has_username: false }],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardSelfRank();
    expect(result.error).toBeNull();
    expect(result.selfRank).toEqual({ rank: null, playerLevel: '12', hasUsername: false });
  });

  test('discards a server response claiming a username but no rank, rather than displaying a broken state', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ rank: null, player_level: 12, has_username: true }],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardSelfRank();
    expect(result.error).toBeNull();
    expect(result.selfRank).toBeNull();
  });

  test('returns a null self-rank without erroring when no progression row exists yet', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);

    const result = await fetchLegacyLeaderboardSelfRank();
    expect(result.error).toBeNull();
    expect(result.selfRank).toBeNull();
  });
});
