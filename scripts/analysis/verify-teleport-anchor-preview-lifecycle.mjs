/**
 * Wave 4D-B: real-browser integration check for the Teleport anchor-pose
 * QA preview (window.__MAZER_QA__.previewTeleportPrimaryAnchor /
 * endTeleportPrimaryAnchorPreview, wired in src/scenes/MenuScene.ts).
 * Drives the actual built game (not a mock) and asserts the preview:
 *   - actually moves a REAL existing titleOrbitDiamondImages pool slot,
 *     not a newly created duplicate image;
 *   - repositions it to the pose the pure selector/pose modules computed,
 *     not an arbitrary position;
 *   - restores normal ambient control of that slot once ended, rather
 *     than leaving it stuck at the preview's last pose;
 *   - never adds an image, and never leaves Navigation Core's own trail/
 *     player-glow/goal-halo canvas layers in a broken state.
 *
 * Usage: node scripts/analysis/verify-teleport-anchor-preview-lifecycle.mjs
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

// Advances the scene's own manual clock -- the normal per-frame title-orbit
// draw (and this wave's override riding alongside it) only runs from
// within the real render loop, so a QA call's effect is only actually
// drawn once a frame has run since that call.
const stepOnce = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  window.__mazerTeleportQaClockMs = (window.__mazerTeleportQaClockMs ?? scene.time.now) + 16;
  window.__MAZER_GAME__.loop.step(window.__mazerTeleportQaClockMs);
});

const readImagePoolState = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const images = scene.titleOrbitDiamondImages;
  const slot = images[images.length - 1];
  return {
    poolLength: images.length,
    slot: slot ? {
      x: slot.x, y: slot.y, rotation: slot.rotation, visible: slot.visible, texture: slot.texture.key
    } : null
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
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.previewTeleportPrimaryAnchor), { timeout: 15000 });
    await page.evaluate(() => window.__MAZER_GAME__.loop.stop());
    // Fast-forward past the title's own build animation so the scene is
    // fully settled before exercising the preview.
    for (let i = 0; i < 400; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await stepOnce(page);
    }

    const before = await readImagePoolState(page);
    check('the pool starts with exactly 8 diamond image slots', before.poolLength === 8, `poolLength=${before.poolLength}`);

    // A target near the top-right corner should select anchor 2.
    const target = { x: 1260, y: 20 };
    const result = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y), target);
    await stepOnce(page);
    const during = await readImagePoolState(page);

    check('the selector actually chose an anchor for this target', result.selectedId !== null, JSON.stringify(result));
    check('the pool is still exactly 8 slots -- no duplicate shell was created', during.poolLength === 8, `poolLength=${during.poolLength}`);
    // Phaser's Image.rotation getter always reports the normalized angle in
    // (-pi, pi], so a computed rotation outside that range (e.g. ~3.39 rad)
    // reads back as its 2*pi-wrapped equivalent (~-2.89 rad) -- the same
    // real angle, not a mismatch. Compare via the angle's own sin/cos
    // rather than the raw radian value so the check isn't sensitive to
    // which of the infinitely many equivalent representations Phaser
    // happens to report.
    const anglesMatch = (a, b) => Math.abs(Math.cos(a) - Math.cos(b)) < 0.001 && Math.abs(Math.sin(a) - Math.sin(b)) < 0.001;
    check(
      'the commandeered slot moved to the real computed pose, not an arbitrary position',
      during.slot !== null && result.pose !== null
        && Math.abs(during.slot.x - result.pose.anchorX) < 0.01
        && Math.abs(during.slot.y - result.pose.anchorY) < 0.01
        && anglesMatch(during.slot.rotation, result.pose.rotation),
      `slot=${JSON.stringify(during.slot)} pose=${JSON.stringify(result.pose)}`
    );
    check('the commandeered slot is visible and uses the real canonical shell texture', during.slot?.visible === true && during.slot?.texture === 'mazerVfxEdgeDiamondEnergized', JSON.stringify(during.slot));

    // End the preview and let one more real frame run -- the normal ambient
    // draw should reassert its own control of every slot on its own, with
    // no explicit "restore" call needed.
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);
    const after = await readImagePoolState(page);
    check(
      'ending the preview lets the ambient draw take the slot back over (no longer pinned to the preview pose)',
      after.slot !== null && (
        Math.abs(after.slot.x - during.slot.x) > 0.01 || Math.abs(after.slot.y - during.slot.y) > 0.01
      ),
      `duringSlot=${JSON.stringify(during.slot)} afterSlot=${JSON.stringify(after.slot)}`
    );

    // A target where every real anchor is excluded (a giant exclusion
    // covering the whole viewport is not exercised here -- that is unit-
    // tested at the pure-function level; this real-browser check instead
    // confirms the 'unavailable' path costs nothing observable when hit
    // via a genuinely impossible target is out of scope for the live DOM.
    // Instead, re-confirm a second, different real target selects a
    // different, real anchor.
    const secondTarget = { x: 20, y: 700 };
    const secondResult = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y), secondTarget);
    await stepOnce(page);
    check(
      'a different target selects a different real anchor (not a hardcoded slot)',
      secondResult.selectedId !== null && secondResult.selectedId !== result.selectedId,
      `first=${result.selectedId} second=${secondResult.selectedId}`
    );
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);

    // Navigation Core's own canvases must be unaffected by any of the above.
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await stepOnce(page);
    const navCoreState = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      return {
        mode: scene.mode,
        trailCanvasExists: Boolean(scene.trailCanvasImage),
        playerGlowExists: Boolean(scene.playerGlowCanvasImage),
        goalHaloExists: Boolean(scene.goalHaloCanvasImage)
      };
    });
    check(
      'Navigation Core\'s trail/player-glow/goal-halo canvas layers are unaffected',
      navCoreState.mode === 'play' && navCoreState.trailCanvasExists && navCoreState.playerGlowExists && navCoreState.goalHaloExists,
      JSON.stringify(navCoreState)
    );

    check('no page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | '));

    await context.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const failed = checks.filter((c) => !c.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
