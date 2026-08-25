import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_INSTALL_GATE_OVERLAY_ID,
  resolveMazerInstallGateCopy,
  shouldRunMazerInstallGateForBoot,
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

  test('keeps one shared three-step contract while restoring the native action only for prompt-capable browsers', () => {
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

    expect(resolveMazerInstallGateCopy({ ...hiddenState, mode: 'available', canPrompt: true })).toEqual({
      ...copy,
      primaryAction: 'install',
      primaryLabel: 'Install'
    });
    expect(resolveMazerInstallGateCopy({ ...hiddenState, mode: 'available', canPrompt: false })).toEqual(copy);
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
    expect(mainSource).toContain('shouldRunMazerInstallGateForBoot({');
    expect(mainSource).toContain('location: window.location');
    expect(cssSource).toContain(`#${MAZER_INSTALL_GATE_OVERLAY_ID}`);
    expect(cssSource).toContain('"Space Grotesk", ui-sans-serif, system-ui');
  });

  test.each([
    {
      forceInstallGate: false,
      isLocalhostRuntime: false,
      label: 'uninstalled iOS Safari manual-install browser',
      location: { hash: '#access_token=opaque&type=recovery', pathname: '/update-password', search: '' },
      state: { ...hiddenState, mode: 'manual' as const, instruction: 'Use Share > Add to Home Screen' }
    },
    {
      forceInstallGate: false,
      isLocalhostRuntime: false,
      label: 'installed iOS standalone PWA',
      location: { hash: '#access_token=opaque&type=recovery', pathname: '/update-password/', search: '' },
      state: { ...hiddenState, installed: true, standalone: true }
    },
    {
      forceInstallGate: true,
      isLocalhostRuntime: true,
      label: 'prompt-capable desktop browser',
      location: { hash: '', pathname: '/update-password', search: '?code=opaque' },
      state: { ...hiddenState, mode: 'available' as const, canPrompt: true }
    }
  ])('bypasses the install gate for a direct recovery route in a $label', ({ forceInstallGate, isLocalhostRuntime, location, state }) => {
    expect(shouldRunMazerInstallGateForBoot({ forceInstallGate, isLocalhostRuntime, location })).toBe(false);
    expect(shouldShowMazerInstallGate(state)).toBe(state.mode !== 'hidden');
  });

  test('keeps ordinary browser and PWA entry routes behind their existing install decision', () => {
    for (const pathname of ['/', '/play', '/update-password-preview']) {
      expect(shouldRunMazerInstallGateForBoot({
        forceInstallGate: false,
        isLocalhostRuntime: false,
        location: { hash: '', pathname, search: '' }
      })).toBe(true);
    }
  });
});
