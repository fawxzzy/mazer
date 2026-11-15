/**
 * Wave 0C (measured baseline) and Wave 3A (command bridge) headless capture packets (MAZER-GOV-014, UI-028).
 *
 *   node scripts/analysis/capture-auth-capability-surfaces.mjs [--wave=0C|3A|all] [--base-url=http://127.0.0.1:PORT]
 *        [--out-root=docs/ui/evidence/waves] [--skip-build]
 *
 * This is the path the decision registry claims for Wave 0C. Each wave gets `<out-root>/<wave>/` with PNGs and a
 * metadata.json that records, per capture, the real URL, viewport, device scale factor, canvas backing store,
 * the mode/overlay read from the live scene BEFORE the screenshot, and a pass flag. A capture whose mode/overlay
 * differs from the requested surface throws (no soft failure, no metadata written), per docs/PLAYBOOK_VISUAL_EVIDENCE.md.
 *
 *   0C: menu at phone (390x844) and desktop (1280x720) with the synthetic authenticated QA fixture (no network,
 *       no live account): the DPR / backing-store baseline.
 *   3A: the same menu driven through the shared UI command bridge (`__MAZER_QA__.dispatchUiCommand`):
 *       NAVIGATE settings -> CLOSE_MODAL -> START_RUN -> PAUSE_RUN.
 *
 * Headless Chromium only. Nothing here was run on a real phone.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { REPO_ROOT, parseCliArgs } from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import { waitForAuthenticatedFixtureReady } from './capture-ui-surfaces.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

export const WAVE_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'phone-390x844', width: 390, height: 844, mobile: true }),
  Object.freeze({ name: 'desktop-1280x720', width: 1280, height: 720, mobile: false })
]);
const DEVICE_SCALE_FACTOR = 2;
const ROUTE = '/?content=core-only&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749';
const TIMEOUT_MS = 30_000;

const readSurface = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const canvas = document.querySelector('canvas');
  return {
    mode: scene.mode,
    overlay: scene.overlay,
    url: window.location.href,
    canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight } : null,
    devicePixelRatio: window.devicePixelRatio
  };
});

const waitForSurface = async (page, expected, label) => {
  try {
    await page.waitForFunction(({ mode, overlay }) => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      return scene.mode === mode && scene.overlay === overlay;
    }, expected, { timeout: TIMEOUT_MS });
  } catch (error) {
    throw new Error(`${label}: never reached ${JSON.stringify(expected)}; live surface ${JSON.stringify(await readSurface(page))}`, { cause: error });
  }
  // Two frames so the screenshot is not taken mid-transition.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};

const dispatch = async (page, command, label) => {
  const result = await page.evaluate((cmd) => window.__MAZER_QA__.dispatchUiCommand(cmd), command);
  if (result?.ok !== true) {
    throw new Error(`${label}: command ${JSON.stringify(command)} was not accepted: ${JSON.stringify(result)}`);
  }
  return result;
};

const capture = async (page, dir, file, expected, label, captures, viewport, via) => {
  await waitForSurface(page, expected, label);
  const surface = await readSurface(page);
  if (surface.mode !== expected.mode || surface.overlay !== expected.overlay) {
    throw new Error(`${label}: surface mismatch ${JSON.stringify(surface)}`);
  }
  await page.screenshot({ path: join(dir, file) });
  captures.push({
    file,
    label,
    viewport: `${viewport.width}x${viewport.height}`,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    via,
    expected,
    actual: { mode: surface.mode, overlay: surface.overlay },
    canvas: surface.canvas,
    devicePixelRatio: surface.devicePixelRatio,
    url: surface.url,
    screenContract: { pass: true }
  });
};

const openMenu = async (browser, baseUrl, viewport) => {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    serviceWorkers: 'block'
  });
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
  await waitForAuthenticatedFixtureReady(page, { timeoutMs: TIMEOUT_MS });
  await page.waitForFunction(() => {
    const v = JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'));
    const stage = v?.runtime?.generation?.drawStage;
    return (stage?.complete || stage?.lifecyclePhase === 'settled') && v?.title?.progressPercent >= 95;
  }, null, { timeout: TIMEOUT_MS });
  return { context, page, errors };
};

const WAVES = {
  '0C': {
    title: 'Measured baseline',
    surfaces: ['menu-phone-desktop-baseline'],
    run: async (browser, baseUrl, dir, captures) => {
      for (const viewport of WAVE_VIEWPORTS) {
        const { context, page, errors } = await openMenu(browser, baseUrl, viewport);
        try {
          await capture(page, dir, `menu-${viewport.name}.png`, { mode: 'menu', overlay: 'none' }, `menu ${viewport.name}`, captures, viewport, 'route');
          if (errors.length > 0) throw new Error(`menu ${viewport.name}: page errors ${JSON.stringify(errors)}`);
        } finally { await context.close(); }
      }
    }
  },
  '3A': {
    title: 'Command bridge',
    surfaces: ['menu-commands'],
    run: async (browser, baseUrl, dir, captures) => {
      for (const viewport of WAVE_VIEWPORTS) {
        const { context, page, errors } = await openMenu(browser, baseUrl, viewport);
        try {
          await capture(page, dir, `menu-${viewport.name}.png`, { mode: 'menu', overlay: 'none' }, `menu ${viewport.name}`, captures, viewport, 'route');
          await dispatch(page, { type: 'NAVIGATE', surface: 'settings' }, 'open options');
          await capture(page, dir, `options-${viewport.name}.png`, { mode: 'menu', overlay: 'options' }, `options ${viewport.name}`, captures, viewport, 'NAVIGATE');
          await dispatch(page, { type: 'CLOSE_MODAL' }, 'close options');
          await waitForSurface(page, { mode: 'menu', overlay: 'none' }, `menu after close ${viewport.name}`);
          await dispatch(page, { type: 'START_RUN' }, 'start run');
          await waitForSurface(page, { mode: 'play', overlay: 'none' }, `play ${viewport.name}`);
          await dispatch(page, { type: 'PAUSE_RUN' }, 'pause run');
          await capture(page, dir, `pause-${viewport.name}.png`, { mode: 'play', overlay: 'pause' }, `pause ${viewport.name}`, captures, viewport, 'PAUSE_RUN');
          if (errors.length > 0) throw new Error(`3A ${viewport.name}: page errors ${JSON.stringify(errors)}`);
        } finally { await context.close(); }
      }
    }
  }
};

export const runWaveCapture = async ({ baseUrl, outRoot, waves }) => {
  const browser = await chromium.launch({ headless: true });
  const written = [];
  try {
    for (const wave of waves) {
      const spec = WAVES[wave];
      if (!spec) throw new Error(`unknown wave ${wave}; supported: ${Object.keys(WAVES).join(', ')}`);
      const dir = join(outRoot, wave);
      mkdirSync(dir, { recursive: true });
      const captures = [];
      await spec.run(browser, baseUrl, dir, captures);
      const metadata = {
        schema: 'mazer-wave-capture.v1',
        wave,
        title: spec.title,
        surfaces: spec.surfaces,
        script: 'scripts/analysis/capture-auth-capability-surfaces.mjs',
        headless: true,
        realPhone: false,
        liveAccount: false,
        route: ROUTE,
        captures,
        pass: captures.every((entry) => entry.screenContract.pass)
      };
      writeFileSync(join(dir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
      written.push(dir);
    }
  } finally {
    await browser.close();
  }
  return written;
};

if (isDirectRun) {
  const args = parseCliArgs();
  const waveArg = typeof args.wave === 'string' ? args.wave : 'all';
  const waves = waveArg === 'all' ? Object.keys(WAVES) : waveArg.split(',');
  const outRoot = resolve(REPO_ROOT, typeof args['out-root'] === 'string' ? args['out-root'] : 'docs/ui/evidence/waves');
  const external = typeof args['base-url'] === 'string' ? args['base-url'].replace(/\/$/, '') : null;
  if (external === null && args['skip-build'] !== true && args['skip-build'] !== 'true') {
    if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    else execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  const preview = external === null ? await launchPreviewServer() : { baseUrl: external, child: null };
  try {
    const written = await runWaveCapture({ baseUrl: preview.baseUrl, outRoot, waves });
    process.stdout.write(`${JSON.stringify({ pass: true, written }, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (preview.child) await stopPreviewServer(preview.child);
  }
}
