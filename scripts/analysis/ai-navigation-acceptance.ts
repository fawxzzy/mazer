import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  advanceDemoWalker,
  collectDemoWalkerRouteDiagnostics,
  createDemoWalkerState,
  type DemoWalkerAiSkillRank
} from '../../src/domain/ai';
import { isTileFloor } from '../../src/domain/maze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig
} from '../../src/legacy-runtime/legacyDemoWalker';
import {
  createLegacyGeneratedMenuMaze,
  resolveLegacyPlayableShortestPath
} from '../../src/legacy-runtime/legacyMaze';

export const AI_NAVIGATION_ACCEPTANCE_RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export const AI_NAVIGATION_ACCEPTANCE_SCALES = [25, 29, 37, 43, 50, 55, 63, 71, 83, 95] as const;
export const AI_NAVIGATION_ACCEPTANCE_SEED_START = 1;
export const AI_NAVIGATION_ACCEPTANCE_SEED_END = 1_000;
export const AI_NAVIGATION_ACCEPTANCE_CADENCE_MS = 88;
export const AI_NAVIGATION_E_P95_RATIO_MAX = 1.25;
export const AI_NAVIGATION_E_HARD_RATIO_MAX = 1.75;

export interface AiNavigationAcceptanceOptions {
  readonly scales?: readonly number[];
  readonly seedStart?: number;
  readonly seedEnd?: number;
  readonly progress?: (completedMazes: number, totalMazes: number) => void;
}

export interface AiNavigationRankSummary {
  readonly rank: DemoWalkerAiSkillRank;
  readonly cases: number;
  readonly completedCases: number;
  readonly invalidMoveCount: number;
  readonly cadenceMismatchCount: number;
  readonly shortestPathMismatchCount: number;
  readonly exactShortestPathCases: number;
  readonly meanRouteRatio: number;
  readonly medianRouteRatio: number;
  readonly p95RouteRatio: number;
  readonly maxRouteRatio: number;
}

export interface AiNavigationAcceptanceSummary {
  readonly contractVersion: 'mazer-ai-navigation-acceptance-v1';
  readonly seedStart: number;
  readonly seedEnd: number;
  readonly scales: readonly number[];
  readonly mazeCases: number;
  readonly rankCases: number;
  readonly routeCaseDigestSha256: string;
  readonly rankSummaries: readonly AiNavigationRankSummary[];
  readonly acceptance: {
    readonly everyRouteCompleted: boolean;
    readonly zeroInvalidMoves: boolean;
    readonly equalCadence: boolean;
    readonly ranksDThroughSExactShortestPath: boolean;
    readonly rankEP95WithinBound: boolean;
    readonly rankEMaxWithinBound: boolean;
    readonly passed: boolean;
  };
}

interface MutableRankSummary {
  cases: number;
  completedCases: number;
  invalidMoveCount: number;
  cadenceMismatchCount: number;
  shortestPathMismatchCount: number;
  exactShortestPathCases: number;
  routeRatios: number[];
}

const createMutableRankSummary = (): MutableRankSummary => ({
  cases: 0,
  completedCases: 0,
  invalidMoveCount: 0,
  cadenceMismatchCount: 0,
  shortestPathMismatchCount: 0,
  exactShortestPathCases: 0,
  routeRatios: []
});

const roundRatio = (value: number): number => Number(value.toFixed(6));

const percentile = (sortedValues: readonly number[], percentileValue: number): number => {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[Math.min(sortedValues.length - 1, index)]!;
};

const isLegalPlayableMove = (
  fromIndex: number,
  toIndex: number,
  width: number,
  height: number
): boolean => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return false;
  }

  const fromX = fromIndex % width;
  const fromY = Math.floor(fromIndex / width);
  const toX = toIndex % width;
  const toY = Math.floor(toIndex / width);
  const deltaX = Math.abs(fromX - toX);
  const deltaY = Math.abs(fromY - toY);

  return deltaX + deltaY === 1
    || (fromY === toY && deltaX === width - 1)
    || (fromX === toX && deltaY === height - 1);
};

const requireIntegerRange = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer; received ${value}`);
  }
  return value;
};

export const runAiNavigationAcceptance = (
  options: AiNavigationAcceptanceOptions = {}
): AiNavigationAcceptanceSummary => {
  const scales = [...(options.scales ?? AI_NAVIGATION_ACCEPTANCE_SCALES)].map((scale) => (
    requireIntegerRange(scale, 'scale')
  ));
  const seedStart = requireIntegerRange(
    options.seedStart ?? AI_NAVIGATION_ACCEPTANCE_SEED_START,
    'seedStart'
  );
  const seedEnd = requireIntegerRange(
    options.seedEnd ?? AI_NAVIGATION_ACCEPTANCE_SEED_END,
    'seedEnd'
  );
  if (seedEnd < seedStart) {
    throw new Error(`seedEnd (${seedEnd}) must be greater than or equal to seedStart (${seedStart})`);
  }

  const totalMazes = scales.length * ((seedEnd - seedStart) + 1);
  const summaries = new Map<DemoWalkerAiSkillRank, MutableRankSummary>(
    AI_NAVIGATION_ACCEPTANCE_RANKS.map((rank) => [rank, createMutableRankSummary()])
  );
  const caseDigest = createHash('sha256');
  let completedMazes = 0;

  for (const scale of scales) {
    for (let seed = seedStart; seed <= seedEnd; seed += 1) {
      const maze = createLegacyGeneratedMenuMaze(scale, scale, seed);
      const episode = createLegacyDemoWalkerEpisode(maze);
      const shortestPath = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
      if (!shortestPath.found || shortestPath.path.length === 0) {
        throw new Error(`No playable shortest path at scale=${scale}, seed=${seed}`);
      }

      for (const rank of AI_NAVIGATION_ACCEPTANCE_RANKS) {
        const mutable = summaries.get(rank)!;
        const config = createLegacyMenuDemoWalkerConfig(seed, {
          aiSkillLevel: 1,
          aiSkillRank: rank
        });
        const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
        const ratio = diagnostics.routeLength / shortestPath.path.length;
        let state = createDemoWalkerState(episode, config);
        let invalidMoves = 0;
        let cadenceMismatches = 0;

        for (let segment = 0; segment < diagnostics.segmentCount; segment += 1) {
          const previousIndex = state.currentIndex;
          const advance = advanceDemoWalker(episode, state, config);
          state = advance.state;

          if (
            !isTileFloor(episode.raster.tiles, state.currentIndex)
            || !isLegalPlayableMove(
              previousIndex,
              state.currentIndex,
              episode.raster.width,
              episode.raster.height
            )
          ) {
            invalidMoves += 1;
          }
          if (!state.reachedGoal && advance.delayMs !== AI_NAVIGATION_ACCEPTANCE_CADENCE_MS) {
            cadenceMismatches += 1;
          }
        }

        const completed = state.reachedGoal && state.currentIndex === episode.raster.endIndex;
        const exactShortest = diagnostics.routeLength === shortestPath.path.length;
        const shortestMismatch = rank === 'E' || exactShortest ? 0 : 1;
        const expectedTraverseMs = diagnostics.segmentCount * AI_NAVIGATION_ACCEPTANCE_CADENCE_MS;
        if (diagnostics.traverseMs !== expectedTraverseMs) {
          cadenceMismatches += 1;
        }

        mutable.cases += 1;
        mutable.completedCases += completed ? 1 : 0;
        mutable.invalidMoveCount += invalidMoves;
        mutable.cadenceMismatchCount += cadenceMismatches;
        mutable.shortestPathMismatchCount += shortestMismatch;
        mutable.exactShortestPathCases += exactShortest ? 1 : 0;
        mutable.routeRatios.push(ratio);

        caseDigest.update([
          scale,
          seed,
          rank,
          shortestPath.path.length,
          diagnostics.routeLength,
          completed ? 1 : 0,
          invalidMoves,
          cadenceMismatches
        ].join(':'));
        caseDigest.update('\n');
      }

      completedMazes += 1;
      if (completedMazes % 100 === 0 || completedMazes === totalMazes) {
        options.progress?.(completedMazes, totalMazes);
      }
    }
  }

  const rankSummaries: AiNavigationRankSummary[] = AI_NAVIGATION_ACCEPTANCE_RANKS.map((rank) => {
    const mutable = summaries.get(rank)!;
    const ratios = mutable.routeRatios.sort((left, right) => left - right);
    const mean = ratios.reduce((total, ratio) => total + ratio, 0) / Math.max(1, ratios.length);

    return {
      rank,
      cases: mutable.cases,
      completedCases: mutable.completedCases,
      invalidMoveCount: mutable.invalidMoveCount,
      cadenceMismatchCount: mutable.cadenceMismatchCount,
      shortestPathMismatchCount: mutable.shortestPathMismatchCount,
      exactShortestPathCases: mutable.exactShortestPathCases,
      meanRouteRatio: roundRatio(mean),
      medianRouteRatio: roundRatio(percentile(ratios, 0.5)),
      p95RouteRatio: roundRatio(percentile(ratios, 0.95)),
      maxRouteRatio: roundRatio(ratios[ratios.length - 1] ?? 0)
    };
  });
  const eSummary = rankSummaries[0]!;
  const everyRouteCompleted = rankSummaries.every((summary) => summary.completedCases === summary.cases);
  const zeroInvalidMoves = rankSummaries.every((summary) => summary.invalidMoveCount === 0);
  const equalCadence = rankSummaries.every((summary) => summary.cadenceMismatchCount === 0);
  const ranksDThroughSExactShortestPath = rankSummaries
    .slice(1)
    .every((summary) => summary.shortestPathMismatchCount === 0);
  const rankEP95WithinBound = eSummary.p95RouteRatio <= AI_NAVIGATION_E_P95_RATIO_MAX;
  const rankEMaxWithinBound = eSummary.maxRouteRatio <= AI_NAVIGATION_E_HARD_RATIO_MAX;

  return {
    contractVersion: 'mazer-ai-navigation-acceptance-v1',
    seedStart,
    seedEnd,
    scales,
    mazeCases: totalMazes,
    rankCases: totalMazes * AI_NAVIGATION_ACCEPTANCE_RANKS.length,
    routeCaseDigestSha256: caseDigest.digest('hex'),
    rankSummaries,
    acceptance: {
      everyRouteCompleted,
      zeroInvalidMoves,
      equalCadence,
      ranksDThroughSExactShortestPath,
      rankEP95WithinBound,
      rankEMaxWithinBound,
      passed: everyRouteCompleted
        && zeroInvalidMoves
        && equalCadence
        && ranksDThroughSExactShortestPath
        && rankEP95WithinBound
        && rankEMaxWithinBound
    }
  };
};

const readNumericArgument = (name: string): number | undefined => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return raw === undefined ? undefined : Number(raw);
};

const isDirectExecution = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectExecution) {
  const summary = runAiNavigationAcceptance({
    seedStart: readNumericArgument('seed-start'),
    seedEnd: readNumericArgument('seed-end'),
    progress: (completedMazes, totalMazes) => {
      process.stderr.write(`AI navigation acceptance: ${completedMazes}/${totalMazes} mazes\r`);
    }
  });
  process.stderr.write('\n');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.acceptance.passed) {
    process.exitCode = 1;
  }
}
