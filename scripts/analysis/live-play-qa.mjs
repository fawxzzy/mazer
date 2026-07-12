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
const DEFAULT_POST_GOAL_TIMEOUT_MS = 30_000;
const DEFAULT_POST_GOAL_POLL_MS = 80;
const DEFAULT_INPUT_METHOD = 'qa';

export const MOVE_DELTAS = Object.freeze({
  move_up: Object.freeze({ dx: 0, dy: -1 }),
  move_right: Object.freeze({ dx: 1, dy: 0 }),
  move_down: Object.freeze({ dx: 0, dy: 1 }),
  move_left: Object.freeze({ dx: -1, dy: 0 })
});

const MOVEMENT_ORDER = Object.freeze(['move_up', 'move_right', 'move_down', 'move_left']);
const KEY_BY_MOVE = Object.freeze({
  move_up: 'ArrowUp',
  move_right: 'ArrowRight',
  move_down: 'ArrowDown',
  move_left: 'ArrowLeft'
});

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

const resolveWrappedGridPoint = (point, mazeSize) => {
  if (point.x === -1 && point.y >= 0 && point.y < mazeSize) {
    return { x: mazeSize - 1, y: point.y };
  }
  if (point.x === mazeSize && point.y >= 0 && point.y < mazeSize) {
    return { x: 0, y: point.y };
  }
  if (point.y === -1 && point.x >= 0 && point.x < mazeSize) {
    return { x: point.x, y: mazeSize - 1 };
  }
  if (point.y === mazeSize && point.x >= 0 && point.x < mazeSize) {
    return { x: point.x, y: 0 };
  }

  return null;
};

const resolveWalkableRouteStep = ({ current, delta, mazeSize, walkableRows }) => {
  const direct = {
    x: current.x + delta.dx,
    y: current.y + delta.dy
  };
  const directValue = walkableRows[direct.y]?.[direct.x];
  if (directValue === '1') {
    return direct;
  }

  const wrapped = resolveWrappedGridPoint(direct, mazeSize);
  return wrapped && walkableRows[wrapped.y]?.[wrapped.x] === '1' ? wrapped : null;
};

export const normalizeLivePlayInputMethod = (value) => (
  value === 'stick' || value === 'arrows' || value === 'keyboard' || value === 'qa'
    ? value
    : DEFAULT_INPUT_METHOD
);

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
      const next = resolveWalkableRouteStep({
        current,
        delta,
        mazeSize,
        walkableRows
      });
      if (!next) {
        continue;
      }
      const nextKey = createPointKey(next);
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

export const resolveLivePlayRouteProgressIndex = ({
  actual,
  fromIndex,
  maxLookahead = 6,
  points
}) => {
  if (!actual || !Array.isArray(points) || !Number.isFinite(fromIndex)) {
    return -1;
  }

  const start = Math.max(0, Math.round(fromIndex) + 1);
  const end = Math.min(points.length - 1, start + Math.max(0, Math.round(maxLookahead)));
  for (let index = start; index <= end; index += 1) {
    const point = points[index];
    if (point?.x === actual.x && point?.y === actual.y) {
      return index;
    }
  }
  return -1;
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

export const resolveStickHoldMsForMove = (diagnostics, stepSettleMs) => {
  const repeatInitialDelayMs = diagnostics?.runtime?.play?.inputBuffer?.touchSprint?.repeatInitialDelayMs;

  return Math.round(Math.min(
    96,
    Math.max(
      54,
      Number.isFinite(repeatInitialDelayMs)
        ? Math.min(repeatInitialDelayMs * 0.42, repeatInitialDelayMs - 42)
        : stepSettleMs + 36
    )
  ));
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

export const resolveLivePlayLifecycleSnapshot = (diagnostics) => {
  const runtime = diagnostics?.runtime ?? null;
  const visual = diagnostics?.visual ?? null;
  const runtimeLifecycle = runtime?.play?.lifecycle ?? null;
  const visualLifecycle = visual?.runtime?.playLifecycle ?? null;
  const runtimeDraw = runtime?.generation?.drawStage ?? null;
  const visualDraw = visual?.runtime?.generation?.drawStage ?? null;
  const currentDrawPhase = visualDraw?.lifecyclePhase ?? runtimeDraw?.lifecyclePhase ?? null;
  const lifecycle = (
    visualLifecycle?.drawPhase === currentDrawPhase
      ? visualLifecycle
      : runtimeLifecycle?.drawPhase === currentDrawPhase
        ? runtimeLifecycle
        : runtimeLifecycle ?? visualLifecycle ?? null
  );
  const runtimeMaze = runtime?.generation?.maze ?? null;
  const visualGeneration = visual?.runtime?.generation ?? null;
  const runtimeSurface = runtime?.surface ?? null;
  const visualRuntime = visual?.runtime ?? null;

  return {
    buildPrerollActive: Boolean(runtimeDraw?.buildPrerollActive ?? visualDraw?.buildPrerollActive ?? false),
    complete: runtimeDraw?.complete ?? visualDraw?.complete ?? null,
    compassSpinActive: Boolean(visual?.hud?.compassSpinActive ?? lifecycle?.compassSpinExpected ?? false),
    explicitLifecyclePhase: lifecycle?.phase ?? null,
    runtimeDrawPhase: runtimeDraw?.lifecyclePhase ?? null,
    runtimeExplicitLifecyclePhase: runtimeLifecycle?.phase ?? null,
    runtimeLifecycleDrawPhase: runtimeLifecycle?.drawPhase ?? null,
    handoffActive: Boolean(runtimeDraw?.handoffActive ?? visualDraw?.handoffActive ?? false),
    handoffProgress: Number(runtimeDraw?.handoffProgress ?? visualDraw?.handoffProgress ?? 0),
    inputLocked: lifecycle?.inputLocked ?? null,
    lifecyclePhase: lifecycle?.drawPhase ?? currentDrawPhase,
    mode: runtimeSurface?.mode ?? visualRuntime?.mode ?? null,
    nextSeedQueued: Boolean(lifecycle?.nextSeedQueued ?? runtimeDraw?.nextSeedQueued ?? visualDraw?.nextSeedQueued ?? false),
    overlay: runtimeSurface?.overlay ?? visualRuntime?.overlay ?? null,
    player: runtime?.play?.player
      ? { x: runtime.play.player.x, y: runtime.play.player.y }
      : visualRuntime?.player
        ? { x: visualRuntime.player.x, y: visualRuntime.player.y }
        : null,
    progressPercent: runtimeDraw?.progressPercent ?? visualDraw?.progressPercent ?? null,
    rowsVisible: runtimeDraw?.rowsVisible ?? visualDraw?.rowsVisible ?? null,
    seed: runtimeMaze?.seed ?? visualGeneration?.seed ?? null,
    source: runtimeMaze?.source ?? visualGeneration?.buildKind ?? null,
    timerRunning: lifecycle?.timerRunning ?? null,
    tilesVisible: runtimeDraw?.tilesVisible ?? visualDraw?.tilesVisible ?? null
    ,
    visualDrawPhase: visualDraw?.lifecyclePhase ?? null,
    visualExplicitLifecyclePhase: visualLifecycle?.phase ?? null,
    visualLifecycleDrawPhase: visualLifecycle?.drawPhase ?? null
  };
};

const summarizeLifecycleTraceSamples = (samples) => {
  const trace = [];
  for (const sample of samples) {
    const entry = {
      elapsedMs: sample.elapsedMs,
      explicit: sample.explicitLifecyclePhase,
      draw: sample.lifecyclePhase,
      handoff: sample.handoffActive,
      inputLocked: sample.inputLocked,
      nextSeedQueued: sample.nextSeedQueued,
      runtime: sample.runtimeExplicitLifecyclePhase,
      runtimeDraw: sample.runtimeDrawPhase,
      runtimeLifecycleDraw: sample.runtimeLifecycleDrawPhase,
      seed: sample.seed,
      visual: sample.visualExplicitLifecyclePhase,
      visualDraw: sample.visualDrawPhase,
      visualLifecycleDraw: sample.visualLifecycleDrawPhase
    };
    const previous = trace[trace.length - 1] ?? null;
    if (
      previous !== null
      && previous.explicit === entry.explicit
      && previous.draw === entry.draw
      && previous.handoff === entry.handoff
      && previous.inputLocked === entry.inputLocked
      && previous.nextSeedQueued === entry.nextSeedQueued
      && previous.runtime === entry.runtime
      && previous.runtimeDraw === entry.runtimeDraw
      && previous.runtimeLifecycleDraw === entry.runtimeLifecycleDraw
      && previous.seed === entry.seed
      && previous.visual === entry.visual
      && previous.visualDraw === entry.visualDraw
      && previous.visualLifecycleDraw === entry.visualLifecycleDraw
    ) {
      continue;
    }
    trace.push(entry);
    if (trace.length >= 48) {
      break;
    }
  }
  return trace;
};

const REQUIRED_INPUT_LOCK_PROBE_PHASES = Object.freeze([
  'goal-hold',
  'deconstructing',
  'handoff',
  'building'
]);

export const summarizePostGoalLifecycleSamples = (samples, initialSeed, inputLockProbes = null) => {
  const phases = [...new Set(samples.map((sample) => sample.lifecyclePhase).filter(Boolean))];
  const explicitPhases = [...new Set(samples.map((sample) => sample.explicitLifecyclePhase).filter(Boolean))];
  const settledFreshSample = samples.find((sample) => (
    sample.mode === 'play'
    && Number.isFinite(sample.seed)
    && sample.seed !== initialSeed
    && sample.lifecyclePhase === 'settled'
    && sample.complete === true
  )) ?? null;
  const freshSeed = settledFreshSample?.seed ?? null;
  const hasExplicitLifecycle = explicitPhases.length > 0;
  const sawBuilding = samples.some((sample) => (
    sample.lifecyclePhase === 'building'
    || sample.buildPrerollActive
    || (sample.rowsVisible !== null && sample.rowsVisible !== undefined)
    || (sample.tilesVisible !== null && sample.tilesVisible !== undefined)
  ));
  const sawDeconstructing = samples.some((sample) => sample.lifecyclePhase === 'deconstructing');
  const sawFreshSeedQueued = samples.some((sample) => sample.nextSeedQueued === true);
  const sawHandoff = samples.some((sample) => sample.handoffActive === true || sample.handoffProgress > 0);
  const sawCompassSpin = samples.some((sample) => sample.compassSpinActive === true);
  const sawExplicitBuilding = samples.some((sample) => sample.explicitLifecyclePhase === 'building');
  const sawExplicitDeconstructing = samples.some((sample) => sample.explicitLifecyclePhase === 'deconstructing');
  const sawExplicitGoalHold = samples.some((sample) => sample.explicitLifecyclePhase === 'goal-hold');
  const sawExplicitHandoff = samples.some((sample) => sample.explicitLifecyclePhase === 'handoff');
  const sawExplicitInputLock = samples.some((sample) => sample.inputLocked === true);
  const sawExplicitReady = Boolean(settledFreshSample?.explicitLifecyclePhase === 'ready')
    || samples.some((sample) => sample.seed === freshSeed && sample.explicitLifecyclePhase === 'ready');
  const explicitLifecyclePass = !hasExplicitLifecycle || (
    sawExplicitBuilding
    && sawExplicitDeconstructing
    && sawExplicitGoalHold
    && sawExplicitHandoff
    && sawExplicitInputLock
    && sawExplicitReady
  );
  const inputLockProbePass = inputLockProbes === null
    ? null
    : REQUIRED_INPUT_LOCK_PROBE_PHASES.every((phase) => inputLockProbes.some((probe) => (
      probe.phase === phase && probe.pass === true
    )));

  return {
    pass: Boolean(
      settledFreshSample
      && sawDeconstructing
      && sawBuilding
      && sawFreshSeedQueued
      && sawHandoff
      && explicitLifecyclePass
      && inputLockProbePass !== false
    ),
    explicitLifecyclePass,
    explicitPhaseSequence: explicitPhases,
    freshSeed,
    hasExplicitLifecycle,
    inputLockProbePass,
    inputLockProbes: inputLockProbes ?? [],
    lifecycleTrace: summarizeLifecycleTraceSamples(samples),
    phaseSequence: phases,
    sampleCount: samples.length,
    sawBuilding,
    sawCompassSpin,
    sawDeconstructing,
    sawExplicitBuilding,
    sawExplicitDeconstructing,
    sawExplicitGoalHold,
    sawExplicitHandoff,
    sawExplicitInputLock,
    sawExplicitReady,
    sawFreshSeedQueued,
    sawHandoff,
    settledFreshSeed: Boolean(settledFreshSample)
  };
};

export const collectPostGoalLifecycleProof = async ({
  initialSeed,
  page,
  pollMs = DEFAULT_POST_GOAL_POLL_MS,
  timeoutMs = DEFAULT_POST_GOAL_TIMEOUT_MS
}) => {
  const startedAt = performance.now();
  const samples = [];
  const inputLockProbes = [];
  let finalDiagnostics = null;

  while (performance.now() - startedAt < timeoutMs) {
    finalDiagnostics = await readLivePlayDiagnostics(page);
    const snapshot = resolveLivePlayLifecycleSnapshot(finalDiagnostics);
    samples.push({
      ...snapshot,
      elapsedMs: round(performance.now() - startedAt)
    });
    if (
      snapshot.inputLocked === true
      && REQUIRED_INPUT_LOCK_PROBE_PHASES.includes(snapshot.explicitLifecyclePhase)
      && !inputLockProbes.some((probe) => probe.phase === snapshot.explicitLifecyclePhase)
    ) {
      const result = await page.evaluate(() => window.__MAZER_QA__?.movePlayPlayer?.('move_up') ?? null);
      const playerUnchanged = Boolean(
        result?.player
        && snapshot.player
        && result.player.x === snapshot.player.x
        && result.player.y === snapshot.player.y
      );
      inputLockProbes.push({
        accepted: result?.accepted ?? null,
        lifecycleLocked: result?.lifecycleLocked ?? null,
        pass: result?.accepted === false && result?.lifecycleLocked === true && playerUnchanged,
        phase: snapshot.explicitLifecyclePhase,
        playerUnchanged,
        reason: result?.reason ?? null
      });
    }

    const summary = summarizePostGoalLifecycleSamples(samples, initialSeed, inputLockProbes);
    if (summary.pass) {
      return {
        ...summary,
        elapsedMs: round(performance.now() - startedAt),
        finalDiagnostics,
        timeoutMs,
        timedOut: false
      };
    }

    await page.waitForTimeout(pollMs);
  }

  const summary = summarizePostGoalLifecycleSamples(samples, initialSeed, inputLockProbes);
  return {
    ...summary,
    elapsedMs: round(performance.now() - startedAt),
    finalDiagnostics,
    timeoutMs,
    timedOut: true
  };
};

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
      const drawStage = runtime?.generation?.drawStage ?? null;
      const drawSettled = drawStage?.lifecyclePhase === 'settled'
        && drawStage?.complete === true
        && drawStage?.buildPrerollActive !== true;
      return Boolean(
        runtime?.surface?.mode === 'play'
        && runtime?.play?.playtest?.encoding === 'walkable-rows-v1'
        && drawSettled
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
  if (options.inputMethod === 'keyboard' || options.inputMethod === 'qa') {
    return;
  }

  await page.addInitScript(({ inputMethod, storageKey, movementSpeed }) => {
    const existing = (() => {
      try {
        return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
      } catch {
        return {};
      }
    })();
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...existing,
      controlMode: inputMethod === 'stick' ? 'stick' : 'arrows',
      movementSpeed,
      toggleAnimatedBackdrop: false
    }));
  }, {
    inputMethod: options.inputMethod,
    storageKey: STORAGE_KEY,
    movementSpeed: options.movementSpeed
  });
};

const triggerMove = async ({ inputMethod, page, diagnostics, move, stepSettleMs }) => {
  const controls = diagnostics.visual?.touchControls?.controls ?? null;
  const stick = diagnostics.visual?.touchControls?.stick ?? null;
  const controlMode = diagnostics.visual?.touchControls?.controlMode ?? null;
  const resolvedInputMethod = normalizeLivePlayInputMethod(inputMethod);
  if (resolvedInputMethod === 'qa') {
    const startedAt = performance.now();
    const qaResult = await page.evaluate((actionKind) => {
      const api = window.__MAZER_QA__;
      return api?.movePlayPlayer
        ? api.movePlayPlayer(actionKind)
        : {
            accepted: false,
            lifecycleLocked: false,
            mode: 'play',
            move: actionKind,
            overlay: 'none',
            player: null,
            reason: 'missing-qa-surface'
          };
    }, move);
    await page.waitForTimeout(stepSettleMs);
    return {
      point: null,
      holdMs: 0,
      controlMode,
      inputMethod: resolvedInputMethod,
      inputMs: performance.now() - startedAt,
      qaResult
    };
  }
  if (resolvedInputMethod === 'keyboard') {
    const key = KEY_BY_MOVE[move];
    const startedAt = performance.now();
    await page.keyboard.press(key);
    await page.waitForTimeout(stepSettleMs);
    return {
      point: null,
      holdMs: 0,
      controlMode,
      inputMethod: resolvedInputMethod,
      inputMs: performance.now() - startedAt,
      qaResult: null
    };
  }

  const point = resolvedInputMethod === 'stick'
    ? resolveStickPointForMove(stick, move)
    : resolveArrowPointForMove(controls, move);

  if (!point) {
    throw new Error(`Could not resolve ${move} control point for ${resolvedInputMethod} controls.`);
  }

  const startedAt = performance.now();
  let holdMs = 0;
  if (resolvedInputMethod === 'stick') {
    const center = {
      x: Math.round(stick.outer.centerX),
      y: Math.round(stick.outer.centerY)
    };
    holdMs = resolveStickHoldMsForMove(diagnostics, stepSettleMs);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.waitForTimeout(18);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
  } else {
    await page.mouse.click(point.x, point.y);
  }
  await page.waitForTimeout(stepSettleMs);
  return {
    point,
    holdMs,
    controlMode,
    inputMethod: resolvedInputMethod,
    inputMs: performance.now() - startedAt,
    qaResult: null
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

export const summarizeGoalWorldTurn = (worldTurn, plannedMoveCount) => ({
  atGoal: worldTurn ?? null,
  pass: Boolean(
    worldTurn
    && worldTurn.acceptedTurnCount === plannedMoveCount
    && worldTurn.nextTurn === plannedMoveCount
    && worldTurn.lastReceipt?.admitted === true
    && worldTurn.lastReceipt?.turn === plannedMoveCount - 1
  )
});

export const summarizeFreshWorldTurn = (worldTurn) => ({
  freshMaze: worldTurn ?? null,
  pass: Boolean(
    worldTurn
    && worldTurn.acceptedTurnCount === 0
    && worldTurn.nextTurn === 0
    && worldTurn.rejectedCommandCount >= 1
    && worldTurn.lastReceipt?.admitted === false
    && worldTurn.lastReceipt?.reason === 'simulation-paused'
  )
});

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
  const inputMethod = normalizeLivePlayInputMethod(options.inputMethod);

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
    inputMethod,
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

    let routeIndex = 0;
    while (routeIndex < moves.length) {
      const before = await readLivePlayDiagnostics(page);
      const expected = routePlan.points[routeIndex + 1];
      const startedAt = performance.now();
      const input = await triggerMove({
        inputMethod,
        page,
        diagnostics: before,
        move: moves[routeIndex],
        stepSettleMs
      });
      let after = await readLivePlayDiagnostics(page);
      const readActualPlayer = () => after.runtime?.play?.player
        ? {
            x: after.runtime.play.player.x,
            y: after.runtime.play.player.y
          }
        : null;
      let actual = readActualPlayer();
      let matchedIndex = resolveLivePlayRouteProgressIndex({
        actual,
        fromIndex: routeIndex,
        maxLookahead: input.inputMethod === 'stick' ? 8 : 1,
        points: routePlan.points
      });
      let matched = matchedIndex > routeIndex;

      while (!matched && performance.now() - startedAt < stepTimeoutMs) {
        await page.waitForTimeout(24);
        after = await readLivePlayDiagnostics(page);
        actual = readActualPlayer();
        matchedIndex = resolveLivePlayRouteProgressIndex({
          actual,
          fromIndex: routeIndex,
          maxLookahead: input.inputMethod === 'stick' ? 8 : 1,
          points: routePlan.points
        });
        matched = matchedIndex > routeIndex;
      }

      const durationMs = performance.now() - startedAt;
      stepRecords.push({
        index: routeIndex,
        move: moves[routeIndex],
        expected,
        actual,
        consumedMoveCount: matched ? matchedIndex - routeIndex : 0,
        matched,
        matchedRouteIndex: matched ? matchedIndex : null,
        durationMs: round(durationMs),
        inputMs: round(input.inputMs),
        controlMode: input.controlMode,
        inputMethod: input.inputMethod,
        holdMs: input.holdMs,
        qaAccepted: input.qaResult?.accepted ?? null,
        qaLifecycleLocked: input.qaResult?.lifecycleLocked ?? null,
        qaReason: input.qaResult?.reason ?? null,
        point: input.point
      });

      if (!matched) {
        failedAt = stepRecords[stepRecords.length - 1];
        break;
      }

      routeIndex = matchedIndex;
    }

    const goalReachedDiagnostics = await readLivePlayDiagnostics(page);
    const lifecycleProof = options.verifyPostGoalLifecycle === false || failedAt !== null
      ? null
      : await collectPostGoalLifecycleProof({
        initialSeed: initialRuntime?.generation?.maze?.seed ?? null,
        page,
        timeoutMs: options.postGoalTimeoutMs ?? DEFAULT_POST_GOAL_TIMEOUT_MS
      });
    const finalDiagnostics = lifecycleProof?.finalDiagnostics ?? goalReachedDiagnostics;
    const screenshotPath = resolve(outputDir, `${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const goalReachedPlayer = goalReachedDiagnostics.runtime?.play?.player ?? null;
    const goal = initialRuntime?.play?.goal ?? null;
    const reached = Boolean(goalReachedPlayer && goal && goalReachedPlayer.x === goal.x && goalReachedPlayer.y === goal.y);
    const durations = stepRecords.map((step) => step.durationMs).filter(Number.isFinite);
    const lifecyclePassed = lifecycleProof === null ? true : lifecycleProof.pass;
    const goalWorldTurn = goalReachedDiagnostics.runtime?.play?.worldTurn ?? null;
    const worldTurnProof = summarizeGoalWorldTurn(goalWorldTurn, routePlan.moves.length);
    const freshWorldTurnProof = lifecycleProof === null
      ? { freshMaze: null, pass: true }
      : summarizeFreshWorldTurn(lifecycleProof.finalDiagnostics?.runtime?.play?.worldTurn ?? null);
    const worldTurnPassed = worldTurnProof.pass && freshWorldTurnProof.pass;

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
        pass: reached && failedAt === null && routePlan.moves.length <= moveCap && lifecyclePassed && worldTurnPassed,
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
        finalPlayer: goalReachedPlayer
          ? { x: goalReachedPlayer.x, y: goalReachedPlayer.y }
          : null
      },
      postGoalLifecycle: lifecycleProof ? {
        elapsedMs: lifecycleProof.elapsedMs,
        explicitLifecyclePass: lifecycleProof.explicitLifecyclePass,
        explicitPhaseSequence: lifecycleProof.explicitPhaseSequence,
        freshSeed: lifecycleProof.freshSeed,
        hasExplicitLifecycle: lifecycleProof.hasExplicitLifecycle,
        inputLockProbePass: lifecycleProof.inputLockProbePass,
        inputLockProbes: lifecycleProof.inputLockProbes,
        lifecycleTrace: lifecycleProof.lifecycleTrace,
        pass: lifecycleProof.pass,
        phaseSequence: lifecycleProof.phaseSequence,
        sampleCount: lifecycleProof.sampleCount,
        sawBuilding: lifecycleProof.sawBuilding,
        sawCompassSpin: lifecycleProof.sawCompassSpin,
        sawDeconstructing: lifecycleProof.sawDeconstructing,
        sawExplicitBuilding: lifecycleProof.sawExplicitBuilding,
        sawExplicitDeconstructing: lifecycleProof.sawExplicitDeconstructing,
        sawExplicitGoalHold: lifecycleProof.sawExplicitGoalHold,
        sawExplicitHandoff: lifecycleProof.sawExplicitHandoff,
        sawExplicitInputLock: lifecycleProof.sawExplicitInputLock,
        sawExplicitReady: lifecycleProof.sawExplicitReady,
        sawFreshSeedQueued: lifecycleProof.sawFreshSeedQueued,
        sawHandoff: lifecycleProof.sawHandoff,
        settledFreshSeed: lifecycleProof.settledFreshSeed,
        timedOut: lifecycleProof.timedOut,
        timeoutMs: lifecycleProof.timeoutMs
      } : null,
      worldTurn: {
        ...worldTurnProof,
        freshMaze: freshWorldTurnProof.freshMaze,
        freshMazePass: freshWorldTurnProof.pass
      },
      controls: {
        controlMode: finalDiagnostics.visual?.touchControls?.controlMode ?? null,
        visible: finalDiagnostics.visual?.touchControls?.visible ?? false,
        inputMethod,
        movementSpeed: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.movementSpeed ?? null,
        repeatInitialDelayMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.repeatInitialDelayMs ?? null,
        repeatIntervalMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.repeatIntervalMs ?? null,
        turnDelayMs: finalDiagnostics.runtime?.play?.inputBuffer?.touchSprint?.turnDelayMs ?? null
      },
      inputMethod,
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
  const rawInputMethod = args.inputMethod ?? args['input-method'] ?? (
    args.forceStick !== undefined || args['force-stick'] !== undefined
      ? (isTruthy(args.forceStick ?? args['force-stick']) ? 'stick' : 'keyboard')
      : undefined
  );
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
    headless: args.headless === undefined ? true : isTruthy(args.headless),
    label,
    moveCap: parseIntegerArg(args.moveCap ?? args['move-cap'], DEFAULT_MOVE_CAP),
    movementSpeed: Number.isFinite(Number(args.movementSpeed ?? args['movement-speed']))
      ? Number(args.movementSpeed ?? args['movement-speed'])
      : 0.42,
    inputMethod: normalizeLivePlayInputMethod(rawInputMethod),
    postGoalTimeoutMs: parseIntegerArg(args.postGoalTimeoutMs ?? args['post-goal-timeout-ms'], DEFAULT_POST_GOAL_TIMEOUT_MS),
    previewTimeoutMs: parseIntegerArg(args.previewTimeoutMs ?? args['preview-timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS),
    route: resolveRoute(args, label),
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: isTruthy(args.skipBuild ?? args['skip-build']),
    stepSettleMs: parseIntegerArg(args.stepSettleMs ?? args['step-settle-ms'], DEFAULT_SETTLE_MS),
    stepTimeoutMs: parseIntegerArg(args.stepTimeoutMs ?? args['step-timeout-ms'], DEFAULT_STEP_TIMEOUT_MS),
    useExistingServer: isTruthy(args.noPreview ?? args['no-preview']),
    verifyPostGoalLifecycle: args.verifyPostGoalLifecycle === undefined && args['verify-post-goal-lifecycle'] === undefined
      ? true
      : isTruthy(args.verifyPostGoalLifecycle ?? args['verify-post-goal-lifecycle']),
    viewport: parseViewport(args.viewport)
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.result.pass ? 0 : 1;
}
