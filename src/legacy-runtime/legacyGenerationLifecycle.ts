import {
  createLegacyGeneratedMenuMaze,
  createLegacyMaze,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import { clampInteger } from './legacyDefaults';
import { legacyTuning } from '../config/tuning';

export type LegacyGenerationMode = 'menu' | 'play';
export type LegacyMazeBuildKind = 'menu-generated' | 'play-generated';
export type LegacyGenerationProcessStageId = 0 | 3 | 4 | 5 | 6 | 7 | 8;
export type LegacyGenerationStageName = 'CreateGrid' | 'MapPath' | 'CreatePath' | 'CreateShortCuts' | 'Draw' | 'Finalize' | 'Reset';
export type LegacyGenerationDelayDurationSource = 'legacy-variable-unrecovered';
export type LegacyGenerationCompletionSignal =
  | 'grid-spawn-complete'
  | 'checkpoint-budget-exhausted'
  | 'path-array-exhausted'
  | 'shortcut-budget-exhausted'
  | 'draw-iteration-complete'
  | 'player-finalized'
  | 'menu-reset-delay-rearmed'
  | 'play-reset-template-return';
export type LegacyGenerationStageExecutionKind =
  | 'full-stage'
  | 'row-slice'
  | 'checkpoint-pass'
  | 'path-batch'
  | 'shortcut-attempt'
  | 'finalize-state'
  | 'reset-branch';
export type LegacyGenerationStageBatchUnit = 'rows' | 'checkpoint-passes' | 'path-tiles' | 'shortcut-attempts' | null;
export type LegacyGenerationEntryStageId = 0;
export type LegacyGenerationStageCursorPhase = 'queued-entry' | 'consumed-finalized' | 'reset-branch';
export type LegacyGenerationRequestReason =
  | 'boot-menu'
  | 'play-start'
  | 'menu-return'
  | 'menu-demo-goal-reset'
  | 'menu-demo-missing-episode'
  | 'overlay-rebuild';

export interface LegacyGenerationStageContract {
  advancesToStageId: LegacyGenerationProcessStageId | null;
  batchSize: number | null;
  batchUnit: LegacyGenerationStageBatchUnit;
  completionSignal: LegacyGenerationCompletionSignal;
  executionKind: LegacyGenerationStageExecutionKind;
  id: LegacyGenerationProcessStageId;
  name: LegacyGenerationStageName;
  skipToStageIdWhenDisabled: LegacyGenerationProcessStageId | null;
}

export interface LegacyGenerationStageCursor {
  completionSignal: LegacyGenerationCompletionSignal;
  currentStageId: LegacyGenerationProcessStageId;
  phase: LegacyGenerationStageCursorPhase;
  previousStageIds: LegacyGenerationProcessStageId[];
  processComplete: boolean;
  remainingStageIds: LegacyGenerationProcessStageId[];
}

export interface LegacyGenerationBudgetContract {
  checkpointCount: number;
  checkpointModifier: number;
  scale: number;
  shortcutCount: number;
  shortcutCountModifier: number;
  shortcutStageEnabled: boolean;
}

export interface LegacyGenerationTickGateContract {
  armsDelayStartOnQueue: boolean;
  consumesWhileInitialized: boolean;
  consumesWhileUninitialized: boolean;
  entryStageId: LegacyGenerationEntryStageId;
  initializedResetBypassesDelayGate: boolean;
  levelBuildingDelayDurationMs: number | null;
  levelBuildingDelayDurationSource: LegacyGenerationDelayDurationSource;
  requiresLevelBuildingDelayStartedFlag: boolean;
  requiresLevelBuildingStartTime: boolean;
  resetsLevelBuildingTimerAfterConsume: boolean;
  waitsForLevelBuildingDelay: boolean;
}

export interface LegacyGenerationRequest {
  budget: LegacyGenerationBudgetContract;
  buildKind: LegacyMazeBuildKind;
  dueAtMs: number;
  executionPlan: LegacyGenerationStageContract[];
  gate: LegacyGenerationTickGateContract;
  mode: LegacyGenerationMode;
  processStageIds: LegacyGenerationProcessStageId[];
  queuedAtMs: number;
  reason: LegacyGenerationRequestReason;
  seed: number;
  stageCursor: LegacyGenerationStageCursor;
}

export interface LegacyGenerationConsumption {
  initialPlayer: LegacyPoint;
  initialTrail: LegacyPoint[];
  maze: LegacyMazeSnapshot;
  startsPlayTimer: boolean;
  titleVisible: boolean;
}

export const LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS: readonly LegacyGenerationProcessStageId[] = [0, 3, 4, 6, 7, 8];
export const LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID: LegacyGenerationProcessStageId = 5;
export const LEGACY_GENERATION_ENTRY_STAGE_ID: LegacyGenerationEntryStageId = 0;
export const LEGACY_LEVEL_BUILDING_DELAY_DURATION_MS: number | null = null;
export const LEGACY_LEVEL_BUILDING_DELAY_DURATION_SOURCE: LegacyGenerationDelayDurationSource = 'legacy-variable-unrecovered';

const LEGACY_MIN_SCALE = 25;
const LEGACY_MAX_SCALE = 150;

const resolveLegacyGenerationScale = (scale: number): number => (
  clampInteger(scale, LEGACY_MIN_SCALE, LEGACY_MAX_SCALE)
);

const resolveLegacyShortcutCountModifier = (mode: LegacyGenerationMode): number => (
  mode === 'menu'
    ? legacyTuning.board.shortcutCountModifier.menu
    : legacyTuning.board.shortcutCountModifier.game
);

export const resolveLegacyGenerationBudgetContract = (
  mode: LegacyGenerationMode,
  scale: number
): LegacyGenerationBudgetContract => {
  const normalizedScale = resolveLegacyGenerationScale(scale);
  const checkpointModifier = legacyTuning.board.checkPointModifier;
  const shortcutCountModifier = resolveLegacyShortcutCountModifier(mode);

  return {
    scale: normalizedScale,
    checkpointModifier,
    checkpointCount: Math.trunc(normalizedScale + (normalizedScale * checkpointModifier)),
    shortcutCountModifier,
    shortcutCount: Math.trunc(normalizedScale * shortcutCountModifier),
    shortcutStageEnabled: normalizedScale > 35
  };
};

export const resolveLegacyGenerationTickGateContract = (): LegacyGenerationTickGateContract => ({
  entryStageId: LEGACY_GENERATION_ENTRY_STAGE_ID,
  waitsForLevelBuildingDelay: true,
  armsDelayStartOnQueue: true,
  consumesWhileUninitialized: true,
  consumesWhileInitialized: false,
  requiresLevelBuildingStartTime: true,
  requiresLevelBuildingDelayStartedFlag: true,
  levelBuildingDelayDurationMs: LEGACY_LEVEL_BUILDING_DELAY_DURATION_MS,
  levelBuildingDelayDurationSource: LEGACY_LEVEL_BUILDING_DELAY_DURATION_SOURCE,
  initializedResetBypassesDelayGate: true,
  resetsLevelBuildingTimerAfterConsume: true
});

export const resolveLegacyGenerationProcessStageIds = (scale: number): LegacyGenerationProcessStageId[] => (
  resolveLegacyGenerationScale(scale) > 35
    ? [...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS.slice(0, 3), LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID, ...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS.slice(3)]
    : [...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS]
);

export const resolveLegacyMazeBuildKind = (mode: LegacyGenerationMode): LegacyMazeBuildKind => (
  mode === 'menu' ? 'menu-generated' : 'play-generated'
);

const resolveLegacyGenerationStageName = (
  stageId: LegacyGenerationProcessStageId
): LegacyGenerationStageName => {
  switch (stageId) {
    case 0:
      return 'CreateGrid';
    case 3:
      return 'MapPath';
    case 4:
      return 'CreatePath';
    case 5:
      return 'CreateShortCuts';
    case 6:
      return 'Draw';
    case 7:
      return 'Finalize';
    case 8:
      return 'Reset';
    default:
      return stageId satisfies never;
  }
};

const createLegacyStageContract = (
  mode: LegacyGenerationMode,
  stageId: LegacyGenerationProcessStageId,
  shortcutStageEnabled: boolean
): LegacyGenerationStageContract => {
  const pathStageAdvanceTarget: LegacyGenerationProcessStageId = shortcutStageEnabled ? 5 : 6;

  if (mode === 'play') {
    switch (stageId) {
      case 7:
        return {
          advancesToStageId: null,
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          completionSignal: 'player-finalized',
          executionKind: 'finalize-state',
          batchSize: null,
          batchUnit: null,
          skipToStageIdWhenDisabled: null
        };
      case 8:
        return {
          advancesToStageId: null,
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          completionSignal: 'play-reset-template-return',
          executionKind: 'reset-branch',
          batchSize: null,
          batchUnit: null,
          skipToStageIdWhenDisabled: null
        };
      default:
        return {
          advancesToStageId: stageId === 0 ? 3 : stageId === 3 ? 4 : stageId === 4 ? pathStageAdvanceTarget : stageId === 5 ? 6 : 7,
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          completionSignal: stageId === 0
            ? 'grid-spawn-complete'
            : stageId === 3
              ? 'checkpoint-budget-exhausted'
              : stageId === 4
                ? 'path-array-exhausted'
                : stageId === 5
                  ? 'shortcut-budget-exhausted'
                  : 'draw-iteration-complete',
          executionKind: 'full-stage',
          batchSize: null,
          batchUnit: null,
          skipToStageIdWhenDisabled: stageId === 5 ? 6 : null
        };
    }
  }

  switch (stageId) {
    case 0:
      return {
        advancesToStageId: 3,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'grid-spawn-complete',
        executionKind: 'row-slice',
        batchSize: 1,
        batchUnit: 'rows',
        skipToStageIdWhenDisabled: null
      };
    case 3:
      return {
        advancesToStageId: 4,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'checkpoint-budget-exhausted',
        executionKind: 'checkpoint-pass',
        batchSize: 1,
        batchUnit: 'checkpoint-passes',
        skipToStageIdWhenDisabled: null
      };
    case 4:
      return {
        advancesToStageId: pathStageAdvanceTarget,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'path-array-exhausted',
        executionKind: 'path-batch',
        batchSize: 4,
        batchUnit: 'path-tiles',
        skipToStageIdWhenDisabled: null
      };
    case 5:
      return {
        advancesToStageId: 6,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'shortcut-budget-exhausted',
        executionKind: 'shortcut-attempt',
        batchSize: 1,
        batchUnit: 'shortcut-attempts',
        skipToStageIdWhenDisabled: 6
      };
    case 6:
      return {
        advancesToStageId: 7,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'draw-iteration-complete',
        executionKind: 'row-slice',
        batchSize: 1,
        batchUnit: 'rows',
        skipToStageIdWhenDisabled: null
      };
    case 7:
      return {
        advancesToStageId: null,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'player-finalized',
        executionKind: 'finalize-state',
        batchSize: null,
        batchUnit: null,
        skipToStageIdWhenDisabled: null
      };
    case 8:
      return {
        advancesToStageId: LEGACY_GENERATION_ENTRY_STAGE_ID,
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        completionSignal: 'menu-reset-delay-rearmed',
        executionKind: 'reset-branch',
        batchSize: null,
        batchUnit: null,
        skipToStageIdWhenDisabled: null
      };
    default:
      return stageId satisfies never;
  }
};

export const resolveLegacyGenerationExecutionPlan = (
  mode: LegacyGenerationMode,
  scale: number
): LegacyGenerationStageContract[] => {
  const budget = resolveLegacyGenerationBudgetContract(mode, scale);

  return resolveLegacyGenerationProcessStageIds(scale)
    .map((stageId) => createLegacyStageContract(mode, stageId, budget.shortcutStageEnabled));
};

export const resolveLegacyGenerationStageCursor = (
  executionPlan: readonly LegacyGenerationStageContract[],
  phase: LegacyGenerationStageCursorPhase
): LegacyGenerationStageCursor => {
  const fallbackStage = executionPlan[0];
  const stage = executionPlan.find((candidate) => (
    phase === 'queued-entry'
      ? candidate.id === LEGACY_GENERATION_ENTRY_STAGE_ID
      : phase === 'consumed-finalized'
        ? candidate.id === 7
        : candidate.id === 8
  )) ?? fallbackStage;

  if (!stage) {
    throw new Error('Legacy generation stage cursor requires a non-empty execution plan.');
  }

  const stageIndex = executionPlan.findIndex((candidate) => candidate.id === stage.id);

  return {
    phase,
    currentStageId: stage.id,
    completionSignal: stage.completionSignal,
    previousStageIds: executionPlan.slice(0, Math.max(0, stageIndex)).map((candidate) => candidate.id),
    remainingStageIds: executionPlan.slice(stageIndex + 1).map((candidate) => candidate.id),
    processComplete: phase === 'consumed-finalized'
  };
};

export const createLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number
): LegacyMazeSnapshot => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale);
  const gate = resolveLegacyGenerationTickGateContract();
  const resolvedShortcutCount = budget.shortcutStageEnabled ? budget.shortcutCount : 0;
  const maze = buildKind === 'menu-generated'
    ? createLegacyGeneratedMenuMaze(scale, seed, resolvedShortcutCount)
    : createLegacyMaze(scale, seed, resolvedShortcutCount);

  return {
    ...maze,
    generation: {
      budget,
      buildKind,
      executionPlan,
      gate,
      processStageIds: resolveLegacyGenerationProcessStageIds(scale),
      stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'consumed-finalized')
    }
  };
};

export const stepLegacyGenerationSeed = (seed: number): number => (seed + 1) >>> 0;

export const createLegacyGenerationRequest = ({
  currentSeed,
  dueAtMs,
  mode,
  queuedAtMs = dueAtMs,
  reason,
  scale,
  stepSeed = false
}: {
  currentSeed: number;
  dueAtMs: number;
  mode: LegacyGenerationMode;
  queuedAtMs?: number;
  reason: LegacyGenerationRequestReason;
  scale: number;
  stepSeed?: boolean;
}): LegacyGenerationRequest => {
  const seed = stepSeed ? stepLegacyGenerationSeed(currentSeed) : currentSeed;
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale);

  return {
    mode,
    reason,
    seed,
    dueAtMs: Math.max(0, Math.round(dueAtMs)),
    queuedAtMs: Math.max(0, Math.round(queuedAtMs)),
    budget: resolveLegacyGenerationBudgetContract(mode, scale),
    buildKind: resolveLegacyMazeBuildKind(mode),
    executionPlan,
    gate: resolveLegacyGenerationTickGateContract(),
    processStageIds: resolveLegacyGenerationProcessStageIds(scale),
    stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'queued-entry')
  };
};

export const createLegacyMenuResetGenerationRequest = ({
  currentSeed,
  nowMs,
  scale
}: {
  currentSeed: number;
  nowMs: number;
  scale: number;
}): LegacyGenerationRequest => createLegacyGenerationRequest({
  currentSeed,
  dueAtMs: nowMs,
  mode: 'menu',
  queuedAtMs: nowMs,
  reason: 'menu-demo-goal-reset',
  scale,
  stepSeed: true
});

export const shouldConsumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest | null,
  nowMs: number
): boolean => request !== null && nowMs >= request.dueAtMs;

export const consumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest,
  scale: number
): LegacyMazeSnapshot => createLegacyRuntimeMazeForMode(request.mode, scale, request.seed);

export const consumeLegacyGenerationRequestState = (
  request: LegacyGenerationRequest,
  scale: number
): LegacyGenerationConsumption => {
  const maze = consumeLegacyGenerationRequest(request, scale);
  const initialPlayer = { ...maze.start };

  return {
    maze,
    initialPlayer,
    initialTrail: [{ ...maze.start }],
    startsPlayTimer: request.mode === 'play',
    titleVisible: request.mode === 'menu'
  };
};
