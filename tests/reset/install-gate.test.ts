import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  MAZER_INSTALL_GATE_COPY,
  MAZER_INSTALL_GATE_COPY_FEEDBACK,
  MAZER_INSTALL_GATE_OVERLAY_ID,
  installMazerInstallGate,
  resolveMazerInstallGateCopy,
  resolveMazerInstallGateDecision,
  runMazerInstallGate,
  shouldRunMazerInstallGateForBoot,
  shouldShowMazerInstallGate
} from '../../src/boot/installGate';
import type { InstallGateMode } from '../../src/boot/installPolicy';
import {
  initializeInstallSurface,
  resetInstallSurfaceRuntimeForTests,
  type DeferredInstallPromptEvent,
  type InstallSurfaceState
} from '../../src/boot/installSurface';

const browserTabState: InstallSurfaceState = {
  mode: 'manual',
  canPrompt: false,
  installed: false,
  standalone: false,
  platform: 'desktop-chromium'
};

const standaloneState: InstallSurfaceState = {
  mode: 'hidden',
  canPrompt: false,
  installed: true,
  standalone: true,
  platform: 'desktop-chromium'
};

class FakeElement {
  public id = '';
  public innerHTML = '';
  public readonly attributes = new Map<string, string>();
  public removed = false;

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public querySelectorAll(): never[] {
    return [];
  }

  public remove(): void {
    this.removed = true;
  }
}

class FakeDocument {
  public readonly appended: FakeElement[] = [];
  public readonly body = { append: (node: Node): void => void this.appended.push(node as unknown as FakeElement) };

  public createElement(): HTMLElement {
    return new FakeElement() as unknown as HTMLElement;
  }

  public getElementById(id: string): HTMLElement | null {
    const found = this.appended.find((element) => element.id === id && !element.removed);
    return (found ?? null) as unknown as HTMLElement | null;
  }
}

class FakeRuntimeWindow {
  public listeners = new Map<string, Set<(event: Event) => void>>();
  public navigator: { platform?: string; userAgent?: string } = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    platform: 'Win32'
  };

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const bucket = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    bucket.add(listener as (event: Event) => void);
    this.listeners.set(type, bucket);
  }

  public removeEventListener(): void {}

  public dispatchEvent(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  public matchMedia(): Pick<MediaQueryList, 'matches'> {
    return { matches: false };
  }
}

const createPromptEvent = (): DeferredInstallPromptEvent => {
  const event = new Event('beforeinstallprompt') as DeferredInstallPromptEvent;
  Object.assign(event, { prompt: async (): Promise<void> => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  return event;
};

afterEach(() => {
  resetInstallSurfaceRuntimeForTests();
});

describe('Mazer install gate', () => {
  // CHANGED (was: 'only shows for a mode installSurface actually asks to gate on').
  // The old pin made the gate depend on installSurface returning a non-hidden
  // mode, which is exactly how a desktop browser tab (no beforeinstallprompt
  // captured yet, not iOS) fell through to `hidden` and was never gated. The
  // invariant is now: every non-standalone state shows the gate.
  test('shows for every non-standalone state, including the legacy `hidden` and dismissed shapes', () => {
    expect(shouldShowMazerInstallGate(standaloneState)).toBe(false);
    expect(shouldShowMazerInstallGate(browserTabState)).toBe(true);
    // The old fail-open shape: mode `hidden`, not standalone, nothing captured.
    expect(shouldShowMazerInstallGate({ ...browserTabState, mode: 'hidden' })).toBe(true);
    expect(shouldShowMazerInstallGate({ ...browserTabState, mode: 'ios-open-in-browser', platform: 'ios-in-app' })).toBe(true);
    expect(shouldShowMazerInstallGate({ ...browserTabState, mode: 'available', canPrompt: true })).toBe(true);
    // appinstalled in a tab: installed but NOT standalone is still gated.
    expect(shouldShowMazerInstallGate({ ...browserTabState, mode: 'hidden', installed: true })).toBe(true);
  });

  test('derives the gate mode from live surface facts', () => {
    expect(resolveMazerInstallGateDecision(browserTabState).mode).toBe('manual-desktop-chromium');
    expect(resolveMazerInstallGateDecision({ ...browserTabState, canPrompt: true, mode: 'available' }).mode).toBe('prompt-available');
    expect(resolveMazerInstallGateDecision({ ...browserTabState, platform: 'ios' }).mode).toBe('manual-ios');
    expect(resolveMazerInstallGateDecision({ ...browserTabState, installed: true, mode: 'hidden' }).mode).toBe('installed-open-app');
    expect(resolveMazerInstallGateDecision(standaloneState)).toMatchObject({ blocked: false, reason: 'standalone' });
  });

  test('bypasses the install gate for recovery, OAuth callbacks, legal routes, and plain localhost', () => {
    const base = {
      forceInstallGate: false,
      isLocalhostRuntime: false,
      legalRouteRequested: false,
      oauthCallbackAccepted: false,
      oauthCallbackRequested: false,
      passwordRecoveryRequested: false
    };
    expect(shouldRunMazerInstallGateForBoot({ ...base, passwordRecoveryRequested: true })).toBe(false);
    expect(shouldRunMazerInstallGateForBoot({ ...base, oauthCallbackAccepted: true, oauthCallbackRequested: true })).toBe(false);
    // A five-to-fifteen-minute portal return is expired by the Mazer pending
    // deadline. It must still reach Mazer's retry/error UI, not an install gate.
    expect(shouldRunMazerInstallGateForBoot({ ...base, oauthCallbackRequested: true })).toBe(false);
    expect(shouldRunMazerInstallGateForBoot({ ...base, legalRouteRequested: true })).toBe(false);
    expect(shouldRunMazerInstallGateForBoot({ ...base, isLocalhostRuntime: true })).toBe(false);
    expect(shouldRunMazerInstallGateForBoot(base)).toBe(true);
    expect(shouldRunMazerInstallGateForBoot({ ...base, forceInstallGate: true, isLocalhostRuntime: true })).toBe(true);
  });

  // CHANGED (was: 'keeps one shared three-step contract while restoring the
  // native action only for prompt-capable browsers'): the single generic
  // 3-step copy is replaced by per-platform copy keyed by gate mode.
  test('has short per-platform copy: three steps max, no skip, native action only when a prompt is captured', () => {
    const modes = Object.keys(MAZER_INSTALL_GATE_COPY) as InstallGateMode[];
    expect(modes.sort()).toEqual([
      'in-app-browser',
      'installed-open-app',
      'manual-android',
      'manual-desktop-chromium',
      'manual-desktop-other',
      'manual-ios',
      'prompt-available'
    ]);

    for (const mode of modes) {
      const copy = resolveMazerInstallGateCopy(mode);
      expect(copy.steps.length).toBeLessThanOrEqual(3);
      expect(copy).not.toHaveProperty('showSkip');
      expect(`${copy.title} ${copy.subtitle} ${copy.steps.join(' ')}`).not.toMatch(/skip|continue without|dismiss/i);
      if (mode !== 'installed-open-app') {
        expect(copy.title).toBe('Install Mazer');
        expect(copy.subtitle).toMatch(/only runs/i);
      }
      // MAZER-FLOW-010: every install card carries one short value line; the post-install card has none.
      if (mode === 'installed-open-app') {
        expect(copy.valueLine).toBe('');
      } else {
        expect(copy.valueLine.length).toBeGreaterThan(0);
        expect(copy.valueLine.length).toBeLessThanOrEqual(80);
        expect(copy.valueLine).not.toMatch(/skip|continue without|dismiss/i);
      }
      expect(copy.primaryAction === 'install').toBe(mode === 'prompt-available');
      expect(copy.primaryLabel === 'Install').toBe(mode === 'prompt-available');
    }

    expect(resolveMazerInstallGateCopy('installed-open-app')).toMatchObject({
      title: 'Mazer is installed',
      subtitle: 'Open it from your home screen or desktop.',
      steps: []
    });
    expect(resolveMazerInstallGateCopy('in-app-browser').showCopyLink).toBe(true);
    expect(resolveMazerInstallGateCopy('manual-ios').steps.join(' ')).toMatch(/Add to Home Screen/);
  });

  test('the overlay renders per-platform copy and upgrades in place when a prompt arrives later', () => {
    const documentRef = new FakeDocument();
    const handle = installMazerInstallGate(documentRef, browserTabState, { onCopyLink: () => {}, onInstall: () => {} });
    const overlay = documentRef.appended[0];

    expect(overlay.id).toBe(MAZER_INSTALL_GATE_OVERLAY_ID);
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('manual-desktop-chromium');
    expect(overlay.innerHTML).toContain('Install Mazer');
    expect(overlay.innerHTML).not.toContain('data-mazer-install-gate-action="install"');

    handle.update({ ...browserTabState, mode: 'available', canPrompt: true });
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('prompt-available');
    expect(overlay.innerHTML).toContain('data-mazer-install-gate-action="install"');

    handle.update({ ...browserTabState, mode: 'hidden', installed: true });
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('installed-open-app');
    expect(overlay.innerHTML).toContain('Mazer is installed');
    expect(overlay.innerHTML).not.toContain('data-mazer-install-gate-action="install"');
  });

  test('renders the value line with the static mini-maze mark, and none on the post-install card', () => {
    const documentRef = new FakeDocument();
    const handle = installMazerInstallGate(documentRef, browserTabState, { onCopyLink: () => {}, onInstall: () => {} });
    const overlay = documentRef.appended[0];
    const valueLine = resolveMazerInstallGateCopy('manual-desktop-chromium').valueLine;

    expect(overlay.innerHTML).toContain('class="mazer-install-gate-value"');
    expect(overlay.innerHTML).toContain(valueLine);
    expect(overlay.innerHTML).toContain('class="mazer-install-gate-mini-maze"');
    expect(overlay.innerHTML).toContain('aria-hidden="true"');
    expect(overlay.innerHTML).toContain('role="status"');

    handle.update({ ...browserTabState, mode: 'hidden', installed: true });
    expect(overlay.innerHTML).not.toContain('mazer-install-gate-value');
    expect(overlay.innerHTML).not.toContain('mazer-install-gate-mini-maze');
  });

  test('Copy link confirms visibly on success and reports failure instead of staying silent', async () => {
    const feedback = { textContent: '' };
    let copyHandler: (() => void) | null = null;
    const overlay = {
      id: '',
      innerHTML: '',
      removed: false,
      setAttribute: () => {},
      remove() { this.removed = true; },
      querySelector: () => feedback,
      querySelectorAll: () => [{
        dataset: { mazerInstallGateAction: 'copy' },
        addEventListener: (_type: string, listener: () => void) => { copyHandler = listener; }
      }]
    };
    const documentRef = {
      createElement: () => overlay as unknown as HTMLElement,
      getElementById: () => null,
      body: { append: () => {} }
    };
    const copyState = { ...browserTabState, platform: 'ios-in-app' as const };
    let result = true;
    installMazerInstallGate(documentRef as never, copyState, { onCopyLink: async () => result, onInstall: () => {} });
    expect(overlay.innerHTML).toContain('data-mazer-install-gate-action="copy"');
    expect(feedback.textContent).toBe('');

    copyHandler!();
    await Promise.resolve();
    await Promise.resolve();
    expect(feedback.textContent).toBe(MAZER_INSTALL_GATE_COPY_FEEDBACK.copied);
    expect(MAZER_INSTALL_GATE_COPY_FEEDBACK.copied).toMatch(/^Link copied/);

    result = false;
    copyHandler!();
    await Promise.resolve();
    await Promise.resolve();
    expect(feedback.textContent).toBe(MAZER_INSTALL_GATE_COPY_FEEDBACK.failed);
  });

  test('runMazerInstallGate resolves immediately when standalone and otherwise stays up with no skip, upgrading on events', async () => {
    const standaloneRuntime = new FakeRuntimeWindow();
    standaloneRuntime.matchMedia = () => ({ matches: true });
    initializeInstallSurface(standaloneRuntime);
    const standaloneDocument = new FakeDocument();
    await expect(runMazerInstallGate(standaloneDocument)).resolves.toBeUndefined();
    expect(standaloneDocument.appended).toHaveLength(0);

    resetInstallSurfaceRuntimeForTests();

    const runtime = new FakeRuntimeWindow();
    initializeInstallSurface(runtime);
    const documentRef = new FakeDocument();
    let blockedCalls = 0;
    let settled = false;
    void runMazerInstallGate(documentRef, { onBlocked: () => { blockedCalls += 1; } }).then(() => { settled = true; });

    const overlay = documentRef.appended[0];
    expect(blockedCalls).toBe(1);
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('manual-desktop-chromium');

    // Event arrival after the card is already on screen.
    runtime.dispatchEvent('beforeinstallprompt', createPromptEvent());
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('prompt-available');

    runtime.dispatchEvent('appinstalled', new Event('appinstalled'));
    expect(overlay.attributes.get('data-mazer-install-gate-mode')).toBe('installed-open-app');

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(overlay.removed).toBe(false);
  });

  test('wires the install gate into boot before the Phaser game is created, and skips it on localhost', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    const installGateCallIndex = mainSource.indexOf('await runMazerInstallGate(document');
    const gameCreateIndex = mainSource.indexOf('game = new Phaser.Game(');

    expect(installGateCallIndex).toBeGreaterThan(-1);
    expect(gameCreateIndex).toBeGreaterThan(-1);
    expect(installGateCallIndex).toBeLessThan(gameCreateIndex);
    expect(mainSource).toContain('initializeInstallSurface(window);');
    expect(mainSource).toContain('!passwordRecoveryRouteRequested');
    expect(mainSource).toContain('captureAndScrubMazerOAuthCallback(window.location, window.history)');
    expect(mainSource).toContain("oauthCallbackAccepted = result.status === 'connected';");
    expect(mainSource).toContain('oauthCallbackAccepted,');
    expect(mainSource).toContain('oauthCallbackRequested,');
    expect(mainSource).toContain("window.location.replace(buildMazerAccountPortalUrl('reset-password'))");
    expect(mainSource).toContain('window.location.replace(buildMazerLegalUrl(legalRoute))');
    expect(mainSource.indexOf('captureAndScrubMazerOAuthCallback(window.location, window.history)')).toBeLessThan(
      mainSource.indexOf("markMazerBootStatus('boot-start')")
    );
    expect(mainSource.indexOf('initializeInstallSurface(window);')).toBeLessThan(
      mainSource.indexOf('await consumeMazerOAuthCallback(')
    );
    expect(mainSource.indexOf('await consumeMazerOAuthCallback(')).toBeLessThan(installGateCallIndex);
    expect(mainSource).toContain('shouldRunMazerInstallGateForBoot({');
    expect(cssSource).toContain(`#${MAZER_INSTALL_GATE_OVERLAY_ID}`);
    expect(cssSource).toContain('"Space Grotesk", ui-sans-serif, system-ui');
  });

  test('has no skip path anywhere in the gate source', () => {
    const gateSource = readFileSync(resolve(process.cwd(), 'src/boot/installGate.ts'), 'utf8');
    expect(gateSource).not.toMatch(/Continue without installing|showSkip|onContinue|mazer-install-gate-button-skip/);
  });
});
