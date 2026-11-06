// Runs the production menu-demo AI runner over a versioned seed pack and
// returns a stable baseline report. Fixtures and generated mazes only: no
// storage, no Supabase client, no progression state, no receipt persistence.
//
// Mirrors the menu path used in production (createLegacyRuntimeMazeForMode ->
// createLegacyMenuDemoWalkerConfig -> advanceDemoWalker) and the stepping loop
// of ai-runner-calibration.ts. Every generation parameter comes from the pack
// target; nothing is resolved from level/band here.
import {
  advanceDemoWalker,
  collectDemoWalkerRouteDiagnostics,
  createDemoWalkerState,
  type DemoWalkerAiBiasProfile,
  type DemoWalkerAiSkillRank
} from '../../../src/domain/ai';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex
} from '../../../src/legacy-runtime/legacyDemoWalker';
import {
  createLegacyRuntimeMazeForMode
} from '../../../src/legacy-runtime/legacyGenerationLifecycle';
import { normalizeLegacyMazeGenerationProfile } from '../../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMazeComplexity } from '../../../src/legacy-runtime/legacyProgression';
import { createMazeCycleTelemetryReceipt } from '../../../src/legacy-runtime/mazeCycleTelemetry';
import {
  MAZE_CYCLE_AI_SCORER_ID,
  MAZE_CYCLE_AI_SCORER_VERSION,
  scoreMazeCycleAiDecisionSummary
} from '../../../src/legacy-runtime/mazeCycleAiScorer.mjs';
import {
  MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION,
  MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
  MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
  MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL
} from '../../../src/legacy-runtime/mazeCycleRunQualityScorer.mjs';
import {
  assertValidSeedPack,
  canonicalJson,
  createBaselineReportFromCases,
  roundTo
} from './ai-run-seed-packs.mjs';

// Fixed, synthetic receipt inputs. They are part of the runner contract and are
// recorded in the report environment so they cannot silently drift.
const RUNNER_CONSTANTS = {
  averageFrameMs: 16,
  completedAt: '2026-01-01T00:00:00.000Z',
  controlMode: 'stick',
  maxStepsFloor: 512,
  maxStepsRouteSlack: 12,
  surface: 'menu-demo'
} as const;

interface SeedPackTarget {
  targetId: string;
  band: string;
  scale: number;
  aspectRatio: number;
  selection: { targetComplexity: number; candidateCount: number; tolerance: number };
  generationProfile: Record<string, unknown>;
  ai: { skillLevel: number; skillRank: DemoWalkerAiSkillRank; biasProfile: DemoWalkerAiBiasProfile | null };
  seeds: number[];
}

interface SeedPack {
  packId: string;
  packVersion: string;
  hash: string;
  targets: SeedPackTarget[];
  [key: string]: unknown;
}

const runCase = (target: SeedPackTarget, seed: number) => {
  const maze = createLegacyRuntimeMazeForMode(
    'menu',
    target.scale,
    seed,
    target.generationProfile,
    target.selection,
    target.aspectRatio
  );
  const episode = createLegacyDemoWalkerEpisode(maze);
  const baseConfig = createLegacyMenuDemoWalkerConfig(maze.seed, {
    aiSkillLevel: target.ai.skillLevel,
    aiSkillRank: target.ai.skillRank
  });
  // biasProfile null leaves the production default untouched.
  const config = target.ai.biasProfile === null
    ? baseConfig
    : { ...baseConfig, behavior: { ...baseConfig.behavior, aiBiasProfile: target.ai.biasProfile } };
  const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
  let state = createDemoWalkerState(episode, config);
  let requestedRegeneration = false;
  const path = [resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width)];
  const maxSteps = Math.max(RUNNER_CONSTANTS.maxStepsFloor, diagnostics.routeLength + RUNNER_CONSTANTS.maxStepsRouteSlack);

  for (let step = 0; step < maxSteps; step += 1) {
    const advance = advanceDemoWalker(episode, state, config);
    state = advance.state;
    path.push(resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width));
    if (advance.shouldRegenerateMaze) {
      requestedRegeneration = true;
      break;
    }
    if (state.phase === 'goal-hold') {
      break;
    }
  }

  const reachedGoal = state.phase === 'goal-hold';
  const resetUsed = requestedRegeneration && !reachedGoal;
  const receipt = createMazeCycleTelemetryReceipt({
    aiDecisionSummary: {
      backtrackCount: diagnostics.telemetry.backtrackCount,
      decisionCount: diagnostics.routeLength,
      optionalRetargetCount: diagnostics.telemetry.optionalRetargetCount,
      recoveryCount: diagnostics.telemetry.recoveryCount,
      thinkingModel: config.behavior.runnerThinkingModel ?? 'legacy-source',
      visitedUndoCount: diagnostics.telemetry.visitedUndoCount,
      wrongBranchCount: diagnostics.telemetry.wrongBranchCount
    },
    averageFrameMs: RUNNER_CONSTANTS.averageFrameMs,
    backtracks: diagnostics.telemetry.backtrackCount,
    completedAt: RUNNER_CONSTANTS.completedAt,
    completionTimeMs: diagnostics.traverseMs,
    controlMode: RUNNER_CONSTANTS.controlMode,
    // Deterministic id: the default is random and would leak into nothing we
    // report, but pinning it keeps the receipt itself reproducible.
    clientRunId: `seed-pack-${target.targetId}-${seed}`,
    maze,
    playerPath: path,
    resetUsed,
    surface: RUNNER_CONSTANTS.surface,
    wrongTurns: diagnostics.telemetry.wrongBranchCount
  });
  const complexity = resolveLegacyMazeComplexity(maze);
  const aiDecisionScore = scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary);
  const normalizedProfile = normalizeLegacyMazeGenerationProfile(target.generationProfile);

  return {
    targetId: target.targetId,
    seed,
    effectiveMazeSeed: maze.seed,
    width: maze.width,
    height: maze.height,
    generationProfileNormalized: canonicalJson(normalizedProfile) === canonicalJson(target.generationProfile),
    selectionDelivery: maze.generation?.selection?.delivery ?? 'unselected',
    measuredComplexity: complexity.total,
    edgeWrapCount: complexity.edgeWrapCount,
    shortestPathLength: receipt.shortestViablePathLength,
    playerPathLength: receipt.playerPathLength,
    routeOverrunRatio: roundTo(receipt.routeOverrunRatio),
    reachedGoal,
    resetUsed: receipt.resetUsed,
    wrongTurns: receipt.wrongTurns,
    backtracks: receipt.backtracks,
    runQualityTotal: receipt.runQualityScore?.total ?? null,
    runQualitySignal: receipt.runQualityScore?.signal ?? 'unknown',
    aiPressureScore: aiDecisionScore?.pressureScore ?? null,
    aiSignal: aiDecisionScore?.signal ?? 'unknown',
    coverageRatio: roundTo(receipt.runQualityMetrics?.coverageRatio ?? Number.NaN),
    cleanRun: receipt.runQualityMetrics?.cleanRun ?? false
  };
};

export const runSeedPackBaseline = (pack: unknown) => {
  const validPack = assertValidSeedPack(pack) as SeedPack;
  const cases = validPack.targets.flatMap((target) => target.seeds.map((seed) => runCase(target, seed)));
  return createBaselineReportFromCases({
    pack: validPack,
    cases,
    environment: {
      aiScorer: { id: MAZE_CYCLE_AI_SCORER_ID, version: MAZE_CYCLE_AI_SCORER_VERSION },
      runQualityScorer: {
        id: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
        version: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
        shortestPathModel: MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
        topologyMetricsVersion: MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION
      },
      runner: { ...RUNNER_CONSTANTS, contract: validPack.runnerContract, thinkingModel: createLegacyMenuDemoWalkerConfig(0).behavior.runnerThinkingModel ?? 'legacy-source' }
    }
  });
};
