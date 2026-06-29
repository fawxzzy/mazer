import Phaser from 'phaser';
import '../styles/base.css';
import { phaserConfig } from './phaserConfig';

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

const boot = async (): Promise<void> => {
  if (isLocalhostRuntime()) {
    const changed = await resetLocalhostServiceWorkers();
    const reloadAlreadyRequested = window.sessionStorage.getItem(LOCALHOST_SW_RESET_KEY) === '1';

    if (changed && !reloadAlreadyRequested) {
      window.sessionStorage.setItem(LOCALHOST_SW_RESET_KEY, '1');
      window.location.reload();
      return;
    }

    window.sessionStorage.removeItem(LOCALHOST_SW_RESET_KEY);
  }

  void new Phaser.Game(phaserConfig);
};

void boot();
