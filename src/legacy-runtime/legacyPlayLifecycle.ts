export type LegacyPlayMode = 'menu' | 'play';
export type LegacyPlayDrawLifecyclePhase = 'idle' | 'building' | 'settled' | 'deconstructing';
export type LegacyPlayLifecyclePhase =
  | 'idle'
  | 'building'
  | 'ready'
  | 'playing'
  | 'goal-hold'
  | 'deconstructing'
  | 'handoff';
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

export interface LegacyPlayLifecycleSnapshot {
  phase: LegacyPlayLifecyclePhase;
  drawPhase: LegacyPlayDrawLifecyclePhase;
  inputLocked: boolean;
  timerRunning: boolean;
  playerVisible: boolean;
  trailVisible: boolean;
  compassSpinExpected: boolean;
  resetPending: boolean;
  generationPending: boolean;
  nextSeedQueued: boolean;
  overlayOpen: boolean;
  trailLength: number;
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

export const resolveLegacyPlayLifecycleSnapshot = ({
  drawPhase,
  generationPending,
  handoffActive,
  mode,
  nextSeedQueued,
  overlayOpen,
  playerAlpha,
  resetPending,
  stagedBuildVisible,
  timerStarted,
  trailAlpha,
  trailLength
}: {
  drawPhase: LegacyPlayDrawLifecyclePhase;
  generationPending: boolean;
  handoffActive: boolean;
  mode: LegacyPlayMode;
  nextSeedQueued: boolean;
  overlayOpen: boolean;
  playerAlpha: number;
  resetPending: boolean;
  stagedBuildVisible: boolean;
  timerStarted: boolean;
  trailAlpha: number;
  trailLength: number;
}): LegacyPlayLifecycleSnapshot => {
  if (mode !== 'play') {
    return {
      phase: 'idle',
      drawPhase,
      inputLocked: false,
      timerRunning: false,
      playerVisible: false,
      trailVisible: false,
      compassSpinExpected: false,
      resetPending,
      generationPending,
      nextSeedQueued,
      overlayOpen,
      trailLength: Math.max(0, Math.round(trailLength))
    };
  }

  const normalizedTrailLength = Math.max(0, Math.round(trailLength));
  const isDeconstructing = drawPhase === 'deconstructing';
  const isBuilding = drawPhase === 'building' || (!isDeconstructing && stagedBuildVisible);
  const phase: LegacyPlayLifecyclePhase = (() => {
    if (isDeconstructing && handoffActive) {
      return 'handoff';
    }
    if (isDeconstructing) {
      return 'deconstructing';
    }
    if (isBuilding) {
      return 'building';
    }
    if (resetPending) {
      return 'goal-hold';
    }
    return normalizedTrailLength <= 1 ? 'ready' : 'playing';
  })();
  const inputLocked = overlayOpen
    || resetPending
    || generationPending
    || isBuilding
    || isDeconstructing;

  return {
    phase,
    drawPhase,
    inputLocked,
    timerRunning: timerStarted && !inputLocked,
    playerVisible: !isBuilding && playerAlpha > 0.01,
    trailVisible: !isBuilding && normalizedTrailLength > 0 && trailAlpha > 0.01,
    compassSpinExpected: isBuilding || isDeconstructing,
    resetPending,
    generationPending,
    nextSeedQueued,
    overlayOpen,
    trailLength: normalizedTrailLength
  };
};
