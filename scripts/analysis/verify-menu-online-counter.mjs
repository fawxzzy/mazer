/** Real canvas regression for the main-menu online counter and the header icon order (MAZER-UI-024).
 *
 * Replaces verify-welcome-identity-readability.mjs: the signed-in username label that script measured
 * is gone from the header (the online counter took its spot). For each layout, on the real rendered
 * canvas with the synthetic authenticated QA fixture (no network, no live account):
 *   1. no "Welcome" text and no `header-identity` label exists;
 *   2. header controls (L6, Menu A): the one Menu button sits right of the title, and the retired settings,
 *      profile and leaderboard corner icons are not built while the dropdown is closed;
 *   3. with `__MAZER_QA__.setPresenceCount(7)` the counter is PAINTED in the leading slot between the left
 *      edge and the title: a differential measurement (the slot is rendered with the count and again with
 *      the count released, from the same settled scene state) must show counter ink only when the count is
 *      set, the ink must sit inside the slot (left of the title, in the header band) and overlap no header
 *      control;
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

// The counter is a mint dot plus muted light text (a copy of the website counter, MAZER-UI-033); count any
// pixel whose brightest channel clears the floor. The released-vs-shown differential cancels the backdrop.
const INK_FLOOR = [110, 110, 110];
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
    menu: byAction('Menu'),
    retired: ['Leaderboard', 'Account', 'Settings'].filter((action) => byAction(action) !== null),
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
    if (data[o + 3] > 200 && Math.max(data[o], data[o + 1], data[o + 2]) >= colorFloor[0]) {
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

// MAZER-QA-010: a single canvas read lands on whatever frame the compositor is on, so two reads taken one
// settle apart can straddle a backdrop or fade frame (the flake: "control delta must be exactly 0, got 4").
// Read the slot repeatedly until STABLE_READS consecutive reads agree on the ink count, then use that stable
// reading. A slot that never stabilises inside the timeout fails loudly with the series instead of flaking.
const STABLE_READS = 4;
const STABLE_TIMEOUT_MS = 10_000;
const measureStable = async (page, slot, floor) => {
  const series = [];
  const started = Date.now();
  let last = null;
  while (Date.now() - started < STABLE_TIMEOUT_MS) {
    last = await measureSlot(page, slot, floor);
    series.push(last.ink);
    if (series.length >= STABLE_READS && series.slice(-STABLE_READS).every((ink) => ink === last.ink)) {
      return last;
    }
    await page.waitForTimeout(90);
  }
  throw new Error(`slot ink never stabilised in ${STABLE_TIMEOUT_MS} ms: ${JSON.stringify(series)}`);
};

// MAZER-QA-010 (root cause): the menu demo loops build -> settled -> deconstruct -> build every few seconds, and the
// slot sits under the maze backdrop. A measurement series that straddles that cycle reads different backdrop ink
// ("ink remains in the slot after the count is released (74 vs 0)", "control delta must be exactly 0, got 4"); it
// is NOT the presence grace window (releasing the count resets the display to hidden immediately). Wait on the real
// condition: a page-side watcher records whether the lifecycle left 'settled' since it was armed, and a whole
// measurement series is accepted only when the scene was settled for all of it, otherwise it is re-run.
const armSettledWatch = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const phaseOf = () => JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'))?.runtime?.generation?.drawStage?.lifecyclePhase;
  window.__mazerSettledWatch = { left: false, backdropEpoch: scene.menuDemoCycleStartedAtMs };
  const watch = window.__mazerSettledWatch;
  const tick = () => {
    if (phaseOf() !== 'settled' || scene.menuDemoCycleStartedAtMs !== watch.backdropEpoch) { watch.left = true; }
    if (window.__mazerSettledWatch === watch) { requestAnimationFrame(tick); }
  };
  tick();
});
const waitSettled = (page) => page.waitForFunction(() => JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics'))?.runtime?.generation?.drawStage?.lifecyclePhase === 'settled', null, { timeout: 30_000 });
const stayedSettled = (page) => page.evaluate(() => window.__mazerSettledWatch.left === false);
const MAX_SERIES_ATTEMPTS = 8;
const measureSeries = async (page, slot, floor) => {
  for (let attempt = 1; attempt <= MAX_SERIES_ATTEMPTS; attempt += 1) {
    await waitSettled(page);
    await settle(page, 300);
    await armSettledWatch(page);
    let series = null;
    try {
      await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(undefined));
      await settle(page, 300);
      const hiddenA = await measureStable(page, slot, floor);
      await settle(page, 300);
      const hiddenB = await measureStable(page, slot, floor);
      await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(7));
      await settle(page, 700);
      const shown = await measureStable(page, slot, floor);
      await page.evaluate(() => window.__MAZER_QA__.setPresenceCount(undefined));
      await settle(page, 700);
      const hiddenAfter = await measureStable(page, slot, floor);
      series = { hiddenA, hiddenB, shown, hiddenAfter };
    } catch (error) {
      // L6: the counter slot now starts at the leading edge, where the demo maze build can pass through the
      // header band; a read that never stabilises is the same backdrop cycle, so re-run the whole series.
      if (attempt === MAX_SERIES_ATTEMPTS || !/never stabilised/.test(error.message)) {
        throw error;
      }
      continue;
    }
    // L6: the slot now reaches the leading edge, where a faint backdrop sparkle can move a few pixels between two
    // released reads even inside a settled cycle. Re-run such a series; the last attempt is returned as is, so the
    // exact-0 control assertion below still fails loudly when the slot never holds still.
    const controlHeld = series.hiddenB.ink === series.hiddenA.ink;
    if (await stayedSettled(page) && (controlHeld || attempt === MAX_SERIES_ATTEMPTS)) {
      return series;
    }
  }
  throw new Error(`the menu demo backdrop never held still for a whole measurement series in ${MAX_SERIES_ATTEMPTS} attempts`);
};

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
        await page.goto(`${preview.baseUrl}/?content=core-only&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 60_000 });
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
        assert(header.menu, `${name}: the Menu button is missing: ${JSON.stringify(header)}`);
        assert.deepEqual(header.retired, [], `${name}: a retired corner icon is still built while the dropdown is closed`);
        // Hit rectangles are grown to the 44 px touch floor, so place by centre.
        const centre = (r) => (r.left + r.right) / 2;
        assert(centre(header.menu) > header.title.right, `${name}: the Menu button is not right of the title`);

        // The counter is ~85 px wide at the leading edge. Cap the slot at 200 px so a wide desktop slot does not
        // pull in extra backdrop (a 1280 px slot from the edge to the title read a -5 px control delta once).
        const slot = { left: 0, right: Math.min(header.title.left, 200), top: 0, bottom: Math.max(header.menu.bottom, 64) };
        const { hiddenA, hiddenB, shown, hiddenAfter } = await measureSeries(page, slot, INK_FLOOR);
        const delta = shown.ink - hiddenA.ink;
        assert(delta >= MIN_COUNTER_DELTA_PIXELS, `${name}: the counter is not painted (ink ${shown.ink} shown vs ${hiddenA.ink} released, need delta >= ${MIN_COUNTER_DELTA_PIXELS})`);
        assert(shown.bounds, `${name}: no counter ink bounds`);
        assert(shown.bounds.left >= 0, `${name}: counter starts off the left edge`);
        assert(shown.bounds.right <= header.title.left, `${name}: counter runs into the title (${shown.bounds.right} > ${header.title.left})`);
        assert(shown.bounds.top >= 0 && shown.bounds.bottom <= 64, `${name}: counter is not inside the header band: ${JSON.stringify(shown.bounds)}`);
        assert(!overlaps(shown.bounds, header.menu), `${name}: counter overlaps the Menu button`);
        // Unknown again: the slot is empty again (no "0", no dash); measured inside the same settled series.
        assert(hiddenAfter.ink <= hiddenA.ink + 5, `${name}: ink remains in the slot after the count is released (${hiddenAfter.ink} vs ${hiddenA.ink})`);
        // Negative control: released vs released is exactly 0 ink difference, and fails the paint assertion.
        const controlDelta = hiddenB.ink - hiddenA.ink;
        assert.equal(controlDelta, 0, `${name}: control delta must be exactly 0, got ${controlDelta}`);
        assert(controlDelta < MIN_COUNTER_DELTA_PIXELS, `${name}: paint assertion would accept an empty slot`);
        await page.screenshot({ path: join(output, `${name}.png`) });
        report.checks.push({ name, delta, shownInk: shown.ink, releasedInk: hiddenA.ink, bounds: shown.bounds, passed: true });
        process.stdout.write(`PASS ${name}: header counter | title | menu button; counter ink delta ${delta} inside the slot, released slot empty, control delta ${controlDelta}\n`);
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
