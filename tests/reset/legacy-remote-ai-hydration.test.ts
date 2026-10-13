import { beforeEach, expect, test, vi } from 'vitest';
import { createLegacyGuestAuthSnapshot, getLegacyAuthClient, readLegacyAuthSessionSnapshot } from '../../src/legacy-runtime/legacyAuth';
import { bootstrapLegacyRemoteAccountState, hydrateLegacyRemoteAccountState, writeLegacyRemoteCompletion, LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY, LEGACY_REMOTE_PROGRESSION_TABLE, LEGACY_REMOTE_AI_PROGRESSION_TABLE, LEGACY_REMOTE_PROFILE_TABLE, LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY } from '../../src/legacy-runtime/legacyRemoteProgression';
import { createEmptyLegacyProgressionState, LEGACY_PROGRESSION_STORAGE_KEY } from '../../src/legacy-runtime/legacyProgression';
import { LEGACY_DEFAULTS } from '../../src/legacy-runtime/legacyDefaults';
import type { MazeCycleTelemetryReceipt } from '../../src/legacy-runtime/mazeCycleTelemetry';

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return { ...actual, getLegacyAuthClient: vi.fn(), readLegacyAuthSessionSnapshot: vi.fn() };
});
beforeEach(() => vi.clearAllMocks());

const fixture = () => {
  const combined = createEmptyLegacyProgressionState();
  combined.tracks.player.level = '5';
  combined.tracks.player.completedCycles = '4';
  combined.tracks.player.struggleCycles = Number.MAX_SAFE_INTEGER;
  combined.tracks['ai-runner'].level = '39';
  combined.tracks['ai-runner'].completedCycles = '108';
  const ai = createEmptyLegacyProgressionState().tracks['ai-runner'];
  ai.level = '10'; ai.completedCycles = '9'; ai.lastReceiptId = 'synthetic-cloud-boundary';
  const rpc = vi.fn(async (_name: string, _args: unknown): Promise<{ data: unknown; error: null }> => {
    throw new Error('Unexpected provider-effect path in fixture');
  });
  const client = { rpc, from: (table: string) => {
    const data = table === LEGACY_REMOTE_PROGRESSION_TABLE ? { revision: 7, state: combined }
      : table === LEGACY_REMOTE_AI_PROGRESSION_TABLE ? { state: ai }
      : table === LEGACY_REMOTE_PROFILE_TABLE ? { revision: 1, selectedControlMode: 'arrows', settings: LEGACY_DEFAULTS } : null;
    const chain = { eq: () => chain, maybeSingle: async () => ({ data, error: null }) };
    return { select: () => chain };
  } };
  const snapshot = { ...createLegacyGuestAuthSnapshot(), status: 'authenticated' as const, userId: 'synthetic-user' };
  vi.mocked(getLegacyAuthClient).mockResolvedValue(client as never);
  vi.mocked(readLegacyAuthSessionSnapshot).mockResolvedValue(snapshot);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { combined, ai, rpc, snapshot, values, storage, env: { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' } };
};

test('cold bootstrap takes remote AI from its own row, not the stale human blob', async () => {
  const f = fixture();
  const result = await bootstrapLegacyRemoteAccountState(f.storage, f.env);
  expect(result.error).toBeNull();
  expect(result.progressionState?.tracks.player).toMatchObject({ level: '5', completedCycles: '4' });
  expect(result.progressionState?.tracks['ai-runner']).toMatchObject({ level: '10', completedCycles: '9' });
  expect(result.remoteSyncResult?.synced).toBe(true);
  expect(f.rpc).not.toHaveBeenCalled();
});

test('post-sign-in hydration and its flush preserve the separate AI authority', async () => {
  const f = fixture();
  const result = await hydrateLegacyRemoteAccountState(f.snapshot, f.storage, f.env);
  expect(result.error).toBeNull();
  expect(result.progressionState?.tracks.player.level).toBe('5');
  expect(result.progressionState?.tracks['ai-runner']).toMatchObject({ level: '10', completedCycles: '9' });
  expect(f.rpc).not.toHaveBeenCalled();
});

test('unproven local AI advancement and queued receipt are preserved rather than reset or replayed', async () => {
  const f = fixture();
  const local = structuredClone(f.combined);
  local.tracks['ai-runner'].level = '147'; local.tracks['ai-runner'].completedCycles = '146';
  f.values.set(`${LEGACY_PROGRESSION_STORAGE_KEY}:user:synthetic-user`, JSON.stringify(local));
  const outboxKey = `${LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY}:user:synthetic-user`;
  const outbox = JSON.stringify({ version: 1, entries: [{ clientRunId: '00000000-0000-4000-8000-000000000001', completedAt: '2026-08-23T18:00:00.000Z', completedLevel: '146', mazeSeed: 123, mazeSize: 12, receipt: {}, recipeHash: null, recipeVersion: null, rulesetId: 'legacy-v1', surface: 'menu-demo' }] });
  f.values.set(outboxKey, outbox);
  const result = await bootstrapLegacyRemoteAccountState(f.storage, f.env);
  expect(result.error).toContain('cloud receipt boundary is not in local history');
  expect(result.progressionState?.tracks.player.level).toBe('5');
  expect(result.progressionState?.tracks['ai-runner']).toMatchObject({ level: '147', completedCycles: '146' });
  expect(f.values.get(outboxKey)).toBe(outbox);
  expect(f.rpc).not.toHaveBeenCalled();
});

test('a human completion response cannot reintroduce the stale embedded AI copy', async () => {
  const f = fixture();
  const previous = structuredClone(f.combined); previous.tracks['ai-runner'] = structuredClone(f.ai);
  const next = structuredClone(previous); next.tracks.player.level = '6'; next.tracks.player.completedCycles = '5';
  const returned = structuredClone(f.combined); returned.tracks.player = structuredClone(next.tracks.player);
  f.rpc.mockResolvedValue({ data: [{ revision: 8, state: returned }], error: null });
  const receipt: MazeCycleTelemetryReceipt = {
    id: 'synthetic-receipt', clientRunId: '00000000-0000-4000-8000-000000000002',
    aiDecisionSummary: null, averageFrameMs: 16, backtracks: 0, completedAt: '2026-08-23T18:00:00.000Z',
    completionTimeMs: 1000, controlMode: 'arrows', goal: { x: 2, y: 1 }, mazeComplexity: null,
    mazeSeed: 123, mazeSize: 12, playerPath: [{ x: 1, y: 1 }, { x: 2, y: 1 }], playerPathLength: 2,
    playerPathTruncated: false, renderSafetyPenaltyScore: 0, resetUsed: false, routeEfficiencyPressureScore: 0,
    routeOverrunRatio: 0, routeOverrunSteps: 0, routeQuality: 'single-route', runQualityMetrics: null,
    runQualityScore: null, shortestViablePathLength: 2, start: { x: 1, y: 1 }, surface: 'play', wrongTurns: 0
  };
  const result = await writeLegacyRemoteCompletion(f.snapshot, previous, next, receipt, f.env, f.storage);
  expect(result.error).toBeNull();
  expect(result.progressionState?.tracks.player.level).toBe('6');
  expect(result.progressionState?.tracks['ai-runner']).toMatchObject({ level: '10', completedCycles: '9' });
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(f.rpc.mock.calls[0]?.[0]).toBe('mazer_complete_level');
});
