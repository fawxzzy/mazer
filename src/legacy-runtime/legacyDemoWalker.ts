import type { DemoTrailStep, DemoWalkerConfig } from '../domain/ai';
import type { MazeDifficulty, MazeEpisode, MazeSize } from '../domain/maze';
import { TILE_END, TILE_FLOOR, TILE_PATH, createGrid, indexFromCoordinates, xFromIndex, yFromIndex } from '../domain/maze/grid';
import { legacyTuning } from '../config/tuning';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

export const LEGACY_MENU_SNAPSHOT_PREROLL_STEPS = 72;
export const LEGACY_MENU_SNAPSHOT_CADENCE = {
  spawnHoldMs: 220,
  exploreStepMs: 104,
  backtrackStepMs: 104,
  decisionPauseMs: 104,
  anticipationStepMs: 104,
  branchCommitMs: 104,
  branchResumeMs: 104,
  goalHoldMs: 1180,
  resetHoldMs: 340
} as const;

const pointToIndex = (point: LegacyPoint, width: number): number => indexFromCoordinates(point.x, point.y, width);

const inferLegacyMazeSize = (scale: number): MazeSize => {
  if (scale <= 25) {
    return 'small';
  }
  if (scale <= 50) {
    return 'medium';
  }
  if (scale <= 75) {
    return 'large';
  }
  return 'huge';
};

const inferLegacyMazeDifficulty = (maze: LegacyMazeSnapshot): MazeDifficulty => {
  if (maze.solutionPath.length >= 240) {
    return 'brutal';
  }
  if (maze.solutionPath.length >= 160) {
    return 'spicy';
  }
  if (maze.solutionPath.length <= 72) {
    return 'chill';
  }
  return 'standard';
};

export const createLegacyMenuDemoWalkerConfig = (seed: number): DemoWalkerConfig => ({
  ...legacyTuning.demo,
  seed,
  cadence: {
    ...legacyTuning.demo.cadence,
    exploreStepMs: 88,
    backtrackStepMs: 88,
    goalHoldMs: 0,
    resetHoldMs: 0
  },
  behavior: {
    ...legacyTuning.demo.behavior,
    trailMaxLength: 2048,
    enableRunnerMistakes: true,
    emulateLogicSwitchPotentialCheckBug: false,
    runnerThinkingModel: 'human-local-memory',
    prerollSteps: 0
  }
});

export const createLegacyMenuSnapshotDemoWalkerConfig = (seed: number): DemoWalkerConfig => {
  const baseConfig = createLegacyMenuDemoWalkerConfig(seed);

  return {
    ...baseConfig,
    cadence: {
      ...baseConfig.cadence,
      ...LEGACY_MENU_SNAPSHOT_CADENCE,
      goalHoldMs: 0,
      resetHoldMs: 0
    },
    behavior: {
      ...baseConfig.behavior,
      enableRunnerMistakes: true,
      emulateLogicSwitchPotentialCheckBug: false,
      runnerThinkingModel: 'human-local-memory',
      prerollSteps: 0
    }
  };
};

export const createLegacyDemoWalkerEpisode = (maze: LegacyMazeSnapshot): MazeEpisode => {
  const tiles = createGrid(maze.size, maze.size);
  let floorCount = 0;

  for (let y = 0; y < maze.size; y += 1) {
    for (let x = 0; x < maze.size; x += 1) {
      if (maze.grid[y]?.[x] !== true) {
        continue;
      }

      const index = indexFromCoordinates(x, y, maze.size);
      tiles[index] |= TILE_FLOOR;
      floorCount += 1;
    }
  }

  const pathIndices = Uint32Array.from(maze.solutionPath.map((point) => pointToIndex(point, maze.size)));
  for (const pathIndex of pathIndices) {
    tiles[pathIndex] |= TILE_PATH;
  }

  const startIndex = pointToIndex(maze.start, maze.size);
  const endIndex = pointToIndex(maze.goal, maze.size);
  tiles[endIndex] |= TILE_END;

  return {
    seed: maze.seed,
    size: inferLegacyMazeSize(maze.size),
    generationTrace: {
      rootTileIndex: startIndex,
      uniqueTileCount: pathIndices.length,
      steps: []
    },
    raster: {
      width: maze.size,
      height: maze.size,
      scale: maze.size,
      tiles,
      pathIndices,
      startIndex,
      endIndex
    },
    metrics: {
      solutionLength: pathIndices.length,
      deadEnds: 0,
      junctions: 0,
      branchDensity: 0,
      straightness: 0,
      coverage: floorCount > 0 ? pathIndices.length / floorCount : 0
    },
    routeMotifs: {
      falseShortcutBranches: 0,
      nearGoalBranches: 0,
      hubJunctions: 0,
      chokeCorridors: 0,
      loopDetours: 0
    },
    shortcutsCreated: maze.shortcutsCreated ?? 0,
    accepted: true,
    difficulty: inferLegacyMazeDifficulty(maze),
    difficultyScore: 0,
    family: 'classic',
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic'
  };
};

export const resolveLegacyPointFromDemoIndex = (index: number, width: number): LegacyPoint => ({
  x: xFromIndex(index, width),
  y: yFromIndex(index, width)
});

export const resolveLegacyTrailFromDemoSteps = (
  trailSteps: readonly DemoTrailStep[],
  width: number
): LegacyPoint[] => trailSteps.map((step) => resolveLegacyPointFromDemoIndex(step.index, width));
