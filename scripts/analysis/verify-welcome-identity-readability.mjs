/** Real canvas regression for welcome identity over the animated maze.
 * Uses only localhost and the synthetic authenticated QA fixture. Each layout
 * also changes one local label's backplate to white and requires the exact same
 * pixel assertion to reject it. No live account or remote request is involved.
 * Run after building, or pass --skip-build to reuse that build.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import { createCaptureOutputDirectory } from './capture-world-identity-ui-evidence.mjs';
import { waitForAuthenticatedFixtureReady } from './capture-ui-surfaces.mjs';

const EXPECTED = [6, 11, 15, 255];
const pixelsReadable = (labels) => labels.length === 2
  && labels.every((label) => label.pixels.length === 4
    && label.pixels.every((pixel) => EXPECTED.every((value, index) => Math.abs(pixel[index] - value) <= 2)));

const readPixels = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const username = scene.authSnapshot.canonicalUsername?.trim();
  const canvas = document.querySelector('canvas');
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  // Phaser text bounds use logical game coordinates, not CSS page coordinates.
  const sx = canvas.width / scene.scale.gameSize.width;
  const sy = canvas.height / scene.scale.gameSize.height;
  return scene.uiTexts.filter((text) => text.visible && ['Welcome', username].includes(text.text)).map((text) => {
    const b = text.getBounds();
    // Phaser rounds text placement; fractional bounds can precede the actual
    // texture edge by >1px. Stay inside its existing 8/12px horizontal padding.
    const points = [[b.left + 3, b.top + 1], [b.right - 3, b.top + 1],
      [b.left + 3, b.bottom - 2], [b.right - 3, b.bottom - 2]];
    return { text: text.text, depth: text.depth, background: text.style.backgroundColor,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      pixels: points.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), 1, 1).data)) };
  });
});

const main = async () => {
  if (!process.argv.includes('--skip-build')) {
    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    } else execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  // Reuse the reviewed exclusive-create helper; never overwrite/delete evidence.
  const output = createCaptureOutputDirectory();
  const report = { checks: [], liveAuth: false, output };
  const preview = await launchPreviewServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [name, viewport, mobile] of [
      ['desktop', { width: 1440, height: 900 }, false],
      ['compact-touch', { width: 405, height: 958 }, true]
    ]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
      try {
        await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(preview.baseUrl).origin
          ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.goto(`${preview.baseUrl}/?content=core-only&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'networkidle' });
        await waitForAuthenticatedFixtureReady(page);
        await page.waitForFunction(() => {
          const v = JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'));
          const stage = v?.runtime?.generation?.drawStage;
          return (stage?.complete || stage?.lifecyclePhase === 'settled') && v?.title?.progressPercent >= 95;
        }, null, { timeout: 30_000 });
        // Let the real renderer present the settled identity before sampling.
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const labels = await readPixels(page);
        await page.screenshot({ path: join(output, `${name}.png`) });
        report.checks.push({ name, labels, passed: pixelsReadable(labels) });
        assert(pixelsReadable(labels), `${name}: actual canvas identity backplate obscured: ${JSON.stringify(labels)}`);
        assert(labels.every((label) => label.depth >= 3 && label.background === '#060b0f'), `${name}: identity depth/style drift`);
        await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          scene.uiTexts.find((text) => text.visible && text.text === 'Welcome').setBackgroundColor('#ffffff');
        });
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const corrupted = await readPixels(page);
        const rejects = !pixelsReadable(corrupted);
        report.checks.push({ name: `${name}-negative-control`, labels: corrupted, passed: rejects });
        assert(rejects, `${name}: pixel assertion accepted a white backplate`);
        process.stdout.write(`PASS ${name}: rendered identity and negative control\n`);
      } finally { await context.close(); }
    }
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.message;
    throw error;
  } finally {
    writeFileSync(join(output, 'welcome-identity.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await stopPreviewServer(preview.child);
    process.stdout.write(`Evidence: ${output}\n`);
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
