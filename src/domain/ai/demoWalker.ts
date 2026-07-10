import {
  getNeighborIndex,
  isTileFloor,
  resolveDirectionBetween,
  type MazeEpisode
} from '../maze';
import type { DemoSegmentCue } from './demoSpectator';

export interface DemoWalkerConfig {
  seed: number;
  cadence: {
    spawnHoldMs: number;
    exploreStepMs: number;
    backtrackStepMs: number;
    decisionPauseMs: number;
    anticipationStepMs: number;
    branchCommitMs: number;
    branchResumeMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
  };
  behavior: {
    trailMaxLength: number;
    aiTilePathAdditionalPaths: number;
    preserveVisitedOnAiReset: boolean;
    emulateLogicSwitchPotentialCheckBug: boolean;
    regenerateSeedStep: number;
    enableRunnerMistakes?: boolean;
    runnerThinkingModel?: 'legacy-source' | 'human-local-memory';
    prerollSteps?: number;
    segmentDurationsMs?: readonly number[];
    segmentCues?: readonly (DemoSegmentCue | DemoWalkerCue)[];
  };
}

export interface DemoWalkerAdvance {
  state: DemoWalkerState;
  delayMs: number;
  shouldRegenerateMaze?: boolean;
  nextSeed?: number;
}

export interface DemoRunnerTelemetry {
  wrongBranchCount: number;
  backtrackCount: number;
  recoveryCount: number;
  visitedUndoCount: number;
  optionalRetargetCount: number;
}

export interface DemoRunnerRouteDiagnostics {
  aiResetPathCursor: number | null;
  canonicalPathLength: number;
  cueCounts: Partial<Record<DemoWalkerCue, number>>;
  routeLength: number;
  segmentCount: number;
  telemetry: DemoRunnerTelemetry;
  trailModeCounts: Partial<Record<DemoTrailMode, number>>;
  traverseMs: number;
}

export interface DemoWalkerViewFrame {
  currentIndex: number;
  nextIndex: number;
  previousIndex: number;
  direction: 0 | 1 | 2 | 3 | null;
  progress: number;
  cue: DemoWalkerCue;
  trailStart: number;
  trailLimit: number;
  canonicalCursor: number;
  telemetry: DemoRunnerTelemetry;
  cycleComplete: boolean;
}

export type DemoWalkerPhase = 'explore' | 'goal-hold' | 'reset-hold';
type DemoWalkerResetReason = 'goal' | 'ai-path-exhausted' | null;
export type DemoTrailMode = 'explore' | 'backtrack' | 'goal';
export type DemoWalkerCue = 'spawn' | 'anticipate' | 'explore' | 'dead-end' | 'backtrack' | 'reacquire' | 'goal' | 'reset';

export interface DemoTrailStep {
  index: number;
  mode: DemoTrailMode;
}

export interface DemoWalkerMemoryFrame {
  optionIndices: number[];
  targetIndex: number | null;
}

export interface DemoWalkerState {
  currentIndex: number;
  trailIndices: number[];
  trailSteps: DemoTrailStep[];
  loops: number;
  reachedGoal: boolean;
  phase: DemoWalkerPhase;
  stepsTaken: number;
  lastDirection: 0 | 1 | 2 | 3 | null;
  resetReason: DemoWalkerResetReason;
  cue: DemoWalkerCue;
  pathCursor: number;
  canonicalCursor: number;
  telemetry: DemoRunnerTelemetry;
  aiLogicSwitch: boolean;
  aiMemory: DemoWalkerMemoryFrame;
}

interface DemoRunnerPlan {
  routeIndices: Uint32Array;
  canonicalCursors: Uint32Array;
  segmentTrailModes: readonly DemoTrailMode[];
  cueOverrides: readonly (DemoSegmentCue | DemoWalkerCue | null)[];
  telemetry: DemoRunnerTelemetry;
  aiResetPathCursor: number | null;
  memoryFrames: readonly DemoWalkerMemoryFrame[];
}

interface LocalMemorySplit {
  choices: number[];
  index: number;
  tried: Set<number>;
}

const defaultConfig: DemoWalkerConfig = {
  seed: 1988,
  cadence: {
    spawnHoldMs: 220,
    exploreStepMs: 104,
    backtrackStepMs: 76,
    decisionPauseMs: 228,
    anticipationStepMs: 84,
    branchCommitMs: 112,
    branchResumeMs: 148,
    goalHoldMs: 3000,
    resetHoldMs: 340
  },
  behavior: {
    trailMaxLength: 46,
    aiTilePathAdditionalPaths: 0,
    preserveVisitedOnAiReset: true,
    emulateLogicSwitchPotentialCheckBug: true,
    regenerateSeedStep: 1,
    enableRunnerMistakes: false,
    runnerThinkingModel: 'legacy-source',
    prerollSteps: 0,
    segmentDurationsMs: [],
    segmentCues: []
  }
};

const EMPTY_TELEMETRY: DemoRunnerTelemetry = {
  wrongBranchCount: 0,
  backtrackCount: 0,
  recoveryCount: 0,
  visitedUndoCount: 0,
  optionalRetargetCount: 0
};

const EMPTY_MEMORY_FRAME: DemoWalkerMemoryFrame = {
  optionIndices: [],
  targetIndex: null
};

const cloneMemoryFrame = (frame: DemoWalkerMemoryFrame): DemoWalkerMemoryFrame => ({
  optionIndices: [...frame.optionIndices],
  targetIndex: frame.targetIndex
});

const LOCAL_MEMORY_OPTIONAL_RETARGET_SCORE_MARGIN = -3.5;
const LOCAL_MEMORY_OPTIONAL_RETARGET_PATH_PENALTY = 0.2;
const LOCAL_MEMORY_OPTIONAL_RETARGET_MAX_COUNT = 4;
const LOCAL_MEMORY_RECOVERY_PATH_PENALTY = 0.55;

const runnerPlanCache = new WeakMap<MazeEpisode, {
  precise?: DemoRunnerPlan;
  legacyHumanized?: DemoRunnerPlan;
  localMemoryHumanized?: DemoRunnerPlan;
}>();
const goalDistanceFieldCache = new WeakMap<MazeEpisode, Float32Array>();

const resolveSegmentDurations = (
  pathSegmentCount: number,
  config: DemoWalkerConfig,
  runnerPlan?: DemoRunnerPlan
): number[] => {
  const configured = config.behavior.segmentDurationsMs ?? [];
  if (configured.length === pathSegmentCount && configured.every((value) => Number.isFinite(value) && value > 0)) {
    return configured.map((value) => Math.max(1, Math.round(value)));
  }

  return Array.from({ length: pathSegmentCount }, (_value, segmentIndex) => (
    resolveSegmentDelayMs(segmentIndex, pathSegmentCount, config, runnerPlan)
  ));
};

const resolveSegmentCue = (
  segmentIndex: number,
  lastPathIndex: number,
  progress: number,
  config: DemoWalkerConfig,
  runnerPlan?: DemoRunnerPlan
): DemoWalkerCue => {
  const planCue = runnerPlan?.cueOverrides[segmentIndex];
  if (
    planCue === 'anticipate'
    || planCue === 'reacquire'
    || planCue === 'dead-end'
    || planCue === 'backtrack'
  ) {
    return planCue;
  }

  const configuredCue = config.behavior.segmentCues?.[segmentIndex];
  if (
    configuredCue === 'anticipate'
    || configuredCue === 'reacquire'
    || configuredCue === 'dead-end'
    || configuredCue === 'backtrack'
  ) {
    return configuredCue;
  }

  if (runnerPlan?.segmentTrailModes[segmentIndex] === 'backtrack') {
    return 'backtrack';
  }

  return segmentIndex >= lastPathIndex - 2 && progress >= 0.42 ? 'anticipate' : 'explore';
};

const resolveSegmentDelayMs = (
  segmentIndex: number,
  pathSegmentCount: number,
  config: DemoWalkerConfig,
  runnerPlan?: DemoRunnerPlan
): number => {
  void segmentIndex;
  void pathSegmentCount;
  void runnerPlan;
  // Legacy AMazerPlayer reschedules AiPlayerLogic with one _PlayerAiDelayDuration
  // after every AI tick. Cue labels drive presentation, not separate timers.
  return Math.max(1, config.cadence.exploreStepMs);
};

const resolveDemoRunnerPlan = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): DemoRunnerPlan => {
  const cacheEntry = runnerPlanCache.get(episode) ?? {};
  const cacheKey = config.behavior.enableRunnerMistakes === true
    ? shouldUseLegacySourceHumanizedPlan(config)
      ? 'legacyHumanized'
      : 'localMemoryHumanized'
    : 'precise';
  const cached = cacheEntry[cacheKey];
  if (cached) {
    return cached;
  }

  const nextPlan = config.behavior.enableRunnerMistakes === true
    ? buildHumanizedRunnerPlan(episode, config)
    : buildPreciseRunnerPlan(episode);
  cacheEntry[cacheKey] = nextPlan;
  runnerPlanCache.set(episode, cacheEntry);
  return nextPlan;
};

const shouldUseLegacySourceHumanizedPlan = (config: DemoWalkerConfig): boolean => (
  config.behavior.runnerThinkingModel === 'legacy-source'
  || config.behavior.emulateLogicSwitchPotentialCheckBug === true
);

export const resolveDemoWalkerTraverseMs = (config: DemoWalkerConfig, segmentCount: number): number => (
  resolveSegmentDurations(segmentCount, config).reduce((total, value) => total + value, 0)
);

export const resolveDemoWalkerCanonicalCursorMap = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): Uint32Array => resolveDemoRunnerPlan(episode, config).canonicalCursors;

export const resolveDemoWalkerCueOverrides = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): readonly (DemoSegmentCue | DemoWalkerCue | null)[] => resolveDemoRunnerPlan(episode, config).cueOverrides;

export const collectDemoWalkerTelemetry = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): DemoRunnerTelemetry => resolveDemoRunnerPlan(episode, config).telemetry;

export const collectDemoWalkerRouteDiagnostics = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): DemoRunnerRouteDiagnostics => {
  const runnerPlan = resolveDemoRunnerPlan(episode, config);
  const segmentCount = Math.max(0, runnerPlan.routeIndices.length - 1);
  const cueCounts: Partial<Record<DemoWalkerCue, number>> = {};
  const trailModeCounts: Partial<Record<DemoTrailMode, number>> = {};

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const cue = resolveSegmentCue(segmentIndex, segmentCount, 1, config, runnerPlan);
    cueCounts[cue] = (cueCounts[cue] ?? 0) + 1;

    const trailMode = runnerPlan.segmentTrailModes[segmentIndex] ?? 'explore';
    trailModeCounts[trailMode] = (trailModeCounts[trailMode] ?? 0) + 1;
  }

  return {
    aiResetPathCursor: runnerPlan.aiResetPathCursor,
    canonicalPathLength: episode.raster.pathIndices.length,
    cueCounts,
    routeLength: runnerPlan.routeIndices.length,
    segmentCount,
    telemetry: runnerPlan.telemetry,
    trailModeCounts,
    traverseMs: resolveDemoWalkerTraverseMs(config, segmentCount)
  };
};

export const createDemoWalkerState = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => {
  const runnerPlan = resolveDemoRunnerPlan(episode, config);
  const startIndex = runnerPlan.routeIndices[0] ?? episode.raster.startIndex;

  return {
    currentIndex: startIndex,
    trailIndices: [startIndex],
    trailSteps: [{ index: startIndex, mode: 'explore' }],
    loops: 0,
    reachedGoal: false,
    phase: 'explore',
    stepsTaken: 0,
    lastDirection: null,
    resetReason: null,
    cue: 'spawn',
    pathCursor: 0,
    canonicalCursor: runnerPlan.canonicalCursors[0] ?? 0,
    telemetry: runnerPlan.telemetry,
    aiLogicSwitch: false,
    aiMemory: cloneMemoryFrame(runnerPlan.memoryFrames[0] ?? EMPTY_MEMORY_FRAME)
  };
};

export const advanceDemoWalker = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerAdvance => {
  const runnerPlan = resolveDemoRunnerPlan(episode, config);
  const route = runnerPlan.routeIndices;
  const lastCursor = Math.max(0, route.length - 1);

  if (state.phase === 'goal-hold' && state.reachedGoal) {
    return {
      state: {
        ...state,
        phase: 'reset-hold',
        resetReason: 'goal',
        cue: 'reset',
        stepsTaken: state.stepsTaken + 1
      },
      delayMs: config.cadence.resetHoldMs
    };
  }

  const shouldTriggerAiReset = (
    state.phase === 'explore'
    && state.reachedGoal === false
    && state.aiLogicSwitch === false
    && config.behavior.enableRunnerMistakes === true
    && config.behavior.emulateLogicSwitchPotentialCheckBug === true
    && runnerPlan.aiResetPathCursor !== null
    && state.pathCursor >= runnerPlan.aiResetPathCursor
  );
  if (shouldTriggerAiReset) {
    return {
      state: {
        ...state,
        phase: 'reset-hold',
        resetReason: 'ai-path-exhausted',
        cue: 'reset',
        stepsTaken: state.stepsTaken + 1
      },
      delayMs: config.cadence.resetHoldMs
    };
  }

  if (state.phase === 'reset-hold') {
    const nextState = createDemoWalkerState(episode, config);
    const shouldRegenerateMaze = state.resetReason === 'goal';
    return {
      state: {
        ...nextState,
        loops: state.loops + 1,
        aiLogicSwitch: state.resetReason === 'ai-path-exhausted'
          ? !state.aiLogicSwitch
          : false
      },
      delayMs: config.cadence.exploreStepMs,
      shouldRegenerateMaze: shouldRegenerateMaze ? true : undefined,
      nextSeed: shouldRegenerateMaze
        ? config.seed + ((state.loops + 1) * config.behavior.regenerateSeedStep)
        : undefined
    };
  }

  const nextCursor = Math.min(state.pathCursor + 1, lastCursor);
  const nextIndex = route[nextCursor] ?? episode.raster.endIndex;
  const reachedGoal = nextCursor >= lastCursor && nextIndex === episode.raster.endIndex;
  const segmentIndex = Math.max(0, nextCursor - 1);
  const trailMode: DemoTrailMode = reachedGoal
    ? 'goal'
    : runnerPlan.segmentTrailModes[segmentIndex] ?? 'explore';
  const cue = reachedGoal
    ? 'goal'
    : resolveSegmentCue(segmentIndex, lastCursor, 1, config, runnerPlan);
  const segmentDelayMs = resolveSegmentDelayMs(segmentIndex, lastCursor, config, runnerPlan);

  return {
    state: {
      ...state,
      currentIndex: nextIndex,
      trailIndices: appendTrail(state.trailIndices, nextIndex, config.behavior.trailMaxLength),
      trailSteps: appendTrailStep(state.trailSteps, nextIndex, trailMode, config.behavior.trailMaxLength),
      reachedGoal,
      phase: reachedGoal ? 'goal-hold' : 'explore',
      stepsTaken: state.stepsTaken + 1,
      lastDirection: state.currentIndex === nextIndex
        ? null
        : resolveDirectionBetween(state.currentIndex, nextIndex, episode.raster.width),
      resetReason: null,
      cue,
      pathCursor: nextCursor,
      canonicalCursor: runnerPlan.canonicalCursors[nextCursor] ?? state.canonicalCursor,
      telemetry: runnerPlan.telemetry,
      aiLogicSwitch: state.aiLogicSwitch,
      aiMemory: cloneMemoryFrame(runnerPlan.memoryFrames[nextCursor] ?? state.aiMemory)
    },
    delayMs: reachedGoal ? config.cadence.goalHoldMs : segmentDelayMs
  };
};

export const stepDemoWalker = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(episode, state, config).state;

export const resolveDemoWalkerViewFrame = (
  episode: MazeEpisode,
  elapsedMs: number,
  config: DemoWalkerConfig = defaultConfig,
  trailWindow = config.behavior.trailMaxLength
): DemoWalkerViewFrame => {
  const runnerPlan = resolveDemoRunnerPlan(episode, config);
  const path = runnerPlan.routeIndices;
  const startIndex = path[0] ?? episode.raster.startIndex;
  const endIndex = episode.raster.endIndex;
  const spawnHoldMs = Math.max(0, config.cadence.spawnHoldMs);
  const stepMs = Math.max(1, config.cadence.exploreStepMs);
  const goalHoldMs = Math.max(0, config.cadence.goalHoldMs);
  const resetHoldMs = Math.max(0, config.cadence.resetHoldMs);
  const visibleWindow = Math.max(1, trailWindow);
  const lastPathIndex = Math.max(0, path.length - 1);
  const segmentDurations = resolveSegmentDurations(lastPathIndex, config, runnerPlan);

  if (path.length <= 1) {
    return {
      currentIndex: startIndex,
      nextIndex: endIndex,
      previousIndex: startIndex,
      direction: null,
      progress: 1,
      cue: elapsedMs < spawnHoldMs ? 'spawn' : 'goal',
      trailStart: 0,
      trailLimit: Math.min(1, path.length),
      canonicalCursor: runnerPlan.canonicalCursors[0] ?? 0,
      telemetry: runnerPlan.telemetry,
      cycleComplete: elapsedMs >= spawnHoldMs + goalHoldMs + resetHoldMs
    };
  }

  if (elapsedMs < spawnHoldMs) {
    return {
      currentIndex: startIndex,
      nextIndex: path[1] ?? startIndex,
      previousIndex: startIndex,
      direction: resolveDirectionBetween(startIndex, path[1] ?? startIndex, episode.raster.width),
      progress: 0,
      cue: 'spawn',
      trailStart: 0,
      trailLimit: 1,
      canonicalCursor: runnerPlan.canonicalCursors[0] ?? 0,
      telemetry: runnerPlan.telemetry,
      cycleComplete: false
    };
  }

  const traverseMs = segmentDurations.reduce((total, value) => total + value, 0);
  const moveElapsedMs = elapsedMs - spawnHoldMs;
  if (moveElapsedMs <= traverseMs) {
    const clampedMoveElapsedMs = Math.min(moveElapsedMs, traverseMs);
    let segment = 0;
    let segmentStartMs = 0;
    for (; segment < lastPathIndex; segment += 1) {
      const nextBoundaryMs = segmentStartMs + segmentDurations[segment];
      if (clampedMoveElapsedMs <= nextBoundaryMs || segment === lastPathIndex - 1) {
        break;
      }
      segmentStartMs = nextBoundaryMs;
    }
    const segmentElapsedMs = clampedMoveElapsedMs - segmentStartMs;
    const segmentDurationMs = Math.max(1, segmentDurations[segment] ?? stepMs);
    const progress = segment === lastPathIndex - 1 && clampedMoveElapsedMs >= traverseMs
      ? 1
      : Math.min(1, segmentElapsedMs / segmentDurationMs);
    const currentIndex = path[segment] ?? startIndex;
    const nextIndex = path[segment + 1] ?? currentIndex;
    const visibleCursor = Math.min(lastPathIndex, segment + (progress >= 0.16 ? 1 : 0));
    const trailLimit = Math.max(Math.min(visibleWindow, path.length), visibleCursor + 1);

    return {
      currentIndex,
      nextIndex,
      previousIndex: segment === 0 ? startIndex : (path[segment - 1] ?? currentIndex),
      direction: resolveDirectionBetween(currentIndex, nextIndex, episode.raster.width),
      progress,
      cue: resolveSegmentCue(segment, lastPathIndex, progress, config, runnerPlan),
      trailStart: 0,
      trailLimit,
      canonicalCursor: runnerPlan.canonicalCursors[visibleCursor] ?? 0,
      telemetry: runnerPlan.telemetry,
      cycleComplete: false
    };
  }

  if (moveElapsedMs < traverseMs + goalHoldMs) {
    return {
      currentIndex: endIndex,
      nextIndex: endIndex,
      previousIndex: path[lastPathIndex - 1] ?? endIndex,
      direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
      progress: 1,
      cue: 'goal',
      trailStart: 0,
      trailLimit: path.length,
      canonicalCursor: Math.max(0, episode.raster.pathIndices.length - 1),
      telemetry: runnerPlan.telemetry,
      cycleComplete: false
    };
  }

  if (moveElapsedMs < traverseMs + goalHoldMs + resetHoldMs) {
    return {
      currentIndex: endIndex,
      nextIndex: endIndex,
      previousIndex: path[lastPathIndex - 1] ?? endIndex,
      direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
      progress: 1,
      cue: 'reset',
      trailStart: 0,
      trailLimit: path.length,
      canonicalCursor: Math.max(0, episode.raster.pathIndices.length - 1),
      telemetry: runnerPlan.telemetry,
      cycleComplete: false
    };
  }

  return {
    currentIndex: endIndex,
    nextIndex: endIndex,
    previousIndex: path[lastPathIndex - 1] ?? endIndex,
    direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
    progress: 1,
    cue: 'reset',
    trailStart: 0,
    trailLimit: path.length,
    canonicalCursor: Math.max(0, episode.raster.pathIndices.length - 1),
    telemetry: runnerPlan.telemetry,
    cycleComplete: true
  };
};

const buildPreciseRunnerPlan = (episode: MazeEpisode): DemoRunnerPlan => {
  const canonicalPath = episode.raster.pathIndices;
  const segmentCount = Math.max(0, canonicalPath.length - 1);

  return {
    routeIndices: Uint32Array.from(canonicalPath),
    canonicalCursors: Uint32Array.from({ length: canonicalPath.length }, (_value, index) => index),
    segmentTrailModes: Array.from({ length: segmentCount }, (_value, index) => (
      index >= segmentCount - 1 ? 'goal' : 'explore'
    )),
    cueOverrides: Array.from({ length: segmentCount }, () => null),
    telemetry: EMPTY_TELEMETRY,
    aiResetPathCursor: null,
    memoryFrames: Array.from({ length: canonicalPath.length }, () => EMPTY_MEMORY_FRAME)
  };
};

const buildHumanizedRunnerPlan = (
  episode: MazeEpisode,
  config: DemoWalkerConfig
): DemoRunnerPlan => {
  return shouldUseLegacySourceHumanizedPlan(config)
    ? buildLegacyAiRunnerPlan(episode)
    : buildHumanLocalMemoryRunnerPlan(episode, config);
};

const buildLegacyAiRunnerPlan = (episode: MazeEpisode): DemoRunnerPlan => {
  const canonicalPath = Array.from(episode.raster.pathIndices);
  const canonicalCursorByIndex = new Map<number, number>();
  canonicalPath.forEach((index, cursor) => {
    if (!canonicalCursorByIndex.has(index)) {
      canonicalCursorByIndex.set(index, cursor);
    }
  });

  const routeIndices: number[] = [episode.raster.startIndex];
  const canonicalCursors: number[] = [0];
  const segmentTrailModes: DemoTrailMode[] = [];
  const cueOverrides: Array<DemoSegmentCue | DemoWalkerCue | null> = [];
  const memoryFrames: DemoWalkerMemoryFrame[] = [EMPTY_MEMORY_FRAME];
  const telemetry: DemoRunnerTelemetry = {
    wrongBranchCount: 0,
    backtrackCount: 0,
    recoveryCount: 0,
    visitedUndoCount: 0,
    optionalRetargetCount: 0
  };
  const visited = new Set<number>([episode.raster.startIndex]);
  const potentialTiles: number[] = [];
  const pathStack: number[] = [episode.raster.startIndex];
  let currentIndex = episode.raster.startIndex;
  let aiTargetTile: number | null = null;
  let aiBacktracking = false;
  let aiBackTrackUndoVisitedFlag = false;
  let aiResetPathCursor: number | null = null;
  let pendingDeadEndCue = false;
  const maxSteps = Math.max(64, episode.raster.tiles.length * 4);

  const appendStep = (
    nextIndex: number,
    mode: DemoTrailMode,
    cue: DemoSegmentCue | DemoWalkerCue | null,
    memoryFrame: DemoWalkerMemoryFrame = EMPTY_MEMORY_FRAME
  ): boolean => {
    if (routeIndices[routeIndices.length - 1] === nextIndex) {
      return false;
    }

    routeIndices.push(nextIndex);
    canonicalCursors.push(resolveNearestCanonicalCursor(
      nextIndex,
      canonicalPath,
      canonicalCursorByIndex,
      episode.raster.width,
      episode.raster.height
    ));
    segmentTrailModes.push(mode);
    cueOverrides.push(cue);
    memoryFrames.push(cloneMemoryFrame(memoryFrame));
    return true;
  };

  const addPotentialTile = (tileIndex: number): void => {
    if (!potentialTiles.includes(tileIndex)) {
      potentialTiles.push(tileIndex);
    }
  };

  for (let step = 0; step < maxSteps; step += 1) {
    if (currentIndex === episode.raster.endIndex) {
      break;
    }

    if (!aiBacktracking) {
      const nextTile = resolveLegacyAiDirectMove(episode, currentIndex, visited, addPotentialTile);
      if (nextTile !== null) {
        const nextIsCanonical = canonicalCursorByIndex.has(nextTile);
        const currentIsCanonical = canonicalCursorByIndex.has(currentIndex);
        visited.add(nextTile);
        removeFirst(potentialTiles, nextTile);
        pathStack.push(nextTile);
        appendStep(nextTile, 'explore', nextIsCanonical && currentIsCanonical ? null : 'anticipate');
        if (!nextIsCanonical || !currentIsCanonical) {
          telemetry.wrongBranchCount += 1;
        }
        currentIndex = nextTile;
        continue;
      }

      pendingDeadEndCue = true;
      aiTargetTile = resolveLegacyAiPotentialTarget(episode, currentIndex, visited, potentialTiles, false);
      aiBacktracking = true;
      if (aiTargetTile === null) {
        continue;
      }
    }

    if (aiTargetTile === null) {
      aiTargetTile = episode.raster.startIndex;
    }

    const nextBacktrackTile = pathStack[pathStack.length - 1];
    if (nextBacktrackTile === undefined) {
      aiResetPathCursor = Math.max(0, routeIndices.length - 1);
      break;
    }

    const targetIsNeighbor = collectFloorNeighbors(nextBacktrackTile, episode.raster.width, episode.raster.height, episode.raster.tiles)
      .includes(aiTargetTile);
    if (targetIsNeighbor) {
      aiBackTrackUndoVisitedFlag = false;
      aiBacktracking = false;
      visited.add(nextBacktrackTile);
      pathStack.pop();
      pathStack.push(nextBacktrackTile);
      appendStep(nextBacktrackTile, 'backtrack', 'reacquire');
      telemetry.recoveryCount += 1;
      if (aiResetPathCursor === null) {
        aiResetPathCursor = Math.max(0, routeIndices.length - 1);
      }
      pendingDeadEndCue = false;
      currentIndex = nextBacktrackTile;
      if (
        aiResetPathCursor !== null
        && cueOverrides.includes('dead-end')
        && cueOverrides.includes('backtrack')
        && cueOverrides.includes('reacquire')
      ) {
        break;
      }
      continue;
    }

    const shouldUndoVisited = collectFloorNeighbors(nextBacktrackTile, episode.raster.width, episode.raster.height, episode.raster.tiles)
      .some((neighbor) => (
        potentialTiles.includes(neighbor)
        && passesLegacyAiTilePathCheck(
          neighbor,
          nextBacktrackTile,
          visited,
          episode.raster.width,
          episode.raster.height,
          episode.raster.tiles,
          episode.raster.endIndex
        )
      ));
    aiBackTrackUndoVisitedFlag = aiBackTrackUndoVisitedFlag || shouldUndoVisited;
    visited.add(nextBacktrackTile);
    if (aiBackTrackUndoVisitedFlag) {
      visited.delete(nextBacktrackTile);
      telemetry.visitedUndoCount += 1;
    }
    pathStack.pop();
    if (appendStep(nextBacktrackTile, 'backtrack', pendingDeadEndCue ? 'dead-end' : 'backtrack')) {
      pendingDeadEndCue = false;
    }
    telemetry.backtrackCount += 1;
    currentIndex = nextBacktrackTile;
  }

  const canonicalReplayStart = aiResetPathCursor === null
    ? (canonicalCursorByIndex.get(routeIndices[routeIndices.length - 1] ?? episode.raster.startIndex) ?? 0)
    : 0;
  const replayAnchorIndex = canonicalPath[canonicalReplayStart] ?? episode.raster.startIndex;
  const currentRouteTail = routeIndices[routeIndices.length - 1] ?? episode.raster.startIndex;
  if (currentRouteTail !== replayAnchorIndex) {
    const reacquirePath = findFloorPath(
      currentRouteTail,
      replayAnchorIndex,
      episode.raster.width,
      episode.raster.height,
      episode.raster.tiles
    );
    for (let cursor = 1; cursor < reacquirePath.length; cursor += 1) {
      appendStep(reacquirePath[cursor]!, 'backtrack', cursor === 1 ? 'reacquire' : 'backtrack');
    }
  }

  for (let cursor = Math.max(1, canonicalReplayStart + 1); cursor < canonicalPath.length; cursor += 1) {
    const nextIndex = canonicalPath[cursor] ?? episode.raster.endIndex;
    appendStep(nextIndex, cursor >= canonicalPath.length - 1 ? 'goal' : 'explore', cursor === canonicalReplayStart + 1 ? 'reacquire' : null);
  }

  return {
    routeIndices: Uint32Array.from(routeIndices),
    canonicalCursors: Uint32Array.from(canonicalCursors),
    segmentTrailModes,
    cueOverrides,
    telemetry,
    aiResetPathCursor,
    memoryFrames
  };
};

const buildHumanLocalMemoryRunnerPlan = (
  episode: MazeEpisode,
  config: DemoWalkerConfig
): DemoRunnerPlan => {
  const canonicalPath = Array.from(episode.raster.pathIndices);
  const canonicalCursorByIndex = new Map<number, number>();
  canonicalPath.forEach((index, cursor) => {
    if (!canonicalCursorByIndex.has(index)) {
      canonicalCursorByIndex.set(index, cursor);
    }
  });

  const routeIndices: number[] = [episode.raster.startIndex];
  const canonicalCursors: number[] = [0];
  const segmentTrailModes: DemoTrailMode[] = [];
  const cueOverrides: Array<DemoSegmentCue | DemoWalkerCue | null> = [];
  const memoryFrames: DemoWalkerMemoryFrame[] = [EMPTY_MEMORY_FRAME];
  const telemetry: DemoRunnerTelemetry = {
    wrongBranchCount: 0,
    backtrackCount: 0,
    recoveryCount: 0,
    visitedUndoCount: 0,
    optionalRetargetCount: 0
  };
  const visited = new Set<number>([episode.raster.startIndex]);
  const deadEnds = new Set<number>();
  const pathStack: number[] = [episode.raster.startIndex];
  const splitRecords = new Map<number, LocalMemorySplit>();
  const maxRouteLength = Math.max(canonicalPath.length + 16, episode.raster.tiles.length * 4);
  const maxSteps = maxRouteLength;
  const optionalRetargetCooldownSteps = Math.max(6, Math.floor(canonicalPath.length * 0.06));
  const optionalRetargetMaxRouteLength = Math.max(4, Math.floor(canonicalPath.length * 0.22));
  let currentIndex = episode.raster.startIndex;
  let optionalRetargetCount = 0;
  let lastOptionalRetargetRouteLength = Number.NEGATIVE_INFINITY;

  const resolveMemoryOptionIndices = (): number[] => {
    const optionIndices: number[] = [];
    for (const split of splitRecords.values()) {
      const bestChoice = resolveBestLocalMemorySplitChoice(split, {
        deadEnds,
        episode,
        seed: config.seed,
        visited
      });
      if (bestChoice !== null && !optionIndices.includes(bestChoice)) {
        optionIndices.push(bestChoice);
      }
    }
    return optionIndices.slice(0, 16);
  };

  const createMemoryFrame = (targetIndex: number | null = null): DemoWalkerMemoryFrame => ({
    optionIndices: resolveMemoryOptionIndices(),
    targetIndex
  });

  const appendStep = (
    nextIndex: number,
    mode: DemoTrailMode,
    cue: DemoSegmentCue | DemoWalkerCue | null,
    memoryFrame: DemoWalkerMemoryFrame = createMemoryFrame()
  ): boolean => {
    if (routeIndices[routeIndices.length - 1] === nextIndex) {
      return false;
    }

    routeIndices.push(nextIndex);
    canonicalCursors.push(resolveNearestCanonicalCursor(
      nextIndex,
      canonicalPath,
      canonicalCursorByIndex,
      episode.raster.width,
      episode.raster.height
    ));
    segmentTrailModes.push(mode);
    cueOverrides.push(cue);
    memoryFrames.push(cloneMemoryFrame(memoryFrame));
    return true;
  };

  const markWrongBranchIfNeeded = (fromIndex: number, nextIndex: number): void => {
    if (!canonicalCursorByIndex.has(fromIndex) || !canonicalCursorByIndex.has(nextIndex)) {
      telemetry.wrongBranchCount += 1;
    }
  };

  const tryOptionalRetarget = (
    fromIndex: number,
    currentChoices: readonly number[]
  ): number | null => {
    const currentBestChoice = currentChoices[0];
    if (
      currentBestChoice === undefined
      || optionalRetargetCount >= LOCAL_MEMORY_OPTIONAL_RETARGET_MAX_COUNT
      || routeIndices.length - lastOptionalRetargetRouteLength < optionalRetargetCooldownSteps
    ) {
      return null;
    }

    const currentBestScore = scoreLocalMemoryChoice(fromIndex, currentBestChoice, episode, config.seed);
    let bestCandidate: {
      choice: number;
      route: number[];
      score: number;
      split: LocalMemorySplit;
    } | null = null;

    for (const split of splitRecords.values()) {
      if (split.index === fromIndex) {
        continue;
      }

      const choice = resolveBestLocalMemorySplitChoice(split, {
        deadEnds,
        episode,
        seed: config.seed,
        visited
      });
      if (choice === null) {
        continue;
      }

      const route = findKnownFloorPath(
        fromIndex,
        split.index,
        episode.raster.width,
        episode.raster.height,
        episode.raster.tiles,
        visited,
        deadEnds
      );
      const routeStepCount = route.length - 1;
      if (routeStepCount <= 0 || routeStepCount > optionalRetargetMaxRouteLength) {
        continue;
      }

      const score = scoreLocalMemoryChoice(split.index, choice, episode, config.seed)
        + (routeStepCount * LOCAL_MEMORY_OPTIONAL_RETARGET_PATH_PENALTY);
      if (score + LOCAL_MEMORY_OPTIONAL_RETARGET_SCORE_MARGIN >= currentBestScore) {
        continue;
      }
      if (bestCandidate === null || score < bestCandidate.score) {
        bestCandidate = {
          choice,
          route,
          score,
          split
        };
      }
    }

    if (bestCandidate === null) {
      return null;
    }

    let retargetIndex = fromIndex;
    for (let cursor = 1; cursor < bestCandidate.route.length; cursor += 1) {
      const nextBacktrackIndex = bestCandidate.route[cursor];
      if (nextBacktrackIndex === undefined) {
        continue;
      }
      appendStep(nextBacktrackIndex, 'backtrack', 'backtrack', createMemoryFrame(bestCandidate.split.index));
      telemetry.backtrackCount += 1;
      retargetIndex = nextBacktrackIndex;
    }

    const targetStackIndex = pathStack.lastIndexOf(bestCandidate.split.index);
    if (targetStackIndex >= 0) {
      pathStack.splice(targetStackIndex + 1);
    } else {
      pathStack.push(bestCandidate.split.index);
    }

    bestCandidate.split.tried.add(bestCandidate.choice);
    visited.add(bestCandidate.choice);
    pathStack.push(bestCandidate.choice);
    markWrongBranchIfNeeded(retargetIndex, bestCandidate.choice);
    appendStep(bestCandidate.choice, 'explore', 'reacquire', createMemoryFrame(bestCandidate.choice));
    telemetry.recoveryCount += 1;
    telemetry.optionalRetargetCount += 1;
    optionalRetargetCount += 1;
    lastOptionalRetargetRouteLength = routeIndices.length;
    return bestCandidate.choice;
  };

  for (let step = 0; step < maxSteps && routeIndices.length < maxRouteLength; step += 1) {
    if (currentIndex === episode.raster.endIndex) {
      break;
    }

    const choices = sortLocalMemoryChoices(
      currentIndex,
      collectLocalMemoryChoices(episode, currentIndex, visited, deadEnds),
      episode,
      config.seed
    );

    const retargeted = tryOptionalRetarget(currentIndex, choices);
    if (retargeted !== null) {
      currentIndex = retargeted;
      continue;
    }

    if (choices.length > 0) {
      const split = resolveLocalMemorySplit(splitRecords, currentIndex, choices);
      const nextIndex = choices[0]!;
      split.tried.add(nextIndex);
      visited.add(nextIndex);
      pathStack.push(nextIndex);
      markWrongBranchIfNeeded(currentIndex, nextIndex);
      appendStep(nextIndex, 'explore', canonicalCursorByIndex.has(nextIndex) ? null : 'anticipate', createMemoryFrame(nextIndex));
      currentIndex = nextIndex;
      continue;
    }

    deadEnds.add(currentIndex);
    const recovered = backtrackToBestLocalMemorySplit({
      appendStep,
      canonicalCursorByIndex,
      currentIndex,
      deadEnds,
      episode,
      pathStack,
      seed: config.seed,
      splitRecords,
      telemetry,
      visited,
      createMemoryFrame
    });
    if (recovered !== null) {
      currentIndex = recovered;
    } else {
      break;
    }
  }

  return {
    routeIndices: Uint32Array.from(routeIndices),
    canonicalCursors: Uint32Array.from(canonicalCursors),
    segmentTrailModes,
    cueOverrides,
    telemetry,
    aiResetPathCursor: null,
    memoryFrames
  };
};

const resolveLocalMemorySplit = (
  splitRecords: Map<number, LocalMemorySplit>,
  currentIndex: number,
  choices: number[]
): LocalMemorySplit => {
  const existing = splitRecords.get(currentIndex);
  if (existing) {
    for (const choice of choices) {
      if (!existing.choices.includes(choice)) {
        existing.choices.push(choice);
      }
    }
    return existing;
  }

  const split: LocalMemorySplit = {
    choices: [...choices],
    index: currentIndex,
    tried: new Set<number>()
  };
  splitRecords.set(currentIndex, split);
  return split;
};

const collectLocalMemoryChoices = (
  episode: MazeEpisode,
  currentIndex: number,
  visited: ReadonlySet<number>,
  deadEnds: ReadonlySet<number>
): number[] => collectFloorNeighbors(
  currentIndex,
  episode.raster.width,
  episode.raster.height,
  episode.raster.tiles
).filter((neighbor) => (
  neighbor === episode.raster.endIndex
  || (!visited.has(neighbor) && !deadEnds.has(neighbor))
));

const sortLocalMemoryChoices = (
  fromIndex: number,
  choices: readonly number[],
  episode: MazeEpisode,
  seed: number
): number[] => [...choices].sort((left, right) => (
  scoreLocalMemoryChoice(fromIndex, left, episode, seed)
  - scoreLocalMemoryChoice(fromIndex, right, episode, seed)
));

const scoreLocalMemoryChoice = (
  fromIndex: number,
  choiceIndex: number,
  episode: MazeEpisode,
  seed: number
): number => {
  const goalDistance = resolveGoalPathDistance(episode, choiceIndex);
  const currentDistance = resolveGoalPathDistance(episode, fromIndex);
  const visualDistance = euclideanDistance(
    choiceIndex,
    episode.raster.endIndex,
    episode.raster.width,
    episode.raster.height
  );
  const progressBias = goalDistance <= currentDistance ? -0.34 : 1.08;
  const deterministicNoise = Math.abs(Math.sin(((choiceIndex + 1) * 12.9898) + ((seed + 1) * 78.233))) * 1.15;
  return goalDistance + (visualDistance * 0.16) + progressBias + deterministicNoise;
};

const resolveGoalPathDistance = (episode: MazeEpisode, index: number): number => {
  const distances = resolveGoalDistanceField(episode);
  const distance = distances[index];
  return Number.isFinite(distance) ? distance : episode.raster.tiles.length;
};

const resolveGoalDistanceField = (episode: MazeEpisode): Float32Array => {
  const cached = goalDistanceFieldCache.get(episode);
  if (cached) {
    return cached;
  }

  const { width, height, tiles, endIndex } = episode.raster;
  const distances = new Float32Array(tiles.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const queue = new Uint32Array(tiles.length);
  let read = 0;
  let write = 0;
  distances[endIndex] = 0;
  queue[write] = endIndex;
  write += 1;

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const nextDistance = distances[current]! + 1;
    for (const neighbor of collectFloorNeighbors(current, width, height, tiles)) {
      if (nextDistance >= distances[neighbor]!) {
        continue;
      }
      distances[neighbor] = nextDistance;
      queue[write] = neighbor;
      write += 1;
    }
  }

  goalDistanceFieldCache.set(episode, distances);
  return distances;
};

const backtrackToBestLocalMemorySplit = (input: {
  appendStep: (
    nextIndex: number,
    mode: DemoTrailMode,
    cue: DemoSegmentCue | DemoWalkerCue | null,
    memoryFrame?: DemoWalkerMemoryFrame
  ) => boolean;
  canonicalCursorByIndex: ReadonlyMap<number, number>;
  currentIndex: number;
  deadEnds: Set<number>;
  episode: MazeEpisode;
  pathStack: number[];
  seed: number;
  splitRecords: Map<number, LocalMemorySplit>;
  telemetry: DemoRunnerTelemetry;
  visited: Set<number>;
  createMemoryFrame?: (targetIndex?: number | null) => DemoWalkerMemoryFrame;
}): number | null => {
  let currentIndex = input.currentIndex;
  const markDeadEndIfExhausted = (index: number): void => {
    if (collectLocalMemoryChoices(input.episode, index, input.visited, input.deadEnds).length === 0) {
      input.deadEnds.add(index);
    }
  };
  const targetSplit = resolveBestLocalMemorySplitTarget(input);
  if (targetSplit === null) {
    return null;
  }

  markDeadEndIfExhausted(currentIndex);
  const knownRoute = findKnownFloorPath(
    currentIndex,
    targetSplit.index,
    input.episode.raster.width,
    input.episode.raster.height,
    input.episode.raster.tiles,
    input.visited,
    input.deadEnds
  );

  if (knownRoute.length > 1) {
    for (let cursor = 1; cursor < knownRoute.length; cursor += 1) {
      const nextBacktrackIndex = knownRoute[cursor];
      if (nextBacktrackIndex === undefined) {
        continue;
      }
      input.appendStep(
        nextBacktrackIndex,
        'backtrack',
        cursor === 1 ? 'dead-end' : 'backtrack',
        input.createMemoryFrame?.(targetSplit.index)
      );
      input.telemetry.backtrackCount += 1;
      currentIndex = nextBacktrackIndex;
    }
    const targetStackIndex = input.pathStack.lastIndexOf(targetSplit.index);
    if (targetStackIndex >= 0) {
      while (input.pathStack.length > targetStackIndex + 1) {
        const exhaustedIndex = input.pathStack.pop();
        if (exhaustedIndex !== undefined && exhaustedIndex !== targetSplit.index) {
          markDeadEndIfExhausted(exhaustedIndex);
        }
      }
    }
  } else {
    let pendingDeadEndCue = true;
    while (currentIndex !== targetSplit.index && input.pathStack.length > 1) {
      const exhaustedIndex = input.pathStack.pop();
      if (exhaustedIndex !== undefined) {
        markDeadEndIfExhausted(exhaustedIndex);
      }
      const nextBacktrackIndex = input.pathStack.at(-1);
      if (nextBacktrackIndex === undefined) {
        return null;
      }
      input.appendStep(
        nextBacktrackIndex,
        'backtrack',
        pendingDeadEndCue ? 'dead-end' : 'backtrack',
        input.createMemoryFrame?.(targetSplit.index)
      );
      input.telemetry.backtrackCount += 1;
      pendingDeadEndCue = false;
      currentIndex = nextBacktrackIndex;
    }
  }

  const nextChoice = resolveBestLocalMemorySplitChoice(targetSplit, input);
  if (nextChoice === null) {
    input.splitRecords.delete(targetSplit.index);
    return currentIndex;
  }

  targetSplit.tried.add(nextChoice);
  input.visited.add(nextChoice);
  input.pathStack.push(nextChoice);
  input.appendStep(nextChoice, 'explore', 'reacquire', input.createMemoryFrame?.(nextChoice));
  input.telemetry.recoveryCount += 1;
  if (!input.canonicalCursorByIndex.has(nextChoice) || !input.canonicalCursorByIndex.has(currentIndex)) {
    input.telemetry.wrongBranchCount += 1;
  }
  return nextChoice;
};

const resolveBestLocalMemorySplitTarget = (input: {
  currentIndex: number;
  deadEnds: ReadonlySet<number>;
  episode: MazeEpisode;
  pathStack: readonly number[];
  seed: number;
  splitRecords: Map<number, LocalMemorySplit>;
  visited: ReadonlySet<number>;
}): LocalMemorySplit | null => {
  let bestSplit: LocalMemorySplit | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const registerCandidate = (split: LocalMemorySplit): void => {
    const bestChoice = resolveBestLocalMemorySplitChoice(split, input);
    if (bestChoice === null) {
      return;
    }
    const route = findKnownFloorPath(
      input.currentIndex,
      split.index,
      input.episode.raster.width,
      input.episode.raster.height,
      input.episode.raster.tiles,
      input.visited,
      input.deadEnds
    );
    if (input.currentIndex !== split.index && route.length <= 1) {
      return;
    }

    const routeStepCount = Math.max(0, route.length - 1);
    const score = scoreLocalMemoryChoice(split.index, bestChoice, input.episode, input.seed)
      + (routeStepCount * LOCAL_MEMORY_RECOVERY_PATH_PENALTY);
    if (score < bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  };

  for (const split of input.splitRecords.values()) {
    registerCandidate(split);
  }

  for (const visitedIndex of input.visited) {
    const frontierChoices = collectLocalMemoryChoices(
      input.episode,
      visitedIndex,
      input.visited,
      input.deadEnds
    );
    if (frontierChoices.length === 0) {
      continue;
    }

    const split = resolveLocalMemorySplit(input.splitRecords, visitedIndex, frontierChoices);
    registerCandidate(split);
  }

  return bestSplit;
};

const resolveBestLocalMemorySplitChoice = (
  split: LocalMemorySplit,
  input: {
    deadEnds: ReadonlySet<number>;
    episode: MazeEpisode;
    seed: number;
    visited: ReadonlySet<number>;
  }
): number | null => {
  const validChoices = split.choices.filter((choice) => (
    !split.tried.has(choice)
    && !input.deadEnds.has(choice)
    && (
      choice === input.episode.raster.endIndex
      || !input.visited.has(choice)
    )
    && collectFloorNeighbors(
      split.index,
      input.episode.raster.width,
      input.episode.raster.height,
      input.episode.raster.tiles
    ).includes(choice)
  ));
  return sortLocalMemoryChoices(split.index, validChoices, input.episode, input.seed)[0] ?? null;
};

const resolveLegacyAiDirectMove = (
  episode: MazeEpisode,
  currentIndex: number,
  visited: ReadonlySet<number>,
  addPotentialTile: (tileIndex: number) => void
): number | null => {
  const width = episode.raster.width;
  const height = episode.raster.height;
  const tiles = episode.raster.tiles;
  let nextTile: number | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const neighbor of collectFloorNeighbors(currentIndex, width, height, tiles)) {
    if (
      !visited.has(neighbor)
      && passesLegacyAiTilePathCheck(
        neighbor,
        currentIndex,
        visited,
        width,
        height,
        tiles,
        episode.raster.endIndex
      )
    ) {
      addPotentialTile(neighbor);
      const distance = euclideanDistance(neighbor, episode.raster.endIndex, width, height);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        nextTile = neighbor;
      }
    }
  }

  return nextTile;
};

const resolveLegacyAiPotentialTarget = (
  episode: MazeEpisode,
  currentIndex: number,
  visited: ReadonlySet<number>,
  potentialTiles: number[],
  aiLogicSwitch: boolean
): number | null => {
  let nextTile: number | null = null;
  const width = episode.raster.width;
  const height = episode.raster.height;
  const tiles = episode.raster.tiles;

  while (nextTile === null && potentialTiles.length > 0) {
    if (aiLogicSwitch) {
      // Preserve the restored source bug: the retarget branch checks NextTile
      // while it is still null, which drains potential targets.
      potentialTiles.splice(0, potentialTiles.length);
      return null;
    }

    const candidate = potentialTiles[potentialTiles.length - 1] ?? null;
    const candidateValid = candidate !== null && passesLegacyAiTilePathCheck(
      candidate,
      currentIndex,
      visited,
      width,
      height,
      tiles,
      episode.raster.endIndex
    );
    removeFirst(potentialTiles, candidate);
    if (candidateValid) {
      nextTile = candidate;
    }
  }

  return nextTile;
};

const passesLegacyAiTilePathCheck = (
  tileIndex: number,
  currentIndex: number,
  visited: ReadonlySet<number>,
  width: number,
  height: number,
  tiles: Uint8Array,
  endIndex: number
): boolean => {
  if (tileIndex === endIndex) {
    return true;
  }

  return collectFloorNeighbors(tileIndex, width, height, tiles).some((neighbor) => (
    neighbor !== currentIndex && !visited.has(neighbor)
  ));
};

const collectFloorNeighbors = (
  index: number,
  width: number,
  height: number,
  tiles: Uint8Array
): number[] => {
  const neighbors: number[] = [];
  for (let direction = 0; direction < 4; direction += 1) {
    const nextIndex = resolveWrappedFloorNeighborIndex(index, width, height, direction as 0 | 1 | 2 | 3);
    if (nextIndex !== -1 && isTileFloor(tiles, nextIndex)) {
      neighbors.push(nextIndex);
    }
  }
  return neighbors;
};

const resolveWrappedFloorNeighborIndex = (
  index: number,
  width: number,
  height: number,
  direction: 0 | 1 | 2 | 3
): number => {
  const direct = getNeighborIndex(index, width, height, direction);
  if (direct !== -1) {
    return direct;
  }

  const x = index % width;
  const y = Math.floor(index / width);
  if (direction === 0 && y === 0) {
    return ((height - 1) * width) + x;
  }
  if (direction === 1 && y === height - 1) {
    return x;
  }
  if (direction === 2 && x === 0) {
    return (y * width) + (width - 1);
  }
  if (direction === 3 && x === width - 1) {
    return y * width;
  }

  return -1;
};

const findFloorPath = (
  startIndex: number,
  targetIndex: number,
  width: number,
  height: number,
  tiles: Uint8Array
): number[] => {
  return findKnownFloorPath(startIndex, targetIndex, width, height, tiles);
};

const findKnownFloorPath = (
  startIndex: number,
  targetIndex: number,
  width: number,
  height: number,
  tiles: Uint8Array,
  allowedIndices?: ReadonlySet<number>,
  blockedIndices: ReadonlySet<number> = new Set()
): number[] => {
  if (startIndex === targetIndex) {
    return [startIndex];
  }

  const cameFrom = new Int32Array(tiles.length);
  cameFrom.fill(-1);
  const queue = new Uint32Array(tiles.length);
  let read = 0;
  let write = 0;
  queue[write] = startIndex;
  write += 1;
  cameFrom[startIndex] = startIndex;

  while (read < write) {
    const current = queue[read]!;
    read += 1;

    for (const neighbor of collectFloorNeighbors(current, width, height, tiles)) {
      if (cameFrom[neighbor] !== -1) {
        continue;
      }
      if (
        neighbor !== targetIndex
        && neighbor !== startIndex
        && (
          (allowedIndices !== undefined && !allowedIndices.has(neighbor))
          || blockedIndices.has(neighbor)
        )
      ) {
        continue;
      }
      cameFrom[neighbor] = current;
      if (neighbor === targetIndex) {
        const path: number[] = [targetIndex];
        let cursor = targetIndex;
        while (cursor !== startIndex) {
          cursor = cameFrom[cursor]!;
          path.push(cursor);
        }
        path.reverse();
        return path;
      }
      queue[write] = neighbor;
      write += 1;
    }
  }

  return [startIndex];
};

const resolveNearestCanonicalCursor = (
  index: number,
  canonicalPath: readonly number[],
  canonicalCursorByIndex: ReadonlyMap<number, number>,
  width: number,
  height: number
): number => {
  const exactCursor = canonicalCursorByIndex.get(index);
  if (exactCursor !== undefined) {
    return exactCursor;
  }

  let bestCursor = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let cursor = 0; cursor < canonicalPath.length; cursor += 1) {
    const distance = manhattanDistance(index, canonicalPath[cursor] ?? index, width, height);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCursor = cursor;
    }
  }

  return bestCursor;
};

const euclideanDistance = (fromIndex: number, toIndex: number, width: number, height: number): number => {
  const dx = wrappedAxisDistance(fromIndex % width, toIndex % width, width);
  const dy = wrappedAxisDistance(Math.floor(fromIndex / width), Math.floor(toIndex / width), height);
  return Math.sqrt((dx * dx) + (dy * dy));
};

const manhattanDistance = (fromIndex: number, toIndex: number, width: number, height: number): number => (
  wrappedAxisDistance(fromIndex % width, toIndex % width, width)
  + wrappedAxisDistance(Math.floor(fromIndex / width), Math.floor(toIndex / width), height)
);

const wrappedAxisDistance = (from: number, to: number, span: number): number => {
  const direct = Math.abs(from - to);
  return Math.min(direct, Math.max(0, span - direct));
};

const removeFirst = <T>(values: T[], value: T | null): void => {
  const index = values.indexOf(value as T);
  if (index >= 0) {
    values.splice(index, 1);
  }
};

const appendTrail = (trail: number[], nextIndex: number, maxLength: number): number[] => {
  const nextTrail = trail.slice(Math.max(0, trail.length - maxLength + 1));
  nextTrail.push(nextIndex);
  return nextTrail;
};

const appendTrailStep = (
  trail: DemoTrailStep[],
  nextIndex: number,
  mode: DemoTrailMode,
  maxLength: number
): DemoTrailStep[] => {
  const nextTrail = trail.slice(Math.max(0, trail.length - maxLength + 1));
  nextTrail.push({ index: nextIndex, mode });
  return nextTrail;
};
