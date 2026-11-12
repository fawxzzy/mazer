import { describe, expect, test } from 'vitest';
import type { LegacyLeaderboardEntry, LegacyLeaderboardSelfRank } from '../../src/legacy-runtime/legacyLeaderboard';
import {
  LEGACY_LEADERBOARD_COPY,
  LEGACY_LEADERBOARD_SKELETON_ROWS,
  LEGACY_LEADERBOARD_TOP_N,
  LEGACY_LEADERBOARD_USERNAME_MAX_CHARS,
  buildLegacyLeaderboardViewModel,
  resolveLegacyLeaderboardRankTier,
  resolveLegacyLeaderboardRequest,
  resolveLegacyLeaderboardTierColor,
  resolveLegacyLeaderboardUsernameDisplay,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';

const entry = (rank: number, username: string, level = 100 - rank, own = false): LegacyLeaderboardEntry => ({
  isRequestingUser: own,
  playerLevel: String(level),
  rank: String(rank),
  username
});
const entries = (count: number, ownRank: number | null = null): LegacyLeaderboardEntry[] => (
  Array.from({ length: count }, (_, i) => entry(i + 1, `player${i + 1}`, 500 - i, ownRank === i + 1))
);
const self = (rank: string | null, level = '68', hasUsername = true): LegacyLeaderboardSelfRank => ({
  hasUsername,
  playerLevel: level,
  rank
});

const state = (patch: Partial<LegacyLeaderboardViewState> = {}): LegacyLeaderboardViewState => ({
  entries: entries(3),
  errorMessage: null,
  online: true,
  selfRank: null,
  selfUsername: 'qa-player',
  signedIn: true,
  status: 'ready',
  usernameGate: 'ok',
  ...patch
});

describe('leaderboard view-model: request and vocabulary', () => {
  test('one request for the top N from offset 0 (no pager), within the RPC cap', () => {
    expect(resolveLegacyLeaderboardRequest()).toEqual({ limit: LEGACY_LEADERBOARD_TOP_N, offset: 0 });
    expect(LEGACY_LEADERBOARD_TOP_N).toBeLessThanOrEqual(100);
    expect(LEGACY_LEADERBOARD_TOP_N).toBe(50);
  });

  test('title, exit and columns use the sheet vocabulary: Leaderboard, Back to Menu, RANK | PLAYER | LEVEL', () => {
    const view = buildLegacyLeaderboardViewModel(state());
    expect(view.header.title).toBe('Leaderboard');
    expect(view.exit.label).toBe('Back to Menu');
    expect(view.columns).toEqual({ level: 'LEVEL', player: 'PLAYER', rank: 'RANK' });
    // No Skill wording on a player surface; the pager is gone.
    expect(JSON.stringify(LEGACY_LEADERBOARD_COPY)).not.toMatch(/skill|page|next|previous/i);
  });
});

describe('leaderboard view-model: rows', () => {
  test('caps at the top N and keeps ranks as decimal strings (bigint-safe)', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: entries(80) }));
    expect(view.rows).toHaveLength(LEGACY_LEADERBOARD_TOP_N);
    const huge = buildLegacyLeaderboardViewModel(state({
      entries: [{ isRequestingUser: false, playerLevel: '12345678901234567890', rank: '1', username: 'big' }]
    }));
    expect(huge.rows[0]!.levelText).toBe('12,345,678,901,234,567,890');
  });

  test('the top three get themed emphasis by GLOBAL rank; everyone else is standard', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: entries(5) }));
    expect(view.rows.map((row) => [row.rankText, row.tier, row.emphasized])).toEqual([
      ['1', 'gold', true], ['2', 'cyan', true], ['3', 'mint', true], ['4', 'standard', false], ['5', 'standard', false]
    ]);
    expect(resolveLegacyLeaderboardRankTier('1')).toBe('gold');
    expect(resolveLegacyLeaderboardRankTier('4')).toBe('standard');
    // Colours come from the shared theme material, not medal art.
    expect(resolveLegacyLeaderboardTierColor('gold')).toBe(cyberArcadeMaterial.signal.start);
    expect(resolveLegacyLeaderboardTierColor('cyan')).toBe(cyberArcadeMaterial.rail.cyan);
    expect(resolveLegacyLeaderboardTierColor('mint')).toBe(cyberArcadeMaterial.rail.mint);
  });

  test('the own row is flagged and described for assistive tech', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: entries(5, 2) }));
    expect(view.rows.filter((row) => row.isOwn).map((row) => row.rankText)).toEqual(['2']);
    expect(view.rows[1]!.accessibilityLabel).toBe('Rank 2, player2, level 499, you');
  });

  test('usernames are ellipsis-safe by code point and never split a surrogate pair', () => {
    expect(resolveLegacyLeaderboardUsernameDisplay('short')).toBe('short');
    const long = resolveLegacyLeaderboardUsernameDisplay('averyveryverylongusername');
    expect(Array.from(long)).toHaveLength(LEGACY_LEADERBOARD_USERNAME_MAX_CHARS);
    expect(long.endsWith('…')).toBe(true);
    expect(resolveLegacyLeaderboardUsernameDisplay('😀'.repeat(20), 5)).toBe('😀😀😀😀…');
  });
});

describe('leaderboard view-model: the pinned You row', () => {
  test('a player outside the loaded top N still gets a You row with their rank and level', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: entries(50), selfRank: self('57', '68') }));
    expect(view.selfRow).toMatchObject({ inList: false, label: 'You', levelText: '68', rankText: '57', usernameText: 'qa-player' });
    expect(view.rows.some((row) => row.isOwn)).toBe(false);
  });

  test('a player inside the top N has a You row that repeats the highlighted list row', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: entries(50, 2), selfRank: self('2', '499') }));
    expect(view.selfRow).toMatchObject({ inList: true, rankText: '2', tier: 'cyan' });
  });

  test('no usable self-rank (no username, or a named caller with a null rank) means no You row, never a broken one', () => {
    expect(buildLegacyLeaderboardViewModel(state({ selfRank: self(null, '5', false) })).selfRow).toBeNull();
    expect(buildLegacyLeaderboardViewModel(state({ selfRank: self(null, '5', true) })).selfRow).toBeNull();
    expect(buildLegacyLeaderboardViewModel(state({ selfRank: null })).selfRow).toBeNull();
  });

  test('an unknown saved username falls back to the bare You label', () => {
    const view = buildLegacyLeaderboardViewModel(state({ selfRank: self('9'), selfUsername: '  ' }));
    expect(view.selfRow!.usernameText).toBeNull();
  });
});

describe('leaderboard view-model: designed states (no raw error text)', () => {
  test('loading: skeleton rows, no state block, no columns', () => {
    for (const status of ['idle', 'loading'] as const) {
      const view = buildLegacyLeaderboardViewModel(state({ status }));
      expect(view.phase).toBe('loading');
      expect(view.skeletonRowCount).toBe(LEGACY_LEADERBOARD_SKELETON_ROWS);
      expect(view.rows).toEqual([]);
      expect(view.columns).toBeNull();
    }
  });

  test('empty: heading, one line, no action', () => {
    const view = buildLegacyLeaderboardViewModel(state({ entries: [], status: 'empty' }));
    expect(view.phase).toBe('empty');
    expect(view.state).toMatchObject({ action: null, heading: 'No ranks yet', kind: 'empty' });
  });

  test('every failure maps to designed copy with a Retry; the source string is never shown', () => {
    const cases: Array<[string | null, string]> = [
      ['Could not reach the leaderboard. Check your connection and try again.', 'unreachable'],
      ['The leaderboard is not set up yet.', 'not-set-up'],
      ['The leaderboard is not available right now.', 'error'],
      ['FetchError: relation "mazer.leaderboard" does not exist (PGRST202)', 'error'],
      [null, 'error']
    ];
    for (const [errorMessage, kind] of cases) {
      const view = buildLegacyLeaderboardViewModel(state({ errorMessage, status: 'error' }));
      expect(view.state?.kind).toBe(kind);
      expect(view.state?.action).toEqual({ id: 'retry-page', label: 'Retry' });
      expect(view.rows).toEqual([]);
      if (errorMessage !== null) {
        expect(JSON.stringify(view)).not.toContain(errorMessage);
      }
    }
    expect(buildLegacyLeaderboardViewModel(state({ status: 'unavailable' })).phase).toBe('error');
  });

  test('offline replaces a failed load with the offline state and Retry', () => {
    const view = buildLegacyLeaderboardViewModel(state({ errorMessage: 'x', online: false, status: 'error' }));
    expect(view.phase).toBe('offline');
    expect(view.state).toMatchObject({ action: { id: 'retry-page' }, heading: 'You’re offline', kind: 'offline' });
    // Already-loaded rows are not thrown away by a device that goes offline later.
    expect(buildLegacyLeaderboardViewModel(state({ online: false })).phase).toBe('ready');
  });

  test('signed out comes first and offers Sign in', () => {
    const view = buildLegacyLeaderboardViewModel(state({ signedIn: false, usernameGate: 'needs-username' }));
    expect(view.phase).toBe('signed-out');
    expect(view.state).toMatchObject({ action: { id: 'sign-in', label: 'Sign in' }, kind: 'signed-out' });
  });

  test('username gate: loading is a status line, unavailable retries, needs-username opens the name editor', () => {
    expect(buildLegacyLeaderboardViewModel(state({ usernameGate: 'loading' })).state)
      .toMatchObject({ action: null, heading: null, kind: 'profile-loading' });
    expect(buildLegacyLeaderboardViewModel(state({ usernameGate: 'unavailable' })).state)
      .toMatchObject({ action: { id: 'retry-username' }, kind: 'profile-unavailable' });
    expect(buildLegacyLeaderboardViewModel(state({ usernameGate: 'needs-username' })).state)
      .toMatchObject({ action: { id: 'edit-username', label: 'Edit name' }, kind: 'needs-username' });
    expect(buildLegacyLeaderboardViewModel(state({ usernameGate: 'needs-username' })).phase).toBe('gate');
  });

  test('every state ends as a sentence and carries no technical wording', () => {
    const states = [
      state({ signedIn: false }), state({ usernameGate: 'loading' }), state({ usernameGate: 'unavailable' }),
      state({ usernameGate: 'needs-username' }), state({ entries: [], status: 'empty' }),
      state({ status: 'error' }), state({ online: false, status: 'error' })
    ].map((s) => buildLegacyLeaderboardViewModel(s));
    for (const view of states) {
      expect(view.state).not.toBeNull();
      expect(view.state!.text).toMatch(/[.!?…]$/);
      expect(view.state!.text).not.toMatch(/\b(rpc|supabase|undefined|null|nan|exception)\b/i);
    }
  });
});
