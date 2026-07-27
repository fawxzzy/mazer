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
  controllerListeners: Array<() => void>;
  sessionValues: Map<string, string>;
  update: ReturnType<typeof vi.fn>;
} => {
  const loadListeners: Array<() => void> = [];
  const controllerListeners: Array<() => void> = [];
  const sessionValues = new Map<string, string>();
  const update = vi.fn(async () => undefined);
  const runtime: MazerServiceWorkerLifecycleRuntime = {
    hostname: 'fawxzzy-mazer.vercel.app',
    readyState: 'loading',
    addLoadListener: (listener) => loadListeners.push(listener),
    addControllerChangeListener: (listener) => controllerListeners.push(listener),
    register: vi.fn(async () => ({ update })),
    getSessionValue: (key) => sessionValues.get(key) ?? null,
    setSessionValue: (key, value) => sessionValues.set(key, value),
    now: () => 20_000,
    reload: vi.fn(),
    ...overrides
  };

  return { runtime, loadListeners, controllerListeners, sessionValues, update };
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
    const { runtime, loadListeners, controllerListeners, update } = createRuntime();

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(true);
    expect(loadListeners).toHaveLength(1);
    expect(runtime.register).not.toHaveBeenCalled();

    loadListeners[0]();
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/sw.js'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(controllerListeners).toHaveLength(1);
  });

  test('registers immediately when asynchronous boot finishes after page load', async () => {
    const { runtime, loadListeners, controllerListeners, update } = createRuntime({
      readyState: 'complete'
    });

    expect(installMazerProductionServiceWorker(runtime, vi.fn())).toBe(true);
    expect(loadListeners).toHaveLength(0);
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledWith('/sw.js'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(controllerListeners).toHaveLength(1);
  });

  test('starts registration only once if a load callback is replayed', async () => {
    const { runtime, loadListeners, controllerListeners } = createRuntime();

    installMazerProductionServiceWorker(runtime, vi.fn());
    loadListeners[0]();
    loadListeners[0]();

    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledOnce());
    expect(controllerListeners).toHaveLength(1);
  });

  test('reloads once for a new controller and suppresses a reload loop inside ten seconds', () => {
    const now = vi.fn(() => 20_000);
    const { runtime, controllerListeners, sessionValues } = createRuntime({
      readyState: 'complete',
      now
    });

    installMazerProductionServiceWorker(runtime, vi.fn());
    controllerListeners[0]();
    expect(runtime.reload).toHaveBeenCalledOnce();
    expect(sessionValues.get('mazer:production-sw-update-reload-at:v1')).toBe('20000');

    now.mockReturnValue(25_000);
    controllerListeners[0]();
    expect(runtime.reload).toHaveBeenCalledOnce();
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
    expect(runtime.reload).not.toHaveBeenCalled();
  });
});
