import { describe, expect, test, vi } from 'vitest';
import {
  getLegacyAuthClient,
  readLegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';
import {
  bootstrapLegacyRemoteAccountState,
  hydrateLegacyRemoteAccountState,
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_AI_RUNNER_KEY,
  LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  LEGACY_REMOTE_PROFILE_TABLE,
  isLegacyRemoteProgressionEnabled,
  mergeLegacyProgressionStateAdvancements,
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteProgressionState
} from '../../src/legacy-runtime/legacyRemoteProgression';
import { createEmptyLegacyProgressionState } from '../../src/legacy-runtime/legacyProgression';
import { LEGACY_REMOTE_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';
import { scoreMazeCycleRunQuality } from '../../src/legacy-runtime/mazeCycleRunQualityScorer.mjs';

const storedRunQualityScore = scoreMazeCycleRunQuality({
  aiDecisionSummary: {
    backtrackCount: 2,
    decisionCount: 12,
    optionalRetargetCount: 1,
    recoveryCount: 1,
    visitedUndoCount: 3,
    wrongBranchCount: 1
  },
  averageFrameMs: 12.3,
  backtracks: 2,
  completionTimeMs: 4321,
  complexity: 87,
  playerPathLength: 16,
  resetUsed: false,
  shortestViablePathLength: 14,
  surface: 'menu-demo',
  wrongTurns: 1
});

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null),
    readLegacyAuthSessionSnapshot: vi.fn(async () => actual.createLegacyGuestAuthSnapshot())
  };
});

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
    expect(LEGACY_REMOTE_PROFILE_TABLE).toBe('mazer_profiles');
    expect(LEGACY_REMOTE_AI_RUNNER_KEY).toBe('menu-runner');
  });

  test('syncs player and separate account ai progression summaries when enabled', async () => {
    const state = createEmptyLegacyProgressionState();
    state.updatedAt = '2026-07-09T01:00:00.000Z';
    state.tracks.player = {
      ...state.tracks.player,
      completedCycles: 10,
      lastCompletedAt: '2026-07-09T01:00:00.000Z',
      level: 10,
      rank: 'C',
      targetComplexity: 47
    };
    state.tracks['ai-runner'] = {
      ...state.tracks['ai-runner'],
      completedCycles: 9,
      lastCompletedAt: '2026-07-09T01:01:00.000Z',
      level: 5,
      rank: 'E',
      targetComplexity: 36
    };

    const updatePayloads: Array<Record<string, unknown>> = [];
    const aiUpsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === LEGACY_REMOTE_AI_PROGRESSION_TABLE) {
        return { upsert: aiUpsert };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { revision: 4, state: createEmptyLegacyProgressionState() },
              error: null
            })
          })
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { revision: 5 }, error: null })
                })
              })
            })
          };
        }
      };
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

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
    expect(from).toHaveBeenNthCalledWith(2, LEGACY_REMOTE_PROGRESSION_TABLE);
    expect(from).toHaveBeenNthCalledWith(3, LEGACY_REMOTE_AI_PROGRESSION_TABLE);
    expect(updatePayloads[0]).toEqual(expect.objectContaining({
      player_completed_cycles: 10,
      player_level: 10,
      player_rank: 'C',
      player_target_complexity: 47,
      revision: 5,
      user_id: 'user-456'
    }));
    expect(aiUpsert).toHaveBeenCalledWith(expect.objectContaining({
      completed_cycles: 9,
      level: 8,
      rank: 'D',
      runner_key: LEGACY_REMOTE_AI_RUNNER_KEY,
      target_complexity: 36,
      user_id: 'user-456'
    }), { onConflict: 'user_id,runner_key' });
  });

  test('merges first-contact device progress without lowering a newer canonical track', () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-07-16T12:00:00.000Z';
    remote.tracks.player.completedCycles = 11;
    remote.tracks.player.targetComplexity = 50;
    const local = createEmptyLegacyProgressionState();
    local.updatedAt = '2026-07-16T13:00:00.000Z';
    local.tracks.player.completedCycles = 3;
    local.tracks['ai-runner'].completedCycles = 18;
    local.tracks['ai-runner'].targetComplexity = 64;

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player.completedCycles).toBe(11);
    expect(merged.tracks.player.targetComplexity).toBe(50);
    expect(merged.tracks['ai-runner'].completedCycles).toBe(18);
    expect(merged.tracks['ai-runner'].targetComplexity).toBe(64);
    expect(merged.updatedAt).toBe('2026-07-16T13:00:00.000Z');
  });

  test('never lets a stale higher completion count lower either visible progression track', () => {
    const remote = createEmptyLegacyProgressionState();
    const local = createEmptyLegacyProgressionState();
    const levelTwentyEightTarget = 8 + (27 * 4);
    const levelThirtyTwoTarget = 8 + (31 * 4);

    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: 40,
      targetComplexity: levelTwentyEightTarget
    };
    remote.tracks['ai-runner'] = {
      ...remote.tracks['ai-runner'],
      completedCycles: 40,
      targetComplexity: levelTwentyEightTarget
    };
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: 39,
      targetComplexity: levelThirtyTwoTarget
    };
    local.tracks['ai-runner'] = {
      ...local.tracks['ai-runner'],
      completedCycles: 39,
      targetComplexity: levelThirtyTwoTarget
    };

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player).toMatchObject({
      completedCycles: 39,
      level: 32,
      targetComplexity: levelThirtyTwoTarget
    });
    expect(merged.tracks['ai-runner']).toMatchObject({
      completedCycles: 39,
      level: 32,
      targetComplexity: levelThirtyTwoTarget
    });
  });

  test('hydrates canonical progression and settings into account-scoped storage before scene creation', async () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-07-16T14:00:00.000Z';
    remote.tracks.player.completedCycles = 11;
    remote.tracks.player.targetComplexity = 50;
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === LEGACY_REMOTE_PROGRESSION_TABLE
            ? { data: { revision: 3, state: remote }, error: null }
            : { data: { revision: 7, settings: { controlMode: 'arrows', movementSpeed: 0.65 } }, error: null }
        })
      })
    }));
    vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValueOnce({
      configured: true,
      displayName: 'Player',
      email: 'player@example.test',
      error: null,
      info: null,
      status: 'authenticated',
      userId: 'user-hydrate'
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    const result = await bootstrapLegacyRemoteAccountState(
      storage,
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }
    );

    expect(result.error).toBeNull();
    expect(result.progressionState?.tracks.player.completedCycles).toBe(11);
    expect(result.progressionState?.tracks.player.targetComplexity).toBe(50);
    expect(result.settings?.controlMode).toBe('arrows');
    expect(result.settings?.movementSpeed).toBe(0.65);
    expect(values.has('mazer.progression.v1:user:user-hydrate')).toBe(true);
    expect(values.has('mazer.game-toggles.v1:user:user-hydrate')).toBe(true);
    expect(values.has('mazer.remote-account-sync.v1:user:user-hydrate')).toBe(true);
  });

  test('reloads the selected account after sign-in, still ignoring guest progress entirely', async () => {
    // Remote is the more-advanced side here -- a genuinely fresh sign-in
    // (or this device's own local copy for this account is behind) should
    // present the real account's remote progress, not the unrelated guest
    // session sitting under a completely different storage key.
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-16T18:00:00.000Z';
    remote.tracks.player.completedCycles = 11;
    remote.tracks.player.targetComplexity = 50;
    const guest = createEmptyLegacyProgressionState();
    guest.updatedAt = '2026-08-16T18:10:00.000Z';
    guest.tracks.player.completedCycles = 21;
    guest.tracks.player.targetComplexity = 72;
    const values = new Map<string, string>([
      ['mazer.progression.v1:guest', JSON.stringify(guest)]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === LEGACY_REMOTE_PROGRESSION_TABLE
            ? { data: { revision: 8, state: remote }, error: null }
            : { data: { revision: 3, selected_control_mode: 'arrows', settings: { movementSpeed: 0.65 } }, error: null }
        })
      })
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    const result = await hydrateLegacyRemoteAccountState({
      configured: true,
      displayName: 'Player',
      email: 'player@example.test',
      error: null,
      info: null,
      status: 'authenticated',
      userId: 'user-refresh'
    }, storage, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' });

    expect(result.error).toBeNull();
    // Remote (11), not the guest session's 21 -- the guest key is never
    // even read for this account-scoped storage key.
    expect(result.progressionState?.tracks.player.completedCycles).toBe(11);
    expect(result.settings?.controlMode).toBe('arrows');
    expect(result.settings?.movementSpeed).toBe(0.65);
    expect(from).toHaveBeenCalledTimes(2);
    expect(JSON.parse(values.get('mazer.progression.v1:user:user-refresh') ?? '{}')).toEqual(
      expect.objectContaining({ tracks: expect.any(Object) })
    );
  });

  test('never regresses this same account own more-advanced local progress on a hydrate (boot-race protection)', async () => {
    // hydrateLegacyRemoteAccountState's caller (applyLegacyAuthSnapshot's
    // "account changed" branch) can fire not just on a genuine fresh
    // sign-in but also if bootstrapLegacyRemoteAccountState itself hiccups
    // on a cold boot -- if this device's own local copy for THIS account is
    // already ahead of a possibly-stale remote read, hydrate must not
    // silently regress it. This is the exact "reads as reset after a fresh
    // load" symptom the merge here protects against.
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-16T18:00:00.000Z';
    remote.tracks.player.completedCycles = 9;
    remote.tracks.player.targetComplexity = 44;
    const local = createEmptyLegacyProgressionState();
    local.updatedAt = '2026-08-21T08:19:24.915Z';
    local.tracks.player.completedCycles = 11;
    local.tracks.player.targetComplexity = 50;
    const values = new Map<string, string>([
      ['mazer.progression.v1:user:user-refresh', JSON.stringify(local)]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === LEGACY_REMOTE_PROGRESSION_TABLE
            ? { data: { revision: 8, state: remote }, error: null }
            : { data: null, error: null }
        })
      })
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    const result = await hydrateLegacyRemoteAccountState({
      configured: true,
      displayName: 'Player',
      email: 'player@example.test',
      error: null,
      info: null,
      status: 'authenticated',
      userId: 'user-refresh'
    }, storage, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' });

    expect(result.error).toBeNull();
    expect(result.progressionState?.tracks.player.completedCycles).toBe(11);
    expect(result.progressionState?.tracks.player.targetComplexity).toBe(50);
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
        edgeWrapChoiceScore: 1.3,
        edgeWrapCount: 2,
        edgeWrapReliefScore: 0,
        edgeWrapScore: 4.8,
        edgeWrapShortcutReliefScore: 0,
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
      routeOverrunRatio: 0.143,
      routeOverrunSteps: 2,
      resetUsed: false,
      routeQuality: 'multi-route',
      routeEfficiencyPressureScore: 12.5,
      runQualityScore: storedRunQualityScore,
      shortestViablePathLength: 14,
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
          signal: 'searching'
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
        routeEfficiencyPressureScore: 12.5,
        runQualityScore: expect.objectContaining({
          scorerId: 'mazer.maze-cycle-run-quality',
          scorerVersion: '1.1.0',
          shortestPathModel: 'playable-wrap-aware-shortest-path-v1'
        })
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
