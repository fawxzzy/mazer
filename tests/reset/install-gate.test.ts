import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_INSTALL_GATE_OVERLAY_ID,
  resolveMazerInstallGateCopy,
  shouldShowMazerInstallGate
} from '../../src/boot/installGate';
import type { InstallSurfaceState } from '../../src/boot/installSurface';

const hiddenState: InstallSurfaceState = {
  mode: 'hidden',
  canPrompt: false,
  installed: false,
  standalone: false
};

describe('Mazer install gate', () => {
  test('only shows for a mode installSurface actually asks to gate on', () => {
    expect(shouldShowMazerInstallGate(hiddenState)).toBe(false);
    expect(shouldShowMazerInstallGate({ ...hiddenState, mode: 'ios-open-in-browser' })).toBe(true);
    expect(shouldShowMazerInstallGate({ ...hiddenState, mode: 'available', canPrompt: true })).toBe(true);
    expect(shouldShowMazerInstallGate({ ...hiddenState, mode: 'manual', instruction: 'Use Share > Add to Home Screen' })).toBe(true);
  });

  test('all browser modes use the same three-step, no-action install contract', () => {
    const copy = resolveMazerInstallGateCopy({ ...hiddenState, mode: 'ios-open-in-browser' });

    expect(copy.primaryLabel).toBeNull();
    expect(copy.primaryAction).toBeNull();
    expect(copy.showSkip).toBe(false);
    expect(copy.showCopyLink).toBe(false);
    expect(copy.title).toBe('');
    expect(copy.subtitle).toBe('');
    expect(copy.steps).toEqual([
      "Open this page in your device's default browser.",
      'Tap Share, then choose More.',
      'Select Add to Home Screen, Install app, or Download.'
    ]);

    expect(resolveMazerInstallGateCopy({ ...hiddenState, mode: 'available', canPrompt: true })).toEqual(copy);
    expect(resolveMazerInstallGateCopy({ ...hiddenState, mode: 'manual', instruction: 'ignored' })).toEqual(copy);
  });

  test('wires the install gate into boot before the Phaser game is created, and skips it on localhost', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    const installGateCallIndex = mainSource.indexOf('await runMazerInstallGate(document);');
    const gameCreateIndex = mainSource.indexOf('game = new Phaser.Game(');

    expect(installGateCallIndex).toBeGreaterThan(-1);
    expect(gameCreateIndex).toBeGreaterThan(-1);
    expect(installGateCallIndex).toBeLessThan(gameCreateIndex);
    expect(mainSource).toContain('initializeInstallSurface(window);');
    expect(mainSource).toContain("!isLocalhostRuntime() || forceInstallGate");
    expect(cssSource).toContain(`#${MAZER_INSTALL_GATE_OVERLAY_ID}`);
    expect(cssSource).toContain('"Space Grotesk", ui-sans-serif, system-ui');
  });
});
