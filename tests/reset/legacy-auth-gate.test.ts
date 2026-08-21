import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_GUEST_PLAY_ACCESS_ENABLED,
  isLegacyPlayAccessAllowed
} from '../../src/legacy-runtime/legacyGuestAccess';

describe('legacy full auth gate', () => {
  test('keeps the existing local guest scope playable while account access is optional', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(LEGACY_GUEST_PLAY_ACCESS_ENABLED).toBe(true);
    expect(isLegacyPlayAccessAllowed('guest')).toBe(true);
    expect(isLegacyPlayAccessAllowed('unavailable')).toBe(true);
    expect(isLegacyPlayAccessAllowed('authenticated')).toBe(true);
    expect(menuSceneSource).toContain('this.authGateLocked = !isLegacyPlayAccessAllowed(snapshot.status);');
    expect(menuSceneSource).toContain('const playAccessAllowed = isLegacyPlayAccessAllowed(this.authSnapshot.status);');
    expect(menuSceneSource).toContain('if (!isLegacyPlayAccessAllowed(this.authSnapshot.status)) {');
  });

  test('a direct-to-play boot waits for the gate to actually clear before starting play mode', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain(
      'if (this.pendingBootPlayStart && !this.authGateAwaitingResolution && !this.authGateLocked) {'
    );
  });

  test('signing in successfully closes an auth overlay the gate opened, and clears the loading blocker', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain(
      "} else if (!this.authGateLocked && !this.authGateAwaitingResolution && this.overlay === 'auth') {"
    );
    expect(menuSceneSource).toContain('this.overlay = \'none\';');

    const loadingScreenStart = menuSceneSource.indexOf('private syncLegacyAuthGateLoadingScreen(time: number): void {');
    const loadingScreenSnippet = menuSceneSource.slice(loadingScreenStart, loadingScreenStart + 900);
    expect(loadingScreenSnippet).toContain('if (!this.authGateAwaitingResolution) {');
    expect(loadingScreenSnippet).toContain('this.authGateLoadingBlocker.destroy();');
    expect(loadingScreenSnippet).toContain('this.authGateLoadingBlocker = null;');
  });

  test('the loading screen blocks input at a depth above every overlay, including the back chevron', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_AUTH_GATE_LOADING_DEPTH = 5000;');
    expect(menuSceneSource).toContain('const LEGACY_OVERLAY_BACK_CHEVRON_DEPTH = 1000;');
    expect(menuSceneSource).toContain('this.authGateLoadingBlocker.setDepth(LEGACY_AUTH_GATE_LOADING_DEPTH);');
    expect(menuSceneSource).toContain('this.authGateLoadingBlocker.setInteractive();');
  });
});
