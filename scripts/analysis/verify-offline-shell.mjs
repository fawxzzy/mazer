/**
 * MAZER-PWA-004: headless proof of the offline shell.
 *
 * Builds the production bundle (vite build, the real vite-plugin-pwa / Workbox
 * pipeline) twice: build A as shipped and build B = A plus one marker line, so
 * "a new version" is a genuinely different precache manifest. Serves them from
 * a minimal static server (Vercel-like: no SPA fallback beyond the three
 * documented rewrites, must-revalidate caching) on `mazer-proof.localhost`,
 * which Chromium resolves to loopback and treats as a secure context but which
 * the app does NOT treat as localhost, so the production service worker
 * registers and the install gate runs exactly as on mazer.fawxzzy.com.
 *
 * Proves, with Playwright / headless Chromium:
 *   1. first online load registers /app-sw.js, claims the page and precaches the shell
 *   2. with the network blocked (context.setOffline) a reload boots the menu, level 1
 *      starts and the player moves; no request to the app origin fails
 *   3. a cold offline launch (new tab) boots too, and Sign in shows the existing
 *      provider_unreachable line instead of hanging
 *   4. what happens to a running session when a new build is deployed
 *   5. Cache Storage names / entry counts / bytes
 *   6. a table of install-gate behaviour by display mode, host and user agent (current behaviour; no change)
 *
 * Everything is headless. NOTHING here is a real device, a really installed
 * PWA, iOS Safari or an Android Chrome install flow.
 *
 * Usage:
 *   node scripts/analysis/verify-offline-shell.mjs [--json] [--port=5615] [--out=report.json]
 *        [--dist-a=<dir> --dist-b=<dir>] [--keep]
 * Exit code 0 = every check passed, 1 = at least one failed, 2 = the script itself broke.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build, loadConfigFromFile } from 'vite';
import {
  INSTALL_GATE_SCENARIOS,
  PROVIDER_UNREACHABLE_MESSAGE,
  diffPrecache,
  evaluateGateRow,
  evaluateOfflineRequests,
  findMissingCriticalShellFiles,
  findUnexpectedNetworkAttempts,
  formatGateTableMarkdown,
  formatKiB,
  makeCheck,
  normalizeCacheKeyUrl,
  parsePrecacheManifest,
  parseProofArgs,
  summarizeByPath,
  summarizeChecks
} from './lib/offline-shell-proof.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROOF_HOSTNAME = 'mazer-proof.localhost';
const MENU_PATH = '/?runtimeDiagnostics=1&authFixture=authenticated';
const PLAY_PATH = '/?runtimeDiagnostics=1&previewLevel=1&mazeSeed=3749';
const SIGNED_OUT_PATH = '/?runtimeDiagnostics=1';
const READY_TIMEOUT_MS = 60_000;
const PHONE = { width: 390, height: 844 };

const USER_AGENTS = Object.freeze({
  'desktop-chromium': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'desktop-firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'desktop-safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'ios-in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0'
});

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain'
});

// ---------------------------------------------------------------------------
// Build

const buildVersion = async (outDir, markerValue) => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(REPO_ROOT, 'vite.config.ts'), REPO_ROOT);
  if (!loaded) {
    throw new Error('Could not load vite.config.ts');
  }
  const markerPlugin = {
    name: 'mazer-offline-proof-marker',
    transform(code, id) {
      if (markerValue !== null && id.replace(/\\/g, '/').endsWith('/src/boot/main.ts')) {
        return { code: `${code}\nwindow.__MAZER_OFFLINE_PROOF_BUILD__ = ${JSON.stringify(markerValue)};\n`, map: null };
      }
      return null;
    }
  };
  await build({
    ...loaded.config,
    configFile: false,
    root: REPO_ROOT,
    logLevel: 'error',
    plugins: [...(loaded.config.plugins ?? []), markerPlugin],
    build: { ...(loaded.config.build ?? {}), outDir, emptyOutDir: true }
  });
};

// ---------------------------------------------------------------------------
// Static server (swappable dist, request log)

const startServer = async (initialDist, port) => {
  const state = { dist: initialDist, hits: [], offline: false };
  const rewrites = new Set(['/update-password', '/privacy', '/terms']);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    state.hits.push({ path: url.pathname + url.search, dist: state.dist, refused: state.offline });
    if (state.offline) {
      // Real outage for everyone, including the service worker (context.setOffline does not cover the
      // worker's own fetches): the connection dies before any byte is answered.
      request.socket.destroy();
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || rewrites.has(pathname)) {
      pathname = '/index.html';
    }
    const filePath = join(state.dist, pathname);
    if (!filePath.startsWith(state.dist) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/plain');
      response.end('not found');
      return;
    }
    response.setHeader('content-type', CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream');
    response.setHeader('cache-control', 'public, max-age=0, must-revalidate');
    response.end(readFileSync(filePath));
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
  return {
    port: server.address().port,
    state,
    setDist: (dist) => { state.dist = dist; },
    setOffline: (offline) => { state.offline = offline; },
    close: () => new Promise((resolvePromise) => server.close(() => resolvePromise()))
  };
};

// ---------------------------------------------------------------------------
// Browser helpers

const displayInitScript = (display) => {
  const override = (query) => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (candidate) => {
      if (candidate !== query) {
        return nativeMatchMedia(candidate);
      }
      return {
        addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => true,
        matches: true, media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {}
      };
    };
  };
  if (display === 'standalone') { override('(display-mode: standalone)'); }
  if (display === 'minimal-ui') { override('(display-mode: minimal-ui)'); }
  if (display === 'window-controls-overlay') { override('(display-mode: window-controls-overlay)'); }
  if (display === 'fullscreen') { override('(display-mode: fullscreen)'); }
  if (display === 'navigator-standalone') {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
  }
  if (display === 'android-referrer') {
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => 'android-app://com.fawxzzy.mazer' });
  }
};

/** Records every boot stage across reloads (sessionStorage), so a later reload cannot hide what the first boot did. */
const bootStageRecorder = () => {
  let current;
  Object.defineProperty(window, '__MAZER_BOOT_STATUS__', {
    configurable: true,
    get: () => current,
    set: (value) => {
      current = value;
      try {
        const stages = JSON.parse(sessionStorage.getItem('__proofBootStages') ?? '[]');
        stages.push(value?.stage ?? null);
        sessionStorage.setItem('__proofBootStages', JSON.stringify(stages));
      } catch { /* storage unavailable */ }
    }
  });
};

const newContext = async (browser, { display = 'browser', ua = 'desktop-chromium', viewport = PHONE } = {}) => {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    userAgent: USER_AGENTS[ua],
    ...(ua === 'ios' || ua === 'android' || ua === 'ios-in-app' ? { hasTouch: true } : {})
  });
  await context.addInitScript(displayInitScript, display);
  await context.addInitScript(bootStageRecorder);
  return context;
};

/** Records every request of a context (page and service worker) with the phase it happened in. */
const attachRequestLog = (context) => {
  const log = { phase: 'init', entries: [], consoleErrors: [], pageErrors: [] };
  const byRequest = new Map();
  context.on('request', (request) => {
    const entry = { phase: log.phase, url: request.url(), method: request.method(), resourceType: request.resourceType(), fromServiceWorker: null, status: null, failed: null, issuedByServiceWorker: false };
    try {
      entry.issuedByServiceWorker = request.serviceWorker?.() != null;
    } catch {
      entry.issuedByServiceWorker = false;
    }
    byRequest.set(request, entry);
    log.entries.push(entry);
  });
  context.on('response', (response) => {
    const entry = byRequest.get(response.request());
    if (entry) {
      entry.status = response.status();
      try { entry.fromServiceWorker = response.fromServiceWorker(); } catch { entry.fromServiceWorker = null; }
    }
  });
  context.on('requestfailed', (request) => {
    const entry = byRequest.get(request);
    if (entry) { entry.failed = request.failure()?.errorText ?? 'failed'; }
  });
  context.on('console', (message) => {
    if (message.type() === 'error') { log.consoleErrors.push({ phase: log.phase, text: message.text().slice(0, 300) }); }
  });
  log.watchPage = (page) => {
    page.on('pageerror', (error) => log.pageErrors.push({ phase: log.phase, text: String(error.message).slice(0, 300) }));
  };
  log.inPhase = (phase) => log.entries.filter((entry) => entry.phase === phase);
  return log;
};

/** Airplane mode: browser-level offline emulation AND a server that refuses every connection. */
const goOffline = async (context, server) => {
  server.setOffline(true);
  await context.setOffline(true);
};

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

/** Polls fn in the page; tolerates navigations destroying the execution context mid-poll. */
const pollPage = async (page, fn, description, { timeoutMs = READY_TIMEOUT_MS, arg } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await page.evaluate(fn, arg);
      if (value) { return value; }
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${description}${lastError ? ` (${String(lastError.message).slice(0, 120)})` : ''}`);
};

const gameReady = (page) => pollPage(page, () => {
  const status = window.__MAZER_BOOT_STATUS__;
  const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
  return Boolean(status?.menuSceneCreated && status?.splashRemoved && scene && scene.menuStaticDrawLifecyclePhase === 'settled');
}, 'game boot (menu scene settled)');

const playReady = (page) => pollPage(page, () => {
  const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
  return Boolean(scene && scene.menuStaticDrawLifecyclePhase === 'settled' && scene.isLegacyPlayLifecycleInputLocked() === false);
}, 'play started and input unlocked');

const readPlayer = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
  return scene ? { x: scene.player.x, y: scene.player.y } : null;
});

/** Moves along the real shortest path for up to `steps` cells; returns start/end. */
const movePlayer = async (page, steps) => {
  const start = await readPlayer(page);
  for (let index = 0; index < steps; index += 1) {
    const result = await page.evaluate(() => {
      const qa = window.__MAZER_QA__;
      const route = qa.resolveShortestPathToGoal();
      if (!route.found || route.path.length < 2) { return { moved: false, reason: 'no-path' }; }
      const [from, to] = route.path;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const move = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'move_right' : 'move_left') : (dy > 0 ? 'move_down' : 'move_up');
      return qa.movePlayPlayer(move);
    });
    if (result?.moved === false && result.reason === 'no-path') { break; }
    await sleep(250);
  }
  const end = await readPlayer(page);
  return { start, end, moved: start !== null && end !== null && (start.x !== end.x || start.y !== end.y) };
};

const readServiceWorkerState = (page) => page.evaluate(async () => {
  const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
  return {
    registrations: registrations.map((registration) => ({
      scope: registration.scope,
      active: registration.active?.scriptURL ?? null,
      waiting: registration.waiting?.scriptURL ?? null,
      installing: registration.installing?.scriptURL ?? null
    })),
    controlled: Boolean(navigator.serviceWorker?.controller),
    buildMarker: window.__MAZER_OFFLINE_PROOF_BUILD__ ?? null
  };
});

/** Cache Storage inventory: names, entry counts and byte totals (response bodies), plus the storage estimate. */
const readCacheStorage = (page) => page.evaluate(async () => {
  const names = await caches.keys();
  const result = [];
  for (const name of names) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    let bytes = 0;
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) { bytes += (await response.clone().arrayBuffer()).byteLength; }
    }
    result.push({ name, entries: requests.length, bytes, keys: requests.map((request) => request.url) });
  }
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  return { caches: result, storageEstimate: estimate ? { usage: estimate.usage ?? null, quota: estimate.quota ?? null } : null };
});

const BOOT_ART_CACHE_PREFIX = 'mazer-boot-art';
const BOOT_ART_EXPECTED_ENTRIES = 5; // 3 HUD icons + tile-font atlas image + atlas json

const waitForBootArtCache = (page) => pollPage(page, async ({ prefix, expected }) => {
  const names = await caches.keys();
  for (const name of names) {
    if (name.startsWith(prefix)) {
      const keys = await (await caches.open(name)).keys();
      if (keys.length >= expected) { return true; }
    }
  }
  return false;
}, 'boot art runtime cache populated', { arg: { prefix: BOOT_ART_CACHE_PREFIX, expected: BOOT_ART_EXPECTED_ENTRIES }, timeoutMs: 30_000 });

const waitForPrecache = (page, expectedCount) => pollPage(page, async ({ expected }) => {
  const names = await caches.keys();
  for (const name of names) {
    if (name.includes('precache')) {
      const keys = await (await caches.open(name)).keys();
      if (keys.length >= expected) { return true; }
    }
  }
  return false;
}, 'precache populated', { arg: { expected: expectedCount }, timeoutMs: 60_000 });

// ---------------------------------------------------------------------------
// Scenarios

const publicOrigin = (port) => `http://${PROOF_HOSTNAME}:${port}`;

const runOnlineFirstLoad = async ({ browser, server, distA, checks, findings, evidence }) => {
  const origin = publicOrigin(server.port);
  const context = await newContext(browser, { display: 'standalone' });
  const log = attachRequestLog(context);
  const page = await context.newPage();
  log.watchPage(page);
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) { navigations += 1; } });

  log.phase = 'online-first-load';
  const swSource = readFileSync(join(distA, 'app-sw.js'), 'utf8');
  const manifest = parsePrecacheManifest(swSource);
  await page.goto(`${origin}${MENU_PATH}`, { waitUntil: 'load' });
  await gameReady(page);
  await pollPage(page, () => navigator.serviceWorker.controller !== null, 'page controlled by the service worker');
  await waitForPrecache(page, manifest.length);
  await waitForBootArtCache(page);
  // The controller change reloads the page once; let that settle and boot again.
  await sleep(2500);
  await gameReady(page);
  const swState = await readServiceWorkerState(page);
  const cacheState = await readCacheStorage(page);

  const precacheCache = cacheState.caches.find((cache) => cache.name.includes('precache'));
  const diff = precacheCache ? diffPrecache(manifest, precacheCache.keys, origin) : { expectedCount: manifest.length, cachedCount: 0, missing: ['(no precache cache)'], unexpected: [] };
  const cachedPaths = precacheCache ? precacheCache.keys.map((url) => normalizeCacheKeyUrl(url, origin)) : [];
  const missingCritical = findMissingCriticalShellFiles(cachedPaths);

  checks.push(makeCheck('sw-registered-and-active', swState.registrations.length === 1 && swState.registrations[0].active === `${origin}/app-sw.js` && swState.controlled,
    `registrations=${JSON.stringify(swState.registrations)} controlled=${swState.controlled}`));
  checks.push(makeCheck('precache-complete', precacheCache !== undefined && diff.missing.length === 0,
    `manifest ${diff.expectedCount} entries, cached ${diff.cachedCount}, missing ${JSON.stringify(diff.missing)}`));
  const bootArtCache = cacheState.caches.find((cache) => cache.name.startsWith(BOOT_ART_CACHE_PREFIX));
  checks.push(makeCheck('boot-art-cached-for-offline', bootArtCache !== undefined && bootArtCache.entries >= BOOT_ART_EXPECTED_ENTRIES,
    `${BOOT_ART_CACHE_PREFIX} cache: ${bootArtCache ? `${bootArtCache.entries} entries ${JSON.stringify(bootArtCache.keys.map((url) => normalizeCacheKeyUrl(url, origin)))}` : 'absent'}`));
  checks.push(makeCheck('precache-has-critical-shell-files', missingCritical.length === 0, `missing: ${JSON.stringify(missingCritical)}`));
  checks.push(makeCheck('game-boots-online-first-load', true, `reached menu; main-frame navigations=${navigations}`));

  if (navigations >= 2) {
    findings.push(`First load navigates ${navigations} times: the service worker claims the page and src/boot/serviceWorkerLifecycle.ts reloads once on controllerchange (also on the very first install, not only on updates). Harmless but visible as a second splash.`);
  }
  evidence.firstLoad = { mainFrameNavigations: navigations, serviceWorker: swState, precacheManifestEntries: manifest.length };
  evidence.cacheStorage = cacheState.caches.map(({ name, entries, bytes }) => ({ name, entries, bytes, size: formatKiB(bytes) }));
  evidence.storageEstimate = cacheState.storageEstimate;
  evidence.precache = { expected: diff.expectedCount, cached: diff.cachedCount, missing: diff.missing, unexpected: diff.unexpected };
  return { context, page, log, origin, manifest, navigationsRef: () => navigations };
};

const runOfflineReloadAndPlay = async ({ session, server, checks, findings, evidence }) => {
  const { context, page, log, origin } = session;
  await goOffline(context, server);
  log.phase = 'offline-reload';
  const hitsBefore = server.state.hits.length;
  await page.reload({ waitUntil: 'load' });
  await gameReady(page);
  const gate = await page.evaluate(() => Boolean(document.getElementById('mazer-install-gate-overlay')));
  const menuRendered = await page.evaluate(() => {
    const status = window.__MAZER_BOOT_STATUS__;
    const canvas = document.querySelector('canvas');
    return { menuSceneCreated: status?.menuSceneCreated === true, canvas: canvas ? { width: canvas.width, height: canvas.height } : null };
  });
  log.phase = 'offline-play';
  const started = await page.evaluate(() => window.__MAZER_QA__?.startPlayMode());
  await playReady(page);
  const movement = await movePlayer(page, 4);
  const requests = [...log.inPhase('offline-reload'), ...log.inPhase('offline-play')];
  const evaluation = evaluateOfflineRequests(requests, origin);

  checks.push(makeCheck('offline-reload-boots-menu', menuRendered.menuSceneCreated && menuRendered.canvas !== null && gate === false,
    `menuSceneCreated=${menuRendered.menuSceneCreated} canvas=${JSON.stringify(menuRendered.canvas)} installGateShown=${gate}`));
  checks.push(makeCheck('offline-level-1-starts-and-player-moves', started?.accepted === true && movement.moved,
    `startPlayMode=${JSON.stringify(started)} player ${JSON.stringify(movement.start)} -> ${JSON.stringify(movement.end)}`));
  checks.push(makeCheck('offline-no-failed-app-requests', evaluation.pass,
    `app requests=${evaluation.appRequests} (served by the service worker: ${evaluation.appServedFromServiceWorker}); app failures=${JSON.stringify(evaluation.appFailures)}; unexpected external=${JSON.stringify(evaluation.unexpectedExternal)}`));
  const attempted = server.state.hits.slice(hitsBefore).map((hit) => hit.path);
  const unexpectedAttempts = findUnexpectedNetworkAttempts(attempted);
  checks.push(makeCheck('offline-only-service-worker-background-fetches-attempt-network', unexpectedAttempts.length === 0,
    `connection attempts refused by the server while offline: ${attempted.length}; not service-worker background fetches: ${JSON.stringify(unexpectedAttempts)}; service-worker background fetches seen by the browser: ${evaluation.serviceWorkerBackground.length}`));
  if (evaluation.allowedExternal.length > 0) {
    findings.push(`While offline the game still tries ${evaluation.allowedExternal.length} request(s) to the account provider (allowed, expected to fail): ${[...new Set(evaluation.allowedExternal.map((entry) => new URL(entry.url).pathname))].join(', ')}. They fail and the game continues.`);
  }
  evidence.offlineReload = {
    appRequests: evaluation.appRequests,
    appServedFromServiceWorker: evaluation.appServedFromServiceWorker,
    appFailures: evaluation.appFailures,
    serviceWorkerBackgroundFetches: evaluation.serviceWorkerBackground.length,
    refusedConnectionAttempts: attempted,
    allowedExternalFailures: evaluation.allowedExternal.length,
    unexpectedExternal: evaluation.unexpectedExternal,
    requestsByPath: summarizeByPath(requests, origin).slice(0, 12),
    consoleErrors: log.consoleErrors.filter((entry) => entry.phase.startsWith('offline')).length,
    pageErrors: log.pageErrors.filter((entry) => entry.phase.startsWith('offline')),
    movement
  };
};

const runOfflineColdLaunchAndSignIn = async ({ session, server, checks, findings, evidence }) => {
  const { context, origin, log } = session;
  // A new tab in the same (offline, service-worker-controlled) context = the installed app launched with no network.
  const page = await context.newPage();
  log.watchPage(page);
  log.phase = 'offline-cold-launch-play-route';
  const hitsBefore = server.state.hits.length;
  await page.goto(`${origin}${PLAY_PATH}`, { waitUntil: 'load' });
  await playReady(page);
  const movement = await movePlayer(page, 3);
  checks.push(makeCheck('offline-cold-launch-boots-and-plays', movement.moved,
    `new tab, /?previewLevel=1 while offline; player ${JSON.stringify(movement.start)} -> ${JSON.stringify(movement.end)}`));
  await page.close();

  // Signed-out cold launch: the sign-in screen, then Sign in with no network.
  const signInPage = await context.newPage();
  log.watchPage(signInPage);
  log.phase = 'offline-sign-in';
  await signInPage.goto(`${origin}${SIGNED_OUT_PATH}`, { waitUntil: 'load' });
  await pollPage(signInPage, () => {
    const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
    return Boolean(scene && scene.authGateLocked === true && scene.uiButtons.some((button) => button.text === 'Sign in'));
  }, 'signed-out sign-in screen with a Sign in button');
  const point = await signInPage.evaluate(() => {
    const game = window.__MAZER_GAME__;
    const scene = game.scene.getScene('MenuScene');
    const button = scene.uiButtons.find((candidate) => candidate.text === 'Sign in');
    const rect = game.canvas.getBoundingClientRect();
    return {
      x: rect.left + (button.bounds.centerX * rect.width) / game.scale.gameSize.width,
      y: rect.top + (button.bounds.centerY * rect.height) / game.scale.gameSize.height
    };
  });
  const clickedAt = Date.now();
  await signInPage.mouse.click(point.x, point.y);
  const outcome = await pollPage(signInPage, () => {
    const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
    const code = scene?.authSnapshot?.errorCode ?? null;
    return code ? { code, message: scene.authSnapshot.error ?? null, submitting: scene.authSubmitting === true } : null;
  }, 'a sign-in failure code', { timeoutMs: 15_000 });
  const elapsedMs = Date.now() - clickedAt;
  const onScreen = await pollPage(signInPage, (message) => {
    const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
    const texts = [...(scene?.uiTexts ?? []), ...(scene?.playerMessageToastTexts ?? [])];
    return texts.some((text) => text.active && text.visible && typeof text.text === 'string' && text.text.includes(message));
  }, 'the failure line drawn on the canvas', { arg: PROVIDER_UNREACHABLE_MESSAGE, timeoutMs: 5000 }).then(() => true, () => false);
  const stillUsable = await signInPage.evaluate(() => {
    const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
    return { submitting: scene.authSubmitting === true, url: window.location.href };
  });
  checks.push(makeCheck('offline-sign-in-shows-provider-unreachable', outcome.code === 'provider_unreachable' && outcome.message === PROVIDER_UNREACHABLE_MESSAGE && onScreen,
    `errorCode=${outcome.code} message=${JSON.stringify(outcome.message)} drawnOnCanvas=${onScreen}`));
  checks.push(makeCheck('offline-sign-in-does-not-hang-or-navigate', elapsedMs < 6000 && stillUsable.submitting === false && stillUsable.url.startsWith(origin),
    `failure shown ${elapsedMs} ms after the click; authSubmitting=${stillUsable.submitting}; still on ${new URL(stillUsable.url).origin}`));
  const unexpectedAttempts = findUnexpectedNetworkAttempts(server.state.hits.slice(hitsBefore).map((hit) => hit.path));
  const requests = [...log.inPhase('offline-cold-launch-play-route'), ...log.inPhase('offline-sign-in')];
  const evaluation = evaluateOfflineRequests(requests, origin);
  checks.push(makeCheck('offline-cold-launch-no-failed-app-requests', evaluation.pass && unexpectedAttempts.length === 0,
    `app requests=${evaluation.appRequests} (service worker: ${evaluation.appServedFromServiceWorker}); failures=${JSON.stringify(evaluation.appFailures)}; unexpected external=${JSON.stringify(evaluation.unexpectedExternal)}; network attempts that were not service-worker background fetches=${JSON.stringify(unexpectedAttempts)}`));
  evidence.offlineSignIn = { errorCode: outcome.code, message: outcome.message, millisecondsToFailureLine: elapsedMs };
  evidence.offlineColdLaunch = { appRequests: evaluation.appRequests, appServedFromServiceWorker: evaluation.appServedFromServiceWorker, appFailures: evaluation.appFailures, allowedExternalFailures: evaluation.allowedExternal.length };
  await signInPage.close();
  if (!findings.some((line) => line.includes('Sign in'))) {
    findings.push('Signed out and offline, Sign in stays on the sign-in screen and shows "Sign-in is unavailable right now. Try again in a few minutes." (provider_unreachable) within a second; the sign-in gate stays locked for a signed-out visitor, so a first-time visitor with no saved session cannot play offline (the proof reaches level 1 offline through the QA fixture/preview routes, not through a real saved session).');
  }
};

const runVersionUpdate = async ({ browser, server, distA, distB, checks, findings, evidence }) => {
  const origin = publicOrigin(server.port);
  server.setOffline(false);
  server.setDist(distA);
  const context = await newContext(browser, { display: 'standalone' });
  const log = attachRequestLog(context);
  const page = await context.newPage();
  log.watchPage(page);
  const mainFrameNavigations = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) { mainFrameNavigations.push(Date.now()); } });

  log.phase = 'update-install-a';
  await page.goto(`${origin}${MENU_PATH}`, { waitUntil: 'load' });
  await gameReady(page);
  await pollPage(page, () => navigator.serviceWorker.controller !== null, 'build A controlling the page');
  await sleep(2500);
  await gameReady(page);
  const started = await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
  await playReady(page);
  const beforeMove = await movePlayer(page, 3);
  const before = await readServiceWorkerState(page);
  const cacheBefore = await readCacheStorage(page);
  await page.evaluate(() => { window.__proofSessionSentinel = 'build-a-session'; });
  const navigationsBeforeUpdate = mainFrameNavigations.length;

  // Deploy build B: swap what the server serves, then ask the browser to check for a new service worker
  // (the app itself only calls registration.update() once per page load).
  log.phase = 'update-deploy-b';
  server.setDist(distB);
  const reloadedAt = Date.now();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  }).catch(() => { /* the page may be reloaded mid-evaluate by the controller change */ });
  await pollPage(page, () => window.__MAZER_OFFLINE_PROOF_BUILD__ === 'B', 'build B running in the page', { timeoutMs: 60_000 });
  const reloadDelayMs = Date.now() - reloadedAt;
  await gameReady(page);
  await sleep(1500);
  const after = await readServiceWorkerState(page);
  const sentinelAfter = await page.evaluate(() => window.__proofSessionSentinel ?? null);
  const cacheAfter = await readCacheStorage(page);
  const reloadedDuringSession = mainFrameNavigations.length > navigationsBeforeUpdate;
  const afterPlayerState = await page.evaluate(() => {
    const scene = window.__MAZER_GAME__?.scene.getScene('MenuScene');
    return { mode: scene?.mode ?? null, player: scene ? { x: scene.player.x, y: scene.player.y } : null };
  });

  // New build also boots offline.
  await goOffline(context, server);
  log.phase = 'update-offline-b';
  await page.reload({ waitUntil: 'load' });
  await gameReady(page);
  const offlineMarker = await page.evaluate(() => window.__MAZER_OFFLINE_PROOF_BUILD__ ?? null);
  const offlineEvaluation = evaluateOfflineRequests(log.inPhase('update-offline-b'), origin);

  const summarize = (state) => state.caches.map(({ name, entries, bytes }) => ({ name, entries, bytes }));
  const mainAssetsBefore = (cacheBefore.caches.find((cache) => cache.name.includes('precache'))?.keys ?? []).map((url) => normalizeCacheKeyUrl(url, origin)).filter((path) => /\/assets\/main-[^/]+\.js$/.test(path));
  const mainAssetsAfter = (cacheAfter.caches.find((cache) => cache.name.includes('precache'))?.keys ?? []).map((url) => normalizeCacheKeyUrl(url, origin)).filter((path) => /\/assets\/main-[^/]+\.js$/.test(path));

  checks.push(makeCheck('update-new-build-takes-over', before.buildMarker === null && after.buildMarker === 'B' && after.registrations.length === 1,
    `marker before=${before.buildMarker} after=${after.buildMarker}; main bundle before=${JSON.stringify(mainAssetsBefore)} after=${JSON.stringify(mainAssetsAfter)}`));
  checks.push(makeCheck('update-old-precache-removed', mainAssetsAfter.length === 1 && !mainAssetsAfter.some((path) => mainAssetsBefore.includes(path)),
    `old main bundle evicted from Cache Storage: after=${JSON.stringify(mainAssetsAfter)}`));
  checks.push(makeCheck('update-new-build-boots-offline', offlineMarker === 'B' && offlineEvaluation.pass,
    `offline reload marker=${offlineMarker}; app failures=${JSON.stringify(offlineEvaluation.appFailures)}`));
  checks.push(makeCheck('update-no-page-errors', log.pageErrors.length === 0, `page errors: ${JSON.stringify(log.pageErrors)}`));

  // Documented behaviour, not a pass/fail on "does not interrupt": it does.
  findings.push(reloadedDuringSession
    ? `Deploying a new build RELOADS a running session: skipWaiting + clientsClaim activate the new worker at once and serviceWorkerLifecycle.ts reloads the page on controllerchange (observed ${reloadDelayMs} ms after the update check; the page's in-memory state was lost: sentinel ${JSON.stringify(sentinelAfter)}, mode after ${JSON.stringify(afterPlayerState.mode)}). In-memory run state is lost; whether saved progress restores a mid-level position was not measured. The shell is never left half-updated (old precache removed, new one complete).`
    : 'A new build did not reload the running session in this run.');
  evidence.versionUpdate = {
    startedPlay: started?.accepted === true,
    movedBeforeUpdate: beforeMove.moved,
    sessionReloaded: reloadedDuringSession,
    millisecondsFromUpdateCheckToNewBuildRunning: reloadDelayMs,
    inMemorySentinelSurvived: sentinelAfter === 'build-a-session',
    stateAfterUpdate: afterPlayerState,
    cachesBefore: summarize(cacheBefore),
    cachesAfter: summarize(cacheAfter),
    registrationAfter: after.registrations
  };
  await context.close();
};

const runInstallGateMatrix = async ({ browser, server, distA, checks, findings, evidence }) => {
  server.setOffline(false);
  server.setDist(distA);
  const rows = [];
  for (const scenario of INSTALL_GATE_SCENARIOS) {
    const base = scenario.host === 'localhost' ? `http://127.0.0.1:${server.port}` : publicOrigin(server.port);
    const context = await newContext(browser, { display: scenario.display, ua: scenario.ua });
    const page = await context.newPage();
    let observed;
    try {
      await page.goto(`${base}${scenario.path}`, { waitUntil: 'load' });
      await pollPage(page, () => Boolean(document.getElementById('mazer-install-gate-overlay'))
        || window.__MAZER_BOOT_STATUS__?.gameCreated === true, 'gate overlay or game boot', { timeoutMs: 45_000 });
      if (scenario.event) {
        await pollPage(page, () => Boolean(document.getElementById('mazer-install-gate-overlay')), 'gate overlay before dispatching an install event');
        await page.evaluate((eventName) => {
          const event = new Event(eventName);
          if (eventName === 'beforeinstallprompt') {
            Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }) });
          }
          window.dispatchEvent(event);
        }, scenario.event);
        await sleep(300);
      }
      await sleep(scenario.host === 'localhost' ? 300 : 3500);
      observed = null;
      for (let attempt = 0; attempt < 5 && observed === null; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          observed = await page.evaluate(async () => {
            const stages = JSON.parse(sessionStorage.getItem('__proofBootStages') ?? '[]');
            const secondBoot = stages.indexOf('boot-start', stages.indexOf('boot-start') + 1);
            const firstBoot = secondBoot === -1 ? stages : stages.slice(0, secondBoot);
            const overlay = document.getElementById('mazer-install-gate-overlay');
            const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
            return {
              gateRan: firstBoot.includes('install-gate-checking'),
              blocked: firstBoot.includes('install-gate-checking') && !firstBoot.includes('game-creating'),
              mode: overlay?.getAttribute('data-mazer-install-gate-mode') ?? null,
              booted: firstBoot.includes('game-created'),
              reloadedAfterBoot: secondBoot !== -1,
              gateAfterReload: secondBoot !== -1 && overlay !== null,
              serviceWorkerRegistrations: registrations.length
            };
          });
        } catch {
          // eslint-disable-next-line no-await-in-loop
          await sleep(600);
        }
      }
      if (observed === null) { throw new Error(`could not observe ${scenario.id}`); }
    } finally {
      await context.close();
    }
    const verdict = evaluateGateRow(scenario, observed);
    rows.push({ id: scenario.id, label: scenario.label, display: scenario.display, ua: scenario.ua, path: scenario.path, ...observed, pass: verdict.pass, problems: verdict.problems });
  }
  checks.push(makeCheck('install-gate-matches-documented-policy', rows.every((row) => row.pass),
    rows.filter((row) => !row.pass).map((row) => `${row.id}: ${row.problems.join('; ')}`).join(' | ') || `${rows.length} contexts match src/boot/installPolicy.ts`));
  const blockedTabs = rows.filter((row) => row.blocked);
  checks.push(makeCheck('gate-blocked-tab-registers-no-service-worker', blockedTabs.every((row) => row.serviceWorkerRegistrations === 0),
    `gated contexts with a registration: ${JSON.stringify(blockedTabs.filter((row) => row.serviceWorkerRegistrations !== 0).map((row) => row.id))}`));
  const reloadRows = rows.filter((row) => row.reloadedAfterBoot);
  for (const row of reloadRows.filter((candidate) => candidate.gateAfterReload)) {
    findings.push(`${row.label}: the first boot bypasses the install gate (callback/QA route), registers the service worker, and the claim-time reload then lands on the install gate because the callback parameters were already scrubbed from the URL. Only reachable in a non-installed tab on a first-ever service-worker install (an installed app should already have the worker; not checked on a device).`);
  }
  evidence.installGateReloadedRows = reloadRows.map((row) => ({ id: row.id, gateShownAfterReload: row.gateAfterReload }));
  evidence.installGate = rows;
  evidence.installGateTableMarkdown = formatGateTableMarkdown(rows.map((row) => ({ ...row })));
};

// ---------------------------------------------------------------------------

const main = async () => {
  const args = parseProofArgs(process.argv.slice(2));
  const log = (message) => { if (!args.json) { console.log(message); } else { console.error(message); } };
  const workDir = mkdtempSync(join(tmpdir(), 'mazer-offline-shell-proof-'));
  let distA = args.distA === null ? join(workDir, 'build-a') : resolve(args.distA);
  let distB = args.distB === null ? join(workDir, 'build-b') : resolve(args.distB);
  const checks = [];
  const findings = [];
  const evidence = {};
  let server = null;
  let browser = null;
  try {
    if (args.distA === null) {
      log('Building A (as shipped) ...');
      await buildVersion(distA, null);
      log('Building B (A + one marker line) ...');
      await buildVersion(distB, 'B');
    }
    const swSizeA = statSync(join(distA, 'app-sw.js')).size;
    evidence.builds = {
      a: { dir: distA, files: readdirSync(distA).length, serviceWorkerBytes: swSizeA },
      b: { dir: distB, files: readdirSync(distB).length }
    };
    server = await startServer(distA, args.port);
    evidence.origin = publicOrigin(server.port);
    browser = await chromium.launch({ headless: true });

    log('1. Online first load + precache ...');
    const session = await runOnlineFirstLoad({ browser, server, distA, checks, findings, evidence });
    log('2. Offline reload, level 1, movement ...');
    await runOfflineReloadAndPlay({ session, server, checks, findings, evidence });
    log('3. Offline cold launch + Sign in ...');
    await runOfflineColdLaunchAndSignIn({ session, server, checks, findings, evidence });
    await session.context.close();
    log('4. New build while a session is running ...');
    await runVersionUpdate({ browser, server, distA, distB, checks, findings, evidence });
    log('5. Install gate matrix ...');
    await runInstallGateMatrix({ browser, server, distA, checks, findings, evidence });
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    if (server) { await server.close().catch(() => {}); }
    if (!args.keep && args.distA === null) {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  const summary = summarizeChecks(checks);
  const report = {
    script: 'scripts/analysis/verify-offline-shell.mjs',
    card: 'MAZER-PWA-004',
    headlessOnly: true,
    notVerified: ['real phone or tablet', 'a really installed PWA (home screen / desktop app)', 'iOS Safari / WebKit service-worker behaviour', 'Android Chrome install flow and WebAPK', 'real network loss (airplane mode on a device)', 'the production host mazer.fawxzzy.com'],
    summary,
    checks,
    findings,
    evidence
  };
  if (args.outFile) {
    mkdirSync(dirname(resolve(args.outFile)), { recursive: true });
    writeFileSync(resolve(args.outFile), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('');
    for (const check of checks) {
      console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.id}\n      ${check.detail}`);
    }
    console.log(`\n${summary.passed}/${summary.total} checks passed`);
    console.log('\nCache Storage:');
    for (const cache of evidence.cacheStorage ?? []) {
      console.log(`  ${cache.name}: ${cache.entries} entries, ${cache.size}`);
    }
    console.log('\nFindings:');
    for (const finding of findings) { console.log(`  - ${finding}`); }
    console.log(`\nInstall gate (current behaviour):\n${evidence.installGateTableMarkdown ?? '(not run)'}`);
  }
  process.exitCode = summary.pass ? 0 : 1;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
