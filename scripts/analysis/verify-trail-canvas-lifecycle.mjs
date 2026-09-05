/**
 * Wave 4D-A: real-browser integration checks for the trail's canvas
 * compositor (src/render/navigationCoreTrailCanvas.ts + MenuScene's
 * trailCanvasImage/trailCanvasTexture). The trail now lives in a
 * persistent Image/CanvasTexture pair OUTSIDE boardDynamicGraphics (the
 * Graphics object the old vector-stroke trail lived in, cleared and
 * redrawn every dirty frame) -- the old "Graphics.clear() every frame"
 * cleanup behavior this game has always relied on elsewhere cannot be
 * assumed to also clean up this new persistent Image. This script drives
 * the real running game (not a mock) through the specific transitions
 * that could leave a stale/ghost trail showing, and exits non-zero with a
 * clear message on the first check that fails.
 *
 * Usage: node scripts/analysis/verify-trail-canvas-lifecycle.mjs
 * (builds and launches its own preview server unless --no-preview is
 * passed with an existing server already up on --base-url; --skip-build
 * reuses an existing dist/ as-is).
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const checks = [];
const check = (label, passed, detail) => {
  checks.push({ label, passed, detail });
  process.stderr.write(`${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -- ${detail}` : ''}\n`);
};

const readTrailImageState = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const image = scene.trailCanvasImage;
  return {
    exists: image !== null,
    visible: image ? image.visible : null,
    mode: scene.mode,
    overlay: scene.overlay,
    trailLength: scene.trail.length
  };
});

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await page.waitForTimeout(300);

    // Drive real accepted moves (not a direct scene.trail assignment) until
    // the trail is genuinely visible, retrying past the real build/reveal
    // lifecycle lock the same way the performance script does.
    const moveUntilVisible = async () => {
      const directions = ['move_right', 'move_down', 'move_left', 'move_up'];
      let directionIndex = 0;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const move = directions[directionIndex % directions.length];
        // eslint-disable-next-line no-await-in-loop
        const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
        if (!result?.accepted && result?.reason !== 'lifecycle-locked') {
          directionIndex += 1;
        }
        // eslint-disable-next-line no-await-in-loop
        const state = await readTrailImageState(page);
        if (state.visible) {
          return state;
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(30);
      }
      return readTrailImageState(page);
    };

    // ============================================================
    // Check 1: a visible play trail, then Play -> Main Menu.
    // ============================================================
    const beforeReturnHome = await moveUntilVisible();
    check('trail canvas image exists after entering play mode', beforeReturnHome.exists);
    check('trail canvas image is visible once a real move produces a trail', beforeReturnHome.visible === true);

    await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RETURN_HOME' }));
    await page.waitForTimeout(100);
    const afterReturnHome = await readTrailImageState(page);
    check(
      'trail canvas image is hidden immediately after Play -> Main Menu (no ghost trail behind the menu)',
      afterReturnHome.visible === false,
      `mode=${afterReturnHome.mode} visible=${afterReturnHome.visible}`
    );

    // ============================================================
    // Check 2: back into play, visible trail, then a real reset ->
    // the trail must not stay stuck showing the pre-reset route.
    // ============================================================
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await page.waitForTimeout(300);
    const beforeReset = await moveUntilVisible();
    check('trail visible again after re-entering play mode', beforeReset.visible === true);

    // Real reset path via the same UI command bridge the real Pause-overlay
    // reset action would dispatch -- internally
    // applyLegacyPauseCommand('reset-player').
    const resetAccepted = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESET_RUN' }));
    await page.waitForTimeout(100);
    const afterReset = await readTrailImageState(page);
    check(
      'trail length collapses back down after a real reset (not stuck at the pre-reset route)',
      afterReset.trailLength <= 1,
      `trailLength=${afterReset.trailLength} resetAccepted=${resetAccepted}`
    );

    // ============================================================
    // Check 3: pause/resume must not hide or corrupt an already-visible
    // trail -- only its animation clock freezes, not its visibility.
    // ============================================================
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await page.waitForTimeout(300);
    const beforePause = await moveUntilVisible();
    check('trail visible before opening Pause', beforePause.visible === true);
    await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
    await page.waitForTimeout(100);
    const duringPause = await readTrailImageState(page);
    check(
      'trail stays visible while Pause is open (only its clock freezes, not its visibility)',
      duringPause.visible === true,
      `overlay=${duringPause.overlay}`
    );
    await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RESUME_RUN' }));
    await page.waitForTimeout(100);
    const afterResume = await readTrailImageState(page);
    check('trail stays visible after closing Pause', afterResume.visible === true);

    await context.close();

    // ============================================================
    // Check 4: scene shutdown/recreate (a full page reload) must not
    // crash or collide on the texture key, and must produce a fresh,
    // working trail canvas image again.
    // ============================================================
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();
    const pageErrors = [];
    page2.on('pageerror', (err) => pageErrors.push(String(err)));
    await page2.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page2.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), { timeout: 15000 });
    await page2.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await page2.waitForTimeout(300);
    const afterReload = await readTrailImageState(page2);
    check('trail canvas image exists after a full reload (scene recreate)', afterReload.exists);
    check('no page errors (e.g. a duplicate texture-key exception) across the reload', pageErrors.length === 0, pageErrors.join('; '));
    await context2.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const failed = checks.filter((c) => !c.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  if (failed.length > 0) {
    process.stderr.write(`FAILED: ${failed.map((c) => c.label).join('; ')}\n`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
