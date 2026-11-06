import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  MAZER_BOOT_SPLASH_ID,
  MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE,
  MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE,
  MAZER_BOOT_SPLASH_TEXT_ID,
  removeMazerBootSplash,
  resolveMazerBootSplashMessage,
  setMazerBootSplashMessage
} from '../../src/boot/bootSplash';
import {
  attachMazerGameToWindow,
  clearMazerBootStatusForTests,
  markMazerBootStatus,
  MAZER_BOOT_STATUS_WINDOW_KEY,
  MAZER_GAME_WINDOW_KEY
} from '../../src/boot/bootStatus';

afterEach(() => {
  clearMazerBootStatusForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('boot status', () => {
  test('publishes boot stages onto window state', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);

    markMazerBootStatus('boot-start');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('boot-start');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.gameCreated).toBe(false);

    markMazerBootStatus('game-created');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('game-created');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.gameCreated).toBe(true);

    markMazerBootStatus('menu-scene-create');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.menuSceneCreated).toBe(true);
  });

  test('retains the latest boot error message', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);

    markMazerBootStatus('error', 'boot failed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('error');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.errorMessage).toBe('boot failed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.playerMessage).toMatchObject({
      copy: 'The maze did not finish loading. Try refreshing once.',
      source: 'boot',
      technicalDetail: 'boot failed',
      tone: 'error'
    });
  });

  test('allows production service-worker update failures to be reported without blocking boot', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);

    markMazerBootStatus('service-worker-error', 'sw update failed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('service-worker-error');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.errorMessage).toBe('sw update failed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.gameCreated).toBe(false);
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.playerMessage).toMatchObject({
      copy: 'The offline cache could not update. The game can still run online.',
      source: 'boot',
      technicalDetail: 'sw update failed',
      tone: 'warning'
    });
  });

  test('attaches the live Phaser game for browser diagnostics', () => {
    const runtime = {} as Window;
    const fakeGame = { destroy: () => undefined } as unknown as Phaser.Game;
    vi.stubGlobal('window', runtime);

    attachMazerGameToWindow(fakeGame);
    expect(runtime[MAZER_GAME_WINDOW_KEY]).toBe(fakeGame);
  });

  test('boot stage order includes oauth-exchange and account-bootstrap before game creation', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);
    const stages: string[] = [];

    for (const stage of [
      'boot-start',
      'oauth-exchange',
      'install-gate-checking',
      'account-bootstrap',
      'game-creating',
      'game-created',
      'menu-scene-create'
    ] as const) {
      markMazerBootStatus(stage);
      stages.push(stage);
    }

    // menu-scene-create chains the explicit splash removal stage.
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('splash-removed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.menuSceneCreated).toBe(true);
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.gameCreated).toBe(true);
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.splashRemoved).toBe(true);
    expect(stages.indexOf('oauth-exchange')).toBeLessThan(stages.indexOf('account-bootstrap'));
    expect(stages.indexOf('account-bootstrap')).toBeLessThan(stages.indexOf('game-creating'));
  });
});

class FakeSplashElement {
  public textContent: string | null = '';
  public removed = false;

  public remove(): void {
    this.removed = true;
  }
}

const installFakeSplashDocument = () => {
  const splash = new FakeSplashElement();
  const text = new FakeSplashElement();
  text.textContent = MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE;
  const elements: Record<string, FakeSplashElement> = {
    [MAZER_BOOT_SPLASH_ID]: splash,
    [MAZER_BOOT_SPLASH_TEXT_ID]: text
  };
  vi.stubGlobal('document', {
    getElementById: (id: string) => (elements[id] && !elements[id].removed ? elements[id] : null)
  });
  return { splash, text };
};

describe('boot splash lifecycle', () => {
  test('is neutral by default and says "Signing you in" only while an OAuth exchange is in progress', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);
    const { text } = installFakeSplashDocument();

    markMazerBootStatus('boot-start');
    expect(text.textContent).toBe(MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE);

    markMazerBootStatus('oauth-exchange');
    expect(text.textContent).toBe(MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE);

    markMazerBootStatus('account-bootstrap');
    expect(text.textContent).toBe(MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE);
    expect(resolveMazerBootSplashMessage('game-creating')).toBe(MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE);
  });

  test('stays up through game creation and is removed explicitly when the menu scene is created', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);
    const { splash } = installFakeSplashDocument();

    markMazerBootStatus('game-creating');
    markMazerBootStatus('game-created');
    expect(splash.removed).toBe(false);
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.splashRemoved).toBe(false);

    markMazerBootStatus('menu-scene-create');
    expect(splash.removed).toBe(true);
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('splash-removed');
    expect(runtime[MAZER_BOOT_STATUS_WINDOW_KEY]?.splashRemoved).toBe(true);
  });

  test('is removed when the install gate takes over, and on a boot error so it never hides the failure', () => {
    const gateRuntime = {} as Window;
    vi.stubGlobal('window', gateRuntime);
    const gate = installFakeSplashDocument();
    markMazerBootStatus('install-gate-checking');
    expect(gate.splash.removed).toBe(false);
    markMazerBootStatus('splash-removed');
    expect(gate.splash.removed).toBe(true);

    const errorRuntime = {} as Window;
    vi.stubGlobal('window', errorRuntime);
    const failed = installFakeSplashDocument();
    markMazerBootStatus('error', 'boom');
    expect(failed.splash.removed).toBe(true);
    expect(errorRuntime[MAZER_BOOT_STATUS_WINDOW_KEY]?.stage).toBe('error');
    expect(errorRuntime[MAZER_BOOT_STATUS_WINDOW_KEY]?.splashRemoved).toBe(true);
  });

  test('removal is idempotent and tolerates a missing splash', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);
    vi.stubGlobal('document', { getElementById: () => null });

    expect(removeMazerBootSplash()).toBe(false);
    expect(setMazerBootSplashMessage('x')).toBe(false);
    expect(() => markMazerBootStatus('menu-scene-create')).not.toThrow();
  });

  test('index.html ships the static splash inside #app as a status region', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const appIndex = html.indexOf('<div id="app">');
    const splashIndex = html.indexOf(`id="${MAZER_BOOT_SPLASH_ID}"`);

    expect(appIndex).toBeGreaterThan(-1);
    expect(splashIndex).toBeGreaterThan(appIndex);
    expect(html).toMatch(/id="mazer-boot-splash"[^>]*role="status"/);
    expect(html).toContain(`id="${MAZER_BOOT_SPLASH_TEXT_ID}"`);
    expect(html).toContain('prefers-reduced-motion');
  });
});
