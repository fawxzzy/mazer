// Frame cost of the board layer options (board-cost-options.html), plus a layer ablation of the frame without the trail
// painter, so the costs can be ranked. Follow-up of MAZER-PERF-017 (trail-perf-options-bench.mjs measures the same way).
//
//   node scripts/analysis/board-cost-options-bench.mjs --base-url=http://127.0.0.1:5194 \
//     [--engine=webkit|chromium] [--pw-module=<path to playwright-core>] [--webkit-exe=<Playwright.exe>] [--channel=chrome]
//     [--level=300] [--viewport=390x844] [--dpr=3] [--throttle=4] [--rounds=3] [--idle-ms=2500] [--walk-ms=2500]
//     [--set=ablation,inplace,variants] [--trail-paint=off,on] [--variants=today,A,B,C] [--out=<file.json>] [--shots=<dir>]
//
// variants: each round loads the page once per option (rotating order, so drift over time does not favour one option),
//   fills the longest route minus the walk into the trail, and records rAF frame intervals idle and walking (real moves
//   through the QA hook), with the trail painter off and on. Reported value = median of the per-round means.
// ablation: on the Today page with the trail painter off, rows hide one group of display objects (their renderCanvas
//   becomes a no-op) in interleaved rounds; Today minus a row = what that group costs a frame.
// inplace: one page and one maze, each round switches through the options in place (harness.select: exact copy on or
//   off, canvas cap applied and the scene re-laid out), trail painter off and on. No reloads, so the cleanest numbers.
// --shots: per option, one css-scale capture of the page with its bar, and one device-scale capture of the game canvas
//   of the SAME frame (bar removed, game loop asleep, option switched in place, frame re-drawn) for look diffs.
// WebKit defers canvas raster, so JS timers miss most of the cost; the rAF interval is the ground truth there. WebKit on
// Windows is a stand-in for iOS Safari (software raster and compositor); Chromium gets the CDP CPU throttle.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const engine = arg('engine', 'webkit');
const pwModule = arg('pw-module', '');
const pw = pwModule ? createRequire(join(pwModule, 'package.json'))(pwModule) : await import('playwright');
const { chromium, webkit } = pw.default ?? pw;
const baseUrl = arg('base-url', 'http://127.0.0.1:5194').replace(/\/$/, '');
const level = Number(arg('level', '300'));
const [vw, vh] = arg('viewport', '390x844').split('x').map(Number);
const dpr = Number(arg('dpr', '3'));
const throttle = Number(arg('throttle', '4'));
const rounds = Number(arg('rounds', '3'));
const idleMs = Number(arg('idle-ms', '2500'));
const walkMs = Number(arg('walk-ms', '2500'));
const stepMs = 139;
const sets = arg('set', 'ablation,inplace,variants').split(',');
const paints = arg('trail-paint', 'off,on').split(',').map((v) => v === 'on');
const variantIds = arg('variants', 'today,A,B,C').split(',');
const outFile = arg('out', '');
const shotsDir = arg('shots', '');

const ABLATION = {
  today: '() => []',
  board: '(s) => [s.boardTileLayer.image]',
  'trail-image': '(s) => [s.trailCanvasImage]',
  'player-glow': '(s) => [s.playerGlowCanvasImage]',
  backdrop: '(s) => [s.backdropGraphics]',
  'hud+overlay': '(s) => [s.hudGraphics, s.overlayGraphics, ...(s.uiGraphics || [])]',
  texts: "(s) => { const out = []; const walk = (l) => l.forEach((o) => { if (o.type === 'Text') out.push(o); if (o.list) walk(o.list); }); walk(s.children.list); return out; }",
  'markers+player': '(s) => [s.boardDynamicGraphics, s.goalBeaconGraphics, s.startPinwheelLayer && s.startPinwheelLayer.image]',
  'board+trail-image': '(s) => [s.boardTileLayer.image, s.trailCanvasImage]',
  everything: '(s) => { const out = []; const walk = (l) => l.forEach((o) => { if (o.list) walk(o.list); else out.push(o); }); walk(s.children.list); return out; }'
};

const SAMPLE = ({ durationMs, walk, stepEvery }) => new Promise((resolve) => {
  const h = window.__MAZER_TRAIL_PERF__;
  const deltas = [];
  let last = null;
  let lastStep = -Infinity;
  let moves = 0;
  const start = performance.now();
  const tick = (t) => {
    if (last !== null) deltas.push(t - last);
    last = t;
    if (walk && t - lastStep >= stepEvery && h.step()) { moves += 1; lastStep = t; }
    if (performance.now() - start < durationMs) requestAnimationFrame(tick);
    else resolve({ mean: deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length), n: deltas.length, moves });
  };
  requestAnimationFrame(tick);
});
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : +sorted[sorted.length >> 1].toFixed(1);
};

const webkitExe = arg('webkit-exe', '');
const browser = engine === 'webkit'
  ? await webkit.launch(webkitExe ? { executablePath: webkitExe } : {})
  : await chromium.launch(arg('channel', '') ? { channel: arg('channel', '') } : {});
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: vw < 600, isMobile: engine !== 'webkit' && vw < 600 });
// Same maze on every load: each load of ?previewLevel builds a fresh random maze, and a different maze (route length,
// trail shape) moves the frame time as much as an option does. Seeding Math.random makes the options comparable.
await context.addInitScript(() => {
  let s = 0x2f6b1d5 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
const page = await context.newPage();
const cdp = engine === 'webkit' ? null : await context.newCDPSession(page);

const open = async (variant, paint) => {
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.goto(`${baseUrl}/board-cost-options.html?previewLevel=${level}&runtimeDiagnostics=1&autoTrail=0&boardVariant=${variant}&trailPaint=${paint ? 1 : 0}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const scene = window.__MAZER_GAME__?.scene?.scenes?.find((s) => s.boardTileLayer);
    return Boolean(window.__MAZER_BOARD_COST__ && window.__MAZER_QA__ && scene && scene.maze && scene.mode === 'play' && !scene.isLegacyPlayLifecycleInputLocked());
  }, null, { timeout: 240000, polling: 500 });
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
};
const measure = async () => {
  await page.evaluate((n) => window.__MAZER_TRAIL_PERF__.fillLongTrail(n), Math.ceil(walkMs / stepMs) + 2);
  await page.waitForTimeout(1200);
  const idle = await page.evaluate(SAMPLE, { durationMs: idleMs, walk: false, stepEvery: stepMs });
  const walk = await page.evaluate(SAMPLE, { durationMs: walkMs, walk: true, stepEvery: stepMs });
  return { idle, walk };
};

const report = { engine, level, viewport: `${vw}x${vh}@${dpr}`, throttle: cdp ? throttle : 1, rounds, idleMs, walkMs, stepMs, ablation: null, inplace: null, variants: null };
try {
  if (sets.includes('ablation')) {
    await open('today', false);
    const rows = Object.keys(ABLATION);
    const raw = Object.fromEntries(rows.map((r) => [r, { idle: [], walk: [] }]));
    for (let round = 0; round < rounds; round += 1) {
      for (const row of rows) {
        await page.evaluate((src) => {
          const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
          const state = window.__boardBenchHidden || (window.__boardBenchHidden = []);
          for (const o of state.splice(0)) delete o.renderCanvas;
          for (const o of new Function(`return ${src}`)()(scene)) {
            if (o) { o.renderCanvas = () => {}; state.push(o); }
          }
        }, ABLATION[row]);
        const { idle, walk } = await measure();
        raw[row].idle.push(idle.mean);
        raw[row].walk.push(walk.mean);
        console.log(JSON.stringify({ set: 'ablation', round, row, idle: +idle.mean.toFixed(1), walk: +walk.mean.toFixed(1) }));
      }
    }
    report.ablation = Object.fromEntries(rows.map((r) => [r, { idleMs: median(raw[r].idle), walkMs: median(raw[r].walk), idleRuns: raw[r].idle.map((v) => +v.toFixed(1)), walkRuns: raw[r].walk.map((v) => +v.toFixed(1)) }]));
  }
  if (sets.includes('inplace')) {
    // No reloads: one page, one maze; every round switches through the options in place (rotating order), trail painter
    // off and on. The cleanest option-vs-Today numbers on a shared machine.
    await open('today', paints[0]);
    const raw = {};
    for (let round = 0; round < rounds; round += 1) {
      const order = variantIds.map((_, i) => variantIds[(i + round) % variantIds.length]);
      for (const id of order) {
        await page.evaluate((v) => window.__MAZER_BOARD_COST__.select(v), id);
        await page.waitForTimeout(800);
        for (const paint of paints) {
          await page.evaluate((on) => window.__MAZER_BOARD_COST__.setTrailPaint(on), paint);
          const { idle, walk } = await measure();
          const info = await page.evaluate(() => ({ exact: window.__MAZER_BOARD_COST__.exactStats(), canvas: [window.__MAZER_GAME__.canvas.width, window.__MAZER_GAME__.canvas.height] }));
          const key = `${id}|${paint ? 'on' : 'off'}`;
          (raw[key] || (raw[key] = { idle: [], walk: [] })).idle.push(idle.mean);
          raw[key].walk.push(walk.mean);
          raw[key].canvas = info.canvas;
          console.log(JSON.stringify({ set: 'inplace', round, id, trailPaint: paint, idle: +idle.mean.toFixed(1), walk: +walk.mean.toFixed(1), moves: walk.moves, ...info }));
        }
      }
    }
    report.inplace = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { idleMs: median(v.idle), walkMs: median(v.walk), idleRuns: v.idle.map((x) => +x.toFixed(1)), walkRuns: v.walk.map((x) => +x.toFixed(1)), canvas: v.canvas }]));
  }
  if (sets.includes('variants')) {
    const raw = {};
    for (let round = 0; round < rounds; round += 1) {
      const order = variantIds.map((_, i) => variantIds[(i + round) % variantIds.length]);
      for (const id of order) {
        await open(id, paints[0]);
        for (const paint of paints) {
          await page.evaluate((on) => window.__MAZER_BOARD_COST__.setTrailPaint(on), paint);
          const { idle, walk } = await measure();
          const info = await page.evaluate(() => ({ exact: window.__MAZER_BOARD_COST__.exactStats(), canvas: [window.__MAZER_GAME__.canvas.width, window.__MAZER_GAME__.canvas.height] }));
          const key = `${id}|${paint ? 'on' : 'off'}`;
          (raw[key] || (raw[key] = { idle: [], walk: [], info })).idle.push(idle.mean);
          raw[key].walk.push(walk.mean);
          raw[key].info = info;
          console.log(JSON.stringify({ set: 'variants', round, id, trailPaint: paint, idle: +idle.mean.toFixed(1), walk: +walk.mean.toFixed(1), moves: walk.moves, ...info }));
        }
      }
    }
    report.variants = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { idleMs: median(v.idle), walkMs: median(v.walk), idleRuns: v.idle.map((x) => +x.toFixed(1)), walkRuns: v.walk.map((x) => +x.toFixed(1)), ...v.info }]));
  }
  if (shotsDir) {
    mkdirSync(shotsDir, { recursive: true });
    // Page captures (with the bar) per option, switched in place.
    await open('today', true);
    await page.evaluate((n) => window.__MAZER_TRAIL_PERF__.fillLongTrail(n), 40);
    for (const id of variantIds) {
      await page.evaluate((v) => window.__MAZER_BOARD_COST__.select(v), id);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(shotsDir, `${engine}-${id}-page.png`), scale: 'css' });
    }
    // Canvas captures, bar removed. Per option: switch, let the game run 1.2 s (a canvas cap re-bakes the board in the
    // game's update), then put the loop to sleep and capture. The 2x options are captured at the phone's 3x screen
    // scale, as the browser shows them (scaled up). Animated bits (sparkles, star twinkle) differ between these.
    await page.evaluate(() => document.getElementById('board-cost-bar')?.remove());
    const redraw = () => {
      const game = window.__MAZER_GAME__;
      game.renderer.preRender(); game.scene.render(game.renderer); game.renderer.postRender();
    };
    for (const id of variantIds) {
      await page.evaluate((v) => { window.__MAZER_GAME__.loop.wake(); window.__MAZER_BOARD_COST__.select(v); }, id);
      await page.waitForTimeout(1200);
      await page.evaluate(`(${redraw})(window.__MAZER_GAME__.loop.sleep())`);
      await page.waitForTimeout(300);
      await page.locator('canvas').first().screenshot({ path: join(shotsDir, `${engine}-${id}-canvas.png`), scale: 'device' });
    }
    // Today vs A on literally the same frame (no update between them): only the board draw differs. A runs first with
    // the loop awake, so a canvas cap left by the last option is undone and the board re-baked at 3x.
    await page.evaluate(() => { window.__MAZER_GAME__.loop.wake(); window.__MAZER_BOARD_COST__.select('A'); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__MAZER_GAME__.loop.sleep());
    for (const id of ['A', 'today']) {
      await page.evaluate(`window.__MAZER_BOARD_COST__.select(${JSON.stringify(id)}); (${redraw})()`);
      await page.waitForTimeout(300);
      await page.locator('canvas').first().screenshot({ path: join(shotsDir, `${engine}-sameframe-${id}-canvas.png`), scale: 'device' });
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 1));
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 2));
