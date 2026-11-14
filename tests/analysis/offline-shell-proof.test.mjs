import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  INSTALL_GATE_SCENARIOS,
  diffPrecache,
  evaluateGateRow,
  evaluateOfflineRequests,
  findMissingCriticalShellFiles,
  findUnexpectedNetworkAttempts,
  formatGateTableMarkdown,
  normalizeCacheKeyUrl,
  parsePrecacheManifest,
  parseProofArgs,
  summarizeByPath,
  summarizeChecks
} from '../../scripts/analysis/lib/offline-shell-proof.mjs';
import { INSTALLED_DISPLAY_MODE_QUERIES, resolveInstallGateDecision } from '../../src/boot/installPolicy';

const ORIGIN = 'http://mazer-proof.localhost:5615';
const GENERATED_SW = 'define(["./workbox-1"],function(s){"use strict";s.setCacheNameDetails({prefix:"mazer-v1"}),s.precacheAndRoute([{url:"index.html",revision:"abc123"},{url:"assets/main-BhTyvGcl.js",revision:null},{url:"assets/main-C5dm9Skx.css",revision:null}],{}),s.cleanupOutdatedCaches()});';

describe('parsePrecacheManifest / diffPrecache', () => {
  test('reads url and revision from a generated Workbox worker', () => {
    expect(parsePrecacheManifest(GENERATED_SW)).toEqual([
      { url: 'index.html', revision: 'abc123' },
      { url: 'assets/main-BhTyvGcl.js', revision: null },
      { url: 'assets/main-C5dm9Skx.css', revision: null }
    ]);
    expect(parsePrecacheManifest('no manifest here')).toEqual([]);
  });

  test('cache keys drop the __WB_REVISION__ parameter', () => {
    expect(normalizeCacheKeyUrl(`${ORIGIN}/index.html?__WB_REVISION__=abc123`, ORIGIN)).toBe('/index.html');
    expect(normalizeCacheKeyUrl(`${ORIGIN}/assets/a.js`, ORIGIN)).toBe('/assets/a.js');
  });

  test('reports a missing and an unexpected entry', () => {
    const manifest = parsePrecacheManifest(GENERATED_SW);
    const diff = diffPrecache(manifest, [
      `${ORIGIN}/index.html?__WB_REVISION__=abc123`,
      `${ORIGIN}/assets/main-BhTyvGcl.js`,
      `${ORIGIN}/assets/stray.js`
    ], ORIGIN);
    expect(diff.missing).toEqual(['/assets/main-C5dm9Skx.css']);
    expect(diff.unexpected).toEqual(['/assets/stray.js']);
    expect(diff.expectedCount).toBe(3);
  });

  test('critical shell files are checked by pattern, not by count', () => {
    expect(findMissingCriticalShellFiles(['/index.html'])).not.toEqual([]);
    expect(findMissingCriticalShellFiles([
      '/index.html', '/assets/main-abc.js', '/assets/main-abc.css', '/assets/phaser-abc.js', '/assets/vendor-abc.js',
      '/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2', '/icons/icon-192.png', '/icons/icon-512.png', '/favicon.ico'
    ])).toEqual([]);
  });
});

describe('evaluateOfflineRequests', () => {
  const ok = (path, extra = {}) => ({ url: `${ORIGIN}${path}`, failed: null, fromServiceWorker: true, status: 200, ...extra });

  test('passes when every app request is answered and external failures are the provider only', () => {
    const result = evaluateOfflineRequests([
      ok('/'),
      ok('/assets/main-a.js'),
      { url: 'https://bxtcuhkotumitoqtrcej.supabase.co/auth/v1/.well-known/openid-configuration', failed: 'net::ERR_INTERNET_DISCONNECTED', fromServiceWorker: false, status: null }
    ], ORIGIN);
    expect(result.pass).toBe(true);
    expect(result.appRequests).toBe(2);
    expect(result.appServedFromServiceWorker).toBe(2);
    expect(result.allowedExternal).toHaveLength(1);
  });

  test('a failed app request fails the proof', () => {
    const result = evaluateOfflineRequests([ok('/'), ok('/assets/hud/hud-profile.webp', { failed: 'net::ERR_INTERNET_DISCONNECTED', fromServiceWorker: false })], ORIGIN);
    expect(result.pass).toBe(false);
    expect(result.appFailures).toEqual([{ url: `${ORIGIN}/assets/hud/hud-profile.webp`, reason: 'net::ERR_INTERNET_DISCONNECTED' }]);
  });

  test('an HTTP error status counts as a failure', () => {
    expect(evaluateOfflineRequests([ok('/'), ok('/x.js', { status: 404 })], ORIGIN).pass).toBe(false);
  });

  test('a request to an unlisted external origin fails the proof', () => {
    const result = evaluateOfflineRequests([ok('/'), { url: 'https://example.com/x.js', failed: 'net::ERR_INTERNET_DISCONNECTED' }], ORIGIN);
    expect(result.pass).toBe(false);
    expect(result.unexpectedExternal).toHaveLength(1);
  });

  test('service-worker background fetches are counted, not judged', () => {
    const result = evaluateOfflineRequests([ok('/'), { url: `${ORIGIN}/app-sw.js`, failed: 'net::ERR_FAILED', issuedByServiceWorker: true }], ORIGIN);
    expect(result.pass).toBe(true);
    expect(result.serviceWorkerBackground).toHaveLength(1);
  });

  test('no app request at all is not a pass', () => {
    expect(evaluateOfflineRequests([], ORIGIN).pass).toBe(false);
  });

  test('network attempts: only the worker background paths are allowed', () => {
    expect(findUnexpectedNetworkAttempts(['/app-sw.js', '/workbox-edd508a6.js', '/assets/hud/hud-profile.webp?v=1', '/fonts/mazer-tile-font/mazer-font-atlas.json'])).toEqual([]);
    expect(findUnexpectedNetworkAttempts(['/assets/main-abc.js', '/index.html'])).toEqual(['/assets/main-abc.js', '/index.html']);
  });

  test('summarizeByPath counts per origin-relative path', () => {
    expect(summarizeByPath([ok('/a'), ok('/a'), ok('/b')], ORIGIN)).toEqual([['/a', 2], ['/b', 1]]);
  });
});

describe('install gate scenarios agree with the pure policy', () => {
  // The proof script drives the real build; this pins that the table it compares against is
  // the same truth table src/boot/installPolicy.ts produces, so neither can drift alone.
  const STANDALONE_BY_DISPLAY = {
    browser: false,
    fullscreen: false,
    standalone: true,
    'minimal-ui': true,
    'window-controls-overlay': true,
    'navigator-standalone': true,
    // MAZER-PWA-007: an android-app:// referrer is not an installed signal (display stays browser).
    'android-referrer': false
  };

  test('every display value is one the policy knows', () => {
    for (const scenario of INSTALL_GATE_SCENARIOS) {
      expect(Object.keys(STANDALONE_BY_DISPLAY), scenario.id).toContain(scenario.display);
    }
    expect(INSTALLED_DISPLAY_MODE_QUERIES).toEqual(expect.arrayContaining([
      '(display-mode: standalone)', '(display-mode: minimal-ui)', '(display-mode: window-controls-overlay)'
    ]));
    expect(INSTALLED_DISPLAY_MODE_QUERIES).not.toContain('(display-mode: fullscreen)');
  });

  // The proof's UA keys that are not policy classes (tablets map to their phone class).
  const POLICY_CLASS_BY_PROOF_UA = { ipad: 'ios', 'android-tablet': 'android' };

  // The URL (query, hash) is deliberately NOT an input of the decision: every public row, route rows included,
  // must match the policy computed from display + UA + install event alone.
  test.each(INSTALL_GATE_SCENARIOS.filter((scenario) => scenario.host === 'public'))(
    '$id: expectation matches resolveInstallGateDecision',
    (scenario) => {
      const decision = resolveInstallGateDecision({
        standalone: STANDALONE_BY_DISPLAY[scenario.display],
        isLocalhost: false,
        forceGate: false,
        userAgentClass: POLICY_CLASS_BY_PROOF_UA[scenario.ua] ?? scenario.ua,
        hasDeferredPrompt: scenario.event === 'beforeinstallprompt',
        appInstalled: scenario.event === 'appinstalled'
      });
      expect(decision.blocked).toBe(scenario.expect.blocked);
      if (scenario.expect.blocked) {
        expect(decision.mode).toBe(scenario.expect.mode);
      }
    }
  );

  test('the matrix covers the required forms (MAZER-PWA-007)', () => {
    const rows = INSTALL_GATE_SCENARIOS;
    const blocked = rows.filter((row) => row.host === 'public' && row.expect.blocked);
    for (const needle of ['previewLevel=1', 'authFixture=authenticated', 'autoSignIn=0', 'error=access_denied', 'code=qa-code', '#previewLevel']) {
      expect(blocked.some((row) => row.path.includes(needle)), needle).toBe(true);
    }
    for (const ua of ['desktop-chromium', 'desktop-firefox', 'desktop-safari', 'android', 'android-tablet', 'android-in-app', 'ios', 'ipad', 'ios-in-app']) {
      expect(blocked.some((row) => row.ua === ua && row.display === 'browser'), ua).toBe(true);
    }
    expect(blocked.some((row) => row.display === 'fullscreen')).toBe(true);
    // Every route-style row on a public host is blocked unless the display context is an installed one.
    for (const row of rows.filter((candidate) => candidate.host === 'public' && /[?#]/.test(candidate.path))) {
      if (STANDALONE_BY_DISPLAY[row.display] !== true && row.display !== 'browser') {
        continue;
      }
      expect(row.expect.blocked, row.id).toBe(STANDALONE_BY_DISPLAY[row.display] !== true);
    }
    expect(rows.length).toBeGreaterThanOrEqual(28);
  });

  test('scenario ids are unique', () => {
    const ids = INSTALL_GATE_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('evaluateGateRow / table / args', () => {
  const blockedScenario = { id: 'x', label: 'X', expect: { blocked: true, mode: 'manual-ios' } };
  const openScenario = { id: 'y', label: 'Y', expect: { blocked: false } };

  test('flags a wrong mode, a missing gate and a game booting behind the gate', () => {
    expect(evaluateGateRow(blockedScenario, { blocked: true, mode: 'manual-ios', booted: false }).pass).toBe(true);
    expect(evaluateGateRow(blockedScenario, { blocked: true, mode: 'manual-android', booted: false }).problems[0]).toContain('mode');
    expect(evaluateGateRow(blockedScenario, { blocked: false, mode: null, booted: true }).pass).toBe(false);
    expect(evaluateGateRow(blockedScenario, { blocked: true, mode: 'manual-ios', booted: true }).problems).toContain('game booted behind the gate');
    expect(evaluateGateRow(openScenario, { blocked: false, mode: null, booted: true }).pass).toBe(true);
    expect(evaluateGateRow(openScenario, { blocked: false, mode: null, booted: false }).pass).toBe(false);
  });

  test('table has one line per row plus the header', () => {
    const table = formatGateTableMarkdown([
      { label: 'A', display: 'browser', blocked: true, mode: 'manual-ios', booted: false, serviceWorkerRegistrations: 0, reloadedAfterBoot: false },
      { label: 'B', display: 'standalone', blocked: false, mode: null, booted: true, serviceWorkerRegistrations: 1, reloadedAfterBoot: true, gateAfterReload: false }
    ]);
    expect(table.split('\n')).toHaveLength(4);
    expect(table).toContain('| A | browser | shown | manual-ios | no | no |  |');
    expect(table).toContain('reloaded after boot');
  });

  test('summarizeChecks is the AND of all checks', () => {
    expect(summarizeChecks([{ id: 'a', pass: true }, { id: 'b', pass: false }])).toEqual({ total: 2, passed: 1, failed: ['b'], pass: false });
    expect(summarizeChecks([{ id: 'a', pass: true }]).pass).toBe(true);
  });

  test('parseProofArgs', () => {
    expect(parseProofArgs(['--json', '--port=5615', '--out=r.json']).port).toBe(5615);
    expect(parseProofArgs([]).json).toBe(false);
    expect(() => parseProofArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseProofArgs(['--dist-a=a'])).toThrow(/together/);
    expect(() => parseProofArgs(['--port=99999'])).toThrow(/Invalid --port/);
  });
});

describe('service worker configuration the proof depends on', () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

  test('boot art (HUD icons, tile-font atlas) is runtime-cached for offline launches', () => {
    const viteConfig = read('vite.config.ts');
    expect(viteConfig).toContain("url.pathname.startsWith('/assets/hud/')");
    expect(viteConfig).toContain("url.pathname.startsWith('/fonts/mazer-tile-font/')");
    expect(viteConfig).toContain("cacheName: 'mazer-boot-art-v1'");
  });

  test('every public file BootScene preloads is covered by the boot-art runtime cache', () => {
    const boot = read('src/scenes/BootScene.ts');
    const urls = [...boot.matchAll(/['`](\/(?:assets|fonts)\/[^'`?$]+)/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const url of urls) {
      expect(url.startsWith('/assets/hud/') || url.startsWith('/fonts/mazer-tile-font/'), url).toBe(true);
    }
  });
});
