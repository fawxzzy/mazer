import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  installMazerProductionServiceWorker,
  installMazerServiceWorkerControllerReload,
  selectMazerBootArtUrls,
  MAZER_BOOT_ART_PATH_PREFIXES,
  type MazerServiceWorkerLifecycleRuntime
} from '../../src/boot/serviceWorkerLifecycle';

const createRuntime = (
  overrides: Partial<MazerServiceWorkerLifecycleRuntime> = {}
): {
  runtime: MazerServiceWorkerLifecycleRuntime;
  loadListeners: Array<() => void>;
  update: ReturnType<typeof vi.fn>;
} => {
  const loadListeners: Array<() => void> = [];
  const update = vi.fn(async () => undefined);
  const runtime: MazerServiceWorkerLifecycleRuntime = {
    hostname: 'mazer.fawxzzy.com',
    readyState: 'loading',
    addLoadListener: (listener) => loadListeners.push(listener),
    register: vi.fn(async () => ({ update })),
    ...overrides
  };

  return { runtime, loadListeners, update };
};

describe('production service worker lifecycle', () => {
  test('keeps update-password inside the app-shell navigation fallback for installed PWAs', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const vercelConfig = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8');

    expect(viteConfig).toContain("filename: 'app-sw.js'");
    expect(viteConfig).toContain('navigateFallbackDenylist: [/^\\/__/, /^\\/@vite\\//, /[?&](?:code|state|error|error_description)=/]');
    expect(viteConfig).not.toMatch(/navigateFallbackDenylist:[^\n]*update-password/);
    expect(vercelConfig).toContain('"source": "/update-password"');
    expect(vercelConfig).toContain('"destination": "/index.html"');
  });

  test('keeps OAuth callback navigations and token exchange network-only', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("['code', 'state', 'error', 'error_description'].some((key) => url.searchParams.has(key))");
    expect(viteConfig).toContain("url.pathname === '/auth/v1/oauth/token'");
    expect(viteConfig.match(/handler: 'NetworkOnly'/g)).toHaveLength(2);
  });

  test.each(['localhost', '127.0.0.1', '::1'])(
    'never registers on local development host %s',
    (hostname) => {
      const { runtime, loadListeners } = createRuntime({ hostname });

      expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(false);
      expect(loadListeners).toHaveLength(0);
      expect(runtime.register).not.toHaveBeenCalled();
    }
  );

  test('skips registration when service workers are unsupported', () => {
    const { runtime, loadListeners } = createRuntime({ register: null });

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(false);
    expect(loadListeners).toHaveLength(0);
  });

  test('defers registration until load while the document is still loading', async () => {
    const { runtime, loadListeners, update } = createRuntime();

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(true);
    expect(loadListeners).toHaveLength(1);
    expect(runtime.register).not.toHaveBeenCalled();

    loadListeners[0]();
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/app-sw.js'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  });

  test('registers immediately when asynchronous boot finishes after page load', async () => {
    const { runtime, loadListeners, update } = createRuntime({
      readyState: 'complete'
    });

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(true);
    expect(loadListeners).toHaveLength(0);
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/app-sw.js'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  });

  test('starts registration only once if a load callback is replayed', async () => {
    const { runtime, loadListeners } = createRuntime();

    installMazerProductionServiceWorker(runtime, vi.fn());
    loadListeners[0]();
    loadListeners[0]();

    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledOnce());
  });

  test('keeps the active session intact while checking for an update', async () => {
    const { runtime, update } = createRuntime({ readyState: 'complete' });

    installMazerProductionServiceWorker(runtime, vi.fn());

    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(runtime).not.toHaveProperty('reload');
    expect(runtime).not.toHaveProperty('addControllerChangeListener');
  });

  test('reports a safe registration failure without throwing from boot', async () => {
    const onError = vi.fn();
    const { runtime } = createRuntime({
      readyState: 'complete',
      register: vi.fn(async () => {
        throw new Error('registration unavailable');
      })
    });

    installMazerProductionServiceWorker(runtime, onError);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('registration unavailable'));
    expect(runtime).not.toHaveProperty('reload');
  });
});

describe('service worker controller reload', () => {
  test('reloads once when a new service worker takes control', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();

    installMazerServiceWorkerControllerReload({
      controlledAtBoot: true,
      addControllerChangeListener: (listener) => listeners.push(listener),
      reload
    });

    expect(listeners).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();

    listeners[0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('never reloads more than once even if the controller changes again', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();

    installMazerServiceWorkerControllerReload({
      controlledAtBoot: true,
      addControllerChangeListener: (listener) => listeners.push(listener),
      reload
    });

    listeners[0]();
    listeners[0]();
    listeners[0]();

    expect(reload).toHaveBeenCalledOnce();
  });

  test('MAZER-PERF-010: the first install claiming a never-controlled page does not reload it', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();
    const warmBootArt = vi.fn();

    installMazerServiceWorkerControllerReload({
      controlledAtBoot: false,
      addControllerChangeListener: (listener) => listeners.push(listener),
      reload,
      warmBootArt
    });
    listeners[0]();

    expect(reload).not.toHaveBeenCalled();
    expect(warmBootArt).toHaveBeenCalledOnce();
  });

  test('MAZER-PERF-010: a later update still reloads a page that started uncontrolled, once', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();
    const warmBootArt = vi.fn();

    installMazerServiceWorkerControllerReload({
      controlledAtBoot: false,
      addControllerChangeListener: (listener) => listeners.push(listener),
      reload,
      warmBootArt
    });
    listeners[0](); // first install claims the page
    listeners[0](); // a deploy while the tab stays open
    listeners[0]();

    expect(warmBootArt).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('MAZER-PERF-010: an already-controlled page still reloads once onto an update', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();

    expect(installMazerServiceWorkerControllerReload({
      controlledAtBoot: true,
      addControllerChangeListener: (listener) => listeners.push(listener),
      reload
    })).toBe(true);
    listeners[0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('MAZER-PERF-010: boot snapshots the controller before it registers the worker', () => {
    const main = readFileSync(resolve(__dirname, '../../src/boot/main.ts'), 'utf8');
    const snapshot = main.indexOf('controlledAtBoot: navigator.serviceWorker.controller !== null');
    expect(snapshot).toBeGreaterThan(-1);
    // The reload runtime is built inside registerProductionServiceWorker, right after the (async) register call is
    // started; the claim can only happen later, so the snapshot still describes the page as it loaded.
    expect(main.indexOf('installMazerProductionServiceWorker({')).toBeLessThan(snapshot);
  });

  test('selects only the same-origin boot art the page already loaded', () => {
    const origin = 'https://mazer.fawxzzy.com';
    expect(selectMazerBootArtUrls([
      `${origin}/assets/hud/hud-profile.webp`,
      `${origin}/assets/hud/hud-profile.webp`,
      `${origin}/fonts/mazer-tile-font/mazer-font-atlas.json`,
      `${origin}/assets/main-abc.js`,
      'https://example.com/assets/hud/other.webp',
      'not a url'
    ], origin)).toEqual([
      `${origin}/assets/hud/hud-profile.webp`,
      `${origin}/fonts/mazer-tile-font/mazer-font-atlas.json`
    ]);
  });

  test('the boot-art prefixes match the worker runtime cache in vite.config.ts', () => {
    const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    for (const prefix of MAZER_BOOT_ART_PATH_PREFIXES) {
      expect(config).toContain(`url.pathname.startsWith('${prefix}')`);
    }
  });
});
