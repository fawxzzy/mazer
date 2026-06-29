export type LegacyPlayMode = 'menu' | 'play';

export const ACTIVE_PLAY_GOAL_RESET_HOLD_MS = 340;

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
