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

export const resolveLegacyMenuDemoTrail = (
  state: DemoWalkerState,
  width: number,
  toggleTrailFade: boolean,
  trailFadeTail: number
): LegacyPoint[] => buildPathTrail(
  resolveLegacyTrailFromDemoSteps(state.trailSteps, width),
  toggleTrailFade ? trailFadeTail : null
);

export const isFixedLegacyMenuSnapshot = (maze: Pick<LegacyMazeSnapshot, 'source'>): boolean => (
  maze.source === 'menu-snapshot'
);

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
  const shouldBootstrapSnapshotRoute = isFixedSnapshot && config.behavior.enableRunnerMistakes === true;
  const basePrerollSteps = Math.max(0, config.behavior.prerollSteps ?? legacyTuning.demo.behavior.prerollSteps ?? 0);
  const prerollSteps = shouldBootstrapSnapshotRoute
    ? Math.min(basePrerollSteps, Math.max(0, maze.solutionPath.length - 8))
    : basePrerollSteps;

  if (shouldBootstrapSnapshotRoute) {
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
      if (advance.state.cue === 'dead-end') {
        break;
      }
      if (advance.state.resetReason === 'ai-path-exhausted') {
        break;
      }
      state = advance.state;
      stepsTaken += 1;
    }
  } else {
    for (let step = 0; step < prerollSteps; step += 1) {
      const advance = advanceDemoWalker(episode, state, config);
      if (advance.shouldRegenerateMaze || state.phase !== 'explore') {
        break;
      }
      if (advance.state.phase !== 'explore') {
        break;
      }
      state = advance.state;
    }
  }

  return {
    episode,
    config,
    state,
    player: resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width),
    trail: resolveLegacyMenuDemoTrail(state, episode.raster.width, toggleTrailFade, trailFadeTail)
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
    trail: resolveLegacyMenuDemoTrail(advance.state, episode.raster.width, toggleTrailFade, trailFadeTail)
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
