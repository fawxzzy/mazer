// MAZER-PERF-009: main-thread cost of the FIRST maze of a session in headless Chromium.
//
//   node scripts/analysis/measure-first-maze.mjs --base-url=http://127.0.0.1:5671 \
//     [--scenarios=preview,play] [--level=100] [--viewports=390x844@3,412x915@2.625,360x740@2.625] \
//     [--throttle=4] [--runs=3] [--profile] [--worker=off] [--out=<file.json>]
//
// Scenarios (all use the runtime-diagnostics authenticated fixture, so no account is touched):
//   preview  /?previewLevel=N&runtimeDiagnostics=1            (boot straight into play, sandbox progression)
//   play     /?mode=play&runtimeDiagnostics=1&authFixture=authenticated   (the Play Mazer shortcut shape)
// Per run it records every longtask (>50 ms) from navigation to `--settle-ms` after the play maze is installed, the
// worst requestAnimationFrame gap in that window, and when the play maze was installed. `--worker=off` appends
// `&mazeWorker=off` (the synchronous baseline). `--profile` samples the JS profiler (use the unminified dev server for
// readable names) and reports, per busy stretch >= 50 ms, the self-time top functions.
// CPU throttling is CDP Emulation.setCPUThrottlingRate (main thread only; headless software canvas is a proxy, not a phone).
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5671').replace(/\/$/, '');
const scenarios = arg('scenarios', 'preview,play').split(',');
const level = Number(arg('level', '100'));
const viewports = arg('viewports', '390x844@3').split(',').map((v) => {
  const [size, dpr] = v.split('@');
  const [width, height] = size.split('x').map(Number);
  return { width, height, dpr: Number(dpr ?? 1) };
});
const throttle = Number(arg('throttle', '4'));
const runs = Number(arg('runs', '3'));
const settleMs = Number(arg('settle-ms', '4000'));
const workerOff = arg('worker', 'on') === 'off';
const profile = process.argv.includes('--profile');
const outFile = arg('out', '');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const INSTALL_OBSERVERS = () => {
  const perf = { longtasks: [], installedAt: null, installedMode: null, gaps: [], scenePolls: 0 };
  window.__perf = perf;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.longtasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask unsupported */ }
  let last = null;
  const tick = (t) => {
    const game = window.__MAZER_GAME__;
    const scene = game?.scene?.scenes?.find((s) => s.boardTileLayer);
    if (scene && perf.installedAt === null && scene.mode === 'play' && scene.maze && scene.maze.grid) {
      perf.installedAt = t;
      perf.installedMode = scene.mode;
    }
    if (scene && last !== null) perf.gaps.push({ at: t, gap: t - last });
    if (scene) last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// Functions whose per-call wall time is reported (contiguous profiler spans whose stack contains the name).
const SPAN_TARGETS = (arg('spans', 'createLegacyRuntimeMazeForMode,applyGenerationRequest,startPlayMode,refreshLayout,bakeBoard,drawBoardPaths,drawStaticBoard,render,rebuildUi,create')).split(',');

const analyseSpans = (cpuProfile) => {
  const nodes = new Map(cpuProfile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of cpuProfile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const names = (id) => {
    const out = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) out.add(nodes.get(cur)?.callFrame.functionName ?? '');
    return out;
  };
  const open = new Map();
  const spans = [];
  let t = cpuProfile.startTime;
  const flush = (name, endUs) => {
    const o = open.get(name);
    open.delete(name);
    if (o && endUs - o.startUs >= 3000) spans.push({ name, atMs: Math.round((o.startUs - cpuProfile.startTime) / 1000), ms: Number(((endUs - o.startUs) / 1000).toFixed(1)) });
  };
  for (let i = 0; i < cpuProfile.samples.length; i += 1) {
    const dt = cpuProfile.timeDeltas[i] ?? 0;
    t += dt;
    const present = names(cpuProfile.samples[i]);
    for (const name of SPAN_TARGETS) {
      if (present.has(name)) { if (!open.has(name)) open.set(name, { startUs: t - dt }); } else if (open.has(name)) flush(name, t - dt);
    }
  }
  for (const name of [...open.keys()]) flush(name, t);
  return spans.sort((a, b) => b.ms - a.ms).slice(0, 14);
};

const analyseProfile = (cpuProfile) => {
  const nodes = new Map(cpuProfile.nodes.map((n) => [n.id, n]));
  const stretches = [];
  let current = null;
  let t = cpuProfile.startTime;
  for (let i = 0; i < cpuProfile.samples.length; i += 1) {
    const dt = cpuProfile.timeDeltas[i] ?? 0;
    t += dt;
    const node = nodes.get(cpuProfile.samples[i]);
    const idle = node?.callFrame.functionName === '(idle)' || node?.callFrame.functionName === '(program)';
    if (idle) {
      if (current) { stretches.push(current); current = null; }
    } else {
      if (!current) current = { startUs: t - dt, durUs: 0, self: new Map() };
      current.durUs += dt;
      const frame = node.callFrame;
      const key = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').slice(-2).join('/')}:${frame.lineNumber}`;
      current.self.set(key, (current.self.get(key) ?? 0) + dt);
    }
  }
  if (current) stretches.push(current);
  return stretches
    .filter((s) => s.durUs >= 50000)
    .map((s) => ({
      ms: Math.round(s.durUs / 1000),
      top: [...s.self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`)
    }));
};

const urlFor = (scenario) => {
  const extra = workerOff ? '&mazeWorker=off' : '';
  if (scenario === 'preview') return `${baseUrl}/?previewLevel=${level}&runtimeDiagnostics=1${extra}`;
  if (scenario === 'play') return `${baseUrl}/?mode=play&runtimeDiagnostics=1&authFixture=authenticated${extra}`;
  throw new Error(`unknown scenario ${scenario}`);
};

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    for (const scenario of scenarios) {
      for (let run = 0; run < runs; run += 1) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.dpr,
          hasTouch: viewport.width < 600,
          isMobile: viewport.width < 600,
          userAgent: viewport.width < 600 ? MOBILE_UA : undefined
        });
        const page = await context.newPage();
        await page.addInitScript(INSTALL_OBSERVERS);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        if (profile) {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
          await cdp.send('Profiler.start');
        }
        await page.goto(urlFor(scenario), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__perf?.installedAt !== null, null, { timeout: 120000 });
        await page.waitForTimeout(settleMs);
        const data = await page.evaluate(() => ({
          perf: window.__perf,
          now: performance.now(),
          level: window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer)?.progressionState?.tracks?.player?.level ?? null
        }));
        let stretches = null;
        let spans = null;
        if (profile) {
          const { profile: cpuProfile } = await cdp.send('Profiler.stop');
          stretches = analyseProfile(cpuProfile);
          spans = analyseSpans(cpuProfile);
        }
        const tasks = data.perf.longtasks.filter((t) => t.start <= data.perf.installedAt + settleMs);
        const gapsAfterBoot = data.perf.gaps.filter((g) => g.at <= data.perf.installedAt + settleMs);
        const worstGap = gapsAfterBoot.reduce((m, g) => Math.max(m, g.gap), 0);
        const row = {
          scenario, viewport: `${viewport.width}x${viewport.height}@${viewport.dpr}`, throttle, worker: workerOff ? 'off' : 'on', run,
          level: data.level,
          installedAtMs: Math.round(data.perf.installedAt),
          longTasks: tasks.map((t) => ({ at: Math.round(t.start), ms: Math.round(t.duration) })),
          longestTaskMs: tasks.reduce((m, t) => Math.max(m, Math.round(t.duration)), 0),
          worstRafGapMs: Math.round(worstGap),
          // The task that straddles / follows the install (the first-maze cost): the longest task starting within 1.5 s before the install.
          ...(stretches ? { busyStretches: stretches, spans } : {})
        };
        results.push(row);
        console.log(JSON.stringify(row));
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
