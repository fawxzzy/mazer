import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('legacy full auth gate', () => {
  test('locks the account overlay open until signed in, with no way to back out of it', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // authGateLocked is only ever true for a resolved, genuinely signed-out
    // player on a configured auth backend -- never while still awaiting the
    // first snapshot, and never when the backend itself isn't configured
    // (an outage or missing local-dev credentials must fall back to guest
    // access, not lock everyone out entirely).
    expect(menuSceneSource).toContain("this.authGateLocked = snapshot.status === 'guest' && snapshot.configured === true;");
    expect(menuSceneSource).toContain('this.authGateAwaitingResolution = false;');
    expect(menuSceneSource).toContain('this.pendingAuthGateTransition = true;');

    // handleBackAction is the single choke point both the back-chevron
    // button and the Escape key route through -- guarding it there covers
    // both without needing to special-case each caller.
    const backActionStart = menuSceneSource.indexOf('private handleBackAction(): void {');
    const backActionEnd = menuSceneSource.indexOf('\n  }', backActionStart);
    const backActionSource = menuSceneSource.slice(backActionStart, backActionEnd);
    expect(backActionSource).toContain("if (this.authGateLocked && this.overlay === 'auth') {");
    expect(backActionSource).toContain('return;');

    // The back-chevron button itself isn't even created while locked, so
    // there's no visual affordance suggesting a way back exists.
    const authOverlayStart = menuSceneSource.indexOf('private buildAuthOverlay(): void {');
    const authOverlaySnippet = menuSceneSource.slice(authOverlayStart, authOverlayStart + 800);
    expect(authOverlaySnippet).toContain("if (!(this.authGateLocked && this.overlay === 'auth')) {");
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
