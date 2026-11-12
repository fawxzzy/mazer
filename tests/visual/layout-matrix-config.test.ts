import { describe, expect, test } from 'vitest';

const loadConfig = async () => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  return await import('../../scripts/visual/layout-matrix.config.mjs');
};

describe('layout matrix config', () => {
  test('keeps the shipping core viewport set stable', async () => {
    const { resolveLayoutMatrixViewports } = await loadConfig();

    expect(resolveLayoutMatrixViewports('core')).toEqual([
      { id: 'phone-portrait', label: 'Phone Portrait', width: 390, height: 844 },
      { id: 'phone-tall', label: 'Phone Tall', width: 430, height: 932 },
      { id: 'phone-landscape', label: 'Phone Landscape', width: 844, height: 390 },
      { id: 'tablet-portrait', label: 'Tablet Portrait', width: 768, height: 1024 },
      { id: 'tablet-landscape', label: 'Tablet Landscape', width: 1024, height: 768 },
      { id: 'laptop', label: 'Laptop', width: 1366, height: 768 },
      { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      { id: 'desktop-wide', label: 'Desktop Wide', width: 1920, height: 1080 }
    ]);
  });

  test('supports extended and all viewport groups without duplicating ids', async () => {
    const { resolveLayoutMatrixRoute, resolveLayoutMatrixViewports } = await loadConfig();

    const extended = resolveLayoutMatrixViewports('extended');
    const platform = resolveLayoutMatrixViewports('platform');
    const all = resolveLayoutMatrixViewports('all');

    expect(extended).toEqual([
      { id: 'ultrawide', label: 'Ultrawide', width: 2560, height: 1080 },
      { id: 'short-desktop', label: 'Short Desktop', width: 1280, height: 720 }
    ]);
    expect(platform).toEqual([
      { id: 'iphone-dynamic-island', label: 'iPhone Dynamic Island', width: 393, height: 852 },
      { id: 'android-cutout', label: 'Android Cutout', width: 412, height: 915 },
      { id: 'macos-browser', label: 'macOS Browser', width: 1440, height: 900 },
      { id: 'windows-browser', label: 'Windows Browser', width: 1365, height: 768 }
    ]);
    expect(new Set(all.map((viewport: { id: string }) => viewport.id)).size).toBe(all.length);
    expect(all).toHaveLength(14);
    expect(resolveLayoutMatrixRoute(all[0])).toBe('/?profile=mobile&theme=aurora');
    expect(resolveLayoutMatrixRoute(all[7])).toBe('/?profile=tv&theme=noir');
    expect(resolveLayoutMatrixRoute(all[5], '/?theme=ember')).toBe('/?theme=ember');
    expect(resolveLayoutMatrixRoute(platform[0])).toBe('/?profile=mobile&theme=aurora');
    expect(resolveLayoutMatrixRoute(all[0], undefined, { design: 'recovery' })).toBe('/?profile=mobile&theme=aurora&design=recovery');
    expect(resolveLayoutMatrixRoute(all[7], undefined, { design: 'recovery' })).toBe('/?profile=tv&theme=noir&design=recovery');
    expect(resolveLayoutMatrixRoute(all[5], '/?theme=ember', { design: 'recovery' })).toBe('/?theme=ember&design=recovery');
  });

  test('pins the supported viewport matrix (320, 360, 390, 430, landscape, rotate-back, 768, 1440)', async () => {
    const { resolveLayoutMatrixRoute, resolveLayoutMatrixViewports } = await loadConfig();

    const supported = resolveLayoutMatrixViewports('supported');

    expect(supported).toEqual([
      { id: 'phone-320', label: 'Phone 320 (small)', width: 320, height: 568 },
      { id: 'phone-360', label: 'Phone 360 (compact Android)', width: 360, height: 800 },
      { id: 'phone-portrait', label: 'Phone Portrait', width: 390, height: 844 },
      { id: 'phone-tall', label: 'Phone Tall', width: 430, height: 932 },
      { id: 'phone-landscape', label: 'Phone Landscape', width: 844, height: 390 },
      {
        id: 'phone-rotate-back',
        label: 'Phone Rotate Back (landscape to portrait)',
        width: 390,
        height: 844,
        rotateFrom: { width: 844, height: 390 }
      },
      { id: 'tablet-portrait', label: 'Tablet Portrait', width: 768, height: 1024 },
      { id: 'desktop', label: 'Desktop', width: 1440, height: 900 }
    ]);
    expect(new Set(supported.map((viewport: { id: string }) => viewport.id)).size).toBe(supported.length);
    for (const viewport of supported) {
      expect(resolveLayoutMatrixRoute(viewport)).toBe(
        viewport.id === 'desktop' ? '/' : '/?profile=mobile&theme=aurora'
      );
    }
  });

  test('keeps the supported group out of `all` so the pinned groups cannot drift', async () => {
    const { LAYOUT_MATRIX_PRESET_GROUPS, resolveLayoutMatrixViewports } = await loadConfig();

    const allIds = resolveLayoutMatrixViewports('all').map((viewport: { id: string }) => viewport.id);

    expect(allIds).toHaveLength(14);
    expect(allIds).not.toContain('phone-320');
    expect(allIds).not.toContain('phone-rotate-back');
    expect(Object.keys(LAYOUT_MATRIX_PRESET_GROUPS)).toEqual(['core', 'extended', 'platform', 'supported']);
  });
});
