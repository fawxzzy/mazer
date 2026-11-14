import { describe, expect, test } from 'vitest';
import {
  classifyInstallUserAgent,
  detectInstalledDisplayContext,
  resolveInstallGateDecision,
  type InstallGateDecisionInput,
  type InstallGateMode,
  type InstallUserAgentClass
} from '../../src/boot/installPolicy';

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
  androidInstagram: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.0 Android (34/14; 420dpi; 1080x2400)',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTabletChrome: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
} as const;

const base: InstallGateDecisionInput = {
  standalone: false,
  isLocalhost: false,
  forceGate: false,
  userAgentClass: 'desktop-chromium',
  hasDeferredPrompt: false
};

const decide = (overrides: Partial<InstallGateDecisionInput>) => resolveInstallGateDecision({ ...base, ...overrides });

describe('install policy: user agent classification', () => {
  test.each([
    ['desktop Chrome', UA.chromeWindows, 'Win32', 0, 'desktop-chromium'],
    ['desktop Edge', UA.edgeWindows, 'Win32', 0, 'desktop-chromium'],
    ['desktop Firefox', UA.firefoxWindows, 'Win32', 0, 'desktop-firefox'],
    ['desktop Safari', UA.safariMac, 'MacIntel', 0, 'desktop-safari'],
    ['Android Chrome', UA.androidChrome, 'Linux armv8l', 5, 'android'],
    ['iOS Safari', UA.iosSafari, 'iPhone', 5, 'ios'],
    ['iOS in-app browser', UA.iosInstagram, 'iPhone', 5, 'ios-in-app'],
    ['Android Instagram in-app browser', UA.androidInstagram, 'Linux armv8l', 5, 'android-in-app'],
    ['Android Facebook in-app browser', UA.androidFacebook, 'Linux armv8l', 5, 'android-in-app'],
    ['Android WebView', UA.androidWebView, 'Linux armv8l', 5, 'android-in-app'],
    ['Android tablet Chrome', UA.androidTabletChrome, 'Linux armv8l', 5, 'android'],
    ['iPad Safari', UA.ipadSafari, 'iPad', 5, 'ios'],
    // iPadOS in desktop-site mode reports a Mac UA but has touch points.
    ['iPadOS desktop-class Safari', UA.safariMac, 'MacIntel', 5, 'ios']
  ] as const)('%s', (_label, userAgent, platform, maxTouchPoints, expected) => {
    expect(classifyInstallUserAgent({ userAgent, platform, maxTouchPoints })).toBe(expected);
  });

  test('missing navigator facts fall back to the generic desktop class', () => {
    expect(classifyInstallUserAgent(undefined)).toBe('desktop-other');
    expect(classifyInstallUserAgent({ userAgent: 'SomethingUnknown/1.0' })).toBe('desktop-other');
  });
});

describe('install policy: installed display context', () => {
  const media = (...matching: string[]) => (query: string) => ({ matches: matching.includes(query) });

  test.each([
    ['display-mode standalone', { matchMedia: media('(display-mode: standalone)') }],
    ['display-mode minimal-ui', { matchMedia: media('(display-mode: minimal-ui)') }],
    ['display-mode window-controls-overlay', { matchMedia: media('(display-mode: window-controls-overlay)') }],
    ['iOS navigator.standalone', { navigatorStandalone: true }]
  ])('%s counts as installed', (_label, facts) => {
    expect(detectInstalledDisplayContext(facts)).toBe(true);
  });

  test('a plain browser tab, and a fullscreened browser tab, do not count as installed', () => {
    expect(detectInstalledDisplayContext(undefined)).toBe(false);
    expect(detectInstalledDisplayContext({ matchMedia: media('(display-mode: browser)') })).toBe(false);
    // F11 / Fullscreen API in a normal tab reports display-mode: fullscreen. It must not unlock the gate.
    expect(detectInstalledDisplayContext({ matchMedia: media('(display-mode: fullscreen)') })).toBe(false);
    expect(detectInstalledDisplayContext({ navigatorStandalone: false })).toBe(false);
  });

  test('an android-app:// referrer is NOT an installed signal (other Android apps set it on ordinary Chrome tabs)', () => {
    // The facts type has no referrer input any more; an extra key must change nothing.
    expect(detectInstalledDisplayContext({ referrer: 'android-app://com.google.android.googlequicksearchbox' } as never)).toBe(false);
    expect(detectInstalledDisplayContext({
      matchMedia: media('(display-mode: browser)'),
      referrer: 'android-app://com.example.mazer'
    } as never)).toBe(false);
  });

  test('a matchMedia that throws is treated as not installed', () => {
    expect(detectInstalledDisplayContext({
      matchMedia: () => {
        throw new Error('unsupported');
      }
    })).toBe(false);
  });
});

describe('install policy: gate decision truth table', () => {
  const blockedCases: ReadonlyArray<[string, Partial<InstallGateDecisionInput>, InstallGateMode]> = [
    ['desktop Chrome/Edge, no prompt yet', { userAgentClass: 'desktop-chromium' }, 'manual-desktop-chromium'],
    ['desktop Chrome/Edge, prompt captured', { userAgentClass: 'desktop-chromium', hasDeferredPrompt: true }, 'prompt-available'],
    ['desktop Firefox', { userAgentClass: 'desktop-firefox' }, 'manual-desktop-other'],
    ['desktop Safari', { userAgentClass: 'desktop-safari' }, 'manual-desktop-other'],
    ['unknown desktop browser', { userAgentClass: 'desktop-other' }, 'manual-desktop-other'],
    ['Android Chrome, no prompt yet', { userAgentClass: 'android' }, 'manual-android'],
    ['Android Chrome, prompt captured', { userAgentClass: 'android', hasDeferredPrompt: true }, 'prompt-available'],
    ['iOS Safari', { userAgentClass: 'ios' }, 'manual-ios'],
    ['iOS in-app browser', { userAgentClass: 'ios-in-app' }, 'in-app-browser'],
    ['Android in-app browser', { userAgentClass: 'android-in-app' }, 'in-app-browser'],
    ['Android in-app browser ignores a stray prompt', { userAgentClass: 'android-in-app', hasDeferredPrompt: true }, 'in-app-browser'],
    ['iOS in-app browser ignores a stray prompt', { userAgentClass: 'ios-in-app', hasDeferredPrompt: true }, 'in-app-browser'],
    ['appinstalled fired in this tab', { appInstalled: true }, 'installed-open-app'],
    ['appinstalled beats a stale prompt', { appInstalled: true, hasDeferredPrompt: true }, 'installed-open-app'],
    ['legacy dismissed flag is ignored (manual)', { dismissedFlag: true }, 'manual-desktop-chromium'],
    ['legacy dismissed flag is ignored (prompt)', { dismissedFlag: true, hasDeferredPrompt: true }, 'prompt-available'],
    ['forceInstallGate on localhost', { isLocalhost: true, forceGate: true }, 'manual-desktop-chromium'],
    ['forceInstallGate off-localhost is a no-op, still blocked', { forceGate: true }, 'manual-desktop-chromium']
  ];

  test.each(blockedCases)('blocks: %s', (_label, overrides, expectedMode) => {
    expect(decide(overrides)).toEqual({ blocked: true, mode: expectedMode, copyKey: expectedMode, reason: null });
  });

  test.each([
    ['standalone / minimal-ui / WebAPK / iOS home screen', { standalone: true }, 'standalone'],
    ['standalone wins over forceInstallGate on localhost', { standalone: true, isLocalhost: true, forceGate: true }, 'standalone'],
    ['standalone wins over a captured prompt', { standalone: true, hasDeferredPrompt: true }, 'standalone'],
    ['localhost without forceInstallGate', { isLocalhost: true }, 'localhost']
  ] as const)('does not block: %s', (_label, overrides, reason) => {
    expect(decide(overrides)).toEqual({ blocked: false, mode: 'open', copyKey: null, reason });
  });

  test('every non-standalone, non-localhost visit is blocked on every platform', () => {
    const classes: InstallUserAgentClass[] = [
      'desktop-chromium', 'desktop-safari', 'desktop-firefox', 'desktop-other', 'android', 'android-in-app', 'ios', 'ios-in-app'
    ];
    for (const userAgentClass of classes) {
      for (const hasDeferredPrompt of [false, true]) {
        for (const appInstalled of [false, true]) {
          for (const dismissedFlag of [false, true]) {
            expect(decide({ userAgentClass, hasDeferredPrompt, appInstalled, dismissedFlag }).blocked).toBe(true);
          }
        }
      }
    }
  });

  test('a prompt arriving after the manual card was resolved upgrades the same visit to prompt-available', () => {
    const before = decide({ userAgentClass: 'desktop-chromium', hasDeferredPrompt: false });
    const after = decide({ userAgentClass: 'desktop-chromium', hasDeferredPrompt: true });
    expect(before.mode).toBe('manual-desktop-chromium');
    expect(after.mode).toBe('prompt-available');
  });
});
