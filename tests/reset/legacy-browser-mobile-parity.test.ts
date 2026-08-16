import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import {
  shouldUseLegacyBrowserMobileParity
} from '../../src/legacy-runtime/legacyBrowserMobileParity';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

describe('legacy browser mobile parity', () => {
  test('targets only fine-pointer portrait browser panes between phone and desktop widths', () => {
    const finePointer = {
      matchMedia: () => ({ matches: false }),
      navigator: { maxTouchPoints: 0 }
    };

    expect(shouldUseLegacyBrowserMobileParity({ width: 499, height: 958 }, finePointer)).toBe(true);
    expect(shouldUseLegacyBrowserMobileParity({ width: 390, height: 844 }, finePointer)).toBe(false);
    expect(shouldUseLegacyBrowserMobileParity({ width: 601, height: 958 }, finePointer)).toBe(false);
    expect(shouldUseLegacyBrowserMobileParity({ width: 499, height: 390 }, finePointer)).toBe(false);
  });

  test('never overrides touch or coarse-pointer mobile devices', () => {
    expect(shouldUseLegacyBrowserMobileParity({ width: 499, height: 958 }, {
      matchMedia: () => ({ matches: false }),
      navigator: { maxTouchPoints: 5 }
    })).toBe(false);
    expect(shouldUseLegacyBrowserMobileParity({ width: 499, height: 958 }, {
      matchMedia: () => ({ matches: true }),
      navigator: { maxTouchPoints: 0 }
    })).toBe(false);
  });

  test('keeps the existing 390x844 phone geometry byte-for-byte unchanged', () => {
    const existingMenu = resolveLegacyMenuLayout(390, 844, 50, 49, 'menu');
    const explicitUnchangedMenu = resolveLegacyMenuLayout(390, 844, 50, 49, 'menu', {
      browserMobileParity: false
    });
    const existingControls = resolveTouchControlLayout({ width: 390, height: 844 }, {
      compact: true,
      controlMode: 'stick'
    });
    const explicitUnchangedControls = resolveTouchControlLayout({ width: 390, height: 844 }, {
      compact: true,
      controlMode: 'stick',
      phonePortraitOverride: false
    });

    expect(explicitUnchangedMenu).toEqual(existingMenu);
    expect(explicitUnchangedControls).toEqual(existingControls);
  });

  test('gives a 499x958 fine-pointer pane the phone maze cadence and control composition', () => {
    const browserMenu = resolveLegacyMenuLayout(499, 958, 50, 49, 'menu', {
      browserMobileParity: true
    });
    const defaultMenu = resolveLegacyMenuLayout(499, 958, 50, 49, 'menu');
    const browserControls = resolveTouchControlLayout({ width: 499, height: 958 }, {
      compact: true,
      controlMode: 'stick',
      phonePortraitOverride: true
    });
    const defaultControls = resolveTouchControlLayout({ width: 499, height: 958 }, {
      compact: true,
      controlMode: 'stick'
    });

    expect(browserMenu.boardLeft).toBe(8);
    expect(browserMenu.boardSize).toBe(483);
    expect(browserMenu.tileSize).toBeGreaterThan(defaultMenu.tileSize);
    expect(browserControls.frame.top).toBeGreaterThan(defaultControls.frame.top);
    expect(browserControls.stick?.outer.width).toBeLessThan(defaultControls.stick?.outer.width ?? Number.POSITIVE_INFINITY);
  });
});
