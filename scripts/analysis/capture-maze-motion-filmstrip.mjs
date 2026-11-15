/**
 * Frame filmstrip of the maze build (level start) or tear-down (goal reached) at fixed times -- MAZER-MOTION-020.
 *
 * Plays the real game in headless Chromium or WebKit under a fake clock (Playwright page.clock, 16 ms per step, so
 * every frame is rendered and the machine speed does not change the timing), takes a full-page screenshot when the
 * build / deconstruct clock first reaches each requested time, and writes two contact sheets:
 *   <label>.png        the whole screen at each time (scaled)
 *   <label>-zoom.png   a native-pixel crop around the start tile (or, for the tear-down, around the goal), to look
 *                      for a lone 1px rim that shows before its fill
 *
 * Usage: node scripts/analysis/capture-maze-motion-filmstrip.mjs --base-url http://127.0.0.1:5206
 *          --scenario build|teardown [--browser chromium|webkit] [--level 7]
 *          [--times 0,100,200,...] [--cols 6] [--scale 0.4] [--reduce-motion] --out DIR [--label NAME]
 * Headless only: this is not a real-device capture.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import sharp from 'sharp';

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i += 1; }
  }
  return args;
};

const STEP_MS = 16;

const sheet = async (frames, { cols, labelHeight = 22 }) => {
  const metas = await Promise.all(frames.map((frame) => sharp(frame.png).metadata()));
  const cellW = Math.max(...metas.map((m) => m.width));
  const cellH = Math.max(...metas.map((m) => m.height)) + labelHeight;
  const rows = Math.ceil(frames.length / cols);
  const composites = [];
  for (let i = 0; i < frames.length; i += 1) {
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * cellH;
    composites.push({ input: frames[i].png, left: x, top: y + labelHeight });
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelHeight}"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-size="14" font-family="monospace" fill="#fff">${frames[i].label}</text></svg>`;
    composites.push({ input: Buffer.from(text), left: x, top: y });
  }
  return sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 3, background: '#444' } })
    .composite(composites).png().toBuffer();
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args['base-url'] ?? 'http://127.0.0.1:5206').replace(/\/$/, '');
  const scenario = String(args.scenario ?? 'build');
  const engine = String(args.browser ?? 'chromium');
  const level = Number(args.level ?? 7);
  const times = String(args.times ?? '0,100,200,300,400,500,600,800,1000,1300,1600,2000,2400,2800')
    .split(',').map(Number);
  const cols = Number(args.cols ?? 7);
  const scale = Number(args.scale ?? 0.4);
  const reduce = args['reduce-motion'] === true;
  const outDir = resolve(String(args.out ?? '.'));
  const label = String(args.label ?? `${scenario}-${engine}${reduce ? '-reduce' : ''}`);
  mkdirSync(outDir, { recursive: true });

  const launcher = engine === 'webkit' ? webkit : chromium;
  const browser = await launcher.launch({ headless: true });
  const contextOptions = engine === 'webkit'
    ? { ...devices['iPhone 15 Pro'], reducedMotion: reduce ? 'reduce' : 'no-preference' }
    : {
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      reducedMotion: reduce ? 'reduce' : 'no-preference'
    };
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (candidate) => {
      if (candidate !== '(display-mode: standalone)') return nativeMatchMedia(candidate);
      return {
        addEventListener() {}, addListener() {}, dispatchEvent: () => true, matches: true,
        media: candidate, onchange: null, removeEventListener() {}, removeListener() {}
      };
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1);
  const proto = args.proto ? `&motionProto=${args.proto}` : '';
  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&previewLevel=${level}${proto}`, { waitUntil: 'load', timeout: 60_000 });

  const scene = `window.__MAZER_GAME__.scene.getScene('MenuScene')`;
  const step = async (ms = STEP_MS) => { await page.clock.runFor(ms); };
  const until = async (expression, maxMs, boot = false) => {
    for (let virtual = 0; virtual < maxMs; virtual += boot ? 100 : STEP_MS) {
      if (await page.evaluate(expression)) return;
      await step(boot ? 100 : STEP_MS);
      if (boot) await page.waitForTimeout(15);
    }
    throw new Error(`virtual timeout waiting for ${expression}`);
  };
  await until('Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__)', 90_000, true);

  let clockExpr;
  if (scenario === 'build') {
    // Frame zero: the first frame the build clock exists (the intro started this frame).
    await until(`(() => { const s = ${scene}; return s.menuStaticDrawLifecyclePhase === 'building' && s.introStartedAtMs !== null; })()`, 60_000);
    clockExpr = `(() => { const s = ${scene}; return performance.now() - s.introStartedAtMs; })()`;
  } else {
    await until(`(() => { const s = ${scene}; return s.mode === 'play' && s.menuStaticDrawLifecyclePhase === 'settled' && !s.isLegacyPlayLifecycleInputLocked(); })()`, 90_000);
    for (let i = 0; i < 50; i += 1) await step();
    await page.evaluate(() => {
      const qa = window.__MAZER_QA__;
      const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const route = qa.resolveShortestPathToGoal();
      const w = s.maze.width; const h = s.maze.height;
      const norm = (d, n) => (d > 1 ? d - n : d < -1 ? d + n : d);
      for (let i = 1; i < route.path.length; i += 1) {
        const dx = norm(route.path[i].x - route.path[i - 1].x, w);
        const dy = norm(route.path[i].y - route.path[i - 1].y, h);
        qa.movePlayPlayer(dx === 1 ? 'move_right' : dx === -1 ? 'move_left' : dy === 1 ? 'move_down' : 'move_up');
      }
    });
    await until(`(() => { const s = ${scene}; return s.menuStaticDrawLifecyclePhase === 'deconstructing' && s.menuStaticDeconstructStartedAtMs !== null; })()`, 30_000);
    clockExpr = `(() => { const s = ${scene}; return s.menuStaticDeconstructStartedAtMs === null ? -1 : performance.now() - s.menuStaticDeconstructStartedAtMs; })()`;
  }

  const frames = [];
  const zooms = [];
  const info = await page.evaluate(`(() => { const s = ${scene}; return { tiles: s.menuStaticDrawTileOrder.length, cols: s.maze.width, rows: s.maze.height }; })()`);
  for (const target of times) {
    for (let guard = 0; guard < 600; guard += 1) {
      const now = await page.evaluate(clockExpr);
      if (now >= target || now < 0) break;
      await step();
    }
    const actual = Math.round(await page.evaluate(clockExpr));
    const full = await page.screenshot({ type: 'png' });
    const meta = await sharp(full).metadata();
    frames.push({
      label: `${scenario} t=${target}ms (${actual})`,
      png: await sharp(full).resize(Math.round(meta.width * scale)).png().toBuffer()
    });
    const focus = await page.evaluate(`(() => {
      const s = ${scene};
      const layer = s.boardTileLayer; const o = layer.snappedOrigin; const t = ${scenario === 'build' ? 'layer.endpointTiles.start' : 'layer.endpointTiles.goal'};
      if (!o || !t) return null;
      const cam = s.cameras.main; const rect = s.game.canvas.getBoundingClientRect();
      const k = rect.width / s.scale.width;
      return { x: rect.left + (o.x + t.left + t.width / 2) * k, y: rect.top + (o.y + t.top + t.height / 2) * k };
    })()`).catch(() => null);
    if (focus) {
      const dpr = meta.width / 390;
      const half = Math.round(60 * dpr);
      const left = Math.max(0, Math.min(meta.width - 2 * half, Math.round(focus.x * dpr) - half));
      const top = Math.max(0, Math.min(meta.height - 2 * half, Math.round(focus.y * dpr) - half));
      zooms.push({
        label: `zoom t=${target}ms`,
        png: await sharp(full).extract({ left, top, width: 2 * half, height: 2 * half }).png().toBuffer()
      });
    }
  }
  await browser.close();
  writeFileSync(join(outDir, `${label}.png`), await sheet(frames, { cols }));
  if (zooms.length > 0) writeFileSync(join(outDir, `${label}-zoom.png`), await sheet(zooms, { cols: Math.min(cols, 7) }));
  process.stdout.write(`${JSON.stringify({ label, engine, scenario, level, ...info, times, errors }, null, 1)}\n`);
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
