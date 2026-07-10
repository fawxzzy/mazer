export type LegacyPlayMode = 'menu' | 'play';
export type LegacyResetEntryStageId = 8;
export type LegacyResetAction = 'regenerate-maze' | 'return-menu';
export type LegacyResetReason = 'goal';

export interface LegacyResetEntryContract {
  bypassesLevelBuildingDelay: boolean;
  clearsResetFlagOnConsume: boolean;
  consumesWhileInitialized: boolean;
  entryStageId: LegacyResetEntryStageId;
  rearmsDelayStart: boolean;
  returnsToTemplateLevel: boolean;
}

export interface LegacyResetRequest {
  action: LegacyResetAction;
  entry: LegacyResetEntryContract;
  dueAtMs: number;
  mode: LegacyPlayMode;
  reason: LegacyResetReason;
}

export const ACTIVE_PLAY_GOAL_RESET_HOLD_MS = 340;
export const LEGACY_RESET_ENTRY_STAGE_ID: LegacyResetEntryStageId = 8;

export const resolveLegacyResetAction = (_mode: LegacyPlayMode): LegacyResetAction => (
  'regenerate-maze'
);

export const resolveLegacyResetEntryContract = (mode: LegacyPlayMode): LegacyResetEntryContract => ({
  entryStageId: LEGACY_RESET_ENTRY_STAGE_ID,
  bypassesLevelBuildingDelay: true,
  clearsResetFlagOnConsume: true,
  consumesWhileInitialized: true,
  rearmsDelayStart: mode === 'menu',
  returnsToTemplateLevel: false
});

export const createLegacyResetRequest = ({
  delayMs,
  mode,
  nowMs,
  reason = 'goal'
}: {
  delayMs?: number;
  mode: LegacyPlayMode;
  nowMs: number;
  reason?: LegacyResetReason;
}): LegacyResetRequest => ({
  action: resolveLegacyResetAction(mode),
  entry: resolveLegacyResetEntryContract(mode),
  dueAtMs: Math.max(0, Math.round(nowMs + Math.max(0, delayMs ?? (mode === 'play' ? ACTIVE_PLAY_GOAL_RESET_HOLD_MS : 0)))),
  mode,
  reason
});

export const hasPendingLegacyResetRequest = (
  request: LegacyResetRequest | null
): boolean => request !== null;

export const shouldConsumeLegacyResetRequest = (
  request: LegacyResetRequest | null,
  nowMs: number
): boolean => request !== null && nowMs >= request.dueAtMs;
