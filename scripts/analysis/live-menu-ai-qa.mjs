import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId,
  round
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-menu-ai-qa');
const DEFAULT_ROUTE = '/?content=core-only&theme=aurora&runtimeDiagnostics=1';
const DEFAULT_LABEL = 'live-menu-ai-qa';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 70;
const DEFAULT_PRE_GOAL_SAMPLE_MIN = 24;
const DEFAULT_TARGET_SAMPLE_MIN = 1;
const DEFAULT_VIEWPORT = Object.freeze({ width: 405, height: 958 });

const isTruthy = (value) => value === true || value === 'true' || value === '1' || value === 'yes';

const runNpmCommand = (args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    return;
  }

  execFileSync('npm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
};

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const isWorktreeDirty = () => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
};

const createPoint = (value) => (
  Number.isFinite(value?.x) && Number.isFinite(value?.y)
    ? { x: value.x, y: value.y }
    : null
);

const samePoint = (left, right) => (
  left !== null
  && right !== null
  && left.x === right.x
  && left.y === right.y
);

const createTraceKey = (sample) => [
  sample.phase ?? 'null',
  sample.cue ?? 'null',
  sample.pathCursor ?? 'null',
  sample.target ? `${sample.target.x},${sample.target.y}` : 'null',
  sample.optionCount ?? 'null',
  sample.reachedGoal ? 'goal' : 'run'
].join(':');

export const resolveMenuAiTargetSnapshot = (diagnostics) => {
  const runtime = diagnostics?.runtime ?? null;
  const visual = diagnostics?.visual ?? null;
  const menuDemo = runtime?.menuDemo ?? visual?.runtime?.menuDemo ?? null;
  const goal = createPoint(runtime?.play?.goal ?? visual?.runtime?.goal ?? runtime?.generation?.maze?.goal ?? null);
  const player = createPoint(runtime?.play?.player ?? visual?.runtime?.player ?? null);
  const target = createPoint(menuDemo?.aiMemory?.targetPoint ?? null);
  const targetEqualsGoal = samePoint(target, goal);
  const playerAtGoal = samePoint(player, goal);

  return {
    cue: menuDemo?.cue ?? null,
    goal,
    optionCount: menuDemo?.aiMemory?.optionCount ?? null,
    pathCursor: menuDemo?.pathCursor ?? null,
    phase: menuDemo?.phase ?? null,
    player,
    playerAtGoal,
    reachedGoal: menuDemo?.reachedGoal === true,
    target,
    targetEqualsGoal
  };
};

export const summarizeMenuAiTargetSamples = (
  samples,
  {
    minimumPreGoalSamples = DEFAULT_PRE_GOAL_SAMPLE_MIN,
    minimumTargetSamples = DEFAULT_TARGET_SAMPLE_MIN
  } = {}
) => {
  const preGoalSamples = samples.filter((sample) => !sample.playerAtGoal && !sample.reachedGoal);
  const preGoalTargetSamples = preGoalSamples.filter((sample) => sample.target !== null);
  const leaks = preGoalSamples.filter((sample) => sample.targetEqualsGoal);
  const phaseSequence = [];
  const trace = [];
  let previousKey = '';
  for (const sample of samples) {
    if (sample.phase && !phaseSequence.includes(sample.phase)) {
      phaseSequence.push(sample.phase);
    }
    const key = createTraceKey(sample);
    if (key === previousKey) {
      continue;
    }
    trace.push(sample);
    previousKey = key;
    if (trace.length >= 48) {
      break;
    }
  }

  return {
    leakCount: leaks.length,
    leaks: leaks.slice(0, 8),
    pass: leaks.length === 0
      && preGoalSamples.length >= minimumPreGoalSamples
      && preGoalTargetSamples.length >= minimumTargetSamples,
    phaseSequence,
    preGoalSampleCount: preGoalSamples.length,
    sampleCount: samples.length,
    targetSampleCount: preGoalTargetSamples.length,
    trace
  };
};

const readMenuAiDiagnostics = async (page) => page.evaluate(({ runtimeAttribute, visualAttribute }) => {
  const readJsonAttribute = (name) => {
    const raw = document.documentElement.getAttribute(name);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  return {
    runtime: readJsonAttribute(runtimeAttribute),
    visual: readJsonAttribute(visualAttribute),
    url: location.href
  };
}, {
  runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
  visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
});

const waitForMenuAiExploration = async (page, timeoutMs) => {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const diagnostics = await readMenuAiDiagnostics(page);
    const snapshot = resolveMenuAiTargetSnapshot(diagnostics);
    const waitingForBuild = diagnostics.runtime?.menuDemo?.gate?.waitingForBuild
      ?? diagnostics.visual?.runtime?.menuDemo?.gate?.waitingForBuild
      ?? true;
    if (snapshot.phase === 'explore' && snapshot.reachedGoal === false && waitingForBuild === false) {
      return snapshot;
    }
    await page.waitForTimeout(DEFAULT_POLL_MS);
  }
  throw new Error('Timed out waiting for menu AI exploration diagnostics.');
};

export const collectMenuAiTargetProof = async ({
  page,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
  const startedAt = performance.now();
  const samples = [];
  let finalDiagnostics = null;

  while (performance.now() - startedAt < timeoutMs) {
    finalDiagnostics = await readMenuAiDiagnostics(page);
    const snapshot = resolveMenuAiTargetSnapshot(finalDiagnostics);
    samples.push({
      ...snapshot,
      elapsedMs: round(performance.now() - startedAt)
    });
    const summary = summarizeMenuAiTargetSamples(samples);
    if (summary.pass) {
      return {
        ...summary,
        elapsedMs: round(performance.now() - startedAt),
        finalDiagnostics,
        timedOut: false,
        timeoutMs
      };
    }
    await page.waitForTimeout(pollMs);
  }

  return {
    ...summarizeMenuAiTargetSamples(samples),
    elapsedMs: round(performance.now() - startedAt),
    finalDiagnostics,
    timedOut: true,
    timeoutMs
  };
};

const parseViewport = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_VIEWPORT;
  }
  const [rawWidth, rawHeight] = value.toLowerCase().split('x');
  const width = Number.parseInt(rawWidth, 10);
  const height = Number.parseInt(rawHeight, 10);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : DEFAULT_VIEWPORT;
};

export const runLiveMenuAiQa = async (options = {}) => {
  const label = options.label ?? DEFAULT_LABEL;
  const sessionId = resolveSessionId(options.sessionId ?? `${label}-${new Date().toISOString()}`);
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT, sessionId);
  await ensureDir(artifactRoot);

  if (options.skipBuild !== true) {
    runNpmCommand(['run', 'build']);
  }

  let preview = null;
  let browser = null;
  try {
    const requestedBaseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    preview = options.useExistingServer
      ? { baseUrl: requestedBaseUrl }
      : await launchPreviewServer({
        requestedBaseUrl,
        previewTimeoutMs: options.previewTimeoutMs ?? DEFAULT_PREVIEW_TIMEOUT_MS
      });
    const route = options.route ?? DEFAULT_ROUTE;
    const routeWithLabel = `${route}${route.includes('?') ? '&' : '?'}v=${encodeURIComponent(label)}-${Date.now()}`;
    const pageUrl = `${preview.baseUrl}${routeWithLabel}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: options.viewport ?? DEFAULT_VIEWPORT });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    await waitForMenuAiExploration(page, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const proof = await collectMenuAiTargetProof({
      page,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      pollMs: options.pollMs ?? DEFAULT_POLL_MS
    });
    const screenshotPath = resolve(artifactRoot, `${label}.png`);
    const summaryPath = resolve(artifactRoot, `${label}.summary.json`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const summary = {
      schema: 'mazer.live-menu-ai-qa.v1',
      label,
      generatedAt: new Date().toISOString(),
      repo: {
        root: REPO_ROOT,
        commit: getCommitSha(),
        dirty: isWorktreeDirty()
      },
      route: {
        url: page.url(),
        requestedRoute: routeWithLabel
      },
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
      result: {
        pass: proof.pass,
        leakCount: proof.leakCount,
        phaseSequence: proof.phaseSequence,
        preGoalSampleCount: proof.preGoalSampleCount,
        targetSampleCount: proof.targetSampleCount,
        timedOut: proof.timedOut
      },
      proof: {
        elapsedMs: proof.elapsedMs,
        leaks: proof.leaks,
        trace: proof.trace
      },
      artifacts: {
        screenshotPath,
        summaryPath
      }
    };
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    return summary;
  } finally {
    await browser?.close();
    if (preview?.child) {
      await stopPreviewServer(preview.child);
    }
  }
};

if (isDirectRun) {
  const args = parseCliArgs();
  runLiveMenuAiQa({
    artifactRoot: args.artifactRoot ?? args['artifact-root'],
    baseUrl: args.baseUrl ?? args['base-url'],
    label: args.label,
    pollMs: parseIntegerArg(args.pollMs ?? args['poll-ms'], DEFAULT_POLL_MS),
    previewTimeoutMs: parseIntegerArg(args.previewTimeoutMs ?? args['preview-timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS),
    route: args.route,
    sessionId: args.sessionId ?? args['session-id'],
    skipBuild: isTruthy(args.skipBuild ?? args['skip-build']),
    timeoutMs: parseIntegerArg(args.timeout ?? args.timeoutMs ?? args['timeout-ms'], DEFAULT_TIMEOUT_MS),
    useExistingServer: isTruthy(args.noPreview ?? args['no-preview']),
    viewport: parseViewport(args.viewport)
  }).then((summary) => {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.result.pass) {
      process.exitCode = 1;
    }
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
