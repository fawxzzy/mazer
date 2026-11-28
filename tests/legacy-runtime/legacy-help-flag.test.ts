import { describe, expect, it } from 'vitest';
import {
  HELP_LAB_STORAGE_KEY,
  HELP_SCREEN_BUILD_DEFAULT,
  resolveHelpScreenEnabled,
  resolveHelpScreenState,
  type HelpFlagStorage
} from '../../src/legacy-runtime/legacyHelpFlag';
import {
  LEGACY_MAIN_MENU_ROW_IDS,
  LEGACY_PLAY_MENU_ROW_IDS,
  buildLegacyMenuRows,
  resolveLegacyMenuRowIds
} from '../../src/legacy-runtime/legacyMenuRows';
import { LEGACY_PLAY_MENU_LABELS, buildLegacyPlayMenuRows } from '../../src/legacy-runtime/legacyPlayMenu';
import { resolveMenuRowVectorIconId } from '../../src/render/menuRowIcons';

/**
 * Help screen flag and rows (MAZER-ONB-001 family). Same shape as the first-time cards flag: a build constant (false)
 * OR the `?lab=help` switch remembered on the device. Off means the Menus are exactly as before.
 */

const memoryStorage = (initial: Record<string, string> = {}): HelpFlagStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    removeItem: (key) => { delete data[key]; },
    setItem: (key, value) => { data[key] = value; }
  };
};

describe('help flag', () => {
  it('the build default is on (2026-11-28) but node with no window resolves off', () => {
    expect(HELP_SCREEN_BUILD_DEFAULT).toBe(true);
    expect(resolveHelpScreenEnabled({})).toBe(false);
    expect(resolveHelpScreenEnabled()).toBe(false);
  });

  it('?lab=help turns it on and remembers it; ?lab=off clears it', () => {
    const storage = memoryStorage();
    expect(resolveHelpScreenState({ search: '?lab=help', storage })).toEqual({ enabled: true, preview: false, source: 'lab' });
    expect(storage.data[HELP_LAB_STORAGE_KEY]).toBe('1');
    expect(resolveHelpScreenEnabled({ search: '', storage })).toBe(true);
    expect(resolveHelpScreenEnabled({ search: 'lab=off', storage })).toBe(false);
    expect(storage.data[HELP_LAB_STORAGE_KEY]).toBeUndefined();
    expect(resolveHelpScreenEnabled({ search: '', storage })).toBe(false);
  });

  it('rides one URL with other labs, and ignores the other labs alone', () => {
    expect(resolveHelpScreenEnabled({ search: '?lab=firsttime&lab=help' })).toBe(true);
    expect(resolveHelpScreenEnabled({ search: '?lab=firsttime' })).toBe(false);
    expect(resolveHelpScreenEnabled({ search: '?lab=hazards' })).toBe(false);
  });

  it('a Level Preview route honours the query for this load but writes nothing', () => {
    const storage = memoryStorage();
    const state = resolveHelpScreenState({ search: '?previewLevel=7&lab=help', storage });
    expect(state).toMatchObject({ enabled: true, preview: true });
    expect(storage.data).toEqual({});
    const remembered = memoryStorage({ [HELP_LAB_STORAGE_KEY]: '1' });
    resolveHelpScreenState({ search: '?previewLevel=7&lab=off', storage: remembered });
    expect(remembered.data[HELP_LAB_STORAGE_KEY]).toBe('1');
  });

  it('a throwing storage never throws at boot (just "not remembered")', () => {
    const broken: HelpFlagStorage = {
      getItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    };
    expect(resolveHelpScreenEnabled({ search: '?lab=help', storage: broken })).toBe(true);
    expect(resolveHelpScreenEnabled({ search: '', storage: broken })).toBe(false);
  });

  it('the build seam turns it on everywhere (the coordinator flip after review)', () => {
    expect(resolveHelpScreenState({ buildDefault: true })).toEqual({ enabled: true, preview: false, source: 'build' });
  });
});

describe('help rows in both Menus (placement A: right after Guide)', () => {
  it('flag off: both Menus are exactly as before', () => {
    expect(resolveLegacyMenuRowIds('main')).toEqual([...LEGACY_MAIN_MENU_ROW_IDS]);
    expect(resolveLegacyMenuRowIds('play')).toEqual([...LEGACY_PLAY_MENU_ROW_IDS]);
    expect(buildLegacyMenuRows('main', { soundEnabled: true }).map((row) => row.id)).toEqual(['settings', 'guide', 'sound', 'profile', 'leaderboard']);
    expect(buildLegacyPlayMenuRows({ quitArmed: false, resetArmed: false, resetAvailable: true, soundEnabled: true }).map((row) => row.id))
      .toEqual(['settings', 'guide', 'sound', 'reset-level', 'main-menu']);
    expect(LEGACY_MAIN_MENU_ROW_IDS).not.toContain('help');
    expect(LEGACY_PLAY_MENU_ROW_IDS).not.toContain('help');
  });

  it('flag on: Help follows Guide on the main menu and in a game', () => {
    expect(buildLegacyMenuRows('main', { helpAvailable: true, soundEnabled: true }).map((row) => row.id))
      .toEqual(['settings', 'guide', 'help', 'sound', 'profile', 'leaderboard']);
    expect(buildLegacyPlayMenuRows({ helpAvailable: true, quitArmed: false, resetArmed: false, resetAvailable: true, soundEnabled: false }).map((row) => row.id))
      .toEqual(['settings', 'guide', 'help', 'sound', 'reset-level', 'main-menu']);
    // Profile drops out while the account service is unavailable; Help stays.
    expect(resolveLegacyMenuRowIds('main', { helpAvailable: true, profileAvailable: false })).toEqual(['settings', 'guide', 'help', 'sound', 'leaderboard']);
  });

  it('the Help row reads "Help", is a plain destination (no toggle word) and wears the lifebuoy icon', () => {
    const help = buildLegacyMenuRows('main', { helpAvailable: true, soundEnabled: true }).find((row) => row.id === 'help')!;
    expect(help.label).toBe('Help');
    expect(LEGACY_PLAY_MENU_LABELS.help).toBe('Help');
    expect(resolveMenuRowVectorIconId('help', { soundEnabled: true })).toBe('lifebuoy');
  });
});
