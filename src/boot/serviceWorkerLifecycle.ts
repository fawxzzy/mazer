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
  /**
   * MAZER-PWA-006 deferred update. When present, an UPDATE (not the first install) does not reload a visible or
   * mid-run page: it waits until the page is hidden AND `isSafeToReload()` (no run in progress), because in-memory run
   * state is not restored after a reload. A page that never becomes safe keeps its session; the next launch loads
   * the new build from the already-updated precache. Absent: reload at once (the pre-PWA-006 behaviour).
   */
  deferReload?: {
    isHidden: () => boolean;
    isSafeToReload: () => boolean;
    addHiddenListener: (listener: () => void) => void;
  };
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
  let updatePending = false;
  runtime.addControllerChangeListener(() => {
    if (claimedByFirstInstall) {
      claimedByFirstInstall = false;
      runtime.warmBootArt?.();
      return;
    }
    if (reloaded || updatePending) {
      return;
    }
    const defer = runtime.deferReload;
    if (!defer) {
      reloaded = true;
      runtime.reload();
      return;
    }
    updatePending = true;
    const tryReload = (): void => {
      if (reloaded || !defer.isHidden() || !defer.isSafeToReload()) {
        return;
      }
      reloaded = true;
      runtime.reload();
    };
    defer.addHiddenListener(tryReload);
    tryReload();
  });
  return runtime.controlledAtBoot;
};

export interface MazerServiceWorkerLifecycleRuntime {
  hostname: string;
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  register: ((scriptUrl: string) => Promise<MazerServiceWorkerRegistration>) | null;
  /**
   * Update check on resume. A home-screen app is usually resumed from memory, not relaunched, so the one
   * `registration.update()` at boot can be the only check for days and the phone keeps an old build. When present,
   * each return to the foreground re-checks, at most once per MAZER_SW_RESUME_UPDATE_MIN_INTERVAL_MS. The new worker
   * then claims the page and the deferred reload (MAZER-PWA-006) applies it at the next idle hide.
   */
  resumeUpdate?: {
    isVisible: () => boolean;
    addVisibilityListener: (listener: () => void) => void;
    now: () => number;
  };
}

/** Minimum gap between resume-triggered update checks (one small no-cache fetch of the worker script). */
export const MAZER_SW_RESUME_UPDATE_MIN_INTERVAL_MS = 60_000;

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
      .then((registration) => {
        const resume = runtime.resumeUpdate;
        if (resume) {
          let lastCheck = resume.now();
          resume.addVisibilityListener(() => {
            if (!resume.isVisible() || resume.now() - lastCheck < MAZER_SW_RESUME_UPDATE_MIN_INTERVAL_MS) {
              return;
            }
            lastCheck = resume.now();
            // A failed resume check (offline, flaky network) is not the cache warning: the next resume retries.
            void Promise.resolve().then(() => registration.update()).catch(() => undefined);
          });
        }
        return registration;
      })
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
