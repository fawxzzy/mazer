import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  reportServiceWorkerCacheWarning,
  resetServiceWorkerCacheWarningForTests,
  shouldWarnAboutServiceWorkerError,
  subscribeServiceWorkerCacheWarning,
  watchServiceWorkerInstallFailure
} from '../../src/boot/serviceWorkerCacheWarning';

const fakeWorker = () => {
  let listener: (() => void) | null = null;
  const worker = {
    state: 'installing',
    addEventListener: (_type: 'statechange', fn: () => void) => { listener = fn; },
    move(state: string) { worker.state = state; listener?.(); }
  };
  return worker;
};

describe('MAZER-UI-030 offline cache warning', () => {
  beforeEach(() => resetServiceWorkerCacheWarningForTests());

  test('delivers a friendly warning toast message to a live subscriber', () => {
    const received: unknown[] = [];
    subscribeServiceWorkerCacheWarning((message) => received.push(message));
    expect(reportServiceWorkerCacheWarning('precache 404')).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      copy: 'The offline cache could not update. The game can still run online.',
      id: 'boot.service-worker-error',
      tone: 'warning',
      technicalDetail: 'precache 404'
    });
  });

  test('holds a warning raised before the scene exists and replays it once', () => {
    reportServiceWorkerCacheWarning();
    const first = vi.fn();
    const second = vi.fn();
    subscribeServiceWorkerCacheWarning(first);
    subscribeServiceWorkerCacheWarning(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test('warns once per page load and stops after unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeServiceWorkerCacheWarning(listener);
    expect(reportServiceWorkerCacheWarning()).toBe(true);
    expect(reportServiceWorkerCacheWarning()).toBe(false);
    off();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('offline registration errors are expected and stay silent', () => {
    expect(shouldWarnAboutServiceWorkerError(false)).toBe(false);
    expect(shouldWarnAboutServiceWorkerError(true)).toBe(true);
    expect(shouldWarnAboutServiceWorkerError(undefined)).toBe(true);
  });

  test('an install that ends redundant without installing is a failure', () => {
    const onFailure = vi.fn();
    const worker = fakeWorker();
    watchServiceWorkerInstallFailure({ installing: worker }, onFailure);
    worker.move('redundant');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  test('a worker replaced after it installed is not a failure', () => {
    const onFailure = vi.fn();
    const worker = fakeWorker();
    watchServiceWorkerInstallFailure({ installing: worker }, onFailure);
    worker.move('installed');
    worker.move('redundant');
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('a worker found later through updatefound is watched too', () => {
    const onFailure = vi.fn();
    const worker = fakeWorker();
    const registration: { installing: ReturnType<typeof fakeWorker> | null; fire?: () => void; addEventListener: (t: 'updatefound', fn: () => void) => void } = {
      installing: null,
      addEventListener: (_t, fn) => { registration.fire = fn; }
    };
    watchServiceWorkerInstallFailure(registration, onFailure);
    registration.installing = worker;
    registration.fire?.();
    worker.move('redundant');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
