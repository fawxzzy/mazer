export interface MazerServiceWorkerRegistration {
  update: () => Promise<unknown> | unknown;
}

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
