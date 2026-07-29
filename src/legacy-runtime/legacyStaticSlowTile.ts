import {
  resolveLegacyPlayableShortestPath,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';
import type { LegacyProgressionDifficultyBand } from './legacyProgression';

export const LEGACY_STATIC_SLOW_TILE_PENALTY_MS = 440;
export const LEGACY_STATIC_SLOW_TILE_CONTRACT_VERSION = 'legacy-static-slow-tile-v1' as const;

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
  state: LegacyStaticSlowTileState | null;
  triggered: boolean;
}

const pointsMatch = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

const normalizeNowMs = (nowMs: number): number => (
  Number.isFinite(nowMs) ? Math.max(0, Math.round(nowMs)) : 0
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

export const applyLegacyStaticSlowTileEntry = (
  state: LegacyStaticSlowTileState | null,
  player: LegacyPoint,
  nowMs: number
): LegacyStaticSlowTileEntryResult => {
  if (
    state === null
    || state.consumed
    || state.placement === null
    || !pointsMatch(state.placement.point, player)
  ) {
    return { state, triggered: false };
  }

  const enteredAtMs = normalizeNowMs(nowMs);
  return {
    state: {
      ...state,
      consumed: true,
      delayUntilMs: enteredAtMs + state.penaltyMs,
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
