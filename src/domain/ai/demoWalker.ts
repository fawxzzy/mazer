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
}

interface DemoRunnerPlan {
  routeIndices: Uint32Array;
  canonicalCursors: Uint32Array;
  segmentTrailModes: readonly DemoTrailMode[];
  cueOverrides: readonly (DemoSegmentCue | DemoWalkerCue | null)[];
  telemetry: DemoRunnerTelemetry;
  aiResetPathCursor: number | null;
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
    prerollSteps: 0,
    segmentDurationsMs: [],
    segmentCues: []
  }
};

const EMPTY_TELEMETRY: DemoRunnerTelemetry = {
  wrongBranchCount: 0,
  backtrackCount: 0,
  recoveryCount: 0
};

const runnerPlanCache = new WeakMap<MazeEpisode, {
  precise?: DemoRunnerPlan;
  humanized?: DemoRunnerPlan;
}>();

const resolveSegmentDurations = (
  pathSegmentCount: number,
  config: DemoWalkerConfig
): number[] => {
  const configured = config.behavior.segmentDurationsMs ?? [];
  if (configured.length === pathSegmentCount && configured.every((value) => Number.isFinite(value) && value > 0)) {
    return configured.map((value) => Math.max(1, Math.round(value)));
  }

  return Array.from({ length: pathSegmentCount }, () => Math.max(1, config.cadence.exploreStepMs));
};

const resolveSegmentCue = (
  segmentIndex: number,
  lastPathIndex: number,
  progress: number,
  config: DemoWalkerConfig
): DemoWalkerCue => {
  const configuredCue = config.behavior.segmentCues?.[segmentIndex];
  if (
    configuredCue === 'anticipate'
    || configuredCue === 'reacquire'
    || configuredCue === 'dead-end'
    || configuredCue === 'backtrack'
  ) {
    return configuredCue;
  }

  return segmentIndex >= lastPathIndex - 2 && progress >= 0.42 ? 'anticipate' : 'explore';
};

const resolveDemoRunnerPlan = (
  episode: MazeEpisode,
  config: DemoWalkerConfig = defaultConfig
): DemoRunnerPlan => {
  const cacheEntry = runnerPlanCache.get(episode) ?? {};
  const cacheKey = config.behavior.enableRunnerMistakes === true ? 'humanized' : 'precise';
  const cached = cacheEntry[cacheKey];
  if (cached) {
    return cached;
  }

  const nextPlan = config.behavior.enableRunnerMistakes === true
    ? buildHumanizedRunnerPlan(episode)
    : buildPreciseRunnerPlan(episode);
  cacheEntry[cacheKey] = nextPlan;
  runnerPlanCache.set(episode, cacheEntry);
  return nextPlan;
};

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
    aiLogicSwitch: false
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
    : resolveSegmentCue(segmentIndex, lastCursor, 1, config);

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
      aiLogicSwitch: state.aiLogicSwitch
    },
    delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
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
  const segmentDurations = resolveSegmentDurations(lastPathIndex, config);

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
      cue: resolveSegmentCue(segment, lastPathIndex, progress, config),
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
    aiResetPathCursor: null
  };
};

const buildHumanizedRunnerPlan = (episode: MazeEpisode): DemoRunnerPlan => {
  const canonicalPath = Array.from(episode.raster.pathIndices);
  const canonicalSet = new Set(canonicalPath);
  const budget = resolveRunnerWrongTurnBudget(episode);
  const minGap = episode.size === 'small' ? 4 : episode.size === 'medium' ? 5 : 6;
  const selections = new Map<number, number[]>();
  let lastSelectedCursor = Number.NEGATIVE_INFINITY;

  for (let cursor = 1; cursor < canonicalPath.length - 2; cursor += 1) {
    if (selections.size >= budget) {
      break;
    }
    if (cursor - lastSelectedCursor < minGap) {
      continue;
    }

    const branchPath = resolveBranchExcursion(episode, canonicalPath, canonicalSet, cursor);
    if (!branchPath) {
      continue;
    }

    const chance = resolveRunnerWrongTurnChance(episode, cursor, canonicalPath.length);
    const roll = randomFloat(mixSeed(episode.seed, cursor, 0x31c6f541));
    if (roll <= chance) {
      selections.set(cursor, branchPath);
      lastSelectedCursor = cursor;
    }
  }

  if (selections.size === 0 && budget > 0) {
    let fallbackCursor = -1;
    let fallbackPath: number[] | null = null;
    let fallbackScore = Number.NEGATIVE_INFINITY;
    for (let cursor = 1; cursor < canonicalPath.length - 2; cursor += 1) {
      const branchPath = resolveBranchExcursion(episode, canonicalPath, canonicalSet, cursor);
      if (!branchPath) {
        continue;
      }

      const score = branchPath.length + (cursor / Math.max(1, canonicalPath.length));
      if (score > fallbackScore) {
        fallbackScore = score;
        fallbackCursor = cursor;
        fallbackPath = branchPath;
      }
    }
    if (fallbackCursor >= 0 && fallbackPath) {
      selections.set(fallbackCursor, fallbackPath);
    }
  }

  const routeIndices: number[] = [canonicalPath[0] ?? episode.raster.startIndex];
  const canonicalCursors: number[] = [0];
  const segmentTrailModes: DemoTrailMode[] = [];
  const cueOverrides: Array<DemoSegmentCue | DemoWalkerCue | null> = [];
  const telemetry: DemoRunnerTelemetry = {
    wrongBranchCount: 0,
    backtrackCount: 0,
    recoveryCount: 0
  };
  let aiResetPathCursor: number | null = null;

  for (let canonicalCursor = 1; canonicalCursor < canonicalPath.length; canonicalCursor += 1) {
    const detour = selections.get(canonicalCursor - 1);
    if (detour && detour.length > 0) {
      telemetry.wrongBranchCount += 1;
      for (let detourIndex = 0; detourIndex < detour.length; detourIndex += 1) {
        routeIndices.push(detour[detourIndex]);
        canonicalCursors.push(canonicalCursor - 1);
        segmentTrailModes.push('explore');
        cueOverrides.push(detourIndex === detour.length - 1 ? 'dead-end' : detourIndex === 0 ? 'anticipate' : null);
      }

      const backtrackRoute = detour.slice(0, -1).reverse();
      for (const step of backtrackRoute) {
        routeIndices.push(step);
        canonicalCursors.push(canonicalCursor - 1);
        segmentTrailModes.push('backtrack');
        cueOverrides.push('backtrack');
        telemetry.backtrackCount += 1;
      }

      routeIndices.push(canonicalPath[canonicalCursor - 1] ?? episode.raster.startIndex);
      canonicalCursors.push(canonicalCursor - 1);
      segmentTrailModes.push('backtrack');
      cueOverrides.push('backtrack');
      telemetry.backtrackCount += 1;
      telemetry.recoveryCount += 1;
    }

    routeIndices.push(canonicalPath[canonicalCursor] ?? episode.raster.endIndex);
    canonicalCursors.push(canonicalCursor);
    segmentTrailModes.push(canonicalCursor >= canonicalPath.length - 1 ? 'goal' : 'explore');
    cueOverrides.push(detour ? 'reacquire' : null);
    if (detour) {
      aiResetPathCursor = routeIndices.length - 1;
    }
  }

  return {
    routeIndices: Uint32Array.from(routeIndices),
    canonicalCursors: Uint32Array.from(canonicalCursors),
    segmentTrailModes,
    cueOverrides,
    telemetry,
    aiResetPathCursor
  };
};

const resolveRunnerWrongTurnBudget = (episode: MazeEpisode): number => {
  const difficultyBudget = episode.difficulty === 'chill'
    ? 1
    : episode.difficulty === 'standard'
      ? 1
      : episode.difficulty === 'spicy'
        ? 2
        : 2;
  const sizeBonus = episode.size === 'huge' ? 1 : 0;
  return Math.min(3, difficultyBudget + sizeBonus);
};

const resolveRunnerWrongTurnChance = (
  episode: MazeEpisode,
  canonicalCursor: number,
  pathLength: number
): number => {
  const progress = canonicalCursor / Math.max(1, pathLength - 1);
  const difficultyChance = episode.difficulty === 'chill'
    ? 0.22
    : episode.difficulty === 'standard'
      ? 0.3
      : episode.difficulty === 'spicy'
        ? 0.38
        : 0.42;
  const exitDecoyBias = progress >= 0.62 && progress <= 0.86 ? 0.08 : 0;
  return Math.max(0.12, Math.min(0.58, difficultyChance + exitDecoyBias));
};

const resolveBranchExcursion = (
  episode: MazeEpisode,
  canonicalPath: readonly number[],
  canonicalSet: ReadonlySet<number>,
  canonicalCursor: number
): number[] | null => {
  const width = episode.raster.width;
  const height = episode.raster.height;
  const tiles = episode.raster.tiles;
  const junctionIndex = canonicalPath[canonicalCursor];
  const previousIndex = canonicalPath[canonicalCursor - 1];
  const nextIndex = canonicalPath[canonicalCursor + 1];
  const maxDepth = episode.size === 'small' ? 2 : episode.size === 'medium' ? 3 : 4;
  const branchNeighbors = collectFloorNeighbors(junctionIndex, width, height, tiles)
    .filter((neighbor) => (
      neighbor !== previousIndex
      && neighbor !== nextIndex
      && !canonicalSet.has(neighbor)
    ));

  let bestPath: number[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const neighbor of branchNeighbors) {
    const candidate = findBestBranchPath(
      episode,
      junctionIndex,
      neighbor,
      canonicalSet,
      maxDepth
    );
    if (!candidate) {
      continue;
    }

    const score = candidate.length
      + (countFloorNeighbors(candidate[candidate.length - 1], width, height, tiles) <= 1 ? 1.2 : 0)
      + (manhattanDistance(candidate[candidate.length - 1], episode.raster.endIndex, width)
        < manhattanDistance(junctionIndex, episode.raster.endIndex, width) ? 0.35 : 0)
      + (randomFloat(mixSeed(episode.seed, canonicalCursor, neighbor)) * 0.12);
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidate;
    }
  }

  return bestPath;
};

const findBestBranchPath = (
  episode: MazeEpisode,
  junctionIndex: number,
  startIndex: number,
  canonicalSet: ReadonlySet<number>,
  maxDepth: number
): number[] | null => {
  const width = episode.raster.width;
  const height = episode.raster.height;
  const tiles = episode.raster.tiles;
  const parents = new Map<number, number>([[startIndex, junctionIndex]]);
  const depths = new Map<number, number>([[startIndex, 1]]);
  const queue: number[] = [startIndex];
  let bestTarget = startIndex;
  let bestScore = Number.NEGATIVE_INFINITY;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depths.get(current) ?? 1;
    const degree = countFloorNeighbors(current, width, height, tiles);
    const score = depth + (degree <= 1 ? 1.2 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = current;
    }

    if (depth >= maxDepth) {
      continue;
    }

    for (const neighbor of collectFloorNeighbors(current, width, height, tiles)) {
      if (neighbor === junctionIndex || parents.has(neighbor) || canonicalSet.has(neighbor)) {
        continue;
      }

      parents.set(neighbor, current);
      depths.set(neighbor, depth + 1);
      queue.push(neighbor);
    }
  }

  const path: number[] = [];
  let cursor = bestTarget;
  while (cursor !== junctionIndex) {
    path.push(cursor);
    const parent = parents.get(cursor);
    if (parent === undefined) {
      break;
    }
    cursor = parent;
  }

  path.reverse();
  return path.length > 0 ? path : null;
};

const collectFloorNeighbors = (
  index: number,
  width: number,
  height: number,
  tiles: Uint8Array
): number[] => {
  const neighbors: number[] = [];
  for (let direction = 0; direction < 4; direction += 1) {
    const nextIndex = getNeighborIndex(index, width, height, direction as 0 | 1 | 2 | 3);
    if (nextIndex !== -1 && isTileFloor(tiles, nextIndex)) {
      neighbors.push(nextIndex);
    }
  }
  return neighbors;
};

const countFloorNeighbors = (
  index: number,
  width: number,
  height: number,
  tiles: Uint8Array
): number => collectFloorNeighbors(index, width, height, tiles).length;

const manhattanDistance = (fromIndex: number, toIndex: number, width: number): number => (
  Math.abs((fromIndex % width) - (toIndex % width))
  + Math.abs(Math.floor(fromIndex / width) - Math.floor(toIndex / width))
);

const mixSeed = (seed: number, a: number, b: number): number => (
  Math.imul((seed >>> 0) ^ Math.imul((a + 1) >>> 0, 0x9e3779b1), ((b | 1) >>> 0)) >>> 0
);

const randomFloat = (state: number): number => ((state & 0xffff) / 0xffff);

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
