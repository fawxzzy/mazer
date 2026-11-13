export interface MazerServiceWorkerRegistration {
  update: () => Promise<unknown> | unknown;
}

export interface MazerServiceWorkerControllerReloadRuntime {
  /**
   * Whether a service worker already controlled this page when it loaded. Read it before registering.
   * False on the very first visit (no worker yet), on a hard reload that bypassed the worker, and when
   * service workers are unavailable.
   */
  controlledAtBoot: boolean;
  addControllerChangeListener: (listener: () => void) => void;
  reload: () => void;
  /**
   * First install only (a page that was not controlled at boot): runs once when the new worker claims the page, in
   * place of the reload. Boot art is runtime-cached only for requests a worker sees (vite.config.ts), and this page
   * loaded it before the worker existed, so without this the offline cache would stay empty until a second launch.
   */
  warmBootArt?: () => void;
}

/** Same-origin paths the worker's boot-art runtime cache covers; keep in step with vite.config.ts (a test pins it). */
export const MAZER_BOOT_ART_PATH_PREFIXES = ['/assets/hud/', '/fonts/mazer-tile-font/'] as const;

/** Picks the boot-art URLs this page already loaded out of its resource-timing entry names. */
export const selectMazerBootArtUrls = (entryNames: readonly string[], origin: string): string[] => {
  const urls: string[] = [];
  for (const name of entryNames) {
    let url: URL;
    try {
      url = new URL(name);
    } catch {
      continue;
    }
    if (url.origin === origin && MAZER_BOOT_ART_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      urls.push(url.href);
    }
  }
  return [...new Set(urls)];
};

// skipWaiting+clientsClaim (see vite.config.ts) let a newly-fetched service
// worker take control of already-open clients immediately, but that alone
// does not refresh the JS/HTML those clients already have in memory -- an
// installed home-screen PWA that's never force-quit can sit on a stale
// build indefinitely otherwise, since it's reopened rather than freshly
// navigated to. Reloading once when the controller changes is what actually
// gets a long-lived installed session onto the new build.
//
// MAZER-PERF-010: only a page that was ALREADY controlled can be stale. On the very first visit the page was
// fetched from the network a moment ago, so it is the newest build; the first install claiming it used to
// reload it anyway, a second boot splash about one precache download (1.5 to 7.6 s on production) after the
// first menu, which made a tap on a menu that had been showing for seconds land on the splash.
export const installMazerServiceWorkerControllerReload = (
  runtime: MazerServiceWorkerControllerReloadRuntime
): boolean => {
  // A page that was not controlled at boot sees its FIRST controllerchange when the first worker claims it: that is
  // an install, not an update, so it warms the boot-art cache instead of reloading. Any later controllerchange on
  // that page (a deploy while the tab stays open) is a real update and reloads once, like a page that started
  // controlled.
  let claimedByFirstInstall = !runtime.controlledAtBoot;
  let reloaded = false;
  runtime.addControllerChangeListener(() => {
    if (claimedByFirstInstall) {
      claimedByFirstInstall = false;
      runtime.warmBootArt?.();
      return;
    }
    if (reloaded) {
      return;
    }
    reloaded = true;
    runtime.reload();
  });
  return runtime.controlledAtBoot;
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
