const PRODUCTION_SW_UPDATE_RELOAD_KEY = 'mazer:production-sw-update-reload-at:v1';
const PRODUCTION_SW_UPDATE_RELOAD_WINDOW_MS = 10_000;

export interface MazerServiceWorkerRegistration {
  update: () => Promise<unknown> | unknown;
}

export interface MazerServiceWorkerLifecycleRuntime {
  hostname: string;
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  addControllerChangeListener: (listener: () => void) => void;
  register: ((scriptUrl: string) => Promise<MazerServiceWorkerRegistration>) | null;
  getSessionValue: (key: string) => string | null;
  setSessionValue: (key: string, value: string) => void;
  now: () => number;
  reload: () => void;
}

const isLocalhostHostname = (hostname: string): boolean =>
  ['localhost', '127.0.0.1', '::1'].includes(hostname);

const shouldReloadForUpdate = (
  runtime: MazerServiceWorkerLifecycleRuntime,
  nowMs: number
): boolean => {
  const lastReloadAtMs = Number(runtime.getSessionValue(PRODUCTION_SW_UPDATE_RELOAD_KEY) ?? '0');
  return Number.isNaN(lastReloadAtMs) || nowMs - lastReloadAtMs > PRODUCTION_SW_UPDATE_RELOAD_WINDOW_MS;
};

export const installMazerProductionServiceWorker = (
  runtime: MazerServiceWorkerLifecycleRuntime,
  onError: (message: string) => void
): boolean => {
  if (isLocalhostHostname(runtime.hostname) || runtime.register === null) {
    return false;
  }

  let registrationStarted = false;
  const startRegistration = (): void => {
    if (registrationStarted) {
      return;
    }
    registrationStarted = true;

    runtime.addControllerChangeListener(() => {
      const nowMs = runtime.now();
      if (!shouldReloadForUpdate(runtime, nowMs)) {
        return;
      }

      runtime.setSessionValue(PRODUCTION_SW_UPDATE_RELOAD_KEY, String(nowMs));
      runtime.reload();
    });

    void runtime.register?.('/sw.js')
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : String(error));
      });
  };

  if (runtime.readyState === 'complete') {
    startRegistration();
  } else {
    runtime.addLoadListener(startRegistration);
  }

  return true;
};
