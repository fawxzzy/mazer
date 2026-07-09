import { describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_AI_RUNNER_KEY,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  isLegacyRemoteProgressionEnabled,
  writeLegacyRemoteProgressionState
} from '../../src/legacy-runtime/legacyRemoteProgression';
import { createEmptyLegacyProgressionState } from '../../src/legacy-runtime/legacyProgression';

vi.mock('../../src/legacy-runtime/legacyAuth', () => ({
  getLegacyAuthClient: vi.fn(async () => null)
}));

describe('legacy remote progression', () => {
  test('is disabled by default and only enabled by explicit env opt-in', () => {
    expect(isLegacyRemoteProgressionEnabled({})).toBe(false);
    expect(isLegacyRemoteProgressionEnabled({ [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'false' })).toBe(false);
    expect(isLegacyRemoteProgressionEnabled({ [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: '1' })).toBe(true);
    expect(isLegacyRemoteProgressionEnabled({ [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).toBe(true);
    expect(isLegacyRemoteProgressionEnabled({ [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'on' })).toBe(true);
  });

  test('skips guests and missing clients without disrupting local progression', async () => {
    const state = createEmptyLegacyProgressionState();

    await expect(writeLegacyRemoteProgressionState({
      status: 'guest',
      userId: null
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toEqual({
      error: null,
      skippedReason: 'guest',
      synced: false
    });

    await expect(writeLegacyRemoteProgressionState({
      status: 'authenticated',
      userId: 'user-123'
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toEqual({
      error: null,
      skippedReason: 'missing-client',
      synced: false
    });
  });

  test('uses the Mazer-specific progression table contracts', () => {
    expect(LEGACY_REMOTE_PROGRESSION_TABLE).toBe('mazer_progression_states');
    expect(LEGACY_REMOTE_AI_PROGRESSION_TABLE).toBe('mazer_ai_progression_states');
    expect(LEGACY_REMOTE_AI_RUNNER_KEY).toBe('menu-runner');
  });

  test('syncs player and separate account ai progression summaries when enabled', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    const state = createEmptyLegacyProgressionState();
    state.updatedAt = '2026-07-09T01:00:00.000Z';
    state.tracks.player = {
      ...state.tracks.player,
      completedCycles: 3,
      lastCompletedAt: '2026-07-09T01:00:00.000Z',
      level: 7,
      rank: 'D',
      targetComplexity: 48
    };
    state.tracks['ai-runner'] = {
      ...state.tracks['ai-runner'],
      completedCycles: 9,
      lastCompletedAt: '2026-07-09T01:01:00.000Z',
      level: 5,
      rank: 'E',
      targetComplexity: 36
    };

    await expect(writeLegacyRemoteProgressionState({
      status: 'authenticated',
      userId: 'user-456'
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toEqual({
      error: null,
      skippedReason: null,
      synced: true
    });

    expect(from).toHaveBeenNthCalledWith(1, LEGACY_REMOTE_PROGRESSION_TABLE);
    expect(from).toHaveBeenNthCalledWith(2, LEGACY_REMOTE_AI_PROGRESSION_TABLE);
    expect(upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      player_completed_cycles: 3,
      player_level: 11,
      player_rank: 'C',
      player_target_complexity: 48,
      user_id: 'user-456'
    }), { onConflict: 'user_id' });
    expect(upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      completed_cycles: 9,
      level: 8,
      rank: 'D',
      runner_key: LEGACY_REMOTE_AI_RUNNER_KEY,
      target_complexity: 36,
      user_id: 'user-456'
    }), { onConflict: 'user_id,runner_key' });
  });
});
