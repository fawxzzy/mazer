import {
  resolveLegacyPlayableShortestPath,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import type { LegacyProgressionDifficultyBand } from './legacyProgression';

export const LEGACY_STATIC_SLOW_TILE_PENALTY_MS = 440;
export const LEGACY_MYTHIC_TIMED_SLOW_GATE_CYCLE_MS = 880;
export const LEGACY_MYTHIC_TIMED_SLOW_GATE_ACTIVE_MS = 440;
export const LEGACY_MYTHIC_TIMED_SLOW_GATE_SAFE_MS = 440;
export const LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION = 'legacy-static-slow-tile-v2' as const;

export type LegacyStaticSlowTileTimingMode = 'disabled' | 'static' | 'timed';

export interface LegacyStaticSlowTilePhase {
  active: boolean;
  activeWindowMs: number | null;
  armed: boolean;
  cycleElapsedMs: number | null;
  cycleMs: number | null;
  mode: LegacyStaticSlowTileTimingMode;
  safeWindowMs: number | null;
}

export interface LegacyStaticSlowTilePlacement {
  alternateRouteStepCount: number;
  point: LegacyPoint;
  solutionPathIndex: number;
}

export interface LegacyStaticSlowTileState {
  band: LegacyProgressionDifficultyBand;
  blockedMoveCount: number;
  consumed: boolean;
  contractVersion: typeof LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION;
  delayUntilMs: number | null;
  eligible: boolean;
  enteredAtMs: number | null;
  entryCount: number;
  penaltyMs: typeof LEGACY_STATIC_SLOW_TILE_PENALTY_MS;
  placement: LegacyStaticSlowTilePlacement | null;
}

export interface LegacyStaticSlowTileEntryResult {
  penaltyAppliedMs: number;
  phase: LegacyStaticSlowTilePhase | null;
  state: LegacyStaticSlowTileState | null;
  triggered: boolean;
}

const pointsMatch = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

const normalizeNowMs = (nowMs: number): number => (
  Number.isFinite(nowMs) ? Math.max(0, Math.round(nowMs)) : 0
);

const normalizePhaseTimeMs = (timeMs: number): number => (
  Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0
);

const isEligibleBand = (band: LegacyProgressionDifficultyBand): boolean => (
  band === 'architect' || band === 'mythic'
);

const cloneGridWithoutPoint = (
  maze: Pick<LegacyMazeSnapshot, 'grid'>,
  point: LegacyPoint
): boolean[][] => maze.grid.map((row, y) => row.map((walkable, x) => (
  x === point.x && y === point.y ? false : walkable
)));

const resolveDeterministicCandidateIndex = (seed: number, candidateCount: number): number => {
  if (candidateCount <= 1) {
    return 0;
  }

  const mixed = Math.imul((Math.round(seed) >>> 0) ^ 0x51a7c0de, 0x45d9f3b) >>> 0;
  return mixed % candidateCount;
};

const resolvePlacement = (
  maze: Pick<LegacyMazeSnapshot, 'goal' | 'grid' | 'seed' | 'solutionPath' | 'start'>
): LegacyStaticSlowTilePlacement | null => {
  const lastIndex = maze.solutionPath.length - 1;
  const candidateCount = Math.max(0, lastIndex - 3);
  const candidateOffset = resolveDeterministicCandidateIndex(maze.seed, candidateCount);

  for (let attempt = 0; attempt < candidateCount; attempt += 1) {
    const index = 2 + ((candidateOffset + attempt) % candidateCount);
    const point = maze.solutionPath[index];
    if (!point || pointsMatch(point, maze.start) || pointsMatch(point, maze.goal)) {
      continue;
    }

    const alternateRoute = resolveLegacyPlayableShortestPath(
      cloneGridWithoutPoint(maze, point),
      maze.start,
      maze.goal
    );
    if (!alternateRoute.found || alternateRoute.stepCount === null) {
      continue;
    }

    return {
      alternateRouteStepCount: alternateRoute.stepCount,
      point: { ...point },
      solutionPathIndex: index
    };
  }

  return null;
};

export const createLegacyStaticSlowTileState = (
  maze: Pick<LegacyMazeSnapshot, 'goal' | 'grid' | 'seed' | 'solutionPath' | 'start'>,
  band: LegacyProgressionDifficultyBand
): LegacyStaticSlowTileState => {
  const eligible = isEligibleBand(band);
  const placement = eligible ? resolvePlacement(maze) : null;

  return {
    band,
    blockedMoveCount: 0,
    consumed: false,
    contractVersion: LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION,
    delayUntilMs: null,
    eligible,
    enteredAtMs: null,
    entryCount: 0,
    penaltyMs: LEGACY_STATIC_SLOW_TILE_PENALTY_MS,
    placement
  };
};

export const resolveLegacyStaticSlowTileRemainingMs = (
  state: LegacyStaticSlowTileState | null,
  nowMs: number
): number => {
  if (state?.delayUntilMs === null || state?.delayUntilMs === undefined) {
    return 0;
  }

  return Math.max(0, Math.ceil(state.delayUntilMs - normalizeNowMs(nowMs)));
};

export const isLegacyStaticSlowTileDelayActive = (
  state: LegacyStaticSlowTileState | null,
  nowMs: number
): boolean => resolveLegacyStaticSlowTileRemainingMs(state, nowMs) > 0;

export const resolveLegacyStaticSlowTilePhase = (
  state: LegacyStaticSlowTileState | null,
  nowMs: number,
  playTimerEpochMs: number
): LegacyStaticSlowTilePhase => {
  if (state === null || !state.eligible || state.placement === null) {
    return {
      active: false,
      activeWindowMs: null,
      armed: false,
      cycleElapsedMs: null,
      cycleMs: null,
      mode: 'disabled',
      safeWindowMs: null
    };
  }

  if (state.band !== 'mythic') {
    return {
      active: true,
      activeWindowMs: null,
      armed: !state.consumed,
      cycleElapsedMs: null,
      cycleMs: null,
      mode: 'static',
      safeWindowMs: null
    };
  }

  const elapsedMs = Math.max(
    0,
    normalizePhaseTimeMs(nowMs) - normalizePhaseTimeMs(playTimerEpochMs)
  );
  const cycleElapsedMs = elapsedMs % LEGACY_MYTHIC_TIMED_SLOW_GATE_CYCLE_MS;
  const active = cycleElapsedMs < LEGACY_MYTHIC_TIMED_SLOW_GATE_ACTIVE_MS;

  return {
    active,
    activeWindowMs: LEGACY_MYTHIC_TIMED_SLOW_GATE_ACTIVE_MS,
    armed: !state.consumed && active,
    cycleElapsedMs,
    cycleMs: LEGACY_MYTHIC_TIMED_SLOW_GATE_CYCLE_MS,
    mode: 'timed',
    safeWindowMs: LEGACY_MYTHIC_TIMED_SLOW_GATE_SAFE_MS
  };
};

export const applyLegacyStaticSlowTileEntry = (
  state: LegacyStaticSlowTileState | null,
  player: LegacyPoint,
  nowMs: number,
  playTimerEpochMs = 0
): LegacyStaticSlowTileEntryResult => {
  if (
    state === null
    || state.consumed
    || state.placement === null
    || !pointsMatch(state.placement.point, player)
  ) {
    return {
      penaltyAppliedMs: 0,
      phase: null,
      state,
      triggered: false
    };
  }

  const enteredAtMs = normalizeNowMs(nowMs);
  const phase = resolveLegacyStaticSlowTilePhase(state, nowMs, playTimerEpochMs);
  const penaltyAppliedMs = phase.active ? state.penaltyMs : 0;
  return {
    penaltyAppliedMs,
    phase,
    state: {
      ...state,
      consumed: true,
      delayUntilMs: penaltyAppliedMs > 0 ? enteredAtMs + penaltyAppliedMs : null,
      enteredAtMs,
      entryCount: state.entryCount + 1
    },
    triggered: true
  };
};

export const recordLegacyStaticSlowTileBlockedMove = (
  state: LegacyStaticSlowTileState | null,
  nowMs: number
): LegacyStaticSlowTileState | null => {
  if (!isLegacyStaticSlowTileDelayActive(state, nowMs) || state === null) {
    return state;
  }

  return {
    ...state,
    blockedMoveCount: state.blockedMoveCount + 1
  };
};
