import { advanceDemoWalker, createDemoWalkerState, type DemoWalkerConfig, type DemoWalkerState } from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import {
  createLegacyResetRequest,
  type LegacyResetRequest
} from './legacyPlayLifecycle';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  createLegacyMenuSnapshotDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex,
  resolveLegacyTrailFromDemoSteps
} from './legacyDemoWalker';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

const buildPathTrail = (
  points: readonly LegacyPoint[],
  limit: number | null
): LegacyPoint[] => {
  if (limit === null || points.length <= limit) {
    return points.map(copyPoint);
  }

  return points.slice(Math.max(0, points.length - limit)).map(copyPoint);
};

export const isFixedLegacyMenuSnapshot = (maze: Pick<LegacyMazeSnapshot, 'size'>): boolean => maze.size <= 25;

export interface LegacyMenuDemoBootstrap {
  config: DemoWalkerConfig;
  episode: MazeEpisode;
  player: LegacyPoint;
  state: DemoWalkerState;
  trail: LegacyPoint[];
}

export interface LegacyMenuDemoAdvance {
  delayMs: number;
  player: LegacyPoint;
  shouldRegenerateMaze: boolean;
  state: DemoWalkerState;
  trail: LegacyPoint[];
}

const LEGACY_MENU_SNAPSHOT_BOOTSTRAP_MIN_VISIBLE_CURSOR = 8;

const isStableSnapshotBootstrapState = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  minVisibleCursor: number
): boolean => (
  state.phase === 'explore'
  && state.cue !== 'spawn'
  && state.currentIndex !== episode.raster.startIndex
  && state.pathCursor >= minVisibleCursor
);

export const createLegacyMenuDemoBootstrap = (
  maze: LegacyMazeSnapshot,
  toggleTrailFade: boolean,
  trailFadeTail: number
): LegacyMenuDemoBootstrap => {
  const episode = createLegacyDemoWalkerEpisode(maze);
  const isFixedSnapshot = isFixedLegacyMenuSnapshot(maze);
  const config = isFixedSnapshot
    ? createLegacyMenuSnapshotDemoWalkerConfig(maze.seed)
    : createLegacyMenuDemoWalkerConfig(maze.seed);
  let state = createDemoWalkerState(episode, config);
  const basePrerollSteps = Math.max(0, config.behavior.prerollSteps ?? legacyTuning.demo.behavior.prerollSteps ?? 0);
  const prerollSteps = isFixedSnapshot
    ? Math.min(basePrerollSteps, Math.max(0, maze.solutionPath.length - 8))
    : basePrerollSteps;

  if (isFixedSnapshot) {
    const minVisibleCursor = Math.min(
      Math.max(1, LEGACY_MENU_SNAPSHOT_BOOTSTRAP_MIN_VISIBLE_CURSOR),
      Math.max(1, maze.solutionPath.length - 4)
    );
    const maxBootstrapSteps = Math.max(
      prerollSteps + Math.max(16, maze.solutionPath.length * 4),
      minVisibleCursor + 16
    );
    let stepsTaken = 0;

    while (stepsTaken < maxBootstrapSteps) {
      if (
        stepsTaken >= prerollSteps
        && isStableSnapshotBootstrapState(episode, state, minVisibleCursor)
      ) {
        break;
      }

      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;
      stepsTaken += 1;
    }
  } else {
    for (let step = 0; step < prerollSteps; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      state = advance.state;
      if (advance.shouldRegenerateMaze || state.phase !== 'explore') {
        break;
      }
    }
  }

  return {
    episode,
    config,
    state,
    player: resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width),
    trail: buildPathTrail(
      resolveLegacyTrailFromDemoSteps(state.trailSteps, episode.raster.width),
      toggleTrailFade ? trailFadeTail : null
    )
  };
};

export const advanceLegacyMenuDemoFrame = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  config: DemoWalkerConfig,
  toggleTrailFade: boolean,
  trailFadeTail: number
): LegacyMenuDemoAdvance => {
  const advance = advanceDemoWalker(episode, state, config);

  return {
    delayMs: advance.delayMs,
    shouldRegenerateMaze: Boolean(advance.shouldRegenerateMaze),
    state: advance.state,
    player: resolveLegacyPointFromDemoIndex(advance.state.currentIndex, episode.raster.width),
    trail: buildPathTrail(
      resolveLegacyTrailFromDemoSteps(advance.state.trailSteps, episode.raster.width),
      toggleTrailFade ? trailFadeTail : null
    )
  };
};

export const createLegacyMenuDemoGoalResetRequest = (
  nowMs: number
): LegacyResetRequest => createLegacyResetRequest({
  delayMs: 0,
  mode: 'menu',
  nowMs,
  reason: 'goal'
});
