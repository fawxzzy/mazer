/**
 * The standard way QA, CI and Playwright scripts open Mazer in production-like builds (MAZER-PWA-007).
 *
 * Since MAZER-PWA-007 the install gate is always on: in a non-installed browser tab on any host other than
 * localhost / 127.0.0.1 / ::1, NO query parameter (previewLevel, autoSignIn, authFixture, an OAuth callback, ...)
 * lifts it, and there is no build or runtime "skip the gate" switch. A script that needs the app therefore
 * emulates an INSTALLED app with the same real signals the app reads (src/boot/installPolicy.ts):
 *   - `matchMedia('(display-mode: standalone)').matches === true`
 *   - `navigator.standalone === true` (the iOS home-screen signal)
 * Both are set before any page script runs (context.addInitScript). Documentation:
 * docs/ops/MAZER-INSTALL-GATE-ALWAYS-ON-2026-11-14.md.
 *
 * Usage:
 *   import { emulateInstalledApp } from './lib/installed-app-emulation.mjs';
 *   const context = await browser.newContext({ ... });
 *   await emulateInstalledApp(context);
 *
 * Localhost dev servers do not need this (the gate does not run there unless ?forceInstallGate=1).
 */

/** Serializable init script: runs in the page before any app code. */
export function installedAppInitScript(options) {
  const modes = options && Array.isArray(options.displayModes) ? options.displayModes : ['standalone'];
  const matching = modes.map((mode) => `(display-mode: ${mode})`);
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    if (!matching.includes(query)) {
      return nativeMatchMedia(query);
    }
    return {
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => true,
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {}
    };
  };
  if (!options || options.navigatorStandalone !== false) {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
  }
}

/**
 * Emulates an installed app on a Playwright BrowserContext (preferred, covers every page and reload) or Page.
 * `displayModes` defaults to ['standalone']; `navigatorStandalone: false` leaves the iOS flag unset.
 */
export const emulateInstalledApp = async (contextOrPage, options = {}) => {
  await contextOrPage.addInitScript(installedAppInitScript, {
    displayModes: options.displayModes ?? ['standalone'],
    navigatorStandalone: options.navigatorStandalone !== false
  });
  return contextOrPage;
};

/** True for the hosts where the install gate does not run (local development). */
export const isLocalDevelopmentHost = (hostname) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
