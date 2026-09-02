// Pure harness logic for the Wave 1.5 PR D generator-convergence
// comparison -- split out from mazev2-convergence.ts (the CLI script) so
// this can be imported and unit-tested without triggering a full
// full corpus run as a side effect of import (that script has a
// top-level auto-run; this module deliberately does not, matching the
// existing mazeV2SeedStrategies.ts/mazeV2LabCollisions.ts convention of
// keeping testable logic in a plain utility module, separate from the
// script that drives it).

import { analyzeMazeV2CanonicalMaze } from '../../src/domain/mazeV2/canonicalAnalyzer';
import type { MazeV2ComparisonLane, MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from '../../src/domain/mazeV2/adapters/types';
import type { MazeV2MeasuredMetrics } from '../../src/domain/mazeV2/types';
import type { MazeV2ConvergenceRecipe } from './mazev2ConvergenceCorpus';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GENERATION_TIMEOUT_GUARD_MS = 10_000;

export const resolveRepositoryRootFromAnalysisModuleUrl = (moduleUrl: string): string => (
  fileURLToPath(new URL('../..', moduleUrl))
);

export const resolveGitCommitSha = (repoRoot: string): string => (
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
);

export const resolveCleanGitCommitSha = (repoRoot: string): string => {
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repoRoot, encoding: 'utf8' }
  ).trim();
  if (status.length > 0) {
    throw new Error(`Refusing convergence evidence from a dirty Git worktree:\n${status}`);
  }
  return resolveGitCommitSha(repoRoot);
};
export const DEFAULT_MAZE_V2_COMPARISON_LANES: readonly MazeV2ComparisonLane[] = [
  'raw-carving',
  'production-pipeline'
];

export const parseConvergenceLanes = (rawValue: string | undefined): readonly MazeV2ComparisonLane[] => {
  if (rawValue === undefined) return DEFAULT_MAZE_V2_COMPARISON_LANES;

  const lanes = rawValue.split(',').map((lane) => lane.trim());
  if (lanes.length === 0 || lanes.some((lane) => lane.length === 0)) {
    throw new Error('--lanes must contain one or both non-empty lane IDs: raw-carving, production-pipeline');
  }

  const allowed = new Set<string>(DEFAULT_MAZE_V2_COMPARISON_LANES);
  const unknown = lanes.filter((lane) => !allowed.has(lane));
  if (unknown.length > 0) {
    throw new Error(`Unknown --lanes value(s): ${unknown.join(', ')}. Expected raw-carving and/or production-pipeline.`);
  }
  if (new Set(lanes).size !== lanes.length) {
    throw new Error('--lanes must not repeat a lane ID.');
  }

  return lanes as MazeV2ComparisonLane[];
};

export type SampleOutcome = 'success' | 'unsupported' | 'exception' | 'invariant-failure';

export interface ConvergenceRunRecord {
  engineId: string;
  recipeName: string;
  lane: MazeV2ComparisonLane;
  seed: number;
  outcome: SampleOutcome;
  errorMessage: string | null;
  generationDurationMs: number | null;
  requestedWidth: number;
  requestedHeight: number;
  realizedWidth: number | null;
  realizedHeight: number | null;
  engineNotes: Record<string, unknown> | null;
  metrics: MazeV2MeasuredMetrics | null;
}

// Runs exactly one (adapter, recipe, lane, seed) sample and classifies the
// outcome -- never throws; a sample that fails is recorded (outcome:
// 'exception' or 'invariant-failure' with a real errorMessage), never
// silently dropped from the caller's result set. This is the correction
// PR D's own audit specifically asked for: "the script must continue after
// an individual sample failure and preserve the failure record."
export const runOneSample = (
  adapter: MazeV2EngineAdapter,
  recipe: MazeV2ConvergenceRecipe,
  lane: MazeV2ComparisonLane,
  seed: number
): ConvergenceRunRecord => {
  const spec: MazeV2ComparisonSampleSpec = {
    label: recipe.name,
    level: 1,
    lane,
    targetComplexity: recipe.targetComplexity,
    width: recipe.width,
    height: recipe.height,
    seed,
    requireWrap: recipe.requireWrap
  };

  try {
    if (recipe.unsupportedReason) {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'unsupported',
        errorMessage: recipe.unsupportedReason,
        generationDurationMs: null,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: null,
        realizedHeight: null,
        engineNotes: null,
        metrics: null
      };
    }
    const support = adapter.assessSupport(spec);
    if (support.status === 'unsupported') {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'unsupported',
        errorMessage: support.reason,
        generationDurationMs: null,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: null,
        realizedHeight: null,
        engineNotes: null,
        metrics: null
      };
    }
    const startedAtMs = performance.now();
    const result = adapter.generateSample(spec);
    const elapsedMs = performance.now() - startedAtMs;
    if (elapsedMs > GENERATION_TIMEOUT_GUARD_MS) {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'invariant-failure',
        errorMessage: `generation exceeded ${GENERATION_TIMEOUT_GUARD_MS}ms guard (${elapsedMs.toFixed(0)}ms) -- treated as a failure, not silently kept`,
        generationDurationMs: elapsedMs,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: result.realizedWidth,
        realizedHeight: result.realizedHeight,
        engineNotes: result.engineNotes,
        metrics: null
      };
    }
    if (result.support.status === 'unsupported') {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'invariant-failure',
        errorMessage: `adapter generated a sample after declaring support, then returned unsupported: ${result.support.reason ?? 'no reason provided'}`,
        generationDurationMs: result.generationDurationMs,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: result.realizedWidth,
        realizedHeight: result.realizedHeight,
        engineNotes: result.engineNotes,
        metrics: null
      };
    }
    if (result.canonicalMaze.walkable.length === 0 || result.canonicalMaze.walkable[0]?.length === 0) {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'invariant-failure',
        errorMessage: 'canonical maze has zero width or height',
        generationDurationMs: result.generationDurationMs,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: result.realizedWidth,
        realizedHeight: result.realizedHeight,
        engineNotes: result.engineNotes,
        metrics: null
      };
    }

    const metrics = analyzeMazeV2CanonicalMaze(result.canonicalMaze, result.shortcutProvenance);
    if (metrics.route.shortestPathLength <= 0) {
      return {
        engineId: adapter.engineId,
        recipeName: recipe.name,
        lane,
        seed,
        outcome: 'invariant-failure',
        errorMessage: 'no walkable route found between start and goal',
        generationDurationMs: result.generationDurationMs,
        requestedWidth: recipe.width,
        requestedHeight: recipe.height,
        realizedWidth: result.realizedWidth,
        realizedHeight: result.realizedHeight,
        engineNotes: result.engineNotes,
        metrics
      };
    }

    return {
      engineId: adapter.engineId,
      recipeName: recipe.name,
      lane,
      seed,
      outcome: 'success',
      errorMessage: null,
      generationDurationMs: result.generationDurationMs,
      requestedWidth: recipe.width,
      requestedHeight: recipe.height,
      realizedWidth: result.realizedWidth,
      realizedHeight: result.realizedHeight,
      engineNotes: result.engineNotes,
      metrics
    };
  } catch (error) {
    return {
      engineId: adapter.engineId,
      recipeName: recipe.name,
      lane,
      seed,
      outcome: 'exception',
      errorMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      generationDurationMs: null,
      requestedWidth: recipe.width,
      requestedHeight: recipe.height,
      realizedWidth: null,
      realizedHeight: null,
      engineNotes: null,
      metrics: null
    };
  }
};

export const resolvePercentile = (sortedValues: readonly number[], percentile: number): number | null => {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.floor(percentile * sortedValues.length));
  return sortedValues[index] ?? null;
};

export interface CompactRecipeEngineLaneSummary {
  recipe: string;
  engine: string;
  lane: MazeV2ComparisonLane;
  sampleCount: number;
  successCount: number;
  unsupportedCount: number;
  exceptionCount: number;
  invariantFailureCount: number;
  p50GenerationDurationMs: number | null;
  p95GenerationDurationMs: number | null;
  p99GenerationDurationMs: number | null;
  meanShortestPathLength: number | null;
  meanDetourRatio: number | null;
  meanJunctionCount: number | null;
  meanDeadEndCount: number | null;
  meanTurnRatio: number | null;
  meanCycleRank: number | null;
  meanShortcutCount: number | null;
  shortcutMeasuredSampleCount: number;
  meanWrapPairCount: number | null;
  meanRealizedWidth: number | null;
  meanRealizedHeight: number | null;
}

const resolveMean = (values: readonly number[]): number | null => (
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length
);

export const summarize = (records: readonly ConvergenceRunRecord[]): CompactRecipeEngineLaneSummary[] => {
  const groups = new Map<string, ConvergenceRunRecord[]>();
  for (const record of records) {
    const key = `${record.recipeName}::${record.engineId}::${record.lane}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [recipe, engine, lane] = key.split('::') as [string, string, MazeV2ComparisonLane];
    const successes = group.filter((r) => r.outcome === 'success');
    const durations = group.map((r) => r.generationDurationMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const shortcutSamples = successes
      .map((r) => r.metrics?.shortcut.shortcutCount)
      .filter((v): v is number => v !== null && v !== undefined);
    return {
      recipe,
      engine,
      lane,
      sampleCount: group.length,
      successCount: successes.length,
      unsupportedCount: group.filter((r) => r.outcome === 'unsupported').length,
      exceptionCount: group.filter((r) => r.outcome === 'exception').length,
      invariantFailureCount: group.filter((r) => r.outcome === 'invariant-failure').length,
      p50GenerationDurationMs: resolvePercentile(durations, 0.5),
      p95GenerationDurationMs: resolvePercentile(durations, 0.95),
      p99GenerationDurationMs: resolvePercentile(durations, 0.99),
      meanShortestPathLength: resolveMean(successes.map((r) => r.metrics!.route.shortestPathLength)),
      meanDetourRatio: resolveMean(successes.map((r) => r.metrics!.route.detourRatio)),
      meanJunctionCount: resolveMean(successes.map((r) => r.metrics!.decision.junctionCount)),
      meanDeadEndCount: resolveMean(successes.map((r) => r.metrics!.deadEnd.deadEndCount)),
      meanTurnRatio: resolveMean(successes.map((r) => r.metrics!.turning.turnRatio)),
      meanCycleRank: resolveMean(successes.map((r) => r.metrics!.ambiguity.cycleRank)),
      meanShortcutCount: resolveMean(shortcutSamples),
      shortcutMeasuredSampleCount: shortcutSamples.length,
      meanWrapPairCount: resolveMean(successes.map((r) => r.metrics!.wrap.wrapPairCount)),
      meanRealizedWidth: resolveMean(successes.map((r) => r.realizedWidth).filter((v): v is number => v !== null)),
      meanRealizedHeight: resolveMean(successes.map((r) => r.realizedHeight).filter((v): v is number => v !== null))
    };
  });
};
