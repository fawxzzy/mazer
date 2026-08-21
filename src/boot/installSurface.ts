export interface InstallSurfaceState {
  mode: 'hidden' | 'ios-open-in-browser' | 'available' | 'manual';
  canPrompt: boolean;
  installed: boolean;
  standalone: boolean;
  instruction?: string;
}

export interface InstallSurfaceSnapshot {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  dismissed?: boolean;
  instruction?: string;
  /**
   * iOS PWA installs literally cannot happen from inside an in-app browser
   * (TikTok, Instagram, etc. sandbox their WebView and don't expose "Add to
   * Home Screen") -- this is the one case that hard-blocks and ignores the
   * dismissed preference, since it's a technical impossibility, not a
   * preference the player can dismiss their way past. They have to actually
   * leave the in-app browser first.
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

interface InstallSurfaceWindowLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  localStorage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
  matchMedia?(query: string): Pick<MediaQueryList, 'matches'>;
  navigator?: InstallSurfaceNavigatorLike;
  removeEventListener?(type: string, listener: EventListenerOrEventListenerObject): void;
}

export type InstallPromptOutcome = DeferredInstallPromptChoice['outcome'] | 'unavailable';

const IOS_MANUAL_INSTALL_INSTRUCTION = 'Use Share > Add to Home Screen';
const INSTALL_SURFACE_DISMISSED_STORAGE_KEY = 'mazer-install-surface-dismissed-v1';
// Ported from the Fitness app's own in-app-browser detection (same list of
// sandboxed WebView user agents that block PWA install).
const IOS_IN_APP_BROWSER_PATTERN =
  /(TikTok|musical_ly|Instagram|FBAN|FBAV|Messenger|Twitter|Line|LinkedInApp|Pinterest|Snapchat|Discord|WhatsApp|Telegram|MicroMessenger|LinkMe|Linktree|Beacons)/i;

let installState: InstallSurfaceState = {
  mode: 'hidden',
  canPrompt: false,
  installed: false,
  standalone: false
};
let deferredPrompt: DeferredInstallPromptEvent | undefined;
let installRuntimeWindow: InstallSurfaceWindowLike | undefined;
let initialized = false;
let installed = false;
let dismissed = false;

const subscribers = new Set<(state: InstallSurfaceState) => void>();

const isDeferredInstallPromptEvent = (event: Event): event is DeferredInstallPromptEvent => (
  typeof (event as Partial<DeferredInstallPromptEvent>).prompt === 'function'
);

const resolveGlobalWindow = (): InstallSurfaceWindowLike | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const readDismissedPreference = (runtime: InstallSurfaceWindowLike | undefined): boolean => {
  try {
    return runtime?.localStorage?.getItem(INSTALL_SURFACE_DISMISSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissedPreference = (runtime: InstallSurfaceWindowLike | undefined, value: boolean): void => {
  try {
    if (value) {
      runtime?.localStorage?.setItem(INSTALL_SURFACE_DISMISSED_STORAGE_KEY, '1');
    } else {
      runtime?.localStorage?.removeItem(INSTALL_SURFACE_DISMISSED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the in-memory state is enough to keep the chrome quiet.
  }
};

const resolveStandaloneState = (runtime: InstallSurfaceWindowLike | undefined): boolean => {
  if (!runtime) {
    return false;
  }

  const navigatorLike = runtime.navigator;
  if (navigatorLike?.standalone === true) {
    return true;
  }

  try {
    return runtime.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
};

const detectIOSFromNavigator = (navigatorLike: InstallSurfaceNavigatorLike): boolean => {
  const userAgent = (navigatorLike.userAgent ?? '').toLowerCase();
  const platform = (navigatorLike.platform ?? '').toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent)
    || (platform.includes('mac') && (navigatorLike.maxTouchPoints ?? 0) > 1);
};

export const resolveManualInstallInstruction = (
  navigatorLike: InstallSurfaceNavigatorLike | undefined
): string | undefined => {
  if (!navigatorLike) {
    return undefined;
  }

  return detectIOSFromNavigator(navigatorLike) ? IOS_MANUAL_INSTALL_INSTRUCTION : undefined;
};

export const resolveIsIOSInAppBrowser = (
  navigatorLike: InstallSurfaceNavigatorLike | undefined
): boolean => {
  if (!navigatorLike || !detectIOSFromNavigator(navigatorLike)) {
    return false;
  }

  return IOS_IN_APP_BROWSER_PATTERN.test(navigatorLike.userAgent ?? '');
};

export const resolveInstallSurfaceState = (snapshot: InstallSurfaceSnapshot): InstallSurfaceState => {
  if (snapshot.standalone || snapshot.installed) {
    return {
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: snapshot.standalone
    };
  }

  if (snapshot.isIOSInAppBrowser) {
    return {
      mode: 'ios-open-in-browser',
      canPrompt: false,
      installed: false,
      standalone: false
    };
  }

  if (snapshot.dismissed) {
    return {
      mode: 'hidden',
      canPrompt: false,
      installed: false,
      standalone: false
    };
  }

  if (snapshot.canPrompt) {
    return {
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    };
  }

  if (snapshot.instruction) {
    return {
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: snapshot.instruction
    };
  }

  return {
    mode: 'hidden',
    canPrompt: false,
    installed: false,
    standalone: false
  };
};

const publishInstallSurfaceState = (): InstallSurfaceState => {
  const standalone = resolveStandaloneState(installRuntimeWindow);
  installState = resolveInstallSurfaceState({
    standalone,
    installed: installed || standalone,
    dismissed: dismissed && !standalone && !installed,
    canPrompt: !standalone && !installed && deferredPrompt !== undefined,
    instruction: standalone || installed ? undefined : resolveManualInstallInstruction(installRuntimeWindow?.navigator),
    isIOSInAppBrowser: standalone || installed ? false : resolveIsIOSInAppBrowser(installRuntimeWindow?.navigator)
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
  dismissed = false;
  deferredPrompt = undefined;
  writeDismissedPreference(installRuntimeWindow, false);
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
  dismissed = !installed && readDismissedPreference(runtime);
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

export const dismissInstallSurface = (): InstallSurfaceState => {
  if (installState.mode === 'hidden' || installed) {
    return installState;
  }

  dismissed = true;
  deferredPrompt = undefined;
  writeDismissedPreference(installRuntimeWindow, true);
  return publishInstallSurfaceState();
};

export const promptInstallSurface = async (): Promise<InstallPromptOutcome> => {
  const promptEvent = deferredPrompt;
  if (!promptEvent) {
    return 'unavailable';
  }

  deferredPrompt = undefined;
  publishInstallSurfaceState();

  await promptEvent.prompt();

  let choice: DeferredInstallPromptChoice = { outcome: 'dismissed' };
  try {
    choice = await promptEvent.userChoice;
  } catch {
    choice = { outcome: 'dismissed' };
  }

  installed = choice.outcome === 'accepted';
  dismissed = choice.outcome !== 'accepted';
  writeDismissedPreference(installRuntimeWindow, dismissed);
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
  dismissed = false;
  deferredPrompt = undefined;
  installRuntimeWindow = undefined;
  installState = {
    mode: 'hidden',
    canPrompt: false,
    installed: false,
    standalone: false
  };
};
