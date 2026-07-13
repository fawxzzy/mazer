import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACK_ROOT, ensureDir, parseCliArgs, resolveSessionId } from '../visual/common.mjs';
import { runLivePlayQa } from './live-play-qa.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-play-input-equivalence');
const INPUT_METHODS = Object.freeze(['keyboard', 'stick']);

const isTruthy = (value) => value === true || value === 'true' || value === '1' || value === 'yes';

const summarizeMethod = (run, inputMethod) => {
  const probes = run.postGoalLifecycle?.inputLockProbes ?? [];
  const pass = run.inputMethod === inputMethod
    && run.result?.pass === true
    && run.result?.reached === true
    && run.result?.failedAt === null
    && run.postGoalLifecycle?.pass === true
    && run.postGoalLifecycle?.inputLockProbePass === true
    && probes.length >= 4
    && probes.every((probe) => probe.pass)
    && run.postGoalLifecycle?.freshReady?.pass === true
    && run.worldTurn?.pass === true
    && run.worldTurn?.freshMazePass === true
    && Number.isFinite(run.performance?.estimatedFps)
    && run.performance.estimatedFps >= 50;

  return {
    inputMethod,
    pass,
    reached: run.result?.reached === true,
    failedAt: run.result?.failedAt ?? null,
    plannedMoveCount: run.result?.plannedMoveCount ?? null,
    executedMoveCount: run.result?.executedMoveCount ?? null,
    acceptedTurnCount: run.worldTurn?.atGoal?.acceptedTurnCount ?? null,
    lifecyclePass: run.postGoalLifecycle?.pass === true,
    lockProbePass: run.postGoalLifecycle?.inputLockProbePass === true,
    freshReadyPass: run.postGoalLifecycle?.freshReady?.pass === true,
    freshWorldTurnPass: run.worldTurn?.freshMazePass === true,
    estimatedFps: run.performance?.estimatedFps ?? null,
    recentSpikeCount: run.performance?.recentSpikeCount ?? null,
    summaryPath: run.artifacts?.summaryPath ?? null,
    screenshotPath: run.artifacts?.screenshotPath ?? null
  };
};

export const summarizeInputEquivalenceRuns = (runs) => {
  const methods = INPUT_METHODS.map((inputMethod) => summarizeMethod(runs[inputMethod], inputMethod));
  return {
    pass: methods.every((method) => method.pass),
    methodCount: methods.length,
    totalPlannedMoveCount: methods.reduce((total, method) => total + (method.plannedMoveCount ?? 0), 0),
    totalExecutedMoveCount: methods.reduce((total, method) => total + (method.executedMoveCount ?? 0), 0),
    methods
  };
};

export const runInputEquivalence = async (options = {}) => {
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const sessionId = resolveSessionId(options.sessionId);
  const outputDir = resolve(artifactRoot, sessionId);
  const label = options.label ?? 'input-equivalence';
  const runs = {};
  await ensureDir(outputDir);

  for (let index = 0; index < INPUT_METHODS.length; index += 1) {
    const inputMethod = INPUT_METHODS[index];
    const methodLabel = `${label}-${inputMethod}`;
    runs[inputMethod] = await runLivePlayQa({
      ...options,
      artifactRoot: resolve(outputDir, 'methods'),
      inputMethod,
      label: methodLabel,
      route: `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=${methodLabel}`,
      sessionId: inputMethod,
      skipBuild: index > 0 ? true : options.skipBuild
    });
  }

  const result = summarizeInputEquivalenceRuns(runs);
  const summaryPath = resolve(outputDir, `${label}.summary.json`);
  const summary = {
    schema: 'mazer.live-play-input-equivalence.v1',
    label,
    generatedAt: new Date().toISOString(),
    repo: runs.keyboard?.repo ?? null,
    viewport: options.viewport ?? { width: 405, height: 958 },
    result,
    artifacts: { summaryPath }
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await copyFile(summaryPath, resolve(artifactRoot, 'latest.summary.json'));
  return summary;
};

if (isDirectRun) {
  const args = parseCliArgs();
  const summary = await runInputEquivalence({
    artifactRoot: typeof args['output-root'] === 'string' ? args['output-root'] : DEFAULT_ARTIFACT_ROOT,
    headless: args.headless === undefined ? true : isTruthy(args.headless),
    label: typeof args.label === 'string' ? args.label : 'input-equivalence',
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: isTruthy(args['skip-build']),
    viewport: { width: 405, height: 958 }
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.result.pass ? 0 : 1;
}
