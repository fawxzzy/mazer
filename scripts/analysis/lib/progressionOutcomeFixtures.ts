// Deterministic run-outcome fixtures for the progression formula.
//
// Shared by tests/reset/legacy-progression-outcomes.test.ts (which pins how the
// CURRENT formula reacts) and scripts/analysis/progression-formula-compare.ts
// (which replays the same receipts through a stated candidate). Nothing here
// reads a wall clock, a random source, or storage: every receipt is built from
// fixed literals so the numbers pinned downstream are reproducible.
//
// The five outcomes are the ones the mazer-ai-level-rank-progression board
// card names: perfect, strong, average, weak, failed. A "failed" fixture is
// still a COMPLETED maze (it has a receipt) that used a reset and wandered
// far off the shortest route; an abandoned run never produces a receipt and
// therefore never reaches progression at all.
import type { LegacyMazeSnapshot, LegacyPoint } from '../../../src/legacy-runtime/legacyMaze';
import {
  createMazeCycleTelemetryReceipt,
  type MazeCycleAiDecisionSummary,
  type MazeCycleTelemetryReceipt,
  type MazeCycleTelemetrySurface
} from '../../../src/legacy-runtime/mazeCycleTelemetry';

export const PROGRESSION_OUTCOME_IDS = ['perfect', 'strong', 'average', 'weak', 'failed'] as const;
export type ProgressionOutcomeId = (typeof PROGRESSION_OUTCOME_IDS)[number];

export interface ProgressionOutcomeFixture {
  /** Actor path length in tiles (shortest viable path of the fixture maze is 13). */
  actorPathLength: number;
  aiDecisionSummary: Omit<MazeCycleAiDecisionSummary, 'decisionCount'>;
  averageFrameMs: number;
  backtracks: number;
  completionTimeMs: number;
  id: ProgressionOutcomeId;
  resetUsed: boolean;
  wrongTurns: number;
}

const aiSummary = (
  wrongBranchCount: number,
  backtrackCount: number,
  recoveryCount: number,
  optionalRetargetCount: number,
  visitedUndoCount: number
): Omit<MazeCycleAiDecisionSummary, 'decisionCount'> => ({
  backtrackCount,
  optionalRetargetCount,
  recoveryCount,
  thinkingModel: 'human-local-memory',
  visitedUndoCount,
  wrongBranchCount
});

export const PROGRESSION_OUTCOME_FIXTURES: Record<ProgressionOutcomeId, ProgressionOutcomeFixture> = {
  // Walked the shortest route quickly with no mistakes.
  perfect: {
    actorPathLength: 13,
    aiDecisionSummary: aiSummary(0, 0, 0, 0, 0),
    averageFrameMs: 16,
    backtracks: 0,
    completionTimeMs: 9_000,
    id: 'perfect',
    resetUsed: false,
    wrongTurns: 0
  },
  // Small detour, one wrong turn and one backtrack, still comfortably fast.
  strong: {
    actorPathLength: 15,
    aiDecisionSummary: aiSummary(1, 1, 0, 1, 0),
    averageFrameMs: 16,
    backtracks: 1,
    completionTimeMs: 16_000,
    id: 'strong',
    resetUsed: false,
    wrongTurns: 1
  },
  // About 60 percent route overrun, a couple of mistakes, near-expected time.
  average: {
    actorPathLength: 21,
    aiDecisionSummary: aiSummary(2, 2, 1, 1, 0),
    averageFrameMs: 16,
    backtracks: 2,
    completionTimeMs: 27_000,
    id: 'average',
    resetUsed: false,
    wrongTurns: 2
  },
  // More than double the shortest route, repeated mistakes, slow, no reset.
  weak: {
    actorPathLength: 29,
    aiDecisionSummary: aiSummary(4, 4, 2, 2, 1),
    averageFrameMs: 16,
    backtracks: 4,
    completionTimeMs: 34_000,
    id: 'weak',
    resetUsed: false,
    wrongTurns: 4
  },
  // Reset used, route four times the shortest, chaotic AI decision pressure,
  // very slow. (A reset with only "searching" AI pressure is capped to hold by
  // the scorer's searching-exhaustion rule, so the AI fixture is chaotic.)
  failed: {
    actorPathLength: 52,
    aiDecisionSummary: aiSummary(20, 15, 10, 8, 6),
    averageFrameMs: 16,
    backtracks: 15,
    completionTimeMs: 45_000,
    id: 'failed',
    resetUsed: true,
    wrongTurns: 20
  }
};

export const createProgressionOutcomeFixtureMaze = (): LegacyMazeSnapshot => ({
  source: 'play-generated',
  width: 9,
  height: 9,
  grid: [
    [false, false, false, false, false, false, false, false, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, false, false, false, false, true, false],
    [false, true, true, true, true, true, false, true, false],
    [false, false, false, false, false, true, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, true, false, true, false, false, false, true, false],
    [false, true, true, true, true, true, true, true, false],
    [false, false, false, false, false, false, false, false, false]
  ],
  start: { x: 1, y: 1 },
  goal: { x: 7, y: 7 },
  solutionPath: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    { x: 6, y: 1 },
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 3 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
    { x: 7, y: 6 },
    { x: 7, y: 7 }
  ],
  seed: 917,
  routeQualityStats: {
    bypassableRouteBands: 3,
    bypassableSolutionEdges: 5,
    meaningfulBypassableRouteBands: 2,
    meaningfulBypassableSolutionEdges: 3,
    minimumMeaningfulDetour: 3,
    routeQuality: 'multi-route',
    sampledSolutionEdges: 12
  },
  shortcutStats: {
    requested: 8,
    attempts: 10,
    created: 4,
    wallArrayEntries: 18,
    uniqueWallCandidates: 12,
    exhaustedWallArray: false
  },
  shortcutsCreated: 4,
  pathBuilderStats: {
    acceptedCheckpoints: 9,
    backtracks: 2,
    deterministicSafetyStart: false,
    exhaustedCheckpoints: true,
    longestPathLength: 13,
    pathTiles: 13,
    requestedCheckpoints: 9,
    topology: 'legacy-checkpoint-path-builder',
    wallArrayEntries: 12
  }
});

// The shortest route first, then (for overruns) the last two route tiles are
// revisited so the path has the requested length. Wrong-turn/backtrack counts
// are passed explicitly by the fixture, so the path only needs the right length.
const createActorPath = (maze: LegacyMazeSnapshot, length: number): LegacyPoint[] => {
  const route = maze.solutionPath;
  if (length <= route.length) {
    return route.slice(0, length).map((point) => ({ ...point }));
  }
  const path = route.map((point) => ({ ...point }));
  const tail = route.slice(-2);
  while (path.length < length) {
    path.push({ ...tail[path.length % 2]! });
  }
  // End on the goal so the receipt describes a completed run.
  path[path.length - 1] = { ...route[route.length - 1]! };
  return path;
};

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Builds one deterministic receipt. `sequenceIndex` offsets completedAt (one
 * minute apart) and the client run id so a replayed sequence yields distinct,
 * non-duplicate receipts.
 */
export const createProgressionOutcomeReceipt = (
  outcomeId: ProgressionOutcomeId,
  surface: MazeCycleTelemetrySurface,
  sequenceIndex = 0
): MazeCycleTelemetryReceipt => {
  const fixture = PROGRESSION_OUTCOME_FIXTURES[outcomeId];
  const maze = { ...createProgressionOutcomeFixtureMaze(), seed: 917 + sequenceIndex };
  const completedAt = new Date(Date.UTC(2026, 10, 5, 12, sequenceIndex, 0)).toISOString();
  return createMazeCycleTelemetryReceipt({
    aiDecisionSummary: surface === 'menu-demo'
      ? { ...fixture.aiDecisionSummary, decisionCount: fixture.actorPathLength }
      : null,
    averageFrameMs: fixture.averageFrameMs,
    backtracks: fixture.backtracks,
    clientRunId: `00000000-0000-4000-8000-${pad(sequenceIndex + 1, 12)}`,
    completedAt,
    completionTimeMs: fixture.completionTimeMs,
    controlMode: 'stick',
    maze,
    playerPath: createActorPath(maze, fixture.actorPathLength),
    resetUsed: fixture.resetUsed,
    surface,
    wrongTurns: fixture.wrongTurns
  });
};

/** The fixture maze with the seed the matching receipt used. */
export const createProgressionOutcomeMaze = (sequenceIndex = 0): LegacyMazeSnapshot => ({
  ...createProgressionOutcomeFixtureMaze(),
  seed: 917 + sequenceIndex
});
