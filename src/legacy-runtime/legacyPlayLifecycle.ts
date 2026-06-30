export type LegacyPlayMode = 'menu' | 'play';
export type LegacyResetAction = 'regenerate-maze' | 'return-menu';
export type LegacyResetReason = 'goal';

export interface LegacyResetRequest {
  action: LegacyResetAction;
  dueAtMs: number;
  mode: LegacyPlayMode;
  reason: LegacyResetReason;
}

export const ACTIVE_PLAY_GOAL_RESET_HOLD_MS = 340;

export const resolveLegacyResetAction = (mode: LegacyPlayMode): LegacyResetAction => (
  mode === 'play' ? 'return-menu' : 'regenerate-maze'
);

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
