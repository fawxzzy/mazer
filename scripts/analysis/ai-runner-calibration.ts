import {
  advanceDemoWalker,
  collectDemoWalkerRouteDiagnostics,
  createDemoWalkerState,
  type DemoWalkerAiBiasProfile,
  type DemoWalkerAiPerceptionProfile,
  type DemoWalkerAiSkillRank,
  type DemoWalkerChoiceClass,
  type DemoRunnerRecoveryDecision,
  type DemoWalkerThoughtState
} from '../../src/domain/ai';
import { isTileFloor, resolveDirectionBetween } from '../../src/domain/maze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  resolveLegacyPointFromDemoIndex
} from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyGeneratedMenuMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionPerformanceScoreForReceipt,
  type LegacyProgressionPerformanceScore,
  type LegacyProgressionRank,
  type LegacyProgressionSignal
} from '../../src/legacy-runtime/legacyProgression';
import {
  createMazeCycleTelemetryReceipt,
  scoreMazeCycleAiDecisionSummary,
  type MazeCycleAiDecisionScore
} from '../../src/legacy-runtime/mazeCycleTelemetry';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface CalibrationProgressionSnapshot {
  level: number;
  rank: LegacyProgressionRank;
  score: number;
  signal: LegacyProgressionSignal;
  targetComplexity: number;
}

interface RecoveryDecisionSummary {
  averageKnownRouteSteps: number;
  frontierRecoveryCount: number;
  maxKnownRouteSteps: number;
  optionalRetargetCount: number;
  totalCount: number;
}

interface RecoveryDecisionByScale extends RecoveryDecisionSummary {
  averageRouteRatio: number;
  p90RouteRatio: number;
  scale: number;
}

interface CalibrationCase {
  adjacentMoveFailures: number;
  canonicalPathLength: number;
  choiceClassCounts: Partial<Record<DemoWalkerChoiceClass, number>>;
  floorFailures: number;
  goalTargetLeaks: number;
  reachedGoal: boolean;
  requestedRegeneration: boolean;
  routeLength: number;
  routeRatio: number;
  scale: number;
  seed: number;
  thoughtStateCounts: Partial<Record<DemoWalkerThoughtState, number>>;
  traverseMs: number;
  wrongBranchCount: number;
  backtrackCount: number;
  recoveryCount: number;
  recoveryDecision: RecoveryDecisionSummary;
  optionalRetargetCount: number;
  perception: DemoWalkerAiPerceptionProfile;
  progression: {
    aiDecisionScore: MazeCycleAiDecisionScore | null;
    after: CalibrationProgressionSnapshot;
    before: CalibrationProgressionSnapshot;
    performanceScore: LegacyProgressionPerformanceScore;
    routeEfficiencyPressureScore: number;
    routeOverrunRatio: number;
    routeOverrunSteps: number;
    shortestViablePathLength: number;
  };
}

interface CalibrationSummary {
  cases?: CalibrationCase[];
  count: number;
  generatedAt: string;
  goalTargetLeakCount: number;
  perfectRouteCount: number;
  regenerationCount: number;
  progression: {
    averageAiDecisionScore: Omit<MazeCycleAiDecisionScore, 'signal'> | null;
    averageRouteEfficiencyPressureScore: number | null;
    averageScore: number | null;
    averagePerformanceScore: Omit<LegacyProgressionPerformanceScore, 'signal'> | null;
    endingLevel: number;
    endingRank: LegacyProgressionRank;
    endingTargetComplexity: number;
    signalCounts: Record<LegacyProgressionSignal, number>;
  };
  perception: DemoWalkerAiPerceptionProfile;
  reachedGoalCount: number;
  routeRatio: {
    average: number;
    max: number;
    min: number;
    p50: number;
    p90: number;
  };
  recoveryDecision: RecoveryDecisionSummary;
  recoveryDecisionByScale: RecoveryDecisionByScale[];
  scales: number[];
  seeds: number[];
  thoughtStateCounts: Partial<Record<DemoWalkerThoughtState, number>>;
  choiceClassCounts: Partial<Record<DemoWalkerChoiceClass, number>>;
}

interface CalibrationSweepSummary {
  comparison: CalibrationSweepComparison;
  countPerRank: number;
  generatedAt: string;
  level: number;
  mode: 'rank-sweep';
  ranks: DemoWalkerAiSkillRank[];
  scales: number[];
  seeds: number[];
  summaries: Partial<Record<DemoWalkerAiSkillRank, CalibrationSummary>>;
}

interface CalibrationBiasSweepSummary {
  biases: DemoWalkerAiBiasProfile[];
  countPerBias: number;
  generatedAt: string;
  level: number;
  mode: 'bias-sweep';
  rank: DemoWalkerAiSkillRank;
  scales: number[];
  seeds: number[];
  summaries: Partial<Record<DemoWalkerAiBiasProfile, CalibrationSummary>>;
}

interface CalibrationSweepComparison {
  baselineRank: DemoWalkerAiSkillRank | null;
  goalTargetLeakPass: boolean;
  monotonicAverageScorePass: boolean;
  monotonicAverageRouteRatioPass: boolean;
  monotonicRouteEfficiencyPass: boolean;
  notes: string[];
  rows: CalibrationSweepComparisonRow[];
}

interface CalibrationSweepComparisonRow {
  averageRouteRatio: number | null;
  routeRatioDeltaFromBaseline: number | null;
  routeRatioDeltaFromPreviousRank: number | null;
  averageRouteEfficiencyPressureScore: number | null;
  routeEfficiencyPressureDeltaFromBaseline: number | null;
  routeEfficiencyPressureDeltaFromPreviousRank: number | null;
  averageAiDecisionScore: Omit<MazeCycleAiDecisionScore, 'signal'> | null;
  averageScore: number | null;
  averagePerformanceScore: Omit<LegacyProgressionPerformanceScore, 'signal'> | null;
  endingLevel: number;
  endingRank: LegacyProgressionRank;
  goalTargetLeakCount: number;
  rank: DemoWalkerAiSkillRank;
  reachedGoalCount: number;
  regenerationCount: number;
  scoreDeltaFromBaseline: number | null;
  scoreDeltaFromPreviousRank: number | null;
}

const DEFAULT_SCALES = [37, 50, 75];
const DEFAULT_SEEDS = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89,
  144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946
];
const AI_SKILL_RANKS: readonly DemoWalkerAiSkillRank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
const AI_BIAS_PROFILES: readonly DemoWalkerAiBiasProfile[] = [
  'balanced',
  'direct-chaser',
  'wall-follower',
  'shortcut-gambler',
  'cautious-mapper',
  'speedrunner'
];

const parseNumberListFlag = (name: string, fallback: number[]): number[] => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? values : fallback;
};

const parseBooleanFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const parseIntegerFlag = (name: string, fallback: number): number => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const parseRankFlag = (name: string, fallback: DemoWalkerAiSkillRank): DemoWalkerAiSkillRank => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).toUpperCase();
  return raw === 'E' || raw === 'D' || raw === 'C' || raw === 'B' || raw === 'A' || raw === 'S'
    ? raw
    : fallback;
};

const parseRankListFlag = (name: string, fallback: readonly DemoWalkerAiSkillRank[]): DemoWalkerAiSkillRank[] => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    return [...fallback];
  }

  const values = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is DemoWalkerAiSkillRank => (
      value === 'E' || value === 'D' || value === 'C' || value === 'B' || value === 'A' || value === 'S'
    ));
  return values.length > 0 ? [...new Set(values)] : [...fallback];
};

const isAiBiasProfile = (value: string): value is DemoWalkerAiBiasProfile => (
  value === 'balanced'
  || value === 'direct-chaser'
  || value === 'wall-follower'
  || value === 'shortcut-gambler'
  || value === 'cautious-mapper'
  || value === 'speedrunner'
);

const parseBiasFlag = (name: string): DemoWalkerAiBiasProfile | undefined => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return raw && isAiBiasProfile(raw) ? raw : undefined;
};

const parseBiasListFlag = (
  name: string,
  fallback: readonly DemoWalkerAiBiasProfile[]
): DemoWalkerAiBiasProfile[] => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    return [...fallback];
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(isAiBiasProfile);
  return values.length > 0 ? [...new Set(values)] : [...fallback];
};

const round = (value: number, precision = 3): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const summarizeRecoveryDecisions = (
  decisions: readonly DemoRunnerRecoveryDecision[]
): RecoveryDecisionSummary => {
  const knownRouteSteps = decisions.map((entry) => entry.knownRouteStepCount);
  return {
    averageKnownRouteSteps: knownRouteSteps.length > 0
      ? round(knownRouteSteps.reduce((total, value) => total + value, 0) / knownRouteSteps.length)
      : 0,
    frontierRecoveryCount: decisions.filter((entry) => entry.kind === 'frontier-recovery').length,
    maxKnownRouteSteps: Math.max(0, ...knownRouteSteps),
    optionalRetargetCount: decisions.filter((entry) => entry.kind === 'optional-retarget').length,
    totalCount: decisions.length
  };
};

const summarizeCalibrationRecoveryDecisions = (
  cases: readonly CalibrationCase[]
): RecoveryDecisionSummary => {
  const totalCount = cases.reduce((total, entry) => total + entry.recoveryDecision.totalCount, 0);
  return {
    averageKnownRouteSteps: totalCount > 0
      ? round(cases.reduce((total, entry) => (
        total + (entry.recoveryDecision.averageKnownRouteSteps * entry.recoveryDecision.totalCount)
      ), 0) / totalCount)
      : 0,
    frontierRecoveryCount: cases.reduce((total, entry) => (
      total + entry.recoveryDecision.frontierRecoveryCount
    ), 0),
    maxKnownRouteSteps: Math.max(0, ...cases.map((entry) => entry.recoveryDecision.maxKnownRouteSteps)),
    optionalRetargetCount: cases.reduce((total, entry) => (
      total + entry.recoveryDecision.optionalRetargetCount
    ), 0),
    totalCount
  };
};

const summarizeRecoveryDecisionsByScale = (
  cases: readonly CalibrationCase[]
): RecoveryDecisionByScale[] => [...new Set(cases.map((entry) => entry.scale))]
  .sort((left, right) => left - right)
  .map((scale) => {
    const scaleCases = cases.filter((entry) => entry.scale === scale);
    const routeRatios = scaleCases.map((entry) => entry.routeRatio).sort((left, right) => left - right);
    return {
      ...summarizeCalibrationRecoveryDecisions(scaleCases),
      averageRouteRatio: routeRatios.length > 0
        ? round(routeRatios.reduce((total, value) => total + value, 0) / routeRatios.length)
        : 0,
      p90RouteRatio: round(percentile(routeRatios, 0.9)),
      scale
    };
  });

const increment = <T extends string>(counts: Partial<Record<T, number>>, key: T | null | undefined): void => {
  if (!key) {
    return;
  }
  counts[key] = (counts[key] ?? 0) + 1;
};

const mergeCounts = <T extends string>(
  target: Partial<Record<T, number>>,
  source: Partial<Record<T, number>>
): void => {
  for (const [key, value] of Object.entries(source) as Array<[T, number]>) {
    target[key] = (target[key] ?? 0) + value;
  }
};

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.floor(values.length * ratio));
  return values[index] ?? 0;
};

const averagePerformanceScores = (
  scores: readonly LegacyProgressionPerformanceScore[]
): Omit<LegacyProgressionPerformanceScore, 'signal'> | null => {
  if (scores.length === 0) {
    return null;
  }
  const average = (select: (score: LegacyProgressionPerformanceScore) => number): number => (
    round(scores.reduce((total, score) => total + select(score), 0) / scores.length)
  );

  return {
    backtrackScore: average((score) => score.backtrackScore),
    resetScore: average((score) => score.resetScore),
    routeEfficiencyScore: average((score) => score.routeEfficiencyScore),
    stabilityScore: average((score) => score.stabilityScore),
    timeScore: average((score) => score.timeScore),
    total: average((score) => score.total),
    wrongTurnScore: average((score) => score.wrongTurnScore)
  };
};

const averageAiDecisionScores = (
  scores: readonly MazeCycleAiDecisionScore[]
): Omit<MazeCycleAiDecisionScore, 'signal'> | null => {
  if (scores.length === 0) {
    return null;
  }
  const average = (select: (score: MazeCycleAiDecisionScore) => number): number => (
    round(scores.reduce((total, score) => total + select(score), 0) / scores.length)
  );

  return {
    pressureScore: average((score) => score.pressureScore),
    recoveryPressureScore: average((score) => score.recoveryPressureScore),
    reliabilityScore: average((score) => score.reliabilityScore),
    retargetPressureScore: average((score) => score.retargetPressureScore),
    routeNoiseScore: average((score) => score.routeNoiseScore)
  };
};

const toProgressionSnapshot = (
  state: ReturnType<typeof createEmptyLegacyProgressionState>
): CalibrationProgressionSnapshot => {
  const track = state.tracks['ai-runner'];
  return {
    level: track.level,
    rank: track.rank,
    score: track.paceScore,
    signal: track.lastSignal,
    targetComplexity: track.targetComplexity
  };
};

const calibrateCase = (
  scale: number,
  seed: number,
  progressionState: ReturnType<typeof createEmptyLegacyProgressionState>,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  runIndex: number,
  options: {
    aiBiasProfile?: DemoWalkerAiBiasProfile;
    aiSkillLevel: number;
    aiSkillRank: DemoWalkerAiSkillRank;
  }
): {
  caseResult: CalibrationCase;
  progressionState: ReturnType<typeof createEmptyLegacyProgressionState>;
} => {
  const maze = createLegacyGeneratedMenuMaze(scale, seed);
  const episode = createLegacyDemoWalkerEpisode(maze);
  const baseConfig = createLegacyMenuDemoWalkerConfig(seed);
  const config = {
    ...baseConfig,
    behavior: {
      ...baseConfig.behavior,
      aiBiasProfile: options.aiBiasProfile,
      aiSkillLevel: options.aiSkillLevel,
      aiSkillRank: options.aiSkillRank
    }
  };
  const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
  const thoughtStateCounts: Partial<Record<DemoWalkerThoughtState, number>> = {};
  const choiceClassCounts: Partial<Record<DemoWalkerChoiceClass, number>> = {};
  let state = createDemoWalkerState(episode, config);
  let requestedRegeneration = false;
  let floorFailures = 0;
  let adjacentMoveFailures = 0;
  let goalTargetLeaks = 0;
  const simulatedPath = [resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width)];
  const maxSteps = Math.max(512, diagnostics.routeLength + 12);

  for (let step = 0; step < maxSteps; step += 1) {
    const previousIndex = state.currentIndex;
    const previousPhase = state.phase;
    const advance = advanceDemoWalker(episode, state, config);
    state = advance.state;
    simulatedPath.push(resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width));

    increment(thoughtStateCounts, state.aiMemory.thoughtState);
    increment(choiceClassCounts, state.aiMemory.choiceClass);

    if (!isTileFloor(episode.raster.tiles, state.currentIndex)) {
      floorFailures += 1;
    }
    if (
      previousPhase === 'explore'
      && state.phase === 'explore'
      && resolveDirectionBetween(previousIndex, state.currentIndex, episode.raster.width) === null
    ) {
      adjacentMoveFailures += 1;
    }
    if (state.aiMemory.targetIndex === episode.raster.endIndex && state.currentIndex !== episode.raster.endIndex) {
      goalTargetLeaks += 1;
    }

    if (advance.shouldRegenerateMaze) {
      requestedRegeneration = true;
      break;
    }
    if (state.phase === 'goal-hold') {
      break;
    }
  }
  const progressionBefore = toProgressionSnapshot(progressionState);
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
    averageFrameMs: 16,
    completedAt: new Date(Date.UTC(2026, 6, 10, 12, 0, runIndex)).toISOString(),
    completionTimeMs: diagnostics.traverseMs,
    controlMode: 'stick',
    maze,
    playerPath: simulatedPath,
    resetUsed: requestedRegeneration && state.phase !== 'goal-hold',
    surface: 'menu-demo',
    backtracks: diagnostics.telemetry.backtrackCount,
    wrongTurns: diagnostics.telemetry.wrongBranchCount
  });
  const performanceScore = resolveLegacyProgressionPerformanceScoreForReceipt(
    receipt,
    resolveLegacyMazeComplexity(maze).total
  );
  const aiDecisionScore = scoreMazeCycleAiDecisionSummary(receipt.aiDecisionSummary);
  const nextProgressionState = recordLegacyProgressionCycle(storage, progressionState, receipt, maze);

  return {
    progressionState: nextProgressionState,
    caseResult: {
    adjacentMoveFailures,
    backtrackCount: diagnostics.telemetry.backtrackCount,
    canonicalPathLength: diagnostics.canonicalPathLength,
    choiceClassCounts,
    floorFailures,
    goalTargetLeaks,
    optionalRetargetCount: diagnostics.telemetry.optionalRetargetCount,
    perception: diagnostics.perception,
    reachedGoal: state.phase === 'goal-hold',
    recoveryCount: diagnostics.telemetry.recoveryCount,
    recoveryDecision: summarizeRecoveryDecisions(diagnostics.recoveryDecisions),
    requestedRegeneration,
    routeLength: diagnostics.routeLength,
    routeRatio: round(diagnostics.routeLength / Math.max(1, diagnostics.canonicalPathLength)),
    scale,
    seed,
    thoughtStateCounts,
    traverseMs: diagnostics.traverseMs,
    wrongBranchCount: diagnostics.telemetry.wrongBranchCount,
    progression: {
      aiDecisionScore,
      after: toProgressionSnapshot(nextProgressionState),
      before: progressionBefore,
      performanceScore,
      routeEfficiencyPressureScore: receipt.routeEfficiencyPressureScore,
      routeOverrunRatio: receipt.routeOverrunRatio,
      routeOverrunSteps: receipt.routeOverrunSteps,
      shortestViablePathLength: receipt.shortestViablePathLength
    }
    }
  };
};

const buildSummary = (
  cases: CalibrationCase[],
  scales: number[],
  seeds: number[],
  progressionState: ReturnType<typeof createEmptyLegacyProgressionState>,
  perception: DemoWalkerAiPerceptionProfile,
  options: {
    includeCases?: boolean;
  } = {}
): CalibrationSummary => {
  const routeRatios = cases.map((entry) => entry.routeRatio).sort((left, right) => left - right);
  const thoughtStateCounts: Partial<Record<DemoWalkerThoughtState, number>> = {};
  const choiceClassCounts: Partial<Record<DemoWalkerChoiceClass, number>> = {};
  for (const entry of cases) {
    mergeCounts(thoughtStateCounts, entry.thoughtStateCounts);
    mergeCounts(choiceClassCounts, entry.choiceClassCounts);
  }
  const signalCounts: Record<LegacyProgressionSignal, number> = {
    challenge: 0,
    ease: 0,
    hold: 0
  };
  for (const entry of cases) {
    signalCounts[entry.progression.after.signal] += 1;
  }
  const scores = cases.map((entry) => entry.progression.after.score);
  const routeEfficiencyPressureScores = cases.map((entry) => entry.progression.routeEfficiencyPressureScore);
  const performanceScores = cases.map((entry) => entry.progression.performanceScore);
  const recoveryDecision = summarizeCalibrationRecoveryDecisions(cases);
  const aiDecisionScores = cases
    .map((entry) => entry.progression.aiDecisionScore)
    .filter((score): score is MazeCycleAiDecisionScore => score !== null);

  const summary: CalibrationSummary = {
    choiceClassCounts,
    count: cases.length,
    generatedAt: new Date().toISOString(),
    goalTargetLeakCount: cases.reduce((total, entry) => total + entry.goalTargetLeaks, 0),
    perception,
    perfectRouteCount: cases.filter((entry) => entry.routeRatio <= 1.05).length,
    progression: {
      averageAiDecisionScore: averageAiDecisionScores(aiDecisionScores),
      averageRouteEfficiencyPressureScore: routeEfficiencyPressureScores.length > 0
        ? round(routeEfficiencyPressureScores.reduce((total, value) => total + value, 0) / routeEfficiencyPressureScores.length)
        : null,
      averageScore: scores.length > 0
        ? round(scores.reduce((total, value) => total + value, 0) / scores.length)
        : null,
      averagePerformanceScore: averagePerformanceScores(performanceScores),
      endingLevel: progressionState.tracks['ai-runner'].level,
      endingRank: progressionState.tracks['ai-runner'].rank,
      endingTargetComplexity: progressionState.tracks['ai-runner'].targetComplexity,
      signalCounts
    },
    reachedGoalCount: cases.filter((entry) => entry.reachedGoal).length,
    regenerationCount: cases.filter((entry) => entry.requestedRegeneration).length,
    routeRatio: {
      average: round(routeRatios.reduce((total, value) => total + value, 0) / Math.max(1, routeRatios.length)),
      max: round(routeRatios.at(-1) ?? 0),
      min: round(routeRatios[0] ?? 0),
      p50: round(percentile(routeRatios, 0.5)),
      p90: round(percentile(routeRatios, 0.9))
    },
    recoveryDecision,
    recoveryDecisionByScale: summarizeRecoveryDecisionsByScale(cases),
    scales,
    seeds,
    thoughtStateCounts
  };

  if (options.includeCases !== false) {
    summary.cases = cases;
  }

  return summary;
};

const runCalibration = (options: {
  aiSkillLevel: number;
  aiSkillRank: DemoWalkerAiSkillRank;
  aiBiasProfile: DemoWalkerAiBiasProfile;
  includeCases: boolean;
  scales: number[];
  seeds: number[];
}): CalibrationSummary => {
  const storage = new MemoryStorage();
  let progressionState = createEmptyLegacyProgressionState();
  const cases: CalibrationCase[] = [];
  let runIndex = 0;

  for (const scale of options.scales) {
    for (const seed of options.seeds) {
      const result = calibrateCase(scale, seed, progressionState, storage, runIndex, {
        aiSkillLevel: options.aiSkillLevel,
        aiBiasProfile: options.aiBiasProfile,
        aiSkillRank: options.aiSkillRank
      });
      cases.push(result.caseResult);
      progressionState = result.progressionState;
      runIndex += 1;
    }
  }

  return buildSummary(
    cases,
    options.scales,
    options.seeds,
    progressionState,
    cases[0]?.perception ?? {
      biasProfile: 'balanced',
      confidenceNoisePenalty: 14,
      level: options.aiSkillLevel,
      lookaheadDepth: 5,
      optionalRetargetLimit: 2,
      rank: options.aiSkillRank,
      solvePreviewBudget: 0,
      splitUncertaintyPenalty: 1.5,
      wrapMentalCost: 0.72
    },
    { includeCases: options.includeCases }
  );
};

const buildRankSweepComparison = (
  ranks: DemoWalkerAiSkillRank[],
  summaries: Partial<Record<DemoWalkerAiSkillRank, CalibrationSummary>>
): CalibrationSweepComparison => {
  const baselineRank = ranks[0] ?? null;
  const baselineScore = baselineRank ? summaries[baselineRank]?.progression.averageScore ?? null : null;
  const baselineRouteRatio = baselineRank ? summaries[baselineRank]?.routeRatio.average ?? null : null;
  const baselineRouteEfficiencyPressure = baselineRank
    ? summaries[baselineRank]?.progression.averageRouteEfficiencyPressureScore ?? null
    : null;
  let previousScore: number | null = null;
  let previousRouteRatio: number | null = null;
  let previousRouteEfficiencyPressure: number | null = null;
  const rows: CalibrationSweepComparisonRow[] = ranks.map((rank) => {
    const summary = summaries[rank];
    const averageScore = summary?.progression.averageScore ?? null;
    const averageRouteRatio = summary?.routeRatio.average ?? null;
    const averageAiDecisionScore = summary?.progression.averageAiDecisionScore ?? null;
    const averagePerformanceScore = summary?.progression.averagePerformanceScore ?? null;
    const averageRouteEfficiencyPressureScore = summary?.progression.averageRouteEfficiencyPressureScore ?? null;
    const row: CalibrationSweepComparisonRow = {
      averageRouteRatio,
      averageRouteEfficiencyPressureScore,
      averageAiDecisionScore,
      averageScore,
      averagePerformanceScore,
      endingLevel: summary?.progression.endingLevel ?? 0,
      endingRank: summary?.progression.endingRank ?? 'E',
      goalTargetLeakCount: summary?.goalTargetLeakCount ?? 0,
      rank,
      reachedGoalCount: summary?.reachedGoalCount ?? 0,
      regenerationCount: summary?.regenerationCount ?? 0,
      routeRatioDeltaFromBaseline:
        baselineRouteRatio !== null && averageRouteRatio !== null
          ? round(averageRouteRatio - baselineRouteRatio)
          : null,
      routeRatioDeltaFromPreviousRank:
        previousRouteRatio !== null && averageRouteRatio !== null
          ? round(averageRouteRatio - previousRouteRatio)
          : null,
      routeEfficiencyPressureDeltaFromBaseline:
        baselineRouteEfficiencyPressure !== null && averageRouteEfficiencyPressureScore !== null
          ? round(averageRouteEfficiencyPressureScore - baselineRouteEfficiencyPressure)
          : null,
      routeEfficiencyPressureDeltaFromPreviousRank:
        previousRouteEfficiencyPressure !== null && averageRouteEfficiencyPressureScore !== null
          ? round(averageRouteEfficiencyPressureScore - previousRouteEfficiencyPressure)
          : null,
      scoreDeltaFromBaseline: baselineScore !== null && averageScore !== null ? round(averageScore - baselineScore) : null,
      scoreDeltaFromPreviousRank: previousScore !== null && averageScore !== null ? round(averageScore - previousScore) : null
    };
    previousScore = averageScore;
    previousRouteRatio = averageRouteRatio;
    previousRouteEfficiencyPressure = averageRouteEfficiencyPressureScore;
    return row;
  });
  const goalTargetLeakPass = rows.every((row) => row.goalTargetLeakCount === 0);
  const monotonicAverageScorePass = rows.every((row) => (
    row.scoreDeltaFromPreviousRank === null || row.scoreDeltaFromPreviousRank >= 0
  ));
  const monotonicAverageRouteRatioPass = rows.every((row) => (
    row.routeRatioDeltaFromPreviousRank === null || row.routeRatioDeltaFromPreviousRank <= 0
  ));
  const monotonicRouteEfficiencyPass = rows.every((row) => (
    row.routeEfficiencyPressureDeltaFromPreviousRank === null
    || row.routeEfficiencyPressureDeltaFromPreviousRank <= 0
  ));
  const notes: string[] = [];
  if (!goalTargetLeakPass) {
    notes.push('At least one rank exposed the end tile as a target before reaching it.');
  }
  if (!monotonicAverageScorePass) {
    notes.push('Higher AI ranks did not produce a monotonic average-score improvement in this sweep; tune perception budgets before treating rank as skill.');
  }
  if (!monotonicAverageRouteRatioPass) {
    notes.push('Higher AI ranks did not produce monotonic raw route-ratio improvement in this sweep; the progression score is not sufficient evidence of route skill on its own.');
  }
  if (!monotonicRouteEfficiencyPass) {
    notes.push('Higher AI ranks did not produce monotonic route-efficiency pressure improvement in this sweep; tune controller behavior before treating rank as route skill.');
  }

  return {
    baselineRank,
    goalTargetLeakPass,
    monotonicAverageScorePass,
    monotonicAverageRouteRatioPass,
    monotonicRouteEfficiencyPass,
    notes,
    rows
  };
};

const scales = parseNumberListFlag('scales', DEFAULT_SCALES);
const seeds = parseNumberListFlag('seeds', DEFAULT_SEEDS);
const summaryOnly = parseBooleanFlag('summary-only');
const rankSweep = parseBooleanFlag('rank-sweep');
const biasSweep = parseBooleanFlag('bias-sweep');
const aiSkillLevel = parseIntegerFlag('ai-level', 1);
const aiSkillRank = parseRankFlag('ai-rank', 'E');
const aiSkillRanks = parseRankListFlag('ai-ranks', AI_SKILL_RANKS);
const aiBiasProfile = parseBiasFlag('ai-bias');
const aiBiasProfiles = parseBiasListFlag('ai-biases', AI_BIAS_PROFILES);

if (rankSweep) {
  const summaries: Partial<Record<DemoWalkerAiSkillRank, CalibrationSummary>> = {};
  for (const rank of aiSkillRanks) {
    summaries[rank] = runCalibration({
      aiSkillLevel,
      aiBiasProfile,
      aiSkillRank: rank,
      includeCases: !summaryOnly,
      scales,
      seeds
    });
  }

  const sweepSummary: CalibrationSweepSummary = {
    comparison: buildRankSweepComparison(aiSkillRanks, summaries),
    countPerRank: scales.length * seeds.length,
    generatedAt: new Date().toISOString(),
    level: aiSkillLevel,
    mode: 'rank-sweep',
    ranks: aiSkillRanks,
    scales,
    seeds,
    summaries
  };
  console.log(JSON.stringify(sweepSummary, null, 2));
} else if (biasSweep) {
  const summaries: Partial<Record<DemoWalkerAiBiasProfile, CalibrationSummary>> = {};
  for (const bias of aiBiasProfiles) {
    summaries[bias] = runCalibration({
      aiBiasProfile: bias,
      aiSkillLevel,
      aiSkillRank,
      includeCases: !summaryOnly,
      scales,
      seeds
    });
  }

  const biasSweepSummary: CalibrationBiasSweepSummary = {
    biases: aiBiasProfiles,
    countPerBias: scales.length * seeds.length,
    generatedAt: new Date().toISOString(),
    level: aiSkillLevel,
    mode: 'bias-sweep',
    rank: aiSkillRank,
    scales,
    seeds,
    summaries
  };
  console.log(JSON.stringify(biasSweepSummary, null, 2));
} else {
  console.log(JSON.stringify(
    runCalibration({
      aiBiasProfile,
      aiSkillLevel,
      aiSkillRank,
      includeCases: !summaryOnly,
      scales,
      seeds
    }),
    null,
    2
  ));
}
