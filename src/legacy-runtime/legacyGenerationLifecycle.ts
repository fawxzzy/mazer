import {
  createLegacyGeneratedMenuMaze,
  createLegacyMaze,
  normalizeLegacyMazeGenerationProfile,
  resolveLegacyShortestPath,
  resolveLegacyWrapTopologyDiagnostics,
  type LegacyMazeSnapshot,
  type LegacyMazeGenerationProfile,
  type LegacyPoint
} from './legacyMaze';
import {
  GEOMETRY_BUDGET_BASE_CANDIDATES,
  GEOMETRY_BUDGET_WINDOW,
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_LOOP_BASE_ATTEMPTS,
  GEOMETRY_BUDGET_TIE_RETRY_BASES,
  GEOMETRY_BUDGET_TUNE_ATTEMPTS,
  GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS,
  resolveGeometryBudgetCandidateSeed,
  resolveGeometryBudgetFeltLevel,
  resolveGeometryBudgetForks,
  resolveGeometryBudgetFringeCells,
  resolveGeometryBudgetLoopPlan,
  resolveGeometryBudgetMaxBranch,
  resolveGeometryBudgetReverseFloor,
  resolveGeometryBudgetRouteBranch,
  resolveGeometryBudgetRouteTarget,
  resolveGeometryBudgetTarget,
  resolveGeometryBudgetWrapRungs
} from './legacyGeometryBudget';
import { LEGACY_EMPTY_LOOP_PLAN, type LegacyLoopPlan } from './legacyMazeLoops';
import { forceRemoveOneTileStubs } from './legacyMazeStubs';
import { FELT_TIE_DEVIATION_LIMIT_PERCENT, FELT_WRAP_PRICE_PERCENT, tuneMazeFeltToTarget } from './legacyMazeFeltTuning';
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
  aspectRatio?: number;
  budget: LegacyGenerationBudgetContract;
  buildKind: LegacyMazeBuildKind;
  dueAtMs: number;
  executionPlan: LegacyGenerationStageContract[];
  gate: LegacyGenerationTickGateContract;
  generationProfile?: LegacyMazeGenerationProfile;
  mode: LegacyGenerationMode;
  // Set only when the request was built with precompute: true -- lets
  // consumeLegacyGenerationRequest skip a second (redundant, and
  // identically-seeded so never different) generation pass. See that
  // option's own comment on createLegacyGenerationRequest for why this
  // exists.
  precomputedMaze?: LegacyMazeSnapshot;
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
  // Analysis and tests only: replaces a ladder level's own loop plan (multiple
  // routes). LEGACY_EMPTY_LOOP_PLAN forces a single-route maze. Production callers
  // leave it undefined so the level's plan applies.
  loopPlan?: LegacyLoopPlan;
  // Analysis and tests only: replaces the wrap rungs a ladder maze owns (0 = plain base,
  // 1 = vertical wrap corridor, 2 = both) and the percent of the wrap saving priced into
  // the target. Production callers leave both undefined so the level's fade and
  // FELT_WRAP_PRICE_PERCENT apply.
  wrapPricePercent?: number;
  wrapRungs?: number;
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

// Difficulty/complexity tuning stays anchored to the single "scale" figure
// exactly as before -- only the final grid shape is split into
// width/height, using aspectRatio (width/height) to distribute the same
// approximate cell count (scale x scale) across a non-square grid instead
// of a square one. aspectRatio defaults to 1 (square), so every existing
// caller that doesn't pass it keeps generating exactly the same mazes as
// before this change.
const resolveLegacyMazeDimensionsForScale = (scale: number, aspectRatio: number): { width: number; height: number } => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const ratioRoot = Math.sqrt(safeAspectRatio);
  return {
    width: Math.round(scale * ratioRoot),
    height: Math.round(scale / ratioRoot)
  };
};

const buildLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null,
  aspectRatio = 1
): Omit<LegacyMazeSnapshot, 'generation'> => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale, profile);
  const resolvedShortcutCount = budget.shortcutStageEnabled ? budget.shortcutCount : 0;
  const { width, height } = resolveLegacyMazeDimensionsForScale(scale, aspectRatio);
  return buildKind === 'menu-generated'
    ? createLegacyGeneratedMenuMaze(width, height, seed, resolvedShortcutCount, profile)
    : createLegacyMaze(width, height, seed, resolvedShortcutCount, profile);
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

// Selection for geometry-budget profiles (progression levels 2..LAST_BUDGET_LEVEL).
// There is no target-complexity search and no pressure/adaptive retry: those
// would resize the board and swap the profile, which the budget ladder forbids,
// and there is no candidate search either. ONE base maze is built from the
// level's fixed profile (mixed seed, see resolveGeometryBudgetCandidateSeed) and
// then felt-tuned into the level's window [T(N), T(N) + GEOMETRY_BUDGET_WINDOW]
// (legacyMazeFeltTuning.ts): the explorer's route is stretched toward the level's
// route target, then deep deceptive branches are added or trimmed. The window is
// narrower than the schedule's smallest step, so tuned mazes of adjacent ascending
// levels can never tie or invert, for any seeds. Cost: one maze build plus a few
// hundred ~20 microsecond explorer runs. selectionOptions.candidateCount is
// deliberately ignored.
const selectLegacyGeometryBudgetMaze = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile: LegacyMazeGenerationProfile,
  budgetLevel: number,
  selectionOptions: LegacyGenerationSelectionOptions,
  aspectRatio: number
): {
  maze: Omit<LegacyMazeSnapshot, 'generation'>;
  // The profile the selected maze was actually built from (its wrap rungs follow the
  // level's fade and the retry fallback, so it can differ from the level's own profile).
  profile: LegacyMazeGenerationProfile;
  review: LegacyGenerationSelectionReview;
} => {
  // The felt ladder stops at the felt saturation; the levels past it are the same felt maze
  // plus the fringe (legacyGeometryBudget.ts), so every felt rule reads the felt level.
  const feltLevel = resolveGeometryBudgetFeltLevel(budgetLevel);
  const fringeCells = resolveGeometryBudgetFringeCells(budgetLevel);
  const gateTarget = resolveGeometryBudgetTarget(feltLevel);
  const routeTarget = resolveGeometryBudgetRouteTarget(feltLevel);
  const maxBranch = resolveGeometryBudgetMaxBranch(feltLevel);
  const routeBranch = resolveGeometryBudgetRouteBranch(feltLevel);
  const forks = resolveGeometryBudgetForks(feltLevel);
  // Wrap corridors fade out over levels 100..140 (legacyGeometryBudget.ts): this maze's
  // rung count is a seeded roll on (level, seed), never more than the profile asks for.
  const profileRungs = generationProfile.requiredOppositeBorderConnections.horizontal
    ? 2
    : (generationProfile.requiredOppositeBorderConnections.vertical ? 1 : 0);
  const wrapRungs = Math.min(
    profileRungs,
    Math.max(0, Math.trunc(selectionOptions.wrapRungs ?? resolveGeometryBudgetWrapRungs(feltLevel, seed)))
  );
  const wrapPricePercent = selectionOptions.wrapPricePercent ?? FELT_WRAP_PRICE_PERCENT;
  const profileWithRungs = (rungs: number): LegacyMazeGenerationProfile => (
    rungs === profileRungs
      ? generationProfile
      : {
        ...generationProfile,
        requiredOppositeBorderConnections: { horizontal: rungs >= 2, vertical: rungs >= 1 }
      }
  );
  let selectedMaze: Omit<LegacyMazeSnapshot, 'generation'> | null = null;
  let selectedProfile: LegacyMazeGenerationProfile = generationProfile;
  let selectedDistance = Number.POSITIVE_INFINITY;
  let selectedRank = Number.POSITIVE_INFINITY;
  let searched = 0;
  // Usually the first base maze tunes into the window and the loop ends after one
  // build. A base can miss when its wrap corridors give the explorer a shortcut
  // the tuner cannot lengthen enough (its capacity is below the target), so the
  // next mixed-seed base is tried, up to GEOMETRY_BUDGET_BASE_CANDIDATES.
  for (let index = 0; index < GEOMETRY_BUDGET_BASE_CANDIDATES; index += 1) {
    const candidateSeed = resolveGeometryBudgetCandidateSeed(seed, feltLevel, index);
    // The rolled wraps are tried on the first few bases only; a base that cannot land
    // with them (priced, they raise the raw target) is retried plain.
    const baseRungs = index < GEOMETRY_BUDGET_WRAP_BASE_ATTEMPTS ? wrapRungs : 0;
    const baseProfile = profileWithRungs(baseRungs);
    // Every maze is double-lured and held to the reverse floor of its level and wrap rungs
    // (legacyGeometryBudget.ts).
    const reverseFloor = resolveGeometryBudgetReverseFloor(feltLevel, baseRungs);
    const base = buildLegacyRuntimeMazeForMode(mode, scale, candidateSeed, baseProfile, aspectRatio);
    searched += 1;
    let tuned: ReturnType<typeof tuneMazeFeltToTarget> | null = null;
    let distance = 0;
    let tieBiased = false;
    if (gateTarget !== null) {
      // The looped plan (multiple routes) is tried on the first few bases only; a
      // base that cannot land with loops is retried without them, so the ladder's
      // ordering guarantee always outranks the loop.
      const loops = index < GEOMETRY_BUDGET_LOOP_BASE_ATTEMPTS
        ? (selectionOptions.loopPlan ?? resolveGeometryBudgetLoopPlan(feltLevel, seed, base.width * base.height))
        : LEGACY_EMPTY_LOOP_PLAN;
      tuned = tuneMazeFeltToTarget(
        base,
        gateTarget,
        resolveGeometryBudgetCandidateSeed(seed, feltLevel, GEOMETRY_BUDGET_BASE_CANDIDATES + index),
        { overshoot: GEOMETRY_BUDGET_WINDOW, routeTarget, maxBranch, routeBranch, forks, loops, feltCeiling: GEOMETRY_BUDGET_CEILING, wrapPricePercent, fringeCells, attempts: GEOMETRY_BUDGET_TUNE_ATTEMPTS, doubleLure: true, reverseFloor }
      );
      distance = tuned.windowDistance;
      // A landed maze whose number is a coin flip for the explorer (a looped maze that
      // disagrees with its tie-averaged value) is accepted only after a few more bases.
      tieBiased = distance === 0 && tuned.tieDeviationPercent > FELT_TIE_DEVIATION_LIMIT_PERCENT;
    }
    // Rank: off-window by its distance; a coin-flip landing just behind a clean one.
    const rank = tieBiased ? distance + 0.5 : distance;
    if (selectedMaze === null || rank < selectedRank) {
      // Only a maze that becomes the selection is assembled (route, wrap diagnostics): a base that
      // missed its window or floor is discarded for the price of the tuning alone.
      selectedMaze = tuned === null ? base : assembleTunedMaze(base, tuned, baseProfile, reverseFloor);
      selectedProfile = baseProfile;
      selectedDistance = distance;
      selectedRank = rank;
    }
    if (distance === 0 && (!tieBiased || index >= GEOMETRY_BUDGET_TIE_RETRY_BASES - 1)) {
      break;
    }
  }
  if (selectedMaze === null) {
    selectedMaze = buildLegacyRuntimeMazeForMode(mode, scale, seed, generationProfile, aspectRatio);
  }
  const complexity = resolveLegacyMazeComplexity(selectedMaze);
  const reviewTarget = clampInteger(selectionOptions.targetComplexity ?? complexity.total, 0, 999);
  return {
    maze: selectedMaze,
    profile: selectedProfile,
    review: {
      adaptiveRetryCandidateCount: 0,
      adaptiveRetryScale: null,
      adaptiveRetryUsed: false,
      allCandidatesOverTarget: false,
      allCandidatesUnderTarget: false,
      candidateCount: GEOMETRY_BUDGET_BASE_CANDIDATES,
      candidateComplexityMax: complexity.total,
      candidateComplexityMin: complexity.total,
      // The 400-capped complexity target is not what budget levels are tuned
      // on, so the under/over-target label is cosmetic here and always
      // 'on-target'; the tuning distance is reported in selectedDistance.
      delivery: 'on-target',
      difference: complexity.total - reviewTarget,
      initialWindowOverTarget: false,
      initialWindowUnderTarget: false,
      measuredComplexity: complexity.total,
      pressureRetryCandidateCount: 0,
      pressureRetryUsed: false,
      searchedCandidateCount: searched,
      selectedDistance,
      selectedSeed: selectedMaze.seed,
      targetComplexity: reviewTarget,
      tolerance: 0
    }
  };
};

// The tuned grid plus everything derived from the route: the solution path is
// recomputed with the same direct-floor shortest-path search the carve uses (the
// stretch lever lengthens the route), and the wrap diagnostics follow it.
const assembleTunedMaze = (
  base: Omit<LegacyMazeSnapshot, 'generation'>,
  tuned: ReturnType<typeof tuneMazeFeltToTarget>,
  generationProfile: LegacyMazeGenerationProfile,
  reverseFloor: number
): Omit<LegacyMazeSnapshot, 'generation'> => {
  const routed = tuned.bumps > 0 || tuned.loops.length > 0 || tuned.cyclesBroken > 0
    ? resolveLegacyShortestPath(tuned.grid, base.start, base.goal, 'direct-floor')
    : null;
  const solutionPath = routed !== null && routed.found ? routed.path : base.solutionPath;
  const next: Omit<LegacyMazeSnapshot, 'generation'> = { ...base, grid: tuned.grid, solutionPath };
  // Last resort of the one-tile stub rule (legacyMazeStubs.ts): a tip the tuner could not clear
  // without moving the landed felt number is walled up anyway (a leaf: route, connectivity, start
  // and goal are untouched). Reported in stubStats.forced; expected to be 0 on every maze.
  const forcedStubs = tuned.stubRemaining > 0 ? forceRemoveOneTileStubs(next as typeof next & { grid: boolean[][] }) : [];
  if (tuned.stubLengthened.length > 0 || tuned.stubRemoved.length > 0 || forcedStubs.length > 0) {
    next.stubStats = { lengthened: tuned.stubLengthened.length, removed: tuned.stubRemoved.length, forced: forcedStubs.length };
  }
  if (tuned.loops.length > 0) {
    next.loopStats = {
      alternates: tuned.loops.filter((loop) => loop.kind === 'alternate').length,
      cells: tuned.loopTiles.length,
      decoys: tuned.loops.filter((loop) => loop.kind === 'decoy').length,
      saved: tuned.loopSaving,
      shortcuts: tuned.loops.filter((loop) => loop.kind === 'shortcut').length
    };
  }
  // The wrap corridors the base was built with, and the steps they give back to a player
  // who knows the map (priced into the felt target like a loop saving).
  const wraps = (generationProfile.requiredOppositeBorderConnections.vertical ? 1 : 0)
    + (generationProfile.requiredOppositeBorderConnections.horizontal ? 1 : 0);
  if (wraps > 0 || tuned.wrapSaving > 0) {
    next.wrapStats = { rungs: wraps, saved: tuned.wrapSaving };
  }
  // Zero-felt-cost side stubs of the levels past the felt saturation (legacyMazeFeltTuning.ts, lever 3).
  if (tuned.fringeTiles.length > 0) {
    next.fringeStats = { cells: tuned.fringeTiles.length };
  }
  // What the maze costs a solver working from the goal end, and the floor it was held to.
  next.reverseStats = { reverseFelt: tuned.reverseFelt, floor: reverseFloor };
  if (routed !== null && routed.found) {
    next.wrapTopologyDiagnostics = resolveLegacyWrapTopologyDiagnostics(
      next,
      generationProfile.requiredOppositeBorderConnections
    );
    if (base.playableTopologyStats) {
      next.playableTopologyStats = {
        ...base.playableTopologyStats,
        resolvedGoalDistance: Math.max(0, solutionPath.length - 1)
      };
    }
  }
  if (base.generationBuildTrace) {
    next.generationBuildTrace = {
      ...base.generationBuildTrace,
      decoyTiles: [...tuned.loopTiles, ...tuned.stretchTiles, ...tuned.addedTiles, ...tuned.fringeTiles, ...tuned.stubLengthened].map((point) => ({ ...point })),
      decoyPrunedTiles: [...tuned.stretchRemovedTiles, ...tuned.trimmedTiles, ...tuned.stubRemoved, ...forcedStubs].map((point) => ({ ...point }))
    };
  }
  return next;
};

const selectLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number,
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null,
  selectionOptions: LegacyGenerationSelectionOptions = {},
  aspectRatio = 1
): {
  maze: Omit<LegacyMazeSnapshot, 'generation'>;
  // Set only when the maze was built from a profile other than the one passed in
  // (a ladder level's wrap rungs follow its fade).
  profile?: LegacyMazeGenerationProfile;
  review?: LegacyGenerationSelectionReview;
} => {
  const budgetProfile = normalizeLegacyMazeGenerationProfile(generationProfile);
  if (budgetProfile.geometryBudgetLevel !== undefined) {
    return selectLegacyGeometryBudgetMaze(
      mode,
      scale,
      seed,
      budgetProfile,
      budgetProfile.geometryBudgetLevel,
      selectionOptions,
      aspectRatio
    );
  }
  const targetComplexity = selectionOptions.targetComplexity;
  if (targetComplexity === null || targetComplexity === undefined || !Number.isFinite(targetComplexity)) {
    return {
      maze: buildLegacyRuntimeMazeForMode(mode, scale, seed, generationProfile, aspectRatio)
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
    const candidateMaze = buildLegacyRuntimeMazeForMode(mode, candidateScale, candidateSeed, profile, aspectRatio);
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
  // A corridor is seed-independent and its pressure/adaptive retry profiles
  // would drop the layout (and the adaptive retry would even resize the
  // board), so under-target retries never apply to it.
  const isCorridorLayout = normalizeLegacyMazeGenerationProfile(generationProfile).layout === 'corridor';
  const pressureRetryCandidateCount = initialWindowUnderTarget
    && !isCorridorLayout
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

  const selectedMaze = bestMaze ?? buildLegacyRuntimeMazeForMode(mode, scale, seed, generationProfile, aspectRatio);

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
  selectionOptions: LegacyGenerationSelectionOptions = {},
  aspectRatio = 1
): LegacyMazeSnapshot => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const profile = normalizeLegacyMazeGenerationProfile(generationProfile);
  const executionPlan = resolveLegacyGenerationExecutionPlan(mode, scale, profile);
  const budget = resolveLegacyGenerationBudgetContract(mode, scale, profile);
  const gate = resolveLegacyGenerationTickGateContract();
  const { maze, profile: builtProfile, review } = selectLegacyRuntimeMazeForMode(mode, scale, seed, profile, selectionOptions, aspectRatio);

  return {
    ...maze,
    generation: {
      budget,
      buildKind,
      executionPlan,
      gate,
      profile: builtProfile ?? profile,
      processStageIds: resolveLegacyGenerationProcessStageIds(scale, profile, mode),
      ...(review ? { selection: review } : {}),
      stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'consumed-finalized')
    }
  };
};

export const stepLegacyGenerationSeed = (seed: number): number => (seed + 1) >>> 0;

export const createLegacyGenerationRequest = ({
  aspectRatio,
  currentSeed,
  dueAtMs,
  generationProfile,
  mode,
  precompute = false,
  precomputedMazeOverride,
  queuedAtMs = dueAtMs,
  reason,
  scale,
  selectionCandidateCount,
  selectionTolerance,
  seedOverride,
  stepSeed = false,
  targetComplexity
}: {
  aspectRatio?: number;
  currentSeed: number;
  dueAtMs: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  mode: LegacyGenerationMode;
  // Runs the (potentially expensive -- real generations have measured well
  // into the hundreds of ms, occasionally seconds, at large scale/complexity)
  // maze build right here at queue time instead of leaving it for
  // consumeLegacyGenerationRequest to do later at the request's dueAtMs.
  // The deconstruct-triggered reset requests set this: dueAtMs for those is
  // the moment the OLD maze finishes its deconstruct animation and the
  // screen is empty, which is exactly the worst possible moment to block
  // the main thread -- a freeze against an otherwise-idle screen reads as
  // "did this break" in a way the same delay never does mid-deconstruct,
  // while tiles are still visibly animating away. Moving the computation to
  // queue time doesn't shorten it, it relocates it to where the deconstruct
  // animation's own motion covers it. Not the default: most callers queue
  // with delayMs 0 for same-tick consumption, where eager-at-queue vs.
  // lazy-at-consume is not a meaningfully different moment.
  //
  // Superseded in practice by precomputedMazeOverride below for the
  // deconstruct-triggered case specifically: even queue-time-in-this-
  // function eager computation still runs inside the SAME synchronous call
  // that arms the outbound player-transfer-energy timer and the bleed-dock
  // corridor's own clock (see MenuScene.armLegacyMenuStaticDeconstructStage)
  // -- those are wall-clock-timed, short (a few hundred ms) animation
  // windows, and a multi-hundred-ms generation stall INSIDE that same call
  // eats directly into them, so the very first frame rendered afterward can
  // already be past their entire visible window. The caller now
  // precomputes even earlier (at the goal-reached instant, well before the
  // arm call) and passes the already-built result via
  // precomputedMazeOverride instead, so the arm call itself does no
  // synchronous work at all. precompute stays supported as a fallback for
  // any caller that can't precompute that early.
  precompute?: boolean;
  // An already-built maze to use as-is, skipping generation entirely (not
  // even eagerly at queue time) -- see precompute's own comment for why
  // this exists. Takes priority over precompute when both are somehow set.
  precomputedMazeOverride?: LegacyMazeSnapshot;
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
  const normalizedTargetComplexity = targetComplexity !== undefined
    ? clampInteger(targetComplexity, 0, 999)
    : undefined;
  // Precomputed with the exact same inputs consumeLegacyGenerationRequest
  // would otherwise use at due time -- same seed, same profile, same
  // aspect ratio, same selection options -- so this is not a second,
  // possibly-different generation; it's the one generation, just run
  // earlier and cached.
  const precomputedMaze = precomputedMazeOverride ?? (
    precompute
      ? createLegacyRuntimeMazeForMode(mode, scale, seed, profile, {
        candidateCount: selectionCandidateCount,
        targetComplexity: normalizedTargetComplexity,
        tolerance: selectionTolerance
      }, aspectRatio ?? 1)
      : undefined
  );

  return {
    mode,
    reason,
    seed,
    ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    ...(precomputedMaze !== undefined ? { precomputedMaze } : {}),
    ...(selectionCandidateCount !== undefined ? { selectionCandidateCount } : {}),
    ...(selectionTolerance !== undefined ? { selectionTolerance } : {}),
    dueAtMs: Math.max(0, Math.round(dueAtMs)),
    queuedAtMs: Math.max(0, Math.round(queuedAtMs)),
    budget: resolveLegacyGenerationBudgetContract(mode, scale, profile),
    buildKind: resolveLegacyMazeBuildKind(mode),
    executionPlan,
    gate: resolveLegacyGenerationTickGateContract(),
    ...(profile ? { generationProfile: profile } : {}),
    ...(normalizedTargetComplexity !== undefined ? { targetComplexity: normalizedTargetComplexity } : {}),
    processStageIds: resolveLegacyGenerationProcessStageIds(scale, profile, mode),
    stageCursor: resolveLegacyGenerationStageCursor(executionPlan, 'queued-entry')
  };
};

export const createLegacyMenuResetGenerationRequest = ({
  aspectRatio,
  currentSeed,
  generationProfile,
  nowMs,
  precompute,
  precomputedMazeOverride,
  scale,
  targetComplexity
}: {
  aspectRatio?: number;
  currentSeed: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  nowMs: number;
  precompute?: boolean;
  precomputedMazeOverride?: LegacyMazeSnapshot;
  scale: number;
  targetComplexity?: number;
}): LegacyGenerationRequest => createLegacyGenerationRequest({
  ...(aspectRatio !== undefined ? { aspectRatio } : {}),
  currentSeed,
  dueAtMs: nowMs,
  generationProfile,
  mode: 'menu',
  ...(precompute !== undefined ? { precompute } : {}),
  ...(precomputedMazeOverride !== undefined ? { precomputedMazeOverride } : {}),
  queuedAtMs: nowMs,
  reason: 'menu-demo-goal-reset',
  scale,
  stepSeed: true,
  ...(targetComplexity !== undefined ? { targetComplexity } : {})
});

export const createLegacyPlayResetGenerationRequest = ({
  aspectRatio,
  currentSeed,
  generationProfile,
  nowMs,
  precompute,
  precomputedMazeOverride,
  seedOverride,
  scale,
  targetComplexity
}: {
  aspectRatio?: number;
  currentSeed: number;
  generationProfile?: Partial<LegacyMazeGenerationProfile> | null;
  nowMs: number;
  precompute?: boolean;
  precomputedMazeOverride?: LegacyMazeSnapshot;
  seedOverride?: number;
  scale: number;
  targetComplexity?: number;
}): LegacyGenerationRequest => createLegacyGenerationRequest({
  ...(aspectRatio !== undefined ? { aspectRatio } : {}),
  currentSeed,
  dueAtMs: nowMs,
  generationProfile,
  mode: 'play',
  ...(precompute !== undefined ? { precompute } : {}),
  ...(precomputedMazeOverride !== undefined ? { precomputedMazeOverride } : {}),
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
): LegacyMazeSnapshot => request.precomputedMaze ?? createLegacyRuntimeMazeForMode(
  request.mode,
  scale,
  request.seed,
  request.generationProfile,
  {
    candidateCount: request.selectionCandidateCount,
    targetComplexity: request.targetComplexity,
    tolerance: request.selectionTolerance
  },
  request.aspectRatio ?? 1
);

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
