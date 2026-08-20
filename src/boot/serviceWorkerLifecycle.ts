export interface MazerServiceWorkerRegistration {
  update: () => Promise<unknown> | unknown;
}

export interface MazerServiceWorkerControllerReloadRuntime {
  addControllerChangeListener: (listener: () => void) => void;
  reload: () => void;
}

// skipWaiting+clientsClaim (see vite.config.ts) let a newly-fetched service
// worker take control of already-open clients immediately, but that alone
// does not refresh the JS/HTML those clients already have in memory -- an
// installed home-screen PWA that's never force-quit can sit on a stale
// build indefinitely otherwise, since it's reopened rather than freshly
// navigated to. Reloading once when the controller changes is what actually
// gets a long-lived installed session onto the new build.
export const installMazerServiceWorkerControllerReload = (
  runtime: MazerServiceWorkerControllerReloadRuntime
): void => {
  let reloaded = false;
  runtime.addControllerChangeListener(() => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    runtime.reload();
  });
};

export interface MazerServiceWorkerLifecycleRuntime {
  hostname: string;
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  register: ((scriptUrl: string) => Promise<MazerServiceWorkerRegistration>) | null;
}

const isLocalhostHostname = (hostname: string): boolean =>
  ['localhost', '127.0.0.1', '::1'].includes(hostname);

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

    void runtime.register?.('/app-sw.js')
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
