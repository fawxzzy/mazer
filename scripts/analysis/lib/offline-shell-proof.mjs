/**
 * Pure helpers for scripts/analysis/verify-offline-shell.mjs (MAZER-PWA-004).
 *
 * Nothing in this file touches a browser, the network or the file system, so
 * the decisions the proof script makes (what the precache must hold, which
 * failed requests are allowed offline, whether an install-gate row matches
 * what the policy says) are unit-tested in
 * tests/analysis/offline-shell-proof.test.mjs.
 */

/** Hosts the game may reach while the network is blocked. Every other origin must be the app's own. */
export const OFFLINE_ALLOWED_EXTERNAL_HOSTS = Object.freeze([
  // Account provider (sign-in pre-flight, token refresh, leaderboard, cloud progress).
  'bxtcuhkotumitoqtrcej.supabase.co'
]);

/** The exact line the player sees when the pre-flight finds the account service unreachable. */
export const PROVIDER_UNREACHABLE_MESSAGE = 'Sign-in is unavailable right now. Try again in a few minutes.';

/**
 * Pulls the precache manifest out of a generated Workbox service worker
 * (`precacheAndRoute([{url:"index.html",revision:"..."},...])`).
 */
export const parsePrecacheManifest = (serviceWorkerSource) => {
  const match = /precacheAndRoute\(\s*(\[[\s\S]*?\])\s*[,)]/.exec(serviceWorkerSource);
  if (!match) {
    return [];
  }
  const entries = [];
  const entryPattern = /\{\s*url\s*:\s*"([^"]+)"\s*,\s*revision\s*:\s*(null|"[^"]*")\s*\}/g;
  let entry = entryPattern.exec(match[1]);
  while (entry !== null) {
    entries.push({
      url: entry[1],
      revision: entry[2] === 'null' ? null : entry[2].slice(1, -1)
    });
    entry = entryPattern.exec(match[1]);
  }
  return entries;
};

/** Cache keys carry `?__WB_REVISION__=...`; the manifest does not. Returns origin-relative path without the revision param. */
export const normalizeCacheKeyUrl = (url, origin) => {
  const parsed = new URL(url, origin);
  parsed.searchParams.delete('__WB_REVISION__');
  const search = parsed.searchParams.toString();
  return `${parsed.pathname}${search === '' ? '' : `?${search}`}`;
};

/** Manifest url (`index.html`, `assets/x.js`) as the origin-relative path a cache key normalizes to. */
export const manifestPath = (manifestUrl) => (manifestUrl.startsWith('/') ? manifestUrl : `/${manifestUrl}`);

/**
 * Compares the precache manifest with what is really in Cache Storage.
 * `missing` = in the manifest but not cached (the shell is incomplete);
 * `unexpected` = cached but not in the manifest.
 */
export const diffPrecache = (manifestEntries, cacheKeyUrls, origin) => {
  const expected = new Set(manifestEntries.map((entry) => manifestPath(entry.url)));
  const cached = new Set(cacheKeyUrls.map((url) => normalizeCacheKeyUrl(url, origin)));
  // Workbox also caches the site root as a navigation alias of index.html.
  const missing = [...expected].filter((path) => !cached.has(path)).sort();
  const unexpected = [...cached].filter((path) => !expected.has(path)).sort();
  return { expectedCount: expected.size, cachedCount: cached.size, missing, unexpected };
};

/** Files the first paint cannot work without. Pinned separately so a trimmed manifest cannot hide behind a count. */
export const CRITICAL_SHELL_PATTERNS = Object.freeze([
  /^\/index\.html$/,
  /^\/assets\/main-[A-Za-z0-9_-]+\.js$/,
  /^\/assets\/main-[A-Za-z0-9_-]+\.css$/,
  /^\/assets\/phaser-[A-Za-z0-9_-]+\.js$/,
  /^\/assets\/vendor-[A-Za-z0-9_-]+\.js$/,
  /^\/fonts\/space-grotesk\/space-grotesk-latin-wght-normal\.woff2$/,
  /^\/icons\/icon-192\.png$/,
  /^\/icons\/icon-512\.png$/,
  /^\/favicon\.ico$/
]);

export const findMissingCriticalShellFiles = (cachedPaths) => (
  CRITICAL_SHELL_PATTERNS
    .filter((pattern) => !cachedPaths.some((path) => pattern.test(path)))
    .map((pattern) => String(pattern))
);

/**
 * Splits the requests seen while offline into app-origin failures (must be
 * none), allowed external failures (account provider), unexpected external
 * requests (anything else), and what the service worker answered.
 *
 * request = { url, failed: string|null, fromServiceWorker: boolean|null, status: number|null }
 */
export const evaluateOfflineRequests = (requests, appOrigin, allowedExternalHosts = OFFLINE_ALLOWED_EXTERNAL_HOSTS) => {
  const appFailures = [];
  const allowedExternal = [];
  const unexpectedExternal = [];
  const serviceWorkerBackground = [];
  let appRequests = 0;
  let appServedFromServiceWorker = 0;
  for (const request of requests) {
    let parsed = null;
    try {
      parsed = new URL(request.url);
    } catch {
      continue;
    }
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:' || parsed.protocol === 'chrome-extension:') {
      continue;
    }
    if (request.issuedByServiceWorker === true) {
      // The worker's own background fetches (update check, stale-while-revalidate). They are
      // expected to fail offline and must not break the page; they are counted, not judged.
      serviceWorkerBackground.push({ url: request.url, failed: request.failed ?? null });
      continue;
    }
    if (parsed.origin === appOrigin) {
      appRequests += 1;
      if (request.fromServiceWorker === true) {
        appServedFromServiceWorker += 1;
      }
      const badStatus = typeof request.status === 'number' && request.status >= 400;
      if (request.failed !== null && request.failed !== undefined) {
        appFailures.push({ url: request.url, reason: request.failed });
      } else if (badStatus) {
        appFailures.push({ url: request.url, reason: `HTTP ${request.status}` });
      }
      continue;
    }
    const entry = { url: request.url, failed: request.failed ?? null };
    if (allowedExternalHosts.includes(parsed.host)) {
      allowedExternal.push(entry);
    } else {
      unexpectedExternal.push(entry);
    }
  }
  return {
    appRequests,
    appServedFromServiceWorker,
    appFailures,
    serviceWorkerBackground,
    allowedExternal,
    unexpectedExternal,
    pass: appFailures.length === 0 && unexpectedExternal.length === 0 && appRequests > 0
  };
};

/**
 * While the network is really down, the only things allowed to even attempt it
 * are the service worker's own background fetches. Returns the attempted paths
 * that are NOT one of those (a page asking the network for a shell file means
 * the shell was not served from the cache).
 */
export const SERVICE_WORKER_BACKGROUND_PATHS = Object.freeze([
  /^\/app-sw\.js$/,
  /^\/workbox-[A-Za-z0-9_-]+\.js$/,
  /^\/assets\/hud\//,
  /^\/fonts\/mazer-tile-font\//
]);

export const findUnexpectedNetworkAttempts = (attemptedPaths) => (
  attemptedPaths
    .map((path) => path.split('?')[0])
    .filter((path) => !SERVICE_WORKER_BACKGROUND_PATHS.some((pattern) => pattern.test(path)))
);

/** Counts requests per origin-relative path, largest first: a compact view of a request log. */
export const summarizeByPath = (requests, appOrigin) => {
  const counts = new Map();
  for (const request of requests) {
    let key = request.url;
    try {
      const parsed = new URL(request.url);
      key = parsed.origin === appOrigin ? parsed.pathname : parsed.origin + parsed.pathname;
    } catch {
      // Keep the raw url.
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/**
 * Install-gate behaviour matrix (MAZER-PWA-007: the gate is ALWAYS ON in a browser tab).
 * `expect` is what src/boot/installPolicy.ts + installGate.ts say; the proof script observes the real
 * production build served off-localhost (mazer-proof.localhost) and `evaluateGateRow` compares the two.
 * Rules the table pins: a non-installed visit is blocked whatever the URL carries (previewLevel, autoSignIn,
 * authFixture, an OAuth callback, a hash), on every UA class (tablets and in-app browsers included) and in every
 * display mode that is not an installed display context; only localhost and a real installed display signal open
 * the app. Installed contexts use ?autoSignIn=0 here unless the row is about a callback: this table is about the
 * install gate, and a signed-out standalone launch would otherwise leave for the account host after the gate.
 */
export const INSTALL_GATE_SCENARIOS = Object.freeze([
  // Local development: the only runtime exemption.
  { id: 'localhost-browser', label: 'Browser tab on localhost / 127.0.0.1', host: 'localhost', display: 'browser', ua: 'desktop-chromium', path: '/', expect: { blocked: false } },
  { id: 'localhost-preview-level', label: 'Browser tab on 127.0.0.1, ?previewLevel=1 (dev)', host: 'localhost', display: 'browser', ua: 'desktop-chromium', path: '/?previewLevel=1', expect: { blocked: false } },
  { id: 'localhost-forced', label: 'Browser tab on 127.0.0.1 with ?forceInstallGate=1', host: 'localhost', display: 'browser', ua: 'desktop-chromium', path: '/?forceInstallGate=1', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  // Every browser class, plain tab.
  { id: 'browser-desktop-chromium', label: 'Browser tab, desktop Chrome / Edge', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  { id: 'browser-desktop-firefox', label: 'Browser tab, desktop Firefox', host: 'public', display: 'browser', ua: 'desktop-firefox', path: '/', expect: { blocked: true, mode: 'manual-desktop-other' } },
  { id: 'browser-desktop-safari', label: 'Browser tab, desktop Safari', host: 'public', display: 'browser', ua: 'desktop-safari', path: '/', expect: { blocked: true, mode: 'manual-desktop-other' } },
  { id: 'browser-android', label: 'Browser tab, Android Chrome', host: 'public', display: 'browser', ua: 'android', path: '/', expect: { blocked: true, mode: 'manual-android' } },
  { id: 'browser-android-tablet', label: 'Browser tab, Android tablet Chrome', host: 'public', display: 'browser', ua: 'android-tablet', path: '/', expect: { blocked: true, mode: 'manual-android' } },
  { id: 'browser-android-in-app', label: 'In-app browser on Android (Instagram WebView)', host: 'public', display: 'browser', ua: 'android-in-app', path: '/', expect: { blocked: true, mode: 'in-app-browser' } },
  { id: 'browser-ios', label: 'Browser tab, iPhone Safari', host: 'public', display: 'browser', ua: 'ios', path: '/', expect: { blocked: true, mode: 'manual-ios' } },
  { id: 'browser-ipad', label: 'Browser tab, iPad Safari', host: 'public', display: 'browser', ua: 'ipad', path: '/', expect: { blocked: true, mode: 'manual-ios' } },
  { id: 'browser-ios-in-app', label: 'In-app browser on iPhone (Instagram)', host: 'public', display: 'browser', ua: 'ios-in-app', path: '/', expect: { blocked: true, mode: 'in-app-browser' } },
  // Install events and display modes that are not an installed app.
  { id: 'browser-install-prompt', label: 'Browser tab that fires beforeinstallprompt', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/', event: 'beforeinstallprompt', expect: { blocked: true, mode: 'prompt-available' } },
  { id: 'browser-app-installed-event', label: 'Browser tab after an appinstalled event', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/', event: 'appinstalled', expect: { blocked: true, mode: 'installed-open-app' } },
  { id: 'browser-fullscreen-only', label: 'Browser tab in plain display-mode: fullscreen (F11)', host: 'public', display: 'fullscreen', ua: 'desktop-chromium', path: '/', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  { id: 'browser-android-referrer', label: 'Android Chrome tab opened by another app (android-app:// referrer, display browser)', host: 'public', display: 'android-referrer', ua: 'android', path: '/', expect: { blocked: true, mode: 'manual-android' } },
  // URL forms that used to bypass the gate (or that someone might try): none works in a tab.
  { id: 'route-level-preview', label: 'Browser tab, ?previewLevel=1 (QA sandbox route)', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/?previewLevel=1', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  { id: 'route-auth-fixture', label: 'Browser tab, ?runtimeDiagnostics=1&authFixture=authenticated', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/?runtimeDiagnostics=1&authFixture=authenticated', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  { id: 'route-auto-sign-in-off', label: 'Browser tab, ?autoSignIn=0', host: 'public', display: 'browser', ua: 'android', path: '/?autoSignIn=0', expect: { blocked: true, mode: 'manual-android' } },
  { id: 'route-oauth-error', label: 'Browser tab, OAuth callback request (?error=access_denied)', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/?error=access_denied', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  { id: 'route-oauth-code', label: 'Browser tab, OAuth callback request (?code=...&state=...)', host: 'public', display: 'browser', ua: 'ios', path: '/?code=qa-code&state=qa-state', expect: { blocked: true, mode: 'manual-ios' } },
  { id: 'route-hash-params', label: 'Browser tab, hash parameters (#previewLevel=1&code=x&state=y)', host: 'public', display: 'browser', ua: 'desktop-chromium', path: '/#previewLevel=1&code=qa-code&state=qa-state', expect: { blocked: true, mode: 'manual-desktop-chromium' } },
  // Installed contexts: the only ways in (real display-mode signals).
  { id: 'standalone-matchmedia', label: 'Installed app, display-mode: standalone', host: 'public', display: 'standalone', ua: 'desktop-chromium', path: '/?autoSignIn=0', expect: { blocked: false } },
  { id: 'standalone-minimal-ui', label: 'Installed app, display-mode: minimal-ui', host: 'public', display: 'minimal-ui', ua: 'desktop-chromium', path: '/?autoSignIn=0', expect: { blocked: false } },
  { id: 'standalone-wco', label: 'Installed desktop app, display-mode: window-controls-overlay', host: 'public', display: 'window-controls-overlay', ua: 'desktop-chromium', path: '/?autoSignIn=0', expect: { blocked: false } },
  { id: 'standalone-ios', label: 'iPhone home-screen app (navigator.standalone)', host: 'public', display: 'navigator-standalone', ua: 'ios', path: '/?autoSignIn=0', expect: { blocked: false } },
  { id: 'standalone-android-webapk', label: 'Android WebAPK / TWA (display-mode: standalone, Android UA)', host: 'public', display: 'standalone', ua: 'android', path: '/?autoSignIn=0', expect: { blocked: false } },
  { id: 'standalone-oauth-return', label: 'Installed app, OAuth callback return (?error=access_denied)', host: 'public', display: 'standalone', ua: 'android', path: '/?error=access_denied', expect: { blocked: false } },
  { id: 'standalone-ios-oauth-return', label: 'iPhone home-screen app, OAuth callback return (?code=...&state=...)', host: 'public', display: 'navigator-standalone', ua: 'ios', path: '/?code=qa-code&state=qa-state', expect: { blocked: false } }
]);

/** observed = { blocked: boolean, mode: string|null, booted: boolean } */
export const evaluateGateRow = (scenario, observed) => {
  const problems = [];
  if (observed.blocked !== scenario.expect.blocked) {
    problems.push(`gate ${observed.blocked ? 'shown' : 'not shown'}, policy says ${scenario.expect.blocked ? 'shown' : 'not shown'}`);
  }
  if (scenario.expect.blocked && scenario.expect.mode !== observed.mode) {
    problems.push(`mode ${observed.mode ?? 'none'}, expected ${scenario.expect.mode}`);
  }
  if (observed.blocked && observed.booted) {
    problems.push('game booted behind the gate');
  }
  if (!observed.blocked && !observed.booted) {
    problems.push('gate not shown but the game did not boot either');
  }
  return { id: scenario.id, pass: problems.length === 0, problems };
};

export const formatGateTableMarkdown = (rows) => {
  const lines = [
    '| Context | Display mode | Gate on first boot | Gate mode | Game boots | Service worker registered | Note |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const row of rows) {
    const note = row.reloadedAfterBoot
      ? `reloaded after boot (service worker claimed the page); gate ${row.gateAfterReload ? 'shown' : 'not shown'} after the reload`
      : '';
    lines.push(`| ${row.label} | ${row.display} | ${row.blocked ? 'shown' : 'not shown'} | ${row.blocked ? (row.mode ?? '-') : '-'} | ${row.booted ? 'yes' : 'no'} | ${row.serviceWorkerRegistrations > 0 ? 'yes' : 'no'} | ${note} |`);
  }
  return lines.join('\n');
};

/** Sum of a list of numbers; non-finite values count as 0. */
export const sumBytes = (sizes) => sizes.reduce((total, size) => total + (Number.isFinite(size) ? size : 0), 0);

export const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

/** A named check result; the script's exit code is the AND of every `pass`. */
export const makeCheck = (id, pass, detail) => ({ id, pass: pass === true, detail });

export const summarizeChecks = (checks) => ({
  total: checks.length,
  passed: checks.filter((check) => check.pass).length,
  failed: checks.filter((check) => !check.pass).map((check) => check.id),
  pass: checks.every((check) => check.pass)
});

export const parseProofArgs = (argv) => {
  const args = { json: false, keep: false, distA: null, distB: null, port: 0, outFile: null };
  for (const raw of argv) {
    if (raw === '--json') {
      args.json = true;
    } else if (raw === '--keep') {
      args.keep = true;
    } else if (raw.startsWith('--dist-a=')) {
      args.distA = raw.slice('--dist-a='.length);
    } else if (raw.startsWith('--dist-b=')) {
      args.distB = raw.slice('--dist-b='.length);
    } else if (raw.startsWith('--port=')) {
      const port = Number.parseInt(raw.slice('--port='.length), 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid --port value: ${raw}`);
      }
      args.port = port;
    } else if (raw.startsWith('--out=')) {
      args.outFile = raw.slice('--out='.length);
    } else {
      throw new Error(`Unknown argument: ${raw}`);
    }
  }
  if ((args.distA === null) !== (args.distB === null)) {
    throw new Error('--dist-a and --dist-b must be given together (two builds of different versions).');
  }
  return args;
};
