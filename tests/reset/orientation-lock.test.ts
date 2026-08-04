import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_PORTRAIT_LOCK_BODY_CLASS,
  MAZER_PORTRAIT_LOCK_OVERLAY_ID,
  isMazerLandscapeViewport,
  requestMazerPortraitOrientationLock,
  shouldBlockMazerLandscape,
  shouldUseMazerCssPortraitLock
} from '../../src/boot/orientationLock';

const createViewport = ({
  coarse = false,
  height,
  touchPoints = 0,
  width
}: {
  coarse?: boolean;
  height: number;
  touchPoints?: number;
  width: number;
}): Pick<Window, 'innerHeight' | 'innerWidth' | 'matchMedia' | 'navigator'> => ({
  innerHeight: height,
  innerWidth: width,
  matchMedia: () => ({ matches: coarse }) as MediaQueryList,
  navigator: { maxTouchPoints: touchPoints } as Navigator
});

describe('Mazer portrait orientation lock', () => {
  test('blocks phone-like landscape without rotating the application', () => {
    expect(isMazerLandscapeViewport(createViewport({ width: 844, height: 390 }))).toBe(true);
    expect(shouldUseMazerCssPortraitLock(createViewport({ width: 844, height: 390, touchPoints: 2 }))).toBe(false);
    expect(shouldUseMazerCssPortraitLock(createViewport({ width: 844, height: 390, coarse: true }))).toBe(false);
    expect(shouldBlockMazerLandscape(createViewport({ width: 844, height: 390, touchPoints: 2 }))).toBe(true);
    expect(shouldBlockMazerLandscape(createViewport({ width: 844, height: 390, coarse: true }))).toBe(true);
    expect(shouldBlockMazerLandscape(createViewport({ width: 390, height: 844, touchPoints: 2 }))).toBe(false);
    expect(shouldBlockMazerLandscape(createViewport({ width: 1280, height: 720 }))).toBe(false);
  });

  test('requests portrait-primary when the browser exposes orientation lock', async () => {
    const calls: string[] = [];
    const targetWindow = {
      screen: {
        orientation: {
          lock: async (orientation: 'portrait-primary') => {
            calls.push(orientation);
          }
        }
      }
    } as unknown as Window & { screen: Screen & { orientation: { lock: (orientation: 'portrait-primary') => Promise<void> } } };

    await expect(requestMazerPortraitOrientationLock(targetWindow)).resolves.toBe(true);
    expect(calls).toEqual(['portrait-primary']);
  });

  test('wires portrait lock into app shell, manifest, and non-rotating blocker', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const orientationLockSource = readFileSync(resolve(process.cwd(), 'src/boot/orientationLock.ts'), 'utf8');
    const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
      orientation?: string;
    };

    expect(manifest.orientation).toBe('portrait-primary');
    expect(mainSource).toContain("import { installMazerPortraitLock, shouldBlockMazerLandscape } from './orientationLock';");
    expect(mainSource).toContain('installMazerPortraitLock(window, syncLandscapeBlock);');
    expect(cssSource).toContain(`#${MAZER_PORTRAIT_LOCK_OVERLAY_ID}`);
    expect(orientationLockSource).toContain(MAZER_PORTRAIT_LOCK_BODY_CLASS);
    expect(cssSource).not.toContain('transform: rotate(90deg);');
    expect(orientationLockSource).toContain('Rotate your device');
    expect(orientationLockSource).toContain('portrait-blocked');
    expect(orientationLockSource).toContain('portrait-primary');
    expect(cssSource).not.toContain('"orientation": "landscape"');
    expect(cssSource).not.toContain('filter: blur');
  });
});
