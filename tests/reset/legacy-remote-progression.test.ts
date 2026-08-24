import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createLegacyAuthScopedStorage,
  getLegacyAuthClient,
  readLegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';
import {
  bootstrapLegacyRemoteAccountState,
  hydrateLegacyRemoteAccountState,
  isLegacyRemoteCompletionContextCurrent,
  LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY,
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_AI_RUNNER_KEY,
  LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE,
  LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  LEGACY_REMOTE_PROFILE_TABLE,
  readLegacyRemoteCompletionOutbox,
  replayLegacyRemoteCompletions,
  isLegacyRemoteProgressionEnabled,
  mergeLegacyProgressionStateAdvancements,
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteCompletion,
  writeLegacyRemoteProgressionState
} from '../../src/legacy-runtime/legacyRemoteProgression';
import {
  createEmptyLegacyProgressionState,
  incrementLegacyProgressionOrdinal
} from '../../src/legacy-runtime/legacyProgression';
import {
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  writeMazeCycleTelemetryHistory,
  type MazeCycleTelemetryReceipt
} from '../../src/legacy-runtime/mazeCycleTelemetry';
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

const createMaybeSingleChain = (result: unknown) => {
  const chain = {
    eq: () => chain,
    maybeSingle: async () => result
  };
  return chain;
};

const createHydrationFrom = (
  remoteProgression: unknown,
  remoteProfile: unknown
) => vi.fn((table: string) => ({
  insert: () => ({
    select: () => ({
      maybeSingle: async () => ({
        data: table === LEGACY_REMOTE_AI_PROGRESSION_TABLE
          ? { state: createEmptyLegacyProgressionState().tracks['ai-runner'] }
          : { revision: 0 },
        error: null
      })
    })
  }),
  select: () => createMaybeSingleChain(
    table === LEGACY_REMOTE_PROGRESSION_TABLE
      ? { data: remoteProgression, error: null }
      : table === LEGACY_REMOTE_PROFILE_TABLE
        ? { data: remoteProfile, error: null }
        : table === LEGACY_REMOTE_AI_PROGRESSION_TABLE
          ? { data: { state: createEmptyLegacyProgressionState().tracks['ai-runner'] }, error: null }
          : { data: null, error: null }
  )
}));

const createCompletionReceipt = (
  id: string,
  clientRunId: string,
  surface: 'play' | 'menu-demo' = 'play',
  completedAt = '2026-08-23T18:00:00.000Z'
): MazeCycleTelemetryReceipt => ({
  id,
  clientRunId,
  aiDecisionSummary: null,
  averageFrameMs: 16,
  backtracks: 0,
  completedAt,
  completionTimeMs: 1_000,
  controlMode: 'arrows',
  goal: { x: 2, y: 1 },
  mazeComplexity: null,
  mazeSeed: 123,
  mazeSize: 12,
  playerPath: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
  playerPathLength: 2,
  playerPathTruncated: false,
  renderSafetyPenaltyScore: 0,
  resetUsed: false,
  routeEfficiencyPressureScore: 0,
  routeOverrunRatio: 0,
  routeOverrunSteps: 0,
  routeQuality: 'single-route',
  runQualityMetrics: null,
  runQualityScore: null,
  shortestViablePathLength: 2,
  start: { x: 1, y: 1 },
  surface,
  wrongTurns: 0
});

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset().mockResolvedValue(null);
  vi.mocked(readLegacyAuthSessionSnapshot).mockReset();
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
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }, 'replace')).resolves.toMatchObject({
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
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }, 'replace')).resolves.toMatchObject({
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

  test('fails closed instead of directly PATCHing a completed-run advancement', async () => {
    const state = createEmptyLegacyProgressionState();
    const from = vi.fn();
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    await expect(writeLegacyRemoteProgressionState({
      status: 'authenticated',
      userId: 'user-456'
    }, state, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toMatchObject({
      completionSyncState: 'pending',
      error: expect.stringContaining('Direct progression advancement is retired'),
      progressionState: state,
      skippedReason: null,
      synced: false
    });
    expect(from).not.toHaveBeenCalled();
  });

  test('discards a deferred completion result after the authenticated account changes', async () => {
    let currentSnapshot = { status: 'authenticated' as const, userId: 'account-a' };
    let currentSequence = 4;
    let appliedLevel = '1';
    let resolveRemote: ((level: string) => void) | null = null;
    const initiatingSnapshot = { ...currentSnapshot };
    const initiatingSequence = currentSequence;
    const remote = new Promise<string>((resolve) => {
      resolveRemote = resolve;
    }).then((level) => {
      if (isLegacyRemoteCompletionContextCurrent(
        initiatingSnapshot,
        initiatingSequence,
        currentSnapshot,
        currentSequence
      )) {
        appliedLevel = level;
      }
    });

    currentSnapshot = { status: 'authenticated', userId: 'account-b' };
    currentSequence += 1;
    resolveRemote?.('64');
    await remote;

    expect(appliedLevel).toBe('1');
    expect(isLegacyRemoteCompletionContextCurrent(
      initiatingSnapshot,
      initiatingSequence,
      currentSnapshot,
      currentSequence
    )).toBe(false);
  });

  test('resets through the exact authenticated RPC instead of direct table writes', async () => {
    const baseline = createEmptyLegacyProgressionState();
    const from = vi.fn(() => ({
      select: () => createMaybeSingleChain({ data: { revision: 7, state: baseline }, error: null })
    }));
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'mazer_reset_progression'
        ? [{ revision: 8, state: baseline }]
        : null,
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from, rpc } as never);

    const result = await writeLegacyRemoteProgressionState({
      status: 'authenticated',
      userId: 'user-reset'
    }, baseline, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }, 'replace');

    expect(result).toMatchObject({ progressionState: baseline, synced: true });
    expect(rpc).toHaveBeenCalledWith('mazer_reset_progression', {
      p_expected_revision: 7,
      p_expected_user_id: 'user-reset'
    });
    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_PROGRESSION_TABLE);
  });

  test('merges first-contact device progress without lowering a newer canonical track', () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-07-16T12:00:00.000Z';
    remote.tracks.player.completedCycles = '11';
    remote.tracks.player.level = '12';
    remote.tracks.player.targetComplexity = 50;
    const local = createEmptyLegacyProgressionState();
    local.updatedAt = '2026-07-16T13:00:00.000Z';
    local.tracks.player.completedCycles = '3';
    local.tracks['ai-runner'].completedCycles = '18';
    local.tracks['ai-runner'].level = '19';
    local.tracks['ai-runner'].targetComplexity = 64;

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player.completedCycles).toBe('11');
    expect(merged.tracks.player.targetComplexity).toBe(50);
    expect(merged.tracks['ai-runner'].completedCycles).toBe('18');
    expect(merged.tracks['ai-runner'].targetComplexity).toBe(64);
    expect(merged.updatedAt).toBe('2026-07-16T13:00:00.000Z');
  });

  test('merges player and ai ordinals losslessly beyond Number.MAX_SAFE_INTEGER', () => {
    const remote = createEmptyLegacyProgressionState();
    const local = createEmptyLegacyProgressionState();
    remote.tracks.player.completedCycles = '9007199254740992';
    remote.tracks.player.level = '9007199254740993';
    remote.tracks['ai-runner'].completedCycles = '9007199254740993';
    remote.tracks['ai-runner'].level = '9007199254740994';
    local.tracks.player.completedCycles = '9007199254740993';
    local.tracks.player.level = '9007199254740994';
    local.tracks['ai-runner'].completedCycles = '9007199254740992';
    local.tracks['ai-runner'].level = '9007199254740993';

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player.completedCycles).toBe('9007199254740993');
    expect(merged.tracks.player.level).toBe('9007199254740994');
    expect(merged.tracks['ai-runner'].completedCycles).toBe('9007199254740993');
    expect(merged.tracks['ai-runner'].level).toBe('9007199254740994');
    expect(JSON.parse(JSON.stringify(merged)).tracks).toMatchObject({
      player: {
        completedCycles: '9007199254740993',
        level: '9007199254740994'
      },
      'ai-runner': {
        completedCycles: '9007199254740993',
        level: '9007199254740994'
      }
    });
  });

  test('retains one exact completion UUID across failure and replay beyond Number.MAX_SAFE_INTEGER', async () => {
    const previous = createEmptyLegacyProgressionState();
    previous.tracks.player.level = '9007199254740992';
    previous.tracks.player.completedCycles = '9007199254740991';
    const next = createEmptyLegacyProgressionState();
    next.updatedAt = '2026-08-23T18:00:00.000Z';
    next.tracks.player = {
      ...previous.tracks.player,
      completedCycles: '9007199254740992',
      lastCompletedAt: next.updatedAt,
      lastReceiptId: 'lossless-run',
      level: '9007199254740993',
      targetComplexity: 400
    };
    const receipt = createCompletionReceipt(
      'lossless-run',
      '20000000-0000-4000-8000-000000000001'
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = vi.fn(() => ({
      select: () => createMaybeSingleChain({ data: { revision: 0, state: previous }, error: null })
    }));
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST000', message: 'network unavailable' } })
      .mockResolvedValueOnce({ data: [{ revision: 1, state: next }], error: null });
    const client = { from, rpc };
    vi.mocked(getLegacyAuthClient).mockResolvedValue(client as never);
    const snapshot = { status: 'authenticated' as const, userId: 'user-lossless' };
    const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };

    const failed = await writeLegacyRemoteCompletion(snapshot, previous, next, receipt, env, storage);
    expect(failed).toMatchObject({
      completionSyncState: 'pending',
      pendingCompletionCount: 1,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([
      expect.objectContaining({
        clientRunId: receipt.clientRunId,
        completedLevel: '9007199254740992'
      })
    ]);
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-lossless`) ?? '{}'
    ).progressionUpdatedAt).toBeNull();

    const replayed = await replayLegacyRemoteCompletions(snapshot, next, storage, env);
    expect(replayed).toMatchObject({
      completionSyncState: 'synced',
      pendingCompletionCount: 0,
      synced: true
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([]);
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-lossless`) ?? '{}'
    ).progressionUpdatedAt).toBe(next.updatedAt);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        p_client_run_id: receipt.clientRunId,
        p_completed_level: '9007199254740992',
        p_expected_user_id: 'user-lossless'
      }),
      expect.objectContaining({
        p_client_run_id: receipt.clientRunId,
        p_completed_level: '9007199254740992',
        p_expected_user_id: 'user-lossless'
      })
    ]);
    for (const [, parameters] of rpc.mock.calls) {
      expect(parameters).toMatchObject({ p_completed_at: receipt.completedAt });
      expect(parameters.p_receipt).not.toHaveProperty('completedAt');
      expect(parameters.p_receipt).not.toHaveProperty('clientCompletedAt');
    }
  });

  test('keeps an accepted receipt pending when durable clear fails, then retries the same run id once', async () => {
    const previous = createEmptyLegacyProgressionState();
    const next = createEmptyLegacyProgressionState();
    next.updatedAt = '2026-08-24T12:00:00.000Z';
    next.revision = 1;
    next.tracks.player = {
      ...previous.tracks.player,
      completedCycles: '1',
      lastCompletedAt: next.updatedAt,
      lastReceiptId: 'durable-clear-run',
      level: '2',
      targetComplexity: 12
    };
    const receipt = createCompletionReceipt(
      'durable-clear-run',
      '21000000-0000-4000-8000-000000000001',
      'play',
      next.updatedAt
    );
    const values = new Map<string, string>();
    let rejectEmptyOutbox = true;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (
          rejectEmptyOutbox
          && key.startsWith(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY)
          && JSON.parse(value).entries.length === 0
        ) {
          throw new Error('durable clear rejected');
        }
        values.set(key, value);
      }
    };
    const from = vi.fn(() => ({
      select: () => createMaybeSingleChain({ data: { revision: 1, state: next }, error: null })
    }));
    const rpc = vi.fn().mockResolvedValue({ data: [{ revision: 1, state: next }], error: null });
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);
    const snapshot = { status: 'authenticated' as const, userId: 'user-durable-clear' };
    const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };

    const failedClear = await writeLegacyRemoteCompletion(
      snapshot,
      previous,
      next,
      receipt,
      env,
      storage
    );

    expect(failedClear).toMatchObject({
      completionSyncState: 'pending',
      error: expect.stringContaining('retry receipt could not be cleared'),
      pendingCompletionCount: 1,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([
      expect.objectContaining({ clientRunId: receipt.clientRunId })
    ]);
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-durable-clear`) ?? '{}'
    ).progressionUpdatedAt).toBeNull();

    rejectEmptyOutbox = false;
    const replayed = await replayLegacyRemoteCompletions(snapshot, next, storage, env);

    expect(replayed).toMatchObject({
      completionSyncState: 'synced',
      pendingCompletionCount: 0,
      synced: true
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((call) => call[1]?.p_client_run_id)).toEqual([
      receipt.clientRunId,
      receipt.clientRunId
    ]);
  });

  test('keeps sync metadata pending when a local completion retry receipt cannot be persisted', async () => {
    const previous = createEmptyLegacyProgressionState();
    const next = createEmptyLegacyProgressionState();
    next.updatedAt = '2026-08-24T08:00:00.000Z';
    next.tracks.player = {
      ...next.tracks.player,
      completedCycles: '1',
      lastCompletedAt: next.updatedAt,
      lastReceiptId: 'receipt-storage-failure',
      level: '2',
      targetComplexity: 12
    };
    const values = new Map<string, string>([[
      `${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-storage-failure`,
      JSON.stringify({
        progressionRevision: 4,
        progressionUpdatedAt: next.updatedAt,
        settingsFingerprint: null,
        settingsRevision: null
      })
    ]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!key.startsWith(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY)) {
          values.set(key, value);
        }
      }
    };
    const snapshot = { status: 'authenticated' as const, userId: 'user-storage-failure' };

    const result = await writeLegacyRemoteCompletion(
      snapshot,
      previous,
      next,
      createCompletionReceipt(
        'receipt-storage-failure',
        '20000000-0000-4000-8000-000000000002',
        'play',
        next.updatedAt
      ),
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' },
      storage
    );

    expect(result).toMatchObject({
      completionSyncState: 'pending',
      error: expect.stringContaining('retry receipt could not be persisted'),
      pendingCompletionCount: 1,
      progressionState: next,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([]);
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-storage-failure`) ?? '{}'
    ).progressionUpdatedAt).toBeNull();
    expect(getLegacyAuthClient).not.toHaveBeenCalled();
  });

  test('reconstructs the exact proven 59-to-64 cloud gap as five idempotent completions', async () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-23T18:00:00.000Z';
    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: '58',
      lastCompletedAt: remote.updatedAt,
      lastReceiptId: 'receipt-58',
      level: '59',
      targetComplexity: 240
    };
    const local = structuredClone(remote);
    local.updatedAt = '2026-08-23T18:05:00.000Z';
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: '63',
      lastCompletedAt: local.updatedAt,
      lastReceiptId: 'receipt-63',
      level: '64',
      targetComplexity: 260
    };
    const boundary = createCompletionReceipt(
      'receipt-58',
      '30000000-0000-4000-8000-000000000058',
      'play',
      '2026-08-23T18:00:00.000Z'
    );
    const newer = [59, 60, 61, 62, 63].map((level) => createCompletionReceipt(
      `receipt-${level}`,
      `30000000-0000-4000-8000-${String(level).padStart(12, '0')}`,
      'play',
      `2026-08-23T18:0${level - 58}:00.000Z`
    ));
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const snapshot = { status: 'authenticated' as const, userId: 'user-recovery' };
    writeMazeCycleTelemetryHistory(
      createLegacyAuthScopedStorage(storage, MAZE_CYCLE_TELEMETRY_STORAGE_KEY, snapshot),
      { limit: 40, receipts: [...newer].reverse().concat(boundary), version: 1 }
    );
    let serverState = structuredClone(remote);
    let revision = 12;
    const from = vi.fn((table: string) => ({
      select: () => createMaybeSingleChain({
        data: table === LEGACY_REMOTE_PROGRESSION_TABLE
          ? { revision, state: serverState }
          : { state: createEmptyLegacyProgressionState().tracks['ai-runner'] },
        error: null
      })
    }));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const completedLevel = String(args.p_completed_level);
      expect(completedLevel).toBe(serverState.tracks.player.level);
      revision += 1;
      serverState = structuredClone(serverState);
      serverState.updatedAt = String(args.p_completed_at);
      serverState.tracks.player = {
        ...serverState.tracks.player,
        completedCycles: incrementLegacyProgressionOrdinal(serverState.tracks.player.completedCycles),
        lastCompletedAt: String(args.p_completed_at),
        lastReceiptId: String((args.p_receipt as Record<string, unknown>).id),
        level: incrementLegacyProgressionOrdinal(serverState.tracks.player.level),
        targetComplexity: Math.min(400, serverState.tracks.player.targetComplexity + 4)
      };
      return { data: [{ revision, state: serverState }], error: null };
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);

    const result = await replayLegacyRemoteCompletions(
      snapshot,
      local,
      storage,
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }
    );

    expect(result).toMatchObject({
      completionSyncState: 'synced',
      pendingCompletionCount: 0,
      recoveredCompletionCount: 5,
      synced: true
    });
    expect(result.progressionState?.tracks.player).toMatchObject({
      completedCycles: '63',
      level: '64',
      targetComplexity: 260
    });
    expect(rpc.mock.calls.map((call) => call[1]?.p_completed_level)).toEqual(['59', '60', '61', '62', '63']);
    expect(new Set(rpc.mock.calls.map((call) => call[1]?.p_client_run_id)).size).toBe(5);
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([]);
  });

  test('refreshes the remote cursor before repairing a gapped outbox and converges exactly once', async () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-24T09:00:00.000Z';
    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: '16',
      lastCompletedAt: remote.updatedAt,
      lastReceiptId: 'receipt-16',
      level: '17',
      targetComplexity: 40
    };
    const local = structuredClone(remote);
    local.updatedAt = '2026-08-24T09:03:00.000Z';
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: '19',
      lastCompletedAt: local.updatedAt,
      lastReceiptId: 'receipt-19',
      level: '20',
      targetComplexity: 46
    };
    const previous = structuredClone(local);
    previous.tracks.player = {
      ...previous.tracks.player,
      completedCycles: '18',
      lastReceiptId: 'receipt-18',
      level: '19'
    };
    const boundary = createCompletionReceipt(
      'receipt-16',
      '50000000-0000-4000-8000-000000000016',
      'play',
      remote.updatedAt
    );
    const newer = [17, 18, 19].map((level) => createCompletionReceipt(
      `receipt-${level}`,
      `50000000-0000-4000-8000-${String(level).padStart(12, '0')}`,
      'play',
      `2026-08-24T09:0${level - 16}:00.000Z`
    ));
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const snapshot = { status: 'authenticated' as const, userId: 'user-gap-repair' };
    const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };

    vi.mocked(getLegacyAuthClient).mockResolvedValue(null);
    const queued = await writeLegacyRemoteCompletion(
      snapshot,
      previous,
      local,
      newer[2]!,
      env,
      storage
    );
    expect(queued).toMatchObject({
      completionSyncState: 'pending',
      pendingCompletionCount: 1,
      synced: false
    });
    writeMazeCycleTelemetryHistory(
      createLegacyAuthScopedStorage(storage, MAZE_CYCLE_TELEMETRY_STORAGE_KEY, snapshot),
      { limit: 40, receipts: [...newer].reverse().concat(boundary), version: 1 }
    );

    let serverState = structuredClone(remote);
    let revision = 17;
    const from = vi.fn((table: string) => ({
      select: () => createMaybeSingleChain({
        data: table === LEGACY_REMOTE_PROGRESSION_TABLE
          ? { revision, state: serverState }
          : { state: createEmptyLegacyProgressionState().tracks['ai-runner'] },
        error: null
      })
    }));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      expect(String(args.p_completed_level)).toBe(serverState.tracks.player.level);
      revision += 1;
      serverState = structuredClone(serverState);
      serverState.updatedAt = String(args.p_completed_at);
      serverState.tracks.player = {
        ...serverState.tracks.player,
        completedCycles: incrementLegacyProgressionOrdinal(serverState.tracks.player.completedCycles),
        lastCompletedAt: String(args.p_completed_at),
        lastReceiptId: String((args.p_receipt as Record<string, unknown>).id),
        level: incrementLegacyProgressionOrdinal(serverState.tracks.player.level),
        targetComplexity: Math.min(400, serverState.tracks.player.targetComplexity + 2)
      };
      return { data: [{ revision, state: serverState }], error: null };
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);

    const repaired = await replayLegacyRemoteCompletions(snapshot, local, storage, env);

    expect(repaired).toMatchObject({
      completionSyncState: 'synced',
      pendingCompletionCount: 0,
      recoveredCompletionCount: 2,
      synced: true
    });
    expect(repaired.progressionState?.tracks.player).toMatchObject({
      completedCycles: '19',
      level: '20'
    });
    expect(rpc.mock.calls.map((call) => call[1]?.p_completed_level)).toEqual(['17', '18', '19']);
    expect(from.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]!);
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toEqual([]);

    const replayedAgain = await replayLegacyRemoteCompletions(snapshot, local, storage, env);
    expect(replayedAgain).toMatchObject({
      completionSyncState: 'idle',
      pendingCompletionCount: 0,
      recoveredCompletionCount: 0,
      synced: true
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  test('advances the independent menu-AI ordinal through its server completion RPC', async () => {
    const previous = createEmptyLegacyProgressionState();
    const next = createEmptyLegacyProgressionState();
    next.updatedAt = '2026-08-23T19:00:00.000Z';
    next.tracks['ai-runner'] = {
      ...previous.tracks['ai-runner'],
      completedCycles: '1',
      lastCompletedAt: next.updatedAt,
      lastReceiptId: 'ai-run-1',
      level: '2',
      targetComplexity: 12
    };
    const receipt = createCompletionReceipt(
      'ai-run-1',
      '40000000-0000-4000-8000-000000000001',
      'menu-demo',
      next.updatedAt
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = vi.fn(() => ({
      select: () => createMaybeSingleChain({
        data: { state: previous.tracks['ai-runner'] },
        error: null
      })
    }));
    const rpc = vi.fn(async () => ({
      data: [{ state: next.tracks['ai-runner'] }],
      error: null
    }));
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);

    const result = await writeLegacyRemoteCompletion(
      { status: 'authenticated', userId: 'user-ai' },
      previous,
      next,
      receipt,
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' },
      storage
    );

    expect(result).toMatchObject({ completionSyncState: 'synced', synced: true });
    expect(result.progressionState?.tracks['ai-runner']).toMatchObject({
      completedCycles: '1',
      level: '2',
      targetComplexity: 12
    });
    expect(rpc).toHaveBeenCalledWith('mazer_complete_ai_level', expect.objectContaining({
      p_client_run_id: receipt.clientRunId,
      p_completed_level: '1',
      p_expected_user_id: 'user-ai'
    }));
    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_AI_PROGRESSION_TABLE);
    expect(from).not.toHaveBeenCalledWith(LEGACY_REMOTE_PROGRESSION_TABLE);
  });

  test('never lets a stale higher completion count lower either visible progression track', () => {
    const remote = createEmptyLegacyProgressionState();
    const local = createEmptyLegacyProgressionState();
    const levelTwentyEightTarget = 8 + (27 * 4);
    const levelThirtyTwoTarget = 8 + (31 * 4);

    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: '40',
      level: '28',
      targetComplexity: levelTwentyEightTarget
    };
    remote.tracks['ai-runner'] = {
      ...remote.tracks['ai-runner'],
      completedCycles: '40',
      level: '28',
      targetComplexity: levelTwentyEightTarget
    };
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: '39',
      level: '32',
      targetComplexity: levelThirtyTwoTarget
    };
    local.tracks['ai-runner'] = {
      ...local.tracks['ai-runner'],
      completedCycles: '39',
      level: '32',
      targetComplexity: levelThirtyTwoTarget
    };

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player).toMatchObject({
      completedCycles: '40',
      level: '32',
      targetComplexity: levelThirtyTwoTarget
    });
    expect(merged.tracks['ai-runner']).toMatchObject({
      completedCycles: '40',
      level: '32',
      targetComplexity: levelThirtyTwoTarget
    });
  });

  test('merges each monotonic progression field without lowering level, rank pressure, or history', () => {
    const remote = createEmptyLegacyProgressionState();
    const local = createEmptyLegacyProgressionState();
    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: '200',
      level: '141',
      targetComplexity: 240
    };
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: '183',
      level: '184',
      targetComplexity: 220
    };

    const merged = mergeLegacyProgressionStateAdvancements(remote, local);

    expect(merged.tracks.player).toMatchObject({
      completedCycles: '200',
      level: '184',
      targetComplexity: 240
    });
  });

  test('hydrates canonical progression and settings into account-scoped storage before scene creation', async () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-07-16T14:00:00.000Z';
    remote.tracks.player.completedCycles = '11';
    remote.tracks.player.targetComplexity = 50;
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = createHydrationFrom(
      { revision: 3, state: remote },
      { revision: 7, settings: { controlMode: 'arrows', movementSpeed: 0.65 } }
    );
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
    expect(result.progressionState?.tracks.player.completedCycles).toBe('11');
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
    remote.tracks.player.completedCycles = '11';
    remote.tracks.player.targetComplexity = 50;
    const guest = createEmptyLegacyProgressionState();
    guest.updatedAt = '2026-08-16T18:10:00.000Z';
    guest.tracks.player.completedCycles = '21';
    guest.tracks.player.targetComplexity = 72;
    const values = new Map<string, string>([
      ['mazer.progression.v1:guest', JSON.stringify(guest)]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const from = createHydrationFrom(
      { revision: 8, state: remote },
      { revision: 3, selected_control_mode: 'arrows', settings: { movementSpeed: 0.65 } }
    );
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
    expect(result.progressionState?.tracks.player.completedCycles).toBe('11');
    expect(result.settings?.controlMode).toBe('arrows');
    expect(result.settings?.movementSpeed).toBe(0.65);
    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_PROGRESSION_TABLE);
    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_PROFILE_TABLE);
    expect(from).toHaveBeenCalledWith(LEGACY_REMOTE_AI_PROGRESSION_TABLE);
    expect(JSON.parse(values.get('mazer.progression.v1:user:user-refresh') ?? '{}')).toEqual(
      expect.objectContaining({ tracks: expect.any(Object) })
    );
  });

  test('never regresses pending account progress across reload and sign-out/sign-in hydration', async () => {
    // hydrateLegacyRemoteAccountState's caller (applyLegacyAuthSnapshot's
    // "account changed" branch) can fire not just on a genuine fresh
    // sign-in but also if bootstrapLegacyRemoteAccountState itself hiccups
    // on a cold boot -- if this device's own local copy for THIS account is
    // already ahead of a possibly-stale remote read, hydrate must not
    // silently regress it. This is the exact "reads as reset after a fresh
    // load" symptom the merge here protects against.
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-16T18:00:00.000Z';
    remote.tracks.player.completedCycles = '9';
    remote.tracks.player.lastReceiptId = 'receipt-9';
    remote.tracks.player.level = '10';
    remote.tracks.player.targetComplexity = 44;
    const local = createEmptyLegacyProgressionState();
    local.updatedAt = '2026-08-21T08:19:24.915Z';
    local.tracks.player.completedCycles = '11';
    local.tracks.player.lastReceiptId = 'receipt-11';
    local.tracks.player.level = '12';
    local.tracks.player.targetComplexity = 50;
    const values = new Map<string, string>([
      ['mazer.progression.v1:user:user-refresh', JSON.stringify(local)]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const snapshot = {
      configured: true,
      displayName: 'Player',
      email: 'player@example.test',
      error: null,
      info: null,
      status: 'authenticated' as const,
      userId: 'user-refresh'
    };
    const previous = structuredClone(local);
    previous.tracks.player = {
      ...previous.tracks.player,
      completedCycles: '10',
      lastReceiptId: 'receipt-10',
      level: '11',
      targetComplexity: 48
    };
    vi.mocked(getLegacyAuthClient).mockResolvedValue(null);
    const pending = await writeLegacyRemoteCompletion(
      snapshot,
      previous,
      local,
      createCompletionReceipt(
        'receipt-11',
        '70000000-0000-4000-8000-000000000011',
        'play',
        local.updatedAt
      ),
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' },
      storage
    );
    expect(pending).toMatchObject({
      completionSyncState: 'pending',
      pendingCompletionCount: 1,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toHaveLength(1);
    values.set(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-refresh`, JSON.stringify({
      progressionRevision: 8,
      progressionUpdatedAt: local.updatedAt,
      settingsFingerprint: null,
      settingsRevision: null
    }));
    const from = createHydrationFrom({ revision: 8, state: remote }, null);
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    const result = await hydrateLegacyRemoteAccountState(
      snapshot,
      storage,
      { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' }
    );

    expect(result.error).toContain('Cannot prove');
    expect(result.progressionState?.tracks.player.completedCycles).toBe('11');
    expect(result.progressionState?.tracks.player.level).toBe('12');
    expect(result.progressionState?.tracks.player.targetComplexity).toBe(50);
    expect(result.remoteSyncResult).toMatchObject({
      completionSyncState: 'pending',
      pendingCompletionCount: 1,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toHaveLength(1);
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-refresh`) ?? '{}'
    ).progressionUpdatedAt).toBeNull();
  });

  test('keeps pending local level 30 over remote level 17 on cold bootstrap even when stale metadata says synced', async () => {
    const remote = createEmptyLegacyProgressionState();
    remote.updatedAt = '2026-08-24T10:00:00.000Z';
    remote.tracks.player = {
      ...remote.tracks.player,
      completedCycles: '16',
      lastCompletedAt: remote.updatedAt,
      lastReceiptId: 'receipt-16',
      level: '17',
      targetComplexity: 40
    };
    remote.tracks['ai-runner'] = {
      ...remote.tracks['ai-runner'],
      completedCycles: '39',
      level: '40',
      targetComplexity: 70
    };
    const local = createEmptyLegacyProgressionState();
    local.updatedAt = remote.updatedAt;
    local.tracks.player = {
      ...local.tracks.player,
      completedCycles: '29',
      lastCompletedAt: local.updatedAt,
      lastReceiptId: 'receipt-29',
      level: '30',
      targetComplexity: 66
    };
    local.tracks['ai-runner'] = {
      ...local.tracks['ai-runner'],
      completedCycles: '34',
      level: '35',
      targetComplexity: 62
    };
    const previous = structuredClone(local);
    previous.tracks.player = {
      ...previous.tracks.player,
      completedCycles: '28',
      lastReceiptId: 'receipt-28',
      level: '29'
    };
    const receipt = createCompletionReceipt(
      'receipt-29',
      '60000000-0000-4000-8000-000000000029',
      'play',
      local.updatedAt
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const snapshot = { status: 'authenticated' as const, userId: 'user-cold-pending' };
    const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };
    values.set('mazer.progression.v1:user:user-cold-pending', JSON.stringify(local));

    vi.mocked(getLegacyAuthClient).mockResolvedValue(null);
    await writeLegacyRemoteCompletion(snapshot, previous, local, receipt, env, storage);
    values.set(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-cold-pending`, JSON.stringify({
      progressionRevision: 17,
      progressionUpdatedAt: local.updatedAt,
      settingsFingerprint: null,
      settingsRevision: null
    }));

    const from = createHydrationFrom(
      { revision: 17, state: remote },
      { revision: 3, settings: {} }
    );
    const rpc = vi.fn();
    vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValue({
      configured: true,
      displayName: 'Player',
      email: 'player@example.test',
      error: null,
      info: null,
      status: 'authenticated',
      userId: snapshot.userId
    });
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);

    const result = await bootstrapLegacyRemoteAccountState(storage, env);

    expect(result.error).toContain('Cannot prove');
    expect(result.progressionState?.tracks.player).toMatchObject({
      completedCycles: '29',
      level: '30',
      targetComplexity: 66
    });
    expect(result.progressionState?.tracks['ai-runner']).toMatchObject({
      completedCycles: '39',
      level: '40',
      targetComplexity: 70
    });
    expect(result.remoteSyncResult).toMatchObject({
      completionSyncState: 'pending',
      pendingCompletionCount: 1,
      synced: false
    });
    expect(readLegacyRemoteCompletionOutbox(storage, snapshot).entries).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(JSON.parse(
      values.get(`${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:user-cold-pending`) ?? '{}'
    ).progressionUpdatedAt).toBeNull();
  });

  test('retires direct cycle-receipt writes in favor of the completion RPC transaction', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    await expect(writeLegacyRemoteCycleReceipt({
      status: 'authenticated',
      userId: 'user-789'
    }, {
      id: 'cycle-1',
      clientRunId: '10000000-0000-4000-8000-000000000001',
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
    }, { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' })).resolves.toMatchObject({
      completionSyncState: 'pending',
      error: expect.stringContaining('Direct cycle receipt writes are retired'),
      skippedReason: null,
      synced: false
    });

    expect(from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  test('returns player-safe retry guidance for the retired direct receipt path', async () => {
    const insert = vi.fn(async () => ({ error: { message: 'rls denied' } }));
    const from = vi.fn(() => ({ insert }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ from } as never);

    await expect(writeLegacyRemoteCycleReceipt({
      status: 'authenticated',
      userId: 'user-789'
    }, {
      id: 'cycle-2',
      clientRunId: '10000000-0000-4000-8000-000000000002',
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
      error: expect.stringContaining('Direct cycle receipt writes are retired'),
      playerMessage: {
        copy: LEGACY_REMOTE_MESSAGE_COPY.cycleReceiptFailed,
        id: 'remote.cycle-receipt.failed',
        source: 'progression',
        technicalDetail: expect.stringContaining('Direct cycle receipt writes are retired'),
        tone: 'warning'
      },
      skippedReason: null,
      synced: false
    });
  });
});
