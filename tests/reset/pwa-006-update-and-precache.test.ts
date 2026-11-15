import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decideMazerDeferredUpdateReload,
  installMazerServiceWorkerControllerReload,
  MAZER_UPDATE_RECHECK_MS,
  MAZER_UPDATE_STALENESS_CAP_MS
} from '../../src/boot/serviceWorkerLifecycle';

// MAZER-PWA-006: deferred update (reload only when hidden and idle) and the trimmed precache.
const setup = (controlledAtBoot = true) => {
  let controllerChange: () => void = () => undefined;
  const hiddenListeners: Array<() => void> = [];
  const state = { hidden: false, idle: false, nowMs: 1_000 };
  const timers: Array<{ check: () => void; ms: number }> = [];
  const reload = vi.fn();
  installMazerServiceWorkerControllerReload({
    controlledAtBoot,
    addControllerChangeListener: (listener) => { controllerChange = listener; },
    reload,
    deferReload: {
      isHidden: () => state.hidden,
      isSafeToReload: () => state.idle,
      addHiddenListener: (listener) => hiddenListeners.push(listener),
      now: () => state.nowMs,
      setRecheckTimer: (check, ms) => { timers.push({ check, ms }); }
    }
  });
  const fireVisibility = (): void => hiddenListeners.forEach((listener) => listener());
  /** Advances the clock to the next pending timer and runs it. */
  const runNextTimer = (): number => {
    const timer = timers.shift();
    if (!timer) {
      throw new Error('no timer pending');
    }
    state.nowMs += timer.ms;
    timer.check();
    return timer.ms;
  };
  return { controllerChange: () => controllerChange(), fireVisibility, runNextTimer, state, reload, hiddenListeners, timers };
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

  test('an update pending under 24 h never reloads a visible page, even idle on the menu', () => {
    const { controllerChange, fireVisibility, reload, state, timers } = setup();
    state.idle = true;
    controllerChange();
    state.nowMs += MAZER_UPDATE_STALENESS_CAP_MS - 1;
    fireVisibility();
    expect(reload).not.toHaveBeenCalled();
    expect(timers).toEqual([{ check: expect.any(Function), ms: MAZER_UPDATE_STALENESS_CAP_MS + 1 }]);
  });

  test('24 h cap: a page stuck visible applies the update at the first safe re-check, never mid-run', () => {
    const { controllerChange, runNextTimer, reload, state, timers } = setup();
    controllerChange();
    // The cap passes mid-run: keep waiting and re-check every minute.
    expect(runNextTimer()).toBe(MAZER_UPDATE_STALENESS_CAP_MS + 1);
    expect(reload).not.toHaveBeenCalled();
    expect(runNextTimer()).toBe(MAZER_UPDATE_RECHECK_MS);
    expect(reload).not.toHaveBeenCalled();
    // The run ends (menu, still visible): the next re-check applies it, once, and stops re-checking.
    state.idle = true;
    runNextTimer();
    expect(reload).toHaveBeenCalledOnce();
    expect(timers).toEqual([]);
  });

  test('24 h cap: returning to a stale page applies the update on the visibility change', () => {
    const { controllerChange, fireVisibility, reload, state } = setup();
    state.idle = true;
    controllerChange();
    state.nowMs += MAZER_UPDATE_STALENESS_CAP_MS + 60_000; // device slept; the timer has not run yet
    fireVisibility();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('main.ts wires the idle check to MenuScene mode and defaults to busy when unknown', () => {
    const main = readFileSync(resolve(__dirname, '../../src/boot/main.ts'), 'utf8');
    expect(main).toContain("scene?.mode === 'menu'");
    expect(main).toContain("document.visibilityState === 'hidden'");
  });
});

describe('the deferred update boundary decision (silent update policy)', () => {
  const at = (overrides: Partial<Parameters<typeof decideMazerDeferredUpdateReload>[0]>) => decideMazerDeferredUpdateReload({
    hidden: false,
    safeToReload: true,
    pendingSinceMs: 0,
    nowMs: 0,
    ...overrides
  });

  test.each([
    ['visible, idle, just pending', {}, 'wait'],
    ['visible, idle, exactly 24 h', { nowMs: MAZER_UPDATE_STALENESS_CAP_MS }, 'wait'],
    ['visible, idle, over 24 h', { nowMs: MAZER_UPDATE_STALENESS_CAP_MS + 1 }, 'reload'],
    ['visible, mid-run, over 24 h', { safeToReload: false, nowMs: MAZER_UPDATE_STALENESS_CAP_MS * 3 }, 'wait'],
    ['hidden, idle, just pending', { hidden: true }, 'reload'],
    ['hidden, mid-run, just pending', { hidden: true, safeToReload: false }, 'wait'],
    ['hidden, mid-run, over 24 h', { hidden: true, safeToReload: false, nowMs: MAZER_UPDATE_STALENESS_CAP_MS * 3 }, 'wait']
  ] as const)('%s: %s', (_label, overrides, expected) => {
    expect(at(overrides)).toBe(expected);
  });

  test('the cap is 24 h and a custom cap is honoured', () => {
    expect(MAZER_UPDATE_STALENESS_CAP_MS).toBe(86_400_000);
    expect(at({ capMs: 10, nowMs: 11 })).toBe('reload');
    expect(at({ capMs: 10, nowMs: 10 })).toBe('wait');
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
