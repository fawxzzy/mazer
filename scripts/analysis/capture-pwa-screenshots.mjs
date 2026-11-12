/**
 * Captures the web-app-manifest `screenshots` (MAZER-PWA-002) from the real game.
 *
 * Headless Chromium, same page-level unlock the other capture scripts use:
 * `runtimeDiagnostics=1` exposes `window.__MAZER_QA__`, `authFixture=authenticated`
 * lifts the sign-in gate, and the install gate allows localhost. A fixed
 * `mazeSeed` keeps the maze identical between runs. Nothing is written to any
 * account.
 *
 * Output (public/screenshots/, NOT precached, see vite.config.ts note): see PWA_SCREENSHOT_SHOTS.
 *
 * Usage (dev server already running):
 *   node scripts/analysis/capture-pwa-screenshots.mjs --base-url=http://127.0.0.1:5625
 * Without --base-url it builds and previews on the default port like the sibling scripts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

export const PWA_SCREENSHOT_SHOTS = Object.freeze([
  { name: 'narrow-play-l30', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, level: 30 },
  { name: 'narrow-play-l100', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, level: 100 },
  { name: 'wide-play-l30', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, level: 30 },
  { name: 'wide-play-l100', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, level: 100 }
]);

// previewLevel is the sandboxed QA route: it starts straight into play at level N, writes nothing to any
// account, and (unlike authFixture on the menu) shows no fixture banner. mazeSeed keeps the maze stable.
const routeFor = (level) => `/?runtimeDiagnostics=1&previewLevel=${level}&mazeSeed=3749`;
const OUT_DIR = resolve(REPO_ROOT, 'public', 'screenshots');

const waitFor = async (page, fn, description, timeoutMs = 90_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await page.evaluate(fn).catch(() => false)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for: ${description}`);
};

const capture = async (browser, baseUrl, shot) => {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.deviceScaleFactor,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${routeFor(shot.level)}`, { waitUntil: 'load', timeout: 30_000 });
    await waitFor(page, () => {
      const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
      return !!scene && scene.menuStaticDrawLifecyclePhase === 'settled' && scene.isLegacyPlayLifecycleInputLocked() === false;
    }, 'play settled and input unlocked');
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(OUT_DIR, `${shot.name}.png`), type: 'png' });
  } finally {
    await context.close();
  }
};

const main = async () => {
  const args = parseCliArgs();
  const explicit = typeof args['base-url'] === 'string' ? normalizeBaseUrl(args['base-url']) : null;
  mkdirSync(OUT_DIR, { recursive: true });
  let preview = null;
  if (!explicit) {
    execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'],
      { cwd: REPO_ROOT, stdio: 'inherit' });
    preview = await launchPreviewServer({ requestedBaseUrl: normalizeBaseUrl(DEFAULT_BASE_URL), previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  }
  const baseUrl = explicit ?? preview.baseUrl;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of PWA_SCREENSHOT_SHOTS) {
      // eslint-disable-next-line no-await-in-loop
      await capture(browser, baseUrl, shot);
      console.log(`captured ${shot.name}`);
    }
  } finally {
    await browser.close();
    if (preview) await stopPreviewServer(preview.child);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
