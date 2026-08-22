import { getLegacyAuthClient } from './legacyAuth';

// Mirrors checkLegacyUsernameAvailable's exact pattern: both RPCs
// (mazer_leaderboard_page, mazer_leaderboard_self_rank -- see
// supabase/migrations/20260822000200_mazer_leaderboard_rpc.sql) are
// SECURITY DEFINER functions that bypass RLS internally but only ever
// return rank/username/level, never anything private. This module is safe
// to call as soon as those migrations are actually applied to the live
// database -- until then every call below resolves to the 'unavailable'
// error shape, the same graceful fallback every other remote call in this
// codebase already uses when the client or a table/function isn't reachable.

export const LEGACY_LEADERBOARD_PAGE_SIZE = 25;
export const LEGACY_LEADERBOARD_MAX_PAGE_SIZE = 100;

export interface LegacyLeaderboardEntry {
  readonly isRequestingUser: boolean;
  readonly playerLevel: number;
  readonly rank: number;
  readonly username: string;
}

export interface LegacyLeaderboardPageResult {
  readonly entries: readonly LegacyLeaderboardEntry[];
  readonly error: string | null;
}

export interface LegacyLeaderboardSelfRank {
  readonly hasUsername: boolean;
  readonly playerLevel: number;
  readonly rank: number;
}

export interface LegacyLeaderboardSelfRankResult {
  readonly error: string | null;
  readonly selfRank: LegacyLeaderboardSelfRank | null;
}

const resolveLegacyLeaderboardUnavailableMessage = (): string => (
  'The leaderboard is not available right now.'
);

const parseLegacyLeaderboardRow = (row: unknown): LegacyLeaderboardEntry | null => {
  if (row === null || typeof row !== 'object') {
    return null;
  }

  const candidate = row as Record<string, unknown>;
  const rank = typeof candidate.rank === 'number' ? candidate.rank : Number(candidate.rank);
  const playerLevel = typeof candidate.player_level === 'number'
    ? candidate.player_level
    : Number(candidate.player_level);
  const username = typeof candidate.username === 'string' ? candidate.username : null;

  if (!Number.isFinite(rank) || !Number.isFinite(playerLevel) || username === null) {
    return null;
  }

  return {
    isRequestingUser: candidate.is_requesting_user === true,
    playerLevel,
    rank,
    username
  };
};

export const fetchLegacyLeaderboardPage = async (
  offset: number,
  limit: number = LEGACY_LEADERBOARD_PAGE_SIZE
): Promise<LegacyLeaderboardPageResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return { entries: [], error: resolveLegacyLeaderboardUnavailableMessage() };
  }

  const boundedLimit = Math.min(LEGACY_LEADERBOARD_MAX_PAGE_SIZE, Math.max(1, Math.round(limit)));
  const boundedOffset = Math.max(0, Math.round(offset));

  const { data, error } = await client.rpc('mazer_leaderboard_page', {
    p_limit: boundedLimit,
    p_offset: boundedOffset
  });

  if (error) {
    return { entries: [], error: error.message };
  }

  const rows = Array.isArray(data) ? data : [];
  const entries = rows
    .map((row) => parseLegacyLeaderboardRow(row))
    .filter((entry): entry is LegacyLeaderboardEntry => entry !== null);

  return { entries, error: null };
};

export const fetchLegacyLeaderboardSelfRank = async (): Promise<LegacyLeaderboardSelfRankResult> => {
  const client = await getLegacyAuthClient();
  if (!client) {
    return { error: resolveLegacyLeaderboardUnavailableMessage(), selfRank: null };
  }

  const { data, error } = await client.rpc('mazer_leaderboard_self_rank');
  if (error) {
    return { error: error.message, selfRank: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || typeof row !== 'object') {
    return { error: null, selfRank: null };
  }

  const candidate = row as Record<string, unknown>;
  const rank = typeof candidate.rank === 'number' ? candidate.rank : Number(candidate.rank);
  const playerLevel = typeof candidate.player_level === 'number'
    ? candidate.player_level
    : Number(candidate.player_level);

  if (!Number.isFinite(rank) || !Number.isFinite(playerLevel)) {
    return { error: null, selfRank: null };
  }

  return {
    error: null,
    selfRank: {
      hasUsername: candidate.has_username === true,
      playerLevel,
      rank
    }
  };
};
