/**
 * Install policy: the single, pure decision for "may this browsing context
 * run Mazer, and if not, what does the player need to be told?".
 *
 * Policy (docs/ops/MAZER-INSTALL-GATE-POLICY-2026-11-05.md, tightened by
 * docs/ops/MAZER-INSTALL-GATE-ALWAYS-ON-2026-11-14.md): Mazer only runs from
 * an installed surface (home-screen / desktop app). EVERY other visit is
 * blocked, on every platform, in every form, whatever the query string or
 * hash says. There is exactly one exception: local development (localhost /
 * 127.0.0.1 / ::1, unless ?forceInstallGate=1 opts back in). Nothing a URL can
 * carry (previewLevel, autoSignIn, authFixture, an OAuth callback, ...) lifts
 * the gate; the only runtime signal that does is a real installed display
 * context (detectInstalledDisplayContext).
 *
 * This module is deliberately free of DOM / window access so the whole truth
 * table can be pinned by unit tests. installSurface.ts feeds it facts from
 * the live runtime; installGate.ts renders the result.
 */

export type InstallUserAgentClass =
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'desktop-other'
  | 'android'
  | 'android-in-app'
  | 'ios'
  | 'ios-in-app';

export type InstallGateMode =
  | 'prompt-available'
  | 'manual-desktop-chromium'
  | 'manual-desktop-other'
  | 'manual-android'
  | 'manual-ios'
  | 'in-app-browser'
  | 'installed-open-app';

export type InstallGateAllowReason = 'standalone' | 'localhost';

export interface InstallGateDecisionInput {
  /** The page is running inside an installed app surface (see detectInstalledDisplayContext). */
  standalone: boolean;
  isLocalhost: boolean;
  /** ?forceInstallGate=1 -- opts localhost back into the gate for testing. */
  forceGate: boolean;
  userAgentClass: InstallUserAgentClass;
  /** A beforeinstallprompt event has been captured and not yet consumed. */
  hasDeferredPrompt: boolean;
  /**
   * Legacy `mazer-install-surface-dismissed-v1` flag. Accepted so callers can
   * pass what they read, but it NEVER affects the decision: a cancelled
   * native prompt must not unlock the browser tab.
   */
  dismissedFlag?: boolean;
  /** `appinstalled` fired in this tab (the tab itself is still not the app). */
  appInstalled?: boolean;
}

export type InstallGateDecision =
  | { blocked: true; mode: InstallGateMode; copyKey: InstallGateMode; reason: null }
  | { blocked: false; mode: 'open'; copyKey: null; reason: InstallGateAllowReason };

export const resolveInstallGateDecision = (input: InstallGateDecisionInput): InstallGateDecision => {
  if (input.standalone) {
    return { blocked: false, mode: 'open', copyKey: null, reason: 'standalone' };
  }

  if (input.isLocalhost && !input.forceGate) {
    return { blocked: false, mode: 'open', copyKey: null, reason: 'localhost' };
  }

  const mode = resolveBlockedInstallGateMode(input);
  return { blocked: true, mode, copyKey: mode, reason: null };
};

const resolveBlockedInstallGateMode = (input: InstallGateDecisionInput): InstallGateMode => {
  if (input.appInstalled === true) {
    return 'installed-open-app';
  }

  // In-app browsers (iOS and Android) cannot install at all, so even a stray
  // deferred prompt must not turn this into an install card.
  if (input.userAgentClass === 'ios-in-app' || input.userAgentClass === 'android-in-app') {
    return 'in-app-browser';
  }

  if (input.hasDeferredPrompt) {
    return 'prompt-available';
  }

  switch (input.userAgentClass) {
    case 'ios':
      return 'manual-ios';
    case 'android':
      return 'manual-android';
    case 'desktop-chromium':
      return 'manual-desktop-chromium';
    default:
      return 'manual-desktop-other';
  }
};

export interface InstallUserAgentFacts {
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
}

// Ported from the Fitness app's in-app-browser detection: sandboxed WebViews
// that do not expose "Add to Home Screen".
const IN_APP_BROWSER_PATTERN =
  /(TikTok|musical_ly|Instagram|FBAN|FBAV|Messenger|Twitter|Line|LinkedInApp|Pinterest|Snapchat|Discord|WhatsApp|Telegram|MicroMessenger|LinkMe|Linktree|Beacons)/i;

export const detectIOSFromUserAgentFacts = (facts: InstallUserAgentFacts): boolean => {
  const userAgent = (facts.userAgent ?? '').toLowerCase();
  const platform = (facts.platform ?? '').toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent)
    || (platform.includes('mac') && (facts.maxTouchPoints ?? 0) > 1);
};

export const isIOSInAppBrowserUserAgent = (facts: InstallUserAgentFacts): boolean => (
  detectIOSFromUserAgentFacts(facts) && IN_APP_BROWSER_PATTERN.test(facts.userAgent ?? '')
);

// Android in-app browsers / WebViews: Instagram, Facebook (FB_IAB), TikTok, Messenger, ... and the generic
// WebView token ("; wv)"). They are not Chrome and expose no install path.
const ANDROID_IN_APP_BROWSER_PATTERN =
  /(Instagram|FBAN|FBAV|FB_IAB|Messenger|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest|Discord|WhatsApp|Telegram|MicroMessenger|Line\/|;\s*wv\))/i;

export const isAndroidInAppBrowserUserAgent = (facts: InstallUserAgentFacts): boolean => (
  /android/i.test(facts.userAgent ?? '') && ANDROID_IN_APP_BROWSER_PATTERN.test(facts.userAgent ?? '')
);

export const classifyInstallUserAgent = (facts: InstallUserAgentFacts | undefined): InstallUserAgentClass => {
  if (!facts) {
    return 'desktop-other';
  }

  if (detectIOSFromUserAgentFacts(facts)) {
    return isIOSInAppBrowserUserAgent(facts) ? 'ios-in-app' : 'ios';
  }

  const userAgent = facts.userAgent ?? '';
  if (/android/i.test(userAgent)) {
    return isAndroidInAppBrowserUserAgent(facts) ? 'android-in-app' : 'android';
  }

  if (/firefox\//i.test(userAgent)) {
    return 'desktop-firefox';
  }

  // Edge, Opera, Brave, Chrome and Chromium all carry a Chrome/ or Chromium/
  // token (and Edg/ or OPR/); Safari's own UA only has Version/ + Safari/.
  if (/(Chrome|Chromium|CriOS|Edg|OPR)\//i.test(userAgent)) {
    return 'desktop-chromium';
  }

  if (/Version\/[\d.]+.*Safari\//i.test(userAgent)) {
    return 'desktop-safari';
  }

  return 'desktop-other';
};

export interface InstalledDisplayContextFacts {
  /** navigator.standalone (iOS home-screen apps). */
  navigatorStandalone?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Display modes that mean "running as an installed app" (a tab never reports any of these). Plain
 * `display-mode: fullscreen` is intentionally NOT included: it also matches a
 * normal browser tab put into F11 / Fullscreen-API fullscreen, which would
 * let anyone unlock the gate with one key press. Mazer's manifest asks for
 * standalone (display_override: standalone, minimal-ui), so an installed
 * Mazer never reports bare fullscreen.
 */
export const INSTALLED_DISPLAY_MODE_QUERIES: readonly string[] = [
  '(display-mode: standalone)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)'
];

export const detectInstalledDisplayContext = (facts: InstalledDisplayContextFacts | undefined): boolean => {
  if (!facts) {
    return false;
  }

  if (facts.navigatorStandalone === true) {
    return true;
  }

  // NOT a signal: an `android-app://` referrer. Other Android apps (the Google app, mail clients, ...) set it on
  // ordinary Chrome tabs they open, so it would unlock the gate for a browser visit. A WebAPK / Trusted Web
  // Activity reports `display-mode: standalone`, which is the real signal and is checked below.

  for (const query of INSTALLED_DISPLAY_MODE_QUERIES) {
    try {
      if (facts.matchMedia?.(query).matches === true) {
        return true;
      }
    } catch {
      // A browser that rejects the query simply is not that display mode.
    }
  }

  return false;
};
