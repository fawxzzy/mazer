// Shared sampling helpers for the progression ladder report and its test.
import { createLegacyRuntimeMazeForMode } from '../../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_WINDOW,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetTarget
} from '../../../src/legacy-runtime/legacyGeometryBudget';
import { analyzeMazeDifficulty } from '../../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import {
  analyzeFeltStructure,
  measureFelt,
  simulatePullToGoalWalker
} from '../../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';
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
  // PRIMARY: the PRICED felt difficulty: deterministic pull-to-goal explorer steps minus
  // the steps loops and wrap corridors give back to a player who knows the map (identical
  // to the raw explorer steps for a plain single-route maze). This is what the ladder
  // lands in [T, T + window].
  felt: number;
  // The raw explorer steps (felt + loop saving + wrap saving).
  feltRaw: number;
  // Steps the maze's loops give back (0 for a single-route maze).
  loopSaving: number;
  // Steps the maze's wrap corridors give back (0 for a plain base).
  wrapSaving: number;
  // Mean PRICED steps over 8 other tie seeds (Monte-Carlo validation of `felt`).
  feltMonteCarlo: number;
  // Length of the path the explorer finally walks (backtracks excluded).
  explorerPath: number;
  // Zero-felt-cost fringe stub cells the maze carries (levels past the felt saturation, else 0).
  fringeCells: number;
  // The REVERSE felt value: the same explorer run from the goal to the start, minus the same
  // priced savings. What a player who solves the (fully visible) maze backwards pays.
  reverseFelt: number;
  // The reverse floor this maze was held to (reverseStats.floor: it depends on the level and on whether the
  // maze owns a wrap corridor; 0 for the corridor of level 1).
  reverseFloor: number;
  // SECONDARY: the H1 structure proxy.
  proxy: number;
  ms: number;
  // Realized felt is inside [T(level), T(level) + window].
  onTarget: boolean;
  metrics: ReturnType<typeof analyzeMazeDifficulty>;
  structure: ReturnType<typeof analyzeFeltStructure>;
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
  const measured = measureFelt(maze);
  const loopSaving = (maze as LegacyMazeSnapshot).loopStats?.saved ?? 0;
  const wrapSaving = (maze as LegacyMazeSnapshot).wrapStats?.saved ?? 0;
  const felt = measured.steps - loopSaving - wrapSaving;
  let monteCarlo = 0;
  for (let tie = 1; tie <= 8; tie += 1) { monteCarlo += simulatePullToGoalWalker(maze, tie * 7919) - loopSaving - wrapSaving; }
  const target = resolveGeometryBudgetTarget(Math.min(Math.max(level, 2), GEOMETRY_BUDGET_SATURATION_LEVEL));
  return {
    level,
    board: board.name,
    seed,
    felt,
    feltRaw: measured.steps,
    loopSaving,
    wrapSaving,
    feltMonteCarlo: monteCarlo / 8,
    explorerPath: measured.pathLength,
    fringeCells: (maze as LegacyMazeSnapshot).fringeStats?.cells ?? 0,
    reverseFelt: measureFelt({ ...maze, start: maze.goal, goal: maze.start }).steps - loopSaving - wrapSaving,
    reverseFloor: (maze as LegacyMazeSnapshot).reverseStats?.floor ?? 0,
    proxy: measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze)).total,
    ms,
    onTarget: level < 2 || target === null || (felt >= target && felt <= target + GEOMETRY_BUDGET_WINDOW),
    metrics: analyzeMazeDifficulty(maze),
    structure: analyzeFeltStructure(maze)
  };
};
