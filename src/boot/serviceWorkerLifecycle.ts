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
   *
   * Staleness cap (silent update policy, Zac 2026-11-14): a page that stays VISIBLE with the update pending for more
   * than 24 h (`MAZER_UPDATE_STALENESS_CAP_MS`) applies it at the next safe moment even while visible, still never
   * mid-run (`decideMazerDeferredUpdateReload`). `addHiddenListener` gets every visibility change, so returning to a
   * stale page also applies it; a re-check timer covers a page that just stays open on the menu.
   */
  deferReload?: {
    isHidden: () => boolean;
    isSafeToReload: () => boolean;
    addHiddenListener: (listener: () => void) => void;
    /** Wall clock in ms (default `Date.now`); wall time keeps counting while the device sleeps. */
    now?: () => number;
    /** Runs `check` once after `ms` (default: an unref'd `setTimeout`). */
    setRecheckTimer?: (check: () => void, ms: number) => void;
  };
}

/** Silent update policy: the longest a visible page may keep an installed update waiting before a safe moment applies it. */
export const MAZER_UPDATE_STALENESS_CAP_MS = 24 * 60 * 60 * 1000;

/** After the cap, how often a visible page re-checks for a safe moment (no run in progress). */
export const MAZER_UPDATE_RECHECK_MS = 60 * 1000;

export type MazerDeferredUpdateDecision = 'reload' | 'wait';

/**
 * The boundary decision for a pending update. Never mid-run (`safeToReload` false always waits, hidden or not).
 * Otherwise a hidden page reloads at once (PWA-006), and a visible one only once the update has waited longer than
 * the staleness cap.
 */
export const decideMazerDeferredUpdateReload = (input: {
  hidden: boolean;
  safeToReload: boolean;
  pendingSinceMs: number;
  nowMs: number;
  capMs?: number;
}): MazerDeferredUpdateDecision => {
  if (!input.safeToReload) {
    return 'wait';
  }
  if (input.hidden) {
    return 'reload';
  }
  return input.nowMs - input.pendingSinceMs > (input.capMs ?? MAZER_UPDATE_STALENESS_CAP_MS) ? 'reload' : 'wait';
};

const setUnrefTimeout = (check: () => void, ms: number): void => {
  const handle = setTimeout(check, ms) as unknown as { unref?: () => void };
  handle.unref?.();
};

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
    const now = defer.now ?? Date.now;
    const setRecheckTimer = defer.setRecheckTimer ?? setUnrefTimeout;
    const pendingSinceMs = now();
    const tryReload = (): void => {
      if (reloaded) {
        return;
      }
      const decision = decideMazerDeferredUpdateReload({
        hidden: defer.isHidden(),
        safeToReload: defer.isSafeToReload(),
        pendingSinceMs,
        nowMs: now()
      });
      if (decision === 'wait') {
        return;
      }
      reloaded = true;
      runtime.reload();
    };
    const recheck = (): void => {
      tryReload();
      if (!reloaded) {
        setRecheckTimer(recheck, MAZER_UPDATE_RECHECK_MS);
      }
    };
    defer.addHiddenListener(tryReload);
    tryReload();
    if (!reloaded) {
      // Timers can run late (throttled while hidden, paused in sleep); the visibility listener and the wall clock
      // cover that, so a late first check only delays a visible page that never leaves the menu.
      setRecheckTimer(recheck, MAZER_UPDATE_STALENESS_CAP_MS + 1);
    }
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
