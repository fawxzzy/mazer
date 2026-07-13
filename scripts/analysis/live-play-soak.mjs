import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STACK_ROOT,
  ensureDir,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId,
  round
} from '../visual/common.mjs';
import { runLivePlayQa } from './live-play-qa.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-play-soak');
const DEFAULT_CYCLE_COUNT = 3;
const DEFAULT_BASE_SEED = 3749;
const REQUIRED_LOCK_PHASES = Object.freeze(['goal-hold', 'deconstructing', 'handoff', 'building']);

const isTruthy = (value) => value === true || value === 'true' || value === '1' || value === 'yes';

export const resolveLivePlaySoakSeeds = (cycleCount, baseSeed = DEFAULT_BASE_SEED) => {
  const count = Math.max(2, Math.min(10, Math.trunc(cycleCount)));
  const normalizedBase = Number.isFinite(baseSeed) ? Math.max(1, Math.trunc(baseSeed)) : DEFAULT_BASE_SEED;
  return Array.from({ length: count }, (_, index) => normalizedBase + (index * 7919));
};

const summarizeCycle = (run, index, requestedSeed) => {
  const probes = run.postGoalLifecycle?.inputLockProbes ?? [];
  const passedProbePhases = new Set(probes.filter((probe) => probe.pass).map((probe) => probe.phase));
  const lockProbePass = REQUIRED_LOCK_PHASES.every((phase) => passedProbePhases.has(phase));
  const frameHealthPass = Number.isFinite(run.performance?.estimatedFps)
    && run.performance.estimatedFps >= 50
    && Number.isFinite(run.performance?.recentSpikeCount)
    && run.performance.recentSpikeCount <= 2;
  const freshSeed = run.postGoalLifecycle?.freshSeed ?? null;
  const freshSeedPass = Number.isFinite(freshSeed) && freshSeed !== run.route?.seed;
  const readyPass = run.postGoalLifecycle?.freshReady?.pass === true;
  const controlsPass = run.inputMethod === 'stick'
    && run.controls?.controlMode === 'stick'
    && run.controls?.visible === true;
  const pass = run.result?.pass === true
    && run.postGoalLifecycle?.pass === true
    && lockProbePass
    && freshSeedPass
    && readyPass
    && controlsPass
    && frameHealthPass;

  return {
    index,
    requestedSeed,
    initialSeed: run.route?.seed ?? null,
    freshSeed,
    pass,
    resultPass: run.result?.pass === true,
    lifecyclePass: run.postGoalLifecycle?.pass === true,
    lockProbePass,
    lockProbePhases: [...passedProbePhases],
    freshSeedPass,
    readyPass,
    controlsPass,
    frameHealthPass,
    plannedMoveCount: run.result?.plannedMoveCount ?? null,
    executedMoveCount: run.result?.executedMoveCount ?? null,
    lifecycleElapsedMs: run.postGoalLifecycle?.elapsedMs ?? null,
    estimatedFps: run.performance?.estimatedFps ?? null,
    recentSpikeCount: run.performance?.recentSpikeCount ?? null,
    summaryPath: run.artifacts?.summaryPath ?? null,
    screenshotPath: run.artifacts?.screenshotPath ?? null
  };
};

export const summarizeLivePlaySoakRuns = (runs, requestedSeeds) => {
  const cycles = runs.map((run, index) => summarizeCycle(run, index, requestedSeeds[index] ?? null));
  const initialSeeds = cycles.map((cycle) => cycle.initialSeed).filter(Number.isFinite);
  const freshSeeds = cycles.map((cycle) => cycle.freshSeed).filter(Number.isFinite);
  const distinctInitialSeeds = new Set(initialSeeds).size === cycles.length;
  const distinctFreshSeeds = new Set(freshSeeds).size === cycles.length;
  const totalExecutedMoveCount = cycles.reduce(
    (total, cycle) => total + (Number.isFinite(cycle.executedMoveCount) ? cycle.executedMoveCount : 0),
    0
  );
  const lifecycleDurations = cycles.map((cycle) => cycle.lifecycleElapsedMs).filter(Number.isFinite);

  return {
    pass: cycles.length === requestedSeeds.length
      && cycles.length >= 2
      && cycles.every((cycle) => cycle.pass)
      && distinctInitialSeeds
      && distinctFreshSeeds,
    cycleCount: cycles.length,
    distinctInitialSeeds,
    distinctFreshSeeds,
    totalExecutedMoveCount,
    averageLifecycleElapsedMs: lifecycleDurations.length > 0
      ? round(lifecycleDurations.reduce((total, value) => total + value, 0) / lifecycleDurations.length)
      : null,
    cycles
  };
};

const parseViewport = (value) => {
  if (typeof value !== 'string') {
    return { width: 405, height: 958 };
  }
  const [width, height] = value.split('x').map((entry) => Number.parseInt(entry, 10));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : { width: 405, height: 958 };
};

export const runLivePlaySoak = async (options = {}) => {
  const cycleCount = Math.max(2, Math.min(10, Math.trunc(options.cycleCount ?? DEFAULT_CYCLE_COUNT)));
  const seeds = resolveLivePlaySoakSeeds(cycleCount, options.baseSeed ?? DEFAULT_BASE_SEED);
  const sessionId = resolveSessionId(options.sessionId);
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = resolve(artifactRoot, sessionId);
  const label = options.label ?? 'live-play-soak';
  const runs = [];

  await ensureDir(outputDir);

  for (let index = 0; index < seeds.length; index += 1) {
    const cycleNumber = index + 1;
    const cycleLabel = `${label}-cycle-${String(cycleNumber).padStart(2, '0')}`;
    const seed = seeds[index];
    runs.push(await runLivePlayQa({
      ...options,
      artifactRoot: resolve(outputDir, 'cycles'),
      inputMethod: 'stick',
      label: cycleLabel,
      route: `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&mazeSeed=${seed}&v=${cycleLabel}`,
      sessionId: `cycle-${String(cycleNumber).padStart(2, '0')}`,
      skipBuild: index > 0 ? true : options.skipBuild
    }));
  }

  const aggregate = summarizeLivePlaySoakRuns(runs, seeds);
  const summaryPath = resolve(outputDir, `${label}.summary.json`);
  const summary = {
    schema: 'mazer.live-play-soak.v1',
    label,
    generatedAt: new Date().toISOString(),
    repo: runs[0]?.repo ?? null,
    viewport: options.viewport ?? { width: 405, height: 958 },
    inputMethod: 'stick',
    requestedSeeds: seeds,
    result: aggregate,
    artifacts: {
      summaryPath
    }
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await copyFile(summaryPath, resolve(artifactRoot, 'latest.summary.json'));
  return summary;
};

if (isDirectRun) {
  const args = parseCliArgs();
  const cycleCount = parseIntegerArg(args.cycles ?? args['cycle-count'], DEFAULT_CYCLE_COUNT);
  const baseSeed = parseIntegerArg(args.baseSeed ?? args['base-seed'], DEFAULT_BASE_SEED);
  const viewport = parseViewport(args.viewport);
  const summary = await runLivePlaySoak({
    artifactRoot: typeof args.outputRoot === 'string'
      ? args.outputRoot
      : typeof args['output-root'] === 'string'
        ? args['output-root']
        : DEFAULT_ARTIFACT_ROOT,
    baseSeed,
    baseUrl: typeof args.baseUrl === 'string' ? args.baseUrl : args['base-url'],
    captureTimeoutMs: parseIntegerArg(args.timeoutMs ?? args['timeout-ms'], 45_000),
    cycleCount,
    headless: args.headless === undefined ? true : isTruthy(args.headless),
    label: typeof args.label === 'string' ? args.label : 'live-play-soak',
    movementSpeed: Number.isFinite(Number(args.movementSpeed ?? args['movement-speed']))
      ? Number(args.movementSpeed ?? args['movement-speed'])
      : 0.42,
    postGoalTimeoutMs: parseIntegerArg(args.postGoalTimeoutMs ?? args['post-goal-timeout-ms'], 30_000),
    previewTimeoutMs: parseIntegerArg(args.previewTimeoutMs ?? args['preview-timeout-ms'], 30_000),
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: isTruthy(args.skipBuild ?? args['skip-build']),
    stepSettleMs: parseIntegerArg(args.stepSettleMs ?? args['step-settle-ms'], 34),
    stepTimeoutMs: parseIntegerArg(args.stepTimeoutMs ?? args['step-timeout-ms'], 900),
    viewport
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.result.pass ? 0 : 1;
}
