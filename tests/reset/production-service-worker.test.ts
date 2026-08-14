import { describe, expect, test, vi } from 'vitest';
import {
  installMazerProductionServiceWorker,
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
    hostname: 'fawxzzy-mazer.vercel.app',
    readyState: 'loading',
    addLoadListener: (listener) => loadListeners.push(listener),
    register: vi.fn(async () => ({ update })),
    ...overrides
  };

  return { runtime, loadListeners, update };
};

describe('production service worker lifecycle', () => {
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
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/sw.js'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  });

  test('registers immediately when asynchronous boot finishes after page load', async () => {
    const { runtime, loadListeners, update } = createRuntime({
      readyState: 'complete'
    });

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(true);
    expect(loadListeners).toHaveLength(0);
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/sw.js'));
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
