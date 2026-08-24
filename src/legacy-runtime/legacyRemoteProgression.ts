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
  mergeLegacyGameTogglePreferences,
  normalizeLegacyGameTogglePreferences,
  pickLegacyGameTogglePreferences,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings,
  type LegacyGameTogglePreferences
} from './legacyGameTogglePreferences';
import {
  LEGACY_PROGRESSION_STORAGE_KEY,
  compareLegacyProgressionOrdinals,
  createEmptyLegacyProgressionState,
  incrementLegacyProgressionOrdinal,
  maxLegacyProgressionOrdinal,
  normalizeLegacyPositiveProgressionOrdinal,
  normalizeLegacyProgressionState,
  readLegacyProgressionState,
  writeLegacyProgressionState,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from './legacyProgression';
import {
  LEGACY_ENDLESS_RECIPE_VERSION,
  LEGACY_ENDLESS_RULESET_ID,
  resolveLegacyProgressionRulesetId
} from './legacyEndlessProgression';
import {
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT,
  readMazeCycleTelemetryHistory,
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
export const LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY = 'mazer.remote-completion-outbox.v1';

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

interface LegacyRemoteAiProgressionRow {
  state: unknown;
}

type LegacyRemoteCompletionSyncState = 'idle' | 'pending' | 'synced';

export interface LegacyRemoteCompletionOutboxEntry {
  clientRunId: string;
  completedAt: string;
  completedLevel: string;
  mazeSeed: number;
  mazeSize: number;
  receipt: Record<string, unknown>;
  recipeHash: string | null;
  recipeVersion: number | null;
  rulesetId: 'legacy-v1' | 'endless-v1';
  surface: MazeCycleTelemetryReceipt['surface'];
}

interface LegacyRemoteCompletionOutbox {
  entries: LegacyRemoteCompletionOutboxEntry[];
  version: 1;
}

interface LegacyRemoteProfileRow {
  revision: number;
  selectedControlMode: unknown;
  settings: unknown;
}

export interface LegacyRemoteAccountBootstrapResult {
  error: string | null;
  progressionState: LegacyProgressionState | null;
  remoteSyncResult: LegacyRemoteProgressionSyncResult | null;
  settings: LegacySettings | null;
  snapshot: LegacyAuthSessionSnapshot;
}

export interface LegacyRemoteProgressionSyncResult {
  completionSyncState: LegacyRemoteCompletionSyncState;
  error: string | null;
  pendingCompletionCount: number;
  playerMessage: LegacyPlayerMessage | null;
  progressionState?: LegacyProgressionState;
  recoveredCompletionCount: number;
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

const resolveMostRecentTrack = (
  left: LegacyProgressionTrack,
  right: LegacyProgressionTrack
): LegacyProgressionTrack => (
  (Date.parse(left.lastCompletedAt ?? '') || 0) >= (Date.parse(right.lastCompletedAt ?? '') || 0)
    ? left
    : right
);

const mergeTrackAdvancements = (
  left: LegacyProgressionTrack,
  right: LegacyProgressionTrack
): LegacyProgressionTrack => {
  const recent = resolveMostRecentTrack(left, right);
  const bestTimes = [left.bestCompletionTimeMs, right.bestCompletionTimeMs]
    .filter((value): value is number => value !== null);
  return {
    ...recent,
    bestCompletionTimeMs: bestTimes.length > 0 ? Math.min(...bestTimes) : null,
    cleanCycles: Math.max(left.cleanCycles, right.cleanCycles),
    completedCycles: maxLegacyProgressionOrdinal(left.completedCycles, right.completedCycles),
    level: maxLegacyProgressionOrdinal(left.level, right.level),
    peakComplexity: Math.max(left.peakComplexity, right.peakComplexity),
    struggleCycles: Math.max(left.struggleCycles, right.struggleCycles),
    targetComplexity: Math.max(left.targetComplexity, right.targetComplexity)
  };
};

export const mergeLegacyProgressionStateAdvancements = (
  remoteState: LegacyProgressionState,
  localState: LegacyProgressionState
): LegacyProgressionState => {
  const remote = normalizeLegacyProgressionState(remoteState);
  const local = normalizeLegacyProgressionState(localState);
  const player = mergeTrackAdvancements(local.tracks.player, remote.tracks.player);
  const aiRunner = mergeTrackAdvancements(local.tracks['ai-runner'], remote.tracks['ai-runner']);
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
  Object.values(state.tracks).some((track) => compareLegacyProgressionOrdinals(track.completedCycles, '0') > 0)
);

export const isLegacyRemoteProgressionEnabled = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): boolean => {
  const value = env[LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
};

const createLegacyRemoteProgressionSyncResult = (
  context: LegacyRemoteMessageContext,
  result: Omit<LegacyRemoteProgressionSyncResult, 'playerMessage' | 'completionSyncState' | 'pendingCompletionCount' | 'recoveredCompletionCount'>
    & Partial<Pick<LegacyRemoteProgressionSyncResult, 'completionSyncState' | 'pendingCompletionCount' | 'recoveredCompletionCount'>>
): LegacyRemoteProgressionSyncResult => ({
  completionSyncState: result.completionSyncState ?? 'idle',
  pendingCompletionCount: result.pendingCompletionCount ?? 0,
  recoveredCompletionCount: result.recoveredCompletionCount ?? 0,
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

export const isLegacyRemoteCompletionContextCurrent = (
  initiatingSnapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  initiatingSequence: number,
  currentSnapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  currentSequence: number
): boolean => (
  initiatingSequence === currentSequence
  && initiatingSnapshot.status === currentSnapshot.status
  && initiatingSnapshot.userId === currentSnapshot.userId
);

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

const readRemoteAiProgressionRow = async (
  client: SupabaseClient,
  userId: string
): Promise<{ error: string | null; row: LegacyRemoteAiProgressionRow | null }> => {
  const { data, error } = await client
    .from(LEGACY_REMOTE_AI_PROGRESSION_TABLE)
    .select('state')
    .eq('user_id', userId)
    .eq('runner_key', LEGACY_REMOTE_AI_RUNNER_KEY)
    .maybeSingle();
  return {
    error: error?.message ?? null,
    row: data ? { state: data.state } : null
  };
};

const initializeRemoteProgressionRows = async (
  client: SupabaseClient,
  userId: string
): Promise<string | null> => {
  const { error } = await client.rpc('mazer_initialize_progression', {
    p_expected_user_id: userId
  });
  return error?.message ?? null;
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
    remoteSyncResult: null,
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
  const completionOutboxStorage = createLegacyAuthScopedStorage(
    storage,
    LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
    snapshot
  );
  const settingsStorage = createLegacyAuthScopedStorage(storage, LEGACY_GAME_TOGGLE_STORAGE_KEY, snapshot);
  const accountProgression = readLegacyProgressionState(progressionStorage);
  const guestProgression = readLegacyProgressionState(guestProgressionStorage);
  const localProgression = !hasProgressionCycles(accountProgression) && hasProgressionCycles(guestProgression)
    ? guestProgression
    : accountProgression;
  const localSettings = readLegacyGameToggleSettings(settingsStorage, LEGACY_DEFAULTS);
  const metadata = readAccountSyncMetadata(storage, snapshot.userId);
  const hasPendingCompletions = readRemoteCompletionOutbox(completionOutboxStorage).entries.length > 0;
  const [progressionRead, profileRead] = await Promise.all([
    readRemoteProgressionRow(client, snapshot.userId),
    readRemoteProfileRow(client, snapshot.userId)
  ]);
  const errors = [progressionRead.error, profileRead.error].filter((value): value is string => Boolean(value));

  let progressionState = localProgression;
  let progressionRevision: number | null = metadata?.progressionRevision ?? null;
  let hasUnsyncedLocalProgress = hasPendingCompletions || metadata === null;
  if (progressionRead.row) {
    const remoteProgression = normalizeLegacyProgressionState(progressionRead.row.state);
    hasUnsyncedLocalProgress = hasUnsyncedLocalProgress
      || localProgression.updatedAt !== metadata?.progressionUpdatedAt;
    progressionState = hasUnsyncedLocalProgress
      ? mergeLegacyProgressionStateAdvancements(remoteProgression, localProgression)
      : remoteProgression;
    progressionRevision = progressionRead.row.revision;
  } else if (!progressionRead.error) {
    const initializeError = await initializeRemoteProgressionRows(client, snapshot.userId);
    if (initializeError) {
      errors.push(initializeError);
    } else {
      const initialized = await readRemoteProgressionRow(client, snapshot.userId);
      if (initialized.error || !initialized.row) {
        errors.push(initialized.error ?? 'Progression initialization returned no account row.');
      } else {
        hasUnsyncedLocalProgress = true;
        progressionState = mergeLegacyProgressionStateAdvancements(
          normalizeLegacyProgressionState(initialized.row.state),
          localProgression
        );
        progressionRevision = initialized.row.revision;
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
    progressionUpdatedAt: hasUnsyncedLocalProgress ? null : progressionState.updatedAt,
    settingsFingerprint: fingerprintSettings(settings),
    settingsRevision
  });

  const completionReplay = await replayLegacyRemoteCompletions(
    snapshot,
    progressionState,
    storage,
    env,
    client
  );
  if (completionReplay.progressionState) {
    progressionState = writeLegacyProgressionState(progressionStorage, completionReplay.progressionState);
  }
  if (completionReplay.error) {
    errors.push(completionReplay.error);
  }

  legacyRemoteAccountBootstrap = {
    error: errors.length > 0 ? errors.join('; ') : null,
    progressionState,
    remoteSyncResult: completionReplay,
    settings,
    snapshot
  };
  return legacyRemoteAccountBootstrap;
};

/**
 * Reloads the signed-in account's persisted state without inheriting *guest*
 * progress or writing to Supabase. This is deliberately separate from
 * bootstrapping: bootstrapping may reconcile first-contact local progress
 * (including a guest session's), whereas a completed sign-in must
 * immediately present the account that was actually selected -- so guest
 * storage is never read here.
 *
 * It does still merge against this exact account's own existing local
 * storage (never guest storage) rather than blindly trusting the remote
 * row, same comparison bootstrapLegacyRemoteAccountState uses. This
 * function's caller (applyLegacyAuthSnapshot's "account changed" branch)
 * fires whenever userId transitions from null to a real id -- which
 * includes a genuine fresh sign-in, but ALSO fires if
 * bootstrapLegacyRemoteAccountState itself hiccups on a cold boot (a
 * transient network stall leaves legacyRemoteAccountBootstrap holding a
 * guest snapshot) and the explicit readLegacyAuthSessionSnapshot() call
 * right after it then resolves the real session moments later. Blindly
 * trusting remote in that second case could silently regress a device
 * that already has more advanced local progress for this same account --
 * the exact "reads as reset" symptom reported after a fresh/first load.
 * Merging protects both cases: an actually-fresh sign-in has no local
 * history to lose (remote wins the comparison naturally), and a bootstrap
 * hiccup can't regress progress that was already safely on-device.
 */
export const hydrateLegacyRemoteAccountState = async (
  snapshot: LegacyAuthSessionSnapshot,
  storage: LegacyRootStorage | undefined = resolveRootStorage(),
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteAccountBootstrapResult> => {
  const emptyResult: LegacyRemoteAccountBootstrapResult = {
    error: null,
    progressionState: null,
    remoteSyncResult: null,
    settings: null,
    snapshot
  };

  if (!isLegacyRemoteProgressionEnabled(env) || snapshot.status !== 'authenticated' || !snapshot.userId) {
    return emptyResult;
  }

  const client = await getLegacyAuthClient();
  if (!client || !storage) {
    return emptyResult;
  }

  const progressionStorage = createLegacyAuthScopedStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY, snapshot);
  const completionOutboxStorage = createLegacyAuthScopedStorage(
    storage,
    LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
    snapshot
  );
  const settingsStorage = createLegacyAuthScopedStorage(storage, LEGACY_GAME_TOGGLE_STORAGE_KEY, snapshot);
  const localProgression = readLegacyProgressionState(progressionStorage);
  const localSettings = readLegacyGameToggleSettings(settingsStorage, LEGACY_DEFAULTS);
  const hasPendingCompletions = readRemoteCompletionOutbox(completionOutboxStorage).entries.length > 0;

  let progressionRead: Awaited<ReturnType<typeof readRemoteProgressionRow>>;
  let profileRead: Awaited<ReturnType<typeof readRemoteProfileRow>>;
  try {
    [progressionRead, profileRead] = await Promise.all([
      readRemoteProgressionRow(client, snapshot.userId),
      readRemoteProfileRow(client, snapshot.userId)
    ]);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      progressionState: localProgression,
      remoteSyncResult: null,
      settings: localSettings,
      snapshot
    };
  }

  const errors = [progressionRead.error, profileRead.error].filter((value): value is string => Boolean(value));
  let progressionState = progressionRead.row
    ? writeLegacyProgressionState(
      progressionStorage,
      mergeLegacyProgressionStateAdvancements(
        normalizeLegacyProgressionState(progressionRead.row.state),
        localProgression
      )
    )
    : localProgression;
  const settings = profileRead.row
    ? writeLegacyGameToggleSettings(
      settingsStorage,
      mergeLegacyGameTogglePreferences(
        localSettings,
        normalizeRemoteProfileSettings(profileRead.row, localSettings)
      )
    )
    : localSettings;

  writeAccountSyncMetadata(storage, snapshot.userId, {
    progressionRevision: progressionRead.row?.revision ?? null,
    progressionUpdatedAt: hasPendingCompletions
      || (progressionRead.row !== null
        && localProgression.updatedAt !== normalizeLegacyProgressionState(progressionRead.row.state).updatedAt)
      ? null
      : progressionState.updatedAt,
    settingsFingerprint: fingerprintSettings(settings),
    settingsRevision: profileRead.row?.revision ?? null
  });

  const completionReplay = await replayLegacyRemoteCompletions(
    snapshot,
    progressionState,
    storage,
    env,
    client
  );
  if (completionReplay.progressionState) {
    progressionState = writeLegacyProgressionState(progressionStorage, completionReplay.progressionState);
  }
  if (completionReplay.error) {
    errors.push(completionReplay.error);
  }

  return {
    error: errors.length > 0 ? errors.join('; ') : null,
    progressionState,
    remoteSyncResult: completionReplay,
    settings,
    snapshot
  };
};

const createRemoteCycleReceiptPayload = (
  receipt: MazeCycleTelemetryReceipt
): Record<string, unknown> => {
  const previewStart = Math.max(0, receipt.playerPath.length - MAZE_CYCLE_TELEMETRY_PATH_PREVIEW_LIMIT);

  return {
    id: receipt.id,
    clientRunId: receipt.clientRunId,
    aiDecisionScore: scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary),
    aiDecisionSummary: receipt.aiDecisionSummary,
    averageFrameMs: receipt.averageFrameMs,
    backtracks: receipt.backtracks,
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
    runQualityMetrics: receipt.runQualityMetrics,
    runQualityScore: receipt.runQualityScore,
    shortestViablePathLength: receipt.shortestViablePathLength,
    start: receipt.start,
    surface: receipt.surface,
    wrongTurns: receipt.wrongTurns
  };
};

const LEGACY_REMOTE_COMPLETION_CLIENT_RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeRemoteCompletionOutboxEntry = (
  value: unknown
): LegacyRemoteCompletionOutboxEntry | null => {
  if (!isRecord(value)) {
    return null;
  }
  const clientRunId = typeof value.clientRunId === 'string'
    ? value.clientRunId.trim().toLowerCase()
    : '';
  const completedLevel = typeof value.completedLevel === 'string' && /^[1-9][0-9]*$/.test(value.completedLevel)
    ? normalizeLegacyPositiveProgressionOrdinal(value.completedLevel)
    : null;
  const surface = value.surface === 'play' || value.surface === 'menu-demo'
    ? value.surface
    : null;
  const rulesetId = value.rulesetId === 'legacy-v1' || value.rulesetId === 'endless-v1'
    ? value.rulesetId
    : null;
  if (
    !LEGACY_REMOTE_COMPLETION_CLIENT_RUN_ID_PATTERN.test(clientRunId)
    || completedLevel === null
    || !surface
    || !rulesetId
    || typeof value.completedAt !== 'string'
    || !Number.isSafeInteger(value.mazeSeed)
    || !Number.isSafeInteger(value.mazeSize)
    || Number(value.mazeSize) < 1
    || !isRecord(value.receipt)
  ) {
    return null;
  }
  return {
    clientRunId,
    completedAt: value.completedAt,
    completedLevel,
    mazeSeed: Number(value.mazeSeed),
    mazeSize: Number(value.mazeSize),
    receipt: value.receipt,
    recipeHash: typeof value.recipeHash === 'string' ? value.recipeHash : null,
    recipeVersion: Number.isSafeInteger(value.recipeVersion) && Number(value.recipeVersion) > 0
      ? Number(value.recipeVersion)
      : null,
    rulesetId,
    surface
  };
};

const readRemoteCompletionOutbox = (
  storage: Pick<Storage, 'getItem'> | undefined
): LegacyRemoteCompletionOutbox => {
  if (!storage) {
    return { entries: [], version: 1 };
  }
  try {
    const raw = storage.getItem(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY);
    if (!raw) {
      return { entries: [], version: 1 };
    }
    const parsed = JSON.parse(raw) as unknown;
    const values = isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries : [];
    const seen = new Set<string>();
    const entries = values
      .map(normalizeRemoteCompletionOutboxEntry)
      .filter((entry): entry is LegacyRemoteCompletionOutboxEntry => {
        if (!entry || seen.has(entry.clientRunId)) {
          return false;
        }
        seen.add(entry.clientRunId);
        return true;
      });
    return { entries, version: 1 };
  } catch {
    return { entries: [], version: 1 };
  }
};

const writeRemoteCompletionOutbox = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  outbox: LegacyRemoteCompletionOutbox
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY, JSON.stringify({
      entries: outbox.entries,
      version: 1
    }));
    const persisted = readRemoteCompletionOutbox(storage);
    return persisted.entries.length === outbox.entries.length
      && persisted.entries.every((entry, index) => entry.clientRunId === outbox.entries[index]?.clientRunId);
  } catch {
    return false;
  }
};

export const readLegacyRemoteCompletionOutbox = (
  rootStorage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  snapshot: Pick<LegacyAuthSessionSnapshot, 'userId'>
): LegacyRemoteCompletionOutbox => readRemoteCompletionOutbox(
  createLegacyAuthScopedStorage(rootStorage, LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY, snapshot)
);

const markAccountProgressionSyncPending = (
  rootStorage: LegacyRootStorage | undefined,
  userId: string,
  progressionRevision?: number | null
): void => {
  const metadata = readAccountSyncMetadata(rootStorage, userId);
  writeAccountSyncMetadata(rootStorage, userId, {
    progressionRevision: progressionRevision ?? metadata?.progressionRevision ?? null,
    progressionUpdatedAt: null,
    settingsFingerprint: metadata?.settingsFingerprint ?? null,
    settingsRevision: metadata?.settingsRevision ?? null
  });
};

const createRemoteCompletionOutboxEntry = (
  completedLevel: string,
  receipt: MazeCycleTelemetryReceipt
): LegacyRemoteCompletionOutboxEntry => {
  const rulesetId = resolveLegacyProgressionRulesetId(completedLevel);
  return {
    clientRunId: receipt.clientRunId,
    completedAt: receipt.completedAt,
    completedLevel: normalizeLegacyPositiveProgressionOrdinal(completedLevel),
    mazeSeed: receipt.mazeSeed,
    mazeSize: receipt.mazeSize,
    receipt: createRemoteCycleReceiptPayload(receipt),
    recipeHash: null,
    recipeVersion: rulesetId === LEGACY_ENDLESS_RULESET_ID ? LEGACY_ENDLESS_RECIPE_VERSION : null,
    rulesetId,
    surface: receipt.surface
  };
};

const enqueueRemoteCompletion = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  entry: LegacyRemoteCompletionOutboxEntry
): { outbox: LegacyRemoteCompletionOutbox; persisted: boolean } => {
  const outbox = readRemoteCompletionOutbox(storage);
  if (outbox.entries.some((candidate) => candidate.clientRunId === entry.clientRunId)) {
    return { outbox, persisted: true };
  }
  const next = { entries: [...outbox.entries, entry], version: 1 as const };
  return { outbox: next, persisted: writeRemoteCompletionOutbox(storage, next) };
};

const removeRemoteCompletion = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  clientRunId: string
): { outbox: LegacyRemoteCompletionOutbox; persisted: boolean } => {
  const current = readRemoteCompletionOutbox(storage);
  const next = {
    entries: current.entries.filter((entry) => entry.clientRunId !== clientRunId),
    version: 1 as const
  };
  if (writeRemoteCompletionOutbox(storage, next)) {
    return { outbox: next, persisted: true };
  }

  const durable = readRemoteCompletionOutbox(storage);
  return {
    outbox: durable.entries.some((entry) => entry.clientRunId === clientRunId)
      ? durable
      : current,
    persisted: false
  };
};

interface LegacyRemoteCompletionRecovery {
  entries: LegacyRemoteCompletionOutboxEntry[];
  error: string | null;
}

interface LegacyRemoteCompletionGapAssessment {
  exactlyCovered: boolean;
}

const assessCompletionOutboxTrackGap = (
  surface: MazeCycleTelemetryReceipt['surface'],
  remoteTrack: LegacyProgressionTrack,
  localTrack: LegacyProgressionTrack,
  entries: readonly LegacyRemoteCompletionOutboxEntry[]
): LegacyRemoteCompletionGapAssessment => {
  const levelComparison = compareLegacyProgressionOrdinals(localTrack.level, remoteTrack.level);
  const cycleComparison = compareLegacyProgressionOrdinals(
    localTrack.completedCycles,
    remoteTrack.completedCycles
  );
  if (levelComparison < 0 || cycleComparison < 0 || levelComparison !== cycleComparison) {
    return { exactlyCovered: false };
  }

  let expectedLevel = remoteTrack.level;
  let expectedCycles = remoteTrack.completedCycles;
  for (const entry of entries.filter((candidate) => candidate.surface === surface)) {
    const entryComparison = compareLegacyProgressionOrdinals(entry.completedLevel, expectedLevel);
    if (entryComparison < 0) {
      // Lower entries are outside the still-valid sequential gap. They remain
      // durable until an authenticated receipt-table lookup proves the exact
      // run UUID was accepted; they never block assessment of the valid chain.
      continue;
    }
    if (entryComparison > 0) {
      return { exactlyCovered: false };
    }
    expectedLevel = incrementLegacyProgressionOrdinal(expectedLevel);
    expectedCycles = incrementLegacyProgressionOrdinal(expectedCycles);
  }

  return {
    exactlyCovered: expectedLevel === localTrack.level && expectedCycles === localTrack.completedCycles
  };
};

const mergeRecoveredCompletionEntries = (
  recoveredEntries: readonly LegacyRemoteCompletionOutboxEntry[],
  existingEntries: readonly LegacyRemoteCompletionOutboxEntry[]
): LegacyRemoteCompletionOutboxEntry[] => {
  const seen = new Set<string>();
  return [...recoveredEntries, ...existingEntries].filter((entry) => {
    if (seen.has(entry.clientRunId)) {
      return false;
    }
    seen.add(entry.clientRunId);
    return true;
  });
};

type LegacyRemoteCompletionCursorDisposition = 'gap' | 'lower' | 'next';

const classifyOutboxEntryAgainstTrackCursor = (
  entry: LegacyRemoteCompletionOutboxEntry,
  track: LegacyProgressionTrack
): LegacyRemoteCompletionCursorDisposition => {
  const comparison = compareLegacyProgressionOrdinals(entry.completedLevel, track.level);
  if (comparison > 0) {
    return 'gap';
  }
  if (comparison === 0) {
    return 'next';
  }
  return 'lower';
};

const receiptMatchesTrackCursor = (
  receipt: MazeCycleTelemetryReceipt,
  cursor: string | null
): boolean => Boolean(cursor) && (receipt.id === cursor || receipt.clientRunId === cursor);

const deriveExactRemoteCompletionRecovery = (
  surface: MazeCycleTelemetryReceipt['surface'],
  remoteTrack: LegacyProgressionTrack,
  localTrack: LegacyProgressionTrack,
  receipts: readonly MazeCycleTelemetryReceipt[]
): LegacyRemoteCompletionRecovery => {
  if (
    remoteTrack.level === localTrack.level
    && remoteTrack.completedCycles === localTrack.completedCycles
  ) {
    return { entries: [], error: null };
  }
  const levelComparison = compareLegacyProgressionOrdinals(localTrack.level, remoteTrack.level);
  const cycleComparison = compareLegacyProgressionOrdinals(localTrack.completedCycles, remoteTrack.completedCycles);
  if (levelComparison <= 0 && cycleComparison <= 0) {
    return { entries: [], error: null };
  }
  if (levelComparison < 0 || cycleComparison < 0) {
    return {
      entries: [],
      error: `Local and cloud ${surface} ordinals disagree in opposite directions; recovery is held.`
    };
  }

  const surfaceReceipts = receipts.filter((receipt) => receipt.surface === surface);
  let newerReceipts: MazeCycleTelemetryReceipt[];
  if (remoteTrack.lastReceiptId) {
    const boundaryIndex = surfaceReceipts.findIndex((receipt) => (
      receiptMatchesTrackCursor(receipt, remoteTrack.lastReceiptId)
    ));
    if (boundaryIndex < 0) {
      return {
        entries: [],
        error: `Cannot prove the missing ${surface} completion sequence because the cloud receipt boundary is not in local history.`
      };
    }
    newerReceipts = surfaceReceipts.slice(0, boundaryIndex);
  } else if (remoteTrack.level === '1' && remoteTrack.completedCycles === '0') {
    const localBoundaryIndex = surfaceReceipts.findIndex((receipt) => (
      receiptMatchesTrackCursor(receipt, localTrack.lastReceiptId)
    ));
    if (localBoundaryIndex < 0) {
      return {
        entries: [],
        error: `Cannot prove the initial ${surface} completion sequence from local history.`
      };
    }
    newerReceipts = surfaceReceipts.slice(0, localBoundaryIndex + 1);
  } else {
    return {
      entries: [],
      error: `Cannot prove the missing ${surface} completion sequence without a cloud receipt boundary.`
    };
  }

  const chronologicalReceipts = [...newerReceipts].reverse();
  let expectedLevel = remoteTrack.level;
  let expectedCycles = remoteTrack.completedCycles;
  const entries: LegacyRemoteCompletionOutboxEntry[] = [];
  for (const receipt of chronologicalReceipts) {
    if (
      expectedLevel === localTrack.level
      || expectedCycles === localTrack.completedCycles
    ) {
      return {
        entries: [],
        error: `Local ${surface} telemetry contains more receipts than the exact progression gap.`
      };
    }
    entries.push(createRemoteCompletionOutboxEntry(expectedLevel, receipt));
    expectedLevel = incrementLegacyProgressionOrdinal(expectedLevel);
    expectedCycles = incrementLegacyProgressionOrdinal(expectedCycles);
  }

  if (expectedLevel !== localTrack.level || expectedCycles !== localTrack.completedCycles) {
    return {
      entries: [],
      error: `Local ${surface} telemetry does not exactly cover the progression gap; recovery is held.`
    };
  }
  const newest = chronologicalReceipts.at(-1) ?? null;
  if (localTrack.lastReceiptId && (!newest || !receiptMatchesTrackCursor(newest, localTrack.lastReceiptId))) {
    return {
      entries: [],
      error: `Local ${surface} telemetry does not end at the current progression receipt; recovery is held.`
    };
  }
  return { entries, error: null };
};

export const writeLegacyRemoteCycleReceipt = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  _receipt: MazeCycleTelemetryReceipt,
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('cycle-receipt', 'disabled');
  }

  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('cycle-receipt', 'guest');
  }

  return createLegacyRemoteProgressionSyncResult('cycle-receipt', {
    completionSyncState: 'pending',
    error: 'Direct cycle receipt writes are retired; accepted completions persist receipts through the idempotent completion RPC.',
    skippedReason: null,
    synced: false
  });
};

const mergeRemoteAiTrackIntoProgression = (
  state: LegacyProgressionState,
  aiTrack: unknown
): LegacyProgressionState => {
  const normalized = normalizeLegacyProgressionState(state);
  return normalizeLegacyProgressionState({
    ...normalized,
    tracks: {
      ...normalized.tracks,
      'ai-runner': aiTrack
    }
  });
};

const readFirstRpcRow = (data: unknown): Record<string, unknown> | null => {
  const value = Array.isArray(data) ? data[0] : data;
  return isRecord(value) ? value : null;
};

const ensureRemotePlayerProgressionRow = async (
  client: SupabaseClient,
  userId: string
): Promise<{ error: string | null; revision: number | null; state: LegacyProgressionState | null }> => {
  const current = await readRemoteProgressionRow(client, userId);
  if (current.error) {
    return { error: current.error, revision: null, state: null };
  }
  if (current.row) {
    return {
      error: null,
      revision: current.row.revision,
      state: normalizeLegacyProgressionState(current.row.state)
    };
  }

  const initializeError = await initializeRemoteProgressionRows(client, userId);
  if (initializeError) {
    return { error: initializeError, revision: null, state: null };
  }
  const initialized = await readRemoteProgressionRow(client, userId);
  return {
    error: initialized.error,
    revision: initialized.row?.revision ?? null,
    state: initialized.row ? normalizeLegacyProgressionState(initialized.row.state) : null
  };
};

const ensureRemoteAiProgressionRow = async (
  client: SupabaseClient,
  userId: string
): Promise<{ error: string | null; state: unknown | null }> => {
  const current = await readRemoteAiProgressionRow(client, userId);
  if (current.error || current.row) {
    return { error: current.error, state: current.row?.state ?? null };
  }
  const initializeError = await initializeRemoteProgressionRows(client, userId);
  if (initializeError) {
    return { error: initializeError, state: null };
  }
  const initialized = await readRemoteAiProgressionRow(client, userId);
  return { error: initialized.error, state: initialized.row?.state ?? null };
};

const invokeRemoteCompletionRpc = async (
  client: SupabaseClient,
  entry: LegacyRemoteCompletionOutboxEntry,
  expectedRevision: number,
  expectedUserId: string
): Promise<{ data: unknown; error: { code?: string; message: string } | null }> => {
  const shared = {
    p_client_run_id: entry.clientRunId,
    p_completed_at: entry.completedAt,
    p_completed_level: entry.completedLevel,
    p_expected_user_id: expectedUserId,
    p_maze_seed: entry.mazeSeed,
    p_maze_size: entry.mazeSize,
    p_receipt: entry.receipt,
    p_recipe_hash: entry.recipeHash,
    p_recipe_version: entry.recipeVersion,
    p_ruleset_id: entry.rulesetId
  };
  const response = entry.surface === 'play'
    ? await client.rpc('mazer_complete_level', {
      ...shared,
      p_expected_revision: expectedRevision
    })
    : await client.rpc('mazer_complete_ai_level', shared);
  return {
    data: response.data,
    error: response.error
      ? { code: response.error.code, message: response.error.message }
      : null
  };
};

const proveRemoteCompletionReceiptAccepted = async (
  client: SupabaseClient,
  userId: string,
  clientRunId: string
): Promise<{ accepted: boolean; error: string | null }> => {
  // Authenticated own-row read only; direct receipt writes remain retired.
  const acceptedReceiptTable = LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE;
  const response = await client
    .from(acceptedReceiptTable)
    .select('client_run_id')
    .eq('user_id', userId)
    .eq('client_run_id', clientRunId)
    .maybeSingle();
  if (response.error) {
    return { accepted: false, error: response.error.message };
  }
  return {
    accepted: isRecord(response.data) && response.data.client_run_id === clientRunId,
    error: null
  };
};

const applyPlayerCompletionRpcRow = (
  state: LegacyProgressionState,
  row: Record<string, unknown>
): { revision: number; state: LegacyProgressionState } | null => {
  if (
    typeof row.revision !== 'number'
    || !Number.isFinite(row.revision)
    || !isRecord(row.state)
  ) {
    return null;
  }
  return {
    revision: normalizeRevision(row.revision),
    state: mergeLegacyProgressionStateAdvancements(
      state,
      normalizeLegacyProgressionState(row.state)
    )
  };
};

const applyAiCompletionRpcRow = (
  state: LegacyProgressionState,
  row: Record<string, unknown>
): LegacyProgressionState | null => {
  if (!isRecord(row.state)) {
    return null;
  }
  return mergeLegacyProgressionStateAdvancements(
    state,
    mergeRemoteAiTrackIntoProgression(state, row.state)
  );
};

const flushLegacyRemoteCompletionOutbox = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  state: LegacyProgressionState,
  rootStorage: LegacyRootStorage | undefined,
  recoveredCompletionCount = 0,
  clientOverride?: SupabaseClient
): Promise<LegacyRemoteProgressionSyncResult> => {
  const outboxStorage = createLegacyAuthScopedStorage(
    rootStorage,
    LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
    snapshot
  );
  const progressionStorage = createLegacyAuthScopedStorage(
    rootStorage,
    LEGACY_PROGRESSION_STORAGE_KEY,
    snapshot
  );
  let outbox = readRemoteCompletionOutbox(outboxStorage);
  let resolvedState = mergeLegacyProgressionStateAdvancements(
    normalizeLegacyProgressionState(state),
    readLegacyProgressionState(progressionStorage)
  );
  const refreshDurableAccountState = (): void => {
    resolvedState = mergeLegacyProgressionStateAdvancements(
      resolvedState,
      readLegacyProgressionState(progressionStorage)
    );
    outbox = readRemoteCompletionOutbox(outboxStorage);
  };
  if (outbox.entries.length === 0) {
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'idle',
      error: null,
      pendingCompletionCount: 0,
      recoveredCompletionCount,
      skippedReason: null,
      synced: true
    });
  }

  const client = clientOverride ?? await getLegacyAuthClient();
  refreshDurableAccountState();
  if (!client || !snapshot.userId) {
    if (snapshot.userId) {
      markAccountProgressionSyncPending(rootStorage, snapshot.userId);
    }
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: client ? 'Completion sync requires an authenticated account.' : null,
      pendingCompletionCount: outbox.entries.length,
      progressionState: resolvedState,
      recoveredCompletionCount,
      skippedReason: client ? 'guest' : 'missing-client',
      synced: false
    });
  }

  // Refresh every cursor represented by the live outbox. The second player
  // check covers a play receipt appended while an AI-only read was awaiting.
  const playerCursorRead = outbox.entries.some((entry) => entry.surface === 'play');
  let playerRow = playerCursorRead
    ? await ensureRemotePlayerProgressionRow(client, snapshot.userId)
    : { error: null, revision: null, state: null };
  refreshDurableAccountState();
  const aiCursorRead = outbox.entries.some((entry) => entry.surface === 'menu-demo');
  const aiRow = aiCursorRead
    ? await ensureRemoteAiProgressionRow(client, snapshot.userId)
    : { error: null, state: null };
  refreshDurableAccountState();
  if (!playerCursorRead && outbox.entries.some((entry) => entry.surface === 'play')) {
    playerRow = await ensureRemotePlayerProgressionRow(client, snapshot.userId);
    refreshDurableAccountState();
  }
  const prerequisiteError = playerRow.error ?? aiRow.error;
  if (prerequisiteError) {
    markAccountProgressionSyncPending(rootStorage, snapshot.userId, playerRow.revision);
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: prerequisiteError,
      pendingCompletionCount: outbox.entries.length,
      progressionState: resolvedState,
      recoveredCompletionCount,
      skippedReason: null,
      synced: false
    });
  }

  if (playerRow.state) {
    resolvedState = mergeLegacyProgressionStateAdvancements(resolvedState, playerRow.state);
  }
  if (aiRow.state) {
    resolvedState = mergeLegacyProgressionStateAdvancements(
      resolvedState,
      mergeRemoteAiTrackIntoProgression(resolvedState, aiRow.state)
    );
  }
  let playerCursor = playerRow.state?.tracks.player
    ?? createEmptyLegacyProgressionState().tracks.player;
  let aiCursor = aiRow.state
    ? mergeRemoteAiTrackIntoProgression(createEmptyLegacyProgressionState(), aiRow.state).tracks['ai-runner']
    : createEmptyLegacyProgressionState().tracks['ai-runner'];
  let expectedRevision = playerRow.revision ?? readAccountSyncMetadata(rootStorage, snapshot.userId)?.progressionRevision ?? 0;
  let lastError: string | null = null;
  let deferredError: string | null = null;
  const deferUnprovenEntry = (
    entry: LegacyRemoteCompletionOutboxEntry,
    reason: 'gap' | 'proof-failed' | 'unaccepted',
    detail?: string
  ): void => {
    if (deferredError) {
      return;
    }
    if (reason === 'proof-failed') {
      deferredError = `The exact run UUID acceptance proof for a lower-level ${entry.surface} completion could not be read${detail ? `: ${detail}` : '.'}`;
      return;
    }
    deferredError = reason === 'unaccepted'
      ? `A lower-level ${entry.surface} completion has not been proven accepted for its exact run UUID and remains queued.`
      : `A gapped ${entry.surface} completion remains queued until its preceding receipt is proven.`;
  };
  const removeAcceptedEntry = (entry: LegacyRemoteCompletionOutboxEntry): boolean => {
    const removal = removeRemoteCompletion(outboxStorage, entry.clientRunId);
    outbox = removal.outbox;
    if (!removal.persisted) {
      lastError = 'The server accepted the completion, but its local retry receipt could not be cleared.';
      return false;
    }
    return true;
  };

  for (const entry of [...outbox.entries]) {
    const resolveCursor = (): LegacyProgressionTrack => (
      entry.surface === 'play' ? playerCursor : aiCursor
    );
    let disposition = classifyOutboxEntryAgainstTrackCursor(entry, resolveCursor());
    if (disposition === 'gap') {
      deferUnprovenEntry(entry, 'gap');
      continue;
    }
    let acceptedByExactProof = false;
    if (disposition === 'lower') {
      const proof = await proveRemoteCompletionReceiptAccepted(
        client,
        snapshot.userId,
        entry.clientRunId
      );
      refreshDurableAccountState();
      if (proof.error) {
        deferUnprovenEntry(entry, 'proof-failed', proof.error);
        continue;
      }
      if (!proof.accepted) {
        deferUnprovenEntry(entry, 'unaccepted');
        continue;
      }
      acceptedByExactProof = true;
    }

    let response = await invokeRemoteCompletionRpc(client, entry, expectedRevision, snapshot.userId);
    refreshDurableAccountState();
    if (response.error) {
      if (entry.surface === 'play') {
        const refreshed = await ensureRemotePlayerProgressionRow(client, snapshot.userId);
        refreshDurableAccountState();
        if (!refreshed.error) {
          if (refreshed.revision !== null) {
            expectedRevision = refreshed.revision;
          }
          if (refreshed.state) {
            playerCursor = refreshed.state.tracks.player;
            resolvedState = mergeLegacyProgressionStateAdvancements(resolvedState, refreshed.state);
          }
        }
      } else {
        const refreshed = await ensureRemoteAiProgressionRow(client, snapshot.userId);
        refreshDurableAccountState();
        if (!refreshed.error && refreshed.state) {
          aiCursor = mergeRemoteAiTrackIntoProgression(
            createEmptyLegacyProgressionState(),
            refreshed.state
          ).tracks['ai-runner'];
          resolvedState = mergeLegacyProgressionStateAdvancements(
            resolvedState,
            mergeRemoteAiTrackIntoProgression(resolvedState, refreshed.state)
          );
        }
      }

      disposition = classifyOutboxEntryAgainstTrackCursor(entry, resolveCursor());
      if (disposition === 'lower' && !acceptedByExactProof) {
        const proof = await proveRemoteCompletionReceiptAccepted(
          client,
          snapshot.userId,
          entry.clientRunId
        );
        refreshDurableAccountState();
        if (proof.error) {
          deferUnprovenEntry(entry, 'proof-failed', proof.error);
          continue;
        }
        if (!proof.accepted) {
          deferUnprovenEntry(entry, 'unaccepted');
          continue;
        }
        acceptedByExactProof = true;
      }
      if (disposition === 'lower' && acceptedByExactProof) {
        if (!removeAcceptedEntry(entry)) {
          break;
        }
        continue;
      }
      if (disposition === 'gap') {
        deferUnprovenEntry(entry, 'gap');
        continue;
      }
      if (entry.surface === 'play' && response.error.code === '40001') {
        response = await invokeRemoteCompletionRpc(client, entry, expectedRevision, snapshot.userId);
        refreshDurableAccountState();
      }
    }
    if (response.error) {
      lastError = response.error.message;
      break;
    }

    const row = readFirstRpcRow(response.data);
    const appliedPlayer = entry.surface === 'play' && row
      ? applyPlayerCompletionRpcRow(resolvedState, row)
      : null;
    const appliedAi = entry.surface === 'menu-demo' && row
      ? applyAiCompletionRpcRow(resolvedState, row)
      : null;
    if (entry.surface === 'play' && appliedPlayer) {
      expectedRevision = appliedPlayer.revision;
      resolvedState = appliedPlayer.state;
      playerCursor = normalizeLegacyProgressionState(row?.state).tracks.player;
    } else if (entry.surface === 'menu-demo' && appliedAi) {
      resolvedState = appliedAi;
      aiCursor = mergeRemoteAiTrackIntoProgression(
        createEmptyLegacyProgressionState(),
        row?.state
      ).tracks['ai-runner'];
    } else {
      lastError = `Completion RPC returned an invalid ${entry.surface} state.`;
      break;
    }

    if (!removeAcceptedEntry(entry)) {
      break;
    }
  }

  // Preserve account progress and receipts appended while any remote operation
  // awaited. This final read is synchronous with metadata/result publication.
  refreshDurableAccountState();
  const finalError = lastError ?? deferredError;
  const metadata = readAccountSyncMetadata(rootStorage, snapshot.userId);
  writeAccountSyncMetadata(rootStorage, snapshot.userId, {
    progressionRevision: expectedRevision,
    progressionUpdatedAt: finalError === null && outbox.entries.length === 0
      ? resolvedState.updatedAt
      : null,
    settingsFingerprint: metadata?.settingsFingerprint ?? null,
    settingsRevision: metadata?.settingsRevision ?? null
  });
  if (legacyRemoteAccountBootstrap?.snapshot.userId === snapshot.userId) {
    legacyRemoteAccountBootstrap.progressionState = resolvedState;
  }

  return createLegacyRemoteProgressionSyncResult('progression', {
    completionSyncState: outbox.entries.length === 0 ? 'synced' : 'pending',
    error: finalError,
    pendingCompletionCount: outbox.entries.length,
    progressionState: resolvedState,
    recoveredCompletionCount,
    skippedReason: null,
    synced: finalError === null && outbox.entries.length === 0
  });
};

export const replayLegacyRemoteCompletions = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  state: LegacyProgressionState,
  rootStorage: LegacyRootStorage | undefined = resolveRootStorage(),
  env: Record<string, string | undefined> = readRuntimeEnv(),
  clientOverride?: SupabaseClient
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'disabled');
  }
  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'guest');
  }
  let liveLocal = normalizeLegacyProgressionState(state);
  const outboxStorage = createLegacyAuthScopedStorage(
    rootStorage,
    LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
    snapshot
  );
  const progressionStorage = createLegacyAuthScopedStorage(
    rootStorage,
    LEGACY_PROGRESSION_STORAGE_KEY,
    snapshot
  );
  let observedOutbox = readRemoteCompletionOutbox(outboxStorage);
  const refreshDurableAccountState = (): void => {
    liveLocal = mergeLegacyProgressionStateAdvancements(
      liveLocal,
      readLegacyProgressionState(progressionStorage)
    );
    observedOutbox = readRemoteCompletionOutbox(outboxStorage);
  };
  const client = clientOverride ?? await getLegacyAuthClient();
  refreshDurableAccountState();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'missing-client');
  }

  const playerRead = await ensureRemotePlayerProgressionRow(client, snapshot.userId);
  refreshDurableAccountState();
  const aiRead = await ensureRemoteAiProgressionRow(client, snapshot.userId);
  refreshDurableAccountState();
  const prerequisiteError = playerRead.error ?? aiRead.error;
  if (prerequisiteError) {
    markAccountProgressionSyncPending(rootStorage, snapshot.userId, playerRead.revision);
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: prerequisiteError,
      pendingCompletionCount: observedOutbox.entries.length,
      progressionState: liveLocal,
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }

  let remoteState = playerRead.state ?? createEmptyLegacyProgressionState();
  if (aiRead.state) {
    remoteState = mergeRemoteAiTrackIntoProgression(remoteState, aiRead.state);
  }
  const telemetryStorage = createLegacyAuthScopedStorage(
    rootStorage,
    MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
    snapshot
  );
  const receipts = readMazeCycleTelemetryHistory(telemetryStorage).receipts;
  const playerGapAssessment = assessCompletionOutboxTrackGap(
    'play',
    remoteState.tracks.player,
    liveLocal.tracks.player,
    observedOutbox.entries
  );
  const aiGapAssessment = assessCompletionOutboxTrackGap(
    'menu-demo',
    remoteState.tracks['ai-runner'],
    liveLocal.tracks['ai-runner'],
    observedOutbox.entries
  );
  const playerRecovery = playerGapAssessment.exactlyCovered
    ? { entries: [], error: null }
    : deriveExactRemoteCompletionRecovery(
      'play',
      remoteState.tracks.player,
      liveLocal.tracks.player,
      receipts
    );
  const aiRecovery = aiGapAssessment.exactlyCovered
    ? { entries: [], error: null }
    : deriveExactRemoteCompletionRecovery(
      'menu-demo',
      remoteState.tracks['ai-runner'],
      liveLocal.tracks['ai-runner'],
      receipts
    );
  const recoveryError = playerRecovery.error ?? aiRecovery.error;
  if (recoveryError) {
    const currentLocal = mergeLegacyProgressionStateAdvancements(
      liveLocal,
      readLegacyProgressionState(progressionStorage)
    );
    const currentOutbox = readRemoteCompletionOutbox(outboxStorage);
    markAccountProgressionSyncPending(rootStorage, snapshot.userId, playerRead.revision);
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: recoveryError,
      pendingCompletionCount: currentOutbox.entries.length,
      progressionState: mergeLegacyProgressionStateAdvancements(remoteState, currentLocal),
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }

  const recoveredEntries = [...playerRecovery.entries, ...aiRecovery.entries];
  // Remote reads above can await long enough for another completion to append
  // to this account's durable outbox. Re-read both local progression and the
  // outbox immediately before the single reconciliation write, then union;
  // never replace current durable work with the pre-await snapshot.
  const currentLocal = mergeLegacyProgressionStateAdvancements(
    liveLocal,
    readLegacyProgressionState(progressionStorage)
  );
  const currentOutbox = readRemoteCompletionOutbox(outboxStorage);
  const existingIds = new Set(currentOutbox.entries.map((entry) => entry.clientRunId));
  const recoveredCompletionCount = recoveredEntries.filter(
    (entry) => !existingIds.has(entry.clientRunId)
  ).length;
  const reconciledEntries = mergeRecoveredCompletionEntries(
    recoveredEntries,
    currentOutbox.entries
  );
  const mustPersistReconciledOutbox = currentOutbox.entries.length > 0 || recoveredEntries.length > 0;
  if (
    mustPersistReconciledOutbox
    && !writeRemoteCompletionOutbox(outboxStorage, { entries: reconciledEntries, version: 1 })
  ) {
    markAccountProgressionSyncPending(rootStorage, snapshot.userId, playerRead.revision);
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: 'Recovered completion receipts could not be persisted for retry.',
      pendingCompletionCount: currentOutbox.entries.length,
      progressionState: mergeLegacyProgressionStateAdvancements(remoteState, currentLocal),
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }
  if (reconciledEntries.length > 0) {
    markAccountProgressionSyncPending(rootStorage, snapshot.userId, playerRead.revision);
  }

  return flushLegacyRemoteCompletionOutbox(
    snapshot,
    mergeLegacyProgressionStateAdvancements(remoteState, currentLocal),
    rootStorage,
    recoveredCompletionCount,
    client
  );
};

export const writeLegacyRemoteCompletion = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  previousState: LegacyProgressionState,
  state: LegacyProgressionState,
  receipt: MazeCycleTelemetryReceipt,
  env: Record<string, string | undefined> = readRuntimeEnv(),
  rootStorage: LegacyRootStorage | undefined = resolveRootStorage()
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'disabled');
  }
  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'guest');
  }
  const trackId = receipt.surface === 'play' ? 'player' : 'ai-runner';
  const previous = normalizeLegacyProgressionState(previousState).tracks[trackId];
  const current = normalizeLegacyProgressionState(state).tracks[trackId];
  if (
    current.level !== incrementLegacyProgressionOrdinal(previous.level)
    || current.completedCycles !== incrementLegacyProgressionOrdinal(previous.completedCycles)
  ) {
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: 'Local completion did not advance exactly one level and was not queued for remote sync.',
      pendingCompletionCount: readLegacyRemoteCompletionOutbox(rootStorage, snapshot).entries.length,
      progressionState: state,
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }

  const outboxStorage = createLegacyAuthScopedStorage(
    rootStorage,
    LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
    snapshot
  );
  const enqueue = enqueueRemoteCompletion(
    outboxStorage,
    createRemoteCompletionOutboxEntry(previous.level, receipt)
  );
  if (!enqueue.persisted) {
    markAccountProgressionSyncPending(rootStorage, snapshot.userId);
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: 'The completion is saved in local progression, but its cloud retry receipt could not be persisted.',
      pendingCompletionCount: enqueue.outbox.entries.length,
      progressionState: state,
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }
  markAccountProgressionSyncPending(rootStorage, snapshot.userId);
  return flushLegacyRemoteCompletionOutbox(snapshot, state, rootStorage);
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

  if (mode === 'advance') {
    return createLegacyRemoteProgressionSyncResult('progression', {
      completionSyncState: 'pending',
      error: 'Direct progression advancement is retired; completed runs must use the idempotent completion RPC outbox.',
      pendingCompletionCount: readLegacyRemoteCompletionOutbox(resolveRootStorage(), snapshot).entries.length,
      progressionState: state,
      recoveredCompletionCount: 0,
      skippedReason: null,
      synced: false
    });
  }

  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('progression', 'missing-client');
  }

  const storage = resolveRootStorage();
  const metadata = readAccountSyncMetadata(storage, snapshot.userId);
  let expectedRevision = metadata?.progressionRevision ?? null;
  if (expectedRevision === null) {
    const initialized = await ensureRemotePlayerProgressionRow(client, snapshot.userId);
    if (initialized.error || initialized.revision === null) {
      return createLegacyRemoteProgressionSyncResult('progression', {
        error: initialized.error ?? 'Progression initialization returned no account row.',
        skippedReason: null,
        synced: false
      });
    }
    expectedRevision = initialized.revision;
  }

  const response = await client.rpc('mazer_reset_progression', {
    p_expected_revision: expectedRevision,
    p_expected_user_id: snapshot.userId
  });
  if (response.error) {
    const remote = await readRemoteProgressionRow(client, snapshot.userId);
    return createLegacyRemoteProgressionSyncResult('progression', {
      error: response.error.message,
      ...(remote.row ? { progressionState: normalizeLegacyProgressionState(remote.row.state) } : {}),
      skippedReason: null,
      synced: false
    });
  }

  const row = readFirstRpcRow(response.data);
  if (!row || typeof row.revision !== 'number' || !Number.isFinite(row.revision) || !isRecord(row.state)) {
    return createLegacyRemoteProgressionSyncResult('progression', {
      error: 'Progression reset RPC returned an invalid canonical state.',
      skippedReason: null,
      synced: false
    });
  }
  const resolvedState = normalizeLegacyProgressionState(row.state);
  const nextRevision = normalizeRevision(row.revision);
  const nextMetadata: LegacyRemoteAccountSyncMetadata = {
    progressionRevision: nextRevision,
    progressionUpdatedAt: resolvedState.updatedAt,
    settingsFingerprint: metadata?.settingsFingerprint ?? null,
    settingsRevision: metadata?.settingsRevision ?? null
  };
  writeAccountSyncMetadata(storage, snapshot.userId, nextMetadata);
  if (legacyRemoteAccountBootstrap?.snapshot.userId === snapshot.userId) {
    legacyRemoteAccountBootstrap.progressionState = resolvedState;
  }

  return createLegacyRemoteProgressionSyncResult('progression', {
    error: null,
    progressionState: resolvedState,
    skippedReason: null,
    synced: true
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
