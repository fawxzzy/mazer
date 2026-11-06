/**
 * Real-browser, REAL-CLOCK regression: after the player reaches the goal the maze must visibly
 * DECONSTRUCT tile by tile (and the next level's intro must follow it).
 *
 * Why this exists: the Chip board floor is drawn from a rank mask over a baked canvas
 * (src/render/boardTileLayer.ts). The deconstruct arms the scene's row counter as `null`
 * while the tile counter counts DOWN, and the mask read `rowLimit === null` as "show every
 * tile". The state machine was fine (menuStaticDrawTilesVisible went N -> 0, every unit
 * test green) but the board stayed fully drawn until the next maze replaced it, so the
 * live app showed no deconstruction at all. Nothing in the suite looked at the PIXELS
 * during the outro; this script does, on the real clock, through the real keyboard path.
 *
 * What it does (Chromium via Playwright, built preview server, no fake clock, no stepping):
 *   1. loads ?authFixture=authenticated with cleared localStorage (level 1 = straight corridor)
 *      and confirms the "Player Skill Lv 01" diagnostics label;
 *   2. presses Start with a real Enter key, waits for input to unlock;
 *   3. drives the player to the goal by HOLDING the arrow key (repeated real keydown events,
 *      like OS key repeat);
 *   4. samples every animation frame (in-page rAF) and a screenshot every ~150 ms for the
 *      whole outro, and asserts, at 390x844 AND 1280x720:
 *        - the lifecycle reaches 'deconstructing' and the tile counter falls from N to 0;
 *        - the DRAWN floor (opaque pixels of the composed board texture) falls with it:
 *          full at the start, non-increasing, many distinct steps, <= 5% at the end;
 *        - the SCREEN agrees: board-region lit pixels in screenshots fall from full to ~empty;
 *        - the visible dissolve takes roughly the nominal 1.8-3.0 s (+ the 400 ms beam-out);
 *        - the next level's intro then builds tile by tile (the first frames after the
 *          outro show a growing floor, never a pre-filled one).
 *
 * Usage: node scripts/analysis/verify-outro-deconstruct.mjs [--skip-build]
 *        [--evidence-dir DIR]   (keeps the screenshots + a JSON trace)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import { decodePng } from '../visual/lib/png-codec.mjs';

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

let passCount = 0;
let failCount = 0;
const failures = [];
const check = (label, condition, detail) => {
  if (condition) {
    passCount += 1;
    process.stderr.write(`PASS: ${label}\n`);
  } else {
    failCount += 1;
    failures.push(label);
    process.stderr.write(`FAIL: ${label} -- ${detail}\n`);
  }
};

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x720', width: 1280, height: 720 }
];
const SCREENSHOT_EVERY_MS = 150;
const LEVEL_1_LABEL = 'Player Skill Lv 01';

// In-page recorder: one sample per animation frame, from the scene's own state and the pixels it
// actually composited for the board floor.
const INSTALL_RECORDER = () => {
  const scene = () => window.__MAZER_GAME__.scene.getScene('MenuScene');
  const countOpaque = (canvas) => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 3; i < data.length; i += 16) { // every 4th pixel is plenty for a ratio
        if (data[i] > 24) { count += 1; }
      }
      return count;
    } catch { return null; }
  };
  const read = () => {
    const s = scene();
    const layer = s.boardTileLayer;
    const canvas = layer?.image?.texture?.getSourceImage?.();
    return {
      t: performance.now(),
      phase: s.menuStaticDrawLifecyclePhase,
      mode: s.mode,
      overlay: s.overlay,
      tilesVisible: s.menuStaticDrawTilesVisible,
      tileCount: s.menuStaticDrawTileOrder.length,
      drawn: canvas ? countOpaque(canvas) : null,
      imageVisible: layer?.image?.visible === true,
      player: { x: s.player.x, y: s.player.y },
      goal: { x: s.maze.goal.x, y: s.maze.goal.y },
      locked: s.isLegacyPlayLifecycleInputLocked()
    };
  };
  const trace = [];
  window.__outroTrace = trace;
  window.__outroRead = read;
  const loop = () => {
    trace.push(read());
    window.__outroRaf = requestAnimationFrame(loop);
  };
  window.__outroRaf = requestAnimationFrame(loop);
};

/** Lit (non-background) pixels inside the board rect of a PNG screenshot. */
const countLit = (png, rect) => {
  const { width, height, data } = png;
  let count = 0;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = ((y * width) + x) * 4;
      // Floor tiles are teal/cyan chips on a near-black field: green+blue channels well above the background.
      if (data[i + 1] > 70 && data[i + 2] > 70 && data[i] < 160) { count += 1; }
    }
  }
  return count;
};

const runViewport = async (browser, baseUrl, viewport, evidenceDir) => {
  const label = viewport.name;
  const mobile = viewport.width <= 430;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') { pageErrors.push(message.text()); } });

  const url = `${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated`;
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
    return s.mode === 'menu' && s.menuStaticDrawLifecyclePhase === 'settled';
  }, null, { timeout: 90_000 });

  // Real Start: focus the canvas and press a real Enter key.
  await page.evaluate(() => document.querySelector('canvas').focus());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
    return s.mode === 'play' && s.menuStaticDrawLifecyclePhase === 'settled' && !s.isLegacyPlayLifecycleInputLocked();
  }, null, { timeout: 90_000, polling: 50 });

  const labels = await page.evaluate(() => (document.documentElement.getAttribute('data-mazer-visual-diagnostics') || '').match(/(Player|AI) Skill Lv \d+/g));
  check(`${label}: progression diagnostics read "${LEVEL_1_LABEL}" (cleared localStorage, level 1)`, Array.isArray(labels) && labels.includes(LEVEL_1_LABEL), JSON.stringify(labels));

  const route = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
  const path = route?.found ? route.path : null;
  check(`${label}: the QA bridge reports a solvable route`, Array.isArray(path) && path.length >= 2, JSON.stringify(route));
  if (!Array.isArray(path) || path.length < 2) {
    await context.close();
    return;
  }
  const dx = path[1].x - path[0].x;
  const dy = path[1].y - path[0].y;
  const key = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft' : dy === 1 ? 'ArrowDown' : 'ArrowUp';

  const bounds = await page.evaluate(() => {
    try { return JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics') || '{}').board?.bounds ?? null; } catch { return null; }
  });

  await page.evaluate(INSTALL_RECORDER);
  const startedAt = Date.now();
  const shots = [];
  let landedAt = null;
  let shotIndex = 0;
  let lastShotAt = 0;
  const takeShot = async () => {
    const buffer = await page.screenshot({ type: 'png' });
    const state = await page.evaluate(() => window.__outroRead());
    const png = decodePng(buffer);
    const rect = bounds
      ? { x: bounds.x ?? bounds.left ?? 0, y: bounds.y ?? bounds.top ?? 0, width: bounds.width ?? png.width, height: bounds.height ?? png.height }
      : { x: 0, y: 0, width: png.width, height: png.height };
    const entry = { ms: landedAt === null ? null : Date.now() - landedAt, phase: state.phase, tilesVisible: state.tilesVisible, tileCount: state.tileCount, lit: countLit(png, rect) };
    shots.push(entry);
    if (evidenceDir) {
      const name = `${label}_${String(shotIndex).padStart(3, '0')}_${String(entry.ms ?? 0).padStart(5, '0')}ms_${entry.phase}.png`;
      writeFileSync(join(evidenceDir, name), buffer);
    }
    shotIndex += 1;
    lastShotAt = Date.now();
  };

  // Hold the arrow key (repeated keydown = OS auto-repeat) until the goal is reached and the outro arms.
  await page.keyboard.down(key);
  while (Date.now() - startedAt < 90_000) {
    const state = await page.evaluate(() => window.__outroRead());
    if (landedAt === null && (state.phase === 'deconstructing' || (state.player.x === state.goal.x && state.player.y === state.goal.y))) {
      landedAt = Date.now();
      await page.keyboard.up(key);
      break;
    }
    await page.keyboard.down(key);
    await page.waitForTimeout(25);
  }
  check(`${label}: the player reached the goal on real held-key input`, landedAt !== null, 'never landed within 90 s');
  if (landedAt === null) {
    await page.keyboard.up(key);
    await context.close();
    return;
  }

  // 6 s of screenshots every ~150 ms after the landing (goal hold -> beams out -> deconstruct -> next intro).
  while (Date.now() - landedAt < 6000) {
    if (Date.now() - lastShotAt >= SCREENSHOT_EVERY_MS) { await takeShot(); } else { await page.waitForTimeout(10); }
  }
  const trace = await page.evaluate(() => { cancelAnimationFrame(window.__outroRaf); return window.__outroTrace; });
  if (evidenceDir) {
    writeFileSync(join(evidenceDir, `${label}_trace.json`), JSON.stringify({ shots, samples: trace.length }, null, 1));
  }

  const afterLanding = trace.filter((s) => s.t >= trace[0].t);
  const outro = afterLanding.filter((s) => s.phase === 'deconstructing');
  check(`${label}: the lifecycle reaches 'deconstructing' after the goal`, outro.length > 20, `${outro.length} deconstructing frames`);
  if (outro.length <= 20) {
    await context.close();
    return;
  }
  const tileCount = outro[0].tileCount;
  const outroStart = outro[0].t;

  // --- state: the tile counter falls from N to 0 over the nominal window (400 ms beams-out, then 1.8-3.0 s of tiles).
  const stateDecreasing = outro.every((s, i) => i === 0 || (s.tilesVisible ?? tileCount) <= (outro[i - 1].tilesVisible ?? tileCount));
  const firstBelowFull = outro.find((s) => (s.tilesVisible ?? tileCount) < tileCount);
  const firstZero = outro.find((s) => s.tilesVisible === 0);
  check(`${label}: tilesVisible is non-increasing and reaches 0`, stateDecreasing && firstZero !== undefined, JSON.stringify({ stateDecreasing, tileCount, zero: firstZero?.t }));
  const dissolveMs = firstZero !== undefined && firstBelowFull !== undefined ? firstZero.t - firstBelowFull.t : -1;
  check(`${label}: the dissolve runs ~1.8-3.0 s of real time (measured ${Math.round(dissolveMs)} ms)`, dissolveMs > 1500 && dissolveMs < 3600, `dissolveMs=${dissolveMs}`);
  check(`${label}: the dissolve starts after the 400 ms beam-out (first tile gone ${Math.round((firstBelowFull?.t ?? 0) - outroStart)} ms in)`, firstBelowFull !== undefined && (firstBelowFull.t - outroStart) >= 300, `${firstBelowFull?.t - outroStart}`);

  // --- pixels: the DRAWN floor falls with it (the bug: it stayed full until the next maze).
  const drawn = outro.map((s) => s.drawn).filter((v) => typeof v === 'number');
  check(`${label}: the composed board texture is readable every frame`, drawn.length === outro.length, `${drawn.length}/${outro.length}`);
  const full = Math.max(...drawn.slice(0, 5));
  const drawnNonIncreasing = drawn.every((v, i) => i === 0 || v <= drawn[i - 1] + (full * 0.01));
  const distinct = new Set(drawn).size;
  check(`${label}: the drawn floor starts full (peak ${full}) and ends <= 5% of it (last ${drawn[drawn.length - 1]}, min ${Math.min(...drawn)})`, full > 0 && Math.min(...drawn) <= full * 0.05, JSON.stringify({ full, min: Math.min(...drawn) }));
  check(`${label}: the drawn floor is non-increasing through the dissolve (never refilled)`, drawnNonIncreasing, 'drawn pixel count rose during the outro');
  check(`${label}: the dissolve is VISIBLY progressive (>= 8 distinct drawn-floor states, not one jump at the end)`, distinct >= 8, `distinct=${distinct}`);
  // At the midpoint of the tile window roughly half of the floor must be gone (not full, not empty).
  if (firstBelowFull !== undefined && firstZero !== undefined) {
    const mid = (firstBelowFull.t + firstZero.t) / 2;
    const midSample = outro.reduce((best, s) => (Math.abs(s.t - mid) < Math.abs(best.t - mid) ? s : best), outro[0]);
    check(`${label}: mid-dissolve the drawn floor is between 20% and 80% of full (${Math.round((midSample.drawn / full) * 100)}%)`, midSample.drawn > full * 0.2 && midSample.drawn < full * 0.8, `mid=${midSample.drawn} full=${full}`);
  }

  // --- screen: screenshots agree (guards a downstream hide/skip the texture check cannot see).
  const outroShots = shots.filter((s) => s.phase === 'deconstructing');
  const litFirst = Math.max(...outroShots.slice(0, 3).map((s) => s.lit));
  const litMin = Math.min(...outroShots.map((s) => s.lit));
  const litMid = outroShots.find((s) => typeof s.tilesVisible === 'number' && s.tilesVisible > 0 && s.tilesVisible < tileCount * 0.7 && s.tilesVisible > tileCount * 0.3);
  check(`${label}: screenshots during the outro (${outroShots.length}) show the board going from full to <= 40% (the level digit keeps some lit pixels) (lit px ${litFirst} -> ${litMin})`, outroShots.length >= 8 && litFirst > 0 && litMin <= litFirst * 0.4, JSON.stringify(shots.map((s) => [s.ms, s.phase, s.tilesVisible, s.lit])));
  check(`${label}: a screenshot taken with ~30-70% of the tiles left shows ~30-70% of the board (lit ${litMid?.lit} of ${litFirst})`, litMid !== undefined && litMid.lit < litFirst * 0.85 && litMid.lit > litFirst * 0.1, JSON.stringify(litMid));

  // --- the next level's intro builds tile by tile right after (never pre-filled).
  const intro = afterLanding.filter((s) => s.phase === 'building' && s.t > (firstZero?.t ?? Number.POSITIVE_INFINITY));
  const introDrawn = intro.map((s) => s.drawn).filter((v) => typeof v === 'number');
  check(`${label}: the next level's intro follows the outro and builds up from empty (${intro.length} frames)`, intro.length > 10 && introDrawn[0] <= full * 0.2 && Math.max(...introDrawn) > introDrawn[0], JSON.stringify({ first: introDrawn[0], max: Math.max(...introDrawn) }));

  check(`${label}: no page errors`, pageErrors.length === 0, JSON.stringify(pageErrors));
  await context.close();
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const evidenceDir = typeof args['evidence-dir'] === 'string' ? resolve(args['evidence-dir']) : null;
  if (evidenceDir) { mkdirSync(evidenceDir, { recursive: true }); }

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }
  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS, skipBuild });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      await runViewport(browser, resolvedBaseUrl, viewport, evidenceDir);
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  process.stderr.write(`\n${passCount}/${passCount + failCount} checks passed.\n`);
  if (failCount > 0) {
    process.stderr.write(`FAILED: ${failures.join('; ')}\n`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
