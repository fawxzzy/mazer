#!/usr/bin/env node
/**
 * Real-browser capture + assertions for the Leaderboard sheet (2026-11-06 redesign).
 *
 * Drives the running app through the dev/test-only leaderboard fixture
 * (`?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=<shape>`,
 * see src/legacy-runtime/legacyLeaderboardFixture.ts) at 390x844, 1280x720 and
 * 320x568, opens the sheet with a real click on the header Leaderboard control,
 * screenshots each state and asserts: no console errors, every interactive control
 * is >= 44 px, the exit is the primary `Back to Menu` row, Escape closes the sheet,
 * and a tap on the scrim outside the card closes it.
 *
 * Usage: node scripts/analysis/capture-leaderboard-sheet.mjs --base http://127.0.0.1:4261/ --out <dir>
 * (start `npm run dev -- --port 4261` first). Exits non-zero on a failed check.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const base = readArg('base', 'http://127.0.0.1:4173/');
const outDir = resolve(readArg('out', 'tmp/leaderboard-sheet-capture'));
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = { '390x844': [390, 844, 2], '1280x720': [1280, 720, 1], '320x568': [320, 568, 2] };
const SHAPES = ['top3', 'rank57', 'empty', 'loading', 'error', 'offline', 'signed-out'];
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) {
    failures.push(label);
  }
};

const browser = await chromium.launch({ headless: true });

const openSheet = async (viewportKey, shape) => {
  const [width, height, deviceScaleFactor] = VIEWPORTS[viewportKey];
  const context = await browser.newContext({ deviceScaleFactor, hasTouch: width < 720, viewport: { height, width } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=${shape}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => (window.__MAZER_GAME__?.scene?.getScenes?.(true) ?? []).some(
      (scene) => Array.isArray(scene?.uiButtons) && scene.uiButtons.some((button) => button?.semanticAction === 'Leaderboard')
    ),
    null,
    { timeout: 60_000 }
  );
  await wait(1200);
  return { context, errors, page };
};

const sceneState = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScenes(true).find((entry) => Array.isArray(entry?.uiButtons));
  return {
    buttons: scene.uiButtons.map((button) => ({
      bounds: button.bounds ? { height: button.bounds.height, width: button.bounds.width } : null,
      text: button.text
    })),
    overlay: scene.overlay,
    texts: scene.uiTexts.filter((text) => text.active).map((text) => text.text)
  };
});

const clickButton = async (page, label) => {
  const point = await page.evaluate((target) => {
    const scene = window.__MAZER_GAME__.scene.getScenes(true).find((entry) => Array.isArray(entry?.uiButtons));
    const button = scene.uiButtons.find((entry) => entry?.semanticAction === target || entry?.text === target);
    if (!button?.bounds) {
      return null;
    }
    return { x: button.bounds.left + (button.bounds.width / 2), y: button.bounds.top + (button.bounds.height / 2) };
  }, label);
  if (!point) {
    throw new Error(`no button ${label}`);
  }
  await page.mouse.click(point.x, point.y);
};

try {
  for (const viewportKey of Object.keys(VIEWPORTS)) {
    for (const shape of SHAPES) {
      const { context, errors, page } = await openSheet(viewportKey, shape);
      await clickButton(page, 'Leaderboard');
      await wait(shape === 'loading' ? 500 : 1200);
      const state = await sceneState(page);
      const tag = `${viewportKey} ${shape}`;
      await page.screenshot({ path: resolve(outDir, `leaderboard-${shape}-${viewportKey}.png`) });
      check(`${tag}: leaderboard overlay is open`, state.overlay === 'leaderboard', `overlay=${state.overlay}`);
      check(`${tag}: exit is the primary Back to Menu row (no X / arrow)`, state.buttons.some((button) => button.text === 'Back to Menu'));
      const small = state.buttons.filter((button) => button.bounds && (button.bounds.height < 44 || button.bounds.width < 44));
      check(`${tag}: every interactive control is >= 44 px`, small.length === 0, small.map((button) => button.text).join(','));
      if (shape === 'top3' || shape === 'rank57') {
        check(`${tag}: pinned You row text is present`, state.texts.includes('YOU'));
        check(`${tag}: rank | player | level columns`, ['RANK', 'PLAYER', 'LEVEL'].every((label) => state.texts.includes(label)));
      }
      if (shape === 'rank57') {
        check(`${tag}: You row shows rank 57 while the list is the top 50`, state.texts.includes('57'));
      }
      check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
      if (shape === 'top3' && viewportKey === '390x844') {
        await page.keyboard.press('Escape');
        await wait(500);
        check(`${tag}: Escape closes the sheet`, (await sceneState(page)).overlay === 'none');
        await clickButton(page, 'Leaderboard');
        await wait(900);
        await page.mouse.click(4, 4);
        await wait(500);
        check(`${tag}: a tap on the scrim outside the card closes the sheet`, (await sceneState(page)).overlay === 'none');
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures.length === 0 ? `\nAll checks passed. Screenshots: ${outDir}` : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
