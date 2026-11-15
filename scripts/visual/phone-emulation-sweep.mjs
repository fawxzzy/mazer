/**
 * MAZER-QA-009: every phone check that a desktop Chromium can simulate, in one repeatable run.
 *
 *   node scripts/visual/phone-emulation-sweep.mjs --base-url http://127.0.0.1:4313 --out DIR [--only a,b] [--levels 60,100,190] [--assert]
 *
 * Sections: boot (layout/DPR/touch/overflow), motion (Reduce Motion on/off, colour drift), standalone (display-mode),
 * lifecycle (visibilitychange, offline), fps (rAF sampling), levels (60/100/190 load), touch (CDP touch drag),
 * acct013 (Android UA, 15-minute pending window, other-context callback, install gate in a tab).
 * `--levels` picks the levels the levels section loads (MAZER-QA-011; default 60,100,190, whole numbers 1-999);
 * see docs/ops/MAZER-QA-LEVEL-ACCESS.md. It writes report.json + screenshots under DIR. It proves nothing about a real phone: see
 * docs/ops/MAZER-PHONE-CHECKLIST.md for what that leaves.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseCliArgs } from './common.mjs';
import { createProgressionState, PROGRESSION_STORAGE_KEY } from './capture-maze-lifecycle.mjs';
import { decodePng } from './lib/png-codec.mjs';

export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
export const PROFILES = Object.freeze([
  { id: 'iphone-390x844@3', width: 390, height: 844, dpr: 3, ua: IPHONE_UA },
  { id: 'small-360x740@3', width: 360, height: 740, dpr: 3, ua: ANDROID_UA },
  { id: 'pixel-412x915@2.625', width: 412, height: 915, dpr: 2.625, ua: ANDROID_UA },
  { id: 'galaxy-393x851@2.75', width: 393, height: 851, dpr: 2.75, ua: ANDROID_UA }
]);
export const PENDING_TTL_MS = 900_000;
export const CANONICAL_ORIGIN = 'https://mazer.fawxzzy.com';
export const OAUTH_PENDING_KEY = 'mazer.auth.oauth-pending.v1';

/** Pure: a v2 pending sign-in record as the app writes it, aged `ageMs`. */
export const buildPendingRecord = (state, ageMs, now = Date.now()) => ({
  authSessionPreimageRaw: null,
  authMutationEpoch: 0,
  codeVerifier: 'v'.repeat(43),
  createdAtEpochMs: now - ageMs,
  returnPath: '/',
  sharedAuthMutationEpoch: 0,
  state,
  version: 2
});
export const makeState = (seed = 'a') => seed.repeat(43).slice(0, 43);

/** Pure: frame statistics from rAF timestamps (ms). */
export const frameStats = (stamps) => {
  const d = [];
  for (let i = 1; i < stamps.length; i += 1) d.push(stamps[i] - stamps[i - 1]);
  if (d.length === 0) return { frames: 0, fps: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
  const s = [...d].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const total = stamps[stamps.length - 1] - stamps[0];
  return { frames: d.length, fps: Math.round((d.length / total) * 10000) / 10, p50Ms: q(0.5), p95Ms: q(0.95), maxMs: s[s.length - 1] };
};

/** Pure: mean RGB of saturated bright pixels (the trail/title colour) inside a rect of an RGBA image. */
export const meanBrightColour = (image, rect) => {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * image.width + x) * 4;
      const R = image.data[i]; const G = image.data[i + 1]; const B = image.data[i + 2];
      const mx = Math.max(R, G, B); const mn = Math.min(R, G, B);
      if (mx > 150 && (mx - mn) / mx > 0.45) { r += R; g += G; b += B; n += 1; }
    }
  }
  return n === 0 ? null : { r: r / n, g: g / n, b: b / n, n };
};
export const colourDistance = (a, b) => (a && b ? Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) : 0);
export const pixelDiffFraction = (a, b, rect, tol = 24) => {
  let diff = 0; let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * a.width + x) * 4; n += 1;
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > tol) diff += 1;
    }
  }
  return n === 0 ? 0 : diff / n;
};

const results = [];
const record = (section, name, pass, detail) => {
  results.push({ section, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${section}] ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`);
};

export const STANDALONE_INIT = `(() => {
  try { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); } catch (e) {}
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => { const m = real(q); if (q.includes('display-mode: standalone')) { return new Proxy(m, { get: (t, k) => (k === 'matches' ? true : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) }); } return m; };
})();`;

const newPage = async (browser, profile, opts = {}) => {
  const context = await browser.newContext({
    serviceWorkers: 'block', viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr, isMobile: true, hasTouch: true,
    userAgent: profile.ua, reducedMotion: opts.reducedMotion ?? 'no-preference'
  });
  if (opts.progression) {
    await context.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* ignore */ } }, [PROGRESSION_STORAGE_KEY, JSON.stringify(opts.progression)]);
  }
  if (opts.initScript) await context.addInitScript(opts.initScript);
  // CDP media emulation cannot set display-mode, so an installed context is faked the way the app reads it:
  // navigator.standalone (iOS) and matchMedia('(display-mode: standalone)') (Android WebAPK).
  if (opts.standalone) await context.addInitScript(STANDALONE_INIT);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 200)}`));
  const cdp = await context.newCDPSession(page);
  void cdp;
  return { context, page, errors, cdp };
};
const boot = async (page, base, query = 'runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=1337') => {
  await page.goto(`${base}/?${query}`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__), null, { timeout: 60_000 });
  await page.waitForFunction(() => { const s = window.__MAZER_GAME__.scene.getScene('MenuScene'); return s.mode === 'menu' && s.menuStaticDrawLifecyclePhase === 'settled'; }, null, { timeout: 60_000 });
};
const START = 'button[data-mazer-accessibility-command="start"]';
const startPlay = async (page) => {
  await page.evaluate((sel) => document.querySelector(sel).click(), START);
  await page.waitForFunction(() => { const s = window.__MAZER_GAME__.scene.getScene('MenuScene'); return s.mode === 'play' && s.menuStaticDrawLifecyclePhase === 'settled' && !s.isLegacyPlayLifecycleInputLocked(); }, null, { timeout: 90_000 });
  await page.waitForTimeout(800);
};
const placeOnRoute = async (page, frac = 0.5) => {
  await page.evaluate((f) => {
    const sol = window.__MAZER_QA__.resolveShortestPathToGoal();
    if (!sol?.found) throw new Error('no route');
    const r = sol.path; const k = Math.max(1, Math.min(r.length - 2, Math.floor(r.length * f)));
    const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
    s.player = { x: r[k].x, y: r[k].y }; s.syncLegacyPlayerVisualMotionTo(s.player);
    s.trail = r.slice(0, k + 1).map((q) => ({ x: q.x, y: q.y })); s.hasPlayerEverLeftStart = true; s.boardDynamicDirty = true;
  }, frac);
  await page.waitForTimeout(300);
};
const shot = async (page, out, name, opts = {}) => { const path = join(out, `${name}.png`); const buf = await page.screenshot({ path, ...opts }); return { path, buf }; };
const sampleFps = (page, ms = 3000) => page.evaluate((dur) => new Promise((res) => { const st = []; const t0 = performance.now(); const f = (t) => { st.push(t); if (t - t0 < dur) requestAnimationFrame(f); else res(st); }; requestAnimationFrame(f); }), ms);
const diag = (page) => page.evaluate(() => JSON.parse(document.documentElement.getAttribute('data-mazer-visual-diagnostics')));

const sectionBoot = async (browser, base, out) => {
  for (const p of PROFILES) {
    const { context, page, errors } = await newPage(browser, p);
    await boot(page, base);
    const m = await page.evaluate(() => ({
      dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      touch: navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches, ua: navigator.userAgent.includes('Mobile'),
      canvas: (() => { const c = document.querySelector('canvas'); const r = c?.getBoundingClientRect(); return r ? { w: r.width, h: r.height, x: r.x, y: r.y } : null; })()
    }));
    record('boot', `${p.id} viewport/dpr/touch`, m.dpr === p.dpr && m.iw === p.width && m.touch && m.ua, m);
    record('boot', `${p.id} no horizontal overflow`, m.sw <= m.iw && m.sh <= m.ih + 1, { sw: m.sw, iw: m.iw, sh: m.sh, ih: m.ih });
    record('boot', `${p.id} canvas inside viewport`, !!m.canvas && m.canvas.x >= -0.5 && m.canvas.x + m.canvas.w <= m.iw + 0.5 && m.canvas.w >= m.iw * 0.9, m.canvas);
    await shot(page, out, `boot-${p.id}-menu`);
    await startPlay(page); await placeOnRoute(page, 0.45);
    await shot(page, out, `boot-${p.id}-play`);
    const d = await diag(page);
    record('boot', `${p.id} play board diagnostics`, Boolean(d.board), { board: JSON.stringify(d.board).slice(0, 200) });
    record('boot', `${p.id} no console/page errors`, errors.length === 0, errors.slice(0, 3));
    await context.close();
  }
};

const sectionMotion = async (browser, base, out) => {
  const p = PROFILES[0];
  const colour = {};
  for (const mode of ['no-preference', 'reduce']) {
    const { context, page, errors } = await newPage(browser, p, { reducedMotion: mode });
    await boot(page, base);
    const acc = (await diag(page)).accessibility;
    record('motion', `${mode}: reducedMotion flag`, acc.reducedMotion === (mode === 'reduce'), acc);
    await shot(page, out, `motion-${mode}-menu`);
    await startPlay(page); await placeOnRoute(page, 0.6);
    const images = [];
    for (let i = 0; i < 6; i += 1) {
      const { buf } = await shot(page, out, `motion-${mode}-play-${i}`);
      images.push(decodePng(buf));
      await page.waitForTimeout(1000);
    }
    const W = images[0].width; const H = images[0].height; const rect = { x: 0, y: Math.floor(H * 0.12), w: W, h: Math.floor(H * 0.76) };
    const means = images.map((im) => meanBrightColour(im, rect));
    const maxShift = Math.max(...means.slice(1).map((m) => colourDistance(means[0], m)));
    const diffs = images.slice(1).map((im) => pixelDiffFraction(images[0], im, rect));
    colour[mode] = { maxShift, maxPixelDiff: Math.max(...diffs), means: means.map((m) => m && [Math.round(m.r), Math.round(m.g), Math.round(m.b)]) };
    record('motion', `${mode}: board colour drifts over ~6 s`, maxShift > 0.5 || Math.max(...diffs) > 0.0005, colour[mode]);
    record('motion', `${mode}: no console/page errors`, errors.length === 0, errors.slice(0, 3));
    await context.close();
  }
  record('motion', 'frame-to-frame pixel movement off vs reduce (info)', true, { off: colour['no-preference'].maxPixelDiff, reduce: colour.reduce.maxPixelDiff });
  const { context, page } = await newPage(browser, p);
  await boot(page, base);
  const r = await page.evaluate(() => window.__MAZER_QA__.openSettingsOverlay());
  await page.waitForTimeout(900);
  await shot(page, out, 'motion-settings-sheet');
  const text = await page.evaluate(() => `${document.body.innerText} ${document.documentElement.getAttribute('data-mazer-visual-diagnostics') || ''}`);
  record('motion', 'Settings sheet opens and mentions Reduce Motion', /reduce motion/i.test(text), r);
  await context.close();
};

const sectionStandalone = async (browser, base, out) => {
  for (const standalone of [false, true]) {
    const { context, page } = await newPage(browser, PROFILES[0], { standalone });
    await page.goto(`${base}/?runtimeDiagnostics=1&authFixture=authenticated&forceInstallGate=1`, { waitUntil: 'commit' });
    await page.waitForTimeout(standalone ? 6000 : 3000);
    const s = await page.evaluate(() => ({ standalone: matchMedia('(display-mode: standalone)').matches, qa: Boolean(window.__MAZER_QA__), text: document.body.innerText.slice(0, 160) }));
    await shot(page, out, `standalone-${standalone ? 'on' : 'off'}-forcegate`);
    record('standalone', standalone ? 'display-mode standalone lifts the install gate' : 'plain tab shows the install gate, no game', standalone ? (s.standalone && s.qa) : (!s.standalone && !s.qa), s);
    await context.close();
  }
  const { context, page } = await newPage(browser, PROFILES[0], { standalone: true });
  await boot(page, base);
  await shot(page, out, 'standalone-menu');
  record('standalone', 'standalone menu boots and renders (safe-area insets are 0 headless)', true);
  await context.close();
};

const sectionLifecycle = async (browser, base, out) => {
  const { context, page, errors } = await newPage(browser, PROFILES[0]);
  await boot(page, base); await startPlay(page); await placeOnRoute(page, 0.4);
  const tick = () => page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
  const t0 = await tick();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('blur')); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(1200);
  const t1 = await tick();
  const mv = await page.evaluate(() => window.__MAZER_QA__.movePlayPlayer('right'));
  record('lifecycle', 'hidden then visible: scene still ticking and accepts input', t1 > t0, { t0, t1, mv });
  await shot(page, out, 'lifecycle-after-visibility');
  await context.setOffline(true);
  await page.waitForTimeout(2500);
  const t2 = await tick();
  await shot(page, out, 'lifecycle-offline');
  await context.setOffline(false);
  await page.waitForTimeout(1500);
  const t3 = await tick();
  record('lifecycle', 'offline then online: scene keeps ticking', t2 > t1 && t3 > t2, { t1, t2, t3 });
  record('lifecycle', 'no unexpected page errors (offline network errors filtered)', errors.filter((e) => !/net::|Failed to fetch|NetworkError|ERR_INTERNET/i.test(e)).length === 0, errors.slice(0, 4));
  await context.close();
};

const sectionFps = async (browser, base, out) => {
  const { context, page } = await newPage(browser, PROFILES[0]);
  await boot(page, base);
  const menu = frameStats(await sampleFps(page));
  await startPlay(page); await placeOnRoute(page, 0.5);
  const play = frameStats(await sampleFps(page));
  record('fps', 'menu rAF sampling (headless software GL, canary only)', menu.frames > 30, menu);
  record('fps', 'play rAF sampling (headless software GL, canary only)', play.frames > 30, play);
  await writeFile(join(out, 'fps.json'), JSON.stringify({ menu, play }, null, 1));
  await context.close();
};

export const DEFAULT_CHECK_LEVELS = Object.freeze([60, 100, 190]);

/** Parse `--levels 60,100`: whole numbers 1-999 only (anything else throws, so a typo cannot silently check nothing). */
export const parseCheckLevels = (raw) => {
  if (raw === undefined || raw === true) return [...DEFAULT_CHECK_LEVELS];
  const levels = String(raw).split(',').map((part) => part.trim());
  const parsed = levels.map((part) => (/^[0-9]{1,3}$/.test(part) ? Number(part) : NaN));
  if (parsed.length === 0 || parsed.some((n) => !Number.isInteger(n) || n < 1 || n > 999)) {
    throw new Error(`--levels must be a comma list of whole numbers 1-999, got ${JSON.stringify(String(raw))}`);
  }
  return parsed;
};

let checkLevels = [...DEFAULT_CHECK_LEVELS];

const sectionLevels = async (browser, base, out) => {
  for (const level of checkLevels) {
    const { context, page, errors } = await newPage(browser, PROFILES[0], { progression: createProgressionState(level) });
    await boot(page, base, 'runtimeDiagnostics=1&authFixture=authenticated');
    await startPlay(page);
    const d = await diag(page);
    await shot(page, out, `levels-${level}-play`);
    const sol = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
    record('levels', `level ${level} loads and has a solvable route`, Boolean(sol?.found) && errors.length === 0, { routeLen: sol?.path?.length, badge: JSON.stringify(d.progressionBadge).slice(0, 120), errors: errors.slice(0, 2) });
    await context.close();
  }
};

const sectionTouch = async (browser, base, out) => {
  const { context, page, cdp } = await newPage(browser, PROFILES[0]);
  await boot(page, base); await startPlay(page);
  const pos = () => page.evaluate(() => { const s = window.__MAZER_GAME__.scene.getScene('MenuScene'); return { x: s.player.x, y: s.player.y }; });
  const before = await pos();
  const cx = 195; const cy = 640;
  const drag = async (dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 12; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + (dx * i) / 12, y: cy + (dy * i) / 12 }] }); await page.waitForTimeout(40); }
    await page.waitForTimeout(500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const moved = [];
  for (const [dx, dy] of [[90, 0], [-90, 0], [0, 90], [0, -90]]) { await drag(dx, dy); moved.push(await pos()); }
  await shot(page, out, 'touch-after-drags');
  const changed = moved.some((m) => m.x !== before.x || m.y !== before.y);
  record('touch', 'CDP touch drags move the player (touch input path, not finger feel)', changed, { before, moved });
  await context.close();
};

const sectionAcct013 = async (browser, base, out) => {
  const readMsg = (page) => page.evaluate(() => {
    const a = window.__MAZER_RUNTIME_DIAGNOSTICS__?.auth ?? null;
    return { latest: a?.latestMessage ?? null, auth: a ? { status: a.status, keys: Object.keys(a) } : null, shown: window.__MAZER_VISUAL_DIAGNOSTICS__?.overlayUi ? JSON.stringify(window.__MAZER_VISUAL_DIAGNOSTICS__.overlayUi).slice(0,0) : null, epoch: sessionStorage.getItem('mazer.auth.mutation-epoch.v1'), sharedEpoch: localStorage.getItem('mazer.auth.shared-mutation-epoch.v1'), url: location.search.slice(0, 30) };
  });
  const callback = '/?runtimeDiagnostics=1&code=3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b&state=';
  const run = async (label, ageMs, state, { seedPending = true, standalone = true, forceGate = false } = {}) => {
    const now = Date.now();
    const init = seedPending
      ? `try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded','1'); sessionStorage.setItem(${JSON.stringify(OAUTH_PENDING_KEY)}, ${JSON.stringify(JSON.stringify(buildPendingRecord(state, ageMs, now)))}); } } catch (e) {}`
      : undefined;
    const { context, page } = await newPage(browser, PROFILES[1], { standalone, initScript: init, blockSw: true });
    // The callback must arrive on the canonical origin (anything else is 'malformed' = invalid_state). Serve that origin from
    // the local dev server; every other host (account, Supabase) is aborted so nothing real is contacted.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === CANONICAL_ORIGIN) {
        const res = await route.fetch({ url: base + url.pathname + url.search }).catch(() => null);
        return res ? route.fulfill({ response: res }) : route.abort();
      }
      return url.origin === base ? route.continue() : route.abort();
    });
    await page.goto(`${CANONICAL_ORIGIN}${callback}${state}`, { waitUntil: 'commit' });
    await page.waitForTimeout(6000);
    const msg = await readMsg(page);
    const pend = await page.evaluate((k) => sessionStorage.getItem(k) !== null, OAUTH_PENDING_KEY);
    await shot(page, out, `acct013-${label}`);
    await context.close();
    return { msg, pendingStillStored: pend };
  };
  const st = makeState('b');
  const six = await run('installed-6min', 6 * 60_000, st);
  record('acct013', 'installed context, pending 6 min old: not rejected for age or missing state', !/different|too long|expired/i.test(JSON.stringify(six.msg)), six);
  const sixteen = await run('installed-16min', 16 * 60_000, st);
  record('acct013', 'installed context, pending 16 min old: timed-out message (window is 15 min)', /too long|expired|timed/i.test(JSON.stringify(sixteen.msg)), sixteen);
  const other = await run('other-context-no-pending', 0, st, { seedPending: false });
  record('acct013', 'callback with no pending record (other context): different-screen message', /different|another|started/i.test(JSON.stringify(other.msg)), other);
  const tab = await run('browser-tab-forcegate', 60_000, st, { standalone: false });
  record('acct013', 'callback in a plain tab hits the install gate and is not consumed', tab.pendingStillStored, tab);
};

const SECTIONS = { boot: sectionBoot, motion: sectionMotion, standalone: sectionStandalone, lifecycle: sectionLifecycle, fps: sectionFps, levels: sectionLevels, touch: sectionTouch, acct013: sectionAcct013 };

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const base = String(args['base-url'] ?? 'http://127.0.0.1:4313').replace(/\/$/, '');
  const out = resolve(String(args.out ?? 'tmp/phone-sweep'));
  checkLevels = parseCheckLevels(args.levels);
  const only = args.only ? String(args.only).split(',') : Object.keys(SECTIONS);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  for (const name of only) {
    try { await SECTIONS[name](browser, base, out); } catch (e) { record(name, 'section crashed', false, String(e).slice(0, 300)); }
  }
  await browser.close();
  await writeFile(join(out, 'report.json'), JSON.stringify({ base, ranAt: new Date().toISOString(), results }, null, 1));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (args.assert && failed.length > 0) process.exitCode = 1;
};

if (process.argv[1]?.endsWith('phone-emulation-sweep.mjs')) {
  await main();
}
