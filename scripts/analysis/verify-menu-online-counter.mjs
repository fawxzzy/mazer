/** Real canvas regression for the main-menu online counter and the header icon order (MAZER-UI-024).
 *
 * Replaces verify-welcome-identity-readability.mjs: the signed-in username label that script measured
 * is gone from the header (the online counter took its spot). For each layout, on the real rendered
 * canvas with the synthetic authenticated QA fixture (no network, no live account):
 *   1. no "Welcome" text and no `header-identity` label exists;
 *   2. icon order: Leaderboard is left of the title, Account (profile) is right of the title and left of
 *      Settings (the profile and leaderboard icons are swapped relative to before);
 *   3. with `__MAZER_QA__.setPresenceCount(7)` the counter is PAINTED in the slot between the leaderboard
 *      icon and the title: a differential measurement (the slot is rendered with the count and again with
 *      the count released, from the same settled scene state) must show counter ink only when the count is
 *      set, the ink must sit inside the slot (right of the leaderboard icon, left of the title, in the header
 *      band) and overlap no header control;
 *   4. with the count released (null/unknown) nothing is painted in the slot (no "0", no dash).
 * Negative control: released vs released is measured identically and must be exactly 0 ink.
 * Run after building, or pass --skip-build. Pass --base-url=http://localhost:PORT for a running dev server.
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

// The counter chips are mint-white (rim) over a mint fill; count bright minty pixels.
const INK_FLOOR = [150, 200, 190];
const MIN_COUNTER_DELTA_PIXELS = 40;

const LAYOUTS = [
  { name: 'phone-390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'phone-360', viewport: { width: 360, height: 740 }, mobile: true },
  { name: 'desktop-1280', viewport: { width: 1280, height: 720 }, mobile: false }
];

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const readHeader = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const diagnostics = JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'));
  const rect = (b) => ({ left: b.left ?? b.x, top: b.top ?? b.y, right: b.right ?? (b.x + b.width), bottom: b.bottom ?? (b.y + b.height) });
  const byAction = (action) => {
    const button = scene.uiButtons.find((candidate) => candidate.semanticAction === action);
    return button ? rect(button.bounds) : null;
  };
  return {
    welcome: scene.uiTexts.filter((text) => text.active && text.visible && /welcome/i.test(text.text)).map((text) => text.text),
    identityLabel: scene.uiTexts.some((text) => text.active && text.name === 'header-identity'),
    leaderboard: byAction('Leaderboard'),
    account: byAction('Account'),
    settings: byAction('Settings'),
    title: rect(diagnostics.title.bounds)
  };
});

// Mint-white ink mask of a canvas region, in canvas pixels.
const measureSlot = (page, slot, floor) => page.evaluate(({ box, colorFloor }) => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
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
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(x0, y0, w, h).data;
  let ink = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    if (data[o + 3] > 200 && data[o] >= colorFloor[0] && data[o + 1] >= colorFloor[1] && data[o + 2] >= colorFloor[2]) {
      ink += 1;
      const x = i % w;
      const y = Math.floor(i / w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return {
    ink,
    // Ink bounding box in css px (game coordinates); null when there is no ink.
    bounds: ink === 0 ? null : {
      left: box.left + (minX / sx), right: box.left + ((maxX + 1) / sx), top: box.top + (minY / sy), bottom: box.top + ((maxY + 1) / sy)
    }
  };
}, { box: slot, colorFloor: floor });

const settle = (page, ms = 1700) => page.evaluate((wait) => new Promise((done) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), wait)), ms);

const main = async () => {
  const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='));
  const externalBaseUrl = baseUrlArg ? baseUrlArg.slice('--base-url='.length) : null;
  if (externalBaseUrl === null && !process.argv.includes('--skip-build')) {
    if (process.platform === 'win32') {
      execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    } else execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  const output = createCaptureOutputDirectory();
  const report = { checks: [], liveAuth: false, output };
  const preview = externalBaseUrl === null ? await launchPreviewServer() : { baseUrl: externalBaseUrl, child: null };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const { name, viewport, mobile } of LAYOUTS) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', reducedMotion: 'reduce' });
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
        await settle(page, 300);
        const header = await readHeader(page);

        assert.deepEqual(header.welcome, [], `${name}: a Welcome label is rendered: ${JSON.stringify(header.welcome)}`);
        assert.equal(header.identityLabel, false, `${name}: the retired header-identity username label is still built`);
        assert(header.leaderboard && header.account && header.settings, `${name}: a header control is missing: ${JSON.stringify(header)}`);
        // Hit rectangles are grown to the 44 px touch floor and may touch neighbours, so order by centre.
        const centre = (r) => (r.left + r.right) / 2;
        assert(centre(header.leaderboard) < header.title.left, `${name}: Leaderboard is not left of the title`);
        assert(centre(header.account) > header.title.right, `${name}: Account (profile) is not right of the title`);
        assert(centre(header.account) < centre(header.settings), `${name}: Account (profile) is not left of Settings`);
        assert(centre(header.leaderboard) < centre(header.account), `${name}: icon order is not leaderboard-first`);

        const slot = { left: header.leaderboard.right, right: header.title.left, top: 0, bottom: Math.max(header.leaderboard.bottom, 64) };
        // Released: nothing in the slot.
        await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(undefined));
        await settle(page);
        const hiddenA = await measureSlot(page, slot, INK_FLOOR);
        const hiddenB = await measureSlot(page, slot, INK_FLOOR);
        // Counted: painted in the slot.
        await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(7));
        await settle(page);
        const shown = await measureSlot(page, slot, INK_FLOOR);
        const delta = shown.ink - hiddenA.ink;
        assert(delta >= MIN_COUNTER_DELTA_PIXELS, `${name}: the counter is not painted (ink ${shown.ink} shown vs ${hiddenA.ink} released, need delta >= ${MIN_COUNTER_DELTA_PIXELS})`);
        assert(shown.bounds, `${name}: no counter ink bounds`);
        assert(shown.bounds.left >= header.leaderboard.right, `${name}: counter starts left of the leaderboard icon right edge`);
        assert(shown.bounds.right <= header.title.left, `${name}: counter runs into the title (${shown.bounds.right} > ${header.title.left})`);
        assert(shown.bounds.top >= 0 && shown.bounds.bottom <= 64, `${name}: counter is not inside the header band: ${JSON.stringify(shown.bounds)}`);
        for (const control of [header.leaderboard, header.account, header.settings]) {
          assert(!overlaps(shown.bounds, control), `${name}: counter overlaps a header control`);
        }
        // Unknown again: the slot is empty after the grace window (no "0", no dash).
        await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(undefined));
        await settle(page);
        const hiddenAfter = await measureSlot(page, slot, INK_FLOOR);
        assert(hiddenAfter.ink <= hiddenA.ink + 5, `${name}: ink remains in the slot after the count is released (${hiddenAfter.ink} vs ${hiddenA.ink})`);
        // Negative control: released vs released is exactly 0 ink difference, and fails the paint assertion.
        const controlDelta = hiddenB.ink - hiddenA.ink;
        assert.equal(controlDelta, 0, `${name}: control delta must be exactly 0, got ${controlDelta}`);
        assert(controlDelta < MIN_COUNTER_DELTA_PIXELS, `${name}: paint assertion would accept an empty slot`);
        await page.screenshot({ path: join(output, `${name}.png`) });
        report.checks.push({ name, delta, shownInk: shown.ink, releasedInk: hiddenA.ink, bounds: shown.bounds, passed: true });
        process.stdout.write(`PASS ${name}: icon order leaderboard | title | profile, settings; counter ink delta ${delta} inside the slot, released slot empty, control delta ${controlDelta}\n`);
      } finally { await context.close(); }
    }
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.message;
    throw error;
  } finally {
    writeFileSync(join(output, 'menu-online-counter.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    if (preview.child) {
      await stopPreviewServer(preview.child);
    }
    process.stdout.write(`Evidence: ${output}\n`);
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
