import type { LegacyAuthSessionSnapshot } from './legacyAuth';
import { getLegacyAuthClient } from './legacyAuth';
import {
  normalizeLegacyProgressionState,
  type LegacyProgressionState
} from './legacyProgression';

export const LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY = 'VITE_MAZER_REMOTE_PROGRESSION';
export const LEGACY_REMOTE_PROGRESSION_TABLE = 'mazer_progression_states';

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
  const { error } = await client
    .from(LEGACY_REMOTE_PROGRESSION_TABLE)
    .upsert({
      last_completed_cycle_at: normalized.updatedAt,
      schema_version: normalized.version,
      state: normalized,
      updated_at: new Date().toISOString(),
      user_id: snapshot.userId
    }, {
      onConflict: 'user_id'
    });

  return {
    error: error?.message ?? null,
    skippedReason: null,
    synced: !error
  };
};
