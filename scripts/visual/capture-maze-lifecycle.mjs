/**
 * Deterministic maze-lifecycle capture.
 *
 * Drives the real Mazer app (Vite dev server from this checkout, or any
 * --base-url) under Playwright's fake clock so requestAnimationFrame and
 * performance.now advance in fixed 16ms ticks, independent of how fast the
 * machine renders. Presses Start, captures one frame every --step-ms of
 * SIMULATED time for the whole BUILD (until input unlocks), walks the real
 * shortest route to the goal (or jumps next to it), then captures the whole
 * DECONSTRUCT until the board is empty. Output: frame PNGs, manifest.json
 * (simulated time + diagnostics per frame) and a contact sheet per phase.
 *
 * Analyse the result with scripts/visual/analyze-maze-lifecycle.mjs.
 * See docs/ops/MAZER-LIFECYCLE-CAPTURE-TOOL-2026-11-05.md.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { REPO_ROOT, parseCliArgs } from './common.mjs';
import { composeContactSheet, decodePng, encodePng, resizeBox } from './lib/png-codec.mjs';

export const PROGRESSION_STORAGE_KEY = 'mazer.progression.v1:user:runtime-diagnostics-auth-fixture';
const START_BUTTON_SELECTOR = 'button[data-mazer-accessibility-command="start"]';
const DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const DEFAULT_VIEWPORTS = ['390x844', '1280x720'];

export const DEFAULTS = Object.freeze({
  level: 1,
  seed: 1337,
  stepMs: 32,
  walkEvery: 2,
  complete: 'route',
  graceMs: 1500,
  maxBuildMs: 30_000,
  maxDeconstructMs: 20_000,
  contactColumns: 10,
  contactMaxFrames: 80,
  thumbWidth: 96
});

export const parseViewport = (text) => {
  const match = /^(\d+)x(\d+)$/.exec(String(text).trim());
  if (!match) throw new Error(`Invalid viewport "${text}" (expected WxH, e.g. 390x844).`);
  return { width: Number(match[1]), height: Number(match[2]) };
};

/** Progression state with the player track at `level` (mirrors capture-level-progression-gallery.mjs). */
export const createProgressionState = (level) => {
  const targetComplexity = 8 + ((Math.min(Math.max(level, 1), 99) - 1) * 4);
  const track = (trackLevel, complexity, player) => ({
    bestCompletionTimeMs: null,
    cleanCycles: 0,
    colorTier: 0,
    completedCycles: (BigInt(trackLevel) - 1n).toString(),
    lastCompletedAt: null,
    lastCompletionTimeMs: null,
    lastMazeSeed: null,
    lastReceiptId: null,
    lastSignal: 'hold',
    level: trackLevel,
    paceScore: 0,
    peakComplexity: complexity,
    rank: 'E',
    recentSignals: [],
    struggleCycles: player ? Number.MAX_SAFE_INTEGER : 0,
    targetComplexity: complexity
  });
  return {
    aiRunnerBaselineVersion: 3,
    playerProgressionBaselineVersion: 5,
    tracks: { player: track(level, targetComplexity, true), 'ai-runner': track(1, 8, false) },
    updatedAt: null,
    version: 1
  };
};

export const expectedProgressionLabel = (level) => `Player Skill Lv ${String(level).padStart(2, '0')}`;

/** Direction command for one route step; wrap steps (|delta| > 1) invert, as in the other evidence scripts. */
export const directionForStep = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    if (dx === 1) return 'move_right';
    if (dx === -1) return 'move_left';
    if (dy === 1) return 'move_down';
    if (dy === -1) return 'move_up';
    return null;
  }
  if (Math.abs(dx) > 1) return dx > 0 ? 'move_left' : 'move_right';
  return dy > 0 ? 'move_up' : 'move_down';
};

const pad = (value, width) => String(value).padStart(width, '0');

const findFreePort = () => new Promise((resolvePromise, rejectPromise) => {
  const server = createServer();
  server.once('error', rejectPromise);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolvePromise(port));
  });
});

const killTree = (child) => new Promise((resolvePromise) => {
  if (!child || child.exitCode !== null) {
    resolvePromise();
    return;
  }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    killer.on('error', () => resolvePromise());
    killer.on('exit', () => resolvePromise());
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  const timer = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    resolvePromise();
  }, 4000);
  child.once('exit', () => { clearTimeout(timer); resolvePromise(); });
});

const startDevServer = async () => {
  const port = await findFreePort();
  const viteBin = resolve(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: REPO_ROOT,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (child.exitCode !== null) throw new Error(`Vite exited early:\n${log}`);
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.ok) return { baseUrl, child };
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  await killTree(child);
  throw new Error(`Timed out waiting for Vite at ${baseUrl}:\n${log}`);
};

// Runs inside the page. Everything is read defensively: the scene fields are
// internal (private TS members, plain properties at runtime), so a rename
// shows up as null in the manifest instead of crashing the capture.
const PROBE_SOURCE = `(() => {
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  const scene = safe(() => window.__MAZER_GAME__.scene.getScene('MenuScene'));
  const attr = document.documentElement.getAttribute('${DIAGNOSTICS_ATTRIBUTE}') || '';
  const labelMatch = attr.match(/(Player|AI) Skill Lv \\d+/g);
  const rd = window.__MAZER_RUNTIME_DIAGNOSTICS__ || null;
  const wrap = safe(() => rd.generation.maze.wrapTopologyDiagnostics);
  const board = safe(() => JSON.parse(attr).board);
  return {
    perfNowMs: performance.now(),
    sceneNowMs: safe(() => scene.time.now),
    mode: safe(() => scene.mode),
    overlay: safe(() => scene.overlay),
    drawPhase: safe(() => scene.menuStaticDrawLifecyclePhase),
    tilesVisible: safe(() => scene.menuStaticDrawTilesVisible),
    rowsVisible: safe(() => scene.menuStaticDrawRowsVisible),
    tileCount: safe(() => scene.menuStaticDrawTileOrder.length),
    inputLocked: safe(() => scene.isLegacyPlayLifecycleInputLocked()),
    bleedGrowth: safe(() => scene.resolveLegacyBleedDockGrowthProgress()),
    dockEligible: safe(() => Array.from(scene.resolveBleedOffDockVisualEligibility())),
    bleedImages: safe(() => scene.boardBleedPathImages.filter((i) => i.visible).map((i) => ({
      x: Math.round(i.x * 10) / 10, y: Math.round(i.y * 10) / 10,
      w: Math.round(i.displayWidth * 10) / 10, h: Math.round(i.displayHeight * 10) / 10,
      rotation: Math.round(i.rotation * 1000) / 1000, flipX: i.flipX, alpha: i.alpha
    }))),
    transferPhase: safe(() => scene.resolveLegacyPlayerTransferState(scene.time.now).phase),
    player: safe(() => ({ x: scene.player.x, y: scene.player.y })),
    goal: safe(() => ({ x: scene.maze.goal.x, y: scene.maze.goal.y })),
    maze: safe(() => ({ width: scene.maze.width, height: scene.maze.height })),
    labels: labelMatch,
    diag: rd ? {
      surfaceMode: safe(() => rd.surface.mode),
      surfaceOverlay: safe(() => rd.surface.overlay),
      lifecyclePhase: safe(() => rd.play.lifecycle.phase),
      drawStageLifecycle: safe(() => rd.generation.drawStage.lifecyclePhase)
    } : null,
    wrapPairs: wrap ? { horizontal: safe(() => wrap.horizontal.pairCount), vertical: safe(() => wrap.vertical.pairCount) } : null,
    board: board ? {
      bounds: board.bounds, renderBounds: board.renderBounds, tileSize: board.tileSize
    } : null
  };
})()`;

const buildInitScript = ({ seed, progression }) => `(() => {
  try {
    if (!sessionStorage.getItem('__lifecycleInit')) {
      sessionStorage.setItem('__lifecycleInit', '1');
      localStorage.clear();
      ${progression ? `localStorage.setItem(${JSON.stringify(PROGRESSION_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(progression))});` : ''}
    }
  } catch (e) { /* storage unavailable */ }
  // Seeded Math.random (mulberry32) so maze generation is repeatable.
  let a = ${seed >>> 0};
  window.__mazerReseed = (n) => { a = n >>> 0; };
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

const captureOne = async ({ browser, baseUrl, viewport, options, outRoot }) => {
  const frameSkip = Math.max(1, Math.round(1000 / 16 / (options.fps ?? 62.5)));
  const label = `lvl${pad(options.level, 2)}-${viewport.width}x${viewport.height}-s${options.seed}${frameSkip > 1 ? `-fps${Math.round(1000 / 16 / frameSkip)}` : ''}`;
  const runDir = join(outRoot, label);
  const framesDir = join(runDir, 'frames');
  await rm(runDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const mobile = viewport.width <= 430;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference'
  });
  await context.addInitScript(buildInitScript({
    seed: options.seed,
    progression: options.level > 1 ? createProgressionState(options.level) : null
  }));
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // The clock must be installed before navigation so the app's first
  // requestAnimationFrame / performance.now read the fake implementations.
  // It is paused immediately: simulated time moves ONLY via runFor(), never
  // with wall time, so the boot itself is also driven in fixed 16ms ticks.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(16);
  // mazeSeed pins the menu seed (the play maze seed mixes it with scene time
  // and the seeded Math.random below), so the same options give the same maze.
  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=${options.seed}`, { waitUntil: 'commit', timeout: 120_000 });
  const bridgeReady = () => page.evaluate(() => Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__)).catch(() => false);
  for (let ticks = 0; !(await bridgeReady()); ticks += 1) {
    if (ticks > 20_000) throw new Error('App never exposed __MAZER_QA__ (is runtimeDiagnostics enabled?).');
    await page.clock.runFor(16);
    await new Promise((r) => setTimeout(r, 10)); // let real network/module loading progress
  }
  if (frameSkip > 1) {
    // Emulate a slow device: deliver every Nth 16ms animation-frame tick to the app.
    await page.evaluate((skip) => {
      const original = window.requestAnimationFrame.bind(window);
      let tick = 0;
      window.requestAnimationFrame = (callback) => original(function gate(time) {
        tick += 1;
        if (tick % skip !== 0) { original(gate); return; }
        callback(time);
      });
    }, frameSkip);
  }

  const probe = () => page.evaluate(PROBE_SOURCE);
  // Press Start on a settled menu (a user cannot press it earlier), at an
  // absolute simulated time that does not depend on how long boot took.
  const START_ALIGN_MS = 4000;
  let pre = await probe();
  const settled = (p) => p.mode === 'menu' && p.drawPhase === 'settled';
  for (;;) {
    const target = Math.max(2 * START_ALIGN_MS, Math.ceil((pre.perfNowMs + 1) / START_ALIGN_MS) * START_ALIGN_MS);
    await page.clock.runFor(target - pre.perfNowMs);
    pre = await probe();
    if (settled(pre)) break;
    if (pre.perfNowMs > options.maxBuildMs) throw new Error(`Menu never settled (mode=${pre.mode} drawPhase=${pre.drawPhase}).`);
  }

  const frames = [];
  let startPerfMs = 0;
  const snap = async (phase) => {
    const data = await probe();
    const simMs = Math.round(data.perfNowMs - startPerfMs);
    const file = `frames/${pad(frames.length, 4)}_${phase}_${pad(Math.max(0, simMs), 6)}ms.png`;
    await page.screenshot({ path: join(runDir, file) });
    const frame = { index: frames.length, phase, simMs, file, ...data };
    frames.push(frame);
    return frame;
  };

  startPerfMs = pre.perfNowMs;
  await page.evaluate((seed) => window.__mazerReseed(seed), options.seed);
  await page.evaluate((selector) => document.querySelector(selector).click(), START_BUTTON_SELECTOR);
  // Frame 0: the instant after Start was pressed, before any tick ran.
  await snap('build');

  const milestones = { startPressSimMs: 0 };
  const stepFrame = async (phase) => {
    await page.clock.runFor(options.stepMs);
    return snap(phase);
  };

  // ---- BUILD: until the lifecycle settles and input unlocks.
  let state = await stepFrame('build');
  // Progression label gate: the level-1 shot must read "Player Skill Lv 01".
  const expected = expectedProgressionLabel(options.level);
  const labelConfirmed = Array.isArray(state.labels) && state.labels.includes(expected);
  if (!labelConfirmed) {
    throw new Error(`Progression label mismatch: expected "${expected}", saw ${JSON.stringify(state.labels)}.`);
  }
  while (!(state.drawPhase === 'settled' && state.inputLocked === false)) {
    if (state.simMs > options.maxBuildMs) throw new Error('Build never unlocked input within --max-build-ms.');
    state = await stepFrame('build');
  }
  milestones.inputUnlockedSimMs = state.simMs;
  milestones.inputUnlockedFrame = state.index;

  // ---- COMPLETE the maze: real route (default) or next to the goal.
  const solved = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
  const route = solved?.found ? solved.path : null;
  if (!route || route.length < 2) throw new Error('No solvable route to the goal was reported by the QA bridge.');
  let acceptedMoves = 0;
  if (options.complete === 'adjacent') {
    const last = route[route.length - 1];
    const before = route[route.length - 2];
    await page.evaluate(({ p }) => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      scene.player = { x: p.x, y: p.y };
      scene.trail = [{ x: p.x, y: p.y }];
    }, { p: before });
    const move = directionForStep(before, last);
    const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
    if (result?.accepted) acceptedMoves += 1;
  } else {
    for (let i = 1; i < route.length; i += 1) {
      const move = directionForStep(route[i - 1], route[i]);
      if (!move) throw new Error(`Cannot derive a move for route step ${i}.`);
      let accepted = false;
      for (let attempt = 0; attempt < 200 && !accepted; attempt += 1) {
        const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), move);
        if (result?.accepted) {
          accepted = true;
        } else if (result?.reason === 'lifecycle-locked' || result?.reason === 'cooldown' || result?.reason === 'move-cooldown') {
          await page.clock.runFor(16);
        } else {
          throw new Error(`Move ${i} (${move}) rejected: ${JSON.stringify(result)}`);
        }
      }
      if (!accepted) throw new Error(`Move ${i} (${move}) was never accepted.`);
      acceptedMoves += 1;
      const cur = await probe();
      if (cur.drawPhase === 'deconstructing') break;
      await page.clock.runFor(options.stepMs);
      if (i % options.walkEvery === 0) await snap('play');
    }
  }
  const afterWalk = await snap('play');
  milestones.goalReachedSimMs = afterWalk.simMs;
  milestones.acceptedMoves = acceptedMoves;
  milestones.routeLength = route.length - 1;

  // ---- DECONSTRUCT: from the lifecycle flip until the board is empty (+ grace).
  let deconstructStartSimMs = null;
  let emptySimMs = null;
  const deadline = afterWalk.simMs + options.maxDeconstructMs;
  state = afterWalk;
  for (;;) {
    const deconstructing = state.drawPhase === 'deconstructing';
    if (deconstructing && deconstructStartSimMs === null) {
      deconstructStartSimMs = state.simMs;
      milestones.deconstructStartFrame = state.index;
    }
    if (deconstructStartSimMs !== null && emptySimMs === null && state.tilesVisible === 0) {
      emptySimMs = state.simMs;
      milestones.boardEmptyFrame = state.index;
    }
    if (emptySimMs !== null && state.simMs - emptySimMs >= options.graceMs) break;
    if (deconstructStartSimMs !== null && !deconstructing && state.drawPhase === 'building') break;
    if (state.simMs > deadline) break;
    state = await stepFrame(deconstructStartSimMs === null ? 'goal-hold' : 'deconstruct');
  }
  milestones.deconstructStartSimMs = deconstructStartSimMs;
  milestones.boardEmptyProbeSimMs = emptySimMs;
  milestones.lastFrameSimMs = state.simMs;

  await context.close();

  // Retag the frames that were captured as the deconstruct hold/sequence.
  const manifest = {
    schema: 'mazer-lifecycle-capture-v1',
    label,
    capturedAt: new Date().toISOString(),
    options: { ...options, viewport },
    clock: {
      driver: 'playwright-clock',
      tickMs: 16,
      note: 'page.clock.install before navigation, pauseAt after boot; simulated time advances only via runFor().'
    },
    labelConfirmed,
    expectedLabel: expected,
    pageErrors,
    consoleErrors,
    milestones,
    frames
  };
  await writeFile(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const sheets = await writeContactSheets(runDir, manifest, options);
  manifest.contactSheets = sheets;
  await writeFile(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { label, runDir, manifest };
};

/** One contact sheet per phase (evenly sampled to --contact-max frames). */
export const writeContactSheets = async (runDir, manifest, options = DEFAULTS) => {
  const sheets = [];
  const phases = [...new Set(manifest.frames.map((f) => f.phase))];
  for (const phase of phases) {
    const all = manifest.frames.filter((f) => f.phase === phase);
    const maxFrames = options.contactMaxFrames ?? DEFAULTS.contactMaxFrames;
    const picked = all.length <= maxFrames
      ? all
      : Array.from({ length: maxFrames }, (_, i) => all[Math.round((i * (all.length - 1)) / (maxFrames - 1))]);
    const thumbs = [];
    for (const frame of picked) {
      const image = decodePng(await readFile(join(runDir, frame.file)));
      const thumbWidth = options.thumbWidth ?? DEFAULTS.thumbWidth;
      thumbs.push(resizeBox(image, thumbWidth, Math.max(1, Math.round((image.height * thumbWidth) / image.width))));
    }
    const sheet = composeContactSheet(thumbs, { columns: options.contactColumns ?? DEFAULTS.contactColumns });
    const file = `contact-${phase}.png`;
    await writeFile(join(runDir, file), encodePng(sheet));
    sheets.push({ phase, file, frameIndices: picked.map((f) => f.index), columns: options.contactColumns ?? DEFAULTS.contactColumns });
  }
  return sheets;
};

const warmUp = async (browser, baseUrl) => {
  // First load against a cold Vite dev server may trigger dependency
  // optimisation + a reload; do it once without the fake clock.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated`, { waitUntil: 'commit', timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__), null, { timeout: 120_000 });
    await page.waitForTimeout(1500);
  } finally {
    await context.close();
  }
};

export const resolveOptions = (args) => {
  const num = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const viewportsText = typeof args.viewport === 'string' ? args.viewport : DEFAULT_VIEWPORTS.join(',');
  return {
    viewports: viewportsText.split(',').map(parseViewport),
    level: Math.trunc(num(args.level, DEFAULTS.level)),
    seed: Math.trunc(num(args.seed, DEFAULTS.seed)),
    stepMs: Math.max(16, Math.round(num(args['step-ms'], DEFAULTS.stepMs) / 16) * 16),
    walkEvery: Math.trunc(num(args['walk-every'], DEFAULTS.walkEvery)),
    complete: args.complete === 'adjacent' ? 'adjacent' : 'route',
    graceMs: num(args['grace-ms'], DEFAULTS.graceMs),
    maxBuildMs: num(args['max-build-ms'], DEFAULTS.maxBuildMs),
    maxDeconstructMs: num(args['max-deconstruct-ms'], DEFAULTS.maxDeconstructMs),
    fps: num(args.fps, 62.5),
    reducedMotion: args['reduced-motion'] === true || args['reduced-motion'] === 'true',
    contactColumns: DEFAULTS.contactColumns,
    contactMaxFrames: Math.trunc(num(args['contact-max'], DEFAULTS.contactMaxFrames)),
    thumbWidth: DEFAULTS.thumbWidth,
    out: typeof args.out === 'string' ? resolve(args.out) : join(tmpdir(), 'mazer-lifecycle-capture'),
    baseUrl: typeof args['base-url'] === 'string' ? args['base-url'].replace(/\/$/, '') : null
  };
};

const main = async () => {
  const args = parseCliArgs();
  if (args.help) {
    process.stdout.write([
      'Usage: node scripts/visual/capture-maze-lifecycle.mjs [options]',
      '  --viewport 390x844,1280x720   comma list (default both)',
      '  --level N                     player progression level to seed (default 1; wraps appear from ~15)',
      '  --seed N                      seeded Math.random (default 1337)',
      '  --step-ms N                   simulated ms between captured frames, multiple of 16 (default 32)',
      '  --complete route|adjacent     walk the real route, or jump next to the goal (default route)',
      '  --walk-every N                capture every Nth move while walking (default 2)',
      '  --grace-ms N                  simulated ms captured after the board is empty (default 1500)',
      '  --fps N                       emulate a slow device by delivering every k-th 16ms frame (default 62.5 = every tick)',
      '  --reduced-motion              emulate prefers-reduced-motion',
      '  --out DIR                     output root (default <os tmpdir>/mazer-lifecycle-capture)',
      '  --base-url URL                use an existing server instead of starting Vite',
      ''
    ].join('\n'));
    return;
  }
  const options = resolveOptions(args);
  await mkdir(options.out, { recursive: true });
  let server = null;
  let browser = null;
  const results = [];
  try {
    if (options.baseUrl) {
      server = { baseUrl: options.baseUrl, child: null };
    } else {
      server = await startDevServer();
    }
    process.stderr.write(`Server: ${server.baseUrl}\n`);
    browser = await chromium.launch({ headless: true });
    await warmUp(browser, server.baseUrl);
    for (const viewport of options.viewports) {
      process.stderr.write(`Capturing level ${options.level} at ${viewport.width}x${viewport.height}...\n`);
      const result = await captureOne({ browser, baseUrl: server.baseUrl, viewport, options, outRoot: options.out });
      const m = result.manifest.milestones;
      process.stderr.write(
        `  ${result.manifest.frames.length} frames; input unlocked at ${m.inputUnlockedSimMs}ms; `
        + `deconstruct start ${m.deconstructStartSimMs}ms; board empty (probe) ${m.boardEmptyProbeSimMs}ms -> ${result.runDir}\n`
      );
      results.push(result.runDir);
    }
  } finally {
    if (browser) await browser.close();
    if (server?.child) await killTree(server.child);
  }
  process.stdout.write(`${JSON.stringify({ outputs: results }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('FATAL', error);
    process.exitCode = 1;
  });
}
