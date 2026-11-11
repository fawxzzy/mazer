import { describe, expect, test } from 'vitest';
import {
  LEGACY_LEADERBOARD_SKELETON_ROWS,
  buildLegacyLeaderboardViewModel,
  type LegacyLeaderboardStateKind,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';

// MAZER-UI-017 acceptance pin: every non-populated leaderboard state is designed
// (heading + one line, or a status line), offers a clear way forward (its own
// action, or the always-present Back to Menu exit), and never shows raw error text.

const base: LegacyLeaderboardViewState = {
  entries: [],
  errorMessage: null,
  online: true,
  selfRank: null,
  selfUsername: 'qa-player',
  signedIn: true,
  status: 'ready',
  usernameGate: 'ok'
};

const CASES: ReadonlyArray<readonly [LegacyLeaderboardStateKind, Partial<LegacyLeaderboardViewState>]> = [
  ['empty', { status: 'empty' }],
  ['error', { errorMessage: 'permission denied for function', status: 'error' }],
  ['unreachable', { errorMessage: 'Could not reach the leaderboard. Check your connection and try again.', status: 'error' }],
  ['not-set-up', { errorMessage: 'The leaderboard is not set up yet.', status: 'error' }],
  ['offline', { online: false, status: 'error' }],
  ['signed-out', { signedIn: false }],
  ['needs-username', { usernameGate: 'needs-username' }],
  ['profile-unavailable', { usernameGate: 'unavailable' }],
  ['profile-loading', { usernameGate: 'loading' }]
];

describe('leaderboard non-populated states (MAZER-UI-017)', () => {
  test.each(CASES)('%s is designed, has a way forward and shows no raw error text', (kind, patch) => {
    const view = buildLegacyLeaderboardViewModel({ ...base, ...patch });
    expect(view.state?.kind).toBe(kind);
    expect(view.state?.text.length).toBeGreaterThan(0);
    if (kind !== 'profile-loading') {
      expect(view.state?.heading?.length).toBeGreaterThan(0);
    }
    expect(view.exit.label).toBe('Back to Menu');
    // Failures and gates carry their own action; empty and transient states rely on the exit.
    if (!['empty', 'profile-loading'].includes(kind)) {
      expect(view.state?.action?.label.length).toBeGreaterThan(0);
    }
    const shown = `${view.state?.heading ?? ''} ${view.state?.text ?? ''}`;
    expect(shown).not.toMatch(/permission denied|failed to fetch|load failed|pgrst|does not exist|rpc/i);
    expect(view.rows).toHaveLength(0);
  });

  test('loading is a skeleton plus status line with no state block', () => {
    const view = buildLegacyLeaderboardViewModel({ ...base, status: 'loading' });
    expect(view.phase).toBe('loading');
    expect(view.skeletonRowCount).toBe(LEGACY_LEADERBOARD_SKELETON_ROWS);
    expect(view.state).toBeNull();
  });
});
