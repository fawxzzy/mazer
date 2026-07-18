import { execFileSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  parseCliArgs,
  resolveSessionId
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-auth-persistence-soak');
const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const MOBILE_VIEWPORT = Object.freeze({ width: 405, height: 958 });
const MOBILE_DPR = 2;
const TIMEOUT_MS = 30_000;

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const readJsonAttribute = async (page, attribute) => page.evaluate((name) => {
  const raw = document.documentElement.getAttribute(name);
  return raw ? JSON.parse(raw) : null;
}, attribute);

const readDiagnostics = async (page) => ({
  runtime: await readJsonAttribute(page, RUNTIME_DIAGNOSTICS_ATTRIBUTE),
  visual: await readJsonAttribute(page, VISUAL_DIAGNOSTICS_ATTRIBUTE)
});

const summarizeSurface = ({ runtime, visual }) => ({
  authStatus: runtime?.auth?.status ?? null,
  buttons: (visual?.buttons ?? []).map((button) => button.text),
  mode: visual?.runtime?.mode ?? null,
  overlay: visual?.runtime?.overlay ?? null,
  trailShineEnabled: runtime?.gameToggles?.trailPulse?.enabled ?? null,
  userIdPresent: runtime?.auth?.userIdPresent === true
});

const waitForSurface = async (page, expected) => {
  try {
    await page.waitForFunction(({ runtimeAttribute, visualAttribute, expectedSurface }) => {
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const visualRaw = document.documentElement.getAttribute(visualAttribute);
      if (!runtimeRaw || !visualRaw) {
        return false;
      }
      try {
        const runtime = JSON.parse(runtimeRaw);
        const visual = JSON.parse(visualRaw);
        const labels = new Set((visual?.buttons ?? []).map((button) => button.text));
        return (expectedSurface.authenticated === undefined || (runtime?.auth?.status === 'authenticated') === expectedSurface.authenticated)
          && visual?.runtime?.mode === expectedSurface.mode
          && visual?.runtime?.overlay === expectedSurface.overlay
          && expectedSurface.buttons.every((label) => labels.has(label));
      } catch {
        return false;
      }
    }, {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE,
      expectedSurface: expected
    }, { timeout: TIMEOUT_MS });
  } catch (error) {
    const observed = summarizeSurface(await readDiagnostics(page));
    throw new Error(`surface_timeout:${JSON.stringify({ expected, observed })}`, { cause: error });
  }
  return summarizeSurface(await readDiagnostics(page));
};

const findVisualButtonCenter = (visual, text) => {
  const button = (visual?.buttons ?? []).find((candidate) => candidate?.text === text);
  const bounds = button?.bounds;
  if (!bounds || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) {
    throw new Error(`button_not_found:${text}`);
  }
  return { x: bounds.left + (bounds.width / 2), y: bounds.top + (bounds.height / 2) };
};

const openOptionsViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.openOptionsOverlay), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.openOptionsOverlay?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error('options_fixture_action_rejected');
  }
};

const startPlayViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.startPlayMode?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error(`play_fixture_action_rejected:${result?.reason ?? 'unknown'}`);
  }
};

const openPauseViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.openPauseOverlay), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.openPauseOverlay?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error(`pause_fixture_action_rejected:${result?.reason ?? 'unknown'}`);
  }
};

const waitForTrailShine = async (page, expected) => {
  await page.waitForFunction(({ runtimeAttribute, expectedValue }) => {
    const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
    if (!runtimeRaw) {
      return false;
    }
    try {
      return JSON.parse(runtimeRaw)?.gameToggles?.trailPulse?.enabled === expectedValue;
    } catch {
      return false;
    }
  }, {
    runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
    expectedValue: expected
  }, { timeout: TIMEOUT_MS });
  return summarizeSurface(await readDiagnostics(page));
};

const buildRoute = (authenticated) => (
  `/?content=core-only&theme=aurora&runtimeDiagnostics=1${authenticated ? '&authFixture=authenticated' : ''}&v=auth-persistence-soak`
);

export const summarizeAuthPersistenceSoak = (steps, consoleMessages, pageErrors) => {
  const required = [
    'guest-entry',
    'authenticated-entry',
    'authenticated-setting-change',
    'authenticated-reload',
    'authenticated-options-reload',
    'authenticated-pause-reentry',
    'logout-to-guest',
    'fixture-reentry'
  ];
  const missingSteps = required.filter((id) => !steps.some((step) => step.id === id && step.pass));
  // Phaser may emit this teardown diagnostic while a page is navigating away.
  const actionableConsoleMessages = consoleMessages.filter(
    (message) => !message.startsWith('WebGL: CONTEXT_LOST_WEBGL:')
  );
  return {
    pass: missingSteps.length === 0 && actionableConsoleMessages.length === 0 && pageErrors.length === 0,
    missingSteps,
    stepCount: steps.length,
    steps,
    actionableConsoleMessages
  };
};

export const runLiveAuthPersistenceSoak = async (options = {}) => {
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const sessionId = resolveSessionId(options.sessionId);
  const outputDir = resolve(artifactRoot, sessionId);
  const label = options.label ?? 'auth-persistence-soak';
  await ensureDir(outputDir);

  if (options.skipBuild !== true) {
    runBuild();
  }

  const preview = await launchPreviewServer({ previewTimeoutMs: options.previewTimeoutMs });
  const browser = await chromium.launch({ headless: options.headless !== false });
  const context = await browser.newContext({
    deviceScaleFactor: MOBILE_DPR,
    hasTouch: true,
    isMobile: true,
    viewport: MOBILE_VIEWPORT
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const steps = [];
  const screenshots = {};

  try {
    await page.goto(`${preview.baseUrl}${buildRoute(false)}`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    const guestEntry = await waitForSurface(page, {
      authenticated: false, buttons: ['Login'], mode: 'menu', overlay: 'none'
    });
    steps.push({ id: 'guest-entry', pass: guestEntry.buttons.length === 1 && guestEntry.buttons[0] === 'Login', surface: guestEntry });

    await page.goto(`${preview.baseUrl}${buildRoute(true)}`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    const authenticatedEntry = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Options'], mode: 'menu', overlay: 'none'
    });
    steps.push({ id: 'authenticated-entry', pass: authenticatedEntry.userIdPresent, surface: authenticatedEntry });

    await openOptionsViaQa(page);
    const options = await waitForSurface(page, {
      authenticated: true, buttons: ['Trail Shine', 'Account'], mode: 'menu', overlay: 'options'
    });
    const initialTrailShine = options.trailShineEnabled;
    if (typeof initialTrailShine !== 'boolean') {
      throw new Error('trail_shine_diagnostic_missing');
    }
    const trailShinePoint = findVisualButtonCenter((await readDiagnostics(page)).visual, 'Trail Shine');
    await page.mouse.click(trailShinePoint.x, trailShinePoint.y);
    const changedTrailShine = await waitForTrailShine(page, !initialTrailShine);
    steps.push({
      id: 'authenticated-setting-change',
      pass: changedTrailShine.trailShineEnabled === !initialTrailShine,
      surface: changedTrailShine
    });

    await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    const authenticatedReload = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Options'], mode: 'menu', overlay: 'none'
    });
    steps.push({
      id: 'authenticated-reload',
      pass: authenticatedReload.userIdPresent && authenticatedReload.trailShineEnabled === !initialTrailShine,
      surface: authenticatedReload
    });

    await openOptionsViaQa(page);
    const authenticatedOptionsReload = await waitForSurface(page, {
      authenticated: true, buttons: ['Account'], mode: 'menu', overlay: 'options'
    });
    steps.push({
      id: 'authenticated-options-reload',
      pass: authenticatedOptionsReload.userIdPresent
        && authenticatedOptionsReload.trailShineEnabled === !initialTrailShine,
      surface: authenticatedOptionsReload
    });
    screenshots.authenticatedOptions = resolve(outputDir, `${label}-authenticated-options.png`);
    await page.screenshot({ path: screenshots.authenticatedOptions });
    await page.keyboard.press('Escape');
    await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Options'], mode: 'menu', overlay: 'none'
    });

    await startPlayViaQa(page);
    await openPauseViaQa(page);
    const authenticatedPauseReentry = await waitForSurface(page, {
      authenticated: true, buttons: ['Back', 'Trail Shine', 'Reset', 'Menu'], mode: 'play', overlay: 'pause'
    });
    steps.push({
      id: 'authenticated-pause-reentry',
      pass: authenticatedPauseReentry.userIdPresent
        && authenticatedPauseReentry.trailShineEnabled === !initialTrailShine,
      surface: authenticatedPauseReentry
    });
    screenshots.authenticatedPause = resolve(outputDir, `${label}-authenticated-pause.png`);
    await page.screenshot({ path: screenshots.authenticatedPause });

    await page.goto(`${preview.baseUrl}${buildRoute(true)}`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Options'], mode: 'menu', overlay: 'none'
    });
    await openOptionsViaQa(page);
    await waitForSurface(page, {
      authenticated: true, buttons: ['Account'], mode: 'menu', overlay: 'options'
    });
    const accountPoint = findVisualButtonCenter((await readDiagnostics(page)).visual, 'Account');
    await page.mouse.click(accountPoint.x, accountPoint.y);
    await waitForSurface(page, {
      authenticated: true, buttons: ['Save Account', 'Change Password', 'Log out'], mode: 'menu', overlay: 'auth'
    });
    const logoutPoint = findVisualButtonCenter((await readDiagnostics(page)).visual, 'Log out');
    await page.mouse.click(logoutPoint.x, logoutPoint.y);
    const logout = await waitForSurface(page, {
      authenticated: false, buttons: ['Login', 'Create Account', 'Reset Password'], mode: 'menu', overlay: 'auth'
    });
    steps.push({
      id: 'logout-to-guest',
      pass: options.authStatus === 'authenticated'
        && !logout.userIdPresent
        && logout.trailShineEnabled === initialTrailShine,
      surface: logout
    });

    await page.goto(`${preview.baseUrl}${buildRoute(true)}`, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    const reentry = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Options'], mode: 'menu', overlay: 'none'
    });
    steps.push({
      id: 'fixture-reentry',
      pass: reentry.userIdPresent && reentry.trailShineEnabled === !initialTrailShine,
      surface: reentry,
      fixtureOnly: true
    });

    const screenshotPath = resolve(outputDir, `${label}.png`);
    await page.screenshot({ path: screenshotPath });
    screenshots.fixtureReentry = screenshotPath;
    const result = summarizeAuthPersistenceSoak(steps, consoleMessages, pageErrors);
    const summary = {
      schema: 'mazer.live-auth-persistence-soak.v1',
      label,
      generatedAt: new Date().toISOString(),
      fixtureOnly: true,
      note: 'This verifies the visible authenticated mobile fixture contract across menu Options, reload, played-game Pause, logout, and re-entry without using account credentials.',
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: MOBILE_DPR,
      result,
      consoleMessages,
      pageErrors,
      artifacts: { screenshotPath, screenshots }
    };
    const summaryPath = resolve(outputDir, `${label}.summary.json`);
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await copyFile(summaryPath, resolve(artifactRoot, 'latest.summary.json'));
    return { ...summary, summaryPath };
  } finally {
    await browser.close();
    await stopPreviewServer(preview.child);
  }
};

if (isDirectRun) {
  const args = parseCliArgs();
  runLiveAuthPersistenceSoak({
    artifactRoot: typeof args['output-root'] === 'string' ? args['output-root'] : DEFAULT_ARTIFACT_ROOT,
    headless: args.headless !== 'false',
    label: typeof args.label === 'string' ? args.label : 'auth-persistence-soak',
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true'
  }).then((summary) => {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.result.pass ? 0 : 1;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
