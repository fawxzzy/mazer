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
export type LegacyEndlessLifecycleEvent = 'abandon' | 'complete' | 'fail-current-attempt' | 'resume' | 'start';
export type LegacyEndlessLifecycleEffect = 'advance-checkpoint' | 'none' | 'reset-current-attempt' | 'resume-current-attempt';
export type LegacyEndlessLifecycleStatus = 'active' | 'abandoned';

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

// This is deliberately storage- and scene-agnostic. Runtime wiring follows only after
// this contract has fixture proof and an explicit migration plan.
export interface LegacyEndlessLifecycleState {
  attempt: number;
  checkpointLevel: number | null;
  currentLevel: number;
  status: LegacyEndlessLifecycleStatus;
  version: 1;
}

export interface LegacyEndlessLifecycleTransition {
  effect: LegacyEndlessLifecycleEffect;
  event: LegacyEndlessLifecycleEvent;
  state: LegacyEndlessLifecycleState;
}

export interface LegacyPlayLifecycleSnapshot {
  phase: LegacyPlayLifecyclePhase;
  drawPhase: LegacyPlayDrawLifecyclePhase;
  inputLocked: boolean;
  timerRunning: boolean;
  playerVisible: boolean;
  trailVisible: boolean;
  resetPending: boolean;
  generationPending: boolean;
  nextSeedQueued: boolean;
  overlayOpen: boolean;
  trailLength: number;
}

export const ACTIVE_PLAY_GOAL_RESET_HOLD_MS = 340;
export const LEGACY_RESET_ENTRY_STAGE_ID: LegacyResetEntryStageId = 8;

const normalizeEndlessLevel = (level: number): number => Math.max(0, Math.round(level));

const copyLegacyEndlessLifecycleState = (
  state: LegacyEndlessLifecycleState
): LegacyEndlessLifecycleState => ({ ...state });

export const createLegacyEndlessLifecycleState = (
  initialLevel = 0
): LegacyEndlessLifecycleState => ({
  attempt: 1,
  checkpointLevel: null,
  currentLevel: normalizeEndlessLevel(initialLevel),
  status: 'active',
  version: 1
});

export const resolveLegacyEndlessLifecycleTransition = (
  state: LegacyEndlessLifecycleState,
  event: LegacyEndlessLifecycleEvent
): LegacyEndlessLifecycleTransition => {
  const current = copyLegacyEndlessLifecycleState(state);

  switch (event) {
    case 'start':
      return { effect: 'none', event, state: { ...current, status: 'active' } };
    case 'complete':
      return {
        effect: 'advance-checkpoint',
        event,
        state: {
          ...current,
          attempt: 1,
          checkpointLevel: current.currentLevel,
          currentLevel: current.currentLevel + 1,
          status: 'active'
        }
      };
    case 'fail-current-attempt':
      return {
        effect: 'reset-current-attempt',
        event,
        state: { ...current, attempt: current.attempt + 1, status: 'active' }
      };
    case 'abandon':
      return { effect: 'none', event, state: { ...current, status: 'abandoned' } };
    case 'resume':
      return {
        effect: 'resume-current-attempt',
        event,
        state: { ...current, status: 'active' }
      };
    default:
      return event satisfies never;
  }
};

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

export const shouldSettleLegacyStaticDrawStage = ({
  drawPhase,
  rowsVisible,
  tilesVisible
}: {
  drawPhase: LegacyPlayDrawLifecyclePhase;
  rowsVisible: number | null;
  tilesVisible: number | null;
}): boolean => (
  drawPhase === 'building'
  && rowsVisible === null
  && tilesVisible === null
);

const resolveLegacyStaticDrawCounterRemainingMs = ({
  batchSize,
  currentVisible,
  nextStepAtMs,
  nowMs,
  stepMs,
  total
}: {
  batchSize: number;
  currentVisible: number | null;
  nextStepAtMs: number;
  nowMs: number;
  stepMs: number;
  total: number;
}): number => {
  if (currentVisible === null || currentVisible >= total) {
    return 0;
  }

  const safeBatchSize = Math.max(1, Math.round(batchSize));
  const remainingTicks = Math.ceil(Math.max(0, total - currentVisible) / safeBatchSize);
  return Math.max(0, nextStepAtMs - nowMs)
    + (Math.max(0, remainingTicks - 1) * Math.max(0, stepMs));
};

/**
 * Projects the later of the independent row and interleaved-tile build
 * counters. Effects that must arrive with the final draw step use this one
 * clock instead of attaching to whichever counter happens to finish first.
 */
export const resolveLegacyStaticDrawBuildRemainingMs = ({
  drawPhase,
  mazeHeight,
  nextRowAtMs,
  nextTileAtMs,
  nowMs,
  rowBatchSize,
  rowStepMs,
  rowsVisible,
  tileBatchSize,
  tileCount,
  tileStepMs,
  tilesVisible
}: {
  drawPhase: LegacyPlayDrawLifecyclePhase;
  mazeHeight: number;
  nextRowAtMs: number;
  nextTileAtMs: number;
  nowMs: number;
  rowBatchSize: number;
  rowStepMs: number;
  rowsVisible: number | null;
  tileBatchSize: number;
  tileCount: number;
  tileStepMs: number;
  tilesVisible: number | null;
}): number | null => {
  if (drawPhase !== 'building') {
    return null;
  }

  const rowRemainingMs = resolveLegacyStaticDrawCounterRemainingMs({
    batchSize: rowBatchSize,
    currentVisible: rowsVisible,
    nextStepAtMs: nextRowAtMs,
    nowMs,
    stepMs: rowStepMs,
    total: Math.max(0, mazeHeight)
  });
  const tileRemainingMs = resolveLegacyStaticDrawCounterRemainingMs({
    batchSize: tileBatchSize,
    currentVisible: tilesVisible,
    nextStepAtMs: nextTileAtMs,
    nowMs,
    stepMs: tileStepMs,
    total: Math.max(0, tileCount)
  });
  return Math.max(rowRemainingMs, tileRemainingMs);
};

export const resolveLegacyStaticDrawPlayTimerStartAtMs = ({
  currentStartedAtMs,
  drawPhase,
  mode,
  nowMs,
  rowsVisible,
  tilesVisible
}: {
  currentStartedAtMs: number;
  drawPhase: LegacyPlayDrawLifecyclePhase;
  mode: LegacyPlayMode;
  nowMs: number;
  rowsVisible: number | null;
  tilesVisible: number | null;
}): number => (
  mode === 'play' && shouldSettleLegacyStaticDrawStage({
    drawPhase,
    rowsVisible,
    tilesVisible
  })
    ? nowMs
    : currentStartedAtMs
);

export const shouldFreezeLegacyPlayElapsedForStaticDraw = ({
  drawPhase,
  rowsVisible,
  tilesVisible
}: {
  drawPhase: LegacyPlayDrawLifecyclePhase;
  rowsVisible: number | null;
  tilesVisible: number | null;
}): boolean => (
  drawPhase === 'building'
  || rowsVisible !== null
  || tilesVisible !== null
);

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
    resetPending,
    generationPending,
    nextSeedQueued,
    overlayOpen,
    trailLength: normalizedTrailLength
  };
};
