import Phaser from 'phaser';
import '../styles/base.css';
import {
  getLegacyAuthClient,
  isLegacyPasswordRecoveryRuntimeLocation
} from '../legacy-runtime/legacyAuth';
import {
  buildMazerAccountPortalUrl,
  buildMazerLegalUrl,
  captureAndScrubMazerOAuthCallback,
  consumeMazerOAuthCallback,
  isMazerOAuthCallbackRequest,
  resolveMazerLegalRoute,
  type MazerOAuthClient
} from '../legacy-runtime/legacyAccountPortal';
import { bootstrapLegacyRemoteAccountStateForRoute } from '../legacy-runtime/legacyRemoteProgression';
import { installMazerAccessibilitySurface } from './accessibilitySurface';
import { runBoundedAccountBootstrap } from './bootAccountBootstrap';
import { MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS } from './bootSplash';
import { waitForMazerUiFonts } from './fontReadiness';
import { attachMazerGameToWindow, markMazerBootStatus } from './bootStatus';
import { runMazerInstallGate, shouldRunMazerInstallGateForBoot } from './installGate';
import { runMazerSignedOutHandoffAtBoot } from './signedOutHandoffBoot';
import { initializeInstallSurface } from './installSurface';
import { createMazerPhaserConfig } from './phaserConfig';
import {
  installMazerProductionServiceWorker,
  installMazerServiceWorkerControllerReload,
  selectMazerBootArtUrls
} from './serviceWorkerLifecycle';
import { installMazerViewportGeometry, syncMazerGameToViewport } from './viewportGeometry';

const LOCALHOST_SW_RESET_KEY = 'mazer:localhost-sw-reset:v1';

const isLocalhostRuntime = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const resetLocalhostServiceWorkers = async (): Promise<boolean> => {
  if (!isLocalhostRuntime() || !('serviceWorker' in navigator)) {
    return false;
  }

  let changed = false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    const scopeUrl = new URL(registration.scope);
    if (scopeUrl.origin !== window.location.origin) {
      continue;
    }

    changed = (await registration.unregister()) || changed;
  }

  if (!('caches' in window)) {
    return changed;
  }

  const cacheKeys = await window.caches.keys();
  for (const cacheKey of cacheKeys) {
    if (!cacheKey.includes('mazer') && !cacheKey.includes('workbox-precache')) {
      continue;
    }

    changed = (await window.caches.delete(cacheKey)) || changed;
  }

  return changed;
};

const registerProductionServiceWorker = (): void => {
  installMazerProductionServiceWorker({
    hostname: window.location.hostname,
    readyState: document.readyState,
    addLoadListener: (listener) => window.addEventListener('load', listener, { once: true }),
    register: 'serviceWorker' in navigator
      ? async (scriptUrl) => navigator.serviceWorker.register(scriptUrl)
      : null
  }, (message) => {
    markMazerBootStatus('service-worker-error', message);
  });

  if (!isLocalhostRuntime() && 'serviceWorker' in navigator) {
    installMazerServiceWorkerControllerReload({
      controlledAtBoot: navigator.serviceWorker.controller !== null,
      addControllerChangeListener: (listener) => navigator.serviceWorker.addEventListener('controllerchange', listener),
      reload: () => window.location.reload(),
      warmBootArt: () => {
        // First install: the worker now controls this page, so re-requesting the boot art through it (the browser's
        // HTTP cache answers the network part) fills the offline runtime cache without reloading the page.
        const names = performance.getEntriesByType('resource').map((entry) => entry.name);
        for (const url of selectMazerBootArtUrls(names, window.location.origin)) {
          void fetch(url).catch(() => undefined);
        }
      }
    });
  }
};

const boot = async (): Promise<void> => {
  const passwordRecoveryRouteRequested = isLegacyPasswordRecoveryRuntimeLocation(window.location);
  const oauthCallbackRequested = !passwordRecoveryRouteRequested
    && isMazerOAuthCallbackRequest(window.location);
  const oauthCallback = oauthCallbackRequested
    ? captureAndScrubMazerOAuthCallback(window.location, window.history)
    : null;
  markMazerBootStatus('boot-start');
  // Start the UI font fetch immediately (it is also <link rel=preload>ed in
  // index.html) so it overlaps with the install gate / account bootstrap;
  // only the Phaser.Game creation below waits on it, and only up to a bound.
  const uiFontReady = waitForMazerUiFonts();
  const legalRoute = resolveMazerLegalRoute(window.location.pathname);
  let game: Phaser.Game | null = null;

  if (legalRoute !== null) {
    window.location.replace(buildMazerLegalUrl(legalRoute));
    markMazerBootStatus('shared-account-redirect');
    return;
  }

  if (passwordRecoveryRouteRequested) {
    window.location.replace(buildMazerAccountPortalUrl('reset-password'));
    markMazerBootStatus('shared-account-redirect');
    return;
  }

  // Subscribe to beforeinstallprompt / appinstalled as early as boot allows so
  // the event is captured even when it fires before the gate is evaluated.
  initializeInstallSurface(window);
  const viewportGeometry = installMazerViewportGeometry();

  if (isLocalhostRuntime()) {
    const changed = await resetLocalhostServiceWorkers();
    const reloadAlreadyRequested = window.sessionStorage.getItem(LOCALHOST_SW_RESET_KEY) === '1';

    if (changed && !reloadAlreadyRequested) {
      markMazerBootStatus('reload-requested');
      window.sessionStorage.setItem(LOCALHOST_SW_RESET_KEY, '1');
      window.location.reload();
      return;
    }

    window.sessionStorage.removeItem(LOCALHOST_SW_RESET_KEY);
  }

  // MAZER-PWA-007: the install gate runs BEFORE anything else that Mazer does with the URL. In a browser tab
  // nothing in the query string or hash lifts it (no previewLevel, autoSignIn, authFixture or OAuth callback
  // exemption), and a callback that lands in a non-installed tab is NOT exchanged: the gate shows instead, so a
  // browser tab never ends up holding a Mazer session. Only local development (localhost, unless
  // ?forceInstallGate=1) and the legal / password-recovery routes (which redirected above) skip it. The gate
  // only resolves when the page itself is an installed display context; installed launches resolve at once.
  const forceInstallGate = new URLSearchParams(window.location.search).get('forceInstallGate') === '1';
  if (shouldRunMazerInstallGateForBoot({
    forceInstallGate,
    isLocalhostRuntime: isLocalhostRuntime(),
    legalRouteRequested: legalRoute !== null,
    passwordRecoveryRequested: passwordRecoveryRouteRequested
  })) {
    markMazerBootStatus('install-gate-checking');
    // The gate overlay replaces the splash; it is up for as long as this is a
    // browser tab (see installPolicy.ts), and only resolves when standalone.
    await runMazerInstallGate(document, {
      onBlocked: () => markMazerBootStatus('splash-removed')
    });
  }

  if (oauthCallback !== null) {
    // The only stage whose splash says "Signing you in": a callback token
    // exchange (bounded by MAZER_OAUTH_TOKEN_TIMEOUT_MS) is really running.
    markMazerBootStatus('oauth-exchange');
    await consumeMazerOAuthCallback(oauthCallback, async () => (
      await getLegacyAuthClient() as unknown as MazerOAuthClient | null
    ));
  }

  // MAZER-ACCT-040: a signed-out launch goes straight to the account host's sign-in
  // page, before Phaser exists. Signed-in, bypass and failure cases fall through.
  await runMazerSignedOutHandoffAtBoot(oauthCallbackRequested);

  // Bounded: a slow or failing remote account bootstrap must never keep the
  // player on a blank page. The game starts on cached / guest state instead.
  markMazerBootStatus('account-bootstrap');
  await runBoundedAccountBootstrap({
    bootstrap: () => bootstrapLegacyRemoteAccountStateForRoute(window.location.search),
    onFailure: (error) => {
      console.warn('[mazer] account bootstrap failed; starting on cached state', error);
    }
  });
  // Phaser rasterizes Text once, so the face must be ready before the first
  // Text exists. Bounded (MAZER_FONT_READY_TIMEOUT_MS): never throws, never hangs.
  await uiFontReady;
  markMazerBootStatus('game-creating');
  game = new Phaser.Game(createMazerPhaserConfig(viewportGeometry.getSnapshot().fullBleed));
  attachMazerGameToWindow(game);
  installMazerAccessibilitySurface(document, game.canvas);
  viewportGeometry.subscribe((geometry) => {
    if (game) {
      syncMazerGameToViewport(game, geometry);
    }
  });
  registerProductionServiceWorker();
  markMazerBootStatus('game-created');
  // Bounded: if MenuScene never reports in, the splash still comes off so the
  // canvas (or whatever it is showing) is never hidden indefinitely.
  window.setTimeout(() => {
    if (window.__MAZER_BOOT_STATUS__?.splashRemoved !== true) {
      markMazerBootStatus('splash-removed');
    }
  }, MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS);
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  markMazerBootStatus('error', message);
  throw error;
});
