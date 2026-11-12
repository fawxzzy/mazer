/**
 * DEV / TEST-ONLY seed data for the Leaderboard sheet.
 *
 * The runtime-diagnostics authenticated fixture is provider-inert: both
 * leaderboard RPC wrappers short-circuit for it and used to return an empty
 * board, so a populated leaderboard could never be screenshotted or asserted
 * in a real browser. This module supplies deterministic rows for that one
 * path only.
 *
 * Enabled ONLY when the URL carries all of
 *   ?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=<shape>
 * and the caller is the fixture identity (the wrappers check the snapshot
 * first). A normal player's URL has none of these, a real account never takes
 * the fixture branch, and nothing here calls the network or touches storage,
 * so it cannot ship "on": there is no build flag to leave enabled, and
 * tests/reset/legacy-leaderboard-fixture.test.ts pins both gates.
 *
 * Shapes:
 *   top3      you are rank 2 of the loaded top 50
 *   rank57    you are rank 57, outside the loaded top 50 (pinned You row only)
 *   unranked  a named player with no rank yet (MAZER-ACCT-022): a loaded board, pinned You row with dashes
 *   empty     nobody has a public rank yet (also the default for the fixture)
 *   loading   the page request never resolves
 *   error     the page request fails with the generic friendly error
 *   offline   the page request fails and the sheet treats the device as offline
 *   signed-out  the sheet renders its signed-out state
 */
import type { LegacyLeaderboardEntry, LegacyLeaderboardSelfRank } from './legacyLeaderboard';

export const LEGACY_LEADERBOARD_FIXTURE_SHAPES = [
  'top3',
  'rank57',
  'unranked',
  'empty',
  'loading',
  'error',
  'offline',
  'signed-out'
] as const;

export type LegacyLeaderboardFixtureShape = (typeof LEGACY_LEADERBOARD_FIXTURE_SHAPES)[number];

export const LEGACY_LEADERBOARD_FIXTURE_USERNAME = 'qa-player';

const isTruthyFlag = (value: string | null): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

/**
 * The shape requested by the URL, or null. Requires the same two flags as the
 * authenticated diagnostics fixture route so it can never be reached from a
 * plain URL.
 */
export const resolveLegacyLeaderboardFixtureShape = (
  search: string | null | undefined
): LegacyLeaderboardFixtureShape | null => {
  if (typeof search !== 'string' || search.length === 0) {
    return null;
  }
  const params = new URLSearchParams(search);
  if (
    !isTruthyFlag(params.get('runtimeDiagnostics'))
    || params.get('authFixture')?.trim().toLowerCase() !== 'authenticated'
  ) {
    return null;
  }
  const requested = params.get('leaderboardFixture')?.trim().toLowerCase();
  return LEGACY_LEADERBOARD_FIXTURE_SHAPES.find((shape) => shape === requested) ?? null;
};

export const readLegacyLeaderboardFixtureShape = (): LegacyLeaderboardFixtureShape | null => (
  typeof window === 'undefined' ? null : resolveLegacyLeaderboardFixtureShape(window.location.search)
);

const FIXTURE_NAMES: readonly string[] = [
  'nova', 'orbit-ace', 'kestrel', 'pixelpilot', 'mazewalker', 'zephyr', 'glitchfox', 'lumen',
  'sparkplug', 'quietstorm', 'tessera', 'ghostline', 'driftwood', 'halcyon', 'bytewise', 'echo-park',
  'fathom', 'sundial', 'rookie-one', 'cobalt', 'ember', 'wanderer', 'nimbus', 'tidepool',
  'obsidian', 'marlow', 'vector9', 'plum', 'harbor', 'zigzag', 'iris', 'cascade',
  'northwind', 'pebble', 'flux', 'juniper', 'saffron', 'arcade-ant', 'mosaic', 'tundra',
  'velvet', 'quasar', 'bramble', 'solstice', 'copperfield', 'lattice', 'moth', 'ridgeline',
  'skylark', 'dune', 'wisp', 'cinder', 'topaz', 'latchkey', 'ferris', 'mintleaf'
];

const fixtureLevelForRank = (rank: number): string => String(Math.max(1, 262 - Math.round(rank * 3.4)));

export const LEGACY_LEADERBOARD_FIXTURE_TOP_N = 50;

const buildFixtureEntries = (ownRank: number | null): LegacyLeaderboardEntry[] => (
  Array.from({ length: LEGACY_LEADERBOARD_FIXTURE_TOP_N }, (_, index) => {
    const rank = index + 1;
    const isOwn = ownRank === rank;
    return {
      isRequestingUser: isOwn,
      playerLevel: fixtureLevelForRank(rank),
      rank: String(rank),
      username: isOwn ? LEGACY_LEADERBOARD_FIXTURE_USERNAME : (FIXTURE_NAMES[index] ?? `player-${rank}`)
    };
  })
);

export interface LegacyLeaderboardFixtureData {
  readonly entries: readonly LegacyLeaderboardEntry[];
  readonly selfRank: LegacyLeaderboardSelfRank | null;
}

export const buildLegacyLeaderboardFixtureData = (
  shape: LegacyLeaderboardFixtureShape
): LegacyLeaderboardFixtureData => {
  switch (shape) {
    case 'top3':
      return {
        entries: buildFixtureEntries(2),
        selfRank: { hasUsername: true, playerLevel: fixtureLevelForRank(2), rank: '2' }
      };
    case 'rank57':
      return {
        entries: buildFixtureEntries(null),
        selfRank: { hasUsername: true, playerLevel: fixtureLevelForRank(57), rank: '57' }
      };
    case 'unranked':
      return { entries: buildFixtureEntries(null), selfRank: null };
    default:
      return { entries: [], selfRank: null };
  }
};
