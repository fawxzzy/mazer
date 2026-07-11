import { afterEach, describe, expect, test, vi } from 'vitest';
import type Phaser from 'phaser';
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
});
