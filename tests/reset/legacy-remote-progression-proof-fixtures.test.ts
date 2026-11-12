import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createLegacyAuthScopedStorage,
  getLegacyAuthClient,
  readLegacyAuthSessionSnapshot
} from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY,
  LEGACY_REMOTE_AI_PROGRESSION_TABLE,
  LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
  LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  LEGACY_REMOTE_PROGRESSION_TABLE,
  readLegacyRemoteCompletionOutbox,
  replayLegacyRemoteCompletions,
  writeLegacyRemoteCompletion,
  type LegacyRemoteProgressionSyncResult
} from '../../src/legacy-runtime/legacyRemoteProgression';
import {
  createEmptyLegacyProgressionState,
  type LegacyProgressionState
} from '../../src/legacy-runtime/legacyProgression';
import {
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  writeMazeCycleTelemetryHistory,
  type MazeCycleTelemetryReceipt
} from '../../src/legacy-runtime/mazeCycleTelemetry';

/**
 * MAZER-DATA-004: proof fixtures for docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md
 * section 7 (fixtures 1, 3, 4 and 5). Everything runs against the real outbox and
 * replay code with an injected fake server and an in-memory storage that can be
 * told to throw or to silently drop writes. No network, no Supabase.
 *
 * Fixtures 8 (coin ledger) and 9 (entitlement) have no objects to test yet and
 * are recorded as todo at the bottom of this file.
 */

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null),
    readLegacyAuthSessionSnapshot: vi.fn(async () => actual.createLegacyGuestAuthSnapshot())
  };
});

const USER_ID = 'user-proof-fixtures';
const snapshot = { status: 'authenticated' as const, userId: USER_ID };
const env = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };
const SYNC_KEY = `${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:${USER_ID}`;

type WriteRule = (key: string, value: string) => 'drop' | 'throw' | undefined;

class MemoryStorage {
  readonly values: Map<string, string>;
  rules: WriteRule[] = [];

  constructor(seed: Iterable<[string, string]> = []) {
    this.values = new Map(seed);
  }

  getItem = (key: string): string | null => this.values.get(key) ?? null;

  setItem = (key: string, value: string): void => {
    for (const rule of this.rules) {
      const verdict = rule(key, value);
      if (verdict === 'throw') {
        throw new Error('QuotaExceededError (fixture)');
      }
      if (verdict === 'drop') {
        return;
      }
    }
    this.values.set(key, value);
  };

  /** A process restart keeps only what reached durable storage. */
  restart(): MemoryStorage {
    return new MemoryStorage([...this.values]);
  }
}

const isOutboxKey = (key: string): boolean => key.startsWith(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY);
const isMetadataKey = (key: string): boolean => key === SYNC_KEY;
const isEmptyOutboxWrite = (key: string, value: string): boolean => (
  isOutboxKey(key) && JSON.parse(value).entries.length === 0
);

const runId = (level: number): string => `40000000-0000-4000-8000-${String(level).padStart(12, '0')}`;
const completedAtFor = (level: number): string => `2026-11-12T10:${String(level).padStart(2, '0')}:00.000Z`;

const createReceipt = (level: number): MazeCycleTelemetryReceipt => ({
  id: `receipt-${level}`,
  clientRunId: runId(level),
  aiDecisionSummary: null,
  averageFrameMs: 16,
  backtracks: 0,
  completedAt: completedAtFor(level),
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
  surface: 'play',
  wrongTurns: 0
});

/** Local player state after the player finished `completedLevel` (so it sits on completedLevel + 1). */
const localStateAfter = (completedLevel: number): LegacyProgressionState => {
  const state = createEmptyLegacyProgressionState();
  if (completedLevel < 1) {
    return state;
  }
  state.updatedAt = completedAtFor(completedLevel);
  state.tracks.player = {
    ...state.tracks.player,
    completedCycles: String(completedLevel),
    lastCompletedAt: completedAtFor(completedLevel),
    lastReceiptId: `receipt-${completedLevel}`,
    level: String(completedLevel + 1),
    // Normalisation fails closed above the earned ceiling, so keep the ladder honest.
    peakComplexity: 8 + 4 * completedLevel,
    targetComplexity: 8 + 4 * completedLevel
  };
  return state;
};

const createChain = (resolve: (filters: Record<string, unknown>) => unknown) => {
  const filters: Record<string, unknown> = {};
  const chain = {
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    },
    maybeSingle: async () => resolve(filters)
  };
  return chain;
};

/**
 * Stateful stand-in for the Supabase side, modelled on
 * supabase/migrations/20260822000100_mazer_endless_completion_rpc.sql:
 * a duplicate run id returns the current row and changes nothing; a stale
 * revision is 40001; a level other than the current one is 22023.
 */
class FakeCompletionServer {
  level = 1;
  completedCycles = 0;
  revision = 0;
  lastReceiptId: string | null = null;
  lastCompletedAt: string | null = null;
  readonly acceptedRunIds: string[] = [];
  readonly rpcCalls: Array<{ runId: string; level: string; outcome: string }> = [];
  online = true;
  /** When set, the next accepted completion is applied but its response is lost. */
  loseNextResponse = false;
  /** When set, the server goes offline after this many accepted completions. */
  dropOfflineAfterAccepted: number | null = null;

  state(): LegacyProgressionState {
    const state = createEmptyLegacyProgressionState();
    state.updatedAt = this.lastCompletedAt ?? state.updatedAt;
    state.tracks.player = {
      ...state.tracks.player,
      completedCycles: String(this.completedCycles),
      lastCompletedAt: this.lastCompletedAt,
      lastReceiptId: this.lastReceiptId,
      level: String(this.level),
      peakComplexity: Math.max(8, 8 + 4 * this.completedCycles),
      targetComplexity: Math.min(400, 8 + 4 * this.completedCycles)
    };
    return state;
  }

  private row() {
    return { revision: this.revision, state: this.state() };
  }

  client() {
    const networkError = { message: 'network unavailable' };
    const from = vi.fn((table: string) => ({
      select: () => createChain((filters) => {
        if (!this.online) {
          return { data: null, error: networkError };
        }
        if (table === LEGACY_REMOTE_PROGRESSION_TABLE) {
          return { data: this.row(), error: null };
        }
        if (table === LEGACY_REMOTE_AI_PROGRESSION_TABLE) {
          return {
            data: { state: createEmptyLegacyProgressionState().tracks['ai-runner'] },
            error: null
          };
        }
        if (table === LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE) {
          const id = String(filters.client_run_id);
          return {
            data: this.acceptedRunIds.includes(id) ? { client_run_id: id } : null,
            error: null
          };
        }
        return { data: null, error: null };
      })
    }));
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      const id = String(args.p_client_run_id);
      const level = String(args.p_completed_level);
      const log = (outcome: string) => this.rpcCalls.push({ level, outcome, runId: id });
      if (!this.online) {
        log('network-error');
        return { data: null, error: { code: 'PGRST000', message: 'network unavailable' } };
      }
      if (name !== 'mazer_complete_level') {
        throw new Error(`unexpected rpc ${name}`);
      }
      if (this.acceptedRunIds.includes(id)) {
        log('duplicate-ignored');
        return { data: [this.row()], error: null };
      }
      if (Number(args.p_expected_revision) !== this.revision) {
        log('revision-conflict');
        return { data: null, error: { code: '40001', message: 'Progression changed on another device' } };
      }
      if (level !== String(this.level)) {
        log('level-mismatch');
        return { data: null, error: { code: '22023', message: 'completed_level does not match the current level' } };
      }
      this.level += 1;
      this.completedCycles += 1;
      this.revision += 1;
      this.lastReceiptId = String((args.p_receipt as Record<string, unknown>).id);
      this.lastCompletedAt = String(args.p_completed_at);
      this.acceptedRunIds.push(id);
      log('accepted');
      if (this.dropOfflineAfterAccepted !== null && this.acceptedRunIds.length >= this.dropOfflineAfterAccepted) {
        this.online = false;
        this.dropOfflineAfterAccepted = null;
      }
      if (this.loseNextResponse) {
        this.loseNextResponse = false;
        return { data: null, error: { code: 'PGRST000', message: 'response lost' } };
      }
      return { data: [this.row()], error: null };
    });
    return { from, rpc };
  }

  summary() {
    return {
      acceptedRunIds: [...this.acceptedRunIds],
      completedCycles: this.completedCycles,
      level: this.level,
      revision: this.revision
    };
  }
}

const useClient = (server: FakeCompletionServer | null) => {
  vi.mocked(getLegacyAuthClient).mockResolvedValue((server ? server.client() : null) as never);
};

const outboxIds = (storage: MemoryStorage): string[] => (
  readLegacyRemoteCompletionOutbox(storage, snapshot).entries.map((entry) => entry.clientRunId)
);

const syncMarker = (storage: MemoryStorage): string | null => {
  const raw = storage.getItem(SYNC_KEY);
  return raw ? (JSON.parse(raw).progressionUpdatedAt as string | null) : null;
};

/** The player finishes `completedLevel` while the network is down or up. */
const completeLevel = (storage: MemoryStorage, completedLevel: number): Promise<LegacyRemoteProgressionSyncResult> => (
  writeLegacyRemoteCompletion(
    snapshot,
    localStateAfter(completedLevel - 1),
    localStateAfter(completedLevel),
    createReceipt(completedLevel),
    env,
    storage
  )
);

const writeTelemetry = (storage: MemoryStorage, levels: number[]): void => {
  const scoped = createLegacyAuthScopedStorage(storage, MAZE_CYCLE_TELEMETRY_STORAGE_KEY, snapshot);
  // Telemetry history is stored newest first.
  const receipts = [...levels].sort((left, right) => right - left).map(createReceipt);
  writeMazeCycleTelemetryHistory(scoped, { limit: 40, receipts, version: 1 });
};

const replay = (
  storage: MemoryStorage,
  server: FakeCompletionServer,
  localLevelCompleted: number
): Promise<LegacyRemoteProgressionSyncResult> => replayLegacyRemoteCompletions(
  snapshot,
  localStateAfter(localLevelCompleted),
  storage,
  env,
  server.client() as never
);

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset().mockResolvedValue(null);
  vi.mocked(readLegacyAuthSessionSnapshot).mockReset();
});

describe('MAZER-DATA-004 fixture 1: offline completion, restart, resume', () => {
  test('keeps three offline completions in order with zero server calls, and survives a restart', async () => {
    const storage = new MemoryStorage();
    const server = new FakeCompletionServer();
    server.online = false;
    useClient(server);

    for (const level of [1, 2, 3]) {
      const result = await completeLevel(storage, level);
      expect(result).toMatchObject({ completionSyncState: 'pending', synced: false });
    }

    expect(outboxIds(storage)).toEqual([runId(1), runId(2), runId(3)]);
    expect(syncMarker(storage)).toBeNull();

    const restarted = storage.restart();
    expect(outboxIds(restarted)).toEqual([runId(1), runId(2), runId(3)]);
    expect(syncMarker(restarted)).toBeNull();
    expect(server.summary()).toMatchObject({ acceptedRunIds: [], level: 1, revision: 0 });
  });

  test('after a restart the reconnect flush sends each run exactly once and lands on level 4', async () => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    for (const level of [1, 2, 3]) {
      await completeLevel(storage, level);
    }

    const restarted = storage.restart();
    const server = new FakeCompletionServer();
    const result = await replay(restarted, server, 3);

    expect(result).toMatchObject({ completionSyncState: 'synced', pendingCompletionCount: 0, synced: true });
    expect(result.progressionState?.tracks.player).toMatchObject({ completedCycles: '3', level: '4' });
    expect(server.summary()).toEqual({
      acceptedRunIds: [runId(1), runId(2), runId(3)],
      completedCycles: 3,
      level: 4,
      revision: 3
    });
    expect(server.rpcCalls.map((call) => call.outcome)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(outboxIds(restarted)).toEqual([]);
    expect(syncMarker(restarted)).toBe(completedAtFor(3));
  });

  test('a flush cut short by a dropped connection resumes after restart without re-sending the accepted run', async () => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    for (const level of [1, 2, 3]) {
      await completeLevel(storage, level);
    }

    const server = new FakeCompletionServer();
    server.dropOfflineAfterAccepted = 1;
    const interrupted = await replay(storage, server, 3);
    expect(interrupted).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(server.acceptedRunIds).toEqual([runId(1)]);
    expect(outboxIds(storage)).toEqual([runId(2), runId(3)]);
    expect(syncMarker(storage)).toBeNull();

    const restarted = storage.restart();
    expect(outboxIds(restarted)).toEqual([runId(2), runId(3)]);
    server.online = true;
    server.rpcCalls.length = 0;
    const resumed = await replay(restarted, server, 3);

    expect(resumed).toMatchObject({ completionSyncState: 'synced', pendingCompletionCount: 0, synced: true });
    expect(server.rpcCalls.map((call) => [call.runId, call.outcome])).toEqual([
      [runId(2), 'accepted'],
      [runId(3), 'accepted']
    ]);
    expect(server.summary()).toMatchObject({ completedCycles: 3, level: 4, revision: 3 });
  });
});

describe('MAZER-DATA-004 fixture 3: duplicate delivery never double-advances', () => {
  test('completing the same run twice keeps one outbox entry and the server advances once', async () => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    await completeLevel(storage, 1);
    await completeLevel(storage, 1);
    expect(outboxIds(storage)).toEqual([runId(1)]);

    const server = new FakeCompletionServer();
    const result = await replay(storage, server, 1);
    expect(result).toMatchObject({ pendingCompletionCount: 0, synced: true });
    expect(server.summary()).toMatchObject({ acceptedRunIds: [runId(1)], completedCycles: 1, level: 2, revision: 1 });
  });

  test('a response lost after the server accepted the run is settled by the exact receipt lookup, not re-sent', async () => {
    const storage = new MemoryStorage();
    const server = new FakeCompletionServer();
    server.loseNextResponse = true;
    useClient(server);

    const first = await completeLevel(storage, 1);

    // The flush sees the RPC error, refreshes the cursor, finds the entry is now
    // below the server level and removes it only after the own-row receipt lookup
    // proves this exact run id was accepted. One RPC, no resend, level 2 once.
    expect(first).toMatchObject({ completionSyncState: 'synced', pendingCompletionCount: 0, synced: true });
    expect(server.rpcCalls.map((call) => call.outcome)).toEqual(['accepted']);
    expect(server.summary()).toMatchObject({ acceptedRunIds: [runId(1)], completedCycles: 1, level: 2, revision: 1 });
    expect(outboxIds(storage)).toEqual([]);
    expect(syncMarker(storage)).toBe(completedAtFor(1));

    const second = await replay(storage, server, 1);
    expect(second).toMatchObject({ pendingCompletionCount: 0, synced: true });
    expect(server.rpcCalls).toHaveLength(1);
  });

  test('replaying a fully flushed outbox again is a no-op with no server calls', async () => {
    const storage = new MemoryStorage();
    const server = new FakeCompletionServer();
    useClient(server);
    await completeLevel(storage, 1);
    await completeLevel(storage, 2);
    expect(server.summary()).toMatchObject({ completedCycles: 2, level: 3 });

    const callsBefore = server.rpcCalls.length;
    const again = await replay(storage, server, 2);
    expect(again).toMatchObject({ pendingCompletionCount: 0, synced: true });
    expect(server.rpcCalls.length).toBe(callsBefore);
    expect(server.summary()).toMatchObject({ completedCycles: 2, level: 3, revision: 2 });
  });

  test('an outbox that already holds the same run id twice submits it once', async () => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    await completeLevel(storage, 1);
    const scopedKey = [...storage.values.keys()].find(isOutboxKey) as string;
    const parsed = JSON.parse(storage.getItem(scopedKey) as string);
    storage.setItem(scopedKey, JSON.stringify({ ...parsed, entries: [parsed.entries[0], parsed.entries[0]] }));

    const server = new FakeCompletionServer();
    const result = await replay(storage, server, 1);
    expect(result).toMatchObject({ pendingCompletionCount: 0, synced: true });
    expect(server.rpcCalls).toHaveLength(1);
    expect(server.summary()).toMatchObject({ completedCycles: 1, level: 2, revision: 1 });
  });
});

describe('MAZER-DATA-004 fixture 4: reordered delivery converges to the in-order state', () => {
  const inOrderBaseline = async () => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    for (const level of [1, 2, 3]) {
      await completeLevel(storage, level);
    }
    const server = new FakeCompletionServer();
    const result = await replay(storage, server, 3);
    return { result, server, storage };
  };

  const buildReversedOutbox = async (withTelemetry: boolean) => {
    const storage = new MemoryStorage();
    const offline = new FakeCompletionServer();
    offline.online = false;
    useClient(offline);
    for (const level of [3, 2, 1]) {
      await completeLevel(storage, level);
    }
    if (withTelemetry) {
      writeTelemetry(storage, [1, 2, 3]);
    }
    expect(outboxIds(storage)).toEqual([runId(3), runId(2), runId(1)]);
    return storage;
  };

  test('in-order baseline for the comparison below', async () => {
    const { result, server } = await inOrderBaseline();
    expect(result).toMatchObject({ completionSyncState: 'synced', synced: true });
    expect(server.summary()).toEqual({
      acceptedRunIds: [runId(1), runId(2), runId(3)],
      completedCycles: 3,
      level: 4,
      revision: 3
    });
  });

  /** Server already holds level 1 (accepted earlier, online); the player then finished levels 2..4 offline. */
  const buildOfflineChainAfterOnlineLevelOne = async (order: number[]) => {
    const storage = new MemoryStorage();
    const server = new FakeCompletionServer();
    useClient(server);
    await completeLevel(storage, 1);
    server.online = false;
    for (const level of order) {
      await completeLevel(storage, level);
    }
    server.online = true;
    server.rpcCalls.length = 0;
    writeTelemetry(storage, [1, 2, 3, 4]);
    return { server, storage };
  };

  test('a reverse-ordered outbox is repaired from the local receipt history and equals the in-order state in one replay', async () => {
    const inOrder = await buildOfflineChainAfterOnlineLevelOne([2, 3, 4]);
    expect(outboxIds(inOrder.storage)).toEqual([runId(2), runId(3), runId(4)]);
    const inOrderResult = await replay(inOrder.storage, inOrder.server, 4);
    expect(inOrderResult).toMatchObject({ completionSyncState: 'synced', synced: true });

    const reversed = await buildOfflineChainAfterOnlineLevelOne([4, 3, 2]);
    expect(outboxIds(reversed.storage)).toEqual([runId(4), runId(3), runId(2)]);
    const result = await replay(reversed.storage, reversed.server, 4);

    expect(result).toMatchObject({
      completionSyncState: 'synced',
      pendingCompletionCount: 0,
      recoveredCompletionCount: 0,
      synced: true
    });
    expect(reversed.server.summary()).toEqual(inOrder.server.summary());
    expect(reversed.server.summary()).toMatchObject({ completedCycles: 4, level: 5, revision: 4 });
    expect(result.progressionState?.tracks.player).toEqual(inOrderResult.progressionState?.tracks.player);
    expect(reversed.server.rpcCalls.map((call) => call.outcome)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(outboxIds(reversed.storage)).toEqual([]);
  });

  test('a reverse-ordered outbox without local receipts never over-advances and holds as pending, not synced', async () => {
    const storage = await buildReversedOutbox(false);
    const server = new FakeCompletionServer();

    const result = await replay(storage, server, 3);

    // The exact order cannot be proven from the outbox alone: the run is held,
    // nothing is submitted out of order and nothing is claimed as synced.
    expect(result).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(result.error).toEqual(expect.any(String));
    expect(server.summary()).toMatchObject({ acceptedRunIds: [], completedCycles: 0, level: 1, revision: 0 });
    expect(outboxIds(storage)).toEqual([runId(3), runId(2), runId(1)]);
    expect(syncMarker(storage)).toBeNull();
  });

  test('a reverse-ordered outbox flushed directly (no recovery pass) converges in at most three flushes with no duplicate or out-of-order accept', async () => {
    const storage = await buildReversedOutbox(false);
    const server = new FakeCompletionServer();
    // Seed a state that lets replay see the outbox as exactly covered, so the
    // flush itself (gap -> next -> lower) is what orders the work.
    server.level = 1;
    let passes = 0;
    let result: LegacyRemoteProgressionSyncResult | null = null;
    // `writeLegacyRemoteCompletion` flushes the live outbox with the client from getLegacyAuthClient.
    useClient(server);
    while (passes < 4 && outboxIds(storage).length > 0) {
      passes += 1;
      result = await completeLevel(storage, 1);
    }
    expect(passes).toBeLessThanOrEqual(3);
    expect(result).toMatchObject({ pendingCompletionCount: 0, synced: true });
    expect(server.summary()).toEqual({
      acceptedRunIds: [runId(1), runId(2), runId(3)],
      completedCycles: 3,
      level: 4,
      revision: 3
    });
    expect(server.rpcCalls.filter((call) => call.outcome === 'level-mismatch')).toEqual([]);
  });
});

describe('MAZER-DATA-004 fixture 5: a storage failure never claims synced', () => {
  test('a throwing outbox write at enqueue keeps the completion unsynced, makes no server call and clears the synced marker', async () => {
    const storage = new MemoryStorage([[SYNC_KEY, JSON.stringify({
      progressionRevision: 4,
      progressionUpdatedAt: completedAtFor(0),
      settingsFingerprint: null,
      settingsRevision: null
    })]]);
    storage.rules.push((key) => (isOutboxKey(key) ? 'throw' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);

    const result = await completeLevel(storage, 1);

    expect(result).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(result.error).toEqual(expect.stringContaining('could not be persisted'));
    expect(server.rpcCalls).toEqual([]);
    expect(outboxIds(storage)).toEqual([]);
    expect(syncMarker(storage)).toBeNull();
  });

  test('a silently dropped outbox write at enqueue (no exception) is caught by the read-back and never claims synced', async () => {
    const storage = new MemoryStorage();
    storage.rules.push((key) => (isOutboxKey(key) ? 'drop' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);

    const result = await completeLevel(storage, 1);

    expect(result).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(server.rpcCalls).toEqual([]);
    expect(syncMarker(storage)).toBeNull();
  });

  test('a throwing clear after the server accepted keeps the entry pending, then the retry is a duplicate and advances nothing', async () => {
    const storage = new MemoryStorage();
    storage.rules.push((key, value) => (isEmptyOutboxWrite(key, value) ? 'throw' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);

    const first = await completeLevel(storage, 1);
    expect(first).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(first.error).toEqual(expect.stringContaining('could not be cleared'));
    expect(outboxIds(storage)).toEqual([runId(1)]);
    expect(syncMarker(storage)).toBeNull();

    storage.rules.length = 0;
    const second = await replay(storage, server, 1);
    expect(second).toMatchObject({ completionSyncState: 'synced', pendingCompletionCount: 0, synced: true });
    expect(server.summary()).toMatchObject({ acceptedRunIds: [runId(1)], completedCycles: 1, level: 2, revision: 1 });
    expect(server.rpcCalls.map((call) => call.outcome)).toEqual(['accepted', 'duplicate-ignored']);
  });

  test('a silently dropped clear (no exception) is caught by the read-back and keeps the entry pending', async () => {
    const storage = new MemoryStorage();
    storage.rules.push((key, value) => (isEmptyOutboxWrite(key, value) ? 'drop' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);

    const first = await completeLevel(storage, 1);

    expect(first).toMatchObject({ completionSyncState: 'pending', synced: false });
    expect(outboxIds(storage)).toEqual([runId(1)]);
    expect(syncMarker(storage)).toBeNull();
    expect(server.acceptedRunIds).toEqual([runId(1)]);
  });

  test('a throwing sync-metadata write while the entry is pending never makes the result claim synced', async () => {
    const storage = new MemoryStorage([[SYNC_KEY, JSON.stringify({
      progressionRevision: 0,
      progressionUpdatedAt: completedAtFor(0),
      settingsFingerprint: null,
      settingsRevision: null
    })]]);
    storage.rules.push((key) => (isMetadataKey(key) ? 'throw' : undefined));
    const server = new FakeCompletionServer();
    server.online = false;
    useClient(server);

    const result = await completeLevel(storage, 1);

    expect(result).toMatchObject({ completionSyncState: 'pending', pendingCompletionCount: 1, synced: false });
    expect(outboxIds(storage)).toEqual([runId(1)]);
    // The old marker could not be cleared, but it predates this completion, so
    // it cannot equal the new local progression stamp (bootstrap compares the
    // marker with the local `updatedAt` and treats any mismatch as unsynced).
    expect(syncMarker(storage)).not.toBe(localStateAfter(1).updatedAt);
  });

  test('a throwing sync-metadata write after the server accepted still reports the server-confirmed state, with a marker that bootstrap reads as unsynced', async () => {
    const storage = new MemoryStorage();
    storage.rules.push((key) => (isMetadataKey(key) ? 'throw' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);

    const result = await completeLevel(storage, 1);

    expect(result).toMatchObject({ completionSyncState: 'synced', pendingCompletionCount: 0, synced: true });
    expect(server.summary()).toMatchObject({ completedCycles: 1, level: 2, revision: 1 });
    // Nothing was stored, so the next cold bootstrap sees no marker and merges
    // remote with local monotonically instead of trusting the cache.
    expect(syncMarker(storage)).toBeNull();
  });

  test('after every storage failure clears, the next healthy replay delivers the run once and marks synced', async () => {
    const storage = new MemoryStorage();
    storage.rules.push((key) => (isOutboxKey(key) ? 'throw' : undefined));
    const server = new FakeCompletionServer();
    useClient(server);
    await completeLevel(storage, 1);
    expect(outboxIds(storage)).toEqual([]);

    // The completion was never queued, so the replay must rebuild it from the
    // local receipt history (the exact-gap recovery path) and still deliver once.
    storage.rules.length = 0;
    writeTelemetry(storage, [1]);
    const recovered = await replay(storage, server, 1);
    expect(recovered).toMatchObject({ recoveredCompletionCount: 1, synced: true });
    expect(server.summary()).toMatchObject({ acceptedRunIds: [runId(1)], completedCycles: 1, level: 2, revision: 1 });
    expect(syncMarker(storage)).toBe(completedAtFor(1));
  });
});

describe('MAZER-DATA-004 finding: exact recovery from a fresh server row', () => {
  // REAL BUG, reported not fixed (card scope: proof fixtures only).
  // deriveExactRemoteCompletionRecovery, "fresh cloud row" branch, takes
  // `surfaceReceipts.slice(0, localBoundaryIndex + 1)`. Telemetry is newest first and
  // the local boundary is the newest receipt (index 0), so only ONE receipt is taken
  // however many completions were made. With two or more offline completions and a
  // lost outbox the recovery is "held" with an error instead of rebuilding the chain.
  // Expected fix: take every receipt from the boundary to the oldest (`slice(localBoundaryIndex)`).
  test.skip('rebuilds a multi-completion chain from local receipts when the cloud row is still at level 1 and the outbox is lost', async () => {
    const storage = new MemoryStorage();
    writeTelemetry(storage, [1, 2]);
    const server = new FakeCompletionServer();

    const result = await replay(storage, server, 2);

    expect(result).toMatchObject({ recoveredCompletionCount: 2, synced: true });
    expect(server.summary()).toMatchObject({ acceptedRunIds: [runId(1), runId(2)], completedCycles: 2, level: 3 });
  });
});

describe('MAZER-DATA-004 section 7 fixtures that cannot be built yet', () => {
  test.todo('fixture 8: coin ledger union converges regardless of order (no coin ledger exists in src/)');
  test.todo('fixture 8: an unfundable spend is held, a duplicate draw resolves the duplicate policy once (no coin or inventory objects)');
  test.todo('fixture 9: an expired entitlement lease blocks play offline but preserves data (no entitlement object exists)');
  test.todo('fixture 9: a backward clock step is rejected and offline can never mint an entitlement (no entitlement object exists)');
});
