import {
  resolveLegacyPlayableShortestPath,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import type { LegacyProgressionDifficultyBand } from './legacyProgression';

export const LEGACY_PATROL_AGENT_CONTRACT_VERSION = 'legacy-patrol-agent-v3' as const;
export const LEGACY_PATROL_AGENT_ROUTE_TILE_COUNT = 2 as const;
export const LEGACY_PATROL_AGENT_STEP_MS = 440 as const;
export const LEGACY_PATROL_AGENT_ROUND_TRIP_MS = 880 as const;
export const LEGACY_PATROL_AGENT_COLLISION_DELAY_MS = 440 as const;
export const LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS = 220 as const;
export const LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS = 220 as const;

export interface LegacyPatrolAgentPlacement {
  alternateRouteStepCount: number;
  route: [LegacyPoint, LegacyPoint];
  solutionPathIndices: [number, number];
}

export interface LegacyPatrolAgentState {
  band: 'mythic';
  blockedMoveCount: number;
  collisionCount: number;
  collisionDelayUntilMs: number | null;
  collisionEpisodeActive: boolean;
  contractVersion: typeof LEGACY_PATROL_AGENT_CONTRACT_VERSION;
  currentRouteIndex: 0 | 1;
  eligible: true;
  lastResolvedTickIndex: number;
  lastStepAtMs: number | null;
  penaltyCount: number;
  placement: LegacyPatrolAgentPlacement;
  stepCount: number;
}

export interface LegacyPatrolAgentTickResult {
  state: LegacyPatrolAgentState | null;
  tickIndex: number;
  triggered: boolean;
}

export interface LegacyPatrolAgentCollisionResult {
  penaltyAppliedMs: number;
  state: LegacyPatrolAgentState | null;
  triggered: boolean;
}

export interface LegacyPatrolAgentCollisionFeedbackFrame {
  active: boolean;
  elapsedMs: number | null;
  windowMs: typeof LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS;
}

export interface LegacyPatrolAgentTelegraphFrame {
  active: boolean;
  elapsedInStepMs: number | null;
  msUntilStep: number | null;
  nextPoint: LegacyPoint | null;
  nextRouteIndex: 0 | 1 | null;
  telegraphWindowMs: typeof LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS;
}

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const pointsMatch = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

const normalizeTimeMs = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

const cloneGridWithoutPoints = (
  grid: LegacyMazeSnapshot['grid'],
  excludedPoints: readonly LegacyPoint[]
): boolean[][] => {
  const excludedKeys = new Set(excludedPoints.map(pointKey));
  return grid.map((row, y) => row.map((walkable, x) => (
    excludedKeys.has(`${x},${y}`) ? false : walkable
  )));
};

const resolvePlacement = (
  maze: Pick<LegacyMazeSnapshot, 'goal' | 'grid' | 'solutionPath' | 'start'>,
  excludedPoints: readonly LegacyPoint[]
): LegacyPatrolAgentPlacement | null => {
  const excludedKeys = new Set(excludedPoints.map(pointKey));
  const maximumFirstIndex = maze.solutionPath.length - 3;

  for (let firstIndex = 2; firstIndex <= maximumFirstIndex; firstIndex += 1) {
    const secondIndex = firstIndex + 1;
    const first = maze.solutionPath[firstIndex];
    const second = maze.solutionPath[secondIndex];
    if (!first || !second) {
      continue;
    }
    if (
      pointsMatch(first, maze.start)
      || pointsMatch(first, maze.goal)
      || pointsMatch(second, maze.start)
      || pointsMatch(second, maze.goal)
      || excludedKeys.has(pointKey(first))
      || excludedKeys.has(pointKey(second))
    ) {
      continue;
    }

    const alternateRoute = resolveLegacyPlayableShortestPath(
      cloneGridWithoutPoints(maze.grid, [first, second]),
      maze.start,
      maze.goal
    );
    if (!alternateRoute.found || alternateRoute.stepCount === null) {
      continue;
    }

    return {
      alternateRouteStepCount: alternateRoute.stepCount,
      route: [{ ...first }, { ...second }],
      solutionPathIndices: [firstIndex, secondIndex]
    };
  }

  return null;
};

export const createLegacyPatrolAgentState = (
  maze: Pick<LegacyMazeSnapshot, 'goal' | 'grid' | 'solutionPath' | 'start'>,
  band: LegacyProgressionDifficultyBand,
  excludedPoints: readonly LegacyPoint[] = []
): LegacyPatrolAgentState | null => {
  if (band !== 'mythic') {
    return null;
  }

  const placement = resolvePlacement(maze, excludedPoints);
  if (placement === null) {
    return null;
  }

  return {
    band,
    blockedMoveCount: 0,
    collisionCount: 0,
    collisionDelayUntilMs: null,
    collisionEpisodeActive: false,
    contractVersion: LEGACY_PATROL_AGENT_CONTRACT_VERSION,
    currentRouteIndex: 0,
    eligible: true,
    lastResolvedTickIndex: 0,
    lastStepAtMs: null,
    penaltyCount: 0,
    placement,
    stepCount: 0
  };
};

export const resolveLegacyPatrolAgentPoint = (
  state: LegacyPatrolAgentState | null
): LegacyPoint | null => {
  if (state === null) {
    return null;
  }
  return { ...state.placement.route[state.currentRouteIndex] };
};

export const resolveLegacyPatrolAgentTelegraph = (
  state: LegacyPatrolAgentState | null,
  nowMs: number,
  playTimerEpochMs: number,
  simulationRunning: boolean
): LegacyPatrolAgentTelegraphFrame => {
  if (state === null) {
    return {
      active: false,
      elapsedInStepMs: null,
      msUntilStep: null,
      nextPoint: null,
      nextRouteIndex: null,
      telegraphWindowMs: LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS
    };
  }

  const elapsedMs = Math.max(
    0,
    normalizeTimeMs(nowMs) - normalizeTimeMs(playTimerEpochMs)
  );
  const elapsedInStepMs = elapsedMs % LEGACY_PATROL_AGENT_STEP_MS;
  const nextRouteIndex = state.currentRouteIndex === 0 ? 1 : 0;

  return {
    active: simulationRunning
      && elapsedInStepMs >= LEGACY_PATROL_AGENT_STEP_MS - LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS,
    elapsedInStepMs,
    msUntilStep: Math.ceil(LEGACY_PATROL_AGENT_STEP_MS - elapsedInStepMs),
    nextPoint: { ...state.placement.route[nextRouteIndex] },
    nextRouteIndex,
    telegraphWindowMs: LEGACY_PATROL_AGENT_TELEGRAPH_WINDOW_MS
  };
};

export const resolveLegacyPatrolAgentTick = (
  state: LegacyPatrolAgentState | null,
  nowMs: number,
  playTimerEpochMs: number,
  simulationRunning: boolean
): LegacyPatrolAgentTickResult => {
  if (state === null) {
    return { state, tickIndex: 0, triggered: false };
  }

  const elapsedMs = Math.max(
    0,
    normalizeTimeMs(nowMs) - normalizeTimeMs(playTimerEpochMs)
  );
  const tickIndex = Math.floor(elapsedMs / LEGACY_PATROL_AGENT_STEP_MS);
  if (!simulationRunning || tickIndex <= state.lastResolvedTickIndex) {
    return {
      state: tickIndex === state.lastResolvedTickIndex
        ? state
        : { ...state, lastResolvedTickIndex: tickIndex },
      tickIndex,
      triggered: false
    };
  }

  return {
    state: {
      ...state,
      lastResolvedTickIndex: tickIndex
    },
    tickIndex,
    triggered: true
  };
};

export const advanceLegacyPatrolAgent = (
  state: LegacyPatrolAgentState | null,
  nowMs: number
): LegacyPatrolAgentState | null => {
  if (state === null) {
    return null;
  }

  return {
    ...state,
    currentRouteIndex: state.currentRouteIndex === 0 ? 1 : 0,
    lastStepAtMs: Math.round(normalizeTimeMs(nowMs)),
    stepCount: state.stepCount + 1
  };
};

export const applyLegacyPatrolAgentCollision = (
  state: LegacyPatrolAgentState | null,
  player: LegacyPoint,
  nowMs: number
): LegacyPatrolAgentCollisionResult => {
  const patrolPoint = resolveLegacyPatrolAgentPoint(state);
  if (state === null || patrolPoint === null || !pointsMatch(patrolPoint, player)) {
    return {
      penaltyAppliedMs: 0,
      state: state?.collisionEpisodeActive
        ? { ...state, collisionEpisodeActive: false }
        : state,
      triggered: false
    };
  }

  if (state.collisionEpisodeActive) {
    return {
      penaltyAppliedMs: 0,
      state,
      triggered: false
    };
  }

  const collisionAtMs = Math.round(normalizeTimeMs(nowMs));
  return {
    penaltyAppliedMs: LEGACY_PATROL_AGENT_COLLISION_DELAY_MS,
    state: {
      ...state,
      collisionCount: state.collisionCount + 1,
      collisionDelayUntilMs: Math.max(
        state.collisionDelayUntilMs ?? 0,
        collisionAtMs + LEGACY_PATROL_AGENT_COLLISION_DELAY_MS
      ),
      collisionEpisodeActive: true,
      penaltyCount: state.penaltyCount + 1
    },
    triggered: true
  };
};

export const resolveLegacyPatrolAgentRemainingMs = (
  state: LegacyPatrolAgentState | null,
  nowMs: number
): number => {
  if (state?.collisionDelayUntilMs === null || state?.collisionDelayUntilMs === undefined) {
    return 0;
  }
  return Math.max(0, Math.ceil(state.collisionDelayUntilMs - normalizeTimeMs(nowMs)));
};

export const resolveLegacyPatrolAgentCollisionFeedback = (
  state: LegacyPatrolAgentState | null,
  nowMs: number
): LegacyPatrolAgentCollisionFeedbackFrame => {
  if (state?.collisionDelayUntilMs === null || state?.collisionDelayUntilMs === undefined) {
    return {
      active: false,
      elapsedMs: null,
      windowMs: LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS
    };
  }

  const collisionAtMs = state.collisionDelayUntilMs - LEGACY_PATROL_AGENT_COLLISION_DELAY_MS;
  const elapsedMs = Math.max(0, Math.round(normalizeTimeMs(nowMs) - collisionAtMs));
  return {
    active: elapsedMs < LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS,
    elapsedMs,
    windowMs: LEGACY_PATROL_AGENT_COLLISION_FEEDBACK_WINDOW_MS
  };
};

export const isLegacyPatrolAgentDelayActive = (
  state: LegacyPatrolAgentState | null,
  nowMs: number
): boolean => resolveLegacyPatrolAgentRemainingMs(state, nowMs) > 0;

export const recordLegacyPatrolAgentBlockedMove = (
  state: LegacyPatrolAgentState | null,
  nowMs: number
): LegacyPatrolAgentState | null => {
  if (state === null || !isLegacyPatrolAgentDelayActive(state, nowMs)) {
    return state;
  }
  return {
    ...state,
    blockedMoveCount: state.blockedMoveCount + 1
  };
};
