import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installMazerServiceWorkerControllerReload } from '../../src/boot/serviceWorkerLifecycle';

// MAZER-PWA-006: deferred update (reload only when hidden and idle) and the trimmed precache.
const setup = (controlledAtBoot = true) => {
  let controllerChange: () => void = () => undefined;
  const hiddenListeners: Array<() => void> = [];
  const state = { hidden: false, idle: false };
  const reload = vi.fn();
  installMazerServiceWorkerControllerReload({
    controlledAtBoot,
    addControllerChangeListener: (listener) => { controllerChange = listener; },
    reload,
    deferReload: {
      isHidden: () => state.hidden,
      isSafeToReload: () => state.idle,
      addHiddenListener: (listener) => hiddenListeners.push(listener)
    }
  });
  const fireVisibility = (): void => hiddenListeners.forEach((listener) => listener());
  return { controllerChange: () => controllerChange(), fireVisibility, state, reload, hiddenListeners };
};

describe('deferred service worker update (MAZER-PWA-006)', () => {
  test('does not reload a visible page when an update claims it', () => {
    const { controllerChange, reload, state } = setup();
    state.idle = true;
    controllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  test('does not reload a hidden page while a run is in progress, then does once idle and hidden', () => {
    const { controllerChange, fireVisibility, reload, state } = setup();
    state.hidden = true;
    controllerChange();
    expect(reload).not.toHaveBeenCalled();
    state.idle = true;
    fireVisibility();
    expect(reload).toHaveBeenCalledOnce();
    fireVisibility();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('reloads immediately when already hidden and idle, and only once for repeated controller changes', () => {
    const { controllerChange, reload, state, hiddenListeners } = setup();
    state.hidden = true;
    state.idle = true;
    controllerChange();
    controllerChange();
    expect(reload).toHaveBeenCalledOnce();
    expect(hiddenListeners).toHaveLength(1);
  });

  test('first install still never reloads', () => {
    const { controllerChange, reload, state } = setup(false);
    state.hidden = true;
    state.idle = true;
    controllerChange();
    expect(reload).not.toHaveBeenCalled();
  });

  test('main.ts wires the idle check to MenuScene mode and defaults to busy when unknown', () => {
    const main = readFileSync(resolve(__dirname, '../../src/boot/main.ts'), 'utf8');
    expect(main).toContain("scene?.mode === 'menu'");
    expect(main).toContain("document.visibilityState === 'hidden'");
  });
});

describe('trimmed precache (MAZER-PWA-006)', () => {
  const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');

  test('keeps dev/QA pages, their chunks and the legacy cleanup worker out of the precache', () => {
    expect(config).toContain("globIgnores: [");
    for (const name of ['proof-surfaces', 'visual-proof', 'watch-pass-preview', 'watch-pass-paywall', 'watch-pass-setup', 'planet3d', 'future-phaser']) {
      expect(config).toContain(name);
    }
    expect(config).toContain("'sw.js'");
  });

  test('every dev-only page in the build input is ignored by the precache', () => {
    const inputs = [...config.matchAll(/^\s{8}(?:'([\w-]+)'|(\w+)): resolve/gm)].map((m) => m[1] ?? m[2]).filter((n) => n !== 'main');
    const ignoreBlock = /globIgnores: \[([\s\S]*?)\]/.exec(config)?.[1] ?? '';
    for (const name of inputs) {
      expect(ignoreBlock, name).toContain(name);
    }
  });
});

describe('app icon out of the precache (MAZER-PERF-011)', () => {
  const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
  const includeAssets = config.slice(config.indexOf('includeAssets: ['), config.indexOf(']', config.indexOf('includeAssets: [')));

  test('the 934 KB 1024 px icon is not precached, the install icons still are', () => {
    expect(includeAssets).not.toContain('icons/mazer-app-icon.png');
    for (const icon of ['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png']) {
      expect(includeAssets).toContain(icon);
    }
  });

  test('the file is still served from public/ and the manifest still points at it', () => {
    expect(readFileSync(resolve(__dirname, '../../public/manifest.webmanifest'), 'utf8')).toContain('/icons/mazer-app-icon.png?v=');
    expect(readFileSync(resolve(__dirname, '../../public/icons/mazer-app-icon.png')).length).toBeGreaterThan(0);
  });
});
