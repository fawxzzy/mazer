import { execFileSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
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
const STORAGE_KEY = 'mazer.game-toggles.v1';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-play-qa');
const DEFAULT_ROUTE = '/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1';
const DEFAULT_LABEL = 'live-play-qa';
const DEFAULT_VIEWPORT = Object.freeze({ width: 405, height: 958 });
const DEFAULT_STEP_TIMEOUT_MS = 900;
const DEFAULT_SETTLE_MS = 34;
const DEFAULT_MOVE_CAP = 320;

export const MOVE_DELTAS = Object.freeze({
  move_up: Object.freeze({ dx: 0, dy: -1 }),
  move_right: Object.freeze({ dx: 1, dy: 0 }),
  move_down: Object.freeze({ dx: 0, dy: 1 }),
  move_left: Object.freeze({ dx: -1, dy: 0 })
});

const MOVEMENT_ORDER = Object.freeze(['move_up', 'move_right', 'move_down', 'move_left']);

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

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

const createPointKey = (point) => `${point.x},${point.y}`;

export const solveWalkableRoute = ({
  player,
  goal,
  mazeSize,
  walkableRows
}) => {
  if (!player || !goal || !Number.isFinite(mazeSize) || !Array.isArray(walkableRows)) {
    return null;
  }

  const start = { x: player.x, y: player.y };
  const target = { x: goal.x, y: goal.y };
  const queue = [start];
  const parentByKey = new Map([[createPointKey(start), null]]);
  const moveByKey = new Map();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.x === target.x && current.y === target.y) {
      break;
    }

    for (const move of MOVEMENT_ORDER) {
      const delta = MOVE_DELTAS[move];
      const next = {
        x: current.x + delta.dx,
        y: current.y + delta.dy
      };
      const nextKey = createPointKey(next);
      if (next.x < 0 || next.y < 0 || next.x >= mazeSize || next.y >= mazeSize) {
        continue;
      }
      if (walkableRows[next.y]?.[next.x] !== '1') {
        continue;
      }
      if (parentByKey.has(nextKey)) {
        continue;
      }

      parentByKey.set(nextKey, current);
      moveByKey.set(nextKey, move);
      queue.push(next);
    }
  }

  const goalKey = createPointKey(target);
  if (!parentByKey.has(goalKey)) {
    return null;
  }

  const points = [];
  for (let current = target; current; current = parentByKey.get(createPointKey(current))) {
    points.push(current);
  }
  points.reverse();

  const moves = [];
  for (let index = 1; index < points.length; index += 1) {
    moves.push(moveByKey.get(createPointKey(points[index])));
  }

  return {
    points,
    moves,
    exploredTileCount: parentByKey.size
  };
};

export const resolveStickPointForMove = (stick, move) => {
  if (!stick?.outer) {
    return null;
  }

  const outer = stick.outer;
  const inset = 6;
  switch (move) {
    case 'move_up':
      return { x: Math.round(outer.centerX), y: Math.round(outer.top + inset) };
    case 'move_right':
      return { x: Math.round(outer.right - inset), y: Math.round(outer.centerY) };
    case 'move_down':
      return { x: Math.round(outer.centerX), y: Math.round(outer.bottom - inset) };
    case 'move_left':
      return { x: Math.round(outer.left + inset), y: Math.round(outer.centerY) };
    default:
      return null;
  }
};

export const resolveArrowPointForMove = (controls, move) => {
  const rect = controls?.[move] ?? null;
  return rect
    ? { x: Math.round(rect.centerX), y: Math.round(rect.centerY) }
    : null;
};

export const readLivePlayDiagnostics = async (page) => page.evaluate(({ runtimeAttribute, visualAttribute }) => {
  const readJsonAttribute = (attributeName, accept) => {
    const serialized = document.documentElement.getAttribute(attributeName);
    if (typeof serialized !== 'string' || serialized.length === 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(serialized);
      return accept(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  return {
    runtime: readJsonAttribute(
      runtimeAttribute,
      (parsed) => Boolean(parsed?.sceneInstanceId && parsed?.performance && parsed?.resources)
    ),
    visual: readJsonAttribute(
      visualAttribute,
      (parsed) => Boolean(parsed?.board?.bounds && parsed?.runtime?.mode)
    ),
    url: location.href
  };
}, {
  runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
  visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
});

const waitForDiagnosticsReady = async (page, timeoutMs) => {
  await page.waitForFunction(
    ({ runtimeAttribute, visualAttribute }) => {
      const read = (name) => {
        const value = document.documentElement.getAttribute(name);
        if (!value) {
          return null;
        }
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      };
      const runtime = read(runtimeAttribute);
      const visual = read(visualAttribute);
      return Boolean(
        runtime?.surface?.mode === 'play'
        && runtime?.play?.playtest?.encoding === 'walkable-rows-v1'
        && visual?.touchControls?.visible === true
      );
    },
    {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
    },
    { timeout: timeoutMs }
  );
  return readLivePlayDiagnostics(page);
};

const setQaPreferences = async (page, options) => {
  if (!options.forceStick) {
    return;
  }

  await page.addInitScript(({ storageKey, movementSpeed }) => {
    const existing = (() => {
      try {
        return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
      } catch {
        return {};
      }
    })();
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...existing,
      controlMode: 'stick',
      movementSpeed,
      toggleAnimatedBackdrop: false
    }));
  }, {
    storageKey: STORAGE_KEY,
    movementSpeed: options.movementSpeed
  });
};

const triggerMove = async ({ page, diagnostics, move, stepSettleMs }) => {
  const controls = diagnostics.visual?.touchControls?.controls ?? null;
  const stick = diagnostics.visual?.touchControls?.stick ?? null;
  const controlMode = diagnostics.visual?.touchControls?.controlMode ?? null;
  const point = controlMode === 'stick'
    ? resolveStickPointForMove(stick, move)
    : resolveArrowPointForMove(controls, move);

  if (!point) {
    throw new Error(`Could not resolve ${move} control point for ${controlMode ?? 'unknown'} controls.`);
  }

  const startedAt = performance.now();
  if (controlMode === 'stick') {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(18);
    await page.mouse.up();
  } else {
    await page.mouse.click(point.x, point.y);
  }
  await page.waitForTimeout(stepSettleMs);
  return {
    point,
    controlMode,
    inputMs: performance.now() - startedAt
  };
};

const resolveRoute = (args, label) => {
  const rawRoute = typeof args.route === 'string' ? args.route : DEFAULT_ROUTE;
  const url = new URL(rawRoute, 'http://local.test');
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  if (!url.searchParams.has('v')) {
    url.searchParams.set('v', `${label}-${Date.now()}`);
  }
  if (typeof args.mazeSeed === 'string' || typeof args['maze-seed'] === 'string') {
    url.searchParams.set('mazeSeed', String(args.mazeSeed ?? args['maze-seed']));
  }
  return `${url.pathname}${url.search}`;
};

const summarizeTimings = (durations) => {
  if (durations.length === 0) {
    return {
      averageMs: 0,
      maxMs: 0,
      minMs: 0,
      p95Ms: 0
    };
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    averageMs: round(durations.reduce((total, value) => total + value, 0) / durations.length),
    maxMs: round(sorted[sorted.length - 1]),
    minMs: round(sorted[0]),
    p95Ms: round(sorted[p95Index])
  };
};

export const runLivePlayQa = async (options = {}) => {
  const label = options.label ?? DEFAULT_LABEL;
  const sessionId = resolveSessionId(options.sessionId);
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = resolve(artifactRoot, sessionId);
  const route = options.route ?? resolveRoute({}, label);
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const stepSettleMs = options.stepSettleMs ?? DEFAULT_SETTLE_MS;
  const moveCap = options.moveCap ?? DEFAULT_MOVE_CAP;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);

  await ensureDir(outputDir);

  if (!options.skipBuild) {
    runNpmCommand(['run', 'build']);
  }

  const preview = options.useExistingServer
    ? null
    : await launchPreviewServer({
      requestedBaseUrl: baseUrl,
      previewTimeoutMs: options.previewTimeoutMs ?? DEFAULT_PREVIEW_TIMEOUT_MS
    });

  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;
  const targetUrl = new URL(route, resolvedBaseUrl).toString();
  const browser = await chromium.launch({ headless: options.headless !== false });
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport
  });
  const page = await context.newPage();
  await setQaPreferences(page, {
    forceStick: options.forceStick !== false,
    movementSpeed: options.movementSpeed ?? 0.42
  });

  let summary;
  try {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: options.captureTimeoutMs ?? 45_000 });
    const initialDiagnostics = await waitForDiagnosticsReady(page, options.captureTimeoutMs ?? 45_000);
    const initialRuntime = initialDiagnostics.runtime;
    const playtest = initialRuntime?.play?.playtest ?? null;
    const routePlan = solveWalkableRoute({
      player: initialRuntime?.play?.player ?? null,
      goal: initialRuntime?.play?.goal ?? null,
      mazeSize: playtest?.mazeSize,
      walkableRows: playtest?.walkableRows
    });

    if (!routePlan) {
      throw new Error('Could not solve route from live playtest diagnostics.');
    }

    const moves = routePlan.moves.slice(0, moveCap);
    const stepRecords = [];
    let failedAt = null;

    for (let index = 0; index < moves.length; index += 1) {
      const before = await readLivePlayDiagnostics(page);
      const expected = routePlan.points[index + 1];
      const startedAt = performance.now();
      const input = await triggerMove({
        page,
        diagnostics: before,
        move: moves[index],
        stepSettleMs
      });
      let after = await readLivePlayDiagnostics(page);
      let matched = after.runtime?.play?.player?.x === expected.x
        && after.runtime?.play?.player?.y === expected.y;

      while (!matched && performance.now() - startedAt < stepTimeoutMs) {
        await page.waitForTimeout(24);
        after = await readLivePlayDiagnostics(page);
        matched = after.runtime?.play?.player?.x === expected.x
          && after.runtime?.play?.player?.y === expected.y;
      }

      const durationMs = performance.now() - startedAt;
      stepRecords.push({
        index,
        move: moves[index],
        expected,
        actual: after.runtime?.play?.player
          ? {
              x: after.runtime.play.player.x,
              y: after.runtime.play.player.y
            }
          : null,
        matched,
        durationMs: round(durationMs),
        inputMs: round(input.inputMs),
        controlMode: input.controlMode,
        point: input.point
      });

      if (!matched) {
        failedAt = stepRecords[stepRecords.length - 1];
        break;
      }
    }

    const finalDiagnostics = await readLivePlayDiagnostics(page);
    const screenshotPath = resolve(outputDir, `${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const finalPlayer = finalDiagnostics.runtime?.play?.player ?? null;
    const goal = initialRuntime?.play?.goal ?? null;
    const reached = Boolean(finalPlayer && goal && finalPlayer.x === goal.x && finalPlayer.y === goal.y);
    const durations = stepRecords.map((step) => step.durationMs).filter(Number.isFinite);

    summary = {
      schema: 'mazer.live-play-qa.v1',
      label,
      generatedAt: new Date().toISOString(),
      repo: {
        root: REPO_ROOT,
        commit: getCommitSha(),
        dirty: isWorktreeDirty()
      },
      route: {
        url: targetUrl,
        requestedRoute: route,
        seed: initialRuntime?.generation?.maze?.seed ?? null,
        seedSource: initialRuntime?.generation?.maze?.seedSource ?? null,
        buildKind: initialRuntime?.generation?.maze?.buildKind ?? null,
        source: initialRuntime?.generation?.maze?.source ?? null
      },
      viewport,
      result: {
        pass: reached && failedAt === null && routePlan.moves.length <= moveCap,
        reached,
        failedAt,
        capped: routePlan.moves.length > moveCap,
        moveCap,
        pathLength: routePlan.points.length,
        plannedMoveCount: routePlan.moves.length,
        executedMoveCount: stepRecords.length,
        exploredTileCount: routePlan.exploredTileCount,
        start: routePlan.points[0],
        goal,
        finalPlayer: finalPlayer
          ? { x: finalPlayer.x, y: finalPlayer.y }
          : null
      },
      controls: {
        controlMode: finalDiagnostics.visual?.touchControls?.controlMode ?? null,
        visible: finalDiagnostics.visual?.touchControls?.visible ?? false,
        forceStick: options.forceStick !== false,
        movementSpeed: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.movementSpeed ?? null,
        repeatInitialDelayMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.repeatInitialDelayMs ?? null,
        repeatIntervalMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.repeatIntervalMs ?? null,
        turnDelayMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.turnDelayMs ?? null
      },
      performance: {
        estimatedFps: finalDiagnostics.runtime?.performance?.estimatedFps ?? null,
        recentAverageFrameMs: finalDiagnostics.runtime?.performance?.recentAverageFrameMs ?? null,
        recentSpikeCount: finalDiagnostics.runtime?.performance?.recentSpikeCount ?? null,
        worstRecentFrameMs: finalDiagnostics.runtime?.performance?.worstRecentFrameMs ?? null,
        backgroundMovingActors: finalDiagnostics.runtime?.resources?.background?.moving ?? null
      },
      timings: summarizeTimings(durations),
      artifacts: {
        screenshotPath,
        summaryPath: resolve(outputDir, `${label}.summary.json`),
        stepsPath: resolve(outputDir, `${label}.steps.json`)
      }
    };

    await writeFile(summary.artifacts.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(summary.artifacts.stepsPath, `${JSON.stringify(stepRecords, null, 2)}\n`, 'utf8');
    await copyFile(summary.artifacts.summaryPath, resolve(artifactRoot, 'latest.summary.json'));
    return summary;
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

const parseViewport = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_VIEWPORT;
  }
  const [width, height] = value.split('x').map((entry) => Number.parseInt(entry, 10));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : DEFAULT_VIEWPORT;
};

if (isDirectRun) {
  const args = parseCliArgs();
  const label = typeof args.label === 'string' ? args.label : DEFAULT_LABEL;
  const summary = await runLivePlayQa({
    artifactRoot: typeof args.outputRoot === 'string'
      ? args.outputRoot
      : typeof args['output-root'] === 'string'
        ? args['output-root']
        : DEFAULT_ARTIFACT_ROOT,
    baseUrl: typeof args.baseUrl === 'string'
      ? args.baseUrl
      : typeof args['base-url'] === 'string'
        ? args['base-url']
        : DEFAULT_BASE_URL,
    captureTimeoutMs: parseIntegerArg(args.timeoutMs ?? args['timeout-ms'], 45_000),
    forceStick: args.forceStick === undefined && args['force-stick'] === undefined
      ? true
      : isTruthy(args.forceStick ?? args['force-stick']),
    headless: args.headless === undefined ? true : isTruthy(args.headless),
    label,
    moveCap: parseIntegerArg(args.moveCap ?? args['move-cap'], DEFAULT_MOVE_CAP),
    movementSpeed: Number.isFinite(Number(args.movementSpeed ?? args['movement-speed']))
      ? Number(args.movementSpeed ?? args['movement-speed'])
      : 0.42,
    previewTimeoutMs: parseIntegerArg(args.previewTimeoutMs ?? args['preview-timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS),
    route: resolveRoute(args, label),
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: isTruthy(args.skipBuild ?? args['skip-build']),
    stepSettleMs: parseIntegerArg(args.stepSettleMs ?? args['step-settle-ms'], DEFAULT_SETTLE_MS),
    stepTimeoutMs: parseIntegerArg(args.stepTimeoutMs ?? args['step-timeout-ms'], DEFAULT_STEP_TIMEOUT_MS),
    useExistingServer: isTruthy(args.noPreview ?? args['no-preview']),
    viewport: parseViewport(args.viewport)
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.result.pass ? 0 : 1;
}
