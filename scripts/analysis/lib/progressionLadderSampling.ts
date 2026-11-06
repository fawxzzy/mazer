// Shared sampling helpers for the progression ladder report and its test.
import { createLegacyRuntimeMazeForMode } from '../../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_TUNING_TOLERANCE,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetTarget
} from '../../../src/legacy-runtime/legacyGeometryBudget';
import { analyzeMazeDifficulty } from '../../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeComplexity,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../../src/legacy-runtime/legacyProgression';

export const LADDER_BOARDS = [
  { name: 'phone', aspectRatio: 23 / 51 },
  { name: 'desktop', aspectRatio: 45 / 27 }
] as const;

const baselineTrack = createEmptyLegacyProgressionState().tracks.player;
export const trackForLevel = (level: number) => ({
  ...baselineTrack,
  level: String(level),
  targetComplexity: Math.min(400, 8 + ((level - 1) * 4))
});

export interface LadderLevelSample {
  level: number;
  board: string;
  seed: number;
  proxy: number;
  ms: number;
  onTarget: boolean;
  metrics: ReturnType<typeof analyzeMazeDifficulty>;
  grid: string;
}

export const seedForIndex = (index: number): number => 1337 + (index * 104729);

export const generateLadderMaze = (
  level: number,
  board: typeof LADDER_BOARDS[number],
  seed: number,
  mode: 'play' | 'menu' = 'play'
) => createLegacyRuntimeMazeForMode(
  mode,
  35,
  seed,
  resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level)),
  {},
  board.aspectRatio
);

// FNV-1a 32-bit over the floor grid, start, goal and solution path: an integer-only
// fingerprint of one generated maze (used by the golden regression fixture).
export const hashLadderMaze = (maze: ReturnType<typeof generateLadderMaze>): string => {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ (value & 0xff), 0x01000193) >>> 0;
    hash = Math.imul(hash ^ ((value >>> 8) & 0xff), 0x01000193) >>> 0;
  };
  mix(maze.width);
  mix(maze.height);
  for (const row of maze.grid) {
    for (const cell of row) { mix(cell ? 1 : 0); }
  }
  [maze.start, maze.goal].forEach((point) => { mix(point.x); mix(point.y); });
  maze.solutionPath.forEach((point) => { mix(point.x); mix(point.y); });
  return hash.toString(16).padStart(8, '0');
};

export const sampleLevel = (level: number, board: typeof LADDER_BOARDS[number], seed: number): LadderLevelSample => {
  const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
  const started = performance.now();
  const maze = createLegacyRuntimeMazeForMode('play', 35, seed, profile, {}, board.aspectRatio);
  const ms = performance.now() - started;
  const proxy = measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total;
  const target = resolveGeometryBudgetTarget(Math.min(Math.max(level, 2), GEOMETRY_BUDGET_SATURATION_LEVEL));
  return {
    level,
    board: board.name,
    seed,
    proxy,
    ms,
    onTarget: level < 2 || target === null || Math.abs(proxy - target) <= GEOMETRY_BUDGET_TUNING_TOLERANCE,
    metrics: analyzeMazeDifficulty(maze),
    grid: ''
  };
};

