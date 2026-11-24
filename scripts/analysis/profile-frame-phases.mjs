// Per-phase frame cost on a phone profile with a long trail, headless Chromium (a proxy, not a phone).
//
//   node scripts/analysis/profile-frame-phases.mjs --base-url=http://127.0.0.1:5190 \
//     [--level=300] [--length=max] [--viewport=390x844] [--dpr=3] [--throttle=4] [--idle-ms=4000] [--walk-ms=4000]
//     [--step-ms=139] [--query=k=v] [--out=<file.json>] [--profile=<file.cpuprofile>] [--channel=chrome]
//     [--ab=path2d] [--shot=<file.png>] (a viewport screenshot after each variant's walk, suffixed with the variant)
//
// Opens `?previewLevel=N&runtimeDiagnostics=1` (in-memory sandbox, no account writes), waits for play, puts the longest
// route of the maze into the trail (player on its end), then for an idle window and a walking window records:
//   - rAF frame interval;
//   - ms per frame in the scene's draw methods (trail, trail canvas, player glow, edge beams, bleed glow, markers, HUD,
//     static board, board paths) and in Phaser's renderer.render;
//   - ms per frame per display-list object inside renderer.render (the drawImage of a canvas-backed Image is where
//     Chromium rasterises that canvas, so the trail canvas cost lands on the trail image);
//   - 2D context calls per frame split by target (main canvas vs offscreen canvases);
//   - every canvas-backed texture/scene canvas and its backing size;
//   - a CPU profile of the walking window: inclusive ms per frame for named functions and the garbage collector.
//
// WebKit: --engine=webkit [--pw-module=<file URL of a playwright index.mjs>] [--webkit-exe=<Playwright.exe>]. No CDP there,
// so no CPU throttle and no CPU profile: the in-page timers and call counts still run (WebKit on Windows is a proxy for
// iOS Safari, not the same renderer).
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const engine = arg('engine', 'chromium');
const pw = await import(arg('pw-module', 'playwright'));
const { chromium, webkit } = pw.default ?? pw;
const baseUrl = arg('base-url', 'http://127.0.0.1:5190').replace(/\/$/, '');
const level = Number(arg('level', '300'));
const lengthArg = arg('length', 'max');
const [vw, vh] = arg('viewport', '390x844').split('x').map(Number);
const dpr = Number(arg('dpr', '3'));
const throttle = Number(arg('throttle', '4'));
const idleMs = Number(arg('idle-ms', '4000'));
const walkMs = Number(arg('walk-ms', '4000'));
const stepMs = Number(arg('step-ms', '139'));
const extraQuery = arg('query', '');
const outFile = arg('out', '');
const profileFile = arg('profile', '');
const shotFile = arg('shot', '');

const SCENE_METHODS = [
  'update', 'drawDynamicBoard', 'drawLegacyContinuousPlayTrail', 'drawTrailCanvasSegments', 'drawPlayerGlowCanvas',
  'drawLegacyBleedOffGlow', 'drawLegacyEdgeLasers', 'drawLegacyEdgeMarkers', 'fillLegacyPlayerMarkerTile',
  'fillPlayDynamicMarkerTile', 'drawHud', 'drawStaticBoard', 'drawBoardPaths', 'drawBackdrop', 'drawLegacyLevelAnnouncer',
  'drawLegacyMenuPresenceCounter', 'drawLegacyHazardGateLayer'
];

const INSTRUMENT = (methods) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const sums = {};
  const counts = {};
  const add = (key, ms) => { sums[key] = (sums[key] ?? 0) + ms; counts[key] = (counts[key] ?? 0) + 1; };
  const wrap = (obj, name, key) => {
    const original = obj[name];
    if (typeof original !== 'function') return false;
    obj[name] = function wrapped(...args) {
      const t0 = performance.now();
      try { return original.apply(this, args); } finally { add(key, performance.now() - t0); }
    };
    return true;
  };
  for (const name of methods) wrap(scene, name, `scene.${name}`);
  if (scene.sys && typeof scene.sys.sceneUpdate === 'function') scene.sys.sceneUpdate = scene.update;
  wrap(game.renderer, 'render', 'phaser.render');
  // Name every display-list object once, by its scene field when it has one.
  const names = new Map();
  for (const [field, value] of Object.entries(scene)) {
    if (value && typeof value === 'object' && typeof value.renderCanvas === 'function' && !names.has(value)) names.set(value, field);
  }
  const label = (obj) => names.get(obj) ?? `${obj.type}:${obj.texture?.key ?? obj.name ?? '?'}`;
  const wrapped = new Set();
  for (const obj of scene.children.list) {
    let proto = Object.getPrototypeOf(obj);
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'renderCanvas')) proto = Object.getPrototypeOf(proto);
    if (!proto || wrapped.has(proto)) continue;
    wrapped.add(proto);
    const original = proto.renderCanvas;
    proto.renderCanvas = function wrappedRender(...args) {
      const t0 = performance.now();
      try { return original.apply(this, args); } finally { add(`obj.${label(this)}`, performance.now() - t0); }
    };
  }
  // 2D context call counts by target.
  const ctxCounts = { main: {}, offscreen: {} };
  const mainCanvas = game.canvas;
  const proto2d = CanvasRenderingContext2D.prototype;
  for (const name of ['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'clip', 'putImageData', 'getImageData', 'save', 'restore']) {
    const original = proto2d[name];
    proto2d[name] = function counted(...args) {
      const bucket = this.canvas === mainCanvas ? ctxCounts.main : ctxCounts.offscreen;
      bucket[name] = (bucket[name] ?? 0) + 1;
      return original.apply(this, args);
    };
  }
  window.__perf = { sums, counts, ctxCounts };
  // Route for the trail.
  const { grid } = scene.maze;
  const key = (p) => `${p.x},${p.y}`;
  const bfs = (from) => {
    const prev = new Map([[key(from), null]]);
    const queue = [from];
    let last = from;
    while (queue.length) {
      const cur = queue.shift();
      last = cur;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = { x: cur.x + dx, y: cur.y + dy };
        if (grid[next.y]?.[next.x] !== true || prev.has(key(next))) continue;
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
    const path = [];
    for (let c = last; c; c = prev.get(key(c)) ?? null) path.push({ x: c.x, y: c.y });
    return path.reverse();
  };
  const far = bfs({ x: scene.player.x, y: scene.player.y });
  window.__route = bfs(far[far.length - 1]);
  return window.__route.length;
};

const SET_TRAIL = (length) => {
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  const path = window.__route.slice(0, length).map((p) => ({ ...p }));
  scene.trail = path;
  scene.player = { ...path[path.length - 1] };
  scene.boardDynamicDirty = true;
  return path.length;
};

const CANVASES = () => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((s) => s.boardTileLayer);
  const out = [{ name: 'main', w: game.canvas.width, h: game.canvas.height }];
  const seen = new Set([game.canvas]);
  for (const [field, value] of Object.entries(scene)) {
    const canvas = value instanceof HTMLCanvasElement ? value : value?.canvas instanceof HTMLCanvasElement ? value.canvas : null;
    if (canvas && !seen.has(canvas)) { seen.add(canvas); out.push({ name: `scene.${field}`, w: canvas.width, h: canvas.height }); }
  }
  for (const [keyName, texture] of Object.entries(game.textures.list)) {
    const image = texture.source?.[0]?.image;
    if (image instanceof HTMLCanvasElement && !seen.has(image)) { seen.add(image); out.push({ name: `tex.${keyName}`, w: image.width, h: image.height }); }
  }
  return out.map((c) => ({ ...c, mpx: +((c.w * c.h) / 1e6).toFixed(2) })).sort((a, b) => b.mpx - a.mpx);
};

const SAMPLE = ({ durationMs, walk, stepEvery }) => new Promise((resolve) => {
  const { sums, counts, ctxCounts } = window.__perf;
  for (const k of Object.keys(sums)) { sums[k] = 0; counts[k] = 0; }
  for (const bucket of Object.values(ctxCounts)) for (const k of Object.keys(bucket)) bucket[k] = 0;
  const qa = window.__MAZER_QA__;
  const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
  const route = window.__route;
  const deltas = [];
  let last = null;
  let lastStep = -Infinity;
  let moves = 0;
  const start = performance.now();
  const dirFor = (a, b) => (b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up');
  const tick = (t) => {
    if (last !== null) deltas.push(t - last);
    last = t;
    if (walk && t - lastStep >= stepEvery) {
      const i = route.findIndex((p) => p.x === scene.player.x && p.y === scene.player.y);
      if (i >= 0 && i + 1 < route.length) {
        const r = qa.movePlayPlayer(dirFor(route[i], route[i + 1]));
        if (r?.accepted) { moves += 1; lastStep = t; }
      }
    }
    if (performance.now() - start < durationMs) requestAnimationFrame(tick);
    else {
      const frames = Math.max(1, deltas.length);
      const per = {};
      for (const k of Object.keys(sums)) if (sums[k] > 0) per[k] = { msPerFrame: +(sums[k] / frames).toFixed(2), callsPerFrame: +(counts[k] / frames).toFixed(2) };
      const ctx = {};
      for (const [b, bucket] of Object.entries(ctxCounts)) {
        ctx[b] = {};
        for (const [k, v] of Object.entries(bucket)) if (v > 0) ctx[b][k] = +(v / frames).toFixed(1);
      }
      resolve({ deltas, per, ctx, moves, trailLen: scene.trail.length });
    }
  };
  requestAnimationFrame(tick);
});

const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, mean: +mean.toFixed(1), p50: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(1) };
};

// Inclusive and self ms per function name from a CPU profile.
const summariseProfile = (profile, frames) => {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map();
  const total = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i += 1) {
    const dt = (dts[i + 1] ?? dts[i]) / 1000;
    let node = byId.get(profile.samples[i]);
    const name = (n) => `${n.callFrame.functionName || '(anon)'}${n.callFrame.url ? ` ${n.callFrame.url.split('/').pop().split('?')[0]}` : ''}`;
    self.set(name(node), (self.get(name(node)) ?? 0) + dt);
    const seenNames = new Set();
    while (node) {
      const nm = name(node);
      if (!seenNames.has(nm)) { seenNames.add(nm); total.set(nm, (total.get(nm) ?? 0) + dt); }
      node = byId.get(parent.get(node.id));
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, +(v / frames).toFixed(2)]);
  return { selfMsPerFrame: top(self), totalMsPerFrame: top(total) };
};

const channel = arg('channel', '');
const webkitExe = arg('webkit-exe', '');
const browser = engine === 'webkit'
  ? await webkit.launch(webkitExe ? { executablePath: webkitExe } : {})
  : await chromium.launch(channel ? { channel } : {});
try {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: vw < 600, isMobile: engine !== 'webkit' && vw < 600 });
  const page = await context.newPage();
  const cdp = engine === 'webkit' ? null : await context.newCDPSession(page);
  await page.goto(`${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1${extraQuery ? `&${extraQuery}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer) && window.__MAZER_QA__, null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    return Boolean(scene && scene.maze && scene.mode === 'play' && !scene.isLegacyPlayLifecycleInputLocked());
  }, null, { timeout: 240000, polling: 500 });
  const routeLength = await page.evaluate(INSTRUMENT, SCENE_METHODS);
  const target = lengthArg === 'max' ? routeLength - Math.ceil(walkMs / stepMs) - 2 : Math.min(Number(lengthArg), routeLength - 2);
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // --ab=path2d: the same page and trail measured with Path2D hidden (the star-dust keylines fall back to one context
  // path, the code before MAZER-PERF-017) and then present (batched). Nothing else in src uses Path2D.
  const variants = arg('ab', '') === 'path2d' ? ['path2d-hidden', 'path2d'] : ['as-is'];
  const results = [];
  for (const variant of variants) {
    await page.evaluate((hide) => {
      if (!window.__savedPath2D) window.__savedPath2D = window.Path2D;
      window.Path2D = hide ? undefined : window.__savedPath2D;
    }, variant === 'path2d-hidden');
    const placed = await page.evaluate(SET_TRAIL, target);
    await page.waitForTimeout(1500);
    const idle = await page.evaluate(SAMPLE, { durationMs: idleMs, walk: false, stepEvery: stepMs });
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('Profiler.start');
    }
    const walk = await page.evaluate(SAMPLE, { durationMs: walkMs, walk: true, stepEvery: stepMs });
    const profile = cdp ? (await cdp.send('Profiler.stop')).profile : null;
    if (profile && profileFile) writeFileSync(profileFile.replace(/(\.cpuprofile)?$/, `-${variant}.cpuprofile`), JSON.stringify(profile));
    if (shotFile) await page.screenshot({ path: shotFile.replace(/(\.png)?$/, `-${variant}.png`), scale: 'css' });
    const canvases = await page.evaluate(CANVASES);
    const result = {
      engine, variant, level, query: extraQuery, viewport: `${vw}x${vh}@${dpr}`, throttle: cdp ? throttle : 1, routeLength, trailTiles: placed,
      idle: { frame: stats(idle.deltas), per: idle.per, ctx: idle.ctx },
      walk: { frame: stats(walk.deltas), per: walk.per, ctx: walk.ctx, moves: walk.moves, trailEnd: walk.trailLen },
      canvases,
      walkProfile: profile ? summariseProfile(profile, Math.max(1, walk.deltas.length)) : null
    };
    results.push(result);
    console.log(JSON.stringify({ variant, idle: result.idle.frame, walk: result.walk.frame }));
  }
  if (outFile) writeFileSync(outFile, JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} finally {
  await browser.close();
}
