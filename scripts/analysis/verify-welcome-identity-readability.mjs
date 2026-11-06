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
 *      (whole name on the wide layout) and is actually painted. "Painted" is a
 *      DIFFERENTIAL measurement: the label rect is rendered twice from the
 *      exact same scene state (game loop asleep, no update between the two
 *      renders, so same frame / seed / clock), once with the label visible and
 *      once hidden, and the delta is the number of label-ink pixels present
 *      only in the visible render. Backdrop stars and maze bleed are identical
 *      in both renders, so they cancel; an absolute bright-pixel count could
 *      not tell them from ink (Linux CI measured 16 bright pixels in the
 *      hidden label's box at 320). Negative control: hidden vs hidden is
 *      measured the same way, must be exactly 0, and must fail the same
 *      assertion.
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
// The label is #d7f7ee. Thin small-size glyphs anti-alias to a lower peak on
// some platforms (the Linux CI fallback font painted only 4 pixels at the
// strict 170/215/205 floor at 320 px), so a pixel counts as label ink when it is
// clearly bright against the dark header (the stroke is near black).
// With the self-hosted Space Grotesk (thin 14px glyphs + 2px dark stroke) the
// strict floor yields only 28/9/108 pixels at 390/320/1280 (measured 2026-11-06,
// Windows Chromium), so the loosened floor stays; it is now font-deterministic
// (552/304/808 pixels) rather than dependent on an OS fallback face.
const LABEL_PIXEL_FLOOR = [120, 150, 140];
const isLabelPixel = ([r, g, b, a]) => a > 200 && r >= LABEL_PIXEL_FLOOR[0] && g >= LABEL_PIXEL_FLOOR[1] && b >= LABEL_PIXEL_FLOOR[2];
const STRICT_LABEL_PIXEL_FLOOR = [170, 215, 205];
const isStrictLabelPixel = ([r, g, b, a]) => a > 200 && r >= STRICT_LABEL_PIXEL_FLOOR[0] && g >= STRICT_LABEL_PIXEL_FLOOR[1] && b >= STRICT_LABEL_PIXEL_FLOOR[2];
// Minimum label-ink delta (visible render minus hidden render of the same
// frame). Measured locally 2026-11-06 (Windows Chromium, Space Grotesk, dpr 2):
// 381 / 304 / 808 at 390 / 320 / 1280 (the hidden render still has 16 bright
// background pixels at 390, which the differential cancels). The floor is ~1/5
// of the weakest measured delta (values are
// printed per layout and written to welcome-identity.json) and far above the
// control delta, which is exactly 0 by construction.
const MIN_LABEL_DELTA_PIXELS = 60;

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

/**
 * Renders the label rect with the label visible and hidden from one frozen
 * scene state and counts ink that exists only when the label is visible.
 * `controlDelta` repeats the measurement with the label hidden in BOTH renders.
 */
const measureLabelDelta = (page, rect, floor) => page.evaluate(({ rect: box, floor: colorFloor }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.getScene('MenuScene');
  const label = scene.uiTexts.find((text) => text.active && text.name === 'header-identity');
  const canvas = document.querySelector('canvas');
  const sx = canvas.width / scene.scale.gameSize.width;
  const sy = canvas.height / scene.scale.gameSize.height;
  const x0 = Math.max(0, Math.floor(box.left * sx));
  const y0 = Math.max(0, Math.floor(box.top * sy));
  const w = Math.max(1, Math.ceil((box.right - box.left) * sx));
  const h = Math.max(1, Math.ceil((box.bottom - box.top) * sy));
  const probe = document.createElement('canvas');
  probe.width = canvas.width;
  probe.height = canvas.height;
  const ctx = probe.getContext('2d');
  const wasVisible = label.visible;
  const renderNow = () => {
    game.renderer.preRender();
    scene.sys.render(game.renderer);
    game.renderer.postRender();
  };
  game.loop.sleep();
  try {
    // Re-render the current display list as-is: no scene update runs, so the
    // renders differ only in the label's visibility.
    const ink = (visible) => {
      label.setVisible(visible);
      renderNow();
      ctx.clearRect(0, 0, probe.width, probe.height);
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(x0, y0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i += 1) {
        const o = i * 4;
        mask[i] = data[o + 3] > 200 && data[o] >= colorFloor[0] && data[o + 1] >= colorFloor[1] && data[o + 2] >= colorFloor[2] ? 1 : 0;
      }
      return mask;
    };
    const only = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] === 1 && b[i] === 0) n += 1;
      }
      return n;
    };
    const count = (a) => a.reduce((n, v) => n + v, 0);
    const shown = ink(true);
    const hidden = ink(false);
    const hiddenAgain = ink(false);
    return { shownInk: count(shown), hiddenInk: count(hidden), delta: only(shown, hidden), controlDelta: only(hiddenAgain, hidden) };
  } finally {
    label.setVisible(wasVisible);
    renderNow();
    game.loop.wake();
  }
}, { rect, floor });

const assertLabelDelta = (name, measured, label) => {
  assert(
    measured.delta >= MIN_LABEL_DELTA_PIXELS,
    `${name}: identity text is not painted on the canvas (label-only ink delta ${measured.delta} < ${MIN_LABEL_DELTA_PIXELS}; visible render ${measured.shownInk} bright / hidden render ${measured.hiddenInk} bright at floor ${LABEL_PIXEL_FLOOR.join('/')}, text "${label?.text}")`
  );
};
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const assertHeaderIdentity = (name, whole, state, measured) => {
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
  assertLabelDelta(name, measured, label);
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
        report.checks.push({ name, label: state.label && { ...state.label, pixels: undefined, painted: paintedPixels(state.label), paintedStrict: state.label.pixels.filter(isStrictLabelPixel).length }, welcome: state.welcome, passed: true });
        const measured = await measureLabelDelta(page, state.label.rect, LABEL_PIXEL_FLOOR);
        report.checks[report.checks.length - 1].delta = measured;
        assertHeaderIdentity(name, whole, state, measured);

        // Negative control: hidden vs hidden, measured identically, is exactly 0 by
        // construction and must be rejected by the very same assertion.
        assert.equal(measured.controlDelta, 0, `${name}: control delta must be exactly 0 (same frame, label hidden twice), got ${measured.controlDelta}`);
        let controlRejected = false;
        try {
          assertLabelDelta(name, { ...measured, delta: measured.controlDelta }, state.label);
        } catch {
          controlRejected = true;
        }
        report.checks.push({ name: `${name}-negative-control`, delta: measured.controlDelta, hiddenInk: measured.hiddenInk, passed: controlRejected });
        assert(controlRejected, `${name}: label-delta assertion accepted a hidden label (control delta ${measured.controlDelta})`);
        process.stdout.write(`PASS ${name}: header identity "${state.label.text}" top-left, no Welcome, label-only ink delta ${measured.delta} (shown ${measured.shownInk} / hidden ${measured.hiddenInk} bright), control delta ${measured.controlDelta}
`);
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
