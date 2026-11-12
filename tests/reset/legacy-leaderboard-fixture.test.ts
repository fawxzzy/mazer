import { describe, expect, test } from 'vitest';
import {
  LEGACY_LEADERBOARD_FIXTURE_SHAPES,
  LEGACY_LEADERBOARD_FIXTURE_TOP_N,
  buildLegacyLeaderboardFixtureData,
  readLegacyLeaderboardFixtureShape,
  resolveLegacyLeaderboardFixtureShape
} from '../../src/legacy-runtime/legacyLeaderboardFixture';
import { isLegacyRuntimeDiagnosticsAuthFixtureRoute } from '../../src/legacy-runtime/legacyRemoteProgression';
import { LEGACY_LEADERBOARD_TOP_N } from '../../src/legacy-runtime/legacyLeaderboardView';

describe('leaderboard dev/test fixture seed', () => {
  test('is reachable only through the runtime-diagnostics authenticated fixture route', () => {
    const q = '?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=rank57';
    expect(resolveLegacyLeaderboardFixtureShape(q)).toBe('rank57');
    // Same two gates as the auth fixture itself: the helpers agree.
    expect(isLegacyRuntimeDiagnosticsAuthFixtureRoute(q)).toBe(true);
    for (const search of [
      '', '?leaderboardFixture=rank57', '?runtimeDiagnostics=1&leaderboardFixture=rank57',
      '?authFixture=authenticated&leaderboardFixture=rank57',
      '?runtimeDiagnostics=0&authFixture=authenticated&leaderboardFixture=rank57',
      '?runtimeDiagnostics=1&authFixture=guest&leaderboardFixture=rank57',
      '?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=bogus',
      '?runtimeDiagnostics=1&authFixture=authenticated'
    ]) {
      expect(resolveLegacyLeaderboardFixtureShape(search), search).toBeNull();
    }
    expect(resolveLegacyLeaderboardFixtureShape(null)).toBeNull();
    // No window (SSR / unit tests / workers): off.
    expect(readLegacyLeaderboardFixtureShape()).toBeNull();
  });

  test('knows exactly the documented shapes', () => {
    expect([...LEGACY_LEADERBOARD_FIXTURE_SHAPES]).toEqual(['top3', 'rank57', 'unranked', 'empty', 'loading', 'error', 'offline', 'signed-out']);
  });

  test('top3 puts you at rank 2 inside the loaded rows; rank57 leaves you outside them', () => {
    expect(LEGACY_LEADERBOARD_FIXTURE_TOP_N).toBe(LEGACY_LEADERBOARD_TOP_N);
    const top3 = buildLegacyLeaderboardFixtureData('top3');
    expect(top3.entries).toHaveLength(50);
    expect(top3.entries.filter((e) => e.isRequestingUser).map((e) => e.rank)).toEqual(['2']);
    expect(top3.selfRank).toEqual({ hasUsername: true, playerLevel: top3.entries[1]!.playerLevel, rank: '2' });
    const far = buildLegacyLeaderboardFixtureData('rank57');
    expect(far.entries).toHaveLength(50);
    expect(far.entries.some((e) => e.isRequestingUser)).toBe(false);
    expect(far.selfRank).toMatchObject({ hasUsername: true, rank: '57' });
    const levels = far.entries.map((e) => Number(e.playerLevel));
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
    const unranked = buildLegacyLeaderboardFixtureData('unranked');
    expect(unranked.entries).toHaveLength(50);
    expect(unranked.selfRank).toBeNull();
    expect(buildLegacyLeaderboardFixtureData('empty')).toEqual({ entries: [], selfRank: null });
  });
});
