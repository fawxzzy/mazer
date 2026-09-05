/**
 * Wave 4D-A: bounded browser pixel-regression check for the play trail's
 * corner rendering -- the specific "teeth"/fan self-intersection artifact
 * that motivated replacing Graphics vector strokes with the real 2D-canvas
 * compositor (src/render/navigationCoreTrailCanvas.ts). Prior verification
 * of that fix was visual inspection only (screenshots eyeballed by a
 * reviewer, never re-run automatically); this script is the actual pixel
 * assertion that was requested to close that gap, so a later renderer
 * change can't silently reintroduce the artifact without a test noticing.
 *
 * Deliberately narrow: fixed geometry (a small 3x3 synthetic corner maze,
 * one per orientation -- reusing this project's own established
 * direct-scene-state-assignment technique, same as
 * capture-wave4d-a-evidence.mjs), fixed palette phase (trail clock frozen,
 * reduced motion on, so no shine sweep or animation ever runs), fixed
 * settings, all four orientations, native-size capture only (this is a
 * pass/fail regression gate, not an inspection tool -- see
 * capture-wave4d-a-evidence.mjs for enlarged human-inspection crops).
 *
 * Baselines live in tests/fixtures/trail-corner-raster/<orientation>.png,
 * committed to the repo -- NOT regenerated automatically. Run with
 * --update-baseline to (re)write them after a reviewer has visually
 * confirmed the current render is correct; running the check normally
 * only ever compares against the existing committed baseline and never
 * writes to it, so a regression can't silently re-bless itself by
 * overwriting the very baseline it should be checked against.
 *
 * Usage:
 *   node scripts/analysis/verify-trail-corner-raster.mjs
 *   node scripts/analysis/verify-trail-corner-raster.mjs --update-baseline
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const BASELINE_DIR = resolve(REPO_ROOT, 'tests/fixtures/trail-corner-raster');

// Same technique as capture-wave4d-a-evidence.mjs: '#' is floor, '.' is
// wall/void, then padded with a 1-cell wall border (see that script's own
// comment on why -- an unpadded tiny maze's opposite edges otherwise read
// as wrap-adjacent floor to the real BFS trail-path renderer).
const gridFromAscii = (rows) => rows.map((row) => row.split('').map((c) => c === '#'));

const padWithWallBorder = (rows) => {
  const width = rows[0].length;
  const wallRow = '.'.repeat(width + 2);
  return [wallRow, ...rows.map((row) => `.${row}.`), wallRow];
};

const RAW_MAZES = {
  cornerNE: { rows: ['..#', '..#', '###'], start: { x: 0, y: 2 }, goal: { x: 2, y: 0 } }, // right then up
  cornerNW: { rows: ['#..', '#..', '###'], start: { x: 2, y: 2 }, goal: { x: 0, y: 0 } }, // left then up
  cornerSE: { rows: ['###', '..#', '..#'], start: { x: 0, y: 0 }, goal: { x: 2, y: 2 } }, // right then down
  cornerSW: { rows: ['###', '#..', '#..'], start: { x: 2, y: 0 }, goal: { x: 0, y: 2 } } // left then down
};

const MAZES = Object.fromEntries(
  Object.entries(RAW_MAZES).map(([key, spec]) => [
    key,
    {
      rows: padWithWallBorder(spec.rows),
      start: { x: spec.start.x + 1, y: spec.start.y + 1 },
      goal: { x: spec.goal.x + 1, y: spec.goal.y + 1 }
    }
  ])
);

const buildMazeSnapshot = (spec) => {
  const grid = gridFromAscii(spec.rows);
  return {
    source: 'play-generated',
    width: grid[0].length,
    height: grid.length,
    grid,
    start: spec.start,
    goal: spec.goal,
    solutionPath: [],
    seed: 1
  };
};

// The corner's own L-shaped path: start -> along one axis -> corner tile ->
// along the other axis -> goal. Derived from start/goal directly so it
// stays correct for all four orientations without hardcoding direction.
const buildCornerTrail = (spec) => {
  const points = [];
  // The corner tile itself is always (goal.x, start.y) or (start.x,
  // goal.y) for these 3x3 corner mazes -- whichever pairing keeps one
  // coordinate matching start and the other matching goal.
  const cornerPoint = spec.start.x === spec.goal.x
    ? { x: spec.start.x, y: spec.goal.y }
    : { x: spec.goal.x, y: spec.start.y };
  const stepPath = (from, to) => {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let cur = { ...from };
    const out = [{ ...cur }];
    while (cur.x !== to.x || cur.y !== to.y) {
      cur = { x: cur.x + dx, y: cur.y + dy };
      out.push({ ...cur });
    }
    return out;
  };
  points.push(...stepPath(spec.start, cornerPoint));
  points.push(...stepPath(cornerPoint, spec.goal).slice(1));
  return points;
};

const setSceneState = async (page, { maze, player, trail }) => {
  await page.evaluate((cfg) => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    scene.maze = cfg.maze;
    scene.player = cfg.player;
    scene.syncLegacyPlayerVisualMotionTo(cfg.player);
    scene.trail = cfg.trail;
    scene.hasPlayerEverLeftStart = true;
    // Frozen, deterministic palette phase -- no shine sweep, no idle
    // breathing, no ambient sparkles. This check is only about corner
    // stroke geometry, not any of this file's other animated states.
    scene.applyLegacyReducedMotionPreference(true);
    scene.trailAnimationElapsedMs = 0;
    scene.trailShineLapStartedAtMs = 0;
    scene.settings.toggleTrailFade = false;
    scene.settings.toggleTrailPulse = false;
    scene.menuStaticDrawLifecyclePhase = 'settled';
    scene.menuStaticDrawRowsVisible = null;
    scene.menuStaticDrawTilesVisible = null;
    scene.menuStaticDeconstructStartedAtMs = null;
    scene.boardZoomContainer.setScale(1);
    scene.boardStaticDirty = true;
    scene.boardPathDirty = true;
    scene.boardDynamicDirty = true;
  }, { maze, player, trail });
};

const stepFrames = async (page, n = 3) => {
  await page.evaluate((count) => {
    const game = window.__MAZER_GAME__;
    let t = performance.now();
    for (let i = 0; i < count; i += 1) {
      t += 16.6667;
      game.loop.step(t);
    }
  }, n);
};

const getBoardFrame = async (page) => (
  page.evaluate(() => {
    const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
    const boardOffset = scene.resolveBoardOffset();
    const frame = scene.resolveLegacyMazeRenderFrame(
      scene.layout.boardLeft + boardOffset.x,
      scene.layout.boardTop + boardOffset.y,
      scene.layout.boardWidth,
      scene.layout.boardHeight
    );
    return { left: frame.boardLeft, top: frame.boardTop, tileSize: frame.tileSize };
  })
);

const captureCanvasRegionPng = async (page, region, scale = 1) => {
  const dataUrl = await page.evaluate(({ x, y, w, h, scale: s }) => {
    const canvas = document.querySelector('canvas');
    const off = document.createElement('canvas');
    off.width = Math.round(w * s);
    off.height = Math.round(h * s);
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, x, y, w, h, 0, 0, off.width, off.height);
    return off.toDataURL('image/png');
  }, { ...region, scale });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

// Per-channel absolute-difference tolerance and the fraction of pixels
// allowed to exceed it before the check fails. Loose enough to absorb
// ordinary cross-environment antialiasing/font-hinting jitter (the corner
// fix's own live verification found sub-pixel differences of a few units
// on re-render), tight enough that a real structural regression -- the
// teeth artifact was a large, multi-pixel-wide fan at the corner, not a
// stray pixel -- fails it by a wide margin, not a coin flip.
const CHANNEL_TOLERANCE = 24;
const MAX_DIFFERING_PIXEL_FRACTION = 0.02;

const compareToBaseline = async (label, candidatePng, baselinePath, updateBaseline) => {
  if (updateBaseline) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, candidatePng);
    return { passed: true, detail: 'baseline written' };
  }
  if (!existsSync(baselinePath)) {
    return { passed: false, detail: `no committed baseline at ${baselinePath} -- run with --update-baseline after visually confirming the render` };
  }
  const [candidate, baseline] = await Promise.all([
    sharp(candidatePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(readFileSync(baselinePath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  if (candidate.info.width !== baseline.info.width || candidate.info.height !== baseline.info.height) {
    return {
      passed: false,
      detail: `size mismatch: candidate ${candidate.info.width}x${candidate.info.height} vs baseline ${baseline.info.width}x${baseline.info.height}`
    };
  }
  const { width, height } = candidate.info;
  const totalPixels = width * height;
  let differingPixels = 0;
  for (let i = 0; i < candidate.data.length; i += 4) {
    const dr = Math.abs(candidate.data[i] - baseline.data[i]);
    const dg = Math.abs(candidate.data[i + 1] - baseline.data[i + 1]);
    const db = Math.abs(candidate.data[i + 2] - baseline.data[i + 2]);
    const da = Math.abs(candidate.data[i + 3] - baseline.data[i + 3]);
    if (dr > CHANNEL_TOLERANCE || dg > CHANNEL_TOLERANCE || db > CHANNEL_TOLERANCE || da > CHANNEL_TOLERANCE) {
      differingPixels += 1;
    }
  }
  const fraction = differingPixels / totalPixels;
  return {
    passed: fraction <= MAX_DIFFERING_PIXEL_FRACTION,
    detail: `${differingPixels}/${totalPixels} pixels (${(fraction * 100).toFixed(2)}%) exceeded tolerance ${CHANNEL_TOLERANCE}/255, allowed up to ${(MAX_DIFFERING_PIXEL_FRACTION * 100).toFixed(0)}%`
  };
};

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

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const updateBaseline = isTruthyArg(args.updateBaseline ?? args['update-baseline']);

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
    await page.waitForTimeout(200);

    for (const [orientation, spec] of Object.entries(MAZES)) {
      const maze = buildMazeSnapshot(spec);
      const trail = buildCornerTrail(spec);
      await setSceneState(page, { maze, player: spec.goal, trail });
      await stepFrames(page, 3);
      const frame = await getBoardFrame(page);
      const region = {
        x: frame.left + (Math.min(spec.start.x, spec.goal.x) * frame.tileSize) - 6,
        y: frame.top + (Math.min(spec.start.y, spec.goal.y) * frame.tileSize) - 6,
        w: (3 * frame.tileSize) + 12,
        h: (3 * frame.tileSize) + 12
      };
      const png = await captureCanvasRegionPng(page, region, 1);
      const baselinePath = resolve(BASELINE_DIR, `${orientation}.png`);
      const result = await compareToBaseline(orientation, png, baselinePath, updateBaseline);
      check(`trail corner raster (${orientation}) matches its committed baseline`, result.passed, result.detail);
    }

    await context.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  if (updateBaseline) {
    process.stderr.write(`\nBaselines written to ${BASELINE_DIR} -- visually confirm each PNG before committing.\n`);
    return;
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
