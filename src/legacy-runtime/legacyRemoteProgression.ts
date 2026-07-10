import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import { getLegacyAuthClient } from './legacyAuth';
import {
  normalizeLegacyProgressionState,
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
export const LEGACY_REMOTE_AI_RUNNER_KEY = 'menu-runner';

export interface LegacyRemoteProgressionSyncResult {
  error: string | null;
  playerMessage: LegacyPlayerMessage | null;
  skippedReason: LegacyRemoteSkippedReason;
  synced: boolean;
}

const readRuntimeEnv = (): Record<string, string | undefined> => {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env ?? {};

  return {
    ...env,
    [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: import.meta.env.VITE_MAZER_REMOTE_PROGRESSION
  };
};

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
  env: Record<string, string | undefined> = readRuntimeEnv()
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

  const normalized = normalizeLegacyProgressionState(state);
  const playerTrack = normalized.tracks.player;
  const aiTrack = normalized.tracks['ai-runner'];
  const updatedAt = new Date().toISOString();

  const { error: playerError } = await client
    .from(LEGACY_REMOTE_PROGRESSION_TABLE)
    .upsert({
      last_completed_cycle_at: playerTrack.lastCompletedAt ?? normalized.updatedAt,
      player_completed_cycles: playerTrack.completedCycles,
      player_level: playerTrack.level,
      player_rank: playerTrack.rank,
      player_target_complexity: playerTrack.targetComplexity,
      schema_version: normalized.version,
      state: normalized,
      updated_at: updatedAt,
      user_id: snapshot.userId
    }, {
      onConflict: 'user_id'
    });

  const { error: aiError } = await client
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
      updated_at: updatedAt,
      user_id: snapshot.userId
    }, {
      onConflict: 'user_id,runner_key'
    });

  const error = [playerError, aiError]
    .filter((candidate) => candidate?.message)
    .map((candidate) => candidate!.message)
    .join('; ');

  return createLegacyRemoteProgressionSyncResult('progression', {
    error: error.length > 0 ? error : null,
    skippedReason: null,
    synced: error.length === 0
  });
};
