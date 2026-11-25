// Frame cost of the star-dust trail options (MAZER-PERF-017 follow-up), on the trail-perf-options.html page.
//
//   node scripts/analysis/trail-perf-options-bench.mjs --base-url=http://127.0.0.1:5192 \
//     [--engine=chromium|webkit] [--webkit-exe=<Playwright.exe>] [--channel=chrome] [--level=300] [--viewport=390x844] [--dpr=3]
//     [--throttle=4] [--idle-ms=4000] [--walk-ms=4000] [--step-ms=139] [--set=ablation,variants] [--rows=id,id] [--out=<file.json>]
//     [--shots=<dir>] (one viewport screenshot per variant after its walk)
//     [--pw-module=<file URL of another Playwright's index.mjs>] (a WebKit build newer than this repo's Playwright hangs
//     at newPage; drive it with the Playwright it belongs to)
//
// Same page, level and long trail for every row. Each row: put the longest route minus the walk into the trail, wait,
// record rAF frame intervals for an idle window and a walking window (real moves through the QA hook). WebKit defers
// canvas raster to the compositor, so JS timers miss most of it; the rAF interval is the ground truth there, and the
// ablation rows (today's draw with one layer removed) rank what each layer costs. WebKit on Windows is a proxy for iOS
// Safari (different raster backend); Chromium gets the CDP CPU throttle, WebKit cannot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const engine = arg('engine', 'chromium');
const pw = await import(arg('pw-module', 'playwright'));
const { chromium, webkit } = pw.default ?? pw;
const baseUrl = arg('base-url', 'http://127.0.0.1:5192').replace(/\/$/, '');
const level = Number(arg('level', '300'));
const [vw, vh] = arg('viewport', '390x844').split('x').map(Number);
const dpr = Number(arg('dpr', '3'));
const throttle = Number(arg('throttle', '4'));
const idleMs = Number(arg('idle-ms', '4000'));
const walkMs = Number(arg('walk-ms', '4000'));
const stepMs = Number(arg('step-ms', '139'));
const sets = arg('set', 'ablation,variants').split(',');
const outFile = arg('out', '');
const shotsDir = arg('shots', '');

const ROWS = [];
if (sets.includes('ablation')) {
  ROWS.push(
    { id: 'today', kind: 'ablation', plan: {} },
    { id: 'no-bloom', kind: 'ablation', plan: { bloom: 'off' } },
    { id: 'no-thread', kind: 'ablation', plan: { thread: 'off' } },
    { id: 'no-keyline', kind: 'ablation', plan: { keyline: false } },
    { id: 'no-fills', kind: 'ablation', plan: { fills: false } },
    { id: 'still', kind: 'ablation', plan: { still: true } },
    { id: 'nothing', kind: 'ablation', plan: { bloom: 'off', thread: 'off', keyline: false, fills: false } }
  );
}
if (sets.includes('variants')) {
  for (const id of ['shipped', 'A', 'B', 'C', 'CA']) ROWS.push({ id, kind: 'variant' });
}

// --rows=today,nothing keeps only those rows (e.g. to compare device scales).
const onlyRows = arg('rows', '') ? new Set(arg('rows', '').split(',')) : null;
if (onlyRows) ROWS.splice(0, ROWS.length, ...ROWS.filter((row) => onlyRows.has(row.id)));

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
    else resolve({ deltas, moves, stats: h.stats() });
  };
  requestAnimationFrame(tick);
});

const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, mean: +mean.toFixed(1), p50: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(1) };
};

const webkitExe = arg('webkit-exe', '');
const browser = engine === 'webkit'
  ? await webkit.launch(webkitExe ? { executablePath: webkitExe } : {})
  : await chromium.launch(arg('channel', '') ? { channel: arg('channel', '') } : {});
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: vw < 600, isMobile: engine !== 'webkit' && vw < 600 });
  const page = await context.newPage();
  const cdp = engine === 'webkit' ? null : await context.newCDPSession(page);
  await page.goto(`${baseUrl}/trail-perf-options.html?previewLevel=${level}&runtimeDiagnostics=1&autoTrail=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MAZER_TRAIL_PERF__ && window.__MAZER_QA__ && window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer), null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    return Boolean(scene && scene.maze && scene.mode === 'play' && !scene.isLegacyPlayLifecycleInputLocked());
  }, null, { timeout: 240000, polling: 500 });
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });
  const shortOfEnd = Math.ceil(walkMs / stepMs) + 2;
  for (const row of ROWS) {
    await page.evaluate(({ r }) => {
      const h = window.__MAZER_TRAIL_PERF__;
      if (r.kind === 'variant') h.select(r.id);
      else h.usePlan(r.plan);
    }, { r: row });
    const trailTiles = await page.evaluate((n) => window.__MAZER_TRAIL_PERF__.fillLongTrail(n), shortOfEnd);
    await page.waitForTimeout(1500);
    const idle = await page.evaluate(SAMPLE, { durationMs: idleMs, walk: false, stepEvery: stepMs });
    const walk = await page.evaluate(SAMPLE, { durationMs: walkMs, walk: true, stepEvery: stepMs });
    if (shotsDir && row.kind === 'variant') {
      await page.waitForTimeout(700); // the bar's meter refreshes every 500 ms
      await page.screenshot({ path: join(shotsDir, `${engine}-${row.id}.png`), scale: 'css' });
    }
    const result = { id: row.id, kind: row.kind, trailTiles, idle: stats(idle.deltas), walk: stats(walk.deltas), moves: walk.moves, renderer: walk.stats };
    results.push(result);
    console.log(JSON.stringify({ id: row.id, idle: result.idle?.mean, walk: result.walk?.mean, walkP95: result.walk?.p95, moves: result.moves }));
  }
  if (outFile) {
    writeFileSync(outFile, JSON.stringify({ engine, level, viewport: `${vw}x${vh}@${dpr}`, throttle: cdp ? throttle : 1, idleMs, walkMs, stepMs, results }, null, 2));
  }
} finally {
  await browser.close();
}
