import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DARK_MODE_SETTING_DESCRIPTION,
  DARK_MODE_STORAGE_KEY,
  readDarkModePreference,
  writeDarkModePreference
} from '../../src/legacy-runtime/legacyDarkModePreference';
import { LEGACY_GUIDE_ROWS } from '../../src/legacy-runtime/legacyGuideContent';
import { LEGACY_SETTINGS_GROUP_ROWS } from '../../src/legacy-runtime/legacySettingsSheetPlan';
import { isCosmeticColourScopeActive, withCosmeticColours } from '../../src/theme/cosmeticScope';
import {
  createThemeColorMapper,
  patchThemedGraphicsPrototype,
  type ThemeGraphicsPrototype
} from '../../src/theme/darkThemeCanvasBridge';
import { DARK_THEME_TOKENS, getActiveMazerThemeId, setActiveMazerThemeId, themeIconColor } from '../../src/theme/themes';

const memoryStorage = (initial?: string) => {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(DARK_MODE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); }
  };
};

describe('MAZER-UI-102 dark mode preference', () => {
  test('defaults to off: absent, unknown or unreadable storage never turns it on', () => {
    expect(readDarkModePreference(undefined)).toBe(false);
    expect(readDarkModePreference(memoryStorage())).toBe(false);
    expect(readDarkModePreference(memoryStorage('off'))).toBe(false);
    expect(readDarkModePreference(memoryStorage('true'))).toBe(false);
    expect(readDarkModePreference({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });

  test('round-trips through storage and reports a failed write', () => {
    const storage = memoryStorage();
    expect(writeDarkModePreference(storage, true)).toBe(true);
    expect(readDarkModePreference(storage)).toBe(true);
    expect(writeDarkModePreference(storage, false)).toBe(true);
    expect(readDarkModePreference(storage)).toBe(false);
    expect(writeDarkModePreference(undefined, true)).toBe(false);
    expect(writeDarkModePreference({ setItem: () => { throw new Error('full'); } }, true)).toBe(false);
  });

  test('the Settings sheet carries exactly one new row: a Dark mode toggle that is not a synced game toggle', () => {
    const row = LEGACY_SETTINGS_GROUP_ROWS.find((entry) => entry.id === 'dark-mode');
    expect(row?.kind).toBe('toggle');
    expect(row?.label).toBe('Dark mode');
    expect(row?.description).toBe(DARK_MODE_SETTING_DESCRIPTION);
    expect(row?.settingKey).toBe('darkMode');
  });

  test('the in-app Guide mentions Dark mode inside the 90 character cap', () => {
    const menuRow = LEGACY_GUIDE_ROWS.find((entry) => entry.text.includes('Dark mode'));
    expect(menuRow).toBeDefined();
    expect(menuRow!.text.length).toBeLessThanOrEqual(90);
  });
});

describe('MAZER-UI-102 cosmetic scope', () => {
  test('is open only inside the wrapper, nests, and closes when the draw throws', () => {
    expect(isCosmeticColourScopeActive()).toBe(false);
    withCosmeticColours(() => {
      expect(isCosmeticColourScopeActive()).toBe(true);
      withCosmeticColours(() => expect(isCosmeticColourScopeActive()).toBe(true));
      expect(isCosmeticColourScopeActive()).toBe(true);
    });
    expect(isCosmeticColourScopeActive()).toBe(false);
    expect(() => withCosmeticColours(() => { throw new Error('draw failed'); })).toThrow('draw failed');
    expect(isCosmeticColourScopeActive()).toBe(false);
  });

  test('returns the draw result', () => {
    expect(withCosmeticColours(() => 7)).toBe(7);
  });
});

describe('MAZER-UI-102 theme mapper', () => {
  const mapper = createThemeColorMapper(DARK_THEME_TOKENS);

  test('maps the shipping source roles to the dark token values', () => {
    expect(mapper.mapCss('#03070b')).toBe(DARK_THEME_TOKENS.void);
    expect(mapper.mapCss('#0b1a22')).toBe(DARK_THEME_TOKENS.panel);
    expect(mapper.mapCss('#10242b')).toBe(DARK_THEME_TOKENS.elevated);
    expect(mapper.mapCss('#f1faf6')).toBe(DARK_THEME_TOKENS.text);
    expect(mapper.mapCss('#94aaa8')).toBe(DARK_THEME_TOKENS.textMuted);
    expect(mapper.mapCss('#f2fbfa')).toBe(DARK_THEME_TOKENS.accent);
    expect(mapper.mapCss('#a7e7d9')).toBe(DARK_THEME_TOKENS.accentBright);
    expect(mapper.mapCss('#4c7a74')).toBe(DARK_THEME_TOKENS.corridor);
    expect(mapper.mapCss('#cdf5ec')).toBe(DARK_THEME_TOKENS.corridorEdge);
  });

  test('is deterministic and keeps text off the page background', () => {
    expect(mapper.mapRgb([12, 200, 180])).toEqual(mapper.mapRgb([12, 200, 180]));
    expect(mapper.mapCss('#f1faf6')).not.toBe(mapper.mapCss('#03070b'));
  });
});

describe('MAZER-UI-102 Graphics bridge', () => {
  const createFakeProto = () => {
    const calls: Array<{ kind: string; args: unknown[] }> = [];
    const proto: ThemeGraphicsPrototype = {
      fillStyle(this: unknown, ...args: unknown[]) { calls.push({ kind: 'fill', args }); return this; },
      lineStyle(this: unknown, ...args: unknown[]) { calls.push({ kind: 'line', args }); return this; },
      renderCanvas(this: unknown) { calls.push({ kind: 'replay', args: [] }); return undefined; }
    } as ThemeGraphicsPrototype;
    return { calls, proto };
  };
  const mapper = createThemeColorMapper(DARK_THEME_TOKENS);
  const hexNumber = (css: string): number => parseInt(css.slice(1), 16);

  test('maps recorded UI colours, keeps alpha and width, and leaves cosmetic colours alone', () => {
    const { calls, proto } = createFakeProto();
    patchThemedGraphicsPrototype(proto, mapper);
    proto.fillStyle.call({}, 0xf1faf6, 0.5);
    proto.lineStyle.call({}, 3, 0x03070b, 0.25);
    withCosmeticColours(() => {
      proto.fillStyle.call({}, 0x35e6ff, 1);
      proto.lineStyle.call({}, 2, 0xffd34d, 1);
    });
    expect(calls[0]).toEqual({ kind: 'fill', args: [hexNumber(DARK_THEME_TOKENS.text), 0.5] });
    expect(calls[1]).toEqual({ kind: 'line', args: [3, hexNumber(DARK_THEME_TOKENS.void), 0.25] });
    expect(calls[2]).toEqual({ kind: 'fill', args: [0x35e6ff, 1] });
    expect(calls[3]).toEqual({ kind: 'line', args: [2, 0xffd34d, 1] });
  });

  test('replays the recorded commands through the original renderCanvas', () => {
    const { calls, proto } = createFakeProto();
    patchThemedGraphicsPrototype(proto, mapper);
    proto.renderCanvas.call({});
    expect(calls).toEqual([{ kind: 'replay', args: [] }]);
  });
});

describe('MAZER-UI-102 default look stays the identity path', () => {
  test('the active theme is default and the icon colour hook returns its input', () => {
    expect(getActiveMazerThemeId()).toBe('default');
    expect(themeIconColor(0xf1faf6)).toBe(0xf1faf6);
    setActiveMazerThemeId('dark');
    expect(themeIconColor(0xf1faf6)).toBe(parseInt(DARK_THEME_TOKENS.accent.slice(1), 16));
    setActiveMazerThemeId('default');
    expect(getActiveMazerThemeId()).toBe('default');
  });

  test('the theme is installed only when the stored preference is on', () => {
    const source = readFileSync(resolve(__dirname, '../../src/theme/themeBoot.ts'), 'utf8');
    expect(source).toMatch(/if \(readDarkModePreference\(/);
  });
});
