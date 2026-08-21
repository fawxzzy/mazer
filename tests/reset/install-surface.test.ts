import { afterEach, describe, expect, test } from 'vitest';
import {
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
  public navigator: {
    maxTouchPoints?: number;
    platform?: string;
    standalone?: boolean;
    userAgent?: string;
  } = {};

  private readonly standalone: boolean;
  private readonly storage = new Map<string, string>();

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

  public matchMedia(): Pick<MediaQueryList, 'matches'> {
    return { matches: this.standalone };
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

  test('state resolution prefers standalone/install hiding before manual fallback', () => {
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: true
    })).toEqual<InstallSurfaceState>({
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    });
    expect(resolveInstallSurfaceState({
      standalone: false,
      installed: false,
      canPrompt: false,
      instruction: 'Use Share > Add to Home Screen'
    })).toEqual<InstallSurfaceState>({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: 'Use Share > Add to Home Screen'
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
      standalone: true
    });
  });

  test('beforeinstallprompt drives the single install action and accepted installs hide it', async () => {
    const runtime = new FakeWindow();
    const snapshots: InstallSurfaceState[] = [];
    initializeInstallSurface(runtime);
    const unsubscribe = subscribeInstallSurface((state) => {
      snapshots.push(state);
    });

    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('accepted'));

    expect(getInstallSurfaceState().mode).toBe('available');
    await expect(promptInstallSurface()).resolves.toBe('accepted');
    expect(getInstallSurfaceState()).toEqual<InstallSurfaceState>({
      mode: 'hidden',
      canPrompt: false,
      installed: true,
      standalone: false
    });
    expect(snapshots.some((state) => state.mode === 'available')).toBe(true);
    unsubscribe();
  });

  test('dismissed install prompts stay hidden until the runtime is reset', async () => {
    const runtime = new FakeWindow();
    initializeInstallSurface(runtime);
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent('dismissed'));

    expect(getInstallSurfaceState().mode).toBe('available');
    await expect(promptInstallSurface()).resolves.toBe('dismissed');
    expect(getInstallSurfaceState().mode).toBe('hidden');

    resetInstallSurfaceRuntimeForTests();

    expect(initializeInstallSurface(runtime).mode).toBe('hidden');
  });

  test('manual install fallback can be dismissed explicitly', () => {
    const runtime = new FakeWindow(false);
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(runtime).mode).toBe('manual');
    expect(dismissInstallSurface().mode).toBe('hidden');
    expect(initializeInstallSurface(runtime).mode).toBe('hidden');
  });

  test('standalone mode stays hidden and manual iOS fallback remains fail-open', () => {
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
      standalone: true
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
      instruction: 'Use Share > Add to Home Screen'
    });
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

  test('iOS in-app browser hard-blocks with its own mode and ignores the dismissed preference', () => {
    const runtime = new FakeWindow(false);
    runtime.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ... [FBAN/FBIOS]',
      platform: 'iPhone'
    };

    expect(initializeInstallSurface(runtime)).toEqual<InstallSurfaceState>({
      mode: 'ios-open-in-browser',
      canPrompt: false,
      installed: false,
      standalone: false
    });
    // Unlike the manual-instruction case, this can't be dismissed away --
    // the player has to actually leave the in-app browser first.
    expect(dismissInstallSurface().mode).toBe('ios-open-in-browser');
  });

  test('resolveInstallSurfaceState still treats the in-app-browser snapshot flag as a hard block ahead of dismissed', () => {
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
      standalone: false
    });
  });
});
