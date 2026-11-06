/** Real canvas regression for the authenticated header identity (username).
 *
 * Contract (rewritten 2026-11-06; the script keeps its name, flags and exit
 * code): the old bottom-of-menu "Welcome" + username pair is GONE. The
 * verified username now sits top-left, immediately right of the profile icon.
 * For each layout this asserts, on the real rendered canvas:
 *   1. no visible "Welcome" text object exists anywhere on the menu;
 *   2. the username label (Phaser name "header-identity") is visible, in the
 *      header band, depth >= 3, to the RIGHT of the profile icon and LEFT of
 *      the title, overlapping neither, nor any of the 8 edge diamonds;
 *   3. its text is truncated with an ellipsis only when the room demands it
 *      (whole name on the wide layout) and is actually painted: bright label
 *      pixels exist inside its rect, and a negative control (label hidden)
 *      makes the same pixel assertion fail.
 * Uses only localhost and the synthetic authenticated QA fixture; no live
 * account or remote request is involved.
 * Run after building, or pass --skip-build to reuse that build. Pass
 * --base-url=http://localhost:PORT to test an already running dev server
 * instead of launching the preview server.
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

// EDGE_MARKER_MAX_EXTENT_PX (src/render/edgeMarkers.ts): worst-case kite half-extent.
const DIAMOND_EXTENT_PX = 10.5;
// Label colour is #d7f7ee; count pixels that are bright and minty-white.
const isLabelPixel = ([r, g, b, a]) => a > 200 && r >= 170 && g >= 215 && b >= 205;
const MIN_LABEL_PIXELS = 12;

const LAYOUTS = [
  { name: 'phone-390', viewport: { width: 390, height: 844 }, mobile: true, whole: false },
  { name: 'phone-320', viewport: { width: 320, height: 568 }, mobile: true, whole: false },
  { name: 'desktop-1280', viewport: { width: 1280, height: 720 }, mobile: false, whole: true }
];

const readHeader = (page) => page.evaluate((extent) => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const username = scene.authSnapshot.canonicalUsername?.trim();
  const diagnostics = JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'));
  const rect = (b) => ({ left: b.left ?? b.x, top: b.top ?? b.y, right: b.right ?? (b.x + b.width), bottom: b.bottom ?? (b.y + b.height) });
  const label = scene.uiTexts.find((text) => text.active && text.name === 'header-identity') ?? null;
  const welcome = scene.uiTexts.filter((text) => text.active && text.visible && /welcome/i.test(text.text)).map((text) => text.text);
  const account = scene.uiButtons.find((button) => button.semanticAction === 'Account');
  const stations = scene.resolveLegacyEdgeStations().map((station) => ({
    id: station.id,
    left: station.x - extent, top: station.y - extent, right: station.x + extent, bottom: station.y + extent
  }));
  let labelState = null;
  if (label !== null) {
    const bounds = label.getBounds();
    const canvas = document.querySelector('canvas');
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    // Phaser bounds are logical game coordinates, not CSS page coordinates.
    const sx = canvas.width / scene.scale.gameSize.width;
    const sy = canvas.height / scene.scale.gameSize.height;
    const x0 = Math.max(0, Math.floor(bounds.left * sx));
    const y0 = Math.max(0, Math.floor(bounds.top * sy));
    const w = Math.max(1, Math.ceil(bounds.width * sx));
    const h = Math.max(1, Math.ceil(bounds.height * sy));
    const data = ctx.getImageData(x0, y0, w, h).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
    }
    labelState = {
      text: label.text, visible: label.visible, depth: label.depth, alpha: label.alpha,
      rect: rect(bounds), pixels
    };
  }
  return {
    username,
    welcome,
    label: labelState,
    account: account ? rect(account.bounds) : null,
    title: rect(diagnostics.title.bounds),
    stations,
    buttons: diagnostics.buttons.map((b) => ({ action: b.semanticAction, ...rect(b.bounds) }))
  };
}, DIAMOND_EXTENT_PX);

const paintedPixels = (label) => (label?.visible ? label.pixels.filter(isLabelPixel).length : 0);
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const assertHeaderIdentity = (name, whole, state) => {
  assert.deepEqual(state.welcome, [], `${name}: a Welcome label is still rendered: ${JSON.stringify(state.welcome)}`);
  assert(state.username && state.username.length > 0, `${name}: fixture has no canonical username`);
  const { label } = state;
  assert(label && label.visible, `${name}: header identity label is missing or hidden`);
  assert(label.depth >= 3, `${name}: identity depth ${label.depth} is below the menu controls`);
  assert(label.rect.top >= 0 && label.rect.bottom <= 64, `${name}: identity is not in the header band: ${JSON.stringify(label.rect)}`);
  assert(state.account, `${name}: profile icon (Account) not found`);
  assert(label.rect.left >= state.account.right, `${name}: identity starts left of the profile icon right edge`);
  assert(label.rect.left - state.account.right <= 16, `${name}: identity is not immediately right of the profile icon`);
  assert(!overlaps(label.rect, state.account), `${name}: identity overlaps the profile icon`);
  assert(label.rect.right <= state.title.left, `${name}: identity runs into the title (${label.rect.right} > ${state.title.left})`);
  assert(!overlaps(label.rect, state.title), `${name}: identity overlaps the title`);
  for (const button of state.buttons.filter((b) => b.action && b.action !== 'Start' && b.action !== 'Account')) {
    assert(!overlaps(label.rect, button), `${name}: identity overlaps the ${button.action} control`);
  }
  for (const station of state.stations) {
    assert(!overlaps(label.rect, station), `${name}: identity overlaps edge diamond ${station.id}`);
  }
  if (whole) {
    assert.equal(label.text, state.username, `${name}: wide layout must show the whole username`);
  } else {
    assert(label.text === state.username || label.text.endsWith('…'), `${name}: narrow text must be whole or ellipsized, got "${label.text}"`);
    assert(Array.from(label.text).length >= 3, `${name}: truncated identity is not readable: "${label.text}"`);
  }
  assert(paintedPixels(label) >= MIN_LABEL_PIXELS, `${name}: identity text is not painted on the canvas (${paintedPixels(label)} bright pixels)`);
};

const main = async () => {
  const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='));
  const externalBaseUrl = baseUrlArg ? baseUrlArg.slice('--base-url='.length) : null;
  if (externalBaseUrl === null && !process.argv.includes('--skip-build')) {
    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    } else execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  // Reuse the reviewed exclusive-create helper; never overwrite/delete evidence.
  const output = createCaptureOutputDirectory();
  const report = { checks: [], liveAuth: false, output };
  const preview = externalBaseUrl === null ? await launchPreviewServer() : { baseUrl: externalBaseUrl, child: null };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const { name, viewport, mobile, whole } of LAYOUTS) {
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
        const state = await readHeader(page);
        await page.screenshot({ path: join(output, `${name}.png`) });
        report.checks.push({ name, label: state.label && { ...state.label, pixels: undefined, painted: paintedPixels(state.label) }, welcome: state.welcome, passed: true });
        assertHeaderIdentity(name, whole, state);

        // Negative control: with the label hidden, the very same pixel assertion must fail.
        await page.evaluate(() => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          scene.uiTexts.find((text) => text.active && text.name === 'header-identity').setVisible(false);
        });
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const hidden = await readHeader(page);
        // A hidden label contributes no painted pixels; re-measure the same rect from the canvas.
        const stillPainted = await page.evaluate(({ rect, color }) => {
          const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const canvas = document.querySelector('canvas');
          const copy = document.createElement('canvas');
          copy.width = canvas.width; copy.height = canvas.height;
          const ctx = copy.getContext('2d');
          ctx.drawImage(canvas, 0, 0);
          const sx = canvas.width / scene.scale.gameSize.width;
          const sy = canvas.height / scene.scale.gameSize.height;
          const data = ctx.getImageData(Math.floor(rect.left * sx), Math.floor(rect.top * sy),
            Math.max(1, Math.ceil((rect.right - rect.left) * sx)), Math.max(1, Math.ceil((rect.bottom - rect.top) * sy))).data;
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 200 && data[i] >= color[0] && data[i + 1] >= color[1] && data[i + 2] >= color[2]) count += 1;
          }
          return count;
        }, { rect: state.label.rect, color: [170, 215, 205] });
        const rejects = hidden.label?.visible !== true && stillPainted < MIN_LABEL_PIXELS;
        report.checks.push({ name: `${name}-negative-control`, painted: stillPainted, passed: rejects });
        assert(rejects, `${name}: pixel assertion accepted a hidden label (${stillPainted} bright pixels)`);
        process.stdout.write(`PASS ${name}: header identity "${state.label.text}" top-left, no Welcome, negative control\n`);
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
    if (preview.child) {
      await stopPreviewServer(preview.child);
    }
    process.stdout.write(`Evidence: ${output}\n`);
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
