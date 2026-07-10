import { describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_AI_RUNNER_KEY,
  LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  isLegacyRemoteProgressionEnabled,
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteProgressionState
} from '../../src/legacy-runtime/legacyRemoteProgression';
import { createEmptyLegacyProgressionState } from '../../src/legacy-runtime/legacyProgression';
import { LEGACY_REMOTE_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';

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
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toMatchObject({
      error: null,
      playerMessage: {
        copy: LEGACY_REMOTE_MESSAGE_COPY.guest,
        id: 'remote.progression.guest',
        source: 'progression',
        tone: 'info'
      },
      skippedReason: 'guest',
      synced: false
    });

    await expect(writeLegacyRemoteProgressionState({
      status: 'authenticated',
      userId: 'user-123'
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toMatchObject({
      error: null,
      playerMessage: {
        copy: LEGACY_REMOTE_MESSAGE_COPY.missingClient,
        id: 'remote.progression.missing-client',
        source: 'progression',
        tone: 'warning'
      },
      skippedReason: 'missing-client',
      synced: false
    });
  });

  test('uses the Mazer-specific progression table contracts', () => {
    expect(LEGACY_REMOTE_PROGRESSION_TABLE).toBe('mazer_progression_states');
    expect(LEGACY_REMOTE_AI_PROGRESSION_TABLE).toBe('mazer_ai_progression_states');
    expect(LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE).toBe('mazer_cycle_receipts');
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
      playerMessage: null,
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

  test('syncs compact completed-cycle receipts when enabled and authenticated', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    await expect(writeLegacyRemoteCycleReceipt({
      status: 'authenticated',
      userId: 'user-789'
    }, {
      id: 'cycle-1',
      aiDecisionSummary: {
        backtrackCount: 2,
        decisionCount: 12,
        optionalRetargetCount: 1,
        recoveryCount: 1,
        thinkingModel: 'human-local-memory',
        visitedUndoCount: 3,
        wrongBranchCount: 1
      },
      averageFrameMs: 12.3,
      backtracks: 2,
      completedAt: '2026-07-09T02:00:00.000Z',
      completionTimeMs: 4321,
      controlMode: 'stick',
      goal: { x: 9, y: 10 },
      mazeComplexity: {
        checkpointScore: 0,
        deadEndCount: 4,
        deadEndPressureScore: 2.88,
        edgeWrapCount: 2,
        edgeWrapReliefScore: 0,
        edgeWrapScore: 4.8,
        fillQualityScore: 8.5,
        floorScore: 7,
        routeScore: 18,
        shortcutScore: 4,
        sizeScore: 22.88,
        solutionScore: 12,
        splitCount: 9,
        splitScore: 7.02,
        total: 87,
        weightedDeadEndPressureScore: 0.8,
        weightedSplitPressureScore: 1.4
      },
      mazeSeed: 347,
      mazeSize: 44,
      playerPath: Array.from({ length: 16 }, (_, index) => ({ x: index, y: index + 1 })),
      playerPathLength: 16,
      playerPathTruncated: false,
      renderSafetyPenaltyScore: 0,
      resetUsed: false,
      routeQuality: 'multi-route',
      routeEfficiencyPressureScore: 12.5,
      start: { x: 1, y: 2 },
      surface: 'menu-demo',
      wrongTurns: 1
    }, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toEqual({
      error: null,
      playerMessage: null,
      skippedReason: null,
      synced: true
    });

    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      average_frame_ms: 12.3,
      backtracks: 2,
      completion_time_ms: 4321,
      control_mode: 'stick',
      maze_seed: 347,
      maze_size: 44,
      path_length: 16,
      route_quality: 'multi-route',
      surface: 'menu-demo',
      user_id: 'user-789',
      wrong_turns: 1
    }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      receipt: expect.objectContaining({
        aiDecisionScore: expect.objectContaining({
          pressureScore: expect.any(Number),
          reliabilityScore: expect.any(Number),
          signal: 'chaotic'
        }),
        aiDecisionSummary: expect.objectContaining({ thinkingModel: 'human-local-memory' }),
        mazeComplexity: expect.objectContaining({
          edgeWrapCount: 2,
          edgeWrapReliefScore: 0,
          splitCount: 9,
          total: 87
        }),
        playerPathLength: 16,
        playerPathPreview: expect.arrayContaining([{ x: 15, y: 16 }]),
        renderSafetyPenaltyScore: 0,
        routeEfficiencyPressureScore: 12.5
      })
    }));
  });

  test('returns player-safe retry messages when remote writes fail', async () => {
    const insert = vi.fn(async () => ({ error: { message: 'rls denied' } }));
    const from = vi.fn(() => ({ insert }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    await expect(writeLegacyRemoteCycleReceipt({
      status: 'authenticated',
      userId: 'user-789'
    }, {
      id: 'cycle-2',
      aiDecisionSummary: null,
      averageFrameMs: 18,
      backtracks: 0,
      completedAt: '2026-07-09T02:05:00.000Z',
      completionTimeMs: 1200,
      controlMode: 'arrows',
      goal: { x: 4, y: 4 },
      mazeComplexity: null,
      mazeSeed: 1,
      mazeSize: 12,
      playerPath: [{ x: 1, y: 1 }],
      playerPathLength: 1,
      playerPathTruncated: false,
      renderSafetyPenaltyScore: 66.667,
      resetUsed: false,
      routeQuality: 'direct',
      routeEfficiencyPressureScore: 0,
      start: { x: 1, y: 1 },
      surface: 'play',
      wrongTurns: 0
    }, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toMatchObject({
      error: 'rls denied',
      playerMessage: {
        copy: LEGACY_REMOTE_MESSAGE_COPY.cycleReceiptFailed,
        id: 'remote.cycle-receipt.failed',
        source: 'progression',
        technicalDetail: 'rls denied',
        tone: 'warning'
      },
      skippedReason: null,
      synced: false
    });
  });
});
