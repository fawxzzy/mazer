// Level-transition soak (MAZER-PERF-002): does frame cost or retained memory grow with the NUMBER OF LEVELS PLAYED in one session?
//
//   node scripts/analysis/soak-level-transitions.mjs --base-url=http://127.0.0.1:5656 [--start=300] [--levels=30] [--sample-every=5]
//     [--throttle=1] [--viewport=390x844] [--out=<file.json>]
//
// Opens `?previewLevel=<start>&runtimeDiagnostics=1` (in-memory sandbox), then completes level after level by placing the player on
// the tile next to the goal and stepping into it through window.__MAZER_QA__.movePlayPlayer (the real step, goal, deconstruct,
// regenerate, rebuild path). Every `sample-every` levels it records: JS heap (CDP Performance.getMetrics), DOM node count, Phaser
// texture count, scene display-list length, pending scene timers, registered scene event listeners, and the per-frame cost of
// update + render over a 2 s idle sample.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5656').replace(/\/$/, '');
const startLevel = Number(arg('start', '300'));
const levelCount = Number(arg('levels', '30'));
const sampleEvery = Number(arg('sample-every', '5'));
const throttle = Number(arg('throttle', '1'));
const [width, height] = arg('viewport', '390x844').split('x').map(Number);
const outFile = arg('out', '');

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 3 : 1, hasTouch: width < 600 });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__tasks = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__tasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported */ }
});
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.goto(`${baseUrl}/?previewLevel=${startLevel}&runtimeDiagnostics=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 120000 });

const unlocked = () => page.waitForFunction(() => {
  const qa = window.__MAZER_QA__;
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  if (!scene || scene.mode !== 'play' || scene.pendingResetRequest || scene.pendingGenerationRequest) return false;
  const r = qa.movePlayPlayer('move_up');
  return r && r.reason !== 'lifecycle-locked';
}, null, { timeout: 240000, polling: 250 });

const metrics = async () => {
  await page.evaluate(() => { if (typeof gc === 'function') gc(); });
  const perf = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  return page.evaluate(() => {
    const game = window.__MAZER_GAME__;
    const scene = game.scene.scenes.find((s) => s.boardTileLayer);
    const eventCount = (emitter) => Object.values(emitter?._events ?? {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
    return {
      level: scene.progressionState?.tracks?.player?.level ?? null,
      textures: Object.keys(game.textures.list).length,
      displayList: scene.children.list.length,
      sceneTimers: (scene.time?._active?.length ?? 0) + (scene.time?._pendingInsertion?.length ?? 0),
      sceneListeners: eventCount(scene.events) + eventCount(scene.sys?.events) + eventCount(scene.input),
      domNodes: document.getElementsByTagName('*').length,
      trailLen: scene.trail?.length ?? null
    };
  }).then((snap) => ({ ...snap, jsHeapMB: Number((perf.JSHeapUsedSize / 1048576).toFixed(1)), domNodesCdp: perf.Nodes, listenersCdp: perf.JSEventListeners }));
};

const frameCost = () => page.evaluate(() => new Promise((resolve) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const sums = { update: 0, render: 0 };
  const origRender = game.renderer.render;
  game.renderer.render = function wrappedRender(...args) { const t = performance.now(); try { return origRender.apply(this, args); } finally { sums.render += performance.now() - t; } };
  const origUpdate = scene.update;
  scene.update = function wrappedUpdate(...args) { const t = performance.now(); try { return origUpdate.apply(this, args); } finally { sums.update += performance.now() - t; } };
  scene.sys.sceneUpdate = scene.update;
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames += 1;
    if (performance.now() - start < 2000) requestAnimationFrame(tick);
    else {
      game.renderer.render = origRender;
      scene.update = origUpdate;
      scene.sys.sceneUpdate = origUpdate;
      resolve({ frames, updateMsPerFrame: Number((sums.update / frames).toFixed(2)), renderMsPerFrame: Number((sums.render / frames).toFixed(2)) });
    }
  };
  requestAnimationFrame(tick);
}));

const takeTasks = () => page.evaluate(() => window.__tasks.splice(0));
const completeLevel = async () => {
  await unlocked();
  await takeTasks();
  const placed = await page.evaluate(() => {
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    const { grid, goal } = scene.maze;
    for (const [dx, dy, move] of [[0, 1, 'move_up'], [0, -1, 'move_down'], [1, 0, 'move_left'], [-1, 0, 'move_right']]) {
      const near = { x: goal.x + dx, y: goal.y + dy };
      if (grid[near.y]?.[near.x] === true) {
        scene.player = { x: near.x, y: near.y };
        scene.trail = [{ x: near.x, y: near.y }];
        return move;
      }
    }
    return null;
  });
  if (!placed) throw new Error('no walkable tile next to the goal');
  const result = await page.evaluate((m) => window.__MAZER_QA__.movePlayPlayer(m), placed);
  if (!result?.accepted) throw new Error(`goal step rejected: ${JSON.stringify(result)}`);
  // Everything from the goal step to the next playable frame: record the longest main-thread tasks (completion + regenerate + rebuild).
  await unlocked();
  const tasks = await takeTasks();
  const sorted = tasks.map((t) => t.ms).sort((a, b) => b - a);
  taskRows.push({ longest: sorted[0] ?? 0, top3: sorted.slice(0, 3), count: tasks.length, totalMs: sorted.reduce((a, b) => a + b, 0) });
};
const taskRows = [];

const samples = [];
const take = async (completed) => {
  const m = await metrics();
  const f = await frameCost();
  const row = { completed, ...m, ...f };
  samples.push(row);
  console.log(JSON.stringify(row));
};
try {
  await unlocked();
  await take(0);
  for (let i = 1; i <= levelCount; i += 1) {
    await completeLevel();
    if (i % sampleEvery === 0) {
      await unlocked();
      await take(i);
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ transitionLongTasks: taskRows }));
if (outFile) writeFileSync(outFile, JSON.stringify({ samples, taskRows }, null, 2));
