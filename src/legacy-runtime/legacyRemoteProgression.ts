import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import { getLegacyAuthClient } from './legacyAuth';
import {
  normalizeLegacyProgressionState,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from './legacyProgression';

export const LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY = 'VITE_MAZER_REMOTE_PROGRESSION';
export const LEGACY_REMOTE_AI_PROGRESSION_TABLE = 'mazer_ai_progression_states';
export const LEGACY_REMOTE_PROGRESSION_TABLE = 'mazer_progression_states';
export const LEGACY_REMOTE_AI_RUNNER_KEY = 'menu-runner';

export interface LegacyRemoteProgressionSyncResult {
  error: string | null;
  skippedReason: 'disabled' | 'guest' | 'missing-client' | null;
  synced: boolean;
}

const readRuntimeEnv = (): Record<string, string | undefined> => {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env ?? {};
};

export const isLegacyRemoteProgressionEnabled = (
  env: Record<string, string | undefined> = readRuntimeEnv()
): boolean => {
  const value = env[LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
};

export const createLegacyRemoteProgressionDisabledResult = (
  skippedReason: LegacyRemoteProgressionSyncResult['skippedReason']
): LegacyRemoteProgressionSyncResult => ({
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
  struggleCycles: track.struggleCycles,
  targetComplexity: track.targetComplexity
});

export const writeLegacyRemoteProgressionState = async (
  snapshot: Pick<LegacyAuthSessionSnapshot, 'status' | 'userId'>,
  state: LegacyProgressionState,
  env: Record<string, string | undefined> = readRuntimeEnv()
): Promise<LegacyRemoteProgressionSyncResult> => {
  if (!isLegacyRemoteProgressionEnabled(env)) {
    return createLegacyRemoteProgressionDisabledResult('disabled');
  }

  if (snapshot.status !== 'authenticated' || !snapshot.userId) {
    return createLegacyRemoteProgressionDisabledResult('guest');
  }

  const client = await getLegacyAuthClient();
  if (!client) {
    return createLegacyRemoteProgressionDisabledResult('missing-client');
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

  return {
    error: error.length > 0 ? error : null,
    skippedReason: null,
    synced: error.length === 0
  };
};
