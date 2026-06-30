import {
  createLegacyMaze,
  createLegacyMenuMaze,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import { clampInteger } from './legacyDefaults';
import { legacyTuning } from '../config/tuning';

export type LegacyGenerationMode = 'menu' | 'play';
export type LegacyMazeBuildKind = 'menu-snapshot' | 'play-generated';
export type LegacyGenerationProcessStageId = 0 | 3 | 4 | 5 | 6 | 7 | 8;
export type LegacyGenerationStageName = 'CreateGrid' | 'MapPath' | 'CreatePath' | 'CreateShortCuts' | 'Draw' | 'Finalize' | 'Reset';
export type LegacyGenerationDelayDurationSource = 'legacy-variable-unrecovered';
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
export type LegacyGenerationRequestReason =
  | 'boot-menu'
  | 'play-start'
  | 'menu-return'
  | 'menu-demo-goal-reset'
  | 'menu-demo-missing-episode'
  | 'overlay-rebuild';

export interface LegacyGenerationStageContract {
  batchSize: number | null;
  batchUnit: LegacyGenerationStageBatchUnit;
  executionKind: LegacyGenerationStageExecutionKind;
  id: LegacyGenerationProcessStageId;
  name: LegacyGenerationStageName;
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
  mode === 'menu' ? 'menu-snapshot' : 'play-generated'
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
  stageId: LegacyGenerationProcessStageId
): LegacyGenerationStageContract => {
  if (mode === 'play') {
    switch (stageId) {
      case 7:
        return {
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          executionKind: 'finalize-state',
          batchSize: null,
          batchUnit: null
        };
      case 8:
        return {
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          executionKind: 'reset-branch',
          batchSize: null,
          batchUnit: null
        };
      default:
        return {
          id: stageId,
          name: resolveLegacyGenerationStageName(stageId),
          executionKind: 'full-stage',
          batchSize: null,
          batchUnit: null
        };
    }
  }

  switch (stageId) {
    case 0:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'row-slice',
        batchSize: 1,
        batchUnit: 'rows'
      };
    case 3:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'checkpoint-pass',
        batchSize: 1,
        batchUnit: 'checkpoint-passes'
      };
    case 4:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'path-batch',
        batchSize: 4,
        batchUnit: 'path-tiles'
      };
    case 5:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'shortcut-attempt',
        batchSize: 1,
        batchUnit: 'shortcut-attempts'
      };
    case 6:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'row-slice',
        batchSize: 1,
        batchUnit: 'rows'
      };
    case 7:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'finalize-state',
        batchSize: null,
        batchUnit: null
      };
    case 8:
      return {
        id: stageId,
        name: resolveLegacyGenerationStageName(stageId),
        executionKind: 'reset-branch',
        batchSize: null,
        batchUnit: null
      };
    default:
      return stageId satisfies never;
  }
};

export const resolveLegacyGenerationExecutionPlan = (
  mode: LegacyGenerationMode,
  scale: number
): LegacyGenerationStageContract[] => (
  resolveLegacyGenerationProcessStageIds(scale).map((stageId) => createLegacyStageContract(mode, stageId))
);

export const createLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number
): LegacyMazeSnapshot => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale);
  const gate = resolveLegacyGenerationTickGateContract();
  const maze = buildKind === 'menu-snapshot'
    ? createLegacyMenuMaze(seed)
    : createLegacyMaze(scale, seed);

  return {
    ...maze,
    generation: {
      budget,
      buildKind,
      executionPlan,
      gate,
      processStageIds: resolveLegacyGenerationProcessStageIds(scale)
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

  return {
    mode,
    reason,
    seed,
    dueAtMs: Math.max(0, Math.round(dueAtMs)),
    queuedAtMs: Math.max(0, Math.round(queuedAtMs)),
    budget: resolveLegacyGenerationBudgetContract(mode, scale),
    buildKind: resolveLegacyMazeBuildKind(mode),
    executionPlan: resolveLegacyGenerationExecutionPlan(mode, scale),
    gate: resolveLegacyGenerationTickGateContract(),
    processStageIds: resolveLegacyGenerationProcessStageIds(scale)
  };
};

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
