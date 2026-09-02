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
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATION_TIMEOUT_DEADLINE_MS = 10_000;
export const CONVERGENCE_CHILD_MESSAGE_VERSION = 'mazev2-convergence-sample-child-v1';

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

export interface ConvergenceSourceIdentity {
  status: 'clean' | 'dirty';
  commitSha: string;
}

export const resolveConvergenceSourceIdentity = (repoRoot: string): ConvergenceSourceIdentity => {
  try {
    return { status: 'clean', commitSha: resolveCleanGitCommitSha(repoRoot) };
  } catch {
    return { status: 'dirty', commitSha: resolveGitCommitSha(repoRoot) };
  }
};

export const assertExpectedCleanGitCommitSha = (
  repoRoot: string,
  expectedCommitSha: string,
  context: string
): string => {
  const actualCommitSha = resolveCleanGitCommitSha(repoRoot);
  if (actualCommitSha !== expectedCommitSha) {
    throw new Error(
      `Refusing ${context}: expected clean Git commit ${expectedCommitSha}, received ${actualCommitSha}.`
    );
  }
  return actualCommitSha;
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

export interface ConvergenceSampleChildRequest {
  engineId: string;
  recipe: MazeV2ConvergenceRecipe;
  lane: MazeV2ComparisonLane;
  seed: number;
  expectedSourceCommitSha: string;
}

export interface ConvergenceSampleChildOptions {
  timeoutMs?: number;
  childEntrypoint?: string;
  onSpawn?: (pid: number) => void;
}

export interface ConvergenceArtifactPayload {
  rawRunsJson: string;
  rawSummaryJson: string;
  compactEvidenceJson: string;
}

export interface ConvergenceArtifactPaths {
  rawRunsPath: string;
  rawSummaryPath: string;
  compactEvidencePath: string;
}

interface ChildCloseState {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface ChildReadyMessage {
  contractVersion: typeof CONVERGENCE_CHILD_MESSAGE_VERSION;
  type: 'ready';
  sourceIdentity: ConvergenceSourceIdentity;
}

interface ChildResultMessage {
  contractVersion: typeof CONVERGENCE_CHILD_MESSAGE_VERSION;
  type: 'result';
  record: ConvergenceRunRecord;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isChildReadyMessage = (value: unknown): value is ChildReadyMessage => (
  isRecord(value)
  && value.contractVersion === CONVERGENCE_CHILD_MESSAGE_VERSION
  && value.type === 'ready'
  && isRecord(value.sourceIdentity)
  && (value.sourceIdentity.status === 'clean' || value.sourceIdentity.status === 'dirty')
  && typeof value.sourceIdentity.commitSha === 'string'
);

const isChildResultMessage = (
  value: unknown,
  request: ConvergenceSampleChildRequest
): value is ChildResultMessage => {
  if (!isRecord(value)
    || value.contractVersion !== CONVERGENCE_CHILD_MESSAGE_VERSION
    || value.type !== 'result'
    || !isRecord(value.record)) {
    return false;
  }
  return value.record.engineId === request.engineId
    && value.record.recipeName === request.recipe.name
    && value.record.lane === request.lane
    && value.record.seed === request.seed;
};

const createChildFailureRecord = (
  request: ConvergenceSampleChildRequest,
  errorMessage: string
): ConvergenceRunRecord => ({
  engineId: request.engineId,
  recipeName: request.recipe.name,
  lane: request.lane,
  seed: request.seed,
  outcome: 'exception',
  errorMessage,
  generationDurationMs: null,
  requestedWidth: request.recipe.width,
  requestedHeight: request.recipe.height,
  realizedWidth: null,
  realizedHeight: null,
  engineNotes: null,
  metrics: null
});

const createTimeoutRecord = (
  request: ConvergenceSampleChildRequest,
  timeoutMs: number
): ConvergenceRunRecord => ({
  engineId: request.engineId,
  recipeName: request.recipe.name,
  lane: request.lane,
  seed: request.seed,
  outcome: 'invariant-failure',
  errorMessage: `generation exceeded ${timeoutMs}ms deadline; child process terminated and reaped`,
  generationDurationMs: timeoutMs,
  requestedWidth: request.recipe.width,
  requestedHeight: request.recipe.height,
  realizedWidth: null,
  realizedHeight: null,
  engineNotes: {
    generationDeadlineMs: timeoutMs,
    childProcessTermination: 'terminated-and-reaped'
  },
  metrics: null
});

const createSourceIdentityFailureRecord = (
  request: ConvergenceSampleChildRequest,
  sourceIdentity: ConvergenceSourceIdentity
): ConvergenceRunRecord => ({
  engineId: request.engineId,
  recipeName: request.recipe.name,
  lane: request.lane,
  seed: request.seed,
  outcome: 'invariant-failure',
  errorMessage: `sample child source identity was ${sourceIdentity.status} at ${sourceIdentity.commitSha}; expected clean ${request.expectedSourceCommitSha}; child process terminated and reaped before generation`,
  generationDurationMs: null,
  requestedWidth: request.recipe.width,
  requestedHeight: request.recipe.height,
  realizedWidth: null,
  realizedHeight: null,
  engineNotes: {
    expectedSourceCommitSha: request.expectedSourceCommitSha,
    actualSourceCommitSha: sourceIdentity.commitSha,
    sourceIdentityStatus: sourceIdentity.status,
    generationStarted: false,
    childProcessTermination: 'terminated-and-reaped'
  },
  metrics: null
});

const createOnSpawnFailureRecord = (
  request: ConvergenceSampleChildRequest,
  error: unknown
): ConvergenceRunRecord => ({
  engineId: request.engineId,
  recipeName: request.recipe.name,
  lane: request.lane,
  seed: request.seed,
  outcome: 'exception',
  errorMessage: `onSpawn callback failed before generation: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}; child process terminated and reaped`,
  generationDurationMs: null,
  requestedWidth: request.recipe.width,
  requestedHeight: request.recipe.height,
  realizedWidth: null,
  realizedHeight: null,
  engineNotes: {
    lifecycleHook: 'onSpawn',
    generationStarted: false,
    childProcessTermination: 'terminated-and-reaped'
  },
  metrics: null
});

const resolveInheritedTsxLoaderArgs = (): string[] => {
  const loaderArgs: string[] = [];
  for (let index = 0; index < process.execArgv.length - 1; index += 1) {
    const flag = process.execArgv[index];
    const value = process.execArgv[index + 1];
    if ((flag === '--require' || flag === '--import') && value?.toLowerCase().includes('tsx')) {
      loaderArgs.push(flag, value);
      index += 1;
    }
  }
  return loaderArgs;
};

const resolveChildInvocationArgs = (
  childEntrypoint: string,
  encodedRequest: string,
  repoRoot: string
): string[] => {
  const inheritedTsxLoaderArgs = resolveInheritedTsxLoaderArgs();
  if (inheritedTsxLoaderArgs.length > 0) {
    return [...inheritedTsxLoaderArgs, childEntrypoint, encodedRequest];
  }
  return [
    resolve(repoRoot, 'node_modules', 'vite-node', 'vite-node.mjs'),
    '--script',
    childEntrypoint,
    encodedRequest
  ];
};

const terminateAndReapChild = async (
  child: ChildProcess,
  closed: Promise<ChildCloseState>
): Promise<void> => {
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32' && child.pid !== undefined) {
      await new Promise<void>((resolveTermination) => {
        const killer = spawn(
          'taskkill',
          ['/pid', String(child.pid), '/t', '/f'],
          { stdio: 'ignore', windowsHide: true }
        );
        killer.once('error', () => resolveTermination());
        killer.once('close', () => resolveTermination());
      });
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
  await closed;
};

export const runOneSampleInChild = (
  engineId: string,
  recipe: MazeV2ConvergenceRecipe,
  lane: MazeV2ComparisonLane,
  seed: number,
  expectedSourceCommitSha: string,
  options: ConvergenceSampleChildOptions = {}
): Promise<ConvergenceRunRecord> => {
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_DEADLINE_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('A convergence generation deadline must be a positive finite number of milliseconds.');
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedSourceCommitSha)) {
    throw new Error('The expected convergence source commit must be a lowercase 40-character Git SHA.');
  }

  const request: ConvergenceSampleChildRequest = {
    engineId,
    recipe,
    lane,
    seed,
    expectedSourceCommitSha
  };
  const repoRoot = resolveRepositoryRootFromAnalysisModuleUrl(import.meta.url);
  const childEntrypoint = options.childEntrypoint
    ?? fileURLToPath(new URL('./mazev2-convergence-sample-child.ts', import.meta.url));
  const encodedRequest = Buffer.from(JSON.stringify(request), 'utf8').toString('base64url');
  const child = spawn(
    process.execPath,
    resolveChildInvocationArgs(childEntrypoint, encodedRequest, repoRoot),
    {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true
    }
  );
  child.stderr?.resume();

  let resultRecord: ConvergenceRunRecord | null = null;
  let readyReceived = false;
  let timedOut = false;
  let sourceIdentityRejected = false;
  let onSpawnFailed = false;
  let settled = false;
  const closed = new Promise<ChildCloseState>((resolveClosed) => {
    child.once('close', (code, signal) => resolveClosed({ code, signal }));
  });

  return new Promise<ConvergenceRunRecord>((resolveRecord) => {
    const settle = (record: ConvergenceRunRecord): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveRecord(record);
    };

    const onDeadline = (): void => {
      if (settled || timedOut) return;
      timedOut = true;
      void terminateAndReapChild(child, closed).then(() => {
        settle(createTimeoutRecord(request, timeoutMs));
      });
    };

    let deadline = setTimeout(onDeadline, timeoutMs);

    child.on('message', (message: unknown) => {
      if (onSpawnFailed) return;
      if (isChildReadyMessage(message) && !readyReceived) {
        readyReceived = true;
        if (message.sourceIdentity.status !== 'clean'
          || message.sourceIdentity.commitSha !== request.expectedSourceCommitSha) {
          sourceIdentityRejected = true;
          clearTimeout(deadline);
          void terminateAndReapChild(child, closed).then(() => {
            settle(createSourceIdentityFailureRecord(request, message.sourceIdentity));
          });
          return;
        }
        clearTimeout(deadline);
        deadline = setTimeout(onDeadline, timeoutMs);
        child.send({
          contractVersion: CONVERGENCE_CHILD_MESSAGE_VERSION,
          type: 'start'
        });
        return;
      }
      if (isChildResultMessage(message, request)) {
        resultRecord = message.record;
      }
    });

    child.once('error', () => {
      // The close event is the single terminal path so even spawn failures are
      // classified only after the process handle has been fully released.
    });

    void closed.then(({ code, signal }) => {
      if (timedOut || sourceIdentityRejected || onSpawnFailed) return;
      if (resultRecord !== null && code === 0) {
        settle(resultRecord);
        return;
      }
      settle(createChildFailureRecord(
        request,
        `sample child exited before returning a valid record (exit=${code ?? 'none'}, signal=${signal ?? 'none'})`
      ));
    });

    if (child.pid !== undefined && options.onSpawn !== undefined) {
      try {
        options.onSpawn(child.pid);
      } catch (error) {
        onSpawnFailed = true;
        clearTimeout(deadline);
        void terminateAndReapChild(child, closed).then(() => {
          settle(createOnSpawnFailureRecord(request, error));
        });
      }
    }
  });
};

export const writeConvergenceArtifactSet = async (
  outputDir: string,
  payload: ConvergenceArtifactPayload
): Promise<ConvergenceArtifactPaths> => {
  await mkdir(outputDir, { recursive: true });
  const paths = {
    rawRunsPath: resolve(outputDir, 'mazev2-convergence-runs.json'),
    rawSummaryPath: resolve(outputDir, 'mazev2-convergence-summary.json'),
    compactEvidencePath: resolve(outputDir, 'mazev2-convergence-compact-evidence.json')
  };
  await writeFile(paths.rawRunsPath, payload.rawRunsJson, 'utf8');
  await writeFile(paths.rawSummaryPath, payload.rawSummaryJson, 'utf8');
  await writeFile(paths.compactEvidencePath, payload.compactEvidenceJson, 'utf8');
  return paths;
};

export const resolveConvergenceExitCode = (records: readonly ConvergenceRunRecord[]): 0 | 1 => (
  records.some((record) => record.outcome === 'exception' || record.outcome === 'invariant-failure') ? 1 : 0
);

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
    const result = adapter.generateSample(spec);
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
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(percentile * sortedValues.length) - 1)
  );
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
