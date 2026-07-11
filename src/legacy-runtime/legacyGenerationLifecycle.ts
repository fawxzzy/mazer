import {
  createLegacyGeneratedMenuMaze,
  createLegacyMaze,
  normalizeLegacyMazeGenerationProfile,
  type LegacyMazeSnapshot,
  type LegacyMazeGenerationProfile,
  type LegacyPoint
} from './legacyMaze';
import { normalizeLegacyRuntimeSeed } from './legacyRuntimeSeed';
import { clampInteger } from './legacyDefaults';
import { resolveLegacyMazeComplexity } from './legacyProgression';
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
  | 'play-goal-reset'
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
  generationProfile?: LegacyMazeGenerationProfile;
  mode: LegacyGenerationMode;
  processStageIds: LegacyGenerationProcessStageId[];
  queuedAtMs: number;
  reason: LegacyGenerationRequestReason;
  selectionCandidateCount?: number;
  selectionTolerance?: number;
  seed: number;
  stageCursor: LegacyGenerationStageCursor;
  targetComplexity?: number;
}

export interface LegacyGenerationConsumption {
  initialPlayer: LegacyPoint;
  initialTrail: LegacyPoint[];
  maze: LegacyMazeSnapshot;
  startsPlayTimer: boolean;
  titleVisible: boolean;
}

export interface LegacyGenerationSelectionOptions {
  candidateCount?: number;
  targetComplexity?: number | null;
  tolerance?: number;
}

export interface LegacyGenerationSelectionReview {
  adaptiveRetryCandidateCount: number;
  adaptiveRetryScale: number | null;
  adaptiveRetryUsed: boolean;
  allCandidatesOverTarget: boolean;
  allCandidatesUnderTarget: boolean;
  candidateCount: number;
  candidateComplexityMax: number;
  candidateComplexityMin: number;
  delivery: 'under-target' | 'on-target' | 'over-target';
  difference: number;
  initialWindowOverTarget: boolean;
  initialWindowUnderTarget: boolean;
  measuredComplexity: number;
  pressureRetryCandidateCount: number;
  pressureRetryUsed: boolean;
  searchedCandidateCount: number;
  selectedDistance: number;
  selectedSeed: number;
  targetComplexity: number;
  tolerance: number;
}

export const LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS: readonly LegacyGenerationProcessStageId[] = [0, 3, 4, 6, 7, 8];
export const LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID: LegacyGenerationProcessStageId = 5;
export const LEGACY_GENERATION_ENTRY_STAGE_ID: LegacyGenerationEntryStageId = 0;
export const LEGACY_LEVEL_BUILDING_DELAY_DURATION_MS: number | null = null;
export const LEGACY_LEVEL_BUILDING_DELAY_DURATION_SOURCE: LegacyGenerationDelayDurationSource = 'legacy-variable-unrecovered';

const LEGACY_MIN_SCALE = 25;
const LEGACY_MAX_SCALE = 150;
export const LEGACY_GENERATION_SELECTION_DEFAULT_CANDIDATES = 3;
export const LEGACY_GENERATION_SELECTION_DEFAULT_TOLERANCE = 8;
export const LEGACY_GENERATION_SELECTION_MAX_CANDIDATES = 9;
export const LEGACY_GENERATION_SELECTION_ADAPTIVE_RETRY_CANDIDATES = 3;
export const LEGACY_GENERATION_SELECTION_PRESSURE_RETRY_CANDIDATES = 3;
export const LEGACY_GENERATION_SELECTION_PRESSURE_RETRY_MIN_TARGET = 46;
const LEGACY_MENU_MIN_SHORTCUT_COUNT = 6;

const resolveLegacyGenerationScale = (scale: number): number => (
  clampInteger(scale, LEGACY_MIN_SCALE, LEGACY_MAX_SCALE)
);

const resolveLegacyShortcutCountModifier = (mode: LegacyGenerationMode): number => (
  mode === 'menu'
    ? legacyTuning.board.shortcutCountModifier.menu
    : legacyTuning.board.shortcutCountModifier.game
);

const resolveLegacyShortcutCount = (
  mode: LegacyGenerationMode,
  normalizedScale: number,
  shortcutCountModifier: number
): number => {
  const formulaCount = Math.trunc(normalizedScale * shortcutCountModifier);
  if (mode !== 'menu' || normalizedScale <= 35) {
    return formulaCount;
  }

  return Math.max(LEGACY_MENU_MIN_SHORTCUT_COUNT, formulaCount);
};

export const resolveLegacyGenerationBudgetContract = (
  mode: LegacyGenerationMode,
  scale: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null
): LegacyGenerationBudgetContract => {
  const normalizedScale = resolveLegacyGenerationScale(scale);
  const checkpointModifier = legacyTuning.board.checkPointModifier;
  const shortcutCountModifier = resolveLegacyShortcutCountModifier(mode);
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  const baseCheckpointCount = Math.trunc(normalizedScale + (normalizedScale * checkpointModifier));
  const shortcutCount = clampInteger(
    Math.trunc(resolveLegacyShortcutCount(mode, normalizedScale, shortcutCountModifier) * profile.shortcutCountMultiplier),
    0,
    normalizedScale
  );

  return {
    scale: normalizedScale,
    checkpointModifier,
    checkpointCount: clampInteger(
      Math.trunc(baseCheckpointCount * profile.checkpointCountMultiplier),
      4,
      Math.trunc(normalizedScale * 2)
    ),
    shortcutCountModifier,
    shortcutCount,
    shortcutStageEnabled: normalizedScale > 35 && shortcutCount > 0
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

export const resolveLegacyGenerationProcessStageIds = (
  scale: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null,
  mode: LegacyGenerationMode = 'play'
): LegacyGenerationProcessStageId[] => (
  resolveLegacyGenerationBudgetContract(mode, scale, generationProfile).shortcutStageEnabled
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
  scale: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null
): LegacyGenerationStageContract[] => {
  const budget = resolveLegacyGenerationBudgetContract(mode, scale, generationProfile);

  return resolveLegacyGenerationProcessStageIds(scale, generationProfile, mode)
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

const classifyLegacyGenerationDelivery = (
  difference: number,
  tolerance: number
): LegacyGenerationSelectionReview['delivery'] => {
  if (difference < -tolerance) {
    return 'under-target';
  }
  if (difference > tolerance) {
    return 'over-target';
  }
  return 'on-target';
};

const resolveLegacyGenerationDefaultCandidateCount = (targetComplexity: number): number => {
  if (targetComplexity >= 144) {
    return 9;
  }
  if (targetComplexity >= 112) {
    return 7;
  }
  if (targetComplexity >= 72) {
    return 5;
  }
  return LEGACY_GENERATION_SELECTION_DEFAULT_CANDIDATES;
};

const buildLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null
): Omit<LegacyMazeSnapshot, 'generation'> => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale, profile);
  const resolvedShortcutCount = budget.shortcutStageEnabled ? budget.shortcutCount : 0;
  return buildKind === 'menu-generated'
    ? createLegacyGeneratedMenuMaze(scale, seed, resolvedShortcutCount, profile)
    : createLegacyMaze(scale, seed, resolvedShortcutCount, profile);
};

const createLegacyUnderTargetPressureProfile = (
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null
): LegacyMazeGenerationProfile => {
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  return normalizeLegacyMazeGenerationProfile({
    borderFeederTargetPerSide: Math.min(8, Math.max(2, (profile.borderFeederTargetPerSide ?? 0) + 1)),
    checkpointCountMultiplier: profile.checkpointCountMultiplier * 1.16,
    requiredOppositeBorderConnections: {
      horizontal: true,
      vertical: true
    },
    routeQualityReinforcementMultiplier: Math.max(0.65, profile.routeQualityReinforcementMultiplier * 1.18),
    shortcutCountMultiplier: Math.max(0.65, profile.shortcutCountMultiplier * 1.18)
  });
};

const createLegacyAdaptiveUnderTargetProfile = (
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null
): LegacyMazeGenerationProfile => {
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  return normalizeLegacyMazeGenerationProfile({
    borderFeederTargetPerSide: Math.min(8, Math.max(3, (profile.borderFeederTargetPerSide ?? 0) + 2)),
    checkpointCountMultiplier: profile.checkpointCountMultiplier * 1.28,
    requiredOppositeBorderConnections: {
      horizontal: true,
      vertical: true
    },
    routeQualityReinforcementMultiplier: Math.max(0.82, profile.routeQualityReinforcementMultiplier * 1.32),
    shortcutCountMultiplier: Math.max(0.82, profile.shortcutCountMultiplier * 1.28)
  });
};

const resolveLegacyAdaptiveUnderTargetScale = (scale: number): number => {
  const normalizedScale = resolveLegacyGenerationScale(scale);
  if (normalizedScale >= LEGACY_MAX_SCALE) {
    return normalizedScale;
  }

  return clampInteger(
    Math.max(normalizedScale + 2, Math.ceil(normalizedScale * 1.14)),
    LEGACY_MIN_SCALE,
    LEGACY_MAX_SCALE
  );
};

const selectLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null,
  selectionOptions: LegacyGenerationSelectionOptions = {}
): {
  maze: Omit<LegacyMazeSnapshot, 'generation'>;
  review?: LegacyGenerationSelectionReview;
} => {
  const targetComplexity = selectionOptions.targetComplexity;
  if (targetComplexity === null || targetComplexity === undefined || !Number.isFinite(targetComplexity)) {
    return {
      maze: buildLegacyRuntimeMazeForMode(mode, scale, seed, generationProfile)
    };
  }

  const candidateCount = clampInteger(
    selectionOptions.candidateCount ?? resolveLegacyGenerationDefaultCandidateCount(targetComplexity),
    1,
    LEGACY_GENERATION_SELECTION_MAX_CANDIDATES
  );
  const tolerance = clampInteger(
    selectionOptions.tolerance ?? LEGACY_GENERATION_SELECTION_DEFAULT_TOLERANCE,
    0,
    999
  );
  const roundedTargetComplexity = clampInteger(targetComplexity, 0, 999);
  let bestMaze: Omit<LegacyMazeSnapshot, 'generation'> | null = null;
  let bestMeasuredComplexity = 0;
  let bestDifference = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  let candidateComplexityMin = Number.POSITIVE_INFINITY;
  let candidateComplexityMax = Number.NEGATIVE_INFINITY;
  let initialCandidateComplexityMin = Number.POSITIVE_INFINITY;
  let initialCandidateComplexityMax = Number.NEGATIVE_INFINITY;
  let searchedCandidateCount = 0;
  let adaptiveRetryCandidateCount = 0;
  let adaptiveRetryScale: number | null = null;

  const inspectCandidate = (
    candidateSeed: number,
    candidateScale: number,
    profile?: Partial<LegacyMazeGenerationProfile> | null,
    isInitialWindow = false
  ): void => {
    searchedCandidateCount += 1;
    const candidateMaze = buildLegacyRuntimeMazeForMode(mode, candidateScale, candidateSeed, profile);
    const measuredComplexity = resolveLegacyMazeComplexity(candidateMaze).total;
    const difference = measuredComplexity - roundedTargetComplexity;
    const distance = Math.abs(difference);

    candidateComplexityMin = Math.min(candidateComplexityMin, measuredComplexity);
    candidateComplexityMax = Math.max(candidateComplexityMax, measuredComplexity);
    if (isInitialWindow) {
      initialCandidateComplexityMin = Math.min(initialCandidateComplexityMin, measuredComplexity);
      initialCandidateComplexityMax = Math.max(initialCandidateComplexityMax, measuredComplexity);
    }

    if (bestMaze === null || distance < bestDistance) {
      bestMaze = candidateMaze;
      bestMeasuredComplexity = measuredComplexity;
      bestDifference = difference;
      bestDistance = distance;
    }
  };

  for (let index = 0; index < candidateCount; index += 1) {
    const candidateSeed = (seed + index) >>> 0;
    inspectCandidate(candidateSeed, scale, generationProfile, true);
  }

  const initialWindowUnderTarget = initialCandidateComplexityMax < roundedTargetComplexity - tolerance;
  const initialWindowOverTarget = initialCandidateComplexityMin > roundedTargetComplexity + tolerance;
  const pressureRetryCandidateCount = initialWindowUnderTarget
    && roundedTargetComplexity >= LEGACY_GENERATION_SELECTION_PRESSURE_RETRY_MIN_TARGET
    ? LEGACY_GENERATION_SELECTION_PRESSURE_RETRY_CANDIDATES
    : 0;

  if (pressureRetryCandidateCount > 0) {
    const pressureProfile = createLegacyUnderTargetPressureProfile(generationProfile);
    for (let index = 0; index < pressureRetryCandidateCount; index += 1) {
      const candidateSeed = (seed + candidateCount + index) >>> 0;
      inspectCandidate(candidateSeed, scale, pressureProfile);
    }
  }

  const shouldRunAdaptiveRetry = pressureRetryCandidateCount > 0
    && candidateComplexityMax < roundedTargetComplexity - tolerance;
  if (shouldRunAdaptiveRetry) {
    const adaptiveProfile = createLegacyAdaptiveUnderTargetProfile(generationProfile);
    adaptiveRetryScale = resolveLegacyAdaptiveUnderTargetScale(scale);
    adaptiveRetryCandidateCount = LEGACY_GENERATION_SELECTION_ADAPTIVE_RETRY_CANDIDATES;
    for (let index = 0; index < adaptiveRetryCandidateCount; index += 1) {
      const candidateSeed = (seed + candidateCount + pressureRetryCandidateCount + index) >>> 0;
      inspectCandidate(candidateSeed, adaptiveRetryScale, adaptiveProfile);
    }
  }

  const selectedMaze = bestMaze ?? buildLegacyRuntimeMazeForMode(mode, scale, seed, generationProfile);

  return {
    maze: selectedMaze,
    review: {
      adaptiveRetryCandidateCount,
      adaptiveRetryScale,
      adaptiveRetryUsed: adaptiveRetryCandidateCount > 0,
      allCandidatesOverTarget: candidateComplexityMin > roundedTargetComplexity + tolerance,
      allCandidatesUnderTarget: candidateComplexityMax < roundedTargetComplexity - tolerance,
      candidateCount,
      candidateComplexityMax: Number.isFinite(candidateComplexityMax) ? candidateComplexityMax : bestMeasuredComplexity,
      candidateComplexityMin: Number.isFinite(candidateComplexityMin) ? candidateComplexityMin : bestMeasuredComplexity,
      delivery: classifyLegacyGenerationDelivery(bestDifference, tolerance),
      difference: bestDifference,
      initialWindowOverTarget,
      initialWindowUnderTarget,
      measuredComplexity: bestMeasuredComplexity,
      pressureRetryCandidateCount,
      pressureRetryUsed: pressureRetryCandidateCount > 0,
      searchedCandidateCount,
      selectedDistance: bestDistance,
      selectedSeed: selectedMaze.seed,
      targetComplexity: roundedTargetComplexity,
      tolerance
    }
  };
};

export const createLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null,
  selectionOptions: LegacyGenerationSelectionOptions = {}
): LegacyMazeSnapshot => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale, profile);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale, profile);
  const gate = resolveLegacyGenerationTickGateContract();
  const { maze, review } = selectLegacyRuntimeMazeForMode(mode, scale, seed, profile, selectionOptions);

  return {
    ...maze,
    generation: {
      budget,
      buildKind,
      executionPlan,
      gate,
      profile,
      processStageIds: resolveLegacyGenerationProcessStageIds(scale, profile, mode),
      ...(review ? { selection: review } : {}),
      stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'consumed-finalized')
    }
  };
};

export const stepLegacyGenerationSeed = (seed: number): number => (seed + 1) >>> 0;

export const createLegacyGenerationRequest = ({
  currentSeed,
  dueAtMs,
  generationProfile,
  mode,
  queuedAtMs = dueAtMs,
  reason,
  scale,
  selectionCandidateCount,
  selectionTolerance,
  seedOverride,
  stepSeed = false,
  targetComplexity
}: {
  currentSeed: number;
  dueAtMs: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  mode: LegacyGenerationMode;
  queuedAtMs?: number;
  reason: LegacyGenerationRequestReason;
  scale: number;
  selectionCandidateCount?: number;
  selectionTolerance?: number;
  seedOverride?: number;
  stepSeed?: boolean;
  targetComplexity?: number;
}): LegacyGenerationRequest => {
  const seed = seedOverride !== undefined
    ? normalizeLegacyRuntimeSeed(seedOverride, currentSeed)
    : stepSeed
      ? stepLegacyGenerationSeed(currentSeed)
      : currentSeed;
  const profile = generationProfile ? normalizeLegacyMazeGenerationProfile(generationProfile) : undefined;
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale, profile);

  return {
    mode,
    reason,
    seed,
    ...(selectionCandidateCount !== undefined ? { selectionCandidateCount } : {}),
    ...(selectionTolerance !== undefined ? { selectionTolerance } : {}),
    dueAtMs: Math.max(0, Math.round(dueAtMs)),
    queuedAtMs: Math.max(0, Math.round(queuedAtMs)),
    budget: resolveLegacyGenerationBudgetContract(mode, scale, profile),
    buildKind: resolveLegacyMazeBuildKind(mode),
    executionPlan,
    gate: resolveLegacyGenerationTickGateContract(),
    ...(profile ? { generationProfile: profile } : {}),
    ...(targetComplexity !== undefined ? { targetComplexity: clampInteger(targetComplexity, 0, 999) } : {}),
    processStageIds: resolveLegacyGenerationProcessStageIds(scale, profile, mode),
    stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'queued-entry')
  };
};

export const createLegacyMenuResetGenerationRequest = ({
  currentSeed,
  generationProfile,
  nowMs,
  scale,
  targetComplexity
}: {
  currentSeed: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  nowMs: number;
  scale: number;
  targetComplexity?: number;
}): LegacyGenerationRequest => createLegacyGenerationRequest({
  currentSeed,
  dueAtMs: nowMs,
  generationProfile,
  mode: 'menu',
  queuedAtMs: nowMs,
  reason: 'menu-demo-goal-reset',
  scale,
  stepSeed: true,
  ...(targetComplexity !== undefined ? { targetComplexity } : {})
});

export const createLegacyPlayResetGenerationRequest = ({
  currentSeed,
  generationProfile,
  nowMs,
  seedOverride,
  scale,
  targetComplexity
}: {
  currentSeed: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  nowMs: number;
  seedOverride?: number;
  scale: number;
  targetComplexity?: number;
}): LegacyGenerationRequest => createLegacyGenerationRequest({
  currentSeed,
  dueAtMs: nowMs,
  generationProfile,
  mode: 'play',
  queuedAtMs: nowMs,
  reason: 'play-goal-reset',
  scale,
  seedOverride,
  stepSeed: true,
  ...(targetComplexity !== undefined ? { targetComplexity } : {})
});

export const shouldConsumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest | null,
  nowMs: number
): boolean => request !== null && nowMs >= request.dueAtMs;

export const consumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest,
  scale: number
): LegacyMazeSnapshot => createLegacyRuntimeMazeForMode(request.mode, scale, request.seed, request.generationProfile, {
  candidateCount: request.selectionCandidateCount,
  targetComplexity: request.targetComplexity,
  tolerance: request.selectionTolerance
});

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
