import {
  classifyInstallUserAgent,
  detectInstalledDisplayContext,
  detectIOSFromUserAgentFacts,
  isIOSInAppBrowserUserAgent,
  type InstallUserAgentClass
} from './installPolicy';

/**
 * Legacy surface mode, kept stable for MenuScene's QA bridge / UI bridge:
 * - `hidden`: running as an installed app (standalone), or `appinstalled`
 *   fired in this tab (`installed` true, `standalone` false).
 * - `ios-open-in-browser`: iOS in-app browser.
 * - `available`: a deferred beforeinstallprompt can be replayed.
 * - `manual`: every other non-installed context (the install gate decides
 *   per-platform copy from `platform`; see installPolicy.ts).
 *
 * The browser-gate decision itself is NOT derived from `mode`; installGate.ts
 * feeds `standalone` / `installed` / `canPrompt` / `platform` into
 * resolveInstallGateDecision so a non-standalone tab is never "hidden".
 */
export interface InstallSurfaceState {
  mode: 'hidden' | 'ios-open-in-browser' | 'available' | 'manual';
  canPrompt: boolean;
  installed: boolean;
  standalone: boolean;
  platform: InstallUserAgentClass;
  instruction?: string;
}

export interface InstallSurfaceSnapshot {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  /** @deprecated Ignored. A dismissed/cancelled install prompt never unlocks the browser tab. */
  dismissed?: boolean;
  instruction?: string;
  platform?: InstallUserAgentClass;
  /**
   * iOS PWA installs literally cannot happen from inside an in-app browser
   * (TikTok, Instagram, etc. sandbox their WebView and don't expose "Add to
   * Home Screen"); they have to actually leave the in-app browser first.
   */
  isIOSInAppBrowser?: boolean;
}

export interface DeferredInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform?: string;
}

export interface DeferredInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<DeferredInstallPromptChoice>;
}

interface InstallSurfaceNavigatorLike {
  maxTouchPoints?: number;
  platform?: string;
  standalone?: boolean;
  userAgent?: string;
}

interface InstallSurfaceDocumentLike {
  referrer?: string;
}

interface InstallSurfaceWindowLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  document?: InstallSurfaceDocumentLike;
  localStorage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
  matchMedia?(query: string): Pick<MediaQueryList, 'matches'>;
  navigator?: InstallSurfaceNavigatorLike;
  removeEventListener?(type: string, listener: EventListenerOrEventListenerObject): void;
}

export type InstallPromptOutcome = DeferredInstallPromptChoice['outcome'] | 'unavailable';

const IOS_MANUAL_INSTALL_INSTRUCTION = 'Use Share > Add to Home Screen';
/**
 * Legacy "dismissed" preference key. It used to force the surface hidden and
 * is now IGNORED (never read, never written): a cancelled native prompt must
 * not unlock the browser tab. Exported only so tests can prove a stale value
 * left by an older build has no effect.
 */
export const INSTALL_SURFACE_LEGACY_DISMISSED_STORAGE_KEY = 'mazer-install-surface-dismissed-v1';

const idleInstallState = (): InstallSurfaceState => ({
  mode: 'hidden',
  canPrompt: false,
  installed: false,
  standalone: false,
  platform: 'desktop-other'
});

let installState: InstallSurfaceState = idleInstallState();
let deferredPrompt: DeferredInstallPromptEvent | undefined;
let installRuntimeWindow: InstallSurfaceWindowLike | undefined;
let initialized = false;
let installed = false;
let promptInFlight = false;

const subscribers = new Set<(state: InstallSurfaceState) => void>();

const isDeferredInstallPromptEvent = (event: Event): event is DeferredInstallPromptEvent => (
  typeof (event as Partial<DeferredInstallPromptEvent>).prompt === 'function'
);

const resolveGlobalWindow = (): InstallSurfaceWindowLike | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const resolveStandaloneState = (runtime: InstallSurfaceWindowLike | undefined): boolean => {
  if (!runtime) {
    return false;
  }

  const matchMedia = runtime.matchMedia;
  return detectInstalledDisplayContext({
    navigatorStandalone: runtime.navigator?.standalone,
    matchMedia: matchMedia ? (query) => matchMedia.call(runtime, query) : undefined,
    referrer: runtime.document?.referrer
  });
};

export const resolveManualInstallInstruction = (
  navigatorLike: InstallSurfaceNavigatorLike | undefined
): string | undefined => {
  if (!navigatorLike) {
    return undefined;
  }

  return detectIOSFromUserAgentFacts(navigatorLike) ? IOS_MANUAL_INSTALL_INSTRUCTION : undefined;
};

export const resolveIsIOSInAppBrowser = (
  navigatorLike: InstallSurfaceNavigatorLike | undefined
): boolean => {
  if (!navigatorLike) {
    return false;
  }

  return isIOSInAppBrowserUserAgent(navigatorLike);
};

export const resolveInstallSurfaceState = (snapshot: InstallSurfaceSnapshot): InstallSurfaceState => {
  const platform = snapshot.platform ?? 'desktop-other';

  if (snapshot.standalone || snapshot.installed) {
    return {
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: snapshot.standalone,
      platform
    };
  }

  if (snapshot.isIOSInAppBrowser) {
    return {
      mode: 'ios-open-in-browser',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform
    };
  }

  if (snapshot.canPrompt) {
    return {
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false,
      platform
    };
  }

  // Every other non-installed context is `manual`: there is no "nothing to
  // show" state for a browser tab any more (the old fail-open `hidden`).
  return {
    mode: 'manual',
    canPrompt: false,
    installed: false,
    standalone: false,
    platform,
    ...(snapshot.instruction ? { instruction: snapshot.instruction } : {})
  };
};

const publishInstallSurfaceState = (): InstallSurfaceState => {
  const standalone = resolveStandaloneState(installRuntimeWindow);
  const navigatorLike = installRuntimeWindow?.navigator;
  const platform = classifyInstallUserAgent(navigatorLike);
  installState = resolveInstallSurfaceState({
    standalone,
    installed: installed || standalone,
    canPrompt: !standalone && !installed && deferredPrompt !== undefined,
    instruction: standalone || installed ? undefined : resolveManualInstallInstruction(navigatorLike),
    isIOSInAppBrowser: standalone || installed ? false : resolveIsIOSInAppBrowser(navigatorLike),
    platform
  });

  for (const subscriber of subscribers) {
    subscriber(installState);
  }

  return installState;
};

const handleBeforeInstallPrompt = (event: Event): void => {
  if (!isDeferredInstallPromptEvent(event)) {
    return;
  }

  try {
    event.preventDefault();
  } catch {
    // no-op
  }

  deferredPrompt = event;
  publishInstallSurfaceState();
};

const handleAppInstalled = (): void => {
  installed = true;
  deferredPrompt = undefined;
  publishInstallSurfaceState();
};

export const initializeInstallSurface = (
  runtime: InstallSurfaceWindowLike | undefined = resolveGlobalWindow()
): InstallSurfaceState => {
  if (!runtime) {
    return installState;
  }

  if (initialized) {
    return installState;
  }

  installRuntimeWindow = runtime;
  initialized = true;
  installed = resolveStandaloneState(runtime);
  runtime.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
  runtime.addEventListener('appinstalled', handleAppInstalled as EventListener);

  return publishInstallSurfaceState();
};

export const getInstallSurfaceState = (): InstallSurfaceState => installState;

export const subscribeInstallSurface = (
  listener: (state: InstallSurfaceState) => void
): (() => void) => {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
};

/**
 * Compatibility wrapper (MenuScene's QA bridge still calls this). Dismissing
 * used to hide the surface and persist that choice; the install policy no
 * longer lets a browser tab be dismissed past the gate, so this is now a
 * no-op that returns the unchanged state.
 */
export const dismissInstallSurface = (): InstallSurfaceState => installState;

export const promptInstallSurface = async (): Promise<InstallPromptOutcome> => {
  const promptEvent = deferredPrompt;
  if (!promptEvent || promptInFlight) {
    return 'unavailable';
  }

  // Keep the event (and so the Install button) in place while the native
  // dialog is open; the in-flight guard stops a second click replaying it.
  promptInFlight = true;
  let choice: DeferredInstallPromptChoice = { outcome: 'dismissed' };
  try {
    await promptEvent.prompt();
    choice = await promptEvent.userChoice;
  } catch {
    choice = { outcome: 'dismissed' };
  } finally {
    promptInFlight = false;
  }

  // A prompt event can only be replayed once. Whether the player accepted or
  // cancelled, it is spent; a cancel simply falls back to the manual steps
  // (and Chromium may fire a fresh beforeinstallprompt later, which upgrades
  // the card again). A cancel never unlocks the tab.
  deferredPrompt = undefined;
  if (choice.outcome === 'accepted') {
    installed = true;
  }
  publishInstallSurfaceState();

  return choice.outcome;
};

export const resetInstallSurfaceRuntimeForTests = (): void => {
  if (installRuntimeWindow?.removeEventListener) {
    installRuntimeWindow.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    installRuntimeWindow.removeEventListener('appinstalled', handleAppInstalled as EventListener);
  }

  subscribers.clear();
  initialized = false;
  installed = false;
  promptInFlight = false;
  deferredPrompt = undefined;
  installRuntimeWindow = undefined;
  installState = idleInstallState();
};
