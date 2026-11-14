/**
 * Real-browser measurement of how SMOOTHLY the maze builds in (level start) and out/in (level change)
 * -- MAZER-VIS-040.
 *
 * What it records, per animation frame, through an in-page rAF recorder (Chromium via Playwright, phone
 * emulation: DPR 3 / 2.625, touch, mobile UA, standalone display-mode, optional Reduce Motion and CPU throttle):
 *   - a CSS-pixel copy of the game canvas, diffed against the previous frame inside the BOARD rect and
 *     outside it (HUD, diamonds, digit):  changedFrac (pixels that moved >= 16/255), popFrac (pixels that
 *     jumped >= 96/255 in ONE frame = a hard pop), maxDelta (largest single-channel jump);
 *   - the scene's own state (lifecycle phase, tilesVisible, edge-path switch);
 *   - the JS cost of the frame (scene update + Phaser render), measured by wrapping both, never the
 *     recorder's own diff work;
 *   - a contact sheet PNG of the board at ~8 evenly spaced times, for looking at.
 * "Pop frames" are frames whose popFrac inside the board rect exceeds POP_FRAME_THRESHOLD.
 *
 * Scenarios:
 *   start   ?previewLevel=L boots straight into play: the recorder starts at the first 'building' frame and
 *           stops 600 ms after input unlocks (level start: Start pressed -> maze built).
 *   change  waits for the first level to settle, walks the shortest path to the goal through the QA bridge and
 *           records the deconstruct + the next level's build (goal -> deconstruct -> build).
 *
 * Usage: node scripts/analysis/measure-maze-reveal-pop.mjs --base-url http://127.0.0.1:5641
 *          --scenario start|change --profile phone390|phone360|phone412|desktop [--level 40]
 *          [--reduce-motion] [--cpu 4] [--no-diff] [--fake-clock] [--out DIR] [--label NAME]
 * Prints one JSON summary on stdout; with --out also writes <label>.json, <label>.png (contact sheet).
 * Headless only: this is not a real-device measurement.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const PROFILES = {
  phone390: { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true, ua: 'ios' },
  phone360: { viewport: { width: 360, height: 740 }, dpr: 2.625, mobile: true, ua: 'android' },
  phone412: { viewport: { width: 412, height: 915 }, dpr: 2.625, mobile: true, ua: 'android' },
  desktop: { viewport: { width: 1280, height: 720 }, dpr: 1, mobile: false, ua: 'desktop' }
};
const USER_AGENTS = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktop: undefined
};

export const POP_PIXEL_DELTA = 96;
export const CHANGE_PIXEL_DELTA = 16;
export const POP_FRAME_THRESHOLD = 0.0015;
export const LAYER_POP_FRAME_THRESHOLD = 0.0015;

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

/** Init script: installs the standalone display-mode override and the recorder API on window.__rec. */
const installPage = (config) => {
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (candidate) => {
    if (candidate !== '(display-mode: standalone)') return nativeMatchMedia(candidate);
    return {
      addEventListener() {}, addListener() {}, dispatchEvent: () => true, matches: true,
      media: candidate, onchange: null, removeEventListener() {}, removeListener() {}
    };
  };

  const rec = {
    frames: [], sheet: [], running: false, rect: null, prev: null, scratch: null, cssW: 0, cssH: 0,
    cost: { update: 0, render: 0 }, wrapped: false, autoStart: config.autoStart, label: ''
  };
  window.__rec = rec;

  const scene = () => window.__MAZER_GAME__?.scene?.getScene?.('MenuScene') ?? null;
  const readRect = () => {
    try {
      const diag = JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics') || '{}');
      const b = diag.board?.bounds;
      if (b && b.width > 0) return { x: b.x ?? b.left, y: b.y ?? b.top, width: b.width, height: b.height };
    } catch { /* ignore */ }
    return null;
  };
  // The start and goal cells (grown by one cell for glow) in css px: where the markers and the spawning player live.
  const readCastRects = () => {
    try {
      const s = scene(); const L = s.boardTileLayer; const img = L.image; const lay = L.layout;
      if (!lay || !img.visible) return null;
      const b = img.getBounds(); const k = b.width / lay.width;
      const rectOf = (cell) => ({
        x: b.x + (lay.originX + lay.xs[cell.x - 1 < 0 ? 0 : cell.x - 1]) * k, y: b.y + (lay.originY + lay.ys[cell.y - 1 < 0 ? 0 : cell.y - 1]) * k,
        width: (lay.xs[Math.min(lay.cols, cell.x + 2)] - lay.xs[cell.x - 1 < 0 ? 0 : cell.x - 1]) * k,
        height: (lay.ys[Math.min(lay.rows, cell.y + 2)] - lay.ys[cell.y - 1 < 0 ? 0 : cell.y - 1]) * k
      });
      return [rectOf(s.maze.start), rectOf(s.maze.goal)];
    } catch { return null; }
  };
  const wrapCost = () => {
    if (rec.wrapped) return;
    const s = scene();
    const game = window.__MAZER_GAME__;
    if (!s || !game?.renderer) return;
    const origUpdate = s.update.bind(s);
    s.update = (time, delta) => { const t0 = performance.now(); origUpdate(time, delta); rec.cost.update += performance.now() - t0; };
    const origRender = game.renderer.render.bind(game.renderer);
    game.renderer.render = (...a) => { const t0 = performance.now(); origRender(...a); rec.cost.render += performance.now() - t0; };
    rec.wrapped = true;
  };

  const sampleState = () => {
    const s = scene();
    if (!s) return null;
    return {
      phase: s.menuStaticDrawLifecyclePhase, mode: s.mode, tiles: s.menuStaticDrawTilesVisible,
      tileCount: s.menuStaticDrawTileOrder?.length ?? 0, edge: s.legacyEdgePathsVisible === true
    };
  };

  const diffRegion = (a, b, w, x0, y0, x1, y1) => {
    let changed = 0; let pop = 0; let maxD = 0;
    for (let y = y0; y < y1; y += 1) {
      let i = ((y * w) + x0) * 4;
      for (let x = x0; x < x1; x += 1, i += 4) {
        const dr = Math.abs(a[i] - b[i]); const dg = Math.abs(a[i + 1] - b[i + 1]); const db = Math.abs(a[i + 2] - b[i + 2]);
        const d = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
        if (d >= config.changeDelta) changed += 1;
        if (d >= config.popDelta) pop += 1;
        if (d > maxD) maxD = d;
      }
    }
    return { changed, pop, maxD };
  };

  let lastT = 0; let lastCost = { update: 0, render: 0 };
  const tick = (t) => {
    try { tickInner(t); } catch (error) { (rec.errors ??= []).push(String(error && error.stack ? error.stack : error).slice(0, 400)); }
    requestAnimationFrame(tick);
  };
  const tickInner = (t) => {
    if (rec.running) {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const cssW = Math.round(canvas.getBoundingClientRect().width); const cssH = Math.round(canvas.getBoundingClientRect().height);
        if (!rec.scratch || rec.cssW !== cssW || rec.cssH !== cssH) {
          rec.scratch = document.createElement('canvas'); rec.scratch.width = cssW; rec.scratch.height = cssH;
          rec.cssW = cssW; rec.cssH = cssH; rec.prev = null;
        }
        const frame = { t, dt: lastT ? t - lastT : 0, state: sampleState(), costUpdate: rec.cost.update - lastCost.update, costRender: rec.cost.render - lastCost.render };
        lastCost = { update: rec.cost.update, render: rec.cost.render };
        if (config.diff) {
          const ctx = rec.scratch.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(canvas, 0, 0, cssW, cssH);
          const img = ctx.getImageData(0, 0, cssW, cssH);
          const rect = rec.rect ?? readRect();
          if (rect && !rec.rect) rec.rect = rect;
          const r = rec.rect ?? { x: 0, y: 0, width: cssW, height: cssH };
          const bx0 = Math.max(0, Math.floor(r.x)); const by0 = Math.max(0, Math.floor(r.y));
          const bx1 = Math.min(cssW, Math.ceil(r.x + r.width)); const by1 = Math.min(cssH, Math.ceil(r.y + r.height));
          if (rec.prev) {
            const inside = diffRegion(rec.prev, img.data, cssW, bx0, by0, bx1, by1);
            const all = diffRegion(rec.prev, img.data, cssW, 0, 0, cssW, cssH);
            const area = Math.max(1, (bx1 - bx0) * (by1 - by0));
            frame.board = { changed: inside.changed / area, pop: inside.pop / area, maxD: inside.maxD };
            const outArea = Math.max(1, (cssW * cssH) - area);
            const cast = rec.castRects ?? (rec.castRects = readCastRects());
            if (cast) {
              let pop = 0; let changed = 0; let maxD = 0;
              for (const c of cast) {
                const d = diffRegion(rec.prev, img.data, cssW, Math.max(0, Math.floor(c.x)), Math.max(0, Math.floor(c.y)), Math.min(cssW, Math.ceil(c.x + c.width)), Math.min(cssH, Math.ceil(c.y + c.height)));
                pop += d.pop; changed += d.changed; maxD = Math.max(maxD, d.maxD);
              }
              frame.cast = { popPx: pop, changedPx: changed, maxD };
            }
            frame.outside = { changed: (all.changed - inside.changed) / outArea, pop: (all.pop - inside.pop) / outArea, popPx: all.pop - inside.pop, maxD: all.maxD };
          }
          rec.prev = new Uint8ClampedArray(img.data);
          // The maze layer on its own (the baked floor/wall texture the scene shows through one Image): the part this
          // card changes, free of the level digit, the diamonds, the HUD and the markers.
          const layerImage = scene()?.boardTileLayer?.image;
          const layerCanvas = layerImage?.texture?.getSourceImage?.();
          if (layerImage?.visible && layerCanvas && layerCanvas.width > 1) {
            const lw = Math.max(1, Math.round(layerImage.displayWidth)); const lh = Math.max(1, Math.round(layerImage.displayHeight));
            if (!rec.layerScratch || rec.layerScratch.width !== lw || rec.layerScratch.height !== lh) {
              rec.layerScratch = document.createElement('canvas'); rec.layerScratch.width = lw; rec.layerScratch.height = lh; rec.layerPrev = null;
            }
            const lctx = rec.layerScratch.getContext('2d', { willReadFrequently: true });
            lctx.fillStyle = '#000'; lctx.fillRect(0, 0, lw, lh);
            lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
            lctx.globalAlpha = typeof layerImage.alpha === 'number' ? layerImage.alpha : 1;
            lctx.drawImage(layerCanvas, 0, 0, lw, lh);
            lctx.globalAlpha = 1;
            const limg = lctx.getImageData(0, 0, lw, lh);
            if (rec.layerPrev) {
              const ld = diffRegion(rec.layerPrev, limg.data, lw, 0, 0, lw, lh);
              const larea = lw * lh;
              frame.layer = { changed: ld.changed / larea, pop: ld.pop / larea, popPx: ld.pop, maxD: ld.maxD };
            }
            rec.layerPrev = new Uint8ClampedArray(limg.data);
          }
          if (rec.frames.length % config.sheetEvery === 0) rec.sheet.push({ w: cssW, h: cssH, data: new Uint8ClampedArray(img.data) });
        }
        rec.frames.push(frame);
        lastT = t;
      }
    }
    if (rec.autoStart && !rec.running) {
      wrapCost();
      const st = sampleState();
      if (st && st.phase === 'building' && st.tileCount > 0) rec.start(rec.autoStart);
    }
  };
  requestAnimationFrame(tick);
  rec.start = (label) => {
    wrapCost();
    rec.frames = []; rec.sheet = []; rec.prev = null; rec.castRects = null; rec.rect = readRect(); rec.running = true; rec.label = label;
    rec.cost = { update: 0, render: 0 }; lastCost = { update: 0, render: 0 }; lastT = 0;
    rec.autoStart = null;
  };
  rec.stop = () => { rec.running = false; return { frames: rec.frames, rect: rec.rect, cssW: rec.cssW, cssH: rec.cssH }; };
  rec.sheetPng = (columns, scaleDown, maxFrames) => {
    const rect = rec.rect ?? { x: 0, y: 0, width: rec.cssW, height: rec.cssH };
    const picks = [];
    const n = rec.sheet.length;
    const count = Math.min(maxFrames, n);
    for (let i = 0; i < count; i += 1) picks.push(rec.sheet[Math.round((i * (n - 1)) / Math.max(1, count - 1))]);
    const cw = Math.round(rect.width * scaleDown); const ch = Math.round(rect.height * scaleDown);
    const rows = Math.ceil(picks.length / columns);
    const out = document.createElement('canvas'); out.width = (cw + 4) * columns; out.height = (ch + 4) * rows;
    const octx = out.getContext('2d'); octx.fillStyle = '#222'; octx.fillRect(0, 0, out.width, out.height);
    const tmp = document.createElement('canvas'); const tctx = tmp.getContext('2d');
    picks.forEach((p, i) => {
      tmp.width = p.w; tmp.height = p.h; tctx.putImageData(new ImageData(p.data, p.w, p.h), 0, 0);
      const col = i % columns; const row = Math.floor(i / columns);
      octx.drawImage(tmp, rect.x, rect.y, rect.width, rect.height, col * (cw + 4) + 2, row * (ch + 4) + 2, cw, ch);
    });
    return out.toDataURL('image/png');
  };
};

const summarise = (data, cpu) => {
  const frames = data.frames;
  const withDiff = frames.filter((f) => f.board);
  const layerFrames = frames.filter((f) => f.layer);
  // After the reveal (the level digit and its rainbow no longer sit on the start tile): beams land, markers, player.
  const castFrames = frames.filter((f) => f.cast && f.state && f.state.tiles === null && f.state.phase !== 'idle');
  const sorted = (arr) => [...arr].sort((a, b) => a - b);
  const pct = (arr, p) => { const s = sorted(arr); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
  const dts = frames.map((f) => f.dt).filter((v) => v > 0);
  const cost = frames.map((f) => f.costUpdate + f.costRender);
  const pops = withDiff.filter((f) => f.board.pop > POP_FRAME_THRESHOLD);
  const popsOutside = withDiff.filter((f) => f.outside.popPx > 40);
  const boardChanged = withDiff.map((f) => f.board.changed);
  const bigFrames = withDiff
    .map((f, i) => ({ i, t: Math.round(f.t), state: f.state, board: f.board, outside: f.outside }))
    .filter((f) => f.board.pop > POP_FRAME_THRESHOLD || f.outside.popPx > 400)
    .sort((a, b) => (b.board.pop + b.outside.pop) - (a.board.pop + a.outside.pop))
    .slice(0, 8);
  return {
    cpuThrottle: cpu,
    frames: frames.length,
    durationMs: frames.length ? Math.round(frames[frames.length - 1].t - frames[0].t) : 0,
    frameDtMs: { median: +pct(dts, 0.5).toFixed(2), p95: +pct(dts, 0.95).toFixed(2), max: +Math.max(0, ...dts).toFixed(2) },
    jsCostMs: { mean: +(cost.reduce((a, b) => a + b, 0) / Math.max(1, cost.length)).toFixed(3), p95: +pct(cost, 0.95).toFixed(3), max: +Math.max(0, ...cost).toFixed(3) },
    board: withDiff.length === 0 ? null : {
      maxPopFrac: +Math.max(0, ...withDiff.map((f) => f.board.pop)).toFixed(5),
      popFrames: pops.length,
      popFrameThreshold: POP_FRAME_THRESHOLD,
      maxChangedFrac: +Math.max(0, ...boardChanged).toFixed(5),
      meanChangedFrac: +(boardChanged.reduce((a, b) => a + b, 0) / Math.max(1, boardChanged.length)).toFixed(5),
      maxDelta: Math.max(0, ...withDiff.map((f) => f.board.maxD)),
      // How many frames carry at least one pixel jump of >= 96/255 (any size): the build "ticking" tile by tile.
      framesWithAnyPop: withDiff.filter((f) => f.board.pop > 0).length
    },
    // The baked maze layer alone (floor + walls + docks): what the reveal changes. LAYER_POP_FRAME_THRESHOLD of its area
    // jumping by >= 96/255 inside ONE frame is a "pop frame".
    layer: layerFrames.length === 0 ? null : {
      maxPopFrac: +Math.max(0, ...layerFrames.map((f) => f.layer.pop)).toFixed(5),
      popFrames: layerFrames.filter((f) => f.layer.pop > LAYER_POP_FRAME_THRESHOLD).length,
      popFrameThreshold: LAYER_POP_FRAME_THRESHOLD,
      framesWithAnyPop: layerFrames.filter((f) => f.layer.popPx > 0).length,
      maxChangedFrac: +Math.max(0, ...layerFrames.map((f) => f.layer.changed)).toFixed(5),
      meanChangedFrac: +(layerFrames.reduce((a, f) => a + f.layer.changed, 0) / layerFrames.length).toFixed(5),
      maxDelta: Math.max(0, ...layerFrames.map((f) => f.layer.maxD)),
      worst: layerFrames
        .map((f) => ({ t: Math.round(f.t - frames[0].t), tiles: f.state?.tiles ?? null, phase: f.state?.phase, edge: f.state?.edge, pop: +f.layer.pop.toFixed(5), maxD: f.layer.maxD }))
        .sort((a, b) => b.pop - a.pop).slice(0, 5)
    },
    // The start + goal cells (and the player spawning on the start): markers fading in, player pop.
    cast: castFrames.length === 0 ? null : {
      maxPopPx: Math.max(0, ...castFrames.map((f) => f.cast.popPx)),
      framesWithPop: castFrames.filter((f) => f.cast.popPx > 0).length,
      maxChangedPx: Math.max(0, ...castFrames.map((f) => f.cast.changedPx)),
      maxDelta: Math.max(0, ...castFrames.map((f) => f.cast.maxD))
    },
    outside: withDiff.length === 0 ? null : {
      maxPopPx: Math.max(0, ...withDiff.map((f) => f.outside.popPx)),
      framesPopOver40px: popsOutside.length,
      maxDelta: Math.max(0, ...withDiff.map((f) => f.outside.maxD))
    },
    worstFrames: bigFrames
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args['base-url'] ?? 'http://127.0.0.1:5641').replace(/\/$/, '');
  const scenario = String(args.scenario ?? 'start');
  const profile = PROFILES[String(args.profile ?? 'phone390')];
  if (!profile) throw new Error(`unknown profile ${args.profile}`);
  const level = Number(args.level ?? 40);
  const reduce = args['reduce-motion'] === true;
  const cpu = Number(args.cpu ?? 1);
  const diff = args['no-diff'] !== true;
  const fake = args['fake-clock'] === true;
  const label = String(args.label ?? `${scenario}-${args.profile ?? 'phone390'}${reduce ? '-reduce' : ''}${cpu > 1 ? `-cpu${cpu}` : ''}`);
  const outDir = typeof args.out === 'string' ? resolve(args.out) : null;
  if (outDir) mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.dpr,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    userAgent: USER_AGENTS[profile.ua],
    reducedMotion: reduce ? 'reduce' : 'no-preference'
  });
  await context.addInitScript(installPage, { diff, autoStart: scenario === 'start' ? 'start' : null, sheetEvery: Number(args['sheet-every'] ?? 6), changeDelta: CHANGE_PIXEL_DELTA, popDelta: POP_PIXEL_DELTA });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (cpu > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  if (fake) { await page.clock.install({ time: 0 }); await page.clock.pauseAt(1); }
  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&previewLevel=${level}`, { waitUntil: 'load', timeout: 60_000 });

  // Real clock: plain waitForFunction. Fake clock (--fake-clock): the page only advances when we step it, 60 fps of
  // virtual time per step, so the per-frame metrics do not depend on how slow the recorder or the machine is.
  const STEP_MS = 16;
  const until = async (expression, maxMs, { boot = false } = {}) => {
    if (!fake) {
      await page.waitForFunction(expression, null, { timeout: maxMs, polling: 20 });
      return;
    }
    for (let virtual = 0; virtual < maxMs; virtual += boot ? 100 : STEP_MS) {
      if (await page.evaluate(expression)) return;
      await page.clock.runFor(boot ? 100 : STEP_MS);
      if (boot) await page.waitForTimeout(15);
    }
    throw new Error(`virtual timeout waiting for ${expression}`);
  };
  const advanceMs = async (ms) => {
    if (!fake) { await page.waitForTimeout(ms); return; }
    for (let virtual = 0; virtual < ms; virtual += STEP_MS) await page.clock.runFor(STEP_MS);
  };

  await until('Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__)', 90_000, { boot: true });
  const scene = `window.__MAZER_GAME__.scene.getScene('MenuScene')`;
  const unlocked = `(() => { const s = ${scene}; return s.mode === 'play' && s.menuStaticDrawLifecyclePhase === 'settled' && !s.isLegacyPlayLifecycleInputLocked(); })()`;
  let note = '';
  if (scenario === 'start') {
    await until('Boolean(window.__rec && window.__rec.running)', 60_000);
    await until(unlocked, 90_000);
    await advanceMs(600);
  } else {
    await until(unlocked, 90_000);
    await advanceMs(800);
    const tileCountBefore = await page.evaluate(`${scene}.menuStaticDrawTileOrder.length`);
    await page.evaluate(() => window.__rec.start('change'));
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
    // deconstruct (tiles gone) then the next level builds and unlocks again
    await until(`${scene}.menuStaticDrawLifecyclePhase === 'deconstructing'`, 30_000);
    await until(`${scene}.menuStaticDrawLifecyclePhase === 'building'`, 30_000);
    await until(unlocked, 90_000);
    await advanceMs(600);
    note = `tilesBefore=${tileCountBefore}`;
  }

  const data = await page.evaluate(() => window.__rec.stop());
  let png = null;
  if (diff) {
    png = await page.evaluate(() => window.__rec.sheetPng(8, 0.5, 16));
  }
  await browser.close();
  const summary = { label, scenario, fakeClock: fake, profile: args.profile ?? 'phone390', level, reduceMotion: reduce, note, errors, ...summarise(data, cpu) };
  if (outDir) {
    writeFileSync(join(outDir, `${label}.json`), JSON.stringify({ summary, frames: data.frames }, null, 1));
    if (png) writeFileSync(join(outDir, `${label}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
