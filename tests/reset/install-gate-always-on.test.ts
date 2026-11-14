import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { shouldRunMazerInstallGateForBoot } from '../../src/boot/installGate';
import {
  classifyInstallUserAgent,
  detectInstalledDisplayContext,
  resolveInstallGateDecision
} from '../../src/boot/installPolicy';

/**
 * MAZER-PWA-007 (owner, 2026-11-13): "we need to make sure there is an install gate for browser access at all
 * times in all forms". In a production build every NON-installed browser visit must show the gate, whatever the
 * URL carries. This file enumerates the bypass attempts a visitor (or a stale QA habit) could try and pins that
 * none of them works. The only things that open Mazer are: localhost development, and a real installed display
 * context (display-mode standalone / minimal-ui / window-controls-overlay, or iOS navigator.standalone).
 *
 * Pure: it drives the same two decisions boot uses (shouldRunMazerInstallGateForBoot, then the live policy).
 */

const PRODUCTION_HOST = 'mazer.fawxzzy.com';

const UA = {
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  desktopSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidInstagram: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.0 Android',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
  iosFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]'
} as const;

/** Every query string / hash a visitor could try. None of them is read by the gate decision. */
const URLS = [
  '/',
  '/?previewLevel=1',
  '/?previewLevel=999',
  '/?runtimeDiagnostics=1&previewLevel=1&mazeSeed=3749',
  '/?runtimeDiagnostics=1&authFixture=authenticated',
  '/?authFixture=authenticated',
  '/?autoSignIn=0',
  '/?autoSignIn=1',
  '/?forceInstallGate=0',
  '/?forceInstallGate=1',
  '/?code=abc&state=def',
  '/?error=access_denied',
  '/?error=access_denied&error_description=nope',
  '/?mode=play',
  '/?installed=1&standalone=1&display=standalone&display-mode=standalone',
  '/?utm_source=pwa&source=pwa',
  '/#previewLevel=1',
  '/#code=abc&state=def',
  '/#access_token=x&refresh_token=y&type=recovery',
  '/?previewLevel=1#standalone'
] as const;

type DisplayFacts = Parameters<typeof detectInstalledDisplayContext>[0];

const media = (...matching: string[]): NonNullable<DisplayFacts>['matchMedia'] => (
  (query: string) => ({ matches: matching.includes(query) })
);

/** Display contexts that are NOT an installed app: a plain tab, F11 / Fullscreen API, picture-in-picture, an unrelated query. */
const NON_INSTALLED_DISPLAYS: ReadonlyArray<[string, DisplayFacts]> = [
  ['no facts at all', undefined],
  ['browser', { matchMedia: media('(display-mode: browser)') }],
  ['plain fullscreen (F11)', { matchMedia: media('(display-mode: fullscreen)') }],
  ['navigator.standalone false', { navigatorStandalone: false, matchMedia: media('(display-mode: browser)') }],
  ['picture-in-picture', { matchMedia: media('(display-mode: picture-in-picture)') }],
  ['an android-app:// referrer in a tab', { matchMedia: media('(display-mode: browser)'), referrer: 'android-app://com.google.android.googlequicksearchbox' } as never],
  ['a matchMedia that throws', { matchMedia: () => { throw new Error('unsupported'); } }]
];

/** The REAL installed signals: the only way a non-localhost visit gets past the gate. */
const INSTALLED_DISPLAYS: ReadonlyArray<[string, DisplayFacts]> = [
  ['display-mode standalone (installed PWA, WebAPK, TWA, desktop PWA window)', { matchMedia: media('(display-mode: standalone)') }],
  ['display-mode minimal-ui (installed fallback)', { matchMedia: media('(display-mode: minimal-ui)') }],
  ['display-mode window-controls-overlay (desktop PWA)', { matchMedia: media('(display-mode: window-controls-overlay)') }],
  ['iOS home screen (navigator.standalone)', { navigatorStandalone: true }]
];

const bootContextFor = (url: string, hostname: string) => {
  const search = url.includes('?') ? url.slice(url.indexOf('?'), url.includes('#') ? url.indexOf('#') : undefined) : '';
  return {
    // main.ts reads exactly one parameter for the gate: ?forceInstallGate=1.
    forceInstallGate: new URLSearchParams(search).get('forceInstallGate') === '1',
    isLocalhostRuntime: ['localhost', '127.0.0.1', '::1'].includes(hostname),
    legalRouteRequested: false,
    passwordRecoveryRequested: false
  };
};

const decideVisit = (
  url: string,
  hostname: string,
  ua: string,
  display: DisplayFacts
): { gateRuns: boolean; blocked: boolean } => {
  const gateRuns = shouldRunMazerInstallGateForBoot(bootContextFor(url, hostname));
  if (!gateRuns) {
    return { gateRuns, blocked: false };
  }
  const standalone = detectInstalledDisplayContext(display);
  const decision = resolveInstallGateDecision({
    standalone,
    isLocalhost: false,
    forceGate: false,
    userAgentClass: classifyInstallUserAgent({ userAgent: ua, platform: '', maxTouchPoints: 5 }),
    hasDeferredPrompt: false
  });
  return { gateRuns, blocked: decision.blocked };
};

describe('install gate is always on in production (MAZER-PWA-007)', () => {
  test.each(Object.entries(UA))('%s: every URL x every non-installed display shows the gate', (_name, ua) => {
    for (const url of URLS) {
      for (const [label, display] of NON_INSTALLED_DISPLAYS) {
        const visit = decideVisit(url, PRODUCTION_HOST, ua, display);
        expect(visit, `${url} / ${label}`).toEqual({ gateRuns: true, blocked: true });
      }
    }
  });

  test.each(Object.entries(UA))('%s: only a real installed display signal opens the app', (_name, ua) => {
    for (const url of URLS) {
      for (const [label, display] of INSTALLED_DISPLAYS) {
        const visit = decideVisit(url, PRODUCTION_HOST, ua, display);
        expect(visit, `${url} / ${label}`).toEqual({ gateRuns: true, blocked: false });
      }
    }
  });

  test('a spoofed user agent alone never opens the app: no user agent string is an installed signal', () => {
    for (const ua of Object.values(UA)) {
      for (const spoof of [`${ua} Mazer/PWA standalone`, `${ua} (installed)`, 'Mazer/1.0 TWA android-app://com.fawxzzy.mazer', '']) {
        expect(detectInstalledDisplayContext({ matchMedia: media('(display-mode: browser)') })).toBe(false);
        expect(decideVisit('/', PRODUCTION_HOST, spoof, undefined).blocked, spoof).toBe(true);
      }
    }
  });

  test('an OAuth callback that lands in a non-installed tab shows the gate (it used to bypass it)', () => {
    for (const url of ['/?code=abc&state=def', '/?error=access_denied', '/?error=server_error&error_description=x']) {
      expect(decideVisit(url, PRODUCTION_HOST, UA.androidChrome, { matchMedia: media('(display-mode: browser)') }), url)
        .toEqual({ gateRuns: true, blocked: true });
    }
  });

  test('an OAuth callback that lands in an installed app keeps working (the gate resolves at once)', () => {
    for (const [label, display] of INSTALLED_DISPLAYS) {
      expect(decideVisit('/?code=abc&state=def', PRODUCTION_HOST, UA.iosSafari, display), label)
        .toEqual({ gateRuns: true, blocked: false });
    }
  });

  test('previewLevel and the other QA routes never lift the gate in a tab', () => {
    for (const url of ['/?previewLevel=1', '/?runtimeDiagnostics=1&previewLevel=1&mazeSeed=3749', '/?authFixture=authenticated&runtimeDiagnostics=1']) {
      expect(decideVisit(url, PRODUCTION_HOST, UA.desktopChrome, undefined).blocked, url).toBe(true);
    }
  });

  test('the sub-domains of localhost used by the offline proof are NOT local development', () => {
    // verify-offline-shell serves the production build on mazer-proof.localhost precisely so the gate behaves as in production.
    for (const host of ['mazer-proof.localhost', 'mazer.localhost', 'evil-localhost.example', 'localhost.mazer.fawxzzy.com']) {
      expect(decideVisit('/', host, UA.desktopChrome, undefined), host).toEqual({ gateRuns: true, blocked: true });
    }
  });

  test('the only runtime exemption is local development; ?forceInstallGate=1 can only make it stricter', () => {
    for (const host of ['localhost', '127.0.0.1', '::1']) {
      expect(decideVisit('/?previewLevel=1', host, UA.desktopChrome, undefined), host).toEqual({ gateRuns: false, blocked: false });
      expect(decideVisit('/?forceInstallGate=1', host, UA.desktopChrome, undefined), host).toEqual({ gateRuns: true, blocked: true });
    }
    // On production the force flag is a no-op: it does not unlock anything, it only exists for localhost.
    expect(decideVisit('/?forceInstallGate=0', PRODUCTION_HOST, UA.desktopChrome, undefined).blocked).toBe(true);
  });

  test('every non-installed platform class maps to a gate card (no class falls through to open)', () => {
    for (const ua of Object.values(UA)) {
      const userAgentClass = classifyInstallUserAgent({ userAgent: ua, platform: '', maxTouchPoints: 5 });
      for (const hasDeferredPrompt of [false, true]) {
        for (const appInstalled of [false, true]) {
          const decision = resolveInstallGateDecision({
            standalone: false,
            isLocalhost: false,
            forceGate: false,
            userAgentClass,
            hasDeferredPrompt,
            appInstalled
          });
          expect(decision.blocked, `${userAgentClass} prompt=${hasDeferredPrompt} installed=${appInstalled}`).toBe(true);
        }
      }
    }
  });
});

describe('install gate source contract (MAZER-PWA-007)', () => {
  const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');
  const gateSource = read('src/boot/installGate.ts');
  const policySource = read('src/boot/installPolicy.ts');
  const mainSource = read('src/boot/main.ts');

  test('the boot context has no input for previewLevel, OAuth callbacks, autoSignIn or fixtures', () => {
    const contextBlock = /export interface MazerInstallGateBootContext \{[\s\S]*?\n\}/.exec(gateSource)?.[0] ?? '';
    expect(contextBlock).not.toBe('');
    const keys = [...contextBlock.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]);
    expect(keys.sort()).toEqual(['forceInstallGate', 'isLocalhostRuntime', 'legalRouteRequested', 'passwordRecoveryRequested']);
  });

  test('main.ts feeds the gate only those four facts, and runs it before the OAuth exchange', () => {
    const call = /shouldRunMazerInstallGateForBoot\(\{([\s\S]*?)\}\)/.exec(mainSource)?.[1] ?? '';
    const keys = [...call.matchAll(/^\s+(\w+)[:,]/gm)].map((match) => match[1]);
    expect(keys.sort()).toEqual(['forceInstallGate', 'isLocalhostRuntime', 'legalRouteRequested', 'passwordRecoveryRequested']);
    expect(mainSource.indexOf('await runMazerInstallGate(document')).toBeLessThan(mainSource.indexOf('await consumeMazerOAuthCallback('));
    expect(mainSource.indexOf('await runMazerInstallGate(document')).toBeLessThan(mainSource.indexOf('await runMazerSignedOutHandoffAtBoot('));
  });

  test('the policy has no route bypass, no referrer signal, and no runtime/URL-triggered QA switch', () => {
    expect(policySource).not.toMatch(/bypassRoute|bypass-route/);
    expect(policySource).not.toMatch(/referrer\s*\?|facts\.referrer|startsWith\('android-app/);
    expect(policySource).not.toMatch(/URLSearchParams|location\.search|location\.hash/);
    expect(gateSource).not.toMatch(/URLSearchParams|location\.search|location\.hash/);
    // No build/runtime "skip the gate" switch: QA emulates an installed app instead (docs/ops/MAZER-INSTALL-GATE-ALWAYS-ON-2026-11-14.md).
    expect(`${policySource}\n${gateSource}\n${mainSource}`).not.toMatch(/VITE_[A-Z_]*(GATE|QA|BYPASS)|import\.meta\.env/);
  });

  test('the installed display signals are exactly the real display-mode signals', () => {
    expect(policySource).toContain("'(display-mode: standalone)'");
    expect(policySource).toContain("'(display-mode: minimal-ui)'");
    expect(policySource).toContain("'(display-mode: window-controls-overlay)'");
    expect(policySource).not.toMatch(/'\(display-mode: fullscreen\)'/);
  });
});
