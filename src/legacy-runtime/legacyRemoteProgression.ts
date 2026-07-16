import type { SupabaseClient } from '@supabase/supabase-js';
import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import {
  createLegacyAuthScopedStorage,
  getLegacyAuthClient,
  readLegacyAuthSessionSnapshot
} from './legacyAuth';
import {
  LEGACY_DEFAULTS,
  type LegacySettings
} from './legacyDefaults';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  normalizeLegacyGameTogglePreferences,
  pickLegacyGameTogglePreferences,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings,
  type LegacyGameTogglePreferences
} from './legacyGameTogglePreferences';
import {
  LEGACY_PROGRESSION_STORAGE_KEY,
  normalizeLegacyProgressionState,
  readLegacyProgressionState,
  writeLegacyProgressionState,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from './legacyProgression';
import {
  MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT,
  scoreMazeCycleAiDecisionSummary,
  type MazeCycleTelemetryReceipt
} from './mazeCycleTelemetry';
import {
  resolveLegacyRemoteSyncMessage,
  type LegacyPlayerMessage,
  type LegacyRemoteMessageContext,
  type LegacyRemoteSkippedReason
} from './legacyPlayerMessage';

export const LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY = 'VITE_MAZER_REMOTE_PROGRESSION';
export const LEGACY_REMOTE_AI_PROGRESSION_TABLE = 'mazer_ai_progression_states';
export const LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE = 'mazer_cycle_receipts';
export const LEGACY_REMOTE_PROGRESSION_TABLE = 'mazer_progression_states';
export const LEGACY_REMOTE_PROFILE_TABLE = 'mazer_profiles';
export const LEGACY_REMOTE_AI_RUNNER_KEY = 'menu-runner';
export const LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY = 'mazer.remote-account-sync.v1';

type LegacyRemoteProgressionWriteMode = 'advance' | 'replace';
type LegacyRootStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface LegacyRemoteAccountSyncMetadata {
  progressionRevision: number | null;
  progressionUpdatedAt: string | null;
  settingsFingerprint: string | null;
  settingsRevision: number | null;
}

interface LegacyRemoteProgressionRow {
  revision: number;
  state: unknown;
}

interface LegacyRemoteProfileRow {
  revision: number;
  selectedControlMode: unknown;
  settings: unknown;
}

export interface LegacyRemoteAccountBootstrapResult {
  error: string | null;
  progressionState: LegacyProgressionState | null;
  settings: LegacySettings | null;
  snapshot: LegacyAuthSessionSnapshot;
}

export interface LegacyRemoteProgressionSyncResult {
  error: string | null;
  playerMessage: LegacyPlayerMessage | null;
  progressionState?: LegacyProgressionState;
  settings?: LegacySettings;
  skippedReason: LegacyRemoteSkippedReason;
  synced: boolean;
}

let legacyRemoteAccountBootstrap: LegacyRemoteAccountBootstrapResult | null = null;

const readRuntimeEnv = (): Record<string, string | undefined> => {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env ?? {};

  return {
    ...env,
    [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: import.meta.env.VITE_MAZER_REMOTE_PROGRESSION
  };
};

const resolveRootStorage = (): LegacyRootStorage | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const normalizeRevision = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
);

const resolveAccountSyncStorageKey = (userId: string): string => (
  `${LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY}:user:${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
);

const readAccountSyncMetadata = (
  storage: Pick<Storage, 'getItem'> | undefined,
  userId: string
): LegacyRemoteAccountSyncMetadata | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(resolveAccountSyncStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LegacyRemoteAccountSyncMetadata>;
    return {
      progressionRevision: typeof parsed.progressionRevision === 'number'
        ? normalizeRevision(parsed.progressionRevision)
        : null,
      progressionUpdatedAt: typeof parsed.progressionUpdatedAt === 'string'
        ? parsed.progressionUpdatedAt
        : null,
      settingsFingerprint: typeof parsed.settingsFingerprint === 'string'
        ? parsed.settingsFingerprint
        : null,
      settingsRevision: typeof parsed.settingsRevision === 'number'
        ? normalizeRevision(parsed.settingsRevision)
        : null
    };
  } catch {
    return null;
  }
};

const writeAccountSyncMetadata = (
  storage: Pick<Storage, 'setItem'> | undefined,
  userId: string,
  metadata: LegacyRemoteAccountSyncMetadata
): void => {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(resolveAccountSyncStorageKey(userId), JSON.stringify(metadata));
  } catch {
    // Account sync metadata is a cache. RLS and server revisions remain authoritative.
  }
};

const fingerprintSettings = (settings: LegacySettings): string => (
  JSON.stringify(pickLegacyGameTogglePreferences(settings))
);

const normalizeRemoteProfileSettings = (
  row: LegacyRemoteProfileRow,
  fallback: LegacySettings
): LegacyGameTogglePreferences => {
  const settings = row.settings !== null && typeof row.settings === 'object' && !Array.isArray(row.settings)
    ? row.settings as Partial<LegacyGameTogglePreferences>
    : {};
  const selectedControlMode = row.selectedControlMode === 'arrows' || row.selectedControlMode === 'stick'
    ? row.selectedControlMode
    : settings.controlMode;
  return normalizeLegacyGameTogglePreferences({
    ...settings,
    controlMode: selectedControlMode
  }, fallback);
};

const compareTrackAdvancement = (
  left: LegacyProgressionTrack,
  right: LegacyProgressionTrack
): number => {
  const comparisons = [
    left.completedCycles - right.completedCycles,
    left.targetComplexity - right.targetComplexity,
    left.peakComplexity - right.peakComplexity,
    (Date.parse(left.lastCompletedAt ?? '') || 0) - (Date.parse(right.lastCompletedAt ?? '') || 0)
  ];
  return comparisons.find((value) => value !== 0) ?? 0;
};

export const mergeLegacyProgressionStateAdvancements = (
  remoteState: LegacyProgressionState,
  localState: LegacyProgressionState
): LegacyProgressionState => {
  const remote = normalizeLegacyProgressionState(remoteState);
  const local = normalizeLegacyProgressionState(localState);
  const player = compareTrackAdvancement(local.tracks.player, remote.tracks.player) > 0
    ? local.tracks.player
    : remote.tracks.player;
  const aiRunner = compareTrackAdvancement(local.tracks['ai-runner'], remote.tracks['ai-runner']) > 0
    ? local.tracks['ai-runner']
    : remote.tracks['ai-runner'];
  const updatedAt = [remote.updatedAt, local.updatedAt]
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1) ?? null;

  return normalizeLegacyProgressionState({
    ...remote,
    updatedAt,
    tracks: {
      player,
      'ai-runner': aiRunner
    }
  });
};

const hasProgressionCycles = (state: LegacyProgressionState): boolean => (
  Object.values(state.tracks).some((track) => track.completedCycles > 0)
);

const progressionStatesMatch = (
  left: LegacyProgressionState,
  right: LegacyProgressionState
): boolean => JSON.stringify(normalizeLegacyProgressionState(left)) === JSON.stringify(normalizeLegacyProgressionState(right));

export const isLegacyRemoteProgressionEnabled = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): boolean => {
  const value = env[LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
};

const createLegacyRemoteProgressionSyncResult = (
  context: LegacyRemoteMessageContext,
  result: Omit<LegacyRemoteProgressionSyncResult, 'playerMessage'>
): LegacyRemoteProgressionSyncResult => ({
  ...result,
  playerMessage: resolveLegacyRemoteSyncMessage(context, result)
});

export const createLegacyRemoteProgressionDisabledResult = (
  context: LegacyRemoteMessageContext,
  skippedReason: LegacyRemoteProgressionSyncResult['skippedReason']
): LegacyRemoteProgressionSyncResult => createLegacyRemoteProgressionSyncResult(context, {
  error: null,
  skippedReason,
  synced: false
});

const createRemoteProgressionTrackSummary = (
  track: LegacyProgressionTrack
): Record<string, unknown> => ({
  cleanCycles: track.cleanCycles,
  colorTier: track.colorTier,
  completedCycles: track.completedCycles,
  lastMazeSeed: track.lastMazeSeed,
  lastSignal: track.lastSignal,
  level: track.level,
  peakComplexity: track.peakComplexity,
  rank: track.rank,
  recentSignals: track.recentSignals,
  struggleCycles: track.struggleCycles,
  targetComplexity: track.targetComplexity
});

const createRemoteProgressionPayload = (
  userId: string,
  state: LegacyProgressionState,
  revision: number
): Record<string, unknown> => {
  const normalized = normalizeLegacyProgressionState(state);
  const playerTrack = normalized.tracks.player;
  return {
    last_completed_cycle_at: playerTrack.lastCompletedAt ?? normalized.updatedAt,
    player_completed_cycles: playerTrack.completedCycles,
    player_level: playerTrack.level,
    player_rank: playerTrack.rank,
    player_target_complexity: playerTrack.targetComplexity,
    revision,
    schema_version: normalized.version,
    state: normalized,
    updated_at: new Date().toISOString(),
    user_id: userId
  };
};

const createRemoteProfilePayload = (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'displayName' | 'userId'>,
  settings: LegacySettings,
  revision: number
): Record<string, unknown> => ({
  display_name: snapshot.displayName,
  revision,
  selected_control_mode: settings.controlMode,
  settings: pickLegacyGameTogglePreferences(settings),
  updated_at: new Date().toISOString(),
  user_id: snapshot.userId
});

const readRemoteProgressionRow = async (
  client: SupabaseClient,
  userId: string
): Promise<{ error: string | null; row: LegacyRemoteProgressionRow | null }> => {
  const { data, error } = await client
    .from(LEGACY_REMOTE_PROGRESSION_TABLE)
    .select('revision,state')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    error: error?.message ?? null,
    row: data
      ? { revision: normalizeRevision(data.revision), state: data.state }
      : null
  };
};

const readRemoteProfileRow = async (
  client: SupabaseClient,
  userId: string
): Promise<{ error: string | null; row: LegacyRemoteProfileRow | null }> => {
  const { data, error } = await client
    .from(LEGACY_REMOTE_PROFILE_TABLE)
    .select('revision,selected_control_mode,settings')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    error: error?.message ?? null,
    row: data
      ? {
        revision: normalizeRevision(data.revision),
        selectedControlMode: data.selected_control_mode,
        settings: data.settings
      }
      : null
  };
};

const updateRemoteProgressionRow = async (
  client: SupabaseClient,
  userId: string,
  state: LegacyProgressionState,
  expectedRevision: number
): Promise<{ error: string | null; revision: number | null }> => {
  const nextRevision = expectedRevision + 1;
  const { data, error } = await client
    .from(LEGACY_REMOTE_PROGRESSION_TABLE)
    .update(createRemoteProgressionPayload(userId, state, nextRevision))
    .eq('user_id', userId)
    .eq('revision', expectedRevision)
    .select('revision')
    .maybeSingle();
  return {
    error: error?.message ?? null,
    revision: data ? normalizeRevision(data.revision) : null
  };
};

const updateRemoteProfileRow = async (
  client: SupabaseClient,
  snapshot: Pick<LegacyAuthSessionSnapshot, 'displayName' | 'userId'>,
  settings: LegacySettings,
  expectedRevision: number
): Promise<{ error: string | null; revision: number | null }> => {
  const nextRevision = expectedRevision + 1;
  const { data, error } = await client
    .from(LEGACY_REMOTE_PROFILE_TABLE)
    .update(createRemoteProfilePayload(snapshot, settings, nextRevision))
    .eq('user_id', snapshot.userId!)
    .eq('revision', expectedRevision)
    .select('revision')
    .maybeSingle();
  return {
    error: error?.message ?? null,
    revision: data ? normalizeRevision(data.revision) : null
  };
};

const syncRemoteAiProgressionMirror = async (
  client: SupabaseClient,
  userId: string,
  state: LegacyProgressionState
): Promise<string | null> => {
  const normalized = normalizeLegacyProgressionState(state);
  const aiTrack = normalized.tracks['ai-runner'];
  const { error } = await client
    .from(LEGACY_REMOTE_AI_PROGRESSION_TABLE)
    .upsert({
      completed_cycles: aiTrack.completedCycles,
      last_completed_cycle_at: aiTrack.lastCompletedAt ?? normalized.updatedAt,
      level: aiTrack.level,
      rank: aiTrack.rank,
      runner_key: LEGACY_REMOTE_AI_RUNNER_KEY,
      schema_version: normalized.version,
      state: aiTrack,
      summary: createRemoteProgressionTrackSummary(aiTrack),
      target_complexity: aiTrack.targetComplexity,
      updated_at: new Date().toISOString(),
      user_id: userId
    }, {
      onConflict: 'user_id,runner_key'
    });
  return error?.message ?? null;
};

export const readLegacyBootstrappedAuthSnapshot = (): LegacyAuthSessionSnapshot | null => (
  legacyRemoteAccountBootstrap?.snapshot ?? null
);

export const readLegacyBootstrappedAccountState = (): LegacyRemoteAccountBootstrapResult | null => (
  legacyRemoteAccountBootstrap
);

export const bootstrapLegacyRemoteAccountState = async (
  storage: LegacyRootStorage | undefined = resolveRootStorage(),
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteAccountBootstrapResult> => {
  const snapshot = await readLegacyAuthSessionSnapshot();
  const emptyResult: LegacyRemoteAccountBootstrapResult = {
    error: null,
    progressionState: null,
    settings: null,
    snapshot
  };
  legacyRemoteAccountBootstrap = emptyResult;

  if (!isLegacyRemoteProgressionEnabled(env) || snapshot.status !== 'authenticated' || !snapshot.userId) {
    return emptyResult;
  }

  const client = await getLegacyAuthClient();
  if (!client || !storage) {
    return emptyResult;
  }

  const progressionStorage = createLegacyAuthScopedStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY, snapshot);
  const guestProgressionStorage = createLegacyAuthScopedStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY, { userId: null });
  const settingsStorage = createLegacyAuthScopedStorage(storage, LEGACY_GAME_TOGGLE_STORAGE_KEY, snapshot);
  const accountProgression = readLegacyProgressionState(progressionStorage);
  const guestProgression = readLegacyProgressionState(guestProgressionStorage);
  const localProgression = !hasProgressionCycles(accountProgression) && hasProgressionCycles(guestProgression)
    ? guestProgression
    : accountProgression;
  const localSettings = readLegacyGameToggleSettings(settingsStorage, LEGACY_DEFAULTS);
  const metadata = readAccountSyncMetadata(storage, snapshot.userId);
  const [progressionRead, profileRead] = await Promise.all([
    readRemoteProgressionRow(client, snapshot.userId),
    readRemoteProfileRow(client, snapshot.userId)
  ]);
  const errors = [progressionRead.error, profileRead.error].filter((value): value is string => Boolean(value));

  let progressionState = localProgression;
  let progressionRevision: number | null = metadata?.progressionRevision ?? null;
  if (progressionRead.row) {
    const remoteProgression = normalizeLegacyProgressionState(progressionRead.row.state);
    const hasUnsyncedLocalProgress = metadata === null
      || localProgression.updatedAt !== metadata.progressionUpdatedAt;
    progressionState = hasUnsyncedLocalProgress
      ? mergeLegacyProgressionStateAdvancements(remoteProgression, localProgression)
      : remoteProgression;
    progressionRevision = progressionRead.row.revision;

    if (!progressionStatesMatch(progressionState, remoteProgression)) {
      const update = await updateRemoteProgressionRow(
        client,
        snapshot.userId,
        progressionState,
        progressionRead.row.revision
      );
      if (update.error) {
        errors.push(update.error);
      } else if (update.revision !== null) {
        progressionRevision = update.revision;
        const aiError = await syncRemoteAiProgressionMirror(client, snapshot.userId, progressionState);
        if (aiError) {
          errors.push(aiError);
        }
      }
    }
  } else if (!progressionRead.error) {
    const { data, error } = await client
      .from(LEGACY_REMOTE_PROGRESSION_TABLE)
      .insert(createRemoteProgressionPayload(snapshot.userId, progressionState, 0))
      .select('revision')
      .maybeSingle();
    if (error) {
      errors.push(error.message);
    } else {
      progressionRevision = data ? normalizeRevision(data.revision) : 0;
      const aiError = await syncRemoteAiProgressionMirror(client, snapshot.userId, progressionState);
      if (aiError) {
        errors.push(aiError);
      }
    }
  }

  let settings = localSettings;
  let settingsRevision: number | null = metadata?.settingsRevision ?? null;
  if (profileRead.row) {
    const remoteSettings = {
      ...localSettings,
      ...normalizeRemoteProfileSettings(profileRead.row, LEGACY_DEFAULTS)
    };
    const localFingerprint = fingerprintSettings(localSettings);
    const hasUnsyncedLocalSettings = metadata !== null
      && metadata.settingsFingerprint !== null
      && localFingerprint !== metadata.settingsFingerprint;
    settings = hasUnsyncedLocalSettings ? localSettings : remoteSettings;
    settingsRevision = profileRead.row.revision;
    if (hasUnsyncedLocalSettings) {
      const update = await updateRemoteProfileRow(client, snapshot, settings, profileRead.row.revision);
      if (update.error) {
        errors.push(update.error);
      } else if (update.revision !== null) {
        settingsRevision = update.revision;
      }
    }
  } else if (!profileRead.error) {
    const { data, error } = await client
      .from(LEGACY_REMOTE_PROFILE_TABLE)
      .insert(createRemoteProfilePayload(snapshot, settings, 0))
      .select('revision')
      .maybeSingle();
    if (error) {
      errors.push(error.message);
    } else {
      settingsRevision = data ? normalizeRevision(data.revision) : 0;
    }
  }

  progressionState = writeLegacyProgressionState(progressionStorage, progressionState);
  settings = writeLegacyGameToggleSettings(settingsStorage, settings);
  writeAccountSyncMetadata(storage, snapshot.userId, {
    progressionRevision,
    progressionUpdatedAt: progressionState.updatedAt,
    settingsFingerprint: fingerprintSettings(settings),
    settingsRevision
  });

  legacyRemoteAccountBootstrap = {
    error: errors.length > 0 ? errors.join('; ') : null,
    progressionState,
    settings,
    snapshot
  };
  return legacyRemoteAccountBootstrap;
};

const createRemoteCycleReceiptPayload = (
  receipt: MazeCycleTelemetryReceipt
): Record<string, unknown> => {
  const previewStart = Math.max(0, receipt.playerPath.length - MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT);

  return {
    id: receipt.id,
    aiDecisionScore: scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary),
    aiDecisionSummary: receipt.aiDecisionSummary,
    averageFrameMs: receipt.averageFrameMs,
    backtracks: receipt.backtracks,
    completedAt: receipt.completedAt,
    completionTimeMs: receipt.completionTimeMs,
    controlMode: receipt.controlMode,
    goal: receipt.goal,
    mazeComplexity: receipt.mazeComplexity,
    mazeSeed: receipt.mazeSeed,
    mazeSize: receipt.mazeSize,
    playerPathLength: receipt.playerPathLength,
    playerPathPreview: receipt.playerPath.slice(previewStart),
    playerPathTruncated: receipt.playerPathTruncated,
    routeOverrunRatio: receipt.routeOverrunRatio,
    routeOverrunSteps: receipt.routeOverrunSteps,
    renderSafetyPenaltyScore: receipt.renderSafetyPenaltyScore,
    resetUsed: receipt.resetUsed,
    routeQuality: receipt.routeQuality,
    routeEfficiencyPressureScore: receipt.routeEfficiencyPressureScore,
    shortestViablePathLength: receipt.shortestViablePathLength,
    start: receipt.start,
    surface: receipt.surface,
    wrongTurns: receipt.wrongTurns
  };
};

export const writeLegacyRemoteCycleReceipt = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  receipt: MazeCycleTelemetryReceipt,
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('cycle-receipt', 'disabled');
  }

  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('cycle-receipt', 'guest');
  }

  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('cycle-receipt', 'missing-client');
  }

  const { error } = await client
    .from(LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE)
    .insert({
      average_frame_ms: receipt.averageFrameMs,
      backtracks: receipt.backtracks,
      completed_at: receipt.completedAt,
      completion_time_ms: receipt.completionTimeMs,
      control_mode: receipt.controlMode,
      goal_cell: receipt.goal,
      maze_seed: receipt.mazeSeed,
      maze_size: receipt.mazeSize,
      path_length: receipt.playerPathLength,
      receipt: createRemoteCycleReceiptPayload(receipt),
      reset_used: receipt.resetUsed,
      route_quality: receipt.routeQuality,
      start_cell: receipt.start,
      surface: receipt.surface,
      user_id: snapshot.userId,
      wrong_turns: receipt.wrongTurns
    });

  return createLegacyRemoteProgressionSyncResult('cycle-receipt', {
    error: error?.message ?? null,
    skippedReason: null,
    synced: !error
  });
};

export const writeLegacyRemoteProgressionState = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  state: LegacyProgressionState,
  env: Record<string, string | undefined> = readRuntimeEnv(),
  mode: LegacyRemoteProgressionWriteMode = 'advance'
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'disabled');
  }

  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'guest');
  }

  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'missing-client');
  }

  const storage = resolveRootStorage();
  const metadata = readAccountSyncMetadata(storage, snapshot.userId);
  let expectedRevision = metadata?.progressionRevision;
  let resolvedState = normalizeLegacyProgressionState(state);

  if (expectedRevision === null || expectedRevision === undefined) {
    const remote = await readRemoteProgressionRow(client, snapshot.userId);
    if (remote.error) {
      return createLegacyRemoteProgressionSyncResult('progression', {
        error: remote.error,
        skippedReason: null,
        synced: false
      });
    }
    if (!remote.row) {
      const { data, error } = await client
        .from(LEGACY_REMOTE_PROGRESSION_TABLE)
        .insert(createRemoteProgressionPayload(snapshot.userId, resolvedState, 0))
        .select('revision')
        .maybeSingle();
      if (error) {
        return createLegacyRemoteProgressionSyncResult('progression', {
          error: error.message,
          skippedReason: null,
          synced: false
        });
      }
      expectedRevision = data ? normalizeRevision(data.revision) : 0;
    } else {
      const remoteState = normalizeLegacyProgressionState(remote.row.state);
      if (mode === 'replace') {
        return createLegacyRemoteProgressionSyncResult('progression', {
          error: 'Reload account progress before replacing the canonical save.',
          progressionState: remoteState,
          skippedReason: null,
          synced: false
        });
      }
      resolvedState = mergeLegacyProgressionStateAdvancements(remoteState, resolvedState);
      expectedRevision = remote.row.revision;
    }
  }

  let update = await updateRemoteProgressionRow(client, snapshot.userId, resolvedState, expectedRevision);
  if (!update.error && update.revision === null) {
    const remote = await readRemoteProgressionRow(client, snapshot.userId);
    if (remote.error || !remote.row) {
      update = { error: remote.error ?? 'Account progression changed on another device.', revision: null };
    } else if (mode === 'replace') {
      resolvedState = normalizeLegacyProgressionState(remote.row.state);
      update = { error: 'Account progression changed on another device. Reloaded the newer save.', revision: null };
    } else {
      resolvedState = mergeLegacyProgressionStateAdvancements(
        normalizeLegacyProgressionState(remote.row.state),
        resolvedState
      );
      update = await updateRemoteProgressionRow(client, snapshot.userId, resolvedState, remote.row.revision);
    }
  }

  if (update.error || update.revision === null) {
    return createLegacyRemoteProgressionSyncResult('progression', {
      error: update.error ?? 'Account progression update was not applied.',
      ...(progressionStatesMatch(resolvedState, state) ? {} : { progressionState: resolvedState }),
      skippedReason: null,
      synced: false
    });
  }

  const aiError = await syncRemoteAiProgressionMirror(client, snapshot.userId, resolvedState);
  const nextMetadata: LegacyRemoteAccountSyncMetadata = {
    progressionRevision: update.revision,
    progressionUpdatedAt: resolvedState.updatedAt,
    settingsFingerprint: metadata?.settingsFingerprint ?? null,
    settingsRevision: metadata?.settingsRevision ?? null
  };
  writeAccountSyncMetadata(storage, snapshot.userId, nextMetadata);
  if (legacyRemoteAccountBootstrap?.snapshot.userId === snapshot.userId) {
    legacyRemoteAccountBootstrap.progressionState = resolvedState;
  }

  return createLegacyRemoteProgressionSyncResult('progression', {
    error: aiError,
    ...(progressionStatesMatch(resolvedState, state) ? {} : { progressionState: resolvedState }),
    skippedReason: null,
    synced: aiError === null
  });
};

export const writeLegacyRemoteSettings = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'displayName' | 'status' | 'userId'>,
  settings: LegacySettings,
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('settings', 'disabled');
  }
  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('settings', 'guest');
  }
  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('settings', 'missing-client');
  }

  const storage = resolveRootStorage();
  const metadata = readAccountSyncMetadata(storage, snapshot.userId);
  let expectedRevision = metadata?.settingsRevision;
  if (expectedRevision === null || expectedRevision === undefined) {
    const remote = await readRemoteProfileRow(client, snapshot.userId);
    if (remote.error) {
      return createLegacyRemoteProgressionSyncResult('settings', {
        error: remote.error,
        skippedReason: null,
        synced: false
      });
    }
    if (!remote.row) {
      const { data, error } = await client
        .from(LEGACY_REMOTE_PROFILE_TABLE)
        .insert(createRemoteProfilePayload(snapshot, settings, 0))
        .select('revision')
        .maybeSingle();
      if (error) {
        return createLegacyRemoteProgressionSyncResult('settings', {
          error: error.message,
          skippedReason: null,
          synced: false
        });
      }
      expectedRevision = data ? normalizeRevision(data.revision) : 0;
    } else {
      return createLegacyRemoteProgressionSyncResult('settings', {
        error: 'Reload account settings before replacing the canonical preferences.',
        settings: {
          ...settings,
          ...normalizeRemoteProfileSettings(remote.row, LEGACY_DEFAULTS)
        },
        skippedReason: null,
        synced: false
      });
    }
  }

  const update = await updateRemoteProfileRow(client, snapshot, settings, expectedRevision);
  if (!update.error && update.revision === null) {
    const remote = await readRemoteProfileRow(client, snapshot.userId);
    const remoteSettings = remote.row
      ? {
        ...settings,
        ...normalizeRemoteProfileSettings(remote.row, LEGACY_DEFAULTS)
      }
      : settings;
    return createLegacyRemoteProgressionSyncResult('settings', {
      error: remote.error ?? 'Settings changed on another device. Reloaded the newer settings.',
      settings: remoteSettings,
      skippedReason: null,
      synced: false
    });
  }
  if (update.error || update.revision === null) {
    return createLegacyRemoteProgressionSyncResult('settings', {
      error: update.error ?? 'Account settings update was not applied.',
      skippedReason: null,
      synced: false
    });
  }

  writeAccountSyncMetadata(storage, snapshot.userId, {
    progressionRevision: metadata?.progressionRevision ?? null,
    progressionUpdatedAt: metadata?.progressionUpdatedAt ?? null,
    settingsFingerprint: fingerprintSettings(settings),
    settingsRevision: update.revision
  });
  if (legacyRemoteAccountBootstrap?.snapshot.userId === snapshot.userId) {
    legacyRemoteAccountBootstrap.settings = settings;
  }
  return createLegacyRemoteProgressionSyncResult('settings', {
    error: null,
    skippedReason: null,
    synced: true
  });
};
