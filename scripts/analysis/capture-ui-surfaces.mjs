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
  resolveSessionId
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import {
  assertVisualScreenContract,
  buildVisualScreenContract
} from '../visual/screen-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const STORAGE_KEY = 'mazer.game-toggles.v1';
const WRAP_TOPOLOGY_PROGRESSION_STORAGE_KEY = 'mazer.progression.v1:user:runtime-diagnostics-auth-fixture';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-ui-surfaces');
const DEFAULT_LABEL = 'ui-surfaces';
const DEFAULT_ROUTE = '/?content=core-only&theme=aurora&runtimeDiagnostics=1';
const DEFAULT_VIEWPORT = Object.freeze({ width: 405, height: 958 });
const DEFAULT_TRANSITION_VIEWPORTS = Object.freeze({
  initial: Object.freeze({ width: 360, height: 720 }),
  desktop: Object.freeze({ width: 1440, height: 900 }),
  endpoint: Object.freeze({ width: 405, height: 958 })
});
const DEFAULT_DEVICE_SCALE_FACTOR = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const EXPECTED_PLAYER_CORE_COLOR = 0x36ff7d;
const EXPECTED_GOAL_CORE_COLOR = 0xff263f;
const EXPECTED_TRAIL_SHINE_COLOR = 0xffffff;
const EXPECTED_TRAIL_SHINE_EDGE_COLOR = 0xe8fff5;

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

const readJsonAttribute = async (page, attribute) => page.evaluate((attr) => {
  const raw = document.documentElement.getAttribute(attr);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}, attribute);

const readDiagnostics = async (page) => ({
  runtime: await readJsonAttribute(page, RUNTIME_DIAGNOSTICS_ATTRIBUTE),
  visual: await readJsonAttribute(page, VISUAL_DIAGNOSTICS_ATTRIBUTE)
});

const waitForSurface = async (page, {
  expectedLabels = [],
  mode,
  overlay,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
  await page.waitForFunction(
    ({ runtimeAttribute, visualAttribute, mode: expectedMode, overlay: expectedOverlay }) => {
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const visualRaw = document.documentElement.getAttribute(visualAttribute);
      if (!runtimeRaw || !visualRaw) {
        return false;
      }

      try {
        const visual = JSON.parse(visualRaw);
        return visual?.runtime?.mode === expectedMode && visual?.runtime?.overlay === expectedOverlay;
      } catch {
        return false;
      }
    },
    {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE,
      mode,
      overlay
    },
    { timeout: timeoutMs }
  );
  if (expectedLabels.length > 0) {
    await page.waitForFunction(
      ({ expected, visualAttribute }) => {
        const raw = document.documentElement.getAttribute(visualAttribute);
        if (!raw) {
          return false;
        }

        try {
          const visual = JSON.parse(raw);
          const labels = new Set((visual?.textLabels ?? []).map((entry) => entry.text));
          return expected.every((label) => labels.has(label));
        } catch {
          return false;
        }
      },
      {
        expected: expectedLabels,
        visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
      },
      { timeout: timeoutMs }
    );
  }
  return readDiagnostics(page);
};

const waitForVisualBuildSettled = async (page, { requireReadableTitle = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  await page.waitForFunction(
    ({ requireReadableTitle: shouldRequireReadableTitle, visualAttribute }) => {
      const raw = document.documentElement.getAttribute(visualAttribute);
      if (!raw) {
        return false;
      }

      try {
        const visual = JSON.parse(raw);
        const drawStage = visual?.runtime?.generation?.drawStage;
        const drawSettled = drawStage?.complete === true || drawStage?.lifecyclePhase === 'settled';
        if (!drawSettled) {
          return false;
        }
        if (!shouldRequireReadableTitle || visual?.runtime?.mode !== 'menu' || visual?.runtime?.overlay !== 'none') {
          return true;
        }
        return visual?.title?.visible === true && visual?.title?.progressPercent >= 95;
      } catch {
        return false;
      }
    },
    {
      requireReadableTitle,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
    },
    { timeout: timeoutMs }
  );
};

const waitForAuthenticatedFixtureReady = async (page, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  await page.waitForFunction(
    ({ runtimeAttribute, visualAttribute }) => {
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const visualRaw = document.documentElement.getAttribute(visualAttribute);
      if (!runtimeRaw || !visualRaw) {
        return false;
      }

      try {
        const runtime = JSON.parse(runtimeRaw);
        const visual = JSON.parse(visualRaw);
        const labels = new Set((visual?.textLabels ?? []).map((entry) => entry.text));
        return runtime?.auth?.status === 'authenticated'
          && visual?.runtime?.mode === 'menu'
          && visual?.runtime?.overlay === 'none'
          && labels.has('Start')
          && labels.has('Options');
      } catch {
        return false;
      }
    },
    {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
    },
    { timeout: timeoutMs }
  );
};

const resolveRoute = ({ authFixture, route = DEFAULT_ROUTE, label, mazeSeed }) => {
  const url = new URL(route, 'http://local.test');
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  if (typeof authFixture === 'string' && authFixture.length > 0) {
    url.searchParams.set('authFixture', authFixture);
  }
  if (typeof mazeSeed === 'string' && mazeSeed.length > 0) {
    url.searchParams.set('mazeSeed', mazeSeed);
  }
  if (!url.searchParams.has('v')) {
    url.searchParams.set('v', `${label}-${Date.now()}`);
  }

  return `${url.pathname}${url.search}`;
};

const resolveRouteWithParams = (route, params) => {
  const url = new URL(route, 'http://local.test');
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
};

const parseViewport = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_VIEWPORT;
  }

  const match = value.match(/^(\d+)x(\d+)$/i);
  if (!match) {
    return DEFAULT_VIEWPORT;
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10)
  };
};

const clickPoint = async (page, point, label) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Missing click point for ${label}.`);
  }

  await page.mouse.click(point.x, point.y);
};

const openOptionsOverlayFromMenu = async (page, point, expectedLabels, timeoutMs) => {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt === 1) {
      await page.touchscreen.tap(point.x, point.y);
    } else {
      await clickPoint(page, point, 'Options');
    }
    try {
      await waitForSurface(page, {
        expectedLabels,
        mode: 'menu',
        overlay: 'options',
        timeoutMs: Math.min(timeoutMs, 10_000)
      });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }

  throw lastError ?? new Error('Unable to open Options overlay from menu.');
};

const openOptionsOverlayViaQa = async (page, timeoutMs) => {
  await page.waitForFunction(
    () => Boolean(window.__MAZER_QA__?.openOptionsOverlay),
    {},
    { timeout: timeoutMs }
  );
  const result = await page.evaluate(() => {
    const api = window.__MAZER_QA__;
    return api?.openOptionsOverlay
      ? api.openOptionsOverlay()
      : {
          accepted: false,
          mode: null,
          overlay: null,
          reason: 'missing-qa-surface'
        };
  });
  if (result?.accepted !== true) {
    throw new Error(`Unable to open Options overlay through QA bridge: ${result?.reason ?? 'unknown'}`);
  }
  await page.waitForTimeout(Math.min(timeoutMs, 500));
};

const PLAY_TRAIL_SEED_MOVES = Object.freeze([
  'move_right',
  'move_down',
  'move_left',
  'move_up'
]);

const seedPlayTrailForVisualProof = async (page, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  await page.waitForFunction(
    () => Boolean(window.__MAZER_QA__?.movePlayPlayer),
    {},
    { timeout: timeoutMs }
  );

  const result = await page.evaluate((moves) => {
    const api = window.__MAZER_QA__;
    if (!api?.movePlayPlayer) {
      return {
        accepted: false,
        move: null,
        reason: 'missing-qa-surface'
      };
    }

    for (const move of moves) {
      const moveResult = api.movePlayPlayer(move);
      if (moveResult?.accepted === true) {
        return {
          accepted: true,
          move,
          reason: moveResult.reason ?? null
        };
      }
    }

    return {
      accepted: false,
      move: null,
      reason: 'no-cardinal-move-accepted'
    };
  }, PLAY_TRAIL_SEED_MOVES);

  if (!result.accepted) {
    throw new Error(`Unable to seed play trail for visual proof: ${result.reason ?? 'unknown'}`);
  }

  await page.waitForFunction(
    ({ visualAttribute }) => {
      const raw = document.documentElement.getAttribute(visualAttribute);
      if (!raw) {
        return false;
      }

      try {
        const visual = JSON.parse(raw);
        return visual?.markerStyle?.trailShineEnabled === true;
      } catch {
        return false;
      }
    },
    {
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
    },
    { timeout: timeoutMs }
  );

  return result;
};

const captureSurface = async ({
  page,
  outputDir,
  expectedLabels = [],
  id,
  mode,
  overlay,
  route,
  skipWait = false,
  timeoutMs,
  viewport
}) => {
  let diagnostics = skipWait ? await readDiagnostics(page) : await waitForSurface(page, {
    expectedLabels,
    mode,
    overlay,
    timeoutMs
  });
  if (skipWait && expectedLabels.length > 0) {
    let labels = new Set((diagnostics.visual?.textLabels ?? []).map((entry) => entry.text));
    let missingLabels = expectedLabels.filter((label) => !labels.has(label));
    if (missingLabels.length > 0) {
      await page.waitForFunction(
        ({ expected, visualAttribute }) => {
          const raw = document.documentElement.getAttribute(visualAttribute);
          if (!raw) {
            return false;
          }

          try {
            const visual = JSON.parse(raw);
            const currentLabels = new Set((visual?.textLabels ?? []).map((entry) => entry.text));
            return expected.every((label) => currentLabels.has(label));
          } catch {
            return false;
          }
        },
        {
          expected: expectedLabels,
          visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
        },
        { timeout: timeoutMs }
      );
      diagnostics = await readDiagnostics(page);
      labels = new Set((diagnostics.visual?.textLabels ?? []).map((entry) => entry.text));
      missingLabels = expectedLabels.filter((label) => !labels.has(label));
    }
    if (missingLabels.length > 0) {
      throw new Error(`Surface ${id} missing labels after direct diagnostics read: ${missingLabels.join(', ')}`);
    }
  }
  const screenContract = buildVisualScreenContract({
    expectedRoute: route,
    actualUrl: page.url(),
    expectedMode: mode,
    expectedOverlay: overlay,
    viewport,
    diagnostics: diagnostics.visual
  });
  assertVisualScreenContract(screenContract);
  const screenshotPath = resolve(outputDir, `${id}.png`);
  const nativeInputs = await page.$$eval('[data-mazer-auth-input]', (inputs) => inputs.map((input) => {
    const bounds = input.getBoundingClientRect();
    return {
      field: input.getAttribute('data-mazer-auth-input') ?? '',
      placeholder: input.getAttribute('placeholder') ?? '',
      valueLength: input.value.length,
      bounds: {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width
      }
    };
  }));
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return {
    id,
    screenshotPath,
    diagnostics,
    nativeInputs,
    actualUrl: page.url(),
    screenContract
  };
};

const openAuthOverlayFromMenu = async (page, timeoutMs) => {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const diagnostics = await readDiagnostics(page);
    const buttons = getMenuButtonPoints(diagnostics.visual);
    await clickPoint(page, buttons.login, 'Login');
    try {
      await waitForSurface(page, {
        expectedLabels: ['Account', 'Login', 'Create Account', 'Reset Password'],
        mode: 'menu',
        overlay: 'auth',
        timeoutMs: Math.min(timeoutMs, 10_000)
      });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError ?? new Error('Unable to open auth overlay from menu.');
};

const toSurfaceState = (capture) => ({
  mode: capture.diagnostics.visual?.runtime?.mode ?? capture.diagnostics.runtime?.surface?.mode,
  overlay: capture.diagnostics.visual?.runtime?.overlay ?? capture.diagnostics.runtime?.surface?.overlay,
  board: capture.diagnostics.visual?.board,
  layout: capture.diagnostics.visual?.layout,
  progressionBadge: capture.diagnostics.visual?.progressionBadge,
  title: capture.diagnostics.visual?.title,
  buttons: capture.diagnostics.visual?.buttons,
  overlayUi: capture.diagnostics.visual?.overlayUi,
  nativeInputs: capture.nativeInputs,
  textLabels: capture.diagnostics.visual?.textLabels,
  touchControls: capture.diagnostics.visual?.touchControls,
  screenContract: capture.screenContract
});

const waitForViewportGeometry = async (page, viewport, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  await page.waitForFunction(
    ({ visualAttribute, width, height }) => {
      const raw = document.documentElement.getAttribute(visualAttribute);
      if (!raw) {
        return false;
      }

      try {
        const visual = JSON.parse(raw);
        return visual?.viewport?.width === width && visual?.viewport?.height === height;
      } catch {
        return false;
      }
    },
    {
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE,
      width: viewport.width,
      height: viewport.height
    },
    { timeout: timeoutMs }
  );
};

const stableBoardDiagnostics = (board) => board ? {
  bounds: board.bounds ?? null,
  renderBounds: board.renderBounds ?? null,
  renderSafeInset: board.renderSafeInset ?? null,
  safeBounds: board.safeBounds ?? null,
  pathVisualStyle: board.pathVisualStyle ?? null,
  tileSize: board.tileSize ?? null,
  topCenterNotch: board.topCenterNotch ?? null
} : null;

const stableTransitionDiagnostics = (surface) => ({
  board: stableBoardDiagnostics(surface.board),
  layout: surface.layout ?? null,
  mode: surface.mode ?? null,
  overlay: surface.overlay ?? null,
  touchControls: surface.touchControls ?? null
});

const collectTransitionLayoutIssues = (surfaceId, surface, viewport) => [
  ...collectTextBoundsIssues(surfaceId, surface, viewport),
  ...collectNativeInputBoundsIssues(surfaceId, surface, viewport),
  ...collectTextOverlapIssues(surfaceId, surface)
];

const captureViewportTransition = async ({
  id,
  mode,
  overlay,
  page,
  route,
  timeoutMs,
  transition
}) => {
  const captureEndpoint = async (name, viewport) => {
    await page.setViewportSize(viewport);
    await waitForViewportGeometry(page, viewport, timeoutMs);
    await waitForVisualBuildSettled(page, { timeoutMs });
    const capture = await captureSurface({
      page,
      outputDir: transition.outputDir,
      expectedLabels: [],
      id: `${id}-transition-${name}`,
      mode,
      overlay,
      route,
      timeoutMs,
      viewport
    });
    const surface = toSurfaceState(capture);
    return {
      name,
      viewport,
      diagnostics: stableTransitionDiagnostics(surface),
      nativeInputs: surface.nativeInputs,
      layoutIssues: collectTransitionLayoutIssues(id, surface, viewport),
      screenshotPath: capture.screenshotPath
    };
  };

  const initial = await captureEndpoint('initial', transition.initial);
  const desktop = await captureEndpoint('desktop', transition.desktop);
  const restored = await captureEndpoint('restored', transition.initial);
  const endpoint = await captureEndpoint('endpoint', transition.endpoint);
  await page.setViewportSize(transition.initial);
  await waitForViewportGeometry(page, transition.initial, timeoutMs);
  await waitForVisualBuildSettled(page, { timeoutMs });

  return {
    initial,
    desktop,
    restored,
    endpoint,
    restoredDiagnosticsMatch: JSON.stringify(initial.diagnostics) === JSON.stringify(restored.diagnostics),
    layoutIssues: [initial, desktop, restored, endpoint]
      .flatMap((entry) => entry.layoutIssues.map((issue) => `${entry.name}:${issue}`))
  };
};

const seedPreferences = async (page, preferences) => {
  await page.addInitScript(({ storageKey, value }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, {
    storageKey: STORAGE_KEY,
    value: preferences
  });
};

const getVisualButtonPoint = (visual, text) => {
  const button = (visual?.buttons ?? []).find((entry) => entry?.text === text && isFiniteBounds(entry?.bounds));
  if (!button) {
    return null;
  }

  return {
    x: Math.round(button.bounds.centerX),
    y: Math.round(button.bounds.centerY)
  };
};

const getMenuButtonPoints = (visual) => ({
  login: getVisualButtonPoint(visual, 'Login') ?? {
    x: Math.round(visual?.layout?.centerButtonX ?? 0),
    y: Math.round(visual?.layout?.centerButtonY ?? 0)
  },
  start: getVisualButtonPoint(visual, 'Start') ?? {
    x: Math.round(visual?.layout?.leftButtonX ?? 0),
    y: Math.round(visual?.layout?.leftButtonY ?? 0)
  },
  options: getVisualButtonPoint(visual, 'Options') ?? {
    x: Math.round(visual?.layout?.rightButtonX ?? 0),
    y: Math.round(visual?.layout?.rightButtonY ?? 0)
  }
});

const collectTextLabels = (surface) => (
  surface?.textLabels ?? surface?.diagnostics?.visual?.textLabels ?? []
).map((entry) => entry.text);

const collectTextLabelEntries = (surface) => (
  surface?.textLabels ?? surface?.diagnostics?.visual?.textLabels ?? []
);

const collectNativeInputEntries = (surface) => (
  surface?.nativeInputs ?? []
);

const hasTextLabels = (surface, expectedLabels) => {
  const labels = new Set(collectTextLabels(surface));
  return expectedLabels.every((label) => labels.has(label));
};

const OPTIONS_BASE_EXPECTED_LABELS = Object.freeze([
  'Options',
  'PLAYER GUIDE',
  'Camera Follow'
]);

const resolveOptionsExpectedLabels = (authenticated) => [
  ...OPTIONS_BASE_EXPECTED_LABELS,
  authenticated ? 'Log out' : 'Account'
];

const isAuthGatedMenuSurface = (surface) => (
  hasTextLabels(surface, ['Login'])
  && !hasTextLabels(surface, ['Start', 'Options'])
);

const getPauseButtonPoint = (visual) => {
  const pause = visual?.touchControls?.controls?.pause;
  return pause
    ? { x: Math.round(pause.centerX), y: Math.round(pause.centerY) }
    : null;
};

const createCheck = (id, passed, detail) => ({
  id,
  passed: passed === true,
  detail
});

const isIgnorableConsoleMessage = (message) => (
  message.type === 'warning'
  && typeof message.text === 'string'
  && message.text.includes('WebGL: CONTEXT_LOST_WEBGL')
);

const isFiniteBounds = (bounds) => (
  bounds
  && Number.isFinite(bounds.left)
  && Number.isFinite(bounds.right)
  && Number.isFinite(bounds.top)
  && Number.isFinite(bounds.bottom)
  && Number.isFinite(bounds.width)
  && Number.isFinite(bounds.height)
);

const scrollOverlayToBottom = async (page, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const before = await readDiagnostics(page);
  const scroll = before.visual?.overlayUi?.scroll;
  if (
    scroll?.enabled !== true
    || !Number.isFinite(scroll.maxOffset)
    || scroll.maxOffset <= 0
    || !isFiniteBounds(scroll.viewport)
  ) {
    return before;
  }

  const dragStartY = scroll.track.bottom - 2;
  const dragEndY = scroll.track.top + 2;
  const dragDistance = Math.max(1, dragStartY - dragEndY);
  const desktopViewport = (before.visual?.viewport?.width ?? 0) >= 720;
  if (desktopViewport) {
    await page.mouse.move(scroll.viewport.centerX, scroll.viewport.centerY);
    const wheelDelta = Math.max(scroll.maxOffset * 4, dragDistance);
    await page.mouse.wheel(0, wheelDelta);
    await page.mouse.wheel(0, wheelDelta);
    await page.waitForTimeout(200);
    const desktopAfter = await readDiagnostics(page);
    if ((desktopAfter.visual?.overlayUi?.scroll?.offset ?? 0) < scroll.maxOffset - 1) {
      throw new Error(`Desktop overlay wheel did not reach bottom: offset=${desktopAfter.visual?.overlayUi?.scroll?.offset ?? 0} max=${scroll.maxOffset}`);
    }
  } else {
    const dragCount = Math.max(1, Math.ceil(scroll.maxOffset / dragDistance));
    for (let index = 0; index < dragCount; index += 1) {
      await page.mouse.move(scroll.track.centerX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(scroll.track.centerX, dragEndY, { steps: 8 });
      await page.mouse.up();
    }
  }
  await page.waitForFunction(
    ({ visualAttribute }) => {
      const raw = document.documentElement.getAttribute(visualAttribute);
      if (!raw) {
        return false;
      }

      try {
        const visual = JSON.parse(raw);
        const current = visual?.overlayUi?.scroll;
        return current?.enabled === true
          && Number.isFinite(current?.maxOffset)
          && Number.isFinite(current?.offset)
          && current.offset >= current.maxOffset - 1;
      } catch {
        return false;
      }
    },
    { visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE },
    { timeout: timeoutMs }
  );
  return readDiagnostics(page);
};

const collectTextBoundsIssues = (surfaceId, surface, viewport) => {
  if (surface?.skipped === true) {
    return [];
  }

  const tolerance = 1.5;
  return collectTextLabelEntries(surface)
    .flatMap((entry) => {
      const text = typeof entry?.text === 'string' ? entry.text.replace(/\s+/g, ' ').trim() : '';
      const label = text.length > 0 ? text : '<empty>';
      const bounds = entry?.bounds;
      if (!isFiniteBounds(bounds) || bounds.width <= 0 || bounds.height <= 0) {
        return [`${surfaceId}:${label}:missing-or-empty-bounds`];
      }
      const escaped = [];
      if (bounds.left < -tolerance) {
        escaped.push(`left=${bounds.left.toFixed(1)}`);
      }
      if (bounds.right > viewport.width + tolerance) {
        escaped.push(`right=${bounds.right.toFixed(1)}>${viewport.width}`);
      }
      if (bounds.top < -tolerance) {
        escaped.push(`top=${bounds.top.toFixed(1)}`);
      }
      if (bounds.bottom > viewport.height + tolerance) {
        escaped.push(`bottom=${bounds.bottom.toFixed(1)}>${viewport.height}`);
      }
      return escaped.length > 0 ? [`${surfaceId}:${label}:${escaped.join(',')}`] : [];
    });
};

const collectNativeInputBoundsIssues = (surfaceId, surface, viewport) => {
  if (surface?.skipped === true) {
    return [];
  }

  const tolerance = 1.5;
  return collectNativeInputEntries(surface)
    .flatMap((entry) => {
      const label = entry?.field || entry?.placeholder || '<input>';
      const bounds = entry?.bounds;
      if (!isFiniteBounds(bounds) || bounds.width <= 0 || bounds.height <= 0) {
        return [`${surfaceId}:${label}:missing-or-empty-native-bounds`];
      }
      const escaped = [];
      if (bounds.left < -tolerance) {
        escaped.push(`left=${bounds.left.toFixed(1)}`);
      }
      if (bounds.right > viewport.width + tolerance) {
        escaped.push(`right=${bounds.right.toFixed(1)}>${viewport.width}`);
      }
      if (bounds.top < -tolerance) {
        escaped.push(`top=${bounds.top.toFixed(1)}`);
      }
      if (bounds.bottom > viewport.height + tolerance) {
        escaped.push(`bottom=${bounds.bottom.toFixed(1)}>${viewport.height}`);
      }
      return escaped.length > 0 ? [`${surfaceId}:${label}:${escaped.join(',')}`] : [];
    });
};

const rectIntersectionArea = (a, b) => {
  if (!isFiniteBounds(a) || !isFiniteBounds(b)) {
    return 0;
  }

  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const normalizeLabelText = (entry) => (
  typeof entry?.text === 'string' ? entry.text.replace(/\s+/g, ' ').trim() : ''
);

const collectTextOverlapIssues = (surfaceId, surface) => {
  if (surface?.skipped === true) {
    return [];
  }

  const entries = collectTextLabelEntries(surface)
    .filter((entry) => normalizeLabelText(entry).length > 0 && isFiniteBounds(entry?.bounds));
  const issues = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const leftText = normalizeLabelText(left);
      const rightText = normalizeLabelText(right);
      const overlapArea = rectIntersectionArea(left.bounds, right.bounds);
      if (overlapArea <= 2) {
        continue;
      }

      const smallestArea = Math.max(1, Math.min(
        left.bounds.width * left.bounds.height,
        right.bounds.width * right.bounds.height
      ));
      const overlapRatio = overlapArea / smallestArea;
      if (overlapRatio < 0.08) {
        continue;
      }

      const sameText = leftText === rightText;
      const nearSamePosition = Math.abs(left.bounds.left - right.bounds.left) < 2
        && Math.abs(left.bounds.top - right.bounds.top) < 2;
      if (sameText && nearSamePosition) {
        continue;
      }

      issues.push(`${surfaceId}:${leftText}<->${rightText}:overlap=${overlapRatio.toFixed(2)}`);
    }
  }
  return issues;
};

const collectMenuControlSpacingIssues = (surface) => {
  if (surface?.skipped === true || surface?.mode !== 'menu' || surface?.overlay !== 'none') {
    return [];
  }

  const layout = surface.layout;
  const badge = surface.progressionBadge;
  if (!layout || !badge?.bounds || !Number.isFinite(layout.buttonHeight)) {
    return [];
  }

  const buttonCenterY = Number.isFinite(layout.leftButtonY) && Number.isFinite(layout.rightButtonY)
    ? Math.min(layout.leftButtonY, layout.rightButtonY)
    : layout.centerButtonY;
  if (!Number.isFinite(buttonCenterY)) {
    return [];
  }

  const buttonTop = buttonCenterY - (layout.buttonHeight / 2);
  const badgeGap = buttonTop - badge.bounds.bottom;
  return badgeGap < 10
    ? [`menu:progressionBadge-to-buttons-gap=${badgeGap.toFixed(1)}<10`]
    : [];
};

const collectProgressionBadgeGeometryIssues = (surfaceId, surface, viewport) => {
  if (surface?.skipped === true || surface?.overlay !== 'none') {
    return [];
  }

  const badge = surface.progressionBadge?.bounds;
  const board = surface.board?.bounds;
  if (!isFiniteBounds(badge) || !isFiniteBounds(board)) {
    return [`${surfaceId}:missing-progression-badge-or-board-bounds`];
  }

  const issues = [];
  if (badge.left < -1 || badge.right > viewport.width + 1 || badge.top < -1 || badge.bottom > viewport.height + 1) {
    issues.push(`${surfaceId}:progression-badge-outside-viewport`);
  }

  const portraitPlay = surface.mode === 'play' && viewport.height > viewport.width;
  if (!portraitPlay && Math.abs(badge.width - board.width) > 1) {
    issues.push(`${surfaceId}:progression-badge-width=${badge.width.toFixed(1)}!=board=${board.width.toFixed(1)}`);
  }
  if (surface.mode === 'menu') {
    const mazeGap = badge.top - board.bottom;
    if (mazeGap < 4) {
      issues.push(`${surfaceId}:board-to-progression-badge-gap=${mazeGap.toFixed(1)}<4`);
    }
  }
  if (portraitPlay) {
    if (Math.abs(badge.centerX - (viewport.width / 2)) > 1) {
      issues.push(`${surfaceId}:progression-badge-not-centered`);
    }
    const pause = surface.touchControls?.controls?.pause;
    if (isFiniteBounds(pause) && pause.left - badge.right < 4) {
      issues.push(`${surfaceId}:progression-badge-to-pause-gap=${(pause.left - badge.right).toFixed(1)}<4`);
    }
  }
  return issues;
};

const collectOverlayScrollAffordanceIssues = (surfaceId, surface) => {
  if (surface?.skipped === true) {
    return [];
  }

  const scroll = surface.overlayUi?.scroll;
  if (!scroll) {
    return [`${surfaceId}:missing-scroll-diagnostics`];
  }

  const requiredRects = [
    ['viewport', scroll.viewport],
    ['track', scroll.track],
    ['thumb', scroll.thumb]
  ];
  const rectIssues = requiredRects.flatMap(([name, rect]) => {
    if (!isFiniteBounds(rect) || rect.width <= 0 || rect.height <= 0) {
      return [`${surfaceId}:${name}:missing-or-empty-scroll-rect`];
    }
    return [];
  });
  if (rectIssues.length > 0) {
    return rectIssues;
  }

  const trackContainsThumb = scroll.thumb.top >= scroll.track.top - 1.5
    && scroll.thumb.bottom <= scroll.track.bottom + 1.5
    && scroll.thumb.left >= scroll.track.left - 4
    && scroll.thumb.right <= scroll.track.right + 4;
  return trackContainsThumb
    ? []
    : [`${surfaceId}:thumb-outside-track`];
};

const collectOverlayScrollBottomIssues = (surfaceId, surface, expectedLabels) => {
  if (surface?.skipped === true) {
    return [];
  }

  const scroll = surface.overlayUi?.scroll;
  if (!scroll || !Number.isFinite(scroll.maxOffset) || !Number.isFinite(scroll.offset)) {
    return [`${surfaceId}:missing-scroll-bottom-diagnostics`];
  }
  if (scroll.enabled !== true && scroll.maxOffset === 0) {
    return hasTextLabels(surface, expectedLabels)
      ? []
      : [`${surfaceId}:non-scrollable-missing-labels=${expectedLabels.join(',')}`];
  }
  if (scroll.enabled !== true) {
    return [`${surfaceId}:missing-scroll-bottom-diagnostics`];
  }
  if (scroll.offset < scroll.maxOffset - 1) {
    return [`${surfaceId}:offset=${scroll.offset.toFixed(1)}<max=${scroll.maxOffset.toFixed(1)}`];
  }
  return hasTextLabels(surface, expectedLabels)
    ? []
    : [`${surfaceId}:missing-bottom-labels=${expectedLabels.join(',')}`];
};

const collectButtonLabelContainmentIssues = (surfaceId, surface) => (surface?.buttons ?? []).flatMap((button) => {
  if (!isFiniteBounds(button?.bounds) || !isFiniteBounds(button?.labelBounds)) {
    return [`${surfaceId}:${button?.text ?? 'unknown'}:missing-button-label-bounds`];
  }
  const edgeTolerance = 1.5;
  const issues = button.labelBounds.left < button.bounds.left - edgeTolerance
    || button.labelBounds.right > button.bounds.right + edgeTolerance
    || button.labelBounds.top < button.bounds.top - edgeTolerance
    || button.labelBounds.bottom > button.bounds.bottom + edgeTolerance
    ? [`${surfaceId}:${button.text}:label-outside-button`]
    : [];
  const actionLabels = new Set([
    'Account',
    'Back',
    'Create Account',
    'Log out',
    'Login',
    'Menu',
    'Options',
    'Reset',
    'Reset Progress',
    'Start'
  ]);
  if (actionLabels.has(button.text)) {
    const buttonCenterY = (button.bounds.top + button.bounds.bottom) / 2;
    const labelCenterY = (button.labelBounds.top + button.labelBounds.bottom) / 2;
    if (Math.abs(labelCenterY - buttonCenterY) > 6) {
      issues.push(`${surfaceId}:${button.text}:label-center-delta=${(labelCenterY - buttonCenterY).toFixed(1)}`);
    }
  }
  return issues;
});

const isGuideLabel = (text) => [
  'PLAYER GUIDE',
  'Compass',
  'points to End',
  'Start',
  'run begins',
  'End',
  'clear here'
].includes(text) || text.includes('Player:') || text.includes('Rank:') || text.includes('Score:') || text.includes('Maze Lvl:');

const collectGuideTextContainmentIssues = (surfaceId, surface) => {
  const guide = surface?.overlayUi?.guidePanel;
  if (!isFiniteBounds(guide)) {
    return surface?.skipped === true ? [] : [`${surfaceId}:missing-guide-panel-bounds`];
  }
  return collectTextLabelEntries(surface)
    .filter((entry) => isGuideLabel(String(entry?.text ?? '')))
    .flatMap((entry) => {
      const bounds = entry?.bounds;
      if (!isFiniteBounds(bounds)) {
        return [`${surfaceId}:${entry?.text ?? 'unknown'}:missing-guide-label-bounds`];
      }
      const edgeTolerance = 1.5;
      return bounds.left < guide.left - edgeTolerance
        || bounds.right > guide.right + edgeTolerance
        || bounds.top < guide.top - edgeTolerance
        || bounds.bottom > guide.bottom + edgeTolerance
        ? [`${surfaceId}:${entry.text}:outside-guide-panel`]
        : [];
    });
};

const seedTopologyFixture = async (page, fixture) => {
  if (fixture !== 'wrap-enabled') {
    return;
  }

  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      aiRunnerBaselineVersion: 3,
      updatedAt: null,
      tracks: {
        player: { targetComplexity: 70 },
        'ai-runner': { targetComplexity: 70 }
      }
    }));
  }, {
    storageKey: WRAP_TOPOLOGY_PROGRESSION_STORAGE_KEY
  });
};

const collectWrapTopologyDiagnosticIssues = (surfaceId, surface, { requirePairs = false } = {}) => {
  const maze = surface?.generation?.maze;
  if (maze?.source === 'menu-snapshot') {
    return [];
  }

  const diagnostics = maze?.wrapTopologyDiagnostics;
  if (!diagnostics) {
    return [`${surfaceId}:missing-wrap-topology-diagnostics`];
  }

  const issues = [];
  if (diagnostics.contractVersion !== 'legacy-wrap-topology-v1') {
    issues.push(`${surfaceId}:contract=${diagnostics.contractVersion ?? 'missing'}`);
  }
  if (diagnostics.graphPolicy !== 'playable-wrap-aware' || diagnostics.solutionPathPolicy !== 'direct-floor') {
    issues.push(`${surfaceId}:policies=${diagnostics.graphPolicy ?? 'missing'}/${diagnostics.solutionPathPolicy ?? 'missing'}`);
  }
  if (diagnostics.graphTopologyValid !== true) {
    issues.push(`${surfaceId}:graphTopologyValid=${diagnostics.graphTopologyValid ?? 'missing'}`);
  }
  if (diagnostics.horizontal?.requiredSatisfied !== true || diagnostics.vertical?.requiredSatisfied !== true) {
    issues.push(`${surfaceId}:requiredAxesUnsatisfied`);
  }
  if (requirePairs && ((diagnostics.horizontal?.pairCount ?? 0) < 1 || (diagnostics.vertical?.pairCount ?? 0) < 1)) {
    issues.push(`${surfaceId}:requiredPairs=${diagnostics.horizontal?.pairCount ?? 'missing'}/${diagnostics.vertical?.pairCount ?? 'missing'}`);
  }
  if ((diagnostics.horizontal?.unpairedEndpointCount ?? -1) !== 0 || (diagnostics.vertical?.unpairedEndpointCount ?? -1) !== 0) {
    issues.push(`${surfaceId}:unpairedEndpoints=${diagnostics.horizontal?.unpairedEndpointCount ?? 'missing'}/${diagnostics.vertical?.unpairedEndpointCount ?? 'missing'}`);
  }
  if ((diagnostics.cornerBorderFloorCount ?? -1) !== 0 || (diagnostics.inwardDisconnectedEndpointCount ?? -1) !== 0) {
    issues.push(`${surfaceId}:unsafeEndpoints=${diagnostics.cornerBorderFloorCount ?? 'missing'}/${diagnostics.inwardDisconnectedEndpointCount ?? 'missing'}`);
  }
  if (diagnostics.solutionRouteAudit?.validCompletedRoute !== true || diagnostics.solutionRouteAudit?.lowerBoundSatisfied !== true) {
    issues.push(`${surfaceId}:solutionRouteAuditFailed`);
  }
  return issues;
};

const collectCyberArcadeMaterialIssues = (surfaceId, surface) => {
  if (surface?.skipped === true) {
    return [];
  }

  const material = surface?.materialSystem;
  if (!material) {
    return [`${surfaceId}:missing-material-system`];
  }

  const issues = [];
  const expectedRoles = [
    'background',
    'maze',
    'path',
    'trail',
    'player',
    'title',
    'border',
    'button',
    'compass',
    'overlay'
  ];
  const missingRoles = expectedRoles.filter((role) => !material.surfaceRoles?.includes(role));
  if (material.version !== 'mazer-cyber-arcade-material-v1') {
    issues.push(`${surfaceId}:version=${material.version ?? 'missing'}`);
  }
  if (material.iconTarget !== 'public/icons/mazer-app-icon.png') {
    issues.push(`${surfaceId}:iconTarget=${material.iconTarget ?? 'missing'}`);
  }
  if (material.iconQualityTargetVersion !== 'mazer-icon-quality-target-v1') {
    issues.push(`${surfaceId}:iconQualityTargetVersion=${material.iconQualityTargetVersion ?? 'missing'}`);
  }
  if (material.iconTargetSha256 !== '91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440') {
    issues.push(`${surfaceId}:iconTargetSha256=${material.iconTargetSha256 ?? 'missing'}`);
  }
  if (missingRoles.length > 0) {
    issues.push(`${surfaceId}:missingRoles=${missingRoles.join(',')}`);
  }
  if (
    material.geometry?.fillAlignment !== 'integer-logical-pixels'
    || material.geometry?.strokeAlignment !== 'half-pixel-centered'
    || material.geometry?.backingScale !== 'dpr-aware-capped-2'
    || material.geometry?.sharedPanelBounds !== 'snapped-at-draw-boundary'
  ) {
    issues.push(`${surfaceId}:geometry=${JSON.stringify(material.geometry ?? null)}`);
  }
  return issues;
};

const buildSurfaceChecks = ({
  consoleMessages,
  includeOverlayBottom = true,
  pageErrors,
  requirePlayTrailSeed = true,
  requireTopologyDiagnostics = true,
  requireWrapPairs = false,
  surfaces,
  viewport
}) => {
  const hasLabels = (surface, expectedLabels) => hasTextLabels(surface, expectedLabels);
  const labelDetail = (surface) => collectTextLabels(surface)
    .join(', ');
  const authGated = surfaces.menu.authGated === true;
  const authenticatedMenu = surfaces.menu.authStatus === 'authenticated' || hasTextLabels(surfaces.options, ['Log out']);
  const optionsExpectedLabels = resolveOptionsExpectedLabels(authenticatedMenu);
  const textBoundsIssues = [
    ...collectTextBoundsIssues('menu', surfaces.menu, viewport),
    ...collectTextBoundsIssues('auth', surfaces.auth, viewport),
    ...collectTextBoundsIssues('options', surfaces.options, viewport),
    ...collectTextBoundsIssues('options-bottom', surfaces.optionsBottom, viewport),
    ...collectTextBoundsIssues('play', surfaces.play, viewport),
    ...collectTextBoundsIssues('pause', surfaces.pause, viewport),
    ...collectTextBoundsIssues('pause-bottom', surfaces.pauseBottom, viewport)
  ];
  const nativeInputBoundsIssues = [
    ...collectNativeInputBoundsIssues('menu', surfaces.menu, viewport),
    ...collectNativeInputBoundsIssues('auth', surfaces.auth, viewport),
    ...collectNativeInputBoundsIssues('options', surfaces.options, viewport),
    ...collectNativeInputBoundsIssues('options-bottom', surfaces.optionsBottom, viewport),
    ...collectNativeInputBoundsIssues('play', surfaces.play, viewport),
    ...collectNativeInputBoundsIssues('pause', surfaces.pause, viewport),
    ...collectNativeInputBoundsIssues('pause-bottom', surfaces.pauseBottom, viewport)
  ];
  const textOverlapIssues = [
    ...collectTextOverlapIssues('menu', surfaces.menu),
    ...collectTextOverlapIssues('auth', surfaces.auth),
    ...collectTextOverlapIssues('options', surfaces.options),
    ...collectTextOverlapIssues('options-bottom', surfaces.optionsBottom),
    ...collectTextOverlapIssues('play', surfaces.play),
    ...collectTextOverlapIssues('pause', surfaces.pause),
    ...collectTextOverlapIssues('pause-bottom', surfaces.pauseBottom)
  ];
  const controlSpacingIssues = [
    ...collectMenuControlSpacingIssues(surfaces.menu)
  ];
  const badgeGeometryIssues = [
    ...collectProgressionBadgeGeometryIssues('menu', surfaces.menu, viewport),
    ...collectProgressionBadgeGeometryIssues('play', surfaces.play, viewport)
  ];
  const overlayScrollIssues = [
    ...collectOverlayScrollAffordanceIssues('options', surfaces.options),
    ...collectOverlayScrollAffordanceIssues('pause', surfaces.pause)
  ];
  const overlayScrollBottomIssues = includeOverlayBottom ? [
    ...collectOverlayScrollBottomIssues('options-bottom', surfaces.optionsBottom, ['Controls']),
    ...collectOverlayScrollBottomIssues('pause-bottom', surfaces.pauseBottom, ['Move Speed', 'Reset Progress', 'Reset', 'Menu'])
  ] : [];
  const buttonLabelContainmentIssues = [
    ...collectButtonLabelContainmentIssues('menu', surfaces.menu),
    ...collectButtonLabelContainmentIssues('auth', surfaces.auth),
    ...collectButtonLabelContainmentIssues('options', surfaces.options),
    ...collectButtonLabelContainmentIssues('options-bottom', surfaces.optionsBottom),
    ...collectButtonLabelContainmentIssues('play', surfaces.play),
    ...collectButtonLabelContainmentIssues('pause', surfaces.pause),
    ...collectButtonLabelContainmentIssues('pause-bottom', surfaces.pauseBottom)
  ];
  const guideTextContainmentIssues = [
    ...collectGuideTextContainmentIssues('options', surfaces.options),
    ...collectGuideTextContainmentIssues('pause', surfaces.pause)
  ];
  const wrapTopologyDiagnosticIssues = requireTopologyDiagnostics ? [
    ...collectWrapTopologyDiagnosticIssues('menu', surfaces.menu, { requirePairs: requireWrapPairs }),
    ...collectWrapTopologyDiagnosticIssues('play', surfaces.play, { requirePairs: requireWrapPairs })
  ] : [];
  const materialSystemIssues = Object.entries(surfaces).flatMap(([surfaceId, surface]) => (
    collectCyberArcadeMaterialIssues(surfaceId, surface)
  ));
  const menuTitle = surfaces.menu.title;
  const badgeFitIssues = [
    ['menu', surfaces.menu],
    ['play', surfaces.play]
  ].flatMap(([id, surface]) => {
    const badge = surface.progressionBadge;
    return badge?.text && badge.textFits !== true
      ? [`${id}:progressionBadge textFits=${badge.textFits}`]
      : [];
  });
  const surfaceChecks = [
    createCheck(
      'menu-surface',
      surfaces.menu.mode === 'menu' && surfaces.menu.overlay === 'none',
      `menu mode=${surfaces.menu.mode ?? 'missing'} overlay=${surfaces.menu.overlay ?? 'missing'}`
    ),
    createCheck(
      'options-surface',
      authGated
        ? surfaces.options.skipped === true
        : surfaces.options.mode === 'menu' && surfaces.options.overlay === 'options',
      authGated
        ? `skipped=${surfaces.options.skipped === true} reason=${surfaces.options.reason ?? 'missing'}`
        : `options mode=${surfaces.options.mode ?? 'missing'} overlay=${surfaces.options.overlay ?? 'missing'}`
    ),
    createCheck(
      'auth-surface',
      authGated
        ? surfaces.auth.mode === 'menu' && surfaces.auth.overlay === 'auth'
        : surfaces.auth.skipped === true,
      authGated
        ? `auth mode=${surfaces.auth.mode ?? 'missing'} overlay=${surfaces.auth.overlay ?? 'missing'}`
        : `skipped=${surfaces.auth.skipped === true} reason=${surfaces.auth.reason ?? 'missing'}`
    ),
    createCheck(
      'play-surface',
      surfaces.play.mode === 'play' && surfaces.play.overlay === 'none',
      `play mode=${surfaces.play.mode ?? 'missing'} overlay=${surfaces.play.overlay ?? 'missing'}`
    ),
    createCheck(
      'pause-surface',
      surfaces.pause.mode === 'play' && surfaces.pause.overlay === 'pause',
      `pause mode=${surfaces.pause.mode ?? 'missing'} overlay=${surfaces.pause.overlay ?? 'missing'}`
    )
  ];
  const pathStyleSurfaceIds = authGated ? ['menu', 'play', 'pause'] : ['menu', 'options', 'play', 'pause'];
  const pathStyleChecks = pathStyleSurfaceIds.map((id) => createCheck(
    `${id}-path-style`,
    surfaces[id].board?.pathVisualStyle === 'corridor',
    `${id} pathVisualStyle=${surfaces[id].board?.pathVisualStyle ?? 'missing'} expected=corridor`
  ));
  const trailShineChecks = ['menu', 'play'].map((id) => createCheck(
    `${id}-trail-shine-white`,
    !requirePlayTrailSeed || (
      surfaces[id].markerStyle?.trailShineColor === EXPECTED_TRAIL_SHINE_COLOR
      && surfaces[id].markerStyle?.trailShineEdgeColor === EXPECTED_TRAIL_SHINE_EDGE_COLOR
    ),
    requirePlayTrailSeed
      ? `shine=${surfaces[id].markerStyle?.trailShineColor ?? 'missing'} edge=${surfaces[id].markerStyle?.trailShineEdgeColor ?? 'missing'}`
      : 'skipped for focused topology proof'
  ));
  const playChecks = [
    createCheck(
      'play-player-green',
      surfaces.play.markerStyle?.playerCoreColor === EXPECTED_PLAYER_CORE_COLOR,
      `playerCoreColor=${surfaces.play.markerStyle?.playerCoreColor ?? 'missing'}`
    ),
    createCheck(
      'play-goal-red',
      surfaces.play.markerStyle?.goalCoreColor === EXPECTED_GOAL_CORE_COLOR,
      `goalCoreColor=${surfaces.play.markerStyle?.goalCoreColor ?? 'missing'}`
    ),
    createCheck(
      'play-stick-controls',
      surfaces.play.touchControls?.visible === true && surfaces.play.touchControls?.controlMode === 'stick',
      `visible=${surfaces.play.touchControls?.visible ?? 'missing'} controlMode=${surfaces.play.touchControls?.controlMode ?? 'missing'}`
    ),
    createCheck(
      'play-trail-shine-seeded-on',
      !requirePlayTrailSeed || surfaces.play.markerStyle?.trailShineEnabled === true,
      requirePlayTrailSeed
        ? `trailShineEnabled=${surfaces.play.markerStyle?.trailShineEnabled ?? 'missing'}`
        : 'skipped for focused topology proof'
    )
  ];
  const textChecks = [
    createCheck(
      'menu-text-labels',
      authGated ? hasLabels(surfaces.menu, ['Login']) : hasLabels(surfaces.menu, ['Start', 'Options']),
      `labels=${labelDetail(surfaces.menu)}`
    ),
    createCheck(
      'menu-title-readable',
      menuTitle?.visible === true && menuTitle?.progressPercent >= 95,
      `visible=${menuTitle?.visible ?? 'missing'} progress=${menuTitle?.progressPercent ?? 'missing'}`
    ),
    createCheck(
      'options-text-labels',
      authGated
        ? surfaces.options.skipped === true
        : hasLabels(surfaces.options, optionsExpectedLabels)
          && !hasLabels(surfaces.options, ['Game Toggles', 'Maze Scale', 'Camera Scale']),
      authGated
        ? `skipped=${surfaces.options.skipped === true} reason=${surfaces.options.reason ?? 'missing'}`
        : `labels=${labelDetail(surfaces.options)}`
    ),
    createCheck(
      'auth-text-labels',
      authGated
        ? hasLabels(surfaces.auth, ['Account', 'Login', 'Create Account', 'Reset Password'])
        : surfaces.auth.skipped === true,
      authGated
        ? `labels=${labelDetail(surfaces.auth)}`
        : `skipped=${surfaces.auth.skipped === true} reason=${surfaces.auth.reason ?? 'missing'}`
    ),
    createCheck(
      'play-text-labels',
      hasLabels(surfaces.play, ['PAUSE']) && !hasLabels(surfaces.play, ['RESET']),
      `labels=${labelDetail(surfaces.play)}`
    ),
    createCheck(
      'pause-text-labels',
      hasLabels(surfaces.pause, ['Paused', 'PLAYER GUIDE', 'Reset', 'Menu'])
        && !hasLabels(surfaces.pause, ['Game Toggles', 'Account', 'Resume']),
      `labels=${labelDetail(surfaces.pause)}`
    ),
    createCheck(
      'mobile-text-label-bounds',
      textBoundsIssues.length === 0,
      textBoundsIssues.length === 0 ? 'all active text labels stay inside viewport' : textBoundsIssues.join('; ')
    ),
    createCheck(
      'mobile-native-input-bounds',
      nativeInputBoundsIssues.length === 0,
      nativeInputBoundsIssues.length === 0 ? 'active native inputs stay inside viewport' : nativeInputBoundsIssues.join('; ')
    ),
    createCheck(
      'mobile-text-overlap',
      textOverlapIssues.length === 0,
      textOverlapIssues.length === 0 ? 'active text labels do not collide' : textOverlapIssues.join('; ')
    ),
    createCheck(
      'mobile-control-spacing',
      controlSpacingIssues.length === 0,
      controlSpacingIssues.length === 0 ? 'menu controls keep readable spacing' : controlSpacingIssues.join('; ')
    ),
    createCheck(
      'mobile-badge-text-fit',
      badgeFitIssues.length === 0,
      badgeFitIssues.length === 0 ? 'visible progression badges fit their chrome' : badgeFitIssues.join('; ')
    ),
    createCheck(
      'progression-badge-geometry',
      badgeGeometryIssues.length === 0,
      badgeGeometryIssues.length === 0 ? 'progression badges respect maze width, viewport, and pause lanes' : badgeGeometryIssues.join('; ')
    ),
    createCheck(
      'mobile-overlay-scroll-affordance',
      overlayScrollIssues.length === 0,
      overlayScrollIssues.length === 0 ? 'options and pause expose scroll viewport, rail, and thumb diagnostics' : overlayScrollIssues.join('; ')
    ),
    createCheck(
      'mobile-overlay-scroll-reachability',
      overlayScrollBottomIssues.length === 0,
      overlayScrollBottomIssues.length === 0 ? 'options and pause bottom controls are reached through real scroll input' : overlayScrollBottomIssues.join('; ')
    ),
    createCheck(
      'button-label-containment',
      buttonLabelContainmentIssues.length === 0,
      buttonLabelContainmentIssues.length === 0 ? 'button labels remain inside their interactive chrome' : buttonLabelContainmentIssues.join('; ')
    ),
    createCheck(
      'guide-text-containment',
      guideTextContainmentIssues.length === 0,
      guideTextContainmentIssues.length === 0 ? 'guide copy remains inside the guide panel' : guideTextContainmentIssues.join('; ')
    ),
    createCheck(
      'wrap-topology-diagnostics',
      wrapTopologyDiagnosticIssues.length === 0,
      !requireTopologyDiagnostics
        ? 'skipped for focused material and layout proof'
        : wrapTopologyDiagnosticIssues.length === 0
        ? 'generated menu/play topology is paired, connected, and route-lower-bound valid'
        : wrapTopologyDiagnosticIssues.join('; ')
    ),
    createCheck(
      'cyber-arcade-material-system',
      materialSystemIssues.length === 0,
      materialSystemIssues.length === 0
        ? 'all captured surfaces publish the icon-aligned material and pixel-geometry contract'
        : materialSystemIssues.join('; ')
    )
  ];
  const runtimeChecks = [
    createCheck(
      'console-clean',
      consoleMessages.length === 0,
      `${consoleMessages.length} console warnings/errors`
    ),
    createCheck(
      'page-errors-clean',
      pageErrors.length === 0,
      `${pageErrors.length} page errors`
    )
  ];

  return [
    ...surfaceChecks,
    ...pathStyleChecks,
    ...trailShineChecks,
    ...playChecks,
    ...textChecks,
    ...runtimeChecks
  ];
};

const buildViewportTransitionChecks = (transitions) => Object.entries(transitions ?? {}).flatMap(([surfaceId, transition]) => [
  createCheck(
    `${surfaceId}-transition-restored-diagnostics`,
    transition.restoredDiagnosticsMatch === true,
    transition.restoredDiagnosticsMatch === true
      ? 'canonical diagnostics restored after desktop transition'
      : 'canonical diagnostics changed after desktop transition'
  ),
  createCheck(
    `${surfaceId}-transition-layout`,
    transition.layoutIssues.length === 0,
    transition.layoutIssues.length === 0
      ? 'no text/input bounds or text collisions across transition endpoints'
      : transition.layoutIssues.join('; ')
  )
]);

const buildMarkdownReport = (summary) => {
  const checkRows = summary.checks
    .map((check) => `| ${check.id} | ${check.passed ? 'pass' : 'fail'} | ${check.detail.replace(/\|/g, '\\|')} |`)
    .join('\n');

  return [
    `# ${summary.label}`,
    '',
    `- Pass: ${summary.pass ? 'yes' : 'no'}`,
    `- Target: ${summary.targetUrl}`,
    `- Viewport: ${summary.viewport.width}x${summary.viewport.height} @ ${summary.deviceScaleFactor}x DPR`,
    `- Auth fixture: ${summary.authFixture ?? 'none'}`,
    `- Topology fixture: ${summary.topologyFixture ?? 'none'}`,
    `- Repo commit: ${summary.repo.commit}`,
    `- Dirty worktree: ${summary.repo.dirty ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    checkRows,
    '',
    '## Screenshots',
    '',
    `![Menu](${summary.screenshots.menu})`,
    '',
    summary.screenshots.auth
      ? `![Auth](${summary.screenshots.auth})`
      : '_Auth capture skipped because the captured session is already authenticated._',
    '',
    summary.screenshots.options
      ? `![Options](${summary.screenshots.options})`
      : '_Options capture skipped because the menu is auth-gated in the captured session._',
    '',
    summary.screenshots.optionsBottom
      ? `![Options bottom](${summary.screenshots.optionsBottom})`
      : '_Options bottom capture skipped because the menu is auth-gated in the captured session._',
    '',
    `![Play](${summary.screenshots.play})`,
    '',
    `![Pause](${summary.screenshots.pause})`,
    '',
    `![Pause bottom](${summary.screenshots.pauseBottom})`,
    ''
  ].join('\n');
};

export const runUiSurfaceCapture = async (options = {}) => {
  const label = options.label ?? DEFAULT_LABEL;
  const sessionId = resolveSessionId(options.sessionId);
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = resolve(artifactRoot, sessionId);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const transition = options.transition
    ? {
      ...DEFAULT_TRANSITION_VIEWPORTS,
      ...options.transition,
      outputDir
    }
    : null;
  const viewport = transition?.initial ?? options.viewport ?? DEFAULT_VIEWPORT;
  const deviceScaleFactor = options.deviceScaleFactor ?? DEFAULT_DEVICE_SCALE_FACTOR;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const authFixture = typeof options.authFixture === 'string' ? options.authFixture : undefined;
  const topologyFixture = typeof options.topologyFixture === 'string' ? options.topologyFixture : undefined;
  const route = options.route ?? resolveRoute({
    authFixture,
    route: DEFAULT_ROUTE,
    label,
    mazeSeed: options.mazeSeed
  });
  const consoleMessages = [];
  const pageErrors = [];

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

  try {
    const mobileViewport = viewport.width < 720;
    const context = await browser.newContext({
      deviceScaleFactor,
      hasTouch: transition ? false : mobileViewport,
      isMobile: transition ? false : mobileViewport,
      viewport
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      const entry = {
        type: message.type(),
        text: message.text()
      };
      if (['error', 'warning'].includes(entry.type) && !isIgnorableConsoleMessage(entry)) {
        consoleMessages.push(entry);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await seedPreferences(page, {
      controlMode: 'stick',
      darkMode: false,
      movementSpeed: 0.38,
      toggleAnimatedBackdrop: true,
      toggleCameraFollow: true,
      toggleTrailFade: true,
      toggleTrailPulse: true
    });
    await seedTopologyFixture(page, topologyFixture);

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
    if (authFixture === 'authenticated') {
      await waitForAuthenticatedFixtureReady(page, { timeoutMs });
    }
    await waitForVisualBuildSettled(page, {
      requireReadableTitle: true,
      timeoutMs
    });
    const menu = await captureSurface({
      page,
      outputDir,
      expectedLabels: [],
      id: '01-menu',
      mode: 'menu',
      overlay: 'none',
      route,
      timeoutMs,
      viewport
    });
    const menuTransition = transition
      ? await captureViewportTransition({
        id: '01-menu', mode: 'menu', overlay: 'none', page, route, timeoutMs, transition
      })
      : null;
    const authGatedMenu = isAuthGatedMenuSurface(menu.diagnostics.visual);
    const authenticatedMenu = authFixture === 'authenticated' || menu.diagnostics.runtime?.auth?.status === 'authenticated';
    const optionsExpectedLabels = resolveOptionsExpectedLabels(authenticatedMenu);
    const currentMenuDiagnostics = transition ? await readDiagnostics(page) : menu.diagnostics;
    const menuButtons = authGatedMenu ? null : getMenuButtonPoints(currentMenuDiagnostics.visual);
    await waitForVisualBuildSettled(page, { timeoutMs });
    const authSurface = authGatedMenu
      ? await (async () => {
        await openAuthOverlayFromMenu(page, timeoutMs);
        const captured = await captureSurface({
          page,
          outputDir,
          expectedLabels: ['Account', 'Login', 'Create Account', 'Reset Password'],
          id: '02-auth',
          mode: 'menu',
          overlay: 'auth',
          route,
          timeoutMs,
          viewport
        });
        captured.transition = transition
          ? await captureViewportTransition({
            id: '02-auth', mode: 'menu', overlay: 'auth', page, route, timeoutMs, transition
          })
          : null;
        return captured;
      })()
      : {
        diagnostics: {
          runtime: null,
          visual: null
        },
        screenContract: null,
        screenshotPath: null,
        skipped: true,
        reason: 'already-authenticated'
      };

    let optionsBottomSurface = null;
    const optionsSurface = authGatedMenu
      ? {
        diagnostics: {
          runtime: null,
          visual: null
        },
        screenContract: null,
        screenshotPath: null,
        skipped: true,
        reason: 'auth-gated-menu'
      }
      : await (async () => {
        await waitForVisualBuildSettled(page, { timeoutMs });
        const optionsCaptureExpectedLabels = [...OPTIONS_BASE_EXPECTED_LABELS];
        if (authFixture === 'authenticated') {
          await openOptionsOverlayViaQa(page, timeoutMs);
        } else {
          const latestMenuDiagnostics = await readDiagnostics(page);
          const latestMenuButtons = getMenuButtonPoints(latestMenuDiagnostics.visual);
          await openOptionsOverlayFromMenu(page, latestMenuButtons.options, optionsCaptureExpectedLabels, timeoutMs);
        }
        const captured = await captureSurface({
          page,
          outputDir,
          expectedLabels: optionsCaptureExpectedLabels,
          id: '02-options',
          mode: 'menu',
          overlay: 'options',
          route,
          skipWait: authFixture === 'authenticated',
          timeoutMs,
          viewport
        });
        captured.transition = transition
          ? await captureViewportTransition({
            id: '02-options', mode: 'menu', overlay: 'options', page, route, timeoutMs, transition
          })
          : null;
        if (transition) {
          optionsBottomSurface = {
            diagnostics: { runtime: null, visual: null },
            nativeInputs: [],
            screenContract: null,
            skipped: true
          };
        } else {
          const optionsScrollResult = await scrollOverlayToBottom(page, { timeoutMs });
          optionsBottomSurface = optionsScrollResult.visual?.overlayUi?.scroll?.enabled === true
            ? await captureSurface({
              page,
              outputDir,
              expectedLabels: ['Controls'],
              id: '02-options-bottom',
              mode: 'menu',
              overlay: 'options',
              route,
              skipWait: true,
              timeoutMs,
              viewport
            })
            : { ...captured, diagnostics: optionsScrollResult };
        }
        await page.keyboard.press('Escape');
        await waitForSurface(page, { mode: 'menu', overlay: 'none', timeoutMs });
        return captured;
      })();

    const playRoute = authGatedMenu ? resolveRouteWithParams(route, { mode: 'play', overlay: null }) : route;
    if (authGatedMenu) {
      await page.goto(new URL(playRoute, resolvedBaseUrl).toString(), { waitUntil: 'networkidle', timeout: timeoutMs });
    } else {
      await waitForVisualBuildSettled(page, { timeoutMs });
      await clickPoint(page, menuButtons.start, 'Start');
    }
    await waitForVisualBuildSettled(page, { timeoutMs });
    const playTrailSeed = options.skipPlayTrailSeed
      ? {
        accepted: false,
        attemptedMoves: 0,
        reason: 'focused-topology-proof',
        skipped: true
      }
      : await seedPlayTrailForVisualProof(page, { timeoutMs });
    const play = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['PAUSE'],
      id: '03-play',
      mode: 'play',
      overlay: 'none',
      route: playRoute,
      timeoutMs,
      viewport
    });
    const playTransition = transition
      ? await captureViewportTransition({
        id: '03-play', mode: 'play', overlay: 'none', page, route: playRoute, timeoutMs, transition
      })
      : null;

    const currentPlayDiagnostics = transition ? await readDiagnostics(page) : play.diagnostics;
    await clickPoint(page, getPauseButtonPoint(currentPlayDiagnostics.visual), 'Pause');
    const pause = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['Paused', 'PLAYER GUIDE', 'Reset', 'Menu'],
      id: '04-pause',
      mode: 'play',
      overlay: 'pause',
      route: playRoute,
      timeoutMs,
      viewport
    });
    const pauseTransition = transition
      ? await captureViewportTransition({
        id: '04-pause', mode: 'play', overlay: 'pause', page, route: playRoute, timeoutMs, transition
      })
      : null;
    const pauseBottomSurface = transition
      ? { diagnostics: { runtime: null, visual: null }, nativeInputs: [], screenContract: null, skipped: true }
      : await (async () => {
        await scrollOverlayToBottom(page, { timeoutMs });
        return captureSurface({
          page,
          outputDir,
          expectedLabels: ['Move Speed', 'Reset Progress', 'Reset', 'Menu'],
          id: '04-pause-bottom',
          mode: 'play',
          overlay: 'pause',
          route: playRoute,
          skipWait: true,
          timeoutMs,
          viewport
        });
      })();

    const surfaces = {
      menu: {
        mode: menu.diagnostics.visual?.runtime?.mode ?? menu.diagnostics.runtime?.surface?.mode,
        overlay: menu.diagnostics.visual?.runtime?.overlay ?? menu.diagnostics.runtime?.surface?.overlay,
        board: menu.diagnostics.visual?.board,
        layout: menu.diagnostics.visual?.layout,
        markerStyle: menu.diagnostics.visual?.markerStyle,
        progressionBadge: menu.diagnostics.visual?.progressionBadge,
        title: menu.diagnostics.visual?.title,
        generation: menu.diagnostics.runtime?.generation,
        buttons: menu.diagnostics.visual?.buttons,
        nativeInputs: menu.nativeInputs,
        textLabels: menu.diagnostics.visual?.textLabels,
        screenContract: menu.screenContract,
        authGated: authGatedMenu,
        authStatus: menu.diagnostics.runtime?.auth?.status ?? null,
        materialSystem: menu.diagnostics.visual?.materialSystem
      },
      auth: authGatedMenu ? {
        mode: authSurface.diagnostics.visual?.runtime?.mode ?? authSurface.diagnostics.runtime?.surface?.mode,
        overlay: authSurface.diagnostics.visual?.runtime?.overlay ?? authSurface.diagnostics.runtime?.surface?.overlay,
        board: authSurface.diagnostics.visual?.board,
        layout: authSurface.diagnostics.visual?.layout,
        progressionBadge: authSurface.diagnostics.visual?.progressionBadge,
        title: authSurface.diagnostics.visual?.title,
        nativeInputs: authSurface.nativeInputs,
        textLabels: authSurface.diagnostics.visual?.textLabels,
        screenContract: authSurface.screenContract,
        materialSystem: authSurface.diagnostics.visual?.materialSystem
      } : {
        skipped: true,
        reason: 'already-authenticated',
        screenContract: null,
        nativeInputs: [],
        textLabels: []
      },
      options: authGatedMenu ? {
        skipped: true,
        reason: 'auth-gated-menu',
        screenContract: null,
        nativeInputs: [],
        textLabels: []
      } : {
        mode: optionsSurface.diagnostics.visual?.runtime?.mode ?? optionsSurface.diagnostics.runtime?.surface?.mode,
        overlay: optionsSurface.diagnostics.visual?.runtime?.overlay ?? optionsSurface.diagnostics.runtime?.surface?.overlay,
        board: optionsSurface.diagnostics.visual?.board,
        layout: optionsSurface.diagnostics.visual?.layout,
        progressionBadge: optionsSurface.diagnostics.visual?.progressionBadge,
        title: optionsSurface.diagnostics.visual?.title,
        overlayUi: optionsSurface.diagnostics.visual?.overlayUi,
        buttons: optionsSurface.diagnostics.visual?.buttons,
        nativeInputs: optionsSurface.nativeInputs,
        textLabels: optionsSurface.diagnostics.visual?.textLabels,
        screenContract: optionsSurface.screenContract,
        materialSystem: optionsSurface.diagnostics.visual?.materialSystem
      },
      optionsBottom: authGatedMenu ? {
        skipped: true,
        reason: 'auth-gated-menu',
        screenContract: null,
        nativeInputs: [],
        textLabels: []
      } : {
        mode: optionsBottomSurface.diagnostics.visual?.runtime?.mode ?? optionsBottomSurface.diagnostics.runtime?.surface?.mode,
        overlay: optionsBottomSurface.diagnostics.visual?.runtime?.overlay ?? optionsBottomSurface.diagnostics.runtime?.surface?.overlay,
        overlayUi: optionsBottomSurface.diagnostics.visual?.overlayUi,
        buttons: optionsBottomSurface.diagnostics.visual?.buttons,
        nativeInputs: optionsBottomSurface.nativeInputs,
        textLabels: optionsBottomSurface.diagnostics.visual?.textLabels,
        screenContract: optionsBottomSurface.screenContract,
        materialSystem: optionsBottomSurface.diagnostics.visual?.materialSystem
      },
      play: {
        mode: play.diagnostics.visual?.runtime?.mode ?? play.diagnostics.runtime?.surface?.mode,
        overlay: play.diagnostics.visual?.runtime?.overlay ?? play.diagnostics.runtime?.surface?.overlay,
        board: play.diagnostics.visual?.board,
        layout: play.diagnostics.visual?.layout,
        markerStyle: play.diagnostics.visual?.markerStyle,
        progressionBadge: play.diagnostics.visual?.progressionBadge,
        title: play.diagnostics.visual?.title,
        generation: play.diagnostics.runtime?.generation,
        nativeInputs: play.nativeInputs,
        textLabels: play.diagnostics.visual?.textLabels,
        touchControls: play.diagnostics.visual?.touchControls,
        buttons: play.diagnostics.visual?.buttons,
        screenContract: play.screenContract,
        materialSystem: play.diagnostics.visual?.materialSystem
      },
      pause: {
        mode: pause.diagnostics.visual?.runtime?.mode ?? pause.diagnostics.runtime?.surface?.mode,
        overlay: pause.diagnostics.visual?.runtime?.overlay ?? pause.diagnostics.runtime?.surface?.overlay,
        board: pause.diagnostics.visual?.board,
        layout: pause.diagnostics.visual?.layout,
        progressionBadge: pause.diagnostics.visual?.progressionBadge,
        title: pause.diagnostics.visual?.title,
        overlayUi: pause.diagnostics.visual?.overlayUi,
        buttons: pause.diagnostics.visual?.buttons,
        nativeInputs: pause.nativeInputs,
        textLabels: pause.diagnostics.visual?.textLabels,
        screenContract: pause.screenContract,
        materialSystem: pause.diagnostics.visual?.materialSystem
      },
      pauseBottom: {
        mode: pauseBottomSurface.diagnostics.visual?.runtime?.mode ?? pauseBottomSurface.diagnostics.runtime?.surface?.mode,
        overlay: pauseBottomSurface.diagnostics.visual?.runtime?.overlay ?? pauseBottomSurface.diagnostics.runtime?.surface?.overlay,
        overlayUi: pauseBottomSurface.diagnostics.visual?.overlayUi,
        buttons: pauseBottomSurface.diagnostics.visual?.buttons,
        nativeInputs: pauseBottomSurface.nativeInputs,
        textLabels: pauseBottomSurface.diagnostics.visual?.textLabels,
        screenContract: pauseBottomSurface.screenContract,
        materialSystem: pauseBottomSurface.diagnostics.visual?.materialSystem
      }
    };
    const screenshots = {
      menu: menu.screenshotPath,
      auth: authSurface.screenshotPath,
      options: optionsSurface.screenshotPath,
      optionsBottom: optionsBottomSurface?.screenshotPath ?? null,
      play: play.screenshotPath,
      pause: pause.screenshotPath,
      pauseBottom: pauseBottomSurface.screenshotPath
    };
    const transitions = transition ? {
      menu: menuTransition,
      ...(authGatedMenu ? { auth: authSurface.transition } : {}),
      ...(authGatedMenu ? {} : { options: optionsSurface.transition }),
      play: playTransition,
      pause: pauseTransition
    } : null;
    const checks = buildSurfaceChecks({
      consoleMessages,
      includeOverlayBottom: !transition,
      pageErrors,
      requirePlayTrailSeed: !options.skipPlayTrailSeed,
      requireTopologyDiagnostics: !options.skipTopologyDiagnostics,
      requireWrapPairs: topologyFixture === 'wrap-enabled',
      surfaces,
      targetUrl,
      viewport
    });
    checks.push(...buildViewportTransitionChecks(transitions));
    const summary = {
      pass: checks.every((check) => check.passed),
      label,
      sessionId,
      targetUrl,
      viewport,
      deviceScaleFactor,
      transition: transition ? {
        initial: transition.initial,
        desktop: transition.desktop,
        endpoint: transition.endpoint,
        surfaces: transitions
      } : null,
      authFixture: authFixture ?? null,
      topologyFixture: topologyFixture ?? null,
      playTrailSeed,
      repo: {
        commit: getCommitSha(),
        dirty: isWorktreeDirty()
      },
      screenshots,
      surfaces,
      checks,
      consoleMessages,
      pageErrors
    };
    const summaryPath = resolve(outputDir, 'summary.json');
    const reportPath = resolve(outputDir, 'report.md');
    summary.reportPath = reportPath;
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(reportPath, `${buildMarkdownReport(summary)}\n`, 'utf8');

    return {
      ...summary,
      summaryPath
    };
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

if (isDirectRun) {
  const args = parseCliArgs();
  runUiSurfaceCapture({
    artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
    baseUrl: args['base-url'],
    authFixture: typeof args['auth-fixture'] === 'string' ? args['auth-fixture'] : undefined,
    deviceScaleFactor: parseIntegerArg(args['device-scale-factor'], DEFAULT_DEVICE_SCALE_FACTOR),
    headless: args.headless !== 'false',
    label: typeof args.label === 'string' ? args.label : DEFAULT_LABEL,
    mazeSeed: typeof args['maze-seed'] === 'string'
      ? args['maze-seed']
      : typeof args.mazeSeed === 'string'
        ? args.mazeSeed
        : undefined,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS),
    route: typeof args.route === 'string'
      ? resolveRoute({
        authFixture: typeof args['auth-fixture'] === 'string' ? args['auth-fixture'] : undefined,
        route: args.route,
        label: typeof args.label === 'string' ? args.label : DEFAULT_LABEL,
        mazeSeed: typeof args['maze-seed'] === 'string'
          ? args['maze-seed']
          : typeof args.mazeSeed === 'string'
            ? args.mazeSeed
            : undefined
      })
      : undefined,
    sessionId: args.session,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    skipPlayTrailSeed: args['skip-play-trail-seed'] === true || args['skip-play-trail-seed'] === 'true',
    skipTopologyDiagnostics: args['skip-topology-diagnostics'] === true || args['skip-topology-diagnostics'] === 'true',
    timeoutMs: parseIntegerArg(args['timeout-ms'], DEFAULT_TIMEOUT_MS),
    topologyFixture: typeof args['topology-fixture'] === 'string' ? args['topology-fixture'] : undefined,
    useExistingServer: args['no-preview'] === true || args['no-preview'] === 'true',
    viewport: parseViewport(args.viewport)
  }).then((result) => {
    process.stdout.write(`${JSON.stringify({
      pass: result.pass,
      reportPath: result.reportPath,
      summaryPath: result.summaryPath,
      authFixture: result.authFixture,
      deviceScaleFactor: result.deviceScaleFactor,
      screenshots: result.screenshots,
      targetUrl: result.targetUrl
    }, null, 2)}\n`);
    if (!result.pass) {
      process.exitCode = 1;
    }
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
