/**
 * MAZER-PERF-010: boot-splash tail harness (headless Chromium only; nothing here is a real device).
 *
 *   node scripts/analysis/measure-splash-tail.mjs --target=<built dist dir | https://host> --n=60 --label=x
 *        [--out=file.json] [--profile=loopback|edge|wan] [--throttle=4] [--port=5621] [--wait=3500]
 *
 * A dist dir (npx vite build --outDir <dir>) is served from a Vercel-like static server on mazer-proof.localhost
 * (not treated as localhost by the app, so the production service worker registers). profile: loopback = no
 * network model; edge = 20-60 ms first byte, 30 Mbit/s; wan = exponential first-byte jitter (long tail), 30 Mbit/s.
 * --throttle=N applies CDP CPU throttling to the page (a busy host). A https target is measured as is.
 *
 * For every run: a FRESH browser context (no SW, no cache, no storage) at 390x844, standalone display-mode
 * override (so the install gate does not hide the menu, same as scripts/analysis/verify-offline-shell.mjs),
 * goto(waitUntil: networkidle), then the QA harness' check at idle + wait ms: is the HTML boot splash still
 * interactive-blocking? Also records the whole timeline so the cause is visible, not just the rate.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve as presolve } from 'node:path';
import os from 'node:os';
import { brotliCompressSync, constants as zc } from 'node:zlib';

import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const N = Number(args.n ?? 60);
const WAIT = Number(args.wait ?? 3500);
const PORT = Number(args.port ?? 5621);
const PROFILE = args.profile ?? 'loopback';
const TARGET = String(args.target);
const LABEL = args.label ?? TARGET;
const isRemote = /^https?:/.test(TARGET);
const HOST = 'mazer-proof.localhost';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rng = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();

// Vercel-like static server. "edge" profile: 35-90 ms first-byte jitter per request, ~30 Mbit/s per response,
// brotli for text, to model a WAN edge. "loopback": none.
const startServer = async (dist) => {
  const cache = new Map();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || ['/update-password', '/privacy', '/terms'].includes(p)) p = '/index.html';
    const file = join(presolve(dist), p);
    if (!file.startsWith(presolve(dist)) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; res.end('nf'); return; }
    const ext = extname(file);
    let body = readFileSync(file);
    const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' };
    if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!cache.has(file)) cache.set(file, brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }));
      body = cache.get(file); headers['content-encoding'] = 'br';
    }
    headers['content-length'] = body.length;
    const delay = PROFILE === 'edge' ? 20 + rng() * 40 : PROFILE === 'wan' ? 15 + (-Math.log(1 - rng())) * 30 : 0;
    const bytesPerMs = PROFILE === 'edge' || PROFILE === 'wan' ? 3750 : Infinity; // 30 Mbit/s
    setTimeout(() => {
      res.writeHead(200, headers);
      if (bytesPerMs === Infinity) { res.end(body); return; }
      res.end(body); // throttle by deferring the end by the transfer time
    }, delay + (bytesPerMs !== Infinity ? body.length / bytesPerMs : 0));
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  return server;
};

const cpuSnap = () => os.cpus().map((c) => ({ ...c.times }));
const cpuUtil = (a, b) => {
  let busy = 0; let total = 0;
  a.forEach((x, i) => { const y = b[i]; const idle = y.idle - x.idle; const t = Object.keys(y).reduce((s, k) => s + (y[k] - x[k]), 0); total += t; busy += t - idle; });
  return total ? busy / total : 0;
};

const initScript = () => {
  const rec = (e) => { try { window.__perfRec({ ...e, wall: Date.now() }); } catch { /* binding gone */ } };
  rec({ t: 'doc-start', nav: performance.getEntriesByType?.('navigation')?.[0]?.type ?? 'n/a', swController: Boolean(navigator.serviceWorker?.controller) });
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) rec({ t: 'longtask', start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
  navigator.serviceWorker?.addEventListener('controllerchange', () => rec({ t: 'controllerchange' }));
  window.addEventListener('load', () => rec({ t: 'load' }));
  let stageStore;
  Object.defineProperty(window, '__MAZER_BOOT_STATUS__', { configurable: true, get: () => stageStore, set: (v) => { stageStore = v; rec({ t: 'stage', stage: v?.stage ?? null }); } });
  // display-mode override: standalone, so the install gate does not replace the menu
  const nativeMM = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q === '(display-mode: standalone)'
    ? { addEventListener() {}, addListener() {}, dispatchEvent: () => true, matches: true, media: q, onchange: null, removeEventListener() {}, removeListener() {} }
    : nativeMM(q));
  let splashOffSent = false; let swLast = '';
  const iv = setInterval(async () => {
    const s = document.getElementById('mazer-boot-splash');
    const off = !s || s.style.pointerEvents === 'none';
    if (off && !splashOffSent && document.getElementById('app')) { splashOffSent = true; rec({ t: 'splash-off', removed: !s }); }
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const st = `${reg?.installing?.state ?? '-'}|${reg?.waiting?.state ?? '-'}|${reg?.active?.state ?? '-'}`;
      if (st !== swLast) { swLast = st; rec({ t: 'sw', st }); }
    } catch { /* ignore */ }
  }, 25);
  window.addEventListener('pagehide', () => clearInterval(iv));
};

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

const main = async () => {
  let server = null; let origin;
  if (isRemote) origin = TARGET.replace(/\/$/, '');
  else { server = await startServer(TARGET); origin = `http://${HOST}:${PORT}`; }
  const browser = await chromium.launch();
  const runs = [];
  for (let i = 0; i < N; i += 1) {
    const events = []; const reqs = [];
    const cpu0 = cpuSnap();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await context.addInitScript(initScript);
    const page = await context.newPage();
    if (args.throttle) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.throttle) }); }
    await page.exposeFunction('__perfRec', (e) => events.push(e));
    const byReq = new Map();
    const t0 = Date.now();
    context.on('request', (r) => { const e = { url: new URL(r.url()).pathname.slice(-48), start: Date.now() - t0, sw: (() => { try { return r.serviceWorker() != null; } catch { return false; } })() }; byReq.set(r, e); reqs.push(e); });
    context.on('response', (r) => { const e = byReq.get(r.request()); if (e) { e.status = r.status(); e.fromSW = r.fromServiceWorker(); } });
    context.on('requestfinished', (r) => { const e = byReq.get(r); if (e) e.end = Date.now() - t0; });
    let mainNavs = 0; const navAt = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) { mainNavs += 1; navAt.push(Date.now() - t0); } });
    const run = { i };
    try {
      await page.goto(`${origin}/?runtimeDiagnostics=1`, { waitUntil: 'networkidle', timeout: 60000 });
      const tIdle = Date.now() - t0; run.tIdle = tIdle;
      await sleep(WAIT);
      const tCheck = Date.now() - t0;
      let splashUp = null;
      try { splashUp = await page.evaluate(() => { const s = document.getElementById('mazer-boot-splash'); return Boolean(s) && s.style.pointerEvents !== 'none'; }); } catch { splashUp = 'navigating'; }
      run.tCheck = tCheck; run.splashUpAtCheck = splashUp;
      // keep watching: until the last document's splash is off and 2 s without a navigation
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        await sleep(200);
        const lastStart = [...events].reverse().find((e) => e.t === 'doc-start');
        const offAfter = events.some((e) => e.t === 'splash-off' && lastStart && e.wall >= lastStart.wall);
        if (offAfter && Date.now() - (navAt.at(-1) + t0) > 1500) break;
      }
    } catch (e) { run.error = String(e.message).slice(0, 120); }
    const cpu1 = cpuSnap();
    run.cpu = Number(cpuUtil(cpu0, cpu1).toFixed(2));
    run.mainNavs = mainNavs; run.navAt = navAt;
    const docStarts = events.filter((e) => e.t === 'doc-start').map((e) => e.wall - t0);
    run.docStarts = docStarts;
    const offs = events.filter((e) => e.t === 'splash-off').map((e) => e.wall - t0);
    run.splashOff = offs;
    run.firstSplashOff = offs[0] ?? null;
    run.finalSplashOff = offs.at(-1) ?? null; // the document that stays
    run.reloadAfterIdleMs = navAt.length > 1 ? navAt[1] - run.tIdle : null;
    run.controllerChangeAt = events.filter((e) => e.t === 'controllerchange').map((e) => e.wall - t0);
    run.sw = events.filter((e) => e.t === 'sw').map((e) => `${e.wall - t0}:${e.st}`);
    run.stages = events.filter((e) => e.t === 'stage').map((e) => `${e.wall - t0}:${e.stage}`);
    run.longtasks = events.filter((e) => e.t === 'longtask').map((e) => e.dur);
    run.longTaskMaxMs = run.longtasks.length ? Math.max(...run.longtasks) : 0;
    run.reqs = reqs.length; run.reqsAfterIdle = reqs.filter((r) => r.start > (run.tIdle ?? 0)).length;
    run.swReqs = reqs.filter((r) => r.sw).length;
    // time-to-menu-ready from navigation start of the document that finally stays
    run.timeToMenu = run.finalSplashOff;
    run.fail = run.splashUpAtCheck !== false;
    if (run.fail || i < 2) run.waterfall = reqs.map((r) => `${r.start}-${r.end ?? '?'} ${r.sw ? 'SW ' : ''}${r.fromSW ? 'fromSW ' : ''}${r.status ?? ''} ${r.url}`);
    runs.push(run);
    await context.close();
    process.stdout.write(`${LABEL} ${String(i + 1).padStart(2)}/${N} idle=${run.tIdle} navs=${run.mainNavs} reloadAfterIdle=${run.reloadAfterIdleMs} off=${JSON.stringify(run.splashOff)} fail=${run.fail} cpu=${run.cpu}\n`);
  }
  await browser.close(); server?.close();
  const ok = runs.filter((r) => !r.error);
  const finals = ok.map((r) => r.finalSplashOff).filter((x) => x != null);
  const firsts = ok.map((r) => r.firstSplashOff).filter((x) => x != null);
  const summary = {
    label: LABEL, profile: isRemote ? 'remote' : PROFILE, n: runs.length, errors: runs.length - ok.length,
    failRate: ok.filter((r) => r.fail).length / ok.length, fails: ok.filter((r) => r.fail).length,
    reloaded: ok.filter((r) => r.mainNavs > 1).length,
    reloadAfterIdle_ms: { p50: pct(ok.map((r) => r.reloadAfterIdleMs).filter((x) => x != null), 0.5), max: Math.max(...ok.map((r) => r.reloadAfterIdleMs ?? -1)) },
    firstSplashOff_ms: { p50: pct(firsts, 0.5), p95: pct(firsts, 0.95), max: Math.max(...firsts) },
    finalSplashOff_ms: { p50: pct(finals, 0.5), p95: pct(finals, 0.95), max: Math.max(...finals), over3500: finals.filter((x) => x > 3500).length },
    tIdle_ms: { p50: pct(ok.map((r) => r.tIdle), 0.5), p95: pct(ok.map((r) => r.tIdle), 0.95), max: Math.max(...ok.map((r) => r.tIdle)) },
    longTaskMax_ms: { p50: pct(ok.map((r) => r.longTaskMaxMs), 0.5), max: Math.max(...ok.map((r) => r.longTaskMaxMs)) },
    hostCpu: { mean: Number((ok.reduce((s, r) => s + r.cpu, 0) / ok.length).toFixed(2)), max: Math.max(...ok.map((r) => r.cpu)) }
  };
  console.log('SUMMARY ' + JSON.stringify(summary));
  if (args.out) writeFileSync(String(args.out), JSON.stringify({ summary, runs }, null, 1));
};
main().catch((e) => { console.error(e); process.exit(2); });
