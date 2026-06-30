export type LegacyPlayMode = 'menu' | 'play';
export type LegacyResetEntryStageId = 8;
export type LegacyResetAction = 'regenerate-maze' | 'return-menu';
export type LegacyResetReason = 'goal';

export interface LegacyResetEntryContract {
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

export const resolveLegacyResetAction = (mode: LegacyPlayMode): LegacyResetAction => (
  mode === 'play' ? 'return-menu' : 'regenerate-maze'
);

export const resolveLegacyResetEntryContract = (mode: LegacyPlayMode): LegacyResetEntryContract => ({
  entryStageId: LEGACY_RESET_ENTRY_STAGE_ID,
  clearsResetFlagOnConsume: true,
  consumesWhileInitialized: true,
  rearmsDelayStart: mode === 'menu',
  returnsToTemplateLevel: mode === 'play'
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

export const hasPendingLegacyPlayResetReturn = (
  mode: LegacyPlayMode,
  playResetReturnAtMs: number
): boolean => mode === 'play' && playResetReturnAtMs > 0;

export const shouldConsumeLegacyPlayResetReturn = (
  mode: LegacyPlayMode,
  playResetReturnAtMs: number,
  nowMs: number
): boolean => hasPendingLegacyPlayResetReturn(mode, playResetReturnAtMs) && nowMs >= playResetReturnAtMs;

export const scheduleLegacyPlayResetReturnAtMs = (
  nowMs: number,
  holdMs = ACTIVE_PLAY_GOAL_RESET_HOLD_MS
): number => nowMs + Math.max(0, holdMs);
