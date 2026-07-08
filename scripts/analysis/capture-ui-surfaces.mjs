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

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const STORAGE_KEY = 'mazer.game-toggles.v1';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-ui-surfaces');
const DEFAULT_LABEL = 'ui-surfaces';
const DEFAULT_ROUTE = '/?content=core-only&theme=aurora&runtimeDiagnostics=1';
const DEFAULT_VIEWPORT = Object.freeze({ width: 405, height: 958 });
const DEFAULT_TIMEOUT_MS = 30_000;
const EXPECTED_PLAYER_CORE_COLOR = 0x36ff7d;
const EXPECTED_GOAL_CORE_COLOR = 0xff263f;

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
        const runtime = JSON.parse(runtimeRaw);
        const visual = JSON.parse(visualRaw);
        return (
          runtime?.surface?.mode === expectedMode
          && runtime?.surface?.overlay === expectedOverlay
          && visual?.runtime?.mode === expectedMode
          && visual?.runtime?.overlay === expectedOverlay
        );
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

const resolveRoute = ({ route = DEFAULT_ROUTE, label, mazeSeed, pathStyle }) => {
  const url = new URL(route, 'http://local.test');
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  if (typeof mazeSeed === 'string' && mazeSeed.length > 0) {
    url.searchParams.set('mazeSeed', mazeSeed);
  }
  if (typeof pathStyle === 'string' && pathStyle.length > 0) {
    url.searchParams.set('pathStyle', pathStyle);
  }
  if (!url.searchParams.has('v')) {
    url.searchParams.set('v', `${label}-${Date.now()}`);
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

const captureSurface = async ({ page, outputDir, expectedLabels = [], id, mode, overlay, timeoutMs }) => {
  const diagnostics = await waitForSurface(page, {
    expectedLabels,
    mode,
    overlay,
    timeoutMs
  });
  const screenshotPath = resolve(outputDir, `${id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return {
    id,
    screenshotPath,
    diagnostics
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

const getMenuButtonPoints = (visual) => ({
  start: {
    x: Math.round(visual?.layout?.leftButtonX ?? 0),
    y: Math.round(visual?.layout?.leftButtonY ?? 0)
  },
  options: {
    x: Math.round(visual?.layout?.rightButtonX ?? 0),
    y: Math.round(visual?.layout?.rightButtonY ?? 0)
  }
});

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

const resolveExpectedPathVisualStyle = (targetUrl) => {
  try {
    return new URL(targetUrl).searchParams.get('pathStyle') === 'hybrid'
      ? 'hybrid'
      : 'corridor';
  } catch {
    return 'corridor';
  }
};

const buildSurfaceChecks = ({
  consoleMessages,
  pageErrors,
  surfaces,
  targetUrl
}) => {
  const expectedPathVisualStyle = resolveExpectedPathVisualStyle(targetUrl);
  const hasLabels = (surface, expectedLabels) => {
    const labels = new Set((surface.textLabels ?? []).map((entry) => entry.text));
    return expectedLabels.every((label) => labels.has(label));
  };
  const labelDetail = (surface) => (surface.textLabels ?? [])
    .map((entry) => entry.text)
    .join(', ');
  const surfaceChecks = [
    createCheck(
      'menu-surface',
      surfaces.menu.mode === 'menu' && surfaces.menu.overlay === 'none',
      `menu mode=${surfaces.menu.mode ?? 'missing'} overlay=${surfaces.menu.overlay ?? 'missing'}`
    ),
    createCheck(
      'options-surface',
      surfaces.options.mode === 'menu' && surfaces.options.overlay === 'options',
      `options mode=${surfaces.options.mode ?? 'missing'} overlay=${surfaces.options.overlay ?? 'missing'}`
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
  const pathStyleChecks = ['menu', 'options', 'play', 'pause'].map((id) => createCheck(
    `${id}-path-style`,
    surfaces[id].board?.pathVisualStyle === expectedPathVisualStyle,
    `${id} pathVisualStyle=${surfaces[id].board?.pathVisualStyle ?? 'missing'} expected=${expectedPathVisualStyle}`
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
      'play-trail-pulse-seeded-on',
      surfaces.play.markerStyle?.trailPulseEnabled === true,
      `trailPulseEnabled=${surfaces.play.markerStyle?.trailPulseEnabled ?? 'missing'}`
    )
  ];
  const textChecks = [
    createCheck(
      'menu-text-labels',
      hasLabels(surfaces.menu, ['Start', 'Options']),
      `labels=${labelDetail(surfaces.menu)}`
    ),
    createCheck(
      'options-text-labels',
      hasLabels(surfaces.options, ['Options', 'Maze Scale', 'Camera Scale', 'Game Toggles', 'Move Speed', 'Back']),
      `labels=${labelDetail(surfaces.options)}`
    ),
    createCheck(
      'play-text-labels',
      hasLabels(surfaces.play, ['PAUSE', 'RESET']),
      `labels=${labelDetail(surfaces.play)}`
    ),
    createCheck(
      'pause-text-labels',
      hasLabels(surfaces.pause, ['Paused', 'Game Toggles', 'Move Speed', 'Back', 'Reset', 'Main Menu']),
      `labels=${labelDetail(surfaces.pause)}`
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
    ...playChecks,
    ...textChecks,
    ...runtimeChecks
  ];
};

const buildMarkdownReport = (summary) => {
  const checkRows = summary.checks
    .map((check) => `| ${check.id} | ${check.passed ? 'pass' : 'fail'} | ${check.detail.replace(/\|/g, '\\|')} |`)
    .join('\n');

  return [
    `# ${summary.label}`,
    '',
    `- Pass: ${summary.pass ? 'yes' : 'no'}`,
    `- Target: ${summary.targetUrl}`,
    `- Viewport: ${summary.viewport.width}x${summary.viewport.height}`,
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
    `![Options](${summary.screenshots.options})`,
    '',
    `![Play](${summary.screenshots.play})`,
    '',
    `![Pause](${summary.screenshots.pause})`,
    ''
  ].join('\n');
};

export const runUiSurfaceCapture = async (options = {}) => {
  const label = options.label ?? DEFAULT_LABEL;
  const sessionId = resolveSessionId(options.sessionId);
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = resolve(artifactRoot, sessionId);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const route = options.route ?? resolveRoute({
    route: DEFAULT_ROUTE,
    label,
    mazeSeed: options.mazeSeed,
    pathStyle: options.pathStyle
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
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        consoleMessages.push({
          type: message.type(),
          text: message.text()
        });
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

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
    const menu = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['Start', 'Options'],
      id: '01-menu',
      mode: 'menu',
      overlay: 'none',
      timeoutMs
    });
    const menuButtons = getMenuButtonPoints(menu.diagnostics.visual);

    await clickPoint(page, menuButtons.options, 'Options');
    const optionsSurface = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['Options', 'Maze Scale', 'Camera Scale', 'Game Toggles', 'Move Speed', 'Back'],
      id: '02-options',
      mode: 'menu',
      overlay: 'options',
      timeoutMs
    });

    await page.keyboard.press('Escape');
    await waitForSurface(page, { mode: 'menu', overlay: 'none', timeoutMs });
    await clickPoint(page, menuButtons.start, 'Start');
    const play = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['PAUSE', 'RESET'],
      id: '03-play',
      mode: 'play',
      overlay: 'none',
      timeoutMs
    });

    await clickPoint(page, getPauseButtonPoint(play.diagnostics.visual), 'Pause');
    const pause = await captureSurface({
      page,
      outputDir,
      expectedLabels: ['Paused', 'Game Toggles', 'Move Speed', 'Back', 'Reset', 'Main Menu'],
      id: '04-pause',
      mode: 'play',
      overlay: 'pause',
      timeoutMs
    });

    const surfaces = {
      menu: {
        mode: menu.diagnostics.runtime?.surface?.mode,
        overlay: menu.diagnostics.runtime?.surface?.overlay,
        board: menu.diagnostics.visual?.board,
        layout: menu.diagnostics.visual?.layout,
        textLabels: menu.diagnostics.visual?.textLabels
      },
      options: {
        mode: optionsSurface.diagnostics.runtime?.surface?.mode,
        overlay: optionsSurface.diagnostics.runtime?.surface?.overlay,
        board: optionsSurface.diagnostics.visual?.board,
        textLabels: optionsSurface.diagnostics.visual?.textLabels
      },
      play: {
        mode: play.diagnostics.runtime?.surface?.mode,
        overlay: play.diagnostics.runtime?.surface?.overlay,
        board: play.diagnostics.visual?.board,
        markerStyle: play.diagnostics.visual?.markerStyle,
        textLabels: play.diagnostics.visual?.textLabels,
        touchControls: play.diagnostics.visual?.touchControls
      },
      pause: {
        mode: pause.diagnostics.runtime?.surface?.mode,
        overlay: pause.diagnostics.runtime?.surface?.overlay,
        board: pause.diagnostics.visual?.board,
        textLabels: pause.diagnostics.visual?.textLabels
      }
    };
    const screenshots = {
      menu: menu.screenshotPath,
      options: optionsSurface.screenshotPath,
      play: play.screenshotPath,
      pause: pause.screenshotPath
    };
    const checks = buildSurfaceChecks({
      consoleMessages,
      pageErrors,
      surfaces,
      targetUrl
    });
    const summary = {
      pass: checks.every((check) => check.passed),
      label,
      sessionId,
      targetUrl,
      viewport,
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
    headless: args.headless !== 'false',
    label: typeof args.label === 'string' ? args.label : DEFAULT_LABEL,
    mazeSeed: typeof args['maze-seed'] === 'string'
      ? args['maze-seed']
      : typeof args.mazeSeed === 'string'
        ? args.mazeSeed
        : undefined,
    pathStyle: typeof args['path-style'] === 'string' ? args['path-style'] : undefined,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout-ms'], DEFAULT_PREVIEW_TIMEOUT_MS),
    route: typeof args.route === 'string'
      ? resolveRoute({
        route: args.route,
        label: typeof args.label === 'string' ? args.label : DEFAULT_LABEL,
        mazeSeed: typeof args['maze-seed'] === 'string'
          ? args['maze-seed']
          : typeof args.mazeSeed === 'string'
            ? args.mazeSeed
            : undefined,
        pathStyle: typeof args['path-style'] === 'string' ? args['path-style'] : undefined
      })
      : undefined,
    sessionId: args.session,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    timeoutMs: parseIntegerArg(args['timeout-ms'], DEFAULT_TIMEOUT_MS),
    useExistingServer: args['no-preview'] === true || args['no-preview'] === 'true',
    viewport: parseViewport(args.viewport)
  }).then((result) => {
    process.stdout.write(`${JSON.stringify({
      pass: result.pass,
      reportPath: result.reportPath,
      summaryPath: result.summaryPath,
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
