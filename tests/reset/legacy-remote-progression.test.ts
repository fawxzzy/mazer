import { describe, expect, test, vi } from 'vitest';
import {
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

  test('uses the Mazer-specific progression table contract', () => {
    expect(LEGACY_REMOTE_PROGRESSION_TABLE).toBe('mazer_progression_states');
  });
});
