import Phaser from 'phaser';
import '../styles/base.css';
import { bootstrapLegacyRemoteAccountState } from '../legacy-runtime/legacyRemoteProgression';
import { attachMazerGameToWindow, markMazerBootStatus } from './bootStatus';
import { installMazerPortraitLock, shouldBlockMazerLandscape } from './orientationLock';
import { createMazerPhaserConfig } from './phaserConfig';
import { installMazerViewportGeometry, syncMazerGameToViewport } from './viewportGeometry';

const LOCALHOST_SW_RESET_KEY = 'mazer:localhost-sw-reset:v1';
const PRODUCTION_SW_UPDATE_RELOAD_KEY = 'mazer:production-sw-update-reload-at:v1';
const PRODUCTION_SW_UPDATE_RELOAD_WINDOW_MS = 10_000;

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

const shouldReloadForProductionServiceWorkerUpdate = (nowMs: number): boolean => {
  const lastReloadAtMs = Number(window.sessionStorage.getItem(PRODUCTION_SW_UPDATE_RELOAD_KEY) ?? '0');
  return Number.isNaN(lastReloadAtMs) || nowMs - lastReloadAtMs > PRODUCTION_SW_UPDATE_RELOAD_WINDOW_MS;
};

const markProductionServiceWorkerUpdateReload = (nowMs: number): void => {
  window.sessionStorage.setItem(PRODUCTION_SW_UPDATE_RELOAD_KEY, String(nowMs));
};

const registerProductionServiceWorker = (): void => {
  if (isLocalhostRuntime() || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const nowMs = Date.now();
      if (!shouldReloadForProductionServiceWorkerUpdate(nowMs)) {
        return;
      }

      markProductionServiceWorkerUpdateReload(nowMs);
      window.location.reload();
    }, { once: true });

    void navigator.serviceWorker.register('/sw.js')
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        markMazerBootStatus('service-worker-error', error instanceof Error ? error.message : String(error));
      });
  }, { once: true });
};

const boot = async (): Promise<void> => {
  markMazerBootStatus('boot-start');
  let game: Phaser.Game | null = null;
  const syncLandscapeBlock = (blocked: boolean): void => {
    if (!game) {
      return;
    }

    if (blocked) {
      game.loop.sleep();
    } else {
      game.loop.wake();
    }
  };
  const viewportGeometry = installMazerViewportGeometry();
  installMazerPortraitLock(window, syncLandscapeBlock);

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

  await bootstrapLegacyRemoteAccountState();
  markMazerBootStatus('game-creating');
  game = new Phaser.Game(createMazerPhaserConfig(viewportGeometry.getSnapshot().content));
  attachMazerGameToWindow(game);
  viewportGeometry.subscribe((geometry) => {
    if (game) {
      syncMazerGameToViewport(game, geometry);
    }
  });
  syncLandscapeBlock(shouldBlockMazerLandscape(window));
  registerProductionServiceWorker();
  markMazerBootStatus('game-created');
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  markMazerBootStatus('error', message);
  throw error;
});
