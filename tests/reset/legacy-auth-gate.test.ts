import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_GUEST_PLAY_ACCESS_ENABLED,
  isLegacyPlayAccessAllowed
} from '../../src/legacy-runtime/legacyGuestAccess';

describe('legacy full auth gate', () => {
  test('requires authentication and exposes no guest entry route', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

    expect(LEGACY_GUEST_PLAY_ACCESS_ENABLED).toBe(false);
    expect(isLegacyPlayAccessAllowed('guest', { authResolved: false, guestPlayGranted: false })).toBe(false);
    expect(isLegacyPlayAccessAllowed('unavailable', { authResolved: true, guestPlayGranted: false })).toBe(false);
    expect(isLegacyPlayAccessAllowed('guest', { authResolved: true, guestPlayGranted: true })).toBe(false);
    expect(isLegacyPlayAccessAllowed('authenticated', { authResolved: true, guestPlayGranted: false })).toBe(true);
    expect(menuSceneSource).toContain('private guestPlayGranted = false;');
    expect(menuSceneSource).toContain("this.authGateLocked = snapshot.status !== 'authenticated' && !this.guestPlayGranted;");
    expect(menuSceneSource).toContain('const playAccessAllowed = this.hasLegacyPlayAccess();');
    expect(menuSceneSource).toContain('if (!this.hasLegacyPlayAccess()) {');
    expect(menuSceneSource).toContain('if (this.hasLegacyPlayAccess()) {\n        this.startPlayMode();\n      }');
    expect(menuSceneSource).not.toContain("if (lowerKey === 'g' && this.mode === 'menu' && this.overlay === 'auth') {");
    expect(menuSceneSource).not.toContain("text: 'Play as guest'");
    expect(menuSceneSource).toContain('startGuestPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartGuestPlayMode()');
    expect(menuSceneSource).toContain('private handleLegacyQaStartGuestPlayMode(): LegacyQaOverlayResult {');
  });

  test('uses one full-width submit action and no guest action in the auth bottom bar', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
      .replace(/\r\n/g, '\n');
    const formStart = menuSceneSource.indexOf('  private buildAuthCredentialsForm(');
    const formEnd = menuSceneSource.indexOf('  private createAuthFooterLink(', formStart);
    const formSource = menuSceneSource.slice(formStart, formEnd);

    expect(formSource).toContain('this.createLegacyBottomActionBar(');
    expect(formSource).toContain("tone: 'primary'");
    expect(formSource).toContain('      null\n    );');
    expect(formSource).not.toContain('Play as guest');
    expect(formSource).not.toContain('handleLegacyGuestPlay');
  });

  test('halts gameplay and ambient updates while the forced auth screen is open', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const updateStart = menuSceneSource.indexOf('  public update(time: number, delta: number): void {');
    const updateEnd = menuSceneSource.indexOf('  private initializeRuntimeDiagnostics(): void {', updateStart);
    const updateSource = menuSceneSource.slice(updateStart, updateEnd);
    const freezeAt = updateSource.indexOf("if (this.overlay === 'auth') {");

    expect(freezeAt).toBeGreaterThanOrEqual(0);
    expect(updateSource.indexOf('this.updateStars(time, delta);')).toBeGreaterThan(freezeAt);
    expect(updateSource.indexOf('this.updateMenuDemo(time);')).toBeGreaterThan(freezeAt);
    expect(updateSource.slice(freezeAt, updateSource.indexOf('this.updateStars(time, delta);'))).toContain('return;');
  });

  test('revokes a prior guest grant before returning to menu, account entry, or credential submission', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const submitStart = menuSceneSource.indexOf('  private async handleLegacyAuthSubmit(): Promise<void> {');
    const submitSource = menuSceneSource.slice(submitStart, menuSceneSource.indexOf('  private handleLegacyGuestPlay(): void {', submitStart));
    const openOverlayStart = menuSceneSource.indexOf('  private openOverlay(kind: OverlayKind): void {');
    const openOverlaySource = menuSceneSource.slice(openOverlayStart, menuSceneSource.indexOf('  private closeOverlay(): void {', openOverlayStart));
    const enterMenuStart = menuSceneSource.indexOf('  private enterMenuMode(): void {');
    const enterMenuSource = menuSceneSource.slice(enterMenuStart, menuSceneSource.indexOf('  private startPlayMode(): void {', enterMenuStart));
    const revokeStart = menuSceneSource.indexOf('  private revokeLegacyGuestPlayGrant(): void {');
    const revokeSource = menuSceneSource.slice(revokeStart, menuSceneSource.indexOf('  private applyLegacyAuthSubmitResult(', revokeStart));

    expect(submitSource).toContain('this.revokeLegacyGuestPlayGrant();');
    expect(openOverlaySource).toContain("if (kind === 'auth') {");
    expect(openOverlaySource).toContain('this.revokeLegacyGuestPlayGrant();');
    expect(enterMenuSource).toContain("if (this.authSnapshot.status !== 'authenticated') {");
    expect(enterMenuSource).toContain('this.revokeLegacyGuestPlayGrant();');
    expect(revokeSource).toContain('this.guestPlayGranted = false;');
    expect(revokeSource).toContain('this.pendingBootPlayStart = false;');
    expect(revokeSource).toContain("this.authGateLocked = this.authSnapshot.status !== 'authenticated';");
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
