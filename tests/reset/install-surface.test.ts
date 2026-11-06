import { afterEach, describe, expect, test } from 'vitest';
import {
  INSTALL_SURFACE_LEGACY_DISMISSED_STORAGE_KEY,
  dismissInstallSurface,
  getInstallSurfaceState,
  initializeInstallSurface,
  promptInstallSurface,
  resetInstallSurfaceRuntimeForTests,
  resolveInstallSurfaceState,
  resolveIsIOSInAppBrowser,
  resolveManualInstallInstruction,
  subscribeInstallSurface,
  type DeferredInstallPromptEvent,
  type InstallSurfaceState
} from '../../src/boot/installSurface';

class FakeWindow {
  public listeners = new Map<string, Set<(event: Event) => void>>();
  public localStorage = {
    getItem: (key: string): string | null => this.storage.get(key) ?? null,
    removeItem: (key: string): void => {
      this.storage.delete(key);
    },
    setItem: (key: string, value: string): void => {
      this.storage.set(key, value);
    }
  };
  public document: { referrer?: string } = {};
  public matchingQueries: string[] = [];
  public navigator: {
    maxTouchPoints?: number;
    platform?: string;
    standalone?: boolean;
    userAgent?: string;
  } = {};

  private readonly standalone: boolean;
  public readonly storage = new Map<string, string>();

  public constructor(standalone = false) {
    this.standalone = standalone;
  }

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const normalized = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    const bucket = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    bucket.add(normalized);
    this.listeners.set(type, bucket);
  }

  public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }

    const normalized = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    bucket.delete(normalized);
  }

  public dispatchEvent(type: string, event: Event): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }

    for (const listener of bucket) {
      listener(event);
    }
  }

  public matchMedia(query: string): Pick<MediaQueryList, 'matches'> {
    return { matches: this.standalone || this.matchingQueries.includes(query) };
  }
}

const createPromptEvent = (outcome: 'accepted' | 'dismissed'): DeferredInstallPromptEvent => {
  const event = new Event('beforeinstallprompt') as DeferredInstallPromptEvent;
  const prompt = async (): Promise<void> => {};
  const userChoice = Promise.resolve({ outcome });
  Object.assign(event, { prompt, userChoice });
  return event;
};

afterEach(() => {
  resetInstallSurfaceRuntimeForTests();
});

describe('install surface runtime', () => {
  test('manual install instructions are only emitted for iOS-style browsers', () => {
    expect(resolveManualInstallInstruction({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    })).toBe('Use Share > Add to Home Screen');
    expect(resolveManualInstallInstruction({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32'
    })).toBeUndefined();
  });

  test('state resolution: only standalone/installed hides the surface; every other context is at least manual', () => {
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: true
    })).toEqual<InstallSurfaceState>({
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false,
      platform: 'desktop-other'
    });
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: false,
      instruction: 'Use Share > Add to Home Screen',
      platform: 'ios'
    })).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform: 'ios',
      instruction: 'Use Share > Add to Home Screen'
    });
    // CHANGED: a browser tab with nothing to say used to fail open to `hidden`.
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: false,
      platform: 'desktop-chromium'
    })).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform: 'desktop-chromium'
    });
    expect(resolveInstallSurfaceState({
      standalone: true,
      installed: false,
      canPrompt: true,
      instruction: 'Use Share > Add to Home Screen'
    })).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: true,
      platform: 'desktop-other'
    });
  });

  test('beforeinstallprompt drives the single install action and an accepted install keeps the tab marked installed-but-not-standalone', async () => {
    const runtime = new FakeWindow();
    const snapshots: InstallSurfaceState[] = [];
    initializeInstallSurface(runtime);
    const unsubscribe = subscribeInstallSurface((state) => {
      snapshots.push(state);
    });

    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));

    expect(getInstallSurfaceState().mode).toBe('available');
    await expect(promptInstallSurface()).resolves.toBe('accepted');
    // standalone stays false: the install gate keys off this to show
    // "Mazer is installed. Open it from ..." instead of letting the tab run.
    expect(getInstallSurfaceState()).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: false,
      platform: 'desktop-other'
    });
    expect(snapshots.some((state) => state.mode === 'available')).toBe(true);
    unsubscribe();
  });

  test('a cancelled native prompt falls back to manual steps and is never remembered', async () => {
    const runtime = new FakeWindow();
    initializeInstallSurface(runtime);
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('dismissed'));

    expect(getInstallSurfaceState().mode).toBe('available');
    await expect(promptInstallSurface()).resolves.toBe('dismissed');
    // CHANGED: used to become `hidden` (and persist that). Now the tab stays gated.
    expect(getInstallSurfaceState().mode).toBe('manual');
    expect(getInstallSurfaceState().canPrompt).toBe(false);
    expect(runtime.storage.has(INSTALL_SURFACE_LEGACY_DISMISSED_STORAGE_KEY)).toBe(false);

    resetInstallSurfaceRuntimeForTests();

    // CHANGED: a fresh page load after a cancel is manual again, not hidden.
    expect(initializeInstallSurface(runtime).mode).toBe('manual');
  });

  test('a fresh beforeinstallprompt after a cancel upgrades the surface again, and a second click cannot replay a spent event', async () => {
    const runtime = new FakeWindow();
    initializeInstallSurface(runtime);
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('dismissed'));
    await promptInstallSurface();
    await expect(promptInstallSurface()).resolves.toBe('unavailable');

    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));
    expect(getInstallSurfaceState().mode).toBe('available');
  });

  test('a beforeinstallprompt that arrives after boot upgrades subscribers from manual to available', () => {
    const runtime = new FakeWindow();
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      platform: 'Win32'
    };
    const seen: Array<InstallSurfaceState['mode']> = [];

    expect(initializeInstallSurface(runtime)).toMatchObject({ mode: 'manual', platform: 'desktop-chromium' });
    subscribeInstallSurface((state) => {
      seen.push(state.mode);
    });
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));

    expect(seen).toEqual(['available']);
  });

  test('appinstalled in a browser tab marks it installed but not standalone', () => {
    const runtime = new FakeWindow();
    initializeInstallSurface(runtime);
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));
    runtime.dispatchEvent('appinstalled', new Event('appinstalled'));

    expect(getInstallSurfaceState()).toMatchObject({ installed: true, standalone: false, canPrompt: false });
  });

  test('dismissInstallSurface is a compatibility no-op: it never hides a browser tab', () => {
    const runtime = new FakeWindow(false);
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(runtime).mode).toBe('manual');
    // CHANGED: used to return `hidden` and persist the preference.
    expect(dismissInstallSurface().mode).toBe('manual');
    expect(runtime.storage.has(INSTALL_SURFACE_LEGACY_DISMISSED_STORAGE_KEY)).toBe(false);
    resetInstallSurfaceRuntimeForTests();
    expect(initializeInstallSurface(runtime).mode).toBe('manual');
  });

  test('a stale dismissed flag written by an older build is ignored', () => {
    const runtime = new FakeWindow(false);
    runtime.storage.set(INSTALL_SURFACE_LEGACY_DISMISSED_STORAGE_KEY, '1');
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(runtime).mode).toBe('manual');
  });

  test('standalone mode stays hidden; a non-standalone iOS browser tab is manual', () => {
    const standaloneRuntime = new FakeWindow(true);
    standaloneRuntime.navigator = {
      standalone: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(standaloneRuntime)).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: true,
      platform: 'ios'
    });

    resetInstallSurfaceRuntimeForTests();

    const manualRuntime = new FakeWindow(false);
    manualRuntime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(manualRuntime)).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform: 'ios',
      instruction: 'Use Share > Add to Home Screen'
    });
  });

  test('installed display modes and the Android app referrer are recognised as standalone; bare fullscreen is not', () => {
    for (const query of ['(display-mode: minimal-ui)', '(display-mode: window-controls-overlay)']) {
      resetInstallSurfaceRuntimeForTests();
      const runtime = new FakeWindow(false);
      runtime.matchingQueries = [query];
      expect(initializeInstallSurface(runtime)).toMatchObject({ standalone: true, installed: true, mode: 'hidden' });
    }

    resetInstallSurfaceRuntimeForTests();
    const twaRuntime = new FakeWindow(false);
    twaRuntime.document = { referrer: 'android-app://com.example.mazer' };
    expect(initializeInstallSurface(twaRuntime)).toMatchObject({ standalone: true });

    resetInstallSurfaceRuntimeForTests();
    const fullscreenTab = new FakeWindow(false);
    fullscreenTab.matchingQueries = ['(display-mode: fullscreen)'];
    expect(initializeInstallSurface(fullscreenTab)).toMatchObject({ standalone: false, mode: 'manual' });
  });

  test('detects iOS in-app browsers (TikTok, Instagram, etc.) that cannot install PWAs at all', () => {
    expect(resolveIsIOSInAppBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... [FBAN/FBIOS]',
      platform: 'iPhone'
    })).toBe(true);
    expect(resolveIsIOSInAppBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      platform: 'iPhone'
    })).toBe(false);
    // Android in-app browsers aren't the same technical block -- Android's
    // Chrome Custom Tabs and WebView still expose a real install path, so
    // this only ever applies to iOS.
    expect(resolveIsIOSInAppBrowser({
      userAgent: 'Mozilla/5.0 (Linux; Android 14) ... Instagram',
      platform: 'Linux armv8l'
    })).toBe(false);
  });

  test('iOS in-app browser gets its own mode and dismissing does nothing', () => {
    const runtime = new FakeWindow(false);
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... [FBAN/FBIOS]',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(runtime)).toEqual<InstallSurfaceState>({
      mode: 'ios-open-in-browser',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform: 'ios-in-app'
    });
    expect(dismissInstallSurface().mode).toBe('ios-open-in-browser');
  });

  test('resolveInstallSurfaceState still treats the in-app-browser snapshot flag as a hard block and ignores the deprecated dismissed field', () => {
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: false,
      dismissed: true,
      isIOSInAppBrowser: true
    })).toEqual<InstallSurfaceState>({
      mode: 'ios-open-in-browser',
      canPrompt: false,
      installed: false,
      standalone: false,
      platform: 'desktop-other'
    });
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: true,
      dismissed: true
    }).mode).toBe('available');
  });
});
